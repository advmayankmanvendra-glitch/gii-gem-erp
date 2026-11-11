# In-house correctness audit: 3f6c5d5..7ea3e03

- Scope: `git diff 3f6c5d5 7ea3e03 -- src scripts` ("Close the 3f6c5d5 audit findings: pinned GRN/GRNI cases gate the relevance run"). Two files:
  - `scripts/verify-assistant-natural-language-relevance.js`: +11 (`PINNED_CASE_IDS` gate, `:211-222`)
  - `src/renderer/knowledge/feature-function-graph.json`: FEA-14 "What is GRNI?" and "GRNI" `expectedAnswerType` "workflow" to "accounting_ref" (`:5124-5125`, `:5129-5130`)
- It answers `audit-3f6c5d5-correctness.md` L-1 and architecture Info 2, as listed in `responses-3f6c5d5.md`.
- Checkout: the repo at `7ea3e03`, read only (`git status` clean before and after). Mutations ran in scratch copies of `7ea3e03` and `3f6c5d5` (made with `git archive`, `node_modules` linked, not rebuilt). Nothing was committed, pushed or installed.
- Runs (Linux, Node v22.22.0), in the repo, all exit 0:
  - `verify-assistant-natural-language-relevance.js`: Final: PASS, 263/271, accounting safety 79/79, new gate PASS. The 8 failures are the same older cases (WO-006, WO-010, GRN-007, GRN-009, CRAC-005, BS-003, GST-010, INV-010).
  - `verify-feature-function-graph.js`: 32/32. `verify-knowledge.js`: 167 entries, 0 errors, 0 warnings.
  - `verify-erp-brain.js`: 51/0/0. `verify-help-assistant-brain.js`: 27/0/0.
  - `npm run -s test:integrity`: exit 0 (IPC 56/56, 0 skipped).
  - Also (other FF-1 readers): `verify-audit.js`, `verify-manual-graph.js`, `verify-governance-graph-registry.js`, `verify-voucher-accounting-graph.js`: exit 0.
- Date: 2026-11-11 10:45 IST

## Short answer

**No findings.** 3f6c5d5 L-1 is **closed**: the gate blocks when any of GRN-011 to GRN-015 fails or is missing, including the exact scenario in L-1. The `expectedAnswerType` change alters no routing, no answer and no verifier result.

## Gate mutations (scratch copy of 7ea3e03, relevance verifier)

| Mutation | Exit | Overall | Gate output |
|---|---|---|---|
| M0: head | 0 | 263/271 | PASS |
| Delete GRN-011 / 012 / 013 / 014 / 015 (each alone) | 1 each | 262/270 (97.04%) | "missing: GRN-0xx", BLOCKED |
| Add an impossible `mustContain` to GRN-011 / 012 / 013 / 014 / 015 (each alone) | 1 each | 262/271 (96.68%) | "failing: GRN-0xx", BLOCKED |
| Remove FEA-14 `naturalQuestionMap` entry "GRNI" (the 3f6c5d5 L-1 scenario) | 1 | 261/271 (96.31%) | "failing: GRN-014, GRN-015", BLOCKED |
| Rename GRN-014 to GRN-14 | 1 | 263/271 | "missing: GRN-014", BLOCKED |

In each run the pinned gate was the only FAIL; the 95% gate and the accounting gate stayed PASS, so without the new gate every row would have exited 0.

## Could it pass wrongly?

- `summary.failures` holds every failed case (only the printout is capped at 40, `:201`), so a pinned failure is never missed when there are many failures.
- Duplicate ids: the bank has duplicate ids today (WO-001 to WO-010, twice each; pre-existing, not GRN). If a second "GRN-01x" were added, any failing copy still puts the id in `failures`, so a duplicate can only block, never mask.
- The gate is keyed on id, not content: editing a pinned case's query or `mustContain` to something trivial would keep it passing. That is true of every test and is visible in review; not a finding.
- The gate reaches the wider run: `verify-audit.js:482` runs this verifier with `execSync`, which throws on exit 1 and records "BRAIN-4.2: verify:assistant-relevance failed". There is no `.github/workflows` in the repo, so "CI" means these npm/verify scripts.

## `expectedAnswerType` "accounting_ref"

- "accounting_ref" is in the FF-1 schema enum (`repository/schema/feature-function-graph.schema.json:60`) and already used on 17 other question entries (FEA-19, FEA-22, FEA-25, FEA-27).
- No code reads a question entry's `expectedAnswerType`. The only reader is `featureFunctionBridge.js:204`, which reads the **feature node's** field (FEA-14 stays "workflow"). `:210-211` passes the question list through as `naturalQuestions`, which nothing in `src` or `scripts` consumes. Scoring (`:103-115`) uses only `question`.
- Measured: `classifyQuery` and `resolveQuery` on 3f6c5d5 and 7ea3e03 over 299 queries (the whole bank, every FF-1 `naturalQuestionMap` question, and 8 GRN/GRNI variants), each with `currentView` "dashboard" and "goods-receipt" (598 results): the serialised outputs are **byte-identical**.
- No verifier counts or checks this field on question entries (`verify-feature-function-graph.js` FF1-24 counts map keys only). All verifiers listed above pass.

## Findings

None.
