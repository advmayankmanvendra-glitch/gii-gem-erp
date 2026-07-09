# Voucher Dashboard Work Order Gap Audit

Date: 2026-07-09

## Scope

Documentation-only audit of whether Work Order / Supply Order appears as the root business-flow node in the current Voucher Dashboard.

## Evidence Inspected

- `src/renderer/App.jsx`
- `src/renderer/config/navigation.js`
- `src/renderer/features/dashboards/dashboardConfig.js`
- `src/renderer/features/operations/operationsIntelligence.js`
- `src/main/database/init.js`
- `src/main/main.js`
- `src/preload/preload.cjs`

## Current Voucher Dashboard Renderer

The Voucher Dashboard is rendered by `BusinessVoucherScreen` in `src/renderer/App.jsx`.

Current Business Voucher buttons:

- Receipt Voucher
- Supplier Payment Voucher
- Sales Voucher
- Purchase Voucher
- Expense Voucher
- Work Incentive Voucher
- Employee Incentive Voucher
- Contra Voucher
- Credit Note
- Debit Note

Current Accounting Voucher buttons:

- Advanced Journal Entry
- GST Adjustment
- Opening Balance Voucher
- Year End Voucher
- Reversal Voucher

## Finding

Work Order / Supply Order is **not** present as a Voucher Dashboard card or root node.

This is not because the route or table is missing:

- Route/view exists: `supply_orders`
- Table exists: `supply_orders`
- Item lines exist: `order_items`
- Operations navigation exposes Supply Orders
- Dashboard widgets point to Supply Orders
- Document Center supports Supply Order and Work Order document types

The gap is that Voucher Dashboard treats daily voucher entry as the main entry point and does not present the order-origin chain first.

## Gap Type

- Card missing: Yes
- Route missing: No
- Data source missing: No
- Naming mismatch: Yes
- Hidden in operations dashboard: Yes
- Treated as non-voucher: Yes, currently treated as operation/order rather than origination voucher/document

## Risk

Users may interpret the ERP flow as beginning from Sales, Purchase, Receipt or Payment vouchers. For GII government supply work, that is backwards. The commercial file begins from Work Order / Supply Order / Government Purchase Order.

## Recommended Structure

Voucher Dashboard should be split into:

1. Origination Documents
   - Work Order / Supply Order
   - Department Purchase Order
   - Opening Balance

2. Procurement & Inventory
   - Procurement Requirement
   - Purchase / Supplier Bill
   - Stock Inward
   - Stock Outward
   - Inventory Adjustment
   - Return

3. Sales & Receivables
   - Sales Invoice / Billing
   - Receipt
   - Credit Note / Debit Note if applicable

4. Payments & Payables
   - Supplier Payment
   - Expense
   - TDS Payment if applicable

5. Accounting Vouchers
   - Journal
   - Contra
   - Manual Voucher
   - Reversal Voucher

6. Controls
   - Approval Queue
   - Voucher Proposal
   - Bank Reconciliation
   - Audit Trail

## Recommended Next Action

Open a controlled future phase named:

**Work Order / Supply Order Dashboard Root Node Implementation**

Treat this as an urgent business-flow correction at the UI/dashboard layer. It does not require changing voucher posting math or database schema based on this audit.
