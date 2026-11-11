# Architecture audit: 8d5dd67..7955315

- **Repo and branch:** advmayankmanvendra-glitch/gii-gem-erp, branch `claude/erp-full-automation-qbhv8k`, head `7955315`.
- **Written:** 11 Nov 2026, 06:20 IST.
- **Commits in scope:**
  - `f0aed14` (11 Nov 05:55 IST, "WIP: launch a hashed staged copy of the installer (S8-r1, S13), case-insensitive node_modules guard").
  - `7955315` (11 Nov 06:04 IST): reversed receipts in the supplier-return replay (correctness X1), staged installer, `latest.json` isFile check, "Known gaps" in policy §6, KG-4 line number, the three 8d5dd67 reports preserved.
- **Answers:** audit-8d5dd67-architecture.md (F18-F23, F11).
- **Read against:** AGENTS.md rule 4 (owner OK for posting, profitability, GST; approval for schema; no IPC/preload/route-key renames; no logic in App.jsx or screens; guided error messages), KG-4 (`voucher-accounting-graph.json`) incl. every `lineNumber` and the `postStockReturn` entry, fsr-2a4 policy §6, owner-decisions-pr4.md, and the re-issued owner card as given to me.
- **How it was run:** read-only on /home/claude/gii-gem-erp and /home/claude/wt-prog. Everything ran in the scratch clone /tmp/claude-0/arch-372 (fetched, checked out `7955315`, its own copied `node_modules`, not a link). Every mutation and probe was applied to that clone and restored from a backup; the temporary index entry used for the guard check was removed. `git status --short` is empty at the end.

## Commands and results

| Command or check | Result |
|---|---|
| `npm run test:integrity` (9 node suites + ipc-security) | 220/220 and 27/27 pass |
| `verify:voucher-accounting-graph`, `verify:knowledge`, `verify:audit` | exit 0 |
| KG-4 line numbers by script (23 functions + 2 `reversalRules`) | 25/25 correct (`postStockReturn` 478, `reverseVoucher` 453, `reverseAdvanceAdjustment` 1021) |
| Preserved 8d5dd67 reports in `docs/audit/...` vs the mount copies | sha256 identical (3/3) |
| IPC channel, preload method, route key renamed; screen or App.jsx touched | none (only renderer file touched is the KG-4 JSON) |
| DDL in either commit | none (the one `CREATE INDEX` line in the diff is inside a preserved report) |
| Probe P1 (new, below): receipt X reversed after a return used it, then that return reversed, then returns B and C | **C posts Trade Payables Dr 1000 for units B already used** (TP debited 2000 against a 1000 bill). With a 2-line fix, C posts TP Dr 400 at average cost, and audit2 stays 70/70 |
| Perf probe, 500 one-unit lots then 500 one-unit returns, one supplier/item | 7955315: **17.2-17.6 s total, last post 55-58 ms**. 8d5dd67 on the same machine: 9.1 s, 34 ms. With an index on `stock_ledger (source_module, source_id)` added at the end: next post 9 ms |

### Mutation runs (each change made alone, relevant suites re-run)

Supplier-return replay (`audit2`, `posting-regressions`, `critical-defects`):

| # | Mutation | Result |
|---|---|---|
| X1d | Reversed receipts left out again (`si.posting_status = 'Posted'`, :387) | Killed (the new "reversed receipt keeps the returns made while it stood" test) |
| **X1a** | **Drop event made a no-op (`if (drop) {}`, :461)** | **Survives** (the end-of-replay zeroing at :466 hides it) |
| **X1b** | **End-of-replay zeroing removed (:466)** | **Survives** (the drop event hides it) |
| X1a+X1b | Both together | Killed |
| **X1i** | **Drop moved to the very end (`reversedAt = Infinity`, :398)** | **Survives**: no test has an earlier return posted after a receipt's reversal, so *when* the lot leaves the pool is untested |
| X1c | Filter "reversed with no reversal row" removed (:402) | Survives: equivalent (that lot gets a drop at 0 and the end zeroing) |
| X1e | `r.id > sl.id` dropped from the reversal subquery (:380) | Survives: equivalent (MAX is the reversal row; without one, :402 filters it) |
| X1f | Drop events never pushed (:458) | Survives (same as X1a) |
| X1g | `ORDER BY sr.id` removed (:447) | Survives: near-equivalent (only orders returns with a null `sl_id`) |
| X1h | Tie-break flipped (:459) | Survives: equivalent (dead, as F22 said) |

Updater and guard (`ipc-security`, or the guard test):

| # | Mutation | Result |
|---|---|---|
| S1 | Launch the update-folder file, not the staged copy | Killed |
| S5 | Hash not fed (`reader.on("data")` removed) | Killed (audit-log sha256 assert) |
| S8 | `stageInstaller` bypassed (launch original, hash in memory) | Killed |
| S9 | Cap set to 1 byte | Killed (the happy path proves the cap is not hit by a small file) |
| UF1 | `entry.isFile()` filter removed in `newestSetupInFolder` (:483) | **Killed now** (new "only offers real installer files" test) |
| **S2** | **1 GB cap removed (`if (false)`, :571)** | **Survives**: the refusal and its message are untested |
| **S6** | **`latest.json` isFile reverted to `fs.existsSync` (:467)** | **Survives**: no test points `latest.json` at a folder or link |
| S3 | `flags: "wx"` removed (:581) | Survives: near-equivalent (the folder is emptied at :575 first) |
| S4 | Staging folder clean-up removed (:575) | Survives (a second install in one run would fail with EEXIST; untested) |
| EU1 | `ensureUpdateFolder` message replaced (:421) | Survives (carried) |
| U1 | "could not be opened" catch (:557) | Survives (carried, not re-run: code unchanged) |
| G-i | Guard `/i` removed, with `src/Node_Modules/x.js` staged in the clone's index | `/i` guard **fails** as it should; without `/i` it **passes** (misses it). The fix works; in the normal suite the mutation survives, as expected for a guard |

## Summary

**X1 is fixed for the case tested, but the replay still lets a reversed receipt come back** (F24, Medium). If a return used receipt X, X is then reversed, and the return is reversed after that, the give-back puts the units back on X after X left the pool. Any earlier return replayed after that point uses X's ghost units instead of the receipts it really used, so a later return clears the same billed receipt twice. The end-of-replay zeroing at :466 shows the intent but runs too late. Two lines fix it. KG-4's "no receipt unit is returned twice" is false until then.

**The re-issued card now names every posted-amount change I know of in the branch** (B4, B1, M1/T1/V1, T2 with item (a), C3, T4, C4, and X1 under item 3), and its options are split as F18 asked. **Item 3 describes X1 wrongly**: a reversed receipt does not "give units back"; it keeps the returns made while it stood and the rest leaves the pool. "Approve as built" would also approve F24 (F25).

**The policy's "Known gaps" list is a good answer to F20**: it has every item I listed except F11 (rightly left out). Four wording points and two missing items (F16's zero-taxable fallback, the restore-renumbering limit) are in F28. KG-4's `safetyRule` was not updated for reversed receipts.

**The replay is now about 90% slower than at 8d5dd67** (F27): the third correlated `stock_ledger` subquery runs once per lot. The index would take a post from 55 ms to 9 ms; it needs schema approval but changes no posting.

**The staged-copy installer is a cleaner design than the fingerprint** and three of its parts are tested. Two side effects need the security auditor (F29): the copy loses Windows' "downloaded from the internet" mark, and the installer is unsigned, so Windows no longer warns before it runs.

| # | Severity | Owner? | Where | Finding |
|---|---|---|---|---|
| F24 | **Medium** | No new decision (fix restores the rule on the card and in the policy); fix before the card is answered | inventoryService.js:458-466 | A give-back after a receipt's drop brings the reversed receipt back; a later return clears the same bill twice (P1: TP Dr 2000 on a 1000 bill) |
| F25 | **Medium** | **Yes** (card text) | pending card item 3, item 5; owner-decisions-pr4.md | Card covers all posted-amount changes, but item 3 says reversed receipts "give units back", which is wrong; "as built" includes F24; item 5 hides the zero-taxable fallback |
| F26 | Low | No | audit2 :1261-1283; ipc-security :487-526 | Survivors: X1a, X1b, X1i (drop timing untested), S2 (cap), S6 (`latest.json` isFile), S4, EU1, U1 |
| F27 | Low | No (index needs schema approval) | inventoryService.js:380, :442-443 | Replay 9.1 s → 17.4 s for 500×500 (last post 34 → 57 ms); index → 9 ms |
| F28 | Low | No (recording); the gaps themselves need the owner | policy §6 :91-92; KG-4 :715, :717 | Known-gaps list: "would close V5" overstated, T5 and V3 wording, F16 and restore-renumbering missing; KG-4 `safetyRule` silent on reversed receipts and wrong on "never twice" while F24 is open |
| F29 | Low | No (security auditor to weigh) | main.js:569-583, :1316-1318 | Staged copy drops the Mark-of-the-Web on an unsigned installer; check-then-open gap; cap checked by `stat`, not by bytes read; up to 1 GB left in the data folder |
| F30 | Info | No | inventoryService.js:367-476 | `supplierReturnSplit` is 110 lines with three event kinds as booleans and two zeroing paths; a small pure module would help |
| F31 | Info | No | main.js (1534 → 1547 → 1559 lines); :413-584 | Updater code (~170 lines) still in main.js; F19's module not done; another WIP commit |
| F11 | Low | No | inventoryService.js:375-389, :440-448 | Carried; now three correlated `stock_ledger` subqueries |

### Status of the 8d5dd67 findings

| Prev | Status | Evidence |
|---|---|---|
| F18 card coverage and bundling | **Mostly fixed** | Card re-issued with five numbered items and three options ("Approve + design return-receipts table/index first" / "Approve, keep pool" / "Hold"). C3, C4, B1, B4 now named; X1 named under item 3. Remainder in F25. owner-decisions-pr4.md not yet updated with the re-issued card (file last changed 11 Nov 00:22 IST) |
| F19 untested installer fixes | **Partly fixed / superseded** | Fingerprint replaced by the staged copy, so FP1-3 and N1 no longer apply. S1, S5, S8 killed by the new launch test; UF1 killed by the new folder test. Still surviving: EU1, U1 (carried), and the new S2, S6, S4 (F26) |
| F20 open items not in the policy | **Fixed, with wording points** | policy §6 :92 lists V2, V4, V5/T7, V6, T5, N2, R8, V3, all marked as needing the owner. See F28 |
| F21 replay slower | **Worse** | MIN/MAX not merged; a third correlated subquery added per lot (:380). See F27 |
| F22 replay clean-ups | **Half fixed** | `ORDER BY sr.id` added (:447). Tie-break still dead, now `Number(Boolean(...))` (:459). Guard :453 kept (fine) |
| F23 fingerprint cost; message | **Fixed** | Installer now streamed once (:579-581). Message now "Check that the folder can be reached (or change the update folder setting)" (:421). `f0aed14` is another "WIP" commit on the PR branch |
| F11 SQL style | **Open** | :375-389 unchanged in style; see F27 |
| F13 remainder | **Open** | `relatedDG1Tables` (KG-4 :715) still the old six; the policy still does not say that a restore that renumbers rows changes the replay |

---

## F24 — Medium: a give-back after a receipt's drop brings the reversed receipt back into the pool

- **Where:** inventoryService.js:458-466.
  ```js
  for (const lot of lots) if (lot.reversed) events.push({ at: lot.reversedAt, drop: lot });
  ...
      if (drop) drop.left = 0;
      else if (give) entry.used.forEach(({ lot, units }) => { lot.left += units; });
  ...
  // Receipts reversed with no earlier return to replay are gone, too.
  for (const lot of lots) if (lot.reversed) lot.left = 0;
  ```
- **What happens:** a return A takes units from receipt X. X is reversed (drop: X.left = 0). A is then reversed (give: X.left += 10). X is "back" until the zeroing at :466, which runs only after the whole replay. Any earlier return replayed between A's reversal and the end takes X's ghost units instead of the receipts it actually used, and those real receipts stay "free" for the return being posted.
- **Probe P1** (scratch test, run and removed): supplier 2 stocks 20 units at ₹50 (so the reversals are allowed). Supplier 1: X 10 units at ₹100 unbilled; Y 5 units at ₹200 on a posted bill of ₹1000. Return A (10) uses X, GRNI Dr 1000. Reverse X, then reverse A. Return B (5) posts TP Dr 1000 (correct: it uses Y). Return C (5): the replay gives A's units back to X, B is replayed onto X, so Y looks unused. **C posts TP Dr 1000 / PPV Cr 600 / Inventory Cr 400.** Trade Payables is debited 2000 against a ₹1000 bill. The correct result is TP Dr 400 at average cost (C is past every receipt).
- **How reachable:** it needs a receipt reversed after a return used it, which is the V5 path (receipt reversal does not check returns). V5 is in the known-gaps list; this is a further, open-ended error on later returns, and it breaks KG-4's "no receipt unit is returned twice".
- **Fix (no new owner decision; it makes the code do what policy :91 and the card say):** mark the lot gone at its drop and skip gone lots in the give-back:
  ```js
  if (drop) { drop.left = 0; drop.gone = true; }
  else if (give) entry.used.forEach(({ lot, units }) => { if (!lot.gone) lot.left += units; });
  ```
  Then :466 is redundant (every reversed lot has a drop event); keep it only as a belt-and-braces line with a comment, or drop it. Tried in the clone: P1's C becomes TP Dr 400, audit2 stays 70/70. Add P1 as a test (it also kills X1a, X1b and X1i, F26).
- **Why before the card answer:** the card asks the owner to approve item 3 "as built". The as-built code has this bug.

## F25 — Medium (governance): the card covers every change, but item 3 describes X1 wrongly and item 5 leaves out a fallback

- **Coverage check** (every posted-amount change in the branch after the owner's 11 Nov 00:09 IST approval, against the card):

  | Change | Card item |
  |---|---|
  | B4: unbilled before billed, oldest first, free (zero-price) receipts last; unbilled at stock value, billed at the supplier's rate without landed cost | 1 ("receipt pricing oldest first, free last"); the rate basis came with CV |
  | B1: supplier tag on the TP line | 2 |
  | M1 as-of replay; T1 bill counts until reversed; V1 reversed returns give back | 3 |
  | **X1 (7955315): reversed receipts stay in the replay until their reversal** | 3, **worded wrongly** |
  | T2: zero-value return posts a voucher when it clears GRNI/TP (changes item (a)) | 4 |
  | C3 Accounting Only makes no receipt; T4 taxable-value receipt; C4 purchase-voucher receipts count as billed | 5 |

  Nothing else in `src/main/services` or `src/main/database` changes posted amounts in 8d5dd67..7955315. The PR #5 ledger-guard commits merged into this branch (7ab880f, c0f9e0f, 43c5ccf) add refusals and checks, not new amounts; they are outside this card.
- **Item 3, X1:** "reversed returns and receipts give units back" is right for returns and wrong for receipts. A reversed receipt gives nothing back: it keeps the returns made while it stood (they stay on it in the replay), and what was left of it leaves the pool at its reversal. Before 7955315 a reversed receipt was left out from the start, so those returns were replayed onto other receipts and moved amounts between GRNI and Trade Payables (correctness X1, W5b: TP −1000 / PPV +1000). The owner should approve the sentence policy :91 uses.
- **"As built":** includes F24. Fix F24 first, or say "as built, with the F24 fix".
- **Item 5:** "taxable-value receipt" is true only when the voucher has a taxable value. With zero taxable value, init.js:1026 falls back to `landed_cost`, then `accepted × rate`, and puts that value into stock against a GRNI credit nothing clears (my F16). Either drop the fallback (refuse a zero-taxable voucher with stock) or name it on the card.
- **Options:** fine. "table/index" in option 1 still mixes two things: the `stock_ledger (source_module, source_id)` index changes no posting, is useful whichever option is chosen, and is now worth 55 ms → 9 ms per post (F27). Ask for it separately, as schema approval only.
- **Record:** once answered, update owner-decisions-pr4.md item (a), C2 and the new IDs.
- **Owner:** yes (card text). PR #4 should not merge before the answer.

## F26 — Low: survivors in the new tests

- **Where:** audit2-regressions.test.mjs:1261-1283 (the X1 test); ipc-security.test.mjs:487-526 (staged launch, real-file folder).
- **Replay:** X1a and X1b each survive because the other hides it; X1i shows that *when* a reversed receipt leaves the pool is untested (no earlier return is posted after a receipt's reversal). P1 from F24, as a test asserting C's TP line is the average-cost amount, kills all three and F24.
- **Updater:**
  - S2 (1 GB cap): make a sparse file over 1 GB (`fs.openSync` + `fs.ftruncateSync(fd, 1024**3 + 1)`; no disk used), call `updates:install`, assert the "larger than any GII GeM ERP installer" message and that `shell.openPath` was not called.
  - S6 (`latest.json` isFile): write `latest.json` naming `GII-GeM-ERP-Setup-98.0.0-x64.exe`, make that name a folder, assert `updates:status` does not offer it.
  - S4: call `updates:install` twice in the same test (stub `openPath` both times); the second must succeed.
  - EU1/U1 (carried): as in F19 (ENOTDIR via `GII_GEM_ERP_UPDATE_DIR` under a regular file; a looping link).
- **Owner:** no.

## F27 — Low: the replay is now about 90% slower than at 8d5dd67

- **Where:** inventoryService.js:380 (new `MAX(r.id)` correlated subquery per lot on `stock_ledger`), :442-443 (the two per earlier return, F21).
- **Measured:** 500 one-unit lots, then 500 one-unit returns: **17.2-17.6 s total, 55-58 ms for the last post**, against 9.1 s / 34 ms at 8d5dd67 and 7.9 s / 26 ms at 372c89d. After adding `stock_ledger (source_module, source_id)` in the probe, the next post took 9 ms.
- **Why:** `stock_ledger` has no index on its source columns, so each correlated lookup scans the ledger. The cost grows with the whole stock ledger, not only with returns.
- **Fix:**
  - No owner: fetch every `stock_ledger` bound in one grouped pass, e.g. `LEFT JOIN (SELECT source_module, source_id, MIN(id) first_id, MAX(id) last_id FROM stock_ledger WHERE source_module IN ('stock_inwards','stock_returns') AND COALESCE(is_deleted,0)=0 GROUP BY 1,2) b ON …`, joined once for lots and once for returns.
  - Schema approval (no posting change): `CREATE INDEX IF NOT EXISTS idx_stock_ledger_source ON stock_ledger (source_module, source_id)`. Ask separately from the card (F25).

## F28 — Low: "Known gaps" list and KG-4

- **Where:** fsr-2a4 policy §6 :91-92; KG-4 `postStockReturn` :715, :717; KG-4 `knownGaps`.
- **The list is complete against my F20** (V2, V4, V5/T7, V6, T5, N2, R8, V3; F11 rightly left out) and each item says what goes wrong. Points:
  1. "Recording each return's receipts in its own table would close V2, V4 and V5" overstates it. Per audit-8d5dd67-correctness.md :169-173, the table closes X1, X3/V4 and **V2's lot side**; V5 also needs a rule on receipt reversal (refuse while unreversed returns point at it, or reverse only the remainder). Say "would close V4 and the replay side of V2 and V5; V5 also needs a rule for reversing a receipt that was returned from".
  2. T5: "damaged units change the per-unit stock rate of a purchase-voucher receipt" does not say the effect. Say: "with damaged units, the amount a return clears from Trade Payables depends on whether a rate was typed on the purchase voucher (rate 100: TP 800 + PPV 200; no rate: TP 1000)".
  3. V3: "slows as returns grow" → "slows as the stock ledger grows (every module's rows)".
  4. Missing: F16, a purchase voucher with stock and zero taxable value brings stock in at landed cost or rate with no GRNI credit to clear it (init.js:1026). Unless it is fixed first (F25).
  5. Missing: the replay orders by internal ids, so a restore or import that renumbers `stock_ledger` or `vouchers` changes how old returns are replayed (F13 remainder).
  6. Missing until F24 is fixed: a receipt reversed after a return used it, followed by that return's reversal, makes later returns use the same receipt twice.
  7. R8 is a report limit; also put it in the Party Reconciliation report's notes.
- **KG-4:**
  - `safetyRule` (:717) was not updated in 7955315. It should say "a reversed receipt keeps the returns made while it stood, and what was left of it leaves the pool at its reversal", and point to "known gaps: policy §6". Its "so no receipt unit is returned twice" is false while F24 is open.
  - `relatedDG1Tables` (:715) is still the old six (carried F13): add `stock_inwards`, `procurements`, `goods_receipts`, `goods_receipt_items`, `accounts`.
  - `knownGaps` has no entry pointing at policy §6; `inventoryImpact` still says supplier returns create no voucher (KG4-GAP-002 covers that until KG-4 v1.1). Add a KG4-GAP-007 "Supplier-return pool gaps: see policy §6".
  - Line numbers: 25/25 correct.
- **Owner:** no for the recording; each gap's fix needs the owner.

## F29 — Low: side effects of launching a staged copy (for the security auditor)

- **Where:** main.js:568-583 (`stageInstaller`), :1316-1318 (launch), :537-560 (`assertInstallerInsideUpdateFolder`).
- **Mark-of-the-Web:** an installer downloaded through a browser carries a `Zone.Identifier` stream, which makes Windows show its "Open File - Security Warning" or SmartScreen before running it. The stream copy at :579-581 does not carry it, so the staged copy runs with no warning. The repo has no code-signing setup (no `certificateFile`, `signtool` or signature check found), so that warning was the only check Windows made. Fix: on win32, copy `<installer>:Zone.Identifier` to `<staged>:Zone.Identifier` when it exists (best-effort), or verify an Authenticode signature once the installer is signed.
- **Check-then-open:** the folder check resolves links at :552-559; `stageInstaller` then opens the path again with `createReadStream` (:579), which follows a link swapped in between. The window is small and the update folder is the user's own. Fix: open once (`fs.promises.open`), `fstat` the handle (isFile, size, dev/ino equal to the checked file), and read from that handle.
- **Cap by `stat`:** the 1 GB check (:571) reads the size before the copy; a file that grows during the copy is not limited. Count bytes in the `data` handler and destroy the stream past the cap.
- **Left-over copy:** the staged installer (up to 1 GB) stays in the data folder until the next install. Remove `update-staging` at start-up.
- **Messages:** the cap message is guided. No IPC, preload or route change.
- **Owner:** no.

## F30 — Info: `supplierReturnSplit` readability; a small module would help

- **Where:** inventoryService.js:367-476 (110 lines: three SQL queries, the `take` closure, event building, replay, final take).
- **What makes it hard to read now:**
  - Three event kinds are coded as two optional booleans (`give`, `drop`); the sort needs `Number(Boolean(x.give))` and the tie-break is dead (F22).
  - A reversed lot is zeroed in two places (:461 and :466), and each hides the other in tests (X1a/X1b). F24 is a direct result.
  - "Reversed with no reversal row" is filtered in two different ways (:402 for lots, :453 for returns).
- **Fix (no owner; no IPC, posting or schema change):** move the pure part into `src/main/services/supplierReturnPool.js`:
  - `replayPool(lots, earlierReturns)` builds `{ at, kind: "take" | "give" | "drop" }` events, sorts by `at` only, applies them (with the F24 `gone` flag), and returns the lots.
  - `takeFromPool(lots, { orderId, quantity, asOf })` is today's `take`.
  - `supplierReturnSplit` keeps the two SQL loaders and the money rounding.
  - Unit-test the module with plain arrays (no SQLite): give-after-drop, drop timing, ties, free lots last. Run the existing audit2 tests unchanged to show the refactor posts the same amounts.

## F31 — Info: `main.js` keeps growing

- **Size:** 1534 lines at 372c89d, 1547 at 8d5dd67, 1559 at 7955315. Update code is about 170 lines (:413-584: folder, manifest, scan, path check, staging) beside print, environment and IPC code.
- **Why it matters:** the update path is only testable through the full Electron IPC harness, which is why S2, S4, S6, EU1 and U1 survive cheaply (F26).
- **Fix (no owner):** move `ensureUpdateFolder`, `findLatestUpdateInstaller`, `newestSetupInFolder`, `assertInstallerInsideUpdateFolder` and `stageInstaller` into `src/main/services/deployment/updateInstaller.js` (beside the existing `updateVersion.js` helpers), taking `updateFolder` and `runtimeRoot` as parameters. `main.js` keeps the `updates:*` handlers with their current channel names. Test the module with plain `node --test`.
- **Commit hygiene:** `f0aed14` is another "WIP" commit; squash on merge if history matters.

## F11 — Low (carried): `supplierReturnSplit` SQL style

- :375-389 unchanged in style (the `billVoucher` fragment ends in a `WHERE` and is extended with `AND …`; the `pv` ON-subquery repeats filters). The lots query now has three correlated subqueries. Fix together with F27's grouped join.

---

## Items for the owner

1. **F25:** correct item 3 of the card ("a reversed receipt keeps the returns made while it stood; what was left of it leaves the pool when it is reversed"), and say whether "as built" includes the F24 fix (it should). Say in item 5 what happens to a zero-taxable voucher with stock, or have the fallback removed first. Ask for the `stock_ledger` index separately (schema only, no posting change). **PR #4 should not merge before the answer.**
2. The gaps in policy §6 (V2, V4, V5/T7, V6, T5, N2, R8) stay owner decisions; recording them is done.

F24 should be fixed before the card is answered; it needs no new decision, because it makes the code match the rule already on the card and in the policy. Everything else (F26-F31, F11, the F13 remainder) is tests, documentation, KG-4 or code structure and needs no owner OK. The index needs schema approval only.
