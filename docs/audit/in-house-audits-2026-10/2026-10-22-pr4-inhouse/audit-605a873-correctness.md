# Correctness audit: 9dac174..605a873

- Branch: claude/erp-full-automation-qbhv8k, head 605a873
- Scope: `git diff 9dac174..605a873`, excluding the docs/audit archive copies
- Method: read the code, then ran probes against a scratch clone at 605a873 (`/tmp/claude-0/audit605/repo`). `scripts/audit/audit2-regressions.test.mjs` passes there (45/45).
- Date: 10 Nov 2026

## Summary

| # | Severity | Area | Finding |
|---|----------|------|---------|
| 1 | High | inventoryService.js:375-378 | The GRNI rate comes from every unbilled receipt ever made, but earlier returns are taken off by value only. Once receipt prices differ, part of a supplier return goes to Purchase Price Variance when it should clear GRNI, and that GRNI stays open even though the stock is gone. |
| 2 | Medium | inventoryService.js:366-378 | A return made while a receipt was unbilled still reduces the GRNI pool after the receipt is billed. Later returns against new unbilled receipts go to Trade Payables instead. This existed before the change; the new code now also turns it into a wrong quantity. |
| 3 | Medium | billingService.js:218-221 (with init.js:1539-1544) | Order profitability recalculates every posted expense from the formula and ignores the amount actually posted (`expense_amount`). Manual amounts, expenses posted before this change, and invoices added later all make profitability disagree with the ledger. |
| 4 | Medium | billingService.js:195-206 | A posted invoice row of type `Credit Note` is added to both the taxable and the gross base instead of being subtracted. This inflates "% of gross" and "% of taxable" expenses, both in what gets posted and in what profitability shows. |
| 5 | Low | inventoryService.js:381-385 | Returns to the billed pool never use it up. Returning more than the supplier billed takes Trade Payables off again at the billed price each time. |
| 6 | Low | useEntitySearch.js:21-23 | A direct `search()` clears the debounce timer but leaves the ref set, so the new `loadMore` guard blocks paging until the user types again. |
| 7 | Low | update-audit-manifest.js:26 | If manifest.json is missing or unreadable, the "no edits to old reports" check passes every file, edited ones included. |
| 8 | Low | init.js ensurePurchasePriceVarianceAccount | The name lookup is exact (case and spacing must match), so a user's "Purchase price variance" ledger is not reused and a second ledger is created. |

The following checked out clean:
- Every voucher balances: Inventory is credited `roundMoney(retValue)`, and the variance is worked out as the paise remainder.
- Reversing a return mirrors every line, the Purchase Price Variance line included. The probe brought all four balances back to zero, and a fresh return afterwards was priced the same way.
- The account is seeded and mapped correctly on new databases, for new companies, and on old databases. `seed()` runs on every start after the FSR-2B.1 migration, so the registry tables exist and the account goes under PURCHASES. A code that is already taken is skipped.
- Order-closure netting.
- The Tally `take` budget.
- The xlsx consumed-bytes ratio: `engine.bytesWritten` leaves out trailing padding.
- The inline entity budget.
- The Profit Simulator clamp: it uses the same limits as `simulateScenario`, and the reset effect is in place.

Details follow.

---

## 1. High: GRNI rate drifts once receipts have different prices

**Where:** `src/main/services/inventoryService.js:374-378`

```js
const unbilledRate = unbilledQuantity > 0 ? Number(unbilled.value || 0) / unbilledQuantity : 0;   // all-time unbilled receipts
const openUnbilledValue = Math.max(0, Number(unbilled?.value || 0) - alreadyReturned);           // earlier returns, by value
const openUnbilledQuantity = unbilledRate > 0 ? openUnbilledValue / unbilledRate : 0;            // value / all-time rate
```

The rate is the average of every unbilled receipt ever made. The open quantity is then the open value divided by that rate. Earlier returns came out at the rate that applied when they were posted, so as soon as a later receipt arrives at a different price, the quantity and value worked out here no longer match what is actually left.

**Reproduced** (`probe3.mjs`). One supplier, one item, nothing billed, no other stock:
1. Receive 10 units at 100. Return 5. GRNI is debited 500. This is correct.
2. Receive 10 units at 200. Return all 15 units still in stock, which are worth 5 × 100 + 10 × 200 = 2,500.
3. Posted: Dr GRNI 2,250, Dr Purchase Price Variance 250, Cr Inventory 2,500.

Expected: Dr GRNI 2,500, Cr Inventory 2,500, and no variance. Every unit went back to the one supplier at its own receipt price. After the probe, stock is 0 units with value 0, yet GRNI still shows a 250 liability and the P&L shows a 250 expense that never happened. The rate used was 150 (3,000 ÷ 20); the real average of what was left was 166.67 (2,500 ÷ 15).

Only GRNI is affected; the Trade Payables side does not use this calculation. It only takes ordinary use to hit this: receipts at changing prices with a return in between.

**Fix:** keep track of quantity as well as value. Either store the GRNI quantity on each return when it posts (a `grni_quantity` column), or recover it from the return's GRNI debit divided by the rate that applied then. Then:

```
openQty  = unbilledQty  − Σ earlier GRNI quantity
openVal  = unbilledVal  − Σ earlier GRNI value
rate     = openQty > 0 ? openVal / openQty : 0
grniQty  = min(quantity, openQty)
grni     = grniQty === openQty ? openVal : round(grniQty × rate)   // the last unit clears the remainder
```

The last-unit rule also clears the leftover paise. With 3 units worth 100 returned one at a time, GRNI keeps 0.01 open for good, because each return clears 33.33 (seen in `probe1.mjs`, scenario C).

## 2. Medium: GRNI taken by earlier returns is still subtracted after those receipts are billed

**Where:** `src/main/services/inventoryService.js:366-374`

`alreadyReturned` adds up the GRNI debits of every earlier posted return for this supplier, item and order. That includes returns made against receipts that have been billed since. `unbilled` counts only receipts that are still unbilled, so the subtraction takes the earlier GRNI off a pool those receipts are no longer in.

**Reproduced** (`probe1.mjs`, scenario A):
1. Receive R1, 10 units at 100, unbilled. Return 4. GRNI is debited 400.
2. Link R1 to a bill and post the bill.
3. Receive R2, 10 units at 100, unbilled. Return 8.
4. Posted: GRNI 600 and Trade Payables 200. Expected: GRNI 800 and Trade Payables 0, since all of R2 is unbilled.

The 200 debit to Trade Payables is for goods this supplier has not billed. This was already wrong before the change, in value terms; the new code now also uses it as a quantity (`openUnbilledQuantity`), so it decides which units go where.

**Fix:** count only earlier returns whose GRNI share is still against receipts in the unbilled pool. The simplest version: when the bill posts, clear GRNI for the receipt value less the GRNI already returned against those receipts, and stop subtracting those returns from the pool. A smaller fix: limit `alreadyReturned` to returns dated after the latest bill that covered this supplier's receipts of the item.

## 3. Medium: profitability ignores the expense amount actually posted

**Where:** `src/main/services/billingService.js:218-221`. The comment in `src/main/database/init.js:1537-1544` says both use the same formula.

`postExpenseEntry` posts `expense_amount || formula` and writes that amount back to `expense_entries.expense_amount`. `calculateProfitability` lists only posted expenses, but it calls `expenseFormulaAmount`, which never reads `expense_amount`. The two figures stop agreeing whenever:
- The user entered an amount by hand. Probe (`probe4.mjs`): a 5% of gross expense posted with `expense_amount` 100 shows in profitability as 590 while the ledger has 100. The order's total was 1,180 in profitability against 690 in the ledger.
- The expense was posted before this change, under the old formula. All of these now show in profitability at 5% of gross instead of the amount posted, which was 5% of taxable. The gap is the percentage times GST on every historical order.
- An invoice was posted after the expense. Profitability rises; the accrual already posted does not.

The new regression test checks only the case where the two match.

**Fix:** for posted entries, use `Number(expense.expense_amount)` in `calculateProfitability`, and fall back to the formula only when it is 0. `postExpenseEntry` keeps computing the formula itself before posting, as it does now. If the owner wants historical rows shown under the new formula, that needs an explicit re-accrual. Do not let the report quietly drift from the books.

## 4. Medium: credit-note invoice rows inflate the expense base

**Where:** `src/main/services/billingService.js:195-206`

`postSalesVoucher` books `invoice_type = 'Credit Note'` with positive amounts and treats it as a reduction (accountingService.js:596-619). `calculateProfitability` adds every posted invoice row regardless of type.

**Reproduced** (`probe4.mjs`): an invoice of 10,000 at 18% plus a posted credit-note invoice of 2,000 at 18% on the same order gives `billingValue` 12,000 and `invoiceGrossValue` 14,160. A 5% of gross expense then comes to 708. The owner's rule, based on what was actually invoiced, gives 472, which is 5% of 9,440. `postExpenseEntry` posts the inflated figure. Gross margin and `outstanding` are inflated in the same way.

The taxable side was already wrong before this change. The new gross base copies the error rather than introducing it.

Guided credit notes (`createBusinessVoucher` with kind credit_note) are not invoice rows on the order, so neither base picks them up.

**Fix:** in both reduces, use a sign of −1 for `invoice_type = 'Credit Note'`. Also decide, and write down, whether guided credit notes linked to an order's invoice should reduce the base as well.

## 5. Low: returns never use up the billed pool

**Where:** `src/main/services/inventoryService.js:380-385`

`payablesPortion = restQuantity × billedRate`. Nothing caps it by what was billed less what earlier returns already took off Trade Payables.

**Reproduced** (`probe1.mjs`, scenario E): the supplier billed 2 units at 200, and other stock of the same item is in the warehouse. Return 2 units: Trade Payables is debited 400, which is correct. Return 2 more: Trade Payables is debited another 400. The supplier now shows us 400 in credit for goods it never billed. Before the change this was the same wrong entry, valued at average cost instead.

**Fix:** keep the billed quantity and value open after earlier returns' Trade Payables debits, and send any quantity beyond that to the old fallback at average cost with a warning. Better still, refuse a supplier return larger than what was received from that supplier.

## 6. Low: `loadMore` stays blocked after a direct search

**Where:** `src/renderer/components/entityPicker/useEntitySearch.js:21-23` and `:61`

`search()` with `append = false` calls `clearTimeout(debounceTimer.current)` but does not set the ref to `null`. The new guard `if (... || debounceTimer.current) return;` then blocks paging for good.

**Scenario:** type in a picker, then close and reopen it within 150 ms. `handleOpen` runs `search("")` and cancels the pending typed search, but the ref keeps the old timer id. Scrolling to the end of the 50 results never loads more until the user types again.

**Fix:** add `debounceTimer.current = null;` after the `clearTimeout` in `search()`, and do the same in the unmount cleanup.

## 7. Low: the manifest check passes everything when manifest.json is missing or corrupt

**Where:** `scripts/update-audit-manifest.js:26`

`catch { previous = []; }` treats a missing or unreadable manifest as an empty one. Delete or corrupt `manifest.json`, edit an old report, run the script, and every file is recorded with its new checksum. The guarantee in the comment ("can only add new reports, never bless an edit") fails at exactly the point it is needed.

**Fix:** if the file exists and cannot be parsed, refuse. If it does not exist, refuse unless an explicit `--initialise` flag is passed. A check against `git show HEAD:<manifest>` would be stronger still.

## 8. Low: the account lookup is exact

**Where:** `src/main/database/init.js`, `ensurePurchasePriceVarianceAccount`, first query

The lookup is `account_name = ?`, so a ledger the user created as "Purchase price variance" is not found, and a second "Purchase Price Variance" ledger is created at 5065 or the next free code. Nothing breaks, but the books end up with two ledgers for the same thing. `accountId` is exact as well, so the two do not conflict.

**Fix:** match with `LOWER(TRIM(account_name)) = LOWER(?)`, or leave it as it is and note it in the release note.

---

## Checked with no finding

- **Voucher balance and rounding** (inventoryService.js:386-436): debits are `grni + payables + round(retValue − grni − payables)`, all to two decimals, against a credit of `roundMoney(retValue)`, so they always agree to the paisa. Neither portion can be negative. The variance goes to the debit or credit side depending on its sign. No voucher is created when `retValue` rounds to 0.
- **Zero-quantity and zero-price receipts:** `postStockInward` refuses quantity ≤ 0. A rate-0 receipt is valued at the average (probe: 5 units at 0 went in at 150 each), so an unbilled pool never has value with no quantity. With no unbilled receipts the split is GRNI 0, and Trade Payables is taken at the billed price or, if there is none, the average.
- **Reversal:** `reverseStockDocument` reverses the voucher through `reverseVoucher`, which mirrors every line, the Purchase Price Variance line included. A reversed return's voucher is marked `Reversed`, so `alreadyReturned` leaves it out. Probe D: after reversal all four balances matched the pre-return figures, and a new return posted the same way again.
- **Seeding and mapping:** `initializeDatabase` runs migrate (FSR-2B.1 creates the registry and the PURCHASES group, account_type Expense), then `seed`, which calls `seedAccounts` and then `ensurePurchasePriceVarianceAccount` for every company on every start. That covers old databases. `crudHelpers.js:453` does the same for new companies. Codes are checked against deleted rows too. An existing assignment is never replaced.
- **Expense formula:** `expenseFormulaAmount` uses gross for `percentage_gross` and `billing_value` for `percentage_taxable`. `invoiceGrossValue` uses the invoice lines' `gross_value`, which is taxable plus GST rounded to the paisa, and falls back to `billing_value × (1 + gst_rate)` only for invoices without lines. `postExpenseEntry` passes the same two bases. browserFallbackApi.js matches. Findings 3 and 4 are about what the formula is fed, not the formula itself.
- **Order closure** (orderClosureService.js:25-33): only an invoice whose receivable `invoice_amount` adds up to below zero, which is a credit-note invoice, keeps a negative outstanding. Any other negative is counted as 0. There is one receivable row per invoice (`ON CONFLICT(company_id, billing_id)`). An invoice with no receivable is still listed as unsettled.
- **Tally `take`** (tallyImportService.js:511-538): the limit passed is `MAX − read + 1`, and the budget is checked after every kind of master, so reading stops one block past the cap. When the count is exactly at the cap the limit is 1, which correctly throws on the next block. Masters are counted before duplicates are removed, which errs on the safe side. The removal of duplicates gives the same result as `uniqueNamedTallyBlocks`. In `previewTallyStockXml` the count happens before parsing.
- **xlsx consumed bytes** (importParserService.js:329-349): with `inflateRawSync(..., { info: true })`, `engine.bytesWritten` counts only the input zlib actually used, so padding after the end of the stream is left out (the regression test confirms this). Stored parts (method 0) keep a ratio of 1.
- **Inline entity budget:** cells without `&` can only be as large as the 64 MB part limit and cost little to decode. Cells containing entities share a budget of 16 M stored characters.
- **Profit Simulator:** the limits match `simulateScenario`: ‑100 to 1,000 for the adjustments, 0 to 100 for the incentive and GST. The result is cleared when the company changes and when a load fails, and the `current` flag stops a stale response from overwriting a newer one.

## Probes

All probes are in `/tmp/claude-0/audit605/probe/` and copied to the session scratchpad. They import `src/main/database/init.js` from the scratch clone and run against a temporary database.
- `probe1.mjs`: scenarios A (stale pool after billing), C (rounding), D (reversal) and E (over-return to the billed pool)
- `probe3.mjs`: finding 1 (rate drift)
- `probe4.mjs`: findings 3 and 4 (manual amount, credit-note invoice)
