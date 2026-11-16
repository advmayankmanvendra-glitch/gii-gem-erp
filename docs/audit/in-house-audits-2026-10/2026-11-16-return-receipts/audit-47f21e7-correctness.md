# In-house audit, pass 1: correctness, commit 47f21e7 (return-receipts fix round)

- Date: 16 Nov 2026, 12:30 IST
- Branch: `claude/erp-full-automation-qbhv8k`, commit `47f21e7`
- Scope: `git diff 91e2fa1 47f21e7`, read against `audit-91e2fa1-*.md` and `responses-91e2fa1.md`. This pass covers `recordReturnReceipts` and the audit-log additions in `src/main/services/inventoryService.js`, and the new tests in `scripts/audit/return-receipts.test.mjs`.
- Method:
  - Code reading.
  - Probes, a paise fuzzer and mutants, all run in a scratch worktree at `47f21e7` with node_modules linked. The worktree was removed afterwards and nothing in the repo was edited.
  - `npm run -s test:integrity` passes 233/233 and 56/56. `return-receipts.test.mjs` passes 11/11.

## Verdict

- The claimed fixes hold. Rows now add up to the GRNI debit, and to the Trade Payables debit when the whole return is covered by receipts. This includes backfilled rows and returns with both billed and unbilled rows.
- **One Medium finding (M-1):** the new backfill audit entry is written again and again for an earlier return that used no receipts.
- **Two Low findings:** L-1 is a code comment that overclaims; L-2 is a rounding test that does not cover billed rows.

## Running-total rounding (Correctness L-2 of 91e2fa1): holds

- **Code.** `inventoryService.js:497-503` keeps one running total per kind (billed, unbilled). `take()` adds `units * rate` to `grniValue` and `billedValue` in the same order (`:425-435`). So the final `paise(sum.value)` equals `Math.round(roundMoney(grniValue) * 100)`, because both go through `parseMoneyToMinor`.
- **Fuzzer setup.** 60 seeds × 30 steps. Receipts are billed or unbilled, at rates 33.3333, 16.6667, 0.3333, 14.2857, 100 or 0. Each run made 740 returns, 75 of them with both billed and unbilled rows.

| Mode | GRNI rows ≠ GRNI debit | Trade Payables rows ≠ TP debit (covered returns) | Backfilled returns | Backfill rows ≠ their own voucher | Negative `value_minor` |
|---|---|---|---|---|---|
| as shipped | 0 | 0 | 0 | 0 | 0 |
| 40 % of records deleted (forces backfill) | 0 | 0 | 274 | 0 / 0 | 0 |

- **Sensitivity.** One mutant uses a single running total for both kinds. Against it the same fuzzer reports 5 Trade Payables mismatches and 2 backfill Trade Payables mismatches. So the fuzzer does catch a mixed-kind rounding error.
- **Removed `units > 1e-9` guard.** `take()` skips units ≤ 1e-9 (`:429`), and backfill rows come from `take()`, so nothing tiny reaches the insert.
  - The response says "the CHECK constraint refuses them". That is only partly true: `CHECK (quantity > 0)` would accept 1e-12. It has no effect today.

## Audit-log additions (Security L-1 of 91e2fa1): hold, with M-1

- `stock_return_posted` now carries `receipts_used` (`:570`).
- Each backfilled return gets its own `stock_return_receipts_backfilled` entry, written in the posting transaction (`:539-542`).

## New tests: does each one fail without its code? (mutants in scratch only)

| Test (`return-receipts.test.mjs`) | Mutant | Result |
|---|---|---|
| backup taken before the table existed (`:113-128`) | backup taken after `migrate` | fails |
| same | 039 removed from `MIGRATIONS_WITH_BACKUP` | fails |
| every migration after 036 is in the list (`:130`) | 039 removed from the list | fails |
| same | a new literal `runMigration(db, "040_probe", …)` | fails |
| same | a new migration named by an imported or template-literal constant | **passes**: see security L-2 |
| rows cannot be changed, one row per receipt (`:139`) | trigger removed | fails |
| same | unique index removed | fails |
| record pointing at a receipt that has left the pool (`:149`) | `.filter((u) => u.lot)` removed | fails (TypeError) |
| later returns after a receipt reversal (`:161`) | drop event ignored | fails |
| rows add up to the GRNI debit (`:172`) | per-row rounding | fails |
| same | one running total for billed and unbilled rows | **passes**: see L-2 |

## Findings

### M-1: a return that used no receipts gets a new "backfilled" audit entry every time a later return posts

- **Where:** `src/main/services/inventoryService.js:479` (the backfill list), `:539-542` (the audit write), `:459` (`recorded` is true only when rows exist).
- **How it happens:**
  - A return with nothing to take writes no rows, so it is never "recorded". For example, the whole quantity goes past the supplier's receipts, as with stock from hand-entered opening balances or another supplier.
  - Every later return for the same supplier and item replays it, puts it in `split.backfill` with `used = []`, and now writes an audit entry for it.
- **Probe (scratch):**
  - Supplier 1 has one billed receipt of 3 units.
  - Return 5 units, then 1, then 1, then 1.
  - The audit log then holds three `stock_return_receipts_backfilled` rows, all with `"receipts":[]`: return 2 while posting return 3; return 2 again while posting 4; return 3 while posting 4.
- **Effect:**
  - With n such returns for one supplier and item, the log gains n(n−1)/2 entries. Each claims a backfill that did not happen, and the same return is "backfilled" again later.
  - The audit log is hash-chained, so these rows cannot be cleaned up afterwards.
  - It is graded Medium because it is a false and permanent audit record on a path the owner expects to use: hand-entered opening stock returned to a supplier. No amounts are wrong.
- **Fix:**
  - In `postStockReturn`, skip both the record and the audit for a backfill entry whose `used` is empty: `(split.backfill || []).filter((b) => b.used.length)`.
  - Optionally also leave such entries out at `:479`.
  - Add a test: two returns past the receipts, then a third, and assert there is no backfill audit row.

### L-1: the comment says billed rows add up to the Trade Payables amount; they do not when the return goes past the receipts

- **Where:** `inventoryService.js:492-493`. The response (L-2) says the same: "each kind adds up … to the voucher's GRNI or Trade Payables amount".
- **Probe:**
  - Supplier 1 has 3 billed units at 33.3333. Another supplier's stock is in the same warehouse.
  - Return 5 units to supplier 1.
  - The voucher posts Trade Payables Dr **166.67**: 100.00 for the receipt plus 2 units at WAC (`:482`, `:484`). The billed rows hold **10000** paise.
- **Effect:** the voucher is correct; only the claim is wrong. A future report that reconciles billed rows to the Trade Payables debit will flag every return that went past the receipts.
- **Fix:** reword the comment to "… adds up to the GRNI amount, and to the Trade Payables amount less any quantity past the receipts (at WAC, which has no row)". Optionally say the same in policy §6.

### L-2: the rounding test does not cover billed rows

- **Where:** `scripts/audit/return-receipts.test.mjs:172-189`. The test checks only `billed = 0` rows against the GRNI debit.
- **Scenario:** a change that shares one running total between billed and unbilled rows, or that rounds only billed rows per row, passes the whole suite. The fuzzer above catches it: 5 + 2 mismatches.
- **Fix:**
  - Add a case with two billed receipts at 33.3333 whose return takes one unit from each, and assert that the billed rows equal the Trade Payables debit (6667).
  - Add a case where one return has rows of both kinds.

## Scratch artefacts

The worktrees `…/scratchpad/rr47` and `…/scratchpad/rr91` were removed after the audit. The probes `fuzz-minor.mjs`, `probe-beyond.mjs`, `probe-sec.mjs` and `probe-drop.mjs` are in the session scratchpad only.
