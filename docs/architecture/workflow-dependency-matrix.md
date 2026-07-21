# Workflow Dependency Matrix (WDM)

**Enterprise Version**

**Date:** 2026-07-20  
**Status:** Architectural specification — not yet machine-consumed  
**Applies to:** GOVERNMENT_SUPPLY_LIFECYCLE (permanent rule 30 — workflow governance registry)  
**Future scope:** Payroll, AMC/Service Contract, Project Work, Manufacturing, Asset Purchase, Legal Case Billing, Internal Expense

---

## 1. Purpose

The Workflow Governance Registry (rule 30) defines *what stages exist* and *the order they must appear in*. It does not capture *why* a stage exists, *what it needs*, *what it changes*, or *who depends on it*.

The Workflow Dependency Matrix fills that gap. It is the single authoritative source for every business stage's:

- purpose and prerequisites
- data ownership and document output
- accounting, inventory and GST impact
- approval rules and statuses
- reversal path and modification boundary
- reporting and dashboard consumers
- brain/AI/audit knowledge

Once populated, almost every downstream architectural asset (Workflow Graph, Help Assistant, Dashboard Intelligence, Audit Graph, Component Ownership Registry, Permission Engine, future automation) can derive its behaviour from the WDM instead of duplicating business logic.

---

## 2. Stage Field Specification

Every stage in the matrix declares the following fields:

| Field | Required | Description |
|---|---|---|
| **Stage ID** | Yes | Stable, unique identifier (e.g. `WDM-01`) |
| **Stage Name** | Yes | Human-readable name matching the governance registry |
| **Business Purpose** | Yes | Why this stage exists in the lifecycle |
| **Previous Stage** | Yes | Mandatory predecessor(s); `None` for the entry stage |
| **Next Stage** | Yes | Allowed successor(s); `None` for the terminal stage |
| **Entry Conditions** | Yes | What must already exist or be true before this stage can begin |
| **Exit Conditions** | Yes | What completes this stage and allows transition to the next |
| **Primary Screen** | Yes | ERP route or screen where this stage is managed |
| **Database Tables** | Yes | Primary tables owned or consumed by this stage |
| **Master Dependencies** | Yes | Master data records that must exist (Customer, Item, GST, etc.) |
| **Documents Generated** | Yes | Output documents created at this stage |
| **Accounting Impact** | Yes | Financial consequences: voucher types, ledger entries, account types |
| **Inventory Impact** | Yes | Stock consequences: inward, outward, reservation, valuation |
| **GST Impact** | Yes | Tax consequences: ITC, output tax, register entries |
| **Workflow Statuses** | Yes | Allowed status values and their meanings |
| **Approval Required** | Yes | Whether human approval is mandatory before the stage can exit |
| **Editable Until** | Yes | The point after which data at this stage becomes read-only or requires reversal |
| **Reverse Through** | Yes | The correct reversal path — never direct deletion |
| **Reports Affected** | Yes | Downstream reports whose data depends on this stage |
| **Dashboard Widgets** | Yes | KPI consumers that aggregate data from this stage |
| **Brain Knowledge** | Yes | Help/AI guidance topic associated with this stage |
| **Risk Level** | Yes | Operational criticality: Low / Medium / High / Critical |
| **Created By** | Yes | Which preceding stage(s) create the records consumed here |
| **Consumed By** | Yes | Which downstream stage(s) depend on records produced here |
| **Updates** | Yes | Which records this stage modifies |
| **Blocks** | Yes | Which stages cannot proceed until this stage completes |
| **Unlocks** | Yes | Which stages become available after this stage completes |


## 3. Dependency Matrix: GOVERNMENT_SUPPLY_LIFECYCLE

### Stage 1 — Lead / Tender

| Field | Value |
|---|---|
| Stage ID | `WDM-01` |
| Stage Name | Lead / Tender |
| Business Purpose | Capture initial business opportunity from a prospect or existing customer |
| Previous Stage | None |
| Next Stage | Query / Requirement |
| Entry Conditions | Customer exists or prospect contact recorded |
| Exit Conditions | Lead qualified and handed to requirement stage |
| Primary Screen | Pre-Order → Leads |
| Database Tables | `leads` |
| Master Dependencies | Customer master |
| Documents Generated | Lead Record, Opportunity Note |
| Accounting Impact | None |
| Inventory Impact | None |
| GST Impact | None |
| Workflow Statuses | New, Contacted, Qualified, Disqualified, Converted |
| Approval Required | Optional (configurable per organisation) |
| Editable Until | Requirement creation |
| Reverse Through | Archive Lead (never delete) |
| Reports Affected | Lead Pipeline, Conversion Rate |
| Dashboard Widgets | Sales Funnel, Lead Count |
| Brain Knowledge | Opportunity guidance, lead qualification |
| Risk Level | Low |
| Created By | — |
| Consumed By | WDM-02 (Requirement) |
| Updates | Lead status, probability, stage history |
| Blocks | — |
| Unlocks | WDM-02 |

---

### Stage 2 — Query / Requirement

| Field | Value |
|---|---|
| Stage ID | `WDM-02` |
| Stage Name | Query / Requirement |
| Business Purpose | Capture detailed customer requirements, technical specifications and scope |
| Previous Stage | Lead / Tender |
| Next Stage | Quotation |
| Entry Conditions | Lead qualified (WDM-01 exit condition met) |
| Exit Conditions | Requirements documented and approved for quotation |
| Primary Screen | Pre-Order → Requirements |
| Database Tables | `procurement_requirements` |
| Master Dependencies | Customer, Item master |
| Documents Generated | Requirement Specification (RFP / RFQ reference) |
| Accounting Impact | None |
| Inventory Impact | None |
| GST Impact | None |
| Workflow Statuses | Draft, Submitted, Approved, Rejected |
| Approval Required | Optional |
| Editable Until | Quotation creation |
| Reverse Through | Reopen Requirement |
| Reports Affected | Requirement Register |
| Dashboard Widgets | Pipeline by Requirement |
| Brain Knowledge | Requirement scoping guidance |
| Risk Level | Low |
| Created By | WDM-01 |
| Consumed By | WDM-03 |
| Updates | Requirement status, linked lead |
| Blocks | — |
| Unlocks | WDM-03 |

---

### Stage 3 — Quotation

| Field | Value |
|---|---|
| Stage ID | `WDM-03` |
| Stage Name | Quotation |
| Business Purpose | Calculate price, prepare and submit formal quotation to customer |
| Previous Stage | Query / Requirement |
| Next Stage | Negotiation |
| Entry Conditions | Approved requirement (WDM-02 exit condition met) |
| Exit Conditions | Quotation submitted and acknowledged by customer |
| Primary Screen | Pre-Order → Quotations |
| Database Tables | `quotations` |
| Master Dependencies | Customer, Item, Price list, GST rate |
| Documents Generated | Quotation document |
| Accounting Impact | None (commitment only — no ledger entry) |
| Inventory Impact | None (may reserve stock provisionally) |
| GST Impact | Reference only (tax rate recorded for estimation) |
| Workflow Statuses | Draft, Submitted, Acknowledged, Expired, Withdrawn |
| Approval Required | Optional (price approval may be configured) |
| Editable Until | Quotation submission |
| Reverse Through | Withdraw Quotation |
| Reports Affected | Quotation Register, Pending Quotations |
| Dashboard Widgets | Quotation Value, Win Rate |
| Brain Knowledge | Pricing guidance, competitor reference |
| Risk Level | Medium |
| Created By | WDM-02 |
| Consumed By | WDM-04 |
| Updates | Quotation status, linked requirement |
| Blocks | — |
| Unlocks | WDM-04 |

---

### Stage 4 — Negotiation

| Field | Value |
|---|---|
| Stage ID | `WDM-04` |
| Stage Name | Negotiation |
| Business Purpose | Finalise price, terms and conditions with the customer |
| Previous Stage | Quotation |
| Next Stage | Purchase Order / GeM Order |
| Entry Conditions | Quotation acknowledged (WDM-03 exit condition met) |
| Exit Conditions | Terms agreed; customer issues Purchase Order |
| Primary Screen | Pre-Order → Negotiation |
| Database Tables | `negotiations` (or embedded in quotation/order history) |
| Master Dependencies | Customer, Item, Price list, GST |
| Documents Generated | Negotiation memo, revised quotation |
| Accounting Impact | None |
| Inventory Impact | None |
| GST Impact | None |
| Workflow Statuses | Open, Agreed, Stalled, Abandoned |
| Approval Required | Mandatory for significant price changes |
| Editable Until | PO creation |
| Reverse Through | Reopen Negotiation |
| Reports Affected | Negotiation History |
| Dashboard Widgets | Margin Impact |
| Brain Knowledge | Negotiation playbook, margin guidance |
| Risk Level | Medium |
| Created By | WDM-03 |
| Consumed By | WDM-05 |
| Updates | Negotiation outcome, revised pricing |
| Blocks | — |
| Unlocks | WDM-05 |

---

### Stage 5 — Purchase Order / GeM Order

| Field | Value |
|---|---|
| Stage ID | `WDM-05` |
| Stage Name | Purchase Order / GeM Order |
| Business Purpose | Receive formal customer order; commit to supply |
| Previous Stage | Negotiation |
| Next Stage | Work Order |
| Entry Conditions | Agreed terms (WDM-04 exit condition met) |
| Exit Conditions | PO verified and Work Order created |
| Primary Screen | Pre-Order → Purchase Orders |
| Database Tables | `purchase_orders` |
| Master Dependencies | Customer, Item, GST, Price list, Department |
| Documents Generated | Customer Purchase Order (filed), Order Acknowledgement |
| Accounting Impact | Operational commitment only — no ledger entry at this stage |
| Inventory Impact | Demand forecast (no stock movement yet) |
| GST Impact | Reference only |
| Workflow Statuses | Received, Verified, In Progress, On Hold, Cancelled |
| Approval Required | Mandatory |
| Editable Until | Work Order creation |
| Reverse Through | Order Cancellation |
| Reports Affected | Order Book, Pending Orders |
| Dashboard Widgets | Order Intake, Backlog |
| Brain Knowledge | Order processing, PO verification |
| Risk Level | High |
| Created By | WDM-04 |
| Consumed By | WDM-06 |
| Updates | PO status, linked negotiation |
| Blocks | — |
| Unlocks | WDM-06 |

---

### Stage 6 — Work Order

| Field | Value |
|---|---|
| Stage ID | `WDM-06` |
| Stage Name | Work Order |
| Business Purpose | Origination point for execution; ties operational planning to the customer order |
| Previous Stage | Purchase Order / GeM Order |
| Next Stage | Procurement Planning |
| Entry Conditions | Verified customer PO (WDM-05 exit condition met) |
| Exit Conditions | Procurement plan approved |
| Primary Screen | Supply Orders (`supply_orders`) |
| Database Tables | `supply_orders`, `order_items` |
| Master Dependencies | Customer, Department, Item, GST |
| Documents Generated | Work Order document |
| Accounting Impact | Operational commitment only — does not post ledger entries |
| Inventory Impact | Demand generated; stock requirement known but no movement |
| GST Impact | Reference only |
| Workflow Statuses | Draft, Approved, In Progress, On Hold, Cancelled, Closed |
| Approval Required | Mandatory |
| Editable Until | Procurement starts (first supplier PO) |
| Reverse Through | Work Order Cancellation |
| Reports Affected | Pending Work Orders, Order Fulfilment Status |
| Dashboard Widgets | Operations Pipeline, Fulfilment Rate |
| Brain Knowledge | Execution workflow, operational guidance |
| Risk Level | Critical |
| Created By | WDM-05 |
| Consumed By | WDM-07 |
| Updates | Work order status, linked PO |
| Blocks | WDM-07 through WDM-18 |
| Unlocks | WDM-07 |

---

### Stage 7 — Procurement Planning

| Field | Value |
|---|---|
| Stage ID | `WDM-07` |
| Stage Name | Procurement Planning |
| Business Purpose | Determine sourcing strategy: make, buy, or use existing stock |
| Previous Stage | Work Order |
| Next Stage | Supplier Purchase Order |
| Entry Conditions | Approved Work Order (WDM-06 exit condition met) |
| Exit Conditions | Procurement plan approved and supplier PO ready |
| Primary Screen | Procurement → Procurement Requirements |
| Database Tables | `procurement_requirements` |
| Master Dependencies | Work Order, Item master, Supplier list |
| Documents Generated | Procurement Plan |
| Accounting Impact | None |
| Inventory Impact | Procurement quantity determined; existing stock check performed |
| GST Impact | None |
| Workflow Statuses | Draft, Approved, In Execution |
| Approval Required | Optional (may be combined with Work Order approval) |
| Editable Until | Supplier PO creation |
| Reverse Through | Revise Procurement Plan |
| Reports Affected | Procurement Register, Stock Availability |
| Dashboard Widgets | Procurement Pipeline |
| Brain Knowledge | Procurement guidance, sourcing strategy |
| Risk Level | Medium |
| Created By | WDM-06 |
| Consumed By | WDM-08 |
| Updates | Plan status, linked work order |
| Blocks | WDM-08 |
| Unlocks | WDM-08 |

---

### Stage 8 — Supplier Purchase Order

| Field | Value |
|---|---|
| Stage ID | `WDM-08` |
| Stage Name | Supplier Purchase Order |
| Business Purpose | Commit to purchase from supplier; initiate procurement |
| Previous Stage | Procurement Planning |
| Next Stage | Goods Receipt / GRN |
| Entry Conditions | Approved procurement plan (WDM-07 exit condition met) |
| Exit Conditions | PO issued to supplier and acknowledged |
| Primary Screen | Procurement → Supplier Purchase Orders |
| Database Tables | `procurements` |
| Master Dependencies | Supplier, Item, GST, Work Order reference |
| Documents Generated | Supplier Purchase Order |
| Accounting Impact | Purchase commitment — no ledger entry yet (PO is not a voucher) |
| Inventory Impact | Stock on order; expected receipt date recorded |
| GST Impact | Reference only |
| Workflow Statuses | Draft, Issued, Acknowledged, Partially Received, Fully Received, Cancelled |
| Approval Required | Mandatory |
| Editable Until | First GRN against this PO |
| Reverse Through | PO Cancellation (only if no GRN exists; else reverse GRN first) |
| Reports Affected | Pending POs, Supplier-wise PO Register |
| Dashboard Widgets | Procurement Funnel, Supplier Performance |
| Brain Knowledge | Purchase order guidance, supplier management |
| Risk Level | Critical |
| Created By | WDM-07 |
| Consumed By | WDM-09 |
| Updates | PO status, linked procurement plan |
| Blocks | WDM-09 |
| Unlocks | WDM-09 |

---

### Stage 9 — Goods Receipt / GRN

| Field | Value |
|---|---|
| Stage ID | `WDM-09` |
| Stage Name | Goods Receipt / GRN |
| Business Purpose | Accept supplier material into inventory; record quantity and condition |
| Previous Stage | Supplier Purchase Order |
| Next Stage | Inventory Reservation |
| Entry Conditions | Supplier PO issued and acknowledged (WDM-08 exit condition met) |
| Exit Conditions | Goods booked into stock; GRN verified |
| Primary Screen | Inventory → GRN (`grn_report`, `grn_status`) |
| Database Tables | `grn`, `stock_ledger` |
| Master Dependencies | Supplier PO, Item master, GST |
| Documents Generated | Goods Receipt Note |
| Accounting Impact | Inventory valuation entry (purchase voucher posts to Inventory GL) |
| Inventory Impact | Stock inward: quantity added to available stock |
| GST Impact | ITC reference: GRN records supplier invoice details for ITC claim |
| Workflow Statuses | Expected, Received, Verified, Rejected, Returned |
| Approval Required | Optional (quantity/quality verification may be configured) |
| Editable Until | Stock issued or reserved |
| Reverse Through | GRN Return (create goods return; never delete GRN) |
| Reports Affected | Stock Ledger, GRN Register, Inventory Valuation |
| Dashboard Widgets | Inventory Level, Receiving Dashboard |
| Brain Knowledge | Goods receipt process, quality check guidance |
| Risk Level | Critical |
| Created By | WDM-08 |
| Consumed By | WDM-10, accounting subsystem (inventory valuation) |
| Updates | Stock ledger, GRN status, linked PO receipt quantity |
| Blocks | WDM-10 |
| Unlocks | WDM-10 |


### Stage 10 — Inventory Reservation

| Field | Value |
|---|---|
| Stage ID | `WDM-10` |
| Stage Name | Inventory Reservation |
| Business Purpose | Allocate specific stock to a Work Order for planned delivery |
| Previous Stage | Goods Receipt / GRN |
| Next Stage | Delivery Challan |
| Entry Conditions | Goods available in stock (from GRN or existing inventory) |
| Exit Conditions | Stock reserved for the order; reservation confirmed |
| Primary Screen | Inventory → Stock Reservation (`stock_reservations`) |
| Database Tables | `stock_reservations`, `stock_ledger` |
| Master Dependencies | Work Order, Item master, GRN reference |
| Documents Generated | Reservation Slip |
| Accounting Impact | None (reservation does not post to ledgers) |
| Inventory Impact | Stock earmarked; availability reduced (physical stock unchanged until issue) |
| GST Impact | None |
| Workflow Statuses | Draft, Confirmed, Picked, Issued, Cancelled |
| Approval Required | Optional |
| Editable Until | Stock issued (Delivery Challan) |
| Reverse Through | Cancel Reservation (only if no delivery challan raised) |
| Reports Affected | Stock Reservation Register, Available Stock |
| Dashboard Widgets | Reservation Utilisation, Order Readiness |
| Brain Knowledge | Reservation process, FIFO/FEFO guidance |
| Risk Level | Medium |
| Created By | WDM-09 (or existing stock) |
| Consumed By | WDM-11 |
| Updates | Reservation status, linked stock ledger |
| Blocks | WDM-11 |
| Unlocks | WDM-11 |

---

### Stage 11 — Delivery Challan

| Field | Value |
|---|---|
| Stage ID | `WDM-11` |
| Stage Name | Delivery Challan |
| Business Purpose | Physically issue stock from inventory for dispatch to customer |
| Previous Stage | Inventory Reservation |
| Next Stage | Installation |
| Entry Conditions | Stock reserved (WDM-10 exit condition met) |
| Exit Conditions | Goods dispatched; Delivery Challan generated |
| Primary Screen | Operations → Delivery Challan (`delivery_challans`) |
| Database Tables | `delivery_challans` |
| Master Dependencies | Work Order, Reservation, Item master |
| Documents Generated | Delivery Challan / Dispatch Note |
| Accounting Impact | Stock outward: inventory reduction entry (COGS if direct; otherwise stock transfer) |
| Inventory Impact | Physical stock reduced; issued against reservation |
| GST Impact | Transport reference (e-way bill if applicable) |
| Workflow Statuses | Draft, Dispatched, In Transit, Partially Delivered, Delivered |
| Approval Required | Mandatory |
| Editable Until | Installation or CRAC |
| Reverse Through | Delivery Return (goods returned to stock; never delete challan) |
| Reports Affected | Delivery Register, Stock Ledger |
| Dashboard Widgets | Dispatch Tracking, Fulfilment Status |
| Brain Knowledge | Dispatch process, e-way bill guidance |
| Risk Level | High |
| Created By | WDM-10 |
| Consumed By | WDM-12 |
| Updates | Stock ledger, delivery challan status |
| Blocks | WDM-12 |
| Unlocks | WDM-12 |

---

### Stage 12 — Installation

| Field | Value |
|---|---|
| Stage ID | `WDM-12` |
| Stage Name | Installation |
| Business Purpose | Install, configure and test delivered goods at customer site |
| Previous Stage | Delivery Challan |
| Next Stage | CRAC |
| Entry Conditions | Goods delivered (WDM-11 exit condition met); installation required per contract |
| Exit Conditions | Installation completed and documented |
| Primary Screen | Operations → Installation / CRAC |
| Database Tables | `installation_records` (or embedded in CRAC) |
| Master Dependencies | Work Order, Delivery Challan, Customer site |
| Documents Generated | Installation Report |
| Accounting Impact | None (service cost may be capitalised; no direct ledger entry) |
| Inventory Impact | None (stock already issued at WDM-11) |
| GST Impact | None |
| Workflow Statuses | Pending, In Progress, Completed, Failed, Rescheduled |
| Approval Required | Customer sign-off may be required |
| Editable Until | CRAC creation |
| Reverse Through | Reinstallation (if defect found) |
| Reports Affected | Installation Register |
| Dashboard Widgets | Installation Status, Pending Installations |
| Brain Knowledge | Installation process, acceptance criteria |
| Risk Level | Medium |
| Created By | WDM-11 |
| Consumed By | WDM-13 |
| Updates | Installation status, linked work order |
| Blocks | WDM-13 (if installation is required) |
| Unlocks | WDM-13 |

---

### Stage 13 — CRAC

| Field | Value |
|---|---|
| Stage ID | `WDM-13` |
| Stage Name | CRAC (Consignee Receipt and Acceptance Certificate) |
| Business Purpose | Obtain formal customer acceptance of delivered and installed goods |
| Previous Stage | Installation (or Delivery Challan if installation not required) |
| Next Stage | Sales Invoice / GST Invoice |
| Entry Conditions | Goods delivered and (if required) installed |
| Exit Conditions | CRAC signed by customer; acceptance recorded |
| Primary Screen | Operations → CRAC (`crac_management`, `crac_entry`, `crac_tracker`) |
| Database Tables | `crac_records` |
| Master Dependencies | Work Order, Delivery Challan, Customer |
| Documents Generated | CRAC Certificate |
| Accounting Impact | Acceptance triggers revenue recognition readiness; no direct ledger entry |
| Inventory Impact | None |
| GST Impact | Reference only (acceptance date may determine invoice timing) |
| Workflow Statuses | Pending, Issued, Accepted, Rejected |
| Approval Required | Mandatory (customer sign-off) |
| Editable Until | Invoice creation |
| Reverse Through | Revise CRAC (if rejection remediated) |
| Reports Affected | Acceptance Register, Pending CRAC |
| Dashboard Widgets | Acceptance Pipeline, Billing Readiness |
| Brain Knowledge | Acceptance process, CRAC guidance |
| Risk Level | High |
| Created By | WDM-12 (or WDM-11 if installation skipped) |
| Consumed By | WDM-14 |
| Updates | CRAC status, linked work order |
| Blocks | WDM-14 |
| Unlocks | WDM-14 |

---

### Stage 14 — Sales Invoice / GST Invoice

| Field | Value |
|---|---|
| Stage ID | `WDM-14` |
| Stage Name | Sales Invoice / GST Invoice |
| Business Purpose | Recognise revenue; raise tax-compliant invoice to customer |
| Previous Stage | CRAC |
| Next Stage | Department Receivable |
| Entry Conditions | CRAC accepted (WDM-13 exit condition met) |
| Exit Conditions | Invoice posted to ledgers; tax invoice generated |
| Primary Screen | Billing → Invoices (`invoices`) |
| Database Tables | `vouchers` (Sales), `voucher_lines`, `ledger_entries`, `receivables`, `gst_registers` |
| Master Dependencies | Work Order, CRAC, Item, Customer, GST rate, HSN/SAC |
| Documents Generated | Tax Invoice, Invoice Copy |
| Accounting Impact | Revenue (credit to Income), GST Output (credit to Output Tax), Receivable (debit to Customer) |
| Inventory Impact | Stock already reduced at WDM-11; no further inventory change |
| GST Impact | Output GST recorded in GST register; liable for GSTR filing |
| Workflow Statuses | Draft, Posted, Cancelled, Credit Note |
| Approval Required | Mandatory |
| Editable Until | Invoice posted (once posted, must use credit note to modify) |
| Reverse Through | Credit Note |
| Reports Affected | Sales Register, GST Output Register, Receivables Ageing, P&L |
| Dashboard Widgets | Billing Summary, Revenue Trend, GST Liability |
| Brain Knowledge | Invoicing guidance, GST compliance, revenue recognition |
| Risk Level | Critical |
| Created By | WDM-13 |
| Consumed By | WDM-15, GST subsystem, accounting subsystem, dashboard |
| Updates | Vouchers, ledger entries, receivables, GST register |
| Blocks | WDM-15 |
| Unlocks | WDM-15 |

---

### Stage 15 — Department Receivable

| Field | Value |
|---|---|
| Stage ID | `WDM-15` |
| Stage Name | Department Receivable |
| Business Purpose | Track the amount due from the customer department; manage collection |
| Previous Stage | Sales Invoice / GST Invoice |
| Next Stage | Receipt |
| Entry Conditions | Invoice posted (WDM-14 exit condition met) |
| Exit Conditions | Receipt allocated against the receivable |
| Primary Screen | Billing → Receivables (`receivables`) |
| Database Tables | `receivables` |
| Master Dependencies | Invoice, Customer, Department |
| Documents Generated | Receivable Statement, Aging Report |
| Accounting Impact | Receivable already created at invoice posting; this stage tracks ageing and allocation |
| Inventory Impact | None |
| GST Impact | None |
| Workflow Statuses | Open, Partially Collected, Collected, Overdue, Written Off |
| Approval Required | None (system computed) |
| Editable Until | Receipt allocation |
| Reverse Through | Credit Note (reduces receivable); Write-off (if irrecoverable) |
| Reports Affected | Receivables Ageing, Department-wise Dues |
| Dashboard Widgets | Collection Efficiency, Overdue Analysis |
| Brain Knowledge | Receivable management, collection guidance |
| Risk Level | Medium |
| Created By | WDM-14 |
| Consumed By | WDM-16 |
| Updates | Receivable status, ageing calculation |
| Blocks | — |
| Unlocks | WDM-16 |

---

### Stage 16 — Receipt

| Field | Value |
|---|---|
| Stage ID | `WDM-16` |
| Stage Name | Receipt |
| Business Purpose | Receive payment from customer; allocate against receivable |
| Previous Stage | Department Receivable |
| Next Stage | Order Closure |
| Entry Conditions | Receivable exists and is not fully collected (WDM-15 active) |
| Exit Conditions | Payment recorded and allocated; receivable updated |
| Primary Screen | Billing → Receipts (`payments`, `receipt_allocation_workflow`) |
| Database Tables | `vouchers` (Receipt), `voucher_lines`, `ledger_entries`, `receivables` |
| Master Dependencies | Invoice, Customer, Bank/Cash account |
| Documents Generated | Payment Receipt, Bank Deposit Slip (reference) |
| Accounting Impact | Cash/Bank debit (asset increase), Receivable credit (asset decrease) |
| Inventory Impact | None |
| GST Impact | None |
| Workflow Statuses | Pending, Allocated, Partially Allocated, Unidentified |
| Approval Required | None (bank/cash entry is operational) |
| Editable Until | Receipt allocated; after allocation use Receipt Reversal |
| Reverse Through | Receipt Reversal |
| Reports Affected | Cash Book, Bank Book, Receivables Ageing, Realisation Report |
| Dashboard Widgets | Collections Dashboard, DSO |
| Brain Knowledge | Payment receipt, allocation guidance |
| Risk Level | Medium |
| Created By | WDM-15 |
| Consumed By | WDM-17 |
| Updates | Vouchers, ledger entries, receivable allocation |
| Blocks | WDM-17 |
| Unlocks | WDM-17 |

---

### Stage 17 — Order Closure

| Field | Value |
|---|---|
| Stage ID | `WDM-17` |
| Stage Name | Order Closure |
| Business Purpose | Formally close the order after all obligations fulfilled |
| Previous Stage | Receipt |
| Next Stage | Profitability Analysis |
| Entry Conditions | All payments received; all deliverables accepted (WDM-16 exit condition met) |
| Exit Conditions | Order marked Closed; no further operational activity permitted |
| Primary Screen | Operations → Order Closure |
| Database Tables | `supply_orders` (status update) |
| Master Dependencies | Work Order, Invoice, Receipt |
| Documents Generated | Order Closure Certificate |
| Accounting Impact | No new entries; closes the order lifecycle from further operational posting |
| Inventory Impact | None |
| GST Impact | None |
| Workflow Statuses | Pending, Closed, Reopened |
| Approval Required | Mandatory |
| Editable Until | Closure (once closed, must reopen to modify) |
| Reverse Through | Reopen Order (only for correction; all downstream stages must be reversed first) |
| Reports Affected | Order Register, Fulfilment Report |
| Dashboard Widgets | Closure Rate, Pending Closure |
| Brain Knowledge | Order closure process, completion checklist |
| Risk Level | High |
| Created By | WDM-16 |
| Consumed By | WDM-18 |
| Updates | Work order status to Closed |
| Blocks | WDM-18 |
| Unlocks | WDM-18 |

---

### Stage 18 — Profitability Analysis

| Field | Value |
|---|---|
| Stage ID | `WDM-18` |
| Stage Name | Profitability Analysis |
| Business Purpose | Measure financial outcome of the completed order |
| Previous Stage | Order Closure |
| Next Stage | None |
| Entry Conditions | Order closed (WDM-17 exit condition met) |
| Exit Conditions | No operational exit — analysis is read-only |
| Primary Screen | Reports → Profitability (`profitability`) |
| Database Tables | Read-only: `vouchers`, `ledger_entries`, `supply_orders`, `order_items`, `procurements` |
| Master Dependencies | Work Order, all transaction data |
| Documents Generated | Profitability Report |
| Accounting Impact | Read-only — consumes ledger data; does not post entries |
| Inventory Impact | Read-only — consumes stock ledger; does not move stock |
| GST Impact | Read-only — consumes GST register; does not file |
| Workflow Statuses | Available (read-only computation) |
| Approval Required | None (information only) |
| Editable Until | N/A (read-only) |
| Reverse Through | N/A (no data to reverse) |
| Reports Affected | Profitability Report, Management Dashboard |
| Dashboard Widgets | Profit Margin, Revenue vs Cost |
| Brain Knowledge | Financial analysis, decision support |
| Risk Level | Low |
| Created By | WDM-17 |
| Consumed By | — |
| Updates | None (read-only aggregation) |
| Blocks | — |
| Unlocks | — |


---

## 4. Dependency Layers

The matrix explicitly defines six dependency dimensions.

### 4.1 Workflow Dependency

```
Lead / Tender
↓
Query / Requirement
↓
Quotation
↓
Negotiation
↓
Purchase Order / GeM Order
↓
Work Order
↓
Procurement Planning
↓
Supplier Purchase Order
↓
Goods Receipt / GRN
↓
Inventory Reservation
↓
Delivery Challan
↓
Installation
↓
CRAC
↓
Sales Invoice / GST Invoice
↓
Department Receivable
↓
Receipt
↓
Order Closure
↓
Profitability Analysis
```

### 4.2 Accounting Dependency

```
Supplier Purchase Order (commitment only)
  ↓
GRN (inventory valuation)
  ↓
Sales Invoice / GST Invoice (revenue, GST output, receivable)
  ↓
Receipt (cash/bank, receivable reduction)
  ↓
Ledger → Trial Balance → P&L → Balance Sheet
```

### 4.3 Inventory Dependency

```
Supplier Purchase Order (stock on order)
  ↓
GRN (stock inward)
  ↓
Inventory Reservation (stock earmarked)
  ↓
Delivery Challan (stock outward)
  ↓
Stock Ledger
```

### 4.4 GST Dependency

```
GRN (ITC reference)
  ↓
Sales Invoice / GST Invoice (output tax)
  ↓
GST Register → GSTR Filing → Compliance
```

### 4.5 Reporting Dependency

```
Voucher (all accounting stages)
  ↓
Ledger Entries
  ↓
Trial Balance
  ↓
P&L / Balance Sheet
```

### 4.6 Operational Dependency

```
Work Order
  ↓
Procurement Planning
  ↓
Supplier Purchase Order
  ↓
Goods Receipt / GRN
  ↓
Inventory Reservation
  ↓
Delivery Challan
  ↓
Installation
  ↓
CRAC
  ↓
Order Closure
```

---

## 5. Source & Impact Model

Every stage declares four relationship categories:

| Category | Description |
|---|---|
| **Created By** | Which preceding stage(s) create the primary records consumed at this stage |
| **Consumed By** | Which downstream stage(s) depend on records produced at this stage |
| **Updates** | Which records this stage modifies (status, quantity, financial, etc.) |
| **Blocks / Unlocks** | Stage-level gate dependencies |
| **Reports** | Downstream reports whose data originates or is transformed at this stage |
| **Dashboards** | KPI views that aggregate data from this stage |
| **Brain / Help** | AI and help assistant topics associated with this stage |
| **Audit** | Audit evidence (audit_log entries, document history) |

### Example — Sales Invoice (WDM-14)

| Field | Value |
|---|---|
| Created By | CRAC (WDM-13) — acceptance triggers billing readiness |
| Consumed By | Receivable (WDM-15), GST Register, Ledger, Aged Trial Balance, P&L |
| Updates | `vouchers` (new Sales voucher), `ledger_entries`, `receivables`, `gst_registers` |
| Blocks | Department Receivable (WDM-15) |
| Unlocks | WDM-15 |
| Reports | Sales Register, GST Output Register, Receivables Ageing, P&L |
| Dashboards | Billing Summary, Revenue Trend, GST Liability |
| Brain | Invoicing workflow, GST compliance, revenue recognition |
| Audit | Audit_log entry on voucher post; invoice document in document center |

---

## 6. Reversal Matrix

Every stage defines its correct reversal path. Direct deletion is never permitted for any stage that has produced records.

| Stage | Reverse Through |
|---|---|
| Lead / Tender | Archive Lead |
| Query / Requirement | Reopen Requirement |
| Quotation | Withdraw Quotation |
| Negotiation | Reopen Negotiation |
| Purchase Order / GeM Order | Order Cancellation |
| Work Order | Work Order Cancellation |
| Procurement Planning | Revise Procurement Plan |
| Supplier Purchase Order | PO Cancellation (if no GRN); else reverse GRN first |
| Goods Receipt / GRN | GRN Return |
| Inventory Reservation | Cancel Reservation |
| Delivery Challan | Delivery Return |
| Installation | Reinstallation (if defect found) |
| CRAC | Revise CRAC (if rejection remediated) |
| Sales Invoice / GST Invoice | Credit Note |
| Department Receivable | Credit Note (reduces receivable); Write-off (if irrecoverable) |
| Receipt | Receipt Reversal |
| Order Closure | Reopen Order (all downstream stages must be reversed first) |
| Profitability Analysis | N/A (read-only) |

---

## 7. Workflow Graph Derivation

Once the WDM is populated, it can automatically generate:

```
Workflow Dependency Matrix (this document)

         ↓
Workflow Graph (WG-1) — each stage becomes a node;
                        Previous/Next/Created By/Consumed By become edges

         ↓
ERP Brain — guidance derived from stage metadata (Purpose, Entry/Exit conditions, Brain Knowledge)

         ↓
Help Assistant — contextual help routed from Primary Screen + Brain Knowledge fields

         ↓
Permission Engine — stage-level access control derived from Approval Required + Risk Level

         ↓
Dashboard Intelligence — KPI mapping derived from Dashboard Widgets fields

         ↓
Audit Graph — stage-level evidence chain derived from Created By / Consumed By / Updates

         ↓
Future Automation — conditional workflow triggers derived from Entry/Exit conditions
                     and Blocks/Unlocks
```

---

## 8. Governance

### 8.1 Authority

The WDM is governed by Permanent Architecture Rule 30 (Workflow Governance Registry). Every WDM row corresponds to a `lifecycle_stages` entry in the registry.

### 8.2 Change Rules

Changes to the WDM require architecture review when:

- a stage is added, removed or reordered
- a stage's accounting, inventory or GST impact changes
- a stage's reversal path changes
- a stage's Blocks/Unlocks relationships change
- a new dependency dimension is introduced

### 8.3 Enforcement

The WDM is documentation-only in the current phase. Future phases may:

1. Validate runtime route/stage metadata against the WDM
2. Generate WG-1 graph nodes and edges from WDM rows
3. Drive Help Assistant contextual answers from WDM fields
4. Constrain permission rules based on stage Risk Level and Approval Required
5. Block reversal paths that do not match the Reversal Matrix

### 8.4 Future Workflow Slots

The registry is designed to host additional workflows:

| Workflow ID | Parent Entity |
|---|---|
| `PAYROLL_LIFECYCLE` | Employee |
| `AMC_SERVICE_CONTRACT_LIFECYCLE` | Service Contract |
| `PROJECT_WORK_LIFECYCLE` | Project |
| `MANUFACTURING_LIFECYCLE` | Production Order |
| `ASSET_PURCHASE_LIFECYCLE` | Asset |
| `LEGAL_CASE_BILLING_LIFECYCLE` | Legal Case |
| `INTERNAL_EXPENSE_LIFECYCLE` | Expense Report |

Each future workflow must define its own 28-field WDM row set.
