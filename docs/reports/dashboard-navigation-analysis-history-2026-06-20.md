# Dashboard And Navigation Analysis History

Date integrated: 2026-06-20

Source report:

`D:/Codex/2026-06-09/build-a-new-crm/outputs/gii-gem-erp/reports/dashboard-and-navigation-analysis-report.md`

## Status

This report has been accepted into GII GeM ERP project history as a dashboard and navigation audit finding set.

It is not an implementation phase and does not mark any navigation fixes as completed.

## Active C Workspace Check

Active workspace checked:

`C:/Users/TM Savera/Documents/Codex/2026-06-09/build-a-new-crm/outputs/gii-gem-erp`

The active C: workspace currently has three dashboard modes in `src/renderer/config/dashboard.js`:

- Executive
- Operations
- Accounts

The audit finding that Profitability, GST & Tax, and Reports do not yet have dedicated dashboard modes remains broadly valid.

The active C: navigation still contains duplicated view keys across multiple groups. Examples verified in `src/renderer/config/navigation.js` include:

- `procurement_requirements` under Operations and Inventory
- `receipt_allocation_workflow` under Operations and Receivables & Payables
- `business_credit_note` under Operations and Accounting
- `business_debit_note` under Operations and Accounting
- `tds_reconciliation` under Operations/Reports, while also rendered by Accounting report screens
- `gst_tds_reconciliation` under Operations/Reports, while also rendered by Accounting report screens
- `warehouses` under Masters and Inventory

These duplicates can cause breadcrumb, active group, and context-help confusion when the same view key is reachable from multiple menu locations.

## Main Findings

| Area | Finding | Severity |
|---|---|---|
| Navigation metadata | Duplicate view keys can resolve to the first matching group rather than the group the user clicked. | Major |
| Breadcrumbs | Breadcrumb context can show the wrong group for duplicated views. | Major |
| Active sidebar state | Active group highlighting may follow first-match metadata instead of user navigation origin. | Major |
| Dashboard completeness | Profitability, GST & Tax, and Reports lack dedicated overview dashboards. | Minor / Optional |
| Reports navigation | Reports section acts as a direct launcher rather than a guided report center. | Minor |

## Recommendation

Recommended next phase:

`Navigation Context and Breadcrumb Integrity Phase`

Recommended scope:

1. Track navigation origin group when a user clicks a sidebar item.
2. Resolve active metadata using both `viewKey` and `groupId` where available.
3. Preserve duplicate convenience links only where useful.
4. Remove unnecessary duplicate entries where they create more confusion than value.
5. Ensure breadcrumbs, active group highlighting, context help, recents, favorites, and productivity panel all receive the same resolved navigation context.

Optional future phase:

`Lightweight Functional Dashboard Expansion Phase`

Potential scope:

- Profitability dashboard
- GST & Tax dashboard
- Reports launcher dashboard

These should remain optional because existing Executive and Accounts dashboards already surface many of the same KPIs.

## Safety Rule

No application source code was changed by this history integration.

No accounting formulas, voucher posting math, GST logic, inventory valuation, profitability logic, database schema, IPC channels, preload APIs, route keys or workflows were changed.

## Suggested Commit Message

`Record dashboard and navigation intermixing audit`
