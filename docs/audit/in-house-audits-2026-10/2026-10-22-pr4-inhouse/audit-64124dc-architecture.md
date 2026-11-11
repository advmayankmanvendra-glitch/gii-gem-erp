# Architecture audit: ef324d5..64124dc

- **Repo and branch:** advmayankmanvendra-glitch/gii-gem-erp, branch `claude/erp-full-automation-qbhv8k`, head `64124dc`.
- **Written:** 11 Nov 2026, 08:20 IST.
- **Commit in scope:** `64124dc` (11 Nov 08:03 IST, "Close the ef324d5 audit findings: staging cleared by rename, never through a link"): staging folder cleared by renaming it away instead of deleting through it; `hashFile` reads through a no-follow handle; the Electron stub's `openPath` now fails by default (F40); KG-4 stock-return rows corrected (F41); seven new updater tests (pre-launch re-hash, link swapped in for the staging folder, handler wrapping, backup failure, leftovers and full disk, last-moment link at `mkdtemp`, 1 GB cap and free space); a one-install-at-a-time note on `stageInstaller`; audit rows written through a helper that cannot hide the real outcome; the three ef324d5 reports preserved.
- **Answers:** audit-ef324d5-architecture.md (F31, F33, F34, F40, F41).
- **Read against:** AGENTS.md (owner OK for posting changes; no IPC/preload/route-key renames; no business logic in App.jsx or screens), KG-4 (`src/renderer/knowledge/voucher-accounting-graph.json`), fsr-2a4 policy, owner-decisions-pr4.md.
- **How it was run:** read-only. Worktree `/tmp/claude-0/arch-641` at `64124dc`, `node_modules` symlinked from the main checkout (not added to git; better-sqlite3 loaded under Node, nothing rebuilt). Each mutation was applied alone and the file restored, with `git status` checked after every one. The container restarted once part-way through the staging set; the one mutation it interrupted (SG5b) was found still applied, restored with `git checkout`, and the set was rerun from that point. The worktree and symlink were removed at the end. Nothing was committed or pushed.

## Commands and results

| Command or check | Result |
|---|---|
| `npm run test:integrity` (9 node suites + ipc-security) | 222/222 and 42/42 pass, 0 cancelled (ipc-security was 35) |
| `verify:voucher-accounting-graph`, `verify:knowledge`, `verify:audit` | exit 0 (all pass; verify:audit CRITICAL 0) |
| KG-4 line numbers by script (23 posting functions + 2 `reversalRules`) | 25/25 correct (`postStockReturn` still 478) |
| Preserved ef324d5 reports vs the mount copies | sha256 and byte counts identical (3/3) |
| Manifest | count 78 → 81 = 81 entries; all 81 re-hashed: 0 mismatches, no duplicates. Only `README.md` in the folder is unlisted, as before |
| IPC channel, preload method, route key renamed | none. `updates:status`, `updates:open-folder`, `updates:install` unchanged (main.js:1251-1258); `src/preload/preload.cjs` untouched |
| App.jsx, screens, renderer code | not touched (only the KG-4 JSON under `src/renderer/knowledge`) |
| Posting, GST, schema, DDL | none. `inventoryService.js`, `accountingService.js` unchanged; KG-4 change is description text and a `voucherCreated` flag |
| main.js size | 1559 → 1573 lines; `updateInstaller.js` 169 → 199 |

### Mutation runs: installer staging (`ipc-security`, 42 tests)

"UI" = `src/main/services/updateInstaller.js`. Lines are at 64124dc.

| # | Mutation | Result |
|---|---|---|
| SG1 | In-flight check skipped (main.js:1262) | Killed (2) |
| SG2 | Flag never released (main.js:1290) | Killed (17: expected, the flag is the lock) |
| SG2b | Flag released after a launch too | Killed (1) |
| L1 | "Launched" latch never set (main.js:1274) | Killed (1) |
| **SG3** | `nlink !== 1n` removed (UI:141) | **Killed (1; was 8). F40 fixed** |
| SG4 / SG4b / SG5 / SG5b / SG4+SG5b | `sameFile` / `recheck !== checked` / `isFile` checks removed (UI:141) | Survive (race-only; see F33) |
| **SG6** | 1 GB cap removed (UI:145) | **Killed now** (new test) |
| SG7 | Byte-count cap during the copy removed (UI:160) | Survives (needs a real >1 GB read) |
| SG8 | Size-match check removed (UI:164) | Killed |
| **SG9** | Free-space refusal removed (UI:150) | **Killed now** (new test) |
| SG10 | Free space always refuses | Killed (9) |
| SG11 | Clean-up of the install folder on error removed (UI:181) | Killed |
| SG12 / SG12c | Start-up clear removed (main.js:264) / body emptied (UI:59) | Survive (backed by the per-install rename-away) |
| SG16 | `O_NOFOLLOW` dropped (UI:52) | Survives (race-only) |
| SG23 | `ELOOP`/`EISDIR` mapping removed (UI:135) | Survives (race-only) |
| RA1 (new) | Rename-away skipped (UI:70) | Killed (12) |
| RA2 (new) | Moved-away folder not removed (UI:77) | Killed |
| RA3 (new) | Moved-away link not removed (UI:78) | Killed |
| **RA4** (new) | Old behaviour restored: clear the contents *through* the folder before the rename | **Killed** (new "link's target is untouched" test) |
| RA5 / RA6 (new) | `mkdir` made recursive / `EEXIST` not mapped (UI:82-84) | Survive (race-only) |
| RA7 / RA7b (new) | Only the `dirname(realDir)` check / only the `lstat(expected)` check removed (UI:91) | Survive each alone: the two checks back each other up in the last-moment test |
| RA7c (new) | Whole post-`mkdtemp` check removed (UI:91) | Killed |
| RA8 (new) | `rmdir` of the folder made through the link removed (UI:93) | Killed |
| RA9 / RA10 (new) | `return dir` instead of `realDir`; no `realpath` of the data folder | Survive (equivalent when the data folder has no link in its path, as in the tests) |
| H1 (new) | `hashFile` `isFile` check dropped (UI:109) | Survives (race-only) |
| H2 (new) | `hashFile` back to reading by path (UI:107-111) | Killed (2) |
| **N1** | Pre-launch re-hash skipped (main.js:1324) | **Killed now** |
| **N3** | Handler no longer wraps a non-guided error (main.js:1278) | **Killed now** |
| N3b (new) | "Locked" advice never chosen (main.js:1280) | Survives (wording) |
| **N4** | Backup failure not guided (main.js:1321) | **Killed now** |
| **N8** | Full error path (not basename) in the audit `detail.file` (UI:194) | **Still survives** (F33) |
| N9 | Disk-full mapping removed (UI:186) | Killed now |
| N10 | Launch failure not guided (main.js:1330) | Killed (4) |
| LF1 (new) | Refusal row also written after a failed launch (main.js:1287) | Survives (duplicate audit row only) |
| AU1 (new) | Audit-write failure no longer caught (main.js:1293-1299) | Survives (no test makes the audit write fail) |
| E1 (new) | Update-folder error not guided (main.js:421) | Survives (wording; unreachable in tests) |
| F40 check | Stub default put back to success, plus SG3 | 15 failures (vs 1 with the new stub): the stub change is what stops the cascade |
| Zone.Identifier | Windows only | Not run |

### Mutation runs: supplier-return replay (`audit2`, `posting-regressions`, `critical-defects`; 103 tests)

`inventoryService.js` is unchanged; results identical to the last two rounds.

| # | Mutation | Result |
|---|---|---|
| R1 (:463) / R2 (:464) | `gone` never set / give-back ignores `gone` | Killed / Killed |
| R5 (:463) | Drop sets `gone` but keeps the lot | Killed (2) |
| X1a (:463) / X1i (:398) | Drop a no-op / drop moved to the end | Killed (3) / Killed (2) |
| R4 (:380) | `CASE` inverted | Killed (2) |
| R3 / R6 / F1 | `CASE` removed / tie-break flipped (:459) / filter :402 removed | Survive: equivalent (as before) |

## Summary

**The updater is now at the point of diminishing returns.** Every survivor that a test could reasonably reach in the last report (SG6, SG9, N1, N3, N4) is killed, the rename-away rework is pinned by tests from both sides (RA1-RA4, RA7c, RA8 killed), and the rest of the survivors are either race windows that only a second process could hit, wording, or a duplicate/missing audit row. The only one still worth a few lines is N8 (a full path could reach the audit log unnoticed). Another full round on the updater would mostly re-confirm race-only mutations. I would stop rounds on the updater after N8, or accept N8 as covered by reading.

**F40 is fixed.** With the stub launch failing by default, SG3 now fails one test instead of eight; putting the old default back makes the same mutation fail 15.

**F41 is fixed for stock returns, but the same error remains for Stock Inward and Stock Adjustment** (F42 below). KG-4 still tells the help assistant that a stock receipt and a stock adjustment post no voucher, while PR #4 makes both post a Journal.

**Repo rules hold.** No IPC, preload or route-key rename; App.jsx and screens untouched; no posting, GST or schema change. The owner's pending card is unaffected.

**What should still block PR #4, apart from the owner's card:** nothing from architecture. F42 should be fixed before merge because it is a one-file text change and the PR is what made those rows wrong, but it is documentation, not a merge risk to the books. Everything else is optional.

| # | Severity | Owner? | Where | Finding |
|---|---|---|---|---|
| F42 | Low (new) | No | voucher-accounting-graph.json:1045-1050, :1060-1064, :666-679; inventoryService.js:222-233, :316-329 | KG-4 still says Stock Inward and Stock Adjustment post no voucher; Stock Inward's posting-function entry says none too |
| F33 | Low → Info | No | UI:194; ipc-security.test.mjs:689 | Only N8 left worth a test; rest race-only, wording or equivalent |
| F43 | Info (new) | No | UI:66-78, :187; main.js:264 | Two small rename-away edges: a moved-away folder that cannot be deleted stays as `update-staging.old-*` forever; the "which side" label compares against the non-real path |
| F31 | Info | No | main.js:413-535, :1278-1283; UI:184-192 | Discovery still in main.js; error-to-advice mapping now in two places |
| F35 | Low | **Yes** (card) | owner's pending card | Nothing built changes the card |
| F34 | Info | No | inventoryService.js:459 | Tie-break still dead (R6), left by choice |
| F30, F11 | Info / Low | No | inventoryService.js:367-476 | Unchanged, as before |

### Status of the ef324d5 findings

| Prev | Status | Evidence |
|---|---|---|
| F40 stub launch succeeds | **Fixed** | electron-stub.mjs:34-36; SG3 1 failure (was 8); old stub + SG3 = 15 |
| F41 KG-4 stock returns | **Fixed for returns** (siblings open, F42) | KG-4:1066-1079 now `voucherCreated: true` and the right Journal lines, matching inventoryService.js:509-528 |
| F33 SG6, SG9 | **Fixed** | new test "an installer over 1 GB, or with too little free space" |
| F33 N1 | **Fixed** | new test "a staged copy that changes before the launch is not opened" |
| F33 N3, N4 | **Fixed** | new tests for the handler wrap and the backup failure (reached by putting a file where the backups folder goes, so no injection was needed) |
| F33 N8 | **Open** | still survives |
| F33 swap test / `sameFile` | Open, now Info | SG4+SG5b still survive; race-only |
| F31 one-at-a-time note | **Done** | UI:120-121 comment on `stageInstaller` |
| F31 discovery in main.js, no injection | Open, Info | unchanged |
| F34, F30, F11 | Unchanged | as before |
| F35 card | Owner | nothing built changes it |

---

## F42 — Low (new; the sibling of F41): KG-4 still says stock receipts and adjustments post no voucher

- **Where:**
  - `voucherTypes` "Stock Inward", voucher-accounting-graph.json:1045-1050: `voucherCreated: false`, "no accounting voucher".
  - `voucherTypes` "Stock Adjustment", :1060-1064: same.
  - `postingFunctions` `postStockInward`, :666-679: `writesToTables` has no vouchers, `voucherTypeCreated: null`, `debitAccounts`/`creditAccounts` null.
- **Code:** `postStockInward` posts a Journal "GRN receipt" when the receipt has a value: Dr Inventory, Cr Goods Received Not Invoiced, or Cr Purchase when the bill was posted first (inventoryService.js:222-233). `postStockAdjustment` posts a Journal when the value is above zero: Dr Inventory / Cr Inventory Adjustment Gain, or Dr Inventory Adjustment Loss / Cr Inventory (:316-329). KG-4's own `postStockAdjustment` posting-function entry already says this; only the `voucherTypes` row is stale.
- **Why it matters:** the same reason as F41. The help assistant reads these rows; asked "does a goods receipt touch the books?", it would say no. The GRN voucher was added by this PR (ee675a4, 21 Jul 2026), so the PR is what made the row wrong. KG4-GAP-002 (:1763) mentions adjustments and returns but not receipts.
- **Fix:** documentation only. Set both `voucherCreated: true` with the Journal lines above; give `postStockInward` its voucher tables and accounts; add receipts to KG4-GAP-002 or drop the "partly closed" wording for the parts now fixed. Optionally add a check to `verify:voucher-accounting-graph` that a `voucherTypes` row and its `postingFunctions` entry agree on whether a voucher is created (that check would have caught F41 and F42).
- **Owner:** no (this records what is already built; it changes no posting).

## F33 — Info (was Low): what is left of the staging survivors

- **N8 still survives** (UI:194). In the error mapping, `detail.file` is cut to the base name; if that cut were lost, the full path of an installer or staging file would go into the audit log and no test would notice. Test :689 checks the message only, and the new ENOSPC test checks `detail.side` only. One line fixes it: in the ENOSPC test (or :689), also `assert.equal(lastRefusal().detail.file, path.basename(...))`, with an error that carries a `path` with a folder part.
- **LF1, AU1, N3b, E1** (new survivors) are a duplicate audit row, an audit write that throws, and two wording branches. Not worth tests unless the audit log's exact rows are a requirement.
- **Race-only and equivalent** (SG4, SG4b, SG5, SG5b, SG7, SG12, SG12c, SG16, SG23, RA5, RA6, RA9, RA10, H1, and RA7/RA7b alone): no tests needed. RA7 and RA7b each survive because the other check catches the same planted link; only together are they killed. That is fine (defence in depth), not a gap.
- **Owner:** no.

## F43 — Info (new): two small edges of the rename-away staging

- **Leftover `update-staging.old-*` folders.** UI:77-78 delete the moved-away folder or link with errors ignored. If that delete fails (for example antivirus holding the old installer copy on Windows), the folder stays in the data folder under a random name. Nothing removes it later: the start-up clear (main.js:264, UI:58-60) and the next install only touch `update-staging` itself. Each case can leave up to 1 GB behind. Suggest the start-up clear also remove `update-staging.old-*` siblings (with `lstat` first, unlinking a link and never following it). Not a merge blocker.
- **"Which side" label.** The staging folder is now made under the real path of the data folder (UI:66, returned at :96), but the error mapping still decides "data folder or update folder?" by comparing against the unresolved path (UI:187, `stagingFolderPath(dataRoot)`). When the data folder's path contains a link or junction, a locked staged copy would be called "the installer in the update folder". Wording only. Compare against the same real path (pass `expected` back, or `realpath` once).
- **Owner:** no.

## F31 — Info: the module boundary

- No change to the split agreed last round. main.js grew by 14 lines, all updater handling: the `auditUpdate` helper (main.js:1293-1299) and a "locked or busy" advice branch in the handler (:1280-1283). That branch repeats the EACCES/EPERM/EBUSY mapping in UI:190-191, so the error-to-advice rules now live in two places. If the module gets another pass, one exported `mapUpdateError(error, { side })` would serve both.
- Update discovery and status (main.js:413-535) are still in main.js; nothing is injected. The new tests show the harness can reach every branch that matters without injection, so I no longer recommend injection for testing's sake.
- `ensureUpdateFolder` now raises a guided error (main.js:421), so its message reaches the user instead of the generic one. Good.
- **Owner:** no.

## F41 — checked

voucher-accounting-graph.json:1066-1079 now say both kinds of stock return post a Journal. Checked against inventoryService.js:505-528: a department return is Dr Inventory / Cr Cost of Goods Sold at weighted average cost; a supplier return is Dr Trade Payables and/or Goods Received Not Invoiced, Cr Inventory, with the gap to Purchase Price Variance, and no voucher when it is worth nothing and clears nothing. Both texts are correct. (The department row does not say that a zero-value return posts no voucher; too small to matter.)

## F35 — confirmation for the owner's card

64124dc changes no posted amount and nothing the card describes:
- `inventoryService.js`, `accountingService.js`, schema and DDL are untouched.
- The KG-4 change is description text and the `voucherCreated` flag.
- The replay mutation set gives exactly the same results as at 32263ab and ef324d5 (103 tests).

The mount copy of owner-decisions-pr4.md is unchanged since 11 Nov 00:22 IST, so the card's answer is not yet recorded. **PR #4 should not merge before the answer.**

## Overall view

- **Updater:** done for the purpose of this PR. Across the last four rounds every reachable check has gained a test that fails when the check is removed; what survives now is race-only, wording, or audit-row detail. Further audit rounds on the updater would cost more than they find. If one more change goes in, make it the N8 assert and (optionally) the `.old-*` start-up clean-up in F43; neither needs another full round.
- **Knowledge graph:** F42 is the one item I would fix before merge, because the PR made those rows wrong and the help assistant reads them. It is text only and needs no owner OK.
- **Blocking PR #4:** only the owner's pending card (F35). Nothing else in architecture blocks it.

## Items for the owner

1. **F35:** answer the pending card, together with the correction note already in the thread. Nothing built since has changed it. **PR #4 should not merge before the answer.**
2. The gaps in fsr-2a4 policy §6 remain owner decisions.

Everything else (F42, F33, F43, F31, F34, F11) is test, documentation or KG-4 work and needs no owner OK.
