# In-house security audit: 8d5dd67..7955315

- Scope: `7955315`. It answers `audit-8d5dd67-security.md`: S8-r1, S8-r2, S13, S12 and S6. It also changes the replay of reversed receipts in `supplierReturnSplit`.
- Checkout: scratch clone `/tmp/claude-0/sec-372` at `7955315`, using the `node_modules` copied there earlier. `/home/claude/gii-gem-erp` and `/home/claude/wt-prog` were only read.
- Tests: `npm run -s test:integrity` gives **247/247 pass** (220 + 27 IPC), exit 0, on Node v22.22.0. Log: `/tmp/claude-0/sec-probe/tests-7955315.log`.
- Probes ran through the real `updates:install` and `updates:status` handlers, with the Electron stub and a mocked `shell.openPath`.
  - To show what happens when an attacker wins a race, the probe ran the swap inside a wrapped `fs.promises.mkdir`, `fs.promises.rm` or `createReadStream`. The real time window was measured separately.
  - The probes ran on Linux. Windows-only behaviour is marked **reasoned, not measured**.
- Date: 2026-11-11 06:10 IST

## Summary

| # | Severity | Area | Status |
|---|----------|------|--------|
| S8-r1 | Info → **closed** (for the update-folder writer) | Swap after the check, before the OS opens the file | The copy in `runtimeDataRoot\update-staging` is what runs. At `openPath`, no file descriptor is open on the copy or on the source (measured). The audit `sha256` matched the bytes launched in **every one of the 14 launches** (measured), including a copy that mixed old and new bytes |
| **S16** | **Low (new; partly a regression)** | Check-to-open gap before staging | `assertInstallerInsideUpdateFolder` runs, then three `await`s, then `createReadStream(path)` opens the file **by path**. Measured: a **symlink to an outside EXE**, a **hard link to an outside EXE**, and a **symlink put in place of the real update folder** were all swapped in during that gap, and all were copied and launched. At 8d5dd67 the first two were refused. The gap is 0.65-4 ms, or 15.7 ms when an earlier 300 MB copy has to be deleted first |
| **S17** | **Low (new)** | Size cap and disk full | The 1 GB cap checks the size by path **before** the open. Measured: a 7-byte file that grew to 1.5 GiB after the check was copied in full: 1.5 GiB written to disk, then launched. When the copy fails, the partial file **stays**. Measured on a 300 MB data disk: 295 MB was left, the disk was at 100%, and a database write then failed with **`SQLITE_FULL`** until the next install. A successful copy (up to 1 GB) is never removed |
| **S18** | **Low (new; reasoned, Windows only)** | Mark-of-the-Web dropped | A stream copy does not carry the `Zone.Identifier` stream. A browser-downloaded installer that used to trigger the SmartScreen / "unknown publisher" prompt is now launched from a copy without that mark |
| S8-r2 | Low (residual) | Hard links; no signature check | Unchanged. A hard link already in place still installs. There is still no Authenticode or publisher check |
| S13 | Low → **fixed** | Blocking hash | 1 GiB: the handler takes 2.0 s, the event loop never stalls more than **14 ms**, and peak RSS is **+32 MB**. At 8d5dd67 it was a 1,373 ms stall and +1 GB. A file over 1 GiB is refused in 1-2 ms with a guided message |
| S19 | Info (new) | Two installs at once | Nothing stops a second install while one is running. Measured: (a) the second install deletes the first one's copy mid-copy, and the first then launches a path that no longer exists; (b) raw `ENOTEMPTY` / `EEXIST` errors |
| S20 | Info (new) | Staging-folder link tricks | Needs write access to `runtimeDataRoot`, which by default only that user can write (see the Windows section). A link planted between the `rm` and the `mkdir` is followed. Every other case is handled safely (measured) |
| S12 | Info, mostly fixed | Guided errors | The update-folder message is now generic: fixed. New raw errors come from staging: `EISDIR`, `ENOENT`, `ENOSPC`, `EEXIST`, `ENOTEMPTY`. Each failed copy leaves a 0-byte or partial file behind |
| S6-r | **fixed** | `node_modules` guard | The regex now has the `i` flag (`audit2-regressions.test.mjs:1160`). There is still no CI workflow (`.github/workflows` does not exist) |
| `latest.json` file | **fixed** | `findLatestUpdateInstaller` | `lstatSync(...).isFile()` (`main.js:466-467`) treats a link or a folder that has the `latest.json` name as missing |
| SQL | none | `supplierReturnSplit` | The new `reversal_sl_id` subquery and the new `ORDER BY` have no `${}`. The only interpolation is still the constant `billVoucher`, and every value is bound with `?` |
| IPC/preload | none | — | No renames. `src/preload/` has no diff. No `handle(`, `guarded(`, `sessionGuarded(`, `ipcMain`, `contextBridge` or `invoke(` line changed in `src/`. The only `src/renderer` change is a line number in `voucher-accounting-graph.json`. `ipc-security.test.mjs` only adds 2 tests |

## Findings

### S8-r1: closed for the update-folder writer

**Where**
- `main.js:565-583`: `stageInstaller`.
- `:1316`: stages the installer before the backup.
- `:1319`: `shell.openPath(staged.stagedPath)`.
- `:1320`: the audit row records `sha256: staged.sha256`.

**Measured** (`ipc-probe-7955315.log`)
- Hashing in the `'data'` handler sees exactly the bytes that `pipeline` writes. Across 14 launches, the `sha256` in the audit row always equalled the sha256 of the launched file. Those 14 were:
  - 1 control
  - 5 swaps (S16)
  - 1 FIFO
  - 1 grow after the size check
  - 3 changes made while copying
  - 3 links planted in the staging folder (S20)
- Source changed while it was being copied:

| Change after the first 64 KiB chunk | Launched copy | Audit hash = launched? |
|---|---|---|
| Overwritten in place, 1 MiB at offset 6 MiB | **A mix**: 7 MiB of old bytes and 1 MiB of new bytes | yes |
| Another file renamed over the path | Only the old bytes: the open descriptor keeps the old file | yes |
| Truncated to 100,000 bytes | A short copy of 100,000 bytes | yes |

- A mixed or short copy can therefore be launched. The hash describes it accurately, but nothing compares it with any expected value. The writer can make it no worse than they could already do by dropping any installer (S8-r2). A truncated legitimate installer would fail its own integrity check (NSIS CRC).
- At `openPath`, 0 file descriptors were open on the staged copy or on the source, so `pipeline` had closed the write stream.
- Someone who writes only to the update folder can no longer change what runs after the copy is made.

### S16 (Low): swap between the path check and the read open

**Where**
- `main.js:1305`: `assertInstallerInsideUpdateFolder` is synchronous. It runs `realpathSync` and `lstat`.
- `:1316`: then `stageInstaller`:
  - `:570`: `await fs.promises.stat`.
  - `:575`: `await rm`.
  - `:576`: `await mkdir`.
  - `:579`: `fs.createReadStream(installerPath)` opens the path, follows links, and does not re-check anything.
- The second check that 8d5dd67 ran after the backup was removed together with `installerFingerprint`.

**Measured.** The JS window from the last `realpathSync` to `createReadStream` was:
- 3.99, 1.15, 0.86, 0.77 and 0.65 ms over 5 samples;
- **15.7 ms** when the earlier staged copy (300 MB) had to be deleted first.

The opening of the file itself happens later still, on the libuv threadpool. These are the results with a swap injected in that window:

| Swap after the check | 8d5dd67 | 7955315 |
|---|---|---|
| Control | launched | launched (`MZgood!`) |
| **Plain file replaced by a symlink to an outside EXE** | refused | **launched `MZevil`** |
| **Plain file replaced by a hard link to an outside EXE** | refused | **launched `MZevil`** |
| Another file renamed over the path | refused | launched `MZrenamed` (same as dropping a file) |
| **Real update folder renamed, symlink to an outside folder put in its place** | refused | **launched `MZevilfolder2`** |
| Update-folder link re-pointed | refused | the original file was launched, because the real path was already resolved |
| Replaced by a directory, or deleted | refused | refused, with a raw `EISDIR` / `ENOENT` and a 0-byte copy left behind |
| Replaced by a FIFO; the writer writes after 1.5 s (Linux only) | — | the install **waited 1.5 s** and then launched the FIFO's bytes. The loop stalled at most 14 ms |

**Exploit path**
1. The writer to the update folder watches for the click, for example with a directory watcher or by polling `update-staging`.
2. They swap the file, or the folder itself, in the window of 1-16 ms.
3. On Windows, holding an oplock on the installer (taken when the `stat` at `:570` opens it) can make the timing deterministic. **Not tested.**
4. The result breaks the rule "only a regular file directly inside the update folder runs": content from anywhere the attacker can read is launched.

The same writer can already drop a newer `Setup-*.exe` (S8-r2). So this mainly re-opens the swap and link checks that 8d5dd67 had closed. The audit hash does record what really ran.

**Fix.** Open once, then check the open handle:
- Right after the path check, with no `await` in between, call `fs.openSync(realInstaller, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0))`.
- Run `fstatSync(fd)` and require all of the following:
  - `isFile()`;
  - `nlink === 1`, which also covers the hard-link half of S8-r2;
  - `dev`/`ino` equal to an `lstatSync(realInstaller)` taken **after** the open;
  - `size <= MAX`.
- Stream from the handle with `fs.createReadStream(null, { fd, start: 0 })`.

That also fixes the size-cap gap in S17 and the FIFO case.

### S17 (Low): size cap bypass, a partial copy left on failure, a copy that is never removed

**Where**
- `main.js:570-573`: the cap is checked on the path's `stat` before the open.
- `:581`: `pipeline` has no limit on bytes, and the error path has no `try/catch` to clean up.
- Nothing deletes `update-staging` after a launch.

**Measured**
- **Grow after the check.** A 7-byte installer was extended with `truncate` to 1.5 GiB right after the `stat`. The install copied all **1.50 GiB**, and the copy used 1.50 GiB of real disk because the stream copy fills in a sparse source. It was then launched.
- **Disk full** (`full-7955315.log`). The data root was on a 300 MB tmpfs and the installer was 400 MB:
  - The install failed with the raw text `ENOSPC: no space left on device, write`.
  - It launched nothing and made no backup. That part fails closed.
  - **295 MB stayed in `update-staging`, and the data disk was at 300/300 MB.**
  - A login still worked. A **4 MB database write failed with `SQLITE_FULL`**.
  - The next successful install of a small file deleted the leftover, and usage went back to 5 MB.
- **A successful copy stays.** On a real machine, an installer of up to 1 GB stays under `%APPDATA%\GII GeM ERP\update-staging` until the next install. `%APPDATA%` is the **Roaming** profile. On a domain PC with roaming profiles, that file is synced at logoff, which can exceed profile quotas. **Reasoned, not measured.**

**Exploit path.** The update-folder writer drops a large or growing `Setup-*.exe`. When an admin clicks Install, the data disk, which holds the ERP database, fills up. Postings then fail with `SQLITE_FULL` until someone runs another install or deletes the folder by hand. This is availability only.

**Fix**
- Check `fstat` on the open handle (S16).
- Count bytes in the `'data'` handler and `destroy()` the reader once the count passes `MAX_INSTALLER_BYTES`.
- Before copying, check free space with `fs.promises.statfs(runtimeDataRoot)` against size + 10%.
- Wrap the pipeline in `try { ... } catch (e) { await fs.promises.rm(stagedPath, { force: true }); throw guided(e); }`.
- Clear `update-staging` at startup.
- Consider `app.getPath("temp")` or `%LOCALAPPDATA%`, both of which do not roam, for the staging folder.

### S18 (Low, reasoned, Windows only): the staged copy loses Mark-of-the-Web

**Where.** `main.js:579-581`: a byte-stream copy writes only the main data stream.

**Effect**
- A browser marks a downloaded `GII-GeM-ERP-Setup-*.exe` with `:Zone.Identifier` (ZoneId=3).
- Before this commit, `shell.openPath` on the downloaded file went through `ShellExecuteEx`. For a file marked as from the internet, the Attachment Manager and SmartScreen show an "unknown publisher / Windows protected your PC" prompt. That prompt was the only check on the publisher.
- The copy in `update-staging` has no mark, so it now starts with no prompt.
- `package.json` sets `perMachine: false`, so there is no UAC prompt either.
- So a planted unsigned installer (S8-r2) now runs with **no warning at all**.

**Not measured.** This sandbox runs Linux.

**Fix**
- Best: verify the Authenticode signer on the staged copy (the open S8-r2 fix).
- Interim: copy the source's `Zone.Identifier` stream onto the copy. Read `${src}:Zone.Identifier` if it exists and write it to `${staged}:Zone.Identifier`. The `:` name check only applies to the user-supplied name, so this does not conflict with it.

### S8-r2 (Low, residual): unchanged

- Measured: a hard link to an outside file that is swapped in is launched (S16). A hard link already in place behaves the same as at 8d5dd67.
- Nothing checks a signature or publisher.
- The `nlink === 1` check in the S16 fix would refuse hard links.

### S13: fixed

Measured with `big-7955315.log`, Linux, warm page cache. "Max loop gap" is the longest gap a 1 ms `setInterval` saw.

| Installer | Handler | Max loop gap | Peak RSS | Result |
|---|---|---|---|---|
| 300 MB, random data | 736 ms | 5 ms | 137 MB (start 114 MB) | launched |
| 1 GiB exactly, random data | 2,040 ms | 14 ms | 123 MB | launched |
| 1 GiB exactly, sparse | 1,875 ms | 8 ms | 125 MB | launched |
| 1 GiB + 1 byte | 2 ms | 2 ms | — | refused: "This installer is 1024 MB, larger than … (1 GB at most)" |
| 4 GiB, sparse | 1 ms | — | — | refused, with the guided message |
| `updates:status` with a 4 GiB file present | 0.1 ms | — | — | offers it; it never reads the file |

- Cosmetic: at 1 GiB + 1 byte the message says "1024 MB, larger than … 1 GB". `Math.ceil` would read better.
- The cap is still checked before the open (S17).

### S19 (Info): two installs at once

`updates:install` has no flag to show an install is already running. Each call runs `rm` on the shared `update-staging` folder. A second admin window can call it at the same time; the single-instance lock at `main.js:179` only stops a second process.

Measured:

| Case | Result |
|---|---|
| The same installer twice, at the same moment | The first is launched. The second fails with a raw `EEXIST` before `openPath`, so it launches nothing |
| Two different installers at the same moment | One is launched. The other fails with a raw `ENOTEMPTY … rmdir update-staging` |
| A second install starts while the first is copying (64 KB done) | The second deletes the folder, writes its copy and launches it. **The first then launches a path that no longer exists** (`exists:false`). On Windows, `openPath` would return "file not found" **after** a backup was already made |

**Fix.** Keep a module-level `installing` flag and refuse a second call with a guided message. Give each install its own folder: `fs.promises.mkdtemp(path.join(runtimeDataRoot, "update-staging", "i-"))`.

### S20 (Info): link tricks in the staging folder

Each of these needs write access to `runtimeDataRoot`.

| Case | Result |
|---|---|
| `update-staging` already exists as a link to another folder | `rm` removes **the link only**. The target's files survive, and a real folder is created. Safe |
| A link with the staged name already inside `update-staging` | Deleted along with the folder. The link's target is unchanged. Safe |
| A link with the staged name planted between `mkdir` and the open | `wx` refuses it with `EEXIST`. Nothing is launched and the link's target is unchanged. Safe |
| `update-staging` replaced by a link to another folder between `rm` and `mkdir` | **Followed.** The copy is written into the attacker's folder and launched from there (the launched path's `realpath` is inside that folder) |

Anyone who can win the last race can also rewrite the database in the same root. So this adds nothing on Windows with the default root.

**Fix.** Create the folder with `mkdtemp`, then `lstat` it and require `isDirectory() && !isSymbolicLink()` before writing.

### Is the staging folder safe on Windows?

Reasoned, not measured.
- **Default root.** `runtimeDataRoot` is `configuredDataRoot()` (`main.js:232-237`). When the app is packaged, that is `app.getPath("userData")`, which is `%APPDATA%\GII GeM ERP`.
  - The profile's inherited ACL grants full control to that user, SYSTEM and Administrators only. Other standard users cannot read or write it.
  - So the staging folder is a real step up from the update folder (`Documents\GII GeM ERP Updates`, or `GII_GEM_ERP_UPDATE_DIR`, which may be a share).
  - The installer no longer runs from a folder others can write to. That also removes **DLL planting next to the installer**, which was a risk in the update folder.
- Any process running as the **same user** can still change the copy between the end of `pipeline` and `ShellExecute`. That process could just as well change the database or the installed program in `%LOCALAPPDATA%\Programs` (`perMachine: false`), so this is not a new boundary.
- **Override.** If `GII_GEM_ERP_DATA_ROOT` points to a folder made under `C:\` (for example `C:\ERPData`), that folder inherits `Authenticated Users: Modify`. Every local user can then write the staging folder, and all of S16, S17 and S20 apply to them. So can the database. Document that the override folder must be ACL'd to the ERP user, or check the ACL at startup.

### S12 (Info): new raw errors from staging

- Measured raw error texts:
  - `EISDIR: illegal operation on a directory, read`
  - `ENOENT: … open '<path>'`
  - `ENOSPC: no space left on device, write`
  - `EEXIST: file already exists, open '…\update-staging\…'`
  - `ENOTEMPTY: directory not empty, rmdir '…'`
- Each one shows the user's profile path, but only to the user who is signed in.
- After `EISDIR` or `ENOENT`, a 0-byte staged file is left. The `wx` write stream had already created it.
- **Fix:** catch these errors in `stageInstaller`, remove the copy, and return a message such as "The installer could not be copied (…). Check free space and the update folder, then try again."

### SQL review: `inventoryService.js:376-466`

- The `lots` query adds `si.posting_status` and a `reversal_sl_id` correlated subquery. Both are literal SQL with constants only.
- The `WHERE` now has `posting_status IN ('Posted', 'Reversed')`.
- `earlierReturns` gains `ORDER BY sr.id`.
- `${billVoucher}` (a constant) is still the only interpolation. All values are still bound through `?`.
- `reversedAt` and `drop` are only compared as numbers in JS.
- No injection surface.

## Probe files

- `/tmp/claude-0/sec-probe/ipc-probe-7955315.mjs` (log `ipc-probe-7955315.log`). Run it from the clone with `node --import ./scripts/audit/lib/electron-register.mjs`. It covers:
  - the check-to-open window
  - 8 swap kinds and the FIFO case
  - growth past the size cap
  - changes while copying
  - open file descriptors at `openPath`
  - 4 staging-folder link cases
  - 3 concurrency cases
- `/tmp/claude-0/sec-probe/full-7955315.mjs` (log `full-7955315.log`): disk full. It needs a 300 MB tmpfs mounted at `/tmp/claude-0/sec-probe/tmpfs-root`; it is unmounted now.
- `/tmp/claude-0/sec-probe/big-7955315.mjs` (log `big-7955315.log`; run it with `--expose-gc` too): 300 MB, 1 GiB, 1 GiB + 1 byte, 4 GiB, and `updates:status`.
- `/tmp/claude-0/sec-probe/tests-7955315.log`: the `test:integrity` run.
