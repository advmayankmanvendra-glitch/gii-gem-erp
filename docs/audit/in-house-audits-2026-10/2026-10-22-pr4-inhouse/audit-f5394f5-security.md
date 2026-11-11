# In-house security audit: 343ffdd..f5394f5

- Scope: `src/main/services/updateInstaller.js` in `git diff 343ffdd f5394f5 -- src scripts`, plus the two new tests in `scripts/audit/ipc-security.test.mjs`. The FF-1 and query-bank edits are data only and have no security effect.
- It answers `audit-343ffdd-security.md` L-1 and L-2, which `responses-343ffdd.md` lists as fixed.
- Not re-raised (accepted residuals):
  - no Authenticode publisher check (S8-r2/S20-r3b);
  - launch with no audit row (N8);
  - the gap between the mark size check and the read (N3-r1);
  - any race no wider than two back-to-back syscalls.
- Method: injected probes through the real `updates:install` handler, with the Electron stub and a stubbed `shell.openPath`, in a scratch copy of the repo. Runs were on Linux, as root, on ext4, with Node 22.22.0.
  - **Measured** means it ran there.
  - **Reasoned** means Windows behaviour I did not run.
  - Every probe forces its interleaving. No timing race loops were run.
- Tests: `npm run -s test:integrity` exits 0 (IPC 53/53).
- Date: 2026-11-11 10:06 IST

## Short answer

**No findings at Low or above.** Both 343ffdd items hold as far as they go:

- **L-1 (no owner check on a just-made folder): closed on POSIX.** Measured with the test at `:1118`, and with a non-root variant that fakes the uid through `fs.promises.lstat`. Both are refused on head and pass the folder on 343ffdd. On Windows the check is a no-op by design, unchanged.
- **L-2 (folder checked only after the open): closed for what it can close.** Three of the four suggested parts are in. The fourth is not, and that is harmless (see Info 1).

| Probe | Interleaving | Head (`f5394f5`) | 343ffdd |
|---|---|---|---|
| PROBE-pre | `install-X` swapped for a link to V during the installer open, before `:297` | Refused ("folder changed"). **V stays empty** | 0-byte file created in V |
| PROBE-name (old P1) | Link to V only for the `wx` open, then the real folder put back | Refused ("folder changed"). V holds a **0-byte** file | Refused with ENOENT. **V holds the full installer copy** |
| Test `:1088` | `install-X` swapped for a link to V after the `wx` open; V already holds a same-named file | Refused. V's file kept | Refused. V's file kept |
| N10-r1 replay (test `:1088` with the a11bd45 catch block) | as above | n/a | Deletes V's file (the test fails, as it should) |

## The pre-open and post-open checks (`updateInstaller.js:297-305`)

- **Pre-open (`:297`).** A swap that has already happened when the copy is about to be opened is refused before anything is created. The only remaining window is from `:297` to the `open` at `:298`, two back-to-back syscalls. A swap there creates one empty file in the other folder and is then refused at `:302`.
- **Post-open (`:300-305`).** The check requires three things:
  - `install-X` still has its identity;
  - `stagedPath` is a regular file;
  - `stagedPath` has the `dev`/`ino` of the app's own `wx` handle.

  So the copy is written only when the name leads to the file being written. The P1 case no longer puts installer bytes outside the app's folder (measured).
- **Links in the name.** `lstat(stagedPath)` follows a link in the folder part, but the folder check catches a linked folder. The `wx` open (`O_CREAT|O_EXCL`) never follows a link in the last part; it fails with EEXIST. A planted link under the copy's name can never satisfy `named.isFile()`.

## The truncate-on-mismatch path (`:303`)

- It acts only through the app's own handle, so it can only touch the inode this install created with `O_EXCL`. That inode is new and holds nothing yet. It cannot empty a user's file, even when the name or folder now leads somewhere else.
- It runs before any byte is written, so in practice it is a no-op. It is not a protection. What keeps bytes out of other folders is that the copy starts only after `:302`. See correctness Info.
- Windows (reasoned): `ftruncate` maps to `SetFileInformationByHandle(FileEndOfFileInfo)` on a `GENERIC_WRITE` handle from `CREATE_NEW`. It works with the handle open and needs no share mode.
- Errors are swallowed and the refusal is still thrown. The handle is closed in the catch at `:335`.

## The owner check on a freshly made staging folder (`:182-197`, `:215-218`)

- **POSIX (measured).** A folder that is in place at `:196` and owned by another uid is refused with "folder changed":
  - test `:1118`, which chowns to 4242 as root;
  - my lstat-uid probe, which works without root.

  Dropping `ownedByThisAccount` from `:197` (M8) lets the install continue, and both tests then fail. A folder swapped in between `mkdir` and the `lstat` at `:183` must now also be this account's.
- **POSIX, mode is still not checked for a just-made folder.** This is by design for N12 (mounts that report 0777). A folder of this same uid that is group- or world-writable could be swapped in during the `mkdir` → `lstat` window and accepted. That is a two back-to-back syscall window, and it needs such a folder on the same filesystem that the other account can rename, so it is not raised.
- **POSIX, shares that report a foreign owner.** On a CIFS mount without `uid=`, or NFS with squashing, every install is refused with "changed… Restart the ERP". The message does not name the cause. This is the pre-a11bd45 behaviour, not a regression, and N12 as written (owner = the user) is still satisfied.
- **Windows (reasoned).** `ownedByThisAccount` returns true on win32 (`:216`), so the fresh-folder check is identity only, as in 343ffdd. Who can swap `update-staging` is decided by the data folder's DACL, which is the same accepted residual as the in-place path (`ownStagingFolder`, `:212`). Nothing is newly opened or closed on Windows.

## Info (no finding)

1. **L-2 part 1 (take the folder identity inside `ensureStagingFolder`) was not adopted.**
   - `stagingDirIdentity` is still read by path at `:263`.
   - The last check inside `ensureStagingFolder` is a non-bigint `lstat(dir).isDirectory()` at `:198`.
   - So a real folder swapped in for `install-X` between `realpath` (`:192`) and `:198` is adopted. So is a link swapped in between `:198` and `:263`. Every later check then compares against the swapped folder, and the copy is staged and launched from it.
   - Who can do this: anyone with write access to `update-staging`. On POSIX that is only the ERP account itself (the folder is 0700). On Windows it is whoever the data folder's DACL lets write, and they can already write inside the real `install-X`.
   - So this gives no capability beyond the accepted write-access residual, and the link case is a back-to-back window. I note it only because `responses-343ffdd.md` lists L-2 as fixed.
   - If wanted, a two-line fix: take `lstat(dir, { bigint: true })` at `:198`, require `isDirectory()` and `uid` as for the parent, and return it with `realDir` for `stageInstaller` to use instead of `:263`.
2. **N5-r3b (`removeOwnCopy` between the last `folderIsOurs()` and `unlinkSync`) is unchanged.** It is a back-to-back window, already accepted.
3. **Windows identity comparisons (reasoned).** libuv's `fstat` on the `wx` handle and its `lstat` on the path both read `VolumeSerialNumber` and the file index through `fs__stat_handle`, so `sameFile(named, copyIdentity)` holds for the same file. On SMB or FAT data folders with weak file IDs, the check fails open to the 343ffdd behaviour, not to anything worse.
