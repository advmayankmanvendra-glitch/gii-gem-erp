# Architecture audit: a8c64af..a11bd45

- **Repo and branch:** advmayankmanvendra-glitch/gii-gem-erp, branch `claude/erp-full-automation-qbhv8k`, head `a11bd45`.
- **Written:** 11 Nov 2026, 09:20 IST.
- **Commit in scope:** `a11bd45` ("Close the a8c64af audit findings: assistant knows a GRN posts a Journal, tighter clean-up"): KG-4 GRN stage label `inventory_grni`; WG-1, FF-1 (FEA-14) and the renderer workflow engine now say a goods receipt has accounting impact; FF-1 GRN text and `voucherTypes: ["Journal"]`; updater clean-up (top-level links removed only if named `install-*`, staging folder made with mode 0o700, the in-place ownership check also applied after `mkdtemp`, the failure path removes the copy by name instead of walking the folder); one test fix and one new assert; the three a8c64af reports archived (manifest 87 → 90).
- **Answers:** audit-a8c64af-architecture.md (F45, F46, F47, F48, F31, F35).
- **How it was run:** read-only. Worktree `/tmp/claude-0/arch-a11` at `a11bd45`, `node_modules` symlinked from the main checkout (not added, not rebuilt, no packages installed). Mutations applied one at a time and restored with `git checkout`; `git status` clean before removal. Symlink and worktree removed; main checkout clean, its `node_modules` intact. Nothing committed or pushed.

## Commands and results

| Command or check | Result |
|---|---|
| `npm run test:integrity` | 222/222 and 49/49 pass, 0 cancelled |
| `verify:knowledge` | exit 0, 167 entries, 0 errors, 0 warnings |
| `verify:feature-function-graph` | exit 0, 31/31 |
| `verify:workflow-graph` | exit 0, 21 passed, 0 failed |
| `verify:workflow-enforcement` | exit 0, 62 passed (WF-61 no IPC/preload write dependency; WF-62 warn mode only) |
| `verify:voucher-accounting-graph` | exit 0, all checks passed |
| `verify:audit` | exit 0, PASS 297, FAIL 0, CRITICAL 0 |
| `verify:graph-registry` (verify-governance-graph-registry.js) | exit 0, PASS 53, INFO 1 (archived reports not in this checkout, as before), FAIL 0 |
| GRN across KG-4 / WG-1 / FF-1 / engine | all four say accounting impact `true`; matches `inventoryService.js:189-240` |
| Archived a8c64af reports vs mount copies | sha256 and bytes identical (3/3) |
| Manifest | count 90 = 90 entries; all re-hashed, 0 mismatches, no duplicates; only `README.md` unlisted, as before |
| IPC, preload, route keys; main.js, preload, App.jsx, screens, database, inventoryService, accountingService, graph-registry.json | untouched |
| Posting, GST, schema | no change |
| Engine decisions, old vs new (every stage pair × 2 actions × 3 link contexts) | 0 changes to `decision`; only `accountingImpact`, `supplyOrderRequired` and `reason` differ, for GRN targets only |

### Mutation runs (updater, ipc-security 49 tests)

| # | Mutation (updateInstaller.js) | Result |
|---|---|---|
| LN1 | Top-level link unlinked whatever its name (:90) | Killed (new `other-link` assert) |
| MD1 | `mkdir(expected)` without `mode: 0o700` (:167) | Survives (needs a group-writable umask) |
| OW2 | Post-`mkdtemp` check back to plain `isDirectory()` (:177) | Survives (needs another user's folder swapped in) |

## Summary

**F45 is fixed.** KG-4 now labels the GRN stage `inventory_grni`, and WG-1, FF-1 and the workflow engine all say a goods receipt has accounting impact, matching the Journal that `postStockInward` posts. The help assistant now tells users a GRN creates accounting entries and names the Journal.

**The engine change is allowed.** `workflowStageEngine.js` is not imported by any screen or service; only `scripts/verify-workflow-enforcement-foundation.js` loads it. It runs in warn mode only. Comparing the old and new engine on every case, no decision changes. The only differences are the impact flag, `supplyOrderRequired` and the warning text. Under AGENTS.md §4 ("Existing workflows") nothing in how the app behaves changes; the edit keeps the engine's copy of the stage list in line with WG-1. It is not a new Workflow Program phase, so §26 does not apply.

**Repo rules hold.** No IPC, preload or route-key rename, no posting, GST or schema change, no graph schema change (values only, so no version bump is needed).

| # | Severity | Owner? | Where | Finding |
|---|---|---|---|---|
| F45 | Fixed | No | voucher-accounting-graph.json:1444; workflow-graph.json:187; workflowStageEngine.js:21; feature-function-graph.json:781, :793 | GRN agrees in all four places and with the code |
| F49 | Low (new, carried from F45) | No | voucher-accounting-graph.json vs workflow-graph.json and workflowStageEngine.js:19, :23, :27 | Three stages still disagree between KG-4 and WG-1/engine: PROCUREMENT_PLANNING, DELIVERY_CHALLAN, DEPARTMENT_RECEIVABLE. These were there before PR #4. No script compares the graphs |
| F50 | Info (new) | No | feature-function-graph.json:781, :783 | FF-1 uses `"Journal"` where every other feature and KG-4 use the id `"journal"`; `postingFunctions` names `recordGoodsReceipt`, which does not exist (the real one is `postStockInward`; this was already wrong before the PR) |
| F51 | Info (new) | No | docs/architecture/kg-4-voucher-accounting-graph-foundation-report.md:133 | The foundation report still shows GRN as `inventory_only / false`. It is a dated report and can stay; KG-4 v1.1 notes should say it changed |
| F52 | Info (new) | No | updateInstaller.js:167, :177, :186-190 | The new `mode: 0o700` and the post-`mkdtemp` ownership check have no test (MD1, OW2 survive). Both are POSIX-only (`ownStagingFolder` returns true on Windows) and correct by reading. They depend on each other: without 0o700, a group-writable umask would make the new check refuse every update |
| F46 | Info (open) | No | voucher-accounting-graph.json:677, :679 | Unchanged; KG-4 v1.1 |
| F47 | Info (open) | No | updateInstaller.js:71, :94; main.js:1306-1308 | Unchanged |
| F48 | Info (closed as by design) | No | updateInstaller.js | Race-only re-checks; nothing new |
| F31 | Info (open) | No | updateInstaller.js; main.js | Advice text still in three places |
| F35 | Low | **Yes** (card) | owner-decisions-pr4.md | Card still unanswered (mount copy unchanged since 11 Nov 00:22 IST) |

## Notes

- **F49:** this is the WG-1 half of F45 that was suggested for the KG-4 v1.1 convergence. The GRN line is now right; three older disagreements remain. Fix them together in v1.1 and add a cross-check to `verify-voucher-accounting-graph.js` (KG-4 `createsAccountingImpact` = WG-1 = engine for each stage). Owner OK is not needed for the text, but whether a Delivery Challan "creates accounting impact" (COGS) should be decided with whoever owns the KG-4 v1.1 wording. Not a merge item.
- **F50:** `voucherTypes` is shown to the user only ("Voucher types involved: Journal"), and nothing joins it to KG-4 ids, so it does no harm today. Make it lowercase and fix `postingFunctions` in the next FF-1 touch.
- **Updater:** the top-level link rule is now pinned by a test (LN1 killed). The failure path removing the copy by name instead of walking the folder is simpler and safer. As recommended last round, this is a targeted review of the diff only.

## Readiness of PR #4 (apart from the owner's card)

- **From architecture, PR #4 is ready to merge.** Every finding from the earlier rounds is fixed or is information only. Tests, all seven verify scripts, the manifest, the archived reports and the repo rules are all in order.
- **No further audit round is needed** for architecture. F49-F52, F46, F47 and F31 can wait for KG-4 v1.1 or the next time the updater changes.
- **Blocking:** only F35, the owner's pending card. PR #4 should not merge before the owner answers it.
