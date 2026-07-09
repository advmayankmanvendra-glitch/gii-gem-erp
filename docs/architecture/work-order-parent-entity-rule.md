# Permanent Architecture Rule 29 - Work Order / Supply Order Parent Entity Rule

Date: 2026-07-09

Status: Active governance rule

## 1. Rule Statement

For the current GII government supply lifecycle, Work Order / Supply Order is the parent operational entity.

In current implementation terms:

- Business parent concept: `WORK_ORDER`
- Current code parent entity: `SUPPLY_ORDER`
- Current table: `supply_orders`
- Current line table: `order_items`
- Current primary route: `supply_orders`

## 2. Operational, Not Accounting

Work Order / Supply Order is operational. It records the business obligation and execution file. It must not directly post ledger entries merely because it is created.

Accounting starts only when a financial event occurs, such as:

- supplier purchase / purchase voucher
- sales invoice / GST invoice
- receipt
- supplier payment/payment
- journal
- credit note
- debit note
- contra
- opening balance
- reversal

## 3. Parent Traceability Requirement

Where applicable, downstream records must preserve traceability back to Work Order / Supply Order.

Examples:

| Downstream Area | Required Traceability |
|---|---|
| Procurement Planning | Work Order / Supply Order and order item demand. |
| Supplier Purchase Orders | Work Order / Supply Order where purchase is order-specific. |
| GRN | Procurement and Work Order / Supply Order. |
| Stock Reservation | Work Order / Supply Order and item. |
| Delivery Challan | Work Order / Supply Order and delivery item. |
| Installation | Work Order / Supply Order and delivery/installation evidence. |
| CRAC | Work Order / Supply Order and invoice readiness. |
| Sales Invoice / GST Invoice | Work Order / Supply Order and department/customer. |
| Department Receivable | Invoice and Work Order / Supply Order. |
| Receipt | Invoice/receivable and Work Order / Supply Order through allocation. |
| Supplier Payment | Procurement/payable and Work Order / Supply Order where order-linked. |
| Profitability | Work Order / Supply Order. |
| Documents | Linked module and linked record. |
| Reports / Dashboards | Source record and parent chain where applicable. |

## 4. Non-Order Exceptions

Some transactions may legitimately not have a Work Order / Supply Order parent.

Examples:

- office expense not tied to a government supply order
- bank charges
- salary/payroll transactions
- statutory payments
- opening balances
- internal transfers
- asset purchases not tied to a supply order

These must be documented as exceptions under the applicable lifecycle. They must not weaken Work Order traceability for government supply transactions.

## 5. Screen And Module Declaration Requirement

Every government supply screen must declare or be mappable to:

- lifecycle stage
- parent entity
- upstream dependency
- downstream impact
- accounting impact
- inventory impact
- GST impact
- document impact
- profitability impact

Until a runtime route registry is implemented, `docs/architecture/workflow-governance-registry.md` is the controlling declaration.

## 6. Prohibited Designs

The following are prohibited without explicit architecture approval:

- Posting ledger entries directly from Work Order creation.
- Treating Receipt, Payment, Invoice or Purchase Voucher as the business origin.
- Creating order-specific procurement without order traceability.
- Creating order-specific stock issue without order traceability.
- Creating order-specific invoice without order traceability.
- Showing profitability without a parent order chain.
- Giving ERP Brain, Help Assistant, AIR or KG guidance that skips mandatory upstream stages.

## 7. Dashboard Rule

Dashboards must not visually imply that accounting vouchers are the beginning of the government supply process.

Voucher Dashboard should show Work Order / Supply Order as an origination document before downstream business and accounting voucher actions.

## 8. Accounting Source Of Truth

Work Order / Supply Order is the operational source of truth for the business file.

Ledger entries remain the accounting source of truth.

Stock ledger remains the inventory source of truth.

Cash/bank ledger remains the treasury source of truth.

GST reports must derive from tax events, not order creation.

Profitability reports must preserve Work Order / Supply Order traceability.
