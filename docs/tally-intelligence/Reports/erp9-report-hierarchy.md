# Tally.ERP 9 — Standard Report Hierarchy

> **Phase E — Tally Intelligence Layer**  
> *Knowledge Document: Mapping & Categorization of Standard Reports*

---

## 1. Introduction

Tally.ERP 9 provides a comprehensive suite of accounting, inventory, taxation, and MIS reports accessible from a single unified interface (Gateway of Tally). Reports derive data dynamically from the underlying transaction database and support real-time drill-down (voucher viewing), multi-period comparison, and on-the-fly customization through the Alter Report (F12) and Button Bar features.

The reporting engine follows a **menu-driven hierarchy**: each report is reachable via `Gateway of Tally → Display → [Module] → [Report Name]`. Reports are categorised by module (Accounts, Inventory, Tax, etc.) and can be further filtered, grouped, and exported without leaving the application.

---

## 2. Report Categories

### 2A. Accounting Reports

| Report | Description | Key Variants / Options |
|---|---|---|
| **Balance Sheet** | Snapshot of assets, liabilities, and capital at a given date. Supports schedule format (group-level drill-down) and multi-column comparative periods. | Schedule VI, Horizontal/Vertical, Ratio Analysis overlay, Year-on-Year comparison |
| **Profit & Loss Account** | Income and expenditure statement for a chosen period. Available in horizontal (T-format) and vertical formats. Supports percentage-of-total and comparative columns. | Gross Profit, Net Profit, Percentage analysis, Budget comparison |
| **Trial Balance** | List of all ledger balances at a given date. Can be detailed (opening + transactions) or consolidated (closing only). Supports Bill-wise break-up and Cost Centre break-up. | Detailed, Consolidated, With Opening Balance, Columnar (month-wise) |
| **Ledger** | Transactions for a single or multiple accounts. Supports single-column, multi-column, bill-wise (outstanding per bill), and outstanding (age-wise) views. | Single Ledger, Multi Ledger, Bill-wise Outstanding, Ousting (Receivables/Payables) |
| **Day Book** | All vouchers (regardless of type) registered on a selected day, week, or month. Columns are fully customisable; vouchers can be filtered by type. | Day Book, Month Book, Custom Period, Voucher Type filter |
| **Account Book** | Transaction register grouped by account. Sub-types include Receipts & Payments, Sales Register, Purchase Register, Contra Register, Payment Register, Receipt Register. | Sales Register, Purchase Register, Receipts & Payments, Debit/Credit Note Register |
| **Cash / Bank Book** | Chronological record of all cash or bank-account transactions. Functions as a specialised Day Book scoped to cash/bank ledgers. | Cash Book, Bank Book, All Banks consolidated |
| **Journal Register** | All journal vouchers (non-cash/non-bank entries) for a period, with narration and full debit/credit details. | Journal Voucher Register, Opening/Closing Journal |

### 2B. Financial Reports

| Report | Description |
|---|---|
| **Funds Flow** | Statement of sources and application of funds for a period, based on changes in working capital. |
| **Cash Flow** | Operating, investing, and financing cash flow statement prepared under direct or indirect method. |
| **Ratio Analysis** | Pre-defined financial ratios (Current Ratio, Quick Ratio, Debt-Equity, Gross Profit %, Net Profit %, ROCE, etc.) computed dynamically. |
| **Key Financial Indicators** | Compact dashboard showing key metrics — working capital, net worth, gross profit, net profit, break-even point — in one view. |

### 2C. Inventory Reports

| Report | Description | Variants |
|---|---|---|
| **Stock Summary** | Master stock list with quantities and values by Godown or category. | Godown-wise, Category-wise, Group-wise |
| **Stock Item** | Detailed movement (opening, receipts, issues, closing) for one or more items, with valuation method applied. Also supports Godown-wise break-up. | Movement Register, Godown Transfer, Cost Variance |
| **Stock Group Summary** | Hierarchical roll-up of stock items under configured Stock Groups (e.g., Raw Materials, Finished Goods). | Group-wise drill-down |
| **Stock Transfer / Assembly Reports** | Records of stock transfers between Godowns and assembly/manufacturing transactions. | Transfer Journal, Assembly Journal, Manufacturing Journal |
| **Reorder Status** | Alerts for items below configured reorder levels. Includes lead time, minimum stock, maximum stock. | Reorder Level, Reorder Quantity |
| **Purchase / Sales Order Outstanding** | Tracks open Purchase Orders and Sales Orders by item, supplier, or customer with pending quantities. | PO Outstanding, SO Outstanding, Pending Delivery |
| **Physical Stock Register** | Register of physical stock counts with variance analysis (book vs. physical). | Physical Stock Voucher, Variance Report |

### 2D. GST Reports

| Report | Description |
|---|---|
| **GSTR-1** | Outward supply details (B2B, B2C, exports, credit/debit notes) as per the GST return format. |
| **GSTR-3B** | Summary return of outward supplies, input tax credit, and net tax payable. |
| **GSTR-9** | Annual return consolidating all monthly/quarterly returns for the financial year. |
| **GST Tax Ledger** | Real-time view of GST liability, input credit, and payments against each HSN/SAC. |
| **HSN/SAC Summary** | Summarised outward/inward supply grouped by HSN (Goods) or SAC (Services) code. |
| **GST Compliance** | ITC mismatch, e-Way Bill tracking, and return filing status dashboard. |

### 2E. Tax Reports

| Report | Description | Status |
|---|---|---|
| **TDS Reports** | Deductee-wise, deductor-wise, challan reconciliation, Form 16/16A, TDS returns (24Q, 26Q, 27Q). | Active |
| **TCS Reports** | Collector-wise, collection statements, Form 27EQ. | Active |
| **Service Tax (ST-3)** | Legacy report for service tax returns (pre-GST). | Legacy |
| **VAT/CST Reports** | VAT return forms (Form 1–12), CST declaration (Form C/F/H). | Legacy |
| **Excise Reports** | ER-1, ER-2, ER-3, Daily Stock Account (DSA), RG-23A/23C/23D. | Legacy |

### 2F. MIS Reports

| Report | Description |
|---|---|
| **Budgets & Scenarios** | Actual vs. budget comparison for groups/ledgers/cost centres. Supports multiple scenarios (optimistic, pessimistic, best-case). |
| **Outstanding Reports** | Receivables/Payables aging (0–30, 31–60, 61–90, 90+ days). Can be bifurcated by Bill-by-Bill or On-Account. |
| **Credit Limit Monitoring** | Customer-wise credit limit vs. outstanding exposure, with overdue alerts. |
| **Interest Calculation** | Automatic or user-defined interest computation on overdue receivables/payables based on configuration. |
| **Cost Centre Reports** | Profitability analysis per Cost Centre or Cost Category, including Cost Centre Break-up in P&L. |
| **Bill-wise Details** | Detailed bill-by-bill ageing for all parties with reference, date, amount, and pending balance. |

---

## 3. Report Customization Features

### 3.1 Alter Report (F12)

Accessed by pressing **F12** while viewing a report. Provides context-sensitive settings that vary per report type:

- **Period / Date** — From/To dates, comparison periods, year-end date
- **Columns** — Show/hide/reorder columns, change column widths
- **Filters** — Voucher type, stock category, Godown, cost centre, ledger group
- **Valuation / Method** — Stock valuation basis, cost method (FIFO, Average, etc.)
- **Grouping** — Group by ledger group, stock group, Godown, cost centre
- **Format** — Show percentages, show zero-balance accounts, show opening/closing
- **Narration** — Include/exclude narration lines in Day Book or Ledger
- **Currency** — Forex row display, rate details

### 3.2 Button Bar (F1–F11)

The button bar at the bottom of each report provides quick-access actions:

| Key | Action |
|---|---|
| F1 | Select Company |
| F2 | Change Period |
| F3 | Toggle Company Info |
| F4 | Contra Voucher |
| F5 | Payment Voucher |
| F6 | Receipt Voucher |
| F7 | Journal Voucher |
| F8 | Sales / Purchase Voucher toggle |
| F9 | Purchase Order / Sales Order toggle |
| F11 | Features (Configuration) |
| F12 | Configure (Alter Report) |

### 3.3 Format / Condition Capabilities

Tally supports conditional formatting and colour configuration for reports:

- **Auto-Colour** — Overdue items (red), positive balances (green), negative (red)
- **Exception Reporting** — Highlight items below reorder level or exceeding credit limits
- **Custom Styles** — Font size, bold/italic alignment per report column (via Alter Report → Format)
- **Numeric Formats** — Decimal places, thousands separator, negative sign style
- **Page Breaks** — Automatic grouping-based page breaks for printed reports
- **ODBC Extract** — Data extraction to external BI tools (Excel, Power BI, Tableau) via ODBC driver

---

## 4. Report Generation & Export Options

Every report can be output through the following channels (accessible via the **Export** button or Ctrl+E):

| Format | Method | Notes |
|---|---|---|
| **Print** | Ctrl+P or Print button | Supports dot-matrix, laser, and network printers; configurable page layout |
| **PDF** | Export → PDF | Produces print-preview PDF; supports custom paper size and orientation |
| **Excel** | Export → Excel | Generates `.xls` (legacy) or `.xlsx` format; preserves column layout and formatting |
| **XML** | Export → XML | Exports report data in structured XML for API consumption |
| **HTML** | Export → HTML | Produces a web-viewable HTML file with embedded CSS |
| **Email** | Ctrl+E → Mail | Composes email with report attached as PDF/XLS from within Tally |
| **ODBC / ODBC Extract** | Tally ODBC Driver | Direct SQL query on live company data via external BI tools |
| **Image (BMP/TIF)** | Export → Image | Raster image export for presentations |

---

## 5. Report Navigation — Menu Paths

All reports are reached from `Gateway of Tally`. Below are the canonical menu paths for the primary reports:

### Accounting Reports

| Report | Menu Path |
|---|---|
| Balance Sheet | `Gateway of Tally → Display → Balance Sheet` |
| Profit & Loss A/c | `Gateway of Tally → Display → Profit & Loss A/c` |
| Trial Balance | `Gateway of Tally → Display → Trial Balance` |
| Ledger | `Gateway of Tally → Display → Ledger` |
| Day Book | `Gateway of Tally → Display → Day Book` |
| Account Book | `Gateway of Tally → Display → Account Books → [Register]` |
| Cash / Bank Book | `Gateway of Tally → Display → Account Books → Cash / Bank Book` |
| Journal Register | `Gateway of Tally → Display → Account Books → Journal Register` |

### Inventory Reports

| Report | Menu Path |
|---|---|
| Stock Summary | `Gateway of Tally → Display → Stock Summary` |
| Stock Item | `Gateway of Tally → Display → Stock Item` |
| Stock Group Summary | `Gateway of Tally → Display → Stock Group Summary` |
| Stock Transfer | `Gateway of Tally → Display → Stock Transfer Journal` |
| Reorder Status | `Gateway of Tally → Display → Reorder Status` |
| PO / SO Outstanding | `Gateway of Tally → Display → Purchase Order / Sales Order Outstanding` |
| Physical Stock Register | `Gateway of Tally → Display → Physical Stock Register` |

### Taxation Reports

| Report | Menu Path |
|---|---|
| GST Reports | `Gateway of Tally → Display → GST Reports → [Return Type]` |
| TDS Reports | `Gateway of Tally → Display → Statutory Reports → TDS → [Form]` |
| TCS Reports | `Gateway of Tally → Display → Statutory Reports → TCS → [Form]` |
| Service Tax | `Gateway of Tally → Display → Statutory Reports → Service Tax → ST-3` |
| VAT / CST | `Gateway of Tally → Display → Statutory Reports → VAT / CST → [Form]` |
| Excise | `Gateway of Tally → Display → Statutory Reports → Excise → [Return]` |

### MIS Reports

| Report | Menu Path |
|---|---|
| Budgets & Scenarios | `Gateway of Tally → Display → Budgets & Scenarios` |
| Outstanding | `Gateway of Tally → Display → Outstanding → Receivables / Payables` |
| Credit Limit | `Gateway of Tally → Display → Credit Limit → [Ledger]` |
| Interest Calculation | `Gateway of Tally → Display → Interest Calculation` |
| Cost Centre | `Gateway of Tally → Display → Cost Centre Break-up` |
| Bill-wise Details | `Gateway of Tally → Display → Bill-wise Details` |

### Financial Reports

| Report | Menu Path |
|---|---|
| Funds Flow | `Gateway of Tally → Display → Funds Flow` |
| Cash Flow | `Gateway of Tally → Display → Cash Flow` |
| Ratio Analysis | `Gateway of Tally → Display → Ratio Analysis` |
| Key Financial Indicators | `Gateway of Tally → Display → Key Financial Indicators` |

---

## 6. Comparison: Tally.ERP 9 vs. TallyPrime

| Feature | Tally.ERP 9 | TallyPrime |
|---|---|---|
| **Navigation** | Menu-tree (Gateway → Display → Report) | Tab-based sidebar with quick-access tiles and contextual ribbon |
| **Home Screen** | Gateway of Tally (text list) | Dashboard with KPIs, charts, and quick actions |
| **Split View** | Not available | Side-by-side report comparison; flyout voucher preview |
| **Reports View** | Full-screen report | Side panel stays visible; auto-fit column width |
| **Multi-Tasking** | One report at a time | Up to 3 reports open simultaneously in tabs |
| **Search** | Basic ledger/voucher search | Global search bar (Alt+G) — searches masters, transactions, help |
| **Export** | Ctrl+E → format picker | Ctrl+E → format picker with more export presets |
| **Bank Reconciliation** | Separate module | Inline BR reconciliation within Day Book |
| **GST** | GSTR-1/3B/9 via tax forms | Simplified GST dashboard with return filing assistant |
| **Remote Access** | Tally.NET connect | TallyPrime Server with improved cloud capabilities |
| **UI Design** | Classic grey-blue interface | Modern white theme with colour-coded buttons |
| **Keyboard Shortcuts** | Varies by screen | Consistent-Alt shortcuts across all screens |
| **Configurability** | F12 per report | Report profiles — save/load custom report configurations |
| **Mobile** | TallyMobile (limited) | TallyPrime on mobile with full reporting |

> **Note**: TallyPrime retains all core report definitions from ERP 9. The hierarchy and data structure remain backward-compatible; changes are primarily in presentation, navigation, and user experience.

---

*Document version: 1.0 — Phase E / Tally Intelligence Layer*  
*Based on general Tally.ERP 9 product knowledge. Actual report availability may vary by license, version, and enabled features.*
