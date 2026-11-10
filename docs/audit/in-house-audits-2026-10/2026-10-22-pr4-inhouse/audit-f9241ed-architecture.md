# Architecture audit: 66b024f..dc40f03

- **Repo and branch:** advmayankmanvendra-glitch/gii-gem-erp, branch `claude/erp-full-automation-qbhv8k`, head `dc40f03`.
- **Written:** 11 Nov 2026, 05:15 IST.
- **Commits in scope:**
  - `f0a0f3c` (11 Nov 01:27 IST): removes the node_modules link.
  - `f9241ed` (11 Nov 01:42 IST): closes the 66b024f findings.
  - `dc40f03` (11 Nov 05:05 IST): re-checks the installer after the backup, refuses ":" names, tweaks the support bundle, and adds a guard against committed links.
- **Answers:** audit-66b024f-architecture.md (C1-C10).
- **Read against:**
  - AGENTS.md: rule 4 (owner OK for changes to posting, profitability or GST, and for schema changes); no IPC, preload or route-key renames; no logic in App.jsx or screens; error messages must say what to do.
  - KG-4 must match the code, including every `lineNumber`.
  - fsr-2a4 policy §6.
  - owner-decisions-pr4.md (C2: keep the per-item pool, no receipt link).
- **How it was run:** the auditor was read-only on /home/claude/gii-gem-erp and /home/claude/wt-prog. Everything ran in the scratch clone /tmp/claude-0/arch-f9241ed, which has a *copied* `node_modules` (`test ! -L node_modules` was checked). The clone was checked out at f9241ed, then at dc40f03.

## Commands and results

**Test suites and checks**

| Command or check | Commit | Result |
|---|---|---|
| `node --test scripts/audit/audit2-regressions.test.mjs` | f9241ed | 62/62 pass |
| same | dc40f03 | 63/63 pass |
| `node --import ./scripts/audit/lib/electron-register.mjs --test scripts/audit/ipc-security.test.mjs` | f9241ed and dc40f03 | 25/25 pass |
| The other 8 integrity suites (critical-defects, posting-regressions, alerts, audit1, reset-update, ledger-guards, paise-proof, key-layout) | f9241ed and dc40f03 | 151/151 pass |
| `verify-voucher-accounting-graph`, `verify-knowledge`, `verify-feature-function-graph`, `verify-governance-graph-registry`, `verify-workflow-graph`, `verify-audit-graph`, `verify-manual-graph` | — | all exit 0 |
| KG-4 line numbers, by a script: each of the 25 `lineNumber` values (23 functions + 2 reversalRules) checked against `function <name>` on that line | f9241ed and dc40f03 | 25/25 correct |

**Mutation runs:** each fix was undone on its own, and the matching suite run again. The table is below, under F4.

**Probes:** a scratch script, scratchpad `probe/probe.mjs`, was run against the real `init.js`. It covers the as-of replay order, the timing of the bill, and timing with many lots.

## Summary

**The return replay stays within C2.** The as-of replay adds no column, no table and no receipt link. It reads only columns that already exist:

- `goods_receipts.purchase_voucher_id`
- `goods_receipt_items.stock_inward_id`
- `stock_returns.voucher_id`
- `stock_ledger.id`

Neither commit contains any DDL. The code comment, policy §6 :82-87 and the KG-4 `postStockReturn.safetyRule` now say the same thing: posting order, "as things stood when it posted", and "billed by a posted bill or by the purchase voucher that made the receipt".

**The purchase-voucher receipt now matches the voucher.** `createAutomaticGrnFromPurchaseVoucher` uses the same test for Accounting Only and the same taxable-value fallback as `businessVoucherPayload`.

**The symlink is gone,** .gitignore now ignores `node_modules` as a link too, and dc40f03 adds a test that fails on any staged or committed link.

**No IPC channel, preload method or route key was renamed.** No screen or App.jsx code changed; the only renderer file touched is the KG-4 JSON. All 25 KG-4 line numbers are correct.

**What remains:**

- Two parts of the replay that change posted amounts have no test (F4).
- KG-4 table and side-effect lists lag the code (F2, F3).
- There are two definitions of "billed" that can drift apart (F1).
- Small documentation gaps (F5).
- The symlink guard runs only when the tests are run (F6).

All posting changes in f9241ed (the replay, purchase-voucher receipts counting as billed, Accounting Only, the receipt value) are on the owner's pending decision card. **They must not merge before the owner answers it.**

| # | Severity | Owner? | Where | Finding |
|---|---|---|---|---|
| F1 | Low | No | inventoryService.js:377-385, :403 | Two definitions of "billed" (`billedNow` and `billVoucherId`). One SQL subquery is written out twice, and the `'Reversed'` filter is dead code |
| F2 | Low | No | voucher-accounting-graph.json:706, :715 | KG-4 `postStockReturn.readsFromTables` and `relatedDG1Tables` leave out the tables the pool reads, including the new `goods_receipts` and `goods_receipt_items` |
| F3 | Low | No | voucher-accounting-graph.json:472-480 | KG-4 `postGuidedVoucher` still says "auto-creates GRN for purchase kind" with no Accounting Only exception, and its write list leaves out the receipt tables |
| F4 | Low | No | audit2-regressions.test.mjs:1106-1131, :1133-1148; ipc-security.test.mjs:463; main.js:531, :1284 | Several fixes can be undone with no test failing. Two of them change posted amounts (bill as-of, posting order) |
| F5 | Low | With B4 | policy :83-87; manual :1315; inventoryService.js:403, :425-432 | Small documentation gaps: reversed bills, returns with no voucher, ids standing in for posting order, an order's receipts used up by a return with no order, manual 10.6 (C6 carried over), damaged units (C8) |
| F6 | Low | No | audit2-regressions.test.mjs:1150-1157 | The symlink guard is a test only. There is no CI and no pre-commit hook, and it misses a nested `node_modules` |
| F7 | Info | No | init.js:1024; inventoryService.js:216-219 | The receipt can still differ from the voucher when the API sends `landed_cost` or `procurement_id` (the screen sends neither) |
| F8 | Info | No | inventoryService.js:402-421 | Complexity: O(R × L log L) for each return posted. Measured at 17 ms with 400 lots and 300 earlier returns. `goods_receipt_items.stock_inward_id` has no index |
| F9 | Info | No | inventoryService.js:394-395, :420, :441-443 | C9 carried over: the replay adds up floating-point rupees, not paise. It does read `value_minor`, which is correct |
| F10 | Info | No | main.js:1284 | The re-check after the backup compares paths only. A file swapped in at the same path is not caught, so the comment claims more than the code does. Security owns this; noted for consistency |

### Status of the 66b024f findings

| Prev | Status | Evidence |
|---|---|---|
| C1 High: committed `node_modules` symlink | **Fixed** | `f0a0f3c` runs `git rm` on the link. .gitignore:2 is now `node_modules` (no slash), so a link is ignored too. `git ls-files -s` shows no 120000 entry. dc40f03 adds a guard test (F6) |
| C2 Medium (owner): receipt valued at the voucher's taxable value | **Built; owner card pending** | init.js:1014, :1024. Policy :87 documents it |
| C3 Medium (owner): Accounting Only counted twice | **Fixed; owner card pending** | init.js:1012-1013 returns `null`. It uses the same test as the voucher's account choice at init.js:1169. The test at :1141 fails if the guard is removed (M2) |
| C4 Medium (owner): returns of purchase-voucher goods cleared GRNI | **Fixed; owner card pending** | inventoryService.js:379-385. The test at :1144-1147 checks exact GRNI and Trade Payables amounts. M1d and M1e kill it |
| C5 Medium (owner, with B4): the replay is a new posting rule | **Changed again; owner card pending** | Posting order and as-of judgement are added. Still within C2 (below) |
| C6 Low: documentation gaps | **Mostly fixed** | The diagram line and the back-dated return are fixed (now posting order). Manual 10.6 (:1315) is **still unchanged** (F5) |
| C7 Low: weak tests | **Fixed** | :1070 checks `tp === 800`. :1087-1090 adds a reversed return. The `stockBalance ?:` fallback is gone. The time limit is raised to 3 s, and the size check is kept |
| C8 Low: damaged units' cost goes onto accepted units | **Open** | init.js:1024 is unchanged in effect. Policy :87 does not mention damaged units (F5) |
| C9 Info: floating-point sums | **Open** | F9 |
| C10 Info: B7-B10 | **Open** | KG-4 `version` and `schemaVersion` are still 1.0.0. B8, B9 and B10 are unchanged |

---

## Answers to the brief

### 1. Is the as-of replay within C2, and do the comment, policy and KG-4 agree?

**Within C2: yes.** The pool is still all of this supplier's receipts of the item, with the order as a filter. There is no receipt link and no schema change: no `CREATE`, `ALTER` or index appears in either diff. "As things stood" is worked out from rows that already exist:

- the stock-ledger row id of each receipt, compared with the return's first stock-ledger row (`lot.slId < asOf.slId`, :407);
- the id of the bill's voucher, compared with the return's `voucher_id` (:403).

**Agreement:**

| Point | Code | Policy §6 | KG-4 safetyRule |
|---|---|---|---|
| Earlier returns replayed in posting order, not by date | comment :356-358, SQL :431 | :83 | yes |
| Only receipts and bills posted before each earlier return | :403, :407 | :83 | yes ("as things stood when it posted") |
| Billed = posted bill, or the posted purchase voucher that made the receipt | :372-373, :379-385 | :84 | yes |
| GRNI at the receipt's stock value; Trade Payables at the supplier's rate (stock value when there is no rate) | :396, :420 | :76-77, :84 | yes |
| Known limit: a bill after a partial return still clears GRNI for the returned part | (behaviour) | :86 | refers to §6 |

Probe P1 confirms that last limit. A billed-later receipt was returned first through GRNI (Dr 1,000). The bill then cleared the whole receipt, so GRNI holds 1,000 debit, as §6 says.

The remaining gaps are small (F5).

**Owner:** this is still a change to posting math (rule 4). It is on the pending decision card. No further owner question comes from this audit beyond F5's wording.

### 2. Is "billed via `goods_receipts.purchase_voucher_id`" sound and documented?

**Sound.** The only code that writes `purchase_voucher_id` is `createAutomaticGrnFromPurchaseVoucher` (init.js:1027). It writes it in the same transaction as the voucher, which has already credited Trade Payables (init.js:1180). The join needs `v.status = 'Posted'`.

- If the purchase voucher is reversed, its Trade Payables credit is undone. The receipt's Cr GRNI stays, because guided vouchers are not in `SOURCE_DOCUMENTS` and the receipt is not reversed with them. Treating the lot as unbilled is then correct.
- Inside one voucher, the voucher id is always lower than the id of any later return's voucher, so the as-of check works.

**Documented:** in the policy (:84) and in the KG-4 safetyRule. It is **not** in KG-4 `readsFromTables` (F2).

**Weakness:** see F1. "Billed now" and "billed as of" are computed by two different expressions.

### 3. Does `createAutomaticGrnFromPurchaseVoucher` match `businessVoucherPayload`?

**Yes, on the fields the screen sends.**

| Point | Voucher (init.js:1164-1182) | Receipt (init.js:1011-1075) |
|---|---|---|
| Accounting Only test | `inventory_enabled === false \|\| === "0"` → Dr Purchase | same test → no receipt |
| Amount in or out of GRNI | Dr GRNI `taxable_value \|\| purchase_value` | `landed_cost` = `voucherTaxable`, with the same fallback order |
| Per-unit rate | — | `rate \|\| purchase_rate \|\| taxable ÷ accepted`; `goods_receipt_items` now carries the same rate and value (R7) |

So with stock posting on, GRNI nets to zero for that purchase. The test at :1142 checks this, and M3 kills it.

The edges where the two can still differ are reachable only through the API (F7). The damaged-units valuation is still C8.

### 4. Test quality

#### F4 — Low: several fixes can be undone with no test failing

Each mutation below undid one fix. The tests that failed are listed.

| # | Fix undone | Failing tests |
|---|---|---|
| M1 | The whole as-of judgement (both filters) | :1106 |
| M1a | Only the "receipts posted before" filter (:407) | :1106 |
| **M1b** | **Only the "bill posted before" check (:403 → `billedNow`)** | **none** |
| **M1c** | **Posting order → return-date order (:431)** | **none** |
| M1d | Purchase-voucher receipts count as billed (both arms) | :1133 |
| M1e | Only the "billed now" arm (:383) | :1133 |
| M1f | Only the as-of arm (:379-381) | none (reached only through M1b's path) |
| M2 | Accounting Only guard | :1133 |
| M3 | Receipt value uses `purchase_value` first again | :1133 |
| **M3b** | **`goods_receipt_items` rate and value (R7)** | **none** |
| M4 / N3 | Visited-object set in the support bundle | :993 |
| M4b | The 1-unit charge for each value visited | none |
| N4 | (dc40f03) Drop non-plain objects before the repeat check | :993 |
| M5 | "Directly in the folder" check undone to `startsWith` | ipc :463 |
| M5b | No `realpath` on the installer | none (the `lstat().isFile()` check still catches the link) |
| M5c | No `realpath`, and `stat` instead of `lstat` | ipc :463 |
| M6 | Reversal branch in Party Reconciliation | :1073 |
| **N1** | **(dc40f03) Re-check after the backup** | **none** |
| **N2** | **(dc40f03) ":" name refusal** | **none** |

The test at :1106 is named "judged as it stood when it posted", but **it only exercises the receipt half**. Probes show that M1b and M1c change real postings:

- **P1, the bill check (M1b).** Receipt A (bill not yet posted) 10 @ 100, receipt B 10 @ 120. Return 1 of 10 units. Then the bill for A is posted. Then return 2 of 10 units.
  - At head, return 2 posts Dr GRNI 1,200.
  - With M1b, return 2 posts Dr Trade Payables 1,000 + PPV Dr 100.
- **P2b, posting order (M1c).** Receipt A on O1 10 @ 100, receipt B on O2 10 @ 200. Return X (no order, dated 10 Jul) posted, then return Y (O1, 5 units, back-dated to 5 Jul), then return Z (no order).
  - At head, Z posts Dr GRNI 2,000.
  - With M1c, Z posts Dr Trade Payables 750 + GRNI 1,000.

**Fix (no owner needed):**

- Add P1 and P2b as tests with exact amounts.
- Add an assertion on the `goods_receipt_items.rate` / `landed_cost` row in :1133.
- In ipc-security, add tests for a ":" name and for a re-check failure. For the re-check, stub `createLiveBackup` to swap the file, or call the assert twice.

The remaining assertions are exact amounts with no vacuous branches, and the symlink guard test kills its mutation (see F6).

### 5. Is there a guard against committing symlinks again?

**Partly.** See F6.

### 6. Complexity and performance of the replay

See F8. It is fine at SME scale.

### 7. Drift from PR #5 and PR #6 conventions

- The replay reads `sl.value_minor / 100.0`, which is correct. The variance is computed in minor units at :441-443. The sums are floating-point rupees (F9).
- No money helper is duplicated.
- `init.js` puts float rates into `rate`, as before. `postStockInward` rounds the value with `roundMoney`.
- Every new error message says what to do: main.js:532, :537, :541, :1285.

---

## F1 — Low: two definitions of "billed", a repeated subquery, and a dead filter

- **Where:** inventoryService.js:377-385 and :403.
- **What:**
  - `billedNow` is `p.id IS NOT NULL OR EXISTS(purchase-voucher GRN)`.
  - The as-of check uses `billVoucherId`, which is `COALESCE(the MIN procurement voucher id, the MIN purchase-voucher id)`.
  - The purchase-voucher join is written out twice (:379-381 and :383-385).
  - `v.status IN ('Posted', 'Reversed')` at :378 is dead code. `p` is LEFT JOINed only when `posting_status = 'Posted'`. A reversed bill sets `procurements.posting_status = 'Reversed'` (accountingService.js:532), so `p.id` is NULL and the subquery never matches.
  - A posted procurement with no voucher (for example a zero-value bill) counts as billed now but unbilled in the as-of check.
- **Why it matters:** the two meanings can drift the next time someone edits one of them. The dead `'Reversed'` suggests that reversed bills keep counting as billed for earlier returns, which is not what happens.
- **Fix (no owner needed):**
  - Compute `bill_voucher_id` once, with a CTE or a single subquery.
  - Make `billedNow` equal `bill_voucher_id IS NOT NULL`, or document why they differ.
  - Drop `'Reversed'` from the filter, or move the `posting_status` condition out of the JOIN if reversed bills *should* count. That second choice changes posting and would need the owner.

## F2 — Low: KG-4 `postStockReturn` does not list the tables it reads

- **Where:** voucher-accounting-graph.json:706 (`readsFromTables: ["stock_returns", "stock_ledger", "items"]`) and :715 (`relatedDG1Tables`).
- **What:** `supplierReturnSplit` and `ensurePurchasePriceVarianceAccount` also read `stock_inwards`, `procurements`, `vouchers`, `goods_receipts`, `goods_receipt_items` and `accounts`. `goods_receipts` and `goods_receipt_items` are new in f9241ed and carry the C4 meaning of "billed". `verify-voucher-accounting-graph` does not check `readsFromTables`, so nothing flags the gap.
- **Fix (no owner needed):** add the six tables to both lists. Optionally, have the verifier check that every table a function's SQL names appears in its lists.

## F3 — Low: KG-4 `postGuidedVoucher` is out of date

- **Where:** voucher-accounting-graph.json:472-480.
- **What:**
  - `safetyRule` says "auto-creates GRN for purchase kind". Since f9241ed this no longer happens with Accounting Only, and the receipt is valued at the voucher's taxable value.
  - `writesToTables` leaves out `goods_receipts`, `goods_receipt_items`, `stock_inwards` and `stock_ledger`, and the GRN voucher.
- **Fix (no owner needed):** add "(not for Accounting Only; the receipt is valued at the voucher's taxable value, so GRNI nets to zero)" and the missing tables.

## F5 — Low: small documentation gaps

- **Reversed bills (policy :83-84):** the policy does not say that a reversed bill or a reversed purchase voucher makes its receipts unbilled again, both now and when earlier returns are replayed. That is what the code does (F1). Add one line.
- **A return with no voucher (:403):** an earlier return that posted no voucher (worth under half a paisa) has `voucher_id` NULL. `!asOf.voucherId` then treats every bill as already posted. The effect is tiny, but add a comment.
- **Ids stand in for posting order (:403, :425-432):** "posting order" is the auto-increment id of `stock_ledger` and `vouchers`. Say so in the code comment, because a restore or re-import that renumbers rows would change the replay.
- **Order receipts used up by a no-order return (policy :86):** probe P2b shows the effect. A return with no order took order O1's receipt. A later O1 return then found nothing and went to Trade Payables at WAC (Dr 750, with nothing billed), even though O2's receipt was still unbilled. The "known limits" line mentions only receipts that carry no order. Add "or its receipts were already used by a return with no order". This belongs to the B4 pool question on the owner's card; no new decision is needed.
- **Manual 10.6 (:1315), C6 carried over:** it still says "this supplier's receipts of the item on that order". Add the no-order case and the Accounting Only rule. Today the manual never mentions Accounting Only.
- **Damaged units (policy :87), C8:** the policy says "brings the goods in at the voucher's taxable value", but not that damaged units' cost lands on the accepted units.

## F6 — Low: the symlink guard runs only when someone runs the tests

- **Where:** audit2-regressions.test.mjs:1150-1157 (dc40f03) and .gitignore:2.
- **What works:**
  - The test reads `git ls-files -s`, the index, so it also catches a *staged* link. I confirmed this: staging a link made it fail, and removing the link made it pass again.
  - .gitignore `node_modules` now ignores a link of that name.
- **Gaps:**
  - There is no `.github/workflows`, no husky or pre-commit hook, and no `prepush` script. The guard fires only if `npm run test:integrity` is run before the push, which is what went wrong with C1.
  - The regex `/\tnode_modules(\/|$)/` matches only a top-level `node_modules`. A force-added `sub/node_modules/x` passes (tested).
  - When git is missing, the test is skipped silently.
- **Fix (no owner needed):**
  - Use `/(^|\/)node_modules(\/|$)/` on the path field.
  - Add a cheap pre-commit check, such as a `scripts/check-no-links.mjs` run from a `.githooks/pre-commit` that `npm install` sets with `git config core.hooksPath`, or run it in a CI workflow when CI exists.
  - Keep "run test:integrity before push" in the auditor checklist.

## F7 — Info: the receipt can still differ from the voucher through the API

- **`landed_cost` (init.js:1024):** `payload.landed_cost` takes precedence over `voucherTaxable`. If it differs, the receipt posts a different GRNI credit than the voucher's debit.
- **`procurement_id` (init.js:1036, :1041 with inventoryService.js:216-219):** a `payload.procurement_id` that points at a *posted* bill makes `postStockInward` credit Purchase instead of GRNI. The voucher has already debited GRNI.
- **Reach:** the screen sends neither field (BusinessVoucherScreen.jsx:334-344). Both behaviours existed before.
- **Fix (no owner needed for the guard):** ignore `landed_cost` and `procurement_id` for purchase-voucher receipts, or refuse them with a guided message. Changing what gets posted would need the owner.

## F8 — Info: complexity of the replay

- **Cost per return posted:**
  - One query for lots (L rows) with three correlated subqueries per lot.
  - One query for the R earlier returns.
  - Then R + 1 calls to `take`, and each call filters and sorts every lot. That is O(R × L log L), and `rank` calls `billed` inside the comparator.
  - Over the life of one supplier and item, the total is O(R² × L log L).
- **Measured (P3):** 400 lots and 300 returns took 3.7 s in total. The last return took 17 ms. That is fine at this business's scale.
- **Index:** `goods_receipt_items.stock_inward_id` has no index, so each lot scans that table twice (`idx_vouchers_source` covers the `vouchers` lookup).
- **Fix (optional, no owner needed):**
  - Work out each lot's rank once for each as-of point.
  - Precompute `billed` per lot before sorting.
  - Merge the duplicate subquery (F1).
  - An index on `goods_receipt_items(stock_inward_id)` would be a schema change and needs approval. It is not needed today.

## F9 — Info: floating-point sums (C9 carried over)

- **Where:** :394-395 (`stockRate` = `value_minor / 100 / quantity`) and :420 (`units * rate` added as rupees).
- **What:** the sums are rounded once at the end, and the variance at :441-443 is done in minor units. Nothing is wrong today.
- **Fix (optional):** add up `paise(units * rate)` with PR #5's helpers.

## F10 — Info: the re-check after the backup compares paths only

- **Where:** main.js:1284 (dc40f03).
- **What:** the second call follows links again and checks the folder and that it is a file. A link swapped in at the same name is caught. A different file *written to the same path* is not, so the comment "one swapped in meanwhile is not launched" claims more than the code does.
- **Fix:** this is the security auditor's area (a hash or size/mtime check before and after). At minimum, reword the comment to "a link or folder swapped in meanwhile".

---

## Items for the owner

Nothing new beyond the pending decision card. That card already covers the return replay (posting order, as-of judgement), purchase-voucher receipts counting as billed (C4), Accounting Only (C3), and the receipt value (C2/N6).

When the card is answered, it may help to show the owner F5's "order receipts used up by a no-order return" line as part of the pool (B4) wording.

Only F1's optional "reversed bills keep counting as billed" variant would need a new owner OK. Everything else in this report is tests, KG-4 or documentation, and needs no owner OK.
