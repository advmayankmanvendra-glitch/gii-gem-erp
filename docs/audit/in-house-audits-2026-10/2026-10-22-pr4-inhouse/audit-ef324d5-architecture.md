# Architecture audit: 32263ab..ef324d5

- **Repo and branch:** advmayankmanvendra-glitch/gii-gem-erp, branch `claude/erp-full-automation-qbhv8k`, head `ef324d5`.
- **Written:** 11 Nov 2026, 07:35 IST.
- **Commit in scope:** `ef324d5` (11 Nov 07:20 IST, "Close the 32263ab audit findings: no leftover installer copies, updater in its own module"): staging and checks moved to `src/main/services/updateInstaller.js` (F31), leftover copies removed (F38), pre-launch re-hash of the staged copy, backup failure turned into a guided error, a "launched" latch, raw errors wrapped and audited, four new updater tests, the source-grep test dropped (F39), KG-4 `postStockReturn.relatedDG1Tables` and the R8 date-filter note (F36), the three 32263ab reports preserved.
- **Answers:** audit-32263ab-architecture.md (F31, F33, F34, F35, F36, F38, F39).
- **Read against:** AGENTS.md (owner OK for posting; no IPC/preload/route-key renames; no business logic in App.jsx or screens), KG-4 (`src/renderer/knowledge/voucher-accounting-graph.json`), fsr-2a4 policy §6, owner-decisions-pr4.md.
- **How it was run:** read-only. Worktree `/tmp/claude-0/arch-ef3` at `ef324d5`, `node_modules` symlinked (not added to git). Each mutation was applied alone (one double mutation noted) and the file restored; `git status --short` was empty after every set, and the worktree was removed afterwards.

## Commands and results

| Command or check | Result |
|---|---|
| `npm run test:integrity` (9 node suites + ipc-security) | 222/222 and 35/35 pass, 0 cancelled |
| `verify:voucher-accounting-graph`, `verify:knowledge`, `verify:audit` | exit 0 |
| KG-4 line numbers by script (23 functions + 2 `reversalRules`) | 25/25 correct (`postStockReturn` still 478) |
| Preserved 32263ab reports in `docs/audit/in-house-audits-2026-10/2026-10-22-pr4-inhouse/` vs the mount copies | sha256 and byte counts identical (3/3) |
| Manifest | count 75 → 78; all 78 entries re-hashed: 0 mismatches, no duplicate paths |
| IPC channel, preload method, route key renamed | none. `updates:status`, `updates:open-folder`, `updates:install` unchanged (preload.cjs:126-128 untouched) |
| App.jsx, screens, renderer | not touched |
| Posting, GST, schema, DDL | none. `inventoryService.js` and `accountingService.js` unchanged; `reportBuilders.js` change is note text only |
| main.js size | 1664 → **1559** lines; new module 169 lines |

### Mutation runs: installer staging (`ipc-security`, 35 tests)

Line numbers are at ef324d5. "UI" = `src/main/services/updateInstaller.js`.

| # | Mutation | Result |
|---|---|---|
| **SG1** | In-flight check skipped (main.js:1262) | **Killed cleanly now** (2 asserts fail, 0 cancelled; was a hang) |
| SG2 | Flag never released (main.js:1285) | Killed (10) |
| **SG2b** | Flag released after a successful launch too (main.js:1285) | **Killed now** (new last test, :714) |
| L1 (new) | "Launched" latch never set (main.js:1274) | Killed |
| SG3 | `nlink !== 1n` removed (UI:116) | Killed (8, cascade, see F40) |
| SG4 / SG4b / SG15 | `sameFile` removed / `recheck !== checked` removed / re-check replaced by `checked` (UI:114-116) | Survive (race-only) |
| SG5 / SG5b | `stats.isFile()` / `pathStats.isFile()` removed (UI:116) | Survive (near-equivalent) |
| SG4 + SG5b together | both removed | **Survives**: the new "link swapped in" test is caught by the folder check inside the second `assertInstallerInsideUpdateFolder`, not by dev/ino (F33) |
| **SG6** | 1 GB size cap removed (UI:120) | **Survives** |
| SG7 | Byte-count cap removed (UI:135) | Survives (needs a >1 GB read; cap not injectable) |
| **SG8** | Size-match check removed (UI:139) | **Killed now** (new test :667; 3 failures, cascade) |
| **SG9** | Free-space refusal removed (UI:125) | **Survives** |
| SG10 | Free-space check always refuses (UI:125) | Killed |
| **SG11** | Clean-up of the install folder on staging error removed (UI:151) | **Killed now** (new test :667) |
| SG12 | Start-up clear call removed (main.js:264) | Survives |
| SG12b (new) | Per-install clearing of leftovers removed (UI:71-73) | Survives |
| SG12c | `clearInstallerStaging` body emptied (UI:59) | Survives |
| SG13 | `mkdtemp` replaced by a fixed `install-fixed` folder (UI:76) | Survives (now race-only: leftovers are cleared just before) |
| SG13b (new) | Post-`mkdtemp` realpath/lstat check skipped (UI:78) | Survives (race-only) |
| SG16 | `O_NOFOLLOW` dropped (UI:52) | Survives (race-only) |
| SG17 | Hash not fed (UI:136) | Killed (now also by the pre-launch re-hash) |
| SG18 | Planted link not removed (UI:65) | Killed |
| SG19 | Post-`mkdir` `lstat` check skipped (UI:67) | Survives (race-only) |
| SG20 | Guided errors not passed through (UI:152) | Killed |
| SG21 / SG22 | Refusal audit rows removed (main.js:1282 / :1266) | Killed / Killed |
| SG23 | `ELOOP`/`EISDIR` mapping removed (UI:110) | Survives (race-only) |
| SG24 | "Which folder" wording (UI:162) | Survives (wording) |
| **N1** (new) | Pre-launch re-hash of the staged copy skipped (main.js:1311) | **Survives** |
| N2 (new) | Copy not removed after a failed backup/launch (main.js:1319) | Killed (test :487) |
| **N3** (new) | Handler no longer wraps a non-guided error (main.js:1278) | **Survives** |
| **N4** (new) | Backup failure not guided (main.js:1309) | **Survives** (and N3 would mask it) |
| N5 (new) | 255-character cut of the audit name removed (UI:85) | Killed (test :689) |
| N6 (new) | Non-string `installerPath` check removed (UI:16) | Survives (path.resolve would throw a raw error, then mapped) |
| N7 (new) | `isFile` removed from the folder check (UI:41) | Survives (near-equivalent) |
| **N8** (new) | Full error path (not basename) in the audit `detail` (UI:164) | **Survives**: test :689 checks the message, not the audit row |
| N9 (new) | Disk-full mapping removed (UI:156) | Survives (wording) |
| N10 (new) | Launch failure no longer guided (main.js:1316) | Killed |
| SG14 / Zone.Identifier cap | Windows only | Not run |

### Mutation runs: supplier-return replay (`audit2`, `posting-regressions`, `critical-defects`; 103 tests)

`inventoryService.js` is unchanged, so lines are as at 32263ab. Same results as last round.

| # | Mutation | Result |
|---|---|---|
| R1 | `gone` never set at the drop (:463) | Killed |
| R2 | Give-back ignores `gone` (:464) | Killed |
| R5 | Drop sets `gone` but does not zero the lot (:463) | Killed (2) |
| X1a | Drop made a no-op (:463) | Killed (3) |
| X1i | Drop moved to the end (`reversedAt = Infinity`, :398) | Killed (2) |
| R4 | `CASE` condition inverted (:380) | Killed (2) |
| R3 | `CASE` removed | Survives: equivalent (speed only) |
| R6 | Tie-break flipped (:459) | Survives: equivalent (dead, F34) |
| F1 | Filter "reversed with no reversal row" removed (:402) | Survives: equivalent |

## Summary

**F31 is done in the main.** The staging, path checks, guided errors and start-up clear now live in `services/updateInstaller.js`; main.js keeps the handler, in-flight flag, audit rows, version gate, backup, launch and quit, which is the right split. main.js is down 105 lines. Two gaps remain, both small: the update-folder discovery and status code (about 120 lines) is still in main.js, and nothing is injected: the module imports `node:fs` directly and the new tests reach it by swapping methods on the shared `fs` object.

**F38 is fixed**, twice over: main.js:1317-1321 removes the copy when the backup, re-hash or launch fails, and UI:71-73 clears leftovers before each install. Test :487 asserts the copy is gone.

**F39 is fixed.** The source grep is gone and a behaviour test (:689: a raw `EACCES` comes back mapped, without its path) takes its place.

**F36 is fixed.** KG-4 :715 lists the eleven tables; the R8 note is in both Party Reconciliation rows (reportBuilders.js:442-443), shown in the drill-down (DrilldownPanel.jsx:93).

**F33 is mostly closed.** SG1 now fails on an assert instead of hanging; SG2b, SG8 and SG11 are killed. Still survive and cheap to test: SG6, SG9, and three new paths (N1 pre-launch re-hash, N3/N4 backup and raw-error wrapping, N8 full path in the audit row). The new "link swapped in" test does not pin the dev/ino check.

**Two new small issues.** F40: updater tests share one "launched" latch and the stub launch succeeds by default, so one mutation that lets a test through fails every later updater test. F41: KG-4 says supplier and department returns post no voucher, which has been wrong since July.

**F35:** nothing built in ef324d5 changes what the owner's card describes (see below). F34 left as is by choice.

| # | Severity | Owner? | Where | Finding |
|---|---|---|---|---|
| F33 | Low | No | UI:120, :125, :116, :164; main.js:1278, :1309, :1311; ipc-security.test.mjs:636 | Survivors SG6, SG9, N1, N3, N4, N8; swap test does not pin `sameFile` |
| F40 | Low (new) | No | electron-stub.mjs:34; ipc-security.test.mjs:530, :667, :714; main.js:1274 | Default stub launch succeeds; one escaped test locks the updater for the rest of the file |
| F41 | Low (new, pre-existing) | No | voucher-accounting-graph.json:1066-1078; inventoryService.js:511-530 | KG-4 says stock returns post no voucher; both kinds post a Journal |
| F31 | Info (was Low) | No | main.js:413-535, :1258-1331; UI:1-7, :50-55 | Discovery still in main.js; no injection; clean-up split over three places |
| F35 | Low | **Yes** (card) | owner's pending card | Note already sent; nothing built changes the card's content |
| F34 | Info | No | inventoryService.js:459 | Tie-break still dead (R6 equivalent), left as is |
| F30 | Info | No | inventoryService.js:367-476 | Wait for the owner's answer |
| F11 | Low | No | inventoryService.js:375-389, :440-448 | Carried |

### Status of the 32263ab findings

| Prev | Status | Evidence |
|---|---|---|
| F31 updater module | **Done (two gaps, now Info)** | UI module 169 lines; main.js 1664 → 1559; see F31 below |
| F38 leftover copies | **Fixed** | main.js:1317-1321; UI:71-73; test :487 (`existsSync(opened) === false`); N2 killed |
| F33 SG1 hang | **Fixed** | test :557 holds only the first launch; SG1 now 2 clean failures, 0 cancelled |
| F33 "no copy left" assert | **Fixed** | test :667 fails part-way (size mismatch) and asserts `update-staging` is empty; SG11 killed |
| F33 SG2b | **Fixed** | test :714 (successful launch, then a second install refused) |
| F33 SG8 | **Fixed** | test :667 |
| F33 SG6, SG9, SG12 | **Open** | still survive; SG12 is now backed up by UI:71-73 |
| F39 source grep | **Fixed** | removed; behaviour test :689 |
| F36 KG-4 and R8 | **Fixed** | KG-4 :715; reportBuilders.js:442-443 |
| F34 tie-break | Open by choice | :459 |
| F35 card | Note sent; owner | nothing built changes it |
| F30, F11 | Open | unchanged by design |

---

## F33 — Low: remaining staging survivors

- **Still cheap with today's harness** (the module reads `fs.*` at call time, so the `withPatchedOpen` pattern at :630 works for other calls too):
  - **SG9:** swap `fs.promises.statfs` to return `{ bavail: 1, bsize: 1 }`; assert the "not enough free disk space" message and an empty `update-staging`.
  - **SG6:** a sparse file over 1 GB (`fs.truncateSync(installer, 1024**3 + 1)`); assert the "1 GB at most" message. No real disk use.
  - **N1** (pre-launch re-hash, main.js:1311): swap `fs.createReadStream` so that, when called on the staged copy, it first appends a byte to that file; `hashFile` then sees changed bytes. Assert "changed before it could start" and that `shell.openPath` was not called.
  - **N8:** in test :689 also read the last `update_installer_refused` row and assert `detail.file` has no folder part. Today the full `/secret/...` path could go into the audit log and no test would notice.
- **Not reachable without injection:** N4/N3 (backup failure): `createLiveBackup` is an ES import into main.js, so a test cannot make it throw. Either inject it (see F31) or accept these two as covered by reading.
- **The swap test (:636) does not test what its name says.** With `sameFile` and `pathStats.isFile()` both removed it still passes, because the second `assertInstallerInsideUpdateFolder` follows the planted link out of the folder and refuses it. To pin the dev/ino check, open the real file in the patched `open`, then `rename` a second regular file from the update folder over the installer path before returning the handle; only `sameFile` can catch that.
- Race-only and equivalent survivors (SG4, SG4b, SG5, SG5b, SG13, SG13b, SG15, SG16, SG19, SG23, SG24, N6, N7, N9) need no tests.
- **Owner:** no.

## F40 — Low (new): one escaped updater test locks the rest of the file

- **Where:** `scripts/audit/lib/electron-stub.mjs:34` (`shell.openPath` returns `""`, a successful launch); tests at ipc-security :530 (hard link) and :667 (part-way copy) do not stub `openPath`; main.js:1274 sets `updateInstallLaunched` and keeps the flag set for the life of the process.
- **What happens:** if a check that those tests rely on is broken, the install goes all the way to a "successful" launch. From then on every updater call is refused with "already been opened", so every later updater test fails too. Seen in the runs: SG3 → 8 failures, SG8 → 3, SG2 → 10. The mutations are still killed, but the report points at tests that are not at fault, and test :714 has to be kept last by a comment.
- **Fix (tests only):** make the stub's default `openPath` return a failure string (for example `"stub: no launch"`), so only a test that means to launch can; and stub it in every updater test. Optionally export a test-only reset of the two flags.
- **Owner:** no.

## F41 — Low (new, pre-existing): KG-4 says stock returns post no voucher

- **Where:** voucher-accounting-graph.json:1066-1071 ("Stock Return (Department)", `voucherCreated: false`, "no accounting voucher") and :1073-1078 ("Stock Return (Supplier)", same).
- **Code:** `postStockReturn` posts a Journal for both kinds whenever the return has a value or clears GRNI/Trade Payables (`needsVoucher`, inventoryService.js:511-530: Dr Inventory / Cr Cost of Goods Sold for a department return; Dr GRNI and/or Trade Payables / Cr Inventory, with variance, for a supplier return). KG-4's own `postStockReturn.safetyRule` (:716) says the same. The two `voucherTypes` rows date from e555aa5 (15 Jul 2026 IST), before this PR.
- **Why it matters:** the help assistant and the knowledge checks read these rows; a user asking "does a supplier return touch the books?" would be told no. `verify:voucher-accounting-graph` does not cross-check `voucherCreated` against the code.
- **Fix:** set `voucherCreated: true`, `impact` to the Journal lines above. Recording only.
- **Owner:** no.

## F31 — Info: the module boundary

- **Right split.** The module (`updateInstaller.js`) holds what is about the file: path check, staging folder, open/re-check, size and space caps, copy and hash, error mapping, start-up clear. main.js keeps what is about the app: the `updates:*` handlers, the in-flight flag and launched latch, audit rows, the version gate, backup, launch and quit. No channel, preload or route key changed.
- **Still in main.js:** update discovery and status, main.js:413-535 (`ensureUpdateFolder`, `parseUpdateVersion`, `safeReadUpdateManifest`, `findLatestUpdateInstaller`, `newestSetupInFolder`, `updateReleaseNotes`, `getUpdateStatus`), about 120 lines. Version rules are now split: `parseUpdateVersion` in main.js, `compareUpdateVersions` and `isPortableInstaller` in `updateVersion.js`. Moving discovery into `updateVersion.js` (or the new module), taking `updateFolder` and `currentVersion` as arguments, would make it testable with plain `node --test`.
- **File-system access is not injected.** The module imports `node:fs` and fixed constants (1 GB, 64 MB headroom, UI:50, :125). Tests reach it only by swapping methods on the shared `fs` object inside the Electron-stub process. That is enough for SG6, SG9, N1 and N8 (F33), but not for SG7 (needs a real >1 GB read), and the backup/launch/quit steps in main.js (N3, N4) cannot be reached at all. There is no stand-alone test file for the module; every updater test goes through the full IPC harness and a real database. If more updater work is planned, pass `{ fsApi = fs, maxBytes = MAX_INSTALLER_BYTES }` to `stageInstaller`, and pass `createLiveBackup` and `shell.openPath` into a small `runInstall(staged, { backup, launch })` helper.
- **Clean-up now happens in three places:** UI:151 (staging failed), main.js:1319 (backup, re-hash or launch failed), UI:71-73 (every leftover, at the start of each install) plus the start-up clear (main.js:264). That works, but UI:71-73 depends on the caller's one-at-a-time flag (the comment at UI:70 says so). If `stageInstaller` were ever called twice at once, the second call would delete the first call's copy mid-write. Put that requirement in a comment on the exported `stageInstaller`, or move the flag into the module.
- **Owner:** no.

## F35 — confirmation for the owner's card

ef324d5 changes no posted amount and nothing the card describes:
- `inventoryService.js`, `accountingService.js`, schema and DDL are untouched.
- `reportBuilders.js:442-443` changes only the `possible_issue` text of the two Party Reconciliation rows.
- KG-4 changes are metadata (`relatedDG1Tables`).
- The replay mutation set gives exactly the same results as at 32263ab (103 tests).

The correction note already sent in the thread still stands as written. The mount copy of owner-decisions-pr4.md is unchanged since 11 Nov 00:22 IST, so the card's answer is not yet recorded. **PR #4 should not merge before the answer.**

## F34 — Info: tie-break left as is

inventoryService.js:459 is still dead (R6 equivalent). Left by choice; no posting effect. Delete it with F30 or add a one-line "defensive" comment.

## F30, F11 — unchanged

F30 waits for the owner's answer. F11 (:375-389, :440-448) carried.

## Items for the owner

1. **F35:** answer the pending card together with the correction note already in the thread. Nothing built since has changed it. **PR #4 should not merge before the answer.**
2. The gaps in policy §6 remain owner decisions.

Everything else (F33, F40, F41, F31, F34, F11) is test, documentation or KG-4 work and needs no owner OK.
