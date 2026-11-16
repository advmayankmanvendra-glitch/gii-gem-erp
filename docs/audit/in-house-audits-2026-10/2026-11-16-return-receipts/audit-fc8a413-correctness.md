# In-house audit, pass 1: correctness, commit fc8a413 (return-receipts fix round 2)

- Date: 16 Nov 2026 IST
- Branch: `claude/erp-full-automation-qbhv8k`, commit `fc8a413`
- Scope: `git diff 47f21e7..fc8a413`, read against `audit-47f21e7-correctness.md` and `responses-47f21e7.md`. Covers the empty-backfill filter in `supplierReturnSplit`, the start-up lock block in `migrate`, the reworded comment and policy text, and the five new or changed tests in `scripts/audit/return-receipts.test.mjs`.
- Method:
  - Code reading.
  - Mutants run on a copy of `fc8a413` exported with `git archive` into the session scratchpad, with node_modules linked. The copy was deleted afterwards. Nothing in the repo was edited.
- **Working-tree note.** At the time of this audit the checkout held an uncommitted change to `src/main/database/init.js`. It moves the start-up block into a new `ensureReturnReceiptLocks(db)` that runs after `ensureLedgerGuards`. This audit did not review that change, and its findings are against `fc8a413` only. A plain `node --test` in the checkout runs the uncommitted file. It passes 15/15, and every mutant baseline at `fc8a413` passes as well.

## Verdict

- The three correctness findings from the last pass (M-1, L-1, L-2) are closed.
- **No new accounting, rounding or backfill bug.**
- **One Low (L-1):** the migration-list test claims more than it checks.
- **One Info (I-1):** at `fc8a413`, the start-up unique index would stop start-up if duplicate rows ever existed. No code path creates them. The uncommitted working-tree change already handles this.

## Previous findings

### M-1 (a return that used no receipts was backfilled again and again): closed

- **Fix.** `inventoryService.js:480` adds `&& e.entry.used.length` to the backfill filter.
- **Before the fix the empty case was only a log problem.** For an empty `used`, `recordReturnReceipts` already inserted nothing, so the only effect of the old code was the audit row. The filter changes no amounts and no rows.
- **Why "replayed (as nothing) each time" is safe.** A return that used no receipts when it posted also uses none when it is replayed later:
  - `insertStockLedger` runs before `supplierReturnSplit` (`:524-541`). So at posting, every lot already has `slId` below the return's own ledger row, the same lots the replay sees through `asOf.slId`.
  - Earlier returns either have records, which are used as they are both times, or are replayed in the same order both times.
  - A receipt reversed after the return is dropped only after it in event order.
  - Billing only changes which group a lot falls into, not whether it can be used. So `asOf.voucherId` being `null` (a return with no voucher becomes `Infinity`) cannot turn an empty result into a non-empty one.
- **Test (`:233`).** Removing the filter makes it fail (test 14), and the other 14 tests still pass.

### L-1 (comment overclaimed): closed

- The comment at `:492-496` now says the billed rows equal the Trade Payables debit only when receipts cover the whole return.
- This is correct. With `beyondReceipts = 0`, `payablesPortion = roundMoney(billedValue)`, and the billed running total ends at `paise(billedValue)`, which is the same rounding.
- The policy text in §6 and the KG-4 `safetyRule` are consistent with the code.

### L-2 (rounding test did not cover billed rows): closed

| Mutant | Fails |
|---|---|
| one running total for both kinds (`running.true` always) | test 13, "a return using billed and unbilled receipts rounds each kind on its own" |
| billed rows rounded per row, unbilled on the running total | test 12, "billed rows add up to the Trade Payables debit…" |

- Hand check of test 13: the second return takes 1 unbilled unit and 1 billed unit at 33.3333. A shared total gives the billed row 6667 − 3333 = 3334 paise, while Trade Payables is debited 33.33. Each kind on its own total gives 3333 and 3333.
- Hand check of test 12: the second return takes 1 unit from each billed receipt, giving rows of 3333 + 3334 = 6667, against a Trade Payables debit of 66.67. Rounding each row gives 6666.

## Start-up ordering (Security L-1 follow-up)

- **New database:** `runMigration(039)` creates the table, then the block at `init.js:724-731` creates both indexes and the trigger.
- **Database from before 039:** the backup is taken (`backupBeforePendingMigration`, before `migrate`), then 039 runs, then the block.
- **Database from 47f21e7:** every statement is `IF NOT EXISTS`, so nothing changes.
- **Database from 91e2fa1** (the first build of 039, which had no unique index and no trigger): `git show 91e2fa1:src/main/database/init.js` confirms they were missing. The block adds them.
- **Ledger guard sweeps leave the trigger alone.** `dropUnexpectedLedgerTriggers` only drops triggers whose table or SQL mentions `vouchers`, `voucher_lines`, `ledger_entries` or `ledger_maintenance` (`ledgerGuards.js:75`, `:520-534`), and the return-receipts trigger mentions none of them.
- **The reset still works.** The operational reset deletes rows, and the trigger is `BEFORE UPDATE` only.
- **Mutant:** with the block removed, tests 8 and 15 fail.

## Findings

### L-1: the migration-list test says unreadable calls fail, but a call written differently slips by

- **Where:** `scripts/audit/return-receipts.test.mjs:136-139`. The regex `/^\s+runMigration\(db, ([^,]+),/gm` only matches a call written on one line whose first argument is literally `db`. The comment at `:138` says "A name this test cannot read … fails rather than slipping by".
- **Scenario (mutants on the scratch copy, both pass 15/15):**
  - A new migration written over several lines, as a formatter may wrap a long name: `runMigration(\n    db,\n    "040_probe",\n    () => {}\n  );`. It is never matched, so it is neither checked against `MIGRATIONS_WITH_BACKUP` nor reported as unreadable.
  - `runMigration(database, "040_probe", …)` inside `migrate`, where the first argument has another name, is also missed.
  - In both cases an existing database gets no pre-upgrade backup before 040, which is the failure this test exists to prevent.
- **Severity:** Low. It is a test-coverage gap, and today's code is correct. `runMigration` is a module-local function (`init.js:789`), so only `init.js` can call it.
- **Fix:**
  - Count every call site, so that any call the parser cannot read fails: `const sites = source.match(/\brunMigration\s*\(/g).length - 1;` (the 1 is the definition), and assert `calls.length === sites`.
  - Or loosen the parser to `/\brunMigration\(\s*\w+\s*,\s*([^,]+?)\s*,/g` over the whole source, and keep the per-name assert.

### I-1: at fc8a413, duplicate rows would stop every start-up, with the ledger guards already dropped

- **Where:** `init.js:728`, `CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_return_receipts_unique`, which is outside any try. It runs in `migrate(db)`, which is called at `:290`, after `dropLedgerGuards` at `:288`.
- **Scenario:**
  - A database that went without the unique index (built with 91e2fa1, or a restored file with the index dropped) holds two rows with the same `(stock_return_id, stock_ledger_id)`.
  - `CREATE UNIQUE INDEX` then throws, `initializeDatabase` throws, and the app cannot open the books. This happens on every start, and `ensureLedgerGuards` never runs.
- **Why Info:** no code path at 91e2fa1, 47f21e7 or fc8a413 writes such rows:
  - `take()` puts each lot in exactly one group, so it gives at most one entry per lot.
  - A return is backfilled only while it has no rows.
  - Posting runs once per return (`ensureStockNotPosted`).
  - Only a hand-edited file can hold duplicates.
- **Fix:** already present in the uncommitted `ensureReturnReceiptLocks` in the working tree, which checks for duplicates, skips the index, and records the rows in the audit log. Review that change when it is committed.

## Other checks (no findings)

- **Accounting values and rounding:** unchanged by this diff. `recordReturnReceipts` and the split arithmetic are identical to 47f21e7, which was fuzzed in the last pass.
- **New tests are valid.**
  - Each fails against its own mutant, listed above.
  - The empty-backfill test's first return really uses no receipt: the supplier has no receipt yet, and the stock comes from opening stock.
  - The trigger test (`:245`) drops both locks on a database where 039 is applied, then reopens it. This is the 91e2fa1 state.
- **KG-4 line numbers for `postStockReturn`:** 511 matches `fc8a413`.
