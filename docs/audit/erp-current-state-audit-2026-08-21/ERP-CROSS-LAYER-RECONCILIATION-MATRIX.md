# Gesture India Infrastructure (GII) Government e-Marketplace (GeM) Enterprise Resource Planning (ERP) Cross-Layer Reconciliation Matrix

**System:** Gesture India Infrastructure (GII) Government e-Marketplace (GeM) Enterprise Resource Planning (ERP)

**Evidence date:** 21 August 2026

**Result:** **PASS WITH WARNINGS**

**Purpose:** Compare business rules, navigation, screens, desktop bridge, services, database, reports, graphs and verification.

**Graph identifier key:** Feature Function Graph (FF), Workflow Graph (WG), Renderer Graph (RG), Database Graph (DG), Knowledge Graph (KG) and Audit Graph (AG).

## 1. Operational-chain matrix

All 18 Workflow Graph (WG-1) nodes are labelled Active and all declared routes/screen files exist. “Active” below means a usable source path exists; it does not mean the transition is hard-enforced.

| # | Business stage | Runtime route | Main table/source | Accounting / inventory / tax impact | Current implementation | Cross-layer reconciliation |
|---:|---|---|---|---|---|---|
| 1 | Lead / Tender | `leads` | `leads` | None | PASS | Generic create/read/update/delete (CRUD); FF-1 lacks a dedicated node |
| 2 | Query / Requirement | `requirement_queries` | `requirement_queries` | None | PASS WITH WARNINGS | Lead linkage is a numeric reference; no dedicated lead picker |
| 3 | Quotation | `quotations` | `quotations` | None | PASS WITH WARNINGS | Requirement linkage is numeric; FF-1 lacks a dedicated node |
| 4 | Negotiation | `negotiations` | `negotiations` | None | PASS WITH WARNINGS | Quotation linkage is numeric; FF-1 lacks a dedicated node |
| 5 | Purchase Order / GeM Order | `purchase_orders` | `purchase_orders` | None | PASS WITH WARNINGS | Atomic draft Work Order conversion and duplicate/company checks exist; no GeM Application Programming Interface (API) |
| 6 | Work Order / Supply Order | `supply_orders` | `supply_orders`, `order_items` | None | PASS | Operational root is preserved; item validation exists; it does not post ledger, stock or Goods and Services Tax (GST) |
| 7 | Procurement Planning | `procurement_plans` | `procurement_plans` | None | PASS WITH WARNINGS | Company/order/item/warehouse/quantity validation; completed plans lock; no supplier purchase-order generation |
| 8 | Supplier Purchase Order | `procurements` | `procurements` | Purchase accounting begins here in current code | BLOCKED semantically | Current record is a supplier invoice/procurement with value, GST and Purchase posting; no distinct `supplier_purchase_orders`/`purchase_order_items` entity |
| 9 | Goods Receipt / Goods Receipt Note | `grn_report` | `stock_inwards` and receipt paths | Inventory | PASS WITH WARNINGS | Graph/data model alternates between `goods_receipts` and `stock_inwards`; predecessor not universally enforced |
| 10 | Inventory Reservation | `stock_reservations` | `stock_reservations` | Inventory | PASS WITH WARNINGS | Auto-reservation exists; no hard Goods Receipt Note prerequisite |
| 11 | Delivery Challan | `delivery_challans` | `delivery_challans` | Inventory outward | PASS WITH WARNINGS | Creation/confirmation work; no hard reservation prerequisite or explicit order/company equality check |
| 12 | Installation | `installations` | `installations` | None | PASS WITH WARNINGS | Generic CRUD; no hard challan prerequisite or mandatory completion checklist |
| 13 | Consignee Receipt and Acceptance Certificate | `crac_management` | `crac_records` | None | PASS WITH WARNINGS | Dedicated screens/service; no Installation prerequisite; create/update/delete has no explicit audit-log call |
| 14 | Sales / GST Invoice | `invoices` | `invoices`, invoice lines, ledger, receivable, GST sources | Accounting, inventory and GST | PASS WITH WARNINGS | Posting works; acceptance/delivery prerequisite and selected-company equality are not hard-enforced |
| 15 | Department Receivable | `receivables` | `receivables` | Accounting subsidiary | PASS | Generated/refreshed from posted invoice; remains downstream, not root |
| 16 | Receipt | `payments` and receipt voucher | `payments`, vouchers, ledger, allocations | Accounting | PASS WITH WARNINGS | Receipt/allocation work; generic path can select first invoice for an order, ambiguous with multiple invoices |
| 17 | Order Closure | `order_closure_tracking` | computed from `supply_orders` and related records | None | PASS WITH WARNINGS | Checklist is permissive, “No Outstanding Issues” is hard-coded true and full settlement is not proved |
| 18 | Profitability Analysis | `profitability` | computed from order, billing, cost and ledger sources | Read-only analysis | PASS WITH WARNINGS | Report works but is accessible before closure; closure dependency not enforced |

## 2. Approved sequence versus runtime enforcement

| Control | Graph/rule | Runtime source | Verification | Reconciled state |
|---|---|---|---|---|
| Work Order is operational root | Rule 29, WG-1, KG-4, FF-1 | Supply Order services/forms | WG-1 21/21; accounting suites pass | PASS |
| Work Order has no accounting impact | WG-1 and KG-4 | No ledger posting in Work Order CRUD | Graph and accounting verification | PASS |
| Eighteen-stage order | Rule 28 and WG-1 | `workflowStageEngine.js` order array | 62/62 foundation checks | PASS as metadata |
| Required transitions | WG-1 edges | Warning evaluator | Foundation test certifies warnings | BLOCKED as hard control |
| Current record stage | WG-3 foundation | `checkCurrentStage()` placeholder | Test confirms deferral | BLOCKED |
| Runtime use of workflow engine | WG-3 foundation | No application importer found | Static source search | BLOCKED |
| Optional-stage skip rules | WG-1 | Descriptive warnings | Graph verification | PASS WITH WARNINGS |
| Order Closure lock | WG-1 | Permissive checklist | No full-settlement certification | BLOCKED |

The approved chain is architecturally present but operationally advisory. A passing workflow verifier must not be presented as proof that the desktop prevents stage skipping.

## 3. Navigation, screen and graph matrix

| Reconciliation | Count/result | Finding |
|---|---:|---|
| Navigation entries | 172 | Menu appearances |
| Unique navigation keys | 165 | Seven keys appear in multiple groups |
| Live `App.jsx`-resolvable keys | 164 | One confirmed gap |
| View titles | 175 | Includes drill-down and non-menu screens |
| RG-1 discovered routes | 114 | Generator coverage is narrower than live navigation |
| FF-1 features | 50 | Direct navigation-key match for only 20; many aliases/grouped capabilities |
| Graph screens | 41 | Source files exist |

Confirmed route defect:

- `profit_simulator` is in navigation and has `ProfitSimulatorScreen.jsx`.
- Its only render branch is in `config/screenRegistry.jsx`.
- The live `App.jsx` neither imports that screen nor calls the modular registry.
- Result: **BLOCKED/unreachable**.

Navigation duplicates are `warehouses`, `procurement_requirements`, `business_credit_note`, `business_debit_note`, `receipt_allocation_workflow`, `tds_reconciliation` and `gst_tds_reconciliation`. These are cross-entry points, not identifier collisions.

## 4. Renderer -> Inter-Process Communication (IPC) -> service -> database matrix

| Domain | Renderer evidence | Preload/main evidence | Service/database evidence | Current state |
|---|---|---|---|---|
| Masters | Generic master screens and pickers | Generic record and search channels | CRUD helpers, entity search, 8 master definitions | PASS |
| Pre-order | Transaction screens | Generic record channels | 5 transaction tables and planning conversion service | PASS WITH WARNINGS |
| Work Order | Supply Order form/screens | Record/operation channels | CRUD ownership and operations services | PASS |
| Procurement/purchase | Transaction and voucher screens | Record/accounting channels | Procurement records and Purchase posting | PASS WITH WARNINGS; semantically misnamed as Supplier PO |
| Inventory | Inventory screens/reports | Inventory IPC family | Inventory service, stock ledger and movements | PASS |
| Billing | Billing Voucher screen | Billing/accounting IPC family | Billing and accounting services | PASS WITH WARNINGS for company/prerequisite boundaries |
| Receipts/allocations | Voucher and allocation screens | Accounting/allocation channels | Accounting and operations services | PASS WITH WARNINGS for multi-invoice allocation |
| Accounting reports | Accounting/Summary screens | Reporting channels | SQL report builders and ledger sources | BLOCKED by FSR-2B.3 classification checks |
| Documents | Document screens | Document channels | Document service and storage | PASS |
| Help/ERP Brain | Help Assistant | Primarily renderer-side knowledge | BRAIN/graph/manual loaders | PASS; read-only |
| Backup/restore | Settings/health | Backup channels | Backup service and restart restore | PASS WITH WARNINGS; authorization hardening required |
| Go-live/reset | Environment/go-live screens | Direct IPC handlers | Go-live/reset services | BLOCKED for production authorization |

## 5. IPC contract matrix

| Measure | Result |
|---|---:|
| Main handler channels | 155 |
| Preload invoke channels | 154 |
| Main-only | `imports:rollback-preview` |
| Preload-only | None |

The one main-only channel is an undocumented internal/unfinished surface. It is not proof of a user-facing failure because no renderer consumer was established.

## 6. Authorization matrix

| Handler class | Current wrapper | Risk state |
|---|---|---|
| Many ordinary writes | Legacy `guarded()` | WARN: identity can come from request context; missing context falls back to first active administrator |
| Account mapping and selected sensitive paths | `sessionGuarded()` | PASS for those paths |
| Environment profile/type changes | No explicit permission wrapper | BLOCKED |
| Go-live execute/verify/complete/rollback | No explicit permission wrapper | BLOCKED |
| Certificate generation | No explicit permission wrapper | BLOCKED |
| Reset execute/enhanced/rollback | No explicit permission wrapper | BLOCKED |

This matrix is a source-level authorization finding. No exploit attempt was made and no production data was touched.

## 7. Database and graph-name reconciliation

| Measure | Count/result |
|---|---:|
| Core runtime tables | 70 |
| Account-mapping extension | 3 |
| Total runtime-created tables | 73 |
| DG-1 table count | 73 |
| FF-1 unique table references | 37 |
| FF-1 references without matching table declaration | 11 |

FF-1 unmatched names:

`bank_reconciliation`, `gst_registers`, `inventory_reservations`, `procurement_plan_items`, `profitability_analysis`, `purchase_invoices`, `purchase_order_items`, `sales_invoices`, `supplier_balances`, `supplier_purchase_orders`, `tds_registers`.

Some are report/concept aliases, but `supplier_purchase_orders` and `purchase_order_items` expose a genuine lifecycle data-model mismatch.

## 8. Graph-to-runtime matrix

| Graph | Registry | Schema/validator | Runtime importer | Reconciled state |
|---|---|---|---|---|
| BRAIN-1 | Active | PASS; fresh 224 entries | Yes | PASS WITH WARNINGS; registry count stale |
| KG-1 | Active | 167 entries PASS | No renderer importer found | PASS WITH WARNINGS; architecture asset not app-runtime-connected |
| RG-1 | Active | Unified audit PASS | Yes | PASS WITH WARNINGS; route/version/graph-count metadata drift |
| DG-1 | Active | 32/32 PASS | Yes | PASS WITH WARNINGS |
| WG-1 | Active | 21/21 PASS | Graph loaded; enforcement engine unused | PASS WITH WARNINGS; descriptive/advisory |
| KG-4 | Active | PASS | Yes | PASS WITH WARNINGS |
| FF-1 | Active | 31/31 PASS | Yes | PASS WITH WARNINGS; alias/table/future-text drift |
| AG-1 | Active | 27/27 PASS | No | PASS WITH WARNINGS; live mapping pending |
| KG-5 | Active plus stale Planned row | 30/30 PASS | No | BLOCKED registry consistency; runtime consumption pending |

## 9. Financial reporting matrix

| Control | Fresh result | Reconciled state |
|---|---|---|
| Trial Balance equality | PASS | Reliable on isolated fixture |
| Profit and Loss parity | PASS | Reliable on isolated fixture |
| Balance Sheet equation | PASS | Reliable on isolated fixture |
| Draft/cancel exclusion | PASS | Controlled |
| Company isolation | PASS | Controlled in tested accounting paths |
| Voucher-to-ledger trace | PASS | Drill-down retains voucher IDs |
| Group totals equal ledger totals through governed registry | FAIL | FSR-2B.3 pending |
| Renderer avoids name-based classification | FAIL | FSR-2B.3 pending |

The failure is classification architecture, not a demonstrated debit/credit imbalance.

## 10. Reconciliation verdict

| Area | Result |
|---|---|
| Work Order origination principle | PASS |
| Source implementation breadth | PASS WITH WARNINGS |
| Accounting and inventory integrity on isolated data | PASS |
| Financial classification governance | BLOCKED |
| Hard operational-stage enforcement | BLOCKED |
| Destructive-operation authorization | BLOCKED |
| Graph schema/reference validation | PASS |
| Graph roadmap/registry consistency | BLOCKED |
| Evidence reproducibility from Git | BLOCKED |
| Production readiness | BLOCKED |

No source, database, graph, registry, governance document or existing report was changed during this reconciliation.
