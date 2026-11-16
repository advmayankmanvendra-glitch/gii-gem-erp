# In-house audit, pass 4: security and integrity, commit 78f71da (return-receipts locks at start-up)

- Date: 16 Nov 2026 IST
- Branch: `claude/erp-full-automation-qbhv8k`, commit `78f71da`
- Scope: `git diff fc8a413..78f71da`, read against `audit-fc8a413-security.md` and `responses-fc8a413.md`.
  - `ensureReturnReceiptLocks` (`src/main/database/init.js:314-350`), called from `initializeDatabase` after `ensureLedgerGuards` (`:295-296`).
  - The removal of the old start-up DDL from `migrate`.
  - The new migration-name test and the two new lock tests (`scripts/audit/return-receipts.test.mjs`).
- Method:
  - Code reading.
  - Probes using the repo's modules on throw-away databases in temp folders: plant an object, close, reopen with `initializeDatabase`, then inspect. No repo file was changed, and `git status` is clean.
  - `node --test scripts/audit/return-receipts.test.mjs`: 17/17 pass.

## Verdict

- **No High or Medium findings. Four Low, one Info.**
- Every Low needs a crafted or edited database file (for example a backup file dropped into `backups/` and restored). None can be reached from the renderer or through normal posting.
- **Previous findings:**
  - **fc8a413 L-1** (same-named but weaker lock kept) is **closed for the cases it named**: a `WHEN 0` lock trigger, a non-unique index, and a planted trigger on the table are all put back. Two ways around the trigger sweep remain (L-1 below), and a partial unique index is still accepted (L-2 below).
  - **fc8a413 L-2** (migration-list test) is **closed.** The names a fresh database records cover every unconditional `runMigration` call, whatever its call shape. The string scan covers migrations that run only on older databases. `runMigration` is not exported, so every call is in `init.js`. A miss now needs a migration that both runs only on older databases and builds its name in a non-`NNN_lower_case` form. I don't count that.
  - **fc8a413 L-3** (duplicate rows stop start-up) is **closed.** Duplicates are named in the audit log and the unique index is left off. The step now runs after the ledger guards are back. A different crafted file can still stop start-up (L-3 below).

## Checked and found sound

- **Identifier quoting in `DROP TRIGGER`** (`:324`). The name is double-quoted with embedded `"` doubled, which is the correct SQLite escape. Probe: a trigger named `evil"; DROP TABLE vouchers; --` is dropped and `vouchers` survives. In that probe the ledger-guard sweep removed it first, because the name contains `vouchers`. A direct call to `ensureReturnReceiptLocks` with a trigger named `evil"; x` also drops it cleanly and logs it.
- **`PRAGMA index_info("…")`** (`:319`) is quoted the same way. Every other interpolated name is a constant (`RETURN_RECEIPTS_LOCK`, the two index names, the column lists).
- **Temp triggers.** `CREATE TEMP TRIGGER` lives in the connection's temp schema and is never written to the database file. A crafted file cannot carry one, and the app runs no user SQL that could create one. No exposure.
- **Transaction.** The whole lock step runs in one transaction, so a failure leaves the file as it was. Because it runs after `ensureLedgerGuards`, the ledger guards are already back and committed if it throws.
- **Seed ordering.** Between `migrate` and `ensureReturnReceiptLocks`, a fresh database has no lock yet. `seed` posts no stock returns, so nothing writes the table in that window.
- **Duplicate path.** Duplicates are listed in the audit entry, posting continues, and the entry is written again on each start until someone repairs the file.
- **Lock trigger body.** It is recreated unconditionally from the constant SQL, so any altered `trg_stock_return_receipts_no_update` is replaced (probe G).

## Findings

### L-1: the trigger sweep matches the table name case-sensitively and only looks at triggers on the table itself, so a planted trigger can still survive

- **Where:** `init.js:323` (`tbl_name = 'stock_return_receipts'`).
- **Scenario (probed):**
  - **A.** `CREATE TRIGGER planted_uc AFTER INSERT ON STOCK_RETURN_RECEIPTS BEGIN DELETE FROM stock_return_receipts WHERE id = NEW.id; END`. SQLite stores `tbl_name = 'STOCK_RETURN_RECEIPTS'`, so the case-sensitive `=` doesn't match. The trigger survives a restart, with no audit entry. From then on, every recorded row is deleted as soon as it is inserted. Each return then looks unrecorded and is replayed and backfilled again, which is the drift this table exists to stop.
  - **I.** The same applies to `ON "Stock_Return_Receipts"`.
  - **B.** `CREATE TRIGGER planted_other AFTER INSERT ON stock_ledger BEGIN DELETE FROM stock_return_receipts; END` survives with no audit entry. The ledger-guard sweep covers only the voucher and ledger tables, and this sweep covers only triggers on this table. Every stock movement then wipes the record.
- **Fix:**
  - Match the table name without regard to case: `tbl_name = 'stock_return_receipts' COLLATE NOCASE`.
  - Also remove (and log) any trigger, on any table, whose SQL names `stock_return_receipts` as a word, the way `unexpectedLedgerTriggers` (`ledgerGuards.js:521`) does for the ledger tables. Keep only the app's own lock.
  - Add a test with an upper-case `ON` clause and with a trigger on `stock_ledger` that deletes from the table.

### L-2: a partial unique index with the right name and columns is accepted, so duplicate rows can be inserted while the check reports the lock as present

- **Where:** `init.js:316-319` and `:334`. The shape compares `unique` and the column names, but not `partial` from `PRAGMA index_list`.
- **Scenario (probed, C):**
  - In the file, replace the index with `CREATE UNIQUE INDEX idx_stock_return_receipts_unique ON stock_return_receipts(stock_return_id, stock_ledger_id) WHERE 0`.
  - Restart. The index is kept (`unique: 1, partial: 1`), and two identical `(stock_return_id, stock_ledger_id)` rows insert without error. No audit entry is written.
- **Fix:** include `partial` in the shape and require `partial === 0`. Optionally also compare `sqlite_master.sql` with the expected text, which also catches `COLLATE` or other column options. Extend the tamper test with a `WHERE 0` index.

### L-3: an index or table that already uses one of the lock index names, on another table, makes every start-up fail

- **Where:** `init.js:333-341`. `indexShape` looks only in `PRAGMA index_list(stock_return_receipts)`. When the name is held by something else, `have` is null and the `CREATE INDEX` at `:341` throws inside `initializeDatabase`.
- **Scenario (probed):**
  - **D.** `DROP INDEX idx_stock_return_receipts_unique; CREATE INDEX idx_stock_return_receipts_unique ON audit_log(id);`. Start-up fails with `index idx_stock_return_receipts_unique already exists`.
  - **E.** `DROP INDEX idx_stock_return_receipts_return; CREATE TABLE idx_stock_return_receipts_return (x);`. Start-up fails with `there is already a table named idx_stock_return_receipts_return`.
  - Every later start fails the same way. The ledger guards are back on disk, so integrity is held, but the app cannot open the books. The `ledger_unexpected_triggers_removed` audit entry and `recordStartupLedgerCheck` (`:297-303`) are skipped for that start.
  - This is the same class of failure as fc8a413 L-3, by a different route.
- **Fix:**
  - Look the name up in `sqlite_master` (any type). If an index of that name is on another table, drop it and log it.
  - If a table or view holds the name, don't create the index. Log the conflict and continue, as the duplicate path does.
  - Alternatively, catch errors from the step, write an audit entry and carry on with start-up.

### L-4: the audit entry misses some tampering: a replaced lock trigger, and a missing or replaced table

- **Where:**
  - `init.js:325-327`: the lock trigger is dropped and recreated unconditionally, so `found` never records that it had been changed.
  - `init.js:315`: the step returns `null` without logging when no table named `stock_return_receipts` exists.
- **Scenario (probed):**
  - **G.** Replace the lock with a `WHEN 0` copy and restart. The lock is put back correctly, but no `stock_return_receipts_locks_restored` entry is written. The new test asserts `triggersRemoved` lists only the planted trigger, so the gap is built into the test. The record was open to updates in that file, and the audit trail does not show it.
  - **F.** `DROP TABLE stock_return_receipts; CREATE VIEW stock_return_receipts AS SELECT 1 id;`. Start-up succeeds silently, and there are no locks and no entry. Every later supplier-return posting fails on the insert, and all recorded rows are gone.
- **Fix:**
  - Before recreating the lock, compare its stored SQL with the expected text. When it differs, add `lockTriggerReplaced: true` to the report.
  - When migration 039 is in `schema_migrations` but `stock_return_receipts` is not a table, write an audit entry (and a Health Center warning).
  - Assert both in the tamper test.

## Info

### I-1: the lock step does not check the table's own definition

- **Where:** `init.js:315`.
- **Scenario (probed, J):** rename the table aside and recreate it with untyped columns and no `NOT NULL`, `CHECK` or foreign keys. Restart. The trigger and both indexes are put back, but the column constraints (`quantity > 0`, `billed IN (0, 1)`, `recorded_by IN (…)`, the foreign keys) are gone, and no entry is written.
- **Note:** this is not a lock bypass (UPDATE is still refused and duplicates still rejected), so it is Info. Comparing `sqlite_master.sql` for the table with the migration's text, or at least checking `PRAGMA table_info` and `foreign_key_list`, would close it. The same is true of every other table in the schema, so this may be better handled as a general schema-drift check than here.
