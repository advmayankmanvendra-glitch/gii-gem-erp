# FSR-2A.3 Carry-Forward Decomposition Model

## Problem

When a financial year is closed, each Balance Sheet account's signed amount must be stored as the opening balance for the next year. The `carry_forward_entries` table stores two columns — `opening_debit` and `opening_credit` — which must be populated such that downstream reports (Trial Balance, Balance Sheet) can consume them correctly regardless of the account's type or normal balance.

The naive `Math.max(amount, 0)` / `Math.max(-amount, 0)` decomposition works for Asset accounts (where `signedRowAmount` uses debit-positive convention) but produces wrong values for Liability/Equity accounts (where `signedRowAmount` uses credit-positive convention).

## Decomposition Rule

The decomposition must match the sign convention of `signedRowAmount()`:

| Account Type | Convention | `amount > 0` | `amount < 0` |
|---|---|---|---|
| Asset | Debit-positive | `opening_debit = amount` | `opening_credit = \|amount\|` |
| Liability / Equity | Credit-positive | `opening_credit = amount` | `opening_debit = \|amount\|` |

### In code (`accountingService.js:942-949`)

```js
if (row.account_type === "Asset") {
  openingDebit = Math.max(amount, 0);
  openingCredit = Math.max(-amount, 0);
} else {
  openingCredit = Math.max(amount, 0);
  openingDebit = Math.max(-amount, 0);
}
```

### Examples

| Account | Type | NB | Amount | opening_debit | opening_credit |
|---|---|---|---|---|---|
| Bank | Asset | Debit | +57,000 | 57,000 | 0 |
| Accum. Depreciation | Asset | Credit | -1,000 | 0 | 1,000 |
| Payables | Liability | Credit | +5,000 | 0 | 5,000 |
| Capital | Equity | Credit | +50,000 | 0 | 50,000 |
| Drawings | Equity | Debit | -8,000 | 8,000 | 0 |

## Why Not Debit-Max / Credit-Max Only

`Math.max(amount, 0)` alone produces `opening_debit` for ALL positive amounts regardless of account type. This breaks non-Asset accounts because their signed amounts are credit-positive — a positive amount for Capital means "credit 50,000", not "debit 50,000". The `account_type` check ensures the correct side receives the non-zero component.

## Schema

Migration `033_fsr2a3_carry_forward_openings` added two REAL columns:

```sql
ALTER TABLE carry_forward_entries ADD COLUMN opening_debit REAL NOT NULL DEFAULT 0;
ALTER TABLE carry_forward_entries ADD COLUMN opening_credit REAL NOT NULL DEFAULT 0;
```

The existing `closing_balance` column stores the raw signed amount for audit trail. The new columns are the decomposed values used by reports.

## Verifier Coverage

FSR-2A.3 checks 10-14 verify the decomposition for all BS account types:
| Check | Account | Expected od | Expected oc |
|---|---|---|---|
| 10 | Bank (Asset/Debit, amount=+57,000) | 57,000 | 0 |
| 11 | Accum Depr (Asset/Credit, amount=-1,000) | 0 | 1,000 |
| 12 | Payables (Liability/Credit, amount=+5,000) | 0 | 5,000 |
| 13 | Capital (Equity/Credit, amount=+50,000) | 0 | 50,000 |
| 14 | Drawings (Equity/Debit, amount=-8,000) | 8,000 | 0 |
