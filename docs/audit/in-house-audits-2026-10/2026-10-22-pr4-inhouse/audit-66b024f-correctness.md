# Correctness audit: d661346..66b024f

- Branch: `claude/erp-full-automation-qbhv8k`, head `66b024f`. Written 2026-11-11 01:30 IST.
- Scope: this thread's commits 7b23f17 and 421b2bc. PR #5 (c7f79c8) and PR #6 (3c2cd8b) were reviewed only where they touch our code.
- Method:
  - I read the diff, then ran probes P1 to P11 in a scratch clone at `66b024f` (`/tmp/claude-0/corr-66b024f`, file `scripts/audit/probe-66b.test.mjs`, copy at `/tmp/claude-0/probe-66b.test.mjs`).
  - I also ran the previous round's probes Q1 to Q8 again (`scripts/audit/probe-prev.test.mjs`).
  - To tell regressions from older behaviour, I ran the same probes with `src/` at `d661346`.
  - Run any of them with `node --test <file>` from the clone root.
- Tests at `66b024f`:
  - `npm run -s test:integrity`: pass.
  - `scripts/audit/audit2-regressions.test.mjs`: 60/60.
  - `posting-regressions.test.mjs`: 6/6.
- Not raised again: the limits accepted under decision C2 and the policy doc (bill posted after a return, backdated receipts, a bill clearing GRNI for its whole receipt), plus the items the owner has not decided yet.

## Summary

| # | Severity | New? | Where | One line |
|---|----------|------|-------|----------|
| R1 | **High** | **Regression** (correct at d661346) | inventoryService.js:375-408 | Earlier returns are replayed over receipts that did not exist yet, and with today's bill status. Ordinary flow: billed receipt, return, then a new unbilled receipt, then a return. Trade Payables is debited twice, GRNI is never cleared, and a fake PPV gain is booked. |
| R2 | **Medium** | Partly a regression | inventoryService.js:407 | Replay order is `return_date, id`, not posting order. A back-dated return, or a draft created earlier but posted later, puts the replay out of step with what was posted. Same harm as R1. |
| R3 | **High** | No (older bug, now 10x larger) | accountingService.js:367, init.js:1011 | A guided purchase voucher set to "Accounting Only" still creates the automatic GRN. Purchase expense **and** Inventory are both debited, and GRNI is left with a credit. |
| R4 | **High** | No (left open from N6) | init.js:1045, 1048 vs 1160; BusinessVoucherScreen.jsx:220 | The auto-GRN takes `purchase_value` before `taxable_value`, while the voucher takes `taxable_value` first. Picking an order fills `purchase_value` with the order's earlier purchases, so stock is valued at that total. |
| R5 | Medium | No (N6 third point still open) | inventoryService.js:375-380 | A receipt from a guided purchase voucher counts as unbilled, although the voucher is the bill. Its return clears GRNI (leaving GRNI in debit) and never reduces the supplier's payable. |
| R6 | Low-Medium | No | inventoryService.js:393 | A return that names an order, when the receipts carry no order, finds no receipts. It debits Trade Payables at WAC for goods that were never billed. |
| R7 | Low | No (older, made worse) | init.js:1066, 1068 | `goods_receipt_items.rate` still divides the per-unit rate by the quantity, and its `landed_cost` has no `taxable_value` fallback. The GRN record disagrees with the stock receipt. |
| R8 | Low | No (older) | reportBuilders.js:426-438 | Party Reconciliation compares a ledger bounded by dates with bill-wise payables that are not. Any date filter gives a Mismatch. The new return credit is date-bounded too, so a return reversed in a later period moves between filters. |
| R9 | Low | New | voucher-accounting-graph.json:1092, 1119 | KG-4 `reversalRules` line numbers were not refreshed. `reverseVoucher` is at 453, not 316, and `reverseAdvanceAdjustment` is at 1021, not 712. |
| R10 | Low / Info | New | supportBundleService.js:47 | The string budget counts 2 bytes per UTF-16 unit, but JSON can take 6 bytes per control character. A crash list full of control characters goes past 1 MB, and the **whole** screen context is dropped. |
| R11 | **High (process)** | **New, in 7b23f17** | repo root `node_modules` | 7b23f17 committed a `node_modules` **symlink** to `/home/claude/gii-gem-erp/node_modules`. It is still in 66b024f. In the main checkout it now points at itself, so module loading fails there and in every clone. |

## Prior findings (d661346 round)

| # | Status at 66b024f | Evidence |
|---|---|---|
| N1 no-order return counted against another order | **Fixed** | Q1: GRNI 0, TP 0. |
| N2 reconciliation mismatch after a billed return | **Partly fixed** | Q4: Party Reconciliation and Financial Control now say Matched. Bill-wise payables, payable ageing, supplierPayableReport and the bill offered in supplier-payment allocation still show `balance_due` 1000 after the return. The on-account credit is not shown next to the bill anywhere (the "unallocated" view part of the fix was not done). |
| N3 billed receipt with no rate returned at zero | **Fixed** | Q3: TP Dr 800, PPV 0. |
| N4 free-receipt units reused | **Fixed** | Q2: GRNI 0. |
| N5 order return then no-order return at different rates | **Fixed** | Q8: all 0. |
| N6 guided purchase auto-GRN divides the unit rate | **Partly fixed** | Rate and stock value are right (Q7: rate 100, landed_cost 1000, GRNI 0 after the voucher). Still open: the receipt counts as unbilled (R5), `purchase_value` wins over `taxable_value` (R4), and the GRN item rate is still divided (R7). |
| F6 value past all receipts uses billed capacity | **Fixed in effect**: the replay is by quantity, and units past every receipt use up no receipt. | |
| F7 case-variant PPV ledger reuse | Unchanged, Low. | |
| F9 posted document with blank approval set to Draft | **Still open** (init.js:811, 831). | |
| Lesser notes (PPV health row, `si.rate` vs bill price, bundle size, clock moved back) | Unchanged. | |

---

## R1 (High, regression): replayed returns use receipts that arrived later, and today's bill status

- **Where:** `src/main/services/inventoryService.js:375-408`.
  - Every earlier return is replayed with `take()` over the same `ordered` list as the current return.
  - That list holds **all** of today's receipts, ranked by **today's** billed status, unbilled first.
- **Why it goes wrong:** an earlier return is replayed onto a receipt that did not exist when it was posted. It also goes onto an unbilled receipt ahead of the billed one it really cleared. The current return then gets the billed receipt again.
- **Failure (P11, no back-dating at all):**

  | Step | What happens |
  |---|---|
  | 07-01 | Billed receipt L1, 10 @ 200, bill 2000. |
  | 07-05 | Return A, 10: TP Dr 2000. Correct. |
  | 07-10 | Unbilled receipt L2, 10 @ 100. |
  | 07-15 | Return B, 10. The replay puts A on L2 (unbilled ranks first), so B takes L1 again: **TP Dr 2000**, PPV Cr 1000. |

  - Net result: Trade Payables **2000 debit**. The supplier is debited 4000 against a 2000 bill, so the ledger shows the supplier owing us 2000.
  - GRNI is stuck at **−1000**, because L2 is never cleared.
  - PPV shows a 1000 credit, a fake gain.
  - At d661346 the same steps give GRNI 0, TP 0 and PPV 0.
- **Failure (P1, the same mechanism with back-dating):**
  - Steps: L1 unbilled; A on 07-20; L2 billed; B back-dated to 07-10; L3 unbilled; C on 08-01.
  - Result: C posts TP Dr 2000 instead of GRNI 1000. Same totals as P11.
  - At d661346: correct.
- **Fix:** replay each earlier return "as of" its own posting, using only data the table already has:
  - only receipts whose `stock_ledger.id` is below the return's own `stock_ledger.id` are eligible;
  - a receipt counts as billed only if its procurement voucher id is below the return's `voucher_id`;
  - the returns are replayed in posting order (R2).
  - I tried this in the scratch clone (`/tmp/claude-0/corr-66b024f-asof-replay.diff`, about 15 lines). Results:
    - P1, P10 and P11 balance to 0.
    - Q1 to Q8 are unchanged.
    - audit2-regressions passes 60/60.
  - The sturdier option is still the one from N1: store per-lot rows when a return posts, in `stock_return_lots(return_id, stock_inward_id, pool, quantity, value)`. Then nothing is re-derived.
  - Either way, add P11 as a regression test.
  - This changes how returns post, so it needs the owner's OK. The current code books a wrong supplier balance in a common flow, so I would treat it as a fix that blocks the merge.

## R2 (Medium): the replay order is not the posting order

- **Where:** `inventoryService.js:407`, `ORDER BY return_date, id`.
- **Failure (P10):**
  - Steps: receipts O1 10 @ 100 (07-01) and O2 10 @ 200 (07-02).
    - A no-order return is created as a **draft** (id 1).
    - An O1 return (id 2) is created and posted: GRNI 1000.
    - The draft is then posted. Its replay puts id 2 on O1, and the draft takes O2: GRNI 2000. Correct so far.
    - A new O1 receipt (07-03) arrives, then a third return on O1 is posted.
  - The replay now runs id 1 first (same date, lower id). It takes O1, so return 2 replays onto the new O1 receipt, and return 3 finds nothing: **TP Dr 1000 at WAC**, linked to the supplier. GRNI is stuck at −1000.
  - At d661346 this is also wrong, through the value-based skipping.
- Same-date drafts posted out of order are routine, and so is back-dating within a month. The policy doc's "replayed ... in date order" describes this rule but does not list it as a limit.
- **Fix:** order by the return's own `stock_ledger.id` or `voucher_id` (posting order). This is part of the R1 patch. Ordering by `posted_at` alone is not enough: it has 1-second resolution and ties are common.

## R3 (High, older bug, now 10x larger): "Accounting Only" purchase voucher still receives stock

- **Where:**
  - `accountingService.js:366-368` calls `createAutomaticGrnFromPurchaseVoucher` for every purchase kind.
  - `init.js:1011` has no `inventory_enabled` guard. The sales path does have one, at init.js:1077.
  - The voucher itself debits **Purchase** when `inventory_enabled` is false (init.js:1164). The screen sends `inventory_enabled: false` for "Accounting Only" (BusinessVoucherScreen.jsx:343), and the item and warehouse pickers stay visible.
- **Failure (P3):** a purchase of qty 10 @ 100, taxable 1000, set to Accounting Only.
  - Purchase Dr 1000, TP Cr 1000.
  - **Plus** Inventory Dr 1000 and GRNI Cr 1000, from a stock inward at rate 100 and landed_cost 1000.
  - The cost is counted twice: once as an expense and once as stock. GRNI keeps a 1000 credit that nothing clears.
  - At d661346 the GRN was valued at 100, because of the N6 divide. The N6 fix now makes this the full amount.
- **Fix:** in `createAutomaticGrnFromPurchaseVoucher`, add `if (payload.inventory_enabled === false || payload.inventory_enabled === "0") return null;`, the same guard the sales path has. Then reverse/unwind the stock path the same way for a guided purchase voucher. Add a test.

## R4 (High, older): the auto-GRN value comes from `purchase_value`, which the screen pre-fills from the order

- **Where:**
  - `init.js:1048`: `landed_cost: payload.landed_cost || payload.purchase_value || payload.taxable_value`.
  - The voucher uses `taxable_value || purchase_value` (init.js:1160).
  - `applyOrder` (BusinessVoucherScreen.jsx:220) sets `purchase_value` to the order's total of earlier bill-wise payables.
- **Failure (P4):** voucher with taxable 1000, and `purchase_value` 50000 pre-filled by the order.
  - The voucher debits GRNI 1000.
  - The GRN posts **Inventory Dr 50000 / GRNI Cr 50000**, so GRNI is left at −49000.
  - Every later issue goes out at a WAC of 5000 per unit.
  - The same happens at d661346. The previous round raised it as a side issue of N6, and it was not fixed.
- **Fix:** use the voucher's own amount, so the two cannot disagree. In init.js:1045 and 1048 use `taxable_value || purchase_value`, in that order. The best way is to share one helper with `businessVoucherPayload`. Also stop `applyOrder` writing the order's history into a field the user can post with: show it read-only instead.

## R5 (Medium, older): a guided-purchase receipt is treated as unbilled when returned

- **Where:** `inventoryService.js:375-380`. "Billed" means `si.procurement_id` points at a posted procurement. The auto-GRN leaves `procurement_id` null unless the payload carries one.
- **Failure (P5 / Q7):** after the guided purchase (GRNI 0, TP Cr 1000), return 4: **GRNI Dr 400**, TP unchanged.
  - GRNI is left in debit, and the supplier is still shown owing 1000.
  - Party Reconciliation (payable) also shows **Mismatch 1000**. The cause is older and separate: the guided voucher's supplier-linked TP line is in the party ledger, but guided purchases never appear in bill-wise payables.
- **Fix:** treat an inward as billed when `goods_receipts.guided_voucher_id` points at a posted guided purchase voucher. One way is a join through `goods_receipt_items.stock_inward_id`; another is a `billed_by_voucher_id` column on `stock_inwards`. Separately, decide whether guided purchase vouchers belong in bill-wise payables.

## R6 (Low-Medium, older): an order return over receipts without an order

- **Where:** `inventoryService.js:393`, `if (orderId && lot.orderId !== orderId) continue;`.
- **Failure (P7):** unbilled receipt 10 @ 100 with no order. A return of 4 that names an order:
  - finds no receipt, so it posts **TP Dr 400 at WAC**, linked to the supplier;
  - GRNI stays at −1000.
  - Same at d661346.
- **Fix:** do one of these:
  - let an order return fall back to receipts with no order once the order's own receipts are used up;
  - refuse the return with "None of this supplier's receipts of the item are on that order".

## R7 (Low, older): the GRN line disagrees with its stock receipt

- **Where:** `init.js:1066` still computes `(rate || purchase_rate || purchase_value) / accepted`, and `init.js:1068` has no `taxable_value` fallback.
- **Failure (P5):** `goods_receipt_items.rate` = 10 and `landed_cost` 0, while `stock_inwards` has 100 and 1000. Any GRN screen, report or export shows 1/qty of the price.
- **Fix:** write the `rate` and `landed_cost` that were just computed for the inward.

## R8 (Low, older): Party Reconciliation with a date filter

- **Where:** `reportBuilders.js:426-438`. `partyLedgerReport` is bounded by dates and has no opening balance. `billWisePayableReport` and `billWiseReceivableReport` cover all dates.
- **Failure (P6):** over the full range, after a return and then its reversal, the report says Matched. Both July only and August onwards say **Mismatch**, with differences of about 426 000 from the seed data.
- The new return credit is also date-bounded. A return in July reversed in November nets out only when both dates fall in the filter, because `returnVoucherIds` is built from rows inside the period.
- **Fix:** compute the ledger side as at `dateTo`, from the start of the books. Compute `supplierReturnCredits` the same way, with no lower date bound. Alternatively, ignore the date filter for this control row and label it "as at today".

## R9 (Low): stale KG-4 line numbers

- **Where:** `src/renderer/knowledge/voucher-accounting-graph.json`.
  - Line 1092 says `reverseVoucher` is at accountingService.js:316. It is at **453**; line 316 is the end of `createBusinessVoucher`.
  - Line 1119 says `reverseAdvanceAdjustment` is at :712. It is at **1021**.
- The other 23 `lineNumber` entries are correct.
- **Fix:** refresh both. Make the KG check test cover `reversalRules[].lineNumber`, so it fails on drift.

## R10 (Low / Info): the support bundle budget undercounts escaped text

- **Where:** `supportBundleService.js:47`, which charges `text.length * 2 + 2` per string.
  - JSON writes a control character as `\u00XX`, which is 6 bytes.
  - CJK text takes 3 UTF-8 bytes per unit.
- **Failure:** 30 crash entries of 19 000 control characters each. The walker accepts about 13 of them, about 1.48 MB once serialised, so the final check replaces the **whole** context with "larger than 1 MB". The crash list is lost.
  - It stays safe: the bound holds.
- **Smaller points:**
  - `Object.keys()` on an object with 3 million keys takes about 1.5 s before the key limit applies.
  - Keys cut to 200 characters can collide, and the later value wins.
  - A user key named `omitted` is overwritten by the note.
- **Fix:** charge `Buffer.byteLength(JSON.stringify(text))` per string. Walk the keys with `for...in` and a counter. Put the note in a field the context cannot hold, such as `__omitted`.

## R11 (High, repo hygiene): a committed `node_modules` symlink

- **Where:** `git ls-tree 66b024f node_modules` gives `120000 ... node_modules` → `/home/claude/gii-gem-erp/node_modules`. 7b23f17 added it; d661346 and 3c2cd8b do not have it.
- **Why it slipped through:** `.gitignore` has `node_modules/`, which matches directories only, so a symlink file named `node_modules` is not ignored.
- **Effect:**
  - In `/home/claude/gii-gem-erp`, `node_modules` is now a symlink to itself, created 19:47 UTC = 01:17 IST. `wt-prog/node_modules` points at it, so `better-sqlite3` cannot be loaded from either checkout ("Too many levels of symbolic links"). I ran my probes against `/tmp/claude-0/arch-deps/node_modules` instead.
  - On any other machine, or in CI, a checkout gets a dangling `node_modules` link, and `npm ci` / `npm install` will fail or behave oddly.
- **Fix:**
  - `git rm --cached node_modules`.
  - Change `.gitignore` to `node_modules` (no trailing slash).
  - Restore a real `node_modules` in the main checkout (`rm node_modules && npm ci`).
  - Optionally, add a pre-commit or CI check that refuses symlinks at the repo root.

---

## Checked and found correct

- **Reversed returns:**
  - `reverseStockReturn` and a direct `reverseVoucher` on the return's voucher both set `stock_returns.posting_status = 'Reversed'` (accountingService.js:578, inventoryService.js:618). The replay's `posting_status = 'Posted'` filter therefore drops them.
  - P2: GRNI, TP and PPV are all 0 after a reversed return and a later full return.
- **Department returns:** they are excluded from the replay (`return_type = 'Supplier'`). They add no supplier receipt, which is correct.
- **Paise (PR #5):**
  - The variance is computed in whole paise against `roundMoney(retValue)`, so every return voucher balances. P8 used odd rates (33.333 and 10.0015) and three returns: no unbalanced voucher, and stock and value end at exactly 0.
  - Unbilled receipts are read from `sl.value_minor`, which matches what GRNI was credited with.
  - `outwardValue` takes the exact remaining value on the last issue.
- **PR #5 / PR #6 interaction:**
  - `stockBalance` and `isGrniClearedForCompany` now read the `*_minor` columns. The return code takes all of its stock value from `outwardValue` and `value_minor`.
  - `reverseVoucher` copies the supplier link onto the reversal (Q5).
  - Nothing else in the merged code changed what supplier returns depend on.
- **Partial bill (P9):** TP ends at 0 and Purchase at a 500 credit. This is the accepted F4 limit (the bill clears the whole receipt). The return adds to it by taking the "billed" receipt's unbilled half off Trade Payables. Worth a line in the policy doc, next to F4.
- **No-supplier return branch:** unchanged apart from paise rounding. It is consistent.
- **Free receipts used last:** N4 is fixed. It is a design choice, and Info only, that a return of genuinely free units now clears priced GRNI first, with the difference going to PPV.

## Owner decisions this report needs

Each of these changes posting:
- R1/R2: the replay rule.
- R3: skip the GRN for Accounting Only.
- R4: which field carries the receipt value.
- R5: treat a guided purchase as billed.
- R6: the fallback for an order return, or a refusal.

R7 to R11 are corrections with no effect on posting.
