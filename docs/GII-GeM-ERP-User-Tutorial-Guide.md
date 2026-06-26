# GII GeM ERP — User Tutorial Guide

> **Version:** 1.0  
> **Platform:** Windows Desktop  
> **Last Updated:** June 2026

---

## 1. Quick Start

### What is GII GeM ERP?

GII GeM ERP is a comprehensive **Government supply and procurement management system** built for Windows desktop. It manages the entire lifecycle of government contracts from supply order receipt through procurement, inventory, billing, collections, and final closure — with full accounting, GST/TDS compliance, and profitability tracking built in.

Key capabilities:
- **Supply Order Management** — record and track government purchase orders
- **Procurement & GRN** — manage supplier purchases and goods receipt
- **Inventory** — stock inward/outward/adjustment/transfer with full ledger
- **Billing & GST Invoicing** — generate government invoices with GST compliance
- **Receivables & Payables** — track department dues and supplier obligations
- **Accounting** — double-entry bookkeeping with Trial Balance, P&L, Balance Sheet
- **GST & TDS** — registers, reconciliation, returns
- **Profitability** — order/department/supplier/employee level with simulator
- **Expenses** — authorization, transport, installation, L1 charges
- **Bank Reconciliation** — import statements, match, propose vouchers
- **Document Center** — attach and manage supporting documents
- **Reports** — 40+ operational, financial, and statutory reports

### System Requirements

| Requirement | Minimum |
|---|---|
| Operating System | Windows 10 or later (64-bit) |
| RAM | 4 GB |
| Disk Space | 500 MB |
| Screen Resolution | 1366 x 768 or higher |
| Database | SQL Server Express (included with installer) |

### Login

1. Launch GII GeM ERP from the desktop shortcut or Start Menu.
2. Enter your **Username** and **Password** provided by your system administrator.
3. Click **Login**.
4. On first login, you may be prompted to change your password.

### Company Selection

After login, the **Company Selection** screen appears showing all companies you have access to:

- Click a company card to open it.
- If you have access to only one company, it opens automatically.
- Use **Switch Company** from the Settings menu to change companies later.
- Use **All Companies View** for read-only access across all companies.

### Dashboard Overview

The dashboard has **3 modes** selectable from the top-right toggle:

| Mode | Audience | Focus |
|---|---|---|
| **Executive** | Management | KPIs: revenue, profit, ROI, top customers, pending orders |
| **Operations** | Operations team | Alerts: GRN pending, unbilled stock, procurement delays |
| **Accounts** | Finance team | Financial status: receivables, payables, bank balance, ageing |

Each mode shows a different set of cards. Cards display summary counts and amounts. Click any card to drill into the underlying data.

### Navigation Sidebar

The sidebar on the left is the primary navigation. It is organized into groups:

```
Dashboard
Masters
Operations
  Orders > Procurement > Expenses > Billing > Collections > Documents > CRAC > Reports
Inventory
Accounting
Profitability
Receivables & Payables
GST & Tax
Financial Control
Reports
Utilities
Help & Training
Settings
```

Click any group heading to expand/collapse its children. Click any item to navigate to that screen.

### Creating Your First Supply Order

1. Navigate to **Operations > Orders > Supply Orders**.
2. Click **+ New Order**.
3. Fill in:
   - **Order Number** — as per the government purchase order
   - **Department** — select from master list
   - **Institution** — the specific government entity
   - **Order Date** — date on the PO
   - **Items** — add rows with item name, HSN code, quantity, unit rate
   - **Employee** — the sales/person responsible
4. Click **Save**. The order is created in **Draft** status.
5. Attach the scanned purchase order in the **Documents** tab.
6. You can change the status to **Active** or other user-defined statuses later.

### Creating Your First Procurement

1. From a supply order, click **Procure** or navigate to **Operations > Procurement**.
2. Click **+ New Procurement**.
3. Select the **Supply Order** from the reference list.
4. Fill in:
   - **Supplier** — select from supplier master
   - **Purchase Invoice Number** and **Date**
   - **Items** — quantities and rates (pre-filled from order)
   - **Freight/Other Charges** if any
5. Click **Save** (Draft), then **Post** to create the purchase voucher.
6. Posting updates stock (via Stock Inward) and creates the supplier payable.

### Creating Your First Billing Invoice

1. Navigate to **Operations > Billing**.
2. Click **+ New Invoice**.
3. Select the **Supply Order**.
4. Verify items, quantities, rates, and GST.
5. Check the **Readiness Panel** — ensure all prerequisites are met (procurement done, items issued, documents attached).
6. Click **Save** (Draft), then **Post** to create the sales voucher.
7. Posting creates the receivable entry and output GST liability.

### Understanding Posting

**Posting** is the act of converting a saved draft into an accounting entry. This is a critical concept in GII GeM ERP:

| State | Meaning |
|---|---|
| **Draft** | Saved but has NO accounting impact. Can be edited/deleted freely. |
| **Posted** | Accounting vouchers created. Cannot be edited directly. Affects ledgers, stock, GST. |
| **Reversed** | The posted entry has been nullified with a reversal voucher. |

**Why posting matters:**
- Only posted transactions appear in financial reports (Trial Balance, P&L, Balance Sheet)
- Only posted transactions update stock ledgers
- Only posted transactions create GST liabilities
- Only posted transactions appear in receivables/payables ageing
- Reversing a posted transaction requires audit approval

---

## 2. ERP Map

Below is the complete navigation hierarchy of GII GeM ERP.

```
GII GeM ERP
│
├── Dashboard
│   ├── Executive Mode
│   ├── Operations Mode
│   └── Accounts Mode
│
├── Masters
│   ├── Companies
│   ├── Employees
│   ├── Departments
│   ├── Suppliers
│   ├── Items (with HSN codes)
│   ├── Warehouses
│   ├── Expense Heads
│   └── Banks
│
├── Operations
│   ├── Orders
│   │   ├── Supply Orders
│   │   └── Order Status Tracking
│   ├── Procurement
│   │   ├── New Procurement
│   │   ├── Procurement Register
│   │   └── GRN / Stock Receipt
│   ├── Expenses
│   │   ├── New Expense
│   │   └── Expense Register
│   ├── Billing
│   │   ├── New Invoice
│   │   ├── Invoice Register
│   │   ├── Credit Notes
│   │   ├── Debit Notes
│   │   └── E-Invoice / E-Way Bill (placeholder)
│   ├── Collections
│   │   ├── Department Receipts
│   │   ├── Supplier Payments
│   │   └── Receipt Register
│   ├── Documents
│   │   └── Document Center
│   ├── CRAC
│   │   └── CRAC Management
│   └── Reports
│       └── Operational Reports
│
├── Inventory
│   ├── Transactions
│   │   ├── Stock Inward
│   │   ├── Stock Outward
│   │   ├── Stock Adjustment
│   │   ├── Stock Return
│   │   └── Warehouse Transfer
│   ├── Planning
│   │   ├── Reservation / Allocation
│   │   └── Reorder Level
│   ├── Documents
│   │   └── Inventory Documents
│   ├── Registers
│   │   ├── Stock Ledger (Item-wise)
│   │   ├── Warehouse-wise Stock
│   │   └── Transaction Register
│   └── Reports
│       ├── Stock Summary
│       ├── Stock Valuation
│       ├── Low Stock Report
│       └── Reservation Report
│
├── Accounting
│   ├── Business Vouchers
│   │   ├── Receipt Voucher
│   │   ├── Supplier Payment Voucher
│   │   ├── Sales Voucher
│   │   ├── Purchase Voucher
│   │   ├── Expense Voucher
│   │   ├── Work Incentive Voucher
│   │   ├── Employee Incentive Voucher
│   │   ├── Contra Voucher
│   │   ├── Credit Note Voucher
│   │   └── Debit Note Voucher
│   ├── Accounting Vouchers
│   │   ├── Journal Entry
│   │   ├── GST Adjustment
│   │   ├── Opening Balance Entry
│   │   ├── Year-End Entry
│   │   └── Reversal Entry
│   ├── Books
│   │   ├── Chart of Accounts
│   │   ├── Voucher Register
│   │   ├── General Ledger
│   │   ├── Day Book
│   │   ├── Cash Book
│   │   └── Bank Book
│   ├── Bank Reconciliation
│   │   ├── Import Statement
│   │   ├── Match Entries
│   │   ├── Proposals
│   │   └── Reconciliation Register
│   └── Financial Statements
│       ├── Trial Balance
│       ├── Profit & Loss Account
│       └── Balance Sheet
│
├── Profitability
│   ├── Order Profitability
│   ├── Department Profitability
│   ├── Supplier Profitability
│   ├── Employee Profitability
│   └── Profit Simulator
│
├── Receivables & Payables
│   ├── Allocations
│   │   ├── Receipt Allocation
│   │   ├── Payment Allocation
│   │   └── Advance Adjustment
│   ├── Advances
│   │   ├── Advance Received
│   │   └── Advance Paid
│   ├── Party Ledgers
│   │   ├── Department Ledger
│   │   └── Supplier Ledger
│   └── Bill-wise
│       ├── Bill-wise Receivable
│       └── Bill-wise Payable
│
├── GST & Tax
│   ├── GST Register
│   ├── TDS Register
│   ├── GST TDS Register
│   ├── GST Summary
│   └── GST Returns (GSTR-1 / GSTR-3B data)
│
├── Financial Control
│   ├── Queues
│   │   ├── Posting Queue
│   │   ├── Approval Queue
│   │   └── Document Verification Queue
│   ├── Year Controls
│   │   ├── New Financial Year
│   │   ├── Year Closing
│   │   └── Year Opening
│   ├── Opening
│   │   └── Opening Balance Entry
│   ├── Policies
│   │   ├── Accounting Policies
│   │   ├── GST Configuration
│   │   ├── TDS Configuration
│   │   └── Profitability Rules
│   └── Audit
│       ├── Audit Trail
│       ├── Modification Log
│       └── User Activity Log
│
├── Reports
│   ├── Management Reports
│   │   ├── Executive Summary
│   │   ├── Order Book
│   │   ├── Revenue Dashboard
│   │   └── Performance Dashboard
│   ├── Profitability Reports
│   │   ├── Order Profitability Report
│   │   ├── Department Profitability Report
│   │   ├── Supplier Profitability Report
│   │   └── Employee Profitability Report
│   ├── GST / Tax Reports
│   │   ├── GST Register
│   │   ├── GST Summary Report
│   │   ├── TDS Report
│   │   └── GST TDS Report
│   ├── Bank / Proposal Reports
│   │   ├── Bank Reconciliation Report
│   │   ├── Proposal Register
│   │   ├── Matched Entries
│   │   └── Unmatched Entries
│   ├── CRAC / Closure Reports
│   │   ├── CRAC Status Report
│   │   ├── CRAC Payment Readiness
│   │   └── Order Closure Report
│   └── Allocations / Ageing Reports
│       ├── Allocation Audit Report
│       ├── Receivable Ageing
│       ├── Payable Ageing
│       ├── Unallocated Receipts
│       └── Unallocated Payments
│
├── Utilities
│   ├── Import
│   │   ├── Import Masters (CSV)
│   │   ├── Import Supply Orders
│   │   └── Import Bank Statements
│   └── Export
│       ├── Export to Excel
│       ├── Export to PDF
│       └── Backup
│   ├── Support
│   │   ├── System Diagnostics
│   │   ├── Log Viewer
│   │   └── Error Reports
│   └── Recovery
│       ├── Database Repair
│       └── Data Recovery
│
├── Help & Training
│   ├── Help Assistant (AI)
│   ├── Keyboard Shortcuts
│   ├── User Manual
│   ├── FAQ
│   ├── Troubleshooting
│   ├── Workflow Guides
│   ├── Role Profiles
│   └── Training Mode
│
└── Settings
    ├── Company Profile
    ├── User Management
    ├── Role & Permissions
    ├── Backup & Restore
    ├── Updates
    ├── Preferences
    └── Switch Company
```

---

## 3. Module-by-Module Guide

### 3.1 Dashboard

The dashboard is the first screen you see after login. It provides a real-time snapshot of your business.

**3 Modes:**

| Mode | Best For | Shows |
|---|---|---|
| **Executive** | CEO, Directors | Revenue KPIs, net profit, ROI, pending orders value, top departments, billing targets |
| **Operations** | Operations Managers | GRN pending count, unbilled stock value, procurement delays, delivery pending, document missing alerts |
| **Accounts** | Accountants, CFO | Receivables, payables, bank balance, ageing summary, TDS receivable, GST payable, trial balance status |

**Cards Explained:**

| Card | Meaning | Mode |
|---|---|---|
| Orders Pending | Supply orders not yet fully billed | Executive, Operations |
| Billing This Month | Total invoices raised current month | Executive, Accounts |
| Collections This Month | Total receipts recorded current month | Executive, Accounts |
| Receivables Outstanding | Total amount due from departments | Executive, Accounts |
| Payables Outstanding | Total amount due to suppliers | Executive, Accounts |
| Net Profit (MTD) | Month-to-date net profit | Executive |
| Stock Value | Current inventory valuation | Executive, Operations |
| Critical Alerts | High-priority items needing attention | Operations |
| Bank Balance | Current cash in bank accounts | Accounts |
| GST Payable | Net GST due this period | Accounts |
| TDS Receivable | TDS yet to be reclaimed | Accounts |

**Card Customization:**
- Click the **pencil icon** on any card to **Hide** it.
- Click **Settings > Dashboard Layout** to rearrange cards.
- **Pinned** cards always stay visible when you switch modes.

**Setup Checklist:**
When starting a new company, the dashboard shows a checklist:
1. Create Company profile
2. Add Departments
3. Add Employees
4. Add Suppliers
5. Add Items
6. Add Warehouses
7. Configure GST
8. Open Financial Year
9. Enter Opening Balances

Complete these in order. Each completed item is checked off.

---

### 3.2 Masters

Masters are the foundational data entities in GII GeM ERP. All transactions reference masters.

#### Companies

| Aspect | Detail |
|---|---|
| **What it stores** | Your business entity details: name, address, GSTIN, PAN, bank accounts, logo |
| **Who enters it** | Administrator or Super User |
| **When to enter** | Before starting any transaction; once per company |
| **Required fields** | Company Name, GSTIN, PAN, Address, Financial Year |
| **Impact** | Appears on all invoices, reports; GSTIN used for GST calculations; PAN for TDS |

#### Employees

| Aspect | Detail |
|---|---|
| **What it stores** | Staff details: name, designation, department, PAN, bank account, role |
| **Who enters it** | Administrator |
| **When to enter** | When a new employee joins |
| **Required fields** | Employee Name, Department, Role |
| **Impact** | Linked to supply orders (responsible person), billing, incentives, login accounts |

#### Departments

| Aspect | Detail |
|---|---|
| **What it stores** | Government departments you supply to: name, address, GSTIN, contact |
| **Who enters it** | Operations team |
| **When to enter** | Before recording first supply order for that department |
| **Required fields** | Department Name, GSTIN, Address |
| **Impact** | Used in orders, billing, receivables; GSTIN must match department's registration |

#### Suppliers

| Aspect | Detail |
|---|---|
| **What it stores** | Vendor details: name, address, GSTIN, PAN, bank account, payment terms |
| **Who enters it** | Procurement / Purchase team |
| **When to enter** | Before recording first procurement from that supplier |
| **Required fields** | Supplier Name, GSTIN, PAN, Address |
| **Impact** | Used in procurements, payables, TDS; PAN and GSTIN validated for statutory reporting |

#### Items

| Aspect | Detail |
|---|---|
| **What it stores** | Product/service catalog: name, HSN/SAC code, unit of measure, rate, GST rate, opening stock |
| **Who enters it** | Operations / Inventory team |
| **When to enter** | Before adding items to a supply order |
| **Required fields** | Item Name, HSN Code, Unit of Measure, GST Rate |
| **Impact** | HSN code determines GST rate; opening stock sets initial inventory; used in orders, billing, stock |

#### Warehouses

| Aspect | Detail |
|---|---|
| **What it stores** | Physical storage locations: name, address, contact |
| **Who enters it** | Inventory team |
| **When to enter** | Before receiving stock |
| **Required fields** | Warehouse Name, Address |
| **Impact** | Every stock transaction is linked to a warehouse; stock valuation is warehouse-specific |

#### Expense Heads

| Aspect | Detail |
|---|---|
| **What it stores** | Categories of expenses: name, type (fixed/percentage), calculation method |
| **Who enters it** | Accounts team |
| **When to enter** | Before recording expenses against orders |
| **Required fields** | Expense Head Name, Calculation Method |
| **Impact** | Expense heads define how costs are calculated and allocated to orders; impacts profitability |

#### Banks

| Aspect | Detail |
|---|---|
| **What it stores** | Company bank accounts: bank name, account number, IFSC, branch |
| **Who enters it** | Accounts team |
| **When to enter** | Before recording receipts/payments |
| **Required fields** | Bank Name, Account Number, IFSC |
| **Impact** | Used in receipts, supplier payments, bank reconciliation |

---

### 3.3 Supply Orders

**Purpose:** Record government purchase orders (supply orders) received from departments.

**Data needed:**
- Order number (as per government PO)
- Department and institution
- Order date
- Items with quantities and rates
- Employee responsible
- Delivery date (optional)
- Special terms (if any)

**What happens after save:**
The order is created in **Draft** status. You can:
- Edit items, quantities, rates
- Attach documents (scanned PO)
- Change status
- Initiate procurement

**Documents needed:**
- Scanned copy of the government supply order (mandatory)
- Any annexures or specifications

**Statuses (user-defined):**
Typical statuses you can configure:
- Draft (default on create)
- Active / In Progress
- Partially Procured
- Fully Procured
- Partially Billed
- Fully Billed
- Completed
- Closed

**Related modules:**
- **Procurement** — purchase goods against this order
- **Billing** — raise invoice against delivered goods
- **Stock Outward** — issue stock for delivery
- **Expenses** — record order-specific costs

**Common mistakes:**
- Selecting wrong department (affects billing and receivables)
- Mismatched items between order and procurement (causes billing issues)
- Not attaching the PO document (delays verification)
- Entering incorrect quantities or rates

---

### 3.4 Procurement

**Purpose:** Record purchases from suppliers against supply orders.

**Data needed:**
- Reference supply order
- Supplier
- Purchase invoice number and date
- Items with quantities, rates, and GST
- Freight and other charges

**Linking to supply order:**
- Always link procurement to a supply order
- Items pre-fill from the order — verify quantities
- You can procure less than ordered; partial procurement is tracked

**Posting:**
When you **Post** a procurement:
1. A **Purchase Voucher** is created in the accounting system
2. **Stock Inward** is automatically generated (stock increases)
3. **Accounts Payable** entry is created (credit to supplier)
4. **Input GST** is recorded in the GST register
5. The procurement status changes from Draft to Posted

**Documents needed:**
- Purchase invoice from supplier
- Delivery challan from supplier (if applicable)
- Goods receipt note (GRN)

**GST:**
- Input GST is recorded at the rate applicable to each item
- Only posted procurements contribute to input GST credit
- Ensure supplier GSTIN is valid in the supplier master

**Common mistakes:**
- Posting without completing Goods Receipt (GRN)
- Selecting wrong supplier (affects payables)
- Entering wrong purchase invoice number (duplicate or mismatch)
- Not linking to the correct supply order

---

### 3.5 GRN / Stock Receipt

**Purpose:** Record physical receipt of goods from the supplier.

**Workflow:**
1. Create **Procurement** → Save as Draft
2. Receive goods → Record **GRN / Stock Receipt**
3. Verify received quantity, damaged quantity, accepted quantity
4. **Post** the GRN → Stock is updated via Stock Inward

**Quantity tracking:**
| Field | Description |
|---|---|
| Ordered Quantity | Quantity in the procurement |
| Received Quantity | Total quantity physically received |
| Damaged Quantity | Quantity found damaged on receipt |
| Accepted Quantity | Quantity accepted (Received - Damaged) |
| Short Quantity | Ordered but not received |

**Stock impact:**
- On posting GRN, stock ledger is updated for the **Accepted Quantity**
- Damaged quantity is recorded but not added to stock
- Short quantity remains in procurement as pending

**When GRN is optional:**
GRN can be bypassed if you post procurement directly (which auto-creates Stock Inward). However, GRN is recommended for proper goods receipt tracking.

---

### 3.6 Inventory

The Inventory module manages all stock movements across warehouses.

#### Stock Inward

**Purpose:** Add stock to a warehouse.

| Source | Description |
|---|---|
| From Procurement | Auto-generated when procurement is posted or GRN is posted |
| Direct Inward | Manual entry for stock purchases without procurement flow (e.g., local purchases) |
| Return from Department | Stock returned by department (reversal of outward) |

**Data needed:** Warehouse, item, quantity, rate, reference document.

**Posting:** Updates stock ledger — quantity and value increase.

#### Stock Outward

**Purpose:** Issue stock from a warehouse, typically for delivery against a billing invoice.

**Sources:**
- Manual issue against a supply order
- Auto-generated from billing (if configured)

**Data needed:** Warehouse, item, quantity, delivery reference.

**Posting:** Updates stock ledger — quantity and value decrease. COGS (Cost of Goods Sold) is calculated based on the valuation method.

#### Stock Adjustment

**Purpose:** Correct stock quantities after physical verification.

**When used:**
- Physical count differs from system stock
- Stock damaged in warehouse
- Theft or loss
- Write-off of obsolete items

**Data needed:** Warehouse, item, adjustment quantity (positive or negative), reason.

**Posting:** Stock ledger is adjusted. An adjustment voucher is created.

#### Stock Return

**Types:**
| Type | Description |
|---|---|
| Return to Supplier | Return defective/excess goods to supplier. Reduces stock and creates a debit note. |
| Return from Department | Department returns delivered goods. Increases stock and adjusts billing. |

**Posting:** Stock ledger updated; accounting entries created for the return value.

#### Warehouse Transfer

**Purpose:** Move stock from one warehouse to another.

**Data needed:** Source warehouse, destination warehouse, item, quantity.

**Posting:** Source warehouse stock decreases, destination warehouse stock increases. No profit/loss impact.

#### Inventory Reports

| Report | Description |
|---|---|
| Stock Summary | Current stock quantities and values by item and warehouse |
| Stock Ledger | Item-wise transaction log with running balance |
| Stock Valuation | Current inventory value (cost basis) |
| Low Stock Report | Items below reorder level |
| Reservation Report | Stock reserved against orders |

---

### 3.7 Billing / GST Invoice

**Purpose:** Create sales invoices for goods delivered to government departments.

**Data needed:**
- Supply order reference
- Items with quantities, rates, GST rate
- Department details (auto-filled from order)
- Delivery challan reference
- GST invoice type (regular, credit note, debit note)

**Status Lifecycle:**

```
Draft → Pending Approval → Approved → Posted → Paid → Closed
```

| Status | Meaning |
|---|---|
| **Draft** | Saved but no accounting impact. Editable. |
| **Pending Approval** | Submitted for review (if approval workflow enabled) |
| **Approved** | Approved by reviewer; ready to post |
| **Posted** | Accounting entries created. Not editable. |
| **Paid** | Full payment received against this invoice |
| **Closed** | Invoice fully settled and closed |

**Posting:**
When you **Post** an invoice:
1. A **Sales Voucher** is created
2. **Accounts Receivable** entry is created (debit to department)
3. **Output GST** is recorded in the GST register
4. Sales value is credited to the sales account
5. COGS is recorded (if stock-outward linked)
6. The invoice status changes to Posted

**Documents needed (Readiness Panel):**
| Document | Required? |
|---|---|
| Invoice Copy | Yes |
| Delivery Challan | Yes |
| Installation Report | If applicable |
| CRAC | If applicable |
| OEM Authorization | If applicable |
| Supply Order Copy | Yes |

The **Readiness Panel** on the billing screen shows:
- Items procured (yes/no/partial)
- Items issued from stock (yes/no/partial)
- CRAC documents attached (yes/no)
- Required documents missing (red indicator)

**E-Invoice / E-Way Bill:**
This version provides placeholder fields for e-invoice IRN and e-way bill number. Integration with the GST portal is planned for future release.

**Correction Workflow:**
| Correction Type | Description |
|---|---|
| **Credit Note** | Reduce invoice value (e.g., rate reduction, goods returned). Creates a Credit Note voucher. |
| **Debit Note** | Increase invoice value (e.g., additional charges). Creates a Debit Note voucher. |
| **Reversal** | Reverse a posted invoice entirely. Creates reversal vouchers for sales, GST, and receivables. |

---

### 3.8 Receipts / Department Collections

**Purpose:** Record payments received from government departments.

**Modes:**

| Mode | Description |
|---|---|
| **Cheque** | Physical cheque received. Record cheque number, date, bank. |
| **NEFT / RTGS** | Electronic transfer. Record UTR number, date. |
| **Cash** | Cash payment (rare for government). Record cash receipt. |

**Data needed:**
- Department
- Amount received
- Payment mode and reference (cheque no / UTR)
- Date of receipt
- TDS deducted (if any)
- GST TDS deducted (if any)

**TDS / GST TDS:**
When a department makes payment, they typically deduct TDS and GST TDS:
- **TDS Deducted** — recorded as TDS Receivable (asset)
- **GST TDS Deducted** — recorded as GST TDS Receivable
- The net amount received = Gross invoice amount - TDS - GST TDS

**Allocation:**
After saving the receipt, you must **Allocate** it against open invoices:
1. Go to the **Allocation** tab
2. Select which invoices to pay
3. Enter the amount allocated to each invoice
4. The system ensures total allocation ≤ receipt amount
5. Save allocation

**Posting:**
When you post a receipt with allocation:
1. A **Receipt Voucher** is created
2. **Accounts Receivable** is reduced (department outstanding decreases)
3. **Bank** account is debited (or cash)
4. **TDS Receivable** is debited
5. **GST TDS Receivable** is debited
6. Invoice status may update to **Paid** (if fully paid)

**Common mistakes:**
- Not recording TDS / GST TDS separately (causes reconciliation issues)
- Not allocating the receipt to invoices (leaves unallocated credit)
- Partial entries without proper allocation notes
- Wrong UTR number (causes bank reconciliation failure)

---

### 3.9 Supplier Payments

**Purpose:** Record payments made to suppliers against procurements.

**Data needed:**
- Supplier
- Amount paid
- UTR number / cheque number
- Bank account used
- Date of payment
- TDS deducted (if any)

**Allocation:**
Similar to receipts, you must allocate the payment against open purchase bills:
1. Select the procurement invoices to pay
2. Enter amounts allocated
3. System validates total allocation ≤ payment amount

**Posting:**
When posted:
1. A **Payment Voucher** is created
2. **Accounts Payable** is reduced
3. **Bank** account is credited
4. Supplier outstanding decreases

---

### 3.10 Expenses

**Purpose:** Record order-specific expenses that affect profitability.

**Types of expenses:**
| Expense Type | Example |
|---|---|
| Authorization Charges | Fees paid for OEM authorization |
| L1 Charges | Lowest tender matching charges |
| Transport / Freight | Delivery costs |
| Installation Charges | On-site installation costs |
| Warranty / AMC | Extended warranty costs |
| Bank Charges | LC, BG charges |

**Calculation Methods:**
| Method | Description |
|---|---|
| **Fixed Amount** | Enter a specific rupee amount |
| **% of Gross** | Percentage of the gross billing value |
| **% of Taxable** | Percentage of the taxable value (excluding GST) |

**Link to Order:**
Each expense must be linked to a specific supply order. This ensures profitability is calculated correctly at the order level.

**Posting:**
When posted:
1. An **Expense Voucher** is created
2. Expense account is debited
3. Bank / Creditor is credited
4. Order profitability is updated (net profit decreases)

---

### 3.11 Accounting Vouchers

GII GeM ERP uses double-entry bookkeeping. Every transaction creates a **voucher** with balanced debit and credit entries.

#### Business Vouchers (Guided)

These are created automatically when you post operational transactions. They can also be created manually from the Accounting menu.

| Voucher Type | Created By | Debit | Credit |
|---|---|---|---|
| **Receipt Voucher** | Department Receipt | Bank | Department (Receivable) |
| **Supplier Payment Voucher** | Supplier Payment | Supplier (Payable) | Bank |
| **Sales Voucher** | Billing Invoice | Department (Receivable) | Sales Account, Output GST |
| **Purchase Voucher** | Procurement / GRN | Purchase Account, Input GST | Supplier (Payable) |
| **Expense Voucher** | Expense Entry | Expense Account | Bank / Supplier |
| **Work Incentive Voucher** | Work incentive entry | Expense (Incentive) | Employee Payable |
| **Employee Incentive Voucher** | Employee incentive | Expense (Incentive) | Employee Payable |
| **Contra Voucher** | Bank transfer / cash deposit | Bank A/c (To) | Bank A/c (From) |
| **Credit Note Voucher** | Credit Note | Sales Return, Output GST (negative) | Department (Receivable reduction) |
| **Debit Note Voucher** | Debit Note | Department (additional charge) | Sales, Output GST |

#### Accounting Vouchers (Manual)

| Voucher Type | Purpose |
|---|---|
| **Journal Entry** | Manual adjustment entries |
| **GST Adjustment** | Correct or adjust GST entries |
| **Opening Balance Entry** | Enter opening balances at year start |
| **Year-End Entry** | Closing entries for financial year-end |
| **Reversal Entry** | Reverse a previously posted voucher |

**Key rules:**
- Every voucher must have **Total Debits = Total Credits**
- Posted vouchers cannot be edited
- Vouchers are sequentially numbered per financial year
- Each voucher has an audit trail (created by, created on, modified by, modified on)

---

### 3.12 Books of Accounts

| Book | Description |
|---|---|
| **Chart of Accounts** | Complete list of all ledger accounts with account groups. Hierarchical view. |
| **Voucher Register** | All posted vouchers listed chronologically. Filter by type, date, amount. |
| **General Ledger** | Account-wise view of all entries with running balance. Drill down from any account. |
| **Day Book** | All transactions grouped by date. Shows every entry made on a given day. |
| **Cash Book** | All cash-related transactions. Shows cash receipts and payments. |
| **Bank Book** | All bank-related transactions. Shows deposits and withdrawals by bank account. |
| **Trial Balance** | Summary of all ledger account balances. Debits must equal credits. Used to verify accuracy before financial statements. |
| **Profit & Loss Account** | Shows income (sales) and expenses (purchases, costs) for a period. Bottom line = Net Profit/Loss. |
| **Balance Sheet** | Shows assets, liabilities, and equity as of a date. Follows: Assets = Liabilities + Equity. |

---

### 3.13 Receivables

**Purpose:** Track the total amount owed by departments (your customers).

**Sources of Receivables:**
- **Billing Invoices** — when you post a sales invoice, the department becomes a debtor
- **Credit Notes** — reduce the receivable
- **Debit Notes** — increase the receivable

**Reduction of Receivables:**
- **Receipts** — when you post a receipt and allocate it to invoices, receivables decrease
- **Write-offs** — bad debt write-off (requires journal entry)

**Ageing Analysis:**
Receivables are classified by age from invoice date:
| Bucket | Days |
|---|---|
| Current | 0–30 days |
| 31–60 Days | 31–60 days |
| 61–90 Days | 61–90 days |
| 90+ Days | Over 90 days |

**Reports:**
- **Bill-wise Receivable** — shows each invoice with outstanding amount
- **Ageing Report** — departments grouped by ageing bucket
- **Reconciliation** — matches receipts to invoices, shows gaps

---

### 3.14 Payables

**Purpose:** Track the total amount owed to suppliers.

**Sources of Payables:**
- **Procurements** — when you post a procurement, the supplier becomes a creditor
- **Expenses** — unpaid expenses

**Reduction of Payables:**
- **Supplier Payments** — when you post a payment and allocate, payables decrease
- **Debit Notes** — reduce payable (goods returned)

**Ageing Analysis:**
Same ageing buckets as receivables: 0–30, 31–60, 61–90, 90+ days.

**Reports:**
- Bill-wise Payable
- Payable Ageing
- Supplier Ledger

---

### 3.15 GST & Tax

#### GST Register

| Section | Content |
|---|---|
| **Output GST** | GST charged on sales invoices (billed to departments). Broken down by CGST, SGST, IGST. |
| **Input GST** | GST paid on purchases (from suppliers). Broken down by CGST, SGST, IGST. |
| **Net GST Payable** | Output GST - Input GST. If positive, amount due to government. If negative, credit carried forward. |

#### TDS Register

Tracks TDS deducted by departments from your payments. This is an asset (TDS Receivable) that you can reclaim when filing your income tax return.

#### GST TDS Register

Tracks GST TDS deducted by departments. Similar to TDS but specific to GST. Deducted at 2% (1% CGST + 1% SGST) or 2% IGST.

#### GST Summary

A consolidated view showing:
- Total purchases (taxable value + GST)
- Total sales (taxable value + GST)
- Net GST payable
- Input tax credit available
- TDS/TCS details

---

### 3.16 TDS / GST TDS

**How TDS works in government supplies:**
1. You raise an invoice for Rs. 1,00,000 + GST
2. Department processes payment
3. Department deducts TDS @ 2% (or applicable rate) on the taxable value
4. Department deducts GST TDS @ 2% on the taxable value
5. Department pays the net amount: Invoice Value - TDS - GST TDS
6. You record the receipt with TDS and GST TDS details

**Reclaiming TDS:**
- TDS deducted by department appears in your Form 26AS
- You claim credit when filing your income tax return
- TDS Register in the ERP tracks all TDS deducted invoice-wise
- TDS Receivable is shown as an asset in the Balance Sheet

**GST TDS Reclaim:**
- GST TDS appears in your GSTR-2A
- You claim input tax credit for GST TDS in GSTR-3B
- GST TDS Register tracks this

**Reports:**
- TDS Reconciliation — match ERP TDS records with Form 26AS
- GST TDS Reconciliation — match with GSTR-2A

---

### 3.17 Profitability

Profitability analysis is available at multiple levels:

#### Order Profitability

| Component | Calculation |
|---|---|
| **Billing Value** | Total invoice amount (excluding GST) |
| **Purchase Cost** | Total cost of goods procured for this order |
| **Gross Margin** | Billing Value - Purchase Cost |
| **GST Impact** | Net GST cost (output - input) if not recoverable |
| **Expenses** | Order-specific expenses (transport, installation, etc.) |
| **Employee Incentive** | Incentive payable to the responsible employee |
| **Net Profit** | Gross Margin - GST Impact - Expenses - Employee Incentive |
| **ROI** | (Net Profit / Total Cost) × 100 |

#### Department Profitability

Aggregated profitability across all orders for a given department.

#### Supplier Profitability

Shows purchases from each supplier and the profitability of orders fulfilled using that supplier's goods.

#### Employee Profitability

| Metric | Description |
|---|---|
| Total Billing | Invoice value from orders handled |
| Total Collections | Payments received against those invoices |
| Gross Profit | Billing - Purchase cost |
| Net Profit | After all expenses and incentives |
| Incentive Earned | Calculated incentive based on profitability |
| Orders Handled | Count of orders managed |

#### Profit Simulator

A what-if tool to model profitability scenarios:
- Change billing rate → see impact on margin
- Change purchase cost → see impact on net profit
- Add/remove expenses → see impact on ROI
- Adjust GST rate → see impact on net GST
- Save scenarios for comparison

---

### 3.18 Bank Reconciliation

**Purpose:** Match your ERP bank entries with bank statement transactions to ensure accuracy.

**Steps:**

1. **Import Bank Statement**
   - Supported formats: SBI, HDFC, ICICI, Axis (direct format), Generic CSV
   - Import via **Accounting > Bank Reconciliation > Import Statement**
   - Map columns if using generic CSV

2. **Match Entries**
   - The system auto-matches entries by:
     - UTR number (NEFT/RTGS)
     - Cheque number
     - Amount and date proximity
   - Manual matching is also available
   - Matched entries are marked as **Reconciled**

3. **Create Voucher Proposals**
   - Unmatched entries from the bank statement can be proposed as new vouchers
   - Example: a bank charge entry with no corresponding internal entry → propose a journal entry
   - Proposals go to an approval queue

4. **Approve / Reject Proposals**
   - An authorized user reviews proposals
   - Approved proposals create actual vouchers
   - Rejected proposals are removed

5. **Post Matched Entries**
   - Reconciled entries are posted to the Bank Book
   - The bank ledger balance matches the statement

---

### 3.19 Document Center

**Where documents can be attached:**

| Module | Screens |
|---|---|
| Supply Orders | Order screen, Documents tab |
| Procurement | Procurement screen, Documents tab |
| Billing / Invoices | Invoice screen, Documents tab |
| Payments / Receipts | Receipt screen, Documents tab |
| Delivery Challans | Stock Outward screen |
| Stock Inward / Outward | Inventory transaction screens |
| CRAC | CRAC management screen |

**Supported document types:**
- Supply Order / Purchase Order
- Invoice (sales)
- Purchase Invoice
- Payment Proof / UTR Screenshot
- Delivery Challan
- Installation Report
- CRAC (Consolidated Receipt and Accounting Certificate)
- OEM Authorization Letter
- Warranty Certificate
- Any other (custom type)

**Operations:**
| Action | Description |
|---|---|
| **Upload** | Drag & drop or browse files |
| **View / Preview** | Open document in built-in viewer (PDF, images) |
| **Download** | Save document locally |
| **Replace** | Upload a new version (old version is archived) |
| **Delete** | Remove the document (audit trail maintained) |

**Readiness Checklist:**
The billing screen shows a document readiness checklist. An invoice cannot be marked as ready for posting if required documents are missing.

---

### 3.20 Reports

#### Financial Reports

| Report | Description |
|---|---|
| **Trial Balance** | All ledger balances with debit/credit totals. Verifies accounting accuracy for a period. |
| **Profit & Loss Account** | Revenue and expense summary. Shows Net Profit/Loss for a date range. |
| **Balance Sheet** | Financial position: Assets = Liabilities + Equity as of a date. |
| **Cash Flow Statement** | Cash inflows and outflows from operating, investing, and financing activities. |

#### Profitability Reports

| Report | Description |
|---|---|
| **Order Profitability Report** | Profitability breakdown per supply order |
| **Department Profitability Report** | Aggregated by department |
| **Supplier Profitability Report** | Aggregated by supplier |
| **Employee Profitability Report** | Performance and incentive by employee |

#### GST Reports

| Report | Description |
|---|---|
| **GST Register** | Output GST, Input GST input tax credit, Net payable |
| **GST Summary** | Consolidated purchase/sales/payable from GST perspective |

#### Outstanding Reports

| Report | Description |
|---|---|
| **Receivable Ageing** | Department-wise outstanding with ageing buckets |
| **Payable Ageing** | Supplier-wise outstanding with ageing buckets |

#### Employee Reports

| Report | Description |
|---|---|
| **Employee Performance** | Billing, collections, orders handled, profitability by employee |
| **Incentive Report** | Calculated incentive amounts with basis |

#### Operational Reports

| Report | Description |
|---|---|
| **Pending Procurement** | Orders where procurement is not yet complete |
| **Pending Billing** | Stock issued but not yet billed |
| **Pending Payment** | Invoices not yet paid |
| **Stock vs Billing** | Comparison of stock issued vs invoice quantity |
| **Posting Status** | Draft transactions not yet posted |
| **Profitability Exceptions** | Orders with negative or below-threshold margin |
| **GRN Pending** | Procurements awaiting GRN |

#### Bank Reports

| Report | Description |
|---|---|
| **Proposal Register** | All voucher proposals from bank reconciliation |
| **Matched Entries** | Reconciled entries |
| **Unmatched Entries** | Bank entries not yet matched |
| **Reconciliation Audit** | Audit trail of all reconciliation actions |

#### CRAC / Closure Reports

| Report | Description |
|---|---|
| **CRAC Status** | Status of CRAC for each order |
| **Payment Readiness** | Billing readiness based on documents and CRAC |
| **Closure Tracking** | Orders nearing or past closure |

#### Allocation / Ageing Reports

| Report | Description |
|---|---|
| **Unallocated Receipts** | Receipts not yet allocated to invoices |
| **Unallocated Payments** | Payments not yet allocated to bills |
| **Advance Adjustments** | Advances adjusted against invoices |
| **Allocation Audit** | Complete history of all allocations |

---

### 3.21 Print / Export

| Feature | Description |
|---|---|
| **Browser Print** | Use Ctrl+P (Cmd+P on Mac) to print any screen. Works from any list or detail view. |
| **PDF Export** | Save any report or transaction as PDF. Click the PDF icon in the toolbar. |
| **CSV Export** | Export report data to CSV for Excel analysis. Available in all reports. |
| **Excel Export** | Export with formatting (.xlsx format). |
| **Print Templates** | |
| — Sales Invoice | Professional invoice format with company logo, GST details |
| — Credit Note | Standard credit note format |
| — Debit Note | Standard debit note format |
| — Purchase Order | Purchase order format |

---

### 3.22 Help & Training

#### Help Assistant

An AI-powered assistant that answers ERP-related questions. Access it from the **?** icon in the top-right corner.

**What you can ask:**
- "How do I create a billing invoice?"
- "What is the difference between Draft and Posted?"
- "How do I allocate a receipt?"
- "What reports are available for GST?"

**Limitations:**
- The assistant provides guidance only — it cannot perform actions
- It does not have access to your actual transaction data
- It is trained on the user manual and common FAQs

#### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+N` | New transaction (current module) |
| `Ctrl+S` | Save current form |
| `Ctrl+P` | Print / Export |
| `F1` | Help Assistant |
| `F2` | Quick Search |
| `F5` | Refresh current screen |
| `Ctrl+F` | Search / Filter |
| `Ctrl+E` | Export to Excel |
| `Ctrl+D` | Export to PDF |
| `Esc` | Close popup / Cancel |
| `Alt+1` | Switch to Dashboard |
| `Alt+2` | Switch to Operations |
| `Alt+3` | Switch to Accounting |
| `Alt+4` | Switch to Reports |
| `Ctrl+Alt+B` | Open Backup |
| `Ctrl+Alt+S` | Open Settings |

#### Help & Training Center

| Resource | Description |
|---|---|
| **User Manual** | This document — complete reference |
| **FAQ** | Frequently asked questions (see Section 14) |
| **Troubleshooting Guide** | Solutions for common errors and issues |
| **Workflow Guides** | Step-by-step guides for end-to-end processes |
| **Role Profiles** | Description of each user role and their responsibilities |
| **Training Mode** | Sandbox environment for practice. No data is saved. Activate from Help > Training Mode. |

---

### 3.23 Settings / Backup / Company Context

#### Create / Restore Backups

| Action | How |
|---|---|
| **Create Backup** | Settings > Backup > Create Backup. Generates a `.bak` file of the database. |
| **Schedule Backup** | Configure automatic daily/weekly backups |
| **Restore Backup** | Settings > Backup > Restore. Select a `.bak` file to restore. |
| **Cloud Backup** | If configured, backups are also uploaded to cloud storage. |

#### Update Management

- The application checks for updates on startup
- Updates are downloaded and installed automatically
- You can check manually: Settings > Updates > Check for Updates

#### Company Selection / Switching

| Action | How |
|---|---|
| **Switch Company** | Settings > Switch Company. Select from the list. |
| **All Companies View** | Read-only view across all companies. Access from the company selector. |
| **Company Profile** | View/edit company details in Settings > Company Profile. |

#### Financial Year Management

- **Open New Year** — at year-end, create a new financial year. Opening balances are carried forward from the previous year.
- **Year Closing** — once all entries are finalized, close the year. No new entries can be added to a closed year.
- **Year Opening** — verify and adjust opening balances for the new year.

---

## 4. End-to-End Government Supply Workflow

Follow along as we trace a complete supply from order to closure.

### Step 1: Create Supply Order

> **Screen:** Operations > Orders > Supply Orders

You receive a purchase order from the **Department of Education** for 100 laptops. You enter:
- Order No: `DOE/PO/2026/001`
- Department: Department of Education
- Institution: Kendriya Vidyalaya, New Delhi
- Items: Laptop ProBook 450 (100 units @ Rs. 55,000)
- Employee: Rajesh Kumar (Sales Manager)

**Result:** Supply Order in **Draft** status. You attach the scanned PO.

### Step 2: Create Procurement

> **Screen:** Operations > Procurement

You purchase 100 laptops from **Dell India Pvt Ltd** at Rs. 48,000 each.
- Link to Supply Order
- Supplier: Dell India Pvt Ltd
- Purchase Invoice: `DELL/PI/2026/789`
- Items: 100 laptops @ Rs. 48,000
- Freight: Rs. 25,000
- GST: 18% (Input)

**Save as Draft**, then **Post**.

**Effect:**
- Purchase Voucher created
- Stock Inward created (100 laptops added to warehouse)
- Accounts Payable: Rs. 57,05,000 (Dell India)
- Input GST: Rs. 8,69,745.76

### Step 3: Goods Receipt (GRN)

> **Screen:** Operations > Procurement > GRN

When laptops arrive, you record the GRN:
- Received: 100 units
- Damaged: 1 unit
- Accepted: 99 units

**Post GRN** → Stock updated to 99 units.

### Step 4: Stock Outward (Delivery)

> **Screen:** Inventory > Transactions > Stock Outward

You issue 99 laptops from the warehouse for delivery.
- Warehouse: Main Warehouse
- Items: 99 laptops @ Rs. 48,000 (cost)
- Delivery Challan: `DC/2026/001`

**Post** → Stock decreases to 0. COGS recorded: Rs. 47,52,000.

### Step 5: Billing / Invoice

> **Screen:** Operations > Billing

You create the invoice:
- Link to Supply Order
- Items: 99 laptops @ Rs. 55,000 (the 1 damaged unit is not billed)
- GST: 18%
- Attach Delivery Challan and other documents

**Save as Draft**, check **Readiness Panel** (all green), then **Post**.

**Effect:**
- Sales Voucher created
- Receivable from Department of Education: Rs. 64,31,100
- Output GST: Rs. 9,80,610
- COGS: Rs. 47,52,000
- Gross Profit: Rs. 6,96,900 (billing value - purchase cost of 99 units)
- Invoice status: **Posted**

### Step 6: Record Expenses

> **Screen:** Operations > Expenses

- Authorization charges: Rs. 50,000
- Transport: Rs. 15,000
- Installation: Rs. 20,000

**Post** → Expense vouchers created. Net profit reduces by Rs. 85,000.

### Step 7: Collection / Receipt

> **Screen:** Operations > Collections

Department of Education makes payment:
- Net receipt: Rs. 62,46,000
- TDS deducted (2%): Rs. 1,08,900
- GST TDS deducted (2%): Rs. 1,08,900

**Save**, **Allocate** against the invoice, **Post**.

**Effect:**
- Receipt Voucher created
- Bank balance increases by Rs. 62,46,000
- Receivable outstanding: Rs. 0 (fully paid)
- TDS Receivable: Rs. 1,08,900
- GST TDS Receivable: Rs. 1,08,900

### Step 8: Supplier Payment

> **Screen:** Operations > Collections > Supplier Payments

Pay Dell India:
- Payment: Rs. 57,00,000 (after TDS)
- TDS: Rs. 5,000

**Allocate** against purchase invoice, **Post**.

**Effect:**
- Payment Voucher created
- Payable outstanding: Rs. 0
- Bank decreases by Rs. 57,00,000

### Step 9: Profitability Check

> **Screen:** Profitability > Order Profitability

```
Billing Value (99 × 55,000)           = 54,45,000
Purchase Cost (99 × 48,000)           = 47,52,000
Gross Margin                           =  6,93,000
Less: Expenses (50k+15k+20k)          =    85,000
Less: Employee Incentive               =    50,000
Net Profit                             =  5,58,000
ROI                                    = 11.5%
```

### Step 10: Closure

Once all billing is complete, all payments received, and all documents filed, mark the order as **Completed** or **Closed**.

---

## 5. Accounting Workflow

GII GeM ERP follows a structured transaction flow from data entry to financial statements.

```
Save (Draft) → Post → Voucher Created → Ledger Entry → Trial Balance → P&L → Balance Sheet
```

### Detailed Flow

1. **Save (Draft)**
   - User enters transaction data (invoice, procurement, receipt)
   - Data is saved to the database with status = Draft
   - **No accounting impact** — ledgers, stock, GST are unaffected
   - User can edit, delete, or abandon the draft

2. **Post**
   - User clicks **Post** (or **Post & Print**)
   - System validates data (required fields, balanced entries)
   - Accounting vouchers are generated:

     | Transaction | Voucher Created |
     |---|---|
     | Billing Invoice | Sales Voucher |
     | Procurement | Purchase Voucher |
     | Department Receipt | Receipt Voucher |
     | Supplier Payment | Payment Voucher |
     | Expense | Expense Voucher |
     | Credit Note | Credit Note Voucher |
     | Debit Note | Debit Note Voucher |
     | Stock Adjustment | Journal Entry |

3. **Voucher Created**
   - Voucher number is assigned (auto-increment per FY)
   - Voucher date is the transaction date
   - Debit and credit entries are created
   - Voucher status = Posted

4. **Ledger Entry**
   - Each voucher line updates the respective General Ledger account
   - Example: Posting a sales invoice debits "Department of Education" and credits "Sales Account"
   - Ledger shows running balance

5. **Trial Balance**
   - At any point, generate Trial Balance
   - Shows all ledger accounts with total debits and credits
   - Debits must equal credits
   - If not balanced, system flags an error

6. **Profit & Loss Account**
   - Income accounts (Sales) appear on the credit side
   - Expense accounts (Purchases, Costs) appear on the debit side
   - Net Profit = Total Income - Total Expenses
   - Net Loss = Total Expenses - Total Income

7. **Balance Sheet**
   - Assets (Bank, Receivables, Stock) appear on the debit side
   - Liabilities (Payables, Loans) and Equity (Capital, Retained Earnings) appear on the credit side
   - **Assets = Liabilities + Equity**

### Important Rules

- **Draft transactions can be deleted** — posted transactions cannot
- **To correct a posted transaction**, use reversal or credit/debit note
- **Financial statements are point-in-time** — they reflect only posted transactions as of the selected date
- **Period locking** — once a period is closed, new entries cannot be added to it

---

## 6. Inventory Workflow

```
Procurement → Stock Inward → Stock Ledger → Stock Outward → COGS
```

### Detailed Flow

1. **Procurement / Purchase**
   - Goods are procured from a supplier
   - Procurement is posted

2. **Stock Inward**
   - Automatically created when procurement is posted (or GRN is posted)
   - Stock quantity increases in the selected warehouse
   - Stock value increases by the purchase cost

3. **Stock Ledger**
   - Every inward and outward transaction is recorded in the Stock Ledger
   - The ledger shows: Date, Transaction Type, Inward Qty, Outward Qty, Balance Qty, Rate, Value
   - Running balance is maintained

4. **Stock Outward**
   - When goods are delivered to the department
   - Quantity decreases from the warehouse
   - Cost of Goods Sold (COGS) is calculated

5. **COGS Calculation**
   - COGS = Quantity Outward × Cost per unit
   - Cost per unit is determined by the valuation method (FIFO or Weighted Average)
   - COGS is recorded in the Profit & Loss account

### Valuation Methods

| Method | Description |
|---|---|
| **FIFO** | First-In, First-Out — earliest purchased items are issued first |
| **Weighted Average** | Average cost of all units in stock |

### Stock Adjustments

When physical verification reveals a difference:
- Create **Stock Adjustment** entry
- Enter the difference quantity (+ for surplus, - for shortage)
- Post to update the stock ledger
- The corresponding value adjustment goes to the P&L

---

## 7. GST Workflow

```
Purchase (Input GST) → Sales (Output GST) → GST Register → Net GST Payable
```

### Detailed Flow

1. **Purchase (Input GST)**
   - When procurement is posted, Input GST is recorded
   - Broken down: CGST, SGST (intra-state) or IGST (inter-state)
   - Input GST is an asset (credit available for set-off)

2. **Sales (Output GST)**
   - When billing invoice is posted, Output GST is recorded
   - Broken down: CGST, SGST or IGST
   - Output GST is a liability (amount due to government)

3. **GST Register**
   - Records all GST transactions
   - Shows:
     - Total Output GST (CGST + SGST/IGST)
     - Total Input GST (CGST + SGST/IGST)
     - Net GST Payable
     - Input Tax Credit (ITC) utilized

4. **Net GST Payable**
   - **Positive** (Output > Input): Amount to be paid to government
   - **Negative** (Input > Output): Credit carried forward to next period

### GST Return Filing

The ERP provides data for GSTR-1 (sales) and GSTR-3B (summary):
- Export sales data → GSTR-1 format
- Export purchase data → for ITC reconciliation with GSTR-2A
- Generate GSTR-3B summary from GST Register

### GST Adjustments

- **Credit Note** — reduces output GST
- **Debit Note** — increases output GST
- **GST Adjustment Voucher** — for corrections (e.g., wrong rate applied)

---

## 8. Receivables and Payables Workflow

### Receivables Flow

```
Invoice (Receivable Created) → Payment Received → Allocation → Outstanding Updated
```

1. **Invoice Created (Posted)**
   - Sales invoice is posted
   - Department becomes a debtor
   - Outstanding = Invoice Amount

2. **Payment Received**
   - Department sends payment (cheque/NEFT/RTGS)
   - Receipt is recorded with TDS/GST TDS details

3. **Allocation**
   - Receipt is allocated against one or more invoices
   - System validates: allocation total cannot exceed receipt amount

4. **Outstanding Updated**
   - After allocation posting, outstanding reduces
   - If fully paid, invoice status changes to **Paid**
   - Partially paid invoices show remaining balance

### Payables Flow

```
Procurement (Payable Created) → Payment Made → Allocation → Outstanding Updated
```

1. **Procurement Created (Posted)**
   - Purchase invoice is posted
   - Supplier becomes a creditor
   - Outstanding = Purchase Invoice Amount

2. **Payment Made**
   - Company pays supplier
   - Payment is recorded with bank details

3. **Allocation**
   - Payment is allocated against purchase bills

4. **Outstanding Updated**
   - After allocation posting, payable reduces

### Advance Adjustments

Sometimes you receive advances from departments or pay advances to suppliers:
- **Advance Received** — recorded as a liability; adjusted against future invoices
- **Advance Paid** — recorded as an asset; adjusted against future purchase bills

---

## 9. Document Workflow

```
Upload → Store → Link to Record → View/Preview → Download/Replace/Delete
```

1. **Upload**
   - Navigate to the Documents tab of the relevant transaction
   - Click **Upload** and select the file (PDF, JPG, PNG)
   - Files are validated for type and size

2. **Store**
   - File is stored in the application's document storage
   - Metadata recorded: filename, type, upload date, uploaded by, linked record

3. **Link to Record**
   - Document is linked to the specific transaction (order, invoice, procurement)
   - Document type is selected (PO, Invoice, Delivery Challan, etc.)

4. **View / Preview**
   - Click the document name to open the built-in viewer
   - Supports PDF and common image formats
   - No need for external PDF reader

5. **Download / Replace / Delete**
   - **Download**: Save a copy to your local machine
   - **Replace**: Upload a new version (old version archived for audit)
   - **Delete**: Remove the document (audit log records deletion)

---

## 10. Profitability Workflow

```
Billing Value - Purchase Cost = Gross Margin
Gross Margin - GST Impact - Expenses - Incentive = Net Profit
Net Profit / Total Cost × 100 = ROI %
```

### Step-by-Step

1. **Billing Value**
   - Total of all invoice amounts for the order (excluding GST)
   - Source: Billing invoices

2. **Purchase Cost**
   - Total cost of goods procured for the order
   - Source: Procurements (cost per unit × quantity)

3. **Gross Margin**
   - Billing Value - Purchase Cost
   - Should be positive for profitable orders

4. **GST Impact**
   - If input GST cannot be fully set off against output GST (e.g., different rates), the net GST cost is included
   - Source: GST Register

5. **Expenses**
   - All order-specific expenses (authorization, transport, installation)
   - Source: Expense entries

6. **Employee Incentive**
   - Calculated based on profitability and incentive rules
   - Source: Employee Incentive rules in Settings

7. **Net Profit**
   - Final profit after all deductions
   - If negative, the order is running at a loss

8. **ROI**
   - Net Profit / (Total Cost = Purchase Cost + Expenses + Incentive) × 100
   - Measure of return on investment

---

## 11. Print and Report Workflow

```
View Report → Apply Filters → Preview → Print / Export PDF / Export CSV
```

1. **View Report**
   - Navigate to the desired report from the Reports menu
   - Default view shows data for the current period

2. **Apply Filters**
   - Date range (from/to)
   - Company, Department, Supplier, Employee (context-dependent)
   - Status filters (Draft/Posted, Paid/Unpaid, etc.)
   - Report-specific criteria

3. **Preview**
   - Data refreshes based on filters
   - Scroll and review the report on screen

4. **Print / Export**
   - **Print**: Opens browser print dialog (Ctrl+P) — use it to print or save as PDF
   - **PDF Export**: Click PDF icon — saves a formatted PDF directly
   - **CSV Export**: Click CSV icon — downloads data for Excel
   - **Excel Export**: Click Excel icon — downloads formatted .xlsx

### Export Tips
- CSV is best for data analysis in Excel
- PDF is best for sharing and presentation
- Use filters before export to limit data volume
- Large reports may take a few seconds to generate

---

## 12. Correction and Reversal Rules

### General Principle

Once a transaction is **Posted**, it cannot be edited or deleted directly. Corrections must follow the prescribed workflow to maintain audit integrity.

### 1. Reverse Posted Voucher

Available from the voucher itself (Accounting > Voucher Register):
- Select a posted voucher → Click **Reverse**
- System creates a **Reversal Voucher** that nullifies all entries
- The original voucher is marked as **Reversed**
- Reversal requires a reason (mandatory) and may need approval

### 2. Correction via Credit Note / Debit Note

| Scenario | Correction Method |
|---|---|
| Invoice value too high | Credit Note (reduces value) |
| Invoice value too low | Debit Note (increases value) |
| Wrong GST rate applied | Credit Note + Re-invoice with correct rate |
| Goods returned | Credit Note |
| Additional charges | Debit Note |

### 3. Reallocation of Payments

If a receipt was allocated to the wrong invoice:
1. Go to the Receipt → Allocation tab
2. Click **Reallocate**
3. Remove allocation from the incorrect invoice
4. Add allocation to the correct invoice
5. Save and post

### 4. Advance Adjustment Reversal

To reverse an advance adjustment:
1. Navigate to Receivables & Payables > Advances
2. Find the advance adjustment entry
3. Click **Reverse**
4. The advance is restored to its pre-adjustment state

### Audit Trail

All corrections are logged:
- Original voucher details preserved
- Correction voucher references the original
- User, date, time, and reason recorded
- Reports show both original and corrected values

---

## 13. Common User Mistakes

### Mistake 1: Posting Without Completing All Items

**Issue:** User posts a procurement or invoice before adding all items.

**Result:** Partial transaction forces supplemental entries or reversal.

**Fix:** Always review the item list before clicking Post. Use Draft status as a checklist — save as Draft, review, then Post.

### Mistake 2: Wrong Department Selection

**Issue:** Selecting the wrong department on a supply order.

**Result:** Invoice goes to the wrong department. Receivables and ageing are incorrect.

**Fix:** Double-check department before saving. If posted, use Credit Note + re-invoice to correct.

### Mistake 3: Mismatched Invoice Numbers

**Issue:** Entering a purchase invoice number that doesn't match the supplier's invoice.

**Result:** Audit mismatch, difficulty in reconciliation, supplier disputes.

**Fix:** Always copy the invoice number exactly from the supplier's document. Avoid manual typing if possible.

### Mistake 4: Not Allocating TDS / GST TDS

**Issue:** Recording a receipt without entering TDS and GST TDS details.

**Result:** TDS Receivable is not recorded. The company loses track of TDS reclaimable. Bank reconciliation fails (amount doesn't match).

**Fix:** Always enter TDS and GST TDS amounts when recording a receipt. The net receipt amount should be: Invoice Amount - TDS - GST TDS.

### Mistake 5: Not Linking Expenses to Correct Order

**Issue:** Creating an expense without linking it to the correct supply order.

**Result:** Order profitability is incorrect. The expense appears as a general cost rather than order-specific.

**Fix:** Always select the correct order when entering expenses. Use the order reference field.

### Mistake 6: Editing Posted Records

**Issue:** Attempting to edit a transaction after it has been posted.

**Result:** System blocks the edit. User gets confused.

**Fix:** Posted transactions cannot be edited. Use reversal or credit/debit note for corrections. Save as Draft first and review before posting.

### Mistake 7: Not Checking Document Readiness Before Billing

**Issue:** Creating an invoice without attaching all required documents.

**Result:** The invoice goes to the department but payment is delayed because documents are incomplete.

**Fix:** Check the **Readiness Panel** on the billing screen. Ensure all required documents are attached before posting.

### Mistake 8: Wrong Financial Year

**Issue:** Entering a transaction date that falls in a different financial year.

**Result:** Reporting errors, incorrect year-end balances.

**Fix:** Check the financial year before saving. Use the correct date. If a year is closed, you cannot add transactions to it.

### Mistake 9: Duplicate Entries

**Issue:** User clicks Save or Post twice, creating duplicate transactions.

**Result:** Duplicate invoices, duplicate stock entries, doubled amounts.

**Fix:** The system has duplicate checks (invoice number, UTR number), but always verify before posting. If duplicate occurs, reverse the extra entry.

### Mistake 10: Not Posting in the Correct Sequence

**Issue:** Posting an invoice before stock is issued, or posting a receipt before the invoice.

**Result:** System may block the transaction or show inconsistent data.

**Fix:** Follow the defined workflow order: Order → Procurement → GRN → Stock Outward → Billing → Receipt → Allocation.

---

## 14. FAQ

### General

**Q: What is the difference between Save and Post?**
A: Save creates a Draft with no accounting impact. Post creates accounting vouchers and updates ledgers, stock, and GST.

**Q: Can I undo a Post?**
A: Yes, through reversal. Reversing creates opposite entries that nullify the original.

**Q: How do I switch companies?**
A: Go to Settings > Switch Company. You can also use All Companies view for read-only access across companies.

**Q: What happens when the financial year ends?**
A: You create a new financial year. Opening balances are carried forward. The previous year is closed for new entries.

### Masters

**Q: Can I edit a master after transactions exist?**
A: Yes, but changes to GSTIN or PAN may affect statutory reports. Edit with caution.

**Q: How do I import masters in bulk?**
A: Use Utilities > Import > Import Masters (CSV). Download the template, fill data, and upload.

### Supply Orders

**Q: Can I add items to an order after saving?**
A: Yes, if it is in Draft status. Once posted, use a supplementary order.

**Q: What if the department sends a revised PO?**
A: You can update the existing order (if Draft) or create a revised version. Keep the original PO document attached.

### Procurement

**Q: Can I procure from multiple suppliers for one order?**
A: Yes, you can create multiple procurements against one supply order.

**Q: What if the supplier sends a partial invoice?**
A: Create procurement for the received quantity. The balance remains for future procurement.

**Q: What is the difference between procurement and GRN?**
A: Procurement records the purchase transaction. GRN records physical receipt of goods. They can be done together or separately.

### GRN

**Q: What if the received quantity is less than ordered?**
A: Record the actual received quantity. The difference is tracked as short quantity.

**Q: What happens to damaged goods?**
A: Record damaged quantity separately. It is not added to stock. You can create a debit note for the supplier.

### Billing

**Q: What is the Readiness Panel?**
A: It shows whether all prerequisites for billing are met — items procured, issued, and documents attached.

**Q: How do I handle GST on invoices?**
A: GST rate is picked from the item master. Verify before posting. CGST + SGST for intra-state, IGST for inter-state.

**Q: Can I generate e-invoice?**
A: E-invoice integration is planned but not yet available. Placeholder fields exist for IRN.

### Collections / Receipts

**Q: What if the department deducts TDS?**
A: Enter TDS and GST TDS amounts in the receipt. The system creates TDS Receivable entries.

**Q: What is allocation?**
A: Allocation is the process of applying a receipt against specific invoices. Without allocation, the receipt remains unallocated and doesn't reduce outstanding.

**Q: Can I split a receipt across multiple invoices?**
A: Yes, during allocation you can distribute the receipt amount across several invoices.

### Accounting

**Q: Why does my Trial Balance not match?**
A: Check for unposted Draft transactions. Only posted entries appear in the Trial Balance.

**Q: How do I enter opening balances?**
A: Use Accounting > Accounting Vouchers > Opening Balance Entry for the new financial year.

**Q: What is a Contra voucher?**
A: A Contra voucher is used for internal transfers — cash deposit to bank, bank to bank transfer, or cash withdrawal.

### GST

**Q: How is net GST payable calculated?**
A: Output GST (from sales) minus Input GST (from purchases). If positive, payable to government.

**Q: What is GST TDS?**
A: Tax deducted at source under GST. Departments deduct 2% (1% CGST + 1% SGST) on payments. It is reclaimable as input tax credit.

### Reports

**Q: How do I export a report to Excel?**
A: Open the report, apply filters, click the Excel icon. A .xlsx file is downloaded.

**Q: Why is a transaction not appearing in a report?**
A: Check if the transaction is posted. Draft transactions do not appear in financial or operational reports.

### Profitability

**Q: Why does an order show negative profit?**
A: Possible reasons: purchase cost exceeds billing value, expenses are high, or not all billing is completed.

**Q: How is employee incentive calculated?**
A: Based on configured rules in Settings > Policies > Profitability Rules. Typically a percentage of net profit.

### Backup

**Q: How often should I back up?**
A: Daily is recommended. The system supports automated scheduled backups.

**Q: Where are backups stored?**
A: Locally (configurable path) and optionally in cloud storage.

---

## 15. Glossary

| Term | Definition |
|---|---|
| **Voucher** | An accounting document recording a financial transaction with balanced debit and credit entries. Every posted transaction creates one or more vouchers. |
| **Posting** | The act of converting a draft transaction into accounting entries. Impacts ledgers, stock, GST, and reports. Posted transactions cannot be edited. |
| **Ledger** | A book of accounts that records all transactions affecting a specific account (e.g., Bank Ledger, Sales Ledger). Shows running balance. |
| **Trial Balance** | A statement listing all ledger accounts with their total debits and credits. Used to verify that total debits equal total credits before preparing financial statements. |
| **GST** | Goods and Services Tax — indirect tax levied on supply of goods and services. Includes CGST (Central), SGST (State), and IGST (Inter-State). |
| **CGST** | Central Goods and Services Tax — central government portion of GST for intra-state transactions. |
| **SGST** | State Goods and Services Tax — state government portion of GST for intra-state transactions. |
| **IGST** | Integrated Goods and Services Tax — GST for inter-state transactions and imports. |
| **Input GST** | GST paid on purchases. Available as credit (Input Tax Credit) to set off against output GST liability. |
| **Output GST** | GST charged on sales. Amount payable to the government (after deducting input credit). |
| **TDS** | Tax Deducted at Source — income tax deducted by the department at the time of payment. The company can reclaim this when filing income tax returns. |
| **GST TDS** | Tax deducted at source under GST provisions. Deducted by government departments at 2%. Reclaimable as input tax credit. |
| **CRAC** | Consolidated Receipt and Accounting Certificate — document required by government departments to process payment. Certifies that goods have been received and installed. |
| **GRN** | Goods Receipt Note — document recording the physical receipt of goods from a supplier. Records received, damaged, and accepted quantities. |
| **Allocation** | The process of applying a receipt or payment against specific invoices or bills. Allocated amounts reduce outstanding balances. |
| **Outstanding** | The amount remaining to be paid (receivable from department) or to be received (payable to supplier). Total invoice/bill amount minus allocated payments/receipts. |
| **Ageing** | Classification of outstanding amounts by time period (0-30, 31-60, 61-90, 90+ days). Used to assess collection risk and payment discipline. |
| **Profitability** | Measurement of financial performance — the difference between revenue earned and costs incurred. |
| **Gross Margin** | Billing value minus purchase cost. Measures the basic profit before other costs. |
| **Net Profit** | Gross margin minus all expenses, GST impact, and incentives. The actual profit from a transaction. |
| **ROI** | Return on Investment — (Net Profit / Total Cost) × 100. Measures the efficiency of the investment. |
| **COGS** | Cost of Goods Sold — the direct cost of goods that were delivered to the customer. Calculated from the stock outward at the time of billing. |
| **ITC** | Input Tax Credit — credit available for GST paid on purchases, which can be used to reduce output GST liability. |
| **HSN Code** | Harmonized System of Nomenclature — standardized code for classifying goods, used for GST determination. |
| **SAC Code** | Services Accounting Code — standardized code for classifying services, analogous to HSN for goods. |
| **UTR** | Unique Transaction Reference — reference number for electronic fund transfers (NEFT/RTGS). Used for bank reconciliation. |
| **IFSC** | Indian Financial System Code — alphanumeric code that identifies bank branches in India. |
| **GSTIN** | Goods and Services Tax Identification Number — unique 15-digit alphanumeric code assigned to each registered taxpayer. |
| **PAN** | Permanent Account Number — unique 10-digit alphanumeric code issued by the Income Tax Department. |
| **Contra** | An accounting entry that involves transfer between bank accounts or between cash and bank. |
| **Journal Entry** | A manual accounting entry with debit and credit lines, used for adjustments and corrections. |
| **Reversal** | The process of nullifying a previously posted voucher by creating opposite entries. The original voucher is marked as reversed. |
| **Credit Note** | A document that reduces the value of an invoice. Used for returns, rate reductions, or corrections. |
| **Debit Note** | A document that increases the value of an invoice. Used for additional charges or corrections. |
| **Draft** | A saved transaction that has no accounting impact. Can be edited, deleted, or posted later. |
| **Posted** | A transaction that has been posted and has accounting impact. Cannot be edited directly. |
| **P&L** | Profit and Loss Account — financial statement showing income and expenses over a period. |
| **Balance Sheet** | Financial statement showing assets, liabilities, and equity at a specific point in time. |
| **Closing Stock** | Value of unsold inventory at the end of a financial period. |
| **Opening Balance** | The balance of each account at the start of the financial year, carried forward from the previous year's closing. |
| **Financial Year** | The 12-month period for financial reporting. In India, typically April 1 to March 31. |
| **Audit Trail** | A chronological record of all actions performed on transactions — who created, modified, posted, reversed, and when. |
| **Simulator** | A what-if analysis tool that lets you change variables (rates, costs, expenses) and see projected profitability. |
| **E-Invoice** | Electronic invoice with a unique Invoice Reference Number (IRN) from the GST portal. Under development in this version. |
| **E-Way Bill** | Electronic document required for movement of goods above a specified value. Under development in this version. |
| **Queue** | A list of items pending action — posting queue, approval queue, document verification queue. |
| **Valuation Method** | The method used to calculate the cost of inventory (FIFO or Weighted Average). Affects COGS and profitability. |
| **FIFO** | First-In, First-Out — inventory valuation method where oldest stock is issued first. |
| **Weighted Average** | Inventory valuation method where cost is calculated as average of all units in stock. |
| **Warehouse Transfer** | Moving stock from one warehouse to another without change in ownership or value. |
| **Reservation** | Allocating specific stock to a specific order or customer, preventing it from being used elsewhere. |
