# In-house security audit: 64124dc..4f3a9b6

- Scope: `4f3a9b6` ("Close the 64124dc audit findings: staging clean-up removes only installer copies"). It answers `audit-64124dc-security.md`: N5-r1, N6-r1 and N7. N8 and S20-r3(b) were left open on purpose (S20-r3(b) waits for the publisher check, S8-r2).
- Files read: `src/main/services/updateInstaller.js` (all of it), the `updates:install` handler in `src/main/main.js` (lines 1294-1340 and the start-up clear at 264), and the new tests in `scripts/audit/ipc-security.test.mjs`.
- Checkout: a throwaway worktree, `/tmp/claude-0/sec-4f3` at `4f3a9b6`, with `node_modules` linked to the shared one. Nothing was rebuilt. The link and the worktree were removed at the end. Nothing was committed or pushed, and no package was installed.
- Tests: `npm run -s test:integrity` gives **269/269 pass** (222 + 47 IPC), exit 0, on Node v22.22.0. Log: `/tmp/claude-0/sec-probe/tests-4f3a9b6.log`.
- The probes ran through the real `updates:install` handler, with the Electron stub and a mocked `shell.openPath`.
- **Measured** means it ran on Linux (root, ext4). **Reasoned** means Windows behaviour I did not run.
- Disk: each probe deleted backups after every attempt and removed its own folders. Root stayed at 64% (15 GB free).
- Date: 2026-11-11 08:45 IST

## Summary

| # | Severity | Area | Status |
|---|----------|------|--------|
| **N5-r2** | **Low (narrowed a lot, not closed)** | `removeStagingTree` | The data loss is gone: a swapped link no longer empties a folder. **One gap remains: a folder swapped for a link between the remover's `lstat` and its `readdir` still lets it delete `*.exe` files and links in the link's target.** Real race: 7 of 288 attempts. That target can be outside the data folder |
| N9 | Info (new) | In-place fallback when the rename fails | It reuses an `update-staging` folder that someone else made, with their permissions. Measured with an injected EPERM |
| N6-r2 | Info (narrowed) | Re-hash input | **Fixed:** a sparse file renamed over the copy is refused in 0.6 ms (measured). **Left:** a writer holding a handle on the copy can make it larger after the size check, and the read goes to the end of the file. Real race: 11 of 127 attempts read 2 GiB |
| N7 | **Fixed** (measured), with Info residue | `.old-*` leftovers | Swept at start-up and before staging. Anything unexpected is left and logged on every sweep |
| S20-r3(b) | Info (open, known) | Gap between the re-hash and `openPath` | Unchanged. Real race: 1,122 of 2,011 attempts opened other bytes in 30 s |
| N8 | Info (open, known) | Audit write failure | Unchanged |
| N3-r1 | Info (open, unchanged) | Zone.Identifier stat-then-read | Unchanged |

## Findings, ranked

### N5-r2 (Low): the new remover can still be steered one level into another folder

**What changed.** `removeStagingTree` (`updateInstaller.js:67-91`) replaces every recursive `rm`. It is called from:
- the start-up clear (`:59`, via `main.js:264`)
- the `.old-*` sweep (`:98`)
- the clear of the renamed folder (`:133`)
- the in-place clear (`:139`)
- `stageInstaller`'s failure clean-up (`:249`)
- the handler's clean-up after a failed launch (`main.js:1338`)

It goes through these steps:
1. `lstat(folder)`. Anything that is not a folder is `unlink`ed (`:69-73`).
2. `readdirSync(folder)` (`:75`).
3. `lstat` each entry. A link is unlinked. A folder named `install-*` at depth 0 is handled one level down. A regular `*.exe` file at depth 1 is unlinked. Anything else is left, with a warning.
4. `rmdirSync(folder)` (`:90`).

**What it now stops (measured).**
- The 64124dc race (`d*` swapped for links during a recursive `rm`) no longer deletes data:
  - a link is unlinked, never walked
  - `books.db`, sub-folders and their contents were never touched in any run
  - the search goes at most one level down
- `rmdir` on a swapped link fails with `ENOTDIR`, and the target folder stays.
- The start-up sweep unlinks an `update-staging.old-*` link and leaves its target alone.

**What it does not stop.** Step 1 and step 2 each look the path up again. If the folder is swapped for a link to folder V between them:
- `readdir` lists **V**.
- Each `path.join(folder, name)` then resolves through the link.
- So, in V, the remover **unlinks every link, and every regular file ending in `.exe`**.
- If the swap happens at depth 0, it also goes into V's own `install-*` sub-folders and deletes the `*.exe` files there.

Injected, deterministic (measured). V held `app.exe, bin/tool.exe, books.db, cfg-link (a link), install-9/y.exe, notes.txt`.

| Where the swap was | Lost from V | Kept |
|---|---|---|
| `install-X` inside the renamed old folder (depth 1) | `app.exe`, `cfg-link` | everything else |
| `update-staging.old-*` itself (depth 0) | `cfg-link`, `install-9/y.exe` | everything else, including `app.exe` |
| The app's own `install-*` during the clean-up after a failed launch (`main.js:1338`) | `app.exe`, `cfg-link` | everything else |

- Only the link itself was removed in each case. Its target file was never touched.

Real race (measured). This is the 64124dc race, redone for the new code:
- The attacker plants 40 `install-K` folders and 40 links `LK` to V.
- Their racer watches the data root with inotify. When `update-staging.old-*` appears, it keeps exchanging the pairs with `renameat2(RENAME_EXCHANGE)`.

| Run | Attempts | Attempts where V lost something | What was lost |
|---|---|---|---|
| Sub-folder swap, 60 s (first run) | 155 | 5 | `app.exe` ×5, `Setup.exe` ×5, `cfg-link` ×4 |
| Sub-folder swap, 60 s (re-run after a probe fix) | 133 | 2 | `app.exe` ×2, `Setup.exe` ×2, `cfg-link` ×1 |
| Swap of `.old-*` itself for a link to V, 60 s | 151 | 2 | `cfg-link` ×2 |

- In every run, `books.db`, `bin/tool.exe` and the files inside V's `install-1` were never lost. In the 64124dc round, V was emptied or partly emptied in 44 of 155 attempts.
- About the re-run: the first top-level swap run had a bug in my own probe. Its clean-up walked a link and wiped V, so I discarded that run. The bug did not affect the first sub-folder swap run, whose losses match the re-run.

**Reach.** V can be any folder the ERP's own account can write:
- the update folder, where the next installer sits
- Downloads
- a per-user install folder that holds the app's `.exe`

That is outside the data folder, so this stays **Low**, not Info. The damage is limited to top-level `.exe` files and links: deletion only, no reading or writing.

**Windows (reasoned).**
- A junction needs no special right.
- `readdirSync` and the later `lstat`/`unlink` calls follow a junction in the path.
- `rmdirSync` on a junction removes the junction, not its target.
- There is no atomic exchange, but the attacker owns the folder, so a rename plus a new junction does the same job. That is a harder race, but still open.
- The `:Zone.Identifier` part of the name regex (`:84`) never matches on Windows, because `readdir` does not list streams. That is harmless.

**Precondition:** write access to the data folder (to plant the tree and rename `update-staging.old-*`), as before. One exception: for `main.js:1338` the attacker must rename the app's own `install-*` folder. On Linux, `update-staging` is the app's own folder with mode 0755, so another account cannot do that. On Windows, the folder takes its permissions from the data folder.

**Fix.** Node has no `openat`/`unlinkat`, so this can only be narrowed, not closed. In order of value:
1. **Pin the folder.** Keep the `dev`/`ino` from the first `lstat` (`:69`). Right after `readdirSync`, and again before each `unlinkSync`, `lstat(folder)` again. Stop if it is a link or has a different `dev`/`ino`. That shrinks the window from a whole `readdir` to one `lstat`→`unlink` per entry.
2. **Delete only the app's own file name.** A copy is always named after the installer: match `/^GII-GeM-ERP-Setup-[^\\/]+\.exe$/i`, not any `*.exe`. Do not unlink links found at depth 1 or inside a folder it did not make: leave them and warn. Then a hit can only delete a GII installer, never `app.exe` or a user's link.
3. **Use what the app already knows.** In the two failure clean-ups (`:249`, `main.js:1338`), the app knows the exact copy path and its `dev`/`ino` (`stagedFile`, `:246-247`). Before the `unlink`, `lstat` the copy and require the same `dev`/`ino`. Do not list anything.
4. **Windows.** Create `update-staging` with an owner-only DACL, so other accounts cannot rename anything inside it. That removes the precondition for every case except the one where the attacker made the folder (see N9).

### N9 (Info, new): the in-place fallback keeps a folder someone else made

**What it does.** When `rename(update-staging → .old-*)` fails with EPERM, EACCES or EBUSY and the entry is a real folder, the app now uses it where it is (`updateInstaller.js:127`, `:136-150`):
- it clears the `install-*` folders inside
- it skips the non-recursive `mkdir`
- it makes its `install-*` folder inside

**Measured, with an injected EPERM.** I planted an `update-staging` with mode 0777, holding `planted.txt`, a link `install-LINK` to V, and `install-OLD/{o.exe, keep.dll}`.
- The install went ahead, and the good bytes were opened.
- Afterwards the folder was **still mode 0777**, and `planted.txt` and `install-OLD/keep.dll` were still there.
- The link was unlinked, and V was intact.

**Why it matters.**
- The rename was the step that made sure the folder was the app's own. The fallback skips it.
- Whoever made the folder keeps their permissions on it. On Linux, renaming a folder within the same parent needs no write right on that folder. So the owner can move the app's `install-*` away after the check (the S20-r3(a) case) and feed S20-r3(b).

**How it is triggered.**
- Windows (reasoned): any process holding a handle open inside the folder makes the rename fail. The commit gives antivirus as the example.
- Linux (reasoned): on a data folder with the sticky bit set, a folder owned by another account cannot be renamed, so the rename fails with EPERM.

**Impact.** It stays inside the data folder, and it needs write access there. It ends at S20-r3(b), which only the publisher check closes.

**Fix.**
- Use the folder in place only if it is the app's own:
  - POSIX: `st.uid === process.getuid() && (st.mode & 0o022) === 0`
  - Windows: check its owner and DACL, or reset the DACL to owner-only
- Otherwise, refuse with the existing guided text ("…changed… Restart the ERP and try again").
- The test that now treats the in-place use as correct (`ipc-security.test.mjs`, "a staging folder that cannot be moved … is used where it is") should then also cover a folder with the wrong owner or mode.

### N6-r2 (Info, narrowed): the re-hash checks the size but does not stop reading at it

**Fixed (measured).**
- `hashFile(path, expected)` (`:170-183`) refuses any file whose `dev`, `ino` or `size` differs from the copy (`stagedFile`, `:246-247`). The handler passes these values (`main.js:1329`).
- A 64 GiB sparse file renamed over the copy now returns `""` (refused) in **0.6 ms**. The 64124dc build kept reading it for over 2 minutes.

**Left.** The read (`:178`, `createReadStream({ start: 0 })`) has no `end`, so it reads to the end of the file as it is during the read. A process holding a write handle on the copy itself can make it larger after the `fstat`. `dev`/`ino` stay the same, and the size was already checked.

| Case | Result |
|---|---|
| Injected: the copy (6 bytes) grown to 4 GiB sparse right after the `fstat` | The whole 4 GiB was read and hashed (**6.8 s**), then refused because the hash did not match |
| Real race: the racer opens the copy for write when it appears and grows it to 2 GiB on the re-hash open (inotify), 45 s | **11 of 127** attempts read the 2 GiB, up to 4.7 s. The other attempts were refused at once or opened the good bytes |

- At the ext4 limit (16 TiB) that is about 9.5 h with the updater locked, as in N6-r1.
- **Precondition:**
  - Linux: a write handle on the copy. The copy is created mode 0644 and owned by the app, so another account cannot open it. Measured as root.
  - Windows (reasoned): the copy takes its permissions from the data folder, and Node opens it with share modes that allow other writers. So a data-folder writer can do this.
- **Effect:** the updater is unavailable while the read runs. Nothing wrong is launched.
- **Fix:** `handle.createReadStream({ autoClose: false, start: 0, end: Number(expected.size) - 1 })`. When `expected.size` is 0, hash the empty input and skip the read. Also count the bytes read and refuse if the count is not `expected.size`.

### N7 (fixed, measured), with Info residue

- `sweepMovedStaging` (`:94-102`) runs at start-up (`:60`) and before each staging (`:118`). Measured:
  - `update-staging.old-aaaa/install-Q/z.exe` was removed in full
  - an `update-staging.old-cccc` link was unlinked, and its target was untouched
  - `update-staging.old-bbbb/stray.bin` was left, with a warning, by design
- **Residue (Info):**
  - Anything that is not the updater's own shape stays for good, and is warned about on every sweep.
  - In the sub-folder race the console got 1,946 "Left an unexpected item" lines in 60 s. That is log noise, but someone with data-folder access can use it to bury other warnings.
  - **Fix:** warn once per folder (not per entry), and write one line to the error journal.

### S20-r3(b) (Info, known residual): unchanged

- I re-ran the 64124dc race against `4f3a9b6`: inotify waits for the re-hash `close`, then renames a file over the copy. **1,122 of 2,011** attempts in 30 s opened `MZevil` (measured).
- The audit hash was the good one in every case.
- The new `dev`/`ino` check runs before the read, so it cannot see a swap after it.
- The fix is still S8-r2 (Authenticode publisher check before `openPath`). The narrowing steps from the last report still apply.

### N8 and N3-r1 (Info): unchanged

- `auditUpdate` (`main.js:1294`) still only logs a failed audit write before `openPath`.
- The Zone.Identifier stat-then-read (`:237-240`) is as before.
- The fixes from the last report stand.

## Other changes looked at

- `isInsideStaging` (`:104-110`) now also compares with the real path, ignoring case on Windows. It only chooses which advice text to show and which side `detail.side` names. No security effect.
- The backup failure advice (`main.js:1322-1327`) is wording only, and keyed on the error code. It does not leak paths.
- The depth limit works:
  - the remover never went more than one level down
  - `bin/tool.exe` in the victim folder survived every run
  - a link found at any depth is unlinked, not followed

## Still open from earlier rounds

- **S8-r2 (Low):** no Authenticode or publisher check. It is the control behind S20-r3(b), N9 and N6-r2.
- **N4 (Info; Windows/SMB, reasoned):** the `dev`/`ino` checks, now also in `hashFile`, assume stable file IDs.
- **S17 residue (Info):** unchanged.

## Probe files

All under `/tmp/claude-0/sec-probe/`. Each one needs a worktree at `4f3a9b6` in `/tmp/claude-0/sec-4f3` with `node_modules` linked. Run it from that folder with `node --import ./scripts/audit/lib/electron-register.mjs <probe> <args>`.

| File | What it does | Log |
|---|---|---|
| `new-4f3a9b6.mjs` | Injected cases R1-R5: swap at `readdir`, `rmdir` on a link, in-place fallback, re-hash identity and growth, start-up sweep | `new-4f3a9b6.log` |
| `race-4f3a9b6.mjs` with `racers-4f3.py` | Modes `subswap` and `topswap` | `race-4f3a9b6-subswap.log` (the re-run), `race-4f3a9b6-topswap.log` |
| `racegrow-4f3a9b6.mjs` with `racegrow-4f3.py` | The N6-r2 race | `racegrow-4f3a9b6.log` |
| `rehash-4f3a9b6.mjs` with `racers-641.py` | The S20-r3(b) race | `race-4f3a9b6-rehash.log` |
| | The `test:integrity` run | `tests-4f3a9b6.log` |
