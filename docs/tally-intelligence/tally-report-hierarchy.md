# Tally Report Hierarchy

## Overview

TallyPrime provides a comprehensive set of standard reports organized by accounting, inventory, taxation, and utilities. This document catalogs the report hierarchy as relevant to the GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED data.

## Accounting Reports

### 1. Trial Balance

Shows the closing balance of every ledger, arranged by group hierarchy.

- **Source**: All ledger balances
- **Columns**: Ledger Name, Group, Debit Balance, Credit Balance
- **Filters**: Date range, group selection
- **Use**: Verify double-entry balance; base for P&L and Balance Sheet

### 2. Profit & Loss A/c (P&L)

Shows revenue and expense ledgers for a period, calculating net profit/loss.

- **Source**: All revenue (Income/Expense) ledgers
- **Sections**: Direct Income, Direct Expenses (Gross Profit), Indirect Income, Indirect Expenses (Net Profit)
- **Filters**: Financial year / period
- **Key**: Gross Profit = Sales - Direct Expenses; Net Profit = Gross Profit + Indirect Income - Indirect Expenses

### 3. Balance Sheet

Shows assets, liabilities, and capital at a given date.

- **Source**: Non-revenue ledgers (Assets, Liabilities, Capital)
- **Structure**:
  ```
  Liabilities + Capital
  ├── Capital Account
  ├── Current Liabilities
  │   ├── Sundry Creditors
  │   ├── Duties & Taxes
  │   └── Provisions
  ├── Loans
  └── Net Profit (from P&L)
  ──────────────────────────
  Assets
  ├── Current Assets
  │   ├── Bank Accounts
  │   ├── Cash-in-Hand
  │   ├── Sundry Debtors
  │   └── Stock-in-Hand
  ├── Fixed Assets
  └── Investments
  ```

### 4. Day Book

Chronological listing of all vouchers for a day or period.

- **Source**: All transactions
- **Columns**: Date, Voucher Type, Voucher Number, Party, Debit, Credit
- **Filters**: Date range, voucher type
- **Sub-types**: Sales Register, Purchase Register, Payment Register, Receipt Register, Journal Register, Contra Register

### 5. Account Statement

Ledger-wise transaction details with running balance.

- **Source**: Individual ledger transactions
- **Format**: Date, Particulars, Voucher Type, Vch No., Debit, Credit, Balance
- **Also known as**: Ledger Voucher View

### 6. Cash Flow / Fund Flow

Movement of cash and fund between periods.

- **Source**: Cash/Bank ledger transactions
- **Categories**: Operating, Investing, Financing activities

## Inventory Reports

### 7. Stock Summary

Quantity and value summary by stock group.

- **Source**: Stock items, groups, valuation
- **Columns**: Stock Group/Item, Opening Qty, Opening Value, Inward Qty, Inward Value, Outward Qty, Outward Value, Closing Qty, Closing Value
- **Valuation**: Based on stock group valuation method (Avg. Price)

### 8. Stock Ledger

Individual stock item movement with running balance.

- **Source**: Inventory transactions per item
- **Columns**: Date, Voucher Type, Vch No., Inward Qty, Outward Qty, Rate, Value, Closing Qty, Closing Value

### 9. Stock Item Report

Detailed analysis of a single stock item.

- **Fields**: Opening balance, receipts, issues, closing, average rate, reorder level

### 10. Stock Category Summary

Stock summary grouped by stock categories (alternate classification).

- **Source**: Stock items categorized by STOCKCATEGORY

### 11. Godown / Warehouse Stock

Stock available at each godown/warehouse location.

- **Source**: Batch allocations on inventory entries

## GST Reports

### 12. GST Register

Summary of GST transactions for compliance.

- **Types**:
  | Report | Description |
  |--------|-------------|
  | GSTR-1 | Outward supplies (Sales) |
  | GSTR-3B | Monthly summary return |
  | GSTR-2A | Inward supplies (auto-drafted from vendor returns) |
  | GST Tax Ledger | Output vs Input GST balance |

### 13. GST Details Report

GST-wise transaction breakdown.

- **Columns**: GST Rate, Taxable Value, CGST, SGST/UTGST, IGST, Cess
- **Filters**: Period, GST registration type, HSN/SAC

### 14. HSN/SAC Summary

GST rate summary by HSN (Goods) or SAC (Services) code.

- **Source**: Stock item HSN details
- **Useful for**: GSTR-1 HSN-wise summary

## Tax Reports (Non-GST)

### 15. TDS Reports
- TDS Challan Statement
- TDS Deduction Report
- Form 16 / Form 16A
- TDS Outstanding

### 16. TCS Reports
- TCS Collection Report
- TCS Challan Statement

## MIS Reports

### 17. Ratio Analysis

- Current Ratio, Quick Ratio, Debt-Equity Ratio, Gross Profit Ratio, Net Profit Ratio

### 18. Key Financial Indicators

- Working capital, EBITDA, ROCE (where data permits)

### 19. Budget Variance

- Comparison of actual vs. budgeted figures (requires budget masters)

## Register Views (Voucher Type Filters)

| Register | Voucher Types Included |
|----------|----------------------|
| Sales Register | Sales, Credit Note |
| Purchase Register | Purchase, Debit Note |
| Payment Register | Payment, Contra (outward) |
| Receipt Register | Receipt, Contra (inward) |
| Journal Register | Journal |
| Contra Register | Contra |

## Utility Reports

### 20. Account Book
### 21. Statement of Accounts (Customer/Supplier)
### 22. Outstanding Reports (Bill-wise aging)
### 23. Statutory Reports (GST, TDS, TCS, VAT, Service Tax)

## Report Navigation in Tally

```
Gateway of Tally
├── Accounts Info (Masters)
├── Inventory Info (Masters)
├── Accounting Vouchers (Transactions)
├── Inventory Vouchers (Transactions)
└── Reports
    ├── Trial Balance
    ├── P&L Statement
    ├── Balance Sheet
    ├── Stock Summary
    ├── Day Book
    ├── List of Accounts
    │   ├── Ledgers
    │   └── Groups
    ├── Statement of Accounts
    │   ├── Outstanding
    │   ├── Ledger
    │   ├── O/s Receivables
    │   └── O/s Payables
    ├── Inventory Reports
    │   ├── Stock Summary
    │   ├── Stock Ledger
    │   ├── Stock Transfer
    │   └── Godown Summary
    ├── Tax Reports
    │   ├── GST
    │   ├── TDS
    │   ├── TCS
    │   └── Others
    └── MIS Reports
        ├── Ratio Analysis
        ├── Key Financials
        └── Budget Variance
```

## Report Data Access via XML

The `Tally.xml` file at `C:\Program Files\TallyPrime` stores per-period display data for certain reports (likely used for dashboard display). It contains month-wise net and closing balance information but does not represent the full transactional report data.

## Implications for GII GeM ERP

The GII ERP should replicate at minimum these reports:
1. Trial Balance — direct mapping from ledger balances
2. P&L Statement — from revenue ledgers
3. Balance Sheet — from asset/liability/capital ledgers
4. Stock Summary — from inventory transactions
5. Day Book — from voucher journal
6. GST Register — from GST-tagged transactions
7. Account Statement — from ledger-wise transaction view
