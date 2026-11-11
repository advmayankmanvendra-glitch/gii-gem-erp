# In-house security audit: efefcbb..32263ab

- Scope: `32263ab`. It answers `audit-efefcbb-security.md`: S16-r1, S19-r1, S20, S21, S12-r1, plus the AA3 Zone.Identifier change. Also looked at: the two-line removal in `inventoryService.js:467` and the renderer button change.
- Checkout: a throwaway worktree, `/tmp/claude-0/sec-322` at `32263ab`, with `node_modules` symlinked. It was removed at the end. `/home/claude/gii-gem-erp` was only read. Nothing was committed or pushed.
- Tests: `npm run -s test:integrity` gives **253/253 pass** (222 + 31 IPC), exit 0, on Node v22.22.0. Log: `/tmp/claude-0/sec-probe/tests-32263ab.log`.
- Probes ran through the real `updates:install` handler, with the Electron stub and a mocked `shell.openPath`.
  - A successful launch now keeps the in-flight flag set for good, so most probes made `openPath` return an error string. That lets the flag reset between cases. "LAUNCHED" below means `openPath` was called with that file's bytes.
  - Every probe ran on Linux (root, ext4/tmpfs). Windows behaviour is marked **reasoned, not measured**.
- Date: 2026-11-11 07:01 IST

## Summary

| # | Severity | Area | Status |
|---|----------|------|--------|
| S16-r1 | Low → **fixed (Linux measured; Windows reasoned)** | Swap between the path check and the open | I swapped in 10 kinds of file at 3 points: before the open, after it, and between the re-check and the final `lstat`. Every swap was refused except a plain rename-over before the open, which is the same as dropping in a file. **Real cross-process race: 0 of 30,867 attempts launched the link target** (before: 116 of 16,800) |
| S19-r1 | Info → **fixed** | Two installs at once | A second install started during the first one's backup, or during its launch, is refused and audited. The flag is released after a failure (next install works) and held after a launch |
| S21 | Info → **fixed** | FIFO / device | FIFO and char device: refused in 5–11 ms, no hang, and the next install works |
| S20 | Info → **narrowed, not closed** | Staging folder link | A link planted **after the second `lstat` and before `mkdtemp`** is still followed (measured). Swapping the staging folder during the backup launches other bytes, and **the audit hash no longer matches what ran** (measured) |
| **N1** | **Low (new, regression)** | Copies kept after a failed launch | Each failed launch (for example, UAC cancelled) keeps its own copy of up to 1 GB. **3 tries of a 32 MiB installer left 3 folders, 96 MiB.** Before this commit, each try deleted the previous copy |
| S12-r1 | Info → **mostly fixed**; residue | Error text and audit | Raw text still gets out in three places: a delete in the outer check, a backup failure and a non-string argument. None of them writes an audit row |
| N2 | Info (new) | Audit row size | The installer name taken from the renderer is written unbounded: an **8 MiB name made an 8 MiB audit row** (387 ms). JSON escaping is correct, so nothing can be injected |
| N3 | Info (new; Windows, reasoned) | Zone.Identifier copy | `readFileSync` of the mark has no size cap and runs synchronously on the main process. The mark copy still fails open, with only a console warning |
| N4 | Info (Windows/SMB, reasoned) | Identity on shares | The `dev`/`ino`/`nlink` check depends on stable file IDs. FAT/exFAT and some SMB servers do not give them |
| inventory | none | `inventoryService.js` | Two JS lines removed (the `lot.reversed` zeroing). No SQL, IPC or input change; correctness only, so it is left to the correctness audit |
| IPC/preload | none | — | No new channel. `src/preload/` is unchanged. `updates:install` only gains a wrapper. The renderer adds an `installingUpdate` disabled state (UI only; the main-process flag is what enforces it) |

## What was fixed (measured)

### S16-r1: fixed

The code now:
- opens with `O_RDONLY | O_NOFOLLOW | O_NONBLOCK` (`main.js:579`, `:614`);
- runs the folder check again after the open (`:620`);
- compares `handle.stat({ bigint })` with `lstatSync(recheck, { bigint })` on `dev`/`ino`, requires `recheck === checked` and `nlink === 1n` (`:621-622`).

**Injected swaps** (`ipc-probe-32263ab.log`). W1 = after the check, before the open. W2 = after the open, before the re-check. W3 = after the re-check, before the final `lstat`.

| Swap | W1 | W2 | W3 |
|---|---|---|---|
| Control | launched | launched | launched |
| Symlink to an outside EXE | refused (`ELOOP` → "linked") | refused | refused |
| Hard link | refused (`nlink`) | refused | refused |
| Another file renamed over the path | launched `MZrenamed` (= dropping a file) | refused | refused |
| Directory | refused | refused | refused |
| Deleted | refused, mapped `ENOENT` | refused | refused, mapped `ENOENT` |
| FIFO, no writer | refused, 8 ms | refused | refused |
| Char device (`mknod c 1 3`) | refused | refused | refused |
| Symlink to `/dev/zero` | refused | refused | refused |
| Update folder renamed, symlink to an outside folder in place | refused | refused | refused |
| Folder swapped in W1, swapped back in W2 | refused (`ino` differs from the handle) | | |

- Every refusal wrote an `update_installer_refused` row.
- Every refusal left `update-staging` empty: the per-install folder is removed.
- Measured windows: open → `handle.stat` 95–411 µs; open → final `lstat` 131–511 µs.

**Real race, no injection** (`race-32263ab.mjs` + `flip.py`, `renameat2(RENAME_EXCHANGE)` from a second process):

| Mode | Attempts | Link target launched | Good file launched | Refused |
|---|---|---|---|---|
| Installer ↔ symlink to outside EXE, 90 s | 30,867 | **0** | 146 | 30,721 |
| Update folder ↔ symlink to outside folder, 60 s | 21,959 | 59 | 37 | 21,863 |

The 59 in folder mode **are not a bypass**:
- The check deliberately follows links on the update folder; the probe's own update folder is a symlink.
- Those launches happened when the folder pointed outside at **both** checks. They read the same as a party who simply leaves the link in place.
- That needs write access to the update folder's **parent**, the same precondition as before.

**Windows (reasoned, not measured)**
- `O_NOFOLLOW` and `O_NONBLOCK` are 0 there, so the open follows links.
- The re-check covers it:
  - `realpath` of a link points outside, so the folder test fails.
  - A link swapped back before the re-check gives `lstat`, which libuv runs with `FILE_FLAG_OPEN_REPARSE_POINT`, a file ID that differs from the handle's.
- `bigint` keeps all 64 bits of the NTFS file ID.

### S19-r1: fixed

- The flag is set at the top of the handler, after `enforcePermission` (`:1388-1393`). It is cleared in `finally` unless the launch succeeded (`:1405`).
- Measured:
  - A second install (other window, other installer) started during the first one's backup is refused: "already being prepared", plus an audit row. Only 1 launch.
  - A second install during the first one's `openPath` is refused, and the first launches.
  - After a failed `openPath` or a refusal, the next install runs.
  - After a real launch, every later call is refused. The app quits in 1.5 s.
- **Stuck flag:**
  - No case left it stuck: FIFO, device, delete, backup failure, `openPath` failure and a non-string argument were all tried.
  - It can stick only if the handler never settles. For example, a read from a hung SMB share or a stalled USB drive would block the copy until restart. **Reasoned.** Restarting clears it, which is acceptable.

### S21: fixed

`O_NONBLOCK` means a FIFO with no writer opens at once. `isFile()` then refuses it (5–11 ms), and the next good install launches. A char device was also refused. The open does happen before `isFile()`, so a device's open-time side effects would still occur. But making a device node in the folder needs root or a bind mount, and symlinks to devices are stopped by `O_NOFOLLOW`. Not reachable on Windows.

### S12-r1: mostly fixed

- Only `error.guided` errors are passed through now.
- Everything raised inside `stageInstaller` is mapped and logged with `console.error`. The message names "the ERP's data folder" or "the update folder" instead of a path (`:656-662`).
- Every guided refusal writes `update_installer_refused` with the installer name and reason.
- The leftover cases are in finding R1 below.

## Findings

### N1 (Low, new, regression): every failed launch keeps a full installer copy

**Where**
- `main.js:1423-1426`: the copy is removed only inside `stageInstaller`'s catch (`:656`).
- If `createLiveBackup` throws, or `shell.openPath` returns an error, the `install-XXXXXX` folder is kept.
- Before this commit, each new install deleted the whole `update-staging` first. Per-install folders (the S20 fix) took that away.

**Measured** (`ipc-probe-32263ab.log`). With `openPath` returning "The operation was canceled by the user." 3 times for a 32 MiB installer, `update-staging` held **3 folders, 96 MiB**. A backup failure also left its copy.

**Effect**
- On Windows, an NSIS installer asks for elevation. Saying No at UAC makes `openPath` fail. **Reasoned:** Electron reports the `ShellExecute` failure as an error string.
- An admin who cancels, or retries after an AV block, adds up to 1 GB to the data disk (Roaming `%APPDATA%`, next to the books) each time, until the next app start.
- With repeated retries this is the brief disk-full case from S17, made permanent for the session. A full disk then threatens database writes.

**Fix.** In `installUpdateFromFolder`, wrap everything after `stageInstaller` in try/catch. On any failure before a successful `openPath`, remove `path.dirname(staged.stagedPath)`. Alternatively, have `ensureStagingFolder` remove older `install-*` folders. That is safe now, because only one install can run at a time.

### S20-r2 (Info, narrowed): the staging folder can still be swapped by someone who can write the data root

**Where**
- `main.js:591-598`: `lstat` → `rm` (non-folder only) → `mkdir` → `lstat` → `mkdtemp`.
- `:1424`: `openPath(staged.stagedPath)` opens the copy by its path, roughly 150–200 ms after the copy (during the backup).

**Measured**

| Case | Result |
|---|---|
| Link to an attacker folder planted after the **first** `lstat` | refused ("update-staging folder is not a normal folder") plus an audit row |
| Link planted after the **second** `lstat`, before `mkdtemp` | **followed**: the copy was written to the attacker's folder (`install-XXXXXX` inside it) and launched from there |
| `update-staging` renamed away during the backup and replaced with a link to a folder holding a different file under the same `install-XXXXXX/…` name | **launched `MZswapped`**. The audit `sha256` was of the original copy, so it **did not match what ran** |
| Startup `rmSync` of a symlinked `update-staging` | removes the link only (efefcbb test still passes) |

**Impact.** Either case needs write access to `runtimeDataRoot`, which is the user's own profile and the same access that can rewrite the database. So this stays Info. But it does break the claim, from the efefcbb round, that "the audit hash records what really ran". It holds only while the data root is trusted.

**Fix (optional, narrowing)**
- Check `realpath(stagingDir)` against `path.join(realpath(runtimeDataRoot), "update-staging")` after `mkdtemp`.
- Just before `openPath`, `lstat` each part of the staged path again (no links) and hash the staged file again, comparing it to `staged.sha256`. This is still a check followed by a use, but the window shrinks from the backup's length to microseconds.
- A smaller, separate step: stage under `%LOCALAPPDATA%` (not roamed).

### R1 (Info): raw text and missing audit rows that are left

**Where.** These errors come from outside `stageInstaller`, so they are not guided and pass to the renderer unchanged:

| Case | Message shown | Audit row |
|---|---|---|
| Installer deleted between `realpath` and `lstat` in the **first** check (`:566`, called from `:1415`) | `ENOENT: no such file or directory, lstat '/tmp/gii-upd8-…/GII-GeM-ERP-Setup-87.0.0-x64.exe'` (full path) | none |
| Backup fails after staging (`:1423`) | `EACCES: permission denied, mkdir '<data root>/backups'` (full data-root path) | none; copy kept (N1) |
| Non-string argument from the renderer | `The "paths[0]" argument must be of type string…` | none |
| `openPath` fails | Electron's text (no path) | `update_installer_failed` (fine) |

The same delete in the **inner** check is mapped and audited. The path shown is the admin's own, so this is not a privilege leak. It is, however, the one place the "no raw paths" goal is still missed. Tamper-like events (a file vanishing mid-check) also leave no trace.

**Fix**
- Wrap `fs.lstatSync(realInstaller)` at `:566` in the same try/catch as `realpathSync`, and throw the guided "could not be opened" message.
- In the `updates:install` handler's catch, map any non-guided error to a guided "The update could not be prepared (CODE)…", the way `stageInstaller` already does. Then audit it as `update_installer_refused` (or `_failed`) with `error.code` only.
- Reject `typeof installerPath !== "string" && installerPath != null` up front.

### N2 (Info, new): the installer name in the audit row is not size-limited

**Where.** `main.js:1390` and `:1401`: `installer: path.basename(String(installerPath || ""))`, taken straight from the IPC argument. The busy path (`:1390`) writes it before any validation.

**Measured**
- An 8 MiB name gave an 8,388,730-byte `new_value` in 387 ms.
- Quotes, newlines, NUL and `<img onerror>` were stored correctly JSON-escaped. Nothing can be injected into the row's structure.
- The audit view is React-rendered, so the HTML stays text.

**Impact.** It needs the `settings` permission (admin and super admin). A misbehaving or compromised renderer could grow the database and the audit table by megabytes per call. Also, when the argument is empty, the row records `""` rather than the `status.installerPath` that was actually used.

**Fix.** Use `path.basename(String(installerPath || status.installerPath || "")).slice(0, 255)`, and refuse arguments longer than about 1,024 characters before writing the audit row.

### N3 (Info, new; Windows, reasoned): the mark copy has no size limit and still fails open

**Where.** `main.js:649-651`: `fs.writeFileSync(stagedPath:Zone.Identifier, fs.readFileSync(checked:Zone.Identifier))`.

- The read is **synchronous on the Electron main process** and unbounded. A real mark is under 1 KB. An update-folder writer can attach a stream of up to about 2 GiB, which freezes the UI and allocates that much memory. Larger streams throw `ERR_FS_FILE_TOO_LARGE`, which is caught and warned.
- The mark is read from the path, not from the open handle, so a swapped file's mark can be used. That changes nothing, because the writer controls the mark anyway.
- If the mark cannot be read or written (FAT/exFAT, a share without ADS, an AV lock), the installer still runs with no mark. The trace is only a `console.warn`, with no audit row. The new "log non-ENOENT" behaviour fixes the "no trace" point only for whoever reads the console.
- Not run on Windows.

**Fix**
- Use `fs.promises.open` with a 64 KB cap (refuse or skip a larger mark).
- Put `motwCopied: true|false` in the `update_installer_launched` audit row.
- The lasting fix is still the Authenticode publisher check (S8-r2, open).

### N4 (Info; Windows/SMB, reasoned): the identity check assumes stable file IDs

- `sameFile` and `nlink` depend on what the file system reports.
- On FAT/exFAT (USB sticks), the file index is derived from the directory entry. Some SMB servers return 0 or unstable `FileId`s, and `NumberOfLinks` may always be 1.
- On such volumes, the post-open check may accept a swapped file (IDs equal) or refuse a good one. The swap would still need a writer to that folder.
- Not measured.
- **Fix:** document that the update folder should be on a local NTFS volume. Optionally refuse when `stats.ino === 0n`.

## Still open from earlier rounds

- **S8-r2 (Low):** no Authenticode or publisher check. This is the real control against a hostile update-folder writer.
- **S17 residue (Info):** a file that grows after the free-space check can briefly fill the disk. A copy kept after a successful launch stays until the next start. N1 makes the kept-copy part worse.

## Other checks

- **File descriptors.** 29 → 30 across about 60 install calls, including the FIFO, device and refusal paths. No per-call growth; the `finally` closes the handle.
- **Renderer.** `SettingsScreen.jsx` disables the button while `installingUpdate` is set and resets it only on error. That is UI only; the main-process flag enforces it.

## Probe files

- `/tmp/claude-0/sec-probe/ipc-probe-32263ab.mjs` (log `ipc-probe-32263ab.log`). It covers:
  - window timing
  - 10 swap kinds × 3 windows, and a swap followed by a swap back
  - FIFO and links already present at the click
  - 3 staging-folder races
  - kept copies
  - error text
  - audit-row content
  - concurrency and the flag after a launch
  - descriptor count
- `/tmp/claude-0/sec-probe/race-32263ab.mjs` + `flip.py`, run as `file 90` and `folder 60` (logs `race-32263ab-file.log`, `race-32263ab-folder.log`).
- `/tmp/claude-0/sec-probe/tests-32263ab.log`: the `test:integrity` run.
- To re-run, recreate a worktree at `32263ab` in `/tmp/claude-0/sec-322` and run `node --import ./scripts/audit/lib/electron-register.mjs <probe>` from it.
