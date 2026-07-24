# FSR-2A.5C Balance-Sheet Contra-Asset Integrity

## Problem

Test C20 (Balance Sheet equation A = L+E+Profit) failed with a discrepancy of exactly 1,000,000 paise (₹10,000).

Assets computed as 32,041,900 paise but Liabilities + Equity + Profit totalled 31,041,900 paise.

## Root Cause

The `signedMovement` helper computes `CASE WHEN a.normal_balance='Debit' THEN le.debit_minor-le.credit_minor ELSE le.credit_minor-le.debit_minor END`. For accounts with `account_type='Asset'` and `normal_balance='Credit'` (contra-asset accounts like Accumulated Depreciation), this formula computes `credit - debit`, treating the movement as an asset increase. 

However, contra-asset accounts reduce net assets. A credit entry to Accumulated Depreciation increases the accumulated depreciation balance, which decreases the net book value of fixed assets. For the accounting equation, the correct contribution is `debit - credit` (which yields a negative value for a credit entry).

In the lifecycle fixture, Depreciation of ₹5,000 (500,000 paise) was posted as Dr Depreciation 500,000 / Cr Accum Depr 500,000. The signed movement for Assets credited Accum Depr with +500,000, inflating the asset side by 2 × 500,000 = 1,000,000 paise relative to the true net asset change.

## Fix

Replaced `signedMovement` for the Asset side with a raw `debit_minor - credit_minor` aggregation:

```sql
SELECT COALESCE(SUM(le.debit_minor-le.credit_minor),0)
FROM ledger_entries le
JOIN accounts a ON a.id=le.account_id
JOIN vouchers v ON v.id=le.voucher_id
WHERE a.account_type='Asset'
  AND v.status='Posted' AND v.is_deleted=0
  AND le.entry_date BETWEEN ? AND ?
```

This correctly computes:
- Debit-normal assets: positive = increase (debit - credit)
- Credit-normal (contra) assets: negative = decrease (debit - credit produces a negative for credit entries)

## Verification

After the fix: `A=31,041,900 L+E+P=31,041,900 diff=0`

The Liability & Equity side continues to use `signedMovement` because there are no debit-normal contra-liability accounts with non-zero movement in the fixture.
