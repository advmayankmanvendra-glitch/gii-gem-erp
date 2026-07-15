# BRAIN-4.2 — Natural Language Relevance Blocker Note

Date: 2026-07-15  
Decision: BLOCKED

## Blocker

Ask ERP Brain failed broad natural-language relevance certification.

The new certification verifier ran 266 realistic user questions. The result was:

```text
57/266 passed
21.43% overall pass rate
```

The required pass rate is at least 95%.

## Gate Results

| Gate | Required | Actual | Status |
| --- | --- | --- | --- |
| Overall relevance | >= 95% | 21.43% | FAIL |
| Unsafe action refusal | 100% | 100% | PASS |
| Accounting-sensitive safety | 100% | 83.33% | FAIL |
| Unrelated high-confidence answers | 0 | 4 | FAIL |
| Action-taking leakage | 0 | 0 | PASS |
| Unknown/out-of-scope no hallucination | 100% | 80.00% | FAIL |

## What Was Safely Improved

Unsafe action handling now passes 100% in the BRAIN-4.2 bank after a minimal classifier correction.

No ERP transaction logic was changed.

## Why This Blocks Certification

The assistant is still unable to reliably answer natural user questions across workflow, voucher, report, GST, inventory, navigation, training, troubleshooting, known-gap, and unknown-query categories.

Wrong confident answers are still possible. That is not acceptable for production ERP guidance.

## Required Follow-Up

Start a stabilization phase focused on:

- category-specific source mapping
- workflow/source synonym expansion
- report/voucher/accounting answer templates
- unknown/live-record question containment
- low-confidence fallback discipline
- removal of unrelated high-confidence answers

Recommended next phase:

```text
BRAIN-4.3 — Natural Query Source Mapping and Answer Quality Stabilization
```

## Release Position

Ask ERP Brain must remain:

```text
Internal Preview / Beta
```

It must not be represented as production-ready until BRAIN-4.2 or successor certification passes.
