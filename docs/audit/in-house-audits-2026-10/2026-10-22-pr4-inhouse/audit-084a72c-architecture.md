# In-house architecture audit: f5394f5..084a72c

- Scope: `git diff f5394f5 084a72c -- src scripts`. Six files:
  - `src/main/services/updateInstaller.js`: +9 / -8
  - `scripts/audit/ipc-security.test.mjs`: +74 / -8
  - `src/renderer/modules/erpAssistant/classifier/queryClassifier.js`: +5
  - `scripts/assistant-natural-query-bank.js`: +2 / -1
  - `src/renderer/knowledge/feature-function-graph.json`: +2 / -1
  - `scripts/verify-feature-function-graph.js`: +12
- It answers `audit-f5394f5-architecture.md` L-1 and both informational notes.
- Not re-raised (known residuals): F49, F46/F4, F31, G3, C3, FF-1 function-node naming, edge order in `correlationEdges`.
- Checks run:
  - `verify-feature-function-graph.js`: 32/32.
  - `verify-voucher-accounting-graph.js`: pass.
  - `verify-audit.js`: 0 FAIL.
  - `verify-erp-brain.js`: 51/0/0.
  - `verify-help-assistant-brain.js`: 27/0/0. This includes "ERP Brain module has no Help Assistant dependency".
  - `npm run -s test:integrity`: exit 0.
- Date: 2026-11-11 10:24 IST

## Short answer

**No findings at Low or above.**

- **Minimal, and in the right layers.**
  - The updater change stays inside `stageInstaller` and `ensureStagingFolder`. It adds one local closure (`folderUnchanged`) and removes an alias and a no-op.
  - No export changed name or signature.
  - `src/main/main.js`, `src/preload`, `src/renderer/App.jsx` and `src/renderer/screens` have an empty diff, so no IPC channel, preload name or screen changed.
- **No business logic in App.jsx or screens.**
  - The only renderer code change is one rule in the assistant's own classifier (`queryClassifier.js:145-149`).
  - It follows that module's existing pattern: an ordered list of regex rules ahead of keyword scoring, like the "stock summary" rule just above it.
  - Putting `grni` in `categoryDefinitions.js` `matchKeywords` would not have worked. Keyword scoring runs only after the rules, and "What is GRNI?" was already being won by the workflow scorer.
- **Consistent with KG-4/FF-1.**
  - The rule's comment ("GRNI is the account the GRN receipt Journal credits") matches KG-4: `voucher-accounting-graph.json:674`, `:1049` and `:1446` all give Inventory Dr, Goods Received Not Invoiced Cr.
  - FEA-14 keeps `voucherTypes ["journal"]` and its one `feature_creates_voucher → journal` edge.
- **Last round's L-1 is closed.**
  - FF1-32 (`verify-feature-function-graph.js:235-245`) compares, for every feature, the set of `voucherTypes` with the set of `feature_creates_voucher` targets.
  - Measured in a scratch copy, FF1-32 fails on each of these: the FEA-14 edge dropped, an extra `FEA-14 → sales` edge, and FEA-14's `voucherTypes` removed.
  - It reads only `featureNodes` and `correlationEdges`, like FF1-28, and adds no new harness.
- **Both informational notes are answered.**
  - The `changed` alias is gone; `changedStaging()` is called directly at `:184` and `:200`.
  - Edge order was answered as a known residual and is not re-raised.

## Info (no finding)

1. **The FEA-14 alias "goods received not invoiced" (`feature-function-graph.json:772`) is inert.**
   - `featureFunctionBridge.js` stops at the first alias that matches, and the existing alias "goods received" (`:768`) matches every query that contains the new phrase.
   - Removing it changes none of 409 tested answers.
   - It is harmless data. But `responses-f5394f5.md` credits it with the L-3 fix, which in fact comes from the classifier rule (see the correctness report, Info 1). Either drop it or leave it as documentation; no check depends on it.
2. **Knowledge now lives in two places.**
   - The GRNI vocabulary is in the classifier regex (`queryClassifier.js:146`) and in FF-1 (`grni` and the new alias).
   - The classifier already hard-codes domain terms (`work order`, `grn`, `stock summary`), so this is not new.
   - A future rename of the account would need both edited. The relevance bank (GRN-012/013) would catch a miss in the classifier, but not a miss in FF-1 (see Info 1).
3. **Test helpers.**
   - `freshInstallFolder` (`ipc-security.test.mjs:1141`) is a top-level helper between tests, next to its two users. It reuses `withPatchedOpen` and `installWithStubbedLaunch`.
   - The owner test now patches `fs.promises.lstat` instead of `mkdir`. That follows the existing pattern of patching `fs.promises` at call time.
4. **Answer quality for short GRNI questions** is a behaviour change of this rule (correctness L-1). The fix belongs in KG-4 data or the FF-1 `naturalQuestionMap`, not in the bridge or a screen, so it stays within KG-4/FF-1.
