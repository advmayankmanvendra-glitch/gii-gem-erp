# In-house security audit: 372c89d..8d5dd67

- Scope: `98c6fda` and `8d5dd67`. They answer `audit-372c89d-security.md`: S8-r1, S8-r2, the S6 guard quoting, and S12. They also change the `supplierReturnSplit` replay so that reversed returns are handled.
- Checkout: scratch clone `/tmp/claude-0/sec-372` at `8d5dd67`, with `node_modules` copied earlier from the main checkout. `/home/claude/gii-gem-erp` and `/home/claude/wt-prog` were only read.
- Tests: `npm run -s test:integrity` gives **244/244 pass** (219 + 25 IPC), exit 0, Node v22.22.0. Log: `/tmp/claude-0/sec-probe/tests-8d5dd67.log`.
- Probes ran through the real `updates:install` and `updates:status` handlers, with the Electron stub and `shell.openPath` mocked.
- Date: 2026-11-11 05:51 IST

## Summary

| # | Severity | Area | Status |
|---|----------|------|--------|
| S8-r1 | Low → **Info (residual)** | Installer swapped during the live backup | **Fixed for every swap we tested during the backup.** All 9 swap kinds are refused (measured), including the 3 that were launched at 372c89d, and a same-size overwrite with the mtime restored. A gap remains between the final read and the moment the OS opens the file (measured below), and on Windows that gap can be widened |
| S8-r2 | Low (residual) | Hard links; no signature check | Unchanged. A hard link to an outside file that is already in place at click time is still launched (measured). Nothing checks the signature or publisher. The new `sha256` field in the audit log does make the launched file traceable after the fact |
| S13 | Low (new) | Hashing blocks the main process | `installerFingerprint` reads the **whole file into memory, twice, synchronously**. Measured: 300 MB blocks the app for 0.5 s and adds 305 MB RSS; 1.9 GB blocks it for 2.8 s and adds 1.9 GB. Files over 2 GiB are refused with a raw Node error. `updates:status` never reads the file, so a huge file only costs the admin who clicks Install |
| S6-r | Info → **fixed** (one small gap left) | `git ls-files -s -z` guard | Measured: the quoted non-ASCII top-level `node_modules` and the quoted symlink are now caught. Gaps left: matching is case-sensitive (`Node_Modules/`), and the test does not run in CI (unchanged) |
| S12 | Info → **mostly fixed** | Guided update-folder errors | Measured: a dangling folder link now gives the guided message. Looping links, dangling links and directories with an installer name are now skipped by `updates:status`. Left: a file deleted between `readdir` and `stat` still throws a raw `ENOENT` (a race only) |
| SQL | none | `supplierReturnSplit` replay | **Clean.** The new `earlierReturns` SQL has no `${}`. The only interpolation is still the constant `billVoucher`, and every value is a `?` parameter |
| IPC/preload | none | — | No renames, additions or removals. `src/preload/` and `ipc-security.test.mjs` have no diff. No `handle(`, `guarded(`, `sessionGuarded(`, `ipcMain`, `contextBridge` or `invoke(` line changed in `src/` |

## Findings

### S8-r1 (Info, residual): swap during the backup is now refused; a short hand-off gap remains

**Where**
- `src/main/main.js:562-566`: `installerFingerprint` builds `dev:ino:size:mtimeMs:sha256(readFileSync(path))`.
- `:1301`: the fingerprint is taken after the first path check and the version check, before the backup. Everything up to this point runs synchronously, with no `await`.
- `:1303`: `await createLiveBackup(...)`.
- `:1304`: the path check runs again, and **the fingerprint must match**.
- `:1307`: `shell.openPath(selectedInstaller)`, which opens the file by path.
- `:1308`: the audit log now records `sha256`.

**Measured.** Same setup as 372c89d: admin; 200 MB padded database; the update folder is itself reached through a symlink. The probe swapped the file 1-4 ms after the backup file appeared. The handler took 414-451 ms in total.

| Swap during the backup | 372c89d | 8d5dd67 |
|---|---|---|
| Plain file replaced by a symlink to an outside EXE | refused | refused ("not directly inside") |
| **Plain file replaced by another plain file (write, then rename over)** | **launched** | refused ("changed while the backup was being made") |
| **Plain file overwritten in place** | **launched** | refused (fingerprint) |
| Overwritten in place, **same size, mtime restored** with `utimes` | not tested | refused: only the hash catches this |
| **Plain file replaced by a hard link to an outside EXE** | **launched** | refused (fingerprint: inode and hash) |
| Rename-over of a copy with the same size and mtime | not tested | refused (inode and hash) |
| Plain file replaced by a directory of that name | refused | refused |
| Update-folder link re-pointed to another folder | refused | refused |
| Real folder renamed, link to another folder put in its place | refused | refused (fingerprint) |
| Control: no swap | launched | launched, content `MZgood!` |

**What is left: the hand-off gap**
- After the second check, nothing reads the file again. The JS gap from the last installer `readFileSync` to the `shell.openPath` call was **0.016-0.066 ms** (3 samples).
- After that call, Electron hands the **path** to `ShellExecuteExW` on another thread. The OS opens the file only when it creates the process. That OS-side gap was not measurable with the stub.
- A probe renamed a different file over the path inside the mocked `openPath`, which stands for the OS hand-off. The handler returned success and the path now held `MZlate`.
- The audit row then recorded `sha256` = `04d67f40…`, the hash of the **checked** file (`MZgood!`), not of what would run (`9bab7f18…`).
- So the audit hash proves what was checked, not what was launched.

**Exploit path**
1. The same writer to `Documents\GII GeM ERP Updates` waits for an admin to click Install.
2. They must now win a window of under a millisecond plus the time ShellExecute takes, rather than a backup that lasts hundreds of milliseconds.
3. A blind loop that keeps swapping files is probabilistic.
4. On Windows, the well-known opportunistic-lock (oplock) technique can stall a chosen file open and so make the timing deterministic. **This was not tested;** this sandbox runs Linux.

This attacker can already drop any newer `Setup-*.exe` (S8-r2). The swap only adds stealth.

**Severity.** Info. This is the residual of a race that was Low before.

**Fix**
- Launch a private copy. After the backup:
  1. Copy the file through one open file descriptor into a staging folder under `runtimeDataRoot` that ordinary users cannot write to. Hash the copy while copying.
  2. Compare that hash with the pre-backup fingerprint.
  3. Launch the copy.
- That closes the hand-off gap and makes the audit hash describe what actually ran. A signature check (S8-r2) is still the real fix for the trust question.

### S8-r2 (Low, residual): hard links accepted, no signature check (unchanged)

**Measured**
- `GII-GeM-ERP-Setup-15.0.0-x64.exe`, a hard link to `/tmp/gii-out5-*/…` that was **already present** when Install was clicked, is launched.
- `updates:status` also offers it as the newest installer.
- The audit row now records `sha256` = `c19b2c6d…`, which matches `MZevil`. That is useful for tracing afterwards.

**Unchanged**
- `:` names are refused.
- Symlinks are refused, and `updates:status` now skips them too.
- `package.json` has no signing configuration, and nothing checks the signature or publisher.

**Fix.** Unchanged: verify the Authenticode signer, or a SHA-256 from a signed manifest, on the staged copy.

### S13 (Low, new): the installer hash blocks the Electron main process and loads the whole file

**Where.** `main.js:564`: `crypto.createHash("sha256").update(fs.readFileSync(installerPath))`. It is called twice per install (`:1301`, `:1304`). Both calls are synchronous, on the main process.

**Measured.** Probe `/tmp/claude-0/sec-probe/big-8d5dd67.mjs`; log `big-8d5dd67.log`; Linux, page cache warm, small database. "Loop stall" is the longest gap a 1 ms `setInterval` saw. Peak RSS is `VmHWM` after a reset.

| Installer | Handler time | Main loop blocked | Peak RSS (start ~110 MB) | Result |
|---|---|---|---|---|
| 300 MB, random data | 946 ms | 510 ms | 418 MB | launched |
| 1.0 GB, random data | 2,852 ms | 1,373 ms | 1,126 MB | launched |
| 1.0 GB, sparse | 2,917 ms | 1,595 ms | 1,138 MB | launched |
| 1.9 GB, sparse | 5,650 ms | 2,837 ms | 2,050 MB | launched |
| 2.1 GB, sparse | 2 ms | — | 102 MB | refused with the raw text `File size (2254857830) is greater than 2 GiB` |
| 4 GB file present, `updates:status` only | 0.1 ms | — | — | `status` only stats the file; it never reads it |

**Effect**
- A normal installer (about 100-300 MB) costs about 0.5 s of frozen UI and a transient extra memory allocation as large as the file. That is acceptable, but it was not stated anywhere.
- A file that someone with write access drops in the folder (about 1-2 GB, named `GII-GeM-ERP-Setup-99.0.0-x64.exe`) does not freeze the app on its own. `updates:status` and the startup check never read it.
- When an admin clicks Install on such a file, the app freezes for seconds and needs about 2 GB of extra RAM. On an 8 GB office PC this could page heavily or crash the main process. The backup still finishes first and the failure is before launch, so it fails closed.
- On Windows, expect it to be slower than measured here: Defender scans `.exe` files when they are opened, and a cold disk read is slower than the warm page cache used here.
- Over 2 GiB, the error is a raw Node message, not a guided one.

**Exploit path.** Nuisance-level denial of service on manual updates, by the same writer as S8. **Not tested (Windows only):** an oplock held on the installer could also stall the synchronous `readFileSync`, and so the whole main process, for as long as the holder keeps it.

**Fix**
- Hash in a stream (`fs.createReadStream`, or a `for await` over a `FileHandle`) so memory stays constant and the event loop keeps running. Better: hash while copying into the staging folder (S8-r1 fix), opening the file once.
- Refuse files above a sane ceiling, for example 1 GiB, with a guided message, before reading them.

### S6-r (Info → fixed): `-z` guard

**Where.** `scripts/audit/audit2-regressions.test.mjs:1155-1160`.

**Measured** in a throwaway repository, `/tmp/claude-0/sec-probe/gitz-*`. It held:
- `node_modules/café.js`
- `sub/node_modules/ü.js`
- `nöde_modules.txt`
- a symlink named `lïnk`

| Command | Results |
|---|---|
| Without `-z` | The regex caught 1 of the 2 `node_modules` entries: it missed the quoted top-level one. Every path was quoted |
| With `-z` | Both entries were caught. `120000 …\tlïnk` was caught by the link check. `nöde_modules.txt` was correctly not flagged |

**Small gaps left**
- The regex is case-sensitive. A committed `Node_Modules/x` passes the test, but it still lands inside `node_modules` on a Windows (case-insensitive) checkout. **Fix:** add the `i` flag.
- There is still no CI workflow (unchanged).

### S12 (Info → mostly fixed): guided update-folder errors

**Measured** (log `ipc-probe-8d5dd67.log`)

| Case | 372c89d | 8d5dd67 |
|---|---|---|
| Update-folder link points to a missing folder | raw `ENOENT … mkdir` | `The update folder … could not be created or opened (ENOENT). Check that the Documents folder is available…` (status and install) |
| A self-looping link with an installer name in the folder | raw `ELOOP` from `updates:status` | skipped; status works. Installing it by name gives "not found" |
| A dangling link with an installer name | — | skipped |
| A directory with an installer name | — | skipped |
| A file deleted between `readdir` and `statSync` (`main.js:483`), simulated | — | raw `ENOENT … stat` (race only) |

**Notes**
- The guided message says "Documents folder" even when `GII_GEM_ERP_UPDATE_DIR` points somewhere else. This is cosmetic.
- The message includes the folder path, which shows the Windows user name. It is shown only to the user who is signed in.
- **Fix (optional):** wrap the `statSync` at `:483` in a `try` and skip the entry.

### SQL review: `supplierReturnSplit` (`inventoryService.js:367-455`): no injection

- `billVoucher` (`:375-377`) is still a constant literal. It is spliced at `:384-385`, which is still the only interpolation.
- The new `earlierReturns` statement (`:434-442`) is a template literal with no `${}`. It binds `row.company_id, row.supplier_id, row.item_id, row.id` through `?`.
- `posting_status IN ('Posted', 'Reversed')` and the `is_deleted` filters are constants.
- The diff adds no line that has both a backtick and `${`.
- `posting_status`, `sl_id` and `last_sl_id` come from the database and are only compared as numbers or strings in JS.
- Reasoned, not measured: the replay now scans every lot on every `take` (it skips used-up lots instead of filtering them out). A return therefore costs O(earlier returns × lots) for one supplier and item. That is a performance note, not a security issue.
- `init.js:1024-1025` changes only a comment.

## Probe files

- `/tmp/claude-0/sec-probe/ipc-probe-8d5dd67.mjs` (log `ipc-probe-8d5dd67.log`). Run it from the clone with `node --import ./scripts/audit/lib/electron-register.mjs`. It covers:
  - the static path cases
  - 10 swap-during-backup variants
  - the post-check hand-off swap and the audit `sha256`
  - the S12 cases
- `/tmp/claude-0/sec-probe/big-8d5dd67.mjs` (log `big-8d5dd67.log`; run it with `--expose-gc` as well): hashing cost at 300 MB, 1 GB, 1.9 GB and 2.1 GB, and `updates:status` with a 4 GB file present.
- `/tmp/claude-0/sec-probe/gitz-*`: the throwaway repository for the `-z` guard.
- `/tmp/claude-0/sec-probe/tests-8d5dd67.log`: the `test:integrity` run.
