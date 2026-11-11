# Architecture audit: 4f3a9b6..a8c64af

- **Repo and branch:** advmayankmanvendra-glitch/gii-gem-erp, branch `claude/erp-full-automation-qbhv8k`, head `a8c64af`.
- **Written:** 11 Nov 2026, 09:00 IST.
- **Commit in scope:** `a8c64af` ("Close the 4f3a9b6 audit findings: narrower staging clean-up, KG-4 goods receipts"): the rest of F42 in KG-4 (`postStockInward` fields, GOODS_RECEIPT_GRN stage, KG4-GAP-002); the F44 test now keeps a `notes.txt`; the staging remover reworked (installer-copy name rule, links below the top left alone, folder re-checked before each removal, moved-aside folders matched by exact name); a new `removeStagedCopy` for the failed-launch case; the installer must not be a link to another file in the same folder; an in-place staging folder must be the user's own and not writable by others; `hashFile` never reads past the copied size; two new tests (49 in ipc-security).
- **Answers:** audit-4f3a9b6-architecture.md (F42-r, F44, F43, F31, F35).
- **Read against:** AGENTS.md (owner OK for posting changes; no IPC/preload/route-key renames; no business logic in App.jsx or screens), KG-4 (`src/renderer/knowledge/voucher-accounting-graph.json`), WG-1 (`workflow-graph.json`), `inventoryService.js`, owner-decisions-pr4.md.
- **How it was run:** read-only. Worktree `/tmp/claude-0/arch-a8c` at `a8c64af`, `node_modules` symlinked from the main checkout (not added to git, nothing rebuilt, no packages installed). Each mutation was applied alone, the ipc-security suite run, and the file restored with `git checkout`; `git status` was clean before removal. The symlink and worktree were removed at the end; the main checkout's `node_modules` and working tree are intact. Nothing was committed or pushed.

## Commands and results

| Command or check | Result |
|---|---|
| `npm run test:integrity` | 222/222 and 49/49 pass, 0 cancelled (ipc-security was 47) |
| `verify:voucher-accounting-graph`, `verify:knowledge`, `verify:audit` | exit 0 (all pass; verify:audit FAIL 0, CRITICAL 0) |
| KG-4 line numbers by script (23 posting functions) | 23/23 correct (`postStockInward` 189; `inventoryService.js` unchanged) |
| Archived 4f3a9b6 reports vs the mount copies | sha256 and byte counts identical (3/3) |
| Manifest | count 84 → 87 = 87 entries; all 87 re-hashed: 0 mismatches, no duplicates. Only `README.md` unlisted, as before |
| IPC channel, preload method, route key renamed | none. main.js: one import name and one call in the `updates:install` failure path; `src/preload/preload.cjs` untouched |
| App.jsx, screens, renderer code | not touched (only the KG-4 JSON under `src/renderer/knowledge`) |
| Posting, GST, schema, DDL | none. `inventoryService.js`, `accountingService.js`, database files unchanged |
| Size | main.js 1578 lines (unchanged); `updateInstaller.js` 267 → 303 |

### Mutation runs: updater (`ipc-security`, 49 tests)

"UI" = `src/main/services/updateInstaller.js`, lines at a8c64af.

| # | Mutation | Result |
|---|---|---|
| **RT1** | Whole `removeStagingTree` replaced by `fs.rmSync(..., { recursive: true, force: true })` (UI:72) | **Killed now** (F44) |
| **RT4** | Any file deleted, not only installer copies (UI:94) | **Killed now** (F44) |
| RT6 | Links below the top unlinked too (UI:90) | Killed |
| SW4 | Moved-aside match back to plain `startsWith` (UI:117) | Killed |
| SN1 | "Installer is not a link to another file" check removed (UI:42) | Killed |
| OW1 | In-place folder ownership/permission check removed (UI:188) | Killed |
| RC1 | `removeStagedCopy` removes nothing (UI:108) | Killed |
| RC2 | `removeStagedCopy` without the dev/ino identity check (UI:108) | Survives (race-only) |
| UN1 / UN2 | Folder re-check after listing removed (UI:84) / re-check always true (UI:80) | Survive (race-only) |
| HF1 | dev/ino/size check in `hashFile` removed (UI:204) | Survives (race-only, as before) |
| HF4 | "read exactly the copied size" check removed (UI:215) | Survives (race-only) |

## Summary

**F42-r is fixed.** All three places now say a goods receipt posts a GRN receipt Journal, with the right accounts and the "no voucher when zero" rule, and match `inventoryService.js:189-240`. What remains is small labelling (F45, F46), not wrong statements about the books.

**F44 is fixed.** The `notes.txt` assert (and the stricter "only the installer copy was removed" check) kills both RT1 and RT4. The reworked remover is also better pinned: every new rule except the race re-checks has a test that fails without it.

**Repo rules hold.** No IPC, preload or route-key rename; App.jsx and screens untouched; no posting, GST or schema change.

| # | Severity | Owner? | Where | Finding |
|---|---|---|---|---|
| F42-r | Fixed | No | voucher-accounting-graph.json:676-681, :1443-1448, :1766 | All three places corrected and match the code |
| F44 | Fixed | No | ipc-security.test.mjs:972-983 | RT1 and RT4 killed |
| F45 | Low (new) | No | voucher-accounting-graph.json:1444; workflow-graph.json:187 | GRN stage still labelled `inventory_only`; WG-1 still says GRN has no accounting impact |
| F46 | Info (new) | No | voucher-accounting-graph.json:677, :679 | `reportImpact` and `relatedDG1Tables` slightly short |
| F47 | Info (new) | No | UI:71, :94; main.js:1306-1308 | The remover's name rule depends on main.js refusing other names |
| F48 | Info (new) | No | UI:80-101, :105-110, :204, :215 | The new race re-checks have no test (by design, as with HF1) |
| F43 | Fixed | No | UI:114-131 | Unchanged since last round; still correct |
| F31 | Info | No | UI:290-296; main.js:1280-1283, :1322-1326 | Advice rules still in three places |
| F35 | Low | **Yes** (card) | owner's pending card | Nothing built changes the card |
| F34, F30, F11 | Info / Low | No | inventoryService.js | Unchanged, as before |

---

## F42-r: fixed

- **`postStockInward`, :666-681.** `safetyRule` now describes the Journal (Inventory Dr; Goods Received Not Invoiced Cr, or Purchase Cr when the bill was posted first; no voucher when the value is zero; auto-reserve). `transactionBoundary` names the voucher, `auditImpact: true` (the function writes `audit_log` at inventoryService.js:236), `reportImpact` is filled, `relatedDG1Tables` includes the voucher tables and `procurements`. All of this matches inventoryService.js:189-240, including the `procurements` lookup at :219-221 that picks Purchase over GRNI.
- **GOODS_RECEIPT_GRN, :1443-1448.** `createsAccountingImpact: true`, the description names the Journal, `relatedVoucherTypes: ["journal"]` (a real `voucherTypes` id).
- **KG4-GAP-002, :1766.** Now lists goods receipts.
- A search of every file under `src/renderer/knowledge/` finds no remaining text that says a goods receipt posts no voucher.

## F44: fixed

The 64124dc-round clean-up test (ipc-security.test.mjs:960-990) now plants `notes.txt` in `install-real` and asserts that only the installer copy went and that the moved-aside folder is kept because it holds something not ours. RT1 (recursive delete put back) and RT4 (any file deleted) both fail it. It also checks that a user file named like a moved-aside folder is not swept (SW4 killed).

## F45 — Low (new): two leftover "no accounting" labels for goods receipts

- **KG-4 :1444.** The stage now says `createsAccountingImpact: true`, but its `accountingImpact` label is still `"inventory_only"`. Every other voucher-creating stage has a label naming the voucher (`cogs`, `purchase_payable`, `accrual`). A reader or the help assistant keying on the label still gets "inventory only". Suggest `"grn_receipt"` or `"inventory_and_grni"`.
- **WG-1 workflow-graph.json:187.** GOODS_RECEIPT_GRN says `"createsAccountingImpact": false`, which now disagrees with KG-4. This kind of disagreement is not new: PROCUREMENT_PLANNING, DELIVERY_CHALLAN and DEPARTMENT_RECEIVABLE already disagreed between WG-1 and KG-4 before this PR. No verify script compares the two graphs, which is why it passes.
- **Fix:** text only. Change the KG-4 label now (one word). The WG-1 flags are better done together in the KG-4 v1.1 convergence that KG4-GAP-002 already points to, with a small cross-check added to `verify-voucher-accounting-graph.js` so the four disagreements cannot come back. Not a merge blocker. **Owner:** no.

## F46 — Info (new): `postStockInward` row slightly short

- `reportImpact` (:677) lists "trialBalance, balanceSheetReport, stock valuation". A Journal also appears in `dayBook` and `accountingRegisters`, and "stock valuation" is not a report id in `reportDependencies`. The two neighbouring stock rows (adjustment, return) use an array of display names instead of the comma string; the inward row follows the older majority style. Either is fine; the graph mixes both.
- `relatedDG1Tables` (:679) and `writesToTables` leave out `stock_reservations` and `supply_orders`, which `autoReserveOrderStock` (called at inventoryService.js:235) updates. This was already missing before the PR.
- **Fix:** optional, with F45. **Owner:** no.

## F47 — Info (new): the remover's name rule relies on main.js

`removeStagingTree` now deletes only files matching `GII-GeM-ERP-(Setup|Portable)-*.exe` (UI:71, :94). The staged copy keeps the selected file's name (UI:257), and `stageInstaller` itself accepts any `.exe`. It is main.js:1306-1308 that refuses any installer not named `GII-GeM-ERP-Setup-<version>`, so today every staged copy matches. If `stageInstaller` were ever called from another place without that check, its copies would never be cleared (disk use only, with a warning). One line in the `stageInstaller` header comment, or the same name check inside `stageInstaller`, would make the module stand on its own. Not a merge item. **Owner:** no.

## F48 — Info (new): race re-checks are not testable here

The new "folder unchanged since it was listed" checks (UI:80-101), the identity check in `removeStagedCopy` (UI:108) and the "read exactly the copied size" check in `hashFile` (UI:215) can each be removed without a test failing (UN1, UN2, RC2, HF4). Each guards only against another process swapping a file or folder in the app's own data folder between two system calls. They are correct by reading and need a second writer to matter, so like HF1 last round they are documented as race-only and need no test. **Owner:** no.

One behaviour change worth knowing: a moved-aside staging folder that holds anything the updater did not make is now kept for good (with one warning per start-up) instead of being deleted. This is the safer choice and is what the test pins. It does not pile up: the next staging folder is new and empty, so only that one folder stays.

## F43: still fixed

Unchanged logic, plus `realpathSync.native` (UI:128) so the "which side" check resolves mapped drives the same way `fs.promises.realpath` does at UI:137. Correct by reading.

## F31 — Info: module boundary

The updater module is self-contained and main.js only calls it. The three copies of the "disk full / locked / other" advice remain (UI:290-296, main.js:1280-1283, :1322-1326). Worth one shared helper the next time this module is touched. **Owner:** no.

## F35 — confirmation for the owner's card

a8c64af changes no posted amount and nothing the card describes: `inventoryService.js`, `accountingService.js`, schema and DDL are untouched, and the KG-4 change is description text that now matches the code already on the branch. The mount copy of owner-decisions-pr4.md is unchanged since 11 Nov 00:22 IST, so the card's answer is not yet recorded. **PR #4 should not merge before the answer.**

## Readiness of PR #4 (apart from the owner's card)

- **From architecture, PR #4 is ready.** Every finding from the last six rounds is fixed or is information only. Tests, verify scripts, manifest, archived reports, KG-4 line numbers and repo rules are all in order.
- **Nice to have before merge, no new audit round needed:** F45's one-word KG-4 label change, then rerun `verify:voucher-accounting-graph` and `verify:knowledge`.
- **Can wait for KG-4 v1.1:** F45's WG-1 flags (with the cross-graph check), F46, F47, F31.

## Updater audits: recommendation

**Stop full audit rounds on the updater.** This round every reachable rule in the remover, staging and launch path has a test that fails without it; the only survivors are race re-checks that need a second process writing into the app's own data folder, which the module already defends against by reading. The last three rounds each found smaller items than the one before, and each fix added surface for the next round. Further changes to `updateInstaller.js` should get a targeted review of that diff only, not a full three-way round.

## Items for the owner

1. **F35:** answer the pending card, together with the correction note already in the thread. **PR #4 should not merge before the answer.**
2. The gaps in fsr-2a4 policy §6 remain owner decisions.

Everything else (F45, F46, F47, F48, F31, F34, F11) is documentation or test work and needs no owner OK.
