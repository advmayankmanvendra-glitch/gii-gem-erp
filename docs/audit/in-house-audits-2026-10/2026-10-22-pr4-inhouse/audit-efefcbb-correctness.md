# Correctness audit: 7955315..efefcbb

- Branch: `claude/erp-full-automation-qbhv8k`. Audited head `efefcbb` (also covers fa0a19b). Written 2026-11-11 06:40 IST.
- Scope: fa0a19b and efefcbb, which answer `audit-7955315-correctness.md` (Y1 to Y7, X2′, Z1 to Z3).
  - inventoryService.js: a drop event now marks the reversed receipt `gone` (463), and a later give-back skips gone lots (464). The `reversal_sl_id` subquery runs only for receipts whose status is 'Reversed' (380).
  - main.js `stageInstaller` (570-629): an in-flight flag; `rm` and `mkdir` of `update-staging`; the path check and an immediate `open`; `fstat` checks (regular file, same dev/ino as the checked path, `nlink` 1, 1 GB at most); a free-space check; a streamed copy from the handle with a byte counter and a size-match check; a Zone.Identifier copy on Windows; the partial copy deleted on error; error mapping (623). `clearInstallerStaging` runs at start-up (265).
- Method:
  - Scratch clone `/tmp/claude-0/corr-372` at efefcbb (copied node_modules kept). The two repositories were not touched.
  - I re-ran Q1-Q8, P1-P11, S1-S8, U1-U7, W1-W7 with W5b, and Y1-Y7.
  - New replay probes G1 to G4 are in `scripts/audit/probe-efe.test.mjs` (scratch clone only).
  - The staging harness copies main.js:538-629 verbatim into a Node module (scratchpad `stage/staged.mjs`, `h.mjs`, `h3b.mjs`).
  - Timing: `prof4.mjs` at N=1000, each run under `timeout 900`.
- Tests at efefcbb:
  - `npm run -s test:integrity` passes: 221 + 28 tests, 0 failures.
  - All probe sets pass: Q 8/8, P 11/11, S 8/8, U 7/7, W 8/8, Y 7/7, G 4/4.
  - The new regression test (audit2-regressions.test.mjs:1285) does reach its asserts (G3). With line 464's guard removed in scratch, it fails: "receipt Y is not returned twice (Trade Payables 500)". It does guard Y2.

## Summary

Y2 is fixed. The replay hunt found no new problem. G1 to G4 cover a split take over a gone lot and a live lot, a re-receipt after a reversal, an order-scoped case, and the commit's own test shape. All four give the expected receipts.

X2′ is mostly fixed. Timings are back at about the 8d5dd67 level. The index is still missing.

Z1 is only partly fixed. The flag serialises the copy, but it is cleared before the backup and launch. A second Install click during the backup still overwrites the file that the first call then launches. This is reproduced below as AA1.

The other new points are Low or Info.

| # | Severity | Where | One line |
|---|---|---|---|
| AA1 | **Low** (rest of Z1) | main.js:627 with 1362-1365 | The flag is released when staging ends, not after launch. A second click during `createLiveBackup` restages. The first call then launches B's file (full or half-written). Reproduced: size at launch was 53.9 MB of 600 MB. |
| AA2 | Low | main.js:623 | Error mapping keeps only `error.code`. The journal records only the mapped text, so the path and the syscall are lost. Its advice ("check free disk space and the update folder") is wrong for EPERM, EBUSY or ENOTDIR on the staging folder. The `/installer/` regex also lets raw Node messages through whenever a path contains "installer". |
| AA3 | Info | main.js:618 | Copying Zone.Identifier with `copyFileSync` on an ADS path has not been tested on Windows, and any failure is silent. |
| AA4 | Info | main.js:579-627, 265 | The flag can only stay stuck if the copy never settles (a hung network share). The start-up cleanup is safe on Windows. |
| Z3 | Info | inventoryService.js:402 | Unchanged: a 'Reversed' receipt with no `REV-IN` row leaves the pool. |

## Prior findings (7955315 round)

| # | Status | Evidence |
|---|---|---|
| Y2 give-back after a drop | **Fixed** | Y2 is now 0/0/0 with C posting TP Dr 3000 (7955315: TP −1000, PPV +1000). The fix is the one recommended (a `gone` flag in place of `reversedAt < at`; same effect). The committed test fails without the guard. W5b, Y1 and Y3 to Y7 are unchanged and balance. |
| X2′ subquery for every lot | **Fixed** (subquery); **index still open** | `CASE WHEN si.posting_status = 'Reversed'` at line 380. See the timing table. |
| X2 / V3 no `stock_ledger (source_module, source_id)` index | Open | With the index, a post takes 21 to 37 ms; without it, 123 to 246 ms. |
| Z1 two installs share one staging file | **Partly fixed** | Two calls during the copy are refused ("An update is already being prepared", H1). The backup and launch window is still open: see AA1. The Install button is still enabled during the call (SettingsScreen.jsx:108-129). |
| Z2 staging leftovers, size cap | **Fixed** | Cleared at start-up. The byte counter caps the stream at 1 GB. `copied !== stats.size` refuses a file that is still growing. The partial copy is deleted on error. |
| Z3 'Reversed' receipt with no `REV-IN` row | Open (Info) | Unchanged. |
| X3, X4, V2, V5/T7, V6, T5, R6, R8, N2 | Open (known gaps) | U2, U3, U4, U6, S7, P6, P7 and W4 give the same numbers as at 7955315 and 8d5dd67. |
| V7(a), V7(b) | Accepted | Unchanged. |

## Questions from the brief, answered

### The `gone` flag with later re-receipts

- A receipt cannot be posted again once it is reversed. `ensureStockNotPosted` (inventoryService.js:126-130) refuses 'Reversed'. A re-receipt is therefore always a new `stock_inwards` row and a new lot object.
- `gone` lives on that call's lot objects only. The lots are rebuilt on every `supplierReturnSplit` call, so the flag cannot leak to the new lot or to a later call.
- **G2.** Steps: L1 is received; return A takes L1; L1 is reversed; L1′ is received with the same invoice and date; A is reversed. B then takes L1′ (GRNI Dr 1000), and C falls past the receipts.
  - Pool: L1′ 10. Supplier 1's net physical stock: 10.
  - Correct.

### The drop at equal ids

- This is still impossible.
  - A drop's `at` is the receipt's own reversal row (`MAX(r.id) > sl.id`; line 402 filters the rest).
  - A take's `at` is a return's first row, and a give's `at` is a return's last row.
  - All of these are distinct `stock_ledger` ids.
- Gating the subquery behind `CASE` changes nothing here. A non-reversed lot never has a drop.
- A give before a drop (W5b, Y4) adds the units, and the drop then zeroes them. A give after a drop (Y2) is now skipped.

### Split takes

- **G1.** Return A of 15 takes L1 10 and L2 5. L1 is reversed, then A is reversed.
  - Only L2's 5 units come back. B then posts TP Dr 2000 (L2), and C falls past the receipts.
  - Supplier 1's net physical stock is L2's 10, so this is correct.
- **G4** (order-scoped) behaves the same way: B posts GRNI Dr 1500 from L2.

### Is skipping the give-back right, and not just consistent?

- Yes, under the C2 pool reading.
  - Reversing L1 removes 10 more units, even though A had already returned 10 of them. That is the V5/T7 double removal: the units that physically leave are another lot's.
  - Reversing A brings back units that belong to no receipt.
  - Not giving them to L1 keeps the pool equal to supplier stock.
- The open design question is still the V5/T7 one (see below).

### Probe output at efefcbb

```
Y1 0/0/0 A TP+1000 | B TP+1000
Y2 0/0/0 C TP+3000                  (7955315: TP-1000 PPV+1000, C TP+2000 PPV+1000)
Y3 0/0/0   Y4 0/0/0   Y5 0/0/0 C TP+3000   Y6 0/0/0   Y7 0/0/0
W1-W7 as 7955315; W4 GRNI+1000 TP-2000 PPV+1000 (X4); W5b 0/0/0 C TP+3000
U2 GRNI+1000 Pur-1000; U3 TP-1000 Pur+1000; U4 GRNI-500 PPV+500; U6 GRNI+600 TP-600
S7 GRNI-1000 TP+400; P7 GRNI-1000 TP+400; S8 N=200 bulk 1.9 s, next return 10 ms
G1 B TP+2000 (L2), C past receipts   G2 B GRNI+1000 (L1')   G3 reaches asserts   G4 B GRNI+1500 (L2)
```

In G1, G2 and G4 the end-of-run TP and PPV are not zero. That comes from C, which by design returns another supplier's stock past the receipts, at the average cost. GRNI ends at 0 in all three.

### Timing at 1000 lots and 1000 returns

`prof4.mjs`, one item. Each run was under `timeout 900`. The first three runs shared the machine with the probe runs; the last row was run alone.

| Case | Bulk load | Next post | Next post with index |
|---|---|---|---|
| efefcbb, no reversals | 63.6 s | 123 to 147 ms | 21 to 37 ms |
| efefcbb, every 2nd return reversed | 82.2 s | 163 to 213 ms | 30 to 32 ms |
| efefcbb, every 2nd return and every 4th receipt reversed | 84.8 s | 207 to 246 ms | 28 to 37 ms |
| same, run alone | 86.1 s | 178 to 237 ms | 23 to 29 ms |
| 7955315 (last report), every 2nd return and every 4th receipt reversed | 152.2 to 153.6 s | 248 to 329 ms | 22 to 38 ms |
| 8d5dd67 (last report), same | 81.6 s | 170 to 200 ms | 23 to 27 ms |

The bulk load is back to the 8d5dd67 level. A post is still about 7 times slower than with the index.

### Staging

- **Flag stuck after an exception.** No. The flag is checked and set synchronously before `try`, and `finally` (627) clears it on every path.
  - H2: a hard-linked file is refused, and the next call then stages correctly. H5: after a missing-file error and an ENOTDIR error, the next call succeeds.
  - It only stays set if the stream never settles (AA4).
- **Error mapping hiding real messages.** Partly. See AA2.
  - Own messages pass through: H2, H4a ("Update installer file was not found…"), "changed size", "grew".
  - Node errors are reduced to their code, with advice about disk space.
- **Start-up cleanup deleting an installer that is still running on Windows.**
  - Not possible for a running installer. Windows refuses to delete the image of a running process (ERROR_ACCESS_DENIED). Node's `rmSync` throws EPERM or EBUSY after its chmod retry, and `clearInstallerStaging` swallows the error.
  - The cleanup runs only in the instance that holds the single-instance lock (main.js:1567-1579).
  - The installer is assisted NSIS, per-user (`oneClick: false`, `perMachine: false`). "Run after finish" starts the ERP while the installer process is still alive. The copy therefore usually survives that first start and is removed on the start after it. This is harmless.
  - Only if `shell.openPath` had returned before Windows mapped the image (for example during a UAC prompt for a per-machine directory) could a fast relaunch delete it. I could not test this on Linux. A safer rule is in AA4.

---

## AA1 (Low, the rest of Z1): the flag is released before the backup and launch

- **Where:** main.js:627 clears `installerStaging` when `stageInstaller` returns. The handler then runs `createLiveBackup` (1364, which does a WAL checkpoint and the SQLite backup API, taking seconds on a large book) and `shell.openPath(staged.stagedPath)` (1365).
  - A second Install click in that window passes the flag check.
  - At 581 it runs `rm` on `update-staging`, which deletes A's staged file.
  - It then recreates the same `update-staging/<name>` with `wx` and copies into it.
  - The Install button is still enabled while the call runs.
- **Reproduced** with the function copied verbatim:
  - **H3.** A stages a 300 MB file (sha OK). A 3 s "backup" follows. B is clicked 500 ms in, after a newer file was dropped into the update folder.
    - At A's launch, A's `stagedPath` holds B's file: "at launch DIFFERS".
    - A's audit row would record a SHA-256 that does not match what it launched.
  - **H3b.** A has staged 600 MB. B starts, and A's launch comes 150 ms later. The file at A's path is **53.9 MB of 600 MB**, which is a half-written installer. B's handler then also backs up and launches a second installer.
- **Fix:**
  - Hold one module-level flag across the whole `updates:install` handler, from before `stageInstaller` until `openPath` returns. On success, leave it set, because the app quits 1.5 s later.
  - Disable the Install button while `apiClient.installUpdate` is pending.
  - Or stage into a unique `mkdtemp` folder and have only the start-up cleanup remove old ones. Per-call `rm` of the shared parent would still delete A's folder, so that `rm` must go.
  - None of this changes posting.

## AA2 (Low): error mapping drops the real cause

- **Where:** main.js:622-624. Any error that is not `guided` and whose message does not match `/not started|already being prepared|update folder|installer/` is rewritten to "The update could not be prepared (CODE). Check free disk space and the update folder…".
  - `handle()` (896-907) journals the rewritten message only. The original message (path, syscall) is never recorded.
- **Reproduced (H4b):** the data root is not writable as a folder. The user sees "(ENOTDIR). Check free disk space and the update folder", although the problem is in the app's data folder, not in the update folder or the disk.
  - The same happens for EPERM or EBUSY on `update-staging` (antivirus holding the old copy), and for EACCES on opening the source.
- **The regex is also too broad.** `/installer/` matches any raw Node message whose path contains the lowercase word "installer", for example an update folder set through `GII_GEM_ERP_UPDATE_DIR=D:\erp-installer`. Those messages pass through unguided.
- **Fix:**
  - Mark the function's own errors with `guided: true` (several already read "not started"), and pass through only those.
  - Before rewriting, write `error.message` and `error.code` to `safeMainLog` or `recordError`.
  - Name the folder in the guided text: "the app's data folder (…\update-staging)" for errors after `mkdir`, and "the update folder" for errors on the source.

## AA3 (Info): Zone.Identifier copy is untested

- **Where:** main.js:618. `fs.copyFileSync("<file>:Zone.Identifier", "<staged>:Zone.Identifier")` goes through libuv `CopyFileW`. I could not run this on Windows here.
- Copying one named stream to another named stream with `CopyFileW` is not something I can confirm works, and the `catch` treats every failure as "the file had no mark". If it always fails, Mark-of-the-Web is silently never kept. That is the security auditor's concern, not a books problem.
- **Fix:** use `fs.writeFileSync(staged + ":Zone.Identifier", fs.readFileSync(checked + ":Zone.Identifier"))` (CreateFileW works with ADS paths). Ignore only ENOENT, and log any other failure. A Windows CI test with a marked file would settle it.

## AA4 (Info): stuck flag and start-up cleanup

- **Stuck flag.** If the stream from a stalled network or USB update folder never ends, `finally` never runs. Every later click then says "already being prepared" until the app restarts. A stall timeout on the stream (no data for 60 s → destroy with a guided error) would end it.
- **Start-up cleanup.** It is safe for a running installer (see above). To be safe even for a launch that has not started yet:
  - delete only staged files older than about 10 minutes, or
  - delete only staged files whose version (parsed from the name) is not newer than `app.getVersion()`, meaning the update has landed.

## Owner decisions this report needs

- **None for Y2.** The posting fix is in (the re-issued card covers it), and it only restores the 8d5dd67 result for that shape.
- **X2/V3 index:** this is still the cheapest remaining win (about 7 times faster per post) and changes no posting. It needs no decision.
- **Design question, still open (V5/T7).** The `gone` rule makes the pool consistent with "a reversed receipt keeps the returns made while it stood". The reversal still removes the full receipt quantity, so the books gap remains: S7 GRNI −1000 / TP +400, U6 GRNI +600 / TP −600. The units then leave as another lot's stock (G1, G3).
  - The choices are unchanged: refuse a receipt reversal while unreversed returns used that receipt, or post the difference.
  - A stored per-return allocation would settle this, V2 and X3, and would remove the replay.
- AA1 to AA4 are main.js or renderer only and need no posting decision. AA1 should be fixed before release.
