# Critical-defect verification on acf6d02

- **Branch:** `phase-16-enterprise-crm-integration` at `acf6d02`.
- **Date:** 2026-10-07.
- **Suite:** `scripts/audit/critical-defects.test.mjs`. Full output is in `run-full.txt` (this folder).
- **In the repo:** `scripts/audit/critical-defects.test.mjs`. Run it from the repo root with `node --test scripts/audit/critical-defects.test.mjs`.
- **Changes:** none. No repo files and no real databases were touched. Every test builds its own throwaway database in the OS temp folder.

Each test asserts the **correct** behaviour, so a failing test means the defect is still there.

These are service-level reproductions and part of the acceptance evidence for the corrective phases. They are not a complete sign-off on their own (see "Not covered here").

**Result (revision 4, 2026-10-10): 26 tests, 6 pass, 20 fail.**

The 6 passing tests are the 2 post-close balance-sheet checks and 4 control cases that working behaviour must keep passing.

## Revision 2 (after independent review)
These changes stop an incomplete fix from passing:

- **Restore control (C10e):** the test changes the data after taking the backup, restores, and checks the change is rolled back. A restore that does nothing now fails.
- **Bad-restore checks:** the live file is opened read-only with the raw driver and checked in three ways:
  - `integrity_check` passes;
  - the `suppliers` table exists;
  - the marker row is present.
  This happens before the app opens the file, so a silent re-seed to a blank database is caught.
- **Allocations:**
  - **C3:** the second allocation must be refused, and A must keep exactly 100,000 while B gets 0.
  - **C5:** both invoices must reach 0 outstanding, with 236,000 received and 236,000 allocated, so a fix that drops part of a payment fails.
- **Exception handling:** no test swallows exceptions any more. `attempt()` accepts a throw only if it is a guided business refusal. A TypeError, a SQLite error or any unrelated message fails the test.
- **C4:** a control was added. An advance equal to the receipt must still be accepted.
- **C6:** the test now also checks that the third click is refused, that only one voucher exists, and that Trade Payables is 11,800.
- **C11a:** a control was added. The record must still post once through the real posting path.
- **C12:**
  - The test is pinned to seed receipt UTR10001 and asserts that it is Posted beforehand.
  - The test finds the statement line by UTR and its proposal by `bank_entry_id`.
  - It asserts the bank balance is unchanged and that no new vouchers were created.

Result: 20 of 23 failed, each for its intended reason.

## Revision 4: self-review (2026-10-10)
A review of the suite's own weak spots led to these changes:
- **Refusal pattern narrowed.** It no longer matches bare "balance" or "outstanding". The old pattern let an unrelated "Unbalanced voucher" error count as a correct refusal.
- **C9 is now strict.** It previously accepted any error containing "stock". It now requires a guided refusal and checks that 0 units left warehouse B. Today 10 units are issued.
- **C7:** removed an assertion that compared a value to itself. The retry must now write at least 2 ledger entries, and the exact amounts are still checked.
- **C1 (payment):** asserts that the seed receipt has at least one allocation, so the "invoice outstanding restored" loop cannot pass with nothing to check.
- **New control C11d:** a draft stock adjustment is refused until it is approved, then posts 100 units worth 100,000. This passes today. A side finding, not tested here: `approveStockAdjustment` does not stop the person who created the adjustment from approving it.
- **Repo path:** the file now finds the repo it sits in, so `GII_REPO` is optional.

The C1 deep checks were run again against a throwaway patched copy. With only the `updated_at` crash removed, all 4 pass.

## Revision 3 (after the second review)
1. **Restore refusals are now strict.**
   - A restore only counts as refused when it throws a guided message about the backup or restore. A TypeError, a raw SQLite error or an unrelated message fails the test.
   - **C10f** now requires the pending-restore path to refuse explicitly. It must also leave no pending files behind, and the next app start must not apply the bad file.
   - New control **C10g:** the pending path must still restore a good backup.
2. **Purchase control is now unconditional.** New **C11c:** an ordinary draft purchase must save as unposted, then post once (one voucher, Trade Payables 11,800). It passes today.
3. **C7 now checks the moment of failure.**
   - Immediately after the injected failure, there must be no voucher, no ledger entries, no receivable, and the invoice must not be Posted. Today it fails here: 1 voucher and 3 ledger entries are left behind.
   - After the retry there must be exactly one voucher, Trade Receivables +1,180, Sales −1,000, GST −180, and a receivable of 1,180 outstanding.
4. **C1 now checks the whole reversal.** After a reversal:
   - A new voucher exists, marked as a reversal of the original.
   - Its ledger lines are the exact mirror of the original's, and the two net to zero on every account.
   - The original voucher and its source document are both Reversed.
   - Billing: the receivable is Reversed at 0 and its allocations are released.
   - Payment: its allocations are released and each invoice's outstanding goes back up by the allocated amount.
   - Procurement and supplier payment: their allocations are released.
   - A second reversal is refused.

   **How the C1 assertions were checked:** today C1 fails at the crash, before the deeper checks run. To confirm they behave correctly, they were also run against a throwaway copy of the code (deleted afterwards; the repo was not changed):
   - With only the `updated_at` crash removed, all four C1 tests passed.
   - With `reverseVoucher` changed to do nothing and return an existing voucher, all four failed.
5. **Cleanup.** Every database handle and temp folder is registered and released in `afterEach`, which runs whether the test passed or failed. After a full run, no `gii-verify-*` folders are left.

Every test checks real outcomes and does not ignore errors. These remain service-level tests, so the limits under "Not covered here" still apply.

## Results

| # | Claim | Result on acf6d02 | Evidence |
|---|---|---|---|
| 1 | Reversing a posted sales, purchase, receipt or supplier-payment voucher crashes | **Holds** (4 of 4 fail) | "no such column: updated_at" |
| 2 | Balance sheet doesn't tie from the second year | **Fixed as worded** | After closing FY 2025-26, FY 2026-27 ties and Trade Receivables equals the ledger. FY 2026-27 can then be closed into FY 2027-28, which also ties. |
| 2c | (Narrowed form) Before the prior year is closed, the next year's balance sheet drops prior-year balances | **New finding** | The ledger shows 831,000 and the balance sheet shows 830,000. The 1,000 from FY 2025-26 is missing. The report still ties because the matching profit is also dropped. |
| 3 | One receipt can be applied twice (advance adjustment plus allocation) | **Holds** | A 100,000 receipt reduced two invoices by 200,000 in total. |
| 4 | An advance can exceed its receipt | **Holds** | A 100,000 receipt recorded a 500,000 advance. |
| 5 | Posting a payment dumps it all on the first invoice | **Holds** | Invoice A went to −118,000 "Closed" while invoice B stayed at 118,000 "Open". |
| 6 | A second Post click unlocks the record, and the next Post books it twice | **Holds** | Status went from Posted to Error. Trade Payables was credited 23,600 for an 11,800 purchase. |
| 7 | Posting is not atomic, so a retry double-posts | **Holds** | One invoice ended up with two vouchers, SALES-00002 and SALES-00003. |
| 8 | A warehouse transfer destroys stock value | **Holds** | Destination value is −400 instead of 400. The next issue from it was costed at rate 0 instead of 100. |
| 9 | Item opening stock is counted in every warehouse | **Narrowed** | The Stock Summary report now puts opening stock only in the default warehouse, and shows 0 in warehouse B. But posting uses `stockBalance` (`inventoryService.js:9`), which still adds opening stock in every warehouse, so issuing 10 from empty warehouse B is accepted. |
| 10 | Restoring a bad backup destroys the live database | **Holds** (5 of 5 fail) | Same sequence as the `backup:restore` handler in main.js: close, `restoreBackup`, reopen. Results below. |
| 11 | The generic save trusts "Posted" and "Approved" | **Holds** | A purchase was saved as Posted with no voucher. A stock adjustment saved as Approved posted 100 units with no approval step. |
| 12 | Bank proposals re-book receipts that are already posted | **Holds** | The bank balance moved from −50,000 to 300,000 for receipt UTR10001, which was already posted. |

### Claim 10 results

Every bad file was **accepted**:

| Backup file | What happened to the live database |
|---|---|
| Text file named `.db` | Will not open ("file is not a database") |
| Truncated copy of the real database | Will not open ("database disk image is malformed") |
| Zero-byte file | Reopens as a blank, freshly seeded database. Original data gone. |
| A valid SQLite file from another program | Reopens and migrates. Original data gone. |
| The same text file via the pending-restore path | Will not open |

The control case, restoring a good backup, passes.

## Not covered here
These tests call the services directly. They do not cover:
- desktop button behaviour or permissions;
- real Windows file-lock recovery during restore;
- the historical-report checksum discrepancy;
- SEC-1 security.

Each corrective phase still needs those checks, plus the repo's verify scripts and an Electron smoke test.

## PR #1
`claude/project-thread-grlynv` (d58bb12) does not merge cleanly into `acf6d02`.

The evidence is in two files:
- **`pr1-merge-check.txt`:** the full `git merge-tree` output, with the commit hashes of both branches and their merge base (`aec83eb`).
- **`pr1-commits.patch`:** PR #1's two commits.

To reproduce locally:
1. Run `git fetch origin claude/project-thread-grlynv`.
2. Run `git merge-tree --write-tree --name-only acf6d02 FETCH_HEAD`.

Instead of fetching, you can run `git am pr1-commits.patch` on a scratch branch from `aec83eb`.

The test merge reports content conflicts in six files:
- `package.json`
- `init.js`
- `main.js`
- `preload.cjs`
- `App.jsx`
- `client.js`

## Running it
1. Install `node_modules` built for Node, not the Electron rebuild. Use `npm ci` or `npm rebuild better-sqlite3`.
2. From the repo root, run `node --test scripts/audit/critical-defects.test.mjs`.
3. To test another checkout, set `GII_REPO` to its folder.
