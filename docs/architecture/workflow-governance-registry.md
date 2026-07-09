# Permanent Architecture Rule 30 - Workflow Governance Registry Rule

Date: 2026-07-09

Status: Active governance registry

Purpose: Provide a future-proof registry format for lifecycle-governed ERP workflows. This registry is documentation-only in the current phase and does not change runtime behavior.

## 1. Registry Format

Each workflow must declare:

| Field | Required | Meaning |
|---|---:|---|
| `workflow_id` | Yes | Stable workflow identifier. |
| `workflow_name` | Yes | Human-readable name. |
| `business_domain` | Yes | ERP business domain. |
| `parent_entity` | Yes | Root entity for traceability. |
| `lifecycle_stages` | Yes | Ordered stage list. |
| `required_stage_order` | Yes | Mandatory stage sequence. |
| `optional_stages` | Yes | Stages that may be skipped with rules. |
| `allowed_skip_rules` | Yes | Documented exceptions and skip conditions. |
| `accounting_start_stage` | Yes | Stage(s) where accounting may begin. |
| `inventory_start_stage` | Yes | Stage(s) where inventory may begin. |
| `GST_start_stage` | Yes | Stage(s) where GST may begin. |
| `closure_stage` | Yes | Formal closure stage. |
| `reporting_stage` | Yes | Stage where management/statutory reporting is complete. |
| `future_extension_notes` | Yes | Extension guidance. |

## 2. Registered Workflow: GOVERNMENT_SUPPLY_LIFECYCLE

```yaml
workflow_id: GOVERNMENT_SUPPLY_LIFECYCLE
workflow_name: Government Supply Lifecycle
business_domain: Government supply, procurement, billing and profitability
parent_entity: WORK_ORDER
current_code_parent_entity: SUPPLY_ORDER
lifecycle_stages:
  - LEAD_TENDER
  - QUERY_REQUIREMENT
  - QUOTATION
  - NEGOTIATION
  - PURCHASE_ORDER_GEM_ORDER
  - WORK_ORDER
  - PROCUREMENT_PLANNING
  - SUPPLIER_PURCHASE_ORDER
  - GOODS_RECEIPT_GRN
  - INVENTORY_RESERVATION
  - DELIVERY_CHALLAN
  - INSTALLATION
  - CRAC
  - SALES_INVOICE_GST_INVOICE
  - DEPARTMENT_RECEIVABLE
  - RECEIPT
  - ORDER_CLOSURE
  - PROFITABILITY_ANALYSIS
required_stage_order:
  - WORK_ORDER before PROCUREMENT_PLANNING
  - PROCUREMENT_PLANNING before SUPPLIER_PURCHASE_ORDER
  - SUPPLIER_PURCHASE_ORDER before GOODS_RECEIPT_GRN where stock procurement is required
  - GOODS_RECEIPT_GRN before DELIVERY_CHALLAN where goods are sourced into inventory
  - DELIVERY_CHALLAN before INSTALLATION where installation is required
  - CRAC before RECEIPT readiness where acceptance is mandatory
  - SALES_INVOICE_GST_INVOICE before DEPARTMENT_RECEIVABLE
  - DEPARTMENT_RECEIVABLE before RECEIPT allocation
  - RECEIPT before ORDER_CLOSURE
  - ORDER_CLOSURE before final PROFITABILITY_ANALYSIS lock
optional_stages:
  - LEAD_TENDER
  - QUERY_REQUIREMENT
  - QUOTATION
  - NEGOTIATION
  - INSTALLATION
  - CRAC where not contractually required
allowed_skip_rules:
  - Lead/Tender through Negotiation may be skipped for direct GeM orders if Purchase Order / GeM Order evidence exists.
  - Installation may be skipped for supply-only goods if documented as not applicable.
  - CRAC may be skipped only if the order type does not require consignee acceptance evidence.
  - Procurement may be skipped only if existing stock is available and reservation/issue evidence exists.
accounting_start_stage:
  - SUPPLIER_PURCHASE
  - SALES_INVOICE
  - RECEIPT
  - PAYMENT
inventory_start_stage:
  - PROCUREMENT
  - GRN
  - RESERVATION
  - DELIVERY_CHALLAN
GST_start_stage:
  - SALES_INVOICE
  - PURCHASE_INVOICE
closure_stage: ORDER_CLOSURE
profitability_stage: PROFITABILITY_ANALYSIS
reporting_stage: PROFITABILITY_ANALYSIS
future_extension_notes:
  - Runtime route/stage metadata may later consume this registry.
  - ERP Brain, KG and AIR must treat this workflow as source-truth before generating guidance.
```

## 3. Module Compliance Matrix

| Route Key / Area | Current Module | Lifecycle Stage | Parent Entity | Follows Chain? | Gaps | Required Future Correction |
|---|---|---|---|---|---|---|
| `dashboard` | Executive Dashboard | Reporting / command overview | Work Order / Supply Order where order-linked | Partial | Shows order metrics but not formal lifecycle chain. | Add source-certified lifecycle status widgets. |
| `supply_orders` | Supply Orders | Work Order / Supply Order | Work Order / Supply Order | Yes | Label is Supply Order while governance says Work Order parent. | Use "Work Order / Supply Order" in user-facing root contexts. |
| proposed `work_orders` | Work Orders | Work Order | Work Order | Proposed | No separate runtime route/table. | Do not add unless approved; current `supply_orders` may remain parent implementation. |
| `procurements` | Procurement | Supplier Purchase Order / procurement | Work Order / Supply Order | Partial | Must keep order linkage mandatory where applicable. | Certification should block unlinked procurement unless documented exception. |
| `procurement_requirements` | Procurement Requirements | Procurement Planning | Work Order / Supply Order | Yes | Planning source needs lifecycle registry mapping. | Add route metadata in future registry phase. |
| `grn_report` / `grn_status` | GRN | Goods Receipt / GRN | Work Order / Supply Order through procurement | Partial | Must certify all GRN rows link back to order where applicable. | GRN traceability certification. |
| `inventory_dashboard` | Inventory | Inventory overview | Work Order / Supply Order for order stock | Partial | Mixed stock views may not all be order-linked. | Distinguish order stock vs general stock. |
| `stock_reservations` | Inventory Reservation | Inventory Reservation | Work Order / Supply Order | Yes | Needs dashboard source certification. | Registry route metadata. |
| `delivery_challans` | Delivery Challan | Delivery Challan | Work Order / Supply Order | Yes | Must preserve document evidence. | Delivery evidence certification. |
| `crac_management` / `crac_entry` / `crac_tracker` | Installation / CRAC | Installation / CRAC | Work Order / Supply Order | Yes | Installation may be implicit, not separate route. | Clarify installation vs CRAC stage mapping. |
| `invoices` | Billing / GST Invoice | Sales Invoice / GST Invoice | Work Order / Supply Order | Yes | Must prevent invoice-first mental model. | Keep Work Order root visible in voucher/dashboard UX. |
| `receivables` | Receivables | Department Receivable | Invoice -> Work Order | Yes | Receivable is report/subsidiary stage, not root. | Keep upstream invoice/order references visible. |
| `payments` / `receipt_allocation_workflow` | Receipts | Receipt | Invoice -> Work Order | Yes | Receipt may be entered without clear order context if not allocated. | Allocation certification. |
| `business_supplier_payment_voucher` | Supplier Payments | Payment | Purchase/Payable -> Work Order where linked | Partial | Supplier payment can be not order-linked for non-order purchases. | Document exception rules for non-order supplier payments. |
| `payables` | Payables | Supplier payable reporting | Procurement -> Work Order where linked | Partial | Payable table/report source needs source certification. | Dashboard/source certification. |
| `profitability` | Profitability | Profitability Analysis | Work Order / Supply Order | Yes | Final lock/certification not enforced. | Profitability lock phase. |
| `documents` | Documents | Evidence across stages | Linked module/record | Partial | Documents can be module-linked, but not always lifecycle-stage declared. | Add document-stage metadata later. |
| `reports` and accounting reports | Reports | Reporting | Ledger/source dependent | Partial | Financial reports are ledger-rooted, operational reports are order-rooted. | Report source certification. |
| Help Assistant | Help / guidance | Cross-stage guidance | Workflow registry | Partial | Guidance must not recommend bypasses. | Make registry a required source for Help/AI guidance. |
| ERP Brain / AIR / KG | Intelligence | Knowledge/reasoning | Workflow registry + graph registry | Partial | Registry not yet machine-consumed. | Future KG/AIR expansion after source-truth certification. |

## 4. Governance Checklist For Future Changes

Every future module change must answer:

1. Does this change affect lifecycle stage order?
2. Does this change bypass Work Order / Supply Order traceability?
3. Does this change create accounting before a financial event?
4. Does this change affect inventory before stock event?
5. Does this change affect GST before invoice/tax event?
6. Does this change preserve document evidence?
7. Does this change preserve profitability traceability?
8. Does this change need workflow registry update?

## 5. Future Workflow Registry Slots

The registry is designed to add:

- `PAYROLL_LIFECYCLE`
- `AMC_SERVICE_CONTRACT_LIFECYCLE`
- `PROJECT_WORK_LIFECYCLE`
- `MANUFACTURING_LIFECYCLE`
- `ASSET_PURCHASE_LIFECYCLE`
- `LEGAL_CASE_BILLING_LIFECYCLE`
- `INTERNAL_EXPENSE_LIFECYCLE`

Each future workflow must define its own parent entity, lifecycle stages and accounting/inventory/GST start rules.

## 6. Registry Governance

Changes to this registry are governance changes. They require architecture review when:

- a lifecycle stage is added, removed or reordered
- parent entity semantics change
- accounting start stage changes
- inventory start stage changes
- GST start stage changes
- ERP Brain/KG/AIR consumption rules change
