# In-house audit, pass 1: correctness, commit 2dd78bc (one lock module, Health Center)

- Date: 16 Nov 2026 IST
- Branch: `claude/erp-full-automation-qbhv8k`, commit `2dd78bc`
- Scope: `git diff c524fb7..2dd78bc`, read against `audit-c524fb7-correctness.md` and `responses-c524fb7.md`. Covers:
  - `src/main/database/returnReceiptLocks.js` (new);
  - migration 039 and `backupBeforePendingMigration` in `init.js`;
  - the `ok` fold in `moneyIntegrityService.js`;
  - the panel line in `MoneyIntegrityPanel.jsx`;
  - the new tests.
- Method:
  - Code reading.
  - Probes and mutants run on `git archive` copies of `91e2fa1~1` (before 039), 91e2fa1, 47f21e7, fc8a413, 78f71da, c524fb7 and 2dd78bc in the session scratchpad, with node_modules linked. The copies were deleted afterwards.
  - Nothing in the repo was edited, and the working tree was clean.
  - `return-receipts.test.mjs` passes 22/22.

## Verdict

- **My three c524fb7 findings are closed (L-1, L-2, I-1).**
- The state log, the Health Center fold, the migration path and the backup suffix behave correctly on every database version I built.
- **No High, Medium or Low findings.**
- **One Info** finding: the new module comment says migration 039 "never fails", which does not hold for one tampered file shape before 039.

## Previous findings

| c524fb7 finding | Status | How checked |
|---|---|---|
| L-1: a trigger under an index's name hid a partial unique index | closed | `holderOf` (`returnReceiptLocks.js:31-34`) looks only at index, table and view, index first. Test "a trigger or view under an index's name…" (`:347`) replays my probe, and `lockHolds` passes. |
| L-2: a duplicate that comes back after a clean start went unlogged | closed | `logStateChange` (`:81-85`) logs appear, change and clear. With no earlier entry, "clear" counts as the last state. Test `:297` covers dup, clear, dup again (3 entries). Mutant "clear not logged" fails it. |
| I-1: table-missing logged every start | closed | Same state log. Test `:370` reopens and counts 1. Mutant "log every start" fails it. |

## What was checked (no finding)

### Health Center fold

- **No false positives on any database version.** Each database had one posted supplier return, and was opened twice with 2dd78bc.

| Built by | Audit entries after 2 starts | `ok` | `return_receipt_locks` |
|---|---|---|---|
| `91e2fa1~1` (before 039; backup taken) | none | true | null |
| 91e2fa1 (no lock trigger or unique index) | 1 `locks_restored` (both `missing`), not repeated | true | null |
| 47f21e7, fc8a413, 78f71da, c524fb7, 2dd78bc (fresh) | none | true | null |

- **Before 039 has run:** `returnReceiptLocksOk` returns true when 039 is not applied and there is no table (`:74`). In the app, Health Center can only run after `initializeDatabase`, which always runs 039. So a database before 039 never reaches this check, and deleting that line fails no test (mutant).
- **The report is one global check.** It is the same for every company and for All Companies View, which is correct because the table's locks are database-wide.

### State log across the upgrade

- Entries written by c524fb7 have the same JSON shape (key order `duplicates`, `nameConflicts`; and `{found}`).
- A c524fb7 database with standing duplicates, or with the table replaced by a view, opened twice with 2dd78bc, adds no entry.
- So upgrading does not produce a spurious "change".

### Migration 039

- The trigger is made with `IF NOT EXISTS`, and the indexes only when no index, table or view holds the name.
- The unique index is skipped when duplicates exist.
- Both mutants (no `IF NOT EXISTS`; no duplicate check) fail test `:329`.
- On a new database the table is empty, so the duplicate query costs nothing.

### Repair transaction

- No statement in it can throw on the shapes the check classifies. Index, table and view share one namespace, and a table holder is reported and never dropped.
- A view holder is dropped and logged as `replacedView`.
- **Order inside `holderOf`:** one object at most can match, so the `ORDER BY` has no effect; that object comes back first whatever the order. The type filter is what does the work:
  - removing the `ORDER BY` changes nothing (mutant passes);
  - removing the type filter still passes because of the order (mutant passes).
  - The response calls the filter belt and braces; either one alone is enough.

### Backup suffix (`init.js:779-780`)

- `fs` is imported.
- The loop gives `pre-upgrade-<stamp>-1.db`, `-2.db`, and so on, and test `:329` exercises it.
- The only consumer that sorts backup names is `productionReadinessService.js:67`. Its `.sort().reverse()` puts `<stamp>.db` ahead of `<stamp>-1.db`, because `.` sorts after `-`. Both are from the same second, so which one it calls newest makes no practical difference.

### Mutants

| Mutant | Fails |
|---|---|
| no `IF NOT EXISTS` on the trigger | test `:329` |
| no duplicate check in the migration | test `:329` |
| `ok` fold removed | tests `:297` and `:370` |
| cleared state not logged | test `:297` |
| table-missing logged every start | test `:370` |

## Findings

### I-1: migration 039 still stops start-up on a file that has a view named `stock_return_receipts` before 039 runs

- **Where:** `returnReceiptLocks.js:36-39`. The comment says "so the migration never fails". The trigger is created `BEFORE UPDATE ON stock_return_receipts` with no check that the table is a table. In `init.js`, `CREATE TABLE IF NOT EXISTS` does nothing when a view of that name exists.
- **Probe:**
  - A database built before 039 (`91e2fa1~1`) with `CREATE VIEW stock_return_receipts AS SELECT 1 id` added.
  - Opened with 2dd78bc, `initializeDatabase` throws `cannot create BEFORE trigger on view: stock_return_receipts`.
  - The ledger guards were dropped before migrations and stay off until a start succeeds.
  - The same happens if the 039 row is deleted from a later database after the table is replaced by a view.
- **Why Info:**
  - It needs a hand-made view under exactly that name.
  - c524fb7 failed the same way, so this is not a regression.
  - The pre-upgrade backup is taken first.
  - It is raised only because the new comment and the response ("a replayed 039 never stops start-up") claim more than the code does.
- **Fix (optional):**
  - In `createReturnReceiptLocks`, return early unless `sqlite_master` has `type = 'table'` for the name. The start-up check then logs `table_missing`, and Health Center shows it.
  - Or soften the comment.
