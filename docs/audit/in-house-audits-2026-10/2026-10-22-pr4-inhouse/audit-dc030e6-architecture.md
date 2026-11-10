# Architecture audit: 605a873..dc030e6

- Repo: /home/claude/gii-gem-erp, branch `claude/erp-full-automation-qbhv8k`, head `dc030e6`
- Scope: `git diff 605a873..dc030e6`, leaving out the `docs/audit/**` archive copies (17 files, +307/-135)
- Read against: AGENTS.md (no business logic in App.jsx or screens; no IPC, preload or route-key renames; guided errors; posting, profitability and GST changes need the owner's OK; no schema changes). Owner approvals on record, 10 Nov 2026 IST: the expense % fix (EXP) and a Purchase Price Variance ledger (CV).
- Auditor: in-house architecture auditor, read-only. Commands run: `git diff` and `git show 4fbb777`, and `node scripts/verify-voucher-accounting-graph.js`, which passes.

## Summary

| # | Severity | Area | Finding |
|---|---|---|---|
| A1 | **High** | init.js:800 / 812-815 | The new wrong-type refusal in `ensurePurchasePriceVarianceAccount` runs at every start-up through `seedAccounts`, so a same-name non-Expense ledger stops the database from opening |
| A2 | **High** (owner/CA decision) | Supplier return GST, manual 10.6 | A return of billed goods debits Trade Payables at the taxable receipt value only. Input GST is not reversed, and the manual now tells users not to raise a Debit Note |
| A3 | Medium (owner OK) | inventoryService.js:352-401 | FIFO lot pricing, and netting earlier returns off Trade Payables, change posted amounts beyond what decision CV says. Both need an explicit owner OK |
| A4 | Medium | inventoryService.js:359, 395 | The value-based "already returned" skip mixes up the two buckets when a bill is posted after a return. It also eats zero-rate lots and prices billed lots at landed cost |
| A5 | Medium | voucher-accounting-graph.json:1763 | KG4-GAP-002 says warehouse transfers now post Journal vouchers. They do not |
| A6 | Low | FSR-2A4 doc §6, manual 10.6 step 2 | The docs do not describe the FIFO order, the Trade Payables netting or the known limits. The manual still says to pick a procurement record, which returns do not link to |
| A7 | Low | voucher-accounting-graph.json:702-717 | KG-4 entry: stale `lineNumber` (278; the function is at 404), lowercase `journal`, and the graph version was not bumped |
| A8 | Low | main.js:342 vs 352 | `guarded()` now takes the grant-row company from the first argument but still checks the permission against the first object argument in any position. Handlers called as `(id, payload)` now record company NULL |
| A9 | Low | main.js:215-225 | `boundedScreenContext` is support-bundle policy written in main.js; it belongs in supportBundleService |
| A10 | Low | billingService.js:4 | A leftover re-export of `expenseFormulaAmount` that nothing uses |
| A11 | Low | verify-fsr-2b1.js:176-184 | The check matches the exact name only, while `ensure…` now matches any case and reuses an existing ledger that may already sit in another group. A valid database can fail the check, with a misleading message |
| A12 | Low | Test coverage gaps | No tests for supplier-payment backfill, expense backfill, bundle pruning, earlier-Trade-Payables netting, a bill posted after a return, zero-rate lots, the manifest refusal, or the entity-search timer |
| A13 | Info | update-audit-manifest.js:3, 27 | The usage line does not mention `--init`. A readable manifest without `entries` is still treated as empty, so every report looks new |

Checked with no finding:

- No IPC channel, preload or route-key renames.
- No schema DDL. `supplier_payments.posting_status` already exists (schemaDefinitions.js:202).
- No business logic added to App.jsx or any screen. The renderer change is one line in a hook.
- The cherry-picked `backfillPostingStatuses` is byte-identical to 4fbb777, and the restart test came with it.
- Moving `expenseFormula.js` to `src/main/domain` is the right layer.
- The `tallyMasterBudget` refactor removes the duplication cleanly.
- Pruning support bundles inside `supportBundleService` is the right place.
- The electron-stub `getName` is needed by healthService.js:254 on the `health:support-bundle` test path.

---

## A1 — High: start-up can fail on a same-name ledger of the wrong type

- **Where:** src/main/database/init.js:812-815 (new throw); called at init.js:800 inside `seedAccounts`, which seedData.js:481 runs on every start and crudHelpers.js:453 runs on company create.
- **What:** dc030e6 made the lookup case-insensitive and added `throw new Error('The ledger "Purchase Price Variance" exists as …')` when the match is not an Expense. `seedAccounts` calls `ensurePurchasePriceVarianceAccount` for **every** company on **every** start. Suppose any company has a ledger named "purchase price variance" in any case as a Liability or Income, for example from a Tally migration. Then `initializeDatabase` throws and the app cannot open the books. The guidance says "Rename that ledger in Accounting > Ledgers", which the user cannot reach because the app does not start. Creating a new company fails the same way.
- **Why it matters:** this is an availability regression on the books database, caused by a change meant to give a guided error at posting time. The new test (audit2-regressions "the variance ledger refuses a same-name ledger of the wrong type") calls `ensure…` directly and never re-initialises, so it misses this.
- **Fix:** keep the throw only on the posting path. One way is to give `ensurePurchasePriceVarianceAccount(db, companyId, { refuseWrongType })` an option that `postStockReturn` sets. On the seed path, skip the company and log or flag it, for example through a health check or an `accounting_alerts` row, so the app still starts. Add a test that seeds a wrong-type ledger, re-runs `initializeDatabase`, and expects start-up to succeed and a supplier return with a variance to be refused with the guided message.

## A2 — High (needs owner/CA decision): GST on supplier returns of billed goods

- **Where:** inventoryService.js:359 (lot value = `stock_ledger.value`, which excludes GST); inventoryService.js:437-443 (return voucher lines); manual 10.6 step 5 (docs/manuals/GII-GeM-ERP-Complete-User-Operations-Manual.md:1318-1319); KG-4 safetyRule (voucher-accounting-graph.json:717).
- **What:** the bill posted Cr Trade Payables at gross value (taxable value plus GST) and Dr Input GST. The return now debits Trade Payables only for the taxable receipt value. The GST part of the payable stays open and the input tax credit stays claimed. At the same time the manual, the policy and KG-4 now say "Do not also issue a Debit Note for the same goods … Use a Debit Note only for a price or GST correction the return does not cover." Users can read that two ways:
  - They raise no Debit Note, so the ITC on returned goods is never reversed, which conflicts with CGST s.34 and the supplier's credit note.
  - They raise a full Debit Note, so the taxable part is reduced twice.
- **Why it matters:** AGENTS.md requires the owner's OK for any GST change. Decision CV approved the PPV ledger and the GRNI/Trade Payables split. It did not approve a GST treatment for returns, and the manual text sets user practice either way.
- **Fix:** ask the owner and the CA. Possible answers:
  1. The return voucher also posts Cr Input GST and Dr Trade Payables for the GST share of billed units.
  2. The manual tells users exactly what to raise: a "GST-only Debit Note" for the tax on returned billed goods. Check that the Debit Note flow can carry tax with no taxable value.

  Until the owner decides, reword step 5 so it does not settle a GST practice, and record the gap in the FSR-2A4 policy.

## A3 — Medium (owner OK): posted amounts go beyond what decision CV approved

- **Where:** inventoryService.js:340-401 (`supplierReturnSplit`).
- **What:** decision CV approved pricing at "the supplier's receipt prices" with the gap to PPV. 605a873 used the average unbilled and billed prices. dc030e6 changes the posted amounts in three ways:
  - FIFO pricing by lot (oldest receipt first).
  - Earlier returns are now taken off **Trade Payables** too (`earlier("Trade Payables")`). Before, only GRNI was netted.
  - Units beyond every receipt are valued at WAC.

  These are reasonable and they fix a correctness High, but they change the posting arithmetic for the same transaction.
- **Why it matters:** AGENTS.md says any posting change beyond what the owner approved must be flagged.
- **Fix:** get a one-line owner confirmation that "supplier's receipt price" means FIFO by lot, net of earlier returns, in both buckets. Record it next to decision CV in the FSR-2A4 policy.

## A4 — Medium: limits of the value-based FIFO skip

- **Where:** inventoryService.js:359-375 (`receiptLots`, `earlier`), 377-395 (`takeFrom`).
- **What:**
  1. **A bill posted after a return moves lots between buckets.** Example: a receipt of 10 @100 is unbilled, and a return of 5 posts Dr GRNI 500. A bill is then posted for that receipt, so the lot moves to the billed bucket. A new unbilled receipt of 10 @200 arrives. On the next return, `earlier("GRNI") = 500` is skipped off the *new* 200-rate lot (2.5 units), even though those units were never returned. GRNI is under-cleared, the billed bucket does not net the 5 units, and the difference lands in PPV. The value is recorded per account, not per lot, so the old return cannot be traced to the lot it came from.
  2. **Zero-rate lots** (free or replacement goods): `skip / lot.rate` is `Infinity`, so `skipped = available` and `skip` does not fall. Any positive skip eats every zero-rate lot, and the skip then carries on into later lots.
  3. **Billed lots are priced at landed cost.** postStockInward:184 sets `value = landed_cost || qty*rate`. A billed lot's rate can therefore include freight or other costs the supplier never charged, and the return debits Trade Payables for them. For GRNI this matches how GRNI was credited, but for Trade Payables it over-reduces what is owed to the supplier.
  4. **Back-dated receipts** inserted after earlier returns change the FIFO order those returns were assumed to follow.
- **Why it matters:** each case puts a wrong amount in a control account (GRNI or Trade Payables) and hides it in PPV, which looks like a legitimate variance.
- **Fix:**
  - (2): treat `lot.rate <= 0` as unskippable by value, or track the skip by quantity. Quantity can be derived from earlier returns' `stock_ledger.outward_quantity` split by voucher line ratio, or from a stored split.
  - (3): for billed lots, price from `procurement_items.rate` or the bill line, not from landed cost.
  - (1) and (4): within decision C2 (keep the pool), record each posted return's split quantities, for example in `posting_error`-style metadata or the voucher narration. A schema field would need approval. Re-derive from those quantities instead of from value. At minimum, document these as known limits (see A6) and add tests.

## A5 — Medium: KG4-GAP-002 says something false about warehouse transfers

- **Where:** src/renderer/knowledge/voucher-accounting-graph.json:1763-1766.
- **What:** the gap is marked "Closed by FSR-2A4: stock adjustments, stock returns **and warehouse transfers** now post Journal vouchers." `postWarehouseTransfer` (operationsService.js:145-191) writes only stock_ledger rows, with no voucher. That is correct, since value moves at WAC between warehouses inside one Inventory ledger, but the graph claim is wrong. The graph's own `postWarehouseTransfer` entry (:720-733) still says `voucherTypeCreated: null`, so the graph contradicts itself. `postStockAdjustment` (:684-694) still shows `voucherTypeCreated: null` although it now posts Inventory Adjustment Gain/Loss.
- **Why it matters:** KG-4 feeds the help assistant and the governance checks. A false "closed" note on a gap is worse than an open gap.
- **Fix:** say "stock adjustments and stock returns post Journal vouchers; warehouse transfers move value within Inventory and post none". Update the `postStockAdjustment` entry now rather than waiting for v1.1, or keep KG4-GAP-002 open and say it is partly closed.

## A6 — Low: docs lag the new design

- **Where:** docs/architecture/fsr-2a4-perpetual-inventory-policy.md:73-87; manual :1315 and :1318.
- **What:**
  - Policy §6 describes GRNI "less what earlier returns already cleared". It does not say that pricing is FIFO by receipt, that Trade Payables is also netted for earlier returns, or that units past every receipt go at WAC. It also does not list the limits in A4.
  - Manual step 2 still says "Select the procurement record and item". Supplier returns are pooled by supplier, item and order (decision C2) and have no procurement link.
- **Fix:** add the FIFO and netting rules and a "Known limits" list to §6. Change step 2 to "Select the supplier, the order (optional) and the item".

## A7 — Low: KG-4 `postStockReturn` entry housekeeping

- **Where:** voucher-accounting-graph.json:702-717.
- **What:**
  - `lineNumber: 278` is stale; the function is at inventoryService.js:404.
  - `voucherTypeCreated: "journal"` is lowercase, while every other entry uses `Journal`.
  - The graph `version`/`schemaVersion` stays at 1.0.0 although its content changed. AGENTS.md §25 asks for a version increment on graph changes, and the gap text itself refers to a future "v1.1".
- **Fix:** set the entry to `"Journal"` and line 404, and bump `version` to 1.0.1 or say why not. `verify-voucher-accounting-graph` passes today, so none of these is caught automatically.

## A8 — Low: `guarded()` reads the company from two different arguments

- **Where:** src/main/main.js:342 (`firstPayload(args)`, used for `enforcePermission`) and :352 (`firstPayload(args.slice(0, 1))`, used for `recordGrant`).
- **What:** the grant row is now pinned to the first argument, but the permission check still uses the first plain object in *any* position. `sessionGuarded` (:372) already uses only the first argument for both. For handlers shaped `(id, payload)`, such as `bank:manual-match`, `voucher-proposals:update` and `allocations:*-reallocate`, the grant row now records company NULL where it used to record the payload's company.
- **Fix:** use one rule for both. Either both use the first argument, as `sessionGuarded` does, or both use the handler's declared payload position. Add a test that a second-argument object cannot change the company used for the check.

## A9 — Low: support-bundle input policy lives in main.js

- **Where:** src/main/main.js:215-225 (`boundedScreenContext`, `MAX_SCREEN_CONTEXT_BYTES`).
- **What:** stripping user fields and capping at 1 MB is a support-bundle rule. It belongs in supportBundleService.js next to `MAX_SUPPORT_BUNDLES`. main.js should only connect the IPC call to the service. Only top-level user keys are stripped; nested `user_name` fields pass through.
- **Fix:** move it into the service as `createSupportBundle(…, { screenContext })` and strip the user keys recursively.

## A10 — Low: leftover re-export

- **Where:** src/main/services/billingService.js:4 `export { expenseFormulaAmount };`
- **What:** init.js now imports from `../domain/expenseFormula.js`, and nothing imports the formula from billingService. The re-export creates a second public path to the same function.
- **Fix:** remove it.

## A11 — Low: the verify-fsr-2b1 check is stricter than the code it checks

- **Where:** scripts/verify-fsr-2b1.js:176-184.
- **What:** the check requires `account_name = 'Purchase Price Variance'` with exact case and a `SYSTEM_SEED` assignment to PURCHASES. Since dc030e6, `ensure…` reuses an existing Expense ledger whose name matches in any case. The assignment insert also skips (`NOT EXISTS existing`) when that ledger is already in another group. A database that posts correctly then fails "Each company has one Purchase Price Variance ledger under Purchases".
- **Fix:** match with `LOWER(TRIM(account_name))`, and report the group the ledger is in when it is not PURCHASES. The current message hides the cause.

## A12 — Low: test coverage by change

| Change | Test | Gap |
|---|---|---|
| FIFO split | "GRNI is priced from what earlier returns left" (unbilled only); "part-billed return splits at each price" | No test for earlier Trade Payables netting, a bill posted after a return, zero-rate lots, landed cost on billed lots, or quantity past every receipt |
| PPV wrong-type refusal | direct call | No re-initialise test (A1) |
| backfillPostingStatuses | "reversed invoice stays Reversed after restart" (ported from 4fbb777) | No test for supplier_payments Draft→Posted, an expense_entries voucher in Reversed status, or a Draft row whose voucher is Reversed |
| expenseFormula move | existing audit2 :772 plus "typed amount wins" | Adequate; no direct unit test of the domain function |
| tallyMasterBudget | units-cap test, stock-items cap test | Adequate; the migration path is covered by the existing 9dac174 test |
| Support bundle | ipc-security "stays small whatever the screen sends" | No test for pruning to 20; nested user fields not checked |
| guarded grant company | none | See A8 |
| verify-fsr-2b1 | the script itself | — |
| Manifest `--init` | none | Missing or corrupt manifest refusal not tested |
| useEntitySearch timer | none | Renderer hook, no harness; acceptable |
| electron-stub getName | exercised by the support-bundle IPC test | — |

## A13 — Info: manifest script

- **Where:** scripts/update-audit-manifest.js:3 and 27.
- **What:** the usage comment does not mention `--init`. A manifest that parses but has no `entries` falls back to `[]`, which is the "every report looks new" case the refusal was meant to stop.
- **Fix:** refuse when `entries` is not an array unless `--init` is given, and update the usage line.
