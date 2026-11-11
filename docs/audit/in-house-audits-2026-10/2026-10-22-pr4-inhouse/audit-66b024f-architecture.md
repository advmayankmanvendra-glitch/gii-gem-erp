# Architecture audit: d661346..66b024f

- Repo: advmayankmanvendra-glitch/gii-gem-erp, branch `claude/erp-full-automation-qbhv8k`, head `66b024f` (pushed). Written 11 Nov 2026, 01:25 IST.
- Our commits in scope: `7b23f17` (11 Nov 00:57 IST, "WIP: d661346 architecture audit fixes") and `421b2bc` (11 Nov 01:16 IST, "Close the d661346 audit findings …"). Merges: `5458b15` (PR #5 head `c7f79c8`) and `66b024f` (PR #6 head `3c2cd8b`).
- Read against: AGENTS.md §2-§4 (no logic in App.jsx or screens; no IPC, preload or route-key renames; posting math, inventory valuation, accounting formulas, save/post behaviour and schema need the owner's OK), owner-decisions-pr4.md (C2: keep the per-item pool, no receipt link; CV: Purchase Price Variance), audit-d661346-architecture.md (B1-B10).
- Auditor: in-house architecture auditor, read-only on /home/claude/gii-gem-erp and /home/claude/wt-prog. Commands ran in a scratch clone at /tmp/claude-0/arch-66b024f, with better-sqlite3 installed into a separate scratch folder, because the repo's own `node_modules` is broken (see C1).
- Commands and results:
  - `node --test scripts/audit/audit2-regressions.test.mjs`: 60/60 pass.
  - The other node integrity suites (critical-defects, posting-regressions, alerts, audit1, reset-update, ledger-guards, paise-proof, key-layout): 151/151 pass. The Electron ipc-security suite was not run.
  - `node scripts/verify-voucher-accounting-graph.js`: all checks pass. `npm run -s verify:voucher-accounting-graph` exits 216 with no output in this sandbox, and so does every `npm run`/`npm exec`. That is an environment fault, not a repo fault.
  - `verify-manual-graph`, `verify-knowledge`, `verify-feature-function-graph`, `verify-governance-graph-registry`, `verify-workflow-graph` and `verify-audit-graph` pass.
  - Mutation runs (details below) and two posting probes.

## Summary

The new supplier-return replay stays within decision C2: it adds no column and no receipt link. The doc, KG-4 and the code comment agree on it, with two small gaps. It replaces the B2 and B6 behaviour, so it is still a posting rule the owner has not seen. The Party Reconciliation change is a report fix and needs no owner OK of its own. It depends on B1, though: if the owner rejects B1, this change must come out too. The auto-receipt rate and landed-cost change (N6) is a posting and inventory-valuation change and needs the owner's OK. It also makes two existing gaps bigger (C3, C4). All 23 KG-4 line numbers are correct. Each new test fails when its fix is reverted.

The most serious problem is outside the business logic: `7b23f17` committed a `node_modules` symlink to an absolute sandbox path, and it is now on the PR branch.

| # | Severity | Owner? | Where | Finding |
|---|---|---|---|---|
| C1 | **High** | No | `node_modules` (tree of 7b23f17 → 66b024f); .gitignore:2 | A symlink `node_modules -> /home/claude/gii-gem-erp/node_modules` is committed and pushed. It breaks `npm install` on a fresh clone. It has already replaced the local checkout's real `node_modules` with a link to itself |
| C2 | **Medium** | **Yes** | init.js:1045, :1048 | N6 changes posted GRN values and stock valuation for purchase vouchers. It is a correct bug fix, but it is posting math and inventory valuation |
| C3 | **Medium** | **Yes** | init.js:1011-1050 with BusinessVoucherScreen.jsx:545 | With "Accounting Only" chosen and an item and quantity entered, the auto receipt now books full value to Inventory as well as Purchase. The cost is counted twice and GRNI is left in credit. N6 made this worse |
| C4 | **Medium** | **Yes** | inventoryService.js:374-387 | Receipts made by a guided purchase voucher have no `procurement_id`, so the pool treats them as unbilled. Returning them debits GRNI (left in debit) instead of Trade Payables, even though the supplier was billed. The gap existed before; N6 makes it about 10 times bigger |
| C5 | Medium | **Yes** (with B4) | inventoryService.js:388-410; policy :82-86 | The quantity replay is within C2, but it is a new posting rule that replaces B2/B6. Put it into the single B4 question to the owner |
| C6 | Low | No | policy :76, :83; KG-4 :717; manual :1315 | Small doc gaps: the GRNI line in the diagram says "supplier's price" where the code uses stock value. A back-dated return is replayed after later-dated ones. The manual does not mention returns with no order |
| C7 | Low | No | audit2-regressions.test.mjs:1060, :1065-1079, :1081-1092, :993-1002 | The new tests fail without their fixes (good), but some assertions are weak or have untested branches |
| C8 | Low | No | init.js:1048 | When some units are damaged, the whole taxable value goes onto the accepted units only |
| C9 | Info | No | inventoryService.js:390-399 | Lot values are added as floating-point rupees and rounded at the end. This does not duplicate PR #5's helpers, but it does not use paise |
| C10 | Info | No | carried over | B7 (KG-4 `version` 1.0.0), B8 and B9 are still open. B10 is unchanged |

### Status of the d661346 findings

| Prev | Status | Evidence |
|---|---|---|
| B1 Medium (owner): supplier tag on the return's Trade Payables line | **Open (owner)**. Now documented | Policy :90 states the tag, the cut-off for returns posted before 10 Nov 2026 IST, and the Party Reconciliation treatment. Still no owner line in owner-decisions-pr4.md. The new Party Reconciliation change depends on it |
| B2 Medium (owner): returns with no order net against every order | **Superseded** by the quantity replay (C5) | The `OR sr.order_id IS NULL` value skip is gone. A return with no order now uses specific lots by quantity, so it no longer leaves value stranded on another order (test :1026 shows this). The owner still has not seen the new rule |
| B3 Medium: KG-4 and the policy on Debit Notes and GST | **Fixed** | KG-4 :717 and policy :90 say "for that value" and state that GST is not reversed |
| B4 Low: owner confirmation of the pool pricing | **Open (owner)** | Merge it with C2, C4 and C5 into one question |
| B5 Low: two tests did not exercise their fix | **Fixed** | The wrong-type test now posts a return and checks that it stays Draft. The zero-rate test now has an earlier return and a paid receipt. Both fail on the d661346 logic |
| B6 Low: the skip mixed valuation bases | **Fixed by design** | The replay works by quantity and no longer by posted value, so landed-cost and WAC bases no longer mix |
| B7 Low: KG-4 housekeeping | **Mostly fixed** | All 23 `lineNumber` values point at their function, and `postStockAdjustment` now records its Journal. `version` and `schemaVersion` are still 1.0.0 |
| B8 Low: bound not applied inside `createSupportBundle` | **Open** | main.js:1211 still calls `boundedScreenContext`, and supportBundleService.js:90 does not. The copy is now budgeted (security N1 fixed) |
| B9 Low: `guarded` and `sessionGuarded` use different argument rules | **Open** | main.js:330-333: no comment and no test |
| B10 Info: test gaps | **Open** | Unchanged |

Checked with no finding:

- No IPC channel, preload method or route key renamed. The only change in `ipc-security.test.mjs` is the expected message text (`(cut)`).
- No schema DDL. The replay reads only `stock_inwards`, `stock_ledger`, `procurements` and `stock_returns`.
- No logic in App.jsx or any screen. No renderer code changed in our commits apart from the KG-4 JSON.
- KG-4 line numbers: each of the 23 `lineNumber` values was checked against the source line, and each points at the function's declaration.
- Merges `5458b15` and `66b024f` have no hand-resolved hunks except the `debit_minor` line in `5458b15`, which `421b2bc` then removed. The PR #5 and PR #6 suites still pass.
- The Party Reconciliation change reuses PR #5's `VOUCHER_REVERSAL_SOURCE` and `addRupees`/`subtractRupees`; no money helper is duplicated. Probe: a billed return followed by its reversal stays `Matched` at each step, with ledger = sub-ledger.

---

## C1 — High: a `node_modules` symlink to a sandbox path is committed

- **Where:** `node_modules` (mode 120000, blob d46af7b, target `/home/claude/gii-gem-erp/node_modules`), added in `7b23f17`, present in `66b024f` and on `origin/claude/erp-full-automation-qbhv8k`. The cause is .gitignore line 2, `node_modules/`: the trailing slash matches directories only, never a symlink.
- **What it breaks:**
  - On Windows (the owner's platform), git checks the link out as a small text file called `node_modules`, so `npm install` / `npm ci` fail (ENOTDIR/EEXIST).
  - On Linux and macOS it is a dangling link.
  - In this sandbox, checking out 421b2bc replaced the real `/home/claude/gii-gem-erp/node_modules` directory with a link that points to itself, so the local checkouts can no longer load `better-sqlite3`. This is why the tests here ran from a separate install.
- **Fix (no owner needed):**
  1. Run `git rm --cached node_modules`.
  2. Change .gitignore to `node_modules` (no trailing slash) or add `/node_modules`.
  3. Run `npm ci` again in /home/claude/gii-gem-erp.
  4. Before merging, check that `git ls-tree -r HEAD | grep 120000` is empty.

## C2 — Medium (owner OK): the automatic goods receipt from a purchase voucher now posts a different value

- **Where:** src/main/database/init.js:1045 (`rate`), :1048 (`landed_cost`). `postStockInward` values a receipt at `landed_cost || quantity × rate` (inventoryService.js:195) and posts Dr Inventory / Cr GRNI for that value.
- **What changed:** before, "Receipt Rate" was divided by the quantity, and `landed_cost` fell back to `purchase_value` only. Probe on 5458b15 vs 66b024f: a purchase voucher with taxable 1,000, 10 units at a rate of 100.
  - **Before:** Inventory +100, GRNI left at +900 debit.
  - **After:** Inventory +1,000, GRNI 0.
  - **Taxable value only, no rate:** no GRN voucher before; a 1,000 voucher now.
- **Why the owner:** AGENTS.md §4 lists "voucher posting math" and "inventory valuation". This is a bug fix (recommendation: **Keep**), and it belongs in owner-decisions-pr4.md like P20. Vouchers already posted do not change, so companies that used purchase vouchers with an item may hold stock under-valued, with GRNI debit balances left over.
- **Fix:** add it to the owner list as "N6: auto receipt valued at the voucher's taxable value. Keep. Bug fix. Earlier receipts are not revalued." Optionally, list the affected receipts with a read-only query, so the accountant can decide on a correcting journal.

## C3 — Medium (owner OK): "Accounting Only" purchase vouchers now count the cost twice

- **Where:** init.js:1011-1050 (`createAutomaticGrnFromPurchaseVoucher` does not look at `inventory_enabled`) and init.js:1164 (with `inventory_enabled === false` the voucher debits Purchase). The screen sends `inventory_enabled: false` when "Inventory Posting = Accounting Only" (BusinessVoucherScreen.jsx:343, :545), and still shows item, warehouse and quantity.
- **What:** probe on a purchase voucher, Accounting Only, taxable 1,000, 10 units, no rate.
  - **66b024f:** Purchase +1,000, Inventory +1,000, GRNI −1,000 (credit, never cleared).
  - **5458b15:** Purchase +1,000, no receipt value.
  - With a rate given, the old code already posted part of the value (rate ÷ quantity × quantity). N6 makes it the full value.
- **Why:** expense and stock both carry the purchase, and GRNI holds a credit no bill will clear. It changes posting, so the owner must OK the fix.
- **Fix (owner OK):**
  - Preferred: when `inventory_enabled` is false, `createAutomaticGrnFromPurchaseVoucher` returns before creating a receipt, since "Accounting Only" should mean no stock movement.
  - Alternative: keep the receipt but post it with no value.
  - Add a test for each kind of purchase voucher.

## C4 — Medium (owner OK): returns of goods from a purchase voucher clear GRNI, not the supplier's payable

- **Where:** inventoryService.js:374-387. A lot is billed only when `stock_inwards.procurement_id` points at a posted procurement. The receipt that a guided purchase voucher creates has `procurement_id = payload.procurement_id || null` (init.js:1036), normally null, even though the voucher has already credited Trade Payables (init.js:1175).
- **What:** probe on 66b024f. A purchase voucher for 10 units, taxable 1,000, then a supplier return of 4 units with no order.
  - Result: GRNI +400 debit (nothing to clear), Trade Payables unchanged (the supplier still shows 1,000 owed), Inventory −400.
  - On 5458b15 the same route posted GRNI +40, because the receipt was under-valued.
  - The error existed before, but N6 makes it about 10 times bigger.
- **Why:** this is where the C2 pool meets guided purchase vouchers. The policy (§6) and KG-4 do not mention that these receipts count as unbilled.
- **Fix (owner OK, no schema change):** treat a lot as billed when it is linked to a posted guided purchase voucher. Use `goods_receipt_items.stock_inward_id` → `goods_receipts.purchase_voucher_id` → a Posted voucher (or `guided_voucher_id` → `guided_vouchers.status = 'Posted'`). Add a test like the probe. Until that is fixed, add a known-limit line to policy §6.

## C5 — Medium (owner OK, with B4): the quantity replay is within C2, but it is a new posting rule

- **Where:** inventoryService.js:366-419 (`supplierReturnSplit`); policy :82-86; KG-4 :717; comment at inventoryService.js:351-365.
- **Within C2?** Yes. There is no new column and no receipt link, and the pool is still built from the supplier's receipts of the item. The pool has widened from item + supplier + order to item + supplier, with the order now a filter (a return on an order uses only that order's lots; a return with no order may use any lot). Earlier posted returns are replayed by quantity over the same lots before this return takes what is left. Lot order: unbilled first, then billed; free receipts last within each group; then date and entry order.
- **Do the code, doc and KG-4 agree?** Mostly:
  - The code comment (:354-361), policy :82-85 and KG-4 :717 all say: replay by quantity, a return with no order may use any order, unbilled before billed, free receipts last, and billed lots at the supplier's rate (or at stock value when the receipt has no rate; policy :84 and comment :372-373).
  - Policy :86, "a bill posted after a return … changes which receipts the replay gives to earlier returns", matches comment :362-363.
  - The two gaps are in C6.
- **Why the owner:** it changes the GRNI, Trade Payables and PPV amounts that later returns post, compared with d661346 (N1, N4, N5 show this). B4 already asks the owner to confirm the pool pricing, and B2 (now superseded) was flagged for the owner. C2 approved the *pool*, not this way of consuming it.
- **Fix:** send the owner one B4 question covering the replay rule, B1, C2 (N6) and C4. Suggested wording: "Supplier returns use up this supplier's receipts unit by unit, oldest first, unbilled before billed. A return with no order may use any order's receipts. Units an earlier return used are never used again. Keep?" Recommendation: **Keep**.

## C6 — Low: small gaps between the doc, KG-4 and the code

- **Diagram line:** policy :76 says GRNI is cleared at "supplier's unbilled receipt price". The code (:376) and policy :84 use the receipt's stock value, which includes landed cost. KG-4 :717 says "at the supplier's receipt prices" for both. Change both to "stock value of the unbilled receipt".
- **Return order:** policy :83 says earlier returns are replayed "in date order". The code replays every *other* posted return, including ones dated after this return, and this return always goes last (:403-410). So a back-dated return takes what later-dated returns left. Add to the known limits at :86: "or a return entered with an earlier date".
- **Manual:** manual 10.6 step 2 (:1315) still says the app works from "this supplier's receipts of the item on that order". Add: "With no order, any of this supplier's receipts of the item may be used; select the order whenever there is one."

## C7 — Low: test quality of the new tests

Mutation check: each fix was reverted in turn to its `5458b15` version and the suite run again.

| Fix reverted | Tests that fail |
|---|---|
| inventoryService.js | :1026, :1043 |
| reportBuilders.js | :1065 |
| init.js | :1081 |
| supportBundleService.js | :978, :993 |

None of the new tests is vacuous. Weak points:

- **:1060** asserts only `tp > 0`. Assert `tp === 800`, the stock value of the receipt with no rate. Also assert that PPV is 0 for that return.
- **:1065-1079** tests only a return on account. It does not test a reversed return (the `VOUCHER_REVERSAL_SOURCE` branch at reportBuilders.js:436; my probe shows it works). It also does not show that a real mismatch still shows (for example, a manual journal to Trade Payables with a supplier link).
- **:1081-1092** has a fallback, `m.stockBalance ? … : 1000`, that makes the second assertion pass whenever the export goes missing. It is exported today; drop the fallback. Test the taxable-only path, the damaged-quantity path (C8), and Accounting Only (C3).
- **:993-1002**: a fixed `< 1000 ms` limit can fail on a slow Windows CI runner. Keep the byte-size assertion as the main check and raise the time limit (e.g. 5 s).

## C8 — Low: damaged units' cost goes onto accepted units

- **Where:** init.js:1048 (`landed_cost` = the whole `taxable_value`), with `quantity: accepted` at :1043.
- **What:** take 10 billed units at a taxable value of 1,000, with 2 damaged. The 8 accepted units go into stock at 1,000 (125 each). The damaged units' cost is not separated as a claim on the supplier. The same was true before when `purchase_value` was sent.
- **Fix:** ask the owner or CA as part of C2 whether damaged units should be valued pro rata and the rest left in GRNI as a claim. Until then, record the behaviour in policy §2 or §6.

## C9 — Info: float sums in the replay

- **Where:** inventoryService.js:390-399, with :376 (`sl.inward_quantity * si.rate` in SQL, against `sl.value_minor / 100.0`).
- **What:** lot values are added up as floating-point rupees and rounded once (`roundMoney`, :413-414). The variance arithmetic at :415-418 (from the PR #5 merge, `a528f81`) works in hand-rolled `Math.round(x * 100)` although `paise`/`rupees` are imported at :1. Nothing is wrong today. It is just less strict than PR #5's paise rule.
- **Fix (optional):** add up in paise (`paise(units * lot.rate)`) and use `paise()`/`rupees()` at :415-418.

## C10 — Info: carried over

B7 (`version`/`schemaVersion` still 1.0.0), B8, B9 and B10 are unchanged; see the d661346 report.

## Items for the owner

Add these to owner-decisions-pr4.md as one question next to CV and C2:

1. **C5 + B4 + B1:** the supplier-return replay rule and pool pricing, and the supplier tag on the return's Trade Payables line. Recommendation: Keep.
2. **C2 (N6):** the auto receipt is valued at the purchase voucher's taxable value, and earlier receipts are not revalued. Recommendation: Keep (bug fix).
3. **C3:** "Accounting Only" purchase vouchers should create no stock receipt. Recommendation: fix before merge.
4. **C4:** treat receipts from posted purchase vouchers as billed in supplier returns. Recommendation: fix before merge.

The Party Reconciliation change (reportBuilders.js:431-438) is a **report fix**. It changes no posting, profitability or GST figure, so it needs no owner OK of its own. It stands or falls with B1.
