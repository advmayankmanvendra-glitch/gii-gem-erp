# Workflow Governance Chain Of Command Audit Report

Date: 2026-07-09

## Phase Name

GII GeM ERP Operational Chain of Command Governance Rule

## Scope

Documentation, registry and architectural governance only.

No accounting formulas, voucher posting math, GST formulas, inventory valuation, profitability formulas, database schema, IPC names, preload APIs, route keys, save/post/reversal behavior or existing workflows were changed.

## Files Created

- `docs/architecture/gii-operational-chain-of-command-rule.md`
- `docs/architecture/workflow-governance-registry.md`
- `docs/architecture/work-order-parent-entity-rule.md`
- `reports/workflow-governance-chain-of-command-audit-report.md`

## Approved Lifecycle

```text
Lead / Tender
  -> Query / Requirement
  -> Quotation
  -> Negotiation
  -> Purchase Order / GeM Order
  -> Work Order
  -> Procurement Planning
  -> Supplier Purchase Orders
  -> Goods Receipt / GRN
  -> Inventory Reservation
  -> Delivery Challan
  -> Installation
  -> CRAC
  -> Sales Invoice / GST Invoice
  -> Department Receivable
  -> Receipt
  -> Order Closure
  -> Profitability Analysis
```

## Work Order Parent Entity Rule

Work Order is the business parent concept for the government supply lifecycle.

The current code parent entity is Supply Order:

- table: `supply_orders`
- item table: `order_items`
- route: `supply_orders`

Work Order / Supply Order is operational, not accounting.

## Accounting-Start Rule

Accounting must start only from financial events:

- Purchase Voucher / supplier purchase posting
- Sales Invoice / GST Invoice posting
- Receipt posting
- Payment posting
- Journal posting
- Credit Note posting
- Debit Note posting
- Contra posting
- Opening balance posting
- Reversal posting

Work Order / Supply Order must not post ledger entries by itself.

## Inventory-Start Rule

Inventory starts only from stock events:

- Procurement / stock receipt
- GRN
- Inventory reservation
- Delivery challan / stock outward
- Stock adjustment
- Stock return
- Warehouse transfer

Work Order / Supply Order may create demand/planning visibility but must not alter stock quantity by itself.

## GST-Start Rule

GST starts only from invoice/tax events:

- Purchase Invoice
- Sales Invoice / GST Invoice
- Credit Note
- Debit Note
- GST adjustment through controlled accounting workflow

Work Order / Supply Order may carry HSN/GST metadata but must not create GST reporting entries by itself.

## Module Compliance Matrix

| Area | Route Key | Lifecycle Stage | Parent Entity | Follows Chain? | Gap | Future Correction |
|---|---|---|---|---|---|---|
| Dashboard | `dashboard` | Reporting overview | Work Order / Supply Order where order-linked | Partial | Lifecycle not formally declared in runtime metadata. | Dashboard source certification. |
| Supply Orders | `supply_orders` | Work Order / Supply Order | Work Order / Supply Order | Yes | Naming uses Supply Order, not always Work Order. | User-facing root label standardization. |
| Work Orders | proposed | Work Order | Work Order | Proposed | No separate runtime route/table. | Keep current Supply Order parent unless separate phase approves Work Order route. |
| Procurement | `procurements` | Supplier Purchase Order / procurement | Work Order / Supply Order | Partial | Order linkage must be certified. | Procurement traceability certification. |
| Procurement Requirements | `procurement_requirements` | Procurement Planning | Work Order / Supply Order | Yes | Registry not runtime-consumed. | Route/stage metadata phase. |
| GRN | `grn_report`, `grn_status` | Goods Receipt / GRN | Procurement -> Work Order / Supply Order | Partial | GRN traceability needs certification. | GRN source certification. |
| Inventory | `inventory_dashboard` | Inventory overview | Work Order / Supply Order where order-linked | Partial | General stock and order stock need clear distinction. | Inventory dashboard certification. |
| Delivery Challan | `delivery_challans` | Delivery Challan | Work Order / Supply Order | Yes | Evidence chain needs lock. | Delivery document certification. |
| Installation / CRAC | `crac_management`, `crac_entry`, `crac_tracker` | Installation / CRAC | Work Order / Supply Order | Yes | Installation may be implicit. | Installation/CRAC stage mapping. |
| Billing / GST Invoice | `invoices` | Sales Invoice / GST Invoice | Work Order / Supply Order | Yes | Invoice-first mental model risk. | Preserve Work Order root in dashboard UX. |
| Receivables | `receivables`, `bill_wise_receivables` | Department Receivable | Invoice -> Work Order / Supply Order | Yes | Must retain order and invoice references. | Receivable source certification. |
| Receipts | `payments`, `receipt_allocation_workflow` | Receipt | Invoice/Receivable -> Work Order / Supply Order | Partial | Receipt allocation must preserve chain. | Allocation certification. |
| Supplier Payments | `business_supplier_payment_voucher`, `supplier_allocation_workflow` | Payment | Procurement/Payable -> Work Order where applicable | Partial | Non-order payment exceptions need registry treatment. | Exception rules. |
| Payables | `payables`, `bill_wise_payables` | Supplier payable reporting | Procurement -> Work Order where applicable | Partial | Payable source needs certification. | Payables source certification. |
| Profitability | `profitability` | Profitability Analysis | Work Order / Supply Order | Yes | Final closure/profit lock not enforced. | Profitability lock phase. |
| Documents | `documents` | Evidence across stages | Linked module/record | Partial | Document stage metadata missing. | Document Center functional lock. |
| Reports | `reports`, accounting reports | Reporting | Ledger/source dependent | Partial | Source certification incomplete. | Dashboard/report source certification. |
| Help Assistant | `help_assistant` | Guidance | Workflow registry | Partial | Registry not machine-enforced. | Help guidance registry consumption. |
| ERP Brain / AIR / KG | knowledge modules | Intelligence | Workflow registry + graph registry | Partial | Registry not graph-consumed. | Future KG/AIR expansion after source certification. |

## Route / Stage Mapping

| Route Key | Stage |
|---|---|
| `supply_orders` | Work Order / Supply Order |
| `order_items` | Work Order item demand |
| `procurement_requirements` | Procurement Planning |
| `procurements` | Supplier Purchase Orders / Purchase |
| `purchase_bills` | Supplier Purchase Orders / Purchase |
| `grn_report` / `grn_status` | Goods Receipt / GRN |
| `stock_reservations` | Inventory Reservation |
| `delivery_challans` | Delivery Challan |
| `crac_management` / `crac_entry` / `crac_tracker` | Installation / CRAC |
| `invoices` | Sales Invoice / GST Invoice |
| `receivables` / `bill_wise_receivables` | Department Receivable |
| `payments` / `receipt_allocation_workflow` | Receipt |
| `profitability` | Profitability Analysis |
| `documents` | Document Evidence |
| `voucher_dashboard` | Business/accounting voucher command surface |

## Governance Checklist

Before any module change, verify:

1. Does this change affect lifecycle stage order?
2. Does this change bypass Work Order / Supply Order traceability?
3. Does this change create accounting before a financial event?
4. Does this change affect inventory before stock event?
5. Does this change affect GST before invoice/tax event?
6. Does this change preserve document evidence?
7. Does this change preserve profitability traceability?
8. Does this change need workflow registry update?

## Future Workflow Extensibility

The registry is future-proofed for:

- Payroll Lifecycle
- AMC / Service Contract Lifecycle
- Project Work Lifecycle
- Manufacturing Lifecycle
- Asset Purchase Lifecycle
- Legal Case Billing Lifecycle
- Internal Expense Lifecycle

Government supply is the first registered workflow, not the only allowed ERP workflow.

## Verification Results

- `npm.cmd run lint:syntax`: PASS
- `npm.cmd run build`: PASS, with existing Vite large chunk warning
- `npm.cmd run verify:accounting`: PASS
- `npm.cmd run verify:financials`: PASS

## Safe To Lock

Yes.

This phase is documentation/registry governance only. No runtime workflow, posting, schema, IPC, preload, route key, accounting, GST, inventory or profitability logic was changed.
