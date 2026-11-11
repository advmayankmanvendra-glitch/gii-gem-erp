# In-house correctness audit: 3c12e50..9dac174

- Repo: gii-gem-erp, branch `claude/erp-full-automation-qbhv8k`, head `9dac174`
- Range: `git diff 3c12e50..9dac174` (commits 9586536, ebf435b, 9dac174)
- Scope: logic and accounting correctness. Security and architecture are covered by their own reports.
- Method: read every changed source file in full context; reproduced the main finding against a
  throwaway database built from a `git archive` copy of 9dac174; ran `npm run test:integrity`
  in that copy (104/104 and 22/22 pass). The checkout was not modified.

## Summary

| ID | Severity | Area | Title |
|----|----------|------|-------|
| C-1 | Medium | Order closure | Netting across invoices lets an unpaid invoice count as settled |
| C-2 | Low | Profit Simulator | Old figures stay on screen after a company switch or a failed reload |
| C-3 | Low | IPC guard | `sessionGuarded` now writes an audit row on every account-mapping read and user listing |
| C-4 | Low | Tally preview | The masters cap is checked only after every block is copied out |
| C-5 | Low | Entity picker | "Load more" during a pending typed search appends rows for the new term to the old results |

Nothing in this range touches bank reconciliation (`bankReconciliationService.js` is unchanged
between 3c12e50 and 9dac174), so its status rules were not re-audited.

---

## C-1 (Medium): Netting across invoices lets an unpaid invoice count as settled

**Where:** `src/main/services/orderClosureService.js:25-28`, with
`receivableOutstandingForSettlement` in `src/main/database/init.js:1446-1451`.

```js
const orderOutstanding = outstanding.reduce((sum, row) => sum + row.amount, 0);
const unsettled = orderOutstanding > 0.005 ? [...missing, ...positives] : missing;
```

The order total is meant to let a credit note booked as its own invoice (negative
`invoice_amount`) net against the invoice it corrects. But the sum takes in **any** negative
per-invoice outstanding. Two normal ways to get one:

1. An excess allocation. `createReceiptAllocation` with `allow_excess: true` skips the "cannot
   exceed invoice outstanding" check (`accountingService.js`, `createReceiptAllocation`).
2. A guided credit note linked to an invoice that is already fully paid.
   `receivableOutstandingForSettlement` subtracts the note with no floor, and guided credit
   notes are not capped at what is still open on the invoice.

Either way, a different invoice of the same order that has received nothing is reported as
settled. `markOrderOperationallyClosed` then lets the order close.

**Reproduced (on 9dac174, with a scratch database):**

- Case 1. Order with invoices A = 1,000 and B = 1,000, both posted. A receipt of 2,000 is named
  on A, so 1,000 goes to A automatically. The other 1,000 is put on A as an excess allocation.
  Result: outstanding A = -1,000, B = 1,000, and `payment_received.ready === true` with an empty
  detail. B has received nothing and still shows as open in the bill-wise receivables report.
- Case 2. Order with A = 1,000 and B = 590. A is paid in full (1,000). Then a guided credit note
  of 500 + 18% GST = 590 is linked to A. Result: A = -590, B = 590, and `ready === true`.
  B is unpaid. The 590 is a refund owed on A, not money received on B.

**Fix:** net only receivables that really are credit-note invoices (negative
`receivables.invoice_amount`, or `invoices.invoice_type = 'Credit Note'`) against the order's
positive invoices. Clamp each other invoice's figure at 0 before summing, so an overpayment or
an oversized note never offsets a different invoice. For example:

```js
const isCreditInvoice = (id) => Number(db.prepare("SELECT invoice_amount FROM receivables WHERE billing_id = ? AND COALESCE(is_deleted,0)=0").get(id)?.invoice_amount || 0) < 0;
const credit = outstanding.filter((r) => isCreditInvoice(r.invoice.id)).reduce((s, r) => s + r.amount, 0); // <= 0
const owed = outstanding.filter((r) => !isCreditInvoice(r.invoice.id)).reduce((s, r) => s + Math.max(r.amount, 0), 0);
const orderOutstanding = owed + credit;
```

Add both cases above as regression tests next to the existing `A2-CLOSE-TWO` case in
`scripts/audit/audit2-regressions.test.mjs`.

---

## C-2 (Low): Old figures stay on screen after a company switch or a failed reload

**Where:** `src/renderer/screens/ProfitSimulatorScreen.jsx:39-53` and `:147`.

The new 300 ms debounce is correct: the cleanup cancels the timer and drops late replies.
The problem is that `result` is never cleared when the inputs change, and the error screen
appears only when `loadError && !result`. So:

- If you switch from company A to company B and the B request fails (permission, report
  error), you get a toast, but the page keeps showing company A's baseline and scenario under
  company B's context.
- Even when the request succeeds, A's figures stay on screen for at least 300 ms plus the
  report time, with no sign that they are out of date.
- The same applies when you change a parameter: the scenario shown belongs to the previous
  inputs until the reply arrives.

**Fix:** keep the inputs the result was computed for (or a `pending` flag). When the company
changes, clear `result`. While a request is pending, or the last one failed, show the result
as out of date or hide it. For example, call `setResult(null)` in the effect when
`company_id` or `company_scope` changes, and render the error state whenever `loadError` is set.

A smaller point: HTML `min` and `max` do not stop typed values. Typing 5000 shows 5000 in the
box, while `simulateScenario` silently clamps it to 1000 (`profitSimulatorService.js:24`).
Clamp in `updateParam` too, so the box matches the figure used.

---

## C-3 (Low): `sessionGuarded` now writes an audit row on every account-mapping read and user listing

**Where:** `src/main/main.js:344` (the new `recordGrant` call in `sessionGuarded`), with
`AUDITED_GRANTS` at `:322`.

`account_mapping` and `settings` are in `AUDITED_GRANTS`. Every `sessionGuarded` channel
therefore now writes a hash-chained `permission_granted` audit row, including the read-only
ones: `account-mapping:registry`, `:classifications`, `:coverage`, `:review-queue` and
`auth:list-users`. Opening the account-mapping review panel writes 3 rows per load
(`AccountMappingReviewPanel.jsx:76-78`). Each opening of the Quick Create master dialog writes
one more (`QuickCreateMasterDialog.jsx:206`).

This does not break the go-live rollback guard: the rows use `table_name = 'system'`, which is
not a book table. It does flood the audit trail with reads recorded as grants, and it lengthens
chain verification.

**Fix:** record grants only for the write channels (`account-mapping:assign`,
`accounts:create-quick`, `auth:admin-reset-password`). For example, pass a flag to
`sessionGuarded`, or keep a separate set of channels to audit instead of a set of permissions.

---

## C-4 (Low): The Tally masters cap is checked only after every block is copied out

**Where:** `src/main/services/tallyImportService.js:510-516`.

`namedTallyBlocks(xmlText, "LEDGER")` and `tallyTagBlocks(xmlText, "STOCKITEM")` copy every
block body into memory before `mastersRead > MAX_TALLY_PREVIEW_MASTERS` is tested. The
STOCKITEM pass also repeats work that `parseTallyStockItemsXml` does again just below. The
refusal itself is correct: the error escapes the per-file catch through the
`TALLY_PREVIEW_TOO_LARGE` code, and the `finally` clears `previewDuplicateCache`. But a 50 MB
file of tiny ledgers is still fully copied out, twice for stock items, before it is refused.

**Fix:** pass the remaining budget as `tallyTagBlocks`' existing `limit` argument
(`MAX_TALLY_PREVIEW_MASTERS - mastersRead + 1`), and refuse when that limit is reached. Reuse
the STOCKITEM count from `parseTallyStockItemsXml` instead of a second scan.

---

## C-5 (Low): "Load more" during a pending typed search mixes two search terms

**Where:** `src/renderer/components/entityPicker/useEntitySearch.js:50-61`.

The new code (`:21-24`) makes a fresh search clear the pending debounce and set the box text.
That part is correct. But `debouncedSearch` updates `query` at once and runs the search only
150 ms later, while `loadMore` still reads `query` and `results.length`. Example:

- Results for "ab" are shown, with more available.
- You type "c" (query is now "abc", search pending) and click "Load more" within 150 ms.
- Page 2 of "abc" (offset 50) is appended to the "ab" results.

The debounced search then replaces the list, so the mix is brief. A pick made during that
moment can still be a row that does not match the box.

**Fix:** in `loadMore`, return early while `debounceTimer.current` is pending. Or remember the
term behind the current `results` (`lastTerm` ref) and page with that term.

---

## Checked and found correct

- **`receivableOutstandingForSettlement`**: matches `billWiseReceivableReport`'s corrected
  balance (`invoice_amount` less allocations, deductions, advance adjustments and posted guided
  credit notes). A receivable that is missing returns 0, and `computeOrderClosure` lists that
  invoice as unproved through `missing`. The existing tests (credit-note invoice, guided note,
  part-paid two-invoice order) pass.
- **`computeOrderClosure` without `outstandingFor`**: now throws. Both main-process callers pass
  `closureOptions` (`main.js:1405-1407`).
- **goLive rollback (`goLiveService.js:244-256`)**: refusing no-mark entries that have no
  `auditIdAtStart` is correct. The `auditIdAtStart` path now counts from the start of the run.
  The run's own audit rows (`operational_reset`, `permission_granted`) use
  `table_name = 'system'`, so they do not block a legitimate rollback.
- **xlsx expansion cap (`importParserService.js:335-339`)**: measured deflate ratios for
  realistic sheet XML (styled blank cells, zero numbers, repeated shared-string indexes, shared
  formulas). All stayed between 9x and 18x, far below the 200x limit, so real workbooks are
  not refused. Stored parts (method 0) have a ratio of 1. The `inlineRawChars` budget is
  additive and correct.
- **Duplicate-check cache (`importValidationService.js:63-116`)**: the cached keys come from
  the same SQLite `LOWER(TRIM(COALESCE()))` expression as the uncached query, and they are
  looked up with the same `normalizeDuplicateKey` value, so the matches are identical. The
  item key's `char(1)` and `\u0001` separators agree. `ORDER BY id` with first-wins gives the
  same row as the rowid-order `LIMIT 1`. The cache lives only for one synchronous preview,
  which writes nothing, and is cleared in `finally`.
- **`firstPayload`**: IPC structured-clone objects have `Object.prototype`, so real payloads
  still pass.
- **`accounting:drilldown`**: the key that is blanked is `voucher.audit`, which is what
  `drilldownData` returns.
- **Entity picker ARIA ids and click selection**: ids are unique per instance and match between
  the box and the list. `onMouseDown` with `preventDefault` plus `onClick` gives exactly one
  selection.
