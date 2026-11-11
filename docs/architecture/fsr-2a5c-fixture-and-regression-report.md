# FSR-2A.5C Fixture and Regression Report

## Fixture Design

The verifier creates an in-memory SQLite database with 15 tables mirroring the application schema:

- Master data: companies, users, financial_years, government_departments, suppliers, items, warehouses, supply_orders
- Accounting: accounts, vouchers, voucher_lines, ledger_entries, opening_balances, carry_forward_entries
- Inventory: stock_ledger
- Operational: invoices, procurements, payments, supplier_payments, receivables

### Account Structure

32 accounts across 5 types:

| Type | Count | Example Accounts |
|------|-------|------------------|
| Asset | 10 | Cash, Bank, Inventory, Receivables, Fixed Asset, Accum Depr, Input GST, Prepaid, Supplier Advance, TDS Receivable |
| Liability | 8 | Trade Payables, GRNI, Output GST, Loan, Advance Receipt, Expense Accrual, TDS Payable |
| Equity | 4 | Capital, Drawings, Retained Earnings, Current Year Profit |
| Income | 3 | Sales, Discount Received, Inventory Adjustment Gain |
| Expense | 7 | COGS, Purchase, Salary, Rent, Depreciation, Discount Allowed, Round Off, Inventory Adjustment Loss |

### Opening Balances

Balanced: Cash ₹100,000 Dr + Bank ₹200,000 Dr = Capital ₹300,000 Cr.

## Lifecycle Transactions

22 vouchers spanning the complete government supply lifecycle:

| Voucher | Type | Description |
|---------|------|-------------|
| V1 | Journal | Stock inward (10 units @ ₹1,000) |
| V2 | Purchase | Supplier invoice + GST |
| V3 | Sales | Sale (5 units @ ₹1,250) + GST |
| V4 | Journal | COGS recognition |
| V5 | Receipt | Customer payment ₹5,000 |
| V6 | Payment | Supplier payment ₹5,000 |
| V7 | Journal | Department return (1 unit) |
| V8 | Payment | Salary ₹15,000 |
| V9 | Payment | Rent ₹5,000 |
| V10 | Payment | Fixed asset purchase ₹50,000 |
| V11 | Journal | Depreciation ₹5,000 |
| V12 | Journal | Loan ₹25,000 |
| V13 | Receipt | Advance receipt ₹3,000 |
| V14 | Payment | Supplier advance ₹2,000 |
| V15 | Journal | Expense accrual ₹2,000 |
| V16 | Payment | Prepaid expense ₹1,200 |
| V17 | Journal | Discount allowed ₹500 |
| V18 | Journal | Discount received ₹300 |
| V19 | Journal | Inventory adjustment gain ₹800 |
| V20 | Journal | Inventory adjustment loss ₹400 |
| V21 | Contra | Cash to bank ₹2,000 |
| V22 | Journal | Round-off ₹1 |
| V23 | Debit Note | Return to supplier (1 unit) |
| V24 | Credit Note | Customer credit note (1 unit) |

## Regression

The FSR-2A.5C verifier does not modify or replace any prior verifier. All prior verification suites remain intact:

- FSR-2A.5A: 81/81 PASS
- FSR-2A.5B: 89/89 PASS

No changes to `account-group mappings`, `statutory mappings`, `renderer heuristics`, or `comparative/statutory reports` were made during FSR-2A.5C.
