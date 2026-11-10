# Architecture audit: dc030e6..d661346

- Repo: /home/claude/gii-gem-erp, branch `claude/erp-full-automation-qbhv8k`, head `d661346` (one commit: "Close the dc030e6 audit findings and preserve those audits")
- Scope: `git diff dc030e6..d661346`, leaving out the `docs/audit/**` archive copies and manifest (12 files)
- Read against: AGENTS.md (no business logic in App.jsx or screens; no IPC, preload or route-key renames; guided errors; posting, profitability and GST changes need the owner's OK; no schema changes). Owner approvals on record, 10 Nov 2026 IST: the expense % fix (EXP) and the Purchase Price Variance ledger (CV).
- Previous report: audit-dc030e6-architecture.md (A1-A13)
- Auditor: in-house architecture auditor, read-only. Commands run: `git diff`, `node --test scripts/audit/audit2-regressions.test.mjs` (55/55 pass), `node scripts/verify-voucher-accounting-graph.js`, `verify-manual-graph.js`, `verify-knowledge.js` (all pass).

## Summary

No Critical or High findings. Most of A1-A13 are fixed. Two posting changes go beyond what decision CV covers and need the owner's OK. KG-4 and the policy still lag the manual on GST, and some tests named after a fix do not actually exercise it.

| # | Severity | Area | Finding |
|---|---|---|---|
| B1 | **Medium** (owner OK) | inventoryService.js:451 | The return's Trade Payables line now carries `linked_party_type: "supplier"`, so supplier returns appear in the Party Ledger and change each supplier's running balance. This is a posting and report change outside CV |
| B2 | **Medium** (owner OK) | inventoryService.js:378 | Returns with no order now count against every order's later returns (`OR sr.order_id IS NULL`). This changes posted GRNI and Trade Payables amounts, and any value left unused goes to PPV. Not in the policy or the manual |
| B3 | Medium | voucher-accounting-graph.json:717; policy :90 | The KG-4 `safetyRule` still says "no separate Debit Note for the same goods" with no GST caveat, and does not mention the FIFO or supplier-rate rules or the known limits. The commit message says KG-4 describes them. The help assistant reads this text, so the A2 ambiguity is still there |
| B4 | Low | A3 still open | There is still no recorded owner confirmation of FIFO by lot, netting in both buckets, WAC past every receipt, or (new) billed lots at `si.rate` |
| B5 | Low | audit2-regressions.test.mjs:934, 945 | Two tests do not exercise the fix they are named for: the wrong-type refusal through `postStockReturn`, and the zero-rate lot skip |
| B6 | Low | inventoryService.js:363, 377 | The Trade Payables skip mixes bases: earlier returns' TP value includes landed cost (posted before d661346) and WAC for units past every receipt, but it is now skipped off lots priced at `si.rate` |
| B7 | Low | voucher-accounting-graph.json:2, 5, 704, 686-692 | Housekeeping from A7 is only partly done: `lineNumber` is 407 but the function is at 409, `version` is still 1.0.0, and the `postStockAdjustment` entry still says no voucher |
| B8 | Low | supportBundleService.js:34-50, 52; main.js:1186 | The bound is now applied in the service (A9 fixed), but `createSupportBundle` does not apply it itself, and nested user fields are still kept |
| B9 | Low | main.js:330-339 vs 359 | A8 is fixed within `guarded()`, but `guarded` and `sessionGuarded` still use different argument rules, and no test covers either |
| B10 | Info | A12 gaps carried over | There are still no tests for the supplier-payment and expense posting-status backfill, or for the manifest refusal |

### Status of the dc030e6 findings

| Prev | Status | Evidence |
|---|---|---|
| A1 High: start-up fails on a wrong-type ledger | **Fixed** | init.js:802 passes `{ refuseWrongType: false }` and the seed returns null. The posting path keeps the default `true` (inventoryService.js:437, inside the transaction, so a refusal rolls back). The guided message points to Accounting > Books & Ledgers > Chart of Accounts, which exists in navigation.js:224. The lookup prefers an Expense match (init.js:813). The re-initialise test at :934 passes. See B5 |
| A2 High: GST on returns | **Answered (owner/CA)** | Manual :1318 no longer settles a GST practice ("ask your accountant"). Policy :87 records it as undecided. KG-4 has not caught up (B3) |
| A3 Medium: posting beyond CV | **Open (owner)** | No confirmation recorded in owner-decisions-pr4.md. d661346 adds two more posting changes (B1, B2). See B4 |
| A4 Medium: limits of the FIFO skip | **Mostly fixed / documented** | (2) Zero-rate lots are no longer consumed (:390). (3) Billed lots are priced at `si.rate`, without landed cost (:363). (1) and (4) are listed as known limits in policy :86. Residual: B6 |
| A5 Medium: KG4-GAP-002 false claim | **Fixed** | :1764 now says "Partly closed … warehouse transfers still post none" |
| A6 Low: docs lag | **Fixed** | Policy :83-87 covers FIFO, both nettings, WAC past every receipt, zero-price receipts, the known limits and GST. Manual step 2 now names the supplier, the order and the item. The order-less netting is missing (B2) |
| A7 Low: KG-4 housekeeping | **Partly fixed** | `Journal` casing fixed. Line number and version are still off (B7) |
| A8 Low: guarded company | **Fixed in guarded** | main.js:338 records the grant with the same `payload` used for the check. No test (B9) |
| A9 Low: placement | **Fixed** | `boundedScreenContext` is in supportBundleService.js:34 and main.js only imports it. Recursive stripping is not done (B8) |
| A10 Low: re-export | **Fixed** | billingService.js no longer re-exports it, and nothing imports it from there |
| A11 Low: verify-fsr-2b1 strictness | **Partly fixed** | :182 now matches any case. It still does not report the group when the ledger sits outside PURCHASES. A company whose seed skipped a wrong-type ledger (A1 path) fails here, which is correct, but the message does not say why |
| A12 Low: tests | **Partly fixed** | New tests cover bundle pruning to 20, the size cap and crash-list retention, Trade Payables netting of an earlier return, landed cost excluded, returns with and without an order, and the supplier tag. Still missing: B5, B10 |
| A13 Info: manifest | **Fixed** | The usage line mentions `--init`, and an empty or non-array `entries` is refused (update-audit-manifest.js:28-36) |

Checked with no finding:

- No IPC channel, preload or route-key renames. The `health:support-bundle` channel is unchanged, and only the bundle's inner field changed from `screenContext` to `screenContextJson` (the ipc-security test is updated to match).
- No schema DDL. `voucher_lines.linked_party_type/linked_party_id` already exist (schemaDefinitions.js:377).
- No logic in App.jsx or any screen. No renderer code changed apart from the KG-4 JSON.
- The bundle file name now carries a per-process sequence, so two bundles made in the same millisecond no longer collide. Names still sort in time order across restarts, because the timestamp comes first. Pruning never deletes the new bundle (`slice(MAX_SUPPORT_BUNDLES - 1)` after excluding it).
- Storing the screen context as one string prevents it from expanding in the pretty-printed file, and stops a screen from forging the top-level `user_id`/`user_name` set by `signedInHealthContext`.

---

## B1 — Medium (owner OK): supplier link on the return's Trade Payables line

- **Where:** src/main/services/inventoryService.js:451
- **What:** the Dr Trade Payables line now carries `linked_party_type: "supplier", linked_party_id: row.supplier_id`. `partyLedgerReport` (reportBuilders.js:174-213) selects every line with a supplier or department link. Supplier returns therefore now appear in each supplier's Party Ledger and reduce that supplier's running payable. The tag matches purchase vouchers (accountingService.js:658) and supplier payments (:767), so it is arguably the correct behaviour.
- **Why it matters:** it changes posted voucher data and a party report. Decision CV approved the PPV ledger and the GRNI/Trade Payables split, not a party-ledger change. AGENTS.md requires these to be flagged. Supplier returns posted before d661346 have no tag, so the report now shows tagged and untagged returns side by side, and the older ones leave the supplier's balance too high.
- **Fix:** get the owner's OK, recorded next to CV. If the owner approves, decide whether returns already posted should be tagged by a one-time, audited data repair (no schema change). If not, add a "known limit" line to policy §6 saying returns posted before d661346 do not show in the Party Ledger.

## B2 — Medium (owner OK): returns with no order net against every order

- **Where:** inventoryService.js:378 (`earlier()`: `OR sr.order_id IS NULL`), with the explanation in the code comment at :350-352.
- **What:** a supplier return with no order now counts as "already returned" against any later return on a specific order for the same supplier and item. Suppose the supplier delivered the item on orders A and B, and a return with no order took A's goods. A later return on order B skips that value off B's receipts. GRNI or Trade Payables is then under-cleared for B, and the gap goes to PPV. The code comment admits this ("can leave value that is not used up"). It is the safer direction, since nothing is cleared twice, but it changes posted amounts.
- **Why it matters:** this is another posting rule beyond CV. It also appears only in a code comment: FSR-2A4 policy §6 and manual 10.6 do not mention it.
- **Fix:** take this to the owner together with A3/B4. Add a bullet to policy §6 ("A return with no order counts against later returns on any order of that supplier and item; value it did not use goes to PPV"). Add a sentence to manual 10.6 step 2 telling users to select the order whenever there is one.

## B3 — Medium: KG-4 and the policy still say "no Debit Note" without the GST caveat

- **Where:** src/renderer/knowledge/voucher-accounting-graph.json:717 (`safetyRule`); docs/architecture/fsr-2a4-perpetual-inventory-policy.md:90.
- **What:** the manual was reworded to "the same goods value … does not reverse the input GST … ask your accountant". The KG-4 `safetyRule` still ends "The return already reduces the payable; no separate Debit Note for the same goods". It also says "at the supplier's receipt prices" with no mention of FIFO, landed cost being excluded, or the pool limits. Policy :90 keeps the unqualified "Do not also post a Debit Note for the same goods" only three lines after :87, which says GST is undecided. The commit message says KG-4 describes the pool rules, their limits and GST; it does not.
- **Why it matters:** KG-4 feeds the help assistant. Users who ask the assistant get the reading A2 warned about (raise no Debit Note, so ITC is never reversed). The three documents no longer agree.
- **Fix:** change `safetyRule` to say the following, in the manual's terms: "… taken from this supplier's receipts oldest first (billed at the supplier's rate without landed cost). The return reduces the payable by the goods value, so do not raise a Debit Note for that value. Input GST on billed goods is not reversed (undecided; see FSR-2A4 §6)." Change policy :90 to "the same goods value". Re-run `verify-voucher-accounting-graph`.

## B4 — Low: owner confirmation for the pool pricing is still not recorded (A3)

- **Where:** owner-decisions-pr4.md (CV, :15 and :114); policy §6.
- **What:** FIFO by receipt, netting both GRNI and Trade Payables, WAC past every receipt, and now (d661346) billed lots at `stock_inwards.rate` instead of landed cost or the bill line, plus B1 and B2. All of these are posting changes. No owner line confirms them.
- **Fix:** put one question to the owner covering A3, B1 and B2, and record the answer next to CV.

## B5 — Low: two tests do not exercise their fix

- **Where:** scripts/audit/audit2-regressions.test.mjs:934-942 and :955-960.
- **What:**
  - The A1 test is named "… only the return refuses", but it calls `ensurePurchasePriceVarianceAccount` directly. It never posts a return with a variance against the wrong-type ledger, so it does not show that the return refuses with the guided message, is rolled back, and leaves the stock ledger and voucher untouched.
  - The zero-rate test posts a return of a fresh item that has no earlier returns, so `skip` is 0 and the new guard `lot.rate > 0` (inventoryService.js:390) never runs. The test would pass on dc030e6 too.
- **Fix:**
  - (a) After re-initialising, post a supplier return whose WAC differs from the receipt rate. Assert that it throws /Chart of Accounts/, that the return stays Draft, and that no `stock_ledger` row was added.
  - (b) Receive 5 units of an item at rate 0, then 5 at rate 100. Return 2, then return 2 more. Assert that GRNI is cleared by the expected amount and that the zero-rate lot is not consumed by the skip.

## B6 — Low: the Trade Payables skip mixes valuation bases

- **Where:** inventoryService.js:363 (billed lots now `inward_quantity * si.rate`) against :373-378 (`earlier("Trade Payables")` = sum of earlier returns' Trade Payables debits).
- **What:** the skip value comes from earlier returns' posted Trade Payables debits. Some of those were priced on another basis:
  - returns posted before d661346 used landed cost;
  - the part of any earlier return that went past every receipt was priced at WAC.
  Taking that value off lots now priced at `si.rate` skips the wrong number of units, and the gap goes to PPV. A billed receipt's `si.rate` can also differ from the rate on the posted bill.
- **Fix:** list both in policy §6 "Known limits". Consider leaving the WAC part (`beyondReceipts`) out of the skip: the narration or audit `new_value` could record it, which needs no schema change. Price billed lots from the posted bill line when one exists.

## B7 — Low: KG-4 housekeeping left over from A7

- **Where:** voucher-accounting-graph.json:704 (`lineNumber: 407`; `postStockReturn` is at inventoryService.js:409), :2 and :5 (`schemaVersion` and `version` still 1.0.0), :686-692 (`postStockAdjustment` still has `voucherTypeCreated: null` and line 239; the function posts a Journal at :281).
- **Fix:** set the line to 409, or drop line numbers that drift with every edit. Bump `version` to 1.0.1, or say in KG4-GAP-002 that the bump is deferred to v1.1. Either update `postStockAdjustment` now or name it explicitly in KG4-GAP-002 as still stale.

## B8 — Low: the support-bundle bound is not applied inside the service

- **Where:** supportBundleService.js:34-50 and :52; main.js:1186.
- **What:** `boundedScreenContext` now sits in the right module, but main.js still has to remember to call it before `createSupportBundle`. `createSupportBundle` writes whatever `context` it is given, so a future caller could pass a raw screen object and skip the 1 MB bound. Only top-level user keys are stripped; nested `user_name` or `userId` values are kept in the text. That is low risk now that the screen context is an opaque string and cannot forge the trusted top-level fields.
- **Fix:** have `createSupportBundle(…, context, { screenContext })` call `boundedScreenContext` itself, so main.js passes the raw value. Optionally strip user keys at any depth with a `JSON.stringify` replacer.

## B9 — Low: the two guard wrappers use different argument rules, untested

- **Where:** main.js:330 (`guarded`: `firstPayload(args)`, the first plain object in any position) and :359 (`sessionGuarded`: first argument only).
- **What:** each wrapper is now consistent within itself, which fixes A8. Across the two wrappers, a handler shaped `(id, payload)` is checked against the payload's company under `guarded`, and against no company under `sessionGuarded`. The dc030e6 comment said a screen's extra argument must not set the company, and that intent is now dropped from `guarded` without being written down. No test covers either rule.
- **Fix:** add a comment at :330 saying `guarded` deliberately reads the first object in any position because its handlers take `(id, payload)`. Add an ipc-security test where an AUDITED_GRANTS channel is called with `(id, { company_id: X })` and the grant row and permission check both record X.

## B10 — Info: test gaps carried over from A12

- No test for the `backfillPostingStatuses` paths that touch `supplier_payments` (Draft → Posted) or `expense_entries` (voucher Reversed), or for a Draft row whose voucher is Reversed.
- No test that `update-audit-manifest.js` refuses a missing, corrupt or empty manifest without `--init`.
- The bill-after-return and back-dated-receipt limits are documented but have no tests that pin the current behaviour. A test would catch any silent change.
