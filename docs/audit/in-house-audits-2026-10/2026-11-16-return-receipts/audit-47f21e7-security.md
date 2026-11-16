# In-house audit, pass 2: security and integrity, commit 47f21e7 (return-receipts fix round)

- Date: 16 Nov 2026, 12:30 IST
- Branch: `claude/erp-full-automation-qbhv8k`, commit `47f21e7`
- Scope: `git diff 91e2fa1 47f21e7`, read against `audit-91e2fa1-security.md` and `responses-91e2fa1.md`.
  - The unique index and the no-update trigger in migration 039 (`src/main/database/init.js:721-723`).
  - How they interact with the ledger guards (`src/main/database/ledgerGuards.js`), the operational reset, restore and backfill.
  - `MIGRATIONS_WITH_BACKUP` (`init.js:732-734`, `:773`) and its test.
- Method:
  - Code reading.
  - Probes in scratch worktrees at `47f21e7` and `91e2fa1` (node_modules linked); both were removed afterwards.
  - `npm run -s test:integrity` passes 233/233 and 56/56.

## Verdict

- **No High or Medium findings.**
- The trigger and index do not interfere with the reset, restore, backfill or the ledger-guard sweep.
- **Two Low findings:**
  - L-1: the lock exists only where migration 039 ran at this commit.
  - L-2: the migration-list test can pass without checking anything.

## Checked and found sound

- **Ledger guards do not touch the new trigger.**
  - `dropLedgerGuards` drops only `trg_ledger_guard%` (`ledgerGuards.js:366`).
  - `unexpectedLedgerTriggers` (`:521-533`) flags a trigger only when it is on `vouchers`, `voucher_lines`, `ledger_entries` or `ledger_maintenance`, or when its SQL names one of them as a word. `trg_stock_return_receipts_no_update` is on `stock_return_receipts`, and its SQL names none of them.
  - Probe: after a posted return, `unexpectedLedgerTriggers(db)` returns `[]`. After a restart, which runs `dropUnexpectedLedgerTriggers` and `ensureLedgerGuards`, the trigger and the unique index are both still present.
  - `missingLedgerGuards` and the money integrity check use the same lists, so they do not report it either.
  - The fixed-count trigger checks in `scripts/verify-fsr-2b1.js:140-160` filter by name and are unaffected.
- **Operational reset.**
  - The reset deletes and never updates this table. `UNLINK_ON_RESET` updates do not include it, and it has no `updated_at` column for them to set.
  - Probe: post a return, then `executeReset(company 1)`. Result: 0 rows left, 0 `foreign_key_check` issues, and the trigger is still in place.
  - A return posted after the reset records normally.
  - `rollbackReset` to the pre-reset backup succeeds.
- **No app code updates the table.**
  - `moneyMigration.backfillAll` uses the static `SHADOW_COLUMNS` list, which does not include this table.
  - `schemaDefinitions.js:26` updates only rows where `company_id IS NULL`, and the column is `NOT NULL`.
  - Generic CRUD, import and master-data tools refuse the table (it is not in `ALL_TABLES`).
  - The foreign keys have no `ON UPDATE` actions.
  - So the BEFORE UPDATE trigger cannot break a legitimate path.
- **Backfill.**
  - Backfill only inserts. One `take()` yields each lot (`stock_ledger_id`) at most once, and a return is backfilled only while it has no rows, so the unique index cannot refuse a legitimate write.
  - The fuzzer in the correctness pass ran 274 backfills under the trigger and the index with no error.
- **Restore.**
  - Probe: `createBackup`, then `restoreBackup`, then `initializeDatabase`. The trigger and the rows are kept.
  - Restoring a pre-039 backup runs 039, which now creates the trigger and the index.
- **`MIGRATIONS_WITH_BACKUP`.**
  - It is one frozen list, and `backupBeforePendingMigration` uses it (`:773`). Behaviour is unchanged for 036 and 039.
  - The new test fails when 039 is removed from the list, or when a literal `runMigration(db, "040_…")` is added without it.
  - The backup test now opens the copy and checks it has no `stock_return_receipts` table. It fails if the backup is taken after `migrate`.

## Findings

### L-1: the trigger and unique index were added to the body of migration 039, so a database that ran 39 at 91e2fa1 never gets them, and nothing restores them if they are dropped

- **Where:** `init.js:705-726`. `runMigration` skips the whole body once `039_stock_return_receipts` is in `schema_migrations` (`:784-787`).
- **Probe 1:**
  - Create a database with the `91e2fa1` build and post a return.
  - Open it with `47f21e7`.
  - Result: `trg_stock_return_receipts_no_update` is absent, `idx_stock_return_receipts_unique` is absent, and `UPDATE stock_return_receipts SET quantity = 9` succeeds.
- **Probe 2:**
  - On a `47f21e7` database, `DROP TRIGGER trg_stock_return_receipts_no_update; DROP INDEX idx_stock_return_receipts_unique`. This could be done by a support session, or by a file restored from elsewhere.
  - Restart.
  - Both stay absent, and no health or integrity check reports it. Compare `ensureLedgerGuards`, which rebuilds the ledger guards on every start.
- **Exposure:**
  - `91e2fa1` is on the pushed feature branch only: it is not in main and not tagged. So this matters only for a database that was opened with that build, such as a test or demo copy.
  - If any real company file was opened with it, this would be Medium. Policy §6 and DG-1 tell readers that the rows are locked, and on that file they are not.
- **Fix (either):**
  - (a) Move `CREATE UNIQUE INDEX IF NOT EXISTS …` and `CREATE TRIGGER IF NOT EXISTS …` into a small start-up step after `migrate`, run on every open, like `ensureLedgerGuards`. Optionally compare the trigger SQL as `missingLedgerGuards` does.
  - (b) Add migration `040_stock_return_receipts_lock`, the next free number per the note at `:704`, with the same two statements, and add it to `MIGRATIONS_WITH_BACKUP`.
  - Either way, add a test: delete the trigger and index (and, for b, the 040 row), reopen, and assert both are back.

### L-2: the "every migration is in MIGRATIONS_WITH_BACKUP" test passes without checking anything when a migration name is not a literal or a local `const X = "…"`

- **Where:** `scripts/audit/return-receipts.test.mjs:130-137`.
  - Names come from a regex over the source.
  - Calls whose name the regex cannot resolve become `undefined` and are dropped by `name &&`.
- **Probe (mutants in scratch):**
  - A literal `runMigration(db, "040_probe", …)` not in the list: the test **fails**, as intended.
  - `runMigration(db, FSR2B1_MIGRATION_NAME.replace("035_fsr2b1", "040_probe"), …)`: the test **passes**.
  - `const PROBE_MIGRATION = \`040_probe\`;` with `runMigration(db, PROBE_MIGRATION, …)`: the test **passes**.
  - The house style already imports one migration name from another module: `FSR2B1_MIGRATION_NAME`, from `accountMappingRegistry.js`.
- **Effect:** the next migration named that way gets no pre-upgrade backup, and the guard meant to catch that stays green. This is the round-2 sustainability point that security L-3 of 91e2fa1 tried to close.
- **Fix (either):**
  - Fail the test when any `runMigration(` call does not resolve to a name: `assert.ok(names.every(Boolean))`.
  - Better: record names at run time. Have `runMigration` push each name into an exported list, have the test (or `backupBeforePendingMigration` itself) compare that list with `schema_migrations`, and drop the hand-kept list.

## Not a finding (noted)

- **DELETE stays open by design** (for the reset). Deleting a return's rows makes it unrecorded again, and the next return backfills it with the billing of that time. This is the same exposure as `stock_ledger`, and the renderer cannot reach the table. The policy wording about it is covered in the architecture pass, L-2.
- **A trigger planted on `stock_return_receipts` by a restored file** (for example AFTER INSERT … DELETE) is not swept at start-up, because only ledger tables are. This class of issue predates the commit and also applies to `stock_ledger`.
