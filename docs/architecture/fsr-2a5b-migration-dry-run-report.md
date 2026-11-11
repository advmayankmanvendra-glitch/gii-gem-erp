# Migration Dry-Run Report — FSR-2A.5B

## Environment
- Database: [TEMP \| PRODUCTION]
- Date: [date]
- Schema version before: [version]
- Schema version after: [version]

## Migration Steps Executed
1. [ ] Schema shadow columns added
2. [ ] Idempotency verified
3. [ ] Backfill completed
4. [ ] Reconciliation completed

## Reconciliation Results

### Tables Migrated
| Table | Rows | Shadow Columns | Disagreements | Max Diff (paise) |
|---|---|---|---|---|
| voucher_lines | | debit_minor, credit_minor | | |
| ledger_entries | | debit_minor, credit_minor, running_balance_minor | | |
| opening_balances | | opening_debit_minor, opening_credit_minor | | |
| carry_forward_entries | | closing_balance_minor, opening_debit_minor, opening_credit_minor | | |
| accounts | | opening_balance_minor | | |
| stock_ledger | | value_minor, running_value_minor | | |

### Voucher Balance Check
| Voucher Type | Count | All Balanced (minor) | Any Imbalance | Max Imbalance |
|---|---|---|---|---|
| Sales | | | | |
| Purchase | | | | |
| Receipt | | | | |
| Payment | | | | |
| Journal | | | | |
| Reversal | | | | |

### Report Parity
| Report | REAL sum | Minor sum | Difference | PASS? |
|---|---|---|---|---|
| Trial Balance (debit) | | | | |
| Trial Balance (credit) | | | | |
| P&L (income) | | | | |
| P&L (expense) | | | | |
| Balance Sheet (asset) | | | | |
| Balance Sheet (liability) | | | | |
| Balance Sheet (equity) | | | | |

## Conclusions
- Safe to proceed: [YES / NO]
- Blocking issues: [list]
- Recommendation: [continue / fix and re-run]
