# Gesture India Infrastructure (GII) Government e-Marketplace (GeM) Enterprise Resource Planning (ERP) Function and Feature Inventory

**System:** Gesture India Infrastructure (GII) Government e-Marketplace (GeM) Enterprise Resource Planning (ERP)

**Evidence date:** 21 August 2026

**Result:** **PASS WITH WARNINGS**

**Production workflow and authorization readiness:** **BLOCKED**

## 1. How to read this inventory

This register distinguishes four kinds of evidence:

1. **Runtime route** — the current `App.jsx` can render the screen.
2. **Backend path** — the preload bridge, Inter-Process Communication (IPC) handler, service and database path are discoverable.
3. **Graph declaration** — Feature Function Graph FF-1 or Workflow Graph WG-1 describes the feature.
4. **Verification** — a current command exercised the relevant static or isolated-data controls.

Documentation or a graph entry alone is not treated as implementation proof.

## 2. Authoritative counts

| Inventory | Count | Meaning |
|---|---:|---|
| FF-1 feature nodes | 50 | 47 Active; 3 Partial |
| FF-1 named function nodes | 15 | High-value functions correlated to features; not every JavaScript function |
| Navigation entries | 172 | Menu appearances across 13 groups |
| Unique navigation keys | 165 | Seven keys intentionally appear in more than one group |
| Runtime-resolvable navigation keys | 164 of 165 | `profit_simulator` is the confirmed unresolved key |
| View-title records | 175 | Includes drill-down and non-menu screens |
| Workflow stages | 18 | All graph-labelled Active; hard runtime enforcement is not connected |
| Generic table-backed modules | 24 | 8 master definitions and 16 transaction definitions |
| Core database tables | 70 | Static unique `CREATE TABLE IF NOT EXISTS` declarations in core schema files |
| Total runtime-created tables | 73 | Includes three account-mapping registry tables |
| Main-process service modules | 33 | Domain services under `src/main/services/` |
| Main IPC handlers | 155 | Desktop main-process entry points |
| Preload invokes | 154 | Renderer-exposed bridge calls |
| Entity picker types | 9 | Controlled searchable entity types |
| Quick-create masters | 9 allowed | Eleven transaction types are explicitly denied quick-create |

## 3. Navigation inventory

| Group | Menu entries | Main capability |
|---|---:|---|
| Dashboard | 1 | Management dashboard |
| Masters | 8 | Company, employee, department, supplier, item, warehouse, expense and bank masters |
| Operations | 39 | Pre-order, Work Order, procurement, billing, documents, installation, Consignee Receipt and Acceptance Certificate and exceptions |
| Inventory | 22 | Inward, outward, reservation, transfer, adjustment, returns, serial/batch, valuation and reports |
| Accounting | 27 | Business vouchers, journals, books, registers, bank import/reconciliation and financial statements |
| Profitability | 5 | Order, department, supplier, employee and simulation views |
| Receivables & Payables | 17 | Party ledgers, allocations, advances, ageing and reconciliation |
| Goods and Services Tax & Tax | 3 | Goods and Services Tax (GST) and Tax Deducted at Source (TDS) registers/summary |
| Financial Control | 11 | Posting, approval, financial year, opening balances, credit terms and audit |
| Reports | 27 | Financial, tax, proposal, bank, closure, allocation and ageing reports |
| Utilities | 8 | Import/export, Tally, health, environment, production readiness and go-live |
| Help & Training | 3 | Help, keyboard shortcuts and Help Assistant |
| Settings | 1 | Application settings |

Seven keys are intentionally duplicated across navigation groups: `warehouses`, `procurement_requirements`, `business_credit_note`, `business_debit_note`, `receipt_allocation_workflow`, `tds_reconciliation` and `gst_tds_reconciliation`.

Three navigation keys lack their own view-title record: `expense_entries`, `payments` and `procurements`. Thirteen title-only keys cover drill-down, documents and safe-mode views.

## 4. FF-1 feature register

| ID | Feature | Status | Current route | Evidence-backed note |
|---|---|---|---|---|
| FEA-01 | ERP Dashboard | Active | `dashboard` | Runtime dashboard; not live-streaming financial state |
| FEA-02 | Masters | Active | `masters` | Eight master modules; individual routes are active |
| FEA-03 | Company Context | Active | `company_selector` | Company context exists; some service paths still permit unsafe fallback behaviour |
| FEA-04 | Government Departments | Active | `government_departments` | Master and entity search path exist |
| FEA-05 | Suppliers | Active | `suppliers` | Master, picker and procurement consumers exist |
| FEA-06 | Items | Active | `items` | Master, picker, stock and billing consumers exist |
| FEA-07 | Banks | Active | `banks` | Master, voucher and reconciliation consumers exist |
| FEA-08 | Warehouses | Active | `warehouses` | Master and inventory contexts exist |
| FEA-09 | Employees | Active | `employees` | Employee master only; payroll is not implemented |
| FEA-10 | Purchase Order / GeM Order | Partial | graph says `purchase_order`; runtime is `purchase_orders` | Manual entry and Work Order conversion exist; no GeM Application Programming Interface (API) |
| FEA-11 | Work Order / Supply Order | Active | `supply_orders` | Operational root; no direct accounting, inventory or GST posting |
| FEA-12 | Procurement Planning | Partial | graph says `procurement_planning`; runtime is `procurement_plans` | Validated planning exists; no automatic supplier purchase order generation |
| FEA-13 | Supplier Purchase Orders | Active in FF-1 | graph says `supplier_purchase_order`; runtime is `procurements` | Semantic mismatch: current screen records supplier invoice/procurement and posts Purchase voucher; no distinct supplier purchase-order tables |
| FEA-14 | Goods Receipt Note | Active | graph says `goods_receipt`; runtime is `grn_report` | Inward/GRN paths exist; graph alternates between `goods_receipts` and `stock_inwards` |
| FEA-15 | Inventory Reservation | Active | graph says `inventory_reservation`; runtime is `stock_reservations` | Auto-reservation exists; no hard Goods Receipt Note prerequisite |
| FEA-16 | Delivery Challan | Active | graph says `delivery_challan`; runtime is `delivery_challans` | Creation and stock outward exist; reservation prerequisite not enforced |
| FEA-17 | Installation | Partial | `installations` | Generic transaction workflow; no mandatory completion checklist |
| FEA-18 | Consignee Receipt and Acceptance Certificate | Active | graph says `crac`; runtime is `crac_management` | Dedicated create/read/update/delete screens; Installation prerequisite and explicit audit call are not enforced |
| FEA-19 | Billing / GST Invoice | Active | graph says `sales_invoices`; runtime is `invoices` | Billing, Sales posting, output GST and receivable creation exist; upstream delivery/acceptance prerequisite not hard-enforced |
| FEA-20 | Bill History | Active | `bill_history` | Graph feature exists; screen coverage is grouped through billing/report routes |
| FEA-21 | Receivables | Active | `receivables` | Posted-invoice subsidiary/report stage exists |
| FEA-22 | Receipts | Active | graph says `receipts`; runtime uses `payments`/receipt voucher | Posting and allocation exist; multi-invoice generic selection is ambiguous |
| FEA-23 | Supplier Payments | Active | `payments` | Voucher and supplier allocation paths exist |
| FEA-24 | Expenses | Active | `expenses`/`expense_entries` | Expense record and voucher paths exist |
| FEA-25 | Business Voucher | Active | `business_voucher`/`voucher_dashboard` | Controlled guided voucher interface exists |
| FEA-26 | Accounting Voucher | Active | `accounting_voucher`/`manual_voucher` | Accountant-controlled journal interface exists |
| FEA-27 | Voucher Dashboard | Active | `voucher_dashboard` | Ten governed business-voucher aliases route here |
| FEA-28 | Opening Balance | Active | `opening_balance`/`opening_balances` | Controlled entry exists; no direct reversal support |
| FEA-29 | Trial Balance | Active | `trial_balance` | Isolated financial checks reconcile |
| FEA-30 | Profit and Loss | Active | `profit_loss` | Isolated financial checks reconcile; grouping cutover remains pending |
| FEA-31 | Balance Sheet | Active | `balance_sheet` | Equation and current-profit checks pass |
| FEA-32 | Ledger Report | Active | `ledger_report`/`ledger_view` | Drill-down retains voucher identifiers |
| FEA-33 | Cash / Bank Book | Active | graph says `cash_bank_book`; runtime has `cash_book`, `bank_book`, `cash_bank_ledger` | No dedicated backend summary builder |
| FEA-34 | GST Reports | Active | `gst_reports` | Runtime routes through financial reports; tax registers exist |
| FEA-35 | TDS Reports | Active | `tds_reports`/`tds_register` | Register/reconciliation paths exist |
| FEA-36 | Stock Ledger | Active | `stock_ledger` | Transactional inventory source exists |
| FEA-37 | Inventory Valuation | Active | graph says `inventory_valuation`; runtime is `stock_valuation` | Weighted-average valuation exists |
| FEA-38 | Profitability Analysis | Active | `profitability_analysis`/`profitability` | Runtime computed report; accessible before Order Closure |
| FEA-39 | Bank Reconciliation | Active | `bank_reconciliation` | Import, match and proposal paths exist |
| FEA-40 | Tally XML Import | Active | graph says `tally_import`; runtime is `tally_xml_import` | Staged import/mapping path exists |
| FEA-41 | Tally Master Migration | Active | graph says `tally_master_migration`; runtime is `tally_migration_assistant` | Large dedicated assistant exists |
| FEA-42 | Spreadsheet Import | Active | `spreadsheet_import`/master-data tools | Validation and controlled import services exist |
| FEA-43 | Spreadsheet Export | Active | `spreadsheet_export`/master-data tools | Export capabilities exist |
| FEA-44 | Browser Fallback API | Active | no menu route | Preview adapter exists and blocks sensitive writes |
| FEA-45 | Help Assistant | Active | `help_assistant` | Runtime-connected; navigation and guidance only |
| FEA-46 | Ask ERP Brain | Active | `assistant_panel` | Source/graph/keyword driven; no Large Language Model (LLM) integration |
| FEA-47 | Backup / Restore | Active | settings/health utilities | Backup and restart-based restore paths exist |
| FEA-48 | Approval Queue | Active | `approval_queue` | Manual queue; no automatic routing |
| FEA-49 | Financial Year Locking | Active | `financial_year_lock`/`financial_years` | Lock, close and continuity controls pass isolated checks |
| FEA-50 | Audit Log | Active | `audit_log` | Audit storage exists; AG-1 event identifiers are not mapped to live rows |

FF-1 has direct navigation-key matches for only 20 of its 50 nodes. Many remaining nodes use aliases or grouped routes. FF-1 also references 11 names that are not runtime table declarations: `bank_reconciliation`, `gst_registers`, `inventory_reservations`, `procurement_plan_items`, `profitability_analysis`, `purchase_invoices`, `purchase_order_items`, `sales_invoices`, `supplier_balances`, `supplier_purchase_orders` and `tds_registers`. Several are concepts, reports or stale names rather than proof of a missing business record.

## 5. FF-1 function register

| ID | Function | Owning feature | Boundary | Current evidence |
|---|---|---|---|---|
| FNC-01 | `createSalesInvoice` | FEA-19 | Accounting-sensitive | Billing and Sales/GST/receivable posting path exists |
| FNC-02 | `postLedgerEntry` | FEA-19 | Accounting-sensitive | Atomic debit/credit ledger path exists |
| FNC-03 | `createReceipt` | FEA-22 | Accounting-sensitive | Receipt and receivable update path exists |
| FNC-04 | `createPayment` | FEA-23 | Accounting-sensitive | Supplier payment path exists |
| FNC-05 | `createJournal` | FEA-26 | Accounting-sensitive | Controlled Journal path exists |
| FNC-06 | `createContra` | FEA-26 | Accounting-sensitive | Cash/bank transfer path exists |
| FNC-07 | `createGuidedVoucher` | FEA-25 | Accounting-sensitive | Guided voucher service/UI exists |
| FNC-08 | `createPurchaseVoucher` | FEA-13 | Accounting-sensitive | Purchase posting exists, but not a distinct supplier purchase-order commitment |
| FNC-09 | `recordGoodsReceipt` | FEA-14 | Inventory-sensitive | Goods inward and valuation path exists |
| FNC-10 | `createDeliveryChallan` | FEA-16 | Inventory-sensitive | Challan and stock-out path exists |
| FNC-11 | `createOpeningBalance` | FEA-28 | Accounting-sensitive | Governed opening-balance path exists |
| FNC-12 | `resolveQuery` | FEA-46 | Read-only guidance | Source-backed resolution exists |
| FNC-13 | `classifyQuery` | FEA-46 | Read-only guidance | Deterministic query classification exists |
| FNC-14 | `backupDatabase` | FEA-47 | Administration-sensitive | Backup and restore services exist |
| FNC-15 | `getReports` | FEA-30 | Accounting-sensitive | Report builders exist; FSR-2B.3 classification cutover remains pending |

## 6. Additional runtime capabilities not adequately represented as FF-1 nodes

- Lead/Tender, Requirement, Quotation and Negotiation are active generic transaction routes but do not have their own FF-1 nodes.
- Order Closure, Payment Readiness, operational exception reports, environment management, go-live history/certification, safe mode, health/support bundle, feedback, keyboard help and training are runtime capabilities but are not each distinct FF-1 features.
- Dashboard drill-down routes, proposal reports, allocation reports, tax reconciliation and many inventory reports are grouped under broader FF-1 features.
- A dedicated Supplier Purchase Order business entity is absent even though WG-1 and FF-1 name that stage.

## 7. Confirmed runtime defects and high-risk boundaries

### 7.1 Unreachable Profit Simulator

`profit_simulator` is present in navigation and `ProfitSimulatorScreen.jsx` exists. Its only render branch is in `config/screenRegistry.jsx`, but the live `App.jsx` does not import or call that registry and has no direct branch for the key. The route is therefore **BLOCKED** despite documentation describing it as implemented.

### 7.2 Authorization boundary

Backend roles exist, but most IPC handlers use the older `guarded()` wrapper, which can derive user identity from renderer-supplied request data. If identity is absent, the permission helper selects the first active administrator. A stronger session-bound wrapper exists but protects only selected paths.

The following high-impact handlers are currently registered without a permission wrapper: environment profile/type changes, go-live execution/completion/rollback, certificate generation, reset execution, enhanced reset and reset rollback. This does not prove external exploitation, but it is enough to block production authorization readiness.

### 7.3 Company and document-chain boundaries

- `supply_order` entity search is not company-scoped.
- Billing can fall back to the first company without proving the selected Work Order belongs to that company.
- Supplier Purchase Order, Goods Receipt Note, reservation, challan, installation, acceptance and billing prerequisites are not universally hard-enforced.
- Order Closure uses a permissive checklist and does not prove complete settlement.

## 8. Service inventory

The 33 services group as follows:

- **Accounting and control:** accounting, account mapping, bank reconciliation, billing, certification, desktop session, payment readiness and readiness.
- **Operations and inventory:** operational planning, operations, inventory, Consignee Receipt and Acceptance Certificate, order closure and operational reset.
- **Identity and audit:** authentication and audit dependencies embedded across services.
- **Data movement:** import parser, import validation, master-data tools, Tally import and rollback.
- **Recovery and release:** backup, health, support bundle, production readiness, go-live, go-live history and go-live verification.
- **Documents and user support:** document, entity search and feedback.

## 9. Recommended corrective order

1. Session-bind all high-impact and write IPC handlers; add explicit authorization to environment, go-live, reset and certificate operations.
2. Fix company-context enforcement and make the Work Order relationship explicit at billing and destructive boundaries.
3. Create a governed Supplier Purchase Order entity or rename/reconcile the current supplier-invoice semantics before claiming full lifecycle parity.
4. Implement hard workflow prerequisites in staged WG-3 phases only after compatibility testing.
5. Repair the Profit Simulator route and duplicate/unreferenced screen registry paths.
6. Reconcile FF-1 aliases, table names and missing current features, then expand verification to compare FF-1 against live navigation and table declarations.

No corrective action is authorized by this inventory.
