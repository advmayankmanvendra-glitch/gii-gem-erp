# Correctness audit: efefcbb..32263ab

- **Scope:** commit `32263ab` against its parent `efefcbb` (PR #4, branch `claude/erp-full-automation-qbhv8k`). It answers `audit-efefcbb-{correctness,security,architecture}.md`.
- **Claimed fixes checked:** AA1-AA3, S16-r1, S19-r1, S20, S21, S12-r1, F32, F33 (R5 test, silent-return tests), F34 (dead code), F36 (policy wording).
- **Also reviewed:** the new updater code in `src/main/main.js`, the installing state in `SettingsScreen.jsx` and `settings/index.jsx`, `supplierReturnSplit` without the end-of-replay zeroing, and the four new tests.
- **Method:** a read-only worktree at `32263ab`, with no commits and no pushes. I ran 22 source mutations, each against the suite that should kill it, and a throw-away probe test file that I deleted afterwards.
- **Written:** 11 Nov 2026, 07:00 IST.

## Commands and results

| Check | Result |
|---|---|
| `npm run -s test:integrity` | **Pass.** 222/222 (integrity suites) + 31/31 (`ipc-security`), about 61 s |
| Probe P1: three installs whose launch fails (`openPath` returns an error) | **Three 5 MB copies stay** in `update-staging/install-*`, one per attempt (finding AB1) |
| Probe P2: hard-linked installer | Refused. `update-staging` is left empty, so the clean-up works |
| Probe P4: successful launch, app does not quit (test stub) | A later install is refused with "already being prepared" until restart. This is intended, and harmless in real Electron (AB4) |
| Node check: FIFO and symlink opened with `INSTALLER_OPEN_FLAGS` | FIFO opens at once with `isFile() == false`, so it is refused (S21 fixed). Symlink: `ELOOP`, which maps to the guided "linked" message |

### Mutation runs

| Id | Mutation | Result |
|---|---|---|
| R5 | `drop.left = 0` removed (inventoryService.js:463) | **Killed** (new audit2 test "what is left of a reversed receipt…" and the 8d5dd67 test) |
| M1 | Flag never set | Killed |
| M2 | Flag always released, even after a launch (main.js:1405) | **Survives** (AB3) |
| M3 | Flag never released | Killed |
| M4 | No audit row for the "busy" refusal | Killed |
| M5 | Planted staging link not removed (:591) | Killed |
| M6 | Post-`mkdir` `lstat` check removed (:593) | Survives (it only guards against a race) |
| M7 | No `mkdtemp` (copy straight into `update-staging`) | Killed. It is killed because a failed launch leaves its copy behind, so the next `wx` write hits `EEXIST`. That confirms AB1 |
| N1 | `O_NOFOLLOW` dropped | Survives |
| N2 | `O_NONBLOCK` dropped | Survives |
| N3 | Recheck after the open removed (`recheck = checked`) | **Survives.** This recheck is the only link protection on Windows (AB3) |
| N4 | `sameFile` comparison removed | Survives |
| N5 | `nlink` check removed | Killed |
| N6 | `recheck !== checked` removed | Survives |
| N7 | Catch-block clean-up of the staging folder removed | **Survives.** The "no copy is left behind" assert cannot fail (AB3) |
| N8 | No audit row for guided refusals | Killed |
| N9 | "where" always says "the update folder" | Survives |
| N10 | Raw pass-through `/installer/.test(error.message)` re-added | **Survives.** The test only greps the source for the old regex (AB3) |
| N11 | `ELOOP` not mapped to the guided message | Survives |
| N12, N13 | Size cap and size match removed | Survive (carried from F33, SG6 and SG7) |

## Summary

The main claims hold. AA1 / S19-r1 / F32 are fixed: the flag now covers the whole handler, from the first check through the backup to the launch. It is kept after a launch, released after any failure, and a refusal is written to the audit log. The UI button is disabled while an install runs.

- **S16-r1 is fixed.** The installer is opened with `O_NOFOLLOW`. The path is then checked again, and the open file's dev/ino (as bigint) must match `lstat` of the rechecked path. On Windows, where `O_NOFOLLOW` is 0, the recheck does the same job. Both swap orders (link before the open; link and then swap back) are refused, because of the realpath directory check or the dev/ino check.
- **S21 is fixed** by `O_NONBLOCK`.
- **S20 is narrowed:** a link planted beforehand is removed, and each install gets a fresh `mkdtemp` folder.
- **S12-r1 is fixed:** there is no regex pass-through any more, and refusals now leave audit rows.
- **F34 is fixed.** I confirmed the removed zeroing is dead: every reversed lot that passes the filter at :402 has a drop event, and every event is processed before `take`. Postings do not change, and all 222 integrity tests pass.
- **F33:** the R5 test kills R5, and the two silent `return`s are gone.
- **F36:** the policy wording is fixed.

New or remaining issues, none above Low:

| # | Severity | Where | Finding |
|---|---|---|---|
| **AB1** | **Low** | main.js:1421-1426, :598 | A failed launch, or a failed backup, leaves its staged copy (up to 1 GB) in `update-staging/install-*`. Each retry adds another copy until the next restart. Regression from `mkdtemp`: the old code cleared the folder at the start of every run |
| AB2 | Low | main.js:656-661 | AA2 only partly fixed: the journal and audit row still get only the code, with the syscall and path lost. The detail goes to `console.error`, which a packaged Windows build does not save. An `ENOSPC` during the copy has no `error.path`, so the message points at "the update folder" when the full disk is the data folder |
| AB3 | Low (tests) | ipc-security.test.mjs:540, :547-580, :625 | Survivors M2, N3, N7, N10. The new "no copy left" assert cannot fail on the path it tests. "Flag kept after launch" is untested. The Windows-only protection (recheck) is untested. The pass-through check is a grep of the source |
| AB4 | Info | main.js:1393-1405; SettingsScreen.jsx:125-131 | The flag (and the button) stay set if the app does not quit after a launch, or if the call never settles (hung share). This needs a restart. The message then says "being prepared", although an installer was already launched |
| AB5 | Info | main.js:589-598 | S20 residual: a link swapped in between the `lstat` at :593 and `mkdtemp` at :598 is still followed (microseconds, same-user attacker) |
| AB6 | Info | main.js:649 | The Zone.Identifier mark is read again by path, not from the open handle, and is still untried on Windows. Failures other than `ENOENT` now go to `console.warn` only (AA3 partly addressed) |
| AB7 | Info | KG-4 (voucher-accounting-graph.json) | F36 leftovers not claimed in this commit: `postStockReturn.relatedDG1Tables` is still the old six, and R8 is not in the report notes. The `lineNumber` 478 is correct |

## Status of the claimed fixes

| Item | Status | Evidence |
|---|---|---|
| AA1 / S19-r1 / F32 (flag released before backup and launch) | **Fixed** | main.js:1388-1406. Test :547 holds the first call at `openPath`, after its backup, and a second call is refused. M1, M3 and M4 killed |
| AA2 (error mapping drops the cause; wrong advice) | **Partly fixed** | The advice now names the data folder or the update folder from `error.path`. The cause is still lost from the journal and audit row (AB2) |
| AA3 (Zone.Identifier copy untested, silent) | **Partly addressed** | Read and write instead of `copyFileSync`, and non-`ENOENT` failures are logged to the console. Still untried on Windows (AB6) |
| S16-r1 (stat instead of lstat; race) | **Fixed in code** | :579, :613-624. Windows relies on the recheck at :620. Untested (N1, N3, N4, N6 survive) |
| S20 (link planted between rm and mkdir) | **Narrowed** | :589-598. Planted-before case tested (:582) and M5 killed. Race residual AB5 |
| S21 (FIFO blocks open and locks the flag) | **Fixed** | `O_NONBLOCK`, verified directly. Untested (N2 survives) |
| S12-r1 (pass-through regex; no audit row for refusals) | **Fixed** | The regex is gone and every guided error is passed through as written. Audit row `update_installer_refused` written (P2 row seen; N8 killed). The test for "no pass-through" is a source grep (N10 survives) |
| F33 R5 test | **Fixed** | R5 killed by audit2 "efefcbb round" test and the 8d5dd67 test |
| F33 silent returns | **Fixed** | The `try { … } catch { return; }` around `reverseStockInward` (audit2 :1302) and around `linkSync` (ipc :536) are removed. The "no copy left behind" assert added there is vacuous (AB3) |
| F34 dead code | **Fixed** | End-of-replay zeroing removed. Equivalence argued above, and all 222 tests pass. The tie-break at :460 (`give` ordering) remains, which is harmless |
| F36 policy wording | **Fixed for the policy** | :89 now has "except to a receipt already reversed by then", and V3 now reads "as the stock ledger grows". KG-4 leftovers in AB7 |

## AB1 (Low): a failed launch leaves its staged copy, and retries pile up

**What happens.** `stageInstaller` removes its `install-*` folder only when staging itself fails (:656). After staging succeeds, `installUpdateFromFolder` can still fail in two places:

- `createLiveBackup` throws (:1423);
- `shell.openPath` returns a reason, for example "No application is associated" or a refused UAC prompt (:1426).

In both cases nothing removes the copy. Before this commit, every run began with `rm -r update-staging`, so at most one copy existed. Now each run gets a new `mkdtemp` folder and old ones are cleared only at start-up (:265, :585).

**Measured.** Probe P1 ran three installs of a 5 MB installer with `openPath` failing. Afterwards `update-staging` held `install-FkqvuF/…`, `install-TRzb1R/…` and `install-d9cPiG/…`, each with the full copy. Mutation M7 is killed for the same reason: the left-over copy makes the next `wx` write fail.

**Effect.**

- A user retrying a 600 MB installer five times uses 3 GB in a hidden folder next to the books. Each attempt also takes a backup, which is not new.
- The free-space check at :630 then starts refusing with "not enough free disk space next to the books". The user cannot see which files to delete. A restart fixes it.

**Fix.** Either of these works; the first is simpler:

1. In `installUpdateFromFolder`, wrap everything after staging in `try { … } catch (e) { fs.rmSync(path.dirname(staged.stagedPath), { recursive: true, force: true }); throw e; }`. Do this only on failure, never after a successful launch.
2. Or clear old `install-*` folders at the start of `ensureStagingFolder`. This is now safe: the flag stays set after a successful launch, so no later run in the same session can delete a copy that is running.

Add a test that makes `openPath` fail and asserts `fs.readdirSync(stagingRoot)` is empty.

## AB2 (Low): the cause is still lost from the journal; ENOSPC points at the wrong folder

- **Where:** main.js:656-661.
- **What happens:** the mapped message keeps only `error.code`. The full error goes to `console.error`. In a packaged build, main-process console output is not written anywhere: the only file log, at main.js:186, is for renderer messages. The Error Console journal and the `update_installer_refused` row hold only "could not be prepared (EPERM)", without the syscall or path.
- **The "where" hint depends on `error.path`.** Errors raised while writing (`ENOSPC`, `EIO` on the write stream) carry no `path`. So a full disk on the data drive says "Check free disk space and **the update folder**", when the update folder may be on another drive. The advice also says "free disk space" for `EPERM` and `EBUSY`.
- **Fix:**
  - Build the message as ``(${error.code || "unexpected error"}${error.syscall ? `, ${error.syscall}` : ""})``.
  - Treat `ENOSPC` and `EDQUOT` as the staging side.
  - Put `{ code, syscall, path: basename(error.path) }` into the audit row's `new_value`.
  - Use "check free disk space" only for `ENOSPC`/`EDQUOT`, and "check that the folder is not open in another program" for `EPERM`/`EBUSY`/`EACCES`.

## AB3 (Low, tests): four survivors and one vacuous assert

- **M2:** "the flag stays set after a launch" (:1405) is untested. **Fix:** a last test in `ipc-security` with `shell.openPath = async () => ""`. Assert that a second call is refused with "already being prepared". This mirrors probe P4. The stub's `app.quit` is a no-op, so the flag stays set, which is why it must be the last updater test.
- **N3:** removing the recheck at :620 survives. On Windows (`O_NOFOLLOW` = 0) this recheck is the only thing that stops a link swapped in between check and open. **Fix:** test `stageInstaller` with an injected open (the F31 module) that swaps the file between the check and the open. Through IPC, a test can wrap `fs.promises.open` for one call to swap a symlink in before delegating, then assert the "changed or is linked" message.
- **N7:** ipc-security.test.mjs:538-540 filters `update-staging` for names ending in the installer name. The hard-link refusal comes before any copy is written, so only an empty `install-*` folder could ever be left, and the filter ignores it. **Fix:** `assert.deepEqual(fs.existsSync(staging) ? fs.readdirSync(staging) : [], [])`.
- **N10:** :625 only checks that the old regex text is absent. **Fix:** test the behaviour instead, with a raw error whose message contains "installer". For example, make `<data root>/update-staging` a file that `rm` cannot remove, or wrap `fs.promises.mkdtemp` to throw `Object.assign(new Error("EACCES … /installer/x"), { code: "EACCES" })`. Assert the reply starts with "The update could not be prepared".
- **Carried:** N1, N2, N4, N6, N9, N11, N12, N13 (F33 SG list). They are best tested in the F31 updater module with injected `fs` calls.

## AB4 (Info): stuck flag and stuck button

- **Main process.** After a successful `openPath`, the flag stays set by design (:1393-1405). The app quits 1.5 s later: windows are destroyed and `app.quit()` runs. `before-quit` (:1660) does not prevent the quit, so in practice the flag cannot stay stuck.
- **The stuck case.** Only a call that never settles, such as a read from a hung network share, keeps the flag set without a quit (AA4, unchanged). A restart clears it.
- **Renderer.** `installingUpdate` is cleared only on an error (SettingsScreen.jsx:131). If the user leaves Settings and returns during an install, the state resets to false. A click then gets the "already being prepared" refusal, which is correct, and the click adds one audit row.
- **Optional:**
  - Use a separate message once a launch has happened: "The installer has been opened; the ERP is closing."
  - Add a timeout around the copy (for example, abort the read stream after 10 minutes with no progress), so a hung share does not need a restart.

## AB5 (Info): S20 residual race

`ensureStagingFolder` checks `lstat(update-staging).isDirectory()` at :593, then calls `mkdtemp` under it at :598. A same-user process that swaps `update-staging` for a link in those microseconds still gets the copy written, and launched, through the link.

**Fix:**

- After `mkdtemp`, check that `fs.realpathSync(stagingDir)` sits directly in `fs.realpathSync(runtimeDataRoot)/update-staging`, and that `lstat(update-staging)` is still a directory.
- Otherwise remove the folder and refuse.

Test 30 covers only a link planted beforehand.

## AB6 (Info): Zone.Identifier

- **Where:** main.js:649.
- **What happens:** the mark is read from `${checked}:Zone.Identifier` by path, after the data was read through the handle. A file swapped in after the recheck could give its mark (or lack of one) to the copy. An attacker who can write the folder can already strip the mark, so this adds nothing.
- **Still untried on Windows:**
  - NTFS: the read and write should work.
  - FAT32/exFAT data root: the write fails with a code other than `ENOENT`, and the failure goes only to `console.warn`, so a missing mark is silent in packaged builds (fail-open, as before).
- **Fix:** record a failure to copy the mark in the `update_installer_launched` audit row (`zoneMark: "copied" | "none" | "failed:<code>"`). Do one manual check on Windows that SmartScreen still prompts.

## AB7 (Info): KG-4 leftovers from F36

- `postStockReturn.relatedDG1Tables` is still `stock_returns, stock_ledger, items, vouchers, voucher_lines, ledger_entries`. **Fix:** add `stock_inwards`, `procurements`, `goods_receipts`, `goods_receipt_items` and `accounts`.
- R8 is still recorded only in the policy.

The commit claimed only the policy wording, so these are carried, not regressions.

## Questions from the brief, answered

**Is the flag kept after a launch, and released otherwise?**

- Yes. `launched` is set only after `installUpdateFromFolder` returns, which is only after a successful `openPath`.
- Every throw (guided or not) releases the flag in `finally`. Verified by test :547 (third call works after a failed launch) and by M3.

**Staged copies after a failed launch?** They are left behind and pile up. See AB1.

**Stuck flag if the app does not quit?** Yes, until restart. In real Electron the quit cannot be vetoed by this app's handlers, so the risk is theoretical. See AB4.

**Windows, where `O_NOFOLLOW` is 0?**

- The protection comes from the recheck at :620-624:
  - realpath of the path again;
  - the parent must still be the update folder;
  - `lstat` must be a regular file with the same dev/ino (as bigint, which also fixes the 64-bit file-ID precision on NTFS) as the open handle;
  - `nlink` must be 1.
- The two swap orders:
  - Link swapped in before the open: the recheck resolves outside the folder and refuses.
  - Link then swapped back: dev/ino differ and the install is refused.
  - On Windows a hard link needs no admin rights; the `nlink` check refuses it.
- So the logic is sound on Windows. It is just untested (N3).
- One Windows note: on SMB shares or FAT volumes the file ID can be 0 or synthetic. Then `sameFile` compares 0 with 0. That cannot cause a false refusal, and the realpath and parent checks still apply.

**`supplierReturnSplit` without the end-of-replay zeroing?**

- It is equivalent:
  - The filter at :402 keeps a reversed lot only when `reversedAt > slId > 0`.
  - Every such lot gets a drop event (:458).
  - All events run before `mine = take(…)`, so each such lot reaches `left = 0` through `drop`.
- R5 is now killed, so the drop's zeroing is guarded. All 222 integrity tests pass.

**Do the new tests kill their target mutations?**

| Target | Killed? |
|---|---|
| R5 | Yes |
| Flag set, never released, busy audit row | Yes (M1, M3, M4) |
| Link planted as the staging folder | Yes (M5) |
| `mkdtemp` | Yes, but only indirectly (M7) |
| Guided audit row | Yes (N8) |
| Flag kept after launch | No (M2) |
| Recheck | No (N3) |
| Catch clean-up | No (N7) |
| Pass-through | No (N10) |

## Owner decisions this report needs

None. AB1-AB7 concern the updater, the tests or KG-4 text. None changes a posting, profitability, GST or the schema. AB1 should be fixed before release, because a user who keeps retrying a failed install fills the data drive.
