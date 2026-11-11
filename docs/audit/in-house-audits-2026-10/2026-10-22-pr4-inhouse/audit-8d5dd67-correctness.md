# Correctness audit: 372c89d..8d5dd67

- Branch: `claude/erp-full-automation-qbhv8k`. Audited head `8d5dd67` (also covers 98c6fda). Written 2026-11-11 06:05 IST.
- Scope: 98c6fda and 8d5dd67, which answer `audit-372c89d-correctness.md` (V1 to V7).
  - The posting change is in `supplierReturnSplit` (inventoryService.js:367-464). Earlier returns, including reversed ones, are now replayed as events in stock-ledger order. A reversed return takes its lots at its first `stock_ledger` row and gives the same units back at its last row (the reversal). `take()` no longer drops used-up lots.
  - main.js: `installerFingerprint` (dev, ino, size, mtime and SHA-256), checked before and after the backup in `updates:install`. `newestSetupInFolder` now skips anything that is not a regular file.
- Method:
  - Scratch clone `/tmp/claude-0/corr-372` at 8d5dd67. A worktree at 372c89d (`/tmp/claude-0/corr-8d5-old`) was used to tell regressions apart.
  - I re-ran Q1 to Q8 (`probe-prev`), P1 to P11 (`probe-66b`), S1 to S8 (`probe-f92`) and U1 to U7 (`probe-372`).
  - New probes W1 to W7 and W5b are in `scripts/audit/probe-8d5.test.mjs`. I ran each one at both commits.
  - Timing script: `scripts/audit/prof3.mjs` (N=1000, with and without reversals). The run used a 900 s timeout.
- Tests at 8d5dd67:
  - `npm run -s test:integrity`: pass (219 + 25, 0 fail).
  - Earlier probes: Q 8/8, P 11/11, S 8/8 and U 7/7 ran. Every result matches 372c89d except U5, which is now fixed.

## Summary

V1 is fixed. U5 and W7 (an order-scoped return reversed after an unscoped return) both balance now, and both were wrong at 372c89d. Reversal through `reverseVoucher` writes the `REV-RET` stock row as well (W3), so both reversal paths are handled.

One new problem is a **regression** in a narrow path. When a reversed return's receipt is later reversed, the replay can no longer see that receipt (the V5 root cause). The reversed return is then replayed onto another lot, and it gives that lot back, so a later return takes units that are already gone (W5b). 372c89d posted this correctly, because it skipped the reversed return.

| # | Severity | Regression? | Where | One line |
|---|---|---|---|---|
| X1 | **Medium** | **Yes** (correct at 372c89d) | inventoryService.js:386 with 441-452 | The replay leaves out a reversed receipt, so a reversed return that used it is replayed onto another lot. W5b: TP stuck **−1000**, PPV +1000. |
| X2 | Low (performance) | No (V3, slightly worse) | inventoryService.js:434-440 | Two correlated `stock_ledger` subqueries now run for each earlier return, and `stock_ledger` still has no index. At N=1000 a post takes 120 to 190 ms; with the index it takes 21 to 27 ms. |
| X3 | Low | No (V4 still open, now shows with reversals) | inventoryService.js:405, 448 | A return with no voucher is still replayed "as of now". W2: the in-between return C posts PPV +1000 instead of GRNI 1000. The later return D posts GRNI +1000 / PPV −1000 for free goods, so the totals come back to 0 only after D. |
| X4 | Info | No | inventoryService.js:446 | A return marked 'Reversed' that has only its posting row is skipped completely, so its units count as never taken. The app has no path that does this; it is reachable only by a direct data edit. W4: GRNI +1000, TP −2000. |
| X5 | Low | New code | main.js:562-566, 1301, 1304 | `installerFingerprint` reads the whole installer into memory, synchronously, twice, on the main process. It takes about 250 ms and 200 MB for each 200 MB read, it blocks the UI longer on a slow or network folder, and it fails above 2 GiB with a raw `ERR_FS_FILE_TOO_LARGE` message. |
| X6 | Info | No | main.js:465 | The file-only filter covers the folder scan, but not an installer named in `latest.json`, which still uses `existsSync`. A folder with that name is shown as an available update and is refused only at install. |

## Prior findings (372c89d round)

| # | Status | Evidence |
|---|---|---|
| V1 reversed return drops out of the replay | **Fixed** | U5 ends at 0/0/0; return C posts GRNI Dr 1000 (it was TP Dr 2000). W7 ends at 0/0/0 (at 372c89d: GRNI −500, TP +1000). W1, W3 and W6 balance. The new test in audit2-regressions.test.mjs:1243 covers it. See X1 for the gap that is left. |
| V2 billed-first receipt, then its bill reversed | **Open** | U2 unchanged: GRNI +1000, Purchase −1000. |
| V3 no index on `stock_ledger` | **Open** | No index was added (none in `src/main`). It is now two subqueries; see X2. |
| V4 voucher-less return replays "as of now" | **Open** | U4 unchanged: GRNI −500, PPV +500. W2 shows it with a reversal; see X3. |
| V5 / T7 receipt reversed after it was billed or returned | **Open** | S7 unchanged (GRNI −1000, TP +400). U6 unchanged (GRNI +600, TP −600). It now also feeds X1. |
| V6 billing again after a bill reversal | Open (design) | U3 unchanged: TP −1000, Purchase +1000. |
| V7(a) zero-value return needs the PPV ledger | Accepted | Q6 is refused with a clear message. |
| V7(b) landed cost dropped on a guided purchase | Accepted, no warning | A new test (audit2-regressions.test.mjs:1234) now fixes that behaviour in place. The comment at init.js:1024 is updated. There is still no warning to the user. |
| T5, R6, R8, R5, N2 | Open (unchanged) | S4, P7, P6, P5 and Q4 give the same numbers as at 372c89d. |

## Questions from the brief, answered

- **A return reversed before any later return (W1).**
  - Setup: L1 10 @ 100, unbilled. L2 10 @ 200, billed. Return A takes L1 and is then reversed. Returns B and C follow.
  - A: GRNI 1000. B: GRNI 1000 (L1 again, which is right). C: TP 2000.
  - End: 0/0/0. The result is the same at 372c89d.
- **Reversing a return that had no voucher (W2).**
  - The give-back itself is right: the return hands back exactly the units it took in the replay.
  - The problem is which lots it took. It is replayed with today's billing, as in V4. Any return posted between its post and its reversal is then judged against the wrong lots (X3).
  - The reversal now cancels the error in the books totals, but only once a later return happens to use the freed lot. Each voucher on its own is still wrong.
- **'Reversed' with only one ledger row (W4).**
  - No code path in the app creates this. Both `reverseStockDocument` and `reverseVoucher` mirror the stock in the same transaction. Generic `createRecord`/`updateRecord` calls do not flip a posted return.
  - If it happens anyway, skipping the return frees units that left the warehouse. Replaying it as a take with no give-back would match the stock; see X4.
- **Reversal through `reverseVoucher` instead of `reverseStockReturn` (W3).**
  - `SOURCE_DOCUMENTS.stock_returns` sends the reversal to `mirrorStockForSource` (accountingService.js:576-579). That writes `REV-RET-<id>` with the reversal voucher id and sets the return to 'Reversed'.
  - W3 (U5 through `reverseVoucher`): C posts GRNI Dr 1000 and the end is 0/0/0. At 372c89d it was GRNI −1000, TP +2000.
- **Can a reversed return be posted again?** No. `ensureStockNotPosted` (inventoryService.js:126-130) refuses 'Reversed'. So a return has one posting row and at most one reversal row, and MIN and MAX are the right two rows.
- **Timing at 1000** (`prof3.mjs`, 1000 lots and 1000 returns, one item; run with a 900 s timeout):

  | Case | Bulk load | Next post | Next post with `(source_module, source_id)` index |
  |---|---|---|---|
  | No reversals | 62 to 63 s | 119 to 139 ms | 18 to 23 ms |
  | Every second return reversed | 78.7 s | 176 to 191 ms | 23 to 27 ms |
  | 372c89d, same session (`prof.mjs`) | n/a | 151 ms | 39 ms |

  - The JS replay itself is cheap. With the index, a post is about 20 ms even though `take()` now scans every lot. The cost is the SQL in X2.
  - The 372c89d report measured 48.6 s bulk and 89 to 97 ms. The machine was noisier this session; at 372c89d it measured 151 ms in the same session, so I cannot claim a regression beyond the extra subquery.
  - N=200: 1.75 s bulk (1.6 s at 372c89d).

---

## X1 (Medium, regression): a reversed return whose receipt was later reversed is replayed onto another lot

- **Where:**
  - The lot query (inventoryService.js:386) keeps only `si.posting_status = 'Posted'`. A reversed receipt is missing from the replay from the very start, not only from its reversal onwards (the root cause of V5).
  - The new event replay (441-452) replays a reversed return at its own post. If the lot it really took is now missing, it takes another lot. At its reversal it gives that other lot back.
  - The units of that other lot that a return posted in between really took are then counted as still in stock.
- **Reproduction (W5b):**

  | Step | What happens |
  |---|---|
  | 1 | L1: 10 @ 100, unbilled. |
  | 2 | L2: 10 @ 200, billed on bill B (2000). |
  | 3 | Return A of 10 takes L1: GRNI Dr 1000. |
  | 4 | Return B of 10 takes L2: TP Dr 2000. |
  | 5 | A is reversed, so L1 is back in stock. |
  | 6 | The L1 receipt is reversed (allowed: L1 is unbilled and in stock). |
  | 7 | L3: 10 @ 300, billed on bill B3 (3000). |
  | 8 | Return C of 10. Only L3 is in the warehouse, so C should post TP Dr 3000. |

  - In the replay, A takes L2 (L1 is gone), B finds nothing, and A then gives L2 back. C takes L2 at 200 and posts **TP Dr 2000, PPV Dr 1500**.
  - End: TP **−1000** (the supplier is still owed 1000 for goods that went back) and PPV **+1000**.
  - At 372c89d the same steps end at 0/0/0, with C posting TP Dr 3000. W5 (L3 unbilled) balances on both commits only because unbilled lots are used first.
- **Fix:** this is the event approach the V1 fix suggested, extended to receipts.
  - Load reversed receipts too (`si.posting_status IN ('Posted', 'Reversed')`) with their `REV-IN` row id (`MAX(sl.id)` for `source_module = 'stock_inwards'`).
  - Add an event at that row that removes the lot's remaining units (`lot.left = 0`).
  - This also fixes the replay part of V5 for returns posted before the receipt was reversed. The partial-reversal question in V5 stays an owner decision.
  - The guided-voucher GRN reversal (accountingService.js:418) sets the same status and needs the same treatment.
  - Add W5b as a test. This changes posting, so it needs the owner's OK. A stored per-lot allocation (`stock_return_lots`, or the return-receipts table the pending card offers) removes this whole class of problem.

## X2 (Low, performance): V3 is still open, now with two subqueries

- **Where:** inventoryService.js:434-440. `sl_id` (MIN) and `last_sl_id` (MAX) are both correlated over `stock_ledger`, for each earlier return. The plan shows `SCAN sr | CORRELATED SCALAR SUBQUERY 1 | SEARCH sl | CORRELATED SCALAR SUBQUERY 2 | SEARCH sl`. There is no index on `stock_ledger`.
- **Measured:** see the timing table above. The earlier-returns query takes 102 to 128 ms without the index and 1.9 to 2.7 ms with it.
- **Fix:**
  - Add `CREATE INDEX IF NOT EXISTS idx_stock_ledger_source ON stock_ledger (source_module, source_id)`.
  - Or fetch both values with one grouped join, `LEFT JOIN (SELECT source_id, MIN(id), MAX(id) FROM stock_ledger WHERE source_module = 'stock_returns' AND COALESCE(is_deleted,0)=0 GROUP BY source_id)`, which needs the index to be cheap as well.
  - Neither changes any posting.

## X3 (Low): a voucher-less return is still replayed with today's billing, and reversals now show it

- **Where:** inventoryService.js:405 (`asOf?.voucherId || Infinity`) and 448 (`voucherId: null` when there is no voucher).
- **Reproduction (W2):**
  - L1: 10 @ 100 in W1, billed.
  - F: 10 @ 0 in W2, free.
  - Return A: 10 from W2. It takes F at value 0, so it posts no voucher.
  - The bill is reversed.
  - Return C: 10 from W1, which is physically L1 (now unbilled). C should post GRNI Dr 1000. Instead the replay puts A on L1, so C takes F and posts **PPV Dr 1000** with no GRNI line.
  - A is reversed, which gives back L1 in the replay.
  - Return D: 10 from W2, which is physically F (free). D should post nothing. It posts **GRNI Dr 1000, PPV Cr 1000**.
- **Effect:**
  - Between C and D the books are off by GRNI −1000 / PPV +1000.
  - D brings the totals back to 0, but both C and D are wrong on their own.
  - At 372c89d the end was GRNI −1000 / PPV +1000 for good, so the end state is better now. The per-voucher error is the same.
- **Fix:** as for V4. Stamp each return with the last voucher id at posting time (a new column), or store the allocation.

## X4 (Info): 'Reversed' with only its posting row is skipped

- **Where:** inventoryService.js:446.
- **Simulated (W4):** a direct `UPDATE stock_returns SET posting_status = 'Reversed'` on a posted return A.
  - The next return takes A's lot again.
  - End: GRNI +1000, TP −2000, PPV +1000.
- **App paths:** none. Both reversal paths mirror the stock in the same transaction.
- **Suggestion:** treat such a row as a take with no give-back, because the stock really left. Or report it in Health > integrity, rather than freeing its units without a word.

## X5 (Low): the installer fingerprint reads the whole file synchronously

- **Where:** main.js:562-566. It is called twice in `updates:install` (1301 and 1304).
- **Measured** (Node 22, the same major version as Electron 37):

  | File | Result |
  |---|---|
  | 200 MB | 253 ms and about 200 MB of extra RSS for each call. That is about 0.5 s of frozen UI in total, and longer from a USB or network update folder. |
  | 2.2 GB | Throws `ERR_FS_FILE_TOO_LARGE: File size (...) is greater than 2 GiB`. The user sees that text, and the install is refused. |

  - Real Setup installers are about 100 to 200 MB, so this is unlikely to bite, but the UI freeze is real.
- **The check itself is sound:**
  - Comparing size, mtime, inode and hash catches a replace, an overwrite or a link swap during the backup.
  - The window that remains is between the second check and `shell.openPath`. Both run with no `await` between them, so it is negligible.
  - The SHA-256 is now written to the audit log, which is useful.
- **Fix:** hash with a stream, for example `await pipeline(fs.createReadStream(p), hash)` or `for await` chunks into `hash.update`. This keeps memory constant, has no 2 GiB limit and does not block the main process. Optionally refuse files above a sane cap (say 1 GiB) with a clear message.

## X6 (Info): the installer named in `latest.json` skips the file-only filter

- **Where:** main.js:465. `named` uses `fs.existsSync`, which is true for a folder or a link.
- **Effect:**
  - If `latest.json` names `GII-GeM-ERP-Setup-9.9.9-x64.exe` and that name is a folder, the status shows an update.
  - `assertInstallerInsideUpdateFolder` refuses it at install time ("not directly inside the update folder").
  - So nothing unsafe is launched; the status screen is just inconsistent with the install.
- **Fix:** use the same `lstatSync(...).isFile()` test in this branch, and fall back to `folderBest` when it fails.

## Owner decisions this report needs

- **X1 / V5:** replay reversed receipts as events (drop the lot at its `REV-IN` row). **Recommended**, together with the approved V1 approach.
  - The pending card's optional return-receipts table (stored per-lot allocations, written at posting time) would replace replaying altogether. It would close X1, X3/V4 and V2's lot side in one change.
  - Design question for that table:
    - Store `(stock_return_id, stock_inward_id, quantity, billed_flag, rate)` at post.
    - On a return's reversal, mark its rows reversed.
    - On a receipt's reversal, refuse if any rows that are not reversed point at it. That is also the V5 answer.
    - Older returns would need a one-time backfill from the current replay.
- **X3 / V4:** a voucher-id stamp, or the table above.
- V2, V5/T7, T5 and R6 are still waiting from earlier rounds.

X2 (the index) and X5/X6 (main.js) change no posting and can go in without a decision.

## Probe output (8d5dd67 vs 372c89d)

```
W1  8d5: 0/0/0                              372c: 0/0/0
W2  8d5: 0/0/0  C: PPV+1000  D: GRNI+1000 PPV-1000      372c: GRNI -1000, PPV +1000 (D: no voucher)
W3  8d5: 0/0/0  C: GRNI+1000                372c: GRNI -1000, TP +2000, PPV -1000 (C: TP+2000)
W4  both: GRNI +1000, TP -2000, PPV +1000 (simulated data edit)
W5  both: 0/0/0
W5b 8d5: TP -1000, PPV +1000 (C: TP+2000 PPV+1500)      372c: 0/0/0 (C: TP+3000 PPV+500)
W6  both: 0/0/0
W7  8d5: 0/0/0                              372c: GRNI -500, TP +1000, PPV -500
```
