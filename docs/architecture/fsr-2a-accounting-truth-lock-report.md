# FSR-2A Accounting-Truth Lock Report

**Date:** 2026-07-24
**Programme:** Financial Statement Reporting (FSR) 2A
**Primary category:** Accounting
**Secondary categories:** Architecture, Reporting, Inventory, Governance
**Branch:** `phase-16-enterprise-crm-integration`
**Baseline commit:** `ec197bebb7b2c6ad86801bc67060e4638c2eeace`
**Report status:** PASS WITH WARNINGS

## Executive Position

The implemented FSR-2A accounting controls are technically certified. All
focused populated verifiers, the complete Enterprise Resource Planning (ERP)
regression, the renderer build, and the Electron desktop smoke test passed.

The FSR-2A accounting source-of-truth contract is certified and approved for
lock with conditions. The approval becomes effective only when the annotated
restore tag `fsr-2a-accounting-truth-lock-2026-07-24` points to the lock commit
containing this completed evidence set and is pushed before FSR-2B begins.

The stable tag name is the restore-point identity. This report intentionally
does not embed the lock commit's own hash because amending that commit would
change the hash.

## Phase Governance Summary

| Field | Result |
|---|---|
| Feature classification | Accounting / Architecture / Reporting / Inventory / Governance |
| Dependency assessment | PASS |
| Dependencies satisfied | PASS |
| Components changed | Smart Entity Picker and Quick Create wiring required by desktop smoke |
| Services changed | Entity search query correction only |
| Verifiers changed | FSR Check 20, FSR-2A.3/2A.4 cleanup, master lock matrix, entity picker integration |
| Reports changed | Nine FSR-2A-L1 documents, FSR risk register, FSR-2A.5C status note, generated master report |
| IPC/preload impact | PASS: none |
| Route/view-key impact | PASS: none |
| Database impact | PASS: no schema or operational data change |
| Accounting business logic preserved | PASS |
| Enterprise Intelligence Layer | DG-1, KG-4, and WG-1 verifiers PASS; no graph schema change |
| Desktop smoke test | PASS |
| Production readiness classification | Internal Testing |
| Production packaging and release gate | BLOCKED by RMD-1 and applicable historical remediation |
| Known limitations | FSR-2B mappings, FSR-R18, FSR-R19, RMD-1, annotated-tag activation condition |
| Safe to lock | PASS WITH WARNINGS: effective only after the annotated-tag condition is satisfied |

## Programme History

The original FSR-1 audit identified failures in posting boundaries, company
isolation, voucher-state exclusion, Balance Sheet signs, current-profit
calculation, financial-year close, inventory-to-General Ledger (GL) posting,
opening-balance governance, exact money representation, and report
classification.

| Subphase | Correction | Reproduced result |
|---|---|---:|
| FSR-2A.1 | Balanced posting boundary, company isolation, posted-state filtering | 22/22 PASS |
| FSR-2A.2 | Signed balances, contra accounts, current-profit treatment | 25/25 PASS |
| FSR-2A.3 | Financial-year close, carry-forward, continuity controls | 37/37 PASS |
| FSR-2A.4 | Perpetual inventory, Goods Received Not Invoiced (GRNI), Cost of Goods Sold (COGS), reversal and idempotency controls | 55/55 PASS |
| FSR-2A.5A | Governed opening balances and bypass prevention | 81/81 PASS |
| FSR-2A.5B | Integer minor-unit money, migration 034, dual write, report cutover | 89/89 PASS |
| FSR-2A.5C | Consolidated accounting-truth recertification | 34/34 PASS |

## Stabilization Corrections

Only certification reproducibility and smoke-test blockers were corrected:

- FSR-1 Check 20 now executes against populated temporary data and verifies the
  authoritative INTEGER minor-unit contract rather than the legacy REAL
  compatibility columns.
- FSR-2A.3 and FSR-2A.4 verifiers now close databases, remove all temporary
  roots, and terminate naturally.
- The master verifier now runs the complete lock matrix and accepts the FSR-1
  result only when Checks 9 and 16 are the exact remaining failures.
- Entity search SQL parameter handling was corrected for the required desktop
  picker smoke test.
- Quick Create now receives the existing renderer Application Programming
  Interface (API) and preserves the created record label instead of displaying
  only its internal identifier.

No accounting formula, posting equation, Goods and Services Tax (GST)
calculation, inventory valuation policy, database schema, Inter-Process
Communication (IPC) channel, preload API, route key, or report classification
was changed during stabilization.

## Final Verification

| Gate | Result |
|---|---|
| Focused FSR-2A verifiers | PASS |
| Populated FSR-1 verifier | PASS WITH WARNINGS: 23/25; only Checks 9 and 16 remain |
| Full ERP regression | PASS |
| Renderer build | PASS |
| Electron desktop smoke | PASS |
| Temporary fixture cleanup | PASS |
| Operational database isolation | PASS |
| Reviewed lock document set | PASS |
| Lock commit and restore-tag activation | IN PROGRESS |

The FSR-1 Check 20 result is PASS: authoritative INTEGER minor-unit columns
exist and are populated; posting and reports use minor units, while legacy REAL
columns remain non-authoritative compatibility mirrors.

## Authoritative Accounting Chain

```text
Financially eligible business event
  -> governed balanced voucher
  -> voucher lines in exact minor units
  -> ledger entries in exact minor units
  -> governed opening or carry-forward evidence
  -> inventory subledger/GL reconciliation
  -> Trial Balance
  -> Profit and Loss
  -> Balance Sheet
  -> ledger and voucher drill-down
  -> audit evidence
```

## Money Contract

- INTEGER `_minor` columns hold authoritative money in paise.
- Legacy REAL columns remain compatibility mirrors for staged migration and
  existing renderer transport.
- `parseMoneyToMinor` governs major-to-minor conversion.
- A legacy/minor disagreement is detected by the compatibility integrity
  service and cannot be silently treated as clean migration data.
- Reports prefer minor-unit columns; changing only a legacy REAL ledger value
  does not change report results.

## Inventory Contract

- Stock inward increases the stock subledger and Inventory GL together.
- Supplier invoicing clears GRNI without duplicating inventory cost.
- Stock outward recognizes COGS once.
- Returns, adjustments, and reversals use governed voucher paths.
- Prospective inventory and GL reconciliation is certified.
- Historical pre-certification inventory and purchase data remains under
  FSR-R18.

## Opening and Carry-Forward Contract

- `accounts.opening_balance` is non-authoritative.
- Governed opening vouchers and opening-balance records supply opening truth.
- Carry-forward entries preserve source-year evidence, exact minor values,
  account-type decomposition, and balanced target-year openings.
- Financial-year continuity is certified on populated temporary fixtures.

## Source-of-Truth Field Matrix

| Area | Authoritative fields/evidence | Non-authoritative or pending |
|---|---|---|
| Voucher money | `voucher_lines.debit_minor`, `credit_minor` | `debit`, `credit` REAL mirrors |
| Ledger money | `ledger_entries.debit_minor`, `credit_minor`, `running_balance_minor` | corresponding REAL mirrors |
| Openings | `opening_balances.opening_debit_minor`, `opening_credit_minor`; governed opening vouchers | `accounts.opening_balance` |
| Carry-forward | `closing_balance_minor`, `opening_debit_minor`, `opening_credit_minor` | corresponding REAL mirrors |
| Inventory value | `stock_ledger.value_minor`, `running_value_minor` plus reconciled inventory vouchers | corresponding REAL mirrors |
| Reports | Posted, company/FY-filtered ledger entries and governed openings | renderer grouping heuristics |
| Classification | Pending governed account-group/report mapping in FSR-2B | account-name classification is presentation only |

## Electron Smoke Result

The Electron application was tested against a disposable non-production
database at `runtime/fsr2a-lock-smoke-20260724`. Login, dashboard, company and
financial-year controls, Chart of Accounts, valid and invalid journal posting,
Stock Inward, entity pickers, Quick Create policy, Trial Balance, Profit and
Loss, Balance Sheet, period changes, ledger drill-down, voucher drill-down,
money formatting, close, restart, and database reuse all passed.

The only observed runtime warning was Electron's non-fatal development Content
Security Policy warning related to `unsafe-eval`. No fatal renderer, import,
route, React, database, or main-process error appeared.

The master verification run also emitted two non-fatal graph-schema validator
messages stating that the `date-time` format was ignored. All graph checks
passed with exit code 0.

## Historical Risk Boundary

- FSR-R18 remains OPEN: historical inventory/GL and Purchase/COGS data has not
  been reconciled or remediated.
- FSR-R19 remains OPEN: historical production REAL money has not been
  backfilled and reconciled to minor units.
- Prospective code-path certification does not certify historical production
  data.
- Both risks require separate approval, read-only assessment, backup, dry run,
  reconciliation, governed correction, and rollback evidence.

## RMD-1 Release Boundary

Release and Migration Data Continuity (RMD) 1 is incomplete. The active startup
path lacks a fully enforced schema compatibility gate, newer-database refusal,
automatic verified pre-migration backup, historical upgrade fixtures,
failure-recovery certification, legacy-path reconciliation, and certified
rollback controls.

FSR-2B architecture work may proceed only after the annotated-tag activation
condition is satisfied. RMD-1 remains BLOCKED. No installer, production
packaging, or production release may proceed until RMD-1 and applicable
historical remediation controls are separately certified.

## Remaining FSR-2B Gaps

1. FSR-1 Check 9: no governed account-group/report-mapping registry.
2. FSR-1 Check 16: renderer assigns financial classifications heuristically.

FSR-2B must not alter the locked posting, minor-unit, opening, carry-forward,
inventory, report-total, drill-down, or audit contracts.

## Restore and Rollback

The stable restore-point identity is the annotated tag
`fsr-2a-accounting-truth-lock-2026-07-24`. It must point to the lock commit
containing the complete stabilization change set and evidence pack and must be
pushed before FSR-2B begins. The approval is not effective until both the local
and remote tag resolve to that lock commit.

Rollback means returning application source to that tagged commit and restoring
a verified compatible database backup. Downgrading an already migrated
database to an older application is prohibited until RMD-1 defines and tests
that compatibility path.

## Lock Conditions

| Condition | Status |
|---|---|
| Implementation and populated certification | PASS |
| Full regression and desktop smoke | PASS |
| Historical and release risks documented | PASS |
| Lock report and gate prepared | PASS |
| Final lock commit containing this evidence set | IN PROGRESS |
| Working tree clean at lock commit | IN PROGRESS |
| Annotated restore tag points to that lock commit | IN PROGRESS |
| Branch and annotated tag pushed and remotely verified | IN PROGRESS |
| FSR-2B approval | PASS WITH WARNINGS: effective only after the annotated-tag condition |

## Final Certification Position

FSR-R18 remains OPEN. FSR-R19 remains OPEN. RMD-1 remains BLOCKED. Production
packaging and release remain BLOCKED. FSR-2B may not alter the locked
authoritative minor-unit, voucher, ledger, opening, carry-forward, inventory,
report-total, drill-down, or audit contracts. Renderer grouping remains
presentation-only and is not accounting authority.

**FSR-2A ACCOUNTING TRUTH CERTIFIED AND LOCKED — APPROVED WITH CONDITIONS FOR FSR-2B**

Effective condition: the annotated restore tag
`fsr-2a-accounting-truth-lock-2026-07-24` must point to this lock commit and be
pushed before FSR-2B begins.
