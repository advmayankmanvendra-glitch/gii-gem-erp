# DG-1 Database Graph Foundation — Lock Note

**Phase:** DG-1 Database Graph Foundation
**Lock Date:** 2026-07-14
**Status:** Locked — Active v1.0.0

## Scope Confirmed

### Deliverables

| Item | Path | Status |
|---|---|---|
| Foundation report | `docs/architecture/dg-1-database-graph-foundation-report.md` | OK |
| Database graph | `src/renderer/knowledge/database-graph.json` | OK |
| Graph schema | `repository/schema/database-graph.schema.json` | OK |
| Validation script | `scripts/verify-database-graph.js` | OK |
| Package script | `npm run verify:database-graph` | OK |
| Registry entry | `repository/graph-registry.json` — Active v1.0.0 | OK |

### Graph Properties

| Property | Value | Status |
|---|---|---|
| Tables | 63 | OK |
| Relationships | 51 | OK |
| Posting functions mapped | 22 | OK |
| Report sources mapped | 26 | OK |
| Accounting protected tables | 18 | OK |
| supply_orders → WORK_ORDER | Yes | OK |
| Trial Balance → ledger_entries | Yes | OK |
| P&L → ledger_entries | Yes | OK |
| Balance Sheet → ledger_entries | Yes | OK |

### No Runtime Changes

No modifications were made to:
- Runtime UI, routes, views, or navigation
- IPC channels or preload APIs
- Database schema, migrations, or seed data
- Accounting formulas, voucher posting, or GST calculations
- Inventory valuation or stock ledger logic
- Report SQL or financial reporting logic
- Any production service or database module

**DG-1 is a read-only intelligence graph. No runtime ERP behavior was altered.**

### Accounting Protection Distinction

- **"11 accounting protection boundaries"** refers to 11 distinct protection categories/rules enforced by the graph schema and validation checks (e.g., genericCrudAllowed=false enforcement, accounting start stage boundaries, protected table FK constraints, etc.).
- **"18 accountingProtected tables"** refers to the individual tables flagged with `accountingProtected=true` in the graph.
- These numbers measure different things (rule boundaries vs. individual table flags) and are not contradictory.

## Verification Results

| # | Command | Result |
|---|---|---|
| 1 | `npm run lint:syntax` | PASS |
| 2 | `npm run build` | PASS |
| 3 | `npm run verify:knowledge` | PASS (167 entries, 0 errors) |
| 4 | `npm run verify:workflow-graph` | PASS (20 passed, 0 warnings, 0 failed) |
| 5 | `npm run verify:database-graph` | PASS (27 passed, 0 warnings, 0 failed) |
| 6 | `npm run verify:audit` | PASS (133 PASS, 1 INFO, 1 WARNING pre-existing) |
| 7 | `npm run verify:erp` | PASS (Safe to Commit: Yes, Safe to Lock: Yes) |
| 8 | `npm run verify:accounting` | PASS |
| 9 | `npm run verify:financials` | PASS |
| 10 | `npm run verify:controls` | PASS (12 passed, 0 failed) |
| 11 | `npm run verify:voucher-inventory` | PASS |
| 12 | `npm run verify:flow` | PASS |
| 13 | `npm run verify:phase10` | PASS |

All 13 verification commands pass. The only warnings are pre-existing (RG-1 high-risk App.jsx, chunk size).

## Git Status

Only DG-1-intended files were modified or created:

**Modified (this phase only):**
- `package.json` — added `verify:database-graph` script, `ajv` dev dependency
- `package-lock.json` — ajv dependency lock update
- `repository/graph-registry.json` — DG-1 set to Active v1.0.0
- `scripts/verify-audit.js` — DG-1 audit pack (15 checks)

**Created (this phase only):**
- `docs/architecture/dg-1-database-graph-foundation-report.md`
- `repository/schema/database-graph.schema.json`
- `scripts/verify-database-graph.js`
- `src/renderer/knowledge/database-graph.json`

Pre-existing dirty baseline files from prior stabilization work (WG-1/KG-2, KI-0, post-extraction) remain uncommitted — these are unrelated to DG-1.

## Lock Decision

**DG-1 v1.0.0 is locked as the database intelligence baseline.**

- All deliverables verified.
- All mapping properties confirmed.
- No runtime changes made.
- All verification gates pass.
- Git changes scoped to DG-1 only.

## What Is Locked

1. `database-graph.json` — complete read-only mapping of all 63 tables, columns, relationships, posting functions, report sources, and accounting protection boundaries.
2. `database-graph.schema.json` — canonical JSON Schema for validating database graph structure.
3. `verify-database-graph.js` — 27 validation rules enforcing graph integrity.
4. `graph-registry.json` — DG-1 entry registered at Active v1.0.0 with WG-1 dependency.
5. `verify-audit.js` — DG-1 audit pack integrated into unified audit.

## What Is Out of Scope

- Database schema changes (migrations, seed data, table DDL)
- Runtime ERP changes (services, screens, posting, reports, IPC)
- AG-1 Audit Graph (separate future phase)
- KG-4 Voucher & Accounting Graph (next phase, not started)
- ERP Brain upgrade (separate future phase)

## Future Changes Require a Separate Phase

Any of the following must be done in a dedicated phase with its own gate check:
- Adding new tables to the graph (requires schema changes)
- Modifying posting function or report source mappings (requires service changes)
- Changing accounting protection boundaries (requires governance review)
- Updating graph schema version (requires compatibility review)
- KG-4 Voucher & Accounting Graph
- AG-1 Audit Graph
- Any runtime ERP modification

## Safe to Proceed

**DG-1 is locked. KG-4 (Voucher & Accounting Graph) may proceed.**

---

*Lock note generated: 2026-07-14T14:55:00.000Z*
