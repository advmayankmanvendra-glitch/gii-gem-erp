# BRAIN-4 Read-Only ERP Assistant — Combined Phase Report (BRAIN-4A through BRAIN-4D)

## 1. Executive Summary

BRAIN-4 progressed through four sub-phases from planning to UI extension, delivering a complete read-only, source-backed, explainable ERP Assistant integrated into the existing Help Assistant. All phases consume only the locked Enterprise Intelligence Layer v1.0.0 baseline. No chatbot, LLM, live-record, or action-taking capability was implemented.

| Phase | Scope | Status | Files |
|---|---|---|---|
| BRAIN-4A | Design Specification | Locked | 2 docs (706 lines) |
| BRAIN-4B | Query Classifier Prototype | Locked | 2 files (407 lines) |
| BRAIN-4C | Answer Contract Implementation | Locked | 5 files (352 lines) |
| BRAIN-4D | Help Assistant UI Extension | Locked | 9 files (412 lines) |
| **Total** | | | **18 files, 1,877 lines** |

## 2. Architecture Overview

```
HelpAssistant.jsx  ─── mode === "brain" ───> AssistantPanel.jsx
                                                   │
                                              [query + currentView]
                                                   │
                                                   v
                                         knowledgeBridge.js
                                         resolveQuery()
                                              │
                              ┌───────────────┼───────────────┐
                              v               v               v
                    queryClassifier.js  sourceBackedSearch  contextualBrainHelp
                    classifyQuery()     searchByCategory()  resolveContext()
                              │               │               │
                              └───────┬───────┘               │
                                      v                       │
                              answerContractBuilder.js         │
                              assembleContract()               │
                                      │                       │
                                      v                       v
                              safetyEnforcer.js       screenContext
                              enforceSafety()
                                      │
                                      v
                              roleRenderer.js
                              renderForRole()
                                      │
                                      v
                              AssistantAnswerCard.jsx
                              [renders full response]
```

## 3. Phase-by-Phase Breakdown

### 3.1 BRAIN-4A: Design Specification

**Deliverable:** `docs/architecture/brain-4a-read-only-erp-assistant-design-specification.md` (656 lines)

Defined:
- Module architecture (erpAssistant/ tree: classifier, response, sources, ui)
- Component hierarchy (7 UI components with interfaces)
- Data flow (query -> classify -> BRAIN-2 search -> answer builder -> safety enforcer -> role renderer -> UI)
- Query classification algorithm (12 categories with scoring)
- Answer contract shape and builder pipeline
- Safety enforcer design (6-domain boundary matrix)
- Role-aware presentation (6 roles, presentation-only adaptation)
- UI layout and prohibited element specification
- Integration points with BRAIN-2, BRAIN-3, knowledge graphs
- Verification design (20 checks: R4-001 through R4-020)
- Implementation sequencing (BRAIN-4B through BRAIN-4F)
- File creation/modification plan (11 new files, 5 existing extended)

### 3.2 BRAIN-4B: Query Classifier Prototype

**Files created:** `categoryDefinitions.js` (195 lines), `queryClassifier.js` (212 lines)

**Architecture:**
- 12 query categories: workflow, screen_help, manual_training, database_table, voucher_accounting, report, gst_tax, inventory, troubleshooting, known_gap, unsafe_action, unknown
- Weighted keyword matching (primary=3pts, secondary=1pt)
- Unsafe action pre-check (immediate refusal category)
- Tiebreaker by specificity order
- Minimum score threshold -> unknown category
- Derived safety flags (isAccountingSensitive, requiresSafetyNotice, etc.)

**Interface:** `classifyQuery(query, currentViewKey)` returns `{ category, categoryLabel, confidence, preferredSource, fallbackSource, safetyFlags, needsReview }`

### 3.3 BRAIN-4C: Answer Contract Implementation

**Files created:** `safetyEnforcer.js`, `answerContractBuilder.js`, `knowledgeBridge.js`

**Existing files modified:** `sourceBackedSearchService.js` (+searchByCategory), `sourceBackedAnswerBuilder.js` (+buildAnswerContract)

**Architecture:**
- `knowledgeBridge.js` — orchestrator: `resolveQuery(query, currentViewKey)` wires classifier -> BRAIN-2 searchByCategory -> BRAIN-3 resolveContext -> safetyEnforcer -> answerContractBuilder
- `answerContractBuilder.js` — assembles full response contract: unsafe-action refusal, safety notice prepend, known gaps extraction, prohibited actions computation, role presentation metadata
- `safetyEnforcer.js` — 6-domain boundary matrix with domain-specific notices and safety rules
- `sourceBackedSearchService.searchByCategory()` — category-filtered search with preferred-source preference and fallback logic
- `sourceBackedAnswerBuilder.buildAnswerContract()` — low-level contract builder

**Response contract shape:**
```js
{
  query, answer, confidence, needsReview,
  sourceReferences: [{ title, sourceKind, sourcePath, graphId, summary }],
  relatedWorkflowStages, relatedScreens, relatedTables,
  relatedVoucherTypes, relatedReports,
  safetyBoundary, knownGaps, suggestedNextHelpTopic,
  prohibitedActions, rolePresentation: { depth, showSources, showSafety, showGaps }
}
```

### 3.4 BRAIN-4D: Help Assistant UI Extension

**Files created (7):** `roleRenderer.js`, `AssistantPanel.jsx`, `AssistantAnswerCard.jsx`, `AssistantSourceRefs.jsx`, `AssistantSafetyNotice.jsx`, `AssistantRoleProvider.jsx`

**Existing files modified (3):** `contextualBrainHelp.js` (+resolveScreenAssistantContext), `helpAssistantUtils.js` (+dispatchToAssistant), `HelpAssistant.jsx` (+Ask ERP Brain tab)

**UI Architecture:**

| Component | Role |
|---|---|
| `AssistantPanel.jsx` | Main read-only panel with input field, suggestion chips, loading state |
| `AssistantAnswerCard.jsx` | Answer display with confidence badge (high/medium/low), review banner, source refs, related items grid, safety notice, known gaps, next topic, prohibited actions |
| `AssistantSourceRefs.jsx` | Color-coded source badges (WG-1=blue, DG-1=purple, KG-4=red, RG-1=green, BRAIN-1=amber, Manual=gray) |
| `AssistantSafetyNotice.jsx` | Domain-specific banners with color coding, icons, and standardized notice texts |
| `AssistantRoleProvider.jsx` | React context provider for role (read-only, no permission mutation) |
| `roleRenderer.js` | Depth mapping (admin=diagnostic, accountant=detailed, operator=basic, etc.) |

**Role Depth Config:**

| Role | Depth | Sources | Safety | Gaps |
|---|---|---|---|---|
| admin | diagnostic | 5, with paths | yes | yes |
| accountant | detailed | 3 | yes | no |
| operator | basic | 1 | no | no |
| approver | standard | 2 | yes | no |
| auditor | detailed | 3 | yes | no |
| readonly | basic | 1 | no | no |

**Prohibited UI Elements:** No "Post this voucher", "Reverse this voucher", "Approve this record", "Import this file", "Fix database", "Run command", "Delete record", "Export to CSV", "SQL query input", "JavaScript console input", or "File upload input" buttons exist.

## 4. File Inventory

### New Files (15)

| File | Phase | Lines |
|---|---|---|
| `docs/architecture/brain-4a-read-only-erp-assistant-design-specification.md` | 4A | 656 |
| `docs/architecture/brain-4a-read-only-erp-assistant-design-specification-lock-note.md` | 4A | 50 |
| `src/renderer/modules/erpAssistant/classifier/categoryDefinitions.js` | 4B | 195 |
| `src/renderer/modules/erpAssistant/classifier/queryClassifier.js` | 4B | 212 |
| `src/renderer/modules/erpAssistant/response/safetyEnforcer.js` | 4C | 111 |
| `src/renderer/modules/erpAssistant/response/answerContractBuilder.js` | 4C | 84 |
| `src/renderer/modules/erpAssistant/response/roleRenderer.js` | 4D | 68 |
| `src/renderer/modules/erpAssistant/sources/knowledgeBridge.js` | 4C | 76 |
| `src/renderer/modules/erpAssistant/ui/AssistantPanel.jsx` | 4D | 83 |
| `src/renderer/modules/erpAssistant/ui/AssistantAnswerCard.jsx` | 4D | 119 |
| `src/renderer/modules/erpAssistant/ui/AssistantSourceRefs.jsx` | 4D | 49 |
| `src/renderer/modules/erpAssistant/ui/AssistantSafetyNotice.jsx` | 4D | 44 |
| `src/renderer/modules/erpAssistant/ui/AssistantRoleProvider.jsx` | 4D | 25 |
| **Total new files** | | **1,772** |

### Existing Files Modified (5)

| File | Phase | Change |
|---|---|---|
| `src/renderer/modules/erpBrain/services/sourceBackedSearchService.js` | 4C | +searchByCategory() |
| `src/renderer/modules/erpBrain/services/sourceBackedAnswerBuilder.js` | 4C | +buildAnswerContract() |
| `src/renderer/modules/helpAssistant/contextualBrainHelp.js` | 4D | +resolveScreenAssistantContext() |
| `src/renderer/modules/helpAssistant/helpAssistantUtils.js` | 4D | +dispatchToAssistant() |
| `src/renderer/modules/helpAssistant/HelpAssistant.jsx` | 4D | +Ask ERP Brain tab |

## 5. Dependency Map

```
erpAssistant/classifier/queryClassifier.js
  └── imports: categoryDefinitions.js

erpAssistant/sources/knowledgeBridge.js
  ├── imports: queryClassifier.js
  ├── imports: sourceBackedSearchService.js (BRAIN-2)
  ├── imports: contextualBrainHelp.js (BRAIN-3)
  ├── imports: safetyEnforcer.js
  └── imports: answerContractBuilder.js

erpAssistant/response/answerContractBuilder.js
  └── imports: sourceBackedAnswerBuilder.js (BRAIN-2)

erpAssistant/response/safetyEnforcer.js         (no imports)

erpAssistant/response/roleRenderer.js           (no imports)

erpAssistant/ui/AssistantPanel.jsx
  ├── imports: knowledgeBridge.js
  ├── imports: roleRenderer.js
  └── imports: AssistantAnswerCard.jsx

erpAssistant/ui/AssistantAnswerCard.jsx
  ├── imports: AssistantSourceRefs.jsx
  └── imports: AssistantSafetyNotice.jsx

helpAssistant/HelpAssistant.jsx
  └── imports: AssistantPanel.jsx

helpAssistant/helpAssistantUtils.js
  └── imports: knowledgeBridge.js (via dynamic require)
```

No circular dependencies. Clean separation: erpAssistant imports from erpBrain and helpAssistant, but erpBrain and helpAssistant do not import from erpAssistant.

## 6. Safety Verification

| Check | Status |
|---|---|
| No LLM/API import in erpAssistant module | PASS — no OpenAI, Anthropic, fetch, axios |
| No write IPC import | PASS — no ipcRenderer for write channels |
| No database driver import | PASS — no better-sqlite3, sql.js |
| No HTTP client import | PASS — no fetch, axios |
| No shell/child_process import | PASS — no child_process, shell |
| 12 query categories defined | PASS — categoryDefinitions.js |
| Preferred source rules defined per category | PASS — each category has preferred + fallback |
| Safety boundaries defined per domain | PASS — safetyEnforcer covers 6 domains |
| Response contract includes sourceReferences | PASS — buildAnswerContract produces them |
| Response contract includes confidence | PASS |
| Response contract includes safetyBoundary | PASS |
| Unsafe action request returns refusal | PASS — classifyQuery detects unsafe keywords |
| Accounting-sensitive query applies safety notice | PASS — safetyEnforcer detects accounting domain |
| No UI mutation buttons | PASS — no post/reverse/approve/import/export buttons |
| BRAIN-2 backward compatible | 51/51 PASS |
| BRAIN-3 backward compatible | 23/23 PASS |
| Audit | 183 PASS, 2 INFO |

## 7. Architectural Decisions

| Decision | Rationale |
|---|---|
| knowledgeBridge.js as orchestrator | Single entry point for all queries, clean separation of concerns |
| categoryDefinitions.js separate from classifier | Easy to extend categories without changing algorithm |
| safetyEnforcer as standalone module | Can be tested independently, reused across query paths |
| roleRenderer reads role only | Presentation-only adaptation, no permission mutation |
| UI as pure React components | No state management library dependency, follows existing patterns |
| AssistantRoleProvider as React context | Lightweight role propagation without prop drilling |
| dynamic require for dispatchToAssistant | Avoids hard dependency from helpAssistant to erpAssistant |
| Color-coded source badges | Quick visual identification of source graph |

## 8. Risk Mitigation Status

| Risk | Mitigation | Status |
|---|---|---|
| Hallucinated ERP process | Source-required contract; needsReview for low confidence | Implemented |
| Wrong voucher/accounting answer | KG-4 preferred source + safety notice enforced | Implemented |
| Guidance treated as posting authority | Prohibited actions footer on every answer | Implemented |
| Work Order/Supply Order confusion | Canonical terminology via BRAIN-2 synonym map | Inherited |
| Live-record assistant introduced | No DB/IPC read capability in module scope | Verified |
| LLM without governance | No SDK/API/network dependency | Verified |
| Role/permission bypass | Presentation-only role renderer | Implemented |
| Action-taking feature creep | No mutation buttons in UI; prohibited imports scanned | Verified |

## 9. Verification Results (All Phases)

| Command | BRAIN-4A | BRAIN-4B | BRAIN-4C | BRAIN-4D |
|---|---|---|---|---|
| `lint:syntax` | PASS | PASS | PASS | PASS |
| `build` | PASS | PASS | PASS | PASS (243 modules) |
| `verify:knowledge` | 167 PASS | — | — | — |
| `verify:workflow-graph` | 21 PASS | — | — | — |
| `verify:database-graph` | 27 PASS | — | — | — |
| `verify:voucher-accounting-graph` | 21 PASS | — | — | — |
| `verify:erp-brain` | 51 PASS | 51 PASS | 51 PASS | 51 PASS |
| `verify:help-assistant-brain` | 23 PASS | 23 PASS | 23 PASS | 23 PASS |
| `verify:audit` | 183/2 INFO | 183/2 INFO | 183/2 INFO | 183/2 INFO |
| `verify:erp` (full suite) | PASS | — | — | — |

## 10. Remaining Phases

| Phase | Scope | Status |
|---|---|---|
| BRAIN-4E | Read-Only Assistant Verification script | Pending |
| BRAIN-4F | Internal User Testing | Pending |
| BRAIN-5 | LLM Gateway Feasibility Study (study only) | Deferred |

## 11. Lock Confirmation

BRAIN-4A through BRAIN-4D are locked as completed phases. All deliverables satisfy:
- No chatbot UI implemented.
- No LLM, API, model, OpenAI, Claude, Gemini, Anthropic, or external SDK integration added.
- No live-record assistant, database query, or data mutation capability.
- No action-taking behavior.
- No runtime ERP code changed beyond the documented modifications.
- No database, accounting, voucher, ledger, GST, inventory, report SQL, IPC, preload, or route logic changed.
- All EIL baselines (BRAIN-2 51/51, BRAIN-3 23/23) remain backward compatible.

**Safe to proceed to BRAIN-4E (Verification Script) when separately approved.**

---

*End of BRAIN-4 Combined Phase Report. Generated 2026-07-15.*
