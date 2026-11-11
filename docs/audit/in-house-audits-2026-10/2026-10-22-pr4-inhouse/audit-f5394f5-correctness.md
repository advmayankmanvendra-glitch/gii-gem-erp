# In-house correctness audit: 343ffdd..f5394f5

- Scope: `git diff 343ffdd f5394f5 -- src scripts` ("Close the 343ffdd audit findings: owner check kept, copy name re-checked, tests that bite"). Four files: `src/main/services/updateInstaller.js`, `scripts/audit/ipc-security.test.mjs`, `scripts/assistant-natural-query-bank.js`, `src/renderer/knowledge/feature-function-graph.json`. Archive files under `docs/audit` were not reviewed.
- It answers `audit-343ffdd-correctness.md` (M-1, L-1, L-2) as claimed in `responses-343ffdd.md`.
- Checkout: the repo at `f5394f5`, read only (`git status` clean before and after). Mutations and probes ran in a scratch copy (`/tmp/claude-0/.../scratchpad/mut`, `node_modules` linked, not rebuilt). Nothing was committed, pushed or installed.
- Runs (Linux, root, Node v22.22.0):
  - `npm run -s test:integrity`: exit 0. The IPC file gives 53/53.
  - `verify-assistant-natural-language-relevance.js`: Final: PASS, 260/268. The 8 failures are older cases (WO-006, WO-010, GRN-007, GRN-009, CRAC-005, BS-003, GST-010, INV-010). GRN-011 and GRN-012 pass.
  - `verify-feature-function-graph.js`: 31/31. `verify-voucher-accounting-graph.js`: pass. `verify-audit.js`: 0 FAIL.
- Date: 2026-11-11 10:06 IST

## Status of the 343ffdd items

| Item | Status | Evidence |
|---|---|---|
| M-1: the swap test did not test the change; N10-r1 had no test | **Closed for N10-r1.** New gap below (M-1) | The test at `:1088` fails when the a11bd45 by-path catch block is put back (mutation M1). It also fails when both post-open checks are removed (M7) |
| L-1: duplicate id `GRN-006` | **Closed** | The new case is `GRN-011` (`:62`). No duplicate ids are left in the bank (checked). It sits between GRN-004 and GRN-005, not after GRN-009, which is cosmetic |
| L-2: "What is GRNI?" answered about CRAC | **Closed for that exact question** | GRN-012 (`:63`) passes on head. It fails with 343ffdd's FF-1, and with only the new `naturalQuestionMap` entry removed (Final: BLOCKED). So the case does test the FF-1 edit. See L-2 and L-3 |

## Mutation table (IPC file, 53 tests)

| Mutation in `updateInstaller.js` | Result |
|---|---|
| M0: whole file from 343ffdd | 1 fail (the owner test at `:1118`) |
| M1: a11bd45 by-path catch block | 2 fail (`:1088` and the 32263ab part-way test) |
| M2: `folderIsOurs()` always true (`:115`) | 53/53 pass |
| M3: pre-open folder check removed (`:297`) | **53/53 pass** |
| M4: post-open folder check removed, name check kept | 53/53 pass (the name check alone catches the `:1088` swap) |
| M5: name check removed, folder check kept (`:302`) | **53/53 pass** |
| M6: `truncate(0)` removed (`:303`) | 53/53 pass (see Info: the truncate is a no-op) |
| M7: both post-open checks removed | 1 fail (`:1088`) |
| M8: owner check dropped from the `madeHere` branch (`:197`) | 1 fail (`:1118`), as root only |

## Findings

| ID | Severity | Where | One line |
|---|---|---|---|
| M-1 | Medium | `scripts/audit/ipc-security.test.mjs:1088-1116` | No test bites the pre-open folder check or the copy-name check, the two new parts of the security L-2 fix |
| L-1 | Low | `scripts/audit/ipc-security.test.mjs:1119` | The owner test runs only as root. Anywhere else it returns early and is reported as passed |
| L-2 | Low | `scripts/assistant-natural-query-bank.js:63` | GRN-012 pins "What is GRNI?" to the workflow boundary. The answer gives the Dr/Cr entries but shows the workflow notice, not the accounting one |
| L-3 | Low | `src/renderer/knowledge/feature-function-graph.json:5124` | The GRNI fix covers one phrasing. "What is goods received not invoiced?" still gets "no source-backed answer" |

### M-1 (Medium): the two new checks in `stageInstaller` have no test that fails without them

**The claim.** The commit says "tests that bite". The test at `:1088` swaps `install-X` for a link to V **after** the `wx` open returns. Both post-open checks (folder and name) catch that swap, so either alone keeps the test green.

**Measured.**
- Removing the pre-open check at `:297` (M3) passes all 53.
- Removing the name check at `:302` (M5) passes all 53.
- I added two probe tests to the scratch copy. Both pass on head:
  - **PROBE-pre.** Swap `install-X` for a link to an empty V during the installer open (before `:297`). Head refuses ("folder changed") and V stays empty. **M3 and 343ffdd fail it:** `V/GII-GeM-ERP-Setup-99.8.20-x64.exe` is created, a 0-byte file.
  - **PROBE-name.** The link is in place only for the `wx` open, and then the real folder is put back (security P1 from the last round). Head refuses ("folder changed") and V holds a 0-byte file. **M5 and 343ffdd fail it:** "The update was not started (ENOENT)…", and **V holds the full 19-byte installer copy**.

**Failure scenario.** A later edit drops `!sameFile(named, copyIdentity)` while it tidies the long condition at `:302`. CI stays green. The P1 interleaving again writes a full installer copy into a folder outside the app's own.

**Fix.** Add the two probes as tests. In outline:
- **PROBE-pre.** In `withPatchedOpen`, when `file === installer`, rename `root/update-staging/install-*` aside and put a symlink to V in its place, then call `open`. Assert the result matches `/update-staging folder changed/`, there were 0 launches, and `fs.readdirSync(V)` is `[]`.
- **PROBE-name.** On the `wx` open, rename the folder aside and link it to V. Call `open`, then remove the link and rename the folder back. Return the handle. Assert `/update-staging folder changed/`, 0 launches, and that `V/<name>` is 0 bytes or absent.

### L-1 (Low): the owner test passes silently when not run as root

- `:1119`: `if (typeof process.getuid !== "function" || process.getuid() !== 0) return;`. `node:test` reports this as `ok`, not `skipped`.
- The repo has no CI config. On a developer's non-root Linux shell, and on Windows, the L-1 fix has no running test, and the output does not say so.
- **Fix.** Use `t.skip(...)` for the platform guard. Test the owner check without `chown`: patch `fs.promises.lstat` so that a bigint lstat of a path ending in `update-staging` reports `uid = getuid() + 1`. The code looks up `fs.promises.lstat` at call time (`:183`, `:196`).
  - Measured: this variant passes on head and fails on M8.
  - It needs only `process.getuid`, not root.

### L-2 (Low): GRN-012 locks in the workflow boundary for a question about an accounting account

- `resolveQuery("What is GRNI?")` returns the same answer text as "Does GRN affect accounting?", including "posts a GRN receipt Journal: Inventory Dr, Goods Received Not Invoiced Cr".
- The first gets `workflow-sensitive`. The second gets `accounting-sensitive`.
- So the GRNI answer carries the workflow notice. It is not counted in the "Accounting safety 75/75" gate. It lacks the accounting notice ("cannot post, reverse… Verify the actual result in the relevant ERP screen or report", `safetyEnforcer.js:5`).
- GRN-012 asserts `expectedSafetyBoundary: "workflow-sensitive"`. A later fix that classifies GRNI as accounting would therefore break the bank.
- **Fix.** Make GRN-012 like GRN-011: categories `["workflow", "voucher_accounting"]`, boundary `accounting-sensitive`. Add `grni` and "goods received not invoiced" to the classifier's accounting vocabulary so that the case passes.

### L-3 (Low): the GRNI answer depends on the exact wording

Measured on head:

| Query | Result |
|---|---|
| What is GRNI? | FEA-14, high, contains the account name |
| What does GRNI mean? | FEA-14, high |
| Explain GRNI | WG-1 workflow stage text, medium. **No mention of Goods Received Not Invoiced** |
| What is goods received not invoiced? | **unknown, low: "I do not have a source-backed answer for this query yet."** |

None of these is a regression. But the `naturalQuestionMap` entry matches only the "What is …" form. The spelled-out name of the account the GRN Journal credits is not answered.

**Fix.** Add "goods received not invoiced" as an FEA-14 alias, or as a KG-4 account-term entry. Add a bank case for the spelled-out question.

## Info (no finding)

- **`truncate(0)` at `:303` cannot change anything.** The file was created by `wx` at `:298`, and nothing is written to it before the check at `:302`. So it is always empty there. The comment at `:295-296` ("the file is emptied") overstates what it does. It is harmless, which is why M6 cannot be tested.
- **The folder `lstatSync` calls at `:297` and `:302` throw if `install-X` has vanished.** They throw instead of returning a mismatch. The user then sees "The update could not be prepared (ENOENT)… the ERP's data folder" rather than the "folder changed" guidance. `truncate` is skipped, which does not matter (see above). The post-open case is unchanged since 343ffdd. A `try`/`catch` that maps it to `changedStaging()` would keep the message consistent.
- **M2 (`folderIsOurs` always true) stays green.** In every forceable interleaving, the file-identity check in `removeOwnCopy` already refuses. The folder check only narrows the window between the file `lstat` and `unlinkSync`. It is defence in depth, not testable without a real race.

## Checked and correct

- **Error paths in `stageInstaller` (`:254-356`):**
  - Pre-open mismatch: thrown before `output` exists. `copyIdentity` is null, so `removeOwnCopy` only `rmdir`s the folder, if it is still ours and empty.
  - Post-open mismatch: `output` is closed in the catch (`:335`). `removeOwnCopy(stagedPath, copyIdentity, stagingDirIdentity)` unlinks only if the folder and file identities both still match. That never happens when the name check failed. In the P1 case the real `install-X` is empty and is removed. The 0-byte file in V stays (the app cannot unlink by handle).
  - Name `lstat` errors other than ENOENT (`:301`) are treated as "gone", so the copy is refused. That is safe.
- **`changedStaging()` (`:205`)** returns a fresh error each call. The message is byte-identical to the old two copies, so the existing `/update-staging folder changed/` assertions still match.
- **`ownedByThisAccount` (`:215`)** has the same win32 and `getuid` guards as `ownStagingFolder`. `ownStagingFolder` keeps its own guard so that the mode check is skipped on Windows. Behaviour on the in-place path is unchanged.
- **The new test at `:1088`.** It cleans up the link, the moved folder and V. It bites M1 and M7, as described above.
- **The new test at `:1118`.** The `mkdir` patch uses `!options?.recursive`, and the code passes `{ mode: 0o700 }` (`:182`). So only the staging `mkdir` is chowned. The test bites M8 (as root). The chowned folder is moved aside by the next install, and the last test still passes.
- **The FF-1 edge and question.** They are consistent with the node: FEA-14 now has `voucherTypes ["journal"]`, `createsAccountingImpact: true`, and a matching `feature_creates_voucher → journal` edge. All 16 features with `voucherTypes` now have exactly matching edges, with none extra (checked). The new question uses `expectedAnswerType: "workflow"` and `targetFeatureId: "FEA-14"`, like its siblings.
