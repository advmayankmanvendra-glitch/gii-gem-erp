# FSR-2A.1 Voucher State Policy

## Policy Definition

Only `Posted` vouchers with `is_deleted = 0` generate accounting effects that enter financial statements.

| Voucher State | Included in Financial Statements | Rationale |
|---------------|--------------------------------|-----------|
| Posted | Yes | Completed, substantively validated accounting entry |
| Draft | No | Not yet finalised; may be incomplete or changed |
| Cancelled | No | Voided entry with no accounting effect |
| Deleted | No | Removed from active voucher set |
| Reversed | Yes (reversal effect) | Reversal entries have their own accounting effect; original entry evidence preserved |

## Implementation

A reusable SQL predicate `postedVoucherFilter()` is defined in `src/main/database/reportBuilders.js`:

```js
function postedVoucherFilter() {
  return " AND EXISTS (SELECT 1 FROM vouchers v WHERE v.id = le.voucher_id"
    + " AND v.status = 'Posted' AND v.is_deleted = 0"
    + " AND v.company_id = a.company_id)";
}
```

Applied to:
- `trialBalance()` — all accounts
- `profitLossReport()` — Income/Expense accounts
- `balanceSheetReport()` — Asset/Liability/Equity accounts

The filter joins through `ledger_entries.voucher_id` → `vouchers.id`, checks `status = 'Posted'` and `is_deleted = 0`, and enforces `v.company_id = a.company_id` for company consistency.

## Prior Inconsistency (FSR-1 Check 13)

Draft and Cancelled vouchers inserted via raw SQL were included in P&L income, inflating reported income by 333.00. The report queries joined `ledger_entries` → `accounts` without filtering through `vouchers.status`.

## Test Evidence

1. FSR-2A.1 verifier check 12: Draft excluded from P&L — PASS
2. FSR-2A.1 verifier check 13: Cancelled excluded from P&L — PASS
3. FSR-2A.1 verifier check 14: Both excluded from BS — PASS
4. FSR-1 verifier check 13: Changed from FAIL to PASS

## Query Consistency

Before FSR-2A.1, three separate report queries each independently decided whether to filter voucher state. Now all three use the same `postedVoucherFilter()` predicate, eliminating scattered status literals.

## Remaining Limitations

- The `accountingData` function's raw `ledger` query (for drilldown) does not filter by voucher status, which is correct — drilldown should show all entries.
- Other report functions (dayBook, gstSummary, etc.) may benefit from the same filter but are outside this subphase scope.
