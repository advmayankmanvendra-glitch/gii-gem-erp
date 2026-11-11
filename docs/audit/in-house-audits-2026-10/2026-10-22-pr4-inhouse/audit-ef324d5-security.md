# In-house security audit: 32263ab..ef324d5

- Scope: `ef324d5`. It answers `audit-32263ab-security.md`: N1, S20-r2, R1, N2 and N3. The staging code moved from `main.js` to `src/main/services/updateInstaller.js`. Also looked at: the `reportBuilders.js` text change (wording only, no security effect) and the new tests in `ipc-security.test.mjs`.
- Checkout: a throwaway worktree, `/tmp/claude-0/sec-ef3` at `ef324d5`. It was removed at the end. `/home/claude/gii-gem-erp` was only read. Nothing was committed or pushed, and no package was installed.
- Tests: `npm run -s test:integrity` gives **257/257 pass** (222 + 35 IPC), exit 0, on Node v22.22.0. Log: `/tmp/claude-0/sec-probe/tests-ef324d5.log`.
- Probes ran through the real `updates:install` handler, with the Electron stub and a mocked `shell.openPath`. The mock reads the file it is given, so "OPENED" below means `openPath` received those bytes.
- Every probe ran on Linux (root, ext4). Windows behaviour is marked **reasoned, not measured**.
- Date: 2026-11-11 07:52 IST

**Two things happened during the audit:**
- **The shared `node_modules` changed.** At about 07:44 IST, `better-sqlite3` in `/home/claude/gii-gem-erp/node_modules` was rebuilt for Electron (ABI 136) by another process, so plain Node could no longer load it. I did not rebuild it. I pointed the worktree at an existing copy built for Node: `/tmp/claude-0/sec-372/node_modules`, the same version, 12.10.0. Anyone running `test:integrity` from the main checkout will now hit the ABI error until `npm run rebuild:node` is run.
- **My race probes filled the root disk for a few minutes.** Each install attempt takes a live backup. I deleted my probe folders, the disk went back to 64%, and the race scripts now prune backups as they run. If another job failed with ENOSPC around 07:45–07:47 IST, this is why.

## Summary

| # | Severity | Area | Status |
|---|----------|------|--------|
| **N5** | **Low (new)** | The new "clear old copies" loop | It deletes through a swapped link. **If `update-staging` is swapped for a link after its check, the loop empties the folder the link points to** (measured with an injected swap). **A real race from a second process deleted files 3 times in 9,742 attempts** (60 s) |
| S20-r3 | Info → **narrowed, not closed** | Staging folder and re-hash | (a) The new `realpath` check compares against a path that follows the same link, so it misses a swapped `update-staging`. The copy was staged and opened inside the other folder (measured). (b) The re-hash catches every swap made **during the backup** (measured). But a swap in the 0.1–1 ms after the re-hash **still opened other bytes: 34 of 3,980 in a real race** |
| N6 | Info (new; Linux measured, Windows reasoned to be out of reach) | The re-hash reads by path and can block | A FIFO put in place of the staged copy **hangs the handler for good**. Every later install is refused as "already being prepared", and the Node process could not exit |
| N3-r1 | Info (Windows, reasoned) | Zone.Identifier | The 64 KB cap is checked **after** a synchronous, unbounded read, so the freeze and memory problem is unchanged. An oversized mark is now dropped silently |
| A1 | Info (new) | Audit rows | A failed `openPath` now writes **two** rows: `update_installer_failed` and `update_installer_refused` |
| N1 | Low → **fixed (measured)** | Leftover copies | 3 cancelled launches of a 32 MiB installer left `update-staging` empty. A backup failure removes its copy. A planted `install-OLD123` is cleared |
| R1 | Info → **fixed (measured)** | Raw text and missing audit rows | All of these now give a guided message and an audit row, with `detail` holding only the error code and syscall: the outer-check delete, a backup failure, non-string arguments (object, number, array) and a failed re-hash read |
| N2 | Info → **fixed (measured)** | Size of the name in the audit row | An 8 MiB name is now stored as 255 characters. A non-string argument is stored as `""` |
| S16-r1, S19-r1, S21 | **still fixed** (re-run) | Swaps, concurrency, FIFO in the update folder | Results match the 32263ab round. The new re-hash step is also covered by the in-flight flag |
| N4, S8-r2, S17 | open (unchanged) | | See "Still open" |

## Findings, ranked

### N5 (Low, new): the clear-old-copies loop deletes through a swapped link

**Where.** `src/main/services/updateInstaller.js:64-73` (`ensureStagingFolder`). The steps are:

1. `lstat(update-staging)`
2. `mkdir`
3. `lstat` again (must be a folder)
4. `readdir(update-staging)`
5. `rm(path.join(update-staging, name), { recursive: true })` for each entry

Steps 4 and 5 go through the **path** `update-staging`. If it becomes a link to a folder after step 3, `readdir` lists the target folder, and `rm` deletes each entry in it. The `rm` does not follow links that sit **inside** `update-staging` (measured, see below). The danger is a link that **replaces** `update-staging` itself.

**Measured (Linux)**

| Case | Result |
|---|---|
| Entries inside `update-staging` are links to a victim folder and a victim file | Only the links were removed. The victim was intact |
| `update-staging` swapped for a link to a victim folder after the second `lstat` (injected) | **The victim folder was emptied**: `books.db`, `sub/`, `sub/keep.txt` all deleted. The install then went on, staged into the victim folder, and opened from there |
| Real race: a second process keeps exchanging `update-staging` with a link (`renameat2(RENAME_EXCHANGE)`), 60 s | **3 of 9,742 attempts deleted victim files**. In 3 more, the copy was staged inside the victim folder (`race-ef324d5-wipe.log`) |

**Effect**
- This is a delete primitive. Anyone who can write the data root can make the admin's ERP process empty any folder the admin can delete, for example a backups folder or a document folder.
- Before this commit, the worst outcome of the same swap was launching from another folder. The deletion is new.
- **Windows (reasoned):**
  - A directory junction needs no special privilege (`mklink /J`), and `fs.rm` follows a junction in a parent part of the path. So the same swap works there.
  - Windows has no atomic directory exchange. The attacker would rename the folder away, then create the junction, which makes the race harder but does not stop it.
- **Precondition:** write access to `runtimeDataRoot`.
  - By default that is the admin's own `%APPDATA%` profile, so in practice it means the same user or an administrator.
  - If `GII_GEM_ERP_DATA_ROOT` points to a shared or network folder, other users of that folder qualify too.
  - That is why this is Low, not higher.

**Fix (any one)**
- **Do not list and delete through the path.** Remember the `install-*` folder from the previous attempt in memory, and remove only that exact path after checking it as in S20-r3's fix. The start-up `clearInstallerStaging` already handles leftovers from earlier sessions.
- **Or move first, then delete.** `rename` the staging folder to `update-staging.old-<random>` (a rename moves a link itself, never its target). `lstat` the result. If it is a link, `unlink` it. Only if it is a real folder, `rm` it recursively. Recursive `rm` checks each child with `lstat`, so links inside are not followed.
- **At least**, before each `rm`, check that `realpath(update-staging) === path.join(realpath(dataRoot), "update-staging")`. This narrows the race but does not close it.

### S20-r3 (Info, narrowed, not closed): the new realpath check misses a swapped staging folder, and the re-hash leaves a short window

**(a) The `realpath` check compares against the wrong reference.** `updateInstaller.js:77-78`:

```js
if (path.dirname(realDir) !== (await fs.promises.realpath(stagingFolder)) || ...)
```

- If `update-staging` is a link to folder X, then `realpath(stagingFolder)` is X, and `dirname(realpath(dir))` is also X, so the check passes.
- It only catches the `install-XXXX` folder itself being swapped for a link. That case was measured as refused: "update-staging folder changed".
- **Measured:** `update-staging` swapped for a link after the loop and before `mkdtemp`. Not refused. The copy was written to `X/install-XXXX/…` and opened from there.
- The previous report suggested comparing against `path.join(realpath(runtimeDataRoot), "update-staging")`, which is a fixed reference. That is still the fix.

**(b) Swap between the re-hash and `openPath`.** `main.js:1311` re-hashes `staged.stagedPath` by path. `main.js:1314` then opens the same path again.

| Case | Result |
|---|---|
| Copy overwritten during the backup | refused: "prepared installer changed", plus an audit row. The copy was removed |
| `update-staging` replaced by a link during the backup | refused (hash mismatch) |
| Copy renamed over right after the re-hash (injected) | **OPENED `MZafterhash`**. The audit `sha256` did not match what was opened |
| Copy replaced by a symlink right after the re-hash (injected) | **OPENED the link target**. The audit hash did not match |
| Measured window, end of re-hash to `openPath` | 106–1,009 µs over 8 runs (median about 220 µs) |
| Real race: a second process uses inotify to wait for the re-hash to close the file, then renames a different file over the copy, 60 s | **34 of 3,980 opened `MZevil`**. Each one was audited with the hash of the good copy (`race-ef324d5-inotify.log`) |

- **Windows (reasoned):** `shell.openPath` hands the path to `ShellExecuteEx`. For an installer that needs elevation, the image is loaded only after the UAC prompt is answered. So the real window on Windows is probably the time the admin takes at UAC, which is seconds, not microseconds. A writer to the data root can wait for the prompt and then swap the file.
- **Precondition:** write access to the data root, as in (a) and N5. So this stays Info.
- **What it means:** the claim that "the audit hash records what really ran" holds only while the data root is trusted. Re-hashing helped a lot: the window during the backup is closed. But it cannot close the gap between a check and a use.

**Fix**
- For (a): compare against `path.join(await realpath(dataRoot), "update-staging")`.
- For (b): no full fix is possible from Node alone. Node opens files on Windows with full sharing, so it cannot lock the copy against changes.
- The real control is the Authenticode publisher check (S8-r2): it makes swapped bytes fail at launch.
- Until then, also check `realpath(stagedPath)` and `lstat(stagedPath).isFile()` just before `openPath`. That rules out links, but not a rename-over.

### N6 (Info, new): the re-hash can hang the updater

**Where.** `updateInstaller.js:89-92` `hashFile` uses `fs.createReadStream(filePath)`. That is a blocking open that follows links, with no `O_NONBLOCK` and no `isFile()` check. It is called at `main.js:1311`.

**Measured (Linux)**
- I replaced the staged copy with a FIFO during the backup.
- `updates:install` **never settled** (cut off after 4 s), and `updateInstallInFlight` stayed `true`. The next install was refused: "An update is already being prepared", plus an audit row. The copy was kept, and no audit row was written for the hung attempt.
- The probe process then **could not exit**. `process.exit` waited on the libuv thread blocked in `open()` until the 600 s outer timeout killed it. A symlink to `/dev/zero` would likewise make the hash read forever.
- **Electron (reasoned):** quitting the ERP would probably hang the same way, so the admin would have to kill it from Task Manager.

**Windows (reasoned):** a FIFO cannot sit at a normal file path on Windows, because named pipes live in `\\.\pipe\`. A file symlink needs Developer Mode or the symlink privilege. So this is mainly a Linux or dev-build issue. It also needs data-root write access.

**Fix.** Hash through a handle:
- Open with `O_RDONLY | O_NOFOLLOW | O_NONBLOCK`.
- Check `fstat` for `isFile()`, `nlink === 1`, and the same `dev`/`ino` and size as the copy just written (record them from the write handle in `stageInstaller`).
- Read through that handle.
- Optionally, put a time limit on the whole handler, after which the flag is released.

### N3-r1 (Info; Windows, reasoned): the mark cap comes after the read

`updateInstaller.js:143-144`:

```js
const mark = fs.readFileSync(`${checked}:Zone.Identifier`);
if (mark.length <= 64 * 1024) fs.writeFileSync(...)
```

- The whole stream is still read **synchronously on the main process** before the length is checked. A stream of up to about 2 GiB still freezes the UI and allocates that much memory. So the original N3 point is not fixed.
- A mark over 64 KB is now dropped **with no warning at all**, and the installer runs without the "downloaded from the internet" mark. That gives an attacker nothing new: whoever can attach such a stream can also just delete the mark. But the case leaves no trace.
- **Fix:**
  - `fs.promises.open` the stream and `fstat` it. Skip it if it is over 64 KB, otherwise read at most 64 KB + 1.
  - Warn in both cases.
  - Put `motwCopied: true|false` in the launch audit row.

### A1 (Info, new): a failed launch is audited twice

- `main.js:1315` writes `update_installer_failed`, with the hash and failure text.
- `:1316` then throws a guided error, and the handler's catch (`:1278-1282`) writes `update_installer_refused` for the same attempt.
- **Measured** on every failed `openPath`: `["update_installer_failed","update_installer_refused"]`.
- Anyone counting refusals, or reading the log as one row per attempt, gets inflated numbers. A cancelled UAC prompt reads as both a failure and a refusal.
- **Fix:** mark the error (for example `audited: true`) and skip the handler's row for it, or drop the row at `:1315` and keep a single row.

## What was fixed (measured)

### N1: fixed

- In `installUpdateFromFolder` (`main.js:1302-1320`), everything after staging is wrapped, and on failure the `install-*` folder is removed.
- `ensureStagingFolder` also clears older entries (that is the loop behind N5).
- **Measured:**
  - 3 cancelled launches of a 32 MiB installer left `update-staging` empty.
  - A backup failure (EACCES) left it empty.
  - A planted `install-OLD123` was gone while the next install was running.
  - After a **successful** launch the copy stays until the next start, as intended.

### R1: fixed

| Case | Message now | Audit row |
|---|---|---|
| Installer deleted between `realpath` and `lstat` (outer check) | "Selected installer is not directly inside the update folder…" (no path) | `update_installer_refused` |
| Backup fails after staging | "The backup before the update could not be taken (EACCES)…" | `refused`, `detail {code, syscall}`; copy removed |
| Object, number or array argument | "Choose the installer from the update folder and try again." | `refused`, `installer: ""` |
| Re-hash read fails (EACCES) | "The update was not started (EACCES)…" | `refused`, `detail {code}` |
| `openPath` fails | "The installer could not be opened: <Electron text>" | `failed` + `refused` (A1) |

- No refusal text in any probe contained a file-system path. Full paths appear only in `console.error`.
- **Reasoned:** Electron's `openPath` error on Windows is the system message for the `ShellExecuteEx` error, without the path.
- The successful result still returns `installerPath: selectedInstaller` (`main.js:1330`). That is the admin's own update-folder path, already shown by `updates:status`, so it is not a leak.

### N2: fixed

- `shortInstallerName` (`updateInstaller.js:84-86`) cuts the name to 255 characters and records `""` for anything that is not a string. It is used in both the busy row and the refusal row.
- **Measured:** an 8 MiB name gave a 255-character field (146 ms in total).
- A cut that lands in the middle of an emoji leaves half a character. `JSON.stringify` stores it as a `\udXXX` escape, which is harmless.

### S16-r1, S19-r1, S21: re-run, unchanged

- **Injected swaps** (`ipc-probe-ef324d5.log`), using the same 10 swap kinds in 3 windows:
  - Every swap was refused, except a rename-over before the open. That case is the same as dropping in a new file, as before.
  - The folder swap followed by a swap back was refused.
  - A FIFO, and a symlink already in place at the click, were refused.
  - Every refusal left `update-staging` empty and wrote an audit row.
- **Real cross-process race, installer ↔ symlink, 60 s: 0 of 24,254 opened the link target.** In folder mode, 21 of 25,560 opened from the linked folder. As before, that is not a bypass: the update folder is deliberately allowed to be a link (`race-ef324d5-file.log`, `-folder.log`).
- **Concurrency** (`new-ef324d5-main.log`):
  - A second install started during the first one's backup is refused.
  - A second install started during the first one's **re-hash** is refused.
  - A second install started during the first one's `openPath` is refused, and the first one launches.
  - After a launch, the refusal now says "already been opened and the ERP is closing". Only 1 launch per case.
- **Descriptors:** 29 → 30 over the whole probe, the same as last round.

## Still open from earlier rounds

- **S8-r2 (Low):** no Authenticode or publisher check. This is the control that would make N5's staging, S20-r3(b) and any update-folder writer harmless at launch.
- **N4 (Info; Windows/SMB, reasoned):** `dev`/`ino`/`nlink` assume stable file IDs. FAT/exFAT and some SMB servers do not give them.
- **S17 residue (Info):** a file that grows after the free-space check can briefly fill the disk. The kept copies of N1 are gone.

## Probe files

All under `/tmp/claude-0/sec-probe/`:
- `ipc-probe-ef324d5.mjs` and `.log`: the 32263ab probe re-pointed at this commit.
  - Its "auditHash" column reads `false` for every launch. That is a probe artefact: a failed launch now writes a second row (A1), and the probe reads only the newest row.
  - It stopped at the old staging-race section, because the victim folder had been emptied (N5).
- `new-ef324d5.mjs`:
  - Run as `main` (log `new-ef324d5-main.log`): N1, the loop and link cases, swaps after staging, the window timing, R1, N2 and concurrency.
  - Run as `fifo` (log `new-ef324d5-fifo.log`): N6.
- `race-ef324d5.mjs` (`file` / `folder`, using `flip.py`): the S16 races.
- `race-ef324d5-new.mjs`, with `racers-ef3.py`:
  - `wipe`: exchanges `update-staging` with a link (N5).
  - `inotify`: renames over the copy after the re-hash closes it (S20-r3b).
  - Each run deletes its own folders at the end.
- `tests-ef324d5.log`: the `test:integrity` run.
- To re-run:
  1. Recreate a worktree at `ef324d5`.
  2. Link `node_modules` to a copy built for Node, until the shared one is rebuilt.
  3. Run `node --import ./scripts/audit/lib/electron-register.mjs <probe> [mode]` from the worktree.
