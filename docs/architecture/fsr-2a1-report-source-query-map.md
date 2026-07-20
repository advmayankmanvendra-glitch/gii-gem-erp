# FSR-2A.1 Report Source Query Map

## Core Financial Statement Queries

All three financial statements now enforce:
1. Voucher state: `status = 'Posted'` and `is_deleted = 0`
2. Company isolation: `v.company_id = a.company_id`
3. Account isolation: `a.company_id = ?` (parameter)
4. Account soft-delete: `a.is_deleted = 0`

### Trial Balance

**Location:** `src/main/database/reportBuilders.js:759`

```sql
SELECT a.id, a.account_code, a.account_name, a.account_type,
  COALESCE(SUM(le.debit), 0) + CASE WHEN a.normal_balance = 'Debit' THEN a.opening_balance ELSE 0 END debit,
  COALESCE(SUM(le.credit), 0) + CASE WHEN a.normal_balance = 'Credit' THEN a.opening_balance ELSE 0 END credit,
  CASE
    WHEN a.normal_balance = 'Credit' THEN COALESCE(SUM(le.credit - le.debit), 0) + a.opening_balance
    ELSE COALESCE(SUM(le.debit - le.credit), 0) + a.opening_balance
  END balance
FROM accounts a
LEFT JOIN ledger_entries le ON le.account_id = a.id AND le.entry_date BETWEEN ? AND ?
  AND COALESCE(le.is_deleted, 0) = 0
  AND EXISTS (SELECT 1 FROM vouchers v WHERE v.id = le.voucher_id AND v.status = 'Posted' AND v.is_deleted = 0 AND v.company_id = a.company_id)
WHERE a.company_id = ? AND a.is_deleted = 0
GROUP BY a.id
ORDER BY a.account_code
```

### Profit & Loss

**Location:** `src/main/database/reportBuilders.js:786`

```sql
SELECT a.id, a.account_code, a.account_name, a.account_type,
  COALESCE(SUM(le.debit), 0) debit,
  COALESCE(SUM(le.credit), 0) credit
FROM accounts a
LEFT JOIN ledger_entries le ON le.account_id = a.id AND le.entry_date BETWEEN ? AND ?
  AND COALESCE(le.is_deleted, 0) = 0
  AND EXISTS (SELECT 1 FROM vouchers v WHERE v.id = le.voucher_id AND v.status = 'Posted' AND v.is_deleted = 0 AND v.company_id = a.company_id)
WHERE a.company_id = ? AND a.is_deleted = 0 AND a.account_type IN ('Income','Expense')
GROUP BY a.id
ORDER BY a.account_type, a.account_code
```

### Balance Sheet

**Location:** `src/main/database/reportBuilders.js:805`

```sql
SELECT a.id, a.account_code, a.account_name, a.account_type, a.normal_balance,
  COALESCE(SUM(le.debit), 0) debit,
  COALESCE(SUM(le.credit), 0) credit,
  a.opening_balance
FROM accounts a
LEFT JOIN ledger_entries le ON le.account_id = a.id AND le.entry_date <= ?
  AND COALESCE(le.is_deleted, 0) = 0
  AND EXISTS (SELECT 1 FROM vouchers v WHERE v.id = le.voucher_id AND v.status = 'Posted' AND v.is_deleted = 0 AND v.company_id = a.company_id)
WHERE a.company_id = ? AND a.is_deleted = 0 AND a.account_type IN ('Asset','Liability','Equity')
GROUP BY a.id
ORDER BY a.account_type, a.account_code
```

## Voucher Creation Paths

All paths converge on `createBalancedVoucher()`:

| Path | Caller | Validates Accounts |
|------|--------|-------------------|
| Manual journal | `createManualVoucher()` → `createBalancedVoucher()` | Yes (in `createBalancedVoucher`) |
| Sales posting | `postSalesVoucher()` → `createBalancedVoucher()` | Yes |
| Purchase posting | `postPurchaseVoucher()` → `createBalancedVoucher()` | Yes |
| Receipt posting | `postReceiptVoucher()` → `createBalancedVoucher()` | Yes |
| Supplier payment | `postSupplierPaymentVoucher()` → `createBalancedVoucher()` | Yes |
| Guided voucher post | `postGuidedVoucher()` → `createBalancedVoucher()` | Yes |
| Reversal | `reverseVoucher()` → `createBalancedVoucher()` | Yes |

## Index Recommendations

Added in FSR-2A.1 (none — documented for later hardening):

- `CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_id ON ledger_entries(account_id)`
- `CREATE INDEX IF NOT EXISTS idx_ledger_entries_voucher_id ON ledger_entries(voucher_id)`
- `CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers(status, is_deleted)`

These indexes would benefit the `EXISTS` subquery used in all three report queries. They are deferred to a dedicated migration phase per the remediation programme.
