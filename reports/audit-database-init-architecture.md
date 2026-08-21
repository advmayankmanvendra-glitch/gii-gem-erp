# Phase 6 — Database `init.js` Architecture Audit

**Date:** 2026-07-09  
**File:** `src/main/database/init.js` — **9,277 lines**

---

## 1. File Structure Breakdown

| Section | Lines | Size | Description |
|---|---|---|---|
| Imports / Re-exports | 1–27 | 27 lines | Imports from `connection.js` + `safeDeleteService.js` — re-exports 7 items |
| `MASTER_TABLES` config | 29–70 | 42 lines | 25+ master tables with field arrays |
| `TRANSACTION_TABLES` config | 72–191 | 120 lines | Transaction tables with field arrays |
| Role/Auth config | 192–218 | 27 lines | `ROLE_HIERARCHY`, `ROLE_PERMISSIONS`, `WRITE_POLICY`, `ALL_TABLES` |
| Auth helpers | 220–283 | 64 lines | `hashPassword`, `verifyPassword`, `normalizeRole`, `enforcePermission` |
| **`initializeDatabase`** | 285–291 | 7 lines | Orchestrator: `migrate()`, `seed()`, `addPhase5AccountingControls()` |
| **`migrate()`** | 293–2240 | **1,948 lines** | Schema migrations via `runMigration()` helper (25 migrations: 001–024) |
| Internal: `runMigration` | 705 | — | Migration runner (checks + inserts into `schema_migrations`) |
| Internal: `addPhase5AccountingControls` | 1752 | — | Accounting controls (used by migration 006 + `initializeDatabase`) |
| **`seed()`** | 2241–2715 | **475 lines** | Default data (companies, accounts, users, roles) |
| **Generic CRUD exports** | 2716–4032 | ~1,317 lines | `assertTable`, `assertWriteAllowed`, `cleanPayload`, `normalizePayloadForTable`, `createRecord`, `createLedgerAccount`, `updateRecord`, `deleteRecord`, `getRecord`, `listRecords`, import parsing, bulk import, rollback, document CRUD, item import CRUD |
| **Import operations** | 4032–4588 | ~556 lines | Import batch management |
| **Domain exports** | 4588–8316 | ~3,728 lines | `dashboardCounts`, `referenceData`, `billingVoucherData`, `saveBillingVoucher`, `orderProfitability`, `calculateProfitability`, `authenticate`, `changeUserPassword`, `createBalancedVoucher`, `createManualVoucher`, `createBusinessVoucher`, voucher workflow (guided, post, reverse), delivery challan, warehouse transfer, stock in/out/adjustment, approval workflow, financial year/openings, drilldown, closing, sales/purchase/receipt/supplier payment posting, receipt/payment allocation, advances, credit terms, bank statement import, voucher proposals, bank statement data, `auditLog`, `accountingData` |
| **Internal report functions** | 8317–9277 | **961 lines** | 40+ non-exported functions: dayBook, postingControlReport, party/department/supplier ledger reports, bill aging/status, ageing reports, TDS/GST reconciliation, allocation reports, gstRegisters, tdsRegisters, trialBalance, profitLossReport, balanceSheetReport, financialStatementSummary, gstSummary, etc. |

**Total exported functions:** ~68 (including config constants)  
**Total internal (non-exported) functions in CRUD section:** ~42  

---

## 2. Key Findings

### 2.1 No Section Comment Headers
- **Zero** `//` style comment lines exist in the entire 9,277-line file.
- No `// ─── MASTER TABLES ───`, `// ─── AUTH ───`, etc.
- Navigation requires line-number recall or grep.

### 2.2 The "Hidden Reports" Section (lines 8317–9277)
- ~961 lines of non-exported helper functions. They are called by the exported `accountingData()` function and others.
- Includes major financial reports: trial balance, P&L, balance sheet, GST summary, ageing reports, TDS reconciliation.
- These are tightly coupled to `init.js`'s closure scope and cannot be tested or imported independently.

### 2.3 `addPhase5AccountingControls` Is Called Twice
- Line 289: `initializeDatabase()` calls it directly.
- Line 542: Migration `006_phase5_accounting_controls` also calls it.
- Idempotency depends on the function's internal guards — a subtle coupling.

### 2.4 No INSERT Statements / All SQL Uses `db.prepare().run()`
- Seed data uses `insertIfEmpty` → `createRecord` → `db.prepare().run()`.
- No `INSERT INTO` literals.

### 2.5 No Top-Level CREATE INDEX / TRIGGER / VIEW
- All schema changes (including indexes) happen inside migration callbacks.

### 2.6 `WRITE_POLICY` Separates Master, Transaction, AccountingReadOnly
- Design is modular but enforced only at runtime by `assertWriteAllowed()`.

---

## 3. Verification Script Coupling

| Script | Imports from init.js | Notes |
|---|---|---|
| `verify-accounting.js` | `accountingData`, `initializeDatabase` | Loads full DB via `initializeDatabase()` |
| `verify-financials.js` | `accountingData`, `initializeDatabase` | Same pattern |
| `verify-controls.js` | `accountingData`, `initializeDatabase` | Same pattern |
| `verify-safe-delete.js` | (reads file for function body extraction) | Coupled to naming of `deleteItemImportBatch` etc. |
| `verify-voucher-workflows-inventory.js` | `initializeDatabase`, `autoReserveOrderStock` | Imports individual functions |
| `verify-operational-flow.js` | `initializeDatabase` | Loads full DB |
| `verify-phase10-inventory-automation.js` | `initializeDatabase` | Loads full DB |
| `verify-phase8b-voucher-proposals.js` | `initializeDatabase` | Loads full DB |
| `verify-fk-constraints.js` | `initializeDatabase` | Loads full DB |

Most verification scripts import `initializeDatabase()` which bootstraps the entire schema + seed every time. This is convenient but creates coupling — any change to `migrate()` or `seed()` affects all verify scripts.

---

## 4. Alignment with Permanent Architecture Rules

| Rule | Status | Notes |
|---|---|---|
| **Rule 4 (Preserve Core Logic)** | Compliant | Schema unchanged across phases |
| **Rule 8 (Database Safety)** | Partially met | `WRITE_POLICY`/`assertWriteAllowed` exist but are runtime-only, not auditable at rest |
| **Rule 13 (Error Guidance)** | N/A | init.js is backend — errors propagate to IPC caller |
| **Rule 14 (Verification)** | Compliant | verify scripts exist and import from init.js |
| **Rule 20 (Phase Governance)** | N/A | This is an audit phase |
| **Rule 5 (Reuse Before Creating)** | Needs review | CRUD layer (`createRecord`/`updateRecord`) is generic but report functions are duplicated vs. potential query services |
| **Rule 3 (Modular Placement)** | **Violation** | init.js is a monolith — 9,277 lines. Should be split into: `schema/`, `seed/`, `crud/`, `vouchers/`, `reports/`, `import/`, `banking/` |

---

## 5. Refactor Recommendations

### Priority — High
1. **Extract report functions** (lines 8317–9277) into `src/main/database/reports/` — each report as its own module (e.g., `reports/trialBalance.js`, `reports/profitLoss.js`, `reports/balanceSheet.js`, etc.)
2. **Extract seed data** into `src/main/database/seed/` — split by domain (accounting, inventory, users)

### Priority — Medium
3. **Extract voucher/transactional operations** into `src/main/database/vouchers/` — `createBalancedVoucher`, `createManualVoucher`, `createBusinessVoucher`, `postSalesVoucher`, etc.
4. **Extract bank statement/import operations** into `src/main/database/banking/`
5. **Extract CRUD framework** (`assertTable`, `assertWriteAllowed`, `cleanPayload`, `createRecord`, `updateRecord`, `deleteRecord`, `getRecord`, `listRecords`) into `src/main/database/crud/`

### Priority — Low
6. **Add section comment headers** to aid navigation until extraction is complete
7. **Move `addPhase5AccountingControls`** out of `initializeDatabase()` and keep only in migration 006

---

## 6. Risk Assessment

| Risk | Level | Mitigation |
|---|---|---|
| Monolithic file exceeds 10K lines (PR readability risk) | Medium | Split before next major DB change |
| Hidden reports reuse | Medium | Internal report functions cannot be imported individually |
| `addPhase5AccountingControls` called twice | Low | Idempotent but should be consolidated |
| Verify scripts coupled to `initializeDatabase()` | Medium | Extract DB helper for test-standalone schema setup |
| No comment headers | Low | Visual grep required to navigate file |

---

## 7. Dependencies Assessment

| Dependency | Status |
|---|---|
| Current file structure identified | Done |
| Exported API surface catalogued | Done |
| Internal (non-exported) functions identified | Done |
| Verification script alignment checked | Done |
| Permanent Architecture Rules alignment checked | Done |

**Dependencies Satisfied: Yes**

---

## 8. Safe to Refactor?

**Safe to Lock: No** — extraction would change imports across ~16 verify scripts and ~12 service files. A separate extraction phase (Phase 7) would be needed, with a pre-extraction baseline (`database-baseline-2026-07-09`).

---

*Audit completed per Permanent Architecture Rule 1 (Audit First), Rule 20 (Phase Governance Pipeline), and AIR Governance Rule 31.*
