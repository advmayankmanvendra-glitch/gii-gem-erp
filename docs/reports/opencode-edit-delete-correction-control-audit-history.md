# OpenCode Edit/Delete/Correction Control Audit History

Date integrated: 2026-06-20

Source: Uploaded OpenCode report titled `Edit/Delete/Correction Control Audit Report`

## Status

This OpenCode report has been accepted into GII GeM ERP project history as an audit finding set.

It is not an implementation phase and does not mark any controls as fixed.

## 2026-06-20 Reconciliation Update

Additional D: workspace reports were received after this audit history was created:

- `edit-delete-correction-control-audit-report.md`
- `migration-027-audit-posting-control-fixes-lock-note.md`
- `phase-15i-crac-management-payment-readiness-order-closure-certification-report.md`

Those reports state that Migration 027 and Phase 15I were implemented and verified in the D: project copy. However, the currently active C: workspace did not contain the key implementation markers at the time of reconciliation, including `assertSupplyOrderNotLinked`, `addAuditAndPostingFixes`, `027_audit_and_posting_control_fixes`, `crac_records`, `CRACManagementScreen`, or `OrderClosureScreen`.

Therefore, this C: workspace history must continue to treat the original OpenCode findings as active until either:

1. The D: copy becomes the active working project, or
2. The D: implementation is explicitly ported into this C: workspace and verified.

See `docs/reports/d-workspace-report-reconciliation-2026-06-20.md` for the detailed reconciliation note.

## Main Findings

| Area | Finding | Severity |
|---|---|---|
| Masters | Some unreferenced master records may be hard-deleted without complete audit coverage. | High |
| Supply Orders | Supply Orders may remain editable/deletable after downstream linked activity exists. | High |
| Inventory | Posted stock movements do not yet have a complete stock-ledger reversal workflow. | Medium |
| Restore / Reactivation | Soft-deleted or inactive records generally do not have a restore/reactivate workflow. | Medium |
| Permissions / UX | Frontend buttons may remain visible even when backend permissions reject the action. | Medium |
| Soft Delete Consistency | `is_deleted` handling is inconsistent across master tables. | Low |

## Imported Module Classification

| Module | Classification |
|---|---|
| Company Master | Partially Complete |
| Employee Master | Partially Complete |
| Department Master | Partially Complete |
| Supplier Master | Partially Complete |
| Item Master | Partially Complete |
| Bank Master | Partially Complete |
| Warehouse Master | Partially Complete |
| Expense Head Master | Partially Complete |
| Chart of Accounts / Ledgers | Partially Complete |
| Supply Orders | Unsafe |
| Procurement | Partially Complete |
| Billing / Invoices | Complete |
| Payments | Partially Complete |
| Expenses | Complete |
| Inventory Movements | Partially Complete |
| Vouchers | Complete |
| Receivables | Complete |
| Payables / Supplier Payments | Complete |
| Opening Balances | Partially Complete |
| Import Batches | Complete |

## Recommended Follow-Up Phase

Recommended phase:

`Edit/Delete/Correction Control Hardening Phase`

Recommended goals:

1. Replace unsafe master hard-delete paths with auditable deactivate or soft-delete behavior.
2. Add Supply Order operational lock checks when linked downstream records exist.
3. Add restore/reactivate workflow where safe.
4. Add inventory reversal/correction workflow for posted stock movements.
5. Add frontend permission-aware disabled states and explanations.

## Commit Guidance

This history file is intended to be tracked in Git.

The generated copy under `reports/` is intentionally ignored by `.gitignore`.

Suggested commit message:

`Record OpenCode edit-delete correction control audit`
