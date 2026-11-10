# In-house security audit: 66b024f..f9241ed

- Scope: `f0a0f3c` (removes the committed `node_modules` symlink; `.gitignore` now `node_modules`) and `f9241ed` (answers S6-S10 of `audit-66b024f-security.md`).
- Checkout: scratch clone `/tmp/claude-0/sec-f9241ed` at `f9241ed`, with `node_modules` copied from the main checkout. The main checkout's `node_modules` is a real directory again; `/home/claude/wt-prog/node_modules` is a link to it, no longer a loop.
- Tests: `npm run -s test:integrity` gives **238/238 pass** (213 + 25 IPC), exit 0, Node v22.22.0.
- Date: 2026-11-11 01:46 IST

## Summary

| # | Severity | Area | Status |
|---|----------|------|--------|
| S7 | was Medium | Shared references in `boundedCopy` | **Fixed.** The 1 MB payload that held the main process for 4.85 s now takes 24 ms. The 10 MB payload that took 74 s now takes 330 ms. Handler time is now 0.2-0.3x of the structured-clone time Electron already spends on the same message |
| S6 | was Medium | Committed `node_modules` symlink | **Fixed.** `git ls-files -s \| grep ^120000` is empty, and `git check-ignore node_modules` matches `.gitignore:2`. The link is still in the history at `7b23f17`, and no CI guard was added (S6-r) |
| S8 | Low (residual, narrowed) | Manual updater | **Symlink, directory link and sub-folder escapes are fixed.** Two gaps remain. (1) The file is checked **before** the live backup and opened **after** it, so a file swapped during the backup is launched (S8-r1, TOCTOU, measured). (2) Hard links and the missing signature check are still open (S8-r2) |
| S11 | Info (new) | `"(repeated)"` marks values that were dropped, and a code comment overstates `for...in` | Cosmetic |
| S9 | Info (residual) | Escape bytes are not counted | Unchanged; fails closed |
| S10 | Info (residual) | Company-scoped previews are sign-in only | Unchanged |
| S3 / S5 | Low / Info (residual) | Manifest trimming; `guarded()` grant labelling | Unchanged |

**IPC and preload names:** none were renamed, removed or added. `src/preload/` has no diff in range, and no `handle(`, `guarded(` or `sessionGuarded(` line changed in `main.js`.

**New SQL** (`inventoryService.js:375-435`, `supplierReturnSplit`): fully parameterised, and the sub-selects have no interpolation. `init.js:1012-1074` is arithmetic only.

## Findings

### S7 (was Medium): fixed

**Where.** `src/main/services/supportBundleService.js:41-77`:
- Every visit costs at least 1 unit (`:44`).
- Each object is copied once per call, through a per-call `WeakSet` (`:54-55`, created at `:89`).
- Keys are read with `for...in` and `hasOwnProperty` (`:71-72`).

**Re-run through the real `health:support-bundle` handler as `viewer`** (`/tmp/claude-0/sec-probe/ipc-probe-f9241ed.mjs`). "Clone" is the V8 serialize and deserialize that Electron does anyway.

| Payload | IPC size | Clone | Handler (66b024f → f9241ed) | Output |
|---|---|---|---|---|
| Shared 100k-key object, 200^4 references | 0.95 MB | 96 ms | 4.85 s → **24 ms** | 10 KB |
| Shared 1M-key object, 200^4 references | 10.4 MB | 1,632 ms | ~74 s → **330 ms** | 10 KB |
| 10 distinct 100k-key objects | 9.4 MB | 947 ms | **238 ms** | 37 B |
| 200 x 200 distinct 200-key objects | 57 MB | 930 ms | **16 ms** | 756 B |

**Direct calls** (`/tmp/claude-0/sec-probe/bsc-f9241ed.mjs`, log `bsc-f9241ed.log`). The worst ratio of copy time to clone time was **0.45x**, for 1M integer keys (186 ms copy against 415 ms clone).
- 5 distinct 1M-key objects (52 MB): 1.6 s copy against 10.3 s clone.
- Shared-array DAG at depth 8 (Date leaves or holes): 0 ms.
- Sparse arrays of length 2^32-1, singly or 200 of them: 0 ms and 20 ms.
- An array with 1M named properties: 0 ms. Arrays are read by index only.
- Map and Set with 1M entries: 0 ms, dropped.
- 200 references to one Map: 0 ms.
- `__proto__`, `constructor` and `prototype` keys are still skipped, and nothing was polluted.
- Top-level user fields are still stripped.

**Ways around the fix that were tried, and why they fail**
- **Huge numbers of own keys.** `for...in` still lists every key before the first iteration: measured 286 ms for 1M keys, even with an immediate `break` (see S11). The `WeakSet` limits that to once per object, so the total cost is linear in the IPC message and always below its clone cost.
- **Inherited keys.** These cannot come over IPC: structured clone yields only `Object.prototype` or array prototypes. A non-plain prototype is also dropped at `:66-67`.
- **Holes.** Each hole read costs 1 unit, and at most 200 indices are read per array.
- **Map/Set.** These are dropped after one visit.

The only remaining way to block the main process is to send a large IPC message. That cost comes from Electron's deserialization, not this code, and applies to every channel.

### S6 (was Medium): fixed; a guard is still missing (S6-r, Info)

**Where.** `f0a0f3c` removes the tree entry. `.gitignore:2` is now `node_modules`, which matches a file, a link or a directory at any depth.

**Checked**
- `git ls-files -s | grep ^120000` is empty.
- `git ls-files | grep -c node_modules` is 0.
- `git check-ignore -v node_modules` gives `.gitignore:2`.

**Residual**
- The link is still in the branch history (`7b23f17` added it; `git log --all -- node_modules` lists both commits). Checking out any commit from `7b23f17` to `66b024f` would again replace an ignored `node_modules` directory with the self-pointing link. A squash merge of PR #4 removes this. A merge commit keeps it in reachable history.
- Fix item 2 of S6 was not done. No CI or pre-commit step rejects mode-`120000` entries or a tracked `node_modules`. **Fix:** add a check to `scripts/verify-audit.js` or CI that fails when `git ls-files -s | awk '$1=="120000"'` is not empty, or when any tracked path segment is `node_modules`.

### S8-r1 (Low, residual): installer swapped between the check and the launch

**Where.** `src/main/main.js:1266` checks the installer with `assertInstallerInsideUpdateFolder` (`:528-545`, realpath at `:538-540`). Then `:1278` awaits `createLiveBackup`, and only after that does `:1279` call `shell.openPath(selectedInstaller)` on the **path string**. Nothing re-checks the file, and nothing holds it open.

**Exploit path.** Someone who can write to the update folder (`Documents\GII GeM ERP Updates`, or `GII_GEM_ERP_UPDATE_DIR`) waits for an admin to click Install. Once the check has passed, they replace `GII-GeM-ERP-Setup-<v>-x64.exe` with a different EXE or with a symlink or junction to a file elsewhere. `shell.openPath` follows the new entry.

The window is as long as the live backup, which grows with the database: about 400 ms for a 200 MB database here, and longer on a real books database with a slow disk.

**Measured** (probe, admin, 200 MB padded database): the probe swapped the file 5 ms after the backup file appeared, for a symlink to `/tmp/gii-out3-*/GII-GeM-ERP-Setup-50.0.0-x64.exe`. `shell.openPath` was then called on the update-folder path, whose realpath was the **outside** file (content `MZevil`). The handler returned success. The audit log records the checked basename (`:1280`), not what actually ran.

**Severity.** Low. The same attacker can already put any EXE named `Setup-99.0.0` in the folder (S8-r2), so this adds a stealth variant: the file the admin checked was the real one. It does not need a compromised renderer.

**Fix**
- Preferred: after the backup, copy the installer into an app-private staging folder under `runtimeDataRoot`. Check the copy (regular file, size, and ideally its Authenticode signature and publisher, see S8-r2), then launch the copy.
- At minimum: run `assertInstallerInsideUpdateFolder` again immediately before `shell.openPath`, and compare `dev`/`ino`/`size`/`mtimeMs` with the first check. This only narrows the window.

### S8-r2 (Low, residual): hard links accepted; still no signature check

**Re-run through the real handler** (admin; the update folder itself was reached through a symlink, to test realpath on both sides):

| Attempt | 66b024f | f9241ed |
|---|---|---|
| `Setup-10.0.0` symlink to an outside EXE | **launched** | refused ("not directly inside the update folder") |
| `sub/Setup-12.0.0` | **launched** | refused |
| `dirlink/Setup-11.0.0`, a directory link (junction analogue) | not tested | refused |
| Directory named `Setup-13.0.0-x64.exe` | not tested | refused (`isFile` false) |
| FIFO named `Setup-14.0.0-x64.exe` | not tested | refused |
| `Setup-99.0.0` symlink to an in-folder `Setup-0.0.0-alpha` | not tested | refused as a downgrade, because the version now comes from the realpath name (`:1270`) |
| The same file through the real folder path, `./` or `//` | launched | launched (correct) |
| Outside absolute path, `../`, NUL byte, wrong case | refused | refused |
| viewer | refused | refused |
| **`Setup-15.0.0` hard link to an outside file** | launched | **launched** |

**Hard links.** A hard link is a regular file directly in the folder, so it passes. That is the same as copying the file in, and needs the same folder write access, so it is not a separate escape. It does mean the check cannot be described as "the file came from here".

**Windows-specific cases.** These were reasoned from Node's JS `fs.realpathSync`, which on win32 resolves only link components and keeps case and 8.3 names as typed, and from `path.win32` probes. They were not run on Windows.
- **8.3 names** (`C:\UPD~1\…`), **different case** (`c:\upd\…`), **`\\?\` device paths** and **UNC** paths do not string-equal the realpath of the folder, so they are **refused**. This fails closed. The UI passes `status.installerPath`, which is built from the same folder string, so normal use is not affected.
- **Junctions** are reported as symlinks by libuv, so they are resolved and refused like the directory-link row above.
- A trailing `.`, a trailing space or `::$DATA` fails the `/\.exe$/` test, so it is refused.
- **ADS.** A name like `GII-GeM-ERP-Setup-9.9.9-x64.exe:s-x64.exe` passes the `.exe` test, the "directly in the folder" test and the name regex (version `9.9.9-x64.exe:s`, which `compareUpdateVersions` ranks above `1.0.0`). It would reach `shell.openPath`.
  - This needs a renderer that sends a hand-made path, because `readdir` does not list streams.
  - It needs the same folder write access.
  - Whether ShellExecute runs an EXE from a stream depends on the Windows build.
  - Info only. **Fix:** reject any `:` after the drive letter, for example `/^[^:]+$/.test(path.basename(p))`.

**Still open from S8.** The version comes from the file name, and the EXE's own version, publisher and signature are never checked. **Fix:** verify the Authenticode signer before launch, for example with `Get-AuthenticodeSignature` through `execFile`, or by pinning a SHA-256 published in a signed `latest.json`. Do this together with the staging copy in S8-r1.

### S11 (Info, new): `"(repeated)"` for dropped values; the `for...in` comment is inaccurate

**Where.** `supportBundleService.js:54-55` and `:66-67`, and the comment at `:70`.

1. The `WeakSet` records an object **before** the prototype check. The first reference to a Map, Set, Date or typed array is dropped, but every later reference is written as `"(repeated)"`. Measured: `{x: Array(200).fill(map)}` gives `["(repeated)", …]` with nothing to refer back to. A support reader may think data is there. **Fix:** move `seen.add` after the prototype check, or return `undefined` for a seen object whose first copy was dropped.
2. The comment says "for...in stops at the cap without listing every key first". V8 builds the full key list when the loop starts: 286 ms for 1M keys with an immediate `break`, and 129 ms for 1M integer keys. The `WeakSet`, not `for...in`, is what bounds the cost. **Fix:** correct the comment so nobody later removes the `WeakSet` because they rely on it.

### S9, S10, S3, S5 (residual, unchanged)

- **S9 (Info).** The string charging at `supportBundleService.js:47-50` is unchanged. 26 strings of 20,000 `\u0001` still give `{"omitted": …}`, in 3 ms. Fails closed.
- **S10 (Info).** `reset:preview`, `reset:analyze-dependencies`, `go-live:preview` and `money:integrity` were not touched. There is still no per-user company scoping, so no boundary is crossed.
- **S3 (Low).** `scripts/update-audit-manifest.js` has no diff in range.
- **S5 (Info).** `guarded()` still uses `firstPayload(args)`.

## Probe files

- `/tmp/claude-0/sec-probe/bsc-f9241ed.mjs` (log `bsc-f9241ed.log`): direct `boundedScreenContext` probes on structured-clone payloads. Covers S7, wide or integer-keyed objects, holes, Map/Set, strings and proto keys.
- `/tmp/claude-0/sec-probe/ipc-probe-f9241ed.mjs` (log `ipc-probe-f9241ed.log`): run with `node --import ./scripts/audit/lib/electron-register.mjs` from the clone. Covers the support bundle through the real handler as `viewer`, every updater path case in S8-r2 as admin, and the TOCTOU swap during the live backup.
- `/tmp/claude-0/sec-probe/tests-f9241ed.log`: the `test:integrity` run.
