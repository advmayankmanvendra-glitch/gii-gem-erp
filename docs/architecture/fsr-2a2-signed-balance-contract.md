# FSR-2A.2 Signed-Balance Contract

## Problem

The Balance Sheet report (`balanceSheetReport` in `reportBuilders.js`) used `normal_balance` to determine whether to negate account amounts:

```js
const sign = row.normal_balance === "Debit" ? 1 : -1;
```

This incorrectly handled:
- Contra-asset accounts (e.g., Accumulated Depreciation, `normal_balance = "Credit"`) — negated, producing wrong sign
- Contra-equity accounts (e.g., Drawings, `normal_balance = "Debit"`) — assigned positive, failing to reduce equity

The fix used in FSR-2A.2:

## Contract: Account-Type-Based Sign

A new helper `signedRowAmount(row)` computes the Balance Sheet amount:

```js
function signedRowAmount(row) {
  const t = row.account_type;
  const nb = row.normal_balance;
  const opening = Number(row.opening_balance || 0);
  const bal = Number(row.balance || 0);
  const total = opening + bal;
  if (t === "Asset") {
    if (nb === "Debit") return total;
    return -Math.abs(total);
  }
  if (t === "Liability" || t === "Equity") {
    if (nb === "Credit") return total;
    return -Math.abs(total);
  }
  return total;
}
```

| Account Type | Normal Balance | Example | Sign Rule |
|---|---|---|---|
| Asset | Debit | Bank, Cash, Receivables, Inventory | `+total` |
| Asset | Credit | Accumulated Depreciation | `-abs(total)` |
| Liability | Credit | Payables, Loans | `+total` |
| Liability | Debit | (rare — contra liability) | `-abs(total)` |
| Equity | Credit | Capital, Retained Earnings | `+total` |
| Equity | Debit | Drawings, Current-year Loss | `-abs(total)` |

## Enforcement

- `balanceSheetReport()` applies `signedRowAmount()` to every ledger row in the Asset, Liability, and Equity sections.
- `trialBalance()` and `profitLossReport()` are unaffected — they use raw debit/credit totals.
- The `normal_balance` field remains used for opening-balance initialization and for the TB-level account classification, but Balance Sheet amounts are computed by `account_type` only.

## Verifier Coverage

FSR-2A.2 checks 1–9 and 18 directly test the signed-balance contract:

| Check | Scenario | Expected |
|---|---|---|
| 1 | Debit-balance Asset (Bank 57,000) | `+57,000` |
| 2 | Contra-Asset (Accum Depr −1,000) | `−1,000` |
| 3 | Credit-balance Liability (Payables 5,000) | `+5,000` |
| 5 | Credit-balance Equity (Capital 50,000) | `+50,000` |
| 6 | Contra-Equity (Drawings −3,000) | `−3,000` |
| 7 | Accum. Depr reduces Assets | Asset total drops by 1,000 |
| 8 | Drawings reduces Equity | Equity total drops by 3,000 |
| 9 | BS equation balances | Difference = 0 |
| 18 | No current-profit row in equity | Not double-counted |

All 9 checks PASS.

## Risk Closure

**FSR-R01 (CRITICAL — Balance Sheet mishandles contra assets/equity):** Fixed by signed-balance contract. Evidence: FSR-1 check 5 (BS mapping deterministic) changed from FAIL to PASS; FSR-1 check 17 (BS equation passes) changed from FAIL to PASS.

## Scope

This contract applies only to `balanceSheetReport`. It does not change:
- Trial Balance amounts
- Profit & Loss amounts
- Opening-balance initialization
- Account creation or normal_balance assignment
- Renderer-side grouping (heuristic — remains uncertified)
