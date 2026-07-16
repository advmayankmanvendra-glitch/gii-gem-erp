# Help Assistant User-Facing Terminology Lock Note

Date: 2026-07-16

## Objective

Verify that GII ERP Help Assistant is the sole user-facing help product and ERP Brain remains an internal retrieval, classification, and safety architecture.

## User-Facing Terminology Audit

Verified in the rendered Help Assistant, contextual Screen Help handoff, and Utilities entry points:

| Required user-facing text | Result |
| --- | --- |
| Help Assistant | PASS |
| Ask a Question | PASS |
| Ask ERP Help | PASS |
| Ask a Question About This Screen | PASS |
| Source-backed answers | PASS |
| Plain-language source names | PASS |

No user-facing occurrences were found in Help Assistant, ERP Assistant UI, contextual help, or Utilities UI for:

- ERP Brain
- BRAIN-1, BRAIN-2, BRAIN-3, BRAIN-4
- KG, WG, DG, or FF graph codes
- WG-1, DG-1, KG-4, FF-1, or other graph IDs

Source references remain visible as plain-language categories such as Workflow, ERP data model, Accounting guidance, Screen guidance, ERP knowledge, and Manual.

## Internal Architecture Preservation

Verified:

- ERP Brain modules remain the internal retrieval, query-classification, source-selection, role-rendering, and safety layer.
- Help Assistant remains the user-facing UI shell.
- No database, accounting, voucher, report, IPC, preload, route, or business-workflow logic was changed by this terminology lock.
- Read-only assistant verification confirms no LLM/API, live-record inspection, write IPC, database driver, shell, or action-taking capability in assistant modules.

## Verification Results

| Command | Result |
| --- | --- |
| `npm.cmd run lint:syntax` | PASS |
| `npm.cmd run build` | PASS; existing bundle-size warning only |
| `npm.cmd run verify:read-only-assistant` | PASS, 42/42 |
| `npm.cmd run verify:help-assistant-brain` | PASS, 23/23 |
| `npm.cmd run verify:erp-brain` | PASS, 51/51 |
| `npm.cmd run verify:assistant-relevance` | PASS, 258/266 (96.99%); unsafe refusal 100%; accounting safety 100%; unknown containment 100% |
| `npm.cmd run verify:audit` | PASS, 204 checks; 0 warnings; 0 failures |
| `npm.cmd run verify:erp` | PASS, including accounting, financials, controls, voucher/inventory, operational flow, and Phase 10 |

## Manual Electron Smoke Test

Status: NOT COMPLETED IN THIS AUDIT ENVIRONMENT.

The current environment supports repository verification but not interactive control or visual inspection of the Windows Electron desktop window. The following human click-through remains mandatory:

1. Open ERP and Help Assistant.
2. Open Ask a Question / Ask ERP Help.
3. Ask `what is work order`; confirm source-backed plain-language guidance.
4. Ask `post this voucher`; confirm clear refusal with no action option.
5. Confirm no ERP Brain, BRAIN, or graph identifiers are visible.
6. Confirm source references use plain-language names.
7. Confirm the Electron console has no fatal errors.

## Lock Decision

**NOT LOCKED - MANUAL ELECTRON SMOKE TEST REQUIRED.**

Automated terminology, architecture-boundary, safety, and ERP regression gates pass. The terminology lock may be marked complete only after the required human desktop smoke test passes and the existing mixed working-tree scope is reviewed for commit readiness.
