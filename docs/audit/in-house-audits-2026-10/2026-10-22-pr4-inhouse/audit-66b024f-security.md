# In-house security audit: d661346..66b024f

- Repository: gii-gem-erp, PR #4, branch `claude/erp-full-automation-qbhv8k`, head `66b024f`
- In scope:
  - Our commits `7b23f17` (WIP: architecture fixes, zero-rate lots last) and `421b2bc` (closes the d661346 findings, including security N1).
  - How they interact with merged PR #5 (`c7f79c8`: paise, ledger guards, money integrity) and PR #6 (`3c2cd8b`: company reset, manual updater).
- Method:
  - Code read, then probes in a scratch clone (`/tmp/claude-0/sec-66b024f`, checked out at `66b024f`). Probe scripts are in `/tmp/claude-0/sec-probe/`.
  - IPC probes import the real `src/main/main.js` with `scripts/audit/lib/electron-stub.mjs`, sign in as `admin` and as a `viewer`, and pass every argument through `v8.serialize`/`v8.deserialize` (the structured clone that Electron IPC uses).
  - `/home/claude/gii-gem-erp` and `/home/claude/wt-prog` were only read, never changed.
- Tests: `npm run -s test:integrity` gives **235/235 pass** (211 + 24 IPC). The run used a working `node_modules` from `/tmp/claude-0/arch-deps`, because the repo's own one is broken (see S6).
- Date: 2026-11-11 01:26 IST

## Summary

| # | Severity | Area | Status |
|---|----------|------|--------|
| N1 (prev.) | was Medium | Sparse array, typed array or deep JSON in the support bundle | **Fixed.** A sparse array of length 2^32-1 costs 0 ms. Typed arrays, Map, Set, Date, RegExp and ArrayBuffer are dropped at 0 ms |
| S7 | **Medium (new)** | `boundedCopy` follows shared references again and again. One 1-11 MB IPC message holds the main process for 5-74 s. Any signed-in role can send it | New in `421b2bc` |
| S6 | **Medium (new)** | `7b23f17` committed a `node_modules` **symlink** to an absolute host path. Checking out the PR replaced the main checkout's real `node_modules` with a self-loop | New in `7b23f17`; still in `66b024f` |
| S8 | Low | Updater (PR #6): the downgrade guard trusts only the file name. A symlink or sub-folder inside the update folder is launched. There is no publisher or signature check | Partly older; the version gate is new |
| S9 | Info | Screen-context escape bytes are not counted, so control characters or lone surrogates drop the whole context | New in `421b2bc`; fails closed |
| S10 | Info | `reset:preview`, `reset:analyze-dependencies`, `go-live:preview` and `money:integrity` are sign-in only and now take any `company_id` | Not a boundary today (no per-user company scoping) |
| S3 | Low (residual) | Audit manifest can be trimmed consistently | Unchanged (`scripts/update-audit-manifest.js` not touched) |
| S5 | Info (residual) | `guarded()` grant row takes its company from any argument | Unchanged (`main.js:333`) |

**IPC and preload names:** none were renamed or removed.
- Added: `money:integrity` / `getMoneyIntegrity` and `money:rounding-adjustment` / `postRoundingAdjustment` (PR #5).
- Changed signatures only: `reset:preview`, `reset:analyze-dependencies` and `go-live:preview` now take an optional `{company_id}` payload (PR #6).

**No injection was found in the new SQL:**
- `421b2bc` `supplierReturnSplit` (`inventoryService.js:372-411`) is fully parameterised. The old `${billed ? …}` fragment is gone.
- `reportBuilders.js:431-438` builds no SQL. It filters rows already read.
- `init.js:1044-1048` (auto GRN rate) is arithmetic only.
- PR #6 `blockingReferences` (`operationalResetService.js:95-125`) interpolates `${id}`, but only after `Number.isSafeInteger(id) && id > 0` (line 97). Its table and column names come from `sqlite_master` and `PRAGMA foreign_key_list`, not the renderer.
- The UNLINK `set` fragments are constants.

**PR #5 ledger guards:**
- The `ledger_maintenance` window table cannot be reached from the renderer. `records:create` returns "No generic create permission" and `records:list` returns "Unsupported table".
- `withLedgerMaintenance` is called only from the reset (`operationalResetService.js:409`), inside `system_reset` + transaction + company scope.
- `money:rounding-adjustment` is `guarded("post")`; viewer was refused. Its amount comes from the database, not the payload.

## Findings

### S7 (Medium, new): shared references make `boundedCopy` re-walk the same object

**Where**
- `src/main/services/supportBundleService.js:41-75` (`boundedCopy`), called from `:83`. The handler is `src/main/main.js:1206-1212` (`health:support-bundle`), exposed as `exportSupportBundle` at `src/preload/preload.cjs:122`.
- Sign-in only. Any role can call it; the probe used a `viewer`.

**Cause**
1. Structured clone keeps object identity. One object referenced 200 times is sent **once**, and the rest are back-references.
2. `boundedCopy` has no visited set, so it walks the object on every reference.
3. `Object.keys(value)` (line 65) builds the **full** key array before the 200-key cap applies (line 66). An object with K keys costs O(K) on every visit, but is charged only about 802 budget units, so about 650 visits fit in the 512 Ki-unit budget.
4. Separately, values that return `undefined` are charged **0** budget: `undefined`, Date/Map/Set/RegExp/typed arrays, and anything at depth 8. So a DAG of arrays costs 2 units per array but 200 iterations.

**Exploit path.** A compromised or scripted signed-in renderer calls:

```js
const big = {}; for (let i = 0; i < K; i++) big["k" + i] = 0n;
let n = Array(200).fill(big); for (let d = 0; d < 3; d++) n = Array(200).fill(n);
window.api.exportSupportBundle({ x: n });
```

**Measured** (Node 22, `/tmp/claude-0/sec-probe/ipc-probe.mjs` through the real handler as `viewer`, and `bsc.mjs`/`one.mjs` for direct calls):

| Payload | IPC bytes | Main thread blocked | Output |
|---|---|---|---|
| K = 20,000 | 190 KB | 0.71 s (handler) | 820 B |
| K = 100,000 | 990 KB | **4.85 s** (handler) | 820 B |
| K = 300,000 | 3.2 MB | **16.7 s** (handler) | 820 B |
| K = 1,000,000 | 10.9 MB | **73.9 s** (direct), RSS 401 MB | 820 B |
| Same 100k-key object, **not** shared (baseline) | 1 MB | 0.10 s | — |
| Array DAG, depth 8, Date or hole leaves | 2.8-4.5 KB | 0.42-0.50 s | 785 KB |

- A 10 ms `setInterval` fired **0 times** during a 4.8 s call. The main process (every window and every posting) is frozen, and the calls can be repeated back to back.
- Nothing harmful is written: the bundle stays small, and the 20-file retention holds.
- This is the same class as the previous N1. The new walker bounds output, not work. N1's regression test (sparse array) passes, so the tests do not catch it.

**Fix** (verified on a patched copy, `/tmp/claude-0/sec-probe/fixed.mjs`):
1. Add a per-call `WeakSet` of visited objects to the budget. A repeated object becomes the string `"(repeated)"` and is charged about 12 units.
2. Charge at least 1 unit for **every** value visited, including ones that return `undefined`.

```js
function boundedCopy(value, budget, depth) {
  budget.left -= 1;
  if (budget.left <= 0) return undefined;
  ...
  if (typeof value !== "object" || depth >= MAX_DEPTH) return undefined;
  if (budget.seen.has(value)) { budget.left -= 12; return "(repeated)"; }
  budget.seen.add(value);
  ...
}
// boundedScreenContext: const budget = { left: MAX_SCREEN_CONTEXT_BYTES / 2, seen: new WeakSet() };
```

With the patch:
- K = 1,000,000 shared goes from 73.9 s to **0.28 s**.
- K = 100,000 goes from 4.5 s to **17 ms**.
- The DAG goes from 0.5 s to **1 ms**.
- Every other probe gives identical output.

What is left is linear in the message size: a 1M-key top-level object takes 1.38 s, against 1.25 s just to deserialise it. Optionally, avoid that second O(K) pass too: replace the `...rest` spread at line 81 by skipping the six user keys inside the key loop, and enumerate keys lazily with `for…in` plus a counter.

Add a regression test: send the K = 100,000 shared payload above and assert the handler returns in under 500 ms.

### S6 (Medium, new): `node_modules` symlink committed to the PR

**Where.** `7b23f17` added the tree entry `120000 node_modules -> /home/claude/gii-gem-erp/node_modules`, and it is still in `66b024f` (`git ls-tree HEAD node_modules`).

`.gitignore` has `node_modules/`. A pattern with a trailing slash matches only directories, so a symlink named `node_modules` is not ignored: `git check-ignore node_modules` prints nothing. It was picked up by `git add -A` in `/home/claude/wt-prog`, where `node_modules` was a symlink created at 2026-11-10 21:58 IST.

**Measured effect**
- **The main checkout's dependencies were destroyed.** Git treats ignored files as expendable on checkout, so checking out `66b024f` in `/home/claude/gii-gem-erp` (2026-11-11 01:17 IST) replaced the real `node_modules` directory with this symlink, which now points at itself (ELOOP).
  - `/home/claude/wt-prog/node_modules` points at the same loop.
  - In a fresh clone, `npm run -s test:integrity` exits 216 with no output. Run directly, 8 of 9 test files and the IPC suite fail with `ERR_MODULE_NOT_FOUND: better-sqlite3`.
- **Integrity and supply-chain risk on any other machine:**
  - On Linux or macOS, every clone resolves `require()`, `npm run` and electron-builder packaging through an **absolute path outside the repository**. If `/home/claude/gii-gem-erp/node_modules` exists there and someone else can write to it, that code is loaded by tests and **bundled into the installer**.
  - On Windows with `core.symlinks=false`, `node_modules` checks out as a 37-byte text file, and `npm install`/`npm ci` fail.

**Fix**
1. `git rm --cached node_modules`, and change `.gitignore` to `/node_modules` (no trailing slash, so it also matches a symlink or file).
2. Add a CI/pre-commit check that rejects new mode-`120000` entries and any tracked path named `node_modules`. For example, `git ls-files -s | awk '$1=="120000"'` must be empty.
3. Restore the main checkout with `npm ci` after the fix. That is outside this audit's write scope.

### S8 (Low): manual updater trusts the file name and the folder

**Where.** `src/main/main.js:1260-1287` (`updates:install`), `:528-541` (`assertInstallerInsideUpdateFolder`), `:420-423` (`parseUpdateVersion`), and `src/main/services/updateVersion.js:11-37`.

**What holds** (probe `/tmp/claude-0/sec-probe/ipc-probe2.mjs`, admin unless stated):

| Attempt | Result |
|---|---|
| viewer calls `updates:install` | refused (`Permission denied: settings`) |
| `../x.exe`, `<folder>/../GII-GeM-ERP-Setup-9.9.9-x64.exe` | refused (outside the folder) |
| `latest.json` with `fileName: "../../etc/…"` | basenamed, so not used |
| `random.exe` | refused (not a Setup name) |
| Portable EXE | refused |
| `Setup-0.0.0-alpha` while running `0.0.0-test` | refused (downgrade) |
| Non-string argument | fails in clone, nothing launched |

`compareUpdateVersions` orders `1.2.10 > 1.2.9` and a release above its pre-release correctly.

**What does not hold**
1. **Symlink escape.** The path check is lexical (`path.resolve`, not `realpath`). `<folder>/GII-GeM-ERP-Setup-10.0.0-x64.exe -> /tmp/outside-evil.exe` was accepted and `shell.openPath` was called on it. On Windows the same applies to `.lnk`-free symlinks and junctions.
2. **Sub-folders** are accepted (`<folder>/sub/GII-GeM-ERP-Setup-5.0.0-x64.exe` was launched).
3. **The downgrade guard uses the file name only.** An old installer renamed to `Setup-99.0.0` passes, and the EXE's own version and publisher are never checked. A same-version reinstall is allowed by design.
4. Each accepted call takes a live backup and quits the app after 1.5 s. This needs `settings`, so it is not a privilege issue.

**Impact.** The update folder is `Documents\GII GeM ERP Updates` (or `GII_GEM_ERP_UPDATE_DIR`). Anything that can write there as the user can get an admin's click to run any EXE. That predates this range. The new guard should be described as protecting against *mistakes*, not tampering.

**Fix**
- `fs.realpathSync` both paths before the `startsWith` check, and require `path.dirname(real) === realFolder`.
- On Windows, verify the Authenticode signer before `openPath`, either with `Get-AuthenticodeSignature` or by reading the PE version resource and comparing it with the file-name version.

### S9 (Info): byte budget does not count JSON escaping

**Where.** `supportBundleService.js:46-48` and `:69` charge `length * 2` per string or key.

`JSON.stringify` writes a control character as `\u0001` (6 bytes) and a lone surrogate as `\ud800` (6 bytes). So a context that passes the budget can be over 1 MB after stringify, and then the whole context is replaced by `{"omitted": …}` (line 87).
- Measured: 26 strings of 20,000 `\u0001` (508 KB on the wire) give `omitted` in 4 ms.
- 26 strings of 20,000 lone surrogates give the same.
- CJK text (3 bytes in UTF-8) and astral emoji fit (780 KB and 40 KB). A surrogate pair cut by `slice(0, 20000)` becomes an escaped lone surrogate, which is valid JSON.

The result fails closed and the attacker controls the context anyway. The only effect is that a real crash stack with ANSI escapes could lose all context. **Fix (optional):** charge `JSON.stringify(text).length` for strings with code units below 0x20 or in the surrogate range, or truncate at the 1 MB mark instead of dropping everything.

Also confirmed:
- `__proto__`, `constructor` and `prototype` keys are skipped at every level, and there was no pollution (`({}).polluted === undefined`).
- Keys are capped at 200 characters.
- Nested user-like keys are still kept (S4, previously Info, unchanged).

### S10 (Info): company-scoped previews are sign-in only

Probed as `viewer`. These return counts, sample row ids and the company name for any company id:
- `reset:preview({company_id: 1})`
- `reset:analyze-dependencies({company_id: 1})`
- `go-live:preview({company_id: 1})`
- `money:integrity({company_id: "1e0"})`

`reset:execute` and `money:rounding-adjustment` were refused.

The app has no per-user company assignment (no `user_companies` or similar table), so this crosses no boundary today. Bad ids are handled:
- `money:integrity` rejects a non-integer id.
- `reset:preview` throws "company #-1 does not exist".

If per-company access is ever added, these four channels need the same check.

### S3 / S5 (residual, unchanged)

- **S3 (Low):** `scripts/update-audit-manifest.js` has no diff in range. Deleting one report's entry still blesses an edit to that report.
- **S5 (Info):** `guarded()` still uses `firstPayload(args)` (`main.js:333`). `sessionGuarded` uses `firstPayload(args.slice(0, 1))` (`main.js:362`). PR #6's `reset:execute` and `go-live:execute` are `guarded("system_reset")`, so their grant rows inherit this labelling. There is no access impact.

## Probe files

- `/tmp/claude-0/sec-probe/bsc.mjs`: `boundedScreenContext` against structured-clone payloads. `bsc-fixed.mjs` runs the same probes against the patched copy `fixed.mjs`.
- `/tmp/claude-0/sec-probe/ipc-probe.mjs`: the support-bundle DoS through the real handler as `viewer`, including the timer-starvation check.
- `/tmp/claude-0/sec-probe/one.mjs`: the 1M-key shared-object timing.
- `/tmp/claude-0/sec-probe/ipc-probe2.mjs`: updater paths, downgrade and symlink cases, `ledger_maintenance` reachability, and money/reset/go-live roles.
