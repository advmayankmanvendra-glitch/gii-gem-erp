# Correctness audit: 4f3a9b6..a8c64af

- **Scope:** commit `a8c64af` against its parent `4f3a9b6` (PR #4, branch `claude/erp-full-automation-qbhv8k`). It answers `audit-4f3a9b6-correctness.md` (E1-E6).
- **Claimed fixes checked:** E1 (KG-4 `postStockInward` and `GOODS_RECEIPT_GRN` text), E2 (native realpath), E3 (installer name that links to another file refused), E4 (strict `update-staging.old-<16 hex>` sweep), E5 (tests). Also the re-checking `removeStagingTree` (installer-named files only), `removeStagedCopy`, the owner/permission check before an in-place staging folder, and the re-hash that reads exactly the copied size.
- **Method:** a read-only worktree at `a8c64af` with `node_modules` symlinked. Nothing committed, pushed or installed. A throw-away probe script (P1-P7) ran against the worktree's `updateInstaller.js`. 10 source mutations ran against `ipc-security.test.mjs`, each reverted with `git checkout` (status clean after each). The worktree, the symlink and the probe files have been removed; the main checkout's status is clean.
- **Proportion:** the updater is at diminishing returns. Anything that needs a race is ranked Info.
- **Written:** 11 Nov 2026, 09:00 IST.

## Summary

The updater fixes are correct. I found no regressions in the cases you asked about:

- **E2 fixed.** `isInsideStaging` now uses `fs.realpathSync.native`. That is the same libuv call as the `fs.promises.realpath` that `ensureStagingFolder` uses, so mapped and `subst` drives now resolve the same way on both sides. This cannot be shown on Linux (N9 survives).
- **E3 fixed, and every legitimate copy matches `INSTALLER_COPY_NAME`.** The copy is named after the real path's basename (:257). The new check (:41-42) makes that basename equal to the chosen name. main.js:1304-1307 has already refused anything not named `GII-GeM-ERP-Setup-*` (and the portable build) before staging, so every staged copy matches `/^GII-GeM-ERP-(Setup|Portable)-[^\\/]+\.exe$/i`. Probe P1 staged and removed `… (1).exe`, an all-lowercase `.EXE` name and a pre-release name, and left nothing.
- **The stricter link check refuses no legitimate case.**
  - An update folder that is itself a link is accepted (P2a).
  - Windows letter case: the name comparison ignores case on win32, and the JavaScript `realpathSync` keeps the name as typed.
  - 8.3 short names: `GII-GE~1.EXE` is not expanded by the JavaScript realpath, so the main.js name check refuses it before staging. Nothing is staged or left behind. The renderer sends names from a directory listing, which are long names, so this is not a practical case.
  - Links that are refused: a link to an outside file with the same name (P2b), `x.exe` → `b.bin` (P2c), and one installer name linked to another installer in the same folder (P2d, so a 9.9.9 name can no longer stand in for a 2.0.0 file).
- **E4 fixed.** The sweep matches `^update-staging\.old-[0-9a-f]{16}$`. A user file `update-staging.old-mine.txt` is kept (tested, N3 killed).
- **`removeStagedCopy` is safe.** It is called only at main.js:1338, inside a `try` that starts after `stageInstaller` has returned, so `staged.stagedFile` always exists. Failures inside `stageInstaller` itself still use `removeStagingTree(stagingDir, 1)` (:285), which removes a partial copy (its name matches) and the empty `install-*` folder. P5 (a hard-linked installer refused after the folder was made) left `update-staging` empty. If the folder is not there yet, `stagingDir` is empty and nothing is touched; on a refused `mkdtemp` check, `ensureStagingFolder` removes the folder itself.
- **The re-hash is right.** A zero-byte file returns the SHA-256 of empty input, both with and without `expected` (P3a/b), so it matches the copy hash. A file that grew in place is refused at the size check (P3c). A 3 MB file hashes the same as `crypto` (P3e). `end` is inclusive, so `size - 1n` is correct.
- **`removeStagingTree` narrowing holds.** Links below the top are left (P7: an `install-*` link passed in at depth 1 is not walked or unlinked; N8 killed). `notes.txt` inside `install-*` is kept (the old M3 survivor is now killed).
- **E1 is fixed in KG-4, but the assistant does not read that flag.** The feature graph the assistant answers from still says a GRN posts no voucher (F1).
- `npm run -s test:integrity`: **pass**, 222/222 and 49/49 (`ipc-security`), 79 s.

## Commands and results

| Check | Result |
|---|---|
| `npm run -s test:integrity` | **Pass.** 222/222 + 49/49, 79 s |
| P1: stage, then `removeStagedCopy`, for three valid name forms; then stage and run the start-up clear | Nothing left each time |
| P2a-d: link cases (described above) | a: accepted; b, c, d: refused |
| P3: `hashFile` with a zero-byte file, a file that grew in place, and a 3 MB file | Correct in all cases |
| P4: staged copy deleted and rewritten, then `removeStagedCopy` | The filesystem reused the inode, so it was removed. Anything left would go at the start-up clear |
| P5: hard-linked installer (refused after `mkdtemp`) | `update-staging` empty afterwards |
| P6: own staging folder with mode `0775`, rename fails `EPERM` | Refused, not used in place (F3) |
| P7: `removeStagingTree(link, 1)` | Link kept; target untouched |

### Mutation runs (against `ipc-security.test.mjs`)

| Id | Mutation | Result |
|---|---|---|
| N1 | Same-name check (:41-42) removed | Killed |
| N2 | Owner/mode check always true | Killed |
| N3 | Sweep back to a prefix match | Killed |
| N4 | `INSTALLER_COPY_NAME` widened to any `.exe` | Survives (it widens; harmless) |
| N5 | All `unchanged()` re-checks removed | Survives (race only) |
| N6 | `end` bound removed from the re-hash read | Survives (the size check before it already covers this; race only) |
| N7 | `removeStagedCopy(staged)` call removed | Killed |
| N8 | Links unlinked at any depth (old behaviour) | Killed |
| N9 | `realpathSync.native` back to `realpathSync` | Survives (no difference on Linux) |
| N10 | `read === size` comparison dropped | Survives (race only) |

## Findings, ranked

| # | Severity | Where | Finding |
|---|---|---|---|
| **F1** | **Low** | feature-function-graph.json:781, :793, :799; workflow-graph.json:187; workflowStageEngine.js:21; voucher-accounting-graph.json:1444 | The assistant still answers "a GRN posts no accounting voucher" |
| F2 | Low (tests) | ipc-security.test.mjs | E5 is only partly closed: the start-up sweep, the dev/ino/size check, the side check, in-place clearing and the backup advice are still untested |
| F3 | Info | updateInstaller.js:185-189 | The owner check does nothing on Windows and refuses a group-writable folder (umask `002`) on Linux |
| F4 | Info | voucher-accounting-graph.json:670 | `postStockInward` `writesToTables` still omits `stock_reservations` and `supply_orders` |
| F5 | Info (race) | updateInstaller.js:79-101, :204-215 | The `unchanged()` re-checks and the bounded read guard only against races. They are untested (N5, N6, N10), which is acceptable |

### F1 (Low): the assistant still says a GRN posts no voucher

- **Correction to my E1.** I wrote that `answerContractBuilder.js:113` reads KG-4's `createsAccountingImpact`. It does not. It reads `featureMatch`, which `featureFunctionBridge.js:197` builds from **feature-function-graph.json** (FG-1). The KG-4 edits in this commit are accurate against `inventoryService.js:189-240`, but they do not change that answer.
- **What is still wrong:**
  - FG-1, "GRN / Goods Receipt" node: `voucherTypes: []` (:781), `createsAccountingImpact: false` (:793), and `whatThisFeatureDoesNotDo: "Does not post accounting vouchers…"` (:799). "Does GRN affect accounting?" is one of that node's own `commonQuestions`. The answer becomes "GRN / Goods Receipt does not directly create accounting entries."
  - workflow-graph.json:187 and workflowStageEngine.js:21 have `GOODS_RECEIPT_GRN` `createsAccountingImpact: false`.
  - KG-4:1444 still has `accountingImpact: "inventory_only"` next to the new `createsAccountingImpact: true`.
- **This is real in code.** Both the manual GRN (`inventory:post-inward`, main.js:940) and the automatic GRN made from a purchase voucher (init.js:1060) call `postStockInward`, which posts the Journal.
- **Fix:**
  - FG-1: `voucherTypes: ["Journal"]`, `createsAccountingImpact: true`, and a `whatThisFeatureDoesNotDo` such as "Does not post the supplier's bill; the purchase voucher is a separate step."
  - WG-1 (workflow-graph.json and workflowStageEngine.js): `createsAccountingImpact: true` for `GOODS_RECEIPT_GRN`.
  - KG-4:1444: `accountingImpact: "inventory_grni"` (or similar).
  - Alternatively, if this is meant to wait for KG-4 v1.1, extend KG4-GAP-002 to name FG-1 and WG-1. Today it says only "other entries of this graph".

### F2 (Low, tests): parts of E5 are still open

The commit kills M3 (`notes.txt` kept) and adds tests for E3 and the owner check. These items from E5 still have no test: M2b (start-up sweep), M4 (dev/ino/size check before the re-hash), M5 (side check through a linked data root), M7 (in-place clearing of old `install-*`), and M8/M9 (backup advice for `ENOSPC` and `EBUSY`). Fix: the tests listed in E5 of the previous report still apply unchanged.

### F3 (Info): the owner check is narrow on both platforms

- On win32, `ownStagingFolder` returns `isDirectory()` (:187), the same as before. The new check therefore changes nothing on the shipping platform. The comment says so.
- On POSIX it needs mode `& 0o022 === 0`. Under a umask of `002` (common on Linux desktops), the app's own `mkdir` (:166) makes a `0775` folder, which is then refused for in-place use (P6). The in-place path runs only when `rename` fails, which on Linux almost never happens. No action needed. If touched, check only `0o002` (others) together with the uid.

### F4 (Info): one table list is still incomplete

`postStockInward` calls `autoReserveOrderStock` (operationsService.js:35), which writes `stock_reservations` and `supply_orders`. KG-4:670 `writesToTables` leaves both out, although the safety rule mentions auto-reserving. Fix: add both.

### F5 (Info, race only)

The `unchanged()` re-checks in `removeStagingTree`, the `end` bound and the `read === size` comparison in `hashFile` are correct by reading. They only matter if another local process races the updater. No fix is needed.

## Status of the claimed fixes

| Item | Status | Evidence |
|---|---|---|
| E1 KG-4 stock inward / GRN stage | **Fixed in KG-4; not reaching the assistant** | voucher-accounting-graph.json:672-681, :1442-1448 match inventoryService.js:189-240. FG-1 and WG-1 still contradict it (F1) |
| E2 native realpath | **Fixed** | updateInstaller.js:128. Same resolver as :137 |
| E3 installer name links to another file | **Fixed** | :40-42. Tested (N1 killed). Every legitimate copy matches `INSTALLER_COPY_NAME` (main.js:1304-1307 + :42) |
| E4 strict sweep | **Fixed** | :117. Tested (N3 killed) |
| E5 tests | **Partly fixed** | M3 now killed; new tests kill N1, N2, N3, N8. The rest is in F2 |
| `removeStagingTree` narrowing and re-checks | **Correct** | :71-102. No legitimate copy is left (P1, P5) |
| `removeStagedCopy` | **Correct** | :105-111. Only reached once `stagedFile` exists (main.js:1316-1340). Tested (N7 killed) |
| Owner/permission check in place | **Correct, narrow** | :148, :185-189. Tested (N2 killed). F3 |
| Re-hash reads exactly the copied size | **Correct** | :198-219. Zero-byte case right (P3a/b) |

Nothing in this commit touches postings, GST, profitability or the schema.
