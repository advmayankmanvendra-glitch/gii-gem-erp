# FSR-2B.1 - Account Mapping Registry Foundation Report

Date: 2026-07-29
Status: PASS WITH WARNINGS

## Objective

Implement the additive Financial Statement Reporting (FSR) 2B.1 foundation for
governed Chart of Accounts grouping and financial-statement mapping without
changing the locked FSR-2A accounting source-of-truth contract.

## Feature Classification

- Primary Category: Architecture
- Secondary Categories: Accounting, Reporting, Governance
- Product Maturity Stage: Internal Testing
- Multi-category impact: Yes. The phase adds accounting metadata used by future
  reporting phases, but it does not change posting, balances, report Structured
  Query Language (SQL), or renderer presentation.

## Dependency Assessment

Dependencies Satisfied: Yes

Verified dependencies:

- FSR-2A accounting-truth lock remains the governing accounting baseline.
- FSR-2B.0 architecture audit was committed as `350eb13`.
- Annotated baseline tag `fsr-2b-baseline-2026-07-29` points to `350eb13`.
- The branch and annotated tag were pushed and their remote targets verified.
- Repository and SQLite database backups were created and verified outside the
  working directory before implementation.
- The FSR-2A verifier suites passed before FSR-2B.1 began.

## Baseline And Recovery Evidence

Baseline tag:

`fsr-2b-baseline-2026-07-29`

External backup location:

`C:\Users\TM Savera\Documents\GII GeM ERP Backups\fsr-2b-baseline-2026-07-29`

Verified backup artifacts:

| Artifact | Verification |
| --- | --- |
| Complete Git bundle | Bundle verification passed and contains the baseline tag and branch |
| Source archive at `350eb13` | SHA-256 recorded during backup creation |
| Development SQLite database | `PRAGMA quick_check` returned `ok`; latest migration was 034 |
| Packaged-userdata SQLite database | `PRAGMA quick_check` returned `ok`; latest migration was 027 |

The backup operation used the project's Electron runtime because the workstation
Node.js native-module Application Binary Interface (ABI) did not match the
installed `better-sqlite3` binary. No dependency was rebuilt or changed.

## Scope Implemented

Migration `035_fsr2b1_account_mapping_registry` adds:

- `account_groups`
- `financial_statement_mappings`
- `account_group_assignments`

The foundation includes:

- 29 canonical account groups
- 20 effective-dated financial-statement mappings
- deterministic assignments for 29 stable built-in account codes
- company and account ownership enforcement
- account-type, normal-balance, and group compatibility enforcement
- effective-date overlap prevention
- idempotent seeding and built-in account backfill
- read-only mapping, classification, and coverage queries
- explicit `MAPPED`, `UNMAPPED`, `MAPPING_INCOMPLETE`, and `TYPE_MISMATCH`
  classifications, with defensive `BALANCE_MISMATCH` detection

Custom accounts are not mapped by name or other heuristic inference. They remain
explicitly unmapped until a controlled review phase.

## Files Changed

- `package.json`
- `repository/graph-registry.json`
- `scripts/verify-audit.js`
- `scripts/verify-database-graph.js`
- `scripts/verify-erp.js`
- `scripts/verify-financial-report-structure.js`
- `scripts/verify-fsr-2b1.js`
- `src/main/database/accountMappingRegistry.js`
- `src/main/database/init.js`
- `src/main/services/accountMappingService.js`
- `src/renderer/knowledge/database-graph.json`
- `reports/fsr-2b1-account-mapping-registry-foundation-report.md`

## Components, Services And Reports

- Components added or changed: None
- Services added: internal read-only `accountMappingService`
- Reports added or changed: No production report builder or report SQL changed
- Verification changed: FSR Check 9 now recognizes the implemented registry
  foundation but remains open until reports consume it

## Architecture Impact

- `App.jsx` impact: None
- Renderer user-interface impact: None
- Route or view-key impact: None
- Inter-Process Communication (IPC) impact: None
- Preload Application Programming Interface (API) impact: None
- Database impact: Additive migration 035 and three metadata tables
- Posting, reversal, approval, opening balance, carry-forward, and inventory
  valuation impact: None

The new tables were added to the existing accounting table and write-policy
registries. No duplicate classification authority was added to `accounts`.

## Business Logic Preservation

PASS

Evidence from populated before-and-after checks:

- voucher count and financial voucher values were unchanged
- voucher-line count and authoritative minor-unit values were unchanged
- ledger-entry count and authoritative minor-unit values were unchanged
- opening-balance and carry-forward values were unchanged
- stock-ledger count and authoritative minor-unit values were unchanged
- Trial Balance, Profit and Loss, and Balance Sheet results were unchanged

The existing `seedAccounts` path updates `updated_at` on built-in accounts during
database initialization. This affected 145 timestamps but no substantive account
field. The behavior predates FSR-2B.1 and was not changed in this phase.

## Enterprise Intelligence Layer

The Enterprise Intelligence Layer (EIL) Database Graph (DG-1) was updated
additively:

- DG-1 content version: 1.1.0
- graph schema version: unchanged at 1.0.0
- 73 tables
- 57 relationships
- 15 service mappings
- 16 migrations
- 7 seed mappings
- 21 protected tables

The graph records that report cutover is deferred to FSR-2B.3 and custom-account
mapping review is deferred to FSR-2B.2.

## Verification Results

| Command | Result |
| --- | --- |
| `npm.cmd run lint:syntax` | PASS |
| `npm.cmd run build` | PASS, 259 modules transformed |
| `npm.cmd run verify:fsr2b1` | PASS, 41 passed and 0 failed |
| `npm.cmd run verify:database-graph` | PASS, 31 passed and 0 failed |
| `npm.cmd run verify:audit` | PASS, 204 passed, 4 informational, 0 warnings or failures |
| `npm.cmd run verify:financial-reports` | PASS WITH WARNINGS, expected 23 passed and 2 failed |
| `npm.cmd run verify:erp` | PASS WITH WARNINGS |

The only financial-structure failures remain:

- Check 9: production reports do not yet consume the governed registry
- Check 16: renderer financial grouping remains heuristic

Both are intentionally deferred to FSR-2B.3. The result count was not forced.

## Desktop Smoke Test

Command:

`npm.cmd start`

Result: PASS

Verified in the Electron desktop application:

- application opened
- login completed
- dashboard rendered
- current company remained visible
- sidebar and Accounting navigation worked
- Financial Statements expanded
- Trial Balance opened with 31 rows
- debit, credit, difference, export, print, and drilldown controls rendered
- back navigation returned to Dashboard
- no blank screen appeared
- standard output and standard error contained no fatal error
- the application exited cleanly through its confirmation dialog

Known runtime warning:

- the existing development-only Electron Content Security Policy warning remains
  in `logs/electron-renderer.log`

No new fatal renderer, import, migration, route, or database error was observed.

## Database Verification

After the full verifier run:

- `PRAGMA quick_check` returned `ok`
- latest migration was 035
- account groups: 29
- financial-statement mappings: 20
- account assignments: 145
- active accounts: 156
- existing or custom unmapped accounts: 11

Unmapped accounts are reported as incomplete coverage and cannot be silently
treated as certified mappings.

## Risks And Known Limitations

- Eleven existing or custom accounts require controlled mapping review.
- No user-interface or writable service exists for mapping maintenance; this is
  intentionally deferred to FSR-2B.2.
- Production financial reports do not yet consume the registry.
- Renderer grouping remains presentation-only and heuristic until FSR-2B.3.
- FSR-R18 remains OPEN.
- FSR-R19 remains OPEN.
- Release and production packaging remain blocked under RMD-1.
- The development Electron Content Security Policy warning remains pre-existing.
- Built-in account `updated_at` timestamp churn during initialization remains a
  pre-existing data-hygiene limitation.

## Production Readiness

- Classification: Internal Testing
- Production readiness gate: PASS WITH WARNINGS
- Safe to commit: Yes, after owner authorization
- Safe to lock: No
- Safe for production packaging: No

FSR-2B.1 is implemented and verified as an additive foundation. It is not a
financial-reporting certification or programme lock.

## Recommended Next Action

Proceed to FSR-2B.2 only after review of this uncommitted implementation. The next
phase should provide governed review and controlled assignment of the eleven
unmapped accounts without altering the locked FSR-2A accounting source-of-truth
contract.
