# KG-4 Voucher and Accounting Graph — Lock Note

**Lock Date:** 2026-07-14
**Locked By:** architecture governance (read-only intelligence phase)
**Status:** Locked — Active v1.0.0
**Safe to Lock:** Yes
**Next Phase:** ERP Brain upgrade (separate command required)

---

## Lock Summary

KG-4 Voucher and Accounting Graph Foundation is locked as the accounting intelligence baseline for GII GeM ERP. This lock confirms that KG-4 is a read-only knowledge graph with no runtime ERP code changes. All future ERP Brain upgrade, Help Assistant, Chatbot, Contextual Assistant, and Action-Taking Assistant work must treat KG-4 as the authoritative voucher and accounting intelligence source.

---

## Deliverables Confirmed

| # | Deliverable | Status |
|---|---|---|
| 1 | Foundation report: `docs/architecture/kg-4-voucher-accounting-graph-foundation-report.md` | Present (247 lines) |
| 2 | KG-4 graph: `src/renderer/knowledge/voucher-accounting-graph.json` | Present (1813 lines) |
| 3 | KG-4 schema: `repository/schema/voucher-accounting-graph.schema.json` | Present (210 lines, draft-07) |
| 4 | Validation script: `scripts/verify-voucher-accounting-graph.js` | Present (178 lines, 21 checks) |
| 5 | Package script: `npm run verify:voucher-accounting-graph` | Present (in package.json) |
| 6 | Graph registry: KG-4 Active v1.0.0 in `repository/graph-registry.json` | Confirmed (7 graphs, 6 active) |
| 7 | Audit pack: KG-4 integrated into `scripts/verify-audit.js` | Confirmed (22 KG-4 checks, 152 total PASS) |

---

## Graph Map Properties Confirmed

| Property | Count | Status |
|---|---|---|
| Voucher types | 14 | Confirmed |
| Posting functions | 23 | Confirmed |
| Debit/credit patterns | 9 | Confirmed |
| Ledger impact patterns | 8 | Confirmed |
| Report dependencies | 23 | Confirmed |
| Workflow alignments | 11 | Confirmed |
| Database alignments | 23 | Confirmed |
| Accounting protection principles | 10 | Confirmed |
| Known gaps | 6 | Confirmed |

---

## Accounting Protection Rules Confirmed

| Rule | Confirmed |
|---|---|
| createBalancedVoucher remains the core posting engine | Yes |
| Debit total equals credit total before posting | Yes |
| voucher, voucher_lines, and ledger_entries created atomically (db.transaction()) | Yes |
| Generic CRUD remains blocked for 18 accounting-protected tables | Yes (DG-1 enforced) |
| Trial Balance, Profit & Loss, and Balance Sheet derive from ledger_entries | Yes |
| Work Order / Supply Order has no direct accounting impact | Yes (createsAccountingImpact=false) |
| Reversal creates contra entries, does not edit original ledger entries directly | Yes |
| Financial year lock blocks posting in locked years | Yes (verify:controls confirms) |
| Audit log records posting and reversal activity | Yes |

---

## No Runtime Changes Confirmed

| Area | Changed? |
|---|---|
| UI / screens / components | No |
| Routes / navigation | No |
| IPC channels | No |
| Preload API | No |
| Database schema | No |
| Database migrations | No |
| Seed data | No |
| Accounting logic | No |
| Voucher posting logic | No |
| GST calculations | No |
| Inventory valuation | No |
| Report SQL | No |
| Business services | No |
| Electron main process | No |

---

## Verification Results

All 14 verification commands pass:

| # | Command | Result |
|---|---|---|
| 1 | `npm run lint:syntax` | PASS |
| 2 | `npm run build` | PASS |
| 3 | `npm run verify:knowledge` | PASS (167 entries, 0 errors) |
| 4 | `npm run verify:workflow-graph` | PASS (20 passed, 0 warnings, 0 failed) |
| 5 | `npm run verify:database-graph` | PASS (27 passed, 0 warnings, 0 failed) |
| 6 | `npm run verify:voucher-accounting-graph` | PASS (21 passed, 0 warnings, 0 failed) |
| 7 | `npm run verify:audit` | PASS (152 PASS, 1 INFO, 1 WARNING pre-existing) |
| 8 | `npm run verify:erp` | PASS (Safe to Commit: Yes, Safe to Lock: Yes) |
| 9 | `npm run verify:accounting` | PASS |
| 10 | `npm run verify:financials` | PASS |
| 11 | `npm run verify:controls` | PASS (12 passed, 0 failed) |
| 12 | `npm run verify:voucher-inventory` | PASS |
| 13 | `npm run verify:flow` | PASS |
| 14 | `npm run verify:phase10` | PASS |

Pre-existing warnings: RG-1 high-risk App.jsx (in verify:audit), chunk size (in build). These are not KG-4 issues.

---

## Git Status

### KG-4 Intended Changes

**Modified (intended):**
- `package-lock.json` — package script added
- `package.json` — `verify:voucher-accounting-graph` script added
- `repository/graph-registry.json` — KG-4 registration + compatibility update
- `scripts/verify-audit.js` — KG-4 audit pack integrated

**Created (intended):**
- `docs/architecture/kg-4-voucher-accounting-graph-foundation-report.md`
- `repository/schema/voucher-accounting-graph.schema.json`
- `scripts/verify-voucher-accounting-graph.js`
- `src/renderer/knowledge/voucher-accounting-graph.json`

### Pre-existing Dirty Baseline (Not Part of KG-4)

**Modified (pre-existing dirty):**
- `src/main/database/crudHelpers.js` — stabilization from earlier init.js refactor phase
- `src/main/database/init.js` — stabilization from init.js refactor (7C extraction)
- `src/main/services/importValidationService.js` — stabilization from import extract phase

**Untracked (pre-existing, from earlier phases):**
- `docs/architecture/dg-1-database-graph-foundation-report.md`
- `docs/architecture/dg-1-database-graph-lock-note.md`
- `docs/architecture/kg-2-wg-1-lock-note.md`
- `docs/architecture/kg-2-wg-1-workflow-graph-foundation-report.md`
- `docs/architecture/ki-0-intelligence-layer-status-audit-and-continuation-plan.md`
- `docs/audit/post-extraction-stabilization-report.md`
- `repository/schema/database-graph.schema.json`
- `repository/schema/workflow-graph.schema.json`
- `scripts/verify-database-graph.js`
- `scripts/verify-workflow-graph.js`
- `src/main/services/authService.js`
- `src/main/services/billingService.js`
- `src/main/services/dashboardService.js`
- `src/main/services/documentService.js`
- `src/main/services/importParserService.js`
- `src/main/services/operationsService.js`
- `src/renderer/knowledge/database-graph.json`
- `src/renderer/knowledge/workflow-graph.json`

**No runtime UI, route, IPC, preload, database schema, migration, seed, accounting, voucher, GST, inventory valuation, or report SQL logic was changed as part of KG-4.**

---

## Known Gaps (from KG-4)

| ID | Gap | Impact |
|---|---|---|
| KG4-GAP-001 | Cash/Bank Book report has no dedicated function | No summary report function |
| KG4-GAP-002 | Stock adjustments/returns/transfers no accounting vouchers | Valuation not independently audit-trailed |
| KG4-GAP-003 | Stock outward (COGS) no independent reversal | Must reverse parent transaction |
| KG4-GAP-004 | Opening balances no reversal support | Requires manual Journal adjustment |
| KG4-GAP-005 | No report filters directly by financial_year | Date range based, not FY-linked |
| KG4-GAP-006 | Expense Payable no automated settlement flow | Manual Journal required |

These gaps do not block the KG-4 lock. They are documented for future accounting improvement phases.

---

## Lock Boundaries

### What Is Locked
- KG-4 voucher and accounting graph JSON
- KG-4 JSON Schema v1.0.0
- KG-4 validation script (21 rules)
- KG-4 audit pack in verify:audit.js
- KG-4 registry entry (Active v1.0.0)
- KG-4 foundation report
- This lock note

### What Is Out of Scope
- ERP Brain upgrade or any LLM/AI integration
- Chatbot, Contextual Assistant, or Action-Taking Assistant
- Any runtime ERP code change
- Any database schema change
- Any accounting logic change
- Any voucher posting change
- Any report SQL change
- Any UI or navigation change

### What Future Changes Require a Separate Phase
- Modifying KG-4 graph content (requires version increment)
- Modifying KG-4 schema (requires governance approval per EIL rule 25.3)
- New graph phases (AG-1, etc.)
- ERP Brain upgrade
- Help Assistant integration
- Any runtime code changes

---

## Final Result

**KG-4 v1.0.0 is locked as the voucher and accounting intelligence baseline for future ERP Brain and Help Assistant work.**
