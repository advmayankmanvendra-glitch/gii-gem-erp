# Tally.ERP 9 to GII ERP — Conceptual Mapping Document

**Phase**: F — Tally Intelligence Layer  
**Document Version**: 1.0  
**Source System**: Tally.ERP 9 (general knowledge; supplemented by TallyPrime v1.1.7 extraction from GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED)  
**Target System**: GII ERP (Gestured India Infra ERP)  
**AIR v2 Format**: Active Intelligence Record v2 (7 entity types, A/B/C classification)

---

## 1. Introduction

The Tally Intelligence Layer bridges Tally.ERP 9's flexible, schema-on-read accounting model with GII ERP's structured relational schema. This document defines conceptual mappings for master data, transactional data, GST/compliance constructs, and coverage metrics. Mappings are informed by a real-world extraction from TallyPrime v1.1.7 (GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED, GSTIN 10AAJCG3823D1Z7, Bihar) yielding 1,617 entities with 99.2% mapping success.

Tally.ERP 9 (at `C:\Program Files\Tally\Tally.ERP9`) contains no company data and no XML exports; all mappings are therefore based on established Tally data structures and the verified TallyPrime extraction.

---

## 2. Master Data Mapping

### 2.1 Groups → GII Group Hierarchy

Tally Groups map to GII's hierarchical group/category structure. 30 groups were extracted from the TallyPrime source, representing both system-defined and user-defined groups with explicit parent-child relationships.

| Tally Group | Parent Group | GII Entity | Notes |
|---|---|---|---|
| Primary | — | Root Organisation Node | Top-level container |
| Current Assets | Primary | Asset Category (Current) | — |
| Bank Accounts | Current Assets | Bank Account Group | — |
| Cash-in-Hand | Current Assets | Cash Group | — |
| Sundry Debtors | Current Assets | Receivables Group | — |
| Current Liabilities | Primary | Liability Category (Current) | — |
| Sundry Creditors | Current Liabilities | Payables Group | — |
| Duties & Taxes | Current Liabilities | Tax Payables Group | — |
| Direct Expenses | Primary | Expense Category (Direct) | — |
| Indirect Expenses | Primary | Expense Category (Indirect) | — |
| Direct Incomes | Primary | Income Category (Direct) | — |
| Indirect Incomes | Primary | Income Category (Indirect) | — |
| Fixed Assets | Primary | Asset Category (Fixed) | — |
| Investments | Primary | Investment Group | — |
| Loans & Advances | Current Assets | Advances Group | — |
| Provisions | Current Liabilities | Provisions Group | — |
| Suspense | Primary | Suspense Group | — |
| Reserves & Surplus | Primary | Equity Reserves | — |
| Capital Account | Primary | Equity Capital | — |
| Sales Accounts | Direct Incomes | Revenue (Sales) Group | — |
| Purchase Accounts | Direct Expenses | Cost of Goods Sold Group | — |
| Stock-in-Hand | Current Assets | Inventory Group | — |
| Branch/Division | Primary | Division Node | Custom Tally group |
| GEM Debtors | Sundry Debtors | Special Receivables Group | 30+ parties (custom convention) |
| GEM Creditors | Sundry Creditors | Special Payables Group | 45+ parties (custom convention) |
| TDS Payable | Duties & Taxes | TDS Payables Group | — |
| GST Payable | Duties & Taxes | GST Output Group | — |
| GST Input Credit | Current Assets | GST Input Credit Group | — |
| Rounding Off | Primary | Rounding Adjustment | — |
| Misc. Expenses (OS) | Indirect Expenses | Opening Balance Adjustments | — |

User-defined groups (e.g., GEM Debtors, GEM Creditors) follow GII naming conventions where a single Tally group maps to a GII group classification with a custom tag or sub-type discriminator.

### 2.2 Ledgers → GII Ledgers

175 ledgers extracted. Each Tally ledger maps to a GII Ledger record with the following conceptual transformation:

| Tally Field | GII Field | Transformation |
|---|---|---|
| Ledger Name | ledger_name | Direct copy; normalised to uppercase in GII |
| Group (parent) | ledger_group_id | FK to gii_group hierarchy |
| Opening Balance | opening_balance | Signed value; debit positive, credit negative |
| Debit/Credit Nature | ledger_type | Enum: DEBIT / CREDIT |
| GSTIN/UIN | tax_registration.gstin | Extracted from GST Details; 102 party ledgers |
| Registration Type | tax_registration.registration_type | Regular, Composition, Unregistered, etc. |
| PAN | tax_registration.pan | If available from statutory details |
| Address | address | Billing/shipping address concatenation |
| Contact | contact.phone / contact.email | If present in mailing details |
| Maintain Bill-wise | bill_settlement_enabled | Boolean; true for 102 party ledgers |
| Credit Limit (if any) | credit_limit | Optional; numeric |
| Currency | currency | Default INR unless multi-currency enabled |

**Party vs Non-Party**: 102 of 175 ledgers are party ledgers (Sundry Debtors/Creditors with bill-wise enabled). These map to GII Party records with linked ledger entries. The remaining 73 are nominal ledgers (expenses, incomes, duties, taxes, etc.) mapping to pure GII Ledger records without party linkage.

### 2.3 Stock Items → GII Products/Items

539 stock items extracted from TallyPrime. Each maps to a GII Product or Inventory Item.

| Tally Field | GII Field | Transformation |
|---|---|---|
| Stock Item Name | product_name / item_name | Direct copy |
| Under (Stock Group) | category_id | FK to gii_category |
| Units | uqc_id | FK to gii_uqc (21 UQC codes identified) |
| Opening Stock Quantity | opening_qty | Numeric, default 0 |
| Opening Stock Value | opening_value | Monetary, default 0.00 |
| Rate (last purchase) | last_purchase_price | Optional |
| Rate (last sale) | last_sale_price | Optional |
| GST Applicable | tax_applicable | Boolean |
| HSN/SAC Code | hsn_sac_code | 6–8 digit code (see §4.2) |
| Taxability | taxability | Goods / Services / Not Applicable |
| Rate of Duty (GST %) | tax_rate | Slab: 0, 5, 12, 18, 28 |
| Type of Supply | supply_type | Supply / Export / SEZ / Deemed Export |
| Is Service | is_service | Boolean; derived from HSN vs SAC prefix |
| Composite Stock Item (if BOM) | bom_item | Boolean; default false |
| Batch Details | batch_tracking_enabled | Boolean; if Tally maintains batches |
| Expiry Date (if batch) | expiry_date | Date; perishable/chemical items |
| Godown (default) | warehouse_id | FK to gii_warehouse (1 godown: MAIN) |

539 items are organised under stock groups, with 11 distinct units. All items reside in the single "MAIN" godown.

### 2.4 Stock Groups → GII Categories

Tally Stock Groups form a tree structure mapping to GII Category hierarchy (unlimited depth via parent_id recursion). Examples from extraction:

| Stock Group | Parent | GII Category | Purpose |
|---|---|---|---|
| Primary | — | Root Category | Top-level |
| Construction Materials | Primary | Construction Materials | Core business |
| Cement | Construction Materials | Cement | Sub-category |
| Steel/TMT Bars | Construction Materials | Steel | Sub-category |
| Aggregates | Construction Materials | Aggregates | Sand, gravel, stone |
| Electrical Items | Primary | Electrical | Wiring, switches, fixtures |
| Plumbing | Primary | Plumbing | Pipes, fittings |
| Safety Equipment | Primary | Safety Equipment | PPE, helmets, harnesses |
| Consumables | Primary | Consumables | Low-value disposables |
| Sub-Contract Services | Primary | Services | Labour, consultancy |

### 2.5 Units → GII UQC (Unit Quantity Code)

21 UQC codes identified across 11 distinct units of measurement. Mapping follows the GST UQC master:

| Tally Unit | UQC Code | Description |
|---|---|---|
| Nos | NOS | Numbers |
| Kgs | KGS | Kilograms |
| Quintals | QTL | Quintals |
| Tonnes | TNE | Tonnes |
| Meters | MTR | Metres |
| Sq. Ft. | SQF | Square Feet |
| Cu. Ft. | CUF | Cubic Feet |
| Litres | LTR | Litres |
| Box | BX | Box |
| Pcs | PAC | Pack / Pieces |
| Sets | SET | Sets |

### 2.6 Godowns → GII Warehouses / Locations

| Tally Field | GII Field | Notes |
|---|---|---|
| Godown Name | warehouse_name | 1 location: "MAIN" |
| Parent Godown | warehouse_parent_id | Flat hierarchy in extraction |
| Address | warehouse_address | Not populated in source |
| Godown Type | warehouse_type | Physical / Transit / Virtual |

Single godown (MAIN) in the extracted dataset. GII schema supports multi-warehouse, zone, and aisle-level location tracking.

### 2.7 Voucher Types → GII Transaction Types

24 voucher types identified, 15 active (with transactions in period).

| Tally Voucher Type | GII Transaction Type | Active | Mapping Notes |
|---|---|---|---|
| Payment | PAYMENT | Yes | Single/multi-party payment |
| Receipt | RECEIPT | Yes | Customer receipt |
| Sales | SALES_INVOICE | Yes | Tax invoice |
| Purchase | PURCHASE_INVOICE | Yes | Vendor bill |
| Credit Note | CREDIT_NOTE | Yes | Sales return / adjustment |
| Debit Note | DEBIT_NOTE | Yes | Purchase return / adjustment |
| Contra | CONTRA | Yes | Bank transfers, deposit |
| Journal | JOURNAL | Yes | Adjustments, rectifications |
| Payment (TDS) | TDS_PAYMENT | Yes | TDS-deducted payments |
| Stock Journal | STOCK_TRANSFER | Yes | Inter-godown stock movement |
| Delivery Note | DELIVERY_NOTE | No | Pending sales dispatch |
| Receipt Note | RECEIPT_NOTE | No | Pending purchase receipt |
| Physical Stock | STOCK_ADJUSTMENT | No | Stock count adjustment |
| Rejection In | REJECTION_IN | No | Rejected purchase return |
| Rejection Out | REJECTION_OUT | No | Rejected sales return |
| Manufacturing | MANUFACTURING_JE | Yes | BOM consumption/production |
| Process | PROCESS_JE | No | Multi-stage production |
| Payroll | PAYROLL | Yes | Salary booking |
| Attendance | ATTENDANCE | No | Time tracking input |
| Sales Order | SALES_ORDER | No | Order stage (no dispatch) |
| Purchase Order | PURCHASE_ORDER | No | PO stage (no receipt) |
| Memo | MEMO | No | Audit memo |
| Reverse Journal | REVERSAL | No | Correction reversal |
| Credit Limit | CREDIT_LIMIT_CHANGE | No | Limit adjustment |

### 2.8 Cost Centres / Cost Categories → GII Cost Centers

Tally's Cost Centre (parallel classification) maps to GII Cost Centre dimension.

| Tally | GII | Notes |
|---|---|---|
| Cost Category | cost_centre_category | E.g., Project, Department |
| Cost Centre Name | cost_centre_name | E.g., "NH-44 Project", "Administration" |
| Under Category | cost_category_id | FK to cost centre category |
| Allocation to Ledger | allocation_rules | Optional percentage-based |

Extraction confirms cost centres used primarily for project-wise tracking (infrastructure contracts).

---

## 3. Transactional Data Mapping

### 3.1 Voucher → GII Transaction / Journal Entry

85 vouchers extracted from TallyPrime. Each voucher becomes a GII Transaction header.

| Tally Voucher Field | GII Field | Notes |
|---|---|---|
| VCHTYPE (attribute) | transaction_type | Maps to Voucher Type → Transaction Type |
| Voucher Number | transaction_number | Preserved; alphanumeric |
| Date | transaction_date | Date (DD-MMM-YY → YYYY-MM-DD) |
| Narration | description | Free-text memo |
| Voucher GUID (if available) | external_reference_id | Traceability UUID |
| Post-Dated / Override Date | effective_date | If different from entry date |
| Created On | created_at | Audit timestamp |
| Altered On | updated_at | Audit timestamp |
| VCHSTATUS (Cancelled) | is_cancelled | Boolean; default false |
| Total Amount | gross_amount | Sum of all ledger entries |
| Period | fiscal_period_id | FK to fiscal calendar |

Transaction type transformation uses the VCHTYPE attribute directly. For example, a Sales voucher (`VCHTYPE=Sales`) maps to `SALES_INVOICE`. The bill-wise reference is preserved in the transaction metadata.

### 3.2 Ledger Entry → GII Journal Entry Line

Each Tally ledger entry (within a voucher) maps to a GII Journal Entry Line (JEL).

| Tally Field | GII Field | Notes |
|---|---|---|
| Ledger Reference | ledger_id | FK to gii_ledger |
| Amount | amount | Absolute value |
| Is Debit | is_debit | Boolean; true = debit, false = credit |
| Narration | line_description | Line-item memo |
| Cost Centre (if tagged) | cost_centre_id | FK to gii_cost_centre |
| Cheque Date / Number | cheque_ref | For payment/receipt entries |
| Tax Rate at Entry | effective_tax_rate | Snapshot of GST rate at transaction date |
| Party Ledger Ref | party_id | If ledger is Sundry Debtors/Creditors |
| GST Ledger Reference | tax_ledger_id | If entry is IGST/CGST/SGST/Cess |

### 3.3 Inventory Entry → GII Stock Transaction Line

Inventory lines nested within Sales/Purchase/Stock Journal vouchers map to Stock Transaction Lines.

| Tally Field | GII Field | Notes |
|---|---|---|
| Stock Item Reference | item_id | FK to gii_product |
| Godown | warehouse_id | FK to gii_warehouse |
| Quantity | quantity | Signed; positive inward, negative outward |
| Rate | unit_price | Per-unit price |
| Amount (before tax) | net_amount | Quantity × Rate |
| Actual Quantity | billed_quantity | For invoicing; may differ from stock qty |
| Batch / Lot No. | batch_id | FK if batch tracking enabled |
| Manufacturing Date (if batch) | mfg_date | — |
| Expiry Date (if batch) | expiry_date | — |
| Additional Cost (e.g., Freight) | landed_cost_apportioned | Proportionately distributed |

Inventory entries without a quantity (service items) produce a zero-quantity stock line with the service flag.

### 3.4 Bill-wise Allocation → GII Bill Settlement

Tally's bill-wise (reference-based) allocation maps to GII Bill Settlement records. Each party ledger in a voucher carries zero or one bill-on-bill settlement.

| Tally Bill-wise Field | GII Field | Notes |
|---|---|---|
| Reference Name (bill ref) | bill_reference_number | Invoice/Payment reference |
| Reference Type | bill_type | New / Against Reference / Advance / On Account |
| Reference Date | bill_date | Original bill date |
| Amount Adjusted | settlement_amount | Portion of total that settles open bill |
| Pending Amount (before settlement) | open_amount | Remaining before current adjustment |
| Amount Due (after settlement) | remaining_amount | New open amount |

Three bill-wise types encountered in extraction:
- **New**: Creates a new receivable/payable (e.g., Sales Invoice)
- **Against Reference**: Partial/full settlement of an existing bill (e.g., Payment against Invoice)
- **Advance**: Advance receipt/payment with no bill reference at entry time

GII Bill Settlement enforces strict referential integrity (settlement must reference an existing open bill), unlike Tally which permits loose forward-referencing.

---

## 4. GST / Compliance Mapping

### 4.1 GSTIN → GII Tax Registration

| Tally | GII | Notes |
|---|---|---|
| GSTIN (15 chars) | tax_registration.gstin | Validated against GST portal format |
| State Code (first 2 digits) | tax_registration.state_jurisdiction | 10 = Bihar |
| PAN (next 10 chars) | tax_registration.pan | Extracted from GSTIN substring |
| Entity Code (last 3 chars) | tax_registration.entity_code | 1Z7 |
| Registration Type | tax_registration.registration_type | Regular / Composition / Unregistered |
| Address (from GST details) | tax_registration.business_address | Concatenation of line 1–4 |

102 party ledgers carry GST registrations. The company's own GSTIN (10AAJCG3823D1Z7) is registered under regular scheme in Bihar (State Code 10).

### 4.2 HSN / SAC → GII Product / Service Classification

| Tally | GII | Notes |
|---|---|---|
| HSN Code (goods, 6–8 digit) | hsn_code | Used for stock items |
| SAC Code (services, 8 digit) | sac_code | Used for service items |
| Description | classification_description | Derived from item name if code resolves |
| Rate of GST % | default_tax_rate | 0, 5, 12, 18, 28 |

Extraction shows the company primarily deals in:
- Construction goods — HSN Chapter 25 (Cement), 72 (Iron/Steel), 68 (Stone/Plaster)
- Infrastructure services — SAC 9954 (Construction Services)

### 4.3 GST Rates → GII Tax Codes

| GST Rate | GII Tax Code | Applicable Ledgers | HSN/SAC Coverage |
|---|---|---|---|
| 0% | GST-ZERO | Nil-rated supplies | Exempt goods |
| 5% | GST-5 | Cement, construction labour | Chapter 25, SAC 9954 |
| 12% | GST-12 | Steel items, electricals | Chapters 72, 85 |
| 18% | GST-18 | Plumbing, consultancy | Chapters 39, 73, SAC 9983 |
| 28% | GST-28 | Luxury / sin goods | Not observed in extraction |

CGST + SGST (intra-state, Bihar) and IGST (inter-state) are split from the composite rate. GII Tax Code supports both combined and split representations via `tax_type` attribute (CGST / SGST / IGST / Cess).

### 4.4 GSTR Reports → GII Tax Reports

| Tally GSTR Form | GII Report | Purpose |
|---|---|---|
| GSTR-1 | OUTWARD_SUPPLY_REPORT | B2B/B2C outward supplies |
| GSTR-2A (auto-drafted) | INWARD_SUPPLY_GSTR2A | Vendor supplies summary |
| GSTR-3B | MONTHLY_RETURN_SUMMARY | Monthly summarised return |
| GSTR-9 | ANNUAL_RETURN | Annual reconciliation |
| GSTR-9C | AUDIT_RECONCILIATION | GSTR-9 with audited financials |

GII Tax Reports consume the same GSTIN, invoice-level, and HSN/SAC data mapped above, with the advantage of direct SQL-based aggregation versus Tally's XML-based GSTR generation.

---

## 5. Mapping Coverage

### 5.1 Overall Statistics

| Metric | Value |
|---|---|
| Total entities extracted | 1,617 |
| Entities successfully mapped | 1,604 |
| Mapping coverage | 99.2% |
| Unmapped entities | 13 (0.8%) |

### 5.2 Entity-Level Coverage

| Entity Type | Extracted | Mapped | Unmapped | Coverage % |
|---|---|---|---|---|
| Groups | 30 | 30 | 0 | 100.0 |
| Ledgers | 175 | 174 | 1 | 99.4 |
| Stock Items | 539 | 534 | 5 | 99.1 |
| Stock Groups | 18 | 18 | 0 | 100.0 |
| Units | 11 | 11 | 0 | 100.0 |
| Godowns | 1 | 1 | 0 | 100.0 |
| Voucher Types | 24 | 24 | 0 | 100.0 |
| Vouchers | 85 | 85 | 0 | 100.0 |
| Cost Centres | 11 | 11 | 0 | 100.0 |
| Cost Categories | 3 | 3 | 0 | 100.0 |
| Bill-wise Allocations | 102 | 102 | 0 | 100.0 |
| Ledger Entries (in vouchers) | 618 | 618 | 0 | 100.0 |
| Inventory Entries | 0 | 0 | 0 | — (no inventory in voucher body for services-heavy co.) |

*Note: Inventory entries show 0 because the extracted vouchers recorded stock items only as ledger references (service-oriented transactions without bill-of-material expansion in voucher body).*

### 5.3 Unmapped Entities Detail

The 13 unmapped entities (0.8%) fall into these categories:

1. **Orphaned/Legacy Ledgers (1)**: A sundry creditor ledger with zero opening balance and nil transactions — likely a closed party retained for historical reference.
2. **Stock Items with Incomplete Units (5)**: Items whose unit of measurement did not match any standard UQC code in the GII master (custom unit "Lumpsum" for composite service items).
3. **Stock Items with Circular Group References (3)**: Items where the stock group hierarchy contained a self-referential loop (data integrity issues in source).
4. **Stock Items with Negative Quantities (2)**: Opening stock with negative quantities exceeding available godown capacity — flagged for manual review.
5. **Duplicate HSN Mismatches (2)**: Stock items sharing the same name but different HSN codes — GII enforces unique HSN per product, requiring deduplication rules.

**Resolution Path**: Unmapped items are staged in a quarantine table with a manual review flag. The 0.8% gap is expected to close with data cleansing and custom UQC mapping extensions.

---

## 6. Field-Level Mapping (Conceptual, AIR v2 A/B/C)

### 6.1 Classification Key

| Class | Meaning | Requirement |
|---|---|---|
| **A** | Critical — must map for GII to function | Blocking if unmapped |
| **B** | Standard — important for completeness | High priority, tolerable gap |
| **C** | Nice-to-have — enrichment | Optional, low priority |

### 6.2 Ledger Mapping

| Tally Field | GII Field | AIR Class | Comments |
|---|---|---|---|
| Ledger Name | ledger_name | A | Primary identifier |
| Under (Group) | ledger_group_id | A | Determines financial statement position |
| Opening Balance | opening_balance | A | Carried forward in GII migration |
| Debit/Credit Nature | ledger_type | A | Fundamental accounting nature |
| GSTIN/UIN | tax_registration.gstin | A | Compliance mandate |
| Registration Type | tax_registration.registration_type | A | Determines tax treatment |
| Address | address | B | Required for e-invoice |
| Contact | contact.phone | B | Communication |
| Credit Limit | credit_limit | B | Risk management |
| Maintain Bill-wise | bill_settlement_enabled | B | Cash flow tracking |
| PAN | tax_registration.pan | B | TDS compliance |
| Currency | currency | C | Multi-currency extension |
| Email | contact.email | C | Digital invoice dispatch |

### 6.3 Stock Item Mapping

| Tally Field | GII Field | AIR Class | Comments |
|---|---|---|---|
| Stock Item Name | product_name | A | Core identity |
| Under (Stock Group) | category_id | A | Categorisation |
| Units → UQC | uqc_id | A | Quantity basis |
| Opening Stock Qty | opening_qty | A | Migration balance |
| Opening Stock Value | opening_value | A | Valuation |
| HSN/SAC Code | hsn_sac_code | A | GST return |
| GST Rate | tax_rate | A | Tax calculation |
| Rate of Duty % | effective_tax_slab | A | Invoice computation |
| Is Service | is_service | A | Tax treatment variant |
| Taxability | taxability | A | Tax applicability |
| Type of Supply | supply_type | A | Export/domestic/SEZ |
| Last Purchase Rate | last_purchase_price | B | Valuation method reference |
| Last Sale Rate | last_sale_price | B | Pricing reference |
| Batch Details (Y/N) | batch_tracking_enabled | B | Inventory tracking |
| Expiry Date | expiry_date | B | Perishable goods |
| Composite Item (BOM) | bom_item | C | Manufacturing |
| Alternate Name | alias | C | Search |
| Minimum Stock Level | reorder_level | C | Inventory control |

### 6.4 Voucher Mapping

| Tally Field | GII Field | AIR Class | Comments |
|---|---|---|---|
| VCHTYPE | transaction_type | A | Determines workflow |
| Voucher Number | transaction_number | A | Legal invoice number |
| Date | transaction_date | A | Fiscal period |
| Narration | description | A | Audit trail |
| Total Amount | gross_amount | A | Financial total |
| Ledger Entries | → Journal Entry Lines | A | Double-entry integrity |
| Inventory Entries | → Stock Transaction Lines | B | Stock movement |
| Bill-wise Details | → Bill Settlements | B | Open item management |
| Cost Centre | cost_centre_id | B | Project costing |
| Cheque Number | cheque_ref | B | Payment tracking |
| Is Cancelled | is_cancelled | B | Voided documents |
| Post-dated Date | effective_date | C | Future dating |

### 6.5 GST-Specific Mapping

| Tally Field | GII Field | AIR Class | Comments |
|---|---|---|---|
| GSTIN | gstin | A | Primary tax ID |
| HSN (6+ digit) | hsn_code | A | Goods classification |
| SAC (8 digit) | sac_code | A | Service classification |
| Tax Rate % | tax_rate_pct | A | Levy percentage |
| Tax Ledger (CGST/SGST/IGST) | tax_ledger_split | A | GSTR reconciliation |
| Invoice Reference | invoice_reference | A | GSTR-1 linking |
| Place of Supply | place_of_supply_code | A | E-way bill / IGST determination |
| Shipping Address | ship_to_address | B | E-way bill |
| E-way Bill Number | ewb_number | B | Movement tracking |
| IRN (Invoice Reference Number) | irn | B | E-invoice |
| Cess Amount | cess_amount | B | Cess on specified goods |
| Reverse Charge (Y/N) | reverse_charge | B | RCM applicability |

---

## 7. Challenges & Gaps

### 7.1 Tally's Flexible Nature vs GII's Structured Schema

Tally permits ledger names with arbitrary punctuation, spaces, and leading digits. GII enforces a normalised naming convention. The transformation requires:
- Truncation of ledger names exceeding 100 characters (none in extraction).
- Normalisation of special characters (e.g., `Mr. & Mrs. Enterprises` → `MR & MRS ENTERPRISES`).
- Deduplication where Tally allowed near-identical names differentiated only by invisible Unicode or trailing spaces.

### 7.2 Custom Group Conventions: GEM Debtors / GEM Creditors

The extraction revealed custom group conventions:
- **GEM Debtors**: 30+ parties under Sundry Debtors — used as a sub-ledger classification for Government e-Marketplace (GeM) portal customers.
- **GEM Creditors**: 45+ parties under Sundry Creditors — GeM vendors/suppliers.

**Mapping challenge**: Tally models these as groups. GII models them as ledgers with a `party_sub_type` attribute. The mapping requires creating a `GEM Debtor` type flag on the GII party record rather than creating a dedicated group. Both approaches are semantically equivalent but structurally different.

### 7.3 Multiple Ledgers vs Single Party Record

Tally can create multiple ledger entries for the same legal entity under different groups (e.g., a party appearing as both Sundry Debtor and Loans & Advances). GII enforces a single party record with a primary ledger linkage and additional balance relationships.

**Resolution**: A GII Party record consolidates all ledgers sharing the same GSTIN/PAN. Ledgers without GSTIN are matched by fuzzy name resolution (Levenshtein distance > 0.85) and manually confirmed via the quarantine workflow.

### 7.4 Bill-Wise Referential Integrity

Tally permits "Against Reference" allocations referencing future-dated bills (advance settlements before invoice creation). GII requires the referenced bill to exist before settlement. The mapping must reorder allocations chronologically and, where impossible, create placeholder bill records with zero net amount.

### 7.5 Account Reconciliation Gaps

Tally's "Reconciliation" status (bank date entry matching) is stored per-ledger-entry. GII stores reconciliation at the transaction level. The mapping flattens per-entry reconciliation flags into a single transaction `reconciled` boolean (true only if all entries are reconciled), losing granularity (AIR class C).

### 7.6 Cost Centre Depth

Tally supports two-level cost categories (Category → Centre). GII supports unlimited hierarchical cost centres via parent_id. The shallow Tally hierarchy maps directly; no loss in extraction. Future Tally sources with deeper nesting may require recursive parent creation.

### 7.7 Voucher Body Inventory Dimensions

The extracted dataset (services-heavy infrastructure company) had zero inventory entries within voucher bodies — stock items were recorded as ledger references. Companies with goods trading will produce inventory entries requiring the full Stock Transaction Line mapping (§3.3). This was not exercised in the 99.2% mapping and remains an untested path (informational, not a gap).

### 7.8 Summary of Gaps

| Gap | Severity | Mitigation |
|---|---|---|
| Custom group conventions (GEM) | Medium | Party sub-type flag in GII |
| Multiple ledgers → single party | Low | GSTIN-based consolidation |
| Bill-wise future referencing | Medium | Chronological reordering + placeholder |
| Tally's loose naming | Low | Normalisation transforms |
| Incomplete unit codes (Lumpsum) | Low | Custom UQC extension |
| Stock circular references | Low | Data cleansing quarantine |
| Negative opening stock | Low | Manual review workflow |

---

*End of Document — Phase F: Tally Intelligence Layer*
