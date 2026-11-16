# In-house audit, pass 1: correctness, commit b5b0ad3 (table in name only)

- Date: 16 Nov 2026 IST
- Branch: `claude/erp-full-automation-qbhv8k`, commit `b5b0ad3`
- Scope: `git diff 2dd78bc..b5b0ad3`, read against `audit-2dd78bc-correctness.md` and `responses-2dd78bc.md`. Covers:
  - `returnReceiptsTableState` and the guard in `createReturnReceiptLocks` (`returnReceiptLocks.js:41-53`);
  - migration 039, which now creates `idx_stock_ledger_source` first and the table only when the name is free (`init.js:716-735`);
  - the try/catch around the start-up check (`init.js:298-303`);
  - the new test.
- Method:
  - Code reading.
  - Probes and mutants run on `git archive` copies of `91e2fa1~1` (before 039), 91e2fa1, 47f21e7, fc8a413, 78f71da, c524fb7, 2dd78bc and b5b0ad3 in the session scratchpad, with node_modules linked. The copies were deleted afterwards.
  - Nothing in the repo was edited.
  - `return-receipts.test.mjs` passes 23/23 at b5b0ad3.
- **Working-tree note.** At the end of this audit the checkout held uncommitted changes to `scripts/audit/return-receipts.test.mjs` and `src/main/database/init.js`. They are not mine, I did not touch them, and they were not reviewed.

## Verdict

- **My 2dd78bc I-1 is closed.** A view under the table name before 039 no longer stops start-up.
- **The change breaks nothing** on new, pre-039 or earlier-branch databases.
- **No High, Medium or Low findings.**
- **One Info** finding (I-1): an *index* under the table name before 039 still stops start-up, although the new comment says "a view or other object" is left for the start-up check. 2dd78bc behaves the same, so this is not a regression.

## Previous finding

### I-1 (a view under the table name before 039 stopped start-up): closed

- **Probe.** A pre-039 database (`91e2fa1~1`) with `CREATE VIEW stock_return_receipts AS SELECT 1 id` added, opened twice with b5b0ad3:
  - start-up completes;
  - one `stock_return_receipts_table_missing {found: "view"}` entry, not repeated;
  - Health Center `ok=false` with `table: "view"`.
- **Same probe with a table lacking the columns** (`(id INTEGER PRIMARY KEY, x)`): same result, with `"table without its columns"`.
- **The new comment** at `returnReceiptLocks.js:36-37` no longer claims the migration never fails.

## Upgrade matrix (no finding)

- Each database had one posted supplier return. I opened it twice with b5b0ad3 and posted one more return on each start.

| Built by | Audit entries | Health Center `ok` / locks | Rows after start 1 / start 2 | Objects |
|---|---|---|---|---|
| `91e2fa1~1` (before 039) | none | true / null | 2 / 3 (the earlier return was backfilled, then the new return) | all four objects present, plus `idx_stock_ledger_source`; backup taken |
| 91e2fa1 | one `locks_restored`, not repeated | true / null | 2 / 3 | same |
| 47f21e7, fc8a413, 78f71da, c524fb7, 2dd78bc, b5b0ad3 (new database) | none | true / null | 2 / 3 | same |

- **Migration order.** Moving `idx_stock_ledger_source` ahead of the table changes nothing: it is `IF NOT EXISTS`, inside the same migration transaction, and on another table.
- **Dropping `IF NOT EXISTS` from `CREATE TABLE`** is safe for views and tables. That statement is reached only when `returnReceiptsTableState` finds no table or view under the name.
- **Early `return` inside the migration callback.** `runMigration` still records 039 as applied, which is intended: the start-up check reports the bad table from then on. A later repair of the file will not re-create the table without a restore. The response states this, and the Health Center text says "Restore a backup".
- **`returnReceiptsTableState` on real tables.** Every real database in the matrix reports `"table"`. `REQUIRED_COLUMNS` matches the 039 definition (`created_at` is left out, which is harmless). `PRAGMA table_info` is reached only for a non-virtual table.

## Mutants

| Mutant | Fails |
|---|---|
| virtual-table check removed | test 23 |
| column check removed | test 23 |
| migration early return removed | tests 19 and 23 |
| table guard in `createReturnReceiptLocks` removed | test 23 |
| **try/catch at start-up removed** | **none** |

- On the try/catch:
  - No test reaches it. I could not build a file that makes `ensureReturnReceiptLocks` throw once the table is a real table, so I report no finding.
  - If it is ever reached by a lasting fault, it writes `stock_return_receipts_check_failed` on every start, because that path has no state log.

## Findings

### I-1: an index named `stock_return_receipts` before 039 still stops every start

- **Where:**
  - `returnReceiptLocks.js:41-44`: `returnReceiptsTableState` looks only at `type IN ('table', 'view')`.
  - `init.js:718-720`: with nothing found, it runs `CREATE TABLE stock_return_receipts`.
  - In SQLite, tables, views and indexes share one namespace.
- **Probe:**
  - A pre-039 database with `CREATE INDEX stock_return_receipts ON stock_ledger(id)` added.
  - Both starts throw `there is already an index named stock_return_receipts`. The ledger guards stay dropped, since migrations run with them off.
  - 2dd78bc throws the same error, so this is not a regression.
- **Why Info:**
  - Only a hand-edited file can hold it.
  - The pre-upgrade backup is taken first.
  - It is raised because the new comment at `init.js:716-717` ("A view or other object already under the name … is left for the start-up check") claims more than the code does.
- **Fix (optional):**
  - Look up `type IN ('table', 'view', 'index')` in the migration's guard, or in `returnReceiptsTableState` with an `"index"` state.
  - Or narrow the comment to "a view or table".
