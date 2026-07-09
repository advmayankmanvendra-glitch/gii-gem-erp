# Permanent Architecture Rule 28 - GII Operational Chain Of Command Governance Rule

Date: 2026-07-09

Status: Active governance rule

Scope: All GII GeM ERP government supply modules and all future workflow-bearing ERP domains.

## 1. Principle

Every operational module must belong to an approved lifecycle chain. No screen, service, dashboard, assistant, report or future feature may imply that accounting vouchers are the beginning of the business process when an upstream operational parent exists.

For the current government supply business, the approved parent entity is:

**Work Order / Supply Order**

The Work Order / Supply Order is operational. It is not an accounting voucher. It must not post ledger entries by itself.

## 2. Approved Government Supply Lifecycle

The current approved core workflow is:

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

In the current codebase, the operational root is implemented primarily through `supply_orders`, with Work Order represented as business/document terminology where applicable.

## 3. Accounting Start Rule

Accounting must start only from a financial event.

Allowed accounting-start events include:

- Purchase Voucher / supplier purchase posting
- Sales Invoice / GST Invoice posting
- Receipt posting
- Payment posting
- Journal posting
- Credit Note posting
- Debit Note posting
- Contra posting
- Approved opening balance posting
- Approved reversal posting

The following stages must not create ledger entries merely because they exist:

- Lead / Tender
- Query / Requirement
- Quotation
- Negotiation
- Purchase Order / GeM Order
- Work Order / Supply Order
- Procurement Planning
- Installation
- CRAC
- Profitability Analysis

## 4. Inventory Start Rule

Inventory impact must start only from a stock event.

Allowed inventory-start events include:

- Procurement / purchase receipt where stock is received
- Goods Receipt / GRN
- Inventory Reservation
- Delivery Challan / stock outward
- Stock adjustment
- Stock return
- Warehouse transfer

Lead, quotation, negotiation and Work Order / Supply Order may create demand or planning visibility, but they must not alter stock quantity by themselves.

## 5. GST Start Rule

GST impact must start only from a tax event.

Allowed GST-start events include:

- Purchase Invoice / supplier purchase posting
- Sales Invoice / GST Invoice posting
- Credit Note
- Debit Note
- GST adjustment through a controlled accounting workflow

Work Order / Supply Order may carry expected GST metadata, HSN/SAC and quoted tax estimates, but actual GST reporting must come from invoice/tax events.

## 6. Traceability Rule

All downstream government supply modules must preserve traceability to Work Order / Supply Order where applicable.

This includes:

- procurement planning
- supplier purchase
- GRN
- stock reservation
- delivery challan
- installation
- CRAC
- billing / GST invoice
- receivable
- receipt
- supplier payment/payable where order-linked
- documents
- profitability
- reports
- dashboards
- ERP Brain / AIR / KG knowledge

Where a module legitimately does not have a Work Order parent, the exception must be documented in the workflow registry.

## 7. No Bypass Rule

No module may bypass the approved lifecycle chain without a documented exception.

Examples of bypass risks:

- creating invoice flows that cannot identify the parent order
- showing receipt/payment as the business origin
- generating inventory issue without stock event evidence
- reporting profitability without order traceability
- allowing document evidence to remain unlinked to module/record
- allowing AI/ERP Brain guidance to recommend an action that skips mandatory upstream stages

## 8. Screen Declaration Rule

Every workflow-bearing screen must declare or be mappable to:

- lifecycle stage
- parent entity
- upstream dependency
- downstream impact
- accounting impact
- inventory impact
- GST impact
- document impact
- profitability impact

This declaration may live in documentation, route metadata, workflow registry, KG metadata or a future screen registry. Until a runtime registry exists, `docs/architecture/workflow-governance-registry.md` is the controlling reference.

## 9. Stage Rules

| Stage | Rule |
|---|---|
| Lead / Tender | Pre-order opportunity, no accounting. |
| Query / Requirement | Requirement capture, no accounting. |
| Quotation | Commercial proposal, no accounting. |
| Negotiation | Commercial revision, no accounting. |
| Purchase Order / GeM Order | External order evidence, no accounting. |
| Work Order | Internal execution parent, no accounting. |
| Procurement Planning | Requirement planning, no accounting. |
| Supplier Purchase Order | Purchase commitment, no accounting unless purchase voucher is posted. |
| Goods Receipt / GRN | Stock receipt evidence, inventory impact only. |
| Inventory Reservation | Stock commitment, inventory availability impact only. |
| Delivery Challan | Goods movement evidence, inventory outward impact. |
| Installation | Operational completion evidence, no accounting. |
| CRAC | Acceptance evidence, billing readiness. |
| Sales Invoice / GST Invoice | Accounting, GST and receivable impact. |
| Department Receivable | Accounting report/outstanding impact. |
| Receipt | Bank/cash and receivable allocation impact. |
| Order Closure | Operational closure. |
| Profitability Analysis | Management/reporting impact. |

## 10. Change Governance Checklist

Before any module change, the developer must answer:

1. Does this change affect lifecycle stage order?
2. Does this change bypass Work Order / Supply Order traceability?
3. Does this change create accounting before a financial event?
4. Does this change affect inventory before a stock event?
5. Does this change affect GST before invoice/tax event?
6. Does this change preserve document evidence?
7. Does this change preserve profitability traceability?
8. Does this change need workflow registry update?

If any answer indicates risk, the phase must stop for architecture review unless the exception is explicitly documented and approved.

## 11. Future Workflow Extensibility

Government supply is the first registered lifecycle, not the only lifecycle.

The workflow governance registry must support future chains such as:

- Payroll Lifecycle
- AMC / Service Contract Lifecycle
- Project Work Lifecycle
- Manufacturing Lifecycle
- Asset Purchase Lifecycle
- Legal Case Billing Lifecycle
- Internal Expense Lifecycle

Future workflows may define their own parent entity, accounting-start stage, inventory-start stage, GST-start stage, closure stage and reporting stage.

## 12. Permanent Rule

Progress must be measured by stable, traceable operational chains, not by isolated screens or vouchers. A voucher, report or dashboard is compliant only when its lifecycle stage and parent traceability are clear.
