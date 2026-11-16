# In-house audit, pass 1: correctness, commit c524fb7 (lock check against definitions)

- Date: 16 Nov 2026 IST
- Branch: `claude/erp-full-automation-qbhv8k`, commit `c524fb7`
- Scope: `git diff 78f71da..c524fb7`, read against `audit-78f71da-correctness.md` and `responses-78f71da.md`. Covers:
  - the rewritten `ensureReturnReceiptLocks` and `normalizedSchemaSql` in `src/main/database/init.js`;
  - migration 039, which now creates the locks;
  - the new and changed tests in `scripts/audit/return-receipts.test.mjs`.
- Method:
  - Code reading.
  - Probes and mutants run on `git archive` copies of 91e2fa1, 47f21e7, fc8a413, 78f71da and c524fb7 in the session scratchpad, with node_modules linked. The copies were deleted afterwards.
  - Nothing in the repo was edited, and the working tree was clean.
  - `return-receipts.test.mjs` passes 20/20 at c524fb7.

## Verdict

- **Both findings from the last pass are closed (L-1 and I-1).**
- The SQL comparison gives no false repairs on databases built by earlier versions, and found no tampered lock that it accepts.
- **Two new Low findings** in the name-conflict lookup (L-1) and the once-per-change logging (L-2).
- **One Info** finding (I-1) on repeated table-missing entries.
- Amounts and pricing are not touched by this diff.

## Previous findings

### L-1 (a partial unique index was accepted; repairs went unlogged): closed

- Each lock is now compared with the app's own CREATE text, after `normalizedSchemaSql` (`init.js:371`).
- Re-run of my 78f71da probes at c524fb7:

| Tamper | Result |
|---|---|
| partial unique index `… WHERE 0` | rebuilt, logged `was: "altered"` (test 17) |
| lock trigger altered with `WHEN 0` | rebuilt, logged `lockRestored: "altered"` (test 17) |
| index dropped | re-made, logged `was: "missing"` (test 17) |

### I-1 (duplicates logged on every start; wrong console text): closed as far as it was changed

- Duplicates now go to `stock_return_receipts_lock_blocked`. That entry is written only when its content differs from the last such entry.
- The console line now says the unique lock is off.
- The pricing impact (`recordedUse` counts duplicate rows twice) was answered and not changed. That is acceptable, given that only an edited file can hold them.

## Checks with no finding

- **No false repairs on earlier databases.** I built a database with a posted return using each earlier commit, then opened it twice with c524fb7.

| Built by | `locks_restored` / `lock_blocked` entries after 2 starts |
|---|---|
| 91e2fa1 (no trigger, no unique index) | 1 (`lockRestored: missing`, unique index `missing`): accurate, and not repeated |
| 47f21e7, fc8a413, 78f71da, c524fb7 | 0 |

  - The comparison can be exact because SQLite stores `CREATE … IF NOT EXISTS name` as `CREATE … name` in `sqlite_master.sql` (checked directly). So the 47f21e7 and fc8a413 text (`IF NOT EXISTS`, other indentation) normalises to the same string.
- **No false acceptances of consequence.**
  - Normalisation only folds case and whitespace, and the whitespace around `(),;`. SQL keywords and identifiers ignore case, so a tampered lock that normalises equal can differ only in the case or spacing of the RAISE message text, which changes no behaviour.
  - A comment, `WHEN`, `OF col`, `WHERE`, `COLLATE`, a different table or a quoted name all differ, so the lock is rebuilt. Rebuilding on quoting is harmless.
- **Migration 039 creating the locks.**
  - New databases get the locks inside the migration's transaction, and the lock step then logs nothing (test 16).
  - Databases that had already applied 039 are unaffected.
  - The CREATEs have no `IF NOT EXISTS`. They could fail only if 039 is pending while those objects already exist, which no build produces.
- **Mention sweep.** No trigger of the app's own mentions `stock_return_receipts`. `\b` does not match inside `trg_stock_return_receipts_no_update`, and the lock is skipped by name in any case. Ledger guards are not touched.
- **Mutants** (each fails a test unless noted):

| Mutant | Fails |
|---|---|
| mention sweep removed | test 17 |
| index SQL not compared | tests 17 and 19 |
| blocked entry written every start | test 18 |
| locks removed from 039 | tests 16 and 17 |
| `tbl_name` compared case-sensitively | **none**: see the note below |

  - Note on the last row: the `tbl_name` branch (`:332`) adds nothing. Any trigger on the table has `ON <name>` in its SQL, so the case-insensitive mention regex already catches it. That includes `planted_upper` in test 17. This is harmless.

## Findings

### L-1: a trigger that has an index's name hides that index from the check, so a tampered unique index stays

- **Where:** `init.js:344-346`. The lookup is `SELECT type, name, sql FROM sqlite_master WHERE name = ? COLLATE NOCASE` with `.get()`, which has no type filter. Any non-index row is treated as a name conflict.
- **Why it happens:**
  - In SQLite, triggers have their own namespace. A trigger and an index can share a name; checked: `CREATE TRIGGER tg …; CREATE INDEX tg …` succeeds.
  - So when both exist, `.get()` may return the trigger. The index is then reported as a conflict and never compared or rebuilt.
- **Probe (c524fb7 copy, two starts):**
  - Planted `CREATE TRIGGER idx_stock_return_receipts_unique AFTER INSERT ON warehouses BEGIN SELECT 1; END`. It does not mention the table, so the sweep keeps it.
  - Replaced the unique index with a partial one (`… WHERE 0`).
  - Result on both starts: one `lock_blocked` entry with `nameConflicts: [{ type: "trigger" }]`, the partial index kept, and a duplicate `(stock_return_id, stock_ledger_id)` insert **accepted**.
  - So the L-1 bypass from the last pass comes back, with a misleading reason in the log.
- **Severity:** Low. It needs an edited file, but it defeats the lock that this step exists to guarantee.
- **Fix:**
  - Look up the index name among `type IN ('index', 'table', 'view')` only, since triggers cannot conflict with an index name.
  - Or look up `type = 'index'` first, and look for a conflict only when there is no index.
  - Add a test with a same-named trigger and a partial index.

### L-2: once-per-change logging stays silent when the same duplicate comes back after a clean start

- **Where:** `init.js:365-366`. The new entry is compared only with the last `stock_return_receipts_lock_blocked` entry. Any `locks_restored` entry written after it is ignored.
- **Probe (c524fb7 copy):**
  1. Duplicate row inserted and unique index dropped. On start: `lock_blocked` (id 77).
  2. Duplicate deleted. On start: the index is re-made, and `locks_restored` (id 78) is logged.
  3. The same duplicate re-inserted and the index dropped again. On start: **no audit entry at all**. The unique index is absent, and only a console line shows it.
  - Step 3 writes nothing to `locks_restored` either, because the duplicate branch `continue`s before the restore is recorded (`:349`).
- **Effect:** the file loses its unique lock a second time with no trace in the hash-chained audit log, although the comment says such problems are "named in the audit log (once per change)".
- **Severity:** Low (tamper only).
- **Fix:**
  - Compare with the latest entry of either action, and log when the last one is not an identical `lock_blocked`.
  - Or write a `lock_blocked` entry with an empty problem when a blocked state clears.
  - Extend test 18 with a clear-then-repeat step.

### I-1: a missing or replaced table is logged again on every start

- **Where:** `init.js:317-321`.
- **Probe:** the view from test 20 gives 1, 2, 3 `stock_return_receipts_table_missing` entries after three starts.
- **Why Info:** the state is broken, posting fails until it is fixed, and a repeated alert may be intended. However, it is inconsistent with the once-per-change rule now applied to `lock_blocked`.
- **Fix (optional):** use the same last-entry check for this action.
