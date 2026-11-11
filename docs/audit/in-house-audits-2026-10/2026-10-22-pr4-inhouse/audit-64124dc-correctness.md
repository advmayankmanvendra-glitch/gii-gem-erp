# Correctness audit: ef324d5..64124dc

- **Scope:** commit `64124dc` against its parent `ef324d5` (PR #4, branch `claude/erp-full-automation-qbhv8k`). It answers `audit-ef324d5-correctness.md` (C1-C6).
- **Claimed fixes checked:** C1 (update-folder message kept, audit writes cannot hide the outcome, a failed "launched" row is not fatal), C2 (staging cleared by renaming it away; `mkdtemp` result checked against `realpath(dataRoot)/update-staging`), C4 (new tests), C5 (one audit row on a failed launch), C6 (lock/permission advice). Also: handle-based `hashFile`, the size check on the `Zone.Identifier` stream, the electron-stub `openPath` default, and the KG-4 stock-return text.
- **Method:** a read-only worktree at `64124dc` with `node_modules` symlinked; no commits, no pushes, nothing installed. `better-sqlite3` from the shared `node_modules` loads under Node (checked again after the container restart). I ran 27 source mutations against `ipc-security.test.mjs` and a throw-away probe file (7 probes), deleted afterwards. The worktree has been removed.
- **Written:** 11 Nov 2026, 08:15 IST.

## Summary

The commit fixes what it says it fixes:

- **C2 is fixed.** The staging folder is renamed away before it is cleared, so a swapped-in link is moved, never deleted through. The new folder is compared with the *expected* real path, not the link's target. A test swaps a link in at `mkdtemp` and is refused, with nothing left in the outside folder.
- **C1 is fixed.** The update-folder message reaches the user unchanged (probe P4). A failed audit write is only logged. With the database locked after a successful `openPath`, the user now gets `{ success: true, closing: true }` and the updater stays locked (probe P5).
- **C5 is fixed.** One `update_installer_failed` row for a failed launch, no "refused" row (probe P6).
- **C6 is partly fixed.** The handler's advice now distinguishes locked files. The backup message still always says "check free disk space" (Info).
- **C4:** the new tests kill H1, B1, A1b, A2 (ENOSPC/side), A5 (old compare + lstat both removed) and N10b.
- **KG-4 text is correct.**
- `npm run -s test:integrity`: **pass**, 222/222 + 42/42 (`ipc-security`), about 70 s.

The new `ensureStagingFolder` brings two small regressions and one older bug gets worse:

1. **D1 (Low):** on Windows, a single file held open anywhere inside `update-staging` makes the rename fail, and every install is refused until that file is released. The old code skipped files it could not delete.
2. **D2 (Info):** if the moved-away folder cannot be deleted, `update-staging.old-*` folders pile up in the data folder. Nothing ever removes them, including the start-up clear.
3. **D3 (Info):** the "which side failed" advice compares the real path with the unresolved data-root path. When the data root is reached through a link, a mapped drive letter or different letter case, a data-folder error is blamed on "the installer in the update folder".

Several of the C1/C5/C6 fixes, and the hash hardening, are correct but untested (D4). Nothing touches postings, GST, profitability or the schema.

## Commands and results

| Check | Result |
|---|---|
| `better-sqlite3` loads under Node from `/home/claude/gii-gem-erp/node_modules` | **Yes** (not rebuilt) |
| `npm run -s test:integrity` | **Pass.** 222/222 + 42/42, about 70 s |
| P1: `rename(update-staging)` fails with `EPERM` (what Windows does when a file inside is open) | Refused: "The update could not be prepared (EPERM). The ERP's data folder is locked or not readable. Close any program using it, then try again." One `update_installer_refused` row, `detail {code: EPERM, syscall: rename, file: "update-staging", side: data-folder}`. No launch (D1) |
| P2: deleting the moved-away folder fails, twice | Two folders `update-staging.old-<hex>` left in the data root. `clearInstallerStaging` (start-up) leaves both (D2) |
| P3: first run, no `update-staging` at all | Works. `rename` gets `ENOENT` (ignored), the folder is made, the copy reaches `openPath`, and the copy is removed afterwards |
| P4: update folder cannot be created (`GII_GEM_ERP_UPDATE_DIR` under a file) | "The update folder … could not be created or opened (ENOTDIR). Check that the folder can be reached (or change the update folder setting)…". **C1(a) fixed** |
| P5: database locked when the "launched" row is written, after a successful `openPath` | Reply `{success: true, closing: true, backup: …}` after about 5 s (busy timeout). The audit failure is only logged. A second install gets "already been opened". **C1(b)/(c) fixed** |
| P6: `openPath` returns "No application is associated" | Reply keeps the OS text. Exactly one row, `update_installer_failed`. Copy removed. **C5 fixed** |
| P7: `stageInstaller` with the data root given as a symlink, write fails `EACCES` | Advice says "the installer in the update folder is locked", `side: update-folder`. With the real path as data root: "the ERP's data folder", `side: data-folder` (D3) |

### Mutation runs (against `ipc-security.test.mjs`)

| Id | Mutation | Result |
|---|---|---|
| C1a | `ensureUpdateFolder` throws a plain `Error` again | **Survives** (behaviour correct per P4; untested, D4) |
| C1b | `auditUpdate` rethrows the audit failure | **Survives** (correct per P5; untested, D4) |
| C5 | Handler writes the "refused" row even after a failed launch | **Survives** (correct per P6; untested, D4) |
| C6 | Locked-file advice never chosen | **Survives** (untested, D4) |
| N10b | Handler passes unguided errors through raw | Killed (new EIO test) |
| B1 | Backup failure passed through raw | Killed (new backup test) |
| H1 | Re-hash before `openPath` removed | Killed (new "changes before the launch" test) |
| R1 | No rename-away; `mkdir` recursive (the old in-place behaviour) | Killed by 7 tests |
| R2 | Moved-away real folder not deleted | Killed ("nothing moved aside is left behind") |
| R3 | Moved-away link not unlinked | Killed (same test) |
| R4 | `mkdir(expected)` made recursive (no `EEXIST` refusal) | **Survives** (the race is untested; Info) |
| R5a | Compare with `realpath(expected)` instead of `expected` (the old C2 bug) | Survives alone. The `lstat(expected).isDirectory()` check still refuses |
| R5b | `lstat(expected).isDirectory()` removed | Survives alone. The path compare still refuses |
| R5ab | Both of the above | Killed ("link swapped in … at the last moment") |
| R6 | `rmdir(dir)` of the folder made through the link removed | Killed (outside folder must be empty) |
| HF1 | `hashFile` `isFile()` check removed | **Survives** (Info, D4) |
| HF2 | `hashFile` reads by path again (`fs.createReadStream(filePath)`) | **Survives** (Info, D4) |
| N4 | `sameFile` removed | **Survives** (carried from C4) |
| STUB | Stub `openPath` default back to `""` | Survives: **no test relies on either default** |

Carried survivors not rerun: N1, N2 (`O_NOFOLLOW`/`O_NONBLOCK`), N11 (`ELOOP` mapping), N12 (1 GB cap). The 1 GB cap and the free-space check are now covered by the new test "an installer over 1 GB, or with too little free space".

## Findings, ranked

| # | Severity | Where | Finding |
|---|---|---|---|
| **D1** | **Low** | updateInstaller.js:69-73 | One file held open inside `update-staging` on Windows blocks every install, where the old code skipped it |
| D2 | Info | updateInstaller.js:74-79, :58-60 | `update-staging.old-*` folders that fail to delete are never removed |
| D3 | Info | updateInstaller.js:187 | Side classification compares a real path with the unresolved data-root path |
| D4 | Low (tests) | ipc-security.test.mjs | C1a, C1b, C5, C6, HF1, HF2, R4 and N4 survive |
| D5 | Info | main.js:1322 | Backup failure advice still always says "free disk space" (C6 remainder) |
| D6 | Info | voucher-accounting-graph.json:1066-1071 | Department return is marked `voucherCreated: true`, but a zero-value return posts no voucher |

### D1 (Low): a locked leftover file now blocks updates

- **What changed.** Before, `ensureStagingFolder` removed old entries one by one with `.catch(() => {})`, so a file it could not delete was simply left behind. Now it renames the whole folder (updateInstaller.js:70). Any error other than `ENOENT` is thrown (:72).
- **Why it matters on Windows.** A directory cannot be renamed while any file inside it is open. libuv reports that as `EPERM`. Probe P1 shows the result: the install is refused with "The ERP's data folder is locked or not readable", and a retry fails the same way for as long as the file stays open.
- **When it happens.** It cannot happen through this app within one session: the in-flight flag holds, and a launch closes the ERP. But it can happen at the next start:
  - the NSIS finish page starts the new ERP while the old installer copy is still exiting, so the start-up `clearInstallerStaging` (main.js:264) cannot delete it;
  - antivirus or the search indexer holds a copy it is scanning;
  - an Explorer or other window has a file in the folder open.

  The usual effect is a refusal that clears on a later retry. The rare effect is a refusal that lasts until a restart.
- **The link case is unaffected.** A link holds no open files, so renaming it never hits this.
- **Fix:** when `rename` fails with `EPERM`/`EACCES`/`EBUSY`, fall back instead of refusing:
  - first check `lstat(expected)` is a real directory, not a link, and that `realpath(expected) === expected`;
  - then skip the clear (or do a best-effort per-entry `rm` that `lstat`s each entry and only removes `install-*` directories);
  - carry on to `mkdir`/`mkdtemp`. The existing post-`mkdtemp` check still catches a link swapped in afterwards.

  Add a test that stubs `fs.promises.rename` to throw `EPERM` and asserts that the install still reaches `openPath`.

### D2 (Info): moved-away folders can be left behind for good

- **What happens.** If `rm(old)` or `unlink(old)` fails (:77-78, errors ignored), or the app is killed between the rename and the delete, a folder named `update-staging.old-<16 hex>` stays in the data root. `clearInstallerStaging` (:58-60) only removes `update-staging` itself, so these are never cleared. Probe P2 left two after two attempts, and both survived a start-up clear.
- **Impact.** Disk space only, up to about 1 GB per leftover. No code lists the data root, so nothing else is confused by them.
- **Fix:** in `clearInstallerStaging`, and at the start of `ensureStagingFolder`, `readdir(dataRoot)` and remove entries that match `/^update-staging\.old-[0-9a-f]{16}$/`:
  - `rm` recursively when `lstat` says it is a directory;
  - `unlink` it otherwise.

### D3 (Info): wrong "which side" advice when the data root is not already its real path

- **The cause.** `ensureStagingFolder` now returns `realDir` under `realpath(dataRoot)`, and `rename` errors carry the real path too. But the classification at :187 still tests `path.resolve(error.path).startsWith(stagingFolderPath(dataRoot))`, which is the unresolved path.
- **When it goes wrong.** The two differ when the data root is a symlink or junction, sits on a mapped drive letter (realpath gives the UNC path `\\server\share\…`), or is configured in a different letter case. The comparison is also case-sensitive.
- **The effect.** A data-folder `EACCES`/`EPERM` is reported as "The installer in the update folder is locked", and the audit row says `side: "update-folder"` (probe P7). This is the message and the audit detail only, but it sends the user to the wrong folder.
- **Fix:** classify against the real path. Either compute `expected` once in `stageInstaller` and pass it to `ensureStagingFolder`, or use `stagingDir ? path.dirname(stagingDir) : …` in the catch. Compare case-insensitively on `win32`.

### D4 (Low, tests): correct but unguarded fixes

Each of these is right today (the probes above show it) but would not be caught if it regressed:

| Survivor | Test that would kill it |
|---|---|
| C1a | Set `GII_GEM_ERP_UPDATE_DIR` to a path under a file. Assert the reply contains "could not be created or opened (ENOTDIR)" (probe P4) |
| C1b | Inside the `openPath` stub, hold a side connection with `BEGIN EXCLUSIVE` and return `""`. Assert `ok.closing === true`. This must be the last test, or must reset `updateInstallLaunched` (probe P5) |
| C5 | Return a failure from `openPath`. Assert exactly one new `update_installer%` row, and that it is `update_installer_failed` (probe P6) |
| C6 | Throw `EBUSY` from a staging-path open after staging (the existing EIO test pattern). Assert "locked or not readable" |
| HF1 / HF2 | Replace the staged file with a FIFO or a symlink after the copy. Assert "changed before it could start" and that `openPath` is not called |
| R4 | Wrap `fs.promises.rename` to create `update-staging` right after the real rename. Assert "update-staging folder changed" |
| N4 | Carried from C4: swap in a link, open through it, then put a new regular file back before returning the handle |

### D5 (Info): backup advice

main.js:1322 still says "Check free disk space and the backups folder" for every code. A locked backups folder (`EBUSY`/`EPERM`) or a file where the folder should be (`ENOTDIR`, as in the new test) gets disk-space advice. **Fix:** reuse the handler's `locked` test.

### D6 (Info): KG-4 stock-return entries

- **Supplier return: the new text is accurate.** inventoryService.js:478-535 posts a Journal: Trade Payables Dr (with the supplier link) and/or GRNI Dr, Inventory Cr, and the difference to Purchase Price Variance. There is no voucher when `needsVoucher` is false (:510).
- **Department return: the text is accurate.** It posts Inventory Dr, COGS Cr at `weightedAverageCost`.
- **The flag is not quite right.** `voucherCreated: true` is not always true: a department return whose weighted average cost rounds to zero posts no voucher (:510). The supplier text says so; the department text does not.
- **Fix:** add "(no voucher when the value is nil)" to the department `impact`.

## Status of the claimed fixes

| Item | Status | Evidence |
|---|---|---|
| C1(a) update-folder message kept | **Fixed** | main.js:421 `guidedError`. P4. Untested (C1a survives) |
| C1(b) audit failure cannot replace the message | **Fixed** | `auditUpdate` (main.js:1294-1300) catches and logs. Used for the busy, refused and launch rows. Untested (C1b survives) |
| C1(c) launch with failed audit is still a launch | **Fixed** | main.js:1329. P5: `success: true, closing: true`, flag kept, copy kept |
| C2 staging cleared by rename; `mkdtemp` checked against the expected real path | **Fixed** | updateInstaller.js:64-97. R1, R2, R3, R5ab and R6 are killed. Regressions D1 and D2, and the side-advice issue D3 |
| C4 new tests | **Fixed for H1, B1, A1b, A2 (ENOSPC/side), A5, N10b** | The fixes in this commit are themselves untested (D4) |
| C5 one row per failed launch | **Fixed** | main.js:1287, `launchFailed`. P6 |
| C6 lock/permission advice | **Partly fixed** | Handler main.js:1280-1284. Backup message unchanged (D5) |
| Handle-based `hashFile` | **Correct** | Opens with `O_NOFOLLOW`/`O_NONBLOCK` (0 on Windows), returns `""` for a non-file (which never matches), reads from offset 0 and closes in `finally`. Untested (HF1, HF2) |
| `Zone.Identifier` size check | **Correct** | :168-177. `statSync` on the stream is checked before reading; `ENOENT` is silent and other errors are warnings. Windows-only, so not run here |
| Electron stub `openPath` fails by default | **Safe** | Only `ipc-security.test.mjs` loads the stub (through `electron-register.mjs`). Every updater test sets its own `openPath`. No test calls `documents:view`, `system:open-folder` or `updates:open-folder` expecting success. The suite passes with either default (STUB) |
| KG-4 stock-return text | **Correct** | See D6 for the department flag |

## Questions from the brief, answered

- **Rename-away.** It moves a link rather than following it, so the outside target is untouched (the new test and R1). On Linux, a rename of a folder that holds an open file succeeds. On Windows it fails (D1).
- **`.old-*` leftovers.** Only when the delete fails or the app dies mid-way. They are never cleaned (D2).
- **Non-recursive `mkdir` and `EEXIST`.** Correct: anything that recreates `update-staging` between the rename and the `mkdir` is refused with "changed". The parent always exists, because `realpath(dataRoot)` succeeded. Untested (R4).
- **First run.** Works (P3). `rename` gets `ENOENT`, which is ignored; `lstat(old)` gives null, so nothing is deleted. If the data root itself were missing, `realpath` would throw `ENOENT` and be mapped. That cannot happen after `configureRuntimeStorage`.
- **Windows rename of a folder with an open file.** Fails with `EPERM`. The user gets a guided "data folder is locked" refusal; nothing is deleted and nothing is launched (P1, D1).
- **Did anything rely on the stub's old `openPath`?** No (STUB survives, and the grep finds no other user).

## Owner decisions this report needs

None. D1-D6 concern the updater, its tests and a knowledge-graph note. C3 from the previous report (how Party Reconciliation should treat a date filter) is still open with the owner and is unchanged by this commit.
