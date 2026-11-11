# In-house correctness audit: 084a72c..3f6c5d5

- Scope: `git diff 084a72c 3f6c5d5 -- src scripts` ("Close the 084a72c audit findings: after-open folder test, short GRNI questions answered"). Three files:
  - `scripts/audit/ipc-security.test.mjs`: +31 (one new test, `:1206-1235`)
  - `src/renderer/knowledge/feature-function-graph.json`: FEA-14 alias "goods received not invoiced" removed; FEA-14 `naturalQuestionMap` entry "GRNI" added (`:5129`)
  - `scripts/assistant-natural-query-bank.js`: GRN-014 "Explain GRNI", GRN-015 "GRNI balance" (`:65-66`)

  Archive files under `docs/audit` were not reviewed.
- It answers `audit-084a72c-correctness.md` (M-1, L-1, Info 1), as listed in `responses-084a72c.md`.
- Checkout: the repo at `3f6c5d5`, read only (`git status` clean before and after). Mutations and probes ran in scratch copies of `3f6c5d5` and `084a72c` (made with `git archive`, `node_modules` linked, not rebuilt). Nothing was committed, pushed or installed.
- Runs (Linux, root, Node v22), in the repo:
  - `npm run -s test:integrity`: exit 0. First group 222/222. IPC file 56/56, 0 skipped.
  - `verify-assistant-natural-language-relevance.js`: Final: PASS, 263/271, accounting safety 79/79. The 8 failures are the same older cases (WO-006, WO-010, GRN-007, GRN-009, CRAC-005, BS-003, GST-010, INV-010). GRN-011 to GRN-015 pass.
  - `verify-erp-brain.js`: 51/0/0. `verify-help-assistant-brain.js`: 27/0/0.
  - `verify-feature-function-graph.js`: 32/32. `verify-voucher-accounting-graph.js`: pass. `verify-audit.js`: 0 FAIL.
- Date: 2026-11-11 10:36 IST

## Status of the 084a72c items

| Item | Status | Evidence |
|---|---|---|
| M-1: the post-open folder check (`updateInstaller.js:304`) has no test | **Closed** | M4 (`!folderUnchanged() \|\|` removed from `:304`) now fails exactly the new test `:1206`, at `:1227` ("The installer could not be opened: test stops here" instead of "folder changed") |
| L-1: short GRNI questions get "no source-backed answer" | **Closed** | All 14 short GRNI queries probed move from low / "no answer" to high, FEA-14 GRN Journal answer naming Goods Received Not Invoiced, `accounting-sensitive` |
| Info 1: inert alias "goods received not invoiced" | **Closed** (removed) | No answer changed from the removal (see the comparison below); GRN-013 still passes through the classifier rule |

## Mutation table (IPC file, 56 tests, scratch copy of 3f6c5d5)

| Mutation in `updateInstaller.js` | Result |
|---|---|
| M0: head | 56/56 |
| M3: pre-open folder check removed (`:299`) | 1 fail (`:1148`) |
| M4: post-open folder check removed, name check kept (`:304`) | 1 fail (**`:1206`, the new test**) |
| M7: both post-open checks removed (`:304`) | 3 fail (`:1088`, `:1176`, `:1206`) |

All three copy checks (`:299`, `:304` folder, `:304` name) now each have a test that fails without them.

## New test `:1206`: clean-up

- The trigger runs once (`!swapped`), only on the `wx` open under `update-staging`, so it hits the copy open and nothing else.
- `moved` is a fresh `mkdtemp` folder in `os.tmpdir()`, the same filesystem as the test data folder (`/tmp/gii-ipc-*`), so the `renameSync` is not cross-device.
- The app's own clean-up cannot delete through the link: `removeOwnCopy` (`updateInstaller.js:112-125`) `lstat`s `install-X`, sees a link, not the folder it made, and returns. The 0-byte copy is left in `moved`, which the test allows.
- `finally` removes the link with `rmSync(swapped, { force: true })` (no `recursive`; Node unlinks a link, never its target), then the `mkdtemp` folder recursively, then the installer. It runs the same way when an assertion fails: in the M4 run the next test (`:1238`) still passed and no `/tmp/gii-out-*` folder was left.
- The "Left N unexpected item(s) in update-staging.old-…" lines in the log come from a folder an earlier test leaves; the same line is printed after each test before `:1206` too, in M0 and in every mutation run. They are not from this test.

## GRNI routing: 084a72c vs 3f6c5d5

`classifyQuery` and `resolveQuery` were run on both commits over 435 queries: the whole bank (271), every question string in `src/renderer/knowledge/**/*.json`, and 34 GRN/GRNI variants. Compared fields: category, confidence, boundary, answer confidence, answer text, source references, needsReview.

- **No query without the word "grni" changed.** 14 queries changed, all containing "grni".
- Why it cannot misroute: `featureFunctionBridge.js:103-115` normalises to `[a-z0-9\s]` and splits into words. The one-word entry gives `matchRatio` 1 only when the query has the exact word `grni`, and 0 otherwise, so it never adds weight to a query without it. It only raises FEA-14; no other feature's score moves.
- The 14 changed queries (Explain GRNI, GRNI balance, GRNI, grni?, How do I clear GRNI?, Reverse GRNI, GRNI aging, GRNI in the workflow, GRNI report, Show GRNI report, GRNI GST, Clear GRNI with purchase voucher, and two with `currentView: dashboard`) all went from low "I do not have a source-backed answer" to high, FEA-14 (`alias "grni"` + `naturalQuestionMap "GRNI"` = 15, strong), naming Goods Received Not Invoiced, `accounting-sensitive`, `prohibitedActions` set.
- The alias removal changed nothing: "goods received" (`:768`) still matches first, and the bridge filter (`knowledgeBridge.js:147`) still finds "goods received" in any text that held the full name.
- GRN-014 and GRN-015 fail on 084a72c (mustContain "Goods Received Not Invoiced" missing, confidence low) and pass on 3f6c5d5.

## Findings

| ID | Severity | Where | One line |
|---|---|---|---|
| L-1 | Low | `scripts/verify-assistant-natural-language-relevance.js:211-218`; `scripts/assistant-natural-query-bank.js:65-66` | GRN-014/015 do not gate: removing the fix keeps every check green |

### L-1 (Low): GRN-014 and GRN-015 cannot block a regression

**Measured.** In a scratch copy of 3f6c5d5 I removed only the FEA-14 "GRNI" `naturalQuestionMap` entry. Then:
- `verify-assistant-natural-language-relevance.js`: **exit 0, Final: PASS**, 261/271 (96.3%), accounting safety 79/79. GRN-014 and GRN-015 appear in the failure list only.
- Every `scripts/verify-*.js` run under node, including `verify-feature-function-graph.js`, exits 0. `test:integrity` does not read FF-1.

Running the 3f6c5d5 bank against the 084a72c code gives the same result (Final: PASS, 261/271).

**Why.** The two cases fail on `mustContain`, not on the boundary. The answer is still `accounting-sensitive` (the classifier rule sets it), so the "Accounting-sensitive safety boundary = 100%" gate holds. The only other gate is the 95% overall rate, and 263/271 leaves room for 5 more failures. Last round's GRN-012/013 blocked because their failure was a boundary failure; these two are not.

**Failure scenario.** A later FF-1 tidy-up drops the one-word "GRNI" entry as odd (it is the only one-word question in the map). CI and `verify:assistant-relevance` stay green, and "Explain GRNI" on the Goods Receipt screen is back to "I do not have a source-backed answer" (the 084a72c L-1 behaviour). `responses-084a72c.md` names GRN-014/015 as the guard, but they only report it.

**Fix.** Either:
- in the relevance verifier, add a gate "pinned regression cases = 100%" and mark GRN-011 to GRN-015 (and the FSR-2A4 cases generally) with a `pinned: true` flag in `buildCase`; or
- in `verify-feature-function-graph.js`, add a check (FF1-33) that resolves "Explain GRNI" and "GRNI balance" through `findFeatureByQuery` and asserts FEA-14 at `strong`.

Measure: the new gate must fail with the "GRNI" entry removed.

## Info (no finding)

1. **"Any question containing GRNI now matches FEA-14 strongly" (`responses-084a72c.md`) is slightly broad.** FEA-14 does score 15, but another feature can still score higher: "GRNI and purchase invoice" goes to Billing / GST Invoice, "Can I edit the GRNI journal?" to Accounting Voucher, "GRNI for supplier ABC" to Suppliers. All three gave the same answer at 084a72c, so they are not regressions.
2. **Close variants still miss**, as noted last round: "GRNIs" and "GRNI's balance" (normalised to `grnis`) and "goods received but not invoiced" stay low. Unchanged from 084a72c.
3. **The new test also covers the launch count and the bytes outside**, but in M4 it stops at the first assertion (`:1227`). That is enough to bite; the later assertions are belt and braces.
