# BRAIN-4.2 — Natural Language Relevance Certification Report

Date: 2026-07-15  
Mode: Testing and certification  
Decision: BLOCKED — do not certify Ask ERP Brain as production-ready

## Executive Summary

BRAIN-4.2 created a broad natural-language relevance certification layer for Ask ERP Brain. The certification layer is now present and runnable, but Ask ERP Brain did not pass the certification gate.

This is the correct governance outcome. BRAIN-4.1 fixed three live-query failures, but BRAIN-4.2 proves the assistant is not yet reliable enough for production-grade natural-language guidance.

Release recommendation:

```text
ERP core: Release Candidate can continue through its own gate.
Ask ERP Brain: Internal Preview / Beta only.
```

## Why BRAIN-4.2 Was Needed

The earlier BRAIN-4.1 hotfix verified three known failures:

1. `post this vocuher`
2. `how many type of reports are there`
3. `what is voucher dashboard for`

That proved a hotfix worked. It did not prove the assistant can answer broad natural questions correctly. BRAIN-4.2 therefore adds a dedicated relevance test bank and verifier.

## Files Added / Changed

- `scripts/assistant-natural-query-bank.js`
- `scripts/verify-assistant-natural-language-relevance.js`
- `package.json`
- `scripts/verify-audit.js`
- `src/renderer/modules/erpAssistant/classifier/queryClassifier.js`
- `docs/architecture/brain-4-2-natural-language-relevance-certification-report.md`
- `docs/architecture/brain-4-2-natural-language-relevance-blocker-note.md`

## Test Bank Size

Natural query bank size: 266 queries

Coverage includes:

- Work Order / Supply Order
- Procurement
- GRN
- Delivery Challan
- Installation / CRAC
- Billing / GST Invoice
- Receipts
- Supplier Payments
- Business Voucher
- Accounting Voucher
- Voucher Dashboard
- Trial Balance
- Profit & Loss
- Balance Sheet
- Reports
- GST / Tax
- Inventory / Stock
- Import / Export
- Tally Migration
- Month-End Closing
- Troubleshooting
- Known Gaps
- Unsafe Actions
- Typos and casual language
- Unknown / out-of-scope questions

## Certification Result

Command:

```text
npm.cmd run verify:assistant-relevance
```

Result:

```text
Final: BLOCKED
```

Summary:

| Gate | Result |
| --- | --- |
| Overall relevance pass rate >= 95% | FAIL — 57/266 passed (21.43%) |
| Unsafe action refusal = 100% | PASS — 20/20 passed |
| Accounting-sensitive safety boundary = 100% | FAIL — 60/72 passed (83.33%) |
| No unrelated high-confidence answers | FAIL — 4 failures |
| No action-taking leakage | PASS — 0 failures |
| Unknown/out-of-scope no hallucination = 100% | FAIL — 16/20 passed (80.00%) |

## Category Summary

| Category | Result |
| --- | --- |
| workflow | 5/50 passed |
| voucher_accounting | 6/42 passed |
| voucher_accounting/report | 0/30 passed |
| report | 9/20 passed |
| gst_tax | 2/12 passed |
| inventory | 2/12 passed |
| screen_help | 3/20 passed |
| manual_training | 0/20 passed |
| troubleshooting | 0/10 passed |
| known_gap | 0/10 passed |
| unsafe_action | 20/20 passed |
| unknown | 10/20 passed |

## Fixes Applied

Minimal safety fix only:

- Expanded unsafe action object detection to include journal, receipt, payment, bill, and invoice phrasing.
- Prevented educational phrasing such as “does X post ledger entries?” from being treated as a direct action command solely because it contains the word `post`.

This improved unsafe action refusal to 100%.

No accounting, database, voucher posting, report SQL, IPC, preload, GST, inventory, or live-record behavior was changed.

## Most Common Failure Patterns

1. Workflow questions often classify correctly but fail to retrieve a source-backed answer.
2. GRN, Delivery Challan, and stock questions frequently cross between workflow and inventory categories.
3. Accounting/reporting questions are often source-backed inconsistently or lack required safety wording.
4. Manual/training and known-gap queries lack reliable answer/source mapping.
5. Unknown/live-record questions are not always held to low-confidence needs-review behavior.
6. Some high-confidence answers still contain unrelated dominant entities.

## Verification Completed

| Command | Result |
| --- | --- |
| `npm.cmd run lint:syntax` | PASS |
| `npm.cmd run verify:read-only-assistant` | PASS — 42 checks |
| `npm.cmd run verify:assistant-relevance` | FAIL / BLOCKED |

Further full release verification was not run because the new BRAIN-4.2 certification gate failed.

## Remaining Risks

- Ask ERP Brain can still return irrelevant or weakly sourced answers for natural questions.
- The current assistant behaves like a source search plus answer formatter, not a fully reliable ERP guidance brain.
- Broader production release would create user confidence risk.
- High-confidence wrong answers remain more dangerous than honest low-confidence fallback.

## Release Recommendation

Ask ERP Brain must not be released as production-ready.

Allowed status:

```text
Ask ERP Brain — Internal Preview / Beta
```

Required next programme:

```text
BRAIN-4.3 — Natural Query Source Mapping and Answer Quality Stabilization
```

Safe to lock: No  
Safe to package as production feature: No  
Safe to keep for internal preview/testing: Yes
