# Architecture audit: efefcbb..32263ab

- **Repo and branch:** advmayankmanvendra-glitch/gii-gem-erp, branch `claude/erp-full-automation-qbhv8k`, head `32263ab`.
- **Written:** 11 Nov 2026, 07:05 IST.
- **Commit in scope:** `32263ab` (11 Nov 06:52 IST, "Close the efefcbb audit findings: one update install at a time, no link-following when staging"): install flag moved into the `updates:install` handler, `guidedError` helper, staging rebuilt (`ensureStagingFolder`, one `mkdtemp` folder per install, `O_NOFOLLOW`, re-check after open, `lstat`), refused installs audited, "Preparing update..." button state, end-of-replay zeroing removed from `inventoryService.js`, policy §6 wording, KG-4 line number, five new or tightened tests, the three efefcbb reports preserved.
- **Answers:** audit-efefcbb-architecture.md (F32-F37, F30, F31, F11).
- **Read against:** AGENTS.md (owner OK for posting; no IPC/preload/route-key renames; no business logic in App.jsx or screens), KG-4 (`src/renderer/knowledge/voucher-accounting-graph.json`), fsr-2a4 policy §6, owner-decisions-pr4.md.
- **How it was run:** read-only. Worktree `/tmp/claude-0/arch-322` at `32263ab` with `node_modules` symlinked (not added to git). Each mutation was applied alone and the file restored; `git status --short` was empty at the end, and the worktree was removed afterwards.

## Commands and results

| Command or check | Result |
|---|---|
| `npm run test:integrity` (9 node suites + ipc-security) | 222/222 and 31/31 pass |
| `verify:voucher-accounting-graph`, `verify:knowledge`, `verify:audit` | exit 0 |
| KG-4 line numbers by script (23 functions + 2 `reversalRules`) | 25/25 correct (`postStockReturn` now 478) |
| Preserved efefcbb reports in `docs/audit/in-house-audits-2026-10/2026-10-22-pr4-inhouse/` vs the mount copies | sha256 identical (3/3); manifest count 72 → 75 with matching hashes and byte counts |
| IPC channel, preload method, route key renamed | none. `updates:install` keeps its name; the handler body moved into `installUpdateFromFolder` in the same file. No preload file touched |
| App.jsx touched | no |
| Screen logic | `SettingsScreen.jsx:10, :125, :131` add `installingUpdate` (set before the call, cleared on error, left set after success because the app is closing); `components/settings/index.jsx:97` disables the button and shows "Preparing update...". **UI state only**; the one-at-a-time rule is enforced in main (`main.js:1388-1406`) |
| `inventoryService.js` change | removes the end-of-replay loop that zeroed reversed receipts. **Posting-neutral**: every reversed receipt that survives the filter at :402 has `reversedAt > slId` and gets a drop event (:458) that sets `left = 0` and `gone` (:463); a later `take` skips it (`left <= 1e-9`) and a later give-back skips it (`gone`). Confirmed by mutation: all 103 replay tests give the same amounts. No owner OK needed |
| DDL | none |

### Mutation runs: supplier-return replay (`audit2`, `posting-regressions`, `critical-defects`; 103 tests)

| # | Mutation (inventoryService.js) | Result |
|---|---|---|
| R1 | `gone` never set at the drop (:463) | Killed |
| R2 | Give-back ignores `gone` (:464) | Killed |
| **R5** | **Drop sets `gone` but does not zero the lot (:463)** | **Killed now** (new audit2 :1311 and, since :468 is gone, 8d5dd67 "keeps the returns made while it stood") |
| X1a | Drop made a no-op (:463) | Killed (3 tests) |
| X1i | Drop moved to the end (`reversedAt = Infinity`, :398) | Killed |
| R4 | `CASE` condition inverted (:380) | Killed |
| R3 | `CASE` removed (subquery for every lot) | Survives: equivalent (speed only), as before |
| R6 | Tie-break flipped (:459) | Survives: equivalent (dead, F34) |
| F1 (new) | Filter "reversed with no reversal row" removed (:402) | Survives: equivalent (such a lot gets a drop at 0, before any return) |
| X1b | End-of-replay zeroing | Code removed (F34 half closed) |

### Mutation runs: installer staging (`ipc-security`, 31 tests)

| # | Mutation (main.js, line at 32263ab) | Result |
|---|---|---|
| **SG1** | **In-flight check skipped (:1388)** | **Killed now**, but by a hang: the second install waits on the stubbed launch, so the new test and the two after it are *cancelled* (3 cancelled, exit non-zero), not failed on an assert |
| SG2 | Flag never released (:1405) | Killed (6 tests) |
| SG2b | Flag released after a successful launch too (:1405) | Survives: the harness never lets a launch succeed (it would quit the app) |
| SG3 | `nlink !== 1n` removed (:622) | Killed |
| SG4 / SG4b / SG15 | `sameFile` removed / `recheck !== checked` removed / re-check replaced by `checked` (:620-622) | Survive: race-only (needs a swap between check and open) |
| SG5 / SG5b | `stats.isFile()` / `pathStats.isFile()` removed (:622) | Survive: near-equivalent (`assertInstallerInsideUpdateFolder` already `lstat`s; `O_NOFOLLOW` refuses a link) |
| **SG6** | **1 GB size cap removed (:626)** | **Survives** (carried S2) |
| **SG7** | **Byte-count cap removed (:641)** | **Survives** |
| **SG8** | **Size-match check removed (:645)** | **Survives** |
| **SG9** | **Free-space refusal removed (:631)** | **Survives** |
| SG10 | Free-space check always refuses (:631) | Killed |
| **SG11** | **Clean-up of the install folder on error removed (:656)** | **Survives** (see F33: the new "no copy is left behind" assert cannot fail) |
| **SG12** | **Start-up clear removed (:265)** | **Survives** |
| SG13 | `mkdtemp` replaced by the shared staging folder (:598) | Killed (second-install test: `wx` hits the first copy) |
| SG16 | `O_NOFOLLOW` dropped (:579) | Survives: race-only (`realpath` already resolved links) |
| SG17 | Hash not fed (:642) | Killed |
| SG18 | Planted link not removed from the staging path (:592) | Killed (new link test) |
| SG19 | Post-`mkdir` `lstat` check skipped (:594) | Survives: race-only (SG18 already removed the link) |
| SG20 | Guided errors no longer passed through (:657) | Killed |
| SG21 / SG22 | Refusal audit rows removed (:1400 / :1390) | Killed / Killed |
| SG23 | `ELOOP`/`EISDIR` mapping removed (:616) | Survives: race-only |
| SG24 | "Which folder" wording in the generic error (:660) | Survives: wording only |
| SG14 | Zone.Identifier copy | Not run: Windows only |

## Summary

**F32 is fixed.** The flag now lives in the `updates:install` handler, covers the whole path from the first check to the launch, stays set after a successful launch, and is released on any failure. The refused second install is audited. The Settings button is disabled while an install runs, and that state is UI-only. The test kills SG1, but only by hanging (F33).

**F37 is fixed.** The installer is opened with `O_NOFOLLOW`, checked again after the open with `lstat`, and must be the same file (dev/ino with bigint stats), so the `stat` gap I raised is closed. A planted link as the staging folder is removed and the copy goes into a new `mkdtemp` folder each time.

**F33 is half closed.** R5 is now killed. Both silent `catch { return; }` tests now run their asserts. Ten staging survivors remain (SG6-SG9, SG11, SG12 testable; SG4, SG4b, SG15, SG16, SG19, SG23 race-only), plus SG2b. The new "no copy is left behind" assert cannot fail for a hard-link refusal.

**F34 is half closed.** The dead end-of-replay loop is gone, and its removal changes no posting. The tie-break at :459 is still dead.

**F36 is half closed.** Policy :89 now carries the "except to a receipt already reversed by then" exception, and V3 now reads "as the stock ledger grows". R8 is still not in the Party Reconciliation report's notes. KG-4 `postStockReturn.relatedDG1Tables` is still the old six tables.

**One new small issue (F38).** With a fresh folder for each install and no clearing between installs, every install that stages and then fails at backup or launch leaves a full installer copy (up to 1 GB) until the next start-up.

**F31 should be done now.** main.js has grown again (1605 → 1664 lines), and the updater now takes up about 310 of them. Every testable staging survivor needs injected `fs` calls, which the Electron harness cannot give.

| # | Severity | Owner? | Where | Finding |
|---|---|---|---|---|
| F38 | Low | No | main.js:1421-1426, :598 | A failed backup or launch leaves its staged copy; copies pile up until restart |
| F33 | Low | No | ipc-security.test.mjs:528-545, :547-580; main.js:626-660, :265 | Ten staging survivors plus SG2b; SG1 killed only by a hang; the "no copy left" assert cannot fail |
| F31 | Low (was Info) | No | main.js:414-664, :1377-1435 | Updater is about 310 lines of a 1664-line main.js; move it out now |
| F36 | Low | No | KG-4 :715; reportBuilders.js:426 | `relatedDG1Tables` still the old six; R8 not in the report notes |
| F35 | Low | **Yes** (card text) | owner's pending card | Cannot be edited; post a correction note (text below) |
| F34 | Info | No | inventoryService.js:459 | Tie-break still dead (end-of-replay loop removed) |
| F39 | Info | No | ipc-security.test.mjs:625 | Test greps main.js source for an old regex; brittle, proves little |
| F30 | Info | No | inventoryService.js:367-476 | Still wait for the owner's answer |
| F11 | Low | No | inventoryService.js:375-389, :440-448 | Carried |

### Status of the efefcbb findings

| Prev | Status | Evidence |
|---|---|---|
| F32 in-flight flag | **Fixed** | main.js:1386-1406; test ipc-security :547 (P2 as a test). Refusal audited (:1388-1391) |
| F33 R5 | **Fixed** | audit2 :1311 (my P3); R5 killed by two tests |
| F33 silent tests | **Fixed** | audit2 :1302 and ipc-security :536 no longer catch and return |
| F33 staging survivors | **Partly** | SG1, SG13 killed now; SG3, SG10, SG17 still killed; SG6-SG9, SG11, SG12 still survive; the rest are race-only or equivalent |
| F34 dead code | **Half** | :467-468 removed (posting-neutral); tie-break :459 remains |
| F35 card text | **Open (owner)** | Card cannot be edited; correction note below |
| F36 policy and KG-4 | **Half** | Policy :89 and V3 (:92) fixed; R8 and `relatedDG1Tables` not done |
| F37 `stat` vs `lstat` | **Fixed** | main.js:579 `O_NOFOLLOW`, :619-622 re-check with `lstat` and bigint dev/ino |
| F31 updater module | **Open, worse** | 1605 → 1664 lines |
| F30, F11 | Open | Unchanged by design |

---

## F38 — Low: a failed launch or backup leaves its staged copy behind

- **Where:** main.js:598 (`mkdtemp` per install); `installUpdateFromFolder` :1421-1426 (backup, launch, `throw new Error(failureReason)`).
- **What happens:** `stageInstaller` deletes its own folder only when *staging* fails (:656). Once it returns, a failure in `createLiveBackup` or a launch failure (`failureReason`) leaves `update-staging/install-XXXXXX/<installer>.exe` in place. Before 32263ab every new install emptied the whole staging folder first; now nothing does so until the next start-up (:265). The existing test at ipc-security :487 shows this: it reads the staged copy after a failed launch. An admin who retries a failing launch five times keeps five copies, each up to 1 GB, next to the books, and the free-space check then refuses sooner.
- **Fix (no owner, no IPC change):** in `installUpdateFromFolder`, wrap the backup and launch in `try`/`catch`; on failure remove `path.dirname(staged.stagedPath)` and rethrow. Keep the copy only after a successful launch. Test: after the failed-launch test, assert that `update-staging` holds no installer file.
- **Owner:** no.

## F33 — Low: remaining survivors and test strength

- **SG1 is killed by a hang, not an assert.** If the check is skipped, the second call waits on the stubbed launch (`held`), so node's runner cancels the test and the two tests after it. A future change could make that a 30 s timeout with misleading cancellations in unrelated tests. Await the second call with a `Promise.race` against a short timer and assert on the result, so the test fails cleanly and alone.
- **"No copy is left behind" cannot fail** (:539-541). The hard-link refusal happens before any byte is written, so there is never a file to find; SG11 survives. To reach :656, the failure must come after the write starts: SG8 (size mismatch) or SG7 in the F31 module, then assert that the `install-*` folder is gone.
- **Still untested and cheap:** SG12 (write a file into `update-staging`, call the start-up clear, assert it is gone); SG6 (sparse file over 1 GB via `ftruncate`, assert the "1 GB at most" message). Both work today in the IPC harness.
- **Need the F31 module (injected `fs`):** SG7, SG8, SG9, SG11, and the race-only SG4, SG4b, SG15, SG16, SG19, SG23.
- **SG2b** (flag released after a successful launch) cannot be tested while the launch quits the app; in the module, inject the quit.
- **Owner:** no.

## F31 — Low: move the updater out of main.js now

- **Size:** main.js 1534 → 1559 → 1605 → **1664** lines across the last four rounds. The updater is now :414-664 (about 250 lines: folder, version parsing, status, `guidedError`, path check, staging) plus the handlers at :1377-1435 (about 60 lines), so about 310 lines.
- **Why now:** (1) Seven of the ten remaining staging survivors, and SG2b, can only be tested with an injected `open`, `statfs`, read stream and quit. (2) The code has nothing to do with the owner's card (no posting, GST or schema), so moving it changes nothing under review. (3) Each round adds 45-60 lines here.
- **Shape (as before):** `src/main/services/deployment/updateInstaller.js` exporting `ensureUpdateFolder`, `parseUpdateVersion`, `compareUpdateVersions`, `findLatestUpdateInstaller`, `newestSetupInFolder`, `assertInstallerInsideUpdateFolder`, `stageInstaller`, `clearInstallerStaging`, `guidedError`, taking `{ updateFolder, stagingFolder, fsApi }`. `main.js` keeps the three `updates:*` handlers with the same channel names (no IPC, preload or route-key change), the in-flight flag, the audit calls and the quit. Unit-test with plain `node --test`.
- **Owner:** no.

## F36 — Low: KG-4 and report-note leftovers

- KG-4 :715 `postStockReturn.relatedDG1Tables` is still `stock_returns, stock_ledger, items, vouchers, voucher_lines, ledger_entries`. Add `stock_inwards`, `procurements`, `goods_receipts`, `goods_receipt_items`, `accounts` (already in `readsFromTables` at :706). Carried F13.
- R8 (Party Reconciliation compares a date-filtered ledger with all-dates bill-wise payables) is still only in policy §6 :92. Put one line in the Party Reconciliation report's notes (reportBuilders.js:426 or the screen's help text), so a user sees it where the mismatch shows.
- Optional: a KG4-GAP-007 entry pointing to policy §6's known gaps.
- **Owner:** no (recording only).

## F35 — Low (governance): correction note for the owner's pending card

The card cannot be edited in place. Nothing in 32263ab changes a posted amount (the replay change is dead-code removal, shown above), so the card's "as built" is still the efefcbb behaviour. Post a short note under the card, before it is answered, along these lines:

> **Correction to the pending card (no change to what is built; 32263ab changes no posting).** Please read the items with these additions:
> 1. Item 1: within a supplier's receipts, **unbilled receipts are used before billed ones** (oldest first within each, free receipts last). This decides whether a return clears GRNI or Trade Payables.
> 2. Item 3: a reversed return gives its receipts back from the moment it is reversed, **except to a receipt that was already reversed by then**.
> 3. Item 5: a purchase voucher with stock but no taxable value brings the goods in at **its landed cost, or else quantity × rate**, and that stock has **no GRNI entry** for a return or bill to clear (known gap F16).
> 4. The `stock_ledger (source_module, source_id)` index changes no posting (it speeds each return post from about 35-48 ms to 12 ms on 500 receipts). It can be approved under any option, **including Hold**, as its own yes/no.
>
> Your choice of option is not affected by these additions.

- After the answer, record the card, this note and the answer in owner-decisions-pr4.md (mount copy unchanged since 11 Nov 00:22 IST). **PR #4 should not merge before the answer.**
- **Owner:** yes (to read the note with the card).

## F34 — Info: tie-break still dead

- inventoryService.js:459: events sit at distinct `stock_ledger` ids (a return's first row, its reversal row, a receipt's reversal row), so `x.at - y.at` is never 0 and the `give` tie-break never decides (R6 equivalent). Delete it with F30, or leave it with a comment that it is defensive. No posting change.

## F39 — Info: a test that reads main.js source

- ipc-security :624-625 checks that main.js does not contain the old regex `/not started|already being prepared|update folder|installer/`. That only proves one old string is gone; any new pass-through pattern would pass. SG20 (guided pass-through removed) is already killed by the hard-link test, and SG21 by the audit-row part of this test, so the source check adds nothing. Drop it, or replace it with a behaviour check: an error that is not guided, such as an `EACCES` on the staging folder, must come back as "The update could not be prepared".

## F30 — after the owner's answer (unchanged)

The reasons in the efefcbb report still hold: the card asks the owner to approve the replay as built, and option 1 would change its shape. The no-risk parts are done (P3 is now a test, the end-of-replay loop is gone); only the :459 tie-break is left.

## F11 — Low (carried)

:375-389 and :440-448 are unchanged.

---

## Items for the owner

1. **F35:** read the correction note above together with the pending card; the note adds three clarifications and offers the index separately. Nothing built has changed. **PR #4 should not merge before the answer.**
2. The gaps in policy §6 (V2, V4, V5/T7, V6, T5, N2, R8, V3, F16, restore renumbering) remain owner decisions.

Everything else (F38, F33, F31, F36, F34, F39, F11) is code, tests, documentation or KG-4 work and needs no owner OK. F30 waits for the answer.
