# Correctness audit: 8d5dd67..7955315

- Branch: `claude/erp-full-automation-qbhv8k`. Audited head `7955315` (also covers f0aed14). Written 2026-11-11 06:21 IST.
- Scope: f0aed14 and 7955315, which answer `audit-8d5dd67-correctness.md` (X1 to X6).
  - Posting change in `supplierReturnSplit` (inventoryService.js:367-475). Reversed receipts are now loaded with their `REV-IN` row id (380, 398). A reversed receipt with no reversal row is filtered out (402). Each reversed receipt adds a "drop" event at that row, which sets the lot's remaining units to 0 (458, 461). After the replay every reversed lot is set to 0 again (466). Earlier returns are read `ORDER BY sr.id` (447).
  - main.js: `stageInstaller` (568-583) streams the installer into `runtimeDataRoot/update-staging`, hashes it while copying, refuses anything over 1 GB, and the copy is what `updates:install` launches (1316-1319). `findLatestUpdateInstaller` now requires `latest.json`'s file to be a regular file (466-470).
- Method:
  - Scratch clone `/tmp/claude-0/corr-372` at 7955315 (node_modules kept). A worktree at 8d5dd67 (`/tmp/claude-0/corr-8d5w`, node_modules linked to the clone's) was used to tell regressions apart.
  - I re-ran Q1 to Q8 (`probe-prev`), P1 to P11 (`probe-66b`), S1 to S8 (`probe-f92`), U1 to U7 (`probe-372`) and W1 to W7 plus W5b (`probe-8d5`).
  - New probes Y1 to Y7 are in `scripts/audit/probe-795.test.mjs` (scratch clone only). Each was run at both commits.
  - Timing script: `scripts/audit/prof4.mjs` (N=1000 lots and 1000 returns; with and without return and receipt reversals), each run under `timeout 900`.
  - The two repositories were not touched.
- Tests at 7955315: `npm run -s test:integrity` passes (220 + 27, 0 fail). All earlier probe sets ran (Q 8/8, P 11/11, S 8/8, U 7/7, W 8/8).

## Summary

X1, X5 and X6 are fixed. W5b now balances, and the same shape through a guided voucher (Y5) or through `reverseVoucher` on the GRN journal (Y6) balances too. Both were wrong at 8d5dd67.

The drop events add one new **regression**: a return that took a receipt's units and is reversed *after* that receipt was reversed gives the units back to the dropped lot (Y2). The final reset at line 466 hides this from the return being posted. It does not hide it from earlier returns that are replayed after the give-back. Those returns take the restored units, and a later return posts against the wrong lot. Y2 balanced at 8d5dd67. A one-line fix was verified.

The extra correlated subquery makes V3/X2 worse: about 100 ms more per post at N=1000 with no index.

| # | Severity | Regression? | Where | One line |
|---|---|---|---|---|
| Y2 | **Medium** | **Yes** (correct at 8d5dd67) | inventoryService.js:462 (with 466) | A give-back after a drop puts units back into a reversed receipt. Y2: TP stuck **−1000**, PPV **+1000**; the last return posts TP 2000 instead of 3000. |
| X2′ | Low (performance) | Worse than 8d5dd67 | inventoryService.js:380 | `reversal_sl_id` runs for every lot, not only reversed ones, and `stock_ledger` has no index. At N=1000 a post now takes 216 to 329 ms (8d5dd67: 170 to 200 ms in the same session). Bulk load went from 81.6 s to 152 s. With the `(source_module, source_id)` index both take 21 to 38 ms. |
| Z1 | Low | New code | main.js:575-582 | Two `updates:install` calls running at once share one staging path. The second `rm` deletes the first copy while it is being written. Reproduced: call A returns "ok" with the right hash, but its path then holds B's half-written file (241 of 300 MB). |
| Z2 | Info | New code | main.js:569-583 | The staged copy (100 to 200 MB) is deleted only by the next install, so it stays in the user's data folder. The 1 GB cap is checked on `stat`, and the stream does not enforce it. |
| Z3 | Info | New | inventoryService.js:402 | A receipt marked 'Reversed' with no `REV-IN` row is left out of the pool, although its units are still in stock. This is the receipt-side twin of X4. Only a direct data edit can produce it. |

## Prior findings (8d5dd67 round)

| # | Status | Evidence |
|---|---|---|
| X1 reversed receipt missing from the replay | **Fixed** | W5b is now 0/0/0 with C posting TP Dr 3000 (8d5dd67: TP −1000, PPV +1000). Y5 (guided-voucher GRN reversed through `reverseVoucher`) and Y6 (GRN journal reversed through `reverseVoucher`) are 0/0/0; both were TP −1000 / PPV +1000 at 8d5dd67. The new test at audit2-regressions.test.mjs:1261 covers W5b. See **Y2** for the gap that is left. |
| X2 / V3 no index on `stock_ledger` | **Open, worse** | See X2′. No index was added. |
| X3 / V4 voucher-less return replays "as of now" | Open (documented as a known gap) | W2 and U4 unchanged. |
| X4 'Reversed' return with only its posting row | Open (Info) | W4 unchanged: GRNI +1000, TP −2000, PPV +1000. Z3 is the same for receipts. |
| X5 installer fingerprint read synchronously | **Fixed** | Streamed hash while copying, with a 1 GB cap and a clear message. The copy is what runs, so the time-of-check window is gone. See Z1 and Z2. |
| X6 `latest.json` installer skips the file-only filter | **Fixed** | `lstatSync(...).isFile()` at main.js:467. A folder named in `latest.json` now falls back to `folderBest`. The new ipc-security test covers the folder scan. |
| V2, V5/T7, V6, T5, R6, R8, N2 | Open (now listed as known gaps in fsr-2a4) | U2, S7, U6, U3, S4, P6 and P7 give the same numbers as at 8d5dd67. |
| V7(a), V7(b) | Accepted | Q6 and P3/P4 unchanged. |

## Questions from the brief, answered

- **A receipt reversed before any return (Y1).**
  - Setup: L1 10 @ 100, unbilled. L2 10 @ 200, billed. L1 is reversed. Returns A (5) and B (5) follow.
  - A and B each post TP Dr 1000. End: 0/0/0. The drop runs before any take, and the reset at 466 also covers it.
- **A reversed receipt whose returns were also reversed.**
  - **Return reversed first, then the receipt** (W5b; Y4 with a partial take of 6): balanced. The give-back runs before the drop, and the drop then zeroes what is left.
  - **Receipt reversed first, then the return (Y2): wrong.** See Y2. The give-back lands on a lot that is already dropped.
- **Guided-voucher GRN receipts reversed through `reverseVoucher` (Y5).**
  - `reverseGuidedVoucherStock` → `reverseSourceDocumentStock` → `mirrorStockForSource` writes `REV-IN-<id>` under `source_module = 'stock_inwards'` and sets the receipt to 'Reversed'. The lot query therefore finds the drop row.
  - Y5 (W5b with the guided receipt as L1): C posts TP Dr 3000 and the end is 0/0/0.
  - Reversing the GRN journal of a plain receipt through `reverseVoucher` (Y6) goes through `mirrorStockForSource` at accountingService.js:576-579 and also balances.
- **A free receipt that posted no voucher, then reversed (Y7).** `reverseStockDocument` mirrors the stock without a voucher. The `REV-IN` row exists, the drop is found, and the end is 0/0/0.
- **Ordering ties between drop, give and take at equal ids.**
  - Each event's `at` is a distinct `stock_ledger.id`: a return's first row, a return's last row, or a receipt's last row.
  - A drop can never share an id with a give or a take. Its `reversedAt` is always larger than the lot's own row, because the subquery requires `r.id > sl.id` and line 402 filters out the rest.
  - The only possible tie is `at = 0`. That needs a posted return with no `stock_ledger` row (legacy or imported data). Such a take sees no lot, because `lot.slId >= 0`, and `ORDER BY sr.id` with a stable sort keeps the order fixed.
  - The tie-break `give` after `take` therefore never decides anything in practice. The ordering question that does matter is give *after* drop at different ids, which is Y2.
- **Timing at 1000 lots and 1000 returns** (`prof4.mjs`, one item; every run under `timeout 900`; same session):

  | Case | Bulk load | Next post | Next post with index |
  |---|---|---|---|
  | 7955315, no reversals | 125.9 s | 216 to 252 ms | 21 to 24 ms |
  | 7955315, every 2nd return reversed | 152.3 s | 270 to 292 ms | 23 to 32 ms |
  | 7955315, every 2nd return and every 4th receipt reversed (2 runs) | 152.2 to 153.6 s | 248 to 329 ms | 22 to 38 ms |
  | 8d5dd67, every 2nd return and every 4th receipt reversed | 81.6 s | 170 to 200 ms | 23 to 27 ms |

  - The JS replay is still cheap. The extra 100 ms comes from the per-lot `reversal_sl_id` subquery (X2′).
  - S8 (N=200): bulk 2.3 s, next return 12 ms.

---

## Y2 (Medium, regression): a give-back after a drop puts units back into a reversed receipt

- **Where:** inventoryService.js:462. `give` adds `units` to every lot in `entry.used`, including a lot whose drop event (461) already ran. Line 466 sets reversed lots to 0 only after the whole replay. Any earlier return replayed between the give-back and the end can take the restored units.
- **Reproduction (Y2):**

  | Step | What happens |
  |---|---|
  | 1 | L1: 10 @ 100, unbilled. |
  | 2 | L2: 10 @ 200, billed on bill B (2000). |
  | 3 | Return A of 10 takes L1: GRNI Dr 1000. |
  | 4 | Receipt L1 is reversed (allowed: L2's 10 units are in stock). Stock is now 0. |
  | 5 | Return A is reversed. Stock is back to 10. |
  | 6 | Return B of 10 posts **TP Dr 2000**. This is right: line 466 zeroes L1 for the post itself. |
  | 7 | L3: 10 @ 300, billed on bill B3 (3000). |
  | 8 | Return C of 10. Only L3's liability is open, so C should post TP Dr 3000. |

  - In C's replay: A takes L1, L1 is dropped, A gives 10 back to L1, and B then takes L1 (unbilled first) instead of L2. Line 466 zeroes L1, L2 still shows 10, and C takes L2 at 200: **TP Dr 2000, PPV Dr 1000**.
  - End: TP **−1000** (the supplier is shown owed 1000 for goods that went back) and PPV **+1000**.
  - At 8d5dd67 the same steps end at 0/0/0, with C posting TP Dr 3000. Y3 (the same steps with no step 7 or 8) balances on both commits, because of line 466.
- **Fix (verified in the scratch clone):** do not give units back to a lot that was already dropped:

  ```js
  for (const { at, entry, give, drop } of events) {
    if (drop) drop.left = 0;
    else if (give) entry.used.forEach(({ lot, units }) => { if (!(lot.reversed && lot.reversedAt < at)) lot.left += units; });
    else entry.used = take(entry.orderId, entry.quantity, entry.asOf).used;
  }
  ```

  - With this change Y2 ends at 0/0/0 (C: TP Dr 3000). W5b, all Y and W probes and audit2-regressions (69/69) still pass.
  - Line 466 can stay as a safeguard.
  - Add Y2 as a test next to the 8d5dd67-round test.
  - This changes posting, so it needs the owner's OK. It only restores the 8d5dd67 result for this shape.

## X2′ (Low, performance): the new subquery runs for every lot, with no index

- **Where:** inventoryService.js:380. `reversal_sl_id` is a correlated `MAX` over `stock_ledger`, and it is computed for every receipt, posted or reversed. `stock_ledger` still has no `(source_module, source_id)` index, so each lot scans the table.
- **Measured:** see the timing table. A post takes about 100 ms more than at 8d5dd67, and a bulk load takes nearly twice as long. With the index, all cases take 21 to 38 ms.
- **Fix (no posting change):**
  - `CREATE INDEX IF NOT EXISTS idx_stock_ledger_source ON stock_ledger (source_module, source_id)` closes V3, X2 and this together.
  - If the index has to wait, wrap the subquery in `CASE WHEN si.posting_status = 'Reversed' THEN (...) END`, so that only reversed receipts pay for it.

## Z1 (Low): two installs at once share one staging file

- **Where:** main.js:575-582. Every call does `rm(update-staging, recursive)`, then `mkdir`, then writes `update-staging/<name>`. Nothing guards against a second call while the first is copying. The Install button (settings/index.jsx:94) stays enabled while the request runs, and the confirm dialog is the only step in between.
- **Reproduced** with the function copied verbatim into a Node script (300 MB file, second call 150 ms after the first):
  - Both calls returned "ok" with the correct hash.
  - When call A finished, its `stagedPath` held B's file at 241 of 300 MB.
  - A would launch a half-written installer. On Windows that is "not a valid application" or a sharing violation.
  - A's audit row records a SHA-256 that does not match the file it launched.
  - From a slow USB or network update folder, the copy takes long enough for a second click.
- **Fix:**
  - Hold an in-flight flag in main (`if (installing) throw ...`; reset it on failure).
  - Or stage into `fs.mkdtemp(path.join(runtimeDataRoot, "update-staging-"))`.
  - Also disable the button while the call runs.

## Z2 (Info): staging leftovers and the size cap

- The staged installer stays in the user's data folder until the next install, which may be months away. Delete `update-staging` at startup, once the app is running the new version.
- The 1 GB cap is checked on `stat` before the copy. The stream copies whatever is there, so a file that is still being written (for example, a download in progress) can grow past the cap or be copied half-finished.
  - Compare the copied byte count with `stats.size` after the pipeline, and refuse on a mismatch. That also catches a truncated download.
- For the security auditor: the stream copy does not carry the Windows Zone.Identifier (Mark-of-the-Web) stream, so SmartScreen will not check the staged copy. This is noted only; it is not a correctness problem.

## Z3 (Info): a 'Reversed' receipt with no reversal row leaves the pool

- **Where:** inventoryService.js:402. The comment says such a receipt "left no trace to replay". In fact its stock row is still there, so its units are still in the warehouse, and returns that use them fall to "beyond receipts" (TP at average cost).
- **App paths:** none. `reverseStockDocument`, `reverseVoucher` (GRN journal) and the guided reversal all write `REV-IN` in the same transaction (Y5, Y6, Y7).
- **Suggestion:** as for X4, report it under Health > integrity rather than handling it silently.

## Owner decisions this report needs

- **Y2:** approve the one-line give-back guard above. This is a posting change, but it restores the 8d5dd67 result. **Recommended.**
- **X2′/V3:** the index changes no posting and can go in without a decision.
- **Design question, still open:** the drop event now makes a reversed receipt *keep* the returns made while it stood. That is the "pool" reading (decision C2). It leaves the V5/T7 books gap: reversing a receipt after part of it was returned leaves GRNI or TP off by the returned part (S7: GRNI −1000, TP +400; U6: GRNI +600, TP −600).
  - The choices are to refuse a receipt reversal while unreversed returns used it, or to post the difference.
  - A stored per-lot allocation (the return-receipts table on the pending card) would answer this, V2 and V4/X3 together. It would also remove the replay, and with it Y2-class ordering bugs.
- Z1 and Z2 are main.js only and need no posting decision.

## Probe output (7955315 vs 8d5dd67)

```
Y1  both: 0/0/0                      A: TP+1000 | B: TP+1000
Y2  7955: TP -1000, PPV +1000  C: TP+2000 PPV+1000      8d5: 0/0/0  C: TP+3000
Y3  both: 0/0/0                      B: TP+2000
Y4  both: 0/0/0                      B: TP+800 | C: TP+1200
Y5  7955: 0/0/0  C: TP+3000 PPV+500                     8d5: TP -1000, PPV +1000  C: TP+2000 PPV+1500
Y6  7955: 0/0/0  C: TP+3000 PPV+500                     8d5: TP -1000, PPV +1000
Y7  both: 0/0/0                      A: PPV+1000 | B: TP+2000
W1-W7 unchanged from 8d5dd67; W5b 7955: 0/0/0  C: TP+3000 PPV+500 (8d5: TP -1000, PPV +1000)
Q/P/S/U unchanged from 8d5dd67 (U2 GRNI+1000 Pur-1000; U3 TP-1000 Pur+1000; U4 GRNI-500 PPV+500;
  U6 GRNI+600 TP-600; S7 GRNI-1000 TP+400; P7 GRNI-1000 TP+400)
With the Y2 fix applied in scratch: Y2 0/0/0 (C: TP+3000); W5b, Y1-Y7, W1-W7 and audit2-regressions 69/69 pass.
```
