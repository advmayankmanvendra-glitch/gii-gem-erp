# Graph Roadmap Reconciliation Matrix

Date: 2026-08-11
Audit Status: PASS WITH WARNINGS

## ADS-001 - Acronym Expansion Rule

- AG-1 (Audit Intelligence Graph 1)
- BRAIN (ERP Brain knowledge and assistant intelligence programme)
- DG-1 (Database Intelligence Graph 1)
- EIL (Enterprise Intelligence Layer)
- FF-1 (Feature Function Correlation Graph 1)
- FF-2 (Feature Function Runtime Routing Graph/Phase 2, proposed/future name)
- KG (Knowledge Graph)
- RG-1 (Renderer Intelligence Graph 1)
- WG-1 (Workflow Intelligence Graph 1)

## Matrix Rules

Each discovered graph identifier or historical stage receives exactly one recommended status:

ACTIVE, COMPLETED, MERGED, SUPERSEDED, PLANNED, DEFERRED, RETIRED, or UNVERIFIED.

For MERGED and SUPERSEDED items, the successor graph or current successor phase is stated.

## Reconciliation Matrix

| ID | Name / Historical Meaning | Registered in `repository/graph-registry.json` | Recommended Status | Successor / Current Home | Evidence | Verification / Confidence |
|---|---|---:|---|---|---|---|
| BRAIN-1 | ERP Knowledge Repository | Yes | ACTIVE | N/A | `src/renderer/modules/erpBrain/repository/`; `repository/schema/brain.schema.json`; registry entry count 214 | `verify:audit` BRAIN-1 audit pack PASS |
| BRAIN-2 | Source-backed ERP Brain search and answer service | No | COMPLETED | BRAIN-1 service layer, consumed by BRAIN-3/BRAIN-4 | `docs/architecture/brain-2-source-backed-intelligence-upgrade-report.md`; `src/renderer/modules/erpBrain/loaders/graphLoader.js`; `sourceBackedSearchIndex.js`; `sourceBackedAnswerBuilder.js` | `npm.cmd run verify:erp-brain` PASS, 51 checks |
| BRAIN-3 | Contextual Help Assistant integration | No | COMPLETED | Help Assistant integration over BRAIN-2 | `docs/architecture/brain-3-contextual-help-assistant-integration-report.md`; `src/renderer/modules/helpAssistant/contextualBrainHelp.js` | `npm.cmd run verify:help-assistant-brain` PASS, 27 checks |
| BRAIN-4 | Read-only Ask ERP Brain assistant programme | No | COMPLETED | Ask ERP Brain runtime assistant; FF-1-routed in BRAIN-4.3B | `docs/architecture/brain-4-combined-phase-report.md`; `brain-4-3b-ff1-runtime-routing-report.md`; `scripts/test-read-only-erp-assistant-internal.js` | FF-1 regression and read-only assistant tests documented; not standalone registry graph |
| BRAIN-5 | Large Language Model gateway feasibility | No | DEFERRED | N/A | `docs/architecture/brain-5-llm-gateway-feasibility-study.md`; lock note says study only | No LLM/API implementation found; correctly deferred |
| KG-1 | Metadata / impact Knowledge Graph | Yes | ACTIVE | N/A | `src/renderer/knowledge/modules/*.js`; `repository/schema/kg.schema.json`; registry entry count 167 | `npm.cmd run verify:knowledge` PASS, 167 entries, 0 errors |
| KG-2 | Historical Workflow Graph name | No | MERGED | WG-1 | `docs/architecture/kg-2-wg-1-workflow-graph-foundation-report.md`; `kg-2-wg-1-lock-note.md` | WG-1 standalone validator PASS |
| KG-3 | Historical Database Graph name | No | SUPERSEDED | DG-1 | `docs/architecture/ki-0-intelligence-layer-status-audit-and-continuation-plan.md` calls KG-3 database graph planned; active registry now uses DG-1 | DG-1 validator PASS |
| KG-4 | Voucher and Accounting Graph | Yes | ACTIVE | N/A | `src/renderer/knowledge/voucher-accounting-graph.json`; `repository/schema/voucher-accounting-graph.schema.json`; registry entry count 14 | `npm.cmd run verify:voucher-accounting-graph` PASS |
| KG-5 | Document and Manual Graph | No | PLANNED | N/A | KI-0 identifies manuals/help as partial and no dedicated document/manual graph exists | Manuals exist; no graph/schema/registry/verifier found |
| KG-6 | Historical Renderer Dependency Graph name | No | MERGED | RG-1 | KI-0 says KG-6 Renderer Dependency Graph completed via RG-1 | `verify:audit` RG-1 audit pack PASS |
| KG-7 | Historical Verification and Audit Graph name | No | SUPERSEDED | AG-1 | KI-0 planned KG-7; current AG-1 implements audit intelligence graph | `npm.cmd run verify:audit-graph` PASS, 27 checks |
| KG-8 | Knowledge Search Index | No | MERGED | BRAIN-2 | KI-0 lists search index partial; BRAIN-2 now has source-backed search index | `npm.cmd run verify:erp-brain` validates source-backed search index |
| KG-9 | Contextual Help Mapping | No | MERGED | BRAIN-3 | KI-0 lists contextual help mapping partial; BRAIN-3 implements contextual help assistant integration | `npm.cmd run verify:help-assistant-brain` PASS |
| KG-10 | KG Validation and Governance | No | MERGED | AG-1 plus EIL registry governance | KI-0 lists governance partial; `verify:audit`, AG-1, EIL registry now provide governance validation | `npm.cmd run verify:audit` PASS, 225 checks |
| RG-1 | Renderer Intelligence Graph | Yes | ACTIVE | N/A | `src/renderer/knowledge/renderer-graph.json`; `.md`; summary; registry version 2.0 | `verify:audit` RG-1 audit pack PASS; generator not run due read-only restriction |
| RG-2 | Stray renderer graph reference in AIR documentation | No | UNVERIFIED | N/A | `docs/tally-intelligence/AIR/erp9-air-integration.md` only | No graph artefact, schema, registry entry, verifier, report or package command found |
| DG-1 | Database Intelligence Graph | Yes | ACTIVE | N/A | `src/renderer/knowledge/database-graph.json`; `repository/schema/database-graph.schema.json`; registry version 1.1.0 | `npm.cmd run verify:database-graph` PASS WITH WARNINGS, 32 checks |
| WG-1 | Workflow Intelligence Graph | Yes | ACTIVE | N/A | `src/renderer/knowledge/workflow-graph.json`; `repository/schema/workflow-graph.schema.json`; registry version 1.0.0 | `npm.cmd run verify:workflow-graph` PASS, 21 checks |
| WG-2 | Workflow Enforcement Readiness Audit | No | COMPLETED | WG-3A implementation planning | `docs/architecture/wg-2-workflow-enforcement-readiness-audit.md` | Audit-only stage documents readiness gaps and baseline |
| WG-3 | Workflow Enforcement Foundation family | No | COMPLETED | WG-3A workflow stage engine | `docs/architecture/wg-3a-workflow-enforcement-foundation-report.md`; `src/renderer/modules/workflow/workflowStageEngine.js`; `scripts/verify-workflow-enforcement-foundation.js` | Package command `verify:workflow-enforcement` exists; report documents detection-only foundation |
| FF-1 | Feature Function Correlation Graph | Yes | ACTIVE | N/A | `src/renderer/knowledge/feature-function-graph.json`; `repository/schema/feature-function-graph.schema.json`; registry entry count 50 | `npm.cmd run verify:feature-function-graph` PASS, 31 checks |
| FF-2 | Runtime routing phase named as future in FF-1 metadata | No | COMPLETED | BRAIN-4.3B runtime routing through FF-1 | `docs/architecture/brain-4-3b-ff1-runtime-routing-report.md`; `feature-function-graph.json` still says FF-2 future | Marked completed-by-absorption; stale future wording remains a documentation conflict |
| AG-1 | Audit Intelligence Graph | Yes | ACTIVE | N/A | `src/renderer/knowledge/audit-graph.json`; `repository/schema/audit-graph.schema.json`; registry entry count 97 | `npm.cmd run verify:audit-graph` PASS, 27 checks; latest commit `92aa0a8` implements AG-1 |

## Registered vs Unregistered

| Category | Count | IDs |
|---|---:|---|
| Registered active graphs | 8 | BRAIN-1, KG-1, RG-1, DG-1, WG-1, KG-4, FF-1, AG-1 |
| Unregistered completed stages | 6 | BRAIN-2, BRAIN-3, BRAIN-4, WG-2, WG-3, FF-2 |
| Unregistered merged stages | 5 | KG-2, KG-6, KG-8, KG-9, KG-10 |
| Unregistered superseded stages | 2 | KG-3, KG-7 |
| Unregistered planned/deferred/unverified | 3 | KG-5, BRAIN-5, RG-2 |

## Conflicts to Resolve Later

| Conflict | Impact | Recommended Handling |
|---|---|---|
| `docs/architecture/graph-registry.md` lacks FF-1 and KG-4 in its main table | Human-readable docs lag JSON registry | Update docs after approval |
| FF-2 still appears as future in registry/FF-1 metadata | Future work may duplicate BRAIN-4.3B routing | Replace future wording with completed-by-absorption note after approval |
| Historical KG numbering overlaps with specialist graph families | Auditors may treat completed successor graphs as missing KG stages | Add historical roadmap section to registry after approval |
| RG-2 stray AIR reference | Unknown intent | Keep UNVERIFIED until owner confirms |

## Recommended Next Graph

KG-5 Document and Manual Graph.

Reason: It is the only useful pending graph with strong source material already present in `docs/manuals/`, and it can be built as read-only without touching accounting, GST, inventory, voucher posting, database schema or production data.
