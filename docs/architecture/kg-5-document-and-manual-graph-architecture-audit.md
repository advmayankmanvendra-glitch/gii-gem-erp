# KG-5 Document and Manual Graph — Architecture Audit

**Phase:** KG-5 Document and Manual Graph (architecture audit — Rule 20 step 2)
**Date:** 2026-08-14
**Status:** AUDIT COMPLETE — implementation not started
**Mode:** Read-only. No source, graph, registry, or documentation file was modified.

## 1. Objective

Establish whether a KG-5 Document and Manual Graph is well-defined, dependencies are satisfied, and scope is safe for implementation without touching accounting, GST, inventory, vouchers, or production data. The reconciliation audit (`docs/architecture/graph-roadmap-reconciliation-audit.md`) classified KG-5 as PLANNED and recommended it as the next graph.

## 2. Current State Inventory

### 2.1 Manual Files (`docs/manuals/`)

| File | Lines | KB |
|---|---|---|
| GII-GeM-ERP-Complete-User-Operations-Manual.md | 3,020 | 155.9 |
| GII-GeM-ERP-Feature-Status-Matrix.md | 407 | 48.4 |
| GII-GeM-ERP-Training-Workbook.md | 378 | 20.6 |
| GII-GeM-ERP-Command-Execution-Guide.md | 246 | 13.2 |
| GII-GeM-ERP-Month-End-Financial-Checklist.md | 260 | 13.3 |
| GII-GeM-ERP-Manual-Generation-Report.md | 225 | 17.7 |
| GII-GeM-ERP-Knowledge-Gap-Report.md | 175 | 17.8 |
| GII-GeM-ERP-Quick-Start-Guide.md | 120 | 4.5 |
| GII-GeM-ERP-Daily-Operations-Checklist.md | 106 | 10.8 |
| GII-GeM-ERP-Troubleshooting-Guide.md | 105 | 8.6 |
| **Total** | **5,042** | **~311** |

### 2.2 Runtime Manual Index (`src/renderer/modules/erpBrain/data/manualIndex.js`)

- 13 keys, 96 `heading` sections with excerpts.
- `manualLoader.js` `MANUAL_SOURCES` registers **10** manuals; keys `daily-operations-detailed`, `month-end-closing-detailed`, `import-export-detailed` (3 keys, ~20 sections) are **not** in `MANUAL_SOURCES` and are referenced by **no** source file — orphaned index entries.

### 2.3 Manual Loader (`src/renderer/modules/erpBrain/loaders/manualLoader.js`)

- Provides `loadAllManuals()`, `getManualSections(sourceId)`, `searchManuals(query)`, `getAllManualIds()`, `MANUAL_SOURCES`.
- Section shape: `{ sectionId, heading, excerpt, sourceId, sourceTitle, sourcePath }`.

### 2.4 Runtime Consumers

| Consumer | Evidence |
|---|---|
| BRAIN-2 source-backed search | `sourceBackedSearchIndex.js:3` imports `loadAllManuals` |
| Ask ERP Brain / Help Assistant | BRAIN-3 report and `helpAssistantKnowledge.js` reference manuals as a source kind |
| WG-1 | 18 `helpRef` entries point to `docs/manuals/GII-GeM-ERP-Complete-User-Operations-Manual.md` |
| FF-1 | `sourceDirectories` includes `docs/manuals/` |
| BRAIN-1 | **No manuals repository** — `repository/` has 8 repos (errors, glossary, modules, navigation, reports, rules, screens, workflows); manuals are absent from the canonical knowledge repository |

### 2.5 Governance Context

- Rule 25.4 requires every new graph to: register in `graph-registry.json`; declare dependencies; declare compatibility; provide an audit pack in `scripts/verify-audit.js`; document regeneration; follow the EIL schema contract (schemaVersion, graphId, generatedAt, owner, description, dependencies, relationships, risk, metadata, statistics, compatibility, futureExtensions).
- `verify-audit.js` supports `--phase=<id>` and per-graph audit pack functions; EIL registry check consumes `graphs[]`, `dependencies`, `compatibilityMatrix`.

## 3. Findings

| # | Finding | Severity |
|---|---|---|
| F1 | BRAIN-1 has no canonical manuals repository — manuals live only in `docs/manuals/` + runtime `manualIndex.js`; no governed graph maps them | Medium |
| F2 | 3 orphaned `manualIndex.js` keys not exposed by `manualLoader.js` (dead metadata, no consumer) | Low |
| F3 | Manual content is unversioned relative to the app — no graph records staleness/coverage per module | Low |
| F4 | WG-1 `helpRef` references only the Complete User Operations Manual; other 9 manuals are not linked from any graph | Low |
| F5 | `verify-audit.js` has no manual/document integrity checks | Low |

None of the findings involve accounting, inventory, GST, vouchers, IPC, routes, or production data.

## 4. Proposed KG-5 Design

| Property | Proposed Value |
|---|---|
| Graph ID | KG-5 |
| Title | Document and Manual Graph |
| Version | 1.0.0 (schema frozen 1.0.0) |
| Location | `src/renderer/knowledge/manual-graph.json` |
| Schema | `repository/schema/manual-graph.schema.json` |
| Validator | `scripts/verify-manual-graph.js` (standalone) + `auditKg5()` pack in `scripts/verify-audit.js` |
| Package script | `npm run verify:manual-graph`; extend `lint:syntax` |
| Registry | `graph-registry.json` — KG-5 Active, registry v1.3.0 |
| Status | `active` |

### Content model (per manual)

- `manualId`, `title`, `fileName`, `sourcePath`, `lineCount`, `sectionCount`, `category`
- `sections[]`: `sectionId`, `heading`, `excerpt`, `topics[]` (keyword index)
- Cross-references (only where derivable with confidence): `featureRefs[]` (FF-1 feature IDs), `workflowStageRefs[]` (WG-1), `screenRefs[]` (RG-1), `reportRefs[]` (KG-4/BRAIN-1), `errorRefs[]` (BRAIN-1 errors)
- `status`: `current` | `stale` | `unknown`
- `sourceDocuments[]`: all 10 manual paths must resolve

### Verification checks (~20-25)

1. File exists; JSON valid; EIL contract fields present.
2. Graph identity: graphId=KG-5, schemaVersion=1.0.0, status=active.
3. Every manual resolves to an existing file in `docs/manuals/`.
4. Manual count matches `docs/manuals/*.md` inventory (10).
5. Section count and line counts are non-zero.
6. Every `featureRefs[]` resolves to an FF-1 feature ID.
7. Every `workflowStageRefs[]` resolves to a WG-1 node id.
8. Every `screenRefs[]` resolves to an RG-1 screen node.
9. Every `reportRefs[]` resolves to a BRAIN-1/KG-4 report id.
10. No live business data patterns (no amounts, customer names, voucher numbers).
11. Duplicate manual IDs and section IDs rejected.
12. Registry sync: KG-5 Active in `graph-registry.json` with populated schema/location/validation.
13. Statistics integrity (manualCount, sectionCount, referenceCount totals match arrays).
14. Orphaned runtime index keys (F2) documented in `knownGaps`.

## 5. Dependencies Assessment

| Dependency | Status |
|---|---|
| FF-1 feature IDs (50 features) | Present — resolvable |
| WG-1 workflow stage nodes (18) | Present — resolvable |
| RG-1 screens | Present — resolvable |
| BRAIN-1 errors/reports repos | Present |
| AG-1 | Not required by KG-5 (KG-5 is a consumer of other graphs, like FF-1) |
| Desktop smoke / runtime behavior | Not applicable — knowledge artifact only |

**Dependencies Satisfied: Yes.**

## 6. Compliance Checks (Rule 20)

| Check | Result |
|---|---|
| Architecture Compliance | PASS — App.jsx untouched; new files only in `src/renderer/knowledge/`, `repository/schema/`, `scripts/`, `repository/graph-registry.json`, `package.json`; no core logic change; reuse of manual inventory already in `manualIndex.js`/`MANUAL_SOURCES` |
| UX Compliance | N/A — no user-facing interaction, navigation, toolbar, search UI, or help UI changes. Graph is a governed knowledge artifact consumed by future AI tooling; no runtime UX code changes |
| Core logic preservation | PASS — no accounting/posting/GST/inventory/IPC/route changes |
| Read-only safety | PASS — graph is descriptive; no live business data; no database access |

## 7. Verification Plan (post-implementation)

- `npm.cmd run lint:syntax` (extended for `verify-manual-graph.js`)
- `npm run build`
- `npm run verify:manual-graph`
- `node scripts/verify-audit.js --phase=kg-5` (incl. report completeness)
- `node scripts/verify-audit.js` (full — expect 225+ checks)
- `node scripts/verify-erp.js` (regression — expect PASS WITH WARNINGS, unchanged governed FSR-1 pair)
- Desktop smoke test: **N/A** — knowledge-only phase

## 8. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Cross-reference drift (feature/screen IDs change) | Low | Validator enforces reference resolution; regeneration is manual + governed |
| Manual content staleness | Low | `status` field per manual; knownGaps records orphaned index keys |
| Scope creep into Help Assistant runtime | Medium | Phase scope explicitly excludes runtime code; any runtime wiring needs a separate BRAIN-3.5/UX phase |

## 9. Recommendation

**Proceed with KG-5 implementation** after this audit is approved. Implementation scope:

1. `repository/schema/manual-graph.schema.json` — frozen v1.0.0.
2. `src/renderer/knowledge/manual-graph.json` — 10 manuals, 96 sections, cross-references.
3. `scripts/verify-manual-graph.js` — standalone validator.
4. `scripts/verify-audit.js` — `auditKg5()` pack + registry + report completeness.
5. `repository/graph-registry.json` — KG-5 Active (registry v1.3.0), `docs/architecture/graph-registry.md` + `enterprise-intelligence-layer.md` row updates.
6. `package.json` — `verify:manual-graph` script, lint extension.
7. `reports/phase-kg-5-manual-graph-report.md` + lock note.
8. Commit + push (governance pipeline: verification → smoke N/A → commit).

No implementation begins until the audit is approved.

---
*Audit created: 2026-08-14.*