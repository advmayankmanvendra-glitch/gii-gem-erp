# FSR-2A.3 Financial-Year Close Contract

## Problem

`closeFinancialYear` in `accountingService.js` called `updateFinancialYearStatus(fromId, "Locked", approvedBy)` **without the `db` argument** — the function signature is `(db, id, status, userId)`, so `approvedBy` was passed as `status`, causing "Invalid financial year status" errors and leaving the source year `Open` indefinitely.

## Contract: `closeFinancialYear(db, payload)`

The function enforces a strict sequence of validations before performing the close:

```
Validations (atomic):
  1. Source and target FY records exist
  2. Source FY status === 'Open'
  3. Target FY status === 'Open'
  4. Target start_date > source end_date (no overlap)
  5. No duplicate carry-forward for this company/year pair
  6. No Draft/Error voucher postings exist
  7. Trial Balance balances (debit === credit)
  8. Balance Sheet balances (|assets - liabilitiesAndEquity| <= 1)

Transaction (atomic):
  9. Insert year_end_closings record
  10. For each BS account with non-zero signed amount:
       decompose into opening_debit / opening_credit
       and INSERT into carry_forward_entries
  11. If netProfit !== 0:
       INSERT carry_forward entry for Capital account
       with opening_credit = profit (profit) or opening_debit = |loss| (loss)
  12. UPDATE source FY status → 'Locked'
  13. INSERT audit_log entry
```

## Key Fixes

1. **DB argument**: `updateFinancialYearStatus(db, fromId, "Locked", approvedBy)` — the `db` parameter was missing.

2. **Decomposition**: Signed amounts from `balanceSheetReport` are decomposed into `opening_debit` / `opening_credit` using the account-type-aware convention:

   - **Asset** accounts: `signedRowAmount` uses debit-positive convention
     - `opening_debit = max(amount, 0)`, `opening_credit = max(-amount, 0)`
   - **Liability/Equity** accounts: `signedRowAmount` uses credit-positive convention
     - `opening_credit = max(amount, 0)`, `opening_debit = max(-amount, 0)`

3. **Status validation checks** (lines 914-915: source and target must both be `'Open'`) were added so the function fails early with a clear message.

## Scope

This contract applies only to `closeFinancialYear`. It does not change:
- Voucher posting or reversal
- Financial year creation or editing
- Manual status updates
- Opening balance management
- Report formats

No revert of FSR-2A.1 or FSR-2A.2 controls is permitted.
