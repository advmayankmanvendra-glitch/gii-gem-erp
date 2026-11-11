# In-house security audit: 4f3a9b6..a8c64af

- Scope: `a8c64af` ("Close the 4f3a9b6 audit findings: narrower staging clean-up, KG-4 goods receipts"). It answers `audit-4f3a9b6-security.md`: N5-r2, N9, N6-r2 and the N7 log noise. S20-r3(b) and N8 were left open on purpose: both wait for the publisher check (S8-r2).
- Files read: `src/main/services/updateInstaller.js` (all of it), the `updates:install` handler in `src/main/main.js` (lines 1258-1340, and the start-up clear at 264), and the new tests in `scripts/audit/ipc-security.test.mjs`. The KG-4 knowledge-graph change is data only. It has no security effect.
- Checkout: a throwaway worktree, `/tmp/claude-0/sec-a8c` at `a8c64af`, with `node_modules` linked to the shared one. For one comparison run I also made a second worktree, `/tmp/claude-0/sec-4f3c` at `4f3a9b6`. Nothing was rebuilt. Both links and both worktrees were removed at the end. Nothing was committed or pushed, and no package was installed.
- Tests: `npm run -s test:integrity` gives **271/271 pass** (222 + 49 IPC), exit 0, on Node v22.22.0. Log: `/tmp/claude-0/sec-probe/tests-a8c64af.log`.
- The race probes ran through the real `updates:install` handler, with the Electron stub and a mocked `shell.openPath`. The injected probes call `updateInstaller.js` directly.
- **Measured** means it ran on Linux (root, ext4). **Reasoned** means Windows behaviour I did not run.
- Disk: the probes deleted backups after every attempt and removed their own folders. Root stayed at 64% (15 GB free).
- Date: 2026-11-11 09:10 IST

## Does anything still reach outside the data folder?

**Yes, in three narrow ways. All three are deletions, and all three need someone to swap a folder for a link while the clean-up runs.**

| Path | What can be deleted outside the data folder | Real race, Linux (measured) |
|---|---|---|
| Sweep of a moved-aside folder, top level (`updateInstaller.js:90-91`) | **Any file or link, with a name the attacker chooses**, in any folder the ERP's account can write | 29 of 149 attempts |
| Sweep, one level down (`:94-95`) | Only files named `GII-GeM-ERP-Setup-*.exe` or `GII-GeM-ERP-Portable-*.exe` | 4 of 137 attempts |
| `removeStagedCopy` after a failed launch (`:106-108`, `main.js:1338`) | Only a file with the same name as the installer copy (for example, the user's own installer in the update folder) | 34 of 152 attempts |

- Nothing is ever read or written outside the data folder, and no folder outside it is emptied or walked.
- The first row was **already there in `4f3a9b6`**, and my last report missed it. I said then that only `*.exe` files and links could be lost. That was wrong: the top-level case deletes any name. Measured on `4f3a9b6` with the same probe, it hit 60 of 151 attempts. `a8c64af` halves the rate but does not close it.
- Every case needs write access to the data folder. The `removeStagedCopy` case also needs write access to the app's own `update-staging` folder.
- On a default Windows install the data folder is the user's own `userData` folder. Whoever can write there is that user or an administrator, so no one gains any access they did not already have. The deletions only give someone extra access when the data folder is shared through `GII_GEM_ERP_DATA_ROOT` (reasoned).

## Summary

| # | Severity | Area | Status |
|---|----------|------|--------|
| **N5-r3** | **Low (open; reaches outside the data folder)** | `removeStagingTree`, top level | The re-check after `readdir` works (measured). **One window is left: between the re-check and `unlinkSync` for each link at the top level. A hit deletes a file with an attacker-chosen name in another folder.** 29 of 149 attempts (measured) |
| N5-r3b | Low (open, narrow) | `removeStagingTree` one level down, and `removeStagedCopy` | The same window, but only for GII installer names. 4 of 137 and 34 of 152 attempts (measured) |
| N9-r1 | Info (narrowed) | In-place staging folder | **Fixed on Linux (measured):** a folder with mode 0777, or owned by another account, is refused. **Left:** the check runs once and is not repeated after `mkdtemp`, so a folder swapped in after the check is used (measured, injected). On Windows the check always passes (reasoned) |
| N6-r2 | **Fixed** (measured) | Re-hash input | Reads exactly the copied size. In the growth race no attempt took more than 1 s (705 attempts) |
| N7 noise | **Fixed** (measured) | Warnings | One line per folder: 35 lines in 149 attempts, against 1,405 on `4f3a9b6` in the same race |
| N10 | Info (new) | What the commit says against what the code does | The commit says the failure clean-ups remove only the recorded copy. `stageInstaller`'s own clean-up (`:285`) still lists the folder with `removeStagingTree(stagingDir, 1)` |
| S20-r3(b) | Info (open, known) | Gap between the re-hash and `openPath` | Unchanged. 34 of 2,341 attempts opened other bytes in 30 s (measured) |
| N8 | Info (open, known) | Audit write failure | Unchanged (`main.js:1294-1300`) |
| N3-r1 | Info (open, unchanged) | Zone.Identifier stat-then-read | Unchanged (`:271-276`) |

## Findings, ranked

### N5-r3 (Low): a link at the top level can still be used to delete a file in another folder

**What changed (measured, injected; `new-a8c64af.log` R1, R5).**
- `removeStagingTree` (`:72-102`) now keeps the folder's `dev`/`ino` from the first `lstat` (`:74`).
- It checks the folder again after `readdir` (`:84`), before each `unlink` (`:91`, `:95`) and before `rmdir` (`:101`).
- A swap right after `readdir`, the gap I measured last round, is now caught. The remover stops, and nothing in V is touched (R1).
- A link one level down is left in place. Only `GII-GeM-ERP-(Setup|Portable)-*.exe` files are removed one level down. Everything else is counted, with one warning per folder (R5).

**What is left.** Each removal still runs in two steps that look up the folder path separately:
1. the re-check, `lstat(folder)`
2. `unlinkSync(path.join(folder, name))`

If the folder is swapped for a link to folder V between those two steps, the `unlink` resolves through the link and deletes `V/<name>`.

At the top level, the remover unlinks **every link entry, whatever its name** (`:90-91`). The attacker made those entries, so they choose the names. `unlink` deletes any file or link, so a hit can delete, for example, `V/books.db` or `V/app.exe`.

**Injected, deterministic (measured, R2).** A moved-aside folder held links named `books.db`, `app.exe` and `cfg-link`. I swapped the folder for a link to V just before the first `unlink`:
- `V/app.exe`, a regular file, was deleted.
- The next re-checks noticed the swap. Nothing else went, and `rmdir` was skipped.

So each successful swap costs one file.

**Real race (measured).**
- Setup: the attacker plants an `update-staging` folder holding 40 links named `doc-0.txt` … `doc-39.txt`. V holds regular files with the same names, plus `books.db`.
- When the app renames the folder to `update-staging.old-*`, the racer (inotify plus `renameat2(RENAME_EXCHANGE)`) keeps exchanging it with a link to V.

| Build | Attempts in 60 s | Attempts where V lost files | Files lost |
|---|---|---|---|
| `a8c64af` | 149 | **29** | 37 different names, 1-7 times each. `books.db` was not among the attacker's names, and it was never lost |
| `4f3a9b6` (control, same probe) | 151 | 60 | All 40 names |

**Trigger.** The sweep runs at every start-up (`:61-63`, `main.js:264`) and before every install (`:139`). The attacker cannot start either one. On Linux, each start-up or install that runs while the race is set up deleted files about one time in five.

**Precondition.** Write access to the data folder: the attacker plants `update-staging` and exchanges the renamed folder there. The swap needs no write access to `update-staging.old-*` itself, so an ownership check on that folder would not help.

**Windows (reasoned).**
- A junction needs no special right.
- `unlink` follows a junction in the path, so it lands in V.
- There is no atomic exchange. The attacker can rename the folder away and create a junction in its place, which is a harder race but still open.
- On the default per-user data folder this gives no one any new access (see above).

**Fix, in order of value.**
1. **Delete only names the app makes.** At the top level, only `install-*` entries are the app's own. A link there with any other name should be left and counted, not unlinked. Then the most a hit can delete is `V/install-*`. One level down the allow-list already exists.
2. **Pin the folder for real on POSIX.** `removeStagingTree` is fully synchronous. Do this:
   - `process.chdir(folder)`
   - check that `lstatSync(".")` has the pinned `dev`/`ino`
   - list and unlink relative names, which resolve against the pinned folder, not the swappable path
   - `chdir` back in a `finally`

   That closes the window on Linux and macOS. On Windows, relative paths resolve against the current folder's path string, so this does not pin the folder there. The open handle on the current folder may stop it from being renamed, but I have not verified that (reasoned).
3. **Windows.** Create `update-staging` with an owner-only DACL. Point `GII_GEM_ERP_DATA_ROOT` only at folders that other accounts cannot write.

### N5-r3b (Low, narrow): the same window, limited to GII installer names

**One level down (`:94-95`).**
- An `install-K` folder swapped for a link between the re-check and `unlinkSync` deletes `V/GII-GeM-ERP-Setup-K.exe`.
- Injected (R3): V lost only `GII-GeM-ERP-Setup-1.0.0-x64.exe`. `app.exe` and `books.db` stayed.
- Real race: 40 `install-K` folders were exchanged with links stored in the data folder. **4 of 137** attempts lost one GII installer each. `app.exe` and `books.db` were never lost.

**`removeStagedCopy` (`:105-111`, called at `main.js:1338`).**
- It checks the copy's `dev`/`ino` against the recorded values (`:107-108`), then unlinks it by path.
- If `install-X` is swapped for a link between those two steps, `V/<installer name>` is deleted, and the app's own copy stays (R4).
- If the swap happens before the `lstat`, the delete is refused (R4b).
- Real race: the racer starts exchanging `install-X` with a link to V when the re-hash closes the copy. **34 of 152** attempts deleted V's `GII-GeM-ERP-Setup-99.0.0-x64.exe`.
- The copy always carries the selected installer's name. If V is the update folder, that is the user's own installer, which they have to download again.

**Precondition.**
- On Linux, `update-staging` is owned by the app with mode 0755, so only the same account can rename `install-*` inside it. I measured as root.
- On Windows, the folder takes its permissions from the data folder (reasoned).

**Fix.**
- Use the `chdir` pin from N5-r3, item 2: `chdir(install-X)`, check `dev`/`ino`, `unlink(basename)`, `chdir` back.
- On Windows, an owner-only DACL on `update-staging`.
- Impact is limited to deleting a GII installer.

### N9-r1 (Info, narrowed): the in-place staging folder is checked once, not twice

**Fixed on Linux.** `ownStagingFolder` (`:185-189`) accepts the folder only if it is a real folder, owned by this account, with no write access for group or other. Measured with an injected EPERM on the rename (`n9-a8c64af.log`):

| Case | Result |
|---|---|
| Own folder, mode 0755 | Used in place, as intended |
| Own folder, mode 0777 | Refused |
| Folder owned by uid 1000, mode 0755 | Refused |
| Own folder passes the check, then is swapped for another account's 0777 folder holding `planted.txt` | **Used.** The copy was staged in the attacker's folder |

**What is left.**
- The check runs once, on the `lstat` at `:148`.
- The check after `mkdtemp` (`:176`) only confirms that `expected` is a folder and that the new folder sits inside it. It does not repeat the owner and mode check, or compare `dev`/`ino`.
- Someone who can write to the data folder (with no sticky bit) can therefore put their own folder in place between the two checks. They then own the staging folder, which leads back to S20-r3(a)/(b).
- On Windows `ownStagingFolder` always returns true (`:187`), so N9 is unchanged there (reasoned).
- Everything stays inside the data folder and needs write access to it, so this is **Info**.

**Fix.**
- Keep the `lstat` from `:148`.
- After `mkdtemp`, `lstat(expected)` again and require the same `dev`/`ino`, and `ownStagingFolder` again.
- On Windows, check the owner and DACL, or reset them to owner-only before using the folder in place.

**A side note on the refusal message.** In my injected run the refused cases showed "The installer in the update folder is locked or not readable". That is only because my fake EPERM had no `path`. A real `rename` error names the staging folder, so `isInsideStaging` should pick the data-folder wording. Even so, the earlier suggestion still applies: use the existing "…changed… Restart the ERP and try again" text for this refusal.

### N6-r2 (fixed, measured)

- `hashFile` (`:198-219`) now reads with `end: size - 1` and counts the bytes. It refuses if the count differs from the copied size.
- Injected (R6): the copy was grown to 4 GiB right after the `fstat`. The hash was taken over the original 6 bytes, matched, and took **3.5 ms**. On `4f3a9b6` this case read the whole 4 GiB in 6.8 s.
- Injected (R6b): the copy was shrunk to 2 bytes after the `fstat`. Result `""`, refused.
- Real race, 45 s (`racegrow-a8c64af.log`):
  - 705 attempts. **None took more than 1 s**, and the slowest took under 0.05 s.
  - 504 were refused by the identity check, and 201 opened the good bytes.
  - On `4f3a9b6`, 11 of 127 attempts read 2 GiB.

### N7 log noise (fixed, measured)

- There is now one `Left N unexpected item(s) in <folder>` line per folder (`:100`).
- In the top-level race it logged 35 lines in 149 attempts, against 1,405 per-entry lines on `4f3a9b6` in the same run.
- The line names only the folder's own name, not the path.
- Not done from last round's suggestion: the line is not written to the error journal. This is minor.

### N10 (Info, new): one failure clean-up still lists the folder

- The commit message says the failure clean-ups remove only the recorded copy through `removeStagedCopy`. That is true for the handler (`main.js:1338`).
- `stageInstaller`'s own `catch` still calls `removeStagingTree(stagingDir, 1)` (`updateInstaller.js:285`). That is the N5-r3b window, one level down.
- At that point the app knows `stagedPath`, and after a successful write it can `lstat` the copy. So it can call `removeStagedCopy` on the copy, then `rmdir(stagingDir)`.
- This is low value on its own. I note it so the commit message and the code agree.

### S20-r3(b), N8, N3-r1 (Info): unchanged

- **S20-r3(b).** Same race as before: when the re-hash closes the copy, a file with other bytes is renamed over it.
  - **34 of 2,341** attempts in 30 s opened `MZevil` (measured). On `4f3a9b6` it was 1,122 of 2,011.
  - The drop comes from timing (the re-hash loop is now a `for await`), not from any control.
  - The audit hash was the good one in every case.
  - The fix is still S8-r2: check the Authenticode signature and publisher immediately before `openPath`.
- **N8.** `auditUpdate` (`main.js:1294-1300`) still only logs a failed audit write.
- **N3-r1.** The Zone.Identifier stat-then-read (`:271-276`) is as before.

## Other changes looked at

- **`assertInstallerInsideUpdateFolder` (`:40-42`)** now refuses an installer name that is a link to another file in the same folder, by comparing base names after `realpath`. This is covered by the new test. Not measured on Windows: an 8.3 short name or a different case resolves to the same base name there, which is correct.
- **`sweepMovedStaging` (`:117`)** now matches only `update-staging.old-<16 hex>`. A user's `update-staging.old-mine.txt` is left alone, which is covered by the test. An attacker can still pick a matching name, but the sweep then behaves as in N5-r3, nothing new.
- **`isInsideStaging` (`:128`)** now uses `realpathSync.native`. It only chooses which advice text to show. No security effect.

## Still open from earlier rounds

- **S8-r2 (Low):** no Authenticode or publisher check. It is the control behind S20-r3(b), N8 and the Windows half of N9.
- **N4 (Info; Windows/SMB, reasoned):** the `dev`/`ino` checks, now also in `removeStagingTree` and `removeStagedCopy`, assume stable file IDs.
- **S17 residue (Info):** unchanged.

## Probe files

All are under `/tmp/claude-0/sec-probe/`. Each one needs a worktree at `a8c64af` in `/tmp/claude-0/sec-a8c` with `node_modules` linked.
- The race probes run from that folder with `node --import ./scripts/audit/lib/electron-register.mjs <probe> <args>`.
- The injected probes run with plain `node <probe>`.

| File | What it does | Log |
|---|---|---|
| `new-a8c64af.mjs` | Injected R1-R6: swap after `readdir`; swap between the re-check and `unlink` at the top level and one level down; `removeStagedCopy`; normal sweep; re-hash growing and shrinking | `new-a8c64af.log` |
| `n9-a8c64af.mjs` | N9 cases a-d with an injected EPERM | `n9-a8c64af.log` |
| `race-a8c64af.mjs` with `racers-a8c.py` | Modes `topnames`, `subnames` and `copyswap`. Set `PROBE_REPO` to run against another worktree | `race-a8c64af-topnames.log`, `-subnames.log`, `-copyswap.log`, `race-a8c64af-topnames-control-4f3a9b6.log` |
| `racegrow-a8c64af.mjs` with `racegrow-4f3.py` | The N6-r2 race | `racegrow-a8c64af.log` |
| `rehash-a8c64af.mjs` with `racers-641.py` | The S20-r3(b) race | `race-a8c64af-rehash.log` |
| | The `test:integrity` run | `tests-a8c64af.log` |
