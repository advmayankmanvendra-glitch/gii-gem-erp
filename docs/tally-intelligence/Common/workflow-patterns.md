# Workflow Patterns

Common business workflows across Tally.ERP 9 and TallyPrime.

---

## 1. Sales Cycle

**Trigger:** Customer inquiry/requirement for goods or services.

**Steps:**
1. Quotation – Formal price quote sent to customer
2. Sales Order – Customer confirms intent to purchase
3. Delivery Note – Goods dispatched to customer
4. Sales Invoice – Bill raised for delivered goods/services
5. Receipt – Payment received from customer

**Tally Entities Involved:**
- Quotation (Voucher Type)
- Sales Order (Voucher Type)
- Delivery Note (Voucher Type)
- Sales Invoice (Voucher Type)
- Receipt (Voucher Type)
- Ledger (Debtor/Customer, Sales, Tax)
- Stock Item

**Approval Flow:**
- Quotation → Manager approval (if configured)
- Sales Order → Credit limit check
- Delivery Note → Inventory availability check
- Sales Invoice → Tax validation
- Receipt → Bank reconciliation

**Reports Generated:**
- Pending Sales Orders
- Outstanding Receivables
- Sales Register
- Invoice-wise Profitability
- Customer Outstanding (Ageing)
- GST Sales Report

---

## 2. Purchase Cycle

**Trigger:** Reorder level reached or requisition raised for inventory.

**Steps:**
1. Purchase Order – Order placed with supplier
2. Receipt Note – Goods received from supplier
3. Purchase Invoice – Supplier bill accounted
4. Payment – Payment made to supplier

**Tally Entities Involved:**
- Purchase Order (Voucher Type)
- Receipt Note (Voucher Type)
- Purchase Invoice (Voucher Type)
- Payment (Voucher Type)
- Ledger (Creditor/Supplier, Purchase, Tax, Expenses)
- Stock Item

**Approval Flow:**
- Purchase Order → Budget holder / Manager approval
- Receipt Note → Quality / quantity verification
- Purchase Invoice → Matching with PO and Receipt Note (Three-way match)
- Payment → Due date / credit period check

**Reports Generated:**
- Pending Purchase Orders
- Outstanding Payables
- Purchase Register
- Supplier Outstanding (Ageing)
- Stock-in-hand Valuation
- GST Purchase Report / Input Credit

---

## 3. Inventory Cycle

**Trigger:** Stock adjustments, transfers, or production activities.

**Steps:**
1. Stock Journal – Adjust stock quantities (add/remove)
2. Physical Stock – Actual stock count verification
3. Godown Transfer – Move stock between warehouses
4. Assembly/Production – Combine/split stock items

**Tally Entities Involved:**
- Stock Journal (Voucher Type)
- Physical Stock Voucher
- Stock Transfer (Godown Transfer)
- Manufacturing/Production Journal
- Stock Item
- Stock Group
- Godown
- Unit

**Approval Flow:**
- Stock Journal → Supervisor/Manager approval
- Physical Stock → Verification by store in-charge
- Godown Transfer → Authorisation from source godown
- Assembly → Bill of Materials validation

**Reports Generated:**
- Stock Summary
- Inventory Ageing
- Stock Movement Analysis
- Godown-wise Stock
- Physical Stock Variance Report
- Production Summary

---

## 4. Accounting Cycle

**Trigger:** Non-cash/non-inventory transactions or adjustments.

**Steps:**
1. Journal Voucher – Adjustments, credit purchases, rectifications
2. Contra – Transfer between bank/cash accounts
3. Payment – Outflow of funds
4. Receipt – Inflow of funds
5. Credit Note – Sales return / reduction in receivable
6. Debit Note – Purchase return / reduction in payable

**Tally Entities Involved:**
- Journal (Voucher Type)
- Contra (Voucher Type)
- Payment (Voucher Type)
- Receipt (Voucher Type)
- Credit Note (Voucher Type)
- Debit Note (Voucher Type)
- Ledger (all groups)
- Cost Centre / Cost Category

**Approval Flow:**
- Journal Voucher → Double-entry validation (debits = credits)
- Contra → Bank balance confirmation
- Payment → Authorisation matrix (amount thresholds)
- Receipt → Allocation against outstanding invoices
- Credit/Debit Note → Linked to original invoice

**Reports Generated:**
- Day Book
- Account Books (Ledger)
- Trial Balance
- Profit & Loss Statement
- Balance Sheet
- Cash Flow Statement
- Funds Flow Statement

---

## 5. GST Compliance Flow

**Trigger:** Taxable outward or inward supply.

**Steps:**
1. Invoice – Generate GST-compliant sales/purchase invoice
2. GSTR-1 – Report outward supplies (monthly/quarterly)
3. GSTR-3B – Summary return with payment
4. Payment – Deposit tax liability
5. GSTR-9 – Annual return reconciliation

**Tally Entities Involved:**
- Sales Invoice / Purchase Invoice (Voucher Types)
- GST Ledgers (CGST, SGST, IGST, Cess)
- GST Rate Groups
- HSN/SAC Masters
- E-way Bill / E-invoice references
- GST Returns (Reports)

**Approval Flow:**
- Invoice → GSTIN validation, HSN/SAC correctness
- GSTR-1 → Auto-populated from invoices; manual review recommended
- GSTR-3B → Ensure 2A/2B reconciliation before filing
- Payment → Challan generation
- GSTR-9 → Audit trail verification

**Reports Generated:**
- GSTR-1 Return
- GSTR-3B Return
- GSTR-2A / GSTR-2B (Inward Supply)
- GSTR-9 Annual Return
- Input Tax Credit (ITC) Register
- Output Tax Liability Register
- E-way Bill Register
- E-invoice Register

---

## 6. Period-end Process

**Trigger:** End of financial period (month/quarter/year).

**Steps:**
1. Depreciation – Calculate and post asset depreciation
2. Accruals – Record outstanding incomes/expenses
3. Adjustments – Rectification entries, reclassification
4. Closing – Finalise books, transfer P&L to Capital Account
5. Opening – Create opening balances for next period

**Tally Entities Involved:**
- Journal (Voucher Type)
- Fixed Asset Ledgers
- Depreciation Ledger
- Outstanding/Prepaid Expense Ledgers
- Profit & Loss Account
- Capital Account
- Stock Valuation

**Approval Flow:**
- Depreciation → Fixed asset register verification
- Accruals → Supporting documents (contracts, invoices)
- Adjustments → CFO/Partner approval
- Closing → Board / Auditor sign-off
- Opening → Verification of previous period closing

**Reports Generated:**
- Fixed Asset Schedule
- Depreciation Report
- Prepaid / Accrual Schedule
- Trial Balance (Pre-close)
- Final Trial Balance (Post-close)
- Profit & Loss Account
- Balance Sheet
- Closing Stock Report
- Opening Balance Confirmation

---

## 7. Multi-company Flow

**Trigger:** Multiple group entities requiring consolidated reporting or inter-company transactions.

**Steps:**
1. Consolidation – Aggregate financials of all group companies
2. Inter-company Transfers – Transactions between related entities

**Tally Entities Involved:**
- Multiple Company Masters
- Inter-company Ledgers (Current Accounts)
- Stock Transfers (Inter-company)
- Consolidation Group
- Elimination Ledgers

**Approval Flow:**
- Consolidation → Eliminate inter-company balances and transactions
- Inter-company Transfer → Arm's length pricing, documentation

**Reports Generated:**
- Consolidated Balance Sheet
- Consolidated P&L
- Inter-company Reconciliation Statement
- Inter-company Outstanding Report
- Minority Interest Report
- Segment Reporting
