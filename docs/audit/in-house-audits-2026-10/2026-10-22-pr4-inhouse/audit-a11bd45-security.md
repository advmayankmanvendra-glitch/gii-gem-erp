# In-house security audit: a8c64af..a11bd45

- Scope: `a11bd45` ("Close the a8c64af audit findings: assistant knows a GRN posts a Journal, tighter clean-up"). It answers `audit-a8c64af-security.md`: N5-r3, N9-r1 and N10. The security-relevant change is in `src/main/services/updateInstaller.js` (11 lines) and one test in `scripts/audit/ipc-security.test.mjs`. The knowledge-graph and `workflowStageEngine.js` change (a GRN now has accounting impact) is data only. It has no security effect.
- Checkout: a throwaway worktree, `/tmp/claude-0/sec-a11` at `a11bd45`, with `node_modules` linked to the shared one. For two comparison runs I briefly added `/tmp/claude-0/sec-a8c-ctl` at `a8c64af`. Nothing was rebuilt. Both links and both worktrees were removed. Nothing was committed or pushed, and no package was installed.
- Tests: `npm run -s test:integrity` gives **271/271 pass** (222 + 49 IPC), exit 0, on Node v22.22.0. Log: `/tmp/claude-0/sec-probe/tests-a11bd45.log`.
- **Measured** means it ran on Linux (root, ext4). The race probes go through the real `updates:install` handler, with the Electron stub and a mocked `shell.openPath`. The injected probes call `updateInstaller.js` directly. **Reasoned** means Windows behaviour I did not run.
- Disk: root stayed at 64% (15 GB free). The probe folder is 1.7 MB.
- Date: 2026-11-11 09:25 IST

## Short answer

- **N5-r3 is closed for its original form (measured).** In the same race, top-level links with arbitrary names deleted **0 files in 152 attempts**. On `a8c64af` it was 29 of 149.
- **A narrower version remains.** The attacker can still name its links `install-*`. Then the race deletes `V/install-*` in any folder the ERP's account can write: **42 of 150 attempts** (measured).
- **N9 before `mkdtemp` is fixed (measured).** The in-place swap that worked on `a8c64af` is now refused. A swap after the new check still works.
- **The N10 change is a regression (new N10-r1, measured).** `stageInstaller`'s new failure clean-up can now delete a file with the installer's name outside the data folder, including the user's own installer in the update folder. The old code could not. Precondition: write access to the data folder.
- **The new race also exposed a separate bug, N11.** It is older than this commit (also present in `a8c64af`). The copy's identity is read by path after the copy. A swap during the copy makes `removeStagedCopy` delete a file in another folder.

## Summary

| # | Severity | Area | Status |
|---|----------|------|--------|
| **N10-r1** | **Low (new, regression)** | `stageInstaller` failure clean-up, `updateInstaller.js:286-288` | Unlinks `stagedPath` by path, with only `isFile()` checked. Through a swapped-in `install-X` link it deletes `V/<installer name>`. 10 of 117 / 32 of 115 attempts (measured). Was 0 on `a8c64af` (injected control) |
| **N11** | **Low (new, pre-existing)** | Copy identity taken by path, `:283` | A swap during the copy records V's file as "the copy". After the refused launch, `removeStagedCopy` (`main.js:1338`) deletes it. 27 of 115 attempts on `a8c64af`, with the same rate on `a11bd45` (measured) |
| N5-r3 | Low → **Low (narrowed)** | `removeStagingTree` top level, `:90-91` | Arbitrary names: **fixed**, 0 of 152 (measured). Names starting `install-` in another folder: still deleted, 42 of 150 (measured) |
| N5-r3b | Low (open, unchanged) | One level down `:94-95`; `removeStagedCopy` `:105-111` | 7 of 101 and 9 of 112 attempts (measured). The code is unchanged |
| N9-r2 | Info (narrowed) | `ensureStagingFolder` `:167`, `:177` | Fresh folder is 0700 even with umask 000 (measured). The swap before `mkdtemp` is now refused (measured). A swap **after** the check at `:177` still stages into another account's 0777 folder (measured, injected). On Windows nothing changes (reasoned) |
| N12 | Info (new) | `ownStagingFolder` now required at `:177` | On Linux data folders on vfat, NTFS or CIFS mounts that report mode 0777, every install would now be refused (reasoned, not run) |
| chdir pin | — | Not done | I agree with not doing it. A simpler fix is given below |

## Findings, ranked

### N10-r1 (Low, regression): the new failure clean-up deletes through a link

**What changed.** At `:285` `a8c64af` called `removeStagingTree(stagingDir, 1)`. That function `lstat`s `stagingDir` itself, sees a link and stops. `a11bd45` replaces it at `:287-288` with this:

```js
if (stagedPath) { try { if (fs.lstatSync(stagedPath).isFile()) fs.unlinkSync(stagedPath); } catch {} }
```

`lstat` does not follow only the last part of the path. If `install-X` is now a link to V, `stagedPath` resolves to `V/<installer name>`. That is a regular file, so it is unlinked. There is no `dev`/`ino` check, and the folder is not checked.

**How the attacker makes the failure happen.**
1. After `ensureStagingFolder` returns (`:174-181`) and before the copy is opened with `wx` (`:267`), the attacker replaces `update-staging` with its own folder. In that folder, `install-X` is a link to V.
2. If V already holds a file with the installer's name, the `wx` open fails with EEXIST.
3. The clean-up then deletes that file.

The window is wide. It covers opening the installer, `stat`, `lstat` and `statfs` (`:229-253`), not a single gap between two calls.

**Measured.**

| Probe | `a11bd45` | `a8c64af` (control) |
|---|---|---|
| Injected R1: `install-X` → another folder V | `V/GII-GeM-ERP-Setup-1.0.0-x64.exe` **deleted** | kept |
| Injected R1b: `install-X` → the update folder | **the user's selected installer deleted** | kept |
| Real race (inotify on `install-*`, then `RENAME_EXCHANGE` of `update-staging`), immediate | **10 of 117** attempts, all through EEXIST | — |
| Same race, 0-2 ms jitter | **62 of 115** attempts: 32 through EEXIST (this finding), the rest through N11 | 27 of 115 (N11 only) |

`books.db` was never lost. Only the selected installer's name can be hit.

**Precondition.**
- Write access to the data folder, to swap `update-staging`.
- This is wider than N5-r3b's `removeStagedCopy` case, which needed write access to `update-staging` itself.
- On Windows (reasoned): a junction needs no special right, and there is no atomic exchange. Even so, a rename followed by creating a folder with a junction fits easily in a window that spans several milliseconds.

**Fix.**
- Restore what `a8c64af` guaranteed:
  - Have `ensureStagingFolder` return the `install-X` folder's `dev`/`ino` from the `lstat` at `:177`.
  - Before removing anything, require that `lstat(stagingDir)` is a real folder with that `dev`/`ino`.
  - Unlink `stagedPath` only if its `dev`/`ino` match the copy's own identity (see N11).
- Or simply go back to `removeStagingTree(stagingDir, 1)`. It lists one folder the app made, which is safe given the `lstat` on the folder itself.

### N11 (Low, pre-existing): the copy's identity is read by path after the copy

**The bug.** At `:283`, `stagedFile` comes from `fs.lstatSync(stagedPath)` after the copy, by path. If `install-X` is swapped for a link to V while the copy runs, the copy is written to the real folder, but the recorded `dev`/`ino`/`size` are V's file. Then:
1. The re-hash at launch (`main.js:1329`) opens V's file through the link. The identity matches, but the hash does not, so the launch is refused.
2. `removeStagedCopy` sees a file whose identity matches what was recorded and deletes it (`:107-108`).

**Measured.**
- Injected (`n11-a11bd45.log`): V's file was deleted, and the real copy stayed in the moved-aside folder. The result is identical on `a8c64af`.
- Real race: 27 of 115 attempts on `a8c64af`, and about 30 of 115 on `a11bd45`.

**Side effect.** If V's file has the same bytes as the copy, the hash matches. `openPath` then launches V's file instead of the staged copy. For example, V could be the update folder holding the selected installer. That bypasses the staging copy, which is S20 territory.

**Fix.** Take the identity from the file the app wrote:
- Open the copy with `fs.promises.open(stagedPath, "wx")`, `handle.stat()` it, and write through that handle (`handle.createWriteStream()`).
- Or `fstat` the write stream's `fd` on `open`.
- Also re-check the `install-X` `dev`/`ino` from N10-r1 before recording.

### N5-r3 (Low, narrowed): top-level links named `install-*`

**Fixed (measured).**
- The race from my last report, with 40 top-level links named `doc-K.txt` and the moved-aside folder exchanged with a link to V, deleted **nothing in 152 attempts** (`race-a11bd45-topnames.log`).
- 45 warnings were logged for the links that were left.
- The new test line in `ipc-security.test.mjs` covers this.

**Left (measured).**
- The attacker only has to name its links `install-doc-K.txt`. The same race then deleted `V/install-doc-K.txt` in **42 of 150 attempts**, and all 40 names were hit at least once (`race-a11bd45-topinstall.log`).
- `books.db` and any name not starting with `install-` were never touched.

**What can still be deleted outside the data folder.**
- Here: only a file or link whose name starts with `install-`.
- Through N5-r3b, N10-r1 and N11: only GII installer names.
- Nothing is read, written or walked outside the data folder.

**On the `chdir` pin: I agree it should not go in.**
- `process.chdir` is process-wide. The remover is synchronous, so no JavaScript runs in between. But async `fs` work already on the libuv thread pool, and anything Chromium or a native module does with a relative path, would resolve against the wrong folder for that moment.
- On Windows it does not pin the folder anyway (reasoned).
- The residual is small enough to remove more simply. **Do not unlink top-level links at all.** Leave them, count them, and keep the moved-aside folder. The app never creates a link in the staging folder, so any link there was planted. Leaving it costs nothing but a leftover `update-staging.old-*` folder.
- That removes the 42/150 case completely, because no top-level `unlink` runs any more.

**Residual without that fix.** 42 of 150 attempts (Linux, measured), limited to `install-*` names. On Windows the race is harder (no atomic exchange) but open (reasoned).

### N5-r3b (Low, unchanged)

- The code is unchanged.
- One level down (`:94-95`): 7 of 101 attempts lost one `GII-GeM-ERP-Setup-K.exe`.
- `removeStagedCopy` swap after the re-hash: 9 of 112 (measured). It was 34 of 152 on `a8c64af`, but the code did not change, so treat the difference as noise in this race.
- On Linux, `update-staging` is now 0700, so this needs the ERP's own account (or root, as in my runs).
- Fix as before: a Windows DACL on `update-staging`, owner only.

### N9-r2 (Info, narrowed)

**Measured (`new-a11bd45.log`).**
- `mkdir(expected, { mode: 0o700 })` gives 0700 for `update-staging` and its `install-*` folders, even with umask 000.
- The `a8c64af` case is now refused. That case: the in-place folder passes the first check, then is swapped for another account's 0777 folder before `mkdtemp`. The message is the "changed… Restart the ERP" text, and the new folder is removed.
- **Left:** if the swap comes after the check at `:177`, and the attacker pre-creates `install-X` in its own folder, the copy is staged in a folder owned by uid 1000 with mode 777. This leads back to S20-r3(a)/(b).

**Windows (reasoned).** `ownStagingFolder` returns true and `mode` is ignored, so N9 is unchanged there.

**Fix.** The folder identity check from N10-r1, repeated right before the `wx` open, narrows this to the same short gap as everything else. Windows needs the owner-only DACL.

### N12 (Info, new): the stricter check can block updates on some Linux mounts

- `:177` now requires `ownStagingFolder` even for a freshly made folder.
- If `GII_GEM_ERP_DATA_ROOT` is on a vfat, NTFS or CIFS mount that reports every file as owned by the user with mode 0777, every install would fail with "changed while the update was being prepared". The message would not point to the real cause.
- This is reasoned, not run, and the product is Windows-first.
- **Fix.** For a folder the app just created, compare `dev`/`ino` with the folder created at `:167` instead of checking the mode. Or word the refusal so it names the permissions.

## Probes and logs (`/tmp/claude-0/sec-probe/`)

| Probe | What it does | Logs |
|---|---|---|
| `race-a11bd45.mjs` with `racers-a11.py` | Modes `topnames`, `topinstall` (new), `subnames`, `copyswap` and `failswap` (new; `RACE_DELAY` sets the jitter). `PROBE_REPO` selects the worktree | `race-a11bd45-*.log`, `race-a11bd45-failswap-delay0.002-control-a8c64af.log` |
| `new-a11bd45.mjs` | Injected R1, R1b and R1c (N10-r1), N9d, N9e and umask | `new-a11bd45.log`, `new-a11bd45-control-a8c64af.log` |
| `n11-a11bd45.mjs` | Injected N11 on both commits | `n11-a11bd45.log` |
