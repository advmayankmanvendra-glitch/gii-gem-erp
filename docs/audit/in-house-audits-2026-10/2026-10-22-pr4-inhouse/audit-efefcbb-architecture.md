# Architecture audit: 7955315..efefcbb

- **Repo and branch:** advmayankmanvendra-glitch/gii-gem-erp, branch `claude/erp-full-automation-qbhv8k`, head `efefcbb`.
- **Written:** 11 Nov 2026, 06:45 IST.
- **Commits in scope:**
  - `fa0a19b` (11 Nov 06:17 IST, "WIP: 7955315 security fixes (open-once staging, hard links, disk space, cleanup)").
  - `efefcbb` (11 Nov 06:27 IST): `gone` flag in the supplier-return replay (F24), reversal subquery only for reversed receipts (F27), policy §6 known-gaps wording (F28), KG-4 `safetyRule` and line number, two new tests, the three 7955315 reports preserved.
- **Answers:** audit-7955315-architecture.md (F24-F31, F11).
- **Read against:** AGENTS.md rule 4 (owner OK for posting, profitability, GST; approval for schema; no IPC/preload/route-key renames; no logic in App.jsx or screens; guided error messages), KG-4 (`src/renderer/knowledge/voucher-accounting-graph.json`), fsr-2a4 policy §6, owner-decisions-pr4.md, and the re-issued owner card as it was given to me (five items; options "Approve + design table" / "Approve, keep pool" / "Hold"; the `stock_ledger` index offered with options 1 and 2).
- **How it was run:** read-only on /home/claude/gii-gem-erp and /home/claude/wt-prog. All work in the scratch clone /tmp/claude-0/arch-372 (fetched, checked out `efefcbb`). Each mutation and probe was applied alone and the file restored from a backup; `git status --short` is empty at the end.

## Commands and results

| Command or check | Result |
|---|---|
| `npm run test:integrity` (9 node suites + ipc-security) | 221/221 and 28/28 pass |
| `verify:voucher-accounting-graph`, `verify:knowledge`, `verify:audit` | exit 0 |
| KG-4 line numbers by script (23 functions + 2 `reversalRules`) | 25/25 correct (`postStockReturn` 480) |
| Preserved 7955315 reports in `docs/audit/...` vs the mount copies | sha256 identical (3/3) |
| IPC channel, preload method, route key renamed; screen or App.jsx touched | none (only renderer file touched is the KG-4 JSON) |
| DDL | none (the `CREATE INDEX` lines in the diff are inside preserved reports) |
| New audit2 test (F24/P1) actually reaches its asserts | yes: re-run with its `catch { return; }` turned into a rethrow, still passes (the receipt reversal is allowed) |
| Perf probe: 500 one-unit lots, then 500 one-unit returns, one supplier/item | **efefcbb: 12.6-12.7 s total, last post 35-48 ms.** Same machine with the `CASE` removed (= 7955315's query): 18.4-19.3 s, 52-53 ms. With `stock_ledger (source_module, source_id)` indexed: **5.3 s, 12 ms** |
| Probe P2 (new): second `updates:install` while the first is between staging and launch | **accepted**: the first install's staged copy is deleted, a second backup is taken and a second installer is opened (F32) |
| Probe P3 (new): what is left of a reversed receipt must leave the pool at its reversal | passes on efefcbb; **kills R5** (below) |

### Mutation runs: supplier-return replay (`audit2`, `posting-regressions`, `critical-defects`; 102 tests)

| # | Mutation (inventoryService.js) | Result |
|---|---|---|
| R1 | `gone` never set at the drop (:463) | Killed (new "gives nothing back" test) |
| R2 | Give-back ignores `gone` (:464) | Killed (same) |
| X1a | Drop made a no-op (:463) | **Killed now** (was a survivor) |
| X1i | Drop moved to the end (`reversedAt = Infinity`, :398) | **Killed now** (was a survivor) |
| R4 | `CASE` condition inverted (`<> 'Reversed'`, :380) | Killed (8d5dd67 "keeps the returns made while it stood") |
| R3 | `CASE` removed (subquery for every lot, :380) | Survives: **equivalent** (a lot that is not reversed ignores `reversal_sl_id`, :398); the change is speed only, measured above |
| **R5** | **Drop sets `gone` but does not zero the lot (`drop.left = 0` removed, :463)** | **Survives** in the suite; killed by probe P3 (F33) |
| X1b | End-of-replay zeroing removed (:468) | Survives: **now equivalent**. Every reversed lot that passes the filter at :402 has a drop event, so :468 never changes anything (F34) |
| R6 | Tie-break flipped (:459) | Survives: equivalent (dead, carried F22) |

### Mutation runs: installer staging (`ipc-security`, 28 tests)

| # | Mutation (main.js) | Result |
|---|---|---|
| SG3 | `nlink !== 1` removed (:593) | Killed (new hard-link test) |
| SG17 | Hash not fed (:612) | Killed (audit-log sha256) |
| SG10 | Free-space check always refuses (:601) | Killed (happy path) |
| SG2 | In-flight flag never released (:627) | Killed, but only by test order (the hard-link test runs after an install and gets "already being prepared") |
| **SG1** | **In-flight flag never checked (:579)** | **Survives** |
| **SG4** | **dev/ino comparison removed (:593)** | **Survives** |
| SG5 | `isFile()` on the open handle removed (:593) | Survives: near-equivalent (`assertInstallerInsideUpdateFolder` already `lstat`s the real path) |
| **SG6** | **1 GB `stat` cap removed (:596)** | **Survives** (carried S2) |
| **SG7** | **Byte-count cap removed (:611)** | **Survives** |
| **SG8** | **Size-match check removed (:615)** | **Survives** |
| **SG9** | **Free-space refusal removed (:601)** | **Survives** |
| **SG11** | **Clean-up of the partial copy on error removed (:622)** | **Survives** (the hard-link test is named "no copy is left behind" but asserts nothing about the staging folder) |
| **SG12** | **Start-up clear removed (:265)** | **Survives** |
| **SG13** | **Staging folder not emptied before the copy (:585)** | **Survives** (carried S4) |
| SG14 | Zone.Identifier copy removed (:618) | Survives: Windows only; cannot be tested on the Linux harness |
| **SG15** | **Re-check inside `stageInstaller` replaced by the path as given (:589)** | **Survives** (the handler checks first, so nothing tests the second check) |
| SG16 | Every error wrapped in the generic message (:623) | Survives: near-equivalent (the wrapper keeps the original message in brackets, so `/linked to another file/` still matches) |

## Summary

**F24 is fixed and tested.** The `gone` flag stops a give-back to a reversed receipt; P1 is now a test, and it kills X1a, X1i and both halves of the fix. The new test really reaches its asserts. One part of the drop is still untested (R5: the drop zeroing what is left of the receipt), and the end-of-replay zeroing at :468 is now dead code.

**The re-issued card is accurate for items 2 and 4 and now right on reversed receipts (item 3)**, so F25's main point is closed. Three wording points remain (F35): item 1 does not say that unbilled receipts are used before billed ones, which is the rule that most decides GRNI against Trade Payables (I missed this in F25); item 3 should add "except to a receipt already reversed"; item 5's fallback is landed cost first, then rate, and it brings stock in with no GRNI credit to clear. The index should also be offered under "Hold", because it changes no posting.

**Policy §6 and KG-4 match the code.** Policy :91 and the KG-4 `safetyRule` both state the new rule; the known-gaps list now has F16 and the restore-renumbering limit and the corrected V5 and T5 wording. Small leftovers in F36.

**The replay is a third faster** than at 7955315 (12.6 s against 18.8 s for 500×500; last post 35-48 ms against 52 ms). The index would still cut it to 5.3 s and 12 ms.

**The installer staging covers every F29 point**, with guided messages throughout, but the in-flight flag is released before the backup and the launch, so a second install in that window deletes the first one's staged copy and opens a second installer (F32). Of the eight new staging checks, only nlink is tested; ten mutations survive (F33). That is the strongest reason to do F31 now: a module with its file system calls passed in can test the byte cap, size match and free space directly.

| # | Severity | Owner? | Where | Finding |
|---|---|---|---|---|
| F32 | Low | No | main.js:579-628, :1348-1376 | In-flight flag covers only staging; a second install during backup or launch deletes the first copy and opens a second installer (P2) |
| F33 | Low | No | ipc-security.test.mjs:528-542; audit2-regressions.test.mjs:1285-1309 | Survivors: R5; SG1, SG4, SG6-SG9, SG11-SG13, SG15. Two tests pass silently when their setup is refused; one test's name claims an assert it lacks |
| F34 | Info | No | inventoryService.js:467-468, :459 | End-of-replay zeroing is now dead; tie-break still dead |
| F35 | Low | **Yes** (card text) | re-issued card items 1, 3, 5; index offer | Item 1 omits "unbilled before billed"; item 3 lacks the "already reversed" exception; item 5 fallback is landed cost, then rate, with no GRNI; index not offered under Hold |
| F36 | Low | No | policy §6 :89, :92; KG-4 :715 | :89 "gives its receipts back" unqualified; V3 still "as returns grow"; R8 not in the report notes; `relatedDG1Tables` still the old six |
| F37 | Info | No | main.js:590 | `pathStats` uses `stat`, not `lstat`; for the security auditor |
| F30 | Info | No | inventoryService.js:367-478 | Do after the owner's answer (reasons below) |
| F31 | Info | No | main.js (1605 lines; updater :414-629, about 215 lines) | Do now (reasons below) |
| F11 | Low | No | inventoryService.js:375-389, :440-448 | Carried |

### Status of the 7955315 findings

| Prev | Status | Evidence |
|---|---|---|
| F24 give-back to a reversed receipt | **Fixed** | :463-464 `gone` flag; test audit2 :1285-1309 is P1 (C's Trade Payables 1000 on receipt Y, D's under 500). R1, R2, X1a, X1i killed. R5 still survives (F33) |
| F25 card text | **Mostly fixed** | Item 3 now says a reversed receipt keeps the returns made while it stood; item 5 names the fallback; options split; index offered. "As built" now includes the F24 fix. Remainder in F35. owner-decisions-pr4.md still unchanged since 11 Nov 00:22 IST (fine until the card is answered; then record it) |
| F26 survivors | **Partly fixed** | X1a, X1b, X1i closed (X1b by becoming dead code). S2 (=SG6), S4 (=SG13), S6, EU1, U1 still survive; new ones in F33 |
| F27 replay speed | **Improved** | `CASE` at :380 runs the reversal subquery only for reversed receipts: 18.8 → 12.6 s, 52 → 35-48 ms. Not back to 8d5dd67 (two correlated subqueries per earlier return remain, :442-443). Index: 12 ms |
| F28 known gaps and KG-4 | **Mostly fixed** | Policy :92: V5 wording corrected, T5 effect stated, F16 and restore-renumbering added. KG-4 `safetyRule` names reversed receipts, the "already reversed" exception, and points to §6. Not done: V3 wording, R8 in report notes, `relatedDG1Tables` (F36) |
| F29 staging side effects | **Fixed in code, mostly untested** | Zone.Identifier copied on win32 (:617-619); open once with dev/ino/nlink check (:589-595); byte cap while reading (:609-612); size match (:615); left-over copy cleared at start-up (:265, :575-577). Also new: free-space check, in-flight flag, partial-copy clean-up. Tests: F33. New issue: F32 |
| F30 module | Open (deliberately) | See below |
| F31 updater module | **Open, worse** | main.js 1559 → 1605 lines; updater code 170 → about 215 lines. `fa0a19b` is another "WIP" commit |
| F11 SQL style | Open | Unchanged |

---

## F32 — Low: the in-flight flag is released before the backup and the launch

- **Where:** main.js:579-580 and :627 (`stageInstaller` sets and clears `installerStaging`); :1362-1376 (the `updates:install` handler backs up, opens the staged copy, then quits after 1.5 s).
- **What happens (probe P2, scratch test run and removed):** install A finishes staging and clears the flag. While A takes its backup, install B is accepted: `stageInstaller` empties `update-staging` (:585), which deletes A's staged copy, takes its own backup and opens its own installer. Then A opens a path that no longer exists. Probe log: A's copy existed before B, `existsAfterSecond: false`, and B's installer was opened. The same applies in the 1.5 s between a successful launch and the quit: a second confirmed click opens a second installer.
- **Reach:** needs two confirmed clicks by an admin (the screen asks "Install Update?" each time and does not disable the button). On Windows a running installer is locked, so the `rm` may fail instead, and the user then gets "The update could not be prepared". Either way the flag does not do what its message says.
- **Fix (no owner, no IPC change):** move the flag to the handler: set it before `getUpdateStatus()`, clear it in a `finally` only when the handler throws, and leave it set after a successful launch (the app is quitting). `stageInstaller` keeps no flag of its own. Test: P2 as a test asserting the second call gets "An update is already being prepared".
- **Owner:** no.

## F33 — Low: survivors and silent tests

- **Replay:** R5 survives: no test reverses a receipt that still had units left and then posts a return the replay must keep off them. Probe P3 kills it and passes on efefcbb: unbilled receipt X 10 at ₹100, billed receipt Y 6 at ₹200, other supplier's stock; return 4 (from X); reverse X; return B 6 (TP Dr 1200, from Y); return C 6 must clear less than 1200 from Trade Payables. Add it to audit2.
- **Staging:** the IPC harness can reach most of these cheaply:
  - SG1/F32: two installs as in P2.
  - SG6 and SG7: a sparse file over 1 GB (`fs.ftruncateSync(fd, 1024 ** 3 + 1)`); SG6 asserts the "larger than any" message. SG7 needs a file that grows during the copy; test it in the F31 module with an injected reader.
  - SG8: the same, in the module (a reader that yields fewer bytes than `fstat` said).
  - SG9: in the module with an injected `statfs` returning little space; assert the guided message.
  - SG11: in the hard-link test, assert `update-staging` holds no file afterwards (today its name promises this). To reach :622 at all, make the write fail after `stagedPath` is set (module test).
  - SG12: write a file into `update-staging`, call `configureRuntimeStorage` (or the module's start-up clear), assert it is gone.
  - SG13: call `updates:install` twice in one test (the second must not fail with EEXIST).
  - SG4 and SG15: need a swap between check and open; test in the module with an injected `open` that returns a different file.
- **Silent tests:** audit2 :1302 `catch { return; }` makes the F24 test pass with no asserts if receipt reversal ever refuses a receipt with returns (the V5 fix the policy names would do exactly that). Use `t.skip("...")` or assert the refusal message, so the change shows. ipc-security :537 does the same when hard links are unavailable; `t.skip` there too.
- **Owner:** no.

## F34 — Info: dead code in the replay

- **Where:** inventoryService.js:467-468 ("Receipts reversed with no earlier return to replay are gone, too"), :459 tie-break.
- **Why:** after :402 every reversed lot left in `lots` has `reversedAt > slId` and gets a drop event at :458, and the drop now zeroes it, so :468 never changes a value (X1b is equivalent). Its comment is wrong: a reversed receipt with no earlier return still gets its drop. The tie-break compares `give` across events whose `at` values are distinct `stock_ledger` ids, so it never decides (carried F22).
- **Fix:** delete both, or keep :468 as an assertion in a test, as part of F30. No posting change.
- **Owner:** no.

## F35 — Low (governance): three wording points on the re-issued card

The card checked against the code at efefcbb:

| Card item | Code | Accurate? |
|---|---|---|
| 1. Receipt pricing oldest first, free last | `take` (:410-436) builds four groups: unbilled priced, unbilled free, billed priced, billed free, oldest first within each | **Incomplete**: "unbilled before billed" is not on the card. It is the rule that decides whether a return clears GRNI or Trade Payables when a supplier has both kinds of receipt; policy :84 states it |
| 2. Supplier tag on the TP line | :525 (`linked_party_type: "supplier"` on the Trade Payables line only) | Yes |
| 3. As-of judgement: a bill counts until reversed; a reversed return gives its receipts back; a reversed receipt keeps the returns made while it stood | `billedAt` :406; give-back :464; lots kept until `reversedAt` :398, :402, drop :463 | **Yes**, now right on receipts (F25 closed). Add "except to a receipt already reversed": that is the F24 fix, and it is behaviour the owner is approving |
| 4. Zero-value return voucher (changes item (a)) | :512 `needsVoucher` | Yes |
| 5. Purchase vouchers: Accounting Only no stock; receipt at taxable value (or its rate when it has none); counts as billed | init.js:1013, :1023-1026; `gv` join :386 | **Mostly**: with no taxable value the receipt takes `landed_cost` first, then quantity × rate, and that stock has no GRNI credit for a return or bill to clear (policy :92 lists it as F16). Say "or its landed cost or rate when it has none; that stock has no GRNI entry (known gap)" |
| Index with options 1 and 2 | not in code (schema) | Fine, but it changes no posting and the measured gain is 35-48 ms → 12 ms per post. Offer it under "Hold" too, or as its own yes/no |

- **No posted-amount change in 7955315..efefcbb is missing from the card**: the `gone` flag is item 3's rule; the `CASE` is speed only (R3 equivalent).
- **Owner:** yes (card text). PR #4 should still not merge before the answer. Once answered, record the card and the answer in owner-decisions-pr4.md (item (a), C2, CV).

## F36 — Low: policy and KG-4 leftovers

- Policy §6 :89 says "A reversed return gives its receipts back from the moment it was reversed" with no exception; :91 gives it. Add "(except to a receipt reversed by then; see below)" so :89 cannot be read alone.
- Policy :92 V3: "slows as returns grow" → "slows as the stock ledger grows (every module's rows), now less since 11 Nov 2026 IST".
- R8 (Party Reconciliation date filter) is still only in the policy; put it in the report's own notes.
- KG-4 `postStockReturn.relatedDG1Tables` (:715) is still the old six; add `stock_inwards`, `procurements`, `goods_receipts`, `goods_receipt_items`, `accounts` (they are already in `readsFromTables`). Carried F13.
- KG-4 `knownGaps`: no entry names the supplier-return pool gaps, but `safetyRule` now points to policy §6 and KG4-GAP-002 points to the policy for current postings. Acceptable; a KG4-GAP-007 line would make it findable.
- **Owner:** no (recording); each gap's fix needs the owner.

## F37 — Info: `stat` where `lstat` would also catch a link (for the security auditor)

- **Where:** main.js:590 `const pathStats = fs.statSync(checked);`.
- **Why:** the dev/ino check catches a swap between :590 and the `open` at :591. A file replaced by a link between the `lstat` in `assertInstallerInsideUpdateFolder` (:560) and :590 is followed by both `stat` and `open`, so dev/ino match the link's target. The window has no `await` in it, so only another process could use it, and the update folder is the user's own. `lstatSync` at :590 (plus `O_NOFOLLOW` where available) closes it.
- **Owner:** no.

## F30 — now or after the owner's answer: after

- **Why wait:** (1) The card asks the owner to approve the replay "as built". A refactor of that function while the card is open changes the code under review; it would need the same-amounts proof again and a fresh audit round, for no change the owner sees. (2) Option 1 ("Approve + design table") would record each return's receipts at posting time; the replay then becomes a one-off back-fill for old returns, and the module's shape should follow that design. (3) Under "Approve, keep pool" or "Hold" the module is worth doing exactly as described in the 7955315 report (pure `replayPool` / `takeFromPool`, unit tests on plain arrays, audit2 unchanged).
- **Now, without waiting:** only the no-risk parts: P3 as a test (F33), and removing the dead :468 and tie-break (F34) if the team wants; both change no posting.

## F31 — now or after the owner's answer: now

- **Why now:** the updater has nothing to do with the card (no posting, profitability, GST or schema). It is growing (main.js 1534 → 1559 → 1605 lines; updater about 215 lines at :414-629), and eight of the ten staging survivors in F33 are hard to reach through the Electron IPC harness but easy in a module whose `open`, `statfs` and read stream can be passed in.
- **Shape:** `src/main/services/deployment/updateInstaller.js` with `ensureUpdateFolder`, `findLatestUpdateInstaller`, `newestSetupInFolder`, `assertInstallerInsideUpdateFolder`, `stageInstaller`, `clearInstallerStaging`, taking `updateFolder`, `stagingFolder` and an optional `fsApi`. `main.js` keeps the `updates:*` handlers with their current channel names (no IPC or preload change) and the F32 flag. Test with plain `node --test`.
- **Commit hygiene:** `fa0a19b` is another "WIP" commit on the PR branch; squash on merge if history matters.

## F11 — Low (carried)

- :375-389 and :440-448 unchanged in style. The grouped join from F27 would remove the two remaining correlated subqueries per earlier return; the index makes it mostly moot.

---

## Items for the owner

1. **F35:** before the card is answered, add "unbilled receipts before billed ones" to item 1, "except to a receipt already reversed" to item 3, and the landed-cost fallback (with no GRNI entry) to item 5; offer the `stock_ledger` index under "Hold" too, or as its own yes/no (schema only, no posting change). **PR #4 should not merge before the answer.**
2. The gaps in policy §6 (V2, V4, V5/T7, V6, T5, N2, R8, V3, F16, restore renumbering) stay owner decisions; recording them is done.

Everything else (F32-F34, F36, F37, F31, F11) is code, tests, documentation or KG-4 and needs no owner OK. F30 should wait for the answer.
