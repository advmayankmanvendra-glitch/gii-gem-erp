# Correctness audit: a8c64af..a11bd45

- **Scope:** commit `a11bd45` against its parent `a8c64af` (PR #4, branch `claude/erp-full-automation-qbhv8k`). Only the diff was reviewed. It answers `audit-a8c64af-correctness.md` (F1-F5).
- **What changed:** the assistant's knowledge now says a goods receipt posts a GRN Journal (FG-1 FEA-14, WG-1 `GOODS_RECEIPT_GRN` in both workflow-graph.json and workflowStageEngine.js, KG-4 stage label `inventory_grni`). In `updateInstaller.js`: the top-level clean-up unlinks only links named `install-*`; `stageInstaller`'s own failure clean-up removes the copy by name and then `rmdir`s its folder (no listing); the staging folder is made with mode `0700`; ownership is checked again after `mkdtemp`.
- **Method:** read-only worktrees at `a11bd45` and `a8c64af` (for before/after comparison), `node_modules` symlinked. A throw-away probe ran the real assistant pipeline (`resolveQuery`) and the real `stageInstaller`. Nothing was committed, pushed or installed. Both worktrees, the symlinks and the probe folders are removed; the main checkout's status is clean.
- **Written:** 11 Nov 2026, 09:18 IST.

## Summary

The commit does what it says. No regressions found.

- **F1 is fixed end to end.** "Does GRN affect accounting?", "Does a GRN post a voucher?" and "does goods receipt create a journal entry" now answer: posts a GRN receipt Journal (Inventory Dr, GRNI Cr, or Purchase Cr when the bill came first), "Voucher types involved: Journal", "creates accounting impact". On `a8c64af` the same questions answered "Does not post accounting vouchers". The text matches `inventoryService.js:189-238`.
- **No behaviour change from the `createsAccountingImpact` flag.** Nothing in the UI reads WG-1's flag. `workflowStageEngine.js` is imported only by verify scripts (`scripts/verify-workflow-enforcement-foundation.js`); no screen imports `modules/workflow`. Even inside the engine, a GRN without an order link was already `warn` (no operational root, :285-291). It now gets `supplyOrderRequired: true` and a different reason text, and the decision is the same. KG-4 `accountingImpact` strings have no enum and no reader.
- **The 0700 mode and the ownership re-check cannot refuse a legitimate install on Windows**, the only platform the `.exe` installer runs on. `mkdir` ignores the mode there, and `ownStagingFolder` returns `isDirectory()` on win32 (:189). That includes a UNC or mapped data folder and a data folder restored with another owner.
- **On Linux/macOS the re-check can refuse** a data folder on a share or drive that reports a fixed owner or mode (G1, Info). This was measured with an injected `lstat`.
- **No partial copy is left behind.** An `ENOSPC` part-way through the copy and an installer that grew during the copy both left `update-staging` empty. A normal stage plus `removeStagedCopy` also left it empty under umask `022`, `002` and `000`, and the folder was `0700` each time. The new code removes the copy by its own path, which already passed the installer-name check, so it removes nothing the old `removeStagingTree(stagingDir, 1)` would have kept.
- **Top-level clean-up narrowing is right.** A foreign top-level link (`foreign` → the update folder) is kept, and nothing behind it is touched. The folder that holds it is then moved aside at the next install, which still succeeds. Only that one moved-aside folder stays; they do not pile up.
- `npm run -s test:integrity`: **pass**, 222/222 and 49/49, 65 s.
- Knowledge verifiers: all pass (FF-1 31/31, WG-1 21/21, workflow enforcement 62/62, KG-4, `verify-audit` 0 fail, assistant internal 95/95, ERP brain 51/51, help brain 27/27). `verify-assistant-natural-language-relevance` shows WO-006 and WO-010 failing, the same as on `a8c64af` (not this commit).

## Findings, ranked

| # | Severity | Where | Finding |
|---|---|---|---|
| G1 | Info | updateInstaller.js:177, :186-190 | On POSIX the new re-check refuses a data folder on an SMB/NFS share or FAT/exFAT drive that reports another uid or a group/other-writable mode, with a misleading "changed… restart" message |
| G2 | Low (tests) | scripts/assistant-natural-query-bank.js | No assistant test pins the GRN-posts-a-Journal answer, so F1 could come back unnoticed |
| G3 | Info (pre-existing) | queryClassifier.js:31-40 | "Does GRN post a voucher" with no "?" is refused as an unsafe action |
| G4 | Info (pre-existing) | feature-function-graph.json:783, :812, :3025-3038 | FEA-14 names a posting function `recordGoodsReceipt` that does not exist; FNC-09's description still omits the Journal |
| G5 | Info (carried) | F2, F4 of the previous report | Not addressed by this commit |

### G1 (Info): the re-check can refuse a legitimate install on Linux/macOS shares

- **Before this commit,** a freshly made staging folder (`mkdir` at :167) was never checked for owner or mode. Only the in-place path was checked.
- **Now** `ownStagingFolder(lstat(expected))` runs after every `mkdtemp` (:177). The `0700` mode fixes the umask case (measured: `0700` under umask `002` and `000`). But some filesystems ignore the mode and owner that `mkdir` asks for:
  - CIFS/SMB mounts with `uid=`/`dir_mode=0777`,
  - NFS with `all_squash`,
  - FAT/exFAT volumes. macOS shows these as `drwxrwxrwx`.
- **Measured:** an injected `lstat` returning mode `0777`, or another uid, for `update-staging` refused the install with "The app's update-staging folder changed while the update was being prepared… Restart the ERP and try again." The refusal happens every time, so a restart does not help.
- **Why it is Info:** the installer is a Windows `.exe`, and on win32 the check is `isDirectory()` only. So this cannot happen on the shipping platform.
- **Fix (if touched):** on the fresh-`mkdir` path, take `lstat(expected)` right after `mkdir` and require the same `dev`/`ino` after `mkdtemp`, without the uid/mode test. Keep `ownStagingFolder` for the in-place path only (:150). Otherwise, give this refusal its own message saying the data folder's filesystem does not keep owner-only permissions.

### G2 (Low, tests): the corrected answer is not pinned

- The natural-query bank has GRN-001..003 (what is GRN, what happens after, effect on inventory) but nothing on accounting.
- **Fix:** add a case such as `buildCase("GRN-004", "workflow", "Does GRN affect accounting?", { mustContain: ["Journal", "Goods Received Not Invoiced"], mustNotContain: ["does not directly create accounting entries", "Does not post accounting vouchers"] })`.

### G3 (Info, pre-existing): the question without "?" is refused

- `hasUnsafeActionKeywords` splits on spaces, so `voucher?` is not the word `voucher` and the question with "?" passes.
- Without the "?", `post` + `voucher` match an unsafe keyword pair directly. The educational-intent check (`does`) is applied only to the pattern path, not to that keyword match.
- **Result:** "Does GRN post a voucher" gets "I cannot does grn post a voucher. I am a read-only guidance assistant…" (the same on `a8c64af`).
- **Fix:** strip trailing punctuation before splitting. Also apply the `educationalIntent && !imperativeIntent` exemption to direct keyword matches that begin with a question word.

Also pre-existing: "What voucher is created when I receive goods?" and "what is GRNI" route to CRAC. FEA-14 has no alias for "receive goods" or "GRNI". **Fix:** add those aliases to FEA-14.

### G4 (Info, pre-existing): function names in FG-1

- FEA-14 `postingFunctions: ["recordGoodsReceipt"]` and its `sourceReferences` "KG-4 postingFunction: recordGoodsReceipt" name a function that does not exist. The real one is `postStockInward`.
- FNC-09's description ("Updates stock ledger … triggers inventory valuation") omits the Journal.
- No module reads `functionNodes` today, and `postingFunctions` is not printed in the answer, so users do not see this.
- `canUserPostHere: false` sits next to a stage whose allowed action is `post_stock_inward`.
- **Fix:** rename to `postStockInward`, and add "posts a GRN receipt Journal" to FNC-09. These can wait for KG-4 v1.1 (KG4-GAP-002).

### G5 (Info): carried items

- F2 (tests from E5: start-up sweep, dev/ino/size check, side check, in-place clearing, backup advice) and F4 (`postStockInward` `writesToTables` missing `stock_reservations`, `supply_orders`) are not in this diff. They are unchanged.
- F3 is partly addressed: the umask case is gone for fresh folders (G1 is the new side of it).

## Status of the previous findings

| Item | Status | Evidence |
|---|---|---|
| F1 assistant says GRN posts no voucher | **Fixed** | FG-1:781, :793, :798-799; WG-1 workflow-graph.json:187; workflowStageEngine.js:21; KG-4:1444. Before/after answers compared |
| F2 tests | Open | Unchanged |
| F3 owner check narrow | **Partly fixed** | `mkdir` mode `0700` (:167). New POSIX side effect in G1 |
| F4 `writesToTables` | Open | Unchanged |
| F5 race-only checks | Unchanged, fine | — |
| Failure clean-up in `stageInstaller` | **Correct** | :285-288. Probes: `ENOSPC` part-way and an installer that grew both left `update-staging` empty |
| Top-level links only if `install-*` | **Correct** | :90. Test added (`other-link` kept). Probe: foreign link kept, next install fine |
| Test mock `!options?.recursive` | **Correct** | ipc-security.test.mjs:899. Still makes the race folder before the non-recursive `mkdir` with `{ mode }` |

Nothing in this commit touches postings, GST, profitability or the schema.
