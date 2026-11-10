# Correctness audit: dc030e6..d661346

- Branch: `claude/erp-full-automation-qbhv8k`, head `d661346`
- Scope: `git diff dc030e6..d661346`, not counting the docs/audit archive copies
- Method: I read the code, then ran 8 throwaway probes (Q1 to Q8) against a scratch clone at `d661346`. I ran Q1 to Q4 and Q8 again with `src/` checked out at `dc030e6`, to tell new regressions apart from older behaviour. The probe file is `/tmp/claude-0/corr-d661346/scripts/audit/probe-corr.test.mjs`, with a copy at `/tmp/claude-0/probe-corr.mjs`. Run it with `node --test` from the clone root. `scripts/audit/audit2-regressions.test.mjs` passes 55/55 at `d661346`.
- Left out on purpose (the owner has not decided yet): profitability working posted expenses out again, and credit-note invoices counted in the expense base.
- Accepted limits I did not raise again (decision C2 and `docs/architecture/fsr-2a4-perpetual-inventory-policy.md`): returns are not linked to receipts; a bill posted after a return; backdated receipts; a bill clearing GRNI for its whole receipt.

## Summary

| # | Severity | New in this diff? | Area | One line |
|---|----------|-------------------|------|----------|
| N1 | **Medium** | Yes (regression) | inventoryService.js:378 | A return with no order now counts against a return on any order. When the no-order return used another order's receipt, the order's own GRNI is never cleared, and Trade Payables is debited for goods that were never billed. |
| N2 | **Medium** | Yes (made visible by the F5 fix) | reportBuilders.js:279-316, 424-433 | Supplier ledgers now show the return, but the bill-wise payables still do not. Party Reconciliation and Financial Control report a **Mismatch** after every billed supplier return. Bill-wise payables and payable ageing still show the full bill as due. |
| N3 | Low-Medium | Yes (regression) | inventoryService.js:363 | A billed receipt with no rate (stock value only in `landed_cost`) is now returned at **0** against Trade Payables. All of it goes to Purchase Price Variance. |
| N4 | Low | No (the dc030e6 fix does not cover it) | inventoryService.js:381-399 | Units from a free (zero-rate) receipt are taken again by every later return. Paid receipts after it are never cleared from GRNI. |
| N5 | Low | No (more visible now) | inventoryService.js:372-401 | A no-order return after an order return, at different rates, debits Trade Payables for unbilled goods. With the F5 link this now shows as a debit balance on that supplier's ledger. |
| N6 | **High** | No (since the baseline; outside the diff) | init.js:979-981 | The guided purchase voucher's automatic GRN divides the per-unit "Receipt Rate" by the quantity. Stock is valued at 1/qty of its cost, and GRNI is left in debit. |

Previous round (dc030e6) findings:

| dc030e6 # | Status at d661346 |
|---|---|
| F1 wrong-type PPV ledger stops startup | **Fixed.** `seedAccounts` passes `refuseWrongType: false` (init.js:802). An Expense match is preferred (init.js:814). Probe Q6: startup succeeds, the return throws the Chart of Accounts message and stays Draft. |
| F2 FIFO taken off by value | **Accepted limit**, documented (policy doc, "Known limits of the pool"). |
| F3 order return ignores no-order returns | **Fixed for the same-order case**, with a regression for the cross-order case (N1). |
| F4 bill clears the whole receipt | **Accepted limit**, documented. |
| F5 Trade Payables line has no supplier link | **Fixed** (inventoryService.js:451). The reversal copies the link, so the supplier ledger nets to 0 (Q5). See N2 for what this does to the reconciliation. |
| F6 value past all receipts uses up billed capacity later | **Still open, not documented.** The policy doc says only "Quantity past every receipt is valued at WAC". Low. |
| F7 case-insensitive reuse picks another ledger | **Partly addressed.** The wrong type no longer wins over an Expense ledger. `verify-fsr-2b1` now matches case-insensitively. Between two Expense ledgers with case variants, the older one (by id) still wins, so postings can move from the 605a873 system ledger to an older user ledger. Low. |
| F8 support bundle edges | **Fixed:** (1) the crash list is kept when it fits in 512 KB; (2) the screen context is written once, as `screenContextJson`, and is not passed to `getHealthDiagnostics`; (3) the bundle just written is never pruned. (4) Nested user fields are still kept, which is informational. |
| F9 posted document with blank approval set to Draft | **Still open** (init.js:761, 781). Unchanged. Low. |
| F10 startup audit row and go-live rollback | No change needed. None was made. |

Checked and found correct:
- **`guarded()` grant payload** (main.js:330-339): the grant row now uses the same `firstPayload(args)` that `enforcePermission` checked, so the audited company and the checked company can no longer differ. `sessionGuarded` uses `args.slice(0, 1)` for both its check and its grant, so it is consistent within itself too. The two wrappers choose the payload differently, but each one agrees with its own check.
- **Support bundle:**
  - `boundedScreenContext` returns text in every branch. A deep nesting is stored as one string, not expanded (test passes).
  - The sequence suffix sorts correctly against bundle names from the older format, because `-` (0x2d) sorts before `.` (0x2e).
  - Pruning excludes `fileName` and keeps 19 others plus the new one.
  - Nothing in `src/` still reads `context.screenContext`.
- **Billed lots at `si.rate`:** this is correct for a receipt whose rate is the supplier's own rate before tax. The freight-only `landed_cost` is no longer charged back (test passes). The GST that stays on the supplier ledger is documented as undecided. The exceptions are N3 and N6.
- **Removing the `expenseFormulaAmount` re-export** from billingService: no importer is left (`init.js` and `billingService.js` both import from `domain/expenseFormula.js`).
- **`update-audit-manifest.js`:** an empty or missing manifest is refused unless `--init` is given. With `--init` it resets to `[]`. Correct.
- **Does the supplier link double-count anything?** No. `partyLedgerReport` (and the supplier-ledger and party-reconciliation reports built on it) is the only code that sums `linked_party_type = 'supplier'` lines. `supplierPayableReport`, `billWisePayableReport` and the ageing reports work from procurements and allocations, not from voucher lines. The return is therefore counted once, in the ledger, and not at all in the bill-wise reports (N2).

---

## N1 (Medium, regression): a no-order return is counted against an order it never touched

- **Where:** `src/main/services/inventoryService.js:378`, the clause `(? IS NULL OR sr.order_id = ? OR sr.order_id IS NULL)`. Line 367 still limits the lots to the return's order.
- **Why:** a return with no order walks **all** of the supplier's lots for the item, oldest first, across every order. The `earlier()` value of that return is now taken off the oldest lots **of the order being returned**, whether or not the no-order return used them.
- **Failure (probe Q1):**
  - Steps: O1 receipt 10 @ 100 (07-01), O2 receipt 10 @ 100 (07-02), both unbilled. Return 10 with no order: it takes O1 and clears GRNI 1000, which is correct. Then return 10 on O2: `earlier(GRNI)` = 1000 (the no-order return), so all of O2's lot is skipped. GRNI takes 0, and the 10 units "past every receipt" go to **Trade Payables Dr 1000 at WAC, linked to supplier 1**.
  - Result at d661346: GRNI stuck at **−1000** (O2 is never cleared). Trade Payables shows a **1000 debit** that no bill backs, and the supplier ledger now shows it as owed to us.
  - At dc030e6 the same steps gave GRNI 0 and Trade Payables 0, which is correct. The order return ignored the no-order return and took O2.
- **Trade-off:** the dc030e6 fix (F3) repaired the case where both receipts sit on the same order, and broke this one. The comment at inventoryService.js:351-353 says the change "can leave value that is not used up, never the same units cleared twice". The unused value does not stay unused, though: it spills into Trade Payables at WAC.
- **Fix (in order of robustness):**
  1. Store per-lot rows, `stock_return_lots(return_id, stock_inward_id, pool, quantity, value)`, when a return posts. Subtract by lot. This also closes F6 and N4. It does not link a return to a single receipt in the user's view, so it is compatible with C2.
  2. Cheaper: for a return on order O, replay the earlier no-order returns in posting order over **all** of the supplier's lots for the item, by quantity. Count only the part that fell on O's lots.
  3. Simplest: refuse a supplier return with no order when any of that supplier's posted receipts of the item carry an order, and say "Choose the order". That removes the ambiguity. The manual's step 2 already asks for the order "if any".

## N2 (Medium): the supplier-ledger link makes Party Reconciliation report a mismatch after every billed return; bill-wise payables still show the full bill

- **Where:**
  - `src/main/database/reportBuilders.js:427` (`payableLedger` is summed from linked supplier lines, so it now includes the return).
  - `reportBuilders.js:429` (`payables` comes from `billWisePayableReport`, which takes off allocations, advances and **debit notes** only: lines 279-316).
  - The Financial Control row `party_recon` (reportBuilders.js, `financialControlReport`).
- **Failure (probe Q4):** bill 1000, receipt 10 @ 100, then return 4.
  - Party Reconciliation (payable): **difference −400, status Mismatch**. Financial Control "Party Reconciliation Mismatches" = 1 (Mismatch).
  - `billWisePayables` still shows `balance_due` 1000 for the bill. Payable ageing, `supplierPayableReport`, top outstanding suppliers, and the bill picked in supplier payment allocation all still show 1000.
  - At dc030e6 the reconciliation said Matched, with both sides unaware of the return.
- **Why it matters:**
  - The F5 fix is right: the supplier ledger now agrees with the Trade Payables control account.
  - But the manual (step 5) tells users not to post a Debit Note. The only thing that reduces a bill in the bill-wise reports is a Debit Note. So the return now creates a lasting control mismatch.
  - The bill-wise view still invites paying the full 1000.
- **Fix:** C2 keeps returns unlinked to bills, so treat the return value as an on-account supplier credit:
  - In `partyReconciliationReport`, add to the payables side the supplier-linked Trade Payables debits of posted `stock_returns` vouchers, net of reversals. A cleaner way is to list them as a "Returns not set against a bill" line, as unallocated payments are.
  - Show the same amount per supplier in the unallocated or advance views, so it can be set against the open bill.
  - Add a regression test: billed return, then party reconciliation Matched.

## N3 (Low-Medium, regression): a billed receipt with no rate is returned at zero

- **Where:** `inventoryService.js:363`, `sl.inward_quantity * COALESCE(si.rate, 0)` for billed lots.
- **Failure (probe Q3):**
  - Steps: billed receipt 10 units, `rate` 0, `landed_cost` 1000. Its stock value is 1000, because `postStockInward` uses `landed_cost` when it is set. The bill is 1000. Return 4, then 4.
  - Result: Trade Payables 0, **PPV Dr 800**. At dc030e6: Trade Payables Dr 800, PPV 0.
  - The supplier ledger keeps the full 1000 owed, and the loss is booked as a purchase variance.
- **Where such receipts come from:**
  - the stock-inward import template (`rate` and `landed_cost` are separate columns);
  - the demo and seed data style, where `landed_cost` is the total;
  - migrations that carry only a value.
- Because zero-rate lots are never skipped (line 388), these units are also taken again by every later return (N4).
- **Fix:** `CASE WHEN COALESCE(si.rate, 0) > 0 THEN sl.inward_quantity * si.rate ELSE sl.value END`. A real free receipt has `sl.value` = 0, so it stays at zero.

## N4 (Low, older behaviour; the dc030e6 change does not cover it): units from a free receipt are reused

- **Where:** `inventoryService.js:381-399`. Earlier returns are tracked by value, and a zero-rate lot carries no value, so returning its units leaves no trace.
- **Failure (probe Q2):**
  - Steps: F 5 @ 0 (07-01) and R 10 @ 100 (07-02), both unbilled. Return 5, 5, 5. Each return takes F's 5 units again at 0.
  - Result: GRNI stuck at **−1000** (R never cleared), PPV Dr 1000.
  - dc030e6 gives the same result, because `skip` is 0 there and the zero-rate guard is never reached.
- The policy doc's "A free (zero-price) receipt is taken at zero" is true, but it is taken every time.
- **Fix:** the per-lot rows from N1 fix 1. A stop-gap is to track earlier returns' **quantity** per pool as well as value: store `quantity` on the return's GRNI and Trade Payables lines, or derive it from the stock ledger, and skip zero-rate lots by quantity.

## N5 (Low, older behaviour, more visible now): an order return then a no-order return at different rates debits Trade Payables for unbilled goods

- **Failure (probe Q8):**
  - Steps: O1 10 @ 100 (07-01) and O2 10 @ 200 (07-02), both unbilled. Return 10 on O2: GRNI 2000. Return 10 with no order: the 2000 is skipped off the oldest lots (all of O1 plus 5 of O2), so only 5 units are found.
  - Result: the other 5 go "past every receipt" → **Trade Payables Dr 750**, and PPV ends −750.
  - The figures are the same at dc030e6, but the 750 now also shows on the supplier ledger as a debit balance for a supplier who never billed.
- This is in the F2 family (value-based skipping). It is not one of the two documented triggers (bill after return, backdated receipt).
- **Fix:** same as N1, fix 1 or 2. At least, list "lots with different rates across orders" among the documented pool limits.

## N6 (High, since the baseline and outside the diff; it feeds the new `si.rate` path): the automatic GRN from a guided purchase voucher divides the unit rate by the quantity

- **Where:** `src/main/database/init.js:979` `rate: Number(payload.rate || payload.purchase_rate || payload.purchase_value || 0) / (accepted || 1)`, and `:981` `landed_cost: Number(payload.landed_cost || payload.purchase_value || 0)`. The same expression is used for `goods_receipt_items.rate`. The code has been there since `ea754fc` (baseline).
- **What the screen sends:** BusinessVoucherScreen.jsx:563 labels `rate` "Receipt Rate" for purchases, a per-unit figure. The screen sends `taxable_value`, not `purchase_value`, so `landed_cost` is 0.
- **Failure (probe Q7):**
  - Steps: purchase voucher, qty 10, Receipt Rate 100, taxable 1000.
  - Result: `stock_inwards.rate` = **10** and `landed_cost` 0, so stock is valued at **100**, not 1000. The voucher debits GRNI 1000 and the GRN credits GRNI only 100, so **GRNI is left at +900 debit**.
  - Every later issue goes out at a WAC of 10.
  - A return of 4 then clears GRNI 40: the receipt has `procurement_id` NULL, so it is counted as unbilled, although the voucher is the bill. Trade Payables is not reduced.
- A side issue: `applyOrder` pre-fills `purchase_value` with the **order's** total of earlier purchases. If that value is left in the form, `landed_cost` becomes that unrelated total.
- **Fix:**
  - Use `rate: Number(payload.rate || payload.purchase_rate || 0) || Number(payload.taxable_value || payload.purchase_value || 0) / accepted`, so a unit rate is never divided.
  - Use `landed_cost: Number(payload.landed_cost || 0) || accepted * rate`.
  - Treat a guided-purchase receipt as billed in `supplierReturnSplit`: join `goods_receipts.guided_voucher_id`, or set a `billed_by_voucher_id` on the inward.
  - Add a regression test with a per-unit Receipt Rate.

## Lesser notes

- **ensurePPV at startup (Info):** the wrong-type refusal is silent at startup. It returns null and writes no health warning, so the user first learns of it when a return fails. The return stays Draft with `posting_error` NULL when it is called directly (Q6); the IPC posting queue may record the error. A health-check row such as "Purchase Price Variance ledger missing or wrong type" would surface it before the first return.
- **`si.rate` against the bill price (Info):** a return of billed goods debits Trade Payables at the receipt rate, not at the bill's rate. If the bill was negotiated below the receipt rate, returning every unit leaves the supplier ledger in debit by the difference. This is in line with "at the supplier's rate" in the policy doc, but worth one line there.
- **Support bundle size (Info):** `screenContextJson` is written as an escaped JSON string inside the pretty-printed bundle. A 1 MB context full of quotes can take up to about 2 MB on disk. That is still bounded at 20 bundles.
- **Clock moved back (Info):** the bundle just written is now always kept. While the clock is behind, the previous "just written" bundle is the next one pruned, because bundles with future-dated names outrank it. Harmless.
