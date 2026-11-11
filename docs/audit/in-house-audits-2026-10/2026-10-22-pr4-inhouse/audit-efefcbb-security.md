# In-house security audit: 7955315..efefcbb

- Scope: `efefcbb`. It answers `audit-7955315-security.md`: S16, S17, S18, S19, S20, S8-r2 and S12. Also reviewed: the `supplierReturnSplit` change in `inventoryService.js`.
- Checkout: scratch clone `/tmp/claude-0/sec-372` at `efefcbb`. `/home/claude/gii-gem-erp` and `/home/claude/wt-prog` were only read.
- Tests: `npm run -s test:integrity` gives **249/249 pass** (221 + 28 IPC), exit 0, on Node v22.22.0. Log: `/tmp/claude-0/sec-probe/tests-efefcbb.log`.
- Probes ran through the real `updates:install` handler, with the Electron stub and a mocked `shell.openPath`.
  - To show what happens when an attacker wins a race, a swap was injected at the exact point: inside a wrapped `fs.statSync` (window A), `fs.promises.open` (window B), `FileHandle.stat` or the read stream.
  - One race was also run **for real**, from a second process, with no injection.
  - The probes ran on Linux. Windows-only behaviour is marked **reasoned, not measured**.
- Date: 2026-11-11 06:35 IST

## Summary

| # | Severity | Area | Status |
|---|----------|------|--------|
| **S16-r1** | **Low (residual, narrowed)** | Swap between the path check and the open | The **statSync-to-open** window (0.05–0.42 ms) is closed: all 6 swaps were refused there. But `pathStats` comes from `fs.statSync`, which **follows links**, so a swap in the **lstat-to-statSync** window (3–10 µs) is not detected. Measured: a symlink to an outside EXE swapped in there was **launched**. A real race from a second process **won 116 of 16,800 attempts (0.69%)** in 90 s |
| S17 | Low → **fixed**; Info residue | Size cap, disk full, leftovers | Growth past 1 GB is stopped at the cap. Growing or shrinking during the copy is refused. A 400 MB installer on a 300 MB disk is refused before copying. Every failure leaves `update-staging` empty. Residue: a file that grows after the free-space check can **briefly** fill the disk (peak 300/300 MB) before cleanup |
| S18 | Low → **addressed (reasoned)** | Mark-of-the-Web | `Zone.Identifier` is copied on win32. Any failure is silently ignored (fail-open), and this has not been tried on Windows |
| **S19-r1** | **Info** | Two installs at once | Two simultaneous calls: the second is refused (measured). But the flag is released when staging ends, **not when the handler ends**. A second install started during the first one's backup (150–200 ms here) launches **a second installer and makes a second backup**. If the backup is slower, the first fails with "file not found" **after its backup was made** |
| S20 | Info (unchanged) | Link planted between `rm` and `mkdir` | Still followed: the copy is written into the attacker's folder and launched from there. The startup clear (`rmSync`) removes a symlinked `update-staging` link only (safe) |
| S21 | Info (new; Linux/macOS only) | FIFO | A FIFO swapped in with no writer **blocks `open` indefinitely**. The in-flight flag stays set, so **every later install is refused** ("already being prepared") until restart. Not reachable on Windows |
| S12-r1 | Info | Error mapping | Raw errno codes are now mapped. But the pass-through regex matches `installer` anywhere in the message, so a raw `ENOENT … open '<full path>'` still gets through when the path contains "installer" (measured). Refused tamper attempts leave **no audit row** |
| S8-r2 | Low (residual) | Hard links; no signature check | Hard links are **fixed**: `nlink !== 1` is refused, for a file already in place (new IPC test) and for one swapped in (measured). There is still no Authenticode or publisher check |
| SQL | none | `inventoryService.js:380` | The `CASE WHEN si.posting_status = 'Reversed'` wrapper is literal SQL. The `gone` flag is JS only. No new interpolation |
| IPC/preload | none | — | No renames. `src/preload/` has no diff. No `handle(`, `guarded(`, `sessionGuarded(`, `ipcMain`, `contextBridge` or `invoke(` line changed in `src/`. The only `src/renderer` change is `voucher-accounting-graph.json` (line numbers). `ipc-security.test.mjs` only adds the hard-link test |

## Findings

### S16-r1 (Low, residual): the identity is taken with `stat`, not `lstat`

**Where**
- `main.js:589`: `assertInstallerInsideUpdateFolder` runs `realpathSync`, then `lstatSync(realInstaller).isFile()` at `:560`.
- `:590`: `const pathStats = fs.statSync(checked)` follows symlinks.
- `:591`: `fs.promises.open(checked, "r")` follows symlinks (no `O_NOFOLLOW`).
- `:593`: the handle's `dev`/`ino` are compared with `pathStats`.

A swap after `:560` and before `:590` makes `statSync` and `open` both resolve to the attacker's target. Their identities match, `nlink` is 1 and `isFile()` is true, so the copy goes ahead.

**Measured window** (`ipc-probe-efefcbb.log`, 8 samples):
- lstat → statSync: **3–10 µs**
- lstat → `open()` call: 8–122 µs
- lstat → open resolved: 0.05–0.42 ms

**Injected swaps**

| Swap | Window A: after `lstat`, before `statSync` | Window B: after `statSync`, before `open` |
|---|---|---|
| Control | launched `MZgood!` | launched `MZgood!` |
| **Plain file replaced by a symlink to an outside EXE** | **launched `MZevil`** | refused ("changed or is linked") |
| Plain file replaced by a hard link | refused (`nlink`) | refused |
| Another file renamed over the path | launched `MZrenamed` (same as dropping a file) | refused |
| Replaced by a directory | refused | refused |
| Deleted | refused, mapped `ENOENT` | refused, mapped `ENOENT` |
| Real update folder renamed, symlink to an outside folder in place | **launched `MZevilfolder`** | refused |

In every launch, the audit `sha256` equalled the sha256 of the launched bytes. After every refusal, `update-staging` was empty.

**Real race, no injection** (`race-efefcbb.mjs`, log `race-efefcbb.log`). A Python process swapped `GII-GeM-ERP-Setup-99.0.0-x64.exe` with a symlink to `/tmp/…/evil.exe` in a loop, using `renameat2(RENAME_EXCHANGE)`. The handler was called repeatedly for 90 s:

| Outcome | Count |
|---|---|
| Attempts | 16,800 |
| **Launched `MZevil`** | **116 (0.69%)** |
| Launched the good file | 740 |
| Refused by the new handle check | 296 |
| Refused by the path checks | 15,648 |

**Exploit path**
1. A writer to the update folder keeps swapping the installer with a symlink to any file they can read.
2. Each Install click has about a 0.7% chance of launching the link target. Most clicks fail with a message, so an admin is likely to retry.
3. On Windows, creating a file symlink needs Developer Mode or admin rights. The folder variant can use a **junction**, which needs no privilege, but it needs write access to the update folder's **parent**. Someone with that access can relocate the update folder before the click anyway. **Reasoned, not measured.**

**Impact.** This is the same party and the same outcome as S8-r2: the update-folder writer can already drop any `Setup-*.exe`. It breaks the rule "only a regular file directly inside the update folder runs", and it disproves the code comment at `:587-588`. The audit hash still records what really ran.

**Fix.** Take the reference identity **after** the open and **without following links**:
- Open with `fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0)`. `O_NONBLOCK` also covers S21.
- Then run `assertInstallerInsideUpdateFolder` again, and compare `fs.lstatSync(checked, { bigint: true })` with `handle.stat({ bigint: true })` on `dev`, `ino`, `isFile()` and `nlink === 1n`.
- A swap before the open then gives a different `ino`. A swap that is put back before the re-check gives an `ino` that does not match the handle.
- Use `bigint: true`. On NTFS, 64-bit file IDs above 2^53 lose their low bits as a JS `Number`, so two files in one MFT block can compare equal. **Reasoned.**

### S17: fixed; Info residue

**Measured** (`ipc-probe-efefcbb.log`, `full-efefcbb.log`)

| Case | Result | Staging after |
|---|---|---|
| 7 bytes at `handle.stat`, then grows to 1.5 GiB (sparse) | refused at the cap ("grew while it was being copied"), 2.5 s, peak copy 1,024 MiB | empty |
| 8 MiB file grows by 10 bytes after the first chunk | refused ("changed size") | empty |
| 8 MiB file grows to 1.5 GiB after the first chunk | refused at the cap, peak copy 1,023 MiB | empty |
| 8 MiB file shrinks to 100,000 bytes | refused ("changed size") | empty |
| 1 MiB overwritten in place at 6 MiB (same size) | **launched a mix** (7 MiB old, 1 MiB new); audit hash = launched | copy kept |
| Another file renamed over the path during the copy | launched the original bytes (the handle keeps the old file) | copy kept |
| 400 MB installer, 300 MB data disk | refused **before copying** ("not enough free disk space next to the books"); no backup, 5 MB used | empty |
| 200 MB installer, 300 MB data disk | launched; 205 MB used | 200 MB kept |
| 7 bytes at the free-space check, then grows to 400 MB | refused with mapped `ENOSPC`; **peak 300/300 MB**, then 5 MB used; a 4 MB DB write afterwards was OK | empty |

**Residue (Info)**
- **Brief disk full.** The free-space check (`:600`) uses the size at the time of the open. A file that grows afterwards can fill the data disk until the copy fails and is removed, which takes milliseconds to seconds. A database write in that window could fail with `SQLITE_FULL`. It then recovers on its own.
- **Copy kept after a launch.** A successful copy (up to 1 GB) stays until the next app start (`clearInstallerStaging`, `:265`). On Windows, if the NSIS installer is still running when it starts the new app, `rmSync` of a running EXE fails and is ignored, so the copy can stay until a later start. The folder is still under Roaming `%APPDATA%`. **Reasoned.**
- **Mixed copy.** Same-size overwrites are unchanged from S8-r1. The hash records the mix, and nothing compares it with an expected value.

**Fix (optional)**
- Abort when `copied` passes `stats.size`, not only `MAX_INSTALLER_BYTES`. A file that grows is refused anyway, so stopping at its original size caps the disk peak at that size.
- Stage under `%LOCALAPPDATA%` or `app.getPath("temp")`.

### S18: addressed, reasoned, not measured

- `:616-619`: on win32, `fs.copyFileSync(\`${checked}:Zone.Identifier\`, \`${stagedPath}:Zone.Identifier\`)`. libuv uses `CopyFileW`, which accepts named-stream paths.
- The `catch {}` is fail-open: if the copy of the mark fails for any reason (AV lock, a share without ADS, FAT/exFAT), the installer runs with no mark and no trace.
- The update-folder writer controls the source mark. They could always drop an unmarked file, so this is no worse than before.

**Fix.** Add a Windows CI or manual check that `Get-Content -Stream Zone.Identifier` on the staged copy matches the source. The lasting fix is still the Authenticode signer check (S8-r2).

### S19-r1 (Info): the in-flight flag is released before the backup and the launch

**Where**
- `:627`: `installerStaging = false` in `stageInstaller`'s `finally`.
- `:1364`: `createLiveBackup`.
- `:1365`: `shell.openPath(staged.stagedPath)`.
- `:1371-1375`: quit after 1.5 s.

**Measured** (`ipc-probe-efefcbb.log`, `conc-efefcbb.log`)

| Case | Result |
|---|---|
| Same installer twice, at the same moment | the first launched; the second refused: "An update is already being prepared" |
| Two different installers, at the same moment | the first launched; the second refused (guided) |
| Second install (another window, another installer) started when the first install's backup begins | **both launched, 2 backups, 2 `update_installer_launched` audit rows** |
| Same, but the first launch held until the second settles (stands for a backup slower than the second copy) | first: **"The file could not be found." after its backup was made** (audited `update_installer_failed`); second: launched |

The staging-to-`openPath` window was **150–200 ms** with the probe database. It grows with database size.

**Effect.** Two installers can run at once. Or the first admin's install fails after a backup, while the second admin's installer runs. On Windows, the second install's `rm` would fail with `EBUSY` if the first EXE were already running; that is mapped and refused. Availability and confusion only.

**Fix**
- Set the flag at the top of the `updates:install` handler, and release it only on failure.
- After a successful `openPath`, keep refusing: the app is quitting.

### S20 (Info, unchanged): link planted between `rm` and `mkdir`

**Where.** `:585-586`: `mkdir(…, { recursive: true })` accepts an existing symlink to a directory.

**Measured**
- A symlink planted between `rm` and `mkdir`: the copy was written into the attacker's folder and launched there (`realpath` is inside it).
- A symlink with the staged name planted after `mkdir`: refused with a mapped `EEXIST`. The link's target was unchanged.
- At startup, `fs.rmSync` on a symlinked `update-staging` removed the link only. The target's files survived.

This needs write access to `runtimeDataRoot`, which by default only that user has. The same access can rewrite the database.

**Fix.** Use `fs.promises.mkdtemp(path.join(runtimeDataRoot, "update-staging-"))`. Then `lstat` it and require `isDirectory() && !isSymbolicLink()`.

### S21 (Info, new; Linux/macOS only): FIFO blocks the install and locks out later installs

**Where.** `:591`: `fs.promises.open(checked, "r")` without `O_NONBLOCK`. The `isFile()` check runs only after the open returns.

**Measured** (`ipc-probe-efefcbb.log`)
- **FIFO swapped in, with a writer after 1.5 s** (window A or B): the handler waits 1.5 s, then refuses ("changed or is linked"). The fix for S16 (`:593`) catches it.
- **FIFO swapped in, with no writer:**
  - After 3 s the install had not settled.
  - A later install of a good file was refused: "An update is already being prepared".
  - Only when a writer appeared did the first install settle (refused). The later install then worked.
  - One libuv threadpool thread stays blocked while this lasts.

**Windows.** Named pipes live in `\\.\pipe\` and cannot be put in a folder, so this does not apply to the shipped app. **Reasoned.**

**Fix.** Add `O_NONBLOCK` to the open flags (see S16-r1).

### S12-r1 (Info): the pass-through regex and refusals that leave no trace

**Where.** `:623`: `if (error.guided || /not started|already being prepared|update folder|installer/.test(error.message)) throw error;`

**Measured**

| Case | Message shown |
|---|---|
| Deleted between `statSync` and `open`, default-like folder name | `The update could not be prepared (ENOENT). Check free disk space and the update folder, then try again. Nothing was installed.` (mapped) |
| Same, with an update folder named `…-installers` | raw `ENOENT: no such file or directory, open '/tmp/gii-upd7-…-installers/GII-GeM-ERP-Setup-95.0.0-x64.exe'` |
| Symlink planted after `mkdir` | `… (EEXIST) …` (mapped) |
| Disk full | `… (ENOSPC) …` (mapped) |

- A raw errno message shows up only when the path (the update folder, or the profile, via `GII_GEM_ERP_UPDATE_DIR`) contains the lowercase text "installer" or "update folder".
- The leak is the user's own path, shown to the signed-in admin. Nothing that matters is hidden: the errno code is kept in the mapped text.
- **Refused attempts leave no trace.** "The installer changed or is linked to another file" (an actual tamper signal) and the S16/S21 refusals produce **no `audit_log` row**. Only `openPath` results are audited (`:1366`).

**Fix**
- Tag the guided errors `{ guided: true }`, as the free-space error already does, and pass through only `error.guided`.
- Write an `update_installer_refused` audit row with the reason and the installer name.

### S8-r2 (Low, residual)

- **Hard links: fixed.**
  - A hard link already in place is refused. This is the new IPC test `ipc-security.test.mjs:528`, and it passes.
  - A hard link swapped in, in window A or B, is refused (measured).
  - The trade-off: a real installer that happens to have a second link is refused with a clear message.
- Still no Authenticode or publisher check. S18 now keeps the SmartScreen prompt on Windows, if the mark copy works.

## Other checks

- **File descriptors.** The descriptor count went 29 → 31 over the whole probe run (about 70 install calls, including refusals, aborts at the cap and the FIFO case). There is no per-install growth. The `finally` at `:626` closes the handle in every path that was tried.
- **SQL.** `inventoryService.js:380` wraps the existing subquery in `CASE WHEN si.posting_status = 'Reversed' THEN … END`, which is literal SQL. At `:461-464` the `gone` flag is a JS-only boolean. `${billVoucher}` is still the only interpolation, and all values are bound.

## Probe files

- `/tmp/claude-0/sec-probe/ipc-probe-efefcbb.mjs` (log `ipc-probe-efefcbb.log`). It covers:
  - window timing
  - 7 swap kinds in windows A and B
  - FIFO, with and without a writer
  - 6 size and content changes
  - 2 staging-folder link cases
  - 3 concurrency cases
  - error mapping
  - descriptor count
- `/tmp/claude-0/sec-probe/race-efefcbb.mjs` + `flip.py` (log `race-efefcbb.log`): the real cross-process race, 90 s.
- `/tmp/claude-0/sec-probe/conc-efefcbb.mjs` (log `conc-efefcbb.log`): a second install during the first install's backup. Run it plain, or with the `slowbackup` argument.
- `/tmp/claude-0/sec-probe/full-efefcbb.mjs` (log `full-efefcbb.log`): disk full. It needs a 300 MB tmpfs mounted at `/tmp/claude-0/sec-probe/tmpfs-root`; it is unmounted now.
- `/tmp/claude-0/sec-probe/tests-efefcbb.log`: the `test:integrity` run.
- Run each probe from the clone with `node --import ./scripts/audit/lib/electron-register.mjs <probe>`.
