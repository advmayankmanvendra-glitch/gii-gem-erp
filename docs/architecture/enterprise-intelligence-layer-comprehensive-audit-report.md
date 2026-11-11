# Enterprise Intelligence Layer Comprehensive Audit Report

## 1. Executive Summary

The Enterprise Intelligence Layer has a strong static graph and governance baseline: KG-1, WG-1, DG-1, KG-4, BRAIN-2, and BRAIN-3 artifacts exist; graph validators, build, and accounting/inventory controls pass. The layer remains read-only and no LLM, chatbot, live-record, or action-taking assistant was found.

However, source inspection found a **High** BRAIN-2 runtime defect that existing verification does not execute: `sourceBackedSearchIndex.js` declares `score` inside a block and uses it outside that block. Any non-empty index search reaches an out-of-scope `score` reference. This breaks the source-backed search consumed by BRAIN-3 low-confidence/no-match enrichment. The audit also found reliability, metadata freshness, synonym, and Help Assistant propagation gaps.

**Conclusion: Stabilization required before BRAIN-4 planning.** The existing rollup lock report remains historical evidence, but its source-backed runtime-readiness claim must be revalidated after BRAIN-2 stabilization.

## 2. Current Intelligence Layer Status

| Asset / Phase | Registry / Lock Status | Audit Result |
|---|---|---|
| BRAIN-1 ERP Knowledge Repository | Active | Repository structures and no-write boundary pass audit |
| KG-1 Knowledge Graph Foundation | Active | 167 entries validate; one stale route key found |
| RG-1 Renderer Intelligence Graph | Active | Available to BRAIN-2; known App.jsx high-risk warning remains |
| WG-1 / KG-2 Workflow Graph | Active / locked | Lifecycle and boundary rules validate; 10 active `screenRef` paths are stale |
| DG-1 Database Graph | Active / locked | 63 tables, 51 relationships, accounting protections and report mappings validate |
| KG-4 Voucher and Accounting Graph | Active / locked | Voucher, posting, reversal, and report mappings validate |
| BRAIN-2 Source-Backed Intelligence | Locked documentation exists | Static checks pass, but runtime search has a High defect |
| BRAIN-3 Contextual Help Assistant | Locked documentation exists | Context/safety wiring exists; BRAIN-2 fallback is impaired by BRAIN-2 defect |
| AG-1 Audit Intelligence Graph | Planned | Correctly not active |

## 3. Registry and Phase Status Audit

`repository/graph-registry.json` is version `1.0.0`, declares compatibility notes for BRAIN-1, KG-1, RG-1, DG-1, WG-1, KG-4, and AG-1, and records dependency relationships. All active graph schema paths and source locations exist. DG-1, WG-1, and KG-4 include direct validation commands. BRAIN-1 and KG-1 use audit-pack validation; RG-1 is also checked by the unified audit.

Verified architecture artifacts exist:

- `kg-2-wg-1-lock-note.md`
- `dg-1-database-graph-lock-note.md`
- `kg-4-voucher-accounting-graph-lock-note.md`
- `brain-2-source-backed-intelligence-lock-note.md`
- `brain-3-contextual-help-assistant-integration-report.md`
- `brain-3-contextual-help-assistant-lock-note.md`
- `brain-3-lock-blocker-note.md`, marked resolved

BRAIN-2 and BRAIN-3 are service/integration phases rather than separate graph IDs; their state is recorded in their lock artifacts, not as registry graph rows. AG-1 is correctly Planned.

## 4. KG-1 Knowledge Graph Audit Result

- `verify:knowledge` passed: 167 entries, 0 errors, 0 warnings.
- Required metadata fields, unique IDs, statuses, risk levels, impact fields, and array shapes are checked by `scripts/verify-knowledge.js`.
- Coverage is present for masters, operations, inventory, accounting, GST, receivables/payables, reports, dashboards, utilities, and help/training.
- No live transactional data is embedded in KG metadata according to the unified audit.
- Route metadata check found `KNG-MST-003` references `departments`, which is absent from both `flatNavItems` and `viewTitles`. This is a Low stale-reference finding.

## 5. WG-1 Workflow Graph Audit Result

- `verify:workflow-graph` passed: 20 checks, 0 warnings, 0 failures.
- The approved government supply lifecycle is present with 18 nodes and 17 edges.
- `WORK_ORDER` is the operational root; `supply_orders` is the mapped current implementation table.
- Work Order has no direct accounting, inventory, or GST impact.
- Optional, required, planned, and partial stages plus conditional skip rules are documented.
- No runtime workflow engine was introduced by the graph phase.

Finding: active WG-1 screen paths are not freshness-validated. Only `WORK_ORDER` and `ORDER_CLOSURE` active `screenRef` paths exist. Ten active nodes have non-null but missing paths, including Procurement Planning, Supplier Purchase Order, GRN, Inventory Reservation, Delivery Challan, CRAC, Sales Invoice, Receivable, Receipt, and Profitability. This is Medium graph/source-reference drift.

## 6. DG-1 Database Graph Audit Result

- `verify:database-graph` passed: 27 checks, 0 warnings, 0 failures.
- DG-1 maps 63 tables and 51 relationships; IDs and table names are unique.
- `supply_orders` maps to `WORK_ORDER` and is operational/non-accounting.
- Protected accounting tables have `genericCrudAllowed=false`.
- `ledger_entries` is mapped to Trial Balance, Profit & Loss, and Balance Sheet.
- Twenty-two posting functions and twenty-six report sources are mapped.
- Known gaps are present; DG-1 is descriptive and did not alter schema/runtime behavior.

The validator logs an AJV `date-time` format warning to stderr, but completes all validation checks successfully. This is Low verification-tooling noise, not a graph failure.

## 7. KG-4 Voucher and Accounting Graph Audit Result

- `verify:voucher-accounting-graph` passed.
- KG-4 maps 14 voucher types, 23 posting functions, 9 debit/credit patterns, and 23 report dependencies.
- `createBalancedVoucher`, `postLedgerEntry`, and `reverseVoucher` are mapped.
- The graph explicitly preserves Work Order/Supply Order as non-accounting.
- Sales maps to `invoices`, sales voucher, Output GST, receivable creation, and ledger-derived reports.
- Receipt maps to `payments`, `payment_allocations`, receipt voucher, cash/bank impact, and `ledger_entries` reports.
- Procurement maps to `procurements`, purchase voucher, Input GST, and payable impact.
- Delivery Challan maps to stock outward/COGS workflow alignment.
- Reversals are documented as opposite/contra entries; the graph states original ledger entries are not directly edited.
- Accounting protection principles and six known gaps are documented.

KG-4 is read-only metadata and does not alter accounting behavior.

## 8. BRAIN-2 Source-Backed Intelligence Audit Result

Positive evidence:

- Graph loader, manual loader, manual index, source index, source search service, and answer builder exist.
- Active graphs and ten manuals are detectable by `verify:erp-brain`.
- Repository shape normalization passes for modules, workflows, reports, glossary, navigation, and errors.
- The index has repository, workflow graph, database graph, voucher/accounting graph, renderer graph, and manual source categories.
- Source references, confidence, and `needsReview` are represented by the answer builder.
- No database mutation, posting, IPC, LLM, API-key, or external-model imports were found in the BRAIN module.
- The duplicate `searchIndex` declaration build blocker is resolved: private cache name is `searchIndexEntries`, preserving the public `searchIndex(query)` export.

High finding:

- `src/renderer/modules/erpBrain/services/sourceBackedSearchIndex.js:249-257` declares `let score` inside `if (haystack.includes(q))`, pushes a result, then references `score` outside that block at lines 254 and 256. This produces an out-of-scope runtime reference on indexed searches. The static build does not execute this path, and `verify:erp-brain` only confirms file/service presence rather than invoking representative searches.

Medium findings:

- `sourceBackedSearchService.js:4-27` uses duplicate object keys for `bill history`, `party ledger`, and `accounting voucher`. JavaScript keeps only each final value, so intended aliases such as billing/GST Invoice and department ledger are overwritten.
- `sourceBackedAnswerBuilder.js:15-30` builds `answer` from `bestCandidate` before applying `getPreferredSource()` and `preferSource()`. The preferred KG-4/DG-1/WG-1/RG-1/manual result is exposed only as `reRankedSource`, not used for the displayed answer or references. The documented preferred-source policy is therefore not enforced for the primary answer.
- The BRAIN verifier does not execute representative Work Order, Bill History, Receipt Voucher, Trial Balance, CRAC, Cash Book, Party Ledger, Business Voucher, Accounting Voucher, or Profitability searches. Its synonym check only confirms service-file existence.

## 9. BRAIN-3 Contextual Help Assistant Audit Result

Positive evidence:

- BRAIN-3 integration report and lock note exist; the historical blocker note is marked resolved.
- `HelpAssistant.jsx` passes `currentView` to the answer context.
- `contextualBrainHelp.js` maps 35 view keys and includes workflow, accounting, inventory, GST, Work Order, and safety-boundary metadata.
- `helpAssistantUtils.js` imports `sourceBackedSearch` and `brainSearchAsTopics`; low-confidence/no-match answers attempt source-backed enrichment.
- `HelpAssistantAnswer.jsx` renders brain-backed state, source references, workflow stage, accounting safety, and Work Order boundary.
- Dedicated BRAIN-3 verification passes 21 checks and finds no chatbot, LLM/API, database, or IPC import.

Findings:

- Because BRAIN-2 search currently throws on indexed searches, BRAIN-3 catches the exception and falls back to local Help Assistant behavior. The source-backed no-match path is therefore not functionally reliable. Severity: High, inherited from BRAIN-2.
- BRAIN-3 propagates source kinds and summaries but not BRAIN-2 `relatedTables`, `relatedReports`, manual sections, or `needsReview` into its answer object/UI. Existing local screen metadata can show reports, but the requested BRAIN-2 contextual relations are not fully surfaced. Severity: Medium.
- Existing Help Assistant behavior remains structurally backward-compatible because enrichment fields are optional and the exception path returns the existing answer.

No chatbot UI, action-taking behavior, live transactional record inspection, mutation API, LLM/API client, or IPC/preload interface was found.

## 10. Cross-Graph Consistency Findings

| Check | Result |
|---|---|
| WORK_ORDER / `supply_orders` | Consistent: WG-1 operational root, DG-1 `relatedWorkflowStage=WORK_ORDER`, KG-4 no direct accounting impact |
| Sales invoice | Consistent: WG-1 stage, DG-1 `invoices`, KG-4 sales voucher, GST, receivable, and reports |
| Receipt | Consistent: WG-1 receipt, DG-1 `payments`/`payment_allocations`, KG-4 receipt voucher and cash/bank impact |
| Financial reports | Consistent: DG-1 and KG-4 map Trial Balance, P&L, and Balance Sheet to `ledger_entries` |
| Procurement | Consistent: WG-1 Supplier Purchase Order, DG-1 `procurements`, KG-4 purchase voucher/Input GST/payable |
| Delivery / COGS | Consistent: WG-1 delivery impact and KG-4 COGS alignment; DG-1 maps `delivery_challans` and `stock_outwards` |
| Manual references | Manual files exist, but BRAIN-2 runtime search prevents reliable manual retrieval |
| Screen references | Inconsistent freshness: ten active WG-1 paths are stale |
| Synonyms | Inconsistent: duplicate object keys silently discard intended alternatives |
| Known gaps | WG-1, DG-1, and KG-4 document gaps; no direct contradiction found in validated graph data |

## 11. Help Assistant Readiness Finding

The Help Assistant is ready as a local, read-only guidance feature with contextual workflow and safety explanations. It is **not ready to be relied upon as a source-backed BRAIN-2 assistant** until the BRAIN-2 search runtime defect, synonym behavior, and relation/needs-review propagation are stabilized and tested.

## 12. Source-Backed Answer Reliability Finding

Source-backed answer reliability is currently **not certified**. Static indexing metadata and source references are designed correctly, but runtime source search throws before reliable result production. The existing verification coverage is insufficient because it does not execute the primary search path or assert answer-builder source preference.

## 13. Safety Boundary Audit

| Area | Classification | Evidence |
|---|---|---|
| BRAIN-2 repository/graph/manual imports | Safe read-only | Only loaders and static knowledge assets imported |
| BRAIN-2 source search / answer builder | Safe boundary, defective runtime | No mutation imports; runtime scoring defect present |
| BRAIN-3 Help Assistant imports | Safe read-only | No DB/IPC/LLM/action imports found |
| Accounting references in contextual help | Safe read-only | Textual safety guidance only; no posting call |
| KG/WG/DG/KG-4 graphs | Safe read-only | JSON metadata, validated without runtime mutation |
| LLM/API/model clients | Not found | No OpenAI, Claude, Gemini, Anthropic, API key, fetch/axios, or command-execution imports found |

No unsafe mutation import was found in the intelligence layer. The failure is reliability, not a database or accounting mutation risk.

## 14. Verification Command Results

| Command | Result |
|---|---|
| `npm.cmd run lint:syntax` | PASS |
| `npm.cmd run build` | PASS; existing large-chunk warning |
| `npm.cmd run verify:knowledge` | PASS: 167 entries, 0 errors/warnings |
| `npm.cmd run verify:workflow-graph` | PASS: 20 checks |
| `npm.cmd run verify:database-graph` | PASS: 27 checks; AJV format warning printed |
| `npm.cmd run verify:voucher-accounting-graph` | PASS |
| `npm.cmd run verify:erp-brain` | PASS: 27 static checks, but misses runtime search defect |
| `npm.cmd run verify:help-assistant-brain` | PASS: 21 structural checks, but misses inherited runtime search defect |
| `npm.cmd run verify:audit` | 183 PASS, 1 INFO, 1 WARNING, 0 FAIL; exit 1 for warning status |
| `npm.cmd run verify:erp` | Functional checks pass; final WARNING reflects audit warning/info |
| `npm.cmd run verify:accounting` | PASS |
| `npm.cmd run verify:financials` | PASS |
| `npm.cmd run verify:controls` | PASS: 12 checks |
| `npm.cmd run verify:voucher-inventory` | PASS |
| `npm.cmd run verify:flow` | PASS |
| `npm.cmd run verify:phase10` | PASS |

All requested commands exist. No missing command was found.

## 15. Git Status Classification

### 1. Locked intelligence files

- KG/WG/DG/KG-4 graph JSON, schemas, validators, architecture reports, and lock notes
- BRAIN-2 repository/loaders/services/manual data and verification artifacts
- BRAIN-3 resolver, Help Assistant integration files, verifier, reports, and lock notes
- `repository/graph-registry.json` and `scripts/verify-audit.js`

### 2. Pending intelligence audit files

- `docs/architecture/enterprise-intelligence-layer-comprehensive-audit-report.md` created by this audit
- Existing `docs/architecture/enterprise-intelligence-layer-rollup-lock-report.md` should be superseded/revalidated after BRAIN-2 stabilization

### 3. Pre-existing dirty baseline files

- `package.json`, `package-lock.json`
- BRAIN-2/DG-1/WG-1/KG-4 uncommitted graph and service artifacts
- prior architecture reports and lock notes

### 4. Runtime source files

- `src/renderer/modules/erpBrain/services/sourceBackedSearchIndex.js`
- `src/renderer/modules/erpBrain/services/sourceBackedSearchService.js`
- `src/renderer/modules/erpBrain/services/sourceBackedAnswerBuilder.js`
- Help Assistant module files
- `src/main/database/init.js`, `crudHelpers.js`, and extracted main services

### 5. Database / accounting-sensitive files

- `src/main/database/init.js`
- `src/main/database/crudHelpers.js`
- `src/main/services/importValidationService.js`
- DG-1/KG-4 graph assets and validators

### 6. Unrelated accidental files

No new unrelated accidental change was identified during this audit. The worktree was already broadly dirty; no existing change was reverted or committed.

## 16. Known Gaps

- AG-1 remains planned.
- RG-1 retains a known App.jsx high-risk warning.
- WG-1 has partial/planned operational stages and stale active `screenRef` metadata.
- KG-1 has one stale `departments` route reference.
- BRAIN-2 search lacks executed runtime coverage.
- BRAIN-3 does not fully expose BRAIN-2 relationship, manual, and review metadata.
- No full manual desktop click-through was performed in this audit.

## 17. Issue Table

| Severity | Finding | Evidence | Required Action |
|---|---|---|---|
| Critical | None | No mutation, accounting, schema, or graph-corruption issue found | None |
| High | BRAIN-2 search throws due to out-of-scope `score` | `sourceBackedSearchIndex.js:249-257` | BRAIN-2 stabilization; add runtime search tests |
| High | Existing source-backed BRAIN-3 reliability claim is not currently true | BRAIN-3 calls/catches failing BRAIN-2 search | Revalidate BRAIN-3 after BRAIN-2 repair |
| Medium | Duplicate synonym keys overwrite intended aliases | `sourceBackedSearchService.js:4-27` | Represent multiple targets without duplicate object keys; test synonyms |
| Medium | Preferred source does not determine primary answer | Answer generated before re-ranking in `sourceBackedAnswerBuilder.js:15-30` | Apply preferred ranking before choosing answer/references |
| Medium | Ten active WG-1 screen paths are stale | WG source-path existence audit | Refresh graph paths and add existence validation |
| Medium | BRAIN-3 does not surface all BRAIN-2 relation/manual/review metadata | Help Assistant enrichment maps only basic result fields | Add scoped propagation after BRAIN-2 is reliable |
| Low | KG-1 `departments` route key is stale | `KNG-MST-003`; absent from nav and titles | Reconcile route metadata |
| Low | DG validator logs unknown `date-time` format | `verify:database-graph` stderr | Configure AJV format support or suppress known noise |

## 18. Immediate Fixes Recommended

1. Start a **BRAIN-2 stabilization phase**, not BRAIN-4: repair runtime scoring scope and add executed tests for all required source-backed search terms.
2. Make source preference affect the answer selection and source references, not only the diagnostic `reRankedSource` field.
3. Replace duplicate synonym-key declarations with a multi-target structure and test mappings.
4. Refresh WG-1 active `screenRef` paths and KG-1 stale route metadata; extend validators to assert source/route existence.
5. After BRAIN-2 runtime tests pass, run a BRAIN-3 stabilization check that asserts no-match enrichment, sources, tables/reports/manuals, and review state are actually rendered.
6. Reissue the intelligence rollup lock only after these High/Medium reliability findings are resolved.

## 19. Deferred Future Phases

- AG-1 Audit Intelligence Graph
- BRAIN-4 planning only, after stabilization
- Chatbot, LLM gateway, live-record assistant, and action-taking assistant remain deferred
- Any mutation/action assistant requires separate governance, safety, and accounting controls

## 20. Clear Conclusion

**Stabilization required before next phase.** Do not begin BRAIN-4, chatbot, LLM gateway, live-record assistant, or action-taking assistant. The static intelligence foundation and read-only safety boundaries are sound, but BRAIN-2 runtime source search and related BRAIN-3 behavior must be stabilized and reverified first.
