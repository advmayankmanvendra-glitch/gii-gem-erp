# In-house audit, pass 5: security and integrity, commit c524fb7 (lock definitions checked, every repair logged)

- Date: 16 Nov 2026 IST
- Branch: `claude/erp-full-automation-qbhv8k`, commit `c524fb7`
- Scope: `git diff 78f71da..c524fb7`, read against `audit-78f71da-security.md` and `responses-78f71da.md`.
  - `ensureReturnReceiptLocks` and `normalizedSchemaSql` (`src/main/database/init.js:316-373`).
  - The locks now made inside migration 039 (`init.js:792-793`).
  - The new tests.
- Method:
  - Code reading.
  - Probes with the repo's modules on throw-away databases in temp folders: plant an object, close, reopen with `initializeDatabase`, then inspect the schema and the audit log. All probe folders were removed afterwards, no repo file was changed, and `git status` is clean.
  - `node --test scripts/audit/return-receipts.test.mjs`: 20/20 pass.

## Verdict

- **No High or Medium findings. Three Low, one Info.**
- As before, every finding needs a crafted or edited database file. None can be reached from the renderer or through normal posting.
- **All four 78f71da findings are closed** for the cases reported. Each probe from pass 4 was re-run:

| Pass-4 probe | Result at c524fb7 |
|---|---|
| A, I: trigger `ON STOCK_RETURN_RECEIPTS` / `ON "Stock_Return_Receipts"` | Removed and logged (`triggersRemoved`) |
| B: trigger on `stock_ledger` deleting from `[Stock_Return_Receipts]` | Removed and logged |
| C: partial unique index (`WHERE 0`) | Rebuilt (the stored-SQL comparison) |
| D: lock index name used by an index on `audit_log` | Rebuilt on the right table and logged |
| E: table holding an index name | Start-up continues; `lock_blocked` names the conflict |
| F: table replaced by a view | `stock_return_receipts_table_missing` logged |
| G: lock trigger with `WHEN 0` | Rebuilt and logged as `lockRestored: "altered"` |

- **New:** a crafted file can still switch the unique lock off by putting a trigger or view under its name (L-1). A file without the 039 row can stop start-up again, now inside the migration (L-2). Putting back identical duplicates after a clean-up is not logged (L-3).

## Checked and found sound

- **Stored-SQL comparison.** `normalizedSchemaSql` only collapses whitespace, trims around `( ) , ;` and lowercases. Nothing semantic is removed: a `WHEN` clause, `OF column`, `WHERE`, a `COLLATE`, a quoted table name or a different column all compare unequal. Lowercasing also folds the RAISE message, which is harmless. I found no weaker definition that compares equal.
- **Identifier quoting.** `quote()` doubles `"` and is used for every name read from the file. The constant SQL is fixed text.
- **Mention sweep.** `/\bstock_return_receipts\b/i` matches the name bare, quoted or bracketed, in any case. Because `_` is a word character, it does not match `stock_return_receipts_archive` or similar. SQLite has no other way to name the table inside a trigger body. A chain of triggers still needs one link that names the table, and that link is removed.
- **What the sweep could wrongly drop.** None of the app's own triggers mention the table. The ledger guards are rebuilt from the app's SQL before the step runs, so a crafted copy of a ledger guard cannot get one dropped. See I-1 for the mapping guards.
- **Temp triggers.** These are not stored in the file, so nothing changes from pass 4.
- **Missing table.** It is logged on every start while the problem persists, which is acceptable.

## Findings

### L-1: a trigger or view holding the unique index's name switches the unique lock off; with a trigger, a planted partial index is also kept

- **Where:** `init.js:344-346`. `have` is the first `sqlite_master` row with that name, of any type. A non-index row is treated as a name conflict, and the code `continue`s without creating or checking the index.
- **Why it is wrong:**
  - In SQLite, triggers have their own namespace. A trigger named `idx_stock_return_receipts_unique` does not stop `CREATE INDEX` with that name, so it is not a real conflict.
  - A view does share the index namespace, but dropping a view loses no data.
- **Scenario (probed):**
  - **P1.** `CREATE TRIGGER idx_stock_return_receipts_unique AFTER INSERT ON companies BEGIN SELECT 1; END;`, then replace the index with `CREATE UNIQUE INDEX idx_stock_return_receipts_unique ON stock_return_receipts(stock_return_id, stock_ledger_id) WHERE 0`. The trigger has the lower rowid, so `.get()` returns it.
    - Result: the partial index is kept, and duplicate `(stock_return_id, stock_ledger_id)` rows insert.
    - The only trace is a `stock_return_receipts_lock_blocked` entry saying `nameConflicts: [{type: "trigger"}]`. That reads as "the index could not be made", not "a weakened index is in place".
    - This brings back pass-4 L-2 by another route.
  - **P2.** `DROP INDEX idx_stock_return_receipts_unique; CREATE VIEW idx_stock_return_receipts_unique AS SELECT 1`. The unique lock stays off on every start (logged once), and duplicates insert.
  - With the index left intact and a same-named trigger added later (P1b), `.get()` returns the index first and nothing goes wrong. The result therefore depends on rowid order.
- **Fix:**
  - Look up the name with `type IN ('index', 'table', 'view')` and handle the index row first. A trigger never blocks an index name.
  - For a view holding the name, drop it and log it, since a view holds no data. Keep the report-and-continue path only for a real table.
  - Add a test with a same-named trigger plus a `WHERE 0` index, and one with a same-named view.

### L-2: migration 039 now creates the locks without `IF NOT EXISTS`, so a file that has the table or locks but no 039 row stops every start, with the ledger guards left dropped

- **Where:** `init.js:792-793`, inside `runMigration(db, RETURN_RECEIPTS_MIGRATION, …)`. This runs from `migrate` (`:290`), after `dropLedgerGuards` (`:288`) and before `ensureLedgerGuards`.
- **Scenario (probed):**
  - **P4.** On a current database, `DELETE FROM schema_migrations WHERE migration_name = '039_stock_return_receipts'`, then reopen. Start-up fails with `trigger trg_stock_return_receipts_no_update already exists`. Afterwards the file holds 0 `trg_ledger_guard%` triggers. The pre-upgrade backup is taken, because 039 counts as pending.
  - **P4b.** A file with no 039 row, the table without its locks, and two duplicate rows. Start-up fails with `UNIQUE constraint failed`.
  - Every later start fails the same way. This is the failure mode closed in fc8a413 L-3, coming back through the migration instead of the start-up step. The new lock step's report-and-continue handling is never reached.
- **Exposure:** only a crafted or hand-edited file. No released build creates the table without also recording 039. The backup makes recovery possible, but the app gives the user no way to it.
- **Fix:** in the migration, use `CREATE TRIGGER IF NOT EXISTS` and `CREATE [UNIQUE] INDEX IF NOT EXISTS`, or drop the lock creation from 039 entirely. `ensureReturnReceiptLocks` already checks and repairs both on every start, including the duplicate case, and logs what it did. Add a test that deletes the 039 row and reopens.

### L-3: "once per change" means duplicates put back after a clean-up, identical to the last report, are not logged again

- **Where:** `init.js:365-366`. A new `stock_return_receipts_lock_blocked` entry is written only when its JSON differs from the last such entry. Nothing is written when the problem clears, so the last entry stays the "current" one forever.
- **Scenario (probed, P3):**
  1. A file with duplicate rows and no unique index: one `lock_blocked` entry (correct).
  2. Delete the duplicates and restart: the unique index is rebuilt and `locks_restored` is logged (correct).
  3. Drop the index again and insert the same duplicates: on restart the lock is off again, but no new audit entry is written (the count stays 2), only the console line.
- **Effect:** the second tampering leaves no audit trail. The rows a reviewer would look at are the same, but the history wrongly shows the duplicates were cleared and never came back.
- **Fix:** compare with the last `lock_blocked` entry only if it is newer than the last `locks_restored` entry for the unique index. Alternatively, write a `stock_return_receipts_lock_cleared` entry when the problem goes away, and compare with whichever is latest.

## Info

### I-1: the mention sweep drops app-owned triggers created with `IF NOT EXISTS` if a crafted file adds the table's name to them, until the next start

- **Where:** `init.js:330-336`, together with the `IF NOT EXISTS` mapping guards in `accountMappingRegistry.js:254-331`.
- **Scenario (probed, P6):** replace `trg_statement_mapping_insert_guard` with a copy whose SQL contains `/* stock_return_receipts */`. On start, `ensureAccountMappingRegistry` keeps it (name only), and the sweep then drops it and logs it in `triggersRemoved`. For that session the mapping guard is missing; the next start recreates it.
- **Why only Info:** a file that can do this can just as easily leave a weakened guard under the same name, which `IF NOT EXISTS` keeps for good. The sweep adds no new exposure, and it logs what it did. Checking those guards' SQL the way `ensureReturnReceiptLocks` now does would close both.

## Residual (carried, as answered)

- The table's own definition (columns, CHECKs, foreign keys) is not checked, per security I-1 of pass 4. The owner has deferred this to a general schema check.
