# In-house security audit: a11bd45..343ffdd

- Scope: `src/main/services/updateInstaller.js` in `git diff a11bd45 343ffdd -- src scripts`, plus the two new tests in `scripts/audit/ipc-security.test.mjs`. The FF-1 and query-bank edits are data only and have no security effect.
- It answers `audit-a11bd45-security.md`: N10-r1, N11, N5-r3, N5-r3b, N9-r2 and N12.
- Not re-raised (accepted residuals): no Authenticode publisher check (S8-r2/S20-r3b), launch with no audit row (N8), the gap between the mark size check and the read (N3-r1).
- Method: injected probes through the real `updates:install` handler, with the Electron stub and a mocked `shell.openPath`, in a scratch copy of the repo (`/tmp/claude-0/.../scratchpad/mut`). Runs were on Linux, as root, on ext4. **Measured** means it ran there. **Reasoned** means Windows behaviour I did not run. No real-time race loops were run this round. Every probe forces the interleaving it describes.
- Tests: `npm run -s test:integrity` exits 0 (IPC 51/51).
- Date: 2026-11-11 09:47 IST

## Short answer

- **N10-r1 is closed (measured).** I put a file with the installer's name in V, made `install-X` a link to V, and forced EEXIST. V's file was kept. The failure clean-up now needs the folder's `dev`/`ino` to match before it touches anything.
- **N11 is closed by construction.** The copy's identity now comes from `output.stat()` on the app's own `wx` handle (`:286-287`), never from a path.
- **N5-r3 is closed.** `removeStagingTree` no longer unlinks any link inside a folder (`:90-92`). The only unlink left on a link is the folder argument itself, and that is an app-owned name (`:76`).
- **N12 is addressed.** A freshly made folder is now accepted on `dev`/`ino`, not mode.
- **Two new Low items, below.** One is a regression on POSIX (L-1). The other leaves a file the app created outside its folder (L-2). Neither leads to a launch on its own.

| ID | Severity | Where | One line |
|---|---|---|---|
| L-1 | Low (regression, POSIX only) | `updateInstaller.js:181-182`, `:195` | `madeHere` is taken by path after `mkdir`. A folder swapped in between those two calls is accepted with **no owner check**, and the installer is staged and launched from inside it |
| L-2 | Low | `updateInstaller.js:254`, `:286-290` | The folder is checked again only **after** the `wx` open, against an identity taken by path. A swap leaves a file the app created, sometimes a full installer copy, in another folder |

## L-1 (Low, regression on POSIX): a folder swapped in right after `mkdir` skips the ownership check

**Code.** `ensureStagingFolder` runs `mkdir(expected, 0o700)` at `:181`. It then takes `madeHere = lstat(expected)` by path at `:182`. At `:195`, for a folder "made here", the only check is `sameFile(nowStats, madeHere)`. `ownStagingFolder` (uid and mode) is skipped.

**Scenario.**
1. Another local account can write to the data folder: a group-shared `GII_GEM_ERP_DATA_ROOT` on Linux.
2. That account replaces `update-staging` with its own 0777 folder between `mkdir` resolving and the `lstat` (one thread-pool round trip).
3. `madeHere` records the attacker's folder, so `stillOurs` is true.
4. The copy is staged inside a folder the attacker owns. The attacker can then swap the staged file between the re-hash (`main.js:1329`) and `shell.openPath` (`main.js:1332`).

**Measured.** Probe P4 patches `fs.promises.mkdir` to replace the new folder with a uid 1000, 0777 folder:
- On `343ffdd`: the install proceeds and `openPath` is called on `.../update-staging/install-etNv9m/GII-GeM-ERP-Setup-97.0.0-x64.exe` inside the uid 1000 folder.
- With `:195` reverted to `ownStagingFolder(nowStats)` (the `a11bd45` check): refused with "update-staging folder changed".

**Windows (reasoned).** `ownStagingFolder` returns true on win32, so nothing changes there. The product is Windows-first, which is why this is rated Low.

**Fix.** In the `madeHere` branch, keep the owner check and drop only the mode check. The N12 mounts report the user's own uid, so this still satisfies them:

```js
const stillOurs = madeHere
  ? nowStats.isDirectory() && sameFile(nowStats, madeHere) && (typeof process.getuid !== "function" || Number(nowStats.uid) === process.getuid())
  : ownStagingFolder(nowStats);
```

## L-2 (Low): the folder check comes after the `wx` open, so a swap leaves a file in another folder

**Code.**
- `stagingDirIdentity` is read by path at `:254`, after `ensureStagingFolder` has returned. It is not the identity that `:196` validated.
- The copy is opened with `wx` at `:286`.
- Only after that is `install-X` compared with `stagingDirIdentity` (`:288`).
- Nothing checks that `stagedPath` still names the handle's file.

**Measured (injected, `343ffdd`):**

| Probe | What happens | Result |
|---|---|---|
| P2: `install-X` swapped for a link to V during the installer open, and left | `wx` creates `V/GII-GeM-ERP-Setup-98.2.0-x64.exe`. Then `:288` refuses ("folder changed") | **A 0-byte file is left in V.** `removeOwnCopy` correctly does nothing, because the folder is not ours |
| P1: link in place only for the `wx` open, then the real folder is put back | `:288` passes. The full copy is written through the handle **into V**. The re-hash opens `stagedPath` in the real folder, gets ENOENT, and is refused | **The full installer copy (19 bytes) is left in V.** No launch |
| P3: N10-r1 replay (EEXIST in V) | Refused (EEXIST) | V's file kept: **N10-r1 closed** |

**Impact.**
- The app creates and leaves a file named like the installer, possibly with the installer's bytes, in any folder its account can write. Nothing is deleted and nothing is launched.
- Precondition: write access to `update-staging`. On POSIX that is the ERP's own account, since the folder is 0700. On Windows it inherits the data folder's DACL (reasoned). P2 also works for anyone who can swap `update-staging` itself in the data folder.
- The `stagingDirIdentity` re-anchor at `:254` has the same effect for a swap of the parent between `:196` and `:254`. Everything after that is checked against the swapped folder.

**Fix.**
1. Have `ensureStagingFolder` return the `install-X` bigint identity from its own `lstat` at `:196`. Use that instead of the by-path `lstat` at `:254`.
2. Run the folder check before the `wx` open as well as after it.
3. After the open, also require `sameFile(fs.lstatSync(stagedPath, { bigint: true }), copyIdentity)`. That catches P1, where the path no longer names the open file.
4. On any mismatch, `await output.truncate(0)` before closing, so no installer bytes are left behind. The app cannot unlink by handle, and an empty file is the least it can leave.

## Status of the a11bd45 items

- **N10-r1: closed (measured, P3).** The clean-up goes through `removeOwnCopy` (`:111-124`) and requires the folder's `dev`/`ino` first. No test covers it. See correctness M-1.
- **N11: closed.** The identity comes from the `wx` handle (`:286-287`). The writer uses the same handle (`:299`), so the bytes and the identity are the same file. Size is set from `copied` (`:302`).
- **N5-r3: closed.** No link inside a staging folder is ever unlinked any more. A planted link keeps `update-staging.old-*` around, and it is warned about at each start. That costs only disk entries.
- **N5-r3b: narrowed, not closed.**
  - `removeStagedCopy` checks the folder identity, then the file identity, then the folder again, then calls `unlinkSync` (`:116-120`). A swap between the last `folderIsOurs()` and `unlinkSync` can still unlink `V/<name>`. That is now a gap between two adjacent synchronous syscalls, not the earlier wider window.
  - `removeStagingTree` one level down (`:95-96`) is unchanged.
  - Precondition and fix are as before: write access to `update-staging`; an owner-only DACL on Windows.
- **N9-r2:** the check before the `wx` open is not in place (L-2).
- **N12: addressed.** The test at `:1037` covers it. L-1 is the side effect.

## Windows behaviour (reasoned)

- A junction is reported by `lstat` as a symbolic link (libuv `S_IFLNK` for mount points). So a junction planted inside `update-staging` is now counted and left, never unlinked, and the folder checks see a different `dev`/`ino`.
- `RemoveDirectory` on a junction (`rmdirSync` at `:123`) removes only the junction. And it only runs while the folder identity still matches.
- `open(..., "wx", 0o600)`: on Windows the mode only controls the read-only attribute. `0o600` keeps it writable, so later clean-up is not blocked.
- `ino` on NTFS is the 64-bit file index, which is precise with `bigint: true`. On SMB or FAT data folders file IDs may be weak. Then `sameFile` falls back to effectively `dev` only. That fails open to the pre-commit behaviour, not to anything worse. Not run.
- The write handle is closed before `pipeline` rejects (measured on Node 22), so `unlinkSync` at `:120` never meets Windows' delete-pending state for the app's own handle.
