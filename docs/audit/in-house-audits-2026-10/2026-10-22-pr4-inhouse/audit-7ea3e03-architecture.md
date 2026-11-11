# In-house architecture audit: 3f6c5d5..7ea3e03

- Scope: `git diff 3f6c5d5 7ea3e03 -- src scripts`. Two files:
  - `scripts/verify-assistant-natural-language-relevance.js`: +11 (`:211-222`)
  - `src/renderer/knowledge/feature-function-graph.json`: +2 / -2 (`:5124-5125`, `:5129-5130`)
- It answers `audit-3f6c5d5-architecture.md` (no findings; Info 1 and 2) and correctness L-1, as listed in `responses-3f6c5d5.md`.
- Not re-raised (known residuals): F49, F46/F4, F31, G3, C3, FF-1 function-node naming, edge order in `correlationEdges`.
- Checks run (in the repo, read only): see `audit-7ea3e03-correctness.md` (relevance Final: PASS 263/271; FF-1 32/32; knowledge 0 errors; ERP Brain 51/0/0; Help Assistant 27/0/0; `test:integrity` exit 0; `verify-audit.js` exit 0).
- Date: 2026-11-11 10:45 IST

## Short answer

**No findings at Low or above.**

- **Minimal.** No runtime code changed: `src/main`, `src/preload` and every `.js`/`.jsx` under `src/renderer` have an empty diff. The fix is one gate in the verifier that 3f6c5d5 L-1 named, plus two data values.
- **Consistent with the verifier.** The new gate is one more `{ name, pass }` row in the existing `gates` array, printed and counted like the others, and fails the run through the same `allGatesPass` exit. It reads `summary.failures`, which already exists; no new state.
- **Consistent with FF-1.** "accounting_ref" is an existing schema enum value (`repository/schema/feature-function-graph.schema.json:60`), already used for accounting questions on FEA-19, FEA-22, FEA-25 and FEA-27 (for example FEA-19 "Does sales invoice affect accounting?"). The FEA-14 node keeps `expectedAnswerType` "workflow", `voucherTypes ["journal"]` and its edge (FF1-32 passes). The field on question entries is not read at runtime (measured: 598 resolved answers identical before and after).
- **3f6c5d5 Info 1 (one-word "GRNI" entry may be tidied away)** is now covered by the gate: removing it blocks the run (correctness report). Info 2 is done as suggested.

## Info (no finding)

1. **The pinned list lives in the verifier, not the bank** (`verify-assistant-natural-language-relevance.js:213`). Adding a pinned case means editing two files, and the bank entries (`assistant-natural-query-bank.js:62-66`) do not show they are pinned. The alternative named last round, a `pinned: true` option in `buildCase`, would keep the mark next to the case. The id list is simpler and the "missing" check makes a deleted or renamed case block, so this is a style choice, not a defect. If kept, the constant could move up beside `MINIMUM_QUERY_COUNT` / `MINIMUM_PASS_RATE` (`:6-7`).
2. **"Does GRN affect accounting?" (FEA-14, `feature-function-graph.json:5119-5120`) stays `expectedAnswerType` "workflow"** although it is answered as the GRN receipt Journal, `accounting-sensitive` (GRN-011), and the matching FEA-19 question uses "accounting_ref". Inert at runtime, as above; changing it would make FEA-14's three accounting questions uniform. Optional.
