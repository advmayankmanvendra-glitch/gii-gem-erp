# GGR-1 extension: branch and graph convergence audit

Date: 10 Nov 2026 (IST). Read-only audit. Nothing was merged, rebased or pushed for it.
Checked against the remote branches fetched today and the accounting programme bundle at
`/mnt/project-files/work-in-progress/acc-programme/acc-programme.bundle` (head `539eeb0`).

## 1. Answer: the authoritative integration branch

**`claude/erp-full-automation-qbhv8k` (PR #4, head `9dac174`)** should be the single integration branch.

| Branch | Head | Relation to PR #4 | Status |
|---|---|---|---|
| `main` | `aec83eb` | 0 commits that PR #4 lacks; PR #4 is 140 ahead | Fully contained in PR #4 |
| `phase-16-enterprise-crm-integration` (PR #3) | `acf6d02` | 0 not in PR #4; PR #4 is 37 ahead | Fully contained in PR #4, so PR #3 becomes redundant |
| `claude/project-thread-grlynv` (PR #2) | | Its 7 files are byte-identical in PR #4 | Contained in PR #4 |
| `backup/before-cl-automation` | `acf6d02` | Restore point | Keep and never touch |
| `claude/paise-tally-dblock` (PR #5) | `14275c3` | 14 ahead, 6 behind; base `3c12e50` | Targets PR #4. Merges with **no conflicts** |
| `claude/project-thread-1z4e80` (PR #6, reset/update) | `e24b89d` | 6 ahead, 6 behind | Targets PR #4. `package.json` conflict only; one more with PR #5 (below) |
| `claude/project-thread-t50o4b` (BRAIN-5) | `e5f6ce1` | 3 ahead, 6 behind | No PR. `package.json` conflict only |
| `claude/project-thread-w9s2ra` (ACC programme) | `539eeb0` (local bundle only) | 4 ahead, 6 behind; base `3c12e50` | Not pushed. `package.json` conflict with PR #4. **6 core accounting files conflict with PR #5** |
| `safety/rmd-0-pre-baseline-2026-07-22` | `1768f98` | Old base `ee675a4`; 13 files absent from PR #4 and 10 that differ | Preservation branch, not an integration candidate |

Every live branch already forks from PR #4's line, and nothing on `main` or PR #3 is missing from PR #4.
No other branch holds all the latest work today, and none can without merges into PR #4.

## 2. Collisions found when the branches are combined

Simulated in a scratch worktree, in this order: PR #4, then PR #5, then PR #6, then BRAIN-5.

1. **PR #5 and the ACC programme overlap heavily.** Both rewrite the posting core from `3c12e50`.
   - The files that conflict are `init.js`, `reportBuilders.js`, `inventoryService.js`, `bankReconciliationService.js`, `productionReadinessService.js` and `deployment/readinessService.js`.
   - PR #5 brings paise columns and ledger guard triggers. ACC brings ledger-by-role, posting templates and migration 037.
   - This is the largest convergence risk. ACC should be rebased onto PR #4 + PR #5 before ACC-2 part 2 adds more.
   - Checked and safe: ACC's new triggers on `accounts`, `account_groups` and the statement mappings never mention `vouchers`, `voucher_lines` or `ledger_entries`. So PR #5's start-up sweep of foreign ledger triggers will not drop them.
2. **PR #5 and PR #6 both change `operationalResetService.performCompanyReset`.**
   - PR #5 wraps the reset in `withLedgerMaintenance`. PR #6 adds the `UNLINK_ON_RESET` updates inside the same transaction.
   - Correct resolution: keep both, with the unlink loop inside `withLedgerMaintenance`.
3. **`package.json` `test:integrity` and `lint:syntax`.** Every branch appends to the same two lines. Resolve by taking the union of the entries. This is mechanical.
4. **Migrations.** Every pushed branch stops at 036. Only ACC adds 037, so there is no number collision today.

## 3. Graph registry findings

The live registry `repository/graph-registry.json` was checked against the points raised on 10 Nov.

| Point raised | Finding | Action |
|---|---|---|
| KG-5 shown as both Active and Planned | The live registry has KG-5 **ACTIVE** (transition PLANNED→ACTIVE on 14 Aug, commits `2244bb8` and `8ce3a42`). The PLANNED record is only in `docs/architecture/proposed-graph-registry.json`, the pre-reconciliation proposal (8 graphs, 1 PLANNED). | Mark the proposal file as superseded by the live registry. Do not edit its body, because it is evidence. |
| Pending count 0 vs effective 6 | Both are correct under two different definitions recorded in the registry. "Registry pending" means primary graphs in PLANNED, which is 0. "Effective pending" means ACTIVE graphs that still carry an unimplemented obligation: DG-1, WG-1, KG-4, FF-1, AG-1 and KG-5, which is 6. | Show both numbers with their definitions wherever one is quoted. No data change. |
| FF-2 stale future reference | The live FF-1 graph already says FF-2 was absorbed into BRAIN-4.3B, and the live registry has FF-2 COMPLETED. The stale "future" wording survives only in the proposal file. | Covered by the superseded marker. |
| RG-2 | Still **UNVERIFIED**. Its only evidence is `docs/tally-intelligence/AIR/erp9-air-integration.md`. | Keep UNVERIFIED as instructed. |
| AIR | AIR (Accounting Intelligence Repository) is not a graph ID anywhere in the registry or the code. | No registry entry, as instructed. |
| EG family | There is no EG in the registry, the graphs or the code. EIL (Enterprise Intelligence Layer) is the umbrella. | None |
| BRAIN-5 DEFERRED while work has started | The registry says DEFERRED. `t50o4b` holds BRAIN-5A to 5F part 1 (19 files, `src/main/services/llm/*`). It is not merged anywhere, so the integration branch's registry is still literally true. Two points matter. First, the lifecycle has no "in progress" status. Second, `llmKnowledgeLoader.js` reads `manual-graph.json` (KG-5) at runtime. That is KG-5 runtime consumption, which the registry gates as BRAIN-3.5 (PLANNED, BLOCKED until baseline lock). | Recommended: keep BRAIN-5 on its branch, disabled by default, until the baseline lock. Then record BRAIN-3.5 and BRAIN-5 in the registry at the same time it merges. |
| main still at `aec83eb` | True. Everything since then lives on PR #4's line. | Resolved by merging PR #4 into main on the owner's go. |

## 4. KG-4 (Voucher and Accounting Graph) is stale against the accounting changes

KG-4 was last updated on 14 Jul 2026 (v1.0.0, 14 voucher types). Its validator passes because it checks shape, not completeness. Against PR #4 and PR #5 it is now wrong in these places:

- **Missing posting sources.** PR #4 posts from source modules that KG-4 does not list: `stock_inwards` (GRNI), `stock_adjustments`, `stock_returns`, `warehouse_transfers` (the FSR-2A4 perpetual inventory bridge) and `voucher_proposal` (bank reconciliation, `postDraftVoucherFromProposal`). KG-4 also lists an `expense` source module, and no posting writes that today. It should be checked against `postExpenseAccrualsForOrder`.
- **A known gap that is no longer true.** KG4-GAP-002 says stock adjustments, returns and transfers create no accounting vouchers. PR #4 now posts them.
- **PR #5 additions not in KG-4:**
  - the Rounding adjustment voucher kind (`rounding_adjustment`, series `RNDADJ`);
  - the 11 database ledger guard triggers and the `ledger_maintenance` window, which belong in `accountingProtectionMapping`;
  - money held as whole paise.
  - PR #5 updated DG-1 and AG-1 but did not update KG-4.
- **PR #4 settlement rules not in KG-4.** Order closure now counts credit notes against the receivable (`receivableOutstandingForSettlement`), and a posted invoice with no receivable counts as unsettled.
- **ACC (once pushed) changes ledger selection from account name to system role,** plus 25 posting templates. `debitPattern`/`creditPattern` in KG-4 name ledgers by name.

This matters now because BRAIN-5's context assembler reads `kg4.voucherTypes` directly. An AI answer built on today's KG-4 would describe stock movements as having no accounting entry.

## 5. Recommended convergence order (each merge only on the owner's go)

1. Keep PR #4 (`claude/erp-full-automation-qbhv8k`) as the only integration branch. Finish its review rounds.
2. Merge PR #5 into PR #4. It is clean, and its rule-4 items were approved on 29 Oct.
3. The ACC programme rebases onto PR #4 + PR #5 before ACC-2 part 2. Its six-file overlap is resolved once, by the accounting thread. Then it is pushed as a PR into PR #4's branch.
4. Merge PR #6 into PR #4. Resolve `operationalResetService` as described in section 2 above.
5. Bring KG-4 to v1.1 from the converged code, and mark the proposal registry as superseded. Owner: this thread (GGR-1), with the accounting thread checking the posting facts.
6. Stabilization, certification and baseline lock. Then merge PR #4 into main and close PR #3 as contained.
7. BRAIN-3.5 and BRAIN-5: the BRAIN-5 branch rebases onto the locked baseline. Then the registry records BRAIN-3.5 and BRAIN-5 together.
8. `safety/rmd-0-pre-baseline-2026-07-22` stays a preservation branch. Its updater, migration runner and database-path work (13 files) overlaps PR #6's update fix. Reviving any of it is a separate owner decision.

No new graph should be introduced before step 5.
