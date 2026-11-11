# In-house correctness audit: f5394f5..084a72c

- Scope: `git diff f5394f5 084a72c -- src scripts` ("Close the f5394f5 audit findings: tests for every copy check, GRNI as accounting"). Six files:
  - `src/main/services/updateInstaller.js`
  - `scripts/audit/ipc-security.test.mjs`
  - `src/renderer/modules/erpAssistant/classifier/queryClassifier.js`
  - `scripts/assistant-natural-query-bank.js`
  - `src/renderer/knowledge/feature-function-graph.json`
  - `scripts/verify-feature-function-graph.js`

  Archive files under `docs/audit` were not reviewed.
- It answers `audit-f5394f5-correctness.md` (M-1, L-1, L-2, L-3, Info) and architecture L-1, as listed in `responses-f5394f5.md`.
- Checkout: the repo at `084a72c`, read only (`git status` clean before and after). Mutations and probes ran in scratch copies of `084a72c` and `f5394f5` (made with `git archive`, `node_modules` linked, not rebuilt). Nothing was committed, pushed or installed.
- Runs (Linux, root, Node v22.22.0), in the repo:
  - `npm run -s test:integrity`: exit 0. The first group gives 222/222. The IPC file gives 55/55, with 0 skipped.
  - `verify-assistant-natural-language-relevance.js`: Final: PASS, 261/269, accounting safety 77/77. The 8 failures are the same older cases as last round (WO-006, WO-010, GRN-007, GRN-009, CRAC-005, BS-003, GST-010, INV-010). GRN-011, GRN-012 and GRN-013 pass.
  - `verify-erp-brain.js`: 51/0/0. `verify-help-assistant-brain.js`: 27/0/0.
  - `verify-feature-function-graph.js`: 32/32. `verify-voucher-accounting-graph.js`: pass. `verify-audit.js`: 0 FAIL.
- Date: 2026-11-11 10:24 IST

## Status of the f5394f5 items

| Item | Status | Evidence |
|---|---|---|
| M-1: no test bites the pre-open check or the name check | **Closed for those two checks.** Gap left for the third check (M-1 below) | M3 (pre-open check removed) fails only `:1148`. M5 (name check removed) fails only `:1176` |
| L-1: the owner test runs only as root | **Closed** | `:1118` fakes the uid through `fs.promises.lstat` and calls `t.skip` where `process.getuid` is missing. M8 (owner check removed from `:196`) fails it. The fake does not depend on root; it was run as root here |
| L-2: GRN-012 pins the workflow boundary | **Closed** | GRN-012 is now `accounting-sensitive`. With the classifier rule disabled, GRN-012 and GRN-013 fail and the run is BLOCKED (accounting safety 75/77) |
| L-3: "What is goods received not invoiced?" is not answered | **Closed, but by the classifier rule, not the alias** | The question now gets the FEA-14 Journal answer. Removing the new alias changes nothing (see Info 1) |
| Info: missing folder gives the ENOENT message | **Fixed in code, untested** | `folderUnchanged()` (`:296`) returns false on any lstat error. Putting back a throwing lstat (M9) keeps 55/55 |
| Info: no-op `truncate(0)` | **Closed** | Removed. The comment at `:294-295` now says nothing is written |
| Architecture L-1: no voucherTypes/edge check | **Closed** | FF1-32 (`verify-feature-function-graph.js:235`) fails on a dropped FEA-14 edge, an extra edge, and a missing `voucherTypes` |

## Mutation table (IPC file, 55 tests)

| Mutation in `updateInstaller.js` | Result |
|---|---|
| M0: head | 55/55 |
| M3: pre-open folder check removed (`:299`) | 1 fail (`:1148`) |
| M4: post-open folder check removed, name check kept (`:304`) | **55/55 pass** |
| M5: name check removed, folder check kept (`:304`) | 1 fail (`:1176`) |
| M5b: only `named.isFile()` removed | 55/55 (redundant with `sameFile`, as a link has its own inode; harmless) |
| M7: both post-open checks removed | 2 fail (`:1088`, `:1176`) |
| M8: owner check dropped from `stillOurs` (`:196`) | 1 fail (`:1118`) |
| M9: `folderUnchanged` without its try/catch | 55/55 |
| Whole file from f5394f5 | 55/55 (the tests target checks that f5394f5 already had; expected) |

## Findings

| ID | Severity | Where | One line |
|---|---|---|---|
| M-1 | Medium | `scripts/audit/ipc-security.test.mjs` (no test); `src/main/services/updateInstaller.js:304` | The post-open folder check is load-bearing but no test fails without it. The commit says "tests for every copy check" |
| L-1 | Low | `src/renderer/modules/erpAssistant/classifier/queryClassifier.js:146` | Short GRNI questions ("Explain GRNI", "GRNI balance", "How do I clear GRNI?") went from a GRN answer to "I do not have a source-backed answer" |

### M-1 (Medium): the post-open folder check at `:304` has no test

**The claim.** The commit title says "tests for every copy check". The two new tests cover the pre-open check (`:1148`) and the name check (`:1176`). Removing `!folderUnchanged() ||` from `:304` (M4) keeps all 55 green. That was also true last round (M4 in the f5394f5 table), but M-1 then asked only for the two checks it named.

**The check is not redundant.** I added a probe to the scratch copy. During the `wx` open, it renames `install-X` to a folder outside the app's data folder (`os.tmpdir()/gii-out-*/moved`), puts a link to it at `install-X`, and does not put the folder back. The name check then passes, because `lstat(stagedPath)` follows the link to the very file just opened.

| Build | Result |
|---|---|
| Head | Refused ("update-staging folder changed"), 0 launches, a 0-byte file outside |
| M4 | **Not refused.** The full 15-byte installer copy is written outside the app's folder, and the stubbed launch is called once |

**Failure scenario.** A later edit tidies `:304` and drops `!folderUnchanged()`, reading it as covered by the name check. CI stays green. The interleaving above then copies the installer into a folder outside the app's own and launches it from there. The hash check in `main.js:1329` passes, because it checks only the file's identity, not its folder.

**Fix.** Add the probe as a test. In outline, using the existing helpers:
- In `withPatchedOpen`, on the first `flags === "wx"` open under `update-staging`:
  - rename `path.dirname(file)` to `<mkdtemp>/moved`;
  - `symlinkSync(moved, dirname, "dir")`;
  - return `open(file, flags, mode)`, without putting the folder back.
- Assert:
  - the result matches `/update-staging folder changed/`;
  - `launches()` is 0;
  - every file in `moved` is 0 bytes.
- Clean-up: `rmSync` the link (no `recursive`) and the temp folder.

Measured: this passes on head and fails on M4.

### L-1 (Low): the GRNI rule leaves short GRNI questions with no answer

**What changed.** I compared `classifyQuery` and `resolveQuery` on f5394f5 and head over 409 queries: the whole bank, every question string in the knowledge JSON files, and 34 GRNI and GRN variants.
- **No query without "grni" or "goods received not invoiced" changed** in category, boundary, confidence or answer. So the rule misroutes nothing else.
- 20 GRNI queries changed. All moved to `voucher_accounting` / `accounting-sensitive`. The full-name questions improved: "What is goods received not invoiced?", "Explain goods received not invoiced" and "… balance" went from "unknown" to the FEA-14 Journal answer.
- But questions that find FEA-14 only at **medium** strength now get no answer:

| Query | f5394f5 | 084a72c |
|---|---|---|
| Explain GRNI | workflow, medium: the WG-1 "Goods Receipt / GRN" stage | accounting, **low: "I do not have a source-backed answer for this query yet."** |
| GRNI balance | workflow, medium: same | accounting, low: same "no answer" |
| How do I clear GRNI? | workflow, medium: same | accounting, low: same "no answer" |
| Reverse GRNI / GRNI aging | workflow, medium: same | accounting, low: same "no answer" |
| GRNI in the workflow | workflow, high | accounting, low: same "no answer" |
| GRNI report / Show GRNI report | report, medium: the BRAIN-1 GRN entry | accounting, low: same "no answer" |

**Cause.** These questions match FEA-14 only at medium strength. So `buildConstrainedSearchResponse` (`knowledgeBridge.js:140`) searches the question's category. `voucher_accounting` searches KG-4 and finds "Receipt voucher type", "Guided Voucher" and "Opening Balance". None of these names FEA-14 or its aliases, so the bridge empties the results (`:151`). The old `workflow` search found the WG-1 GRN stage. None of these questions is in the bank, so the relevance run cannot see this.

**Failure scenario.** A user on the Goods Receipt screen types "Explain GRNI". Before this commit they got the GRN stage guidance. Now they get "no source-backed answer", marked as needing review. This is an assistant built to explain this very account (FSR-2A4).

**Fix.** Do one of these, then add "Explain GRNI" and "GRNI balance" to the bank as `["workflow", "voucher_accounting"]`, `accounting-sensitive`, with `mustContain: ["Goods Received Not Invoiced"]`:
- **Option 1.** Make the KG-4 search find GRNI. Name "GRNI" in the KG-4 GRN receipt entry (for example, `voucher-accounting-graph.json:1446` "… Goods Received Not Invoiced (GRNI) Cr"). That result then contains the FEA-14 alias `grni` and survives the bridge filter.
- **Option 2.** Add FEA-14 `naturalQuestionMap` entries for "Explain GRNI" and "GRNI balance" so these match at strong strength.

## Info (no finding)

1. **The new FEA-14 alias "goods received not invoiced" (`feature-function-graph.json:772`) is never reached.** The alias loop in `featureFunctionBridge.js:63-80` stops at the first match. "goods received" (`:768`) already matches every query that contains the new phrase. Removing the alias changed none of the 409 answers, and GRN-013 still passes. L-3 is fixed by the classifier rule: before it, the question was classed `unknown`, which skips FF-1. The alias is harmless but does not do what `responses-f5394f5.md` credits it with.
2. **The missing-folder mapping has no test (M9).** It reads correctly: any `lstat` error gives `false`, so the guided "folder changed" message is kept. No test was asked for.
3. **The rule sends GRNI report and GST questions to accounting.** "GRNI report" was `report` and "GRNI GST" was `gst_tax`; both are now `accounting-sensitive`. The accounting notice is the stricter one, so this is a reasonable choice, but the answer quality is as in L-1.
4. **The regex does not match close variants.** "goods received but not invoiced" and "GRNIs" stay on their old paths. They are not regressions.

## Checked and correct

- **`updateInstaller.js`.**
  - Removing the `changed` alias is a pure rename: `changedStaging()` at `:184` and `:200` builds the same message.
  - The pre-open check (`:299`) still runs before `output` exists, so a refusal there leaves `copyIdentity` null. `removeOwnCopy` then only `rmdir`s our own folder.
  - The post-open refusal (`:304`) still leaves `output` set. The catch closes it before `removeOwnCopy`. With `truncate` gone, nothing writes to the new file before the copy starts, so the copy still begins only after `:304`.
- **Test `:1148` (swap before the open).**
  - It triggers on the update-folder installer open (`!file.includes("update-staging")`). By then `ensureStagingFolder` has made exactly one `install-*` folder, which `freshInstallFolder` asserts.
  - It asserts the refusal, 0 launches and an empty victim folder.
  - Clean-up `rmSync`s the link without `recursive`, so it never deletes through it, then removes the moved folder.
- **Test `:1176` (swap only for the open).**
  - It puts the real folder back in `finally` around the `wx` open, so only the name check can catch it.
  - It allows the 0-byte file the app cannot unlink by handle.
- **Test `:1118` (owner).**
  - It patches only bigint `lstat` calls on paths ending in `update-staging`. Those are `madeHere` (`:182`) and `nowStats` (`:195`), so `sameFile` still holds and only the uid check refuses.
  - The non-bigint `lstat` on the in-place path is not touched.
  - The original `lstat` is put back in `finally`.
- **GRN-012/013.**
  - Both use unique ids. Both are `["workflow", "voucher_accounting"]`, `accounting-sensitive`, like GRN-011.
  - Both fail without the classifier rule. GRN-013 alone fails when the rule matches only `grni`.
- **FF1-32.**
  - It compares sets, so duplicates and edge order do not matter. It also catches a feature that has voucher edges but no `voucherTypes`.
  - All 34 `feature_creates_voucher` edges start at a feature node, so looping over features misses none.
