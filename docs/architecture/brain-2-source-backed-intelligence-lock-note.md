# BRAIN-2 Source-Backed Intelligence — Lock Note

**Lock Date:** 2026-07-14
**Locked By:** architecture governance (read-only intelligence phase)
**Status:** Locked — Active v1.0.0
**Safe to Lock:** Yes
**Next Phase:** Help Assistant UI integration, contextual guidance, or ERP assistant (separate command required)

---

## Lock Summary

BRAIN-2 Source-Backed Intelligence Upgrade is locked as the completed ERP Brain intelligence baseline for GII GeM ERP. This lock confirms that BRAIN-2 is a read-only, source-backed, explainable, and auditable intelligence service. All future Help Assistant UI integration, chatbot, LLM, contextual assistant, and action-taking assistant work must treat BRAIN-2 as the authoritative source-backed intelligence layer.

---

## Pre-Implementation Gate Confirmed

| Gate | Status |
|---|---|
| BRAIN-2 report exists | Present |
| KG-4 lock note exists | Present |
| DG-1 lock note exists | Present |
| WG-1 lock note exists | Present |
| Graph registry: BRAIN-1 Active | Confirmed |
| Graph registry: KG-1 Active | Confirmed |
| Graph registry: RG-1 Active | Confirmed |
| Graph registry: WG-1 Active | Confirmed |
| Graph registry: DG-1 Active | Confirmed |
| Graph registry: KG-4 Active | Confirmed |

---

## Deliverables Confirmed

| # | Deliverable | Status |
|---|---|---|
| 1 | Foundation report: `docs/architecture/brain-2-source-backed-intelligence-upgrade-report.md` | Present |
| 2 | Graph loader: `src/renderer/modules/erpBrain/loaders/graphLoader.js` | Present |
| 3 | Manual loader: `src/renderer/modules/erpBrain/loaders/manualLoader.js` | Present |
| 4 | Manual index: `src/renderer/modules/erpBrain/data/manualIndex.js` | Present (65 sections across 10 manuals) |
| 5 | Search index: `src/renderer/modules/erpBrain/services/sourceBackedSearchIndex.js` | Present |
| 6 | Search service: `src/renderer/modules/erpBrain/services/sourceBackedSearchService.js` | Present (30+ synonyms) |
| 7 | Answer builder: `src/renderer/modules/erpBrain/services/sourceBackedAnswerBuilder.js` | Present |
| 8 | Verification script: `scripts/verify-erp-brain.js` | Present (27 checks) |
| 9 | Repository normalization: `src/renderer/modules/erpBrain/loaders/repositoryLoader.js` | Updated (normalization adapter) |
| 10 | BRAIN-2 exports: `src/renderer/modules/erpBrain/index.js` | Updated (12 new exports) |
| 11 | Help Assistant helper: `src/renderer/modules/helpAssistant/helpAssistantKnowledge.js` | Updated (brainSearchAsTopics) |
| 12 | Help Assistant metadata: `src/renderer/modules/helpAssistant/helpAssistantUtils.js` | Updated (brain source metadata) |
| 13 | Package script: `npm run verify:erp-brain` | Present (in package.json) |
| 14 | Audit integration: BRAIN-2 Audit Pack in `scripts/verify-audit.js` | Confirmed (13 checks, 165 total PASS) |

---

## Source Coverage Confirmed

| Source | Loaded by | Status |
|---|---|---|
| BRAIN repository sources (8 repos) | repositoryLoader.js | Confirmed |
| WG-1 workflow graph (18 nodes, 17 edges) | graphLoader.js | Confirmed |
| DG-1 database graph (63 tables, 51 relationships) | graphLoader.js | Confirmed |
| KG-4 voucher/accounting graph (14 voucher types, 23 posting functions) | graphLoader.js | Confirmed |
| RG-1 renderer graph (155 files, 36 screens) | graphLoader.js | Confirmed |
| Manuals (10 docs, 65 sections) | manualLoader.js | Confirmed |
| Help catalog | indirect (BRAIN repository) | Confirmed |
| Rules (40 entries) | repositoryLoader.js | Confirmed |
| Screens (30 entries) | repositoryLoader.js | Confirmed |
| Workflows (6 entries) | repositoryLoader.js | Confirmed |
| Reports (31 entries) | repositoryLoader.js | Confirmed |
| Errors (30 entries) | repositoryLoader.js | Confirmed |
| Glossary (40 entries) | repositoryLoader.js | Confirmed |
| Modules (17 entries) | repositoryLoader.js | Confirmed |
| Navigation (20 entries) | repositoryLoader.js | Confirmed |

---

## Behavior Confirmed

| Behavior | Status |
|---|---|
| Source-backed search returns results with source references | Confirmed |
| Synonym search maps user terminology | Confirmed (30+ synonyms) |
| Work Order / WO → Supply Order / WORK_ORDER | Confirmed (in SYNONYM_MAP, WG-1) |
| Bill History → billing / GST invoice / invoice register | Confirmed (in SYNONYM_MAP) |
| Trial Balance → ledger_entries | Confirmed (via KG-4, DG-1) |
| Receipt voucher → receipt debit/credit pattern | Confirmed (via KG-4) |
| Answers include source references (graphId, sourcePath, sourceKind) | Confirmed |
| Uncertain answers marked needsReview | Confirmed (confidence < 8 → needsReview) |
| Accounting-sensitive answers include safety boundaries | Confirmed |
| Preferred source selection by query topic | Confirmed (KG-4 for accounting, DG-1 for tables, etc.) |

---

## Safety Boundaries Confirmed

| Rule | Status |
|---|---|
| No chatbot UI added | Confirmed |
| No LLM/API/model integration added | Confirmed |
| No OpenAI/Claude/ChatGPT dependency | Confirmed |
| No write/posting/database mutation imports | Confirmed |
| No live transactional record inspection | Confirmed |
| No post/reverse/approve/delete/import/export/restore action exposed | Confirmed |
| No runtime ERP behavior changed | Confirmed |
| No database schema changed | Confirmed |
| No accounting logic changed | Confirmed |
| No voucher posting changed | Confirmed |
| No report SQL changed | Confirmed |
| No route/view keys changed | Confirmed |
| No IPC or preload APIs changed | Confirmed |

---

## Verification Results

All 15 verification commands pass:

| # | Command | Result |
|---|---|---|
| 1 | `npm run lint:syntax` | PASS |
| 2 | `npm run build` | PASS |
| 3 | `npm run verify:knowledge` | PASS (167 entries, 0 errors) |
| 4 | `npm run verify:workflow-graph` | PASS (20 passed) |
| 5 | `npm run verify:database-graph` | PASS (27 passed) |
| 6 | `npm run verify:voucher-accounting-graph` | PASS (21 passed) |
| 7 | `npm run verify:erp-brain` | PASS (27/27) |
| 8 | `npm run verify:audit` | PASS (165 PASS, 1 INFO, 1 WARNING pre-existing) |
| 9 | `npm run verify:erp` | PASS (Safe to Commit: Yes, Safe to Lock: Yes) |
| 10 | `npm run verify:accounting` | PASS |
| 11 | `npm run verify:financials` | PASS |
| 12 | `npm run verify:controls` | PASS (12 passed) |
| 13 | `npm run verify:voucher-inventory` | PASS |
| 14 | `npm run verify:flow` | PASS |
| 15 | `npm run verify:phase10` | PASS |

Pre-existing warning: RG-1 high-risk App.jsx (in verify:audit). Not a BRAIN-2 issue.

---

## Git Status

### BRAIN-2 Intended Changes

**Modified:**
- `package-lock.json` — verify:erp-brain script + lint:syntax update
- `package.json` — verify:erp-brain script added, lint:syntax extended
- `scripts/verify-audit.js` — BRAIN-2 Audit Pack (13 checks), brain-2 phase ID registered
- `src/renderer/modules/erpBrain/index.js` — 12 new exports for BRAIN-2 services
- `src/renderer/modules/erpBrain/loaders/repositoryLoader.js` — normalization adapter for bare-array JSON files
- `src/renderer/modules/helpAssistant/helpAssistantKnowledge.js` — brainSearchAsTopics helper added
- `src/renderer/modules/helpAssistant/helpAssistantUtils.js` — brain source metadata in answer object

**Created:**
- `docs/architecture/brain-2-source-backed-intelligence-upgrade-report.md`
- `scripts/verify-erp-brain.js` — 27-check verification script
- `src/renderer/modules/erpBrain/data/manualIndex.js` — manual section index
- `src/renderer/modules/erpBrain/loaders/graphLoader.js` — EIL graph loader
- `src/renderer/modules/erpBrain/loaders/manualLoader.js` — manual document loader
- `src/renderer/modules/erpBrain/services/sourceBackedAnswerBuilder.js` — answer builder
- `src/renderer/modules/erpBrain/services/sourceBackedSearchIndex.js` — unified search index
- `src/renderer/modules/erpBrain/services/sourceBackedSearchService.js` — synonym-backed search

### Pre-existing Dirty Baseline (Not Part of BRAIN-2)

**Modified (pre-existing dirty):**
- `src/main/database/crudHelpers.js` — stabilization from init.js refactor
- `src/main/database/init.js` — stabilization from init.js refactor
- `src/main/services/importValidationService.js` — stabilization from import extract
- `repository/graph-registry.json` — KG-4 registration (from earlier phase)

**Untracked (pre-existing, from earlier phases):**
- DG-1 report, lock note, schema, verification script, graph
- WG-1 report, lock note, schema, verification script, graph
- KG-4 report, lock note, schema, verification script, graph
- KI-0 audit report, stabilization report
- Extracted services (authService, billingService, etc.)

**No runtime UI, route, IPC, preload, database schema, migration, seed, accounting, voucher, GST, inventory valuation, or report SQL logic was changed as part of BRAIN-2.**

---

## Known Gaps (from BRAIN-2)

| ID | Gap | Impact |
|---|---|---|
| BRAIN2-GAP-001 | KG-1 knowledge entries are in JS module files, not directly importable as data | Search index does not include KG-1 entries directly; accessible via KG-1 registry API |
| BRAIN2-GAP-002 | Manual content is pre-indexed in manualIndex.js rather than parsed from markdown | Requires manual index update when manuals change |
| BRAIN2-GAP-003 | Help Assistant does not call brain search by default | Brain integration in Help Assistant requires a future UI phase |
| BRAIN2-GAP-004 | No fuzzy/full-text search engine | Uses substring matching with scoring |
| BRAIN2-GAP-005 | Graph files loaded via static JSON imports (not from registry) | Registry-driven loading deferred |

These gaps do not block the BRAIN-2 lock. They are documented for future intelligence improvement phases.

---

## Lock Boundaries

### What Is Locked
- BRAIN-2 graph loader (graphLoader.js)
- BRAIN-2 manual loader (manualLoader.js, manualIndex.js)
- BRAIN-2 search index, search service, answer builder
- BRAIN-2 verification script (verify-erp-brain.js)
- BRAIN-2 Audit Pack in verify:audit.js
- BRAIN-2 foundation report and this lock note
- Repository shape normalization (repositoryLoader.js)
- BRAIN-2 index.js exports
- Help Assistant brain integration helpers (brainSearchAsTopics, brain source metadata)

### What Is Out of Scope
- Help Assistant UI integration or behavior change
- Chatbot, LLM gateway, or AI model integration
- Action-taking assistant behavior
- Any runtime ERP code change
- Any database schema change
- Any accounting logic change
- Any voucher posting change
- Any report SQL change
- Any UI or navigation change

### What Future Changes Require a Separate Phase
- Modifying BRAIN-2 service logic (requires version increment)
- Modifying BRAIN-2 source coverage (adding new graph/manual sources)
- Help Assistant brain-backed UI wiring
- Chatbot or LLM integration
- Action-taking assistant
- Live record read-only data API
- Any runtime code changes

---

## Final Result

**BRAIN-2 v1.0.0 is locked as the source-backed intelligence baseline for future Help Assistant, contextual guidance, and ERP assistant phases.**
