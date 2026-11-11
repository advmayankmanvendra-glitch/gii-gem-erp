# GII GeM ERP — Workflow Map

> Complete end-to-end workflow reference for the GII GeM ERP system.
> Covers supply-to-billing, billing-to-receivable, procurement-to-stock, stock-to-invoice, voucher-to-financials, document-to-closure, profitability, status flows, data dependencies, and reports.

---

## 1. Supply to Billing Workflow

```
Supply Order → Procurement Requirement → Supplier Procurement → GRN → Stock Receipt → Stock Reservation → Stock Issue / Delivery → Delivery Challan → Billing / GST Invoice
```

### Step 1: Supply Order
- **Purpose**: Record government supply order
- **Source**: Government department issues supply order
- **Module**: Operations > Orders > Supply Orders
- **Data**: order_number, department, institution, items (with quantities, rates, GST), employee, due date
- **Documents**: Supply order copy (PDF)
- **Output**: Draft supply order record, can be edited until finalized
- **Status**: User-defined (e.g., Active, Completed)
- **Reports affected**: Order Lifecycle, Order Items, Pending Procurement
- **Impact**: None on accounting/inventory/GST initially

### Step 2: Procurement Requirement
- **Purpose**: Identify items that need to be procured (not in stock)
- **Source**: Supply order items vs available stock
- **Module**: Inventory > Planning > Procurement Requirements
- **Data**: Auto-calculated shortage from stock reservations + stock on hand
- **Documents**: Purchase requisition (optional)
- **Output**: List of items to procure

### Step 3: Supplier Procurement
- **Purpose**: Purchase items from supplier
- **Source**: Supply order reference
- **Module**: Operations > Procurement
- **Data**: supplier, purchase invoice number/date, items/quantities/rates, freight, loading charges
- **Documents**: Supplier invoice, delivery challan
- **Posting**: Creates purchase voucher (debit Purchase, debit Input GST, credit Trade Payables)
- **Status**: Draft until posted
- **Reports affected**: Purchase Bills, GRN Status, Profitability
- **Accounting Impact**: Purchase account debited, Input GST debited, Trade Payables credited
- **Inventory Impact**: None until GRN/Stock Inward
- **GST Impact**: Input GST recorded

### Step 4: GRN (Goods Receipt Note)
- **Purpose**: Record physical receipt of goods from supplier
- **Source**: Procurement record
- **Module**: Inventory > Documents > Goods Receipt Notes
- **Data**: received quantity, damaged quantity, accepted quantity
- **Output**: GRN record linked to procurement
- **Status**: Draft, Confirmed
- **Documents**: Delivery challan from supplier

### Step 5: Stock Receipt (Stock Inward)
- **Purpose**: Post received goods into warehouse stock
- **Source**: GRN or direct procurement
- **Module**: Inventory > Transactions > Stock Inward
- **Data**: warehouse, item, quantity, rate, landed cost
- **Posting**: Creates stock ledger entry (inward)
- **Status**: Draft until posted
- **Inventory Impact**: Increases stock quantity and value
- **Reports affected**: Stock Summary, Stock Ledger, Stock Valuation

### Step 6: Stock Reservation
- **Purpose**: Reserve stock for specific supply order
- **Source**: Supply order items
- **Module**: Inventory > Planning > Stock Reservations
- **Data**: order, item, warehouse, reserved quantity
- **Auto-reserve**: Available via "Auto Reserve" action
- **Status**: Active, Issued, Cancelled, Partial

### Step 7: Stock Issue / Delivery
- **Purpose**: Issue stock from warehouse for delivery to department
- **Source**: Supply order → reserved stock
- **Module**: Inventory > Transactions > Stock Outward
- **Data**: order, department, item, quantity, warehouse
- **Posting**: Creates stock ledger (outward), COGS entry
- **Status**: Draft until posted
- **Inventory Impact**: Decreases stock, records cost of goods sold
- **Reports affected**: Stock Issue vs Billing, COGS Report, Inventory Profitability

### Step 8: Delivery Challan
- **Purpose**: Confirm delivery to department
- **Source**: Stock outward
- **Module**: Inventory > Documents > Delivery Challans
- **Data**: challan number, dispatch date, vehicle details, items
- **Confirmation**: Updates status to Confirmed
- **Documents**: Delivery challan (PDF)
- **Status**: Draft, Confirmed

### Step 9: Billing / GST Invoice
- **Purpose**: Create invoice for delivered goods
- **Source**: Supply order + delivery details
- **Module**: Operations > Billing
- **Data**: invoice number, date, items/quantities/rates, GST, department
- **Posting**: Creates sales voucher (debit Trade Receivables, credit Sales, credit Output GST)
- **Readiness**: Checks items procured, issued, CRAC, documents
- **Status**: Draft → Pending Approval → Approved → Posted → Paid/Closed or Reversed
- **Documents**: Invoice copy, delivery challan, installation report, CRAC, OEM authorization
- **Accounting Impact**: Trade Receivables debited, Sales credited, Output GST credited
- **GST Impact**: Output GST recorded
- **Reports affected**: Billing Pending, Order Profitability, Stock Issue vs Billing, Posting Status

---

## 2. Billing to Receivable Workflow

```
Invoice Posted → Receivable Created → Payment Received → Allocation → Outstanding Updated
```

### Step 1: Invoice Posted
- Posting creates receivable record
- Receivable amount = invoice taxable value + GST = gross value

### Step 2: Receivable Created
- **Table**: receivables
- **Fields**: billing_id, department_id, invoice_amount, balance_outstanding = invoice_amount
- **Status**: Open
- **Due date**: from credit terms or default 30 days

### Step 3: Payment Received
- **Module**: Operations > Collections
- **Data**: UTR, amount, TDS, GST TDS, bank
- Can be partial or full payment

### Step 4: Receipt Allocation
- **Module**: Receivables & Payables > Allocations
- Allocate payment to specific invoice
- TDS/GST TDS recorded as deductions
- Advance adjustment if applicable

### Step 5: Outstanding Updated
- `refreshReceivable()` recalculates balance_outstanding
- Status changes to Closed when balance ≤ 0
- **Allocation status**: Unallocated, Partially Allocated, Fully Allocated, Excess

---

## 3. Procurement to Stock Workflow

```
Procurement Posted → GRN Created → Stock Inward Posted → Stock Ledger Updated
```

| Step | Action | Module | Impact |
|------|--------|--------|--------|
| 1 | Procurement Posted | Operations > Procurement | Purchase voucher created; Purchase (Dr), Input GST (Dr), Trade Payables (Cr) |
| 2 | GRN Created | Inventory > Documents > GRN | Records physical receipt; accepted/damaged quantity tracking |
| 3 | Stock Inward Posted | Inventory > Transactions > Stock Inward | Stock ledger entry (inward); increases stock quantity & value |
| 4 | Stock Ledger Updated | Inventory > Reports > Stock Ledger | Reflects current stock position with landed cost |

---

## 4. Stock to Invoice Workflow

```
Stock Reserved → Stock Outward → Delivery Challan Confirmed → Invoice Created → Billing Posted
```

| Step | Action | Module | Impact |
|------|--------|--------|--------|
| 1 | Stock Reserved | Inventory > Planning > Stock Reservations | Locks inventory for specific supply order |
| 2 | Stock Outward Posted | Inventory > Transactions > Stock Outward | Stock ledger (outward); records COGS |
| 3 | Delivery Challan Confirmed | Inventory > Documents > Delivery Challans | Confirms dispatch to department |
| 4 | Invoice Created | Operations > Billing | Draft invoice with items, rates, GST |
| 5 | Billing Posted | Operations > Billing | Sales voucher created; Receivables (Dr), Sales (Cr), Output GST (Cr) |

---

## 5. Voucher to Financial Statements Workflow

```
Business Transaction → Posting → Voucher Created → Ledger Entries → Trial Balance → Profit & Loss → Balance Sheet
```

### Voucher Types

| Voucher Type | Purpose | Debit | Credit |
|---|---|---|---|
| Sales Voucher | Billing invoice posting | Trade Receivables | Sales, Output GST |
| Purchase Voucher | Procurement posting | Purchase, Input GST | Trade Payables |
| Receipt Voucher | Payment/receipt posting | Bank/Cash, TDS Receivable, GST TDS Receivable | Trade Receivables |
| Expense Voucher | Expense entry posting | Expense Head | Trade Payables / Bank |
| Payment Voucher | Supplier payment posting | Trade Payables | Bank/Cash |
| Contra Voucher | Cash/bank transfer | Bank A (or Cash) | Bank B (or Bank) |
| Credit Note | Receivable/sales correction | Sales, Output GST | Trade Receivables |
| Debit Note | Payable/purchase correction | Trade Payables | Purchase, Input GST |
| Journal Voucher | Manual adjustment | Various | Various |
| Opening Balance Voucher | Period opening | Opening balances | Opening balances |
| Year End Voucher | Period closing | Revenue accounts | Expense accounts |

### Ledger Impact

```
Sales Voucher:
  Trade Receivables (Dr)  ← Invoice amount
  Sales (Cr)               ← Taxable value
  Output GST (Cr)          ← GST amount

Purchase Voucher:
  Purchase (Dr)            ← Taxable value
  Input GST (Dr)           ← GST amount
  Trade Payables (Cr)      ← Gross amount

Receipt Voucher:
  Bank/Cash (Dr)           ← Amount received
  TDS Receivable (Dr)      ← TDS deducted by department
  GST TDS Receivable (Dr)  ← GST TDS deducted
  Trade Receivables (Cr)   ← Invoice amount

Expense Voucher:
  Expense Head (Dr)        ← Expense amount
  Trade Payables / Bank (Cr) ← Liability or cash

Contra Voucher:
  Bank A (Dr) | Bank (Dr)
  Bank B (Cr) | Cash (Cr)
```

### Financial Statement Impact

```
Trial Balance:
  All ledger entries aggregated by account
  Verifies: Total Debits = Total Credits

Profit & Loss:
  Income:  Sales (Cr balances)
  Expense: Purchase (Dr), Expenses (Dr)
  Net Profit = Sales - Purchase - Expenses

Balance Sheet:
  Assets   = Bank + Trade Receivables + TDS Receivable + Stock
  Liabilities = Trade Payables + Output GST Payable
  Equity   = Capital + Reserves + Net Profit (or - Net Loss)
  Equation: Assets = Liabilities + Equity
```

---

## 6. Documents to Order Closure Workflow

```
Documents Upload → Document Checklist → Readiness Verification → CRAC Entry → Payment Readiness → Order Closure
```

### Document Types by Module

| Module | Document Types |
|--------|---------------|
| Supply Orders | Supply Order copy, OEM Authorization |
| Invoices | Invoice Copy, Delivery Challan, Installation Report, CRAC |
| Payments | Payment Proof, UTR |

### CRAC Workflow

```
CRAC Entry → CRAC Tracker → Linked to Invoice → Payment Readiness
```

- **CRAC Status**: Pending → Generated → Verified → Closed
- CRAC is a mandatory document for payment processing
- Linked to both supply order and invoice

### Order Closure

**Closure Checklist** (all must be satisfied):
- [ ] All items procured
- [ ] All items issued
- [ ] All items billed
- [ ] All payments received
- [ ] All documents attached
- [ ] CRAC completed
- [ ] All expenses posted
- [ ] Profitability reviewed

Once checklist is complete, order is marked for operational closure.

---

## 7. Profitability to Management Reports Workflow

```
Billing Posted → Profitability Calculated → Reports Generated
```

### Profitability Formula

| Component | Calculation |
|---|---|
| Gross Margin | Billing Value − Inventory Cost (issued stock cost or purchase cost) |
| GST Impact | Gross Margin × GST Rate |
| Total Expenses | Fixed expenses + Percentage-based expenses |
| Employee Incentive | (Gross Margin − GST Impact − Expenses) × Incentive % |
| Net Company Profit | Gross Margin − GST Impact − Expenses − Employee Incentive |
| ROI | (Net Profit / Purchase Cost) × 100 |

Profitability is recalculated on every billing posting and on expense entry posting.

---

## 8. Complete Status Flow Diagrams

### Invoice
```
Draft → Pending Approval → Approved → Posted → Paid → Closed
                                          └→ Reversed
```

### Procurement
```
Draft → [Pending Approval] → Posted → [Reversed]
```

### Stock Inward
```
Draft → [Pending Approval] → Posted
```

### Stock Outward
```
Draft → [Pending Approval] → Posted
```

### Payment (Receipt)
```
Draft → [Pending Approval] → Posted → [Reversed]
```

### Expense
```
Draft → [Pending Approval] → Posted
```

### Receivable
```
Open → [Partially Allocated] → [Fully Allocated] → Closed
```

### Financial Year
```
Open → [Closed] → [Locked] → [Reopened]
```

### Guided Voucher
```
Draft → Submitted → Reviewed → Approved → Posted → [Reversed]
```

**Legend**: `[ ]` = optional / conditional state, `→` = required progression

---

## 9. Data Dependency Graph

```
Supply Order
├── Procurement (needs order_id)
├── Expense Entry (needs order_id)
├── Billing Invoice (needs order_id)
├── Delivery Challan (needs order_id)
├── Stock Reservation (needs order_id)
└── CRAC (needs order_id)

Procurement
├── GRN (needs procurement_id)
├── Stock Inward (needs procurement_id)
└── Supplier Payment Allocation (needs procurement_id)

Invoice (Billing)
├── Receivable (created on posting)
├── Payment Allocation (needs billing_id)
└── CRAC (needs invoice_id)

Payment (Receipt)
└── Payment Allocation (needs payment_id)

Voucher
├── Ledger Entries (created on posting)
├── Receivable / Payable (updated on posting)
└── Trial Balance / P&L / Balance Sheet (from ledger entries)
```

---

## 10. Reports Dependency Map

| Report | Primary Data Source | Key Tables / Views |
|---|---|---|
| Trial Balance | Voucher posted → ledger entries | `ledger_entries`, `accounts` |
| Profit & Loss | Ledger entries grouped by account type | `ledger_entries`, `account_types` |
| Balance Sheet | Ledger entries grouped by account type | `ledger_entries`, `account_types` |
| GST Register | Vouchers filtered by GST account type | `vouchers`, `ledger_entries` |
| TDS Register | Receivables + payment allocations | `receivables`, `payment_allocations` |
| Receivables | Receivables table | `receivables` |
| Payables | Supplier payments + allocations | `supplier_payments`, `supplier_payment_allocations` |
| Stock Summary | Stock ledger aggregated by item/warehouse | `stock_ledger` |
| Stock Ledger | Stock ledger detailed entries | `stock_ledger` |
| Profitability | Invoices + procurements + expenses + stock ledger | `invoices`, `procurements`, `expense_entries`, `stock_ledger` |
| Order Lifecycle | Supply orders + procurements + invoices + payments + delivery challans + documents + CRAC | `supply_orders`, `procurements`, `invoices`, `payments`, `delivery_challans`, `documents`, `crac_records` |
| Stock Issue vs Billing | Stock outward + invoice items | `stock_outward_items`, `invoice_items` |
| COGS Report | Stock outward + stock ledger | `stock_outward_items`, `stock_ledger` |
| Billing Pending | Invoices with status < Posted | `invoices` |
| Purchase Bills | Procurement records | `procurements` |
| GRN Status | GRN records linked to procurements | `grns`, `procurements` |
| Pending Procurement | Supply order items − stock reserved | `supply_order_items`, `stock_reservations` |

---

*End of Workflow Map*
