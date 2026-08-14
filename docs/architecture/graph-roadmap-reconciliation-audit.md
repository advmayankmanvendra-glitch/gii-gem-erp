# Graph Roadmap Reconciliation Audit

Date: 2026-08-11
Repository: GII GeM ERP
Audit Status: PASS WITH WARNINGS
Mode: Read-only audit; only this audit deliverable, the reconciliation matrix, and the proposed registry artefact were created.

## ADS-001 - Acronym Expansion Rule

- AG-1 (Audit Intelligence Graph 1)
- AIR (Accounting Intelligence Repository)
- API (Application Programming Interface)
- BRAIN (ERP Brain knowledge and assistant intelligence programme)
- CRAC (Consignee Receipt and Acceptance Certificate)
- DG-1 (Database Intelligence Graph 1)
- EIL (Enterprise Intelligence Layer)
- FF-1 (Feature Function Correlation Graph 1)
- FF-2 (Feature Function Runtime Routing Graph/Phase 2, proposed/future name)
- GI-EGS (Gesture India Engineering Standards)
- GST (Goods and Services Tax)
- IPC (Inter-Process Communication)
- JSON (JavaScript Object Notation)
- KG (Knowledge Graph)
- LLM (Large Language Model)
- RG-1 (Renderer Intelligence Graph 1)
- UI (User Interface)
- WG-1 (Workflow Intelligence Graph 1)

## Objective

Reconcile `repository/graph-registry.json` with the historical ERP graph roadmap covering BRAIN-1 through BRAIN-5, KG-1 through KG-10, RG, DG, WG, FF, and AG graph families, including their current repository evidence, verification status, successor relationships, missing registry entries, conflicts, and pending graph work.

## Precondition Confirmation

Status: PASS

- Working tree before audit: clean. Evidence: `git status --short` returned no modified, staged, or untracked files.
- Latest commit: `92aa0a8 feat(intelligence): implement AG-1 audit intelligence graph` on branch `phase-16-enterprise-crm-integration`.
- AG-1 verification: `npm.cmd run verify:audit-graph` passed 27 checks, 0 warnings, 0 failures.
- Unified graph governance audit: `npm.cmd run verify:audit` passed 225 checks, 3 informational items, 0 warnings, 0 failures, 0 critical issues.

## Current Evidence

### Live Registry Evidence

`repository/graph-registry.json` currently registers 8 active graphs:

| Graph ID | Registry Status | Registry Version | Location | Validation Method |
|---|---|---:|---|---|
| BRAIN-1 | Active | 1.0.0 | `src/renderer/modules/erpBrain/repository/` | `verify:audit --phase=brain-1` |
| KG-1 | Active | 1.0.0 | `src/renderer/knowledge/` | `verify:audit --phase=kg-1` |
| RG-1 | Active | 2.0 | `src/renderer/knowledge/renderer-graph.json` | `verify:audit --phase=rg-1` |
| DG-1 | Active | 1.1.0 | `src/renderer/knowledge/database-graph.json` | `npm run verify:database-graph` |
| WG-1 | Active | 1.0.0 | `src/renderer/knowledge/workflow-graph.json` | `npm run verify:workflow-graph` |
| KG-4 | Active | 1.0.0 | `src/renderer/knowledge/voucher-accounting-graph.json` | `npm run verify:voucher-accounting-graph` |
| FF-1 | Active | 1.0.0 | `src/renderer/knowledge/feature-function-graph.json` | `npm run verify:feature-function-graph` |
| AG-1 | Active | 1.0.0 | `src/renderer/knowledge/audit-graph.json` | `npm run verify:audit-graph` |

### Graph Artefact Evidence

| Graph | Artefact Evidence |
|---|---|
| AG-1 | `src/renderer/knowledge/audit-graph.json`; `repository/schema/audit-graph.schema.json`; 97 audit events, 40 critical, 41 sensitive, 16 informational. |
| DG-1 | `src/renderer/knowledge/database-graph.json`; `repository/schema/database-graph.schema.json`; 73 tables, 57 relationships, 22 posting functions, 26 report sources. |
| FF-1 | `src/renderer/knowledge/feature-function-graph.json`; `repository/schema/feature-function-graph.schema.json`; 50 features, 15 functions, 174 edges. |
| KG-4 | `src/renderer/knowledge/voucher-accounting-graph.json`; `repository/schema/voucher-accounting-graph.schema.json`; 14 voucher types, 23 posting functions. |
| RG-1 | `src/renderer/knowledge/renderer-graph.json`; `renderer-graph.md`; `renderer-summary.md`; 252 files, 114 routes, 41 screens, 41 components, 500 import edges. |
| WG-1 | `src/renderer/knowledge/workflow-graph.json`; `repository/schema/workflow-graph.schema.json`; 18 lifecycle nodes, 17 edges. |
| KG-1 | `src/renderer/knowledge/modules/*.js`; `repository/schema/kg.schema.json`; 167 validated entries. |
| BRAIN-1 | `src/renderer/modules/erpBrain/repository/*/index.json`; `repository/schema/brain.schema.json`; 214 registry entries. |

### Verification Evidence

| Command | Result | Meaning |
|---|---|---|
| `npm.cmd run verify:audit-graph` | PASS | AG-1 graph, schema, registry, source references, metadata counts and no-live-data rules passed. |
| `npm.cmd run verify:audit` | PASS | Unified graph governance audit: 225 PASS, 3 INFO, 0 WARNING, 0 FAIL, 0 CRITICAL. |
| `npm.cmd run verify:workflow-graph` | PASS | WG-1 standalone validation: 21 PASS, 0 warnings, 0 failures. |
| `npm.cmd run verify:database-graph` | PASS WITH WARNINGS | DG-1 standalone validation: 32 PASS, 0 failures. Ajv emitted non-blocking `date-time` format warnings. |
| `npm.cmd run verify:voucher-accounting-graph` | PASS | KG-4 standalone validation passed all checks. |
| `npm.cmd run verify:feature-function-graph` | PASS | FF-1 standalone validation: 31 PASS, 0 failures. |
| `npm.cmd run verify:knowledge` | PASS | KG-1 validation: 167 entries, 0 errors, 0 warnings. |
| `npm.cmd run verify:erp-brain` | PASS | BRAIN-2 source-backed intelligence validation: 51 PASS, 0 warnings, 0 failures. |
| `npm.cmd run verify:help-assistant-brain` | PASS | BRAIN-3 contextual help integration validation: 27 PASS, 0 warnings, 0 failures. |

The RG-1 generator command `node scripts/build-renderer-graph.js` was not run because it may regenerate and overwrite graph artefacts. That would violate the read-only restriction. RG-1 verification evidence is taken from `verify:audit` and the existing graph artefacts.

## Scope Performed

Performed:

- Read `repository/graph-registry.json`.
- Read repository instructions: `AGENTS.md`, `README.md`, `docs/architecture/enterprise-intelligence-layer.md`, and `docs/architecture/graph-registry.md`.
- Searched repository for BRAIN-1 through BRAIN-5, KG-1 through KG-10, RG, DG, WG, FF and AG identifiers.
- Inventoried source files, graph JSON artefacts, schemas, verification scripts, package commands, architecture reports, audit reports, commits and tags where locally discoverable.
- Classified every discovered graph identifier or historical graph stage using exactly one recommended status.
- Created a separate proposed registry artefact without modifying the live registry.

Not performed:

- No live registry changes.
- No production code changes.
- No database changes.
- No package.json changes.
- No graph regeneration.
- No commit or push.

## Discovered Identifier Summary

Total graph identifiers discovered: 24

Discovered identifiers:

`AG-1`, `BRAIN-1`, `BRAIN-2`, `BRAIN-3`, `BRAIN-4`, `BRAIN-5`, `DG-1`, `FF-1`, `FF-2`, `KG-1`, `KG-2`, `KG-3`, `KG-4`, `KG-5`, `KG-6`, `KG-7`, `KG-8`, `KG-9`, `KG-10`, `RG-1`, `RG-2`, `WG-1`, `WG-2`, `WG-3`.

Registered graphs: 8

Unregistered historical stages or roadmap identifiers: 16

## Status Counts

| Recommended Status | Count | Identifiers |
|---|---:|---|
| ACTIVE | 8 | BRAIN-1, KG-1, RG-1, DG-1, WG-1, KG-4, FF-1, AG-1 |
| COMPLETED | 6 | BRAIN-2, BRAIN-3, BRAIN-4, WG-2, WG-3, FF-2 |
| MERGED | 5 | KG-2, KG-6, KG-8, KG-9, KG-10 |
| SUPERSEDED | 2 | KG-3, KG-7 |
| PLANNED | 1 | KG-5 |
| DEFERRED | 1 | BRAIN-5 |
| RETIRED | 0 | None |
| UNVERIFIED | 1 | RG-2 |

## Historical Absorption and Successor Findings

| Historical Stage | Recommended Status | Successor / Current Home | Rationale |
|---|---|---|---|
| KG-2 Workflow Graph | MERGED | WG-1 | Historical documents are named `KG-2 / WG-1`; the implemented active graph is WG-1. |
| KG-3 Database Graph | SUPERSEDED | DG-1 | KI-0 roadmap called it KG-3; the implemented registry graph is DG-1. |
| KG-6 Renderer Dependency Graph | MERGED | RG-1 | KI-0 maps KG-6 to the renderer dependency graph; active implementation is RG-1. |
| KG-7 Verification and Audit Graph | SUPERSEDED | AG-1 | KI-0 planned KG-7 audit/verification graph; active implementation is AG-1. |
| KG-8 Knowledge Search Index | MERGED | BRAIN-2 | Source-backed search index and answer services are verified under BRAIN-2, not a standalone graph. |
| KG-9 Contextual Help Mapping | MERGED | BRAIN-3 | Contextual Help Assistant integration is verified under BRAIN-3. |
| KG-10 Validation and Governance | MERGED | AG-1 and EIL registry | Governance validation is now in `verify:audit`, AG-1 and the EIL registry contract. |
| FF-2 Runtime Routing | COMPLETED | BRAIN-4.3B using FF-1 | FF-1 metadata still names FF-2 as future, but `brain-4-3b-ff1-runtime-routing-report.md` documents runtime routing implemented through FF-1. |

## Registry Mismatches and Conflicts

### 1. Live JSON registry omits completed historical BRAIN stages

`repository/graph-registry.json` registers BRAIN-1 only. BRAIN-2, BRAIN-3 and BRAIN-4 are implemented and verified stages, but they are not standalone registered graph entries.

Recommendation: Do not add them as active graph entries unless the architecture owner wants phases represented as registry records. Instead, add a `historicalStages` section in the proposed registry so future auditors can trace them without confusing them with standalone graphs.

### 2. `graph-registry.md` omits FF-1 and KG-4 from its main table

The live JSON registry includes FF-1 and KG-4 as active. The human-readable `docs/architecture/graph-registry.md` main table lists BRAIN-1, KG-1, RG-1, DG-1, WG-1 and AG-1, but not FF-1 or KG-4.

Recommendation: update the human-readable registry later, after human approval, to match the live JSON registry.

### 3. FF-2 stale future reference

`repository/graph-registry.json` and `feature-function-graph.json` still mention FF-2 as future runtime routing. Later evidence shows BRAIN-4.3B implemented runtime routing through FF-1.

Recommendation: classify FF-2 as completed-by-absorption into BRAIN-4.3B/FF-1 runtime routing, and remove or revise stale `futureGraph` wording only after approval.

### 4. EIL relationship documentation omits KG-4 and FF-1 in the main dependency chain

`enterprise-intelligence-layer.md` states all active graphs are implemented, but its simplified relationship chain shows BRAIN-1 -> KG-1 -> RG-1 -> DG-1 -> WG-1 -> AG-1. It does not place KG-4 or FF-1 in that main chain, although the JSON registry includes both.

Recommendation: later documentation update should show KG-4 and FF-1 as active branch graphs, not as part of a simple linear chain.

### 5. RG-2 is a stray reference

RG-2 appears only in `docs/tally-intelligence/AIR/erp9-air-integration.md`. No source graph, schema, registry entry, verifier, report or package command was found.

Recommendation: keep RG-2 as UNVERIFIED until the architecture owner confirms whether it was intentional or only a stray label.

## Duplicate IDs, Naming Conflicts and Broken References

| Check | Result |
|---|---|
| Duplicate registered graph IDs | PASS. No duplicate graph IDs found in `repository/graph-registry.json`. |
| Active graph file existence | PASS. Unified audit confirms all 8 active graph locations exist. |
| Active graph schema existence | PASS. Unified audit and standalone validators confirm schema files exist for active graph families. |
| Broken source references | PASS for AG-1. `verify:audit-graph` confirms all 21 source documents resolve. |
| Broken graph references | PASS for active graph validators. WG-1 edges, DG-1 relationships, FF-1 edges and AG-1 event/module references all passed validation. |
| Naming conflicts | PASS WITH WARNINGS. KG historical numbering conflicts with renamed graph families: KG-2 -> WG-1, KG-3 -> DG-1, KG-6 -> RG-1, KG-7 -> AG-1. These are historical, not runtime-breaking. |
| Orphaned graph artefacts | PASS WITH WARNINGS. RG-2 is an orphaned reference; FF-2 is a stale future reference after BRAIN-4.3B routing. |

## Genuinely Pending Graphs

| Pending Item | Status | Reason |
|---|---|---|
| KG-5 Document and Manual Graph | PLANNED | Manuals exist and BRAIN-2 indexes manuals, but no dedicated KG-5 graph, schema, registry entry or verifier exists. |
| BRAIN-5 LLM Gateway | DEFERRED | Feasibility study exists; no LLM/API integration is implemented. This is correct due to safety boundaries. |
| RG-2 | UNVERIFIED | Only stray AIR reference found; no graph artefact. |

## Business Meaning

The ERP graph foundation is stronger than the live registry alone suggests. The current active system has eight usable graph assets, and AG-1 is genuinely implemented and verified. Historical KG numbering was partially absorbed into clearer specialist graph families: WG for workflow, DG for database, RG for renderer, AG for audit and FF for feature-function routing.

The main business risk is documentation drift, not missing core graph implementation. If a future developer reads only the old KG roadmap, they may think KG-3, KG-6 or KG-7 are still pending, even though their successor graphs are active. If an AI tool reads only the JSON registry, it may miss BRAIN-2/BRAIN-3/BRAIN-4 phase history and the fact that FF-2 runtime routing was completed under BRAIN-4.3B.

## Risks

| Risk | Severity | Explanation |
|---|---|---|
| Registry/documentation drift | Medium | JSON registry, graph-registry.md and historical roadmap use different names and coverage. |
| Duplicate roadmap interpretation | Medium | KG-2/KG-3/KG-6/KG-7 can be mistaken as pending even though successors exist. |
| FF-2 stale future label | Medium | Future planning may duplicate already implemented runtime routing work. |
| KG-5 absence | Low | Manuals are useful but not yet represented as a dedicated graph. |
| RG-2 stray reference | Low | One reference exists without implementation evidence. |
| Production code risk | Low | This audit did not modify runtime code, database, package commands or live graph files. |

## Recommended Next Graph After Reconciliation

Recommended next graph: KG-5 Document and Manual Graph.

Reason: Core active graphs are implemented and verified. KG-5 is the only genuinely useful pending graph from the historical KG roadmap: manuals already exist, BRAIN-2 can index manuals, and a KG-5 graph would turn manuals into a governed, searchable, cross-referenced knowledge asset without touching accounting, GST, inventory, vouchers or production data.

Do not start BRAIN-5 LLM gateway next. It should remain deferred until the registry is reconciled and KG-5/manual governance is stable.

## Files Affected

Created:

- `docs/architecture/graph-roadmap-reconciliation-audit.md`
- `docs/architecture/graph-roadmap-reconciliation-matrix.md`
- `docs/architecture/proposed-graph-registry.json`

Not modified:

- `repository/graph-registry.json`
- `package.json`
- `src/**`
- `scripts/**`
- existing reports
- database files

## Verification

Verification performed:

- `git status --short` before audit: clean.
- `git log -1 --oneline --decorate`: AG-1 commit confirmed.
- `npm.cmd run verify:audit-graph`: PASS.
- `npm.cmd run verify:audit`: PASS.
- `npm.cmd run verify:workflow-graph`: PASS.
- `npm.cmd run verify:database-graph`: PASS WITH WARNINGS due to non-blocking schema format warnings.
- `npm.cmd run verify:voucher-accounting-graph`: PASS.
- `npm.cmd run verify:feature-function-graph`: PASS.
- `npm.cmd run verify:knowledge`: PASS.
- `npm.cmd run verify:erp-brain`: PASS.
- `npm.cmd run verify:help-assistant-brain`: PASS.

Post-creation verification to run after files are written:

- Confirm the three files exist.
- Confirm `proposed-graph-registry.json` parses as JSON.
- Confirm git status shows only the three intended files.

## Results

Status: PASS WITH WARNINGS

- AG-1 precondition is satisfied.
- 24 graph identifiers or stages discovered.
- 8 active registered graphs verified.
- 16 unregistered historical/planned identifiers classified.
- 8 historical stages identified as merged, superseded, or completed through successor graphs/phases.
- 1 genuinely pending graph recommended: KG-5 Document and Manual Graph.
- 1 unresolved orphan reference: RG-2.
- Live registry was not modified.

## Unresolved Items

| Item | Status | Required Human Decision |
|---|---|---|
| Whether to add `historicalStages` to live registry | UNVERIFIED | Requires architecture owner approval. |
| Whether to revise FF-2 future wording | UNVERIFIED | Requires approval because it changes registry meaning. |
| Whether KG-5 should be next graph | PLANNED | Recommended, but business owner must approve. |
| Whether RG-2 is intentional | UNVERIFIED | Needs owner clarification or source evidence. |

## Git Status

Pre-audit git status: clean.

Expected post-audit git status: three new untracked documentation artefacts only.

## Recommended Next Action

Review the three reconciliation artefacts. If approved, run a separate registry-update phase to update `repository/graph-registry.json` and `docs/architecture/graph-registry.md`. That later phase should be explicitly approved because it changes governed architecture records.
