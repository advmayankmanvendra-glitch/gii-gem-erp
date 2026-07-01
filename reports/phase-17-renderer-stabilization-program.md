# Phase 17 — Renderer Stabilization Program

**Program Charter** — 2026-07-01

---

## Program Classification

Phase 17 is a **Renderer Stabilization Program**.

It is **not** a business feature phase.
It is **not** a traditional refactoring phase.

Its purpose is to stabilize, document, modularize and preserve the renderer architecture while maintaining complete functional integrity of GII GeM ERP.

---

## Program Objectives

1. Improve renderer maintainability.
2. Reduce technical debt.
3. Reduce AI repository scanning cost.
4. Improve architectural clarity.
5. Preserve business behavior.
6. Prepare the renderer for Phase 18 Architecture Separation.

The objective is **not** to reduce App.jsx at any cost.
The objective is to make the renderer easier to understand, safer to evolve, and less expensive for AI tools to analyze.

---

## Governing Documents

- Permanent Architecture Rules v3.1 (`AGENTS.md`)
- Enterprise Architecture Baseline v1.0 (`docs/architecture/GII-GeM-ERP-Enterprise-Architecture-Baseline-v1.0.md`)
- Enterprise Intelligence Layer v1.0 (`docs/architecture/enterprise-intelligence-layer.md`)
- Rule 26 — Major Program Baseline Rule (`AGENTS.md#26`)
- RG-1 Renderer Intelligence Graph (`repository/graph-registry.json` → `src/renderer/knowledge/renderer-graph.json`)

---

## Baseline

**Baseline Tag:** `renderer-baseline-2026-07-01`
**Verification:** PASS (104 audit checks, 10/10 ERP pipeline)
**Remote:** Pushed to origin
**External Backup:** Recorded

All five Rule 26 steps complete before any sub-phase begins.

---

## Strict Prohibitions

During Phase 17 do **NOT** modify:

- accounting formulas
- voucher posting
- GST logic
- inventory valuation
- profitability formulas
- database schema
- IPC names
- preload APIs
- route/view keys
- save/post/reversal behavior
- business workflows
- company context behavior

No business functionality shall change. Only renderer stabilization work is permitted.

---

## Execution Order

```
17A   CSS Segmentation
  ↓
17G   Help / Productivity Stabilization
  ↓
17C.1 Safe Presentation Extraction
  ↓
17H   App.jsx Responsibility Audit
  ↓
17L   Renderer Dependency Graph (COMPLETED — use RG-1 as intelligence source)
  ↓
17C.2 Conditional Presentation Extraction
  ↓
17J   Dead Code Cleanup
  ↓
17D/E/F Renderer Architecture Planning
  ↓
17B   Documentation Standardization
  ↓
17K   Configuration Consolidation
  ↓
17I   Consolidated Renderer Audit
```

Execute in order. Do not skip. Do not merge sub-phases. Do not begin the next until the current is completed, verified, reported, committed, and approved.

---

## AI Resource Policy

| Tool | Responsibilities |
|------|-----------------|
| **OpenCode** | CSS segmentation, Help/Productivity stabilization, presentation-only extraction, documentation, planning, dead code cleanup, configuration organization |
| **Codex** | Route registry implementation, navigation controller extraction, dialog manager implementation, context provider extraction, App shell redesign, database service extraction, init.js architectural work, accounting-sensitive refactoring |

---

## Verification Gate

After every source-code sub-phase:

```
npm.cmd run lint:syntax
npm.cmd run build
npm.cmd run verify:erp
```

All three must PASS before proceeding.

---

## Commit Discipline

Every sub-phase ends with:

1. Working tree clean (`git status`)
2. Commit
3. Tag (`phase-17<letter>-<descriptor>`)
4. Push (`git push && git push --tags`)
5. Report generated (`reports/phase-17<subphase>-report.md`)
6. User approval for next sub-phase

Never automatically continue. Never accumulate changes across sub-phases.

---

## Success Criteria

Phase 17 is complete when:

- Renderer is stabilized.
- Documentation is synchronized.
- RG-1 remains current.
- Verification passes.
- Business behavior remains unchanged.
- The renderer is fully prepared for Phase 18 Architecture Separation.

---

## Program Status

**READY TO EXECUTE**

Begin with: **Phase 17A — CSS Segmentation and Renderer Style Modularization**

Do not begin any other sub-phase until Phase 17A has been completed, verified, reported, committed, and explicitly approved.
