# In-house correctness audit: a11bd45..343ffdd

- Scope: `git diff a11bd45 343ffdd -- src scripts` ("Close the a11bd45 audit findings: updater copies through its own handle, links left alone"). Four files: `src/main/services/updateInstaller.js`, `scripts/audit/ipc-security.test.mjs`, `scripts/assistant-natural-query-bank.js`, `src/renderer/knowledge/feature-function-graph.json`. Archive files under `docs/audit` were not reviewed.
- Checkout: the repo at `343ffdd`, read only. Mutation runs used a scratch copy (`/tmp/claude-0/.../scratchpad/mut`, `node_modules` linked, not rebuilt). Nothing was committed, pushed or installed.
- Tests: `npm run -s test:integrity` exits 0. The IPC file gives 51/51 pass on Node v22.22.0. `node scripts/verify-assistant-natural-language-relevance.js` gives Final: PASS (267 cases). `verify-feature-function-graph.js` gives 31/31, and `verify-voucher-accounting-graph.js` passes.
- Date: 2026-11-11 09:47 IST

## Summary

| ID | Severity | Where | One line |
|---|---|---|---|
| M-1 | Medium | `scripts/audit/ipc-security.test.mjs:1065-1086` | The new "swapped folder" test also passes on the old code. No test covers the N10-r1 fix in `stageInstaller`'s failure clean-up |
| L-1 | Low | `scripts/assistant-natural-query-bank.js:62`, `:64` | Two cases now share the id `GRN-006` |
| L-2 | Low | `src/renderer/knowledge/feature-function-graph.json:771` | The new `grni` alias does not win for "What is GRNI?". The assistant answers about CRAC with high confidence |

The `updateInstaller.js` logic itself is correct on every error path I traced (below). The security pass covers its race behaviour.

## M-1: the new regression test does not test the change, and the N10-r1 fix has no test

**The claim.** The test at `:1065` says "a failed launch never deletes a same-named file reached through a swapped folder". It swaps `install-X` for a link at launch, then expects `removeStagedCopy` to leave the victim alone.

**Measured.**
- I ran the current test file against `a11bd45`'s `updateInstaller.js`. This test **passes**. Only the share-mode test at `:1037` fails, as it should. The old `removeStagedCopy` already compared the file's `dev`/`ino`, and the victim is a different inode. So the test never reaches the new `folderIsOurs()` check.
- The real regression closed by this commit is N10-r1: the failure clean-up in `stageInstaller` unlinked `stagedPath` by path. I put the `a11bd45` catch block back into the `343ffdd` code (two lines at `updateInstaller.js:322`). **All 51 IPC tests still pass.**
- Two other mutations also pass all 51 tests:
  - removing the folder re-check at `:288-290`;
  - making `folderIsOurs()` always return true at `:113-115`.

**Failure scenario.** A later edit brings back a by-path unlink in the error path, or drops the folder identity check. CI stays green, and the N10-r1 deletion comes back (the a11bd45 security report measured 10 of 117 race attempts).

**Fix.** Add a test that fails inside `stageInstaller` after the folder swap. For example, patch `fs.promises.open` so that, on the installer open (the path in the update folder, before the `wx` open), `install-X` is renamed aside and replaced by a link to a folder V that already holds a file with the installer's name. Assert that the result is refused and `V/<name>` still holds its bytes. My injected probe P3 does exactly this. It passes on `343ffdd` and deletes V's file with the `a11bd45` catch block.

## L-1: duplicate case id GRN-006

`assistant-natural-query-bank.js:62` adds `GRN-006` ("Does GRN affect accounting?") between `GRN-004` and `GRN-005`. The existing `GRN-006` ("What comes before GRN?") is at `:64`.

- `verify-assistant-natural-language-relevance.js` and `export-failure-matrix.cjs` report failures by `id`. If either case fails, the report names `GRN-006` and you cannot tell which query failed without reading the text.
- Nothing checks the bank for unique ids. `verify-audit.js` BRAIN-1 checks ids only for BRAIN-1 entries.
- **Fix:** give the new case an unused id (for example `GRN-010`) and place it after `GRN-009`. Optionally add a uniqueness assert where the bank is exported.

The case itself passes. Category `voucher_accounting`, boundary `accounting-sensitive`, and the answer contains "Journal" and "Goods Received Not Invoiced". It also passes on `a11bd45`: the answer text comes from sources changed in that commit, not from the FF-1 edits here. So it is a regression guard for a11bd45, not a test of this diff's graph edits. That is fine, but worth knowing.

## L-2: the `grni` alias does not reach the obvious question

FF-1 `FEA-14` gains the aliases `receive goods` and `grni` (`:770-771`).

**Measured** (`findFeatureByQuery` and `resolveQuery`, at head and at `a11bd45`):

| Query | `a11bd45` | `343ffdd` |
|---|---|---|
| Where do I receive goods? | COGS Report, low | **GRN / Goods Receipt, high** (better) |
| Explain GRNI account | FEA-07 Banks | FEA-14 GRN (better) |
| What is GRNI? | **CRAC, high confidence** | **CRAC, high confidence** (unchanged) |

- "What is GRNI?" scores 12 for CRAC through `naturalQuestionMap` ("What is CRAC?": two of three words match). The alias only adds 8 to FEA-14.
- So the user gets "CRAC: Records Consignee Receipt and Acceptance Certificate…" at high confidence. The answer even says "Your question relates to: grni?".
- This is older behaviour, but the alias was added for exactly this term and no bank case checks it.
- **Fix:** add `{ "question": "What is GRNI?", "targetFeatureId": "FEA-14" }` to `naturalQuestionMap.FEA-14`, and add a bank case for "What is GRNI?" with `mustContain: ["Goods Received Not Invoiced"]` and `mustNotContain: ["CRAC"]`.

## Checked and correct

- **Error paths in `stageInstaller` (`updateInstaller.js:245-341`):**
  - Fails before the copy opens: `stagedPath` is empty, so `removeOwnCopy(path.join(stagingDir, "-"), null, id)` only `rmdir`s `install-X`.
  - `wx` open fails: `copyIdentity` is null, so nothing is unlinked and the folder is kept (it is not empty).
  - Fails after the open or during the copy: `output` is closed (`:320`) or was handed to the writer.
  - `sameFile` compares only `dev`/`ino`, so a partial copy (size 0 at `:287`) is still removed. The failing-copy test at `:667` passes.
  - If `lstatSync` at `:254` throws, `stagingDirIdentity` stays null and an empty `install-X` is left. The start-up sweep removes it. This is harmless.
- **Write-stream close order.** `stream/promises.pipeline` rejects only after the `FileHandle` write stream has closed. I measured this on Node 22 with a delayed `close()`. So the unlink at `:322` never races an open handle. Electron 37 ships Node 22.
- **`copyIdentity.size = BigInt(copied)` (`:302`).** This matches what `hashFile` checks at `main.js:1329`. If `copied !== size`, the install is refused at `:303` anyway.
- **Edits to the existing tests (`:730`, `:768`, `:920`).** `flags !== "wx"` only excludes the new output open. Each test still patches the `hashFile` open (numeric flags), as it did when the copy was written with `fs.createWriteStream`. The tests keep their meaning.
- **New share-mode test (`:1037`).** It discriminates: it fails on `a11bd45` and when the `madeHere` branch is removed (measured). It patches `fs.promises.mkdir` in-process, which the code looks up at call time (`:181`).
- **FF-1 edits** are consistent with KG-4 and with the code: `voucherTypes: ["journal"]` matches the KG-4 `voucherTypeId` and the casing of every other FF-1 entry. `postStockInward` is what the GRN path calls (`init.js:1060`), and KG-4 lists it with "Journal (GRN receipt)". See the architecture report for two FF-1 graph gaps.
