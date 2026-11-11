# Correctness audit: f9241ed..372c89d

- Branch: `claude/erp-full-automation-qbhv8k`. Audited head `372c89d` (also covers dc40f03). Written 2026-11-11 05:40 IST.
- Scope: dc40f03 and 372c89d, which answer `audit-f9241ed-correctness.md` (T1 to T7). The posting changes are in `supplierReturnSplit` and `postStockReturn` (inventoryService.js) and in `createAutomaticGrnFromPurchaseVoucher` (init.js).
- Method:
  - Scratch clone `/tmp/claude-0/corr-372` at 372c89d.
  - I re-ran Q1 to Q8 (`probe-prev`), P1 to P11 (`probe-66b`) and S1 to S8 (`probe-f92`).
  - New probes U1 to U7 are in `scripts/audit/probe-372.test.mjs`. I also ran U1 to U7 at f9241ed and at 66b024f to tell regressions apart.
  - Profiling scripts are `scripts/audit/prof.mjs`, `prof2.mjs` and `plan.mjs`.
- Tests at 372c89d:
  - `npm run -s test:integrity`: pass (216 + 25, 0 fail).
  - Earlier probes: Q 8/8, P 11/11, S 8/8 run.
  - New probes: U 7/7 run.
- The container restarted during the audit. The 2000-lot timing run was lost and not repeated; the 2000 figure below is an estimate from the 1000 run and the profile.

## Summary

372c89d fixes T1, T2, T3 (mostly) and T4, with no regression in any earlier probe. The as-of rule (bill id below the return's voucher id, and no reversal or a reversal above it) is right. Two cases that were wrong before now balance: U1 (a return posted between a bill and its reversal) and U7 (vouchers from a second company interleaved).

The main new problem is not a regression, but it is the same kind of gap as T1: **a reversed supplier return drops out of the replay** (V1). Any return posted after it gets the wrong lots, and the supplier is over-debited.

| # | Severity | Regression? | Where | One line |
|---|---|---|---|---|
| V1 | **Medium** | No (same at f9241ed and 66b024f) | inventoryService.js:437 | The replay leaves out a reversed return (`posting_status = 'Posted'` only), so returns posted while it stood are replayed onto the lots it had taken. U5: TP over-debited **2000**, GRNI stuck **−1000**, PPV −1000. |
| V2 | Low-Medium | No | inventoryService.js:219, 399; accountingService.js:567 | Receipt booked after its bill (Cr Purchase, not GRNI), then the bill reversed: the lot counts as unbilled, so a return clears GRNI that was never credited. U2: GRNI **+1000**, Purchase −1000. |
| V3 | Low (performance) | No (older), now the main cost | inventoryService.js:432-438; schema (no index on `stock_ledger`) | `stock_ledger` has no index at all. The earlier-returns query does a scan for each earlier return: 63 of 91 ms per post at 1000. An index on `(source_module, source_id)` brings a post down from 97 ms to 22 ms. |
| V4 | Low | No (T6 left over, now reproduced) | inventoryService.js:441 | A return that posted no voucher (all-free lots) still replays with today's billing. U4: GRNI stuck **−500**, PPV +500 after a later bill reversal. |
| V5 | Info | No | inventoryService.js:385; accountingService.js:418-451 | Reversing a receipt (a plain inward, or a guided voucher's GRN) after part of it was billed and returned. S7: GRNI −1000 / TP +400. U6: GRNI +600 / TP −600. T7 is still open and the plain-inward case behaves the same way. |
| V6 | Info / design | No | procurement linkage | The goods are billed again on a new procurement after the old bill was reversed. Re-posting is blocked, and the inward stays linked to the old procurement, so the return clears GRNI while the new bill's 1000 stays owed (U3: TP −1000, Purchase +1000). |
| V7 | Info | New behaviour | inventoryService.js:486; init.js:1026 | Two side effects of the fixes. (a) A zero-value return now needs the PPV ledger, so with a mis-typed PPV ledger (Q6) it is refused where it used to post. (b) `landed_cost` above taxable on a guided purchase is now dropped from stock without a warning. |

## Prior findings (f9241ed round)

| # | Status | Evidence |
|---|---|---|
| T1 reversed bill drops out of the replay | **Fixed** | S1 ends at GRNI 0, TP 0, PPV 0. Return 2 posts GRNI Dr 2000 and PPV Cr 500. U1 also balances, where it was GRNI −500 at f9241ed. |
| T2 zero-value return consumes a priced lot, no voucher | **Fixed** | S2: return A (value 0) now posts GRNI Dr 500 / PPV Cr 500, and the end is 0/0/0. createBalancedVoucher accepts it, because it has a debit and a credit line and the Inventory line is left out. V4 is what is left. |
| T3 replay grows as returns × lots | **Mostly fixed** | S8 at N=1000: 48.6 s bulk (was 87 s) and 89 ms for the next post (was 209 ms). N=200: 1.6 s / 8 ms. N=2000 was not re-run (see the note at the top). The JS replay is now cheap, and the SQL in V3 is the remaining cost; the estimate for the next post at 2000 is about 250 to 350 ms. |
| T4 guided landed_cost above taxable leaves GRNI open | **Fixed** | S3: GRNI 0 after the voucher and after the return; the return posts TP Dr 1000. See V7(b) for the side effect. |
| T5 damaged units valued by whether a rate is typed | **Open** (owner decision) | S4 unchanged. Rate 100: TP 800, PPV 200. No rate: TP 1000. |
| T6 replay inputs missing | **Partly open** | Null-voucher returns are now rarer (T2), but still replay as "now" (V4, reproduced in U4). A null `sl_id` and the caller-supplied `posting_status` on create were not changed. |
| T7 guided voucher reversed after a partial return | **Open** | S7 unchanged: GRNI −1000, TP +400. Folded into V5. |
| R6 order return over receipts with no order | Open | P7 unchanged (GRNI −1000, TP +400). |
| R8 Party Reconciliation date bounds | Open | P6 unchanged (July only: Mismatch −426000). |
| R5 recon after a guided purchase | Open (older gap) | P5: Mismatch 1000. |
| R10 support-bundle string budget | Not re-checked | dc40f03 touched supportBundleService.js only for the security finding. |
| N2 bill-wise balance after a return | Unchanged | Q4: billBalance 1000. |

## Questions from the brief, answered

- **Reversal of a reversal.** It cannot happen: `reverseVoucher` refuses a `voucher_reversal` voucher (accountingService.js:463), and a second reversal of the same voucher is refused (466). So "the first reversal id" is the only reversal there can be.
- **Procurement reversed, then re-posted.** It cannot be re-posted. `assertNotAlreadyPosted` (accountingService.js:53-58) refuses `posting_status` 'Reversed' and any existing Posted or Reversed voucher (U3 shows the error). So a procurement has at most one bill voucher, and `MIN(v2.id)` is safe. Billing the goods again needs a new procurement, which the inward does not point to (V6).
- **Guided voucher reversed (T7).**
  - The reversal sets the GRN's `stock_inwards.posting_status` to 'Reversed' (accountingService.js:449-450), so the lot leaves the pool completely. `gv.reversal_id` is therefore never used in practice.
  - S5 (the return came from another lot) balances. S7 (the return came from the guided lot) does not; see V5.
- **Zero-value voucher with only GRNI and PPV lines.** createBalancedVoucher accepts it (S2: GRNI Dr 500 / PPV Cr 500), and the integrity suite still passes.
  - The only refusal path is a debit with no credit or a credit with no debit. That cannot happen here, because the variance always takes the other side when `retValue` rounds to 0.
- **Multi-company id interleaving.**
  - `vouchers` ids are global and AUTOINCREMENT. The procurement voucher lookup is filtered by company, and the reversal lookup is by global `source_id`.
  - S6 and U7 (company-2 inward vouchers between the bill, the return and the reversal) balance. U7 was GRNI −1000 / PPV +1000 at f9241ed and is fixed now.
- **SQL plan.** SQLite 3.53.1 flattens the two derived `billVoucher` tables. Every voucher lookup uses `idx_vouchers_source`. The lot query still does `SCAN sl` (the whole `stock_ledger`), and `goods_receipt_items` has no index on `stock_inward_id`.
  - With 5,100 unrelated ledger rows, a post with 50 lots and 50 earlier returns takes 16 to 18 ms. That is acceptable.

---

## V1 (Medium): a reversed supplier return drops out of the replay

- **Where:**
  - inventoryService.js:432-438 selects only `sr.posting_status = 'Posted'`.
  - `reverseStockReturn` sets the return to 'Reversed' and mirrors its voucher.
  - Returns posted while the reversed one stood were allocated around the lots it held. In the replay those lots are free, so the later returns move onto them.
- **Reproduction (U5):**

  | Step | What happens |
  |---|---|
  | 1 | L1: 10 @ 100, unbilled. |
  | 2 | L2: 10 @ 200, billed. |
  | 3 | Return A of 10 takes L1: GRNI Dr 1000. |
  | 4 | Return B of 10 takes L2: TP Dr 2000. |
  | 5 | A is reversed, so L1's 10 units are back in stock. |
  | 6 | Return C of 10. The replay puts B on L1 (unbilled goes first), so C takes L2: **TP Dr 2000 again**. |

  - End: TP **+2000** (the supplier is over-debited by the full bill), GRNI **−1000**, PPV −1000.
  - The result is the same at f9241ed and at 66b024f.
- **Fix:** replay events in stock-ledger order instead of only live returns.
  - Include reversed returns, each as of its own post.
  - At the reversal's own ledger row (`REV-RET`, the mirror row), give back exactly the lot units that return took in the replay. The replay is deterministic, so you can keep a `Map(returnId → [{lot, units}])` while replaying. No schema change is needed.
  - The same event approach covers V5: drop a lot at its inward's reversal row instead of leaving it out from the start.
  - The lasting fix is still a stored per-lot allocation (`stock_return_lots`), written at posting time.
  - Add U5 as a regression test. This changes posting, so it needs the owner's OK.

## V2 (Low-Medium): receipt booked after its bill, then the bill reversed

- **Where:**
  - postStockInward (inventoryService.js:219-231) credits **Purchase**, not GRNI, when the procurement is already Posted (`billedFirst`).
  - Reversing the bill (accountingService.js:567 onwards) does not move that receipt into GRNI.
  - `billedAt` (399) then counts the lot as unbilled, so a return debits GRNI.
- **Reproduction (U2):**
  - Post a bill for 1000 (Purchase Dr, TP Cr).
  - Post an inward of 10 @ 100 linked to it (Inventory Dr 1000, Purchase Cr 1000).
  - Reverse the bill. Purchase is now −1000 and TP is 0.
  - A return of 10 posts GRNI Dr 1000 / Inventory Cr 1000.
  - End: **GRNI +1000** debit that nothing clears, and Purchase −1000.
  - Same at f9241ed and at 66b024f.
- **Fix** (owner decision), one of these:
  - (a) When reversing a procurement, post Purchase Dr / GRNI Cr for the value of its billed-first receipts, so they become ordinary unbilled receipts. **Recommended.**
  - (b) Carry the receipt's credit account on the lot, and clear Purchase instead of GRNI for an unbilled lot that never went to GRNI.
  - (c) Refuse the bill reversal while billed-first receipts are in stock.

## V3 (Low, performance): `stock_ledger` has no index; the earlier-returns query dominates

- **Where:** inventoryService.js:432-438. The correlated subquery `SELECT MIN(sl.id) FROM stock_ledger sl WHERE sl.source_module = 'stock_returns' AND sl.source_id = sr.id` scans `stock_ledger` once for each earlier return (plan: `SCAN sr | CORRELATED SCALAR SUBQUERY | SEARCH sl`). `sqlite_master` lists no index on `stock_ledger`.
- **Measured (`prof.mjs`, N=1000 lots and returns):**

  | | Time |
  |---|---|
  | Earlier-returns query | 63 to 66 ms |
  | Whole post | 91 to 97 ms |
  | Earlier-returns query, after `CREATE INDEX ... ON stock_ledger (source_module, source_id)` | 0.9 ms |
  | Whole post, with that index | 22 ms |

  - The cost grows as (earlier returns) × (all ledger rows in the database), so it rises with unrelated volume too.
- **Fix:**
  - Add `CREATE INDEX IF NOT EXISTS idx_stock_ledger_source ON stock_ledger (source_module, source_id)` in the schema or migration.
  - Optionally index `stock_inwards (company_id, supplier_id, item_id)` and `goods_receipt_items (stock_inward_id)` for the lot query.
  - Posting results do not change.

## V4 (Low): a voucher-less return still replays with today's billing

- **Where:** inventoryService.js:441. A null `voucher_id` gives `voucherId: null`, and `take()` (line 408) turns that into `Infinity`, meaning "now".
- **Reproduction (U4):**
  - L1: 10 @ 100 in W1, billed.
  - F: 10 @ 0 in W2, free.
  - Return A: 5 from W2. It takes F at value 0, so there is no voucher.
  - The bill is reversed.
  - Return B: 10 from W1. The replay puts A on L1, which is now unbilled and goes first. B gets 5 from L1 and 5 from F: GRNI 500, PPV 500.
  - End: GRNI **−500**, PPV +500.
- **Fix:** stamp the return with the last voucher id at posting time. That means a new `stock_returns` column, set in the same transaction, which the replay uses when `voucher_id` is null. Or use the stored allocation from V1.

## V5 (Info): reversing a receipt after it was billed and partly returned

- **S7 (guided voucher, T7):** GRNI −1000, TP +400. Unchanged.
- **U6 (plain inward, linked to a posted bill):**
  - Bill 10 @ 100, then a return of 4 (TP Dr 400).
  - Unbilled L2: 10 units.
  - `reverseStockInward` on L1 is allowed. It mirrors the whole inward: Inventory Cr 1000, GRNI Dr 1000.
  - A return of 6 then clears GRNI 600.
  - End: GRNI **+600**, TP **−600**.
- **Root cause:**
  - Receipt reversal undoes the inward's own voucher only, and only at full quantity.
  - Line 385 also leaves out a reversed lot from every replayed return, not just from the ones after the reversal.
- **Fix** (owner decision):
  - Refuse a receipt or guided-voucher reversal while the receipt is billed (for plain inwards) or has posted supplier returns.
  - Or reverse only the unreturned part, and route a billed receipt's reversal to TP.

## V6 (Info / design): billing again after a bill reversal

- U3:
  - The reversed procurement cannot be posted again.
  - A second procurement, B2, for the same goods posts entirely to Purchase. Its `receivedValue` is 0, because the inward still points to the old procurement.
  - A return then clears GRNI. TP −1000 stays owed on B2 for goods that went back.
- This is consistent within today's model, but the user has no way to re-link the receipt.
- Consider letting a new procurement take over the receipts of a reversed one.

## V7 (Info): side effects of the fixes

- **(a) Zero-value returns now need the PPV ledger.** A zero-value return that clears GRNI or TP now creates a PPV line. With a PPV ledger of the wrong type (the Q6 setup), such a return is now refused with the "rename that ledger" error, where before it posted with no voucher. The message is clear; nothing else is needed.
- **(b) Landed cost on a guided purchase.** `receiptValue = voucherTaxable || landed_cost || ...` (init.js:1026). A guided purchase whose `landed_cost` is above taxable now quietly values the stock at taxable (S3: Inventory 1000, not 1200).
  - This is correct for GRNI.
  - The freight is dropped without a warning. The screen has no landed-cost field, so only API or automation payloads can reach this.
  - Consider refusing a `landed_cost` that differs from taxable, or booking the difference to a freight accrual.

## Owner decisions this report needs (all change posting)

- V1: the replay should include reversed returns and give their units back at the reversal, or store allocations. **Recommended.**
- V2: which treatment of billed-first receipts when their bill is reversed: (a), (b) or (c).
- V4: a stamp for voucher-less returns.
- V5 / T7: refuse, or partly reverse, a receipt that has been billed or returned.
- T5 and R6 are still waiting from earlier rounds.

V3 (the index) changes no posting and can go in without a decision.
