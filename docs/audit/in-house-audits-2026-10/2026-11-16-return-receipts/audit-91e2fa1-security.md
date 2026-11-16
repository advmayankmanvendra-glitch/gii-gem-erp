# In-house audit, pass 2: security and integrity, commit 91e2fa1 (return-receipts table)

- Date: 16 Nov 2026, 12:05 IST
- Branch: `claude/erp-full-automation-qbhv8k`, commit `91e2fa1` on top of main `2c79106`
- Scope:
  - migration `039_stock_return_receipts` (`src/main/database/init.js:698-724`, `:762-774`);
  - the writes in `inventoryService.js:491-499` and `:529-533`;
  - the operational reset (`operationalResetService.js:45-46`), the ledger guards, the restore and import paths, generic CRUD exposure, and the audit trail.
- Method: code reading, plus scratch-worktree probes (reset with records, FK check). The repo was not modified.

## Verdict

- **No High or Medium findings.**
- The table is reachable only from main-process service code, inside the posting transaction. The migration is transactional and is preceded by a backup.
- Three Low findings follow.

## Checked and found sound

- **Migration safety.**
  - `runMigration` wraps the `CREATE TABLE`, both `CREATE INDEX` statements and the `schema_migrations` row in one `db.transaction` (`init.js:776-784`). SQLite DDL is transactional, so a failure leaves neither the table nor the migration row.
  - `backupBeforePendingMigration` now also fires while `039` is pending (`init.js:765-766`), so an existing database gets a `VACUUM INTO backups/pre-upgrade-*.db` first. Brand-new databases are skipped, as before (no `schema_migrations` yet).
  - `CREATE … IF NOT EXISTS` makes a re-run harmless.
- **Foreign keys and CHECKs.**
  - `foreign_keys = ON` (`connection.js:42`). The table references `companies`, `stock_returns`, `stock_ledger` and `stock_inwards`.
  - CHECKs: `quantity > 0`, `billed IN (0,1)`, `recorded_by IN ('posting','backfill')`.
  - Every row is written with values the service has just read from those tables, inside the same transaction as the return's own stock-ledger row and voucher. A failure anywhere rolls the rows back (`postStockReturn` `tx`).
- **Operational reset.**
  - The table is classified (`RESET_TABLES`, module Inventory), so `unclassifiedCompanyTables` does not refuse resets.
  - The reset runs with FKs off, deletes by `company_id`, then checks `PRAGMA foreign_key_check`.
  - Probe: post a return, then `executeReset(company 1)`. Result: 0 rows left, 0 FK issues.
  - `blockingReferences` needs no change: `company_id` is always the return's company, so no surviving row points at deleted rows.
- **Ledger guards.** `ledgerGuards.js` guards only `vouchers`, `voucher_lines`, `ledger_entries` and `ledger_maintenance` (`:75`). The new table names none of them, so the start-up sweep of unexpected triggers does not touch it. `stock_ledger` is not trigger-guarded either, so the new table is treated like its parent (see L-2).
- **Generic CRUD and renderer exposure.**
  - The table is not in `ALL_TABLES` or `WRITE_POLICY` (`init.js:194`, `:260`). `assertTable` refuses it for every generic read, create, update and delete (`crudHelpers.js:37-41`).
  - No IPC channel or preload API was added or renamed. The renderer cannot read or write the table.
  - `safeDeleteService` reads `PRAGMA foreign_key_list`, so it sees the new references automatically.
- **Restore paths.**
  - `backup:restore`, `reset:rollback` and `go-live:rollback` swap the database file and call `initializeDatabase`. Row ids are kept, so `stock_ledger_id` stays valid.
  - Restoring a pre-039 backup re-runs 039 after taking a new pre-upgrade copy. Its old returns are then backfilled lazily.
- **Import paths.**
  - `createRecord` forces stock documents to Draft (`crudHelpers.js:424-427`), so an import never creates a posted return without records.
  - Import rollback soft-deletes rows (`importValidationService.js:505`). A soft-deleted receipt drops out of `lots`, and any recorded row that points at it is filtered (`inventoryService.js:462`). This is the same outcome as the replay. The older issue, that rollback can soft-delete a posted stock document, predates this commit.
- **Older build opening a 039 database (downgrade).**
  - The older build does not know the table, so `unclassifiedCompanyTables` refuses its reset with a clear message. Nothing is half-deleted.
  - Returns that build posts carry no records and are backfilled later.
  - Refusing newer schemas is still the open item from the round-2 sustainability audit, not new here.

## Findings

### L-1: backfill and posted records leave no audit-trail entry

- **Where:**
  - `inventoryService.js:531`: backfill rows are written for *other* returns.
  - `:559`: the `stock_return_posted` audit entry holds only `{ row, voucher_id }`.
- **Scenario:**
  - Return R2 posts and silently writes `recorded_by = 'backfill'` rows for an earlier return R1.
  - Those rows now fix how R1's receipts count for every later return.
  - The audit log does not show that R1 was given a record, or which receipts R2 used. An auditor cannot see who wrote R1's rows or when, other than through `created_at` on a table no screen shows.
- **Fix:** in the same transaction, add to the audit entry's `new_value` the receipts used (sl id, units, billed, paise) and the ids of any returns backfilled. Or write one `stock_return_receipts_backfilled` audit row per backfilled return.

### L-2: "never edited" is policy only; the database does not enforce it

- **Where:** `init.js:705-718` and policy `:83` ("Rows are written inside the posting transaction and never edited").
- **Scenario:**
  - Any main-process code path, a maintenance script or a support session with a SQLite tool can `UPDATE` or `DELETE` the rows. The test itself does this at `return-receipts.test.mjs:72` and `:78`.
  - Later returns then use the changed record without question.
  - Nothing at the database level stops a duplicate row for the same (return, receipt) pair either; for example, a future second backfill path would double-count units.
- **Exposure:** limited, because the renderer cannot reach the table. This matches how `stock_ledger` is treated.
- **Fix** (defence in depth, optional):
  - `CREATE UNIQUE INDEX … ON stock_return_receipts(stock_return_id, stock_ledger_id)`.
  - `BEFORE UPDATE` and `BEFORE DELETE` triggers that `RAISE(ABORT)` unless a `ledger_maintenance` window is open, which the reset already opens.
  - `CHECK (rate >= 0 AND value_minor >= 0)`.

### L-3: the pre-upgrade backup still depends on a hand-kept list of migration names

- **Where:** `init.js:765`, `[UPGRADE_REPAIR_MIGRATION, RETURN_RECEIPTS_MIGRATION]`.
- **Scenario:** the next migration (040 or later) gets no backup unless its author remembers to add its name here. The round-2 sustainability audit (row 10) asked for "back up before *any* pending migration". This commit extends the list instead of closing that point.
- **Fix:** keep one ordered `MIGRATIONS` list of names, used both by `migrate` and by the backup check (back up when any name is not in `schema_migrations`). Or compare `PRAGMA user_version` with the build's schema version.
