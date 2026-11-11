# BRAIN-4.1 — Ask ERP Brain Live Query Relevance Hotfix Report

Date: 2026-07-15  
Branch: phase-16-enterprise-crm-integration  
Mode: Corrective hotfix after Electron live query testing

## Feature Classification

Primary category: Intelligence  
Secondary categories: AI Guidance, UX, Governance  

This phase corrects read-only Ask ERP Brain query classification, source relevance, answer fallback handling, and regression verification. It does not change accounting, inventory, GST, database, IPC, preload, posting, reversal, approval, import, export, or report SQL behavior.

## Dependency Assessment

Dependencies satisfied: Yes

Relevant dependencies:
- BRAIN-2 ERP Brain source-backed search
- BRAIN-3 contextual Help Assistant integration
- BRAIN-4 read-only ERP Assistant
- Enterprise Intelligence Layer registry and active graphs
- Rule 32 Navigation & Location Queries Are Always Safe

## Issue Summary

Manual Electron testing found three live relevance failures:

| Query | Previous behavior | Corrected behavior |
| --- | --- | --- |
| `post this vocuher` | Misspelled unsafe action was not refused and could receive unrelated source guidance. | Classified as `unsafe_action`; refused with `action-refused`; no unrelated Work Order/Purchase Order source. |
| `how many type of reports are there` | Could return unrelated Purchase Order / GeM Order guidance. | Classified as `report`; returns report guidance using report sources. |
| `what is voucher dashboard for` | Could return null or unrelated guidance. | Returns voucher dashboard/business voucher guidance; remains `accounting-sensitive`. |

Root cause:
- Category filtering could return no relevant category-scoped result while downstream answer construction still fell back to a global `bestCandidate`.
- Unsafe action classification did not tolerate the live typo `vocuher`.
- Report and voucher dashboard phrases lacked sufficient intent/source relevance handling.

## Files Changed

- `src/renderer/modules/erpAssistant/classifier/categoryDefinitions.js`
- `src/renderer/modules/erpAssistant/classifier/queryClassifier.js`
- `src/renderer/modules/erpAssistant/response/answerContractBuilder.js`
- `src/renderer/modules/erpBrain/services/sourceBackedAnswerBuilder.js`
- `src/renderer/modules/erpBrain/services/sourceBackedSearchService.js`
- `scripts/verify-read-only-erp-assistant-plan.js`
- `scripts/test-read-only-erp-assistant-internal.js`
- `docs/architecture/brain-4-1-ask-erp-brain-live-query-relevance-hotfix-report.md`
- `docs/audit/eil-production-certification-addendum-brain-4-1.md`

## Implementation Notes

- Added typo-tolerant unsafe action detection for direct action requests such as `post this vocuher`.
- Kept educational questions such as `how does posting work` out of unsafe refusal.
- Expanded report query classification for plural/type/count phrasing.
- Added voucher dashboard/business voucher/guided voucher/accounting voucher relevance handling.
- Prevented answer building from falling back to unrelated global candidates after category filtering.
- Added source relevance guards for report and voucher-accounting category searches.
- Added source-backed fallback text: `I do not have a source-backed answer for this query yet.`
- Added regression checks to the main read-only assistant verification path and internal assistant user-test script.

## Impact Assessment

IPC/preload impact: None  
Route/view key impact: None  
Database impact: None  
Accounting/posting impact: None  
Inventory impact: None  
GST impact: None  
Live-record inspection impact: None  
Action-taking impact: None  
LLM/network dependency impact: None

Business logic preserved: Yes. This phase only changes read-only classification, source selection, response construction, and verification coverage.

## Representative Query Verification

| Query | Result |
| --- | --- |
| `post this vocuher` | Refused; `action-refused`; high confidence; source limited to BRAIN-4 safety policy. |
| `post this voucher` | Refused; `action-refused`. |
| `reverse this voucher` | Refused; `action-refused`. |
| `how many type of reports are there` | Report guidance; source-backed report references; no Purchase Order leakage. |
| `what is voucher dashboard for` | Voucher dashboard/guided voucher guidance; `accounting-sensitive`; no Work Order replacement. |
| `what is Work Order in the workflow` | Workflow-sensitive Work Order / Supply Order source retained. |
| `where is Bill History` | Safe read-only navigation/report guidance retained. |
| `how does posting work` | Not over-blocked as unsafe action. |

## Verification Results

| Command | Result |
| --- | --- |
| `npm.cmd run lint:syntax` | PASS |
| `npm.cmd run build` | PASS |
| `npm.cmd run verify:read-only-assistant` | PASS, 42 checks |
| `npm.cmd run verify:erp-brain` | PASS, 51 checks |
| `npm.cmd run verify:help-assistant-brain` | PASS, 23 checks |
| `npm.cmd run verify:audit` | PASS, 183 checks, 2 info |
| `npm.cmd run verify:erp` | PASS, safe to commit: Yes, safe to lock: Yes |
| `npm.cmd run verify:accounting` | PASS |
| `npm.cmd run verify:financials` | PASS |
| `npm.cmd run verify:controls` | PASS, 12 checks |
| `npm.cmd run verify:voucher-inventory` | PASS |
| `npm.cmd run verify:flow` | PASS |
| `npm.cmd run verify:phase10` | PASS |
| `node scripts/test-read-only-erp-assistant-internal.js` | PASS, 80 checks |

Build warning:
- Existing Vite chunk-size warning remains. It is not introduced by this hotfix and does not block this BRAIN-4.1 gate.

## Desktop Smoke Test

Manual Electron smoke test status: Not rerun by Codex in this hotfix turn.  
Reason: This phase addressed live query failures already reported from Electron testing and completed automated verification. A human visual click-through is still required before release-candidate packaging.

## Production Readiness

Production readiness classification: Release Candidate correction  
Production readiness gate result: PASS for automated hotfix verification

Known limitations:
- No live record inspection is enabled.
- No action-taking assistant capability is enabled.
- Report category answers remain source-backed guidance, not live counts from database rows.
- Human Electron visual click-through remains required before packaging.

Safe to lock: Yes, after human Electron click-through confirms the corrected Ask ERP Brain answers render correctly in the desktop UI.
