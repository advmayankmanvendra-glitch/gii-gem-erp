# FSR-2A.1 Posting Boundary Report

## Scope

Posting validity enforcement, account ownership validation, company isolation, and atomic failure behavior for all voucher creation paths.

## Changes Made

### File: `src/main/services/accountingService.js`

**`createBalancedVoucher()` — substantive voucher validation**

Before FSR-2A.1, `createBalancedVoucher` validated only:
- Debit-credit balance (within rounding)
- Non-negative amounts

After FSR-2A.1, the function validates:
- Lines array is present with at least 2 entries
- At least one line has debit > 0 with credit === 0
- At least one line has credit > 0 with debit === 0
- All amount values are finite numbers (rejects NaN, Infinity, undefined)
- No negative debit or credit amounts
- No line contains both debit and credit
- No line has zero for both debit and credit
- Total debit is non-zero
- Total credit is non-zero
- Debit and credit balance within rounding (preserved)
- Every account ID exists and is not deleted
- Every account belongs to the voucher's company
- Every account has status 'active'

Validation occurs **before** the transaction begins, ensuring atomic failure. No voucher header, voucher line, ledger entry, or audit record is created for a rejected voucher.

### File: `src/main/database/reportBuilders.js`

**`postedVoucherFilter()` — reusable posting-state predicate**

A new helper function creates the SQL subquery:
```sql
AND EXISTS (SELECT 1 FROM vouchers v WHERE v.id = le.voucher_id
    AND v.status = 'Posted' AND v.is_deleted = 0
    AND v.company_id = a.company_id)
```

Applied to `trialBalance()`, `profitLossReport()`, and `balanceSheetReport()`.

### Verification

22/22 checks pass in the isolated FSR-2A.1 verifier. FSR-1 improvement: checks 12 (company isolation), 13 (Draft/Cancelled exclusion), and 25 (empty voucher) changed from FAIL to PASS.

### Remaining Limitations

- Balance Sheet contra signs (Accumulated Depreciation, Drawings) use wrong sign convention
- Balance Sheet current profit uses period-range instead of financial-year-to-date
- Inventory GL bridge: stock inward does not post GL effect
- Year-end close/carry-forward not fully operational
- Money representation uses REAL instead of INTEGER minor units
- No governed account-group/mapping registry
