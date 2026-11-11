# KG-4 Voucher and Accounting Graph Foundation Report

**Phase:** KG-4
**Date:** 2026-07-14
**Status:** Completed

## Executive Summary

KG-4 establishes the formal Voucher and Accounting intelligence graph for GII GeM ERP as part of the Enterprise Intelligence Layer. It maps 14 voucher types, 23 posting functions, 9 debit/credit patterns, 8 ledger impact patterns, 3 receivable/payable impact areas, 4 cash/bank impact patterns, 3 GST impact patterns, 6 inventory impact patterns, 2 reversal rules, 23 report dependencies, 11 workflow alignments, 23 database alignments, 9 audit trail events, 10 accounting protection principles, and 6 known gaps. No runtime ERP code was modified.

## Feature Classification

- **Primary Category:** Governance
- **Secondary Categories:** Architecture, Intelligence
- **Why:** KG-4 establishes the formal voucher and accounting intelligence graph as part of the Enterprise Intelligence Layer. It is a read-only knowledge structure with no runtime ERP changes.

## Dependency Assessment

| Dependency | Satisfied | Notes |
|---|---|---|
| DG-1 Database Graph | Yes | All 23+ database tables referenced by KG-4 are fully mapped in DG-1 |
| WG-1 Workflow Graph | Yes | All 11 accounting-impact boundary stages align with WG-1 stages |
| KG-1 Knowledge Graph | Yes | Knowledge entries reference accounting concepts and voucher types |
| Double-entry accounting audit | Yes | All debit/credit patterns verified against createBalancedVoucher enforcement |
| accountingService.js | Yes | 11 posting functions analyzed from accounting service |
| init.js | Yes | 6 posting/helper functions analyzed from init |
| inventoryService.js | Yes | 4 inventory posting functions analyzed |
| operationsService.js | Yes | 2 operational posting functions analyzed |
| reportBuilders.js | Yes | 23 report dependencies mapped from report builders |

**Dependencies Satisfied:** Yes

## Files Changed / Created

### Created
| File | Description |
|---|---|
| `src/renderer/knowledge/voucher-accounting-graph.json` | KG-4 graph — 14 voucher types, 23 posting functions, 9 debit/credit patterns, 23 report dependencies, 11 workflow alignments |
| `repository/schema/voucher-accounting-graph.schema.json` | KG-4 JSON Schema v1.0.0 |
| `scripts/verify-voucher-accounting-graph.js` | 21-rule validation script |

### Modified
| File | Description |
|---|---|
| `repository/graph-registry.json` | KG-4 registered as Active v1.0.0, compatibility updated, 7 graphs total |
| `scripts/verify-audit.js` | KG-4 Audit Pack added (18 audit checks). Total passes increased from 133 to 152 |
| `package.json` | `verify:voucher-accounting-graph` script added |

## Source Files Reviewed

| File | Functions Analyzed |
|---|---|
| `src/main/services/accountingService.js` | createBalancedVoucher, createManualVoucher, postSalesVoucher, postPurchaseVoucher, postReceiptVoucher, postSupplierPaymentVoucher, postGuidedVoucher, reverseVoucher, createOpeningBalance, createPartyOpeningBalance |
| `src/main/database/init.js` | postLedgerEntry, updateCashBankLedger, upsertReceivable, refreshReceivable, markPosted, postExpenseAccrualsForOrder |
| `src/main/services/inventoryService.js` | postStockInward, postStockOutward, postStockAdjustment, postStockReturn |
| `src/main/services/operationsService.js` | postBusinessTransaction, postWarehouseTransfer, confirmDeliveryChallan |
| `src/main/database/reportBuilders.js` | All 43 report functions; 23 mapped as dependencies |
| `src/main/database/schemaDefinitions.js` | Voucher type CHECK constraint (8 types), reversal columns |
| `src/main/database/crudHelpers.js` | Posted transaction protection logic |

## Voucher Type Summary

| Type | DB Type | Source Module | Posting Function | Sensitivity |
|---|---|---|---|---|
| Sales | Sales | billing | postSalesVoucher | critical |
| Credit Note | Credit Note | billing | postSalesVoucher | critical |
| Purchase | Purchase | procurement | postPurchaseVoucher | critical |
| Debit Note | Debit Note | procurement | postGuidedVoucher | critical |
| Receipt | Receipt | payment | postReceiptVoucher | critical |
| Payment | Payment | supplier_payment | postSupplierPaymentVoucher | critical |
| Journal | Journal | manual_voucher | createManualVoucher | critical |
| Contra | Contra | manual_voucher | createManualVoucher | medium |
| Opening Balance | Journal | opening_balance | createOpeningBalance | critical |
| Party Opening Balance | Journal | opening_balance | createPartyOpeningBalance | critical |
| Guided Voucher | Dynamic | guided_vouchers | postGuidedVoucher | critical |
| Expense Accrual | Journal | expense | postExpenseAccrualsForOrder | high |
| Stock Outward (COGS) | Journal | stock_outwards | postStockOutward | high |
| Reversal | Journal | voucher_reversal | reverseVoucher | critical |

8 database-level voucher types enforced by CHECK constraint: Sales, Purchase, Receipt, Payment, Journal, Credit Note, Debit Note, Contra.

## Posting Function Summary

The core posting engine is `createBalancedVoucher` which atomically creates voucher, voucher_lines, and ledger_entries with debit=credit enforcement. All high-level posting functions (Sales, Purchase, Receipt, Payment, Guided, Reversal, Opening Balance, Expense Accrual, COGS) delegate to this core engine.

Key safety rules enforced by posting functions:
- **createBalancedVoucher**: debit must equal credit, no negative amounts, financial year must be open
- **reverseVoucher**: cannot reverse already-reversed voucher, swaps debit/credit, cleans up source tables and allocations
- **postLedgerEntry**: running_balance computed based on account normal_balance (Credit: delta=credit-debit, Debit: delta=debit-credit)
- **postStockOutward**: COGS = quantity_issued * weighted_average_cost
- **Financial year lock**: All posting functions check financial year open status before posting

## Debit/Credit Pattern Summary

| Pattern | Debit | Credit |
|---|---|---|
| Sales Invoice | Trade Receivables | Sales, Output GST |
| Credit Note | Sales, Output GST | Trade Receivables |
| Purchase | Purchase, Input GST | Trade Payables |
| Debit Note | Trade Payables | Purchase, Input GST |
| Receipt | Cash/Bank, TDS Receivable, GST TDS Receivable | Trade Receivables |
| Supplier Payment | Trade Payables | Cash/Bank |
| Expense Accrual | Expense Head | Expense Payable |
| COGS | Cost of Goods Sold | Inventory |
| Opening Balance | Target Account (Dr) | Opening Balance Suspense (Cr) |
| Party Opening Balance | Party Account (Dr) | Opening Balance Suspense (Cr) |
| Reversal | Original credit lines become debit | Original debit lines become credit |

All patterns validated by `createBalancedVoucher` which enforces total debit = total credit.

## Accounting Boundary Mapping

10 accounting protection principles confirmed:

1. All accounting impact flows through controlled posting functions (createBalancedVoucher as central engine)
2. Generic CRUD does not write to accounting-protected tables (DG-1 enforced)
3. Debit total must equal credit total before posting (createBalancedVoucher enforcement)
4. Voucher, voucher_lines, and ledger_entries created atomically (db.transaction())
5. Trial Balance, P&L, Balance Sheet derive from ledger_entries
6. Reversal creates contra entries, does not edit original ledger entries directly
7. Draft business records editable, posted accounting records protected (crudHelpers enforcement)
8. Financial year lock blocks posting (assertOpenFinancialYear enforcement)
9. Audit log records posting and reversal activity
10. KG-4 is read-only over all accounting behavior

## Workflow Alignment with WG-1

| WG-1 Stage | Accounting Impact | Creates Impact? |
|---|---|---|
| WORK_ORDER | none | false |
| PROCUREMENT_PLANNING | accrual | true |
| SUPPLIER_PURCHASE_ORDER | purchase_payable | true |
| GOODS_RECEIPT_GRN | inventory_only | false |
| INVENTORY_RESERVATION | none | false |
| DELIVERY_CHALLAN | cogs | true |
| CRAC | none | false |
| SALES_INVOICE_GST_INVOICE | sales_receivable | true |
| DEPARTMENT_RECEIVABLE | tracking | false |
| RECEIPT | receipt_payment | true |
| ORDER_CLOSURE | reporting | false |

## Database Alignment with DG-1

23 accounting-related tables mapped from DG-1 with their KG-4 usage:
- **Accounting Core (12)**: accounts, vouchers, voucher_lines, ledger_entries, cash_bank_ledger, financial_years, opening_balances, year_end_closings, carry_forward_entries, guided_vouchers, audit_log
- **Receivables (2)**: receivables, payment_allocations
- **Supplier Payments (2)**: supplier_payments, supplier_payment_allocations
- **Billing (2)**: invoices, invoice_items
- **Procurement (2)**: procurements, procurement_items
- **Receipts (1)**: payments
- **Expenses (1)**: expense_entries
- **Inventory (1)**: stock_ledger

## Report Dependency Mapping

23 report dependencies mapped:
- 5 core accounting reports depend on ledger_entries: trialBalance, profitLossReport, balanceSheetReport, gstSummary, gstRegisters
- 4 voucher-level reports: dayBook (vouchers+voucher_lines), accountingRegisters (vouchers), postingControlReport (source tables), partyLedgerReport (voucher_lines+vouchers)
- 4 receivable/payable reports: billWiseReceivableReport, billWisePayableReport, receivableAgeingReport, payableAgeingReport
- 3 allocation reports: paymentAllocationReport, supplierPaymentAllocationReport, supplierPayableReport
- 3 period-end reports: openingBalanceReport, yearEndClosingReport, carryForwardReport
- 1 tax report: tdsRegisters
- 1 financial summary: financialStatementSummary
- 1 profitability: orderProfitability
- 1 cash/bank: cashBankLedger

## Reversal Rule Mapping

Primary reversal function: `reverseVoucher` (accountingService.js:316). Creates a Journal voucher with swapped debit/credit lines. Cleans up source table posting_status, receivables/payables, payment/supplier allocations, and cash_bank_ledger.

Advance adjustment reversal: `reverseAdvanceAdjustment` (accountingService.js:712). Restores advance receipt/supplier advance balance.

Reversal not supported for: Opening Balance entries, Party Opening Balance entries, Stock Outward (COGS) independently.

## Accounting Protection Confirmation

- createBalancedVoucher is the sole atomic posting engine
- Generic CRUD blocked on accounting-protected tables (18 DG-1 tables)
- Financial year lock verified via verify:controls (7 lock tests pass)
- Audit trail logs all posting and reversal activity
- Voucher reversal does not modify original ledger entries
- KG-4 confirms and documents all 10 accounting protection principles

## Known Gaps

| ID | Description | Impact |
|---|---|---|
| KG4-GAP-001 | Cash/Bank Book report has no dedicated function | No summary report function |
| KG4-GAP-002 | Stock adjustments/returns/transfers no accounting vouchers | Valuation not independently audit-trailed |
| KG4-GAP-003 | Stock outward (COGS) no independent reversal | Must reverse parent transaction |
| KG4-GAP-004 | Opening balances no reversal support | Requires manual Journal adjustment |
| KG4-GAP-005 | No report filters directly by financial_year | Date range based, not FY-linked |
| KG4-GAP-006 | Expense Payable no automated settlement flow | Manual Journal required |

## Verification Results

| # | Command | Result |
|---|---|---|
| 1 | `npm run lint:syntax` | PASS |
| 2 | `npm run build` | PASS |
| 3 | `npm run verify:knowledge` | PASS (167 entries, 0 errors) |
| 4 | `npm run verify:workflow-graph` | PASS (20 passed, 0 warnings, 0 failed) |
| 5 | `npm run verify:database-graph` | PASS (27 passed, 0 warnings, 0 failed) |
| 6 | `npm run verify:voucher-accounting-graph` | PASS (21 passed, 0 warnings, 0 failed) |
| 7 | `npm run verify:audit` | PASS (152 PASS, 1 INFO, 1 WARNING pre-existing) |
| 8 | `npm run verify:erp` | PASS (Safe to Commit: Yes, Safe to Lock: Yes) |
| 9 | `npm run verify:accounting` | PASS |
| 10 | `npm run verify:financials` | PASS |
| 11 | `npm run verify:controls` | PASS (12 passed, 0 failed) |
| 12 | `npm run verify:voucher-inventory` | PASS |
| 13 | `npm run verify:flow` | PASS |
| 14 | `npm run verify:phase10` | PASS |

All 14 verification commands pass. The only warnings are pre-existing (RG-1 high-risk App.jsx, chunk size).

## Desktop Smoke Test

Not applicable — KG-4 is a read-only knowledge graph with no runtime code changes. No UI, navigation, or functional behavior was modified.

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
| Controls verification passed | Yes |
| Graph registry updated | Yes |
| Schema validated | Yes |
| Documentation updated | Yes |
| Phase report generated | Yes |
| Limitations documented | Yes (6 known gaps) |
| Safe-to-lock recommendation | Yes |

## Enterprise Intelligence Layer Compliance

KG-4 is registered as Active v1.0.0 in `repository/graph-registry.json` with dependencies on DG-1, WG-1, and KG-1. The graph is consumable by future AI tools via the Enterprise Intelligence Layer contract. Schema is at `repository/schema/voucher-accounting-graph.schema.json` (draft-07).

## Safe to Lock

**Yes.** KG-4 is a read-only voucher and accounting intelligence graph. No runtime ERP code was modified. All verification gates pass. ERP Brain upgrade, chatbot, contextual assistant, and action-taking assistant work must not begin until KG-4 is validated and locked.
