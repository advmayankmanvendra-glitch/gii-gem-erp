# KG-2 / WG-1 Lock Note

**Phase:** KG-2 / WG-1 — Workflow Graph Foundation
**Lock Date:** 2026-07-14
**Status:** Locked

## Lock Confirmation Checklist

| # | Item | Status |
|---|---|---|
| 1 | WG-1 report exists (`docs/architecture/kg-2-wg-1-workflow-graph-foundation-report.md`) | Confirmed |
| 2 | WG-1 graph exists (`src/renderer/knowledge/workflow-graph.json`) | Confirmed — 18 nodes, 17 edges |
| 3 | Schema exists (`repository/schema/workflow-graph.schema.json`) | Confirmed — draft-07 |
| 4 | Validation script exists (`scripts/verify-workflow-graph.js`) | Confirmed — 20 rules |
| 5 | Package script exists (`npm run verify:workflow-graph`) | Confirmed |
| 6 | Graph registry marks WG-1 as Active v1.0.0 | Confirmed — `repository/graph-registry.json` |
| 7 | WORK_ORDER is operational root | Confirmed — `operationalRootStage: WORK_ORDER`, all impact flags false |
| 8 | No runtime UI, IPC, preload, DB schema, accounting, voucher, GST, or inventory logic changed | Confirmed — WG-1 is read-only graph + documentation only |

## Verification Results

| Command | Result |
|---|---|
| `npm run lint:syntax` | PASS |
| `npm run build` | PASS |
| `npm run verify:knowledge` | PASS (167 entries, 0 errors) |
| `npm run verify:workflow-graph` | PASS (20 passed, 0 warnings, 0 failed) |
| `npm run verify:audit` | PASS (117 PASS, 2 INFO, 1 WARNING, 0 FAIL) |
| `npm run verify:accounting` | PASS (Development profile — empty data expected) |
| `npm run verify:financials` | PASS |
| `npm run verify:controls` | PASS (12 passed, 0 failed) |

## Git Working Tree

WG-1 files (new/untracked):
- `docs/architecture/kg-2-wg-1-workflow-graph-foundation-report.md`
- `repository/schema/workflow-graph.schema.json`
- `scripts/verify-workflow-graph.js`
- `src/renderer/knowledge/workflow-graph.json`

WG-1 files (modified):
- `package.json` — added `verify:workflow-graph` script
- `repository/graph-registry.json` — WG-1 registered Active v1.0.0
- `scripts/verify-audit.js` — WG-1 Audit Pack added

Pre-existing dirty baseline (not part of WG-1):
- `src/main/database/init.js`, `crudHelpers.js` — Phase 7 extraction
- `src/main/services/importValidationService.js` — stabilization
- Multiple untracked service files — stabilization

**Working tree remains intentionally dirty** — stabilization changes not yet committed.

## What Is Locked

- WG-1 v1.0.0 workflow graph (18 lifecycle nodes, 17 edges, WORK_ORDER operational root)
- WG-1 JSON Schema v1.0.0
- WG-1 validation script (20 rules)
- WG-1 audit pack in `scripts/verify-audit.js`
- `npm run verify:workflow-graph` package script
- Graph registry entry (Active v1.0.0, all fields populated)

## What Is Out of Scope

- **DG-1 (Database Intelligence Graph):** Not started — remains Planned 0.0.0
- **Runtime workflow execution engine:** Not started — WG-1 is read-only knowledge
- **ERP Brain workflow integration:** Not started
- **Chatbot / LLM integration:** Not started
- **Database schema changes:** None made
- **Accounting logic changes:** None made
- **UI/UX changes:** None made

## What Future Changes Require a Separate Phase

1. Adding new lifecycle stages to the workflow graph (schema additive change — minor version bump)
2. Changing WORK_ORDER parent entity or operational root (breaking change — major version bump)
3. DG-1 implementation (requires new phase)
4. Workflow execution engine (requires new phase)
5. WG-1 integration with BRAIN-1 for AI-assisted workflow guidance (requires new phase)

## Safe to Lock

**Yes.** WG-1 is a read-only knowledge artifact with no runtime dependencies. All 8 verification commands pass. No existing functionality is affected.
