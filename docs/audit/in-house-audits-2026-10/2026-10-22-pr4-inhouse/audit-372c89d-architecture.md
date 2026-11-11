# Architecture audit: f9241ed..372c89d

- **Repo and branch:** advmayankmanvendra-glitch/gii-gem-erp, branch `claude/erp-full-automation-qbhv8k`, head `372c89d`.
- **Written:** 11 Nov 2026, 05:40 IST.
- **Commits in scope:**
  - `dc40f03` (11 Nov 05:05 IST): re-checks the installer after the backup, refuses ":" names, support-bundle tweak, committed-link guard. (Also covered by the previous report; re-checked here.)
  - `372c89d` (11 Nov 05:26 IST): T1 reversal window, T2 zero-value voucher, T3 replay regrouping, T4 taxable-first receipt value, friendly updater message, new tests, KG-4 and policy updates.
- **Answers:** audit-f9241ed-architecture.md (F1-F10).
- **Read against:** AGENTS.md (rule 4: owner OK for posting, profitability, GST and schema changes; no IPC/preload/route-key renames; no logic in App.jsx or screens; guided error messages), KG-4 incl. every `lineNumber` and `readsFromTables`, fsr-2a4 policy §6, owner-decisions-pr4.md (C2 keep the pool; item (a) approved as "keep as built").
- **How it was run:** read-only on /home/claude/gii-gem-erp and /home/claude/wt-prog. Everything ran in the scratch clone /tmp/claude-0/arch-372 at 372c89d with a *copied* `node_modules` (`test ! -L node_modules` checked). Every mutation was reverted; the clone is clean (`git status` empty). The container restarted once mid-audit (during an optional 1000-lot performance run); the clone survived intact and the run was not repeated.

## Commands and results

| Command or check | Result |
|---|---|
| `npm run test:integrity` (9 node suites + ipc-security) | 216/216 and 25/25 pass |
| `verify-voucher-accounting-graph`, `verify-knowledge`, `verify-feature-function-graph`, `verify-governance-graph-registry`, `verify-workflow-graph`, `verify-audit-graph`, `verify-manual-graph`, `verify-audit` | all exit 0 |
| KG-4 line numbers by script (23 functions + 2 reversalRules against `function <name>` on that line) | 25/25 correct (postStockReturn now 454) |
| No IPC channel, preload method or route key renamed; no screen or App.jsx change (only renderer file touched is the KG-4 JSON) | confirmed by `git diff --stat` |
| No DDL in either commit (C2 holds: no receipt link, no column, no index) | confirmed |
| Perf probe, 500 lots then 500 one-unit returns, one supplier/item | 372c89d: total 7.1 s, last return 28 ms. f9241ed: 8.9 s, 33 ms |

### Mutation runs (each fix undone alone, suite re-run)

| # | Fix undone | Result |
|---|---|---|
| T1a | Reversal ignored (`reversalId` check → `true`, bill counts forever) | Killed by "a reversed bill and a zero-value return…" |
| T1b | Old behaviour: `p.posting_status = 'Posted'` only (reversed bill never billed) | Killed by same test |
| T1c | `reversalId > voucherId` → `>=` | Survives: equivalent mutant (ids never equal). No action |
| T2 | `needsVoucher = roundMoney(retValue) > 0` | Killed by same test |
| T2b | Only the Trade Payables arm kept | Killed |
| **T2c** | **Only the GRNI arm kept (`|| payablesPortion > 0` removed)** | **Survives** (F12) |
| **T4** | **`landed_cost` first again in `receiptValue`** | **Survives** (F12) |
| M1b | As-of bill check ignored (`voucherId = Infinity`) | Killed by both new tests (closes old F4) |
| M1c | Earlier returns ordered by `return_date` | Killed by "replayed with the billing it saw, and in posting order" (closes old F4) |
| M3b | `goods_receipt_items` rate/value zeroed | Killed by the d661346 receipt-rate test (closes old F4) |
| N2 | ":" refusal removed | Killed by ipc-security 66b024f test |
| **N1** | **Re-check after the backup removed** | **Survives** (F12) |
| **U1** | **New try/catch "could not be opened" message removed** | **Survives** (F12, Info) |
| G1 | Link guard regex reverted to top-level only, with a staged `docs/x/node_modules/a.js` | New regex fails (1 fail), old regex passes: the nested guard works |

## Summary

**F1 is closed.** There is now one definition of "billed": `billedAt(lot, voucherId)` (inventoryService.js:399), fed by one bill-voucher id and one reversal id per lot. "Now" is the same function with `voucherId = Infinity`. The duplicated subquery and the dead `'Reversed'` filter are gone; `'Reversed'` is now live and meaningful (the reversal window). `supplierReturnSplit` is more readable than at f9241ed; one SQL readability issue remains (F11). Comment, policy §6 and KG-4 broadly agree; three wording gaps remain (F13).

**The main issue is governance, not code.** T1, T2 and T4 change posted amounts. The f9241ed correctness audit listed all three as "owner decisions this report needs". The pending card (as described in my previous report) covers the replay, purchase-voucher receipts counting as billed, Accounting Only and the receipt value; it does **not** obviously cover the reversal window, and **T2 reverses an item the owner already approved as "keep as built"** (owner-decisions item (a): "a supplier return worth less than half a paisa … posts no voucher"). See F14.

| # | Severity | Owner? | Where | Finding |
|---|---|---|---|---|
| F11 | Low | No | inventoryService.js:374-384 | SQL composed by string interpolation of a WHERE-terminated fragment; filters repeated; correlated subquery inside a derived table |
| F12 | Low | No | audit2-regressions.test.mjs:1186-1213; ipc-security.test.mjs:478; init.js:1026; main.js:542-549, :1291 | T2 payables arm, T4, the re-check after backup and the new friendly message have no killing test |
| F13 | Low | With F14 | inventoryService.js:357, :359; policy :89; KG-4 :715, :717, :473, :707 | Wording and list gaps: comment omits "until reversed", policy says "voucher numbers" (it is ids), KG-4 safetyRule omits T1/T2, `relatedDG1Tables` and `postGuidedVoucher.writesToTables` not updated, `accounts` written but not listed |
| F14 | **Medium** | **Yes** | inventoryService.js:382-384, :399, :486, :504; init.js:1026 | T1, T2, T4 change posted amounts without the owner's OK; T2 overturns approved item (a) |
| F15 | Info | No | .gitignore; no hook/CI | Old F6: the guard now covers any depth, but still runs only when tests are run |
| F16 | Info | No | init.js:1024-1026, :1036, :1041 | T4 comment "the two always clear" is not true when `voucherTaxable` is 0; `procurement_id` half of old F7 is still open |
| F17 | Info | No | inventoryService.js:416-425 | PR #5 money conventions: unchanged float-rupee sums (old F9); no new drift |

### Status of the f9241ed findings

| Prev | Status | Evidence |
|---|---|---|
| F1 two definitions of billed | **Fixed** | Single `billedAt` (:399); `billedNow` and the duplicate subquery removed; dead `'Reversed'` now live. Zero-value posted bill with no voucher: unreachable now (`postPurchaseVoucher` always creates a voucher; re-post blocked at accountingService.js:57). Residual readability in F11 |
| F2 KG-4 `readsFromTables` | **Mostly fixed** | :706 now lists the 6 extra tables. `relatedDG1Tables` (:715) not updated; `accounts` is *written* (PPV ledger creation, init.js:888-891) but not in `writesToTables` (F13) |
| F3 KG-4 `postGuidedVoucher` | **Partly fixed** | safetyRule and inventoryImpact updated (Accounting Only, taxable value, counts as billed). `writesToTables` (:473) still omits `goods_receipts`, `goods_receipt_items`, `stock_inwards`, `stock_ledger` (F13) |
| F4 untested fixes | **Mostly fixed** | M1b, M1c, M3b, N2 now killed. N1 still survives; new survivors T2c, T4, U1 (F12) |
| F5 doc gaps | **Mostly fixed** | Policy :87-89 adds reversed bills, zero-value returns, posting order, no-voucher replay. Still open: "voucher numbers" vs ids; no-order return using an order's receipts (policy :86); manual 10.6 (C6); damaged units (C8 / correctness T5) |
| F6 symlink guard | **Partly fixed** | Regex now any depth (G1 killed). No hook or CI (F15) |
| F7 API edges | **Half fixed** | `landed_cost` no longer wins (T4). `procurement_id` still passed through (F16) |
| F8 complexity | **Improved** | One scan per return, used-up lots dropped; 500×500 last post 28 ms vs 33 ms. Still O(R × L) per post, O(R² × L) over life; fine at SME scale. No index added (correct: schema change) |
| F9 float sums | **Open (Info)** | F17 |
| F10 re-check comment | **Fixed** | main.js:1289-1290 now says "the path is checked again … a link or sub-folder swapped in". Matches the code |

---

## F11 — Low: `supplierReturnSplit` SQL is single-definition but awkward

- **Where:** inventoryService.js:374-384.
- **What:**
  - `billVoucher` is a SQL fragment ending in a `WHERE` clause; `pv` relies on appending `AND v.source_module = 'procurement'` to it (`${billVoucher} AND …`). Anyone who adds an `ORDER BY` or `LIMIT` to the fragment silently breaks `pv`. No injection risk (constant strings).
  - The `pv` ON-subquery repeats the status and is_deleted filters already in the fragment, and `p.posting_status IN ('Posted','Reversed')` is redundant with the voucher status filter.
  - The derived table carries a correlated reversal subquery; it performs fine at the measured scale (perf row above), so this is readability only.
- **Why:** this is the function whose meaning the owner is being asked to approve; it should read the way the policy reads.
- **Fix (no owner):** use two scalar subqueries per lot (`bill_voucher_id`, then `bill_reversal_id` looked up from that id), or a CTE `bill(stock_inward_id, voucher_id, reversal_id)`. No behaviour change.

## F12 — Low: four new or carried fixes have no killing test

- **T2c, the Trade Payables arm of the zero-value voucher (inventoryService.js:486).** The test (audit2 :1204-1212) exercises only a free lot here using a priced *unbilled* lot elsewhere. A zero-value return that takes a *billed* lot elsewhere (Dr Trade Payables, Cr PPV) is reachable and untested. Add the billed variant with exact lines.
- **T4, taxable-first receipt value (init.js:1026).** No test sends `landed_cost` on a guided purchase. Add one with `landed_cost` > `taxable_value` and assert stock value = taxable and GRNI nets to zero. This one changes posted Inventory, so it matters most.
- **N1, re-check after backup (main.js:1291).** Carried from F4. Stub `createLiveBackup` to swap the installer for a link (or a sub-folder copy) and assert "changed while the backup was being made".
- **U1, "could not be opened" (main.js:542-549).** Info: a call with a folder that does not exist (or an unreadable installer) would kill it.
- **Fix (no owner):** add the four tests. T1c is an equivalent mutant and needs no test.

## F13 — Low: wording and list gaps (comment, policy, KG-4)

- **Code comment :357** says "receipts and bills posted before it"; :359 "receipts no posted bill covers". Add "and not yet reversed" (the :397-399 comment has it, the header does not).
- **Policy :89** says posting order comes from "stock ledger rows and voucher numbers". The code compares internal row ids (`vouchers.id`, `stock_ledger.id`), not `voucher_number`. Say "the order the system recorded them in (internal ids), not voucher numbers or typed dates", and note a restore that renumbers rows would change the replay.
- **KG-4 `postStockReturn.safetyRule` (:717)** does not mention the reversal window (T1) or that a zero-value return still posts Dr GRNI/TP, Cr PPV with no Inventory line (T2). It says "a posted bill", which is no longer the whole rule.
- **KG-4 lists:** `relatedDG1Tables` (:715) still the old 6; `postStockReturn.writesToTables` (:707) omits `accounts` (PPV ledger may be created); `postGuidedVoucher.writesToTables` (:473) omits the receipt and stock tables.
- **Fix (no owner for the wording):** update the three texts and lists. The T1/T2 wording should be finalised with F14's answer.

## F14 — Medium (governance): T1, T2 and T4 change posted amounts without the owner's OK

- **Where:** T1 inventoryService.js:382-384, :399; T2 :486, :504; T4 init.js:1026.
- **What each changes:**
  - **T1 reversal window.** A reversed bill now counts as billed for returns posted before the reversal and unbilled after. Before: unbilled for every return. Changes which account (GRNI or Trade Payables) a return debits, and the PPV amount. The correctness audit's T1 showed GRNI stuck at −1000 without it, so the fix is right, but it is a new posting rule.
  - **T2 zero-value voucher.** A return worth nothing at the warehouse's average cost now posts Dr GRNI or Trade Payables, Cr Purchase Price Variance (no Inventory line). **This overturns owner-decisions item (a), "a supplier return worth less than half a paisa rounds to zero and posts no voucher", which the owner approved as "keep as built" on 11 Nov 00:09 IST.** It also leans on the warehouse-blind pool, which the correctness audit raised as an owner design question.
  - **T4 taxable-first receipt.** A guided purchase receipt ignores a larger `landed_cost` and enters stock at the voucher's taxable value. Changes the Inventory debit for API callers (the screen sends no `landed_cost`).
- **Coverage by the pending card:** the card covers the replay, purchase-voucher receipts as billed (C4), Accounting Only (C3) and receipt value (C2/N6). T4 fits under "receipt valued at the voucher's taxable value" if the card says landed cost is ignored. **T1 and T2 are not on it**, and T2 needs an explicit "change approved item (a)" line.
- **Fix (owner needed):** before merge, add to the pending card (or a follow-up card):
  1. T1: "A purchase bill that is later reversed counts as billed only for returns posted before the reversal."
  2. T2: "Change approved item (a): a zero-value return now posts a small journal (Dr GRNI or Trade Payables, Cr Purchase Price Variance) when it uses up a priced receipt. Alternative: skip such returns in the replay." Mention the warehouse-blind pool question with it.
  3. T4: one clause, "a landed cost the voucher did not book is not added to stock".
  Then update owner-decisions-pr4.md item (a) to match the answer. If the owner declines T2, item (a) stays and the replay must skip no-voucher returns (correctness audit's alternative).

## F15 — Info: the link guard is still only a test

- The regex now catches `node_modules` at any depth (G1). There is still no `.githooks`, husky or CI, so the guard fires only when `npm run test:integrity` is run before a push. Keep it on the auditor checklist; add a pre-commit hook when convenient. No owner.

## F16 — Info: T4 comment over-claims; `procurement_id` edge still open

- **init.js:1024-1026:** "Only what the voucher put into GRNI comes in, so the two always clear". When `voucherTaxable` is 0 the expression falls through to `landed_cost`, so they would not clear. Likely unreachable (a zero voucher is refused), but either drop the `landed_cost` fallback or say "when the voucher has a value".
- **init.js:1036, :1041:** `payload.procurement_id` is still passed to the receipt; pointing it at a posted bill makes `postStockInward` credit Purchase instead of GRNI (old F7). Refuse or ignore it for guided receipts with a guided message. A refusal needs no owner; changing what gets posted does.

## F17 — Info: PR #5 money conventions

- No new drift. The replay still reads `value_minor / 100.0` and adds float rupees (`units * rate`, :425), rounding once; the variance is still worked out in minor units (:449-451). T2's lines use the same rounded amounts, and the voucher balances by construction (variance = credit − GRNI − TP, all in paise). No money helper duplicated. Optional: sum `paise(units * rate)` with PR #5's helpers (old F9).

---

## dc40f03 recheck

- ":" refusal (main.js:530-533): guided message, now tested (N2 killed).
- Re-check after backup (main.js:1289-1293): guided message; comment now matches code (old F10 closed); still untested (F12).
- Support bundle and link guard: as in the previous report; guard regex widened in 372c89d.
- New try/catch message (main.js:542-549) is guided ("Use Open Update Folder, put the installer there and try again").

## Items for the owner

Only F14: add T1 (reversal window), T2 (zero-value voucher, which changes approved item (a)) and the landed-cost clause of T4 to the pending decision card. **PR #4 should not merge before the owner answers.** Everything else here (F11-F13, F15-F17) is code clarity, tests, KG-4 or documentation and needs no owner OK.
