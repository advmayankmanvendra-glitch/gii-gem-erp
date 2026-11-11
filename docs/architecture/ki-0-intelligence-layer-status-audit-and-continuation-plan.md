# KI-0 - ERP Intelligence Layer Status Audit and Continuation Plan

Date: 2026-07-14

## 1. Executive Summary

KI-0 was performed as an audit-only phase. No chatbot, LLM integration, posting logic, voucher logic, ledger logic, database schema, or UI redesign was implemented.

The Enterprise Intelligence Layer is real and partially mature:

- BRAIN-1 is registered and active as an ERP knowledge repository.
- KG-1 is registered, active, and passes the dedicated knowledge validation script.
- RG-1 is registered, active, and materially richer than KG-1 for renderer dependency analysis.
- DG-1, WG-1, and AG-1 are registered as planned, not implemented graph assets.

The correct next phase is **KG-2 / WG-1 Workflow Graph Foundation**, with a narrow scope: formalize the approved Work Order / Supply Order lifecycle into a machine-readable workflow graph without changing live ERP behavior.

Safe to proceed: **Proceed after closing current dirty-tree refactor governance and treating `verify:audit` nonzero warning as a known gate item.**

## 2. Current KG / Brain Stage Completion Table

| Stage | Status | Evidence | Notes |
|---|---:|---|---|
| KG-0: Post-extraction stabilization gate | Partial | Current working tree has uncommitted init/service extraction changes. Build and major verification pass, but governance closure is pending. | Do not start implementation phases until dirty-tree refactor work is committed/tagged or intentionally held. |
| KG-1: Knowledge Graph Foundation | Completed | `src/renderer/knowledge`, `scripts/verify-knowledge.js`, 167 validated entries. | Validation passes with 0 errors. |
| KG-2: Workflow Graph | Partial / Planned | Workflow governance docs and ERP Brain workflow repository exist. `repository/graph-registry.json` marks WG-1 planned. | Workflow content exists, but not as a registered graph artifact. |
| KG-3: Database Graph | Planned | `repository/graph-registry.json` marks DG-1 planned. | Database refactor is active; DG should wait until init/service extraction stabilizes. |
| KG-4: Voucher and Accounting Graph | Partial | Accounting KG entries, double-entry audit, voucher docs, business voucher modules exist. | No dedicated accounting/voucher graph yet. |
| KG-5: Document and Manual Graph | Partial | Manuals exist under `docs/manuals`; help modules exist. | No dedicated document/manual graph or cross-reference index yet. |
| KG-6: Renderer Dependency Graph | Completed | RG-1 active at `src/renderer/knowledge/renderer-graph.json`. | `verify:audit` reports RG-1 valid with 114 routes, 36 screens, 26 components. |
| KG-7: Verification and Audit Graph | Planned | Audit scripts exist; AG-1 planned. | No audit graph artifact yet. |
| KG-8: Knowledge Search Index | Partial | KG search and ERP Brain search services exist. | Search is source-backed but not yet a governed index artifact. |
| KG-9: Contextual Help Mapping | Partial | `src/renderer/modules/helpAssistant` and screen help catalog exist. | Useful coverage, but not fully reconciled with KG/BRAIN. |
| KG-10: KG Validation and Governance | Partial | `verify:knowledge`, `verify:audit`, graph registry, EIL rules exist. | Governance exists; audit script exits nonzero on warning. |
| BRAIN-1: ERP Brain Repository | Completed / Active | `src/renderer/modules/erpBrain/repository`, 214 registered entries in graph registry. | Audit pack validates repository files and IDs. |
| BRAIN-2: Source-backed search service | Partial | `repositorySearchService.js` exists. | Direct Node import fails on JSON import attributes; renderer bundling may resolve it. |
| BRAIN-3: Contextual help assistant | Partial | Help Assistant modules exist. | Safe guidance layer exists, but KG/BRAIN reconciliation is not complete. |
| BRAIN-4: Read-only ERP assistant | Partial | Help assistant has safe guidance/readiness concepts. | No live arbitrary record inspection; boundaries should remain. |
| BRAIN-5: Future LLM gateway | Planned / Deferred | No LLM integration found. | Correctly deferred. |

## 3. Existing Intelligence Asset Inventory

| Asset Area | Current Status |
|---|---|
| `repository/graph-registry.json` | Present. Registers BRAIN-1, KG-1, RG-1 active; DG-1, WG-1, AG-1 planned. |
| `repository/schema/brain.schema.json` | Present. |
| `repository/schema/kg.schema.json` | Present. |
| `repository/schema/renderer-graph.schema.json` | Present. |
| `src/renderer/knowledge` | Present. Contains registry, schema, renderer graph, renderer graph docs, tally knowledge, and 10 module metadata files. |
| `src/renderer/modules/erpBrain` | Present. Contains loader, search service, and repository JSON files for modules, workflows, reports, screens, rules, glossary, navigation, and errors. |
| `src/renderer/modules/helpAssistant` | Present. Contains contextual help, intent, scoring, readiness, data mode, and answer modules. |
| `scripts/verify-knowledge.js` | Present and passing. |
| `scripts/verify-audit.js` | Present. Reports 0 fails, 1 warning, but exits code 1. |
| `docs/architecture` | Present. Includes EIL, graph registry, workflow governance, chain of command, Work Order parent rule, business voucher matrix, and permanent architecture rules. |
| `docs/audit` | Present. Includes double-entry accounting audit and voucher dashboard Work Order gap audit. |
| `docs/manuals` | Present. Includes 10 user/manual/checklist documents. |
| Database graph files | Not implemented. DG-1 is planned. |
| Workflow graph files | Not implemented as graph. Workflow repository/docs exist. WG-1 is planned. |
| Audit graph files | Not implemented. AG-1 is planned. |

## 4. KG-1 Validation Result

KG-1 exists and validates.

Validation evidence:

- `src/renderer/knowledge/modules/masters.js`: 9 entries
- `operations.js`: 19 entries
- `inventory.js`: 20 entries
- `accounting.js`: 28 entries
- `gstTax.js`: 7 entries
- `receivablesPayables.js`: 26 entries
- `reports.js`: 25 entries
- `dashboards.js`: 8 entries
- `utilities.js`: 17 entries
- `helpTraining.js`: 8 entries

Total: **167 entries, 0 errors, 0 warnings**.

KG-1 findings:

- Module nodes are present.
- Screen/route keys are present for many screens.
- IDs are stable and validated for uniqueness.
- Status metadata exists.
- Accounting/GST/inventory/profitability impact fields are required and validated.
- No live transactional data is embedded in KG metadata.
- KG search covers many operational features.
- Direct KG search for "Bill History" returned 0 hits, so synonym/navigation coverage should be improved.
- KG-1 still needs a reconciliation pass against post-refactor renderer and service paths. RG-1 is stronger than KG-1 for extracted module path accuracy.

## 5. ERP Brain Validation Result

ERP Brain assets exist:

- `src/renderer/modules/erpBrain/loaders/repositoryLoader.js`
- `src/renderer/modules/erpBrain/services/repositorySearchService.js`
- `src/renderer/modules/erpBrain/repository/modules/index.json`
- `workflows/index.json`
- `reports/index.json`
- `screens/index.json`
- `rules/index.json`
- `glossary/index.json`
- `navigation/index.json`
- `errors/index.json`

Audit evidence from `verify:audit`:

- modules: 17 entries, 17 unique IDs
- workflows: 6 entries, 6 unique IDs
- reports: 31 entries, 31 unique IDs
- screens: 30 entries, 30 unique IDs
- rules: 40 entries, 40 unique IDs
- glossary: 40 entries, 40 unique IDs
- navigation: 20 entries, 20 unique IDs
- errors: 30 entries, 30 unique IDs
- Repository loader exists.
- Search service exists.
- No database/write/posting imports detected in ERP Brain module.

Brain findings:

- Repository loader is active.
- Repository search service is active.
- Registry exists through `repository/graph-registry.json`.
- Schema exists.
- Knowledge source loader exists.
- Manual loader is not implemented as a dedicated loader.
- Graph loader is not implemented as a dedicated loader.
- Search index is partial; search is runtime scanning, not a governed generated index.
- Screen-wise help map exists partially through Help Assistant and screen metadata.
- Contextual help provider exists partially.
- Read-only assistant boundary exists conceptually in Help Assistant governance and behavior.
- Direct Node import of `src/renderer/modules/erpBrain/index.js` failed because JSON module imports require import attributes in Node 24. This does not prove renderer failure because Vite build passes, but it means Brain is currently bundler-dependent for direct runtime consumption.

## 6. Feature-to-KG Coverage Matrix

| Feature | Source Exists | KG Exists | Manuals | Verification | Workflow Mapping | DB Mapping | Accounting/Voucher Impact |
|---|---:|---:|---:|---:|---:|---:|---:|
| Dashboard | Yes | Yes | Yes | Yes | Partial | Partial | Partial |
| Masters | Yes | Yes | Yes | Yes | Partial | Partial | Low |
| Company Context | Yes | Yes | Yes | Yes | Partial | Partial | High |
| Government Department | Yes | Yes | Yes | Partial | Partial | Partial | Medium |
| Supplier | Yes | Yes | Yes | Partial | Partial | Partial | Medium |
| Item | Yes | Yes | Yes | Partial | Partial | Partial | Inventory |
| Employee | Yes | Yes | Yes | Partial | Partial | Partial | Low |
| Bank | Yes | Yes | Yes | Yes | Partial | Partial | Accounting |
| Warehouse | Yes | Yes | Yes | Yes | Partial | Partial | Inventory |
| Tender / Lead | Partial | Partial | Partial | Unknown | Partial | Unknown | None direct |
| Query / Requirement | Partial | Partial | Partial | Unknown | Partial | Unknown | None direct |
| Quotation | Partial | Partial | Partial | Unknown | Partial | Unknown | None direct |
| Negotiation | Partial | Partial | Partial | Unknown | Partial | Unknown | None direct |
| Purchase Order / GeM Order | Yes | Yes | Yes | Partial | Yes | Partial | Downstream |
| Work Order / Supply Order | Yes | Yes | Yes | Yes | Yes | Partial | None direct |
| Procurement Planning | Yes | Yes | Yes | Yes | Yes | Partial | Downstream |
| Supplier Purchase Orders | Partial | Partial | Yes | Partial | Partial | Partial | Purchase/payable |
| GRN | Yes | Yes | Yes | Yes | Yes | Partial | Inventory/payable |
| Inventory Reservation | Yes | Yes | Yes | Yes | Yes | Partial | Inventory |
| Delivery Challan | Yes | Yes | Yes | Yes | Yes | Partial | Inventory/customer evidence |
| Installation | Partial | Partial | Partial | Unknown | Partial | Unknown | None direct |
| CRAC | Yes | Yes | Yes | Partial | Yes | Partial | Billing readiness |
| Billing / GST Invoice | Yes | Yes | Yes | Yes | Yes | Partial | Sales/GST/receivable |
| Receivables | Yes | Yes | Yes | Yes | Yes | Partial | Receivable ledger |
| Receipts | Yes | Yes | Yes | Yes | Yes | Partial | Receipt voucher |
| Supplier Payments | Yes | Yes | Yes | Yes | Partial | Partial | Payment voucher |
| Expenses | Yes | Yes | Yes | Yes | Partial | Partial | Expense/accrual |
| Business Vouchers | Yes | Yes | Yes | Yes | Partial | Partial | High |
| Accounting Vouchers | Yes | Yes | Yes | Yes | Partial | Partial | High |
| Opening Balances | Yes | Yes | Yes | Yes | Partial | Partial | High |
| Trial Balance | Yes | Yes | Yes | Yes | Partial | Partial | Read-only report |
| Profit & Loss | Yes | Yes | Yes | Yes | Partial | Partial | Read-only report |
| Balance Sheet | Yes | Yes | Yes | Yes | Partial | Partial | Read-only report |
| Cash / Bank Book | Yes | Yes | Yes | Yes | Partial | Partial | Read-only report |
| GST Reports | Yes | Yes | Yes | Yes | Partial | Partial | GST |
| TDS Reports | Yes | Partial | Yes | Yes | Partial | Partial | TDS |
| Stock Ledger | Yes | Yes | Yes | Yes | Partial | Partial | Inventory |
| Inventory Valuation | Yes | Yes | Yes | Yes | Partial | Partial | Inventory/accounting |
| Profitability Analysis | Yes | Yes | Yes | Yes | Yes | Partial | High |
| Bank Reconciliation | Yes | Yes | Yes | Yes | Partial | Partial | Accounting |
| Tally XML Import | Yes | Yes | Yes | Partial | Partial | Partial | Migration risk |
| Tally Master Migration | Yes | Yes | Yes | Partial | Partial | Partial | Migration risk |
| Spreadsheet Import / Export | Yes | Partial | Yes | Partial | Partial | Partial | Import risk |
| Browser Fallback API | Yes | Partial | Partial | Unknown | No | No | None |
| Help / Manuals | Yes | Yes | Yes | Yes | Partial | No | None |
| Audit Log | Yes | Partial | Yes | Yes | Planned | Planned | Audit |
| Backup / Restore | Yes | Yes | Yes | Yes | Partial | Partial | Recovery |
| Approval Queue | Yes | Yes | Yes | Yes | Partial | Partial | Control |
| Financial Year Locking | Yes | Yes | Yes | Yes | Partial | Partial | High |

## 7. Feature-to-Brain Coverage Matrix

| Coverage Area | Brain Status |
|---|---|
| Modules | Covered through 17 repository module entries. |
| Workflows | Covered as repository content, but not registered as WG-1 graph. |
| Reports | Repository content exists and audit validates 31 entries. Runtime search shape needs review because reports JSON is root-array shaped. |
| Screens | Covered through 30 screen entries. |
| Rules | Covered through 40 rule entries. |
| Glossary | Repository content exists and audit validates 40 entries. Runtime search shape needs review because glossary JSON is root-array shaped. |
| Navigation | Repository content exists and audit validates 20 entries. Runtime search shape needs review because navigation JSON is root-array shaped. |
| Errors | Repository content exists and audit validates 30 entries. Runtime search shape needs review because errors JSON is root-array shaped. |
| Manuals | Manuals exist, but no dedicated Brain manual loader/index exists. |
| Help Assistant | Partial integration through Help Assistant modules, not a full Brain/KG reconciled assistant. |

## 8. Workflow Mapping Coverage

The approved lifecycle is documented in architecture governance:

Lead / Tender -> Query / Requirement -> Quotation -> Negotiation -> Purchase Order / GeM Order -> Work Order / Supply Order -> Procurement Planning -> Supplier Purchase Orders -> GRN -> Inventory Reservation -> Delivery Challan -> Installation -> CRAC -> Sales Invoice / GST Invoice -> Department Receivable -> Receipt -> Order Closure -> Profitability Analysis.

Validation findings:

- Work Order / Supply Order is explicitly documented as the operational parent entity in architecture rules.
- `workflow-governance-registry.md` registers `GOVERNMENT_SUPPLY_LIFECYCLE`.
- ERP Brain workflows include Supply Order, procurement, GRN, stock receipt, delivery challan, billing, receivable, receipt, and profitability stages.
- Lead/Tender, Query/Requirement, Quotation, and Negotiation are weaker in implementation/KG mapping than downstream operations.
- Installation is partly represented through CRAC/delivery readiness, but not clearly separated as a full graph stage.
- Voucher Dashboard gap is already documented: it should not hide the Work Order / Supply Order root relationship.
- No dedicated WG-1 graph prevents machine-checked workflow edges and unsafe-skip validation.

## 9. Database Graph Readiness

DG-1 is not ready for implementation until the current init/service extraction work is stabilized and committed.

Reasons:

- `init.js` is actively being reduced and services are being extracted.
- Current working tree has uncommitted database/service extraction changes.
- A DG-1 graph generated before closure may lock unstable file boundaries.

Recommended DG-1 timing: after the current init refactor phase has a commit, restore tag, and clean verification evidence.

## 10. Voucher / Accounting Graph Readiness

Voucher/accounting graph readiness is **partial**.

Strong evidence:

- Double-entry accounting audit exists.
- Accounting verification passes.
- Financial verification passes.
- Controls verification passes.
- Business voucher screen and intelligence panel exist.
- Voucher inventory verification passed through `verify:erp`.

Boundary:

- KG/BRAIN must remain read-only over accounting rules.
- No graph phase should modify `createBalancedVoucher`, posting, reversal, `ledger_entries`, `voucher_lines`, trial balance, P&L, balance sheet, accounting write policy, or financial year lock controls.

Recommended timing: implement after WG-1 and DG-1, because voucher behavior depends on both workflow and database relationships.

## 11. Manual / Help Mapping Readiness

Manual/help readiness is **partial but useful**.

Evidence:

- 10 manuals/checklists exist under `docs/manuals`.
- Help Assistant modules exist.
- Screen help catalog exists.
- Rule 32 permits navigation/location guidance as safe.

Gaps:

- Manuals are not loaded by a dedicated Brain manual loader.
- Manuals are not registered as KG-5 graph nodes.
- Help Assistant answers are not fully reconciled against KG/BRAIN/route registry.
- Synonym coverage gaps exist, such as "Bill History" returning no KG direct hit.

Recommended timing: after KG-2/WG-1 or alongside a small KG-9 help-mapping cleanup.

## 12. Verification Script Results

| Command | Result | Notes |
|---|---:|---|
| `npm.cmd run build` | PASS | Vite build completed. Large chunk warning remains. |
| `npm.cmd run verify:knowledge` | PASS | 167 KG entries, 0 errors, 0 warnings. |
| `npm.cmd run verify:audit` | WARNING / nonzero exit | 104 PASS, 3 INFO, 1 WARNING, 0 FAIL, 0 CRITICAL. Warning: high-risk file `App.jsx`. Script exits code 1. |
| `npm.cmd run verify:erp` | WARNING | Final WARNING due to `verify:audit`; report says Safe to Commit: Yes, Safe to Lock: Yes. |
| `npm.cmd run verify:accounting` | PASS | Development profile, balanced zero dataset. |
| `npm.cmd run verify:financials` | PASS | Trial balance, P&L, balance sheet, receivables, payables, GST, TDS all zero-difference. |
| `npm.cmd run verify:controls` | PASS | 12 passed, 0 failed. |

## 13. Known Gaps

1. Current working tree is dirty from OpenCode init/service extraction work.
2. Latest init/service extraction does not yet have a visible commit/restore tag in the working tree state.
3. `verify:audit` exits code 1 even with 0 failures because it treats the App.jsx high-risk warning as non-clean.
4. BRAIN-1 direct Node consumption fails under Node 24 JSON import-attribute rules.
5. Brain repository JSON shapes are not uniform; some are wrapped objects and others are root arrays.
6. KG search lacks direct "Bill History" synonym coverage.
7. WG-1 is not implemented as a registered graph.
8. DG-1 is not implemented and should wait for database refactor stabilization.
9. AG-1 is not implemented.
10. Manuals exist but are not loaded through a dedicated Brain manual loader.
11. Workflow unsafe-skip rules are documented but not machine-validated by a graph.
12. Installation stage is not clearly separated from delivery/CRAC in current mappings.
13. Lead/Tender, Query/Requirement, Quotation, and Negotiation are weaker than downstream Work Order-to-profitability coverage.

## 14. Safe KG Interactivity Recommendation

Safe now:

- Static KG registry.
- Searchable KG.
- Read-only KG search result viewer.
- Read-only manual/help reference viewer.
- Screen-wise contextual help using existing route and help metadata.

Safe after KG-2 / WG-1:

- Clickable workflow trace viewer.
- Work Order / Supply Order lifecycle map.
- Read-only workflow dependency viewer.

Safe after DG-1:

- Database dependency viewer.
- Source table / dependent table explorer.

Safe after KG-4:

- Voucher impact viewer.
- Accounting graph explanation layer.

Defer:

- Chat-style assistant.
- LLM gateway.
- Action-taking assistant.
- Live record inspection assistant.
- Any assistant that posts, reverses, deletes, restores, approves, alters accounting, or alters inventory.

## 15. Recommended Next Phase

Recommended next phase: **KG-2 / WG-1 Workflow Graph Foundation**.

Reason:

- KG-1 and BRAIN-1 already exist.
- RG-1 already exists and is active.
- Workflow governance is documented but not graph-validated.
- The Work Order / Supply Order chain is the main architectural decision currently needing machine-readable enforcement.
- DG-1 should wait until init/service extraction stabilizes.
- Voucher/accounting graph should wait until workflow and database dependencies are formalized.

Proposed KG-2 / WG-1 scope:

- Create a registered read-only workflow graph artifact.
- Model `GOVERNMENT_SUPPLY_LIFECYCLE`.
- Mark Work Order / Supply Order as operational parent/root.
- Encode stage order, optional stages, allowed skip rules, accounting start, inventory start, GST start, closure stage, and reporting stage.
- Add validation script coverage for workflow graph integrity.
- Do not modify ERP runtime behavior.
- Do not add chatbot/LLM/action functionality.

## 16. Safe to Proceed Conclusion

Decision: **Proceed after fixing blockers / governance closure.**

Blockers before starting KG-2/WG-1 implementation:

1. Close the current dirty OpenCode init/service extraction state with final verification, commit, and restore tag, or explicitly document that KI work starts from a dirty baseline.
2. Decide whether `verify:audit` warning exit code is acceptable for documentation-only phases or should be fixed in the audit script policy.
3. Record the KI-0 report as the continuation reference.

Once these are closed, KG-2 / WG-1 is the correct next intelligence phase.
