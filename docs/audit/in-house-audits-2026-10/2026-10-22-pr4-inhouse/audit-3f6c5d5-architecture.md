# In-house architecture audit: 084a72c..3f6c5d5

- Scope: `git diff 084a72c 3f6c5d5 -- src scripts`. Three files:
  - `scripts/audit/ipc-security.test.mjs`: +31
  - `src/renderer/knowledge/feature-function-graph.json`: +6 / -2
  - `scripts/assistant-natural-query-bank.js`: +2
- It answers `audit-084a72c-architecture.md` (no findings; Info 1, 2 and 4) and the correctness items that touch architecture.
- Not re-raised (known residuals): F49, F46/F4, F31, G3, C3, FF-1 function-node naming, edge order in `correlationEdges`.
- Checks run (in the repo, read only):
  - `verify-feature-function-graph.js`: 32/32.
  - `verify-voucher-accounting-graph.js`: pass.
  - `verify-audit.js`: 0 FAIL.
  - `verify-erp-brain.js`: 51/0/0.
  - `verify-help-assistant-brain.js`: 27/0/0, including "ERP Brain module has no Help Assistant dependency".
  - `verify-assistant-natural-language-relevance.js`: Final: PASS, 263/271.
  - `npm run -s test:integrity`: exit 0 (IPC 56/56).
- Date: 2026-11-11 10:36 IST

## Short answer

**No findings at Low or above** for architecture. (The gating gap for GRN-014/015 is a test-strength issue and is filed once, as correctness L-1.)

- **Minimal.**
  - No runtime code changed. `src/main`, `src/preload`, `src/renderer/App.jsx`, `src/renderer/screens` and every `.js` under `src/renderer/modules` have an empty diff.
  - The fix for the short GRNI questions is one data entry in FF-1, which is where last round's architecture Info 4 said it belonged ("KG-4 data or the FF-1 `naturalQuestionMap`, not the bridge or a screen").
  - The updater test reuses `withPatchedOpen` and `installWithStubbedLaunch`, sits next to its sibling tests (`:1148`, `:1176`), and keeps the "32263ab … keep this test last" test last (`:1238`).
- **Consistent with KG-4/FF-1.**
  - FEA-14 keeps `voucherTypes ["journal"]` and its one `feature_creates_voucher → journal` edge (FF1-32 passes).
  - The answer the new entry routes to is the existing FEA-14 text: "GRN receipt Journal: Inventory Dr, Goods Received Not Invoiced Cr", which matches KG-4 (`voucher-accounting-graph.json` GRN receipt pattern).
  - The new entry uses the existing schema (`question`, `expectedAnswerType`, `targetFeatureId`) and the same `expectedAnswerType: "workflow"` as its sibling "What is GRNI?".
- **Last round's Info 1 (inert alias) is answered.** The alias "goods received not invoiced" is gone. Nothing depended on it: none of 435 compared answers changed, and the bridge filter (`knowledgeBridge.js:147`) still matches on "goods received".
- **Last round's Info 2 (GRNI wording in two places)** now has bank cases on both paths: GRN-012/013 for the classifier rule, GRN-014/015 for FF-1. They report a miss in either place; only GRN-012/013 block (correctness L-1).

## Info (no finding)

1. **"GRNI" is the only one-word entry in `naturalQuestionMap` (`feature-function-graph.json:5129`).** It works as a keyword weight, not a question: with `matchRatio` = 1 it adds 7 to the alias's 8, lifting FEA-14 from medium to strong for any query with the word "grni". That is the intended effect and it is measured to misroute nothing (correctness report). It does make the map less uniform; a reader tidying the map may take it for a typo, which is the scenario in correctness L-1. A one-line `"notes"` on the entry, or the gate suggested there, would protect it.
2. **`expectedAnswerType: "workflow"`** on both GRNI entries while the assistant now answers them as `voucher_accounting` / `accounting-sensitive`. The field on a question entry is not read by routing (`featureFunctionBridge.js:204` reads only the feature node's own field), so this has no effect. Changing it to `"voucher_accounting"` would document the FSR-2A4 intent; optional.
3. **New test location.** The test is top level between its siblings and uses `os.tmpdir()` for the moved folder, like the other link tests (`:1088`, `:1148`, `:1176`). It needs symlink rights, as those do.
