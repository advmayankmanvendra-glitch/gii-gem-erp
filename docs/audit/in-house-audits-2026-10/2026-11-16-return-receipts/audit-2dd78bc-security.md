# In-house audit, pass 6: security and integrity, commit 2dd78bc (one lock module, Health Center check)

- Date: 16 Nov 2026 IST
- Branch: `claude/erp-full-automation-qbhv8k`, commit `2dd78bc`
- Scope: `git diff c524fb7..2dd78bc`, read against `audit-c524fb7-security.md` and `responses-c524fb7.md`.
  - `src/main/database/returnReceiptLocks.js` (new; the migration, start-up and Health Center code).
  - Its use in `init.js`: migration 039 at `:726` and the start-up call at `:297`.
  - The backup file-name loop in `backupBeforePendingMigration`.
  - `moneyIntegrityService.js` (`return_receipt_locks` and the `ok` fold) and `MoneyIntegrityPanel.jsx`.
- Method:
  - Code reading.
  - Probes with the repo's modules on throw-away databases in temp folders. Each one plants an object, closes the file, and reopens it with `initializeDatabase`. It then checks the schema, the audit log, `moneyIntegrityReport` and, where start-up fails, the ledger-guard triggers left on disk. All probe folders were removed afterwards.
  - No repo file was changed, and `git status` is clean.
  - `node --test scripts/audit/return-receipts.test.mjs`: 22/22 pass.

## Verdict

- **No High or Medium findings. One Low.**
- **All three c524fb7 findings are closed:**

| c524fb7 finding | Probe at 2dd78bc | Result |
|---|---|---|
| L-1: trigger or view under the unique index's name | Same-named trigger plus a `WHERE 0` index; separately, a same-named view | The index is rebuilt, the view is dropped (`replacedView`), duplicates are refused, the repair is logged, and Health Center reports `ok` |
| L-2: replayed 039 stops start-up | 039 row deleted with the locks present; 039 row deleted with duplicate rows and no locks | Both start. With duplicates, the unique lock stays off, `lock_blocked` is logged, and Health Center reports `ok: false` with the duplicates |
| L-3: identical problem put back after a clean-up is not logged | Duplicates, then cleared, then the same duplicates again | The log reads `lock_blocked`, `locks_restored`, `lock_blocked` (cleared), `lock_blocked` (back again) |

- **New:** a file whose `stock_return_receipts` is not the app's table still stops every start (L-1 below). If 039 is replayed on such a file, the ledger guards are left dropped on disk.

## Checked and found sound

- **Health Center.**
  - `returnReceiptLockProblems` reads the live schema each time and changes nothing.
  - The `ok` value is false for each of these: a stray trigger, an altered lock, an index missing or altered, a table holding an index name, duplicate rows, and a missing or non-table `stock_return_receipts` once 039 has run.
  - No probe made it report `ok` while a lock was missing, altered or held by another object. Every one of those is either repaired at start-up or reported.
  - The panel shows only fixed strings and counts, so there is no markup injection from object names.
  - Its only gap is the table's own definition (the residual below).
- **Audit trail.**
  - Every repair writes `locks_restored`.
  - `lock_blocked` and `table_missing` are state logs: written when the problem appears, changes or clears, and re-armed by the clear entry.
  - A crafted file can pre-seed a matching `lock_blocked` entry so that start-up writes nothing new. I probed this; the chain still verifies, because the app's own `auditLog` appends it. But that seeded entry itself records the problem, and a file this edited could rewrite the whole log anyway. Not a finding.
- **Quoting and injection.** Names from the file are passed only through `quote()` (doubled `"`). All other SQL is constant text. `ifNotExists` rewrites only the module's own constants.
- **The index-name lookup** (`holderOf`) is limited to indexes, tables and views, with the index first. A trigger can no longer stand in the way, and an index of that name on another table is dropped and rebuilt.
- **Backup-name loop** (`init.js` in `backupBeforePendingMigration`). It ends at the first free name and cannot loop forever. A directory under that name is skipped like a file. Pre-planting names needs write access to the app's data folder, which already allows replacing the database itself.
- **Temp triggers.** These are still not stored in the file.

## Findings

### L-1: a `stock_return_receipts` that is a table in `sqlite_master` but not the app's table stops every start; when 039 is replayed, the ledger guards are left dropped

- **Where:**
  - `returnReceiptLocks.js:49-53` treats any `sqlite_master` row of type `table` as the record's table.
  - It then runs `duplicateRows` (`:24-27`, which needs `stock_return_id` and `stock_ledger_id`) and creates triggers and indexes (`:105`, `:109`).
  - In the migration, `createReturnReceiptLocks` (`:38-44`) does the same on whatever object holds the name, after `CREATE TABLE IF NOT EXISTS` has silently done nothing.
  - None of this is guarded, so any SQLite error propagates out of `initializeDatabase`.
- **Scenarios (probed):**

| File | Error | Ledger-guard triggers on disk | Pre-upgrade backup |
|---|---|---|---|
| N1: 039 recorded; `stock_return_receipts` is `CREATE VIRTUAL TABLE … USING fts5(stock_return_id, stock_ledger_id)` | `cannot create triggers on virtual tables` | 11 (start-up step runs after `ensureLedgerGuards`) | none |
| N2 and N3: 039 recorded; table recreated without `stock_ledger_id` | `no such column: stock_ledger_id` | 11 | none |
| N4: 039 row deleted; table replaced by a view | `cannot create BEFORE trigger on view: stock_return_receipts` (inside migration 039) | **0** | 1 |
| N5: 039 row deleted; FTS5 virtual table | `cannot create triggers on virtual tables` (inside migration 039) | **0** | 1 |

  - Every later start fails the same way, and the user gets no message saying what to do.
  - With 039 recorded and a view instead of the table, the file starts and is reported correctly (`table_missing`, Health Center). Only the virtual-table and wrong-columns shapes, and the replay path, fail.
- **Exposure:** only a crafted or hand-edited file, such as a restored backup. Integrity is not lost: the app refuses to open rather than running unprotected. But this is the "a file stops start-up" class that fc8a413 L-3 and c524fb7 L-2 closed for other shapes, and the replay route again leaves the file without its ledger guards.
- **Fix:**
  - **Shape check:** in `returnReceiptLockProblems`, treat the table as present only if it is an ordinary table. Its `sql` should start with `CREATE TABLE`, not `CREATE VIRTUAL TABLE`, and `PRAGMA table_info` should list at least `stock_return_id`, `stock_ledger_id`, `quantity`, `rate`, `billed`, `value_minor` and `recorded_by`. Anything else is reported as `table: "altered"` through the same state log and Health Center line as a missing table, with no repair attempted.
  - **Migration 039:** in `createReturnReceiptLocks`, return early unless that same check passes. Better still, have migration 039 refuse loudly with a message naming the backup it just took.
  - **Catch errors:** wrap `ensureReturnReceiptLocks` so an unexpected SQLite error is written to the audit log and start-up continues. The ledger guards are already back at that point.
  - **Tests:** add the FTS5, missing-column and view-plus-replay files.

## Residual (carried, as answered)

- The table's own definition (constraints, foreign keys, conflict clauses) is still not compared with migration 039. The owner has deferred this to a general schema check. L-1 is the part of it that affects start-up. The part that affects integrity, for example a table rebuilt with `UNIQUE(…) ON CONFLICT REPLACE` or without its CHECKs, is not reachable through any app write path today, and Health Center does not report it.
