# Correctness audit: 32263ab..ef324d5

- **Scope:** commit `ef324d5` against its parent `32263ab` (PR #4, branch `claude/erp-full-automation-qbhv8k`). It answers `audit-32263ab-correctness.md` (AB1-AB7).
- **Claimed fixes checked:** AB1 (no leftover installer copies), AB2 (error mapping, detail in the audit row), AB3 (tests for M2, N3, N7, N10), AB4 (message after a launch), AB5 (realpath check after `mkdtemp`), the move of the staging code to `src/main/services/updateInstaller.js`, the Party Reconciliation `possible_issue` text, and the KG-4 `relatedDG1Tables` change.
- **Method:** a read-only worktree at `ef324d5`, with no commits and no pushes. I ran 36 source mutations against `ipc-security.test.mjs`. I also ran a throw-away probe test file (four probes), which I deleted afterwards.
- **Written:** 11 Nov 2026, 07:30 IST.

## Summary

Most of the claims hold:

- **AB1 is fixed.** A failed backup, a failed re-hash or a failed launch now removes its `install-*` folder. Staging also clears old copies.
- **AB4 is fixed.** After a launch, a second install gets a separate "already been opened" message.
- **The move to `updateInstaller.js` changes almost nothing.** The only differences are the deliberate ones: guarded `lstat`, a non-string path check, a 64 KB cap on the download mark, the clear of old copies, and the new error mapping.
- **The Party Reconciliation text and the KG-4 tables are correct.**
- **Every new test kills its target mutation:** M2, N7, N10, and the full Windows-path recheck.

Three things are not right:

1. **AB5 is not fixed (C2).** The new check compares the new folder with `realpath(update-staging)`, which follows the swapped-in link. A probe that swaps the link in at `mkdtemp` still gets its copy written, and opened, outside the data folder.
2. **"Every path in the handler is mapped" is not quite true, and one helpful message is now lost (C1):**
   - The "update folder could not be created" message from `ensureUpdateFolder` is replaced with "unexpected error ... check the ERP's data folder".
   - An audit write that fails inside the catch replaces the mapped message with raw SQLite text.
   - If the "launched" audit row cannot be written after a successful `openPath`, the user is told the update failed, the flag is released, the ERP stays open and the code tries to delete the running copy.
3. **Test gaps remain** for the new code: re-hash, backup mapping, ENOSPC advice, the AB5 check, the old-copy clear and the swap-back case (C4).

Nothing touches postings, GST, profitability or the schema.

## Commands and results

| Check | Result |
|---|---|
| `npm run -s test:integrity` | **Pass.** 222/222 (integrity suites) + 35/35 (`ipc-security`), about 46 s |
| Probe Q1: `update-staging` swapped for a link to an outside folder just before `mkdtemp` | **Not refused.** The copy is written to `/tmp/gii-ab5-…/install-…/GII-GeM-ERP-Setup-98.1.0-x64.exe`, and `openPath` is called on it (C2) |
| Probe Q2: write stream fails with `ENOSPC` | Reply: "could not be prepared (ENOSPC). The disk that holds the ERP's data is full…". Audit row `detail: {code: ENOSPC, syscall: write, file: null, side: data-folder}`. `update-staging` left empty. **AB2 fixed** |
| Probe Q3: `openPath` returns "No application is associated" | Reply: "The installer could not be opened: No application is associated", so the OS text is kept. **Two** audit rows for one attempt: `update_installer_failed` and `update_installer_refused` (C5) |
| Probe Q4: staged copy changed before the re-hash | Refused with "The prepared installer changed before it could start". `openPath` not called; the copy is removed. Re-hash works |
| Probe Q5: database locked when the "launched" row is written (after a successful `openPath`) | Reply: raw **"database is locked"** after 10 s. `openPath` was called once (installer running). The flag is released and the ERP does not close (C1) |

### Mutation runs (against `ipc-security.test.mjs`)

| Id | Mutation | Result |
|---|---|---|
| M1 / M3 / M4 / M5 | Flag never set / never released / no busy audit row / planted link not removed | Killed |
| **M2** | Flag always released, even after a launch | **Killed** (new test 35). Was a survivor |
| N1 / N2 | `O_NOFOLLOW` / `O_NONBLOCK` dropped | Survive (carried) |
| N3 | `recheck = checked` | Survives alone. The `lstat`/`sameFile` checks still refuse the swap |
| N3b | Recheck condition reduced to `isFile && nlink` | Survives alone. The recheck `assert…` call itself still refuses |
| **N3c** | Both of the above (no recheck at all) | **Killed** (new test 32). The Windows path as a whole is now guarded |
| N3d | `recheck = checked` and `pathStats.isFile()` removed | Survives (`sameFile` still refuses) |
| N4 | `sameFile` removed | **Survives.** This is the only guard against "swap in a link, open, swap a new file back" on Windows (C4) |
| N5 | `nlink` check removed | Killed |
| N6 | `recheck !== checked` removed | Survives (redundant with the realpath parent check) |
| **N7** | Catch clean-up in `stageInstaller` removed | **Killed** (new test 33). Was a survivor |
| N8 | No audit row for guided refusals | Killed |
| **N10** | Raw pass-through re-added in `stageInstaller` | **Killed** (new test 34). Was a survivor |
| N10b | Raw pass-through re-added in the handler (`!/installer\|EACCES/`) | Survives (C4) |
| N11 / N12 | `ELOOP` not mapped / 1 GB cap removed | Survive (carried) |
| N13 | Size match removed | Killed |
| A1a | Post-staging copy removal in `installUpdateFromFolder` removed | Killed (test 26) |
| A1b | Clear of old copies in `ensureStagingFolder` removed | Survives (C4) |
| A2a-A2d | ENOSPC advice / `detail` in audit row / basename-only `file` / locked-file advice | All survive (C4) |
| A4 | `updateInstallLaunched` never set | Killed (test 35) |
| A5 | Realpath check after `mkdtemp` removed | Survives. It is ineffective anyway (C2) |
| H1 | Re-hash before `openPath` removed | Survives (C4) |
| H2 | `openPath` failure thrown unguided | Killed |
| B1 | Backup failure passed through raw | Survives (C4) |
| L1 | Audit name not cut to 255 | Killed |
| T1 | Non-string `installerPath` check removed | Survives (Info) |

## Findings, ranked

| # | Severity | Where | Finding |
|---|---|---|---|
| **C1** | **Low** | main.js:1278-1283, :1288, :1315, :1317-1320; main.js:421 | The handler's mapping loses one helpful message and can be replaced by raw text. A failed "launched" audit write reports a running installer as not started |
| **C2** | **Low** | updateInstaller.js:64-80 | AB5 is not fixed. The check follows the swapped link. The new clear loop (:71-72) has the same race and deletes through a swapped link |
| C3 | Info | reportBuilders.js:443-444 | Party Reconciliation text is correct, but a filter-only difference still shows as "Mismatch" and counts in the period controls (:612-613) |
| C4 | Low (tests) | ipc-security.test.mjs | Survivors among the new code: H1, B1, A1b, A2a-d, A5, N4, N10b (plus carried N1, N2, N11, N12) |
| C5 | Info | main.js:1315 + :1282 | A failed launch writes two audit rows, and the second is labelled "refused" |
| C6 | Info | main.js:1280, :1308 | The fallback advice always says "free disk space … data folder", even for errors that have nothing to do with disk space |

### C1 (Low): one helpful message lost; a raw message can still reach the user; a launch can be reported as a failure

There are three separate problems with the claim that every path is mapped.

**(a) The "update folder could not be created" message is replaced.**

- `installUpdateFromFolder` calls `getUpdateStatus()` (main.js:1288), which calls `ensureUpdateFolder()`. When that folder (default `Documents\GII GeM ERP Updates`, or a configured one such as a network share) cannot be created, it throws a plain `Error`, with no `code` property (main.js:421). That error says: "The update folder X could not be created or opened (EACCES). Check that the folder can be reached (or change the update folder setting)…".
- In 32263ab this text reached the user unchanged. In ef324d5 the handler (:1278-1281) maps it to "The update was not started (**unexpected error**). Check free disk space and **the ERP's data folder**". That message has no error code and points at the wrong folder.
- **Fix:** throw it as `guidedError(...)` with `detail: { code, syscall }` at main.js:421. Or, in the handler, keep `error.message` when the error was raised by the app's own code. A cheaper version: the handler's mapping could use `error.code || error.message.slice(0, 120)`.

**(b) A failed audit write in the catch replaces the mapped message.**

- The `auditLog` call at :1282 is not wrapped. When the database is locked or the disk is full, it throws, and its raw `SqliteError` message ("database is locked") replaces the mapped one. Probe Q5 shows exactly this.
- **Fix:** `try { auditLog(...) } catch (auditError) { console.error(...) }` at :1282 and :1266, so that the user's error always wins.

**(c) A launched installer can be reported as not started.**

The "launched" row is written at :1315, inside the try whose catch (:1317-1320) treats every throw as "nothing was launched". If that write fails after `openPath` returned `""` (probe Q5: the installer was opened):

- the user sees an error (in practice the raw one, because of (b));
- `launched` stays false, so the flag is released and the ERP does **not** quit. The installer then runs against an open database and open program files;
- the catch tries to delete the running copy. On Windows the delete fails, because the running file is locked. On other systems it succeeds.

This is not new in kind: 32263ab also threw after a successful `openPath`. But this commit adds the deletion and the "Nothing was installed" wording.

**Fix:**

- After a successful `openPath`, wrap the audit write in its own try/catch and log its failure.
- Never rethrow it. Return `{ success: true, closing: true }` and let the quit timer run.
- Alternatively, write an `update_installer_launching` row *before* `openPath`, while a failure can still stop the launch, and update or append the result afterwards in the same best-effort way.

**Is the openPath failure text lost?** No. It is thrown as `guidedError("The installer could not be opened: <reason>")` (:1316). It passes through unchanged and is in the `update_installer_refused` row (Q3).

### C2 (Low): the AB5 check follows the link it is meant to catch; the clear loop has the same race

**The check does not catch a swap at `mkdtemp`.**

- updateInstaller.js:76-78:

  ```js
  const dir = await fs.promises.mkdtemp(path.join(stagingFolder, "install-"));
  const realDir = await fs.promises.realpath(dir);
  if (path.dirname(realDir) !== (await fs.promises.realpath(stagingFolder)) || ...
  ```

- If `update-staging` is swapped for a link to `/elsewhere` before `mkdtemp`, then `realDir` is `/elsewhere/install-x` and `realpath(stagingFolder)` is also `/elsewhere`. The check passes, and so does `lstat(dir).isDirectory()`.
- Probe Q1 confirms this: the copy was written to the outside folder and opened from it.
- The new re-hash before `openPath` (main.js:1311) narrows the effect. An attacker must still swap the copy between the re-hash and the launch.

**The clear loop has the same race.**

- The clear added at :71-72 runs `rm(path.join(stagingFolder, name), { recursive: true })` for each entry. It does this after the only `lstat` check (:67) and before any realpath check.
- A link swapped in during that window makes the loop delete, recursively, the contents of whatever folder the link points to.
- This needs a same-user process winning a microsecond race, so the practical risk is low. But it is a delete, not a read.

**Fix:**

- Compare against the expected location, not the link's target:

  ```js
  const expected = path.join(await fs.promises.realpath(dataRoot), "update-staging");
  if (await fs.promises.realpath(stagingFolder) !== expected) throw guidedError(...);  // before the clear loop
  ...
  if (path.dirname(await fs.promises.realpath(dir)) !== expected || !(await fs.promises.lstat(stagingFolder)).isDirectory()) { rm dir; throw guidedError(...); }
  ```

- Also check `realpath(stagingFolder) === expected` immediately before the clear loop, and run the loop on `expected` rather than on `stagingFolder`.
- Add the probe Q1 test (wrap `fs.promises.mkdtemp` to swap in a link first) and assert a refusal and an empty outside folder.

### C3 (Info): Party Reconciliation text is accurate; the status is still affected by the filter

- **Where:** reportBuilders.js:443-444.
- **The new text is correct.** The text now says the ledger side covers the chosen dates while the bill-wise side covers all dates, and that statement is right:
  - `partyLedgerReport` takes `dateFrom`/`dateTo`, and its opening balance is hard-coded to 0 (:185).
  - `billWiseReceivableReport` and `billWisePayableReport` take no dates.
  - `supplierReturnCredits` also comes from the filtered ledger, so the "less supplier returns" line is affected too.
- **The status is still wrong.** This only changes wording. With any date filter, a correct set of books can still show `status: "Mismatch"`. `periodControlReport` counts those rows in `partyMismatches` (:612-613).
- **Fix (later, owner call):** compute the ledger side up to `dateTo` without `dateFrom`, or show "Not comparable with a date filter" instead of "Mismatch" when `dateFrom` is set.

### C4 (Low, tests): the new code is mostly untested

Each of these survives. One test closes each gap:

| Survivor | What it means | Fix |
|---|---|---|
| H1 | Re-hash removed | Probe Q4: wrap `fs.createReadStream` to append to the staged file. Assert "changed before it could start", that `openPath` was not called, and that `update-staging` is empty |
| B1 | Backup failure passed through raw | Make the backups folder a file, or stub `db.backup` to throw. Assert "backup before the update could not be taken" and that the copy is removed |
| A1b | Old-copy clear not exercised | Create `update-staging/install-old/x.exe`, run an install that fails, and assert `install-old` is gone |
| A2a-d | Error advice and audit `detail` not asserted | Probe Q2 (wrap `fs.createWriteStream` to fail with `ENOSPC`). Assert the "disk … is full" text and `detail.side === "data-folder"`, `detail.file === null` |
| A5 | AB5 check not tested (and ineffective, C2) | See C2 |
| N4 | `sameFile` untested | In `withPatchedOpen`: swap in a link, open through it, then replace the link with a *new* regular file before returning the handle. Only `sameFile` refuses this case |
| N10b | Handler-level mapping untested | Make `ensureUpdateFolder` fail (point the update-folder setting at a file). Assert on the reply, which also covers C1(a) |

Test 32 ("Windows path") accepts either "changed or is linked" or "not directly inside". It kills only the removal of the whole recheck, not each layer. That is acceptable, because the layers overlap, apart from N4.

### C5 (Info): two audit rows for one failed launch

- **What happens:** a failed `openPath` writes `update_installer_failed` (:1315, with version, backup and sha256). Then the handler writes `update_installer_refused` (:1282) for the same attempt. "Refused" is the wrong word: nothing refused it.
- **Fix:** skip the handler row when `error.audited` is set, and set that flag at :1316.

### C6 (Info): fallback advice

- The handler fallback (:1280) and the backup message (:1308) always advise "check free disk space". For an `EACCES`/`EBUSY`, or a plain `Error` without a code (C1(a)), that advice is misleading.
- **Fix:** reuse the stage mapping's three-way advice (disk full / locked / other).

## Status of the claimed fixes

| Item | Status | Evidence |
|---|---|---|
| AB1: no leftover copies | **Fixed** | main.js:1303-1320 removes `install-*` after a failed backup, re-hash or launch. updateInstaller.js:71-72 clears old copies. Test 26 asserts the copy is gone (A1a killed). The clear itself is untested (A1b), and it has a race (C2) |
| AB2: mapping, ENOSPC/EDQUOT, detail in audit row | **Fixed in `stageInstaller`** | :154-165. Probe Q2. The handler-level fallback loses one message and can be replaced by raw text (C1) |
| AB3: tests for M2, N3, N7, N10 | **Fixed** | M2, N3c, N7 and N10 are killed. N4 and the new code's survivors are listed in C4 |
| AB4: message after a launch | **Fixed** | main.js:1263-1265. Test 35 (A4 killed). The flag is never reset, which is correct because the app quits |
| AB5: realpath check after `mkdtemp` | **Not fixed** | The check follows the link (C2, probe Q1) |
| Module move | **Behaviour unchanged except the deliberate changes** | Diffed function by function. `stagingFolderPath`/`clearInstallerStaging` now take `dataRoot`, and both call sites pass `runtimeDataRoot` (main.js:264, :1301). New behaviour: non-string path refused (:16), `lstat` race refused as "not directly inside" (:38-39), download mark capped at 64 KB (:144), old copies cleared (:71), new mapping (:154-165). `sameFile`, flags, size cap and copy loop are the same |
| Party Reconciliation text | **Correct** | See C3 for the remaining status issue |
| KG-4 `relatedDG1Tables` (AB7) | **Fixed** | The list is now the union of `readsFromTables` and `writesToTables` without `audit_log`. All 11 tables exist in the schema, and `postStockReturn`/`supplierReturnSplit` query `stock_inwards`, `procurements`, `goods_receipts` and `goods_receipt_items`. The `lineNumber` 478 is still correct. The R8 note is still not recorded in KG-4, as before |

## Questions from the brief, answered

**Can `ensureStagingFolder` clear a copy that is still in use?**

- Not through normal use:
  - The in-flight flag is held across the whole install.
  - After a successful launch the flag stays set until the app quits, so no later clear runs in that session.
  - A second ERP instance is blocked by `requestSingleInstanceLock` (main.js:178).
  - On Windows a running installer is locked, so its `rm` fails and is ignored.
- The only problem is the link race in C2.

**Is the re-hash before `openPath` correct?**

- Yes. It hashes the staged path after the backup and compares the result with the hash taken while copying. A mismatch is refused, and the copy is removed (Q4).
- The audit row's sha256 is therefore the hash of the file that was launched.
- A gap of microseconds remains between the re-hash and `openPath`, which is the same-user residual.

**Is every path in `updates:install` mapped, and is any message lost?**

- The `openPath` failure text is kept (Q3).
- The `ensureUpdateFolder` message is lost, and an audit-write failure replaces the mapped message with raw text. See C1.

**Is the module's behaviour the same as before the move?** Yes, apart from the listed deliberate changes. See the table above.

## Owner decisions this report needs

None for C1, C2, C4, C5 and C6: they concern the updater or its tests. C3 (how Party Reconciliation should treat a date filter) changes what a report shows as a mismatch, so the owner should choose between "ledger up to `dateTo`" and "not comparable with a date filter".
