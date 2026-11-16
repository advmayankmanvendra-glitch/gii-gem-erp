# In-house audit, pass 3: security and integrity, commit fc8a413 (return-receipts fix round 2)

- Date: 16 Nov 2026 IST
- Branch: `claude/erp-full-automation-qbhv8k`, commit `fc8a413`
- Scope: `git diff 47f21e7..fc8a413`, read against `audit-47f21e7-security.md` and `responses-47f21e7.md`.
  - The start-up step that now makes the unique index and the no-update trigger outside migration 039 (`src/main/database/init.js:724-731`).
  - The empty-backfill filter in `supplierReturnSplit` (`src/main/services/inventoryService.js:479-480`) and its audit-log effect.
  - The rewritten migration-list test (`scripts/audit/return-receipts.test.mjs:130-143`) and the four new tests.
- Method:
  - Code reading.
  - Probes run with the repo's own modules against throw-away databases in temp folders (no repo files changed).
  - `node --test scripts/audit/return-receipts.test.mjs`: 15/15 pass. `git status` clean afterwards.

## Verdict

- **No High or Medium findings.**
- Previous L-1 is fixed: a database whose trigger and unique index are missing gets them back at start-up (probe and the new test both confirm).
- Previous L-2 is mostly fixed: a name the test cannot resolve now fails the test. Some call shapes are still not seen at all (L-2 below).
- **Three Low findings**, all needing either a tampered or restored database file or a future code change. None is reachable from the renderer.

## Checked and found sound

- **SQL injection.** No new dynamic SQL. The start-up DDL is a constant string. `recordReturnReceipts` and the backfill use bound parameters. The reset's table names come from the fixed `RESET_TABLES` list. No in-app SQL console or IPC can reach this table.
- **Upgrade backup.** The new start-up step only creates an index and a trigger, so it does not need a pre-upgrade backup. `MIGRATIONS_WITH_BACKUP` is unchanged (036, 039) and `backupBeforePendingMigration` runs before `migrate` (`init.js:289-290`).
- **Empty-backfill filter** (`inventoryService.js:480`). A return that used no receipt is now replayed each time instead of getting an empty `stock_return_receipts_backfilled` entry each time. Its replay is bounded by its own stock-ledger id (`asOf.slId`) and its voucher id, so later receipts cannot be attributed to it. Its posting audit entry still carries `receipts_used: []` (`:573`), so the "used nothing" fact is recorded in the audit trail. No integrity gap.
- **Audit trail.** Every backfilled return gets one `stock_return_receipts_backfilled` entry naming the receipts and the return being posted; every posting records `receipts_used`. Both are written in the same transaction as the rows.
- **Reset and restore.** Not changed in this diff; the 47f21e7 probes still apply. The trigger is BEFORE UPDATE only, so the reset's DELETE is unaffected.

## Findings

### L-1: the start-up step checks only that a trigger and an index with the right names exist, so a same-named weakened trigger or a non-unique index is kept

- **Where:** `src/main/database/init.js:727-730` (`CREATE UNIQUE INDEX IF NOT EXISTS`, `CREATE TRIGGER IF NOT EXISTS`).
- **Scenario (probed):**
  - On a database at `fc8a413`, replace the objects with same-named ones:
    `CREATE TRIGGER trg_stock_return_receipts_no_update BEFORE UPDATE ON stock_return_receipts WHEN 0 BEGIN SELECT 1; END;` and
    `CREATE INDEX idx_stock_return_receipts_unique ON stock_return_receipts(stock_return_id);`
  - This could arrive in a backup file copied into `backups/` from another machine and restored, or from a support session.
  - Restart. Both weakened objects are kept: the trigger never fires (`UPDATE` succeeds), `PRAGMA index_list` shows `unique: 0`, and no audit entry or Health Center check reports it.
  - In the same probe, a planted `AFTER INSERT ON stock_return_receipts … DELETE …` trigger also survives restarts (noted as "not a finding" in pass 2; it is the same gap).
- **Contrast:** `ensureLedgerGuards` / `missingLedgerGuards` (`ledgerGuards.js:373`, `:512`) compare the stored SQL and rebuild guards that differ, and `unexpectedLedgerTriggers` (`:521`) removes foreign triggers on ledger tables. The policy text says these rows "cannot be changed"; on such a file they can.
- **Fix:** at start-up, read `sqlite_master.sql` for the two names and compare with the expected SQL (and `PRAGMA index_list` `unique = 1`); if different, `DROP` and recreate, and write an audit entry. Optionally extend the unexpected-trigger sweep to any trigger on `stock_return_receipts` other than the app's own. Add a test that plants a `WHEN 0` trigger and a non-unique index with the right names and asserts both are replaced.

### L-2: the migration-list test still skips `runMigration` calls written in other shapes, so a new migration can miss the pre-upgrade backup with the guard green

- **Where:** `scripts/audit/return-receipts.test.mjs:136` (`/^\s+runMigration\(db, ([^,]+),/gm`).
- **Scenario (probed against the regex with mutants added to `migrate`):**
  - `runMigration(db, "040_probe", …)`: seen, test fails as intended.
  - Call split over lines (`runMigration(\n    db,\n    "040_probe", …`): **not seen**.
  - `runMigration(database, "040_probe", …)`: **not seen**.
  - `runMigration(db,"040_probe", …)` (no space): **not seen**.
  - Unseen calls are not counted, so `names.every(Boolean)` cannot catch them.
- **Secondary:** constants are merged from every file in `src/main/database` with `Object.fromEntries`; two files defining the same constant name with different values would silently resolve to whichever file `readdirSync` returns last. The assertion message also says "a const in init.js", though it resolves across the folder.
- **Fix (preferred, as in pass 2):** record names at run time. Have `runMigration` push each name into an exported list (or read `schema_migrations` after `initializeDatabase` on a fresh root), and assert every name at or after 036 is in `MIGRATIONS_WITH_BACKUP`. If the source scan stays: count `runMigration(` occurrences with a loose regex (`/runMigration\s*\(/g`, minus the definition) and assert it equals the number of resolved names.

### L-3: making the unique index on every start turns duplicate rows into a start-up failure, with the ledger guards left dropped and no backup

- **Where:** `src/main/database/init.js:728`, run from `migrate` (`:290`) after `dropLedgerGuards` (`:288`) and before `ensureLedgerGuards` (`:295`).
- **Scenario (probed):**
  - A database with no unique index and two rows with the same `(stock_return_id, stock_ledger_id)` (only reachable by editing the file or restoring a crafted one; no app path at 91e2fa1, 47f21e7 or fc8a413 produces duplicates, since one `take()` yields each lot once).
  - Start: `initializeDatabase` throws `UNIQUE constraint failed: stock_return_receipts.stock_return_id, stock_return_receipts.stock_ledger_id`.
  - The ledger guards were already dropped and that is committed: 0 `trg_ledger_guard%` triggers remain in the file. No pre-upgrade backup is taken (039 is already applied), and nothing reaches the audit log.
  - Every later start fails the same way until someone repairs the file by hand.
- **Effect:** availability, not integrity: the app refuses to open rather than running with bad data. But the failure message gives the user no path, and the on-disk file is left without its ledger guards.
- **Fix:** before creating the unique index, check for duplicates (`SELECT stock_return_id, stock_ledger_id FROM stock_return_receipts GROUP BY 1, 2 HAVING COUNT(*) > 1`). If any exist, skip the unique index, write an audit entry and surface it in Health Center (or keep the first row of each pair after taking a backup). Alternatively wrap the step so a failure is reported and start-up continues to `ensureLedgerGuards`.

## Not a finding (noted)

- **DELETE stays open by design** for the operational reset; deleting a return's rows makes it unrecorded and re-replayed. Unchanged from pass 2.
- **Zero-receipt returns have no rows**, so in the table they look the same as pre-039 returns. This is intentional (responses M-1) and the posting audit entry (`receipts_used: []`) distinguishes them; the replay is deterministic for them.
