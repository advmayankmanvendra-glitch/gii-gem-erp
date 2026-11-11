# In-house security audit: ef324d5..64124dc

- Scope: `64124dc`. It answers `audit-ef324d5-security.md`: N5, S20-r3, N6, N3-r1 and A1. Files read: `src/main/services/updateInstaller.js`, the `updates:install` handler in `src/main/main.js` (lines 1258-1345), and the change to `scripts/audit/lib/electron-stub.mjs`.
- Checkout: a throwaway worktree, `/tmp/claude-0/sec-641` at `64124dc`, with `node_modules` linked to the shared one. That copy of `better-sqlite3` is built for Node again, so nothing was rebuilt or redirected. The worktree was removed at the end. Nothing was committed or pushed, and no package was installed.
- Tests: `npm run -s test:integrity` gives **264/264 pass** (222 + 42 IPC), exit 0, on Node v22.22.0. Log: `/tmp/claude-0/sec-probe/tests-64124dc.log`.
- Probes ran through the real `updates:install` handler, with the Electron stub and a mocked `shell.openPath`. The mock reads the file it is given, so "OPENED" below means `openPath` received those bytes.
- Every probe ran on Linux (root, ext4). Windows behaviour is marked **reasoned, not measured**.
- Disk: each race attempt still takes a live backup. The probes deleted backups every 10 attempts and removed their own folders. Root stayed at 64% (15 GB free) throughout.
- The container restarted once during the run. One probe case blocked the main thread because my `openPath` mock read a FIFO. That was a probe bug, not an app bug. I fixed the mock and re-ran every case.
- Date: 2026-11-11 08:17 IST

## Summary

| # | Severity | Area | Status |
|---|----------|------|--------|
| **N5-r1** | **Low (not closed)** | Clearing the renamed staging folder | Every swap the fix was built for is now handled (measured). **But the recursive `rm` of the renamed folder still follows a link swapped in for a sub-folder while `rm` is walking it. A real race emptied or partly emptied the victim folder in 44 of 155 attempts** (60 s) |
| S20-r3 | Info: (a) **fixed**; (b) **open** | Staging folder check, re-hash → `openPath` | (a) Every swap of `update-staging` before and during the check is refused (measured). A swap **after** the check still sends the copy into the attacker's folder, where it is re-hashed and opened. (b) **A real race opened other bytes in 616 of 1,876 attempts.** Every one was audited with the good hash |
| N6-r1 | Info (narrowed) | Re-hash input | FIFO, `/dev/zero` link, folder and hard link are all refused quickly (measured). **A large sparse file renamed over the copy keeps the updater locked:** it hashes at 0.48 GiB/s, so 64 GiB takes about 2 min and 16 TiB about 9.5 h |
| N7 | Info (new) | `.old-*` leftovers | If the `rm` fails, `update-staging.old-<hex>` stays. **The start-up clear does not remove it** (measured). In the N5 race, 106 of 155 attempts left one behind |
| N3-r1 | Info → **mostly fixed** (Windows, reasoned) | Zone.Identifier | The size is checked before the read. There is a small gap between the check and the read |
| A1 | Info → **fixed (measured)** | Audit rows | A failed launch now writes one row, `update_installer_failed` |
| N8 | Info (new) | Audit rows | A failed audit write is now only logged, so a launch can go through with no audit row |
| S8-r2, N4, S17 | open (unchanged) | | See "Still open" |

## Findings, ranked

### N5-r1 (Low, not closed): the recursive delete still follows a sub-folder swapped for a link

**What changed.** `ensureStagingFolder`, `updateInstaller.js:64-97`:
1. `rename(update-staging, update-staging.old-<16 hex>)`
2. `lstat` the renamed entry. A link is `unlink`ed. A real folder is removed with `fs.promises.rm(old, { recursive: true })` (`:77`).
3. Non-recursive `mkdir`, then `mkdtemp`.
4. Check against `realpath(dataRoot)/update-staging`.

**What the fix now stops (measured, injected)**

| Swap | Result |
|---|---|
| `update-staging` is a link to the victim folder at the click | The link was moved and unlinked. Victim intact. The install continued in a fresh folder |
| `update-staging` is real but holds links to a victim folder and file | Only the links were removed. Victim intact |
| `.old-*` replaced by a link between the `rename` and the app's `lstat` | It was unlinked. Victim intact |
| `.old-*` replaced by a link after the app's `lstat` said "folder", before `rm` | `rm` runs its own `lstat` first and removed only the link. Victim intact |
| A link planted at `update-staging` before the non-recursive `mkdir` | Refused: "update-staging folder changed", plus an audit row |
| `update-staging` swapped for a link after `mkdir`, before `mkdtemp` | Refused. Only the empty `install-*` was removed from the link target. Victim intact |

So the one-level swaps from the ef324d5 round are closed.

**What it does not stop.** Node 22's recursive `rm` is a path-based walk (`internal/fs/rimraf`):
1. `lstat(old/d)`
2. `rmdir`, which fails because the folder is not empty
3. `readdir(old/d)`
4. `unlink(old/d/<child>)` for each child

Whoever planted the old folder owns everything inside it. If they swap `old/d` for a link between steps 1 and 3, the walk lists and deletes the **link target's** contents. The old code deleted through the same walk. The rename only moved the race one level down.

**Measured, real race (Linux):**
- Before each attempt the attacker plants their own `update-staging`: 40 sub-folders `dK` (4 files each), plus 40 links `LK` pointing to the victim.
- A second process watches the data root with inotify. When `update-staging.old-*` appears, it keeps exchanging `old/dK` with `old/LK` (`renameat2(RENAME_EXCHANGE)`).
- Over 60 s and 155 attempts, the victim (`books.db`, `backups/b1.db`) was **fully emptied 20 times and partly emptied 24 times**. That is 28% of attempts.
- The `.old-*` name is random, but the attacker learns it from inotify on the data root as soon as it appears.
- Log: `race-64124dc-oldswap.log`.

**Same walk elsewhere:**
- `clearInstallerStaging`, `updateInstaller.js:59`: `rmSync(update-staging, recursive)` at start-up.
- `stageInstaller`'s failure cleanup, `:181`.
- `installUpdateFromFolder`'s failure cleanup, `main.js:1333`.
- Reasoned: these have the same exposure whenever the folder being removed is one the attacker controls. For `:181` and `:1333`, see the S20-r3 "after the check" case below. In the injected run, `main.js:1333` deleted the attacker's `X/install-*` through a swapped `update-staging` link.

**Windows (reasoned).** Node uses the same JS walk on Windows. A directory junction needs no privilege. Windows has no atomic exchange, but the attacker owns the sub-folder, so they can rename it away and create a junction in its place. The race is harder but still open.

**Precondition:** write access to `runtimeDataRoot`, the same as before. That is the admin's own profile by default, or a shared folder if `GII_GEM_ERP_DATA_ROOT` points to one. It stays **Low**.

**Fix**
- **Do not walk a tree you do not trust.** The staging folder only ever holds `install-XXXX/<one .exe>`.
- After the rename, delete only that shape, without recursion:
  1. For each entry, `lstat` it. It must be a real folder named `install-*`.
  2. Inside it, `lstat` each child. It must be one regular file ending in `.exe`.
  3. `unlink` that file, then `rmdir` the folder.
- On POSIX, also require `uid === process.getuid()` at each step.
- If anything else is there, **leave the renamed folder in place**, warn, and audit it. The new folder is created fresh anyway, so nothing depends on the old one being gone.
- Apply the same rule in `clearInstallerStaging` (`:59`) and in the two failure cleanups (`:181`, `main.js:1333`). Those can use the `realDir` and file name the app itself created, checked with `lstat` before each step.
- The worst case left would be deleting one `.exe` with a known name through a swapped link, instead of a whole folder.

### S20-r3 (Info): (a) fixed; (b) still open, now measured at a high rate

**(a) Fixed (measured).** The reference is now `realpath(dataRoot)/update-staging` (`:66`, `:91`). Swaps before `mkdir` and between `mkdir` and `mkdtemp` are refused, as shown in the table above.

**Residue (measured, injected):** a swap made **after** the check is not caught.
- Right after `ensureStagingFolder` returns, the attacker creates `X/install-<same name>` and swaps `update-staging` for a link to X.
- The copy was then written to `X/install-*`, re-hashed there, and **OPENED from X**.
- The audit hash matched, because those were still the good bytes, so this alone is not a bypass.
- Every later use (`createWriteStream` `:163`, `hashFile` `:107`, `openPath` `main.js:1327`) goes through the path again. `O_NOFOLLOW` guards only the last part of the path.
- The copy then sits in a folder the attacker owns, and that feeds (b).

**(b) Gap between the re-hash and `openPath` (`main.js:1324-1327`).**

| Case | Result |
|---|---|
| Rename-over right after the re-hash closes its handle (injected) | **OPENED `MZafterhash`**. The audit hash did not match |
| Symlink right after the re-hash (injected) | **OPENED the link target** |
| FIFO right after the re-hash (injected) | `openPath` was handed a FIFO |
| Real race: inotify waits for the re-hash `close`, then renames a file over the copy, 60 s | **616 of 1,876 opened `MZevil`**. Each was audited with the good hash (`race-64124dc-rehash.log`) |

- Last round's race got 34 of 3,980. The higher rate now comes from a better racer: it follows each fresh `update-staging` folder through inotify. The app's gap did not change.
- **Windows (reasoned):** as before, the real window is the time the admin spends at the UAC prompt.
- **Fix:** none that is complete from Node alone. The real control is the Authenticode publisher check (S8-r2).
- Narrowing steps:
  - Just before `openPath`, `lstat` the staged path. Require `isFile`, `nlink 1`, and the same `dev`/`ino` recorded when the copy was written. Require `realpath(stagedPath) === path.join(realDir, name)`.
  - On Windows, keep a handle open on the copy without `FILE_SHARE_WRITE`/`FILE_SHARE_DELETE` until launch. That needs a native helper.
  - Create `update-staging` with a DACL for the current user only, so the `install-*` folders are not writable through ACL inheritance from a shared data root.

### N6-r1 (Info, narrowed): the re-hash reads any regular file to the end

`hashFile` (`updateInstaller.js:106-116`) now opens with `O_NOFOLLOW|O_NONBLOCK` and requires `isFile()`.

**Measured: each of these is now refused quickly** (copy swapped during the backup):

| Copy replaced by | Result |
|---|---|
| A FIFO | "prepared installer changed", 13 ms |
| A link to `/dev/zero` | ELOOP refusal, 8 ms |
| A folder | refused |
| A hard link to another file | refused |

- In each case the in-flight flag was released and an audit row was written.

**Still open:**
- There is no check on size or identity before reading.
- A **sparse** file renamed over the copy uses no disk space, but `hashFile` reads all of it. Measured: 0.48 GiB/s. A 64 GiB sparse file hit my 120 s cut-off. A 16 TiB file (the ext4 maximum) would take about **9.5 h**.
- During that time `updateInstallInFlight` stays set, so every install is refused as "already being prepared", and the hashing thread stays busy.
- **Windows (reasoned):** any user can mark a file sparse (`fsutil sparse setflag`, `FSCTL_SET_SPARSE`).
- Needs data-root write access.

**Fix:**
- In `stageInstaller`, record `dev`, `ino` and `size` from the write side.
- In `hashFile`, compare `fstat` with those values before reading, and refuse on any difference.
- Read at most the recorded size.

### N7 (Info, new): `.old-*` folders are never cleaned up

- The result of `rm(old)` is ignored (`:77`, `.catch(() => {})`), and `clearInstallerStaging` removes only `update-staging`.
- **Measured:** with `rm(old)` made to fail (EBUSY), `update-staging.old-<hex>/…` was still there after the next start-up clear.
- In the N5 race, 106 of 155 attempts left one behind.
- **Effect:** clutter, and up to 1 GB per copy left on disk. Also, the "never kept across sessions" promise for installer copies no longer holds.
- **Windows (reasoned):** a scanner holding the previous copy open makes the `rename` fail with EPERM or EBUSY. That gives a guided refusal (measured with an injected EPERM) until the handle closes. This is availability only.
- **Fix:**
  - At start-up, also remove `update-staging.old-*`, using the safe routine from N5-r1.
  - Warn when the `rm` fails.

### N3-r1 (Info; Windows, reasoned): mostly fixed

- `updateInstaller.js:170-173` now runs `statSync(stream)` before reading, so a large mark is no longer read into memory, and the case is logged.
- **Left:** `readFileSync` re-opens the stream and reads it to its size at that moment. A writer to the update folder could grow the stream between the `stat` and the read. The window is microseconds and needs that writer.
- **Fix:** open once, `fstat` the handle, and read at most 64 KB + 1 from it.
- Optional: put `motwCopied` in the launch row.

### A1 (fixed, measured)

- A failed `openPath` gives exactly one row, `["update_installer_failed"]` (`main.js:1330`, skipped at `:1287`).
- A successful launch gives one `update_installer_launched` row.
- A refusal gives one `update_installer_refused` row.

### N8 (Info, new): audit failures are now silent to the user

- `auditUpdate` (`main.js:1294-1300`) catches a failed audit write and only logs it.
- That is the right call after a successful `openPath`, because the installer is already running.
- But it means anyone who can make the audit write fail can get a launch with no audit row. One example is filling the disk that holds the data root.
- **Fix:** on a failed audit write before `openPath`, refuse the install. After `openPath`, keep logging, and also write the line to the error journal.

## Other changes looked at

- `ensureUpdateFolder` (`main.js:421`) now gives a guided error, so the refusal text includes the update folder path. That path is the admin's own setting, already shown by `updates:status`, so it is not a leak.
- The lock or busy advice (`main.js:1280-1283`) is wording only.
- The test stub's `openPath` now fails by default (`electron-stub.mjs:34-36`). It affects tests only, and makes them safer.

## Still open from earlier rounds

- **S8-r2 (Low):** no Authenticode or publisher check. This is the control that would make S20-r3(b), and any writer to the update folder or data root, harmless at launch.
- **N4 (Info; Windows/SMB, reasoned):** the `dev`/`ino`/`nlink` checks assume stable file IDs.
- **S17 residue (Info):** a file that grows after the free-space check can briefly fill the disk.

## Probe files

All under `/tmp/claude-0/sec-probe/`:
- `new-64124dc.mjs main`: the injected cases. Log: `new-64124dc-main.log`. Pass `main sparse` to add the 64 GiB sparse case, which locks the updater for the rest of the run.
- `hashrate-64124dc.mjs`: hash speed on a 4 GiB sparse file. Log: `hashrate-64124dc.log`.
- `race-64124dc.mjs`, with `racers-641.py`:
  - `oldswap`: the N5-r1 race. Log: `race-64124dc-oldswap.log`.
  - `rehash`: the S20-r3(b) race. Log: `race-64124dc-rehash.log`.
  - Each run prunes backups and deletes its own folders.
- `tests-64124dc.log`: the `test:integrity` run.
- To re-run:
  1. Recreate a worktree at `64124dc` with `node_modules` linked.
  2. Point `REPO` in the probes at it.
  3. Run `node --import ./scripts/audit/lib/electron-register.mjs <probe> <mode>` from the worktree.
