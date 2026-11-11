# Architecture audit: 64124dc..4f3a9b6

- **Repo and branch:** advmayankmanvendra-glitch/gii-gem-erp, branch `claude/erp-full-automation-qbhv8k`, head `4f3a9b6`.
- **Written:** 11 Nov 2026, 08:40 IST.
- **Commit in scope:** `4f3a9b6` (11 Nov 08:31 IST, "Close the 64124dc audit findings: staging clean-up removes only installer copies"): staging clean-up through a new shape-checked `removeStagingTree` instead of recursive deletes; `update-staging.old-*` folders swept at start-up and before each install (F43); a staging folder that Windows will not rename is used in place; the "which side" of an error judged on the real path (F43); the pre-launch re-hash checks the copied file's identity and size; backup failures get advice by error code; KG-4 stock inward and stock adjustment rows now say a Journal is posted (F42); the N8 assert and five new updater tests; the three 64124dc reports archived.
- **Answers:** audit-64124dc-architecture.md (F42, F33/N8, F43, F31, F35).
- **Read against:** AGENTS.md (owner OK for posting changes; no IPC/preload/route-key renames; no business logic in App.jsx or screens), KG-4 (`src/renderer/knowledge/voucher-accounting-graph.json`), `inventoryService.js`, owner-decisions-pr4.md.
- **How it was run:** read-only. Worktree `/tmp/claude-0/arch-4f3` at `4f3a9b6`, `node_modules` symlinked from the main checkout (not added to git, nothing rebuilt, no packages installed). Each mutation was applied alone, the ipc-security suite run, and the file restored with `git checkout`; `git status` was clean after every one and before removal. The worktree and symlink were removed at the end; the main checkout's `node_modules` is intact. Nothing was committed or pushed.

## Commands and results

| Command or check | Result |
|---|---|
| `npm run test:integrity` | 222/222 and 47/47 pass, 0 cancelled (ipc-security was 42) |
| `verify:voucher-accounting-graph`, `verify:knowledge`, `verify:audit` | exit 0 (all pass; verify:audit FAIL 0, CRITICAL 0) |
| KG-4 line numbers by script (23 posting functions) | 23/23 correct (`postStockInward` 189, `postStockAdjustment` 291) |
| KG-4 `inventoryImpact` rows vs their `postingFunctions` entry (voucher or not) | 6/6 agree now (Stock Inward and Stock Adjustment were the two that disagreed) |
| Archived 64124dc reports vs the mount copies | sha256 and byte counts identical (3/3) |
| Manifest | count 81 → 84 = 84 entries; all 84 re-hashed: 0 mismatches, no duplicates. Only `README.md` in the folder is unlisted, as before |
| IPC channel, preload method, route key renamed | none. Only the body of the `updates:install` handler and one import line changed in main.js; `src/preload/preload.cjs` untouched |
| App.jsx, screens, renderer code | not touched (only the KG-4 JSON under `src/renderer/knowledge`) |
| Posting, GST, schema, DDL | none. `inventoryService.js`, `accountingService.js`, schema files unchanged |
| Size | main.js 1573 → 1578 lines; `updateInstaller.js` 199 → 267 |

### Mutation runs: updater (`ipc-security`, 47 tests)

"UI" = `src/main/services/updateInstaller.js`, lines at 4f3a9b6.

| # | Mutation | Result |
|---|---|---|
| **N8** | Full error path in the audit `detail.file` (UI:262) | **Killed now (F33 closed)** |
| SW1 | Start-up sweep of `.old-*` removed (UI:60) | Survives (the sweep before each install covers it) |
| SW2 | Sweep before staging removed (UI:118) | Killed |
| SW3 | Sweep emptied (UI:94) | Killed |
| **RT1** | Whole `removeStagingTree` replaced by the old `fs.rmSync(..., { recursive: true, force: true })` (UI:67) | **Survives** (F44) |
| RT2 | Link entries not unlinked (UI:80) | Killed |
| RT3 | `install-*` folders recursed at any depth (UI:82) | Survives (equivalent in practice) |
| **RT4** | Any file deleted, not only `.exe` copies (UI:84) | **Survives** (F44) |
| RT5 | Top-level link or file not unlinked (UI:70-71) | Survives (the rename-away removes it anyway) |
| IP1 | In-place fallback removed (UI:127) | Killed |
| IP2 | In-place fallback without the "real folder" check (UI:127) | Survives (the post-`mkdtemp` check refuses a link) |
| IP3 | In-place clear of old `install-*` folders removed (UI:136-141) | Survives (leftover disk use only) |
| IP4 | `mkdir` run in the in-place case too | Killed |
| IS1 / IS2 | "Which side" judged on the plain path only (UI:109 / UI:255) | Survive (tests' data folder has no link in its path; wording only) |
| HF1 / HF3 | dev/ino/size check in `hashFile` removed / size part removed (UI:176) | Survive (F44; race-only) |
| HF2 | main.js passes no `stagedFile` to `hashFile` (main.js:1329) | Survives (same) |
| CL1 / CL2 | Failed-launch clean-up at depth 0 / removed (main.js:1338) | Killed / Killed |
| CL3 | Failed-copy clean-up removed (UI:249) | Killed |
| BK1 / BK2 | Backup advice "locked" / "disk full" branch never chosen (main.js:1322-1326) | Survive (wording) |

The supplier-return replay set was not rerun: `inventoryService.js` is byte-identical to 64124dc, where it gave the same results for three rounds.

## Summary

**F42 is fixed where it mattered most, but not everywhere.** The two `inventoryImpact` rows and the `postStockInward` table and account fields now match the code. Three other places in the same graph still say a goods receipt posts no voucher (F42-r, below). Text only, five minutes' work.

**F33 (N8) is closed** and **F43 is fixed in code** (both edges): leftover `.old-*` folders are swept, and the error side is judged on the real path.

**The new shape-checked clean-up is sound but not pinned.** Putting the old recursive delete back passes every test, because Node's own recursive delete already unlinks a link instead of walking it, which is all the new "link targets untouched" test checks. The thing the new function adds (only installer copies are ever deleted) has no test (F44). Not a merge blocker.

**Repo rules hold.** No IPC, preload or route-key rename; App.jsx and screens untouched; no posting, GST or schema change.

| # | Severity | Owner? | Where | Finding |
|---|---|---|---|---|
| F42-r | Low (rest of F42) | No | voucher-accounting-graph.json:676-681, :1443-1448, :1766 | Three KG-4 places still say a goods receipt posts no voucher |
| F44 | Info (new) | No | UI:67-91, :176; ipc-security.test.mjs (last 64124dc-round test) | "Only installer copies" and the dev/ino re-hash check have no test that fails without them |
| F43 | Fixed | No | UI:94-110, :118, :255 | Both edges fixed; the real-path side is not testable in this harness (IS1/IS2) |
| F33 | Fixed | No | ipc-security.test.mjs:701 | N8 killed |
| F31 | Info | No | UI:256-260; main.js:1280-1283, :1322-1326 | Error-to-advice rules now in three places |
| F35 | Low | **Yes** (card) | owner's pending card | Nothing built changes the card |
| F34, F30, F11 | Info / Low | No | inventoryService.js | Unchanged, as before |

---

## F42-r — Low: the rest of F42 (KG-4 still says goods receipts post no voucher in three places)

What was fixed: `inventoryImpact` "Stock Inward" (:1044-1051) and "Stock Adjustment" (:1060-1067) now say a Journal is posted with the right lines and "no voucher when the value is zero"; `postStockInward` (:666-674) has the voucher tables, `Journal (GRN receipt)` and the right accounts. All of this matches inventoryService.js:189-240 (Dr Inventory, Cr Goods Received Not Invoiced, or Cr Purchase when the bill was posted first; no voucher when the rounded value is zero) and :291-335 (gain/loss Journals). The department-return "no voucher when zero" note matches :510.

What is still wrong:
- **`postStockInward` entry, :676-681.** `safetyRule` still reads "No accounting voucher created (valuation impact tracked via weighted average cost)", which now contradicts `voucherTypeCreated` four lines above. Also `transactionBoundary` omits the Journal, `auditImpact: false` (the function writes `audit_log`, :236; `postStockAdjustment` says true), `reportImpact: null` (now Trial Balance, Balance Sheet, Stock Summary), and `relatedDG1Tables` lacks the voucher tables. Compare `postStockAdjustment` (:684-707), which was updated in full.
- **`workflowAlignment` GOODS_RECEIPT_GRN, :1443-1448.** `accountingImpact: "inventory_only"`, `createsAccountingImpact: false`, and "Goods Receipt creates stock ledger entries ... but no accounting voucher". The help assistant would still answer "no" to "does a goods receipt touch the books?" from this row.
- **KG4-GAP-002, :1766.** "Partly closed" lists adjustments and returns but not receipts.
- Small: only the two edited `inventoryImpact` rows carry the new `voucherTypeCreated` key; the other four do not. Harmless, but inconsistent.

**Fix:** text only in the one JSON file: rewrite the `postStockInward` safety rule and the four fields; set GOODS_RECEIPT_GRN to a voucher-creating stage with the GRN Journal; add receipts to KG4-GAP-002. Re-run `verify:voucher-accounting-graph` and `verify:knowledge`. Optionally, the cross-check suggested last round (each `inventoryImpact`/`voucherTypes` row agrees with its posting function, and a posting function that creates a voucher has no "no accounting voucher" text) would have caught all of this. **Owner:** no.

## F44 — Info (new): the new clean-up's main promise is not pinned by a test

- **RT1:** replacing `removeStagingTree` (UI:67-91) with the old `fs.rmSync(folder, { recursive: true, force: true })` passes all 47 tests. The new test "clearing the staging folder removes only installer copies and never walks a link" plants links and checks the link targets are untouched, but Node's recursive delete already unlinks links rather than following them, so the test cannot tell the two apart.
- **RT4:** deleting every file in an `install-*` folder, not only `.exe` copies (UI:84), also passes. Nothing checks that a non-installer file is left.
- **HF1/HF2/HF3:** the dev/ino/size identity check in `hashFile` (UI:176, main.js:1329) can be removed without a failure. It only matters if the copy is swapped between staging and launch, so this is race-only, and the hash would catch a different file anyway.
- **Why it matters little:** the function is correct by reading. It never calls a recursive delete, checks every entry with `lstat`, and leaves unknown items with a warning. The remaining race (the folder swapped for a link between `lstat` at :69 and `readdir` at :75) needs a second process with write access to the data folder, and even then only removes `install-*/*.exe` and links behind it.
- **Cheapest pin (optional):** in the existing 64124dc-round clean-up test, also put a `notes.txt` in `install-real` and assert it is still there afterwards. That kills RT1 and RT4 in one line. **Owner:** no.

## F43 — fixed

- Leftover `update-staging.old-*` folders are now swept at start-up (UI:60) and before each install (UI:118), with the same shape-checked removal. SW2 and SW3 are killed by the new test; SW1 survives only because the second sweep covers it.
- The error side is judged against both the real and the plain staging path, case-insensitively on Windows (UI:104-110, :255). Correct by reading; IS1/IS2 survive because the test data folder has no link in its path (wording only).
- New behaviour checked: when Windows refuses to rename a staging folder that holds an open file, a real folder is used in place (UI:127). A link there is still refused by the post-`mkdtemp` check (UI:155), which is why IP2 survives; that is defence in depth, not a gap. IP1 and IP4 are killed.

## F31 — Info: the module boundary

The updater split is unchanged and fine. One more advice block went into main.js (backup failure, :1322-1326), so "disk full / locked / other" advice is now written three times: UI:256-260, main.js:1280-1283 and main.js:1322-1326. Worth one shared `adviceFor(error, place)` helper the next time this module is touched; not a merge item. **Owner:** no.

## F35 — confirmation for the owner's card

4f3a9b6 changes no posted amount and nothing the card describes: `inventoryService.js`, `accountingService.js`, schema and DDL are untouched, and the KG-4 change is description text only. The mount copy of owner-decisions-pr4.md is unchanged since 11 Nov 00:22 IST, so the card's answer is not yet recorded. **PR #4 should not merge before the answer.**

## Readiness of PR #4 (apart from the owner's card)

- **Updater:** done. Every reachable check from the last five rounds is now pinned except the two F44 items, which are race-only or one-line tests. I recommend no further full audit round on the updater.
- **Still to do before putting PR #4 to the owner for merge:**
  1. **F42-r** (should do): finish the KG-4 text for goods receipts in the three places above. The PR made these rows wrong and the help assistant reads them. One JSON file, no owner OK, no new audit round needed beyond rerunning the two verify scripts.
  2. **F44** (optional): add the `notes.txt` assert to the clean-up test.
- **Nothing else from architecture blocks it.** Tests, verify scripts, manifest, archived reports and repo rules are all in order.

## Items for the owner

1. **F35:** answer the pending card, together with the correction note already in the thread. **PR #4 should not merge before the answer.**
2. The gaps in fsr-2a4 policy §6 remain owner decisions.

Everything else (F42-r, F44, F31, F34, F11) is documentation or test work and needs no owner OK.
