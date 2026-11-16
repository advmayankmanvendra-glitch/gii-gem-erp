# In-house audit, pass 1: correctness, commit 91e2fa1 (return-receipts table)

- Date: 16 Nov 2026, 12:05 IST
- Branch: `claude/erp-full-automation-qbhv8k`, commit `91e2fa1` on top of main `2c79106`
- Scope: `git diff 2c79106 91e2fa1`. That covers `inventoryService.js` (`supplierReturnSplit`, `recordReturnReceipts`, `postStockReturn`), migration `039_stock_return_receipts`, policy §6 and `scripts/audit/return-receipts.test.mjs`.
- Method:
  - Code reading.
  - A differential fuzzer and targeted probes, run in a scratch worktree (`git worktree add --detach … 91e2fa1`, node_modules linked). Nothing in the repo was edited.
  - `npm run -s test:integrity` passes 228/228 and 56/56. `node --test scripts/audit/return-receipts.test.mjs` passes 6/6.

## Verdict

- **No High or Medium findings.**
- For returns posted after this change, the recorded rows give exactly the same postings as the replay, to the paisa.
- The three Low findings concern returns posted before the upgrade, an informational paise column, and test coverage.

## How equivalence was checked

- **Setup.** Two databases are driven in lockstep with the same random operations:
  - receipts: billed or unbilled, on order 1, order 2 or no order, at rate 0, 33.33, 100, 150 or 200, in two warehouses;
  - posting and reversing bills;
  - supplier returns on order 1, order 2 or no order, including zero-value returns from a free-stock warehouse;
  - reversing returns and reversing receipts.
- **The two databases:**
  - DB A runs the commit as shipped.
  - DB B has `stock_return_receipts` wiped after every operation, so every posting replays (the pre-change behaviour).
- **What is compared:** the voucher lines of every return, in paise. A scratch-only instrumentation also flagged any `lot.left < 0` in a recorded take, and any give-back that pushed a lot above its receipt quantity.
- **Modes and results:**

| Mode | Seeds × steps | Returns posted | Return / receipt / bill reversals | Divergences | `lot.left < 0` | Give-back over receipt qty | Unbalanced return vouchers | Lot over-used by recorded rows |
|---|---|---|---|---|---|---|---|---|
| A records everything | 150 × 40 | 2,137 | 539 / 429 / 118 | 0 | 0 | 0 | 0 | 0 |
| First half unrecorded (pre-upgrade history, then backfill) | 60 × 40 | 838 | 211 / 178 / 39 | 0 | 0 | 0 | 0 | 0 |
| 40 % of returns' records deleted at random (patchy history) | 60 × 40 | 801 | 201 / 190 / 49 | 0 | 0 | 0 | 0 | 0 |

- **Sensitivity check.** In a mutated scratch copy, recorded units were halved. The fuzzer then reported 28 divergences and 14 over-used lots in 10 seeds, so it does catch a wrong recorded take.

## Edge cases asked about

- **Reversed returns (give-back).** A recorded return takes its rows at its first stock-ledger row and gives the same rows back at its reversal row (`inventoryService.js:470-476`). Give-back skips a receipt already dropped (`!lot.gone`). No over-give was found.
- **Reversed receipts and dropped lots.**
  - A lot reversed after a recorded return used it is dropped at its reversal row, which comes after the take.
  - A recorded row that points at a lot dropped before the return cannot be written, because `take` skips lots whose `left` is 0.
  - Probe: a receipt marked Reversed with no reversal row (legacy data) leaves the pool. The recorded row is filtered out (`:462`), and the next return takes the other receipt. No crash and no negative `left`.
- **Order-filtered and no-order returns.** A recorded return ignores its order and uses exactly its rows. The fuzzer mixes order 1, order 2 and no order on both receipts and returns, with no divergence.
- **Free lots.** A free lot gets a row with `rate 0` and `value_minor 0`; the row is skipped only when its units are ≤ 1e-9 (`:496`). Zero-value returns from the free warehouse were in every fuzz run.
- **Partially recorded histories.**
  - A posting backfills every earlier unrecorded return of the same supplier and item, so a recorded return never has an unrecorded return before it.
  - The exceptions are a return that used nothing (no rows to write) and a database written by an older build after the upgrade.
  - Those are replayed each time. The replay of an earlier return depends only on events before it, so the result is stable. The random-deletion mode stresses exactly this.
- **Backfill of a reversed earlier return.** It is recorded with what it took while it stood (`:479` filters out only give events). Its give-back then uses those rows.
- **Recorded row whose stock-ledger row is no longer in `lots`.** It is dropped by `.filter((u) => u.lot)`. The return still counts as recorded (`recorded.length > 0` comes from the raw rows), so it is not backfilled again. See L-3: nothing tests this filter.
- **Negative `left` or double counting.** None found (table above).
- **Voucher balance.** All supplier-return vouchers balance in paise (`debit_minor = credit_minor`). The variance is still worked out from the rounded Inventory credit (`:485-487`).
- **Tests write only to scratch copies.** Every test opens its own `mkdtemp` database and removes it in `afterEach`.

## Findings

### L-1: backfill locks V4 in for pre-upgrade returns that posted no voucher

- **Where:**
  - `src/main/services/inventoryService.js:413` (`asOf?.voucherId || Infinity`), `:479` and `:531`
  - `docs/architecture/fsr-2a4-perpetual-inventory-policy.md:90` and `:93`
- **Scenario.** This is W2 from audit-8d5dd67, run in scratch (`probe-w2.mjs`):
  - L1: 10 @ 100 in W1, billed.
  - F: 10 @ 0 in W2, free.
  - Return A: 10 from W2. It took F and posted no voucher.
  - The bill is reversed.
  - Return C: 10 from W1.
- **Results:**

| A posted | A's record after C | C's voucher | GRNI / PPV after C |
|---|---|---|---|
| after the upgrade | sl 5 (F), `posting` | GRNI Dr 1,000 | 0 / 0 |
| before the upgrade (rows deleted) | **sl 4 (L1), `backfill`** | **PPV Dr 1,000** | **GRNI −1,000 / PPV +1,000** |

- **What goes wrong:**
  - For a database that is upgraded, the backfill replays A with *today's* billing. It writes the wrong receipt into A's record, for good.
  - This is the same posting the old code made, so it is not a regression.
  - But the policy says V4 is "Closed … (a recorded return keeps its own billing)" and "once recorded, it keeps the billing it had when it posted". For backfilled returns both statements are untrue.
- **Fix (either):**
  - (a) Backfill every unrecorded supplier return once, right after migration 039 (first start), before any new bill reversal can change "today's billing". That narrows the error to bills reversed between the original posting and the upgrade.
  - (b) Keep the lazy backfill and correct the policy wording: V4 is closed for returns posted after 16 Nov 2026. A return posted earlier with no voucher is recorded with the billing in force when it is backfilled.

### L-2: `value_minor` per row does not add up to the voucher

- **Where:** `inventoryService.js:497` (`paise(units * rate)`, rounded row by row) and policy `:83` ("the value in paise").
- **Scenario** (`probe-rr.mjs`):
  - Three receipts, each 3 units with stock value 100.00.
  - Return 1: 2 units. Return 2: 2 units, which takes 1 unit from each of two receipts.
  - Return 2's rows hold 3333 + 3333 = **6666** paise. Its voucher posts GRNI Dr **6667**, which is `roundMoney(66.6667)`.
- **Effect:**
  - Nothing reads `value_minor` today; the split uses only quantity, rate and billed.
  - But any future report that adds it up will be a paisa off the ledger.
- **Fix (either):**
  - Spread the voucher's GRNI and Trade Payables paise across the rows (largest remainder), so the rows add up to the voucher.
  - Or call the column indicative in the policy and the column comment, and never reconcile against it.

### L-3: tests do not cover several recorded-path branches

- **Where:** `scripts/audit/return-receipts.test.mjs`.
- **Mutation results** (scratch only; each mutant run against the new file and `audit2-regressions.test.mjs`):

| Mutant | return-receipts tests | audit2 tests |
|---|---|---|
| never use records | 2 fail | n/a |
| no backfill | 1 fail | n/a |
| recorded take not subtracted | 1 fail | n/a |
| no give-back | 1 fail | 1 fail |
| give back to a dropped receipt | **0 fail** | 1 fail |
| `.filter((u) => u.lot)` removed (`:462`) | **0 fail** | **0 fail** |
| `units > 1e-9` guard removed (`:496`) | **0 fail** | **0 fail** |

- **Gaps:**
  - Without the lot filter, a recorded row that points at a lot no longer in the pool throws `TypeError` on `lot.left`, and the return cannot be posted. No suite catches that.
  - The only V4 test is missing, although the policy claims V4 is closed. Add W2 for both a post-upgrade and a backfilled return; the backfilled case documents L-1.
  - No test combines a reversed receipt with recorded rows.
  - No test ends with GRNI and Trade Payables back at zero.
  - The migration test checks only that a `pre-upgrade-*.db` file exists, not that it was taken before the table was created.
- **Fix:** add these four cases:
  - a record pointing at a receipt reversed with no trace;
  - W2, in both variants;
  - receipt reversal after a recorded return, then a later return, ending at GRNI and Trade Payables 0/0;
  - open the backup and assert it has no `stock_return_receipts` table.

## Scratch artefacts

The worktree `…/scratchpad/rr91`, with `fuzz-rr.mjs`, `probe-w2.mjs`, `probe-rr.mjs`, `probe-gone.mjs` and `probe-reset.mjs`, was removed after the audit.
