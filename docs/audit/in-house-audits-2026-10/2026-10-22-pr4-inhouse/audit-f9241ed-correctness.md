# Correctness audit: f0a0f3c..f9241ed

- Branch: `claude/erp-full-automation-qbhv8k`. Audited head `f9241ed`. The branch is now at `dc40f03`, which only changes `main.js`, `supportBundleService.js`, tests and audit docs, so none of the posting code below is affected. Written 2026-11-11 05:10 IST.
- Scope: f9241ed, which answers `audit-66b024f-correctness.md` (R1 to R11).
- Method:
  - Scratch clone `/tmp/claude-0/corr-f9241ed`.
  - I re-ran the earlier probes there: P1 to P11 (`scripts/audit/probe-66b.test.mjs`) and Q1 to Q8 (`scripts/audit/probe-prev.test.mjs`).
  - New probes S1 to S8 are in `scripts/audit/probe-f92.test.mjs`.
  - To tell regressions apart, I also ran S1 to S3 at `66b024f` (`/tmp/claude-0/corr-66b024f`).
  - Run any of them with `node --test <file>` from the clone root.
- Tests at `f9241ed`:
  - `npm run -s test:integrity`: pass.
  - P1 to P11: 11/11 run.
  - Q1 to Q8: 8/8 run.

## Summary

The as-of replay fixes R1 and R2, and the receipt changes fix R3, R4, R5 and R7. Every earlier probe now balances, except the findings that were already open (R6 and R8). I found no regression. The new findings are edge cases that the fix does not cover.

| # | Severity | New? | Where | One line |
|---|---|---|---|---|
| T1 | Medium | No (same at 66b024f). The new code means to handle it but does not. | inventoryService.js:378, 388 | A reversed purchase bill counts as never billed in the replay. The `'Reversed'` branch of the bill-voucher lookup can never match, because the `procurements` join requires `posting_status = 'Posted'`. An earlier return then replays onto the wrong lot: GRNI is stuck at −1000 and PPV takes a fake 1000 loss. |
| T2 | Low-Medium | No (same at 66b024f) | inventoryService.js:478 (with the warehouse-blind pool at 375-390) | A supplier return worth zero at its own warehouse's average cost posts no voucher, but it still uses up a priced lot in another warehouse. A later return finds that lot gone: GRNI is stuck at −500, with a 500 PPV loss. |
| T3 | Low-Medium (performance) | New, from the replay | inventoryService.js:402-435 | Each post replays every earlier return and re-sorts every lot for each one. With 2000 lots and 2000 returns for one supplier and item, one post takes 0.66 s. Posting them one after another takes about 10 min (1000 of each: 87 s). |
| T4 | Low | New (the value now comes from `landed_cost`) | init.js:1024 | On a guided purchase with `landed_cost` above `taxable_value`, Inventory is debited with the landed cost but the voucher clears only the taxable value. GRNI is left with a credit of the difference (200 in S3) that nothing clears. |
| T5 | Low / design | New | init.js:1023-1024 | With damaged units, the receipt's value depends on whether a rate was typed. With rate 100: si.rate 100, and a full return of the 8 units clears Trade Payables 800 (PPV 200). Without a rate: si.rate 125, and the same return clears Trade Payables 1000. |
| T6 | Info | New, from the replay | inventoryService.js:405, 427-434 | A return with no `voucher_id`, or with no `stock_ledger` row, is replayed with today's bill status (no voucher), or with no lots at all (no ledger row, so `slId` is 0). |
| T7 | Info | No | accountingService.js:417-426 | Reversing a guided purchase voucher after part of its receipt was returned mirrors the whole receipt. S7: the supplier is over-debited by 400 (the return plus the full reversal). |

## Prior findings (66b024f round)

| # | Status | Evidence |
|---|---|---|
| R1 replay over later receipts and today's bill status | **Fixed** | P11 and P1 both end at GRNI 0, TP 0, PPV 0. |
| R2 replay order not posting order | **Fixed** | P10 balances to 0. |
| R3 Accounting Only creates a GRN | **Fixed** | P3: no stock inward. Purchase Dr 1000, TP Cr 1000. |
| R4 `purchase_value` used before `taxable_value` | **Fixed** | P4: landed_cost 1000, GRNI 0. |
| R5 a guided-purchase receipt counted as unbilled | **Fixed** for the return | P5 and Q7: the return posts TP Dr 400 and GRNI 0. Party Reconciliation still shows **Mismatch 1000** after a guided purchase. That is the older, separate gap: guided purchases are missing from bill-wise payables. |
| R6 order return over receipts with no order | **Open** | P7: TP Dr 400 at average cost, GRNI −1000. Awaits the owner's decision. |
| R7 GRN item rate divided by quantity | **Fixed** | P4 and P5: `goods_receipt_items.rate` is 100. |
| R8 Party Reconciliation compares a date-bounded ledger with unbounded payables | **Open** | P6: July only gives Mismatch −426000. |
| R9 knowledge-graph line numbers | **Fixed** | The graph now gives 453 and 1021. |
| R10 support-bundle string budget | **Open** (Low) | supportBundleService.js:49 still counts `length * 2`. Neither f9241ed nor dc40f03 changed it. |
| R11 `node_modules` symlink committed | **Fixed** | f0a0f3c removed it; `git ls-files node_modules` is empty. |
| N2 bill-wise balance after a return, and F9 | Unchanged | Q4: `billBalance` is still 1000. |

The policy doc limits accepted under C2 are not raised again.

---

## T1 (Medium): a reversed bill drops out of the as-of replay

- **Where:** `src/main/services/inventoryService.js`.
  - Line 378 looks up the bill voucher with `v.status IN ('Posted','Reversed')` and `v.source_id = p.id`.
  - Line 388 joins `procurements p` with `p.posting_status = 'Posted'`.
  - `reverseVoucher` sets `procurements.posting_status = 'Reversed'` (accountingService.js:532), so `p.id` is null and `bill_voucher_id` is null.
- **Why it goes wrong:** an earlier return posted while the bill was live is replayed as though the bill never existed.
- **Reproduction (S1):**

  | Step | What happens |
  |---|---|
  | 1 | Billed lot L1: 10 @ 200, bill posted. |
  | 2 | Unbilled lot L2: 10 @ 100. |
  | 3 | Return A of 10 takes L2 (unbilled lots go first): GRNI Dr 1000, PPV Dr 500. |
  | 4 | The bill is reversed. L1 is now unbilled. |
  | 5 | Return C of 10. The replay puts A on L1 (both lots now unbilled, so the oldest goes first). C takes L2: **GRNI Dr 1000** instead of 2000, PPV Dr 500. |

  - End result: GRNI is stuck at **−1000**, and PPV shows a **1000** loss.
  - I got the same result at 66b024f, so this is not a regression. The f9241ed code clearly meant to cover it (the `'Reversed'` branch), but that branch is dead.
- **Fix** (posting change, so it needs the owner's OK):
  - Join `procurements` with `posting_status IN ('Posted','Reversed')` for the `bill_voucher_id` lookup only. `billedNow` stays on `'Posted'`.
  - Also select the reversal voucher's id, from `vouchers` where `source_module = VOUCHER_REVERSAL_SOURCE AND source_id = <bill voucher id>`.
  - In `billed(lot)` as-of, the rule is then: `billVoucherId < asOf.voucherId && (!reversalId || reversalId > asOf.voucherId)`.
  - Apply the same reversal-id rule to the guided-voucher branch for consistency. Today that branch drops out because the inward itself is reversed (S5 balances).
  - Add S1 as a regression test.

## T2 (Low-Medium): a zero-value return consumes a priced lot but posts nothing

- **Where:**
  - inventoryService.js:478: `roundMoney(retValue) > 0 ? createBalancedVoucher(...) : null`.
  - The lot query (375-390) pools every warehouse.
- **Reproduction (S2):**
  - Lot L1: 10 @ 100 in W1, unbilled.
  - Lot F: 10 @ 0 in W2 (free).
  - Return A: 5 from W2. W2's average cost is 0, so A posts no voucher. The split still assigns A to L1, because priced lots go before free ones.
  - Return B: 10 from W1. The replay takes 5 units of L1 for A, so B gets 5 from L1 (GRNI 500) and 5 from F (0), with PPV Dr 500.
  - Net: GRNI **−500** stuck, PPV **500** loss.
  - Same at 66b024f.
- **Fix:** do one of these:
  - For supplier returns, post the voucher whenever any split portion is non-zero. It balances: Dr GRNI 500, Cr PPV 500.
  - Or skip returns with a null `voucher_id` in the replay.

  The first is the correct accounting. Either way it is a posting change, so it needs the owner's decision. Whether the pool should be per warehouse is a design question for the owner, not a bug in itself: with priced stock the warehouse-blind pool nets out correctly.

## T3 (Low-Medium, performance): the replay grows as returns times lots

- **Where:** inventoryService.js:402-435.
  - `take()` maps, filters and sorts all lots on every call.
  - It is called once for each earlier return, on every post.
- **Measured (S8):** one supplier and one item, N lots of 2 units and N returns of 1 unit.

  | N | Time to post the N returns one by one | One more post |
  |---|---|---|
  | 200 | 2.2 s | 10 ms |
  | 1000 | 87 s | 209 ms |
  | 2000 | 601 s | 658 ms |

- **Impact:**
  - At normal volume this is acceptable.
  - A bulk import or re-post of a long history for one supplier and item (for example a consumable) gets slow, roughly as the cube of N in total.
  - The work runs inside the posting transaction, on the main process, so it blocks the UI.
- **Fix:**
  - Cheap fixes: sort once for each distinct `(asOf bill status)` and pre-filter by `slId` with a moving pointer. Or skip lots whose `left` is 0 before sorting.
  - Proper fix: the stored per-lot allocation (`stock_return_lots`) proposed in R1. That makes each post O(lots).
  - Neither changes the posting result.

## T4 (Low): a guided purchase with landed_cost above taxable leaves GRNI open

- **Where:** init.js:1024, `receiptValue = landed_cost || voucherTaxable || ...`. The voucher (init.js:1165) debits GRNI with the taxable value only.
- **Reproduction (S3):** quantity 10, rate 100, taxable 1000, landed_cost 1200.
  - Inventory Dr 1200, GRNI Cr 1200 against the voucher's GRNI Dr 1000. GRNI stays at **−200**.
  - A return of all 10 then posts TP Dr 1000 and PPV Dr 200. GRNI stays at −200 permanently.
  - At 66b024f the return cleared it, by debiting GRNI 1200 (wrongly treated as unbilled).
- **Exposure:** the guided voucher screen has no landed-cost field, so only API or automation payloads can reach this.
- **Fix:**
  - Use `voucherTaxable` as the receipt value whenever the voucher posts to GRNI.
  - Or book the extra (freight) to its own accrual line on the voucher.
  - Or reject `landed_cost` that differs from taxable.

## T5 (Low, design): damaged units valued differently depending on whether a rate is entered

- **Where:** init.js:1023-1024.
- **Reproduction (S4):** quantity 10, damaged 2, taxable 1000.
  - **Rate 100:** stock 8 units at value 1000, si.rate 100. A return of 8 posts TP Dr 800 and PPV Dr 200.
  - **No rate:** si.rate 125. The same return posts TP Dr 1000.
- **Question for the owner:** is the cost of damaged units part of the good units' cost (use 125, and always use `voucherTaxable / accepted` as the supplier rate)? Or is it a claim on the supplier (value the stock at 800, and put the damaged 200 in a claim or receivable line)? The two input paths should agree.

## T6 (Info): replay inputs that are missing

- A posted return with a null `voucher_id` (a zero-value return) replays with `billed = billVoucherId !== null`, which is today's status including later bills (inventoryService.js:403). S2's variant shows this can happen to give the right answer, but it is not as-of.
- A posted return with no `stock_ledger` row gets `sl_id` NULL. It sorts first and gets `slId` 0, so no lots are usable and it consumes nothing: a later return would reuse its units.
  - The normal post path always writes a ledger row.
  - However, `normalizePayloadForTable` (crudHelpers.js:114) keeps a caller-supplied `posting_status`, so a create or import with `posting_status: 'Posted'` makes such a row.
  - Fix: force `posting_status` to Draft on create for stock tables, and make the replay skip or flag returns with a null `sl_id`.
- Returns already posted under the R1 or R2 bug are not re-posted. The replay now assumes they took what they should have taken, so old wrong balances stay as they are. If production data exists, the owner needs a one-time GRNI/TP review.

## T7 (Info, older): reversing a guided purchase after part of its receipt was returned

- **Reproduction (S7):**
  - Guided purchase 10 @ 100, then a return of 4 (TP Dr 400).
  - A new unbilled lot of 10, then the guided voucher is reversed.
- **Result:**
  - The whole 10-unit inward is mirrored, so 4 units are taken from the other lot.
  - The supplier ends at TP **+400** debit, because the 400 return and the full 1000 reversal both stand.
- Same class as a bill reversed after a return. Consider blocking the reversal when the receipt has posted supplier returns, or reversing only the unreturned part.

## Other changes checked

- **`createAutomaticGrnFromPurchaseVoucher`:**
  - The `inventory_enabled` guard matches the voucher's account choice (init.js:1169) for `false` and `"0"`.
  - Numeric `0` posts to GRNI in both places, so the two agree.
- **`assertInstallerInsideUpdateFolder` (main.js):**
  - Uses realpath on both sides, requires the installer to be a direct child, and requires `isFile`. Correct.
  - A missing update folder throws an ENOENT from `realpathSync`, not the friendly message. Cosmetic.
- **`supportBundleService` (WeakSet):**
  - A shared object that is not cyclic is now written as `"(repeated)"` the second time. This loses detail but is safe.
  - dc40f03 moved the prototype check ahead of the visited set. Fine.
  - R10 is still open.
- **Cross-company voucher ids:**
  - `vouchers` and `stock_ledger` are AUTOINCREMENT, so ids are never reused. Comparisons are within one company, but are global, so they stay monotonic.
  - S6 balances.

## Owner decisions this report needs

Each of these changes posting:
- T1: the as-of rule for reversed bills.
- T2: post the voucher for a zero-value return, or skip it in the replay; and whether the pool should be per warehouse.
- T4: which value a guided receipt carries when landed cost differs.
- T5: how damaged units are treated.

T3 and T6 are corrections with no effect on posting.
