# In-house audit, pass 7: security and integrity, commit b5b0ad3 (table accepted only in its real shape)

- Date: 16 Nov 2026 IST
- Branch: `claude/erp-full-automation-qbhv8k`, commit `b5b0ad3`
- Scope: `git diff 2dd78bc..b5b0ad3`, read against `audit-2dd78bc-security.md` and `responses-2dd78bc.md`.
  - `returnReceiptsTableState` (`src/main/database/returnReceiptLocks.js:41-49`).
  - The guard in `createReturnReceiptLocks`.
  - Migration 039's early return and its now-plain `CREATE TABLE` (`src/main/database/init.js:718-720`).
  - The try/catch around the start-up check (`init.js:297-303`).
- Method:
  - Code reading.
  - Probes with the repo's modules on throw-away databases in temp folders. Each one edits the file, reopens it with `initializeDatabase`, and checks start-up, the ledger-guard triggers on disk, the audit log and `moneyIntegrityReport`. All probe folders were removed afterwards.
  - No repo file was changed, and `git status` is clean.
  - `node --test scripts/audit/return-receipts.test.mjs`: 23/23 pass.

## Verdict

- **No High or Medium findings. One Low, one Info.**
- **2dd78bc L-1 is closed for every shape it named.** Each of these files now starts:

| 2dd78bc probe | Ledger guards on disk | Audit entry (`stock_return_receipts_table_missing`) | Health Center |
|---|---|---|---|
| N1: FTS5 virtual table, 039 recorded | 11 | `"virtual table"` | `ok: false` |
| N2: table missing a column, 039 recorded | 11 | `"table without its columns"` | `ok: false` |
| N4: view, 039 row deleted | 11 | `"view"` | `ok: false` |
| N5: FTS5 virtual table, 039 row deleted | 11 | `"virtual table"` | `ok: false` |

- **New:** the change opens one more route of the same kind. Migration 039's `CREATE TABLE` (no longer `IF NOT EXISTS`) fails when an **index** holds the table's name. The name lookup checks only tables and views (L-1).

## Checked and found sound

- **Shape check.**
  - The virtual-table test matches SQLite's stored `CREATE VIRTUAL TABLE` text.
  - The column list is read with `PRAGMA table_info` on a constant name.
  - A table whose `stock_ledger_id` is a generated column is reported as "table without its columns", because `table_info` omits generated columns. That is the safe side.
- **Mixed-case table name.** I renamed the real table to `Stock_Return_Receipts` and replayed 039. It is accepted, and the locks that the rename rewrote are put back and logged. Health Center reports `ok`.
- **try/catch.**
  - The lock repairs run in one transaction, so an error rolls them back as a whole. Health Center recomputes the problems on its own, so a caught error cannot make it report `ok`.
  - The catch writes `stock_return_receipts_check_failed` on every start while the error stands, which is acceptable for something only an edited file can cause.
- **Early return in 039.** When something other than a free name is found, the migration records 039 without creating the table. Start-up then reports the table as missing and gives the Health Center line ("restore a backup"). Nothing is silently accepted.

## Findings

### L-1: an index named `stock_return_receipts` stops a replayed migration 039, and every start after it, with the ledger guards left dropped

- **Where:**
  - `returnReceiptLocks.js:42` looks only at `type IN ('table', 'view')`.
  - `init.js:718-720`: when that finds nothing, 039 runs a plain `CREATE TABLE stock_return_receipts`.
  - In SQLite, tables, views and indexes share one namespace. So an index under the name makes `CREATE TABLE` fail.
  - This happens inside `migrate`, after `dropLedgerGuards` and outside the new try/catch.
- **Scenario (probed, X1):**
  - In a current file: `DROP TABLE stock_return_receipts; CREATE INDEX stock_return_receipts ON companies(id); DELETE FROM schema_migrations WHERE migration_name = '039_stock_return_receipts'`.
  - Reopen. Start-up fails with `there is already an index named stock_return_receipts`.
  - The file is left with 0 `trg_ledger_guard%` triggers. The pre-upgrade backup is taken, and every later start fails the same way.
  - With 039 still recorded, the same file starts and is reported correctly (`table_missing {found: null}`, Health Center `ok: false`). Only the replay path fails.
- **Exposure:** only a crafted or hand-edited file. It is the last shape of the "a file in name only stops start-up" class.
- **Fix:**
  - In `returnReceiptsTableState`, look at `type IN ('table', 'view', 'index')`, so an index under the name is reported as `"index"` and 039 takes its early return.
  - Alternatively, keep `CREATE TABLE IF NOT EXISTS` and check the state again afterwards.
  - Add the index case to the "table in name only" test.

## Info

### I-1: the catch block's own audit write is not guarded, so a file that blocks audit writes can still stop start-up through this step

- **Where:** `init.js:300-303`.
- **Scenario (probed, X6):**
  - Use the FTS5 file from N1 and add `CREATE TRIGGER zz_block BEFORE INSERT ON audit_log WHEN NEW.action LIKE 'stock_return_receipts%' BEGIN SELECT RAISE(ABORT, 'no'); END`.
  - The state-log write inside the check throws, and so does the `check_failed` write in the catch, so start-up fails. The ledger guards on disk are intact.
- **Why only Info:** a trigger on `audit_log` that refuses inserts already breaks every audited action, posting included. Other start-up audit writes (such as `ledger_unexpected_triggers_removed`) are just as exposed. Triggers on `audit_log` are not swept at start-up, which is outside this diff. Guarding the catch with its own try/catch, falling back to the console only, would make this step fully non-fatal.

## Residual (carried, as answered)

- The table's own definition beyond its columns is not checked. For example, a `WITHOUT ROWID` rebuild (probed: accepted, locks put back) or a table without its CHECKs and foreign keys. The owner has deferred this to a general schema check. No app write path depends on these today.
