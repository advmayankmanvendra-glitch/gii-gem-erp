# In-house security audit: f9241ed..372c89d

- Scope: `dc40f03` (answers S8-r1, S8-r2, S11 and the S6 guard from `audit-f9241ed-security.md`) and `372c89d` (rewrites the `supplierReturnSplit` SQL, and changes the GRN receipt value and the zero-value return voucher).
- Checkout: scratch clone `/tmp/claude-0/sec-372` at `372c89d`, with `node_modules` copied from the main checkout. `/home/claude/gii-gem-erp` and `/home/claude/wt-prog` were only read.
- Tests: `npm run -s test:integrity` gives **241/241 pass** (216 + 25 IPC), exit 0, Node v22.22.0. Log: `/tmp/claude-0/sec-probe/tests-372c89d.log`.
- Date: 2026-11-11 05:30 IST

## Summary

| # | Severity | Area | Status |
|---|----------|------|--------|
| S8-r1 | Low (residual, narrowed) | Installer swapped during the live backup | **Links, folder swaps and directory swaps are now refused** (measured, 5 swap kinds). **A plain file replaced by another plain file is still launched**: rename-over, overwrite in place, or a hard link (measured, 3 of 3). A short gap is left between the re-check and the moment the OS opens the file |
| S8-r2 | Low (residual) / ADS part fixed | `:` stream names; hard links; no signature check | **`:` names are refused** (`main.js:530-533`, measured, plus a new IPC test). Hard links are still accepted. The Authenticode or hash check is still missing |
| S11 | Info | `"(repeated)"` written for dropped values | **Fixed.** Measured: 200 references to one Map now give `[]`, not 200 `"(repeated)"` entries. The comment is corrected. S7 timings are unchanged |
| S6-r | Info (residual, narrowed) | Guard against committed links and `node_modules` | **Added** (`audit2-regressions.test.mjs:1152-1159`). Two gaps: git's path quoting can hide a top-level `node_modules` (measured), and no CI workflow runs the test |
| S12 | Info (new, partly old) | The "guided" realpath message rarely appears | A missing update folder or a looping link in it still gives a raw `ENOENT` or `ELOOP` error from code that runs before the new `try` |
| SQL | none | `supplierReturnSplit` rewrite | **Clean.** The only template fragment is the constant `billVoucher`. Every value is a `?` parameter |
| S9 / S10 / S3 / S5 | Info / Low (residual) | Unchanged | No diff in range |

**IPC and preload names:** none were renamed, removed or added. `src/preload/` has no diff in `f9241ed..372c89d`. No `handle(`, `guarded(`, `sessionGuarded(` or `ipcMain` line was added or removed in `main.js`. The only IPC test change adds one assertion to the existing updater test (`ipc-security.test.mjs:478`).

## Findings

### S8-r1 (Low, residual, narrowed): plain-file swap during the backup is still launched

**Where**
- `src/main/main.js:1276`: the first check returns the realpath, `selectedInstaller`.
- `:1288`: `await createLiveBackup(...)`.
- `:1290-1293`: new. It runs `assertInstallerInsideUpdateFolder(selectedInstaller, status.updateFolder)` again and requires the same realpath back.
- `:1294`: `shell.openPath(selectedInstaller)` on the path string.

**What the re-check closes.** The re-check follows links and requires the file to sit directly in the real folder and be a regular file (`lstat().isFile()`). So any swap that changes **where the path resolves** is now caught.

**What it cannot see.** It compares paths only, not file identity. It does not compare `dev`/`ino`/`size`/`mtime` with the first check, and it does not hash the file. A different **regular file** at the same real path passes.

**Measured through the real `updates:install` handler** (admin; 200 MB padded database; the update folder is itself reached through a symlink). The probe swapped the file 1-15 ms after the backup file appeared. The handler took 437-501 ms in total.

| Swap during the backup | f9241ed | 372c89d |
|---|---|---|
| Plain file replaced by a symlink to an outside EXE | **launched** (outside file) | refused ("not directly inside the update folder") |
| Plain file replaced by a directory of that name | not tested | refused |
| Update-folder link re-pointed to another folder holding the same name | not tested | refused |
| Real folder renamed and a link to another folder put in its place | not tested | refused ("The installer changed while the backup was being made") |
| **Plain file replaced by another plain file (write then rename over)** | launched | **launched**: `openPath` opened content `MZswapped-plain` |
| **Plain file overwritten in place** | launched | **launched**: content `MZoverwritten` |
| **Plain file replaced by a hard link to an outside EXE** | launched | **launched**: content `MZevil` from `/tmp/gii-out4-*/…` |

In every launched case the audit log records the checked basename and version (`:1295`), not a digest of what actually ran.

**Exploit path.** This is unchanged for the three plain-file rows. Someone who can write to `Documents\GII GeM ERP Updates` (or `GII_GEM_ERP_UPDATE_DIR`) waits for an admin to click Install. During the backup, they write a different EXE over the checked one. On Windows, a running ShellExecute target cannot be overwritten, but the file is not open during the backup, so the overwrite works. The window still grows with the database size.

**Remaining gap after the re-check.** The re-check is synchronous and `shell.openPath` is called in the same tick. Electron still hands the path to the OS asynchronously (ShellExecute on Windows), so a gap of a few milliseconds remains even for link swaps. This is far narrower than before, and was not measurable with the mocked `shell`.

**Severity.** Low, unchanged. The same writer can already drop any `Setup-99.0.0` EXE in the folder (S8-r2). The swap only adds stealth: the admin checked the right file.

**Fix** (same as before; the re-check was the "at minimum" option).
- Preferred: after the backup, copy the installer into an app-private staging folder under `runtimeDataRoot`, opened with an exclusive handle. Verify the copy's Authenticode signer, or a SHA-256 from a signed `latest.json`. Launch the copy.
- Cheaper: record `fs.statSync(selectedInstaller)` `{dev, ino, size, mtimeMs}` at the first check and compare at the re-check. That catches rename-over and hard-link swaps. An in-place overwrite that keeps the size and resets the mtime still passes, which is why the hash or signature check is the real fix.

### S8-r2 (residual): `:` stream names fixed; hard links and signatures still open

**Where.** `main.js:530-533` refuses any `:` in `path.basename(path.resolve(p))`, before the `.exe` test.

**Measured**
- `GII-GeM-ERP-Setup-9.9.9-x64.exe:s-x64.exe` (the S8-r2 case) is refused: "The installer name cannot contain ":"".
- `…x64.exe:s.exe` is refused the same way.
- A `:` in a directory part (`a:b/Setup…`) is refused as "not found".
- On Windows, `path.basename` of `C:\upd\X.exe:s-x64.exe` is `X.exe:s-x64.exe`, so the drive-letter colon does not cause false refusals. This was reasoned from `path.win32`, not run on Windows.
- `ipc-security.test.mjs:478` now pins this case.

**All earlier cases are unchanged:**
- refused: symlink, sub-folder, directory link, a directory or FIFO named `.exe`, the in-folder downgrade alias, `../`, an outside absolute path, a NUL byte, and the viewer role
- accepted (correct): a regular file, including through the real folder path and `./` or `//`
- **still launched:** a hard link to an outside file (`Setup-15.0.0`). This needs the same folder write access as copying a file in

**Still open.** The EXE's signature, publisher and version are never checked. The fix is the same as in S8-r1.

### S11 (Info): fixed

**Where.** `supportBundleService.js:53-54` drops non-plain, non-array objects **before** the `WeakSet` check at `:56`. The `for...in` comment now says that the visited set, not `for...in`, keeps the cost bounded.

**Measured** (`/tmp/claude-0/sec-probe/bsc-372c89d.mjs`, log `bsc-372c89d.log`)

| Payload | Output |
|---|---|
| `{x: Array(200).fill(map)}` | `{"x":[]}` (was 200 x `"(repeated)"`) |
| 200 references to one Date, plus a shared plain object | `{"x":[],"y":[{"a":1},"(repeated)"]}` |
| 200^4 shared arrays ending in one Map | 0 ms, 7.8 KB. The arrays are still marked `"(repeated)"`, which is correct because the first copy is present |
| Null-prototype object referenced twice | kept, then `"(repeated)"` |

**No regression.** A dropped object is not added to the `WeakSet`, so each further reference costs 1 unit instead of 13. Every visit still charges `budget.left` at `:44`, and the containers that hold those references are still guarded by the `WeakSet`. So the shared-Map DAG stays at 0 ms.

**Real-handler re-run of S7** (`health:support-bundle` as viewer):

| Payload | IPC size | Clone | Handler |
|---|---|---|---|
| Shared 100k-key object | 0.95 MB | 78 ms | 22 ms |
| Shared 1M-key object | 10.4 MB | 1,231 ms | 319 ms |
| 10 distinct 100k-key objects | 9.4 MB | 842 ms | 166 ms |
| 200 x 200 distinct 200-key objects | 57 MB | 2,157 ms | 41 ms |

All copies stay below the clone cost (worst direct-call ratio 0.51x, for 1M integer keys). `__proto__`, `constructor` and `prototype` keys are still skipped, nothing was polluted, and top-level user fields are still stripped.

### S6-r (Info, residual, narrowed): the new guard can be bypassed by quoting, and does not run in CI

**Where.** `scripts/audit/audit2-regressions.test.mjs:1152-1159` runs `git ls-files -s` and fails on any `120000 ` line or any line matching `/\t(.*\/)?node_modules(\/|$)/`.

**What works.** The link check is sound. Mode `120000` is recorded in the index even on Windows clones with `core.symlinks=false`. Nested `sub/node_modules/…` is caught.

**Gap 1: path quoting (measured in a throwaway repository, `/tmp/claude-0/sec-probe/gitq-*`).**
- With the default `core.quotePath=true`, git writes any path with non-ASCII or control bytes in quotes: `\t"node_modules/caf\303\251.js"`.
- The regex needs `node_modules` right after the tab, so a **top-level** quoted entry is missed: measured `false`. A nested quoted entry still matches, because `.*\/` consumes the quote.
- In practice a real committed `node_modules` would almost always include an unquoted ASCII path that trips the check. So this is Info.
- **Fix:** use `git ls-files -s -z` and split on `\0`, or match `/(^|\/)node_modules(\/|$)/` on the path part only.

**Gap 2: no CI.** The repository has no `.github/workflows`. The guard only runs when someone runs `test:integrity` locally. It also calls `t.skip` when `git` fails, for example in a tarball. **Fix:** run `test:integrity`, or at least this test, in CI or a pre-commit hook.

**Unchanged residual.** The `node_modules` link is still in branch history at `7b23f17..66b024f`. A squash merge of PR #4 removes it.

### S12 (Info, new, mostly pre-existing): the guided realpath message covers only a narrow case

**Where.** `main.js:542-549` wraps the two `realpathSync` calls. It is reached only when `existsSync` passed and `realpath` then failed, which needs a race or an `EACCES` on a parent folder. Two common failures happen earlier and still show raw errors:

| Case | What runs first | Error shown (measured) |
|---|---|---|
| Update-folder link points to a missing folder | `ensureUpdateFolder` `mkdirSync` (`:416`) | `ENOENT: no such file or directory, mkdir '…-link'` |
| A self-looping link named `GII-GeM-ERP-Setup-60.0.0-x64.exe` in the folder | `newestSetupInFolder` `statSync` (`:477`) | `ELOOP: too many symbolic links encountered, stat '…'` |

**Exploit path.** A single dangling or looping link with the installer name, placed by anyone who can write to the folder, makes `updates:status` and `updates:install` throw for every installer. That is a nuisance-level denial of service on manual updates. It needs the same folder access as S8, which could just as easily delete the installer, and the error text holds only the update-folder path.

**Fix**
- In `newestSetupInFolder`, use `lstatSync` (or wrap `statSync` in a try) and skip entries that are not regular files.
- In `ensureUpdateFolder`, catch the error and give the same guided message.

### SQL review: `supplierReturnSplit` (`inventoryService.js:374-437`): no injection

- `billVoucher` (`:374-376`) is a constant string literal with no `${}` inside it. It is spliced twice at `:383-384`, the only interpolation in the statement.
- The values `company_id`, `supplier_id` and `item_id` are bound through `?` (`.all(row.company_id, row.supplier_id, row.item_id)`).
- No user-controlled text reaches the SQL.
- `EXPLAIN QUERY PLAN` (`/tmp/claude-0/sec-probe/eqp-372c89d.log`) shows SQLite flattens both derived tables into primary-key lookups. The correlated sub-selects use `idx_vouchers_source`, so the rewrite adds no per-voucher scan. The plan does show a `SCAN sl` over `stock_ledger` for each return; that is a performance note for the correctness review, not a security issue.
- `init.js:1026` (GRN receipt value) and the zero-value voucher condition (`inventoryService.js:486`) are arithmetic only.

### S9, S10, S3, S5 (residual, unchanged)

The relevant code has no diff in range (`supportBundleService.js` string charging, the reset and go-live preview handlers, `scripts/update-audit-manifest.js`, and `guarded()`). S9 was re-measured: 26 x 20,000 `\u0001` still gives `{"omitted": …}` in 3 ms, which fails closed.

## Probe files

- `/tmp/claude-0/sec-probe/ipc-probe-372c89d.mjs` (log `ipc-probe-372c89d.log`). Run it with `node --import ./scripts/audit/lib/electron-register.mjs` from the clone. It covers:
  - the support bundle through the real handler as viewer
  - every updater path case, plus the `:` cases
  - seven swap-during-backup variants
  - the raw ENOENT and ELOOP paths
- `/tmp/claude-0/sec-probe/bsc-372c89d.mjs` (log `bsc-372c89d.log`): direct `boundedScreenContext` probes, including the S11 cases.
- `/tmp/claude-0/sec-probe/eqp-372c89d.mjs` (log `eqp-372c89d.log`): the query plan of the rewritten lots query.
- `/tmp/claude-0/sec-probe/tests-372c89d.log`: the `test:integrity` run.
