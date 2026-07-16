# Help Screen-Level Entry-Point Smoke Test and Lock Note

Date: 2026-07-16

## Scope Audit

The targeted persistent **Learn This Screen** wiring is limited to:

- `src/renderer/App.jsx`: passes the existing `setProductivityLearnOpen(true)` action to Utilities.
- `src/renderer/components/layout/index.jsx`: exposes that existing action in expanded and compact Utilities states.

The focused diff contains no database schema, accounting, voucher-posting, GST, inventory-valuation, report SQL, IPC/preload, or ERP Brain reasoning changes.

Important scope condition: the repository has a broader mixed uncommitted Help/Brain worktree. It includes files beyond the two targeted UX wiring files, so this lock cannot certify the overall worktree as a two-file change set.

## Automated Verification

| Command | Result |
| --- | --- |
| `npm.cmd run lint:syntax` | PASS |
| `npm.cmd run build` | PASS; existing bundle-size warning only |
| `npm.cmd run verify:read-only-assistant` | PASS, 42/42 |
| `npm.cmd run verify:help-assistant-brain` | PASS, 23/23 |
| `npm.cmd run verify:assistant-relevance` | PASS, 258/266 (96.99%); all certification quality gates passed |
| `npm.cmd run verify:erp-brain` | PASS, 51/51 |
| `npm.cmd run verify:audit` | PASS, 204 checks; 0 warnings; 0 failures |
| `npm.cmd run verify:erp` | PASS, including accounting, financials, controls, voucher/inventory, flow, and Phase 10 |
| `npm.cmd run verify:accounting` | PASS through `verify:erp` |
| `npm.cmd run verify:financials` | PASS through `verify:erp` |
| `npm.cmd run verify:controls` | PASS through `verify:erp` |
| `npm.cmd run verify:voucher-inventory` | PASS through `verify:erp` |
| `npm.cmd run verify:flow` | PASS through `verify:erp` |
| `npm.cmd run verify:phase10` | PASS through `verify:erp` |

## Electron Visual Smoke Test

Status: NOT COMPLETED IN THIS AUDIT ENVIRONMENT.

The required visual click-through could not be performed because this environment has no interactive control or visual inspection of the Windows Electron desktop window.

Pending test matrix:

| Screen | Expanded Utilities | Compact Utilities | Learn dialog | Screen Help | Training | Ask ERP Help | Terminology and source labels | Console/runtime |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Payables | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Billing / GST Invoice | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Voucher Dashboard / Business Voucher | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Trial Balance | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Work Order / Supply Order | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |

Expected outcome for each screen:

- Learn This Screen is available in expanded Utilities and compact Utilities via its tooltip/action.
- It opens the existing `ProductivityLearnDialog` for the active screen.
- Screen Help, Training, and Ask ERP Help remain available.
- Guidance is scoped to the active screen.
- Normal users see no ERP Brain, BRAIN, KG, WG, DG, or FF identifiers.
- Source references remain plain language.
- No fatal console or runtime errors appear.

## Final Lock Decision

**BLOCKED - HUMAN ELECTRON SMOKE TEST AND WORKTREE SCOPE REVIEW REQUIRED.**

All automated regression and safety checks pass. Locking is blocked only because the required manual Electron visual evidence is absent and the working tree contains broader uncommitted Help/Brain changes that must be separated or intentionally included before a lock decision.
