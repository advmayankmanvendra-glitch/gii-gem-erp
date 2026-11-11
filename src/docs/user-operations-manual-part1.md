# GII GeM ERP -- Complete User Operations Manual

---

## Document Control

| Field | Value |
|-------|-------|
| **Title** | GII GeM ERP -- Complete User Operations Manual |
| **Version** | 1.0 |
| **Date** | July 2026 |
| **Last Commit** | 78b799f |
| **Repository Branch** | phase-16-enterprise-crm-integration |
| **Platform** | Windows Desktop (Electron + React) |
| **Database** | SQLite via `better-sqlite3`, single-file at `user-data/*.db` |
| **Authentication** | None (single-user local app, identity set in Settings > Company Info) |

---

## Table of Contents

### Part One -- Foundation

**1. Introduction**
1.1 Purpose of this Manual
1.2 About GII GeM ERP
1.3 Target Audience
1.4 How to Use This Manual

**2. System Overview**
2.1 Architecture at a Glance
2.2 Modular Domain Structure
2.3 Data Flow and Lifecycle
2.4 Security Model

**3. Installation and Setup**
3.1 Prerequisites
3.2 Cloning the Repository
3.3 Installing Dependencies
3.4 Building the Application
3.5 Running the Application
3.6 Development Mode

**4. Quick Start Walkthrough**
4.1 Launching the Application
4.2 Setting Up Your Company
4.3 Creating Master Records
4.4 Entering Your First Supply Order
4.5 Generating an Invoice
4.6 Recording a Payment

**5. User Interface Guide**
5.1 Main Window Layout
5.2 Title Bar
5.3 Toolbar Sections
5.4 Sidebar Navigation
5.5 Content Area
5.6 Status Bar
5.7 Right Utility Sidebar
5.8 Dialog and Overlay System

**6. Navigation and Shortcuts**
6.1 Keyboard Shortcuts Reference
6.2 Smart Enter Flow
6.3 Navigation History and Back Navigation
6.4 Global Search
6.5 Context Shortcuts

### Part Two -- Masters

**7. Company Master**
7.1 Creating and Managing Companies
7.2 Company Context Switching
7.3 All Companies View

**8. Employee Master**
8.1 Employee Records
8.2 Incentive Configuration
8.3 Role Assignment

**9. Government Department Master**
9.1 Department Records
9.2 Contact Management

**10. Supplier Master**
10.1 Supplier Records
10.2 GST and Bank Details
10.3 Supplier Types and Codes

**11. Item Master**
11.1 Item Records
11.2 HSN Codes and GST Rates
11.3 Stock Level Configuration
11.4 Serial and Batch Tracking

**12. Warehouse Master**
12.1 Warehouse Setup
12.2 Location Management

**13. Expense Head Master**
13.1 Defining Expense Categories
13.2 Calculation Methods

**14. Bank Master**
14.1 Bank Account Setup
14.2 Opening Balances

### Part Three -- Operations

**15. Supply Orders**
15.1 Creating Supply Orders
15.2 GeM Order and Contract References
15.3 Order Lifecycle Management
15.4 Order Items Grid
15.5 Order Status Workflow

**16. Procurement**
16.1 Recording Supplier Purchases
16.2 Purchase Bill Entry
16.3 GST and Freight Allocation
16.4 Procurement Status

**17. Order Expenses**
17.1 Dynamic Expense Entry
17.2 Authorization, L1, Work Incentive
17.3 Fixed and Percentage Expenses

**18. Billing and Invoices**
18.1 Invoice Creation
18.2 Invoice Types (Original, Revised, Credit Note, Debit Note)
18.3 GST Calculation
18.4 Invoice Posting

**19. Payments and Receipts**
19.1 Recording Receipts
19.2 UTR and Bank Details
19.3 TDS and GST TDS Deductions
19.4 Payment Allocation

**20. CRAC Management**
20.1 Consignee Receipt and Acceptance Certificate
20.2 CRAC Entry and Tracking
20.3 Payment Readiness
20.4 Order Closure Tracking

**21. Documents**
21.1 Order Documents
21.2 Invoice Documents
21.3 Payment Documents
21.4 Missing Document Warnings

### Part Four -- Inventory

**22. Inventory Management**
22.1 Inventory Dashboard
22.2 Stock Inward (Goods Receipt)
22.3 Stock Outward (Issue)
22.4 Stock Adjustments (Approval-Controlled)
22.5 Stock Returns
22.6 Warehouse Transfers

**23. Stock Planning and Control**
23.1 Stock Reservations
23.2 Procurement Requirements
23.3 Low Stock Alerts
23.4 Reorder Levels

**24. Inventory Registers**
24.1 Stock Ledger
24.2 Inventory Movements Register
24.3 Stock Movement Report
24.4 COGS Report
24.5 Serial and Batch Registers

**25. Inventory Reports**
25.1 Stock Summary
25.2 Stock Valuation (Weighted Average)
25.3 Reservation Ageing
25.4 Item-wise Profitability

### Part Five -- Accounting

**26. Business Vouchers**
26.1 Receipt Voucher
26.2 Supplier Payment Voucher
26.3 Sales Voucher
26.4 Purchase Voucher
26.5 Expense Voucher
26.6 Work Incentive Voucher
26.7 Employee Incentive Voucher
26.8 Contra Voucher
26.9 Credit Note
26.10 Debit Note

**27. Accounting Vouchers**
27.1 Advanced Journal Entry
27.2 GST Adjustment Voucher
27.3 Opening Balance Voucher
27.4 Year-End Voucher
27.5 Reversal Voucher

**28. Books and Ledgers**
28.1 Chart of Accounts
28.2 Voucher Register
28.3 General Ledger
28.4 Day Book
28.5 Cash Book
28.6 Bank Book

**29. Financial Statements**
29.1 Trial Balance
29.2 Profit and Loss Statement
29.3 Balance Sheet

### Part Six -- GST and Tax

**30. GST Management**
30.1 GST Register
30.2 GST Summary
30.3 Input GST vs Output GST
30.4 GST TDS Reconciliation

**31. TDS Management**
31.1 TDS Register
31.2 TDS Reconciliation
31.3 Department-wise TDS Tracking

### Part Seven -- Receivables and Payables

**32. Receivables Management**
32.1 Receivables Dashboard
32.2 Bill-wise Receivable Tracking
32.3 Receivable Ageing
32.4 Department Ledger

**33. Payables Management**
33.1 Payables Dashboard
33.2 Bill-wise Payable Tracking
33.3 Payable Ageing
33.4 Supplier Ledger

**34. Allocations**
34.1 Receipt Allocation Workflow
34.2 Supplier Payment Allocation
34.3 Allocation Reconciliation
34.4 Unallocated Receipts and Payments

**35. Advances**
35.1 Advance Adjustment Wizard
35.2 Supplier Advance Adjustment
35.3 Advance Receipts and Payments

**36. Party Management**
36.1 Party Ledger Summary
36.2 Party Reconciliation
36.3 Credit Terms Setup

### Part Eight -- Profitability

**37. Profitability Analysis**
37.1 Order Profitability
37.2 Department Profitability
37.3 Supplier Profitability
37.4 Employee Performance and Incentive
37.5 Profit Simulator (What-If Modeling)

### Part Nine -- Financial Controls

**38. Financial Year Management**
38.1 Creating Financial Years
38.2 Year-End Closing
38.3 Carry Forward

**39. Posting Controls**
39.1 Posting Queue
39.2 Approval Queue
39.3 Voucher Proposal Queue

**40. Opening Balances**
40.1 Account Opening Balances
40.2 Party Opening Balances

**41. Audit Log**
41.1 Activity Audit Trail
41.2 Posting and Reversal Evidence
41.3 Backup and Restore Audit

### Part Ten -- Reports

**42. Financial Reports**
42.1 Management Reports
42.2 Cash Flow Statement
42.3 Outstanding Reports
42.4 Employee Reports

**43. Profitability Reports**
43.1 Profitability Summaries

**44. GST Reports**
44.1 GST Register Reports
44.2 Tax Analysis

**45. Bank and Proposal Reports**
45.1 Voucher Proposal Reports
45.2 Bank Statement Reports
45.3 Duplicate and Unmatched Entry Reports

**46. Operational Reports**
46.1 Pending Procurement
46.2 Pending Billing
46.3 Pending Payment
46.4 Stock Issue vs Billing Reconciliation
46.5 Order Posting Status

**47. Allocation and Ageing Reports**
47.1 Allocation Audit
47.2 Ageing Reports (Receivable and Payable)

### Part Eleven -- Utilities

**48. Import and Export**
48.1 Master Data Tools (Export, Enrich, Reimport)
48.2 Master Import Templates
48.3 Tally XML Import Assistant
48.4 Tally Master Migration Assistant

**49. Go-Live Preparation**
49.1 Environment Manager
49.2 Production Readiness Certification
49.3 Go-Live Initialization Wizard

**50. ERP Health Center**
50.1 Runtime Diagnostics
50.2 Recovery Guidance
50.3 Support Bundle Generation

**51. Safe Mode Recovery**
51.1 Renderer Crash Recovery
51.2 Diagnostics and Support

### Part Twelve -- Help and Settings

**52. Help and Training**
52.1 Help and Training Screen
52.2 Workflow Guides
52.3 FAQ
52.4 Troubleshooting
52.5 Knowledge Base
52.6 Guided Lessons
52.7 Training Mode

**53. GII ERP Help Assistant**
53.1 Asking Questions
53.2 Navigation Guidance
53.3 Contextual Help

**54. Settings**
54.1 Company Info
54.2 Backup and Restore
54.3 Application Preferences

**55. Keyboard Shortcuts Reference**
55.1 Complete Shortcut Table
55.2 Module-Specific Shortcuts

### Part Thirteen -- Appendices

**56. Appendix A: Database Schema Overview**
**57. Appendix B: Workflow State Diagrams**
**58. Appendix C: GST Compliance Notes**
**59. Appendix D: Error Message Reference**
**60. Appendix E: Glossary of Terms**

---

## 1. Introduction

### 1.1 Purpose of this Manual

This document serves as the complete user operations manual for GII GeM ERP, an offline Windows desktop Enterprise Resource Planning system purpose-built for government supply chain management. It covers every screen, workflow, shortcut, configuration option, and operational procedure available in the application.

### 1.2 About GII GeM ERP

GII GeM ERP is a single-user, local-first ERP application developed for Gesture India Infrastructure. It manages the end-to-end lifecycle of government supply orders from tender and quotation through procurement, inventory, billing, collections, and profitability analysis. The application runs entirely on the user's local machine with no cloud or server dependency. All data is stored in a single SQLite database file located at `user-data/*.db`, accessed via the `better-sqlite3` Node.js binding.

The platform stack consists of Electron for the desktop shell, React 19 for the user interface, Vite for build tooling, and SQLite for persistent storage. There is no login screen -- the application is single-user, and the user identity is configured in Settings > Company Info.

### 1.3 Target Audience

This manual is intended for:
- Operations managers responsible for supply order lifecycles
- Inventory managers handling stock receipt, issue, and valuation
- Accountants managing vouchers, ledgers, GST, and financial statements
- Administrators configuring master data, backups, and environment settings
- Auditors reviewing audit logs, posting queues, and reconciliation reports

### 1.4 How to Use This Manual

Each section is designed as a standalone reference. New users should begin with Part One (Sections 1--6) for installation, interface orientation, and a quick start walkthrough. Experienced users can jump directly to the relevant domain section. Keyboard shortcuts are consolidated in Section 6 and expanded in Section 55.

---

## 2. System Overview

### 2.1 Architecture at a Glance

GII GeM ERP follows a three-layer architecture:

1. **Electron Main Process** (`src/main/`) -- Manages the application window, native file dialogs, database access via `better-sqlite3`, IPC communication, backup/restore, and system services such as verification, health, safe delete, and operational reset.

2. **Electron Renderer Process** (`src/renderer/`) -- Houses the React application including all screens, components, layout elements, configuration registries, feature modules, and the Help Assistant. The renderer communicates with the main process via a preload bridge (`src/preload/preload.cjs`).

3. **SQLite Database** (`user-data/*.db`) -- A single-file database containing all master records, transactions, accounting entries, inventory movements, GST data, audit logs, and system configuration. The database schema is initialized and migrated by `src/main/database/init.js`.

The application supports a browser fallback mode via `src/renderer/api/browserFallbackApi.js` for development and preview, but all persistent operations require the Electron desktop runtime.

### 2.2 Modular Domain Structure

The application is organized into the following domain groups, each accessible from the sidebar navigation:

| Group | Domain | Key Screens |
|-------|--------|-------------|
| Masters | Foundation data | Companies, Employees, Departments, Suppliers, Items, Warehouses, Expense Heads, Banks |
| Operations | Order lifecycle | Supply Orders, Procurement, Expenses, Billing, Payments, CRAC, Documents |
| Inventory | Stock management | Stock Inward/Outward, Adjustments, Transfers, Reservations, Stock Ledger |
| Accounting | Financial entries | Business Vouchers, Journal, Ledgers, Day Book, Trial Balance, P&L, Balance Sheet |
| Receivables & Payables | Party balances | Receivables, Payables, Allocations, Advances, Party Ledgers |
| GST & Tax | Taxation | GST Register, GST Summary, TDS Register |
| Profitability | Margin analysis | Order Profitability, Simulator, Employee Performance |
| Financial Control | Governance | Posting Queue, Approval Queue, Financial Years, Audit Log |
| Reports | Analytics | Financial, GST, Outstanding, Profitability, Operational Reports |
| Utilities | Tools | Import/Export, Tally Migration, Go-Live, Health Center |
| Help & Training | Guidance | Help Assistant, Training Mode, Keyboard Guide |

### 2.3 Data Flow and Lifecycle

The primary operational lifecycle follows the GII Operational Chain of Command:

```
Lead / Tender -> Quotation -> Purchase Order / GeM Order -> Work Order
-> Procurement Planning -> Supplier Purchase Orders -> Goods Receipt / GRN
-> Inventory Reservation -> Delivery Challan -> Installation -> CRAC
-> Sales Invoice / GST Invoice -> Department Receivable -> Receipt
-> Order Closure -> Profitability Analysis
```

Each stage produces records that feed into the accounting system through controlled voucher posting. No record directly modifies ledgers -- all accounting impact flows through posted vouchers.

### 2.4 Security Model

The application is single-user and local. Security is implemented through:
- **Company Context Isolation** -- Every transaction is scoped to the selected company. An administrative "All Companies View" is read-only.
- **Approval Queue** -- Sensitive financial operations require maker-checker approval.
- **Posting Controls** -- Vouchers cannot be posted if the financial year is locked or if validation rules fail.
- **Audit Log** -- All create, update, delete, post, reverse, import, backup, and approval actions are logged.
- **Locked Records** -- Posted and reversed records are locked to protect ledger integrity.
- **Safe Mode** -- A recovery screen is available if the renderer crashes.

---

## 3. Installation and Setup

### 3.1 Prerequisites

Before installing GII GeM ERP, ensure your system meets the following requirements:

| Requirement | Version / Detail |
|-------------|------------------|
| Operating System | Windows 10 or later (64-bit) |
| Node.js | v18.x or later (LTS recommended) |
| npm | v9.x or later (ships with Node.js) |
| yarn (optional) | v1.22.x or later |
| Git | v2.x or later |
| Disk Space | Minimum 500 MB for dependencies and build artifacts |
| RAM | Minimum 4 GB (8 GB recommended) |
| Display | 1280 x 720 minimum (1920 x 1080 recommended) |

The application uses `better-sqlite3` which requires native compilation. The `electron-rebuild` tool handles this automatically during the setup process.

### 3.2 Cloning the Repository

Open a terminal (PowerShell or Command Prompt) and run:

```powershell
git clone <repository-url> gii-gem-erp
cd gii-gem-erp
```

Replace `<repository-url>` with the actual Git remote URL. The repository branch for this version is `phase-16-enterprise-crm-integration`.

After cloning, verify the working tree:

```powershell
git status
```

Ensure the output shows a clean working tree before proceeding.

### 3.3 Installing Dependencies

Install all project dependencies using npm:

```powershell
npm install
```

This command installs both production and development dependencies listed in `package.json`. The `better-sqlite3` native module is compiled during installation. If compilation fails, ensure you have the Windows Build Tools installed:

```powershell
npm install --global windows-build-tools
```

Then retry:

```powershell
npm rebuild better-sqlite3
```

If you prefer yarn:

```powershell
yarn install
```

### 3.4 Building the Application

Build the Vite-based renderer bundle:

```powershell
npm run build
```

This runs `vite build`, which compiles the React application into optimized static assets in the `dist/` directory. The build process includes:
- JSX transformation and bundling
- CSS compilation and minification
- Asset hashing and cache invalidation
- Source map generation (for debugging)

Verify the build completed successfully:

```powershell
npm run build
```

The command should exit with code 0 and produce no errors.

### 3.5 Running the Application

**Production mode:**

```powershell
npm start
```

This launches the Electron application window with the production build. The SQLite database is initialized automatically on first launch. The database file is created at `user-data/gii_gem_erp.db` (or a company-specific path if configured).

The first launch may take a few seconds while database initialization runs. Subsequent launches are faster.

**Packaged installer (Windows):**

To create a distributable Windows installer:

```powershell
npm run dist:win
```

This generates an NSIS installer and a portable executable in the `dist-installer/` directory.

### 3.6 Development Mode

For development and debugging:

```powershell
npm run dev
```

This command uses `concurrently` to run two processes simultaneously:
1. **Vite dev server** at `http://127.0.0.1:5173` -- serves the React app with hot module replacement
2. **Electron** with `VITE_DEV_SERVER_URL` pointing to the Vite server

All database operations use the same SQLite file as production. The browser preview mode (`http://127.0.0.1:5173`) disables desktop-only features (saving, posting, backup, restore, file uploads) and shows a "Browser Preview Only" banner.

To run database initialization separately:

```powershell
npm run db:init
```

To rebuild the native `better-sqlite3` module for your Electron version:

```powershell
npm run rebuild:electron
```

---

## 4. Quick Start Walkthrough

### 4.1 Launching the Application

Run `npm start` from the project directory. The GII GeM ERP splash screen appears briefly, followed by the login-free main interface. The application opens directly to the Dashboard, which displays summary metrics, drill-down cards, and quick-action buttons. The sidebar on the left provides navigation to all modules.

### 4.2 Setting Up Your Company

Before entering any data, configure your company identity:

1. Click **Settings** in the toolbar (gear icon).
2. Select **Company Info**.
3. Enter your company name, GSTIN, PAN, address, bank details, and IFSC code.
4. Click **Save**.

Your company name now appears in the right utility sidebar and is used on all invoices, reports, and documents.

### 4.3 Creating Master Records

Navigate to **Masters** in the sidebar and create the following foundational records:

1. **Employees** -- Add team members with their designation and incentive percentage.
2. **Government Departments** -- Add client departments with contact information.
3. **Suppliers** -- Add vendors with GSTIN and bank details.
4. **Items** -- Add products with HSN codes, GST rates, and stock levels.
5. **Warehouses** -- Define storage locations.
6. **Banks** -- Add company bank accounts.

Each master screen provides a table view of existing records and a form for adding or editing records.

### 4.4 Entering Your First Supply Order

1. Navigate to **Operations > Supply Orders**.
2. Click the **New** button (or press `Ctrl + N`).
3. Fill in the order details:
   - **Order Number** -- Auto-generated or manually entered.
   - **Department** -- Select from your created departments.
   - **Institution Name** -- The buying institution.
   - **Employee Assigned** -- The responsible team member.
   - **Order Date and Supply Due Date**.
   - **Order Items** -- Add items with quantities and quoted rates.
4. Click **Save** (or press `Ctrl + S`).

The order appears in the table with a "Draft" status. You can update the status as the order progresses through the lifecycle.

### 4.5 Generating an Invoice

1. From the Supply Orders table, select an order with status "Supplied" or later.
2. Click the **Invoice** button (or press `F8`).
3. The Billing Voucher screen opens with the order pre-loaded.
4. Enter the invoice number, invoice date, and billing value.
5. Verify the GST calculation.
6. Click **Save and Post** to record the invoice and create the accounting voucher.

### 4.6 Recording a Payment

1. Navigate to **Operations > Payments**.
2. Click **New**.
3. Select the order and link the invoice.
4. Enter the payment amount, UTR number, bank account, and payment date.
5. If TDS or GST TDS applies, enter the deduction amounts.
6. Click **Save**.

The payment is recorded and can be allocated against specific invoices through the **Receipt Allocation** workflow.

---

## 5. User Interface Guide

### 5.1 Main Window Layout

The GII GeM ERP window is divided into five primary zones:

```
+----------------------------------------------------------+
| Title Bar                                        [ - ][ ][X] |
+----------+-----------------------------------+------------+
|          |                                   |            |
| Sidebar  |     Content Area                  | Right      |
| Nav      |     (Screen Host)                 | Utility    |
|          |                                   | Sidebar    |
| - Search |   +----------------------------+  |            |
| - Groups |   |                            |  | - Company  |
| - Items  |   |  Breadcrumb               |  | - Help     |
|          |   |  Title / Subtitle          |  | - Training |
|          |   |                            |  | - Settings |
|          |   |  Screen Content            |  | - Shortcuts|
|          |   |  (tables, forms, reports)  |  |            |
|          |   |                            |  |            |
|          |   +----------------------------+  |            |
|          |                                   |            |
+----------+-----------------------------------+------------+
| Status Bar (version, connection status, company scope)     |
+----------------------------------------------------------+
```

### 5.2 Title Bar

The native window title bar displays the application name "GII GeM ERP" and the standard minimize, maximize, and close controls. The application supports full-screen mode via `F11`.

### 5.3 Toolbar Sections

The primary navigation is driven by the left sidebar, which organizes all available screens into nine collapsible sections. Each section corresponds to a major functional domain:

| # | Section | Icon | Description |
|---|---------|------|-------------|
| 1 | **Home** | Grid | Dashboard with summary metrics, drill-down cards, and quick actions |
| 2 | **CRM / Masters** | Book | Company, employee, department, supplier, item, warehouse, expense head, and bank master records |
| 3 | **Sales / Operations** | Clipboard | Supply orders, procurement, expenses, billing, payments, CRAC management, and documents |
| 4 | **Purchases / Procurement** | (subgroup of Operations) | Procurement, purchase bills, GRN status, procurement requirements |
| 5 | **Inventory** | Box | Stock inward/outward, adjustments, returns, transfers, reservations, stock ledger, valuation, low-stock alerts |
| 6 | **Manufacturing** | N/A (future) | Reserved for future manufacturing workflows |
| 7 | **Accounting** | Bank | Business vouchers, journal entries, ledgers, day book, cash/bank book, financial statements, bank reconciliation |
| 8 | **HR / Payroll** | (via Employees) | Employee master, performance tracking, incentive management |
| 9 | **Settings** | Gear / Settings | Company configuration, backup/restore, application preferences |

Each section expands to reveal sub-sections and individual screen links. The sidebar includes a search field to filter available screens by name.

### 5.4 Sidebar Navigation

The sidebar on the left provides:
- **Brand header** -- "GII GeM ERP" with tagline "Government Supply ERP"
- **Search field** -- Filters all navigation items by name, alias, or description
- **Dashboard link** -- Always-visible shortcut to the home dashboard
- **Grouped navigation** -- Collapsible groups (Masters, Operations, Inventory, Accounting, etc.) with expandable sub-sections
- **Recent screens** -- Quick links to the two most recently visited screens
- **Favorites** -- User-pinned screen shortcuts (default: Supply Orders and Invoices)
- **Compact toggle** -- Collapses the sidebar to icon-only mode

Clicking any navigation item navigates to the corresponding screen. The currently active item is highlighted. Navigation history is maintained for the back button.

### 5.5 Content Area

The content area (also called the Screen Host) occupies the center of the window and renders the active screen. Each screen typically includes:

- **Top bar** -- Breadcrumb trail (Dashboard > Group > Screen), page title, subtitle, back button, and mobile hamburger menu
- **Toolbar controls** -- Context-dependent action buttons (New, Save, Edit, Delete, Post, Export, Print, Refresh)
- **Data table** -- Tabular display of records with sortable columns, row selection, and action buttons
- **Entry form** -- Field groups for creating or editing records, with validation feedback
- **Summary panels** -- Aggregated metrics, intelligence cards, and drill-down links

A runtime banner appears at the top when running in browser preview mode indicating that desktop-only features are unavailable.

### 5.6 Status Bar

The bottom of the workspace displays:
- Application version (e.g., "v0.4.0 -- Accounting Controls")
- Current company context indicator
- Unsaved changes warning indicator

### 5.7 Right Utility Sidebar

The right sidebar provides contextual tools:
- **Company selector** -- Switch between companies or enter All Companies View
- **Screen Help** -- Open guidance for the current screen
- **Training Mode** -- Toggle sample-data training workspace
- **Ask ERP Help** -- Open the Help Assistant
- **Feedback** -- Submit improvement requests
- **Productivity Panel** -- Context-sensitive shortcuts and stats for the current screen
- **User info** -- Current user display name and logout

The right sidebar can be collapsed to compact mode to maximize workspace width.

### 5.8 Dialog and Overlay System

The application uses a layered dialog system:
- **Confirm Dialog** -- Modal confirmation for destructive actions (delete, post, reverse, exit)
- **Global Search Overlay** -- Full-screen search across screens, orders, invoices, suppliers, departments, items, vouchers, and payments
- **Shortcut Help Dialog** -- Complete keyboard shortcut reference
- **Context Shortcut Overlay** -- Module-specific quick-action shortcuts
- **Print Preview Dialog** -- WYSIWYG print preview with template selection and PDF save
- **Quick Create Master Dialog** -- Inline creation of masters from transaction forms
- **User Preferences Dialog** -- Sidebar compact mode, theme preferences
- **First-Time Tour** -- Welcome overlay for new users

---

## 6. Navigation and Shortcuts

### 6.1 Keyboard Shortcuts Reference

GII GeM ERP provides extensive keyboard shortcuts to accelerate data entry and navigation without removing protective controls. All shortcuts are defined in `src/renderer/config/keyboardShortcuts.js`.

#### Global Navigation Shortcuts

| Keys | Action |
|------|--------|
| `Ctrl + 1` | Open Dashboard |
| `Ctrl + 2` | Open Masters group |
| `Ctrl + 3` | Open Supply Orders |
| `Ctrl + 4` | Open Inventory group |
| `Ctrl + 5` | Open Accounting |
| `Ctrl + 6` | Open Receivables |
| `Ctrl + 7` | Open Payables |
| `Ctrl + 8` | Open GST group |
| `Ctrl + 9` | Open Reports |
| `Alt + Home` | Return to Dashboard |
| `Alt + Left Arrow` | Go back to previous screen |
| `Backspace` | Go back (when not typing) |
| `Browser Back` | Go back from supported keyboards |
| `Escape` | Close modal/dialog or exit screen |

#### Data Entry Shortcuts

| Keys | Action |
|------|--------|
| `Ctrl + N` | Create new record |
| `Ctrl + S` | Save current form |
| `Ctrl + E` | Edit selected record / Export report |
| `F5` / `Ctrl + R` | Refresh current screen |
| `Ctrl + F` | Focus search field |
| `Ctrl + P` | Print current screen |
| `Ctrl + K` | Open Global Search |
| `Ctrl + Shift + K` | Open advanced search where available |
| `F10` | Quick create master from transaction field |
| `Shift + F10` | Alternate quick-create action |

#### Accounting and Voucher Shortcuts (in Accounting context)

| Keys | Action |
|------|--------|
| `Alt + R` | Receipt Voucher |
| `Alt + P` | Supplier Payment Voucher |
| `Alt + S` | Sales Voucher |
| `Alt + U` | Purchase Voucher |
| `Alt + J` | Journal Voucher |
| `Alt + C` | Contra Voucher |
| `Alt + N` | Credit Note |
| `Alt + D` | Debit Note |

#### Inventory Shortcuts (in Inventory context)

| Keys | Action |
|------|--------|
| `F2` | Stock Receipt (Inward) |
| `F3` | Stock Issue (Outward) |
| `F4` | Stock Transfer |
| `F5` | Stock Adjustment |
| `Alt + I` | Stock Issue |
| `Alt + G` | Stock Receipt / GRN |
| `Alt + T` | Warehouse Transfer |
| `Alt + A` | Stock Adjustment |

#### System and Utility Shortcuts

| Keys | Action |
|------|--------|
| `F1` | Toggle help / shortcut guide panel |
| `F11` | Toggle full screen |
| `F12` | Open User Preferences |
| `Ctrl + B` | Navigate to Settings |
| `Ctrl + Shift + B` | Create database backup |
| `Ctrl + Shift + R` | Open Restore Backup |
| `Ctrl + Shift + P` | Production Health Dashboard |
| `Ctrl + Shift + L` | Open Audit Log |
| `Ctrl + Z` | Undo (in supported text fields) |
| `Ctrl + Shift + Z` | Redo (in supported text fields) |
| `Ctrl + M` | Toggle mini toolbar |
| `Ctrl + Shift + S` | Screenshot (desktop capture) |
| `Ctrl + ,` | Open Settings directly |

### 6.2 Smart Enter Flow

The Smart Enter system enables keyboard-only form navigation. Pressing `Enter` on an editable field moves focus to the next field. Pressing `Shift + Enter` moves to the previous field. When the last field is reached, the application prompts to save the record.

This flow is active on all data entry forms and respects field order, disabled state, and visibility. The currently targeted field receives a visual "smart-enter-next" highlight.

### 6.3 Navigation History and Back Navigation

The application maintains a navigation history stack of up to 12 entries. Users can:
- Press the **Back** button in the workspace top bar
- Press `Alt + Left Arrow`
- Press `Backspace` (when not in a text entry field)
- Use the `Browser Back` key on supported keyboards

Pressing `Escape` once shows a hint; pressing `Escape` again within 900 milliseconds exits the current screen. If there are unsaved changes, a confirmation dialog appears before navigation proceeds.

### 6.4 Global Search

Press `Ctrl + K` or click the search icon to open the Global Search overlay. This full-screen dialog searches across:
- Screen names and navigation items
- Supply orders (by order number, institution, department)
- Invoices (by invoice number, order number, department)
- Suppliers (by name, GSTIN, code)
- Departments (by name, contact person)
- Items (by name, HSN code, brand)
- Vouchers (by number, type, narration)
- Payments (by UTR number, amount)

Results are grouped by category and limited to the most relevant matches. Clicking a result navigates directly to the corresponding screen with context pre-loaded.

### 6.5 Context Shortcuts

Press `/` (slash) or click the context shortcut trigger to open a module-specific shortcut panel for the current screen. This overlay displays the most relevant actions for the active domain, such as voucher creation in Accounting, stock operations in Inventory, or order lifecycle actions in Operations. The context shortcuts adapt based on the current view and user role.

Function keys `F2` through `F9` provide module-specific actions that change depending on whether the current screen is in Supply Orders, Inventory, or Accounting:

| Key | Supply Orders | Inventory | Accounting |
|-----|---------------|-----------|------------|
| `F2` | New Order | Stock Receipt | Receipt Voucher |
| `F3` | Edit Order | Stock Issue | Payment Voucher |
| `F4` | View Order | Stock Transfer | Sales Voucher |
| `F5` | Refresh | Stock Adjustment | Purchase Voucher |
| `F6` | Generate Procurement | -- | Contra Voucher |
| `F7` | Reserve Stock | -- | Journal Voucher |
| `F8` | Generate Invoice | -- | Credit Note |
| `F9` | -- | -- | Debit Note |
