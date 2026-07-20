# FSR-2A.3 Report Consumption of Carry-Forward Entries

## Problem

Before FSR-2A.3, the `trialBalance` and `balanceSheetReport` functions had no awareness of `carry_forward_entries`. After a year close, the destination FY's reports showed zero opening balances for accounts that had balances in the source FY. Lack of carry-forward consumption prevented meaningful multi-year continuity.

## Trial Balance Consumption

In `reportBuilders.js:763-793`, `trialBalance` now uses correlated subqueries to incorporate carry-forward data:

```sql
debit:  COALESCE(SUM(le.debit), 0) + COALESCE(
          (SELECT COALESCE(SUM(cfe.opening_debit), 0)
           FROM carry_forward_entries cfe
           WHERE cfe.account_id = a.id
             AND cfe.company_id = a.company_id
             AND cfe.to_financial_year_id = ?),
          CASE WHEN a.normal_balance = 'Debit' THEN a.opening_balance ELSE 0 END
        )

credit: COALESCE(SUM(le.credit), 0) + COALESCE(
          (SELECT COALESCE(SUM(cfe.opening_credit), 0)
           FROM carry_forward_entries cfe WHERE ...),
          CASE WHEN a.normal_balance = 'Credit' THEN a.opening_balance ELSE 0 END
        )
```

Key properties:
- `SUM()` aggregates across multiple carry-forward rows for the same account (e.g., Capital may have one entry from BS close + one from profit transfer)
- `COALESCE(SUM(...), 0)` returns 0 when no carry-forward rows exist, then falls back to `a.opening_balance` for the init-time opening balance
- The `?` parameter is `fyId` (the destination financial year's ID from `financialYearForDate`)

## Balance Sheet Consumption

In `reportBuilders.js:829-861`, `balanceSheetReport` also uses correlated subqueries:

```sql
signed_opening: COALESCE(
                  CASE WHEN a.normal_balance = 'Debit'
                    THEN (SELECT SUM(cfe.opening_debit) - SUM(cfe.opening_credit) FROM ...)
                    ELSE (SELECT SUM(cfe.opening_credit) - SUM(cfe.opening_debit) FROM ...)
                  END,
                  a.opening_balance
                )
```

The `COALESCE` ensures that when no carry-forward rows exist for the FY, the report falls back to the account's `opening_balance` from the accounts table. The `SUM()` aggregation inside the subquery handles multiple rows per account correctly.

## Ledger Entry Scoping

For the Balance Sheet, ledger entries are scoped to `entry_date BETWEEN fyStart AND dateTo` (where `fyStart` is the start date of the FY containing `dateTo`). This prevents double-counting carry-forward amounts plus their original historical entries.

The Trial Balance uses the caller-supplied `dateFrom` and `dateTo` (`le.entry_date BETWEEN ? AND ?`).

## Profit & Loss Report

`profitLossReport` is not modified — it does not consume carry-forward entries (income and expense accounts are zeroed at year end and should not be carried).

## Verifier Coverage

FSR-2A.3 checks 19-21 verify that the destination FY's opening reports consume carry-forward correctly:
| Check | Report | Expectation |
|---|---|---|
| 19 | Destination TB | Dr = Cr (balanced, includes carry-forward) |
| 20 | Destination BS | assets = liabilitiesAndEquity (signed, includes carry-forward) |
| 21 | Destination P&L | netProfit = 0 (no income/expense carried) |
