# Universal Accounting Concepts

> Phase H — Tally Intelligence Layer  
> Applies to: Tally.ERP 9, TallyPrime, and any double-entry accounting system

---

## 1. Introduction

This document captures the universal accounting truths that transcend any specific software version or vendor. Every double-entry accounting system — whether Tally.ERP 9, TallyPrime, SAP, Oracle Financials, or Zoho Books — rests on the same foundational concepts. This document serves as the single source of truth for the Tally Intelligence Layer's understanding of accounting, ensuring that all downstream AI models, transformation pipelines, and reporting engines reason from timeless principles rather than version-specific quirks.

The concepts defined here are stable. They do not change between Tally.ERP 9 and TallyPrime, nor do they vary across financial years or regulatory regimes (though tax structures and compliance reports may). Any intelligence layer that internalises these concepts can generalise across ERP versions, countries, and accounting standards (GAAP, IFRS, IND AS).

---

## 2. Entity Model (Universal)

### 2.1 Groups

A **Group** is a classification heading under which ledgers of similar nature are collected. Groups form a parent-child hierarchy rooted in 28 pre-defined primary groups that the system creates automatically when a new company is created.

**Primary (System) Groups** — fixed, cannot be deleted, nature is hard-coded:

| Group Name | Nature | Affect Gross Profit? |
|---|---|---|
| Current Assets | Debit (Asset) | No |
| Fixed Assets | Debit (Asset) | No |
| Investments | Debit (Asset) | No |
| Loans & Advances (Asset) | Debit (Asset) | No |
| Bank Accounts | Debit (Asset) | No |
| Cash-in-Hand | Debit (Asset) | No |
| Stock-in-Hand | Debit (Asset) | No |
| Sundry Debtors | Debit (Asset) | No |
| Duties & Taxes | Debit or Credit | No |
| Current Liabilities | Credit (Liability) | No |
| Provisions | Credit (Liability) | No |
| Sundry Creditors | Credit (Liability) | No |
| Loans (Liability) | Credit (Liability) | No |
| Branch/Divisions | Mixed | No |
| Miscellaneous Expenses (Asset) | Debit (Asset) | No |
| Suspense Account | Mixed | No |
| Reserves & Surplus | Credit (Equity) | No |
| Capital Account | Credit (Equity) | No |
| Direct Income | Credit (Income) | Yes |
| Indirect Income | Credit (Income) | No |
| Sales Accounts | Credit (Income) | Yes |
| Direct Expenses | Debit (Expense) | Yes |
| Indirect Expenses | Debit (Expense) | No |
| Purchase Accounts | Debit (Expense) | Yes |
| Revenue (Expense) | Debit (Expense) | No |
| Retained Earnings | Credit (Equity) | No |
| Secured Loans | Credit (Liability) | No |
| Unsecured Loans | Credit (Liability) | No |

**User-created Sub-groups**: Any user can create sub-groups under these primary groups. Sub-groups inherit the nature (debit/credit) of their parent. For example, "Office Equipment" can be created under "Fixed Assets". The hierarchy can go arbitrarily deep, though practically limited to 5–6 levels.

**Behaviour**: Groups with "Affect Gross Profit = Yes" appear above the gross profit line in the P&L. Groups with "Affect Gross Profit = No" appear below it.

### 2.2 Ledgers

A **Ledger** is the individual account head under which all financial transactions for a specific entity (party, expense head, asset, etc.) are recorded. Every ledger belongs to exactly one group.

**Classification by Nature**:

- **Primary (Trading) Ledgers**: Sales, Purchase — directly affect gross profit. These are the ledgers that appear in the Trading Account.
- **Secondary (P&L) Ledgers**: Direct/Indirect Income and Expenses — appear in the Profit & Loss statement below gross profit.
- **Balance Sheet Ledgers**: Assets, Liabilities, Equity — appear in the Balance Sheet.
- **Party Ledgers**: Sundry Debtors (customers) and Sundry Creditors (suppliers) — used for receivables/payables tracking.

**Key Attributes**:
- Name (unique within company)
- Under (Group)
- Opening Balance (at financial year start)
- Mailing Details (for parties)
- GSTIN / PAN (for tax compliance)
- Credit Period / Limit (for receivables management)
- Registration Type (Regular, Composition, Unregistered, etc.)

**Master vs Transaction Ledgers**: This is a runtime intelligence concept — a ledger is a "master" if it mostly holds opening/closing balances and is not transacted frequently (e.g., Capital Account). It is a "transaction ledger" if it participates in many vouchers daily (e.g., Sales, Purchases, Party ledgers).

### 2.3 Vouchers

A **Voucher** is the evidence of a financial transaction. In Tally, the voucher type determines the physical format on screen and the default accounting treatment.

**Universal Voucher Types**:

| Voucher Type | Abbreviation | Accounting Effect |
|---|---|---|
| Payment | Pymt | Decrease in cash/bank, Decrease in liability or Increase in expense/asset |
| Receipt | Rcpt | Increase in cash/bank, Decrease in asset or Increase in income/liability |
| Sales | Sales | Increase in income (Sales), Increase in debtor or Cash |
| Purchase | Pur | Increase in expense (Purchase), Increase in creditor or Decrease in cash |
| Contra | Contra | Transfer between cash/bank accounts (no net P&L effect) |
| Journal | Jrnl | Non-cash adjustments: depreciation, accruals, provisions, rectifications |
| Credit Note | Cr.Note | Reduction in sales or receivable (return inward) |
| Debit Note | Dr.Note | Reduction in purchase or payable (return outward) |
| Stock Journal | Stk.Jrnl | Transfer of inventory between godowns (no financial effect) |
| Physical Stock Journal | Stk.Phy | Stock count adjustment — difference between book and physical stock |
| Payment on Account | Pay. Acc | Advance payment to supplier (before purchase) |
| Receipt on Account | Rct. Acc | Advance receipt from customer (before sale) |

**Voucher States** (universal workflow):
- Optional / Non-Accounting (draft, no ledger effect)
- Entered but not yet accounted
- Accounted and posted (default)
- Cancelled (reversed or struck off with a flag)

### 2.4 Stock Items

A **Stock Item** represents an inventory item that is bought, sold, or manufactured.

**Key Attributes**:
- Name
- Under (Stock Group)
- Units (link to Unit of Measure)
- Opening Balance (quantity and value)
- Standard Rate / Valuation Rate
- GST Applicability (tax rate, HSN/SAC code)
- Batch/Lot number (optional)
- Expiry Date (optional, for perishables)
- Manufacturing / Expiry Date tracking
- Barcode / SKU
- Godown-wise stock tracking (enabled per unit)

**Valuation Methods** (set at company or item level):
- Average Cost (default in Tally)
- FIFO (First In First Out)
- Standard Cost
- LIFO (Last In First Out — not recommended under Ind AS/IFRS)

### 2.5 Stock Groups

A **Stock Group** is the classification hierarchy for stock items, analogous to financial groups for ledgers.

**Behaviour**:
- Parent-child tree
- Used for inventory reporting by category
- Can optionally have "Rate of Duty" for excise (legacy) or other tax attributes

### 2.6 Units of Measure

Units of Measure (UOM) define how the quantity of a stock item is counted. Tally ships with 21+ standard UOMs.

**Common UOMs**: Nos, Kgs, Ltrs, Mtrs, Pcs, Boxes, Bags, Dozens, Packets, Rolls, Sheets, Bottles, Trays, Cartons, Drums, Reams, Quintals, Tonnes, Gallons, Grams, Millilitres

**UOM Properties**:
- Symbol (e.g., "Nos")
- Formal Name (e.g., "Numbers")
- Decimal Places (0 for Nos, 2 for Kgs, etc.)
- Conversion Factor (e.g., 12 Nos = 1 Dozen — allows compound UOMs)

**UQC (Unit Quantity Code)** — mandatory mapping under GST: Each UOM maps to a standard UQC code (e.g., Nos → UAQ, Kgs → KGM, Ltrs → LTR).

### 2.7 Godowns

A **Godown** is a physical or logical storage location for inventory.

**Properties**:
- Name
- Under (parent godown, allowing hierarchy: e.g., "Warehouse > Aisle-3 > Rack-12")
- Address / Contact details
- Godown-wise stock availability (enabled per company or per item)

**Behaviour**: When stock is received into a godown, quantity and value increase. When stock is issued, quantity and value decrease. Transfers between godowns (Stock Journal) change location but not total inventory.

### 2.8 Cost Centres and Cost Categories

A **Cost Centre** is a unit of an organisation to which costs and revenues can be allocated — used for departmental or project-level profitability analysis.

A **Cost Category** is a broader classification that groups multiple cost centres. For example:
- Cost Category: "Projects" → Cost Centres: "Project Alpha", "Project Beta"
- Cost Category: "Departments" → Cost Centres: "Sales", "Marketing", "R&D"

**Allocation Methods**:
- Direct allocation (full amount to one cost centre)
- Proportional allocation (split across multiple cost centres by percentage or value)

**Reporting**: Enables Profit & Loss by cost centre, Budget vs Actual by cost centre.

### 2.9 Currencies

Multi-currency support is universal. Every transaction can be recorded in a foreign currency and automatically translated to the company's base currency.

**Key Concepts**:
- Base Currency (company's reporting currency)
- Foreign Currency (transaction currency)
- Exchange Rate (rate as of transaction date, or manual overrides)
- Rate of Exchange (buying rate for receipts, selling rate for payments)
- Exchange Gain/Loss (automatically computed on revaluation at period-end)
- Forex Revaluation (mark-to-market adjustment of outstanding forex positions)

**Forex Revaluation**:
- Select outstanding receipts/payments in foreign currency
- Apply current period-end exchange rate
- Post difference as Exchange Gain or Exchange Loss
- Creates a Journal voucher automatically

### 2.10 Budgets and Scenarios

**Budget**: A planned target for a specific group of ledgers or cost centres for a financial period.

**Scenarios** (formerly "Makers" in older versions): Allow what-if analysis without affecting actual data. A scenario is a copy of actual data with hypothetical adjustments applied.

**Relationships**:
- Budget → Ledger / Cost Centre
- Scenario → Actual + Budget → Variance Analysis
- Scenario can include "Expected values" vs "Actual values"

**Variance Computation**: Budgeted Amount - Actual Amount = Variance. Variance can be favourable (income higher than budget, expense lower than budget) or adverse (opposite).

---

## 3. Accounting Principles

### 3.1 Double-Entry Bookkeeping

Every financial transaction affects at least two ledger accounts. The total debits must equal total credits for every voucher. This is the inviolable constraint that ensures the accounting equation stays balanced.

**Rule**: For every valid voucher, `SUM(Debit Amounts) == SUM(Credit Amounts)`.

### 3.2 Debit and Credit Rules

| Account Type | To Increase | To Decrease | Normal Balance |
|---|---|---|---|
| Asset | Debit | Credit | Debit |
| Liability | Credit | Debit | Credit |
| Equity (Capital) | Credit | Debit | Credit |
| Income (Revenue) | Credit | Debit | Credit |
| Expense | Debit | Credit | Debit |

**Mnemonic**: DEALER  
- **D**ividends / **D**rawings → Debit  
- **E**xpenses → Debit  
- **A**ssets → Debit  
- **L**iabilities → Credit  
- **E**quity → Credit  
- **R**evenues → Credit  

### 3.3 Accounting Equation

```
Assets = Liabilities + Equity
```

This equation must hold at all times:
- After every transaction (transiently, per voucher)
- At period-end (Balance Sheet)
- Across financial years (closing balance = opening balance + changes)

**Extended Equation**:
```
Assets = Liabilities + Capital + (Income - Expenses)
```

Because Expenses decrease equity and Income increases equity, the equation expands naturally to include the P&L.

### 3.4 Accrual vs Cash Basis

| Aspect | Accrual Basis | Cash Basis |
|---|---|---|
| Income recognised when | Earned (invoice raised) | Cash received |
| Expense recognised when | Incurred (bill received) | Cash paid |
| Outstanding tracking | Debtors & Creditors maintained | No receivables/payables |
| Compliance | Required under GAAP/IFRS/Ind AS | Permitted for small businesses / composition scheme |
| Tally method | "Accounts only" with bill-wise | "Cash basis" in Tally settings |

**Hybrid/Mixed**: Some companies use accrual for financial reporting and cash for tax computation — requires reconciliation.

### 3.5 Financial Year Concept

Every company in Tally is defined by a financial year (e.g., 01-Apr-2025 to 31-Mar-2026 for India).

**Key Dates**:
- **Year Start**: Opening balances are loaded; books begin from this date.
- **Year End**: Books are closed; Profit/Loss is transferred to Retained Earnings / Capital.
- **Current Period**: A subset of the financial year for reporting (e.g., Q2).
- **Lock Date**: Transactions before this date cannot be altered (audit freeze).

**Cross-Year Handling**: Tally maintains the same ledger across years. Opening balance of a year is automatically the closing balance of the previous year. Retained earnings from the previous year carry forward.

### 3.6 Opening and Closing Balances

**Opening Balance**: The balance of a ledger at the start of the financial year. Set once when the company is created or at the end of the previous year.

**Closing Balance**: Computed as:
```
Closing Balance = Opening Balance + SUM(Period Debits) - SUM(Period Credits)
```

**Nature Reversal**: When closing balance crosses zero in the opposite direction (e.g., a Current Liability ledger shows debit balance), it appears on the opposite side of the Balance Sheet. This is called "nature reversal" and is handled automatically.

**Zero-Balance Ledgers**: Income and Expense ledgers start at zero every year (their balance transfers to Retained Earnings at year-end). Asset, Liability, and Equity ledgers carry balances forward.

---

## 4. Transaction Flow

### 4.1 Financial Transaction Flow

```
User enters Voucher
  → Voucher type determines template (Payment, Sales, etc.)
    → Ledger entries are created (dr/cr split)
      → Validation: Total Debits == Total Credits
        → If GST enabled: Tax computation triggered
          → Voucher saved and posted
            → Ledger balances updated
              → Reporting engines recompute affected reports
```

**At each step**:
1. Voucher creation: metadata (date, reference, party, narration)
2. Ledger entry: at least 2 entries (one debit, one credit)
3. Balance update: voucher posting updates each ledger's running balance
4. Re-computation: Balance Sheet, P&L, Trial Balance reflect immediately

### 4.2 Inventory Transaction Flow

```
Purchase/Sales Voucher with Stock Items
  → Stock Item quantity and value updated
    → Godown stock updated (if godown tracking enabled)
      → Inventory valuation recalculated (average, FIFO, etc.)
        → Cost of Goods Sold computed for sales
          → P&L reflects COGS
```

**Purchase Voucher with Inventory**:
- Dr Purchase Account (with value of goods)
- Cr Supplier (Sundry Creditor)
- Stock Item quantity increases in godown
- Stock value increases by purchase value
- If tax is applicable, input tax credit (ITC) is created

**Sales Voucher with Inventory**:
- Dr Customer (Sundry Debtor)
- Cr Sales Account (with sales value)
- Stock Item quantity decreases in godown
- Reduction in stock value = COGS (as per valuation method)
- COGS is posted to "Closing Stock" or directly matched against sales

### 4.3 Bill-Wise Allocation

Bill-wise allocation tracks which payments settle which invoices. This is essential for:
- Outstanding management (Ageing analysis)
- GST compliance (tracking payments against specific invoices)
- Forex revaluation (which specific foreign currency bills are outstanding)

**Logic**:
- Purchase Invoice: Creates a "credit bill" in the supplier ledger
- Payment: User allocates payment to specific credit bills
- Sales Invoice: Creates a "debit bill" in the customer ledger
- Receipt: User allocates receipt to specific debit bills

**Allocation Methods**:
- Manual: User explicitly picks which bills to settle
- Auto-ageing: Oldest bills settled first
- On-account: Payments not tagged to specific bills (advances)

**Partial Settlement**: A single payment can partially settle multiple bills, or multiple payments can settle one bill.

### 4.4 Tax Calculation Flow

```
Applicable Tax Rate (from Stock Item or Ledger)
  → Taxability determined (Taxable, Non-Taxable, Exempt, Zero-Rated, Nil-Rated)
    → Tax Amount = Taxable Value × Rate
      → Tax Ledger entries created automatically
        → Debit: Tax on Purchase (ITC) or Credit: Tax on Sales (Output Tax)
          → Tax liability computed: Output Tax - ITC
            → GSTR filings derived from these tax ledgers
```

---

## 5. Tax Compliance Framework

### 5.1 GST Structure (India)

**Tax Components**:
- **CGST** (Central GST) — levied by Central Government
- **SGST** (State GST) — levied by State Government
- **IGST** (Integrated GST) — levied on inter-state transactions and imports

**Tax Rate Application**:

| Transaction Type | CGST | SGST | IGST |
|---|---|---|---|
| Intra-state Supply (same state) | ✓ | ✓ | ✗ |
| Inter-state Supply (different state) | ✗ | ✗ | ✓ |
| Import | ✗ | ✗ | ✓ |
| Export | 0% (Zero-rated) | 0% | 0% |

**Common Rate Slabs**: 0% (Exempt), 5%, 12%, 18%, 28%

**Tax Ledger Mapping**:
- Output CGST → Duties & Taxes (Credit nature — liability)
- Output SGST → Duties & Taxes (Credit nature — liability)
- Output IGST → Duties & Taxes (Credit nature — liability)
- Input CGST → Duties & Taxes (Debit nature — asset/ITC)
- Input SGST → Duties & Taxes (Debit nature — asset/ITC)
- Input IGST → Duties & Taxes (Debit nature — asset/ITC)

**ITC Setoff Hierarchy**:
```
Input IGST → Output IGST → Output CGST → Output SGST
Input CGST → Output CGST → Output IGST
Input SGST → Output SGST → Output IGST
```

### 5.2 HSN/SAC Code Classification

- **HSN** (Harmonised System of Nomenclature): For goods. 4, 6, or 8 digit code.
- **SAC** (Services Accounting Code): For services. Typically 8 digit code starting with "99".

**Hierarchy**:
- Stock Item → HSN Code
- Ledger (Service) → SAC Code
- Rate of GST determined by HSN/SAC → Rate Slab
- Validations: 6+ digit required for returns, higher digit = more precise classification

### 5.3 GSTR Return Filing Flow

| Return | Description | Periodicity |
|---|---|---|
| GSTR-1 | Outward supplies (sales) | Monthly/Quarterly |
| GSTR-2A | Auto-drafted inward supplies (purchases from suppliers) | Monthly |
| GSTR-3B | Summary return + Payment of tax | Monthly |
| GSTR-9 | Annual return | Annually |
| GSTR-9C | Audit certification (Revenue > threshold) | Annually |

**Flow**:
```
Prepare Sales data → GSTR-1 (outward)
  → System auto-generates GSTR-2A from supplier filings → Match purchase invoices
    → Reconcile with GSTR-2A (accept/reject/modify)
      → GSTR-3B is filed with summarized net tax liability
        → Payment of tax (Cash ledger / ITC utilization)
          → Annual return (GSTR-9) reconciles all monthly filings
```

### 5.4 TDS/TCS Mechanics

**TDS (Tax Deducted at Source)**:
- Buyer deducts a % from payment to seller
- Deducted amount is deposited to government
- Seller claims the deducted amount as credit
- TDS Rate depends on nature of payment (Section of Income Tax Act)

**TCS (Tax Collected at Source)**:
- Seller collects extra % from buyer (specific goods/services)
- Collected amount deposited to government

**Tally Implementation**:
- TDS/TCS Nature: Pre-defined by tax authority
- TDS/TCS Rate: Defined per nature, updated annually
- Threshold: Transactions below threshold are exempt
- Every transaction creates:
  1. Main ledger entry (expense/income)
  2. TDS/TCS Payable ledger entry (liability)
  3. TDS/TCS Certificate management

---

## 6. Report Hierarchy (Universal)

### 6.1 Balance Sheet Structure

```
BALANCE SHEET (as at <date>)
├── Liabilities
│   ├── Capital Account
│   │   └── [All ledgers under Capital Account group]
│   ├── Reserves & Surplus
│   │   └── [All ledgers under Reserves & Surplus]
│   ├── Secured Loans
│   ├── Unsecured Loans
│   ├── Current Liabilities
│   │   ├── Sundry Creditors
│   │   ├── Duties & Taxes
│   │   └── Provisions
│   └── [Sub-groups under each primary group]
│
├── Assets
│   ├── Fixed Assets
│   │   └── [All fixed asset ledgers — Gross Block - Depreciation]
│   ├── Current Assets
│   │   ├── Sundry Debtors
│   │   ├── Cash-in-Hand
│   │   ├── Bank Accounts
│   │   ├── Stock-in-Hand
│   │   └── Loans & Advances
│   ├── Investments
│   └── [Miscellaneous Expenses (Asset) — deferred revenue expenditure]
│
└── Net Profit/Loss (transferred from P&L)
```

**Key Rule**: `Total Assets = Total Liabilities` (includes Net Profit in Liabilities side).

### 6.2 Profit & Loss (P&L) Statement

```
PROFIT & LOSS (for period <start> to <end>)
├── Trading Account
│   ├── Sales (Cr) 
│   ├── Less: Sales Returns / Credit Notes
│   ├── Net Sales
│   ├── Less: Cost of Goods Sold
│   │   ├── Opening Stock
│   │   ├── Add: Purchases
│   │   ├── Less: Purchase Returns / Debit Notes
│   │   ├── Add: Direct Expenses (freight, octroi, etc.)
│   │   └── Less: Closing Stock
│   └── GROSS PROFIT (carried to P&L)
│
├── Income
│   ├── Gross Profit (from Trading Account)
│   └── Indirect Income (interest, commission, discounts received)
│
├── Expenses
│   ├── Indirect Expenses (salary, rent, electricity, depreciation, etc.)
│   └── [All ledgers with nature affecting Gross Profit = No]
│
└── NET PROFIT (carried to Balance Sheet)
```

### 6.3 Trial Balance

The Trial Balance is a summarised list of all ledger balances at a given date.

```
TRIAL BALANCE (as at <date>)
├── [All Ledgers with Debit Balance]
│   ├── Assets (Dr)
│   ├── Expenses (Dr)
│   └── Drawings (Dr)
│
├── [All Ledgers with Credit Balance]
│   ├── Liabilities (Cr)
│   ├── Income (Cr)
│   ├── Capital (Cr)
│   └── Sales/Purchases (if not yet transferred)
│
└── TOTAL DEBITS = TOTAL CREDITS (always balances)
```

**Purpose**: First step in the accounting cycle before preparing final accounts. Validates that no arithmetic error exists in ledger postings.

### 6.4 Ledger Queries

A **Ledger Query** shows all transactions in a specific ledger between two dates, with periodical totals.

```
LEDGER: <Ledger Name>
<Date> | <Voucher No> | <Particulars> | <Debit> | <Credit> | <Balance>
...
Period Total:         |              | <∑Dr>   | <∑Cr>   | <Closing Bal>
Closing Balance:      |              |         |         | <Dr/Cr>
```

**Features**:
- Configurable date ranges
- Filter by voucher type
- Bill-wise break-up (outstanding bills)
- Cost centre allocation detail
- Transaction-level drill-down (from ledger → voucher)

### 6.5 Day Book

The Day Book lists all vouchers entered on a given day (or date range).

```
DAY BOOK: <date(s)>
<Time> | <Voucher Type> | <Voucher No> | <Party Name> | <Debit Total> | <Credit Total>
...
Day Total:             |              |              | <∑Dr>         | <∑Cr>
```

**Variations**: Sales Register, Purchase Register, Payment Register, Receipt Register, Journal Register, Contra Register — all are filtered views of the Day Book.

---

## 7. Data Relationships (Conceptual ER)

### 7.1 Company → Groups → Ledgers

```
Company (1) ──has many──> Group (0..N)
  │
  ├── Primary Groups (28 fixed, auto-created)
  │     └── has many ──> Sub-groups (user-created)
  │
  └── under each Group (primary or sub-group)
         └── has many ──> Ledgers (1..N)
                └── Ledger Attributes:
                      ├── Opening Balance
                      ├── GSTIN / PAN
                      ├── Credit Period
                      └── Mailing Details
```

**Constraints**:
- A ledger must be under exactly one group.
- A group can be under at most one parent group (tree, not graph).
- Multiple companies cannot share ledgers or groups (data is company-scoped).

### 7.2 Company → Voucher Types → Vouchers → Ledger Entries

```
Company (1) ──has many──> Voucher Type (1..N)
  │
  └── Voucher Type (e.g., Sales, Payment)
        └── has many ──> Voucher (0..N)
              │
              ├── Voucher Header:
              │     ├── Voucher Number (auto/manual)
              │     ├── Date
              │     ├── Narration
              │     └── Reference / Bill Details
              │
              └── has many ──> Ledger Entry (2..N)
                    ├── Ledger (FK → Ledger)
                    ├── Debit Amount
                    ├── Credit Amount
                    └── Cost Centre Allocation (optional)
```

**Constraints**:
- Each voucher has at least 2 ledger entries.
- `SUM(LedgerEntry.Debit) = SUM(LedgerEntry.Credit)` for each voucher.
- A ledger entry belongs to exactly one voucher.
- Voucher number is unique within voucher type per financial year.

### 7.3 Company → Stock Groups → Stock Items

```
Company (1) ──has many──> Stock Group (0..N)
  │
  └── Stock Group (parent-child hierarchy)
        └── has many ──> Stock Item (0..N)
              │
              ├── Stock Item Attributes:
              │     ├── Unit (FK → Unit of Measure)
              │     ├── Opening Balance (qty + value)
              │     ├── Rate (standard or last purchase)
              │     ├── HSN/SAC Code
              │     └── GST Rate
              │
              └── has many ──> Godown Stock (if godown tracking enabled)
                    ├── Godown (FK → Godown)
                    ├── Quantity
                    └── Value
```

**Constraints**:
- A stock item belongs to exactly one stock group.
- A stock group can be under at most one parent stock group.
- Total quantity across all godowns = stock item's net quantity.

### 7.4 Vouchers ↔ Ledgers (via Ledger Entries)

```
Voucher (1) ──has many──> Ledger Entry (2..N)
                              │
                              └── belongs to ──> Ledger (1)
                                    └── Ledger has many ──> Ledger Entries (from many vouchers)
```

This is a many-to-many relationship through the junction table `Ledger Entry`:
- One voucher references many ledgers.
- One ledger is referenced by many vouchers.
- The junction table (`Ledger Entry`) carries the financial amounts (debit/credit).

### 7.5 Vouchers ↔ Stock Items (via Inventory Entries)

```
Voucher (1) ──has many──> Inventory Entry (0..N)
                              │
                              ├── Stock Item (FK → Stock Item)
                              ├── Quantity
                              ├── Rate
                              ├── Amount
                              ├── Godown (FK → Godown)
                              ├── Batch (optional)
                              └── Cost Centre (optional)
```

**Constraints**:
- Inventory entries exist only for stock-enabled vouchers (Sales, Purchase, Stock Journal, etc.).
- A voucher can have both ledger entries and inventory entries (mixed transaction).
- Quantity × Rate ≈ Amount (may diverge due to rounding or discounts).

### 7.6 Full Entity-Relationship Summary

```
Company
  ├── Group (1..N) [parent-child hierarchy]
  │     └── Ledger (0..N)
  │           └── Opening Balance (1)
  ├── Voucher Type (1..N)
  │     └── Voucher (0..N)
  │           ├── Ledger Entry (2..N) → Ledger
  │           ├── Inventory Entry (0..N) → Stock Item + Godown
  │           ├── Bill-wise Allocation (0..N) → Ledger
  │           └── Tax Entry (0..N) → Tax Ledger
  ├── Stock Group (0..N) [parent-child hierarchy]
  │     └── Stock Item (0..N)
  │           ├── Unit → Unit of Measure
  │           └── Godown Stock (0..N) → Godown
  ├── Godown (0..N) [parent-child hierarchy]
  ├── Unit of Measure (0..N)
  ├── Cost Category (0..N)
  │     └── Cost Centre (0..N)
  ├── Currency (0..N) [base + foreign]
  ├── Budget (0..N)
  │     └── Budget Allocation (0..N) → Ledger / Cost Centre
  └── Scenario (0..N)
```

---

## 8. Conceptual Intelligence Chain

For each key entity, the intelligence chain defines how the concept flows through the entire system — from business understanding to AI explanation. This follows the **AIR v2** format.

### 8.1 LEDGER Intelligence Chain

```
CONCEPT → A named account that collects all transactions of a specific type or party.
  Think of it like a bucket. Every financial event fills or empties buckets.

WORKFLOW →
  1. Master creation: User defines the ledger name, group, opening balance, tax details
  2. Transactional use: Ledger is selected in a voucher (as debit or credit)
  3. Period-end: Ledger balance appears in Balance Sheet or P&L

DATABASE →
  - Master table: Ledger_Master (LedgerID, Name, GroupID, OpeningDr, OpeningCr, GSTIN, etc.)
  - Transaction table: Ledger_Entry (VoucherID, LedgerID, DrAmount, CrAmount, CostCentreID)
  - Balance derived as: Opening + SUM(DrEntries) - SUM(CrEntries)

ACCOUNTING IMPACT →
  - Debit side ledgers increase with debits, decrease with credits
  - Credit side ledgers increase with credits, decrease with debits
  - Balance determines financial position (Balance Sheet) or performance (P&L)

INVENTORY IMPACT →
  - Ledgers do not directly affect inventory
  - Exception: Purchase and Sales ledgers are paired with inventory entries in mixed vouchers
  - The financial value of a Purchase ledger entry should equal the inventory valuation of the
    stock items purchased (if inventory is maintained)

TAX IMPACT →
  - Party ledgers (Sundry Debtors/Creditors) determine taxable party type: Regular, Composition,
    Unregistered, SEZ, etc.
  - Tax ledgers (CGST, SGST, IGST payable/receivable) accumulate tax liability or credit
  - Tax rate applicability is determined by the ledger's HSN/SAC mapping (via stock item or service)

REPORTS →
  - Trial Balance: Every ledger appears with its closing balance
  - Balance Sheet: Asset, Liability, Equity ledgers
  - P&L: Income, Expense ledgers
  - Ledger Query: Date-wise transaction listing
  - Outstanding Report: Party ledgers with bill-wise break-up
  - Ageing Analysis: Party ledgers by overdue buckets

AI EXPLANATION →
  "A ledger in Tally is like a named account that tracks all money flowing in or out for a
  specific purpose. The Sales ledger shows all revenue earned. The Rent ledger shows all rent
  paid. The balance tells you the total amount at any point. Ledgers are grouped by nature:
  assets and expenses have debit balances; liabilities, equity, and income have credit balances.
  When you enter a voucher, Tally automatically updates the affected ledgers."
```

### 8.2 VOUCHER Intelligence Chain

```
CONCEPT → A recorded financial event that changes account balances. Every business
  transaction — selling goods, paying rent, receiving cash — is captured in a voucher.

WORKFLOW →
  1. Select voucher type (based on transaction nature)
  2. Enter date, party, narration, ledger accounts and amounts
  3. If stock item: select item, quantity, godown
  4. System auto-calculates tax if configured
  5. Save → system posts to ledgers, updates stock, computes tax

DATABASE →
  - Voucher_Header (VoucherID, VoucherTypeID, Date, VoucherNo, Narration, RefNo, etc.)
  - Ledger_Entry (VoucherID, LedgerID, DrAmount, CrAmount, CostCentreID)
  - Inventory_Entry (VoucherID, StockItemID, GodownID, Quantity, Rate, Amount)
  - Tax_Entry (VoucherID, TaxLedgerID, TaxableValue, TaxRate, TaxAmount)
  - Bill_Allocation (VoucherID, LedgerID, ReferenceVoucherID, AllocatedAmount)

ACCOUNTING IMPACT →
  - Every voucher changes at least two ledger balances (double-entry rule)
  - Payment voucher: reduces bank and reduces creditor (or increases expense)
  - Sales voucher: increases debtor and increases income
  - Journal voucher: adjusts without affecting cash/bank

INVENTORY IMPACT →
  - Purchase and Sales vouchers affect stock quantity and value
  - Stock Journal: transfers stock between godowns (no net change)
  - Physical Stock: adjusts stock to match physical count
  - Manufacturing Journal: converts raw materials to finished goods

TAX IMPACT →
  - Tax applicability determined by voucher type and party registration
  - System computes CGST/SGST/IGST based on shipping address
  - Creates tax ledger entries automatically (output GST for sales, input GST for purchases)
  - GSTR data is aggregated from tax entries of all vouchers in the period

REPORTS →
  - Day Book: chronological listing of all vouchers
  - Sales/Purchase Register: filtered by voucher type
  - GST Reports: based on tax entries from sales/purchase vouchers
  - Outstanding Report: based on bill-wise allocations in vouchers
  - Cash/Bank Book: filtered by cash/bank ledgers

AI EXPLANATION →
  "A voucher is simply the electronic version of a paper receipt or invoice. When you make a
  sale, you create a Sales voucher. When you pay a bill, you create a Payment voucher. The
  voucher is the primary data entry point — everything else (ledger updates, stock changes,
  tax calculations) happens automatically when the voucher is saved. Think of it as a smart
  form that knows the accounting rules."
```

### 8.3 STOCK ITEM Intelligence Chain

```
CONCEPT → A product or material that a business buys, sells, or manufactures. Stock items
  are tracked by quantity and value in the inventory system.

WORKFLOW →
  1. Master creation: Define item name, under stock group, unit, rate, HSN code, GST rate
  2. Purchase: Quantity increases, stock value increases
  3. Sales: Quantity decreases, value decreases (COGS recorded)
  4. Transfer: Movement between godowns (Stock Journal)
  5. Adjustment: Physical stock correction, wastage, sampling
  6. Period-end: Stock valuation for Balance Sheet

DATABASE →
  - StockItem_Master (StockItemID, Name, GroupID, UnitID, OpeningQty, OpeningValue,
      StandardRate, HSNCode, GSTRate)
  - Inventory_Entry (VoucherID, StockItemID, GodownID, Quantity, Rate, Amount)
  - Godown_Stock (StockItemID, GodownID, Quantity, Value) — maintained real-time
  - Batch_Master (for batch/lot tracking — optional module)

ACCOUNTING IMPACT →
  - Stock value appears as "Stock-in-Hand" (Current Asset) in Balance Sheet
  - COGS is computed based on valuation method and appears in P&L
  - Purchase of stock creates a Purchase ledger entry (Dr Purchase A/c)
  - Sale of stock creates a Sales ledger entry (Cr Sales A/c)

INVENTORY IMPACT →
  - Valuation method (Average, FIFO, Standard) determines cost of closing stock
  - Average Cost: (Total Value) / (Total Quantity) = new rate after every purchase
  - FIFO: First purchased items are sold first — closing stock valued at latest rates
  - Reorder level: Low-stock alerts can be configured per stock item
  - Batch/Expiry tracking: Critical for pharma, food, chemicals

TAX IMPACT →
  - HSN code determines GST rate and applicability
  - Item-level tax preference overrides master HSN rate
  - Additional duties (cess) may apply to specific items (e.g., luxury cars, tobacco)
  - Import items accumulate IGST + BCD (Basic Customs Duty)

REPORTS →
  - Stock Summary: Quantity and value by stock group
  - Stock Item Query: Inward/outward movement with date, voucher details
  - Godown-wise Stock: Location-wise stock position
  - Stock Ageing: Days since last movement / expiry tracking
  - Stock Valuation: Closing stock as on date
  - Reorder Report: Items below reorder level

AI EXPLANATION →
  "A stock item is any physical product you buy or sell — like a laptop, a raw material, or
  finished furniture. Tally tracks both how many you have (quantity) and what they're worth
  (value). Every purchase adds to stock; every sale removes from stock. The system
  automatically figures out the cost of what you sold (COGS) based on your chosen valuation
  method. Stock items roll up into Stock Groups, which are like categories — 'Electronics'
  might contain 'Laptops', 'Phones', 'Tablets'."
```

---

*End of Document — Universal Accounting Concepts*
