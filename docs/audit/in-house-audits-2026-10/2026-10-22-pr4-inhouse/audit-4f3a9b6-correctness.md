# Correctness audit: 64124dc..4f3a9b6

- **Scope:** commit `4f3a9b6` against its parent `64124dc` (PR #4, branch `claude/erp-full-automation-qbhv8k`). It answers `audit-64124dc-correctness.md` (D1-D6).
- **Claimed fixes checked:** D1 (use the staging folder where it is when it cannot be renamed), D2 (sweep `update-staging.old-*`), D3 (real-path, case-insensitive side check), D4 (tests), D5 (backup advice by error code), D6 (KG-4 zero-value note). Also the new `removeStagingTree`, the dev/ino/size check before the re-hash, and the KG-4 text for stock inward and stock adjustment.
- **Method:** a read-only worktree at `4f3a9b6` with `node_modules` symlinked; nothing committed, pushed or installed. A throw-away probe script (5 probes) ran against the worktree's `updateInstaller.js`, and 12 source mutations ran against `ipc-security.test.mjs`, each reverted with `git checkout` (status clean after each). The worktree, the symlink and the probe temp folders have been removed; the main checkout's status is clean.
- **Proportion:** the architecture auditor judged the updater at diminishing returns. Anything that needs a race is ranked Info.
- **Written:** 11 Nov 2026, 08:40 IST.

## Summary

The commit fixes what it says it fixes, with one partial fix and one KG-4 gap:

- **D1 is fixed.** When `rename` fails with `EPERM`/`EACCES`/`EBUSY` and the folder is a real directory, the folder is used where it is. Old `install-*` folders are cleared where possible. **The post-`mkdtemp` check is kept on this path:** a link swapped in during an in-place install is refused, and nothing is made in the outside folder (probe Q2b).
- **D2 is fixed.** Moved-aside folders are swept at start-up and before each staging.
- **D3 is partly fixed.** Letter case and symlinks/junctions are now handled. Mapped and `subst` drive letters still give the wrong advice (E2, Info).
- **D5 is fixed.** Full disk and locked folder now get their own backup advice.
- **D6 is fixed** for the department return.
- **`removeStagingTree` never blocks a later install.** Anything it leaves is either moved aside under a random name or skipped by the in-place path, and each install gets a fresh `mkdtemp` folder (probes Q1, Q2, Q4). A `Zone.Identifier` mark is not a leftover: on NTFS it is a stream of the `.exe`, `readdir` never lists it, and deleting the `.exe` deletes it. A partial write is the `.exe` copy itself, so it is removed. What can be left is limited to disk space (E3, E4).
- **The new KG-4 posting text is accurate** against `inventoryService.js`. But two older entries for the goods receipt still say it creates no voucher, and the ERP assistant reads this file (E1, Low).
- `npm run -s test:integrity`: **pass**, 222/222 and 47/47 (`ipc-security`), 69 s.

## Commands and results

| Check | Result |
|---|---|
| `npm run -s test:integrity` | **Pass.** 222/222 + 47/47, 69 s |
| `node scripts/verify-voucher-accounting-graph.js` | Pass |
| Q1: `a.exe` in the update folder is a symlink to `b.bin` in the same folder | Accepted. The copy is staged as **`b.bin`**. After a failed launch `removeStagingTree` leaves it. The start-up clear moves nothing; the next install moves it aside and it stays in `update-staging.old-*` for good. Later installs still work (E3) |
| Q2: `rename` fails `EPERM`; staging holds `Thumbs.db` and `install-old/` with `S.exe` and `held.tmp` | Install succeeds in place. `install-old/S.exe` removed. `held.tmp`, `install-old/` and `Thumbs.db` left. Not blocking |
| Q2b: same, but the staging folder is swapped for a link to an outside folder just before `mkdtemp` | Refused: "update-staging folder changed". The outside folder is empty. **Post-`mkdtemp` check holds on the in-place path** |
| Q3: a user file `update-staging.old-notes.txt` (a file, not a folder) in the data root | **Deleted** by the start-up sweep (E4) |
| Q4: a FIFO named `S.exe` inside `update-staging/install-x/` | Two installs in a row succeed. After the start-up clear, one `update-staging.old-<hex>` (holding the FIFO) remains; the sweep cannot remove it |
| Q5: `hashFile` with the copy's dev/ino/size | Same file: hash matches. A file deleted and rewritten with the same bytes got the same inode on this filesystem and was accepted. Harmless: the content hash is the real check |

### Mutation runs (against `ipc-security.test.mjs`)

| Id | Mutation | Result |
|---|---|---|
| M1 | In-place fallback removed | Killed ("a staging folder that cannot be moved") |
| M2 | Sweep before staging removed | Killed (same test) |
| M2b | Sweep at start-up removed | **Survives** |
| M3 | `removeStagingTree` replaced by a recursive `rmSync` (the old behaviour) | **Survives** (E5) |
| M4 | dev/ino/size check in `hashFile` removed | **Survives** (the FIFO test returns at `isFile()` first) |
| M5 | Side check back to the unresolved prefix compare (old D3) | **Survives** |
| M6 | Post-`mkdtemp` `dirname(realDir) !== expected` removed | Survives alone; the `lstat(expected).isDirectory()` check still refuses (as R5a/R5b last round) |
| M7 | In-place clearing of old `install-*` folders removed | **Survives** |
| M8 | Backup advice: full-disk branch off | **Survives** |
| M9 | Backup advice: locked branch off | **Survives** |
| M10 | In-place accepted without the `isDirectory()` check | Survives; the post-`mkdtemp` check refuses a link anyway |
| M11 | Any file (not only `.exe`) removed at depth 1 | Survives (expected: this widens, not narrows) |

## Findings, ranked

| # | Severity | Where | Finding |
|---|---|---|---|
| **E1** | **Low** | voucher-accounting-graph.json:676-681, :1442-1447 | Two older goods-receipt entries still say "no accounting voucher" |
| E5 | Low (tests) | ipc-security.test.mjs | The "only installer copies" property, the D3/D5 fixes, the start-up sweep and the dev/ino check are untested |
| E2 | Info | updateInstaller.js:104-110 | Mapped or `subst` drive letters still get the wrong "which side" advice |
| E3 | Info | updateInstaller.js:84, :221 | A copy whose real name is not `.exe` is never removed |
| E4 | Info | updateInstaller.js:94-101, :70-72 | The sweep matches by prefix and deletes any non-folder with that prefix |
| E6 | Info (race) | updateInstaller.js:69-75, :136-141 | `removeStagingTree` is path-based: a folder swapped for a link between `lstat` and `readdir` is walked |

### E1 (Low): the knowledge graph still contradicts itself on the goods receipt

- **What is right.** The new text matches the code:
  - `postStockInward` (inventoryService.js:222-233) posts a Journal: Inventory Dr, Goods Received Not Invoiced Cr, or Purchase Cr when the purchase bill was posted first (`billedFirst`), and no voucher when the rounded value is zero.
  - `postStockAdjustment` (:309-330) posts Inventory Dr / Inventory Adjustment Gain Cr for an increase, Inventory Adjustment Loss Dr / Inventory Cr for a decrease, and no voucher at zero value. Approval is required (:294).
  - The department-return note (no voucher at nil value) matches :510.
- **What is still wrong.** The commit updated the `postStockInward` operation's tables and accounts (:666-675) and the summary row (:1046-1050), but left these in the same file:
  - :681 `safetyRule`: "No accounting voucher created (valuation impact tracked via weighted average cost)".
  - :676-678: `transactionBoundary` leaves out the voucher, `auditImpact: false` (the function writes `stock_inward_posted` to `audit_log`), `reportImpact: null` (it now moves Inventory and GRNI on the trial balance and balance sheet). :679 `relatedDG1Tables` lacks `vouchers`/`voucher_lines`/`ledger_entries`. `writesToTables` omits `stock_reservations`/`supply_orders`, which `autoReserveOrderStock` updates when the inward has an order.
  - :1442-1447: the `GOODS_RECEIPT_GRN` stage says `accountingImpact: "inventory_only"`, `createsAccountingImpact: false`, "no accounting voucher", and `relatedVoucherTypes: []`.
- **Why it matters.** The ERP assistant uses this file as "Accounting guidance" (answerContractBuilder.js:113 reads `createsAccountingImpact`). A user asking what a GRN posts can be told "nothing", which would mislead a reconciliation of GRNI. The verifier script passes, so it does not catch this.
- **Fix:** make :676-681 match the adjustment entry (:684-698): boundary "stock ledger + serial/batch + Journal voucher + status update", `auditImpact: true`, report impact Trial Balance / Balance Sheet / Stock Summary, the voucher tables in `relatedDG1Tables`, and a safety rule such as "Journal only when the rounded value is above zero; Purchase Cr instead of GRNI when the bill was posted first; auto-reserves stock if order_id present". Set the stage at :1442-1447 to create an accounting impact, with `relatedVoucherTypes: ["Journal"]`.

### E5 (Low, tests): several fixes in this commit are not guarded

Correct today (by reading and the probes), but nothing fails if they regress:

| Survivor | Test that would kill it |
|---|---|
| M3 (recursive delete) | The "removes only installer copies" test plants only links and `.exe` files, and `rmSync` does not follow links either. Plant a regular `notes.txt` inside `update-staging/install-real/` and assert it is still there afterwards (in the moved-aside folder) |
| M2b | Create `update-staging.old-<16 hex>/install-x/a.exe`, call `clearInstallerStaging(root)` directly, and assert the folder is gone |
| M4 | After staging, replace the copy with a regular file of the same bytes but a different size (append one byte), or keep the old copy open and swap a new inode in. Assert "changed before it could start" |
| M5 | Pass the data root as a symlink (or, on win32, in a different letter case) and make the copy fail `EACCES`. Assert `side: "data-folder"` (probe P7 from the last round) |
| M7 | In the in-place test, put `install-old/old.exe` in staging first, and assert it is gone afterwards |
| M8 / M9 | Make `createLiveBackup` fail with `ENOSPC` and with `EBUSY` (the backup test already makes one fail with `ENOTDIR`). Assert the matching advice |

### E2 (Info): mapped and `subst` drives still get the wrong side

- **The cause.** `ensureStagingFolder` uses `fs.promises.realpath` (:116, :154), which is the native realpath: on Windows it turns a mapped drive `Z:\` into `\\server\share\…` and a `subst` drive into its real folder. Copy errors therefore carry that path. `isInsideStaging` uses `fs.realpathSync` (:107), the JavaScript version, which only resolves links and keeps the drive letter. Neither of its two candidates matches the error path.
- **The effect.** On a data folder on a mapped drive, a locked staging write is reported as "the installer in the update folder is locked" with `side: "update-folder"`. Message and audit detail only.
- **Fix:** use `fs.realpathSync.native` at :107, or better, pass `expected` (or `path.dirname(stagingDir)`) from `ensureStagingFolder` into the catch and compare against that.

### E3 (Info): a copy that is not named `.exe` is left for good

- **The cause.** `assertInstallerInsideUpdateFolder` checks that the *chosen* name ends in `.exe` (:22), but the copy is named after the *real* path (`path.basename(checked)`, :221). A symlink `a.exe` → `b.bin` inside the update folder passes, and the copy is `b.bin` (probe Q1). `removeStagingTree` only removes `.exe` files (:84), so the copy stays. It moves into `update-staging.old-*` at the next install and the sweep never removes it. The old recursive delete did remove it.
- **Impact.** Disk space, up to 1 GB per attempt. Making such a link on Windows needs admin rights or Developer Mode. Later installs are not blocked. A FIFO (Q4) or other odd entry in the staging folder behaves the same way.
- **Fix:** name the copy from the checked `.exe` name (`path.basename(resolvedInstaller)`), or refuse when `realInstaller` does not end in `.exe`. Either keeps the copy inside what `removeStagingTree` removes.

### E4 (Info): the sweep is broader than its comment

- `sweepMovedStaging` (:97) matches any name that starts with `update-staging.old-`, and `removeStagingTree` unlinks any non-folder it is given (:70-72). A user file named, say, `update-staging.old-notes.txt` in the data root is deleted at start-up (probe Q3). Unlikely in practice.
- Moved-aside folders that hold an unexpected item (`Thumbs.db`, `desktop.ini`, a FIFO) are swept at every start and every install but never removed, with a warning each time.
- **Fix:** match `/^update-staging\.old-[0-9a-f]{16}$/` (the exact form made at :119), as suggested in D2.

### E6 (Info, race only): the tree removal is path-based

`removeStagingTree` checks `lstat(folder)` and then reads and deletes by path. A folder swapped for a link between the two (and the in-place `readdir(expected)` at :138) is walked, and `install-*/*.exe` files behind the link can be deleted. It is limited to `.exe` files in `install-*` folders and needs a local process racing the updater, so no fix is needed. If it is ever touched, `rename` each folder to a random name before walking it, as `ensureStagingFolder` already does for the top level.

## Status of the claimed fixes

| Item | Status | Evidence |
|---|---|---|
| D1 in-place fallback | **Fixed** | updateInstaller.js:120-150. Q2 works; Q2b shows the post-`mkdtemp` check (:153-159) still refuses a link. Tested (M1 killed) |
| D2 sweep of `update-staging.old-*` | **Fixed** | :58-61, :94-101, :118. Start-up sweep untested (M2b). Prefix match is broad (E4) |
| D3 side check | **Partly fixed** | :104-110 handles case and links; mapped and `subst` drives still wrong (E2). Untested (M5) |
| D4 tests | **Partly fixed** | New tests kill M1/M2 and cover C5, C1a, R4 (made-meanwhile) and the FIFO case. E5 lists the rest |
| D5 backup advice | **Fixed** | main.js:1322-1327. Untested (M8, M9) |
| D6 department return note | **Fixed** | voucher-accounting-graph.json:1072 matches inventoryService.js:510 |
| `removeStagingTree` | **Correct; never blocks an install** | :67-91. Leaves only non-`.exe` items (E3, E4). `Zone.Identifier` streams go with the `.exe`. Untested as distinct from a recursive delete (M3) |
| dev/ino/size check before re-hash | **Correct** | :170-183, values from `lstatSync(…, {bigint: true})` at :246, compared as BigInt. Defence in depth only, the hash decides. Untested (M4) |
| KG-4 stock inward / adjustment text | **Accurate, but incomplete** | :1046-1050 and :1062-1066 match inventoryService.js:189-240 and :291-336. Older inward entries contradict it (E1) |

Nothing in this commit touches postings, GST, profitability or the schema.
