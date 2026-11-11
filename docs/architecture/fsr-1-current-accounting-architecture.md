# FSR-1 Current Accounting Architecture

**Audit date:** 2026-07-20  
**Mode:** Architecture and certification audit only  
**Classification:** Architecture / Accounting / Reporting / Governance  
**Dependencies satisfied:** Yes for audit; No for production financial-report certification

## Executive finding

The ERP has a real double-entry posting core, but it does not yet have a governed financial-statement engine. Posted journal evidence is stored in `voucher_lines` and mirrored into `ledger_entries`; Trial Balance, Profit and Loss, and Balance Sheet all calculate directly from `ledger_entries`. The current reports are flat account-type summaries. Group hierarchy, statutory mapping, current/non-current classification, comparative presentation, and certified inventory-to-GL reconciliation are absent.

The deterministic FSR-1 fixture proved that basic Trial Balance and P&L arithmetic can reconcile while the Balance Sheet remains wrong. Therefore a zero Trial Balance is necessary but not sufficient evidence of financial-statement correctness.

## Responsibility map

| Capability | Exact implementation | Audit result |
|---|---|---|
| Chart of Accounts | `src/main/database/init.js` `DEFAULT_ACCOUNTS`; `src/main/database/schemaDefinitions.js` `createAccountingTables` | 26 default ledgers; only five broad account types |
| Account groups/sub-groups | `accounts.parent_account_id`; renderer `classifyAccountGroup` | No governed group registry or group aggregation |
| Ledger creation | `src/main/services/accountingService.js` `createLedgerAccount` | Company scoped; `opening_balance` forced to 0 (FSR-2A.5A) |
| Opening balances — governed | `createOpeningBalance`, `createPartyOpeningBalance`, `opening_balances` | Balanced voucher-backed path; validates FY ownership, status and opening-date bounds (FSR-2A.5A-D7) |
| Opening balances — direct account field | `accounts.opening_balance` | Non-authoritative — Trial Balance `COALESCE` prefers `carry_forward_entries`; retain for backward compatibility only |
| Voucher creation | `createManualVoucher`, `createBusinessVoucher`, guided-voucher functions | Manual path validates account ownership and lines |
| Voucher approval/posting | `postGuidedVoucher`, `postSalesVoucher`, `postPurchaseVoucher`, `postReceiptVoucher`, `postSupplierPaymentVoucher` | Transactional posting exists; coverage differs by source module |
| Journal generation | `createBalancedVoucher` | Writes voucher, lines, ledger, audit in one DB transaction |
| Debit-credit validation | `createBalancedVoucher`; `createManualVoucher` | Cent-rounded equality check; empty posted voucher is not rejected |
| Reversal | `reverseVoucher` | Creates opposite Journal and retains original evidence |
| Cancellation/deletion | `safeDeleteService.js`; generic CRUD write policy | Protected generic deletion; reports do not filter voucher status |
| Financial-year boundaries | `financialYearForDate`, `assertOpenFinancialYear`, `createFinancialYear` | Posting lock enforcement exists |
| Period locking | `updateFinancialYearStatus`; financial-year status columns | Open/Closed/Locked model exists |
| Trial Balance | `src/main/database/reportBuilders.js` `trialBalance` | Flat movement totals plus account opening balance |
| Profit and Loss | `profitLossReport`, `financialStatementSummary` | Simple Income minus Expense report |
| Balance Sheet | `balanceSheetReport` | Flat Asset/Liability/Equity report plus selected-range profit |
| Closing stock | `src/main/services/inventoryService.js` `inventoryStockSummary` | Stock subledger calculation; no certified GL bridge |
| Inventory valuation | `weightedAverageCost`, `inventoryValuationReport` | Moving weighted-average label; no NRV/write-down layer |
| Depreciation | Manual Journal capability only | No fixed-asset register or depreciation engine |
| Tax ledgers | Default Input GST, Output GST, GST Payable, TDS ledgers; `gstSummary` | Basic control accounts exist |
| Retained earnings | Default `Profit and Loss` equity ledger; `closeFinancialYear` | Ledger is not used by a working close/carry-forward process |
| Report drill-down | `src/main/database/init.js` `drilldownData`, `voucherDetail`, `sourceTransactionDetail` | Ledger-to-voucher trace works; no statement-section/group hierarchy |
| Report export | `src/renderer/utils/formatters.js` `exportRows`; print event | CSV and print-preview trigger only |
| Comparative reporting | No backend comparative contract | Not implemented |
| Consolidation | No consolidation service or intercompany elimination | Not implemented |

## End-to-end data flow

```text
Business source table
  -> source-specific posting service
  -> createBalancedVoucher
  -> vouchers
  -> voucher_lines
  -> postLedgerEntry
  -> ledger_entries
  -> reportBuilders.trialBalance / profitLossReport / balanceSheetReport
  -> accountingData
  -> accounting:get-data IPC/preload bridge
  -> AccountingScreen / ReadOnlyReportFamilyScreen
  -> drilldownData
  -> ledger entry / voucher / source transaction / audit evidence
```

Inventory follows a separate path:

```text
stock_inwards / stock_adjustments / stock_returns
  -> stock_ledger
  -> inventoryStockSummary

stock_outwards
  -> COGS/Inventory journal through createBalancedVoucher
  -> stock_ledger
```

The stock-inward and stock-adjustment paths do not post corresponding Inventory GL entries. Purchase posting debits `Purchase`, not `Inventory`. This makes the operating model a financially unsafe hybrid rather than a certified periodic or perpetual inventory model.

## Report source classification

| Candidate source | Used by core statements? | Role |
|---|---:|---|
| `vouchers` | Indirectly | Header, status, source and audit identity |
| `voucher_lines` | Indirectly | Journal document evidence |
| `ledger_entries` | **Yes** | Direct input to TB, P&L and Balance Sheet |
| `running_balance` | No | Stored but not used for statement totals |
| Report-specific tables | No | None for core statements |
| Materialised summaries | No | None |
| `stock_ledger` | Separate | Inventory quantity/value subledger only |

## Confirmed defects

1. `balanceSheetReport` adds credit-normal asset balances and debit-normal equity balances as positive amounts, overstating accumulated depreciation and drawings.
2. Balance Sheet current profit uses the UI `date_from` instead of the financial-year start, so an as-on report can omit earlier current-year profit.
3. `closeFinancialYear` calls `updateFinancialYearStatus(fromId, "Locked", approvedBy)` without the `db` argument; the fixture failed with `Invalid financial year status` and rolled back.
4. `postStockInward`, `postStockAdjustment`, and `postStockReturn` change stock value without corresponding GL changes.
5. Financial reports do not join/filter voucher `status`, so ledger rows associated with Draft or Cancelled vouchers are included.
6. Report joins do not enforce `le.company_id = a.company_id`; an executable cross-company account-ID probe contaminated another company's Trial Balance.
7. `createBalancedVoucher` accepts an empty line array and creates a Posted voucher.
8. Renderer account-group labels are assigned from account-name text, not a governed accounting mapping.

## Architecture gate

**Current maturity:** Internal Testing  
**Production financial-statement readiness:** Blocked  
**Safe to redesign reports before accounting corrections:** No  
**Safe to begin FSR-2A corrective design:** Yes, after a clean baseline and approved scope

