# In-house security audit: f5394f5..084a72c

- Scope: `src/main/services/updateInstaller.js` in `git diff f5394f5 084a72c -- src scripts`, plus the updater tests changed in `scripts/audit/ipc-security.test.mjs` (`:1118`, `:1148`, `:1176`).
  - The classifier, query-bank, FF-1 and verifier edits are read-only assistant data and logic. They have no security effect beyond which notice an answer shows; that is covered in the correctness report.
- It answers `audit-f5394f5-security.md` (no findings; one Info answered in `responses-f5394f5.md`).
- Not re-raised (accepted residuals):
  - no Authenticode publisher check (S8-r2/S20-r3b);
  - launch with no audit row (N8);
  - the gap between the mark size check and the read (N3-r1);
  - the staging folder's identity taken by path once (needs write access to `update-staging`);
  - any race no wider than two back-to-back syscalls.
- Method: injected probes through the real `updates:install` handler, with the Electron stub and a stubbed `shell.openPath`, in a scratch copy of `084a72c`. Runs were on Linux, as root, on ext4, with Node 22.22.0.
  - **Measured** means it ran there.
  - **Reasoned** means Windows behaviour I did not run.
  - Every probe forces its interleaving. No timing race loops were run.
- Tests: `npm run -s test:integrity` exits 0 (IPC 55/55, 0 skipped).
- Date: 2026-11-11 10:24 IST

## Short answer

**No findings at Low or above.** The updater change is small and fails closed:

| Change | Effect |
|---|---|
| `folderUnchanged()` (`:296-298`) wraps the folder `lstat` in `try`/`catch` and returns `false` on any error | A folder that vanished, or cannot be read, is refused with "folder changed", the same as a swapped one. Before, a missing folder threw ENOENT, which also refused, with the generic message. Neither way is a bypass |
| `truncate(0)` on mismatch removed | It was a no-op: the file was made by `wx` and nothing had been written to it (last round's Info). Nothing writes to the new file before the check at `:304`, so the copy still starts only after all three checks pass |
| `changed` alias removed | Rename only. Same message, same throw sites (`:184`, `:200`) |

## Probes on head

| Probe | Interleaving | Head |
|---|---|---|
| Test `:1148` | `install-X` swapped for a link to V during the installer open, before `:299` | Refused at `:299`. **V stays empty** (measured) |
| Test `:1176` | Link to V only for the `wx` open, then the real folder put back | Refused at `:304` by the name check. V holds a **0-byte** file, never installer bytes (measured) |
| Test `:1118` | Fresh `update-staging` reports another uid | Refused ("folder changed"), 0 launches (measured; the uid is faked through `fs.promises.lstat`, so no root needed) |
| PROBE-folder (scratch only) | `install-X` moved outside the data folder during the `wx` open, a link to it left in its place | Refused at `:304` by the folder check. 0 launches, a 0-byte file outside (measured) |

- **The three checks at `:299` and `:304` are each needed.**
  - Without the pre-open check, a 0-byte file is created through the link.
  - Without the name check, the full copy is written into a folder that is outside the app's own and only linked during the open.
  - Without the post-open folder check (PROBE-folder on M4), the full copy is written outside and launched.
  - Head refuses all three. The missing test for the last one is correctness M-1.
- **The launch path does not re-check the folder.** It hashes only the file (`main.js:1329`, file identity and size). A folder moved away during the copy stream, after `:304`, is therefore not caught at launch. Doing that needs write access to `update-staging`, which is the accepted "identity taken by path once" residual. It is not raised; it is noted here because PROBE-folder shows it is the folder check at `:304`, not the launch-time hash, that keeps the copy inside the app's folder.

## Tests as code that runs with the app's permissions

- The new tests patch `fs.promises.open` and `fs.promises.lstat` only inside `withPatchedOpen` or a `try`/`finally`. They put the originals back on every path, so a failing test cannot leave later tests running against a patched `fs`.
- Clean-up removes links with `rmSync(link, { force: true })` and no `recursive`, so it never deletes through a link. Victim folders come from `mkdtemp` under `os.tmpdir()` and are removed recursively only by their own path.
- `t.skip` on platforms without `process.getuid` is reported as skipped, not passed. That is the platform where the data folder's DACL is the accepted control.

## Windows (reasoned)

- `lstatSync` on a missing or locked folder throws ENOENT/EPERM/EBUSY. `folderUnchanged()` maps all of these to "changed". So a folder held open by antivirus between `:299` and `:304` refuses the update with the restart advice instead of the "locked" advice. This is fail-closed and a cosmetic difference only.
- Removing `truncate` removes the only `SetFileInformationByHandle` call on that path. Nothing else changed for Windows.

## Info (no finding)

- **The f5394f5 Info (identity taken by path once) is answered, not changed.** I agree it needs write access to `update-staging` and stays within the accepted residual.
- **`folderUnchanged()` swallows every error, not only ENOENT.** An unexpected error (say EIO on a failing disk) now shows "folder changed… Restart the ERP" rather than the code-bearing "could not be prepared (EIO)" message with `detail`. It still refuses. If the diagnostic detail matters, return `false` only for ENOENT/ENOTDIR and rethrow the rest, so the outer catch maps them.
