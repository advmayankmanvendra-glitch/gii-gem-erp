# Architecture audit: 372c89d..8d5dd67

- **Repo and branch:** advmayankmanvendra-glitch/gii-gem-erp, branch `claude/erp-full-automation-qbhv8k`, head `8d5dd67`.
- **Written:** 11 Nov 2026, 06:10 IST.
- **Commits in scope:**
  - `98c6fda` (11 Nov 05:36 IST, "WIP: 372c89d security fixes"): installer fingerprint, update-folder file filter, `ensureUpdateFolder` message, `git ls-files -z` guard.
  - `8d5dd67` (11 Nov 05:45 IST): reversed supplier returns give their units back (correctness V1), two new tests for my F12 (T2c, T4), comment, policy and KG-4 wording, the three 372c89d reports preserved in the repo.
- **Answers:** audit-372c89d-architecture.md (F11-F17).
- **Read against:** AGENTS.md (rule 4: owner OK for posting, profitability, GST; approval for schema; no IPC/preload/route-key renames; no logic in App.jsx or screens; guided error messages), KG-4 incl. every `lineNumber`, `readsFromTables`/`writesToTables` and `safetyRule`, fsr-2a4 policy §6, owner-decisions-pr4.md, the pending owner card text as given to me.
- **How it was run:** read-only on /home/claude/gii-gem-erp and /home/claude/wt-prog. Everything ran in the scratch clone /tmp/claude-0/arch-372 (fetched, checked out `8d5dd67`, *copied* `node_modules`, `test ! -L node_modules` checked). Every mutation was reverted from a backup copy, and the temporary index entry used for the `-z` check was removed; `git status --short` is empty at the end.

## Commands and results

| Command or check | Result |
|---|---|
| `npm run test:integrity` (9 node suites + ipc-security) | 219/219 and 25/25 pass |
| `verify:voucher-accounting-graph`, `verify:knowledge`, `verify:feature-function-graph`, `verify:graph-registry`, `verify:workflow-graph`, `verify:audit-graph`, `verify:manual-graph`, `verify:audit`, `verify:database-graph` | all exit 0 |
| KG-4 line numbers by script (23 functions + 2 `reversalRules` against `function <name>` on that line) | 25/25 correct (`postStockReturn` now 467) |
| Preserved 372c89d reports in `docs/audit/...` vs the mount copies | sha256 identical (3/3) |
| IPC channel, preload method, route key renamed; screen or App.jsx touched | none (only renderer file touched is the KG-4 JSON) |
| DDL in either commit | none (C2 still holds in code: no receipt link, no new table, no index) |
| Perf probe, 500 one-unit lots then 500 one-unit returns, one supplier/item | 8d5dd67: 9.1 s total, last post 33 ms. Same with every other return reversed: 12.0 s, 41 ms. 372c89d on the same machine: 7.9 s, 26 ms |

### Mutation runs (each change undone alone, relevant suite re-run)

| # | Mutation | Result |
|---|---|---|
| V1a | Give-back made a no-op (`if (give) {}`) | Killed ("a reversed return gives its units back…") |
| V1b | Reversed returns left out again (`posting_status = 'Posted'`) | Killed |
| V1e | Give-back placed at the return's own post row, not its reversal row | Killed |
| V1h | Event sort removed | Killed |
| V1i | `reversed` forced to false | Killed |
| V1c | Tie-break flipped (`give` before `take` at equal `at`) | Survives: **equivalent** (two events never share a stock-ledger id) |
| V1d | Guard ":446" (reversed with no reversal row → skip) removed | Survives: **equivalent** (take and give at the same point cancel) |
| V1f | `is_deleted` filter dropped from the `last_sl_id` subquery | Survives: near-equivalent (stock-ledger rows are not soft-deleted by any current path) |
| V1g | `if (lot.left <= 1e-9) continue` removed | Survives: **equivalent** (zero units are skipped at :421) |
| T2c | Trade Payables arm of `needsVoucher` removed (my old F12) | **Killed now** (new "zero-value return that uses a billed receipt elsewhere" test) |
| T4 | `landed_cost` first again in `receiptValue` (my old F12) | **Killed now** (new "ignores a landed cost" test) |
| **FP1** | **Fingerprint comparison after the backup removed** | **Survives** |
| **FP2** | **Hash dropped from the fingerprint** | **Survives** |
| **FP3** | **dev/ino/size/mtime dropped from the fingerprint** | **Survives** |
| **N1** | **Whole re-check after the backup removed** (`if (false)`) | **Survives** (carried) |
| **UF1** | **`entry.isFile()` filter removed in `newestSetupInFolder`** | **Survives** |
| **EU1** | **`ensureUpdateFolder` try/catch removed** | **Survives** |
| **U1** | **"could not be opened" catch in `assertInstallerInsideUpdateFolder` removed** | **Survives** (carried) |
| AL1 | `sha256` dropped from the audit-log entry | Survives (Info: no test reads the audit log entry) |
| G-z | Guard reverted to `ls-files -s` split on `\n`, with `node_modules/ä.js` staged in the clone's index | Reverted guard **passes** (misses it: git prints `"node_modules/\303\244.js"`); the `-z` guard **fails** as it should. The fix works |

## Summary

**V1 is fixed cleanly and is well tested.** The replay in `supplierReturnSplit` is now event-based: each earlier return takes its units at its first stock-ledger row and, if reversed, gives exactly those units back at its reversal row. Five of nine mutations are killed; the four survivors are equivalent or near-equivalent. Comment (:356-359, :431-433), policy §6 (:89) and KG-4 `safetyRule` (:717) all say the same thing. My F13 wording points are fixed except `relatedDG1Tables`.

**All five security fixes in `main.js` and the test file are untested in the app's own suite except the `-z` guard**: removing the fingerprint compare, the file filter or the new message changes no test result (F19). The fixes themselves read correctly.

**The pending card covers V1, T1, T2 (with the item (a) reversal) and T4 by name.** It does not name C3 (Accounting Only makes no receipt), C4 (purchase-voucher receipts count as billed) or B1/B4 (supplier tag on the TP line; supplier-rate pricing and free receipts last), which my previous report counted on the earlier card covering. And it bundles approval of built behaviour with an unbuilt schema change (F18).

**The open items are not where a reader of the policy would find them** (F20): of V2, V4, V5, V6, T5, R6, R8, N2, V3 and F11, only R6 and part of V4/N2 appear in policy §6.

| # | Severity | Owner? | Where | Finding |
|---|---|---|---|---|
| F18 | **Medium** | **Yes** | pending card; owner-decisions-pr4.md C2, item (a) | Card names V1/T1/T2/T4 but not C3, C4, B1/B4; it joins "approve as built" with an unbuilt table + index |
| F19 | Low | No | main.js:412-423, :477-485, :562-566, :1301-1305; ipc-security.test.mjs:463-485 | Fingerprint compare, file filter, update-folder message (and carried N1, U1) have no killing test; `main.js` update code is hard to test in place |
| F20 | Low | No (recording); the items themselves need the owner | fsr-2a4 policy §6 :82-96 | Open items V2, V4, V5, V6, T5, R8, N2, V3 not recorded as known limits |
| F21 | Low | No (index needs schema approval) | inventoryService.js:434-441, :404-430 | Replay 15-25% slower than 372c89d: second correlated subquery, used-lot pruning removed; V3 index still missing |
| F22 | Info | No | inventoryService.js:441, :446, :451 | Replay small clean-ups: no `ORDER BY` (ties on null `sl_id`), redundant guard, dead tie-break |
| F23 | Info | No | main.js:562-566, :420 | Fingerprint reads the whole installer into memory twice on the main process; folder message names "Documents" when a custom folder is set |
| F11 | Low | No | inventoryService.js:375-385, :436-437 | Carried, unchanged; the earlier-returns query now has two correlated subqueries |

### Status of the 372c89d findings

| Prev | Status | Evidence |
|---|---|---|
| F11 SQL style | **Open** | :375-385 unchanged; :436-437 adds a second correlated `stock_ledger` subquery (MAX) beside the MIN. See F21 |
| F12 untested fixes | **Half fixed** | T2c and T4 killed by two new tests (audit2 :1217-1241, plus V1 at :1243). N1 and U1 still survive, and three new fixes join them (F19) |
| F13 wording and lists | **Mostly fixed** | Comment :357-359 says "not yet reversed"; policy :89 says "internal ids", not voucher numbers; KG-4 `safetyRule` :717 now has bill-until-reversed, give-back and the zero-value voucher; `postStockReturn.writesToTables` :707 adds `accounts`; `postGuidedVoucher.writesToTables` :473 adds the four receipt and stock tables. **Still open:** `relatedDG1Tables` :715 is the old six (add `stock_inwards`, `procurements`, `goods_receipts`, `goods_receipt_items`, `accounts`); policy :89 does not say that a restore that renumbers rows changes the replay |
| F14 owner OK for T1, T2, T4 | **On the card, awaiting answer** | The card names "bill until reversed", "zero-value voucher changing approved item a" and "taxable-first receipts". Merge still waits for the answer. Coverage gaps in F18 |
| F15 guard only a test | **Open (Info)** | `-z` makes the guard reliable for quoted names (G-z). Still no hook or CI |
| F16 T4 comment; `procurement_id` | **Comment softened, code unchanged** | init.js:1024-1025 now says "(A voucher with no taxable value posts nothing to GRNI.)", which is true, but the `landed_cost` fallback on :1026 then puts value into stock against a GRNI credit nothing clears. Drop the fallback or refuse a zero-taxable stock voucher. `payload.procurement_id` (:1036, :1041) still passed through |
| F17 money conventions | **Open (Info)** | No change; no new drift. The give-back restores the same float units it took, so no rounding drift is added |

---

## F18 — Medium (governance): the pending card does not name every posted-amount change, and joins two decisions

- **Where:** the pending card ("Approve the supplier-return posting fixes (as-of replay, bill until reversed, reversed returns give back, zero-value voucher changing approved item a, taxable-first receipts), and record which receipts each return uses (new table + index, reversing decision C2)?"); owner-decisions-pr4.md C2 and item (a).
- **Covered by name:** M1 as-of replay (posting order, as-of billing), T1 (bill until reversed), **V1 (reversed returns give back, the only posting change in this range)**, T2 (with the explicit item (a) change), T4 (taxable-first).
- **Not named, but changed posted amounts after the owner's 11 Nov 00:09 IST approval** (listed in audit-66b024f-architecture.md "Items for the owner" and my previous reports):
  - **C3:** a purchase voucher set to Accounting Only books to Purchase and creates no goods receipt (changes Inventory/GRNI).
  - **C4:** receipts made by a posted purchase voucher count as billed in a supplier return (moves the debit from GRNI to Trade Payables).
  - **B4 / pool pricing:** billed receipts at the supplier's rate, unbilled at stock value, free (zero-price) receipts used last (policy :85).
  - **B1:** the return's Trade Payables line carries the supplier link, so it shows in the party ledger and Party Reconciliation.
  - If the earlier card that named C3/C4/C5/N6 is still open beside this one, these are covered; if this card replaced it, they are not.
- **Bundling:** one tap approves both "the fixes as built" and an unbuilt schema change (new table + index) that reverses C2. A "No" is ambiguous (refuse the fixes, or only the table?). The card also does not say which index: the V3 index on `stock_ledger (source_module, source_id)` changes no posting and is useful even if the pool is kept; an index on the new table is part of the table.
- **Why:** AGENTS.md rule 4 needs the owner's OK for each posting change, and approval for schema changes. Today's card leaves four posting changes without a named OK and asks for schema approval before there is a design to approve.
- **Fix (owner):** re-issue as options, for example:
  1. "Approve all supplier-return and purchase-receipt posting changes as built (list: as-of replay, bill until reversed, reversed returns give back, zero-value voucher [changes item (a)], taxable-first receipts, Accounting Only makes no receipt, purchase-voucher receipts count as billed, supplier-rate pricing with free receipts last, supplier tag on the TP line); keep the pool (C2)."
  2. "As 1, and also record which receipts each return uses (new `stock_return_lots` table, reversing C2); the design comes back for approval before it is built."
  3. "Hold PR #4."
  Ask for the V3 `stock_ledger` index separately (schema approval, no posting change). After the answer, update owner-decisions-pr4.md item (a) and C2.
- **If option 2 is chosen:** the replay in `supplierReturnSplit` becomes back-fill logic for returns posted before the table; comment :366, policy :82/:86, KG-4 `safetyRule` and `readsFromTables` must change with it, and V4 (voucher-less returns) is fixed by the stored allocation.

## F19 — Low: the new installer and update-folder fixes have no killing test

- **Where:** main.js:562-566 (`installerFingerprint`), :1301-1305 (compare after the backup), :477-485 (`isFile` filter), :412-423 (`ensureUpdateFolder` message); carried: :1304 whole re-check (N1), :551-555 "could not be opened" (U1). Only test: ipc-security.test.mjs:463-485.
- **What:** FP1, FP2, FP3, UF1, EU1, N1 and U1 all survive (table above). The fixes read correctly; nothing would notice if they were undone.
- **Why:** these are the guards the security audit asked for; one of them (the fingerprint) is the only defence against a plain-file swap during the backup.
- **Fix (no owner):**
  - UF1, cheap: in the 66b024f test, after making the link and the sub-folder, call `updates:status` and assert `installerFileName` is not the link's name.
  - EU1/U1, cheap: point `GII_GEM_ERP_UPDATE_DIR` at a path under a regular file (so `mkdir` fails with ENOTDIR) and assert the "could not be created or opened" message; call `updates:install` with a looping link for U1.
  - FP1-3 and N1: move `assertInstallerInsideUpdateFolder`, `installerFingerprint` and the check-backup-recheck step into a small module (e.g. `src/main/updates/installerGuard.js`) that takes the backup function as a parameter, and unit-test it with a backup stub that overwrites the file in place (kills FP1/FP2), swaps in a hard link to another file (kills FP3), and swaps in a symlink (kills N1). This is internal; no IPC channel or preload method changes.

## F20 — Low: the open items are not recorded where a reader of the policy would look

- **Where:** fsr-2a4-perpetual-inventory-policy.md §6, :82-96. Today the items live only in the preserved audit reports (docs/audit/in-house-audits-2026-10/…), spread over three files by ID.
- **What the policy already says:** R6 (:86, "a return naming an order finds no receipts when the supplier's receipts carry no order"); V4 as a rule but not its effect (:89, "replayed with today's billing", without saying that a later bill reversal then leaves GRNI uncleared); N2 in part (:94, "held on account, not against one bill"); input GST (:91).
- **Not recorded anywhere outside the audit reports:**
  - V2: receipt booked after its bill, then the bill reversed: the return clears GRNI that was never credited (GRNI +1000, Purchase −1000).
  - V4 effect: GRNI −500 / PPV +500 after a later bill reversal.
  - V5 / T7: reversing a receipt after it was billed and partly returned leaves GRNI/TP unbalanced.
  - V6: billing again on a new procurement after a reversal: the inward stays on the old one, so the return clears GRNI while the new bill stays owed.
  - T5: damaged units valued by whether a rate is typed.
  - R8: Party Reconciliation date bounds (a report, not posting: belongs in the report's notes).
  - N2: the bill-wise payable still shows the full bill after a return.
  - V3: no index on `stock_ledger`; the replay slows with unrelated ledger volume.
  - F11: SQL style (code quality; an audit item, not a policy limit).
- **Why:** AGENTS.md asks that the policy match behaviour. Several of these leave a balance stuck in GRNI or Trade Payables; an accountant reading §6 would not know to look for them.
- **Fix (no owner for the recording):** add a "Known gaps, not yet decided (as of 8d5dd67)" sub-list to §6 with one line each (what happens, the wrong balance, the audit ID, "owner decision pending" where it applies), and a one-line pointer in KG-4 `safetyRule` ("open gaps: policy §6"). Put R8 in the Party Reconciliation report notes. Leave F11 in the audit trail. The fixes for V2, V4, V5, V6 and T5 change posting and need the owner.

## F21 — Low: the event replay is slower than the 372c89d version

- **Where:** inventoryService.js:434-441 (two correlated `stock_ledger` subqueries per earlier return), :404-430 (`take` now scans every lot every time; the 372c89d pruning `open = open.filter(...)` is gone, because a give-back can bring a used-up lot back).
- **Measured:** 500 lots × 500 returns: 9.1 s total / 33 ms last post, against 7.9 s / 26 ms at 372c89d (+15% to +27%). With half the returns reversed: 12.0 s / 41 ms. Still O(E log E + E × L) per post; fine at SME scale.
- **Why:** the correctness audit (V3) showed the correlated `stock_ledger` lookups are most of the cost, and this commit doubles them.
- **Fix:** (no owner) fetch MIN and MAX in one pass: `LEFT JOIN (SELECT source_id, MIN(id) sl_id, MAX(id) last_sl_id FROM stock_ledger WHERE source_module = 'stock_returns' AND COALESCE(is_deleted,0) = 0 GROUP BY source_id) s ON s.source_id = sr.id`. (Schema approval) add `idx_stock_ledger_source (source_module, source_id)`: 63 ms → 0.9 ms for this query in the correctness audit. Pruning is not worth bringing back.

## F22 — Info: small clean-ups in the replay

- **:441** the `ORDER BY sl_id, sr.id` was dropped; order now comes from the JS sort on `at`. Two returns with a null `sl_id` both get `at = 0` and keep SQLite's row order, which is not guaranteed. Add `ORDER BY sr.id` to the query.
- **:446** the guard "a reversed return with no reversal row … left no trace" is redundant (V1d: take and give at the same `at` cancel). Keep it for clarity or drop it; either is fine.
- **:451** the tie-break `Number(x.give) - Number(y.give)` is dead (V1c): a take and a give never share a stock-ledger id. Drop it, or say in a comment that it only orders equal ids.
- **Readability:** the replay rules now sit in three policy bullets (:84, :87, :89) and two code comments (:356-359, :431-433). They agree. Optionally gather the policy bullets into one "How earlier returns are replayed" list.
- **Fix (no owner):** the `ORDER BY` line; the rest optional.

## F23 — Info: fingerprint cost and one message

- **main.js:562-566** reads the whole installer with `readFileSync` twice on the main process (before and after the backup). An NSIS installer of 100-200 MB allocates that much twice and blocks the window for the read. Use a streamed hash (`fs.createReadStream` into `crypto.createHash`) and `await` it. No behaviour change.
- **main.js:420** "Check that the Documents folder is available" is shown even when `GII_GEM_ERP_UPDATE_DIR` names a different folder. Say "Check that this folder can be created" when `configured` is set. The message is otherwise guided.
- **Commit hygiene:** `98c6fda` is a "WIP" commit on the PR branch; squash on merge if the history matters.
- No owner.

## F11 — Low (carried): `supplierReturnSplit` SQL style

- Unchanged at :375-385: the `billVoucher` fragment still ends in a `WHERE` and is extended with `AND …`; the `pv` ON-subquery repeats the filters. The new earlier-returns query (:434-441) adds a second correlated subquery (F21). Fix as before (CTE or two scalar subqueries); no owner.

---

## Items for the owner

1. **F18:** re-issue the pending card so it names C3, C4 and B1/B4 alongside V1, T1, T2 and T4 (or confirm the earlier card that covers them is still open), and split "approve as built, keep the pool" from "build `stock_return_lots`" and from the `stock_ledger` index. **PR #4 should not merge before the owner answers.**
2. The fixes for V2, V4, V5, V6 and T5 (listed in F20) are posting decisions; recording them in the policy is not.

Everything else (F19-F23, F11, the F13 remainder) is tests, documentation, KG-4 or code clarity and needs no owner OK. The V3 index needs schema approval but changes no posting.
