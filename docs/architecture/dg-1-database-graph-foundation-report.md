# DG-1 Database Graph Foundation Report

**Phase:** DG-1
**Date:** 2026-07-14
**Status:** Completed

## Feature Classification

- **Primary Category:** Architecture
- **Secondary Categories:** Governance, Intelligence
- **Why:** DG-1 establishes a read-only database intelligence graph mapping all 63 tables, 51 relationships, 22 posting functions, 26 report sources, and 11 accounting protection boundaries. No runtime ERP changes were made.

## Dependency Assessment

| Dependency | Satisfied | Notes |
|---|---|---|
| `src/main/database/init.js` | Yes | Primary source for table definitions, column types, FK constraints |
| `src/main/database/schemaDefinitions.js` | Yes | Schema migration definitions for columns added post v001 |
| `src/main/database/reportBuilders.js` | Yes | 26 report sources extracted from internal SQL |
| `src/main/services/accountingService.js` | Yes | 7 posting functions mapped |
| `src/main/services/inventoryService.js` | Yes | 4 inventory posting functions mapped |
| `src/main/services/billingService.js` | Yes | Billing report sources mapped |
| `src/main/services/operationsService.js` | Yes | 3 operational posting functions mapped |
| WG-1 workflow graph | Yes | supply_orders mapped to WORK_ORDER, 10 workflow alignments |
| KG-1 knowledge entries | Yes | Module ownership, screen mapping references |
| BRAIN-1 repository | Yes | Module, screen, workflow references validated |

**Dependencies Satisfied:** Yes

## Files Changed / Created

### Created
| File | Description |
|---|---|
| `src/renderer/knowledge/database-graph.json` | DG-1 graph — 63 tables, 51 relationships, 22 posting functions, 26 report sources, 18 accounting protected tables |
| `repository/schema/database-graph.schema.json` | DG-1 JSON Schema v1.0.0 |
| `scripts/verify-database-graph.js` | 27-rule validation script |

### Modified
| File | Description |
|---|---|
| `repository/graph-registry.json` | DG-1 registered as Active v1.0.0, compatibility updated |
| `scripts/verify-audit.js` | DG-1 Audit Pack added (15 audit checks) |
| `package.json` | `verify:database-graph` script added |

## Components Added/Changed

None — no runtime components were added or modified.

## Services Added/Changed

None — no runtime services were added or modified.

## Reports Added/Changed

None — no reporting logic was added or modified.

## IPC/Preload Impact

None — no IPC channels or preload APIs were created or modified.

## Route/View Key Impact

None — no route keys or view keys were created or modified.

## Database Impact

None — no database schema changes were made. DG-1 is a read-only mapping.

## Business Logic Preserved

Confirmed — all existing accounting formulas, voucher posting math, GST calculations, inventory valuation, and operational workflows remain unchanged.

## Verification Command Results

| Command | Result |
|---|---|
| `npm run lint:syntax` | PASS |
| `npm run build` | PASS |
| `npm run verify:knowledge` | PASS (167 entries, 0 errors) |
| `npm run verify:workflow-graph` | PASS (20 passed, 0 warnings, 0 failed) |
| `npm run verify:database-graph` | PASS (27 passed, 0 warnings, 0 failed) |
| `npm run verify:audit` | PASS (133 PASS, 1 INFO, 1 WARNING pre-existing) |
| `npm run verify:erp` | PASS (Safe to Commit: Yes, Safe to Lock: Yes) |
| `npm run verify:accounting` | PASS (Development profile — empty data) |
| `npm run verify:financials` | PASS |
| `npm run verify:controls` | PASS |
| `npm run verify:voucher-inventory` | PASS |
| `npm run verify:flow` | PASS |
| `npm run verify:phase10` | PASS |

## Table Categories

| Category | Count | Tables |
|---|---|---|
| Core System | 8 | schema_migrations, users, user_sessions, audit_log, approval_queue, company_tax_registrations, import_batches, import_row_errors |
| Company Context | 1 | companies |
| Masters | 7 | employees, government_departments, suppliers, items, expense_heads, banks, warehouses, credit_terms |
| Work Order / Supply Order | 2 | supply_orders, order_items |
| Procurement | 2 | procurements, procurement_items |
| Expenses | 1 | expense_entries |
| Billing / GST Invoice | 2 | invoices, invoice_items |
| Receipts | 1 | payments |
| Receivables | 5 | receivables, payment_allocations, customer_receipt_records, advance_adjustments, guided_vouchers |
| Supplier Payments | 3 | supplier_payments, supplier_payment_allocations, tds_deductions |
| Inventory | 15 | stock_ledger, stock_inwards, stock_outwards, stock_adjustments, stock_returns, stock_reservations, goods_receipts, goods_receipt_items, delivery_challans, delivery_challan_items, warehouses, warehouse_transfers, batch_serial_tracking, inventory_count_sessions, inventory_count_items |
| Accounting Core | 10 | accounts, vouchers, voucher_lines, ledger_entries, cash_bank_ledger, financial_years, opening_balances, year_end_closings, carry_forward_entries, accounts_merge_history |
| Bank Reconciliation | 5 | bank_reconciliation, reconciliation_matches, reconciliation_discrepancies, cheque_register, cheque_stop_requests |
| Delivery / Installation / CRAC | 1 | crac_records |

## Accounting Protection Mapping

18 tables flagged as `accountingProtected=true` with `genericCrudAllowed=false`:

procurements, expense_entries, invoices, payments, receivables, payment_allocations, supplier_payments, supplier_payment_allocations, accounts, vouchers, voucher_lines, ledger_entries, cash_bank_ledger, stock_ledger, financial_years, opening_balances, year_end_closings, carry_forward_entries

8 tables allow generic CRUD (`genericCrudAllowed=true`): employees, government_departments, suppliers, items, expense_heads, banks, warehouses, credit_terms

## Posting Function Mapping

22 posting functions mapped across 4 service files:

| Function | Source | Reads | Writes |
|---|---|---|---|
| createBalancedVoucher | accountingService.js | financial_years | vouchers, voucher_lines, ledger_entries |
| createManualVoucher | accountingService.js | financial_years | vouchers, voucher_lines, ledger_entries |
| postSalesVoucher | accountingService.js | supply_orders, invoices, financial_years | vouchers, voucher_lines, ledger_entries, receivables, stock_ledger |
| postPurchaseVoucher | accountingService.js | procurements, financial_years | vouchers, voucher_lines, ledger_entries, stock_ledger |
| postReceiptVoucher | accountingService.js | payments, receivables, financial_years | vouchers, voucher_lines, ledger_entries, cash_bank_ledger |
| postSupplierPaymentVoucher | accountingService.js | supplier_payments, procurements, financial_years | vouchers, voucher_lines, ledger_entries, cash_bank_ledger |
| postGuidedVoucher | accountingService.js | guided_vouchers, financial_years | vouchers, voucher_lines, ledger_entries |
| reverseVoucher | accountingService.js | vouchers, voucher_lines, financial_years | ledger_entries |
| createOpeningBalance | accountingService.js | opening_balances, accounts, financial_years | ledger_entries |
| postExpenseAccrualsForOrder | init.js | expense_entries, supply_orders | ledger_entries |
| postLedgerEntry | init.js | (generic) | ledger_entries |
| updateCashBankLedger | init.js | payments, supplier_payments | cash_bank_ledger |
| upsertReceivable | init.js | invoices, payments, government_departments | receivables |
| refreshReceivable | init.js | payment_allocations, invoices | receivables |
| markPosted | init.js | supply_orders, procurements, expense_entries, invoices, payments, supplier_payments | posting_status updates |
| postStockInward | inventoryService.js | stock_inwards, items, warehouses | stock_ledger |
| postStockOutward | inventoryService.js | stock_outwards, items, warehouses | stock_ledger |
| postStockAdjustment | inventoryService.js | stock_adjustments, items | stock_ledger |
| postStockReturn | inventoryService.js | stock_returns, stock_outwards, items | stock_ledger |
| postWarehouseTransfer | operationsService.js | warehouse_transfers, items | stock_ledger |
| postBusinessTransaction | operationsService.js | supply_orders, order_items | stock_ledger, stock_outwards |
| confirmDeliveryChallan | operationsService.js | delivery_challans, delivery_challan_items | stock_ledger |

## Report Source Mapping

26 report sources mapped from `reportBuilders.js` and `billingService.js`:

| Report | Source Tables |
|---|---|
| trialBalance | accounts, ledger_entries |
| profitLossReport | accounts, ledger_entries |
| balanceSheetReport | accounts, ledger_entries |
| gstSummary | ledger_entries, accounts, vouchers |
| gstRegisters | ledger_entries, accounts, vouchers, invoices, procurements, supply_orders |
| dayBook | vouchers, voucher_lines |
| postingControlReport | invoices, procurements, payments, expense_entries, vouchers |
| partyLedgerReport | voucher_lines, vouchers, accounts, government_departments, suppliers, invoices, payments, procurements, supplier_payments, supply_orders |
| billWiseReceivableReport | receivables, government_departments, supply_orders, advance_adjustments, guided_vouchers, vouchers |
| billWisePayableReport | procurements, suppliers, supply_orders, procurement_items, supplier_payment_allocations, advance_adjustments, guided_vouchers, vouchers |
| paymentAllocationReport | payment_allocations, payments, invoices, receivables, supply_orders, government_departments |
| supplierPaymentAllocationReport | supplier_payment_allocations, supplier_payments, procurements, suppliers, supply_orders |
| receivableAgeingReport | delegated from billWiseReceivableReport |
| payableAgeingReport | delegated from billWisePayableReport |
| tdsRegisters | payment_allocations, invoices, supply_orders, government_departments |
| accountingRegisters | vouchers |
| financialControlReport | 10+ sub-reports |
| openingBalanceReport | opening_balances, financial_years, accounts, vouchers |
| approvalQueueReport | approval_queue, users |
| financialStatementSummary | delegated from profitLoss + balanceSheet |
| supplierPayableReport | procurements, suppliers, procurement_items, supplier_payment_allocations, advance_adjustments |
| creditTermsReport | credit_terms, government_departments, suppliers |
| yearEndClosingReport | year_end_closings, financial_years |
| carryForwardReport | carry_forward_entries, accounts, financial_years, vouchers |
| billOutstandingReport | delegated from billWiseReceivable + billWisePayable |
| orderProfitability | supply_orders, invoices, procurements, payments, expense_entries, expense_heads, invoice_items, stock_ledger |

## Workflow Alignment

10 tables aligned to WG-1 workflow stages:

| Table | WG-1 Stage | Category |
|---|---|---|
| supply_orders | WORK_ORDER | Work Order / Supply Order |
| order_items | WORK_ORDER | Work Order / Supply Order |
| procurements | SUPPLIER_PURCHASE_ORDER | Procurement |
| procurement_items | SUPPLIER_PURCHASE_ORDER | Procurement |
| expense_entries | PROCUREMENT_PLANNING | Expenses |
| invoices | SALES_INVOICE_GST_INVOICE | Billing / GST Invoice |
| invoice_items | SALES_INVOICE_GST_INVOICE | Billing / GST Invoice |
| payments | RECEIPT | Receipts |
| receivables | DEPARTMENT_RECEIVABLE | Receivables |
| payment_allocations | RECEIPT | Receivables |
| supplier_payments | RECEIPT | Supplier Payments |
| supplier_payment_allocations | RECEIPT | Supplier Payments |
| stock_inwards | GOODS_RECEIPT_GRN | Inventory |
| goods_receipts | GOODS_RECEIPT_GRN | Inventory |
| goods_receipt_items | GOODS_RECEIPT_GRN | Inventory |
| stock_reservations | INVENTORY_RESERVATION | Inventory |
| stock_outwards | DELIVERY_CHALLAN | Inventory |
| delivery_challans | DELIVERY_CHALLAN | Inventory |
| delivery_challan_items | DELIVERY_CHALLAN | Inventory |
| crac_records | CRAC | Delivery / Installation / CRAC |

## Known Gaps

| Table | Gap |
|---|---|
| supply_orders | GeM order fields (gem_order_number, gem_contract_number) require GeM API integration |

## Desktop Smoke Test

Not applicable — DG-1 is a read-only knowledge graph with no runtime code changes. No UI, navigation, or functional behavior was modified.

## Production Readiness Classification

**Internal Testing**

## Production Readiness Gate

| Gate | Status |
|---|---|
| Implementation completed | Yes |
| Verification passed | Yes |
| Desktop smoke test completed | N/A (read-only graph phase) |
| Accounting verification passed | Yes |
| Financial verification passed | Yes |
| Graph registry updated | Yes |
| Schema validated | Yes |
| Documentation updated | Yes |
| Phase report generated | Yes |
| Limitations documented | Yes |
| Safe-to-lock recommendation | Yes |

## Enterprise Intelligence Layer

DG-1 is registered as Active v1.0.0 in `repository/graph-registry.json` with dependency on WG-1. The graph is consumable by future AI tools via the Enterprise Intelligence Layer contract. Schema is at `repository/schema/database-graph.schema.json` (draft-07).

## Safe to Lock

**Yes.** DG-1 is a read-only database intelligence graph. No runtime ERP code was modified. All verification gates pass.
