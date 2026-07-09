# GII GeM ERP

Windows-based offline desktop ERP foundation for Gesture India Infrastructure's GeM/eProc government supply business.

## GI-EGS Compliance Reference

Apply GI-EGS (Gesture India Engineering Standards) standards.

Canonical GI-EGS repository:
https://github.com/advmayankmanvendra-glitch/GI-ENGINEERING-STANDARDS

Refer to the GI-EGS master governance rules for engineering standards, documentation discipline, audit procedure, architecture control, naming conventions, acronym expansion, Codex/OpenCode review process, and clearance protocol.

Do not redefine, duplicate, override, or maintain separate engineering standards inside this project. This project must only consume and comply with GI-EGS standards.

## Phase 1 Scope

- Electron + React + Node.js + SQLite + Vite foundation
- Secure local login
- SQLite database initialization and seed data
- Professional desktop app shell with sidebar navigation
- Dashboard with live master-data counts
- Company, Employee, Government Department, Supplier, Item, Expense Head and Bank masters
- Add, edit, delete, search and active/inactive filtering
- Toast notifications, delete confirmation and basic validation
- Local folders for `database`, `documents`, `backups`, `exports`, `reports` and `logs`
- Backup and restore structure for the SQLite database

Advanced lifecycle modules such as supply orders, procurement, billing, payment, profitability, GST, reports and document management are reserved for later phases.

## Phase 2 Scope

- Supply order entry with department, institution, location, employee and status
- Procurement entries with supplier invoice, purchase value, purchase GST, freight, loading and supplier payment
- Dynamic expense ledger entries linked to order and expense head
- Billing entries with invoice number, billing value, GST rate and invoice type
- Payment receipts with payment mode, UTR and bank account
- Order-wise profitability calculation:
  - Gross Margin = Billing Value - Purchase Value
  - GST Input Loss = Gross Margin x GST Rate
  - Dynamic Expenses from gross bill, taxable bill or fixed amount
  - Initial Profit = Gross Margin - GST Input Loss - Dynamic Expenses
  - Employee Incentive = Initial Profit x employee incentive percentage
  - Net Company Profit = Initial Profit - Employee Incentive
- Employee performance, receivables, payables, cash flow, GST and report summary screens derived from transaction data

## Phase 3 Scope

- Versioned schema migration table
- Company-linked transaction foundation
- Chart of accounts with seeded default accounting heads
- Balanced voucher and voucher-line posting
- Ledger entries from posted vouchers
- Cash/bank ledger for receipts and payments
- Normalized order, procurement and invoice item tables
- Line-wise input/output GST summary
- Invoice-wise receivable ledger with payment allocation
- Supplier payable ledger with supplier payment allocation
- Expense accrual foundation separated from payment movement
- Audit log for create/update/delete and voucher posting
- Soft delete for accounting tables
- Essential accounting screens: chart of accounts, voucher register, general ledger, cash/bank ledger and trial balance
- Audit log screen and restricted generic write controls

## Verify Accounting Integrity

```bash
npm run verify:accounting
```

This checks that the seeded accounting flow has accounts, vouchers, ledger entries, cash/bank entries, receivables, payables, GST values and a balanced trial balance.

## Locked Module Notes

Backup & Restore v1.0 is operational, verified on 2026-06-11, and locked. Future changes require a separate change request.

## Default Login

- Username: `admin`
- Password: `admin123`

The first login with the seeded password requires changing the password before the ERP opens company data.

## Install

```bash
npm install
```

If Electron or SQLite native bindings fail after a Node/Electron change, rebuild the native SQLite module for the runtime you are using:

```bash
npm run rebuild:electron
```

For Node-only maintenance scripts, rebuild back to Node:

```bash
npm run rebuild:node
```

## Initialize Database

```bash
npm run db:init
```

This creates `database/gii_gem_erp.db`, required local folders and testing seed data.

## Run In Development

```bash
npm run dev
```

## Build Renderer

```bash
npm run build
```

## Windows Installer Preparation

Temporary internal Windows packaging is enabled for testing only.

```bash
npm run rebuild:electron
npm run pack:win
```

To create temporary NSIS and portable artifacts:

```bash
npm run dist:win
```

Packaging output is written to `dist-installer`.

## Runtime Data Locations

Source/development mode stores ERP data in the project folders:

- `database/gii_gem_erp.db`
- `documents`
- `backups`
- `exports`
- `reports`
- `logs`

Packaged EXE mode stores runtime data under Electron `userData`, not beside the installed executable. On Windows this is normally under:

```text
%APPDATA%\GII GeM ERP
```

Packaged mode creates these folders inside `userData`:

- `database`
- `documents`
- `backups`
- `exports`
- `reports`
- `logs`

On first packaged launch, if no userData database exists, the bundled internal-test database is copied into `userData/database/gii_gem_erp.db`. Existing userData databases are never overwritten automatically.

## Database Architecture

Database logic is separated under `src/main/database`. The renderer only communicates through safe IPC methods exposed by `src/preload/preload.js`.
