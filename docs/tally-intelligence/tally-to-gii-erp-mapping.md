# Tally to GII GeM ERP Mapping

## Overview

This document provides the initial mapping between TallyPrime concepts (as found in the GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED data) and the GII GeM ERP modules. This mapping serves as a reference for data migration and system integration planning.

## 1. Company / Organization

| Tally Entity | GII ERP Module | Notes |
|-------------|----------------|-------|
| Company: GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED | Organization / Tenant | GSTIN: 10AAJCG3823D1Z7, State: Bihar, Registration: Regular |
| Financial Year | Fiscal Year | Tally uses 1-Apr to 31-Mar; map to ERP fiscal period |
| GST Registration | Tax Registration | Single registration found; handle multi-state if needed |

## 2. Accounting Masters

| Tally Entity | GII ERP Module | Mapping Notes |
|-------------|----------------|---------------|
| Groups (e.g., Bank Accounts, Current Assets) | Chart of Accounts / Account Groups | Map parent-child hierarchy. Tally has ~60+ reserved group types; GII ERP should adopt same hierarchy or map to equivalent. |
| Ledgers (e.g., Axis Bank, Sundry Debtors) | Chart of Accounts / General Ledger | Map PARENT to account group. Opening balance with Dr/Cr status. |
| Ledger - Opening Balance | Opening Balance Entry | OBSTATUS (Dr/Cr) determines sign convention |
| Ledger - Currency | Currency Master | All ledgers appear to use INR (&#x20;) |
| Ledger - Cost Centre | Cost Centre / Department | Only active if ISCOSTCENTRESON=Yes |
| Ledger - Mailing Name | Alternate Name / Alias | Used in reporting |

### Mapping Table: Reserved Groups

| Tally Reserved Group | GII ERP Account Type |
|---------------------|---------------------|
| Current Assets | Current Asset |
| Bank Accounts | Bank Account |
| Cash-in-Hand | Cash |
| Stock-in-Hand | Inventory Asset |
| Sundry Debtors | Accounts Receivable |
| Sundry Creditors | Accounts Payable |
| Fixed Assets | Fixed Asset |
| Capital Account | Equity / Capital |
| Direct Income | Revenue - Direct |
| Indirect Income | Revenue - Indirect |
| Direct Expenses | Expense - Direct |
| Indirect Expenses | Expense - Indirect |
| Sales Accounts | Sales Revenue |
| Purchase Accounts | Cost of Goods Sold |
| Duties & Taxes | Tax Payable |
| Provisions | Accrued Expenses |
| Loans (Liabilities) | Long-term / Short-term Borrowings |
| Investments | Investment Asset |
| Suspense A/c | Suspense / Clearing |

## 3. Inventory Masters

| Tally Entity | GII ERP Module | Mapping Notes |
|-------------|----------------|---------------|
| Stock Groups | Item Groups / Product Categories | Maintain hierarchy; map costing method (Avg. Cost) |
| Stock Items | Item Master / Product Catalog | Primary mapping. Fields: Name, Base Units, Opening Qty, Opening Rate, Avg Rate |
| Stock Categories | Item Categories | Alternative classification (not hierarchical) |
| Units (BAG, BOX, PCS) | Unit of Measure (UoM) | Map with UQC codes: BAG→BAGS, BOX→BOX, PCS→PCS |
| Godowns (in batch allocations) | Warehouses / Stores | Names from INVENTORYENTRIESINVOICE.LIST.BATCHALLOCATIONS |

## 4. Transactions

| Tally Entity | GII ERP Module | Mapping Notes |
|-------------|----------------|---------------|
| Receipt Voucher | Payment Receipt / Customer Receipt | Map party → customer; bank/cash → payment method |
| Payment Voucher | Payment Voucher / Supplier Payment | Map party → supplier; include bank charges if present |
| Sales Voucher | Sales Invoice / GST Invoice | Map to ERP sales module. Includes inventory, GST, party details |
| Purchase Voucher | Purchase Invoice / Purchase Entry | Map to ERP purchase module. Includes inventory, GST, supplier details |
| Journal Voucher | Journal Entry / Adjustments | Map multi-ledger entries; handle contra entries |
| Contra Voucher | Bank Transfer / Cash Deposit | Map to cash management module |
| Credit Note | Sales Return / Credit Note | Reverse of sales; map to sales return module |
| Debit Note | Purchase Return / Debit Note | Reverse of purchase; map to purchase return module |
| Payment on Account | Advance Payment | If bill-wise tracking is enabled, map to advance receipts/payments |

## 5. Taxation

| Tally Entity | GII ERP Module | Mapping Notes |
|-------------|----------------|---------------|
| GST Registration Type (Regular) | GST Registration | Single state (Bihar); intra-state = CGST+SGST |
| GSTIN (10AAJCG3823D1Z7) | Company GSTIN | Primary GSTIN |
| Output GST (CGST, SGST, IGST) | Output Tax Ledgers | Map to tax rate-based ledgers |
| Input GST (CGST, SGST, IGST) | Input Tax Ledgers | Map to tax rate-based ledgers |
| GST Rate | Tax Rate Master | Extract distinct rates from GSTDETAILS |
| HSN/SAC Code | HSN/SAC Master | Map to item master |
| Place of Supply | Place of Supply | Intra-state (Bihar) vs. Inter-state |
| Reverse Charge | Reverse Charge Flag | ISREVERSECHARGEAPPLICABLE |
| E-Way Bill | E-Way Bill Integration | ISEWAYAPPLICABLE flag on voucher types |

## 6. Voucher Configuration

| Tally Entity | GII ERP Module | Mapping Notes |
|-------------|----------------|---------------|
| Voucher Types | Transaction Types / Document Types | Numbering method (Automatic/Manual), prefix/suffix |
| Number Series | Document Number Series | Restart frequency (Yearly/Monthly), beginning number |

## 7. Reports (GII ERP Equivalents)

| Tally Report | GII ERP Report |
|-------------|----------------|
| Trial Balance | Trial Balance / General Ledger Summary |
| Profit & Loss A/c | Income Statement / Profit & Loss |
| Balance Sheet | Balance Sheet |
| Stock Summary | Inventory Summary / Stock Status |
| Stock Ledger | Inventory Movement / Stock Card |
| Day Book | Transaction Journal / Voucher Register |
| Account Statement | Ledger Inquiry / Account Statement |
| GST Register | GST Returns / GST Reports |
| GSTR-1 / GSTR-3B | GSTR-1 / GSTR-3B Compliance Reports |
| Outstanding Report | Accounts Receivable / Payable Aging |
| Ratio Analysis | Financial Ratios / MIS Dashboard |

## 8. Non-Migratable Items

| Tally Feature | Reason |
|--------------|--------|
| Custom TDL forms/reports | Source code not available (only .tcp files) |
| TallyCapital plugin | Third-party .dll + .tcp; business logic unknown |
| Tally-specific auto-calculation logic (ACME SelectedLineTotal) | No source; behavior undetermined |
| Attendance vouchers | Data present but concept may differ in ERP |
| Beneficiary Management | Export exists; integration with ERP needs design |

## 9. Data Flow for Migration

```
Tally XML Files
    ↓ (XML Parsing)
Staging Database (ETL)
    ↓ (Transformation & Validation)
GII GeM ERP Database
    ↓ (Post-Migration Verification)
Comparison Reports (Tally vs. ERP)
```

### Key ETL Steps

1. **Extract**: Parse all 10 XML files using UTF-16 LE-aware parser
2. **Transform**: Resolve parent-child references, convert Dr/Cr conventions, map group names
3. **Validate**: Balance check (Trial Balance must match), inventory valuation cross-check
4. **Load**: Insert into ERP tables in dependency order (Groups → Ledgers → Stock Groups → Stock Items → Voucher Types → Vouchers)
5. **Verify**: Run comparative reports between Tally closing data and ERP postings
