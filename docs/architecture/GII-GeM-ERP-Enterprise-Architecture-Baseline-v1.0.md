# GII GeM ERP Enterprise Architecture Baseline v1.0

**Version:** 1.0  
**Status:** Active governing blueprint  
**Last updated:** 2026-06-28  
**Scope:** All current and future GII GeM ERP development phases  

---

## Table of Contents

1. [Preamble](#1-preamble)
2. [Governance Layer Hierarchy](#2-governance-layer-hierarchy)
3. [Permanent Architecture Rules](#3-permanent-architecture-rules)
4. [Global UX Governance Standard](#4-global-ux-governance-standard)
5. [Product Governance](#5-product-governance)
6. [Phase Governance Pipeline](#6-phase-governance-pipeline)
7. [Go-Live Preparation Programme (GL-1 to GL-5)](#7-go-live-preparation-programme-gl-1-to-gl-5)
8. [Application Architecture Map](#8-application-architecture-map)
9. [Database Architecture](#9-database-architecture)
10. [IPC & Preload Contract](#10-ipc--preload-contract)
11. [Navigation & Route Registry](#11-navigation--route-registry)
12. [Enterprise Dashboard Roadmap](#12-enterprise-dashboard-roadmap)
13. [Intelligence Center Roadmap](#13-intelligence-center-roadmap)
14. [Business Development Programme Roadmap](#14-business-development-programme-roadmap)
15. [Verification & Safety](#15-verification--safety)
16. [Final Checklist](#16-final-checklist)

---

## 1. Preamble

### 1.1 Purpose

This document consolidates the complete architectural, governance, UX, deployment, and roadmap knowledge for GII GeM ERP into a single authoritative baseline. Every new feature, module, phase, or fix must reference this baseline before implementation.

### 1.2 System Identity

GII GeM ERP is a **Windows Electron desktop ERP** purpose-built for Government e-Marketplace (GeM) supply operations. It manages government procurement, supply orders, billing, inventory, accounting, GST, receivables, payables, and operational workflows — all within a company-multi-tenant architecture.

### 1.3 System Stack

| Layer | Technology |
|---|---|
| Desktop Shell | Electron |
| Renderer | React (Vite build) |
| Main Process | Node.js / Electron main |
| Database | SQLite via better-sqlite3 |
| IPC | Electron ipcMain / ipcRenderer |
| Preload | contextBridge with sandbox |
| Documents | Local filesystem |
| Backups | Local filesystem (`.db` copies) |
| Configuration | JSON files (environment, deployment, history) |

### 1.4 Current Milestone

- **Branch:** `phase-16-enterprise-crm-integration`
- **Latest commit:** 4c2dcf6 — Go-Live Preparation Programme (GL-2 through GL-5)
- **Build:** 157 modules, ~1.33 MB
- **Database:** 27 accounts, 12 vouchers, ₹44,53,508.28 balanced
- **Phase readiness:** Go-Live Preparation Programme complete — ERP ready for first controlled production initialization

---

## 2. Governance Layer Hierarchy

Every implementation phase must comply with all three governance layers:

```
Layer 1: Permanent Architecture Rules
  └── Engineering discipline, modularization, App.jsx protection,
      IPC/preload stability, database safety, verification sequencing

Layer 2: Global UX Governance
  └── Navigation, toolbar, keyboard, search, help, AI guidance,
      processing feedback, tables, accessibility, empty states

Layer 3: Product Governance
  └── Feature approval, ERP evolution, AI boundaries, roadmap priority,
      release maturity, production readiness
```

---

## 3. Permanent Architecture Rules

### 3.1 Audit First

Before coding:
- Audit the current implementation
- Identify existing module boundaries, reusable components, services, reports, data models, route/view keys
- Identify affected IPC/preload APIs
- Check git status and existing uncommitted files
- Do not duplicate existing logic

### 3.2 App.jsx Protection

`src/renderer/App.jsx` must remain:
- Layout shell
- Navigation shell
- Route orchestration
- Global state coordination only where already established

New functionality goes into feature modules, screens, components, services, utils, or config — never directly into App.jsx.

### 3.3 Modular Placement

```
Renderer features:
  src/renderer/features/accounting/
  src/renderer/features/inventory/
  src/renderer/features/operations/
  src/renderer/features/reports/
  src/renderer/features/gst/
  src/renderer/features/importExport/
  src/renderer/features/help/
  src/renderer/features/settings/
  src/renderer/features/dashboards/

Shared UI:       src/renderer/components/
Utilities:       src/renderer/utils/
Configuration:   src/renderer/config/
Documentation:   src/docs/
Deployment UI:   src/renderer/modules/deployment/
Reports:         reports/
Backend services: src/main/services/
  ├── deployment/    (GL-2/3/4/5 services)
  ├── backup.js
  ├── operationalResetService.js
  ├── productionReadinessService.js
  └── ...
```

### 3.4 Preserve Core Logic

Never change unless explicitly instructed:
- Accounting formulas, voucher posting math, GST calculations, inventory valuation, profitability formulas
- Database schema
- IPC channel names, preload API names, route/view keys
- Save/post/reversal behavior, existing workflows, existing records

### 3.5 Reuse Before Creating

Before creating any new screen, report, component, service, database table, IPC channel, or helper — search whether an existing one can be safely reused or extended.

### 3.6 No Silent Refactors

Only refactor if required for the phase, small and controlled, and documented in the audit report.

### 3.7 Renderer Safety

Screens display data, collect input, and call APIs. Business rules remain in services, backend/database modules, utilities, and controlled validators. Never place accounting, GST, inventory, profitability, migration, or posting logic inside screen components.

### 3.8 Database and Data Safety

Never write directly to these sensitive tables from generic UI code:
```
vouchers, voucher_lines, ledger_entries, receivables, payables,
GST-related tables, stock_ledger, financial_years, audit_log
```

Use existing controlled services and IPC methods exclusively.

### 3.9 Company Context Safety

Every company-linked transaction must respect current company context: selected company is visible, `company_id` is passed, no silent fallback to first company, reports filter by company, imports map to selected company, All Companies View remains read-only unless explicitly changed.

### 3.10 Navigation and UX Safety

After any navigation or drilldown change, verify: route opens, breadcrumb correct, sidebar item active, recents/favorites not broken, back works, scroll resets, same-page actions focus correctly, no blank screen.

### 3.11 Print and Export Safety

Print opens ERP print/preview, not browser print. Export works. CSV/XLSX headers correct. Amounts show correct currency. Printed vouchers contain company, date, number, party, totals, status.

### 3.12 Import Safety

Never import directly into live tables without validation. Use staging/preview first. Show row-wise errors and duplicate reasons. Allow skip/update/map/rename. Block unsafe import. Audit log import action. Do not create stock ledger from master import unless explicitly approved.

### 3.13 Error Guidance

Every error must explain: what failed, where it failed, which field/section needs attention, what the user should do next. Never say "Something went wrong" or "Validation failed" or "SQLite error" alone.

### 3.14 Verification Commands

After every phase, run sequentially (to avoid SQLite locking):

```powershell
npm.cmd run lint:syntax
npm.cmd run build
npm.cmd run verify:accounting
npm.cmd run verify:financials
```

If the phase touches controls, posting, approval, inventory, or operational flow, also run:

```powershell
npm.cmd run verify:controls
npm.cmd run verify:voucher-inventory
npm.cmd run verify:flow
npm.cmd run verify:phase10
```

### 3.15 Desktop Smoke Test

After build, test in Electron desktop app. Minimum: app opens, login works, dashboard loads, sidebar works, target screen opens, changed feature works, no blank screen, no console error, back/navigation works, current company visible. Browser preview alone is insufficient for navigation, Help, Intelligence Center, Health Center, Import/Export, documents, dashboard, runtime, or backup changes.

### 3.16 End-of-Phase Report

Every phase generates `reports/<phase-name>-report.md` including: phase name, feature classification, dependency assessment, files changed, IPC/preload impact, route/view key impact, database impact, business logic preservation, verification results, smoke test result, production readiness classification, known limitations, safe-to-lock.

### 3.17 Stop Rules

Stop and wait for review if: build fails twice, accounting/financial verification fails, app opens blank, route/view key breaks, database schema mismatch, records become inaccessible, import/posting/backup becomes unsafe, fix requires changing accounting math. Never continue past a failed verification.

---

## 4. Global UX Governance Standard

### 4.1 Non-Negotiable Safety Rules

- Do not change accounting formulas, voucher posting math, GST calculations, inventory valuation, profitability formulas, database schema, IPC names, preload names, route keys, or posting/approval/reversal/backup/restore workflows unless explicitly required by a phase.
- Help, guidance, AI assistance, and UX shortcuts must never silently create, edit, delete, post, reverse, approve, restore, import, or correct data.

### 4.2 Navigation Standards

**Navigation History Service:** One centralized history mechanism. Direct navigation pushes previous view. Drilldown pushes source + filters. Back follows LIFO. Esc closes overlays before screen exit. Alt+Left triggers back. Visible Back button when history exists.

**Scroll and Focus:** Every view navigation resets workspace scroll. Same-page actions scroll to and focus relevant section.

### 4.3 Toolbar Standards

**List/Register/Report screens:** Search → Filters → Date/Period → View mode → Refresh → Export → Print → Help.

**Entry/Form screens:** Save Draft → Save/Submit → Approve/Post → Reverse/Cancel → Print/Preview → Attachments → Help.

Critical actions (delete, post, approve, reverse, restore backup, close financial year, import confirm, stock adjustment) must be visually separated and confirmation-protected.

### 4.4 Keyboard Standards

| Shortcut | Action |
|---|---|
| Enter | Next editable field |
| Shift+Enter | Previous editable field |
| Esc | Close modal/dropdown/suggestion |
| Alt+Left | Screen back |
| Ctrl+S | Save (where safe) |
| Ctrl+P | ERP print/preview |
| Ctrl+K | Global ERP search |
| F1 | Context-aware screen help |

Never bypass confirmations, approvals, posting validations, or locked-record controls.

### 4.5 Search Standards

Global ERP Search (Ctrl+K) searches across modules, records, reports, and help. It is read-only unless a result opens a screen. Local screen search filters the current list only.

### 4.6 Processing Feedback

Actions over 300ms must show processing feedback. Buttons disable during processing to prevent duplicate unsafe clicks. Success messages must not imply completion beyond the actual step.

### 4.7 Empty State Standards

Never show only "No data." Every empty state explains: why empty, whether it's normal/filtered/blocked/incomplete, a safe next action, a real call-to-action, and related guidance.

### 4.8 Table and Grid Standards

Reuse existing table styles. Migrate incrementally — avoid converting billing, posting, import, inventory posting, or voucher workflows without a dedicated phase. Row actions must be visible. Long grids support scroll, filters, print, and export.

### 4.9 Help Assistant Standards

The Help button defaults to current-screen guidance. Help Mode answers "how do I..." questions using manual, FAQ, workflow, and troubleshooting content. Screen Guidance explains current screen purpose, required fields, warnings, accounting/inventory/GST impact, recommended next action, related screens/reports, and relevant shortcuts.

### 4.10 AI and Intelligence Standards

AI may explain, guide, recommend, alert, summarize, predict, highlight risk, or prepare draft suggestions. AI must never silently post, delete, reverse, approve, restore, change GST/stock/ledger, correct accounting, or import live records. AI output must indicate guidance-only status, whether it used live data, and confidence level.

### 4.11 Undo and Recovery Standards

Posted transactions are corrected through reversal. Destructive actions require confirmation. Backup restore requires confirmation. Import confirm is gated by validation. Audit logs capture sensitive actions. Recovery instructions are available in Health Center.

### 4.12 Desktop Standards

Desktop-first. Minimum comfortable width: 1180px. On smaller screens, preserve data entry usability, collapse secondary panels, keep critical status visible.

---

## 5. Product Governance

### 5.1 Feature Approval Criteria

Every proposed feature must improve at least one of:
1. **Accounting Integrity** — accuracy of books, trial balance, financial statements
2. **Inventory Integrity** — stock valuation, movement tracking, GST compliance
3. **Operational Integrity** — order-to-payment lifecycle traceability
4. **Audit Evidence** — verifiable records for statutory/internal audit
5. **Decision Support** — actionable insights for management
6. **User Productivity** — efficiency gains for daily operations
7. **AI Guidance** — contextual, non-destructive intelligence
8. **Controlled Automation** — rule-based, auditable automation

Never approve features simply because they are technically possible.

### 5.2 Development Priority

1. Accounting Integrity
2. Inventory Integrity
3. Operational Integrity
4. Audit Evidence
5. Decision Support
6. User Productivity
7. AI Guidance
8. Controlled Automation

### 5.3 AI Boundaries

**Permitted:** Explain, guide, recommend, summarize, prioritize, predict, highlight risk, prepare draft suggestions.

**Forbidden (unless explicitly approved by a future phase):** Silently post, reverse, delete, restore, approve, alter accounting, alter inventory.

### 5.4 Product Maturity Stages

Every feature identifies its stage:
- **Transaction Processing** — basic create/read/update/delete
- **Operational Control** — workflow, approval, validation
- **Decision Support** — aggregation, analysis, reporting
- **Predictive Intelligence** — forecasting, anomaly detection
- **Controlled AI Assistance** — guided, non-destructive automation

### 5.5 Production Readiness Gate

A feature is not production-ready merely because coding is complete. Evaluate using:
- Implementation completed
- Verification passed
- Desktop smoke test completed
- Git status reviewed, commit completed
- Documentation updated
- Phase report generated
- Limitations documented
- Safe-to-lock recorded

Readiness classifications: Prototype, Internal Testing, Beta, Release Candidate, Production Ready.

---

## 6. Phase Governance Pipeline

Every implementation phase must follow this fixed pipeline:

```
Idea
  → Architecture Audit
  → Architecture Compliance Check
  → UX Compliance Check
  → Implementation
  → Verification
  → Desktop Smoke Test
  → Git Commit
  → Git Tag (Major Phase Only)
  → Lock Note
```

**Pipeline rules:**
- Architecture Audit identifies module boundaries, reusable code, data models, services, reports, IPC/preload impact, route impact, and uncommitted changes.
- Architecture Compliance Check confirms App.jsx protection, modular placement, reuse-before-create, and core logic preservation.
- UX Compliance Check applies the Global UX Governance Standard where the phase touches user interaction, navigation, help, tables, forms, search, error guidance, print/export, or dashboard behavior.
- Implementation is limited to the approved scope.
- Verification runs the required commands.
- Desktop Smoke Test is completed for functional/UI phases.
- Git Commit happens only after verification passes.
- Git Tag is used only for major milestones.
- Lock Note states what is stable, what is out of scope, and what future changes require a separate phase.
- If any step fails, stop and do not proceed to the next phase.

---

## 7. Go-Live Preparation Programme (GL-1 to GL-5)

### 7.1 GL-1 — Verification Profile Framework

**Purpose:** Created modular verification profiles for different deployment environments.

**Profiles:** Development, Testing, Training, Production, Migration, Smoke Test

**Impact:** `verificationProfiles.js`, `package.json` scripts, `verify-accounting.js`, `verify-financials.js`

**Status:** ✅ Complete

### 7.2 GL-2 — Deployment Manager

**Purpose:** Enhanced Environment Manager into a full Deployment Manager with:
- Persistent environment configuration (`environment-config.json`)
- Verification profile selector and environment switching (admin-only)
- Production initialization preview
- Foundation check (companies, FY, CoA, banks, warehouses, items, suppliers, departments, employees)
- Backup create/open folder actions
- Health Center deployment bar (environment, profile, readiness, company, last reset)

**Key services:** `readinessService.js` environment integration

**Status:** ✅ Complete

### 7.3 GL-3 — Controlled Operational Reset Engine

**Purpose:** Extended operational reset with safety-governed workflow:
- `analyzeDependencies()` — FK/orphan risk detection across 51 operational tables
- `rebuildZeroState()` — verify vouchers=0, ledger=0, receivables=0, payables=0, stock=0
- `executeEnhancedReset()` — backup-first, transaction-protected, audit-logged
- `rollbackReset()` — restore from backup with pending_restore guard
- 10-step UI workflow: Warning → Backup → Dependencies → Preview → Confirmation → Execute → Zero-State → Verify → Certificate → Complete

**Status:** ✅ Complete

### 7.4 GL-4 — Production Readiness Certification

**Purpose:** Read-only evaluation framework with:
- **7 categories:** Foundation (15%), Accounting (20%), Inventory (15%), GST (15%), Operations (20%), Technical (10%), Deployment (5%)
- Weighted scoring with 4 status levels (Production Ready ≥95%, Ready with Warnings ≥80%, Requires Attention ≥60%, Not Ready <60%)
- Go-Live certificate generation (`GLC-2026-NNNNNN`) with JSON history
- 11-item Go-Live checklist

**New services:** `readinessService.js`, `certificationService.js`

**New screens:** `ProductionReadinessScreen`, `ReadinessScoreCard`, `GoLiveChecklist`, `CertificationHistory`

**Status:** ✅ Complete

### 7.5 GL-5 — First Controlled Production Reset & Go-Live Initialization

**Purpose:** First certified production initialization with:
- **10-step gated wizard:** Preconditions → Confirmation (type GO-LIVE) → Backup → Validation → Dependencies → Reset → Zero-State → Verification → Certificate → Completion
- **Prerequisite gates:** Environment=Production, Profile=Production, Readiness=Production Ready
- **Mandatory backup** with `.golive` marker and validation
- **Production verification suite** (accounting + financials + controls scripts + additional checks)
- **Auto-rollback** on verification failure
- **Permanent Go-Live history** (never deleted)

**New services:** `goLiveService.js`, `goLiveHistoryService.js`, `goLiveVerificationService.js`, `rollbackService.js`

**New screens:** `GoLiveWizard` (10-step wizard)

**Status:** ✅ Complete — Go-Live Preparation Programme finished

### 7.6 Go-Live Architecture Summary

The Go-Live Preparation Programme established a permanent, reusable, auditable deployment methodology:

```
Environment Config → Readiness Assessment → Precondition Check
    ↓                                                       ↓
Verification Profile                              Gated Go-Live Wizard
    ↓                                                       ↓
Deployment Manager                                  10-Step Workflow
    ↓                                                       ↓
Operational Reset Engine                              Auto-Rollback
    ↓                                                       ↓
Readiness Certification                              Permanent History
```

Every future customer deployment reuses this framework, ensuring identical, auditable, reversible, and governed deployment every time.

---

## 8. Application Architecture Map

### 8.1 Directory Structure

```
gii-gem-erp/
├── AGENTS.md                      # Standing engineering rules
├── package.json                   # Scripts, dependencies
├── electron.vite.config.mjs      # Vite/Electron build config
├── src/
│   ├── main/                      # Electron main process
│   │   ├── main.js                # IPC handlers, app lifecycle
│   │   ├── database/
│   │   │   └── init.js            # Schema, migrations, queries
│   │   ├── services/
│   │   │   ├── deployment/        # All Go-Live services
│   │   │   │   ├── readinessService.js
│   │   │   │   ├── certificationService.js
│   │   │   │   ├── goLiveService.js
│   │   │   │   ├── goLiveHistoryService.js
│   │   │   │   ├── goLiveVerificationService.js
│   │   │   │   └── rollbackService.js
│   │   │   ├── operationalResetService.js
│   │   │   ├── productionReadinessService.js
│   │   │   ├── backup.js
│   │   │   └── ...
│   ├── preload/
│   │   └── preload.cjs            # contextBridge API
│   └── renderer/
│       ├── App.jsx                # Layout, navigation, routes
│       ├── config/
│       │   └── navigation.js      # Route keys, view titles, nav groups
│       ├── components/            # Shared UI components
│       ├── screens/               # Screen-level components
│       ├── modules/
│       │   └── deployment/        # Go-Live/Deployment UI modules
│       ├── features/              # Feature-specific modules
│       └── styles/
│           └── app.css            # Global styles
├── scripts/                       # Verification scripts
│   ├── verify-accounting.js
│   ├── verify-financials.js
│   ├── verify-controls.js
│   ├── lib/verificationProfiles.js
│   └── ...
├── docs/
│   └── architecture/              # Architecture governance documents
├── reports/                       # Phase reports and audits
└── dist/                          # Vite build output
```

### 8.2 Data Flow

```
Renderer (React)
    ↓  IPC invoke (contextBridge API)
Preload (sandboxed bridge)
    ↓  ipcRenderer.invoke
Main Process (Node.js)
    ↓  ipcMain.handle
Services (business logic, validation)
    ↓
Database (SQLite via better-sqlite3)
  or Filesystem (backups, config, reports)
```

---

## 9. Database Architecture

### 9.1 Master/Foundation Tables (Preserved during reset)

| Table | Type | Description |
|---|---|---|
| companies | Master | Company profiles with GSTIN, PAN, bank details |
| users | Master | System user accounts with roles |
| accounts | Master | Chart of accounts (ledgers) |
| financial_years | Master | Fiscal year definitions and lock status |
| government_departments | Master | Buyer/department entities |
| suppliers | Master | Vendor/supplier master |
| items | Master | Inventory item master with HSN, GST rate |
| banks | Master | Bank account master |
| employees | Master | Employee master |
| expense_heads | Master | Expense category master |
| warehouses | Master | Inventory location master |
| credit_terms | Master | Payment terms definitions |
| settings | Master | Application configuration |
| help_content | Master | Help/FAQ content |
| email_templates | Master | Email notification templates |
| print_templates | Master | Print/PDF templates |
| architecture_documents | Master | Architecture documentation |
| audit_log | Master | Immutable audit trail |
| import_templates | Master | Import configuration templates |

### 9.2 Operational Tables (Reset on Go-Live)

| Table | Module | Deletion Method |
|---|---|---|
| vouchers | Accounting | Hard DELETE |
| voucher_lines | Accounting | Hard DELETE |
| ledger_entries | Accounting | Hard DELETE |
| cash_bank_ledger | Accounting | Hard DELETE |
| guided_vouchers | Accounting | Hard DELETE |
| invoices | Billing | Hard DELETE (or soft-delete via is_deleted) |
| invoice_items | Billing | Hard DELETE |
| payments | Payments | Hard DELETE |
| supplier_payments | Payments | Hard DELETE |
| payment_allocations | Payments | Hard DELETE |
| supplier_payment_allocations | Payments | Hard DELETE |
| supply_orders | Orders | Hard DELETE (or soft-delete) |
| order_items | Orders | Hard DELETE |
| procurements | Procurement | Hard DELETE |
| procurement_items | Procurement | Hard DELETE |
| expense_entries | Expenses | Hard DELETE |
| receivables | Receivables | Hard DELETE |
| supplier_payables | Payables | Hard DELETE |
| stock_ledger | Inventory | Hard DELETE |
| stock_inwards | Inventory | Hard DELETE |
| stock_outwards | Inventory | Hard DELETE |
| stock_adjustments | Inventory | Hard DELETE |
| stock_returns | Inventory | Hard DELETE |
| stock_reservations | Inventory | Hard DELETE |
| inventory_movements | Inventory | Hard DELETE |
| delivery_challans | Inventory | Hard DELETE |
| delivery_challan_lines | Inventory | Hard DELETE |
| goods_receipts | Inventory | Hard DELETE |
| warehouse_transfers | Inventory | Hard DELETE |
| warehouse_transfer_lines | Inventory | Hard DELETE |
| import_batches | Import | Hard DELETE |
| crac_records | CRAC | Hard DELETE |
| voucher_proposals | Bank | Hard DELETE |
| voucher_proposal_audit | Bank | Hard DELETE |
| bank_statement_imports | Bank | Hard DELETE |
| bank_statement_entries | Bank | Hard DELETE |
| bank_statement_matches | Bank | Hard DELETE |

### 9.3 External Data Stores (Not in SQLite)

| Store | Format | Path |
|---|---|---|
| Environment config | JSON | `{runtimeRoot}/environment-config.json` |
| Certificate history | JSON | `{runtimeRoot}/deployment/certificate-history.json` |
| Go-Live history | JSON | `{runtimeRoot}/deployment/go-live-history.json` |
| Backups | SQLite (copy) | `{runtimeRoot}/backups/` |
| Reports | Markdown | `{runtimeRoot}/reports/` |

---

## 10. IPC & Preload Contract

### 10.1 Environment & Deployment Channels

| Channel | Direction | Purpose | Phase |
|---|---|---|---|
| `environment:info` | → | Get environment status, counts, diagnostics | GL-2 |
| `environment:get-profiles` | → | List verification profiles | GL-2 |
| `environment:set-profile` | → | Set verification profile | GL-2 |
| `environment:switch-type` | → | Switch environment type (admin only) | GL-2 |
| `backup:open-folder` | → | Open backups folder in file explorer | GL-2 |
| `backup:create` | → | Create database backup | Base |
| `backup:list` | → | List available backups | Base |
| `backup:restore` | → | Restore from backup | Base |

### 10.2 Reset Channels

| Channel | Direction | Purpose | Phase |
|---|---|---|---|
| `reset:preview` | → | Preview reset counts | GL-3 |
| `reset:execute` | → | Execute basic reset | GL-3 |
| `reset:analyze-dependencies` | → | FK/orphan dependency analysis | GL-3 |
| `reset:execute-enhanced` | → | Enhanced reset with audit | GL-3 |
| `reset:rollback` | → | Rollback from backup | GL-3 |

### 10.3 Readiness & Certification Channels

| Channel | Direction | Purpose | Phase |
|---|---|---|---|
| `deployment:readiness` | → | 7-category readiness assessment | GL-4 |
| `deployment:certify` | → | Generate Go-Live certificate | GL-4 |
| `deployment:certificate-history` | → | Get certificate history | GL-4 |
| `certificate:generate` | → | Generate production readiness certificate | Base |

### 10.4 Go-Live Channels

| Channel | Direction | Purpose | Phase |
|---|---|---|---|
| `go-live:preconditions` | → | Check production environment preconditions | GL-5 |
| `go-live:preview` | → | Preview operational data + dependencies | GL-5 |
| `go-live:execute` | → | Execute Go-Live reset with backup | GL-5 |
| `go-live:verify` | → | Run production verification suite | GL-5 |
| `go-live:complete` | → | Generate certificate, finalize history | GL-5 |
| `go-live:rollback` | → | Auto-rollback on verification failure | GL-5 |
| `go-live:history` | → | Get permanent Go-Live history | GL-5 |

### 10.5 Accounting & Operational Channels

| Channel | Purpose |
|---|---|
| `accounting:data` | Accounting data queries |
| `accounting:drilldown` | Drill-down into account detail |
| `vouchers:create` | Create manual voucher |
| `vouchers:create-business` | Create business voucher |
| `vouchers:reverse` | Reverse posted voucher |
| `vouchers:guided-post` | Post guided voucher |
| `posting:post` | Post transaction from module |
| `approval:approve` | Approve transaction |
| `financial-years:create` | Create financial year |
| `financial-years:close` | Close financial year |

### 10.6 Master Data Channels

| Channel | Purpose |
|---|---|
| `master-data:definitions` | Master table definitions |
| `master-data:export` | Export master data |
| `master-data:preview-update` | Preview master data update |
| `master-data:confirm-update` | Confirm master data update |
| `master-data:completeness` | Master data completeness check |

### 10.7 Inventory Channels

| Channel | Purpose |
|---|---|
| `inventory:data` | Inventory data queries |
| `inventory:post-inward` | Post stock inward |
| `inventory:post-outward` | Post stock outward |
| `inventory:post-adjustment` | Post stock adjustment |
| `inventory:approve-adjustment` | Approve stock adjustment |
| `inventory:create-delivery-challan` | Create delivery challan |
| `inventory:create-transfer` | Create warehouse transfer |

### 10.8 Billing & CRAC Channels

| Channel | Purpose |
|---|---|
| `billing:data` | Billing data queries |
| `billing:save` | Save billing voucher |
| `crac:list` | List CRAC records |
| `crac:create` | Create CRAC record |
| `crac:update` | Update CRAC record |
| `crac:delete` | Delete CRAC record |
| `crac:stats` | CRAC statistics |
| `crac:payment-readiness` | Payment readiness report |

### 10.9 Health & Diagnostics Channels

| Channel | Purpose |
|---|---|
| `health:diagnostics` | Runtime diagnostics |
| `health:checks` | Run health checks |
| `health:support-bundle` | Export support bundle |
| `health:verification-console` | Verification console state |

---

## 11. Navigation & Route Registry

### 11.1 Navigation Groups

```
Dashboard
  ├── Dashboard
  ├── Executive Dashboard
  └── Voucher Dashboard

Masters
  ├── Companies
  ├── Chart of Accounts
  ├── Items
  ├── Suppliers
  ├── Government Departments
  ├── Employees
  ├── Banks
  ├── Warehouses
  ├── Expense Heads
  └── Credit Terms

Transactions
  ├── Supply Orders
  ├── Procurements
  ├── Invoices / Billing
  ├── Payments / Receipts
  ├── Expense Entries
  ├── Stock Inward / Outward / Adjustments
  ├── Delivery Challans
  └── Warehouse Transfers

Operations
  ├── Operations Attention Queue
  ├── Operations Drilldown
  └── Operational Closure / CRAC

Accounting & GST
  ├── Voucher Entry
  ├── Voucher Register
  ├── Trial Balance
  ├── Profit & Loss
  ├── Balance Sheet
  ├── Ledger View
  ├── GST Register / Summary
  └── Financial Year Management

Reports
  ├── Accounting Reports Index
  ├── Inventory Reports
  ├── Operations Reports
  └── Summary Reports (Receivables, Payables, Cash Flow)

Utilities
  ├── Import / Export
  │   ├── Master Data Tools
  │   ├── Master Import Templates
  │   ├── Tally Migration Assistant
  │   └── Tally XML Import
  ├── Support & Recovery
  │   └── ERP Health Center
  └── Go-Live Preparation
      ├── Environment Manager
      ├── Production Readiness
      └── Go-Live Initialization

Help & Training
  ├── Help & Training
  ├── Keyboard Shortcuts
  └── Help Assistant

Settings
  └── Settings
```

### 11.2 Registered View Keys

```
dashboard, voucher_dashboard, executive_dashboard
companies, chart_accounts, items, suppliers, government_departments
employees, banks, warehouses, expense_heads, credit_terms
supply_orders, procurements, invoices, billing
payments, receipts, expense_entries
stock_inwards, stock_outwards, stock_adjustments, stock_returns
delivery_challans, warehouse_transfers
operations_attention_queue, operations_drilldown
crac_management, crac_entry, crac_tracker
payment_readiness, order_closure_tracking
voucher_entry, manual_voucher, voucher_register
trial_balance, profit_loss, balance_sheet
ledger_view, cash_bank_ledger, day_book
gst_register, gst_summary
financial_years, year_end_closing
accounting_reports, receivable_ageing, payable_ageing
employee_performance, receivables, payables, cash_flow
master_data_tools, master_import_templates
tally_migration_assistant, tally_xml_import
health_center, safe_mode
environment_manager, production_readiness, go_live_wizard
help_training, help_keyboard, help_assistant
settings, documents, profitability
```

---

## 12. Enterprise Dashboard Roadmap

### 12.1 Current State

The dashboard suite supports:
- **Main Dashboard:** Period-filtered KPIs with 14-period presets and custom date picker, context-aware filters, comparison analysis (period-over-period, year-over-year), export context
- **7 Dashboard modes:** Executive, Treasury, Operational, Financial, Inventory, GST, Custom
- **Widget framework:** Modular widgets with drill-down metadata
- **Work queue widgets:** Operations attention queue, approval queue
- **ContextBar:** Company, financial year, period selector, filter chips
- **Auto-refresh:** 60-second cache invalidation

### 12.2 Roadmap

| Priority | Feature | Description |
|---|---|---|
| 1 | Dashboard Personalization | User-configurable widget layout and saved presets |
| 2 | Real-Time Notifications | Live updates for approvals, exceptions, anomalies |
| 3 | Drill-Down Dashboard | Click-through from KPI to transaction detail |
| 4 | Executive KPI Library | Standardized government procurement KPIs |
| 5 | Comparative Analytics | Side-by-side period, company, department comparison |
| 6 | Exportable Dashboard Reports | PDF/Excel snapshot of current dashboard state |
| 7 | Role-Based Dashboard Views | Different default views for admin, operations, finance, management |
| 8 | Mobile Dashboard View | Responsive read-only view for field/management access |

---

## 13. Intelligence Center Roadmap

### 13.1 Current Foundation

- **Verification Console:** Integrated verification with profile support
- **Health Center:** Diagnostics, health checks, support bundle, phase locks, recovery center, safe mode
- **Deployment bar:** Shows environment, profile, readiness, company, last reset, last Go-Live
- **Help Assistant:** Context-aware help with screen guidance and FAQ

### 13.2 Roadmap

| Priority | Feature | Description |
|---|---|---|
| 1 | ERP Intelligence Center | Centralized command center with AI guidance, predictive alerts |
| 2 | Anomaly Detection Engine | AI-driven detection of accounting, inventory, and operational anomalies |
| 3 | Predictive Analytics | Cash flow forecasting, stock requirement prediction, payment delay prediction |
| 4 | Guided Correction Workflows | Step-by-step AI-guided resolution for mismatches and exceptions |
| 5 | Automated Health Recommendations | Proactive recommendations based on diagnostic patterns |
| 6 | Multi-Company Intelligence | Cross-company analytics and benchmarking |
| 7 | Natural Language Query | Ask questions about ERP data in plain language |
| 8 | Compliance Monitoring | Automated GST, TDS, and statutory compliance checks |

---

## 14. Business Development Programme Roadmap

### 14.1 Completed Foundation

- **Phase 14a:** Modularization safety baseline — locked architecture boundaries
- **Phase 15:** Enterprise Dashboard & Command Center Modernization
- **Phase 16:** Dashboard Time & Context Filter Framework
- **GL Programme:** Complete Go-Life Preparation (GL-1 through GL-5)

### 14.2 Future Roadmap

| Priority | Phase | Description | Maturity Stage |
|---|---|---|---|
| 1 | **GL-6** | Production Environment Lock & Monitoring — Lock production env, monitor deployment health | Operational Control |
| 2 | **GL-7** | Business Continuity & Disaster Recovery Plan — Documented DR procedures, automated backup verification | Operational Control |
| 3 | **GL-8** | User Acceptance Testing Framework — Formal UAT workflow for customer deployments | Operational Control |
| 4 | **H1** | Operations Attention Queue & Drill-Down — Enhanced operational workflow management | Operational Control |
| 5 | **H2** | CRAC & Payment Readiness — Consignee receipt acceptance tracking | Operational Control |
| 6 | **H3** | Operational Closure & Certification — Order closure workflows | Operational Control |
| 7 | **H4** | GST Report & Return Alignment — GST register-to-return reconciliation | Decision Support |
| 8 | **H5** | Intelligence Center v1 — Centralized command center with alerts | Decision Support |
| 9 | **H6** | Receivables & Payables Intelligence — Aging analysis, collection prediction | Decision Support |
| 10 | **H7** | Inventory Intelligence — Reorder prediction, stock optimization | Decision Support |
| 11 | **H8** | AI Data Assistant — Natural language query and guidance | AI Guidance |
| 12 | **Future** | E-Invoice / E-Way Bill Integration | Transaction Processing |
| 13 | **Future** | Multi-Company Consolidation | Decision Support |
| 14 | **Future** | Cloud Sync / Hybrid Deployment | Packaging & Deployment |
| 15 | **Future** | Mobile Companion App | UX |

### 14.3 Release Maturity Target

| Milestone | Target | Criteria |
|---|---|---|
| Internal Pilot | Current | GL-1 to GL-5 complete, all verifications pass |
| Beta (Single Customer) | After H4 | UAT completed, production Go-Live demonstrated |
| Production Ready | After H8 | AI validated, DR tested, full compliance |
| Enterprise Platform | After Cloud Sync | Multi-company, multi-user, hybrid deployment |

---

## 15. Verification & Safety

### 15.1 Standard Verification Suite

```powershell
# Always run (sequentially to avoid SQLite locks)
npm.cmd run lint:syntax     # Check JS/CJS/ESM syntax
npm.cmd run build           # Vite production build
npm.cmd run verify:accounting   # Trial balance, ledger, GST reconciliation
npm.cmd run verify:financials   # TB, P&L, BS, receivables, payables, GST, TDS

# When touching controls, posting, approval, inventory, or operational flow
npm.cmd run verify:controls         # Permission, locked year, rollback, posting, audit
npm.cmd run verify:voucher-inventory # Voucher workflows, inventory dashboard
npm.cmd run verify:flow             # Business workflow integrity
npm.cmd run verify:phase10          # Phase 10 regression suite
```

### 15.2 Current Verification Baseline

```
Account verification:
  Debit:  ₹44,53,508.28
  Credit: ₹44,53,508.28
  Difference: 0
  Accounts: 27
  Vouchers: 12
  Ledger entries: 27
  GST balanced: ✓

Financials verification:
  Trial Balance difference: 0
  P&L Net Profit: ₹5,53,946
  Balance Sheet: ₹13,81,004.28
  Receivables: ₹8,30,000
  Payables: ₹4,26,000
  GST matched: ✓
  TDS matched: ✓

Controls verification: 12/12 passed
Voucher-inventory workflows: All passed
```

### 15.3 Stop Conditions

Stop all work and wait for review if:
1. Build fails twice
2. Accounting verification fails
3. Financial verification fails
4. App opens blank after login
5. Route/view key breaks
6. Database schema mismatch appears
7. Existing records become inaccessible
8. Import/posting/backup becomes unsafe
9. Fix requires changing accounting or posting math

---

## 16. Final Checklist

Every phase, before declaring completion:

- [ ] Git status reviewed, only intended files changed
- [ ] Feature classification recorded
- [ ] Dependency assessment recorded, dependencies satisfied stated
- [ ] No App.jsx business logic added unnecessarily
- [ ] No route keys, IPC channels, or preload names changed without documentation
- [ ] No database schema changed unless approved
- [ ] Current company context preserved
- [ ] Sidebar, breadcrumb, recents still work
- [ ] Affected screen opens and actions work
- [ ] Relevant drilldown, print, export work (if touched)
- [ ] `lint:syntax` passed
- [ ] `build` passed
- [ ] `verify:accounting` passed
- [ ] `verify:financials` passed
- [ ] Desktop smoke test completed (or explicitly marked pending)
- [ ] Phase report generated to `reports/`
- [ ] Production readiness classification recorded
- [ ] Production readiness gate result recorded
- [ ] Safe to lock stated clearly

---

*This baseline document supersedes all previous standalone architecture, governance, and roadmap documents. From this point forward, every phase references this document as the governing blueprint for GII GeM ERP.*
