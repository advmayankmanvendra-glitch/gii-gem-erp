# GII GeM ERP — Developer Module Reference

> **File 3 of 4 — Developer Module Reference**  
> Part of the GII GeM ERP Documentation Suite  
> Technology: Electron + React + Vite + better-sqlite3  
> Architecture: Single-main-process, two-layer (main/renderer) with IPC bridge

---

## 1. Introduction

### 1.1 Scope
Comprehensive developer reference covering every screen, database table, exported main-process function, IPC channel, component, CSS class, verification script, and setup command in the GII GeM ERP desktop application.

### 1.2 Architecture Overview
- **Main Process** (`src/main/`): Electron main process. Database init, CRUD functions, accounting engine, backup, health checks, verification services, IPC handlers.
- **Preload** (`src/preload/preload.cjs`): Context bridge exposing 139 methods to renderer via `window.api.*`.
- **Renderer** (`src/renderer/`): React SPA (App.jsx, 33 screens, shared components, config, features, modules, print, stability layers).
- **CSS**: Single file `app.css` (6238 lines), CSS custom properties, CSS Grid layout.
- **Database**: SQLite via better-sqlite3, WAL mode, foreign keys ON. 52 tables across System, Masters, Transactions, Accounting, Inventory, Documents, Operations, Financial, CRAC, Bank, Proposals, Advanced, Import modules.

### 1.3 Conventions Used
- Route keys lower-case with dashes (e.g. `sales-voucher`)
- All IPC channels prefixed with `api:` for renderer→main and `api:` for main→renderer
- Context bridge methods mirror IPC channel names (dots normalized to camelCase)
- Screen file paths relative to `src/renderer/screens/`

---

## 2. Screen Reference

### 2.1 DashboardScreen
- **Route Keys**: `dashboard`, `home`
- **File Path**: `screens/DashboardScreen.jsx`
- **Props**: None (self-contained)
- **APIs Used**:
  - `window.api.getSystemInfo()` — app version, db stats
  - `window.api.getDashboardData()` — summary card data
  - `window.api.getFiscalYear()` — active fiscal year
  - `window.api.getCompanyInfo()` — active company context
- **Dependencies**: `utils/formatters.js`, `api/client.js`
- **Child Components**: `components/dashboard/SummaryCards`, `components/layout/index` (shell)
- **CSS Classes**: `.dashboard-grid`, `.summary-card`, `.card-value`, `.card-label`, `.fiscal-year-badge`
- **Known Risk Areas**: Data staleness — dashboard caches until manual refresh. IPC payload size may bloat with large datasets. Company context switch does not auto-reload dashboard. No loading skeleton for slow queries.
- **Future Improvement Notes**: Add WebSocket push for live updates. Implement lazy card loading. Add configurable widget layout. Add export-to-PDF for dashboard view. Add real-time fiscal year indicator.

### 2.2 AllCompaniesRegScreen
- **Route Keys**: `all-companies`, `company-register`
- **File Path**: `screens/AllCompaniesRegScreen.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.getAllCompanies()` — paginated company list
  - `window.api.createCompany()` — new company creation
  - `window.api.updateCompany()` — company edit
  - `window.api.deleteCompany()` — soft-delete
  - `window.api.importFromTally()` — Tally XML import trigger
- **Dependencies**: `config/navigation.js`, `api/client.js`
- **Child Components**: `components/tables/MasterDataTable` (reused), `components/overlays/index` (modal forms)
- **CSS Classes**: `.register-table`, `.company-row`, `.company-form`, `.import-banner`
- **Known Risk Areas**: Tally import blocks UI during processing. Company deletion cascades — no confirmation for active transactions. Pagination offset may drift after delete operations. No concurrent company editing guard.
- **Future Improvement Notes**: Add background Tally import with progress bar. Implement soft-delete with undo window. Add company comparison view. Add bulk-export company master. Add audit log for company changes.

### 2.3 SalesVoucherScreen
- **Route Keys**: `sales-voucher`, `sales`
- **File Path**: `screens/SalesVoucherScreen.jsx` (or inline in App.jsx)
- **Props**: `mode` (create/edit/view), `initialData`
- **APIs Used**:
  - `window.api.saveSalesVoucher()` — create/update
  - `window.api.getSalesVoucher()` — fetch by ID
  - `window.api.deleteSalesVoucher()` — soft-delete
  - `window.api.getPartyList()` — party dropdown
  - `window.api.getStockItemList()` — item dropdown
  - `window.api.getGstRates()` — GST rate list
  - `window.api.postVoucherToAccounting()` — posting trigger
- **Dependencies**: `components/forms/index`, `utils/formatters.js`
- **Child Components**: `VoucherLineItem`, `PartySelector`, `ItemGrid`, `GstSummary`, `FooterTotals`
- **CSS Classes**: `.voucher-form`, `.line-item-grid`, `.gst-breakup`, `.voucher-footer`, `.totals-row`
- **Known Risk Areas**: GST calculation rounding may mismatch by pennies compared to manual calc. Posting to accounting is synchronous — large vouchers freeze UI. No auto-save draft. Party credit limit not checked at save time.
- **Future Improvement Notes**: Implement asynchronous posting with progress indicator. Add draft auto-save every 30s. Add real-time party credit-limit validation. Add multi-currency support. Add barcode scanning for line items.

### 2.4 PurchaseVoucherScreen
- **Route Keys**: `purchase-voucher`, `purchase`
- **File Path**: `screens/PurchaseVoucherScreen.jsx`
- **Props**: `mode`, `initialData`
- **APIs Used**:
  - `window.api.savePurchaseVoucher()`
  - `window.api.getPurchaseVoucher()`
  - `window.api.deletePurchaseVoucher()`
  - `window.api.getPartyList()`, `getStockItemList()`, `getGstRates()`
  - `window.api.postVoucherToAccounting()`
  - `window.api.getSupplierList()`
- **Dependencies**: `components/forms/index`, `utils/formatters.js`
- **Child Components**: `VoucherLineItem`, `PartySelector`, `ItemGrid`, `GstSummary`, `FooterTotals`, `DocumentUploader`
- **CSS Classes**: `.voucher-form`, `.line-item-grid`, `.gst-breakup`, `.voucher-footer`, `.document-attachment`
- **Known Risk Areas**: Reverse-charge GST not explicitly flagged. IGST/SGST split relies on party state — if party state field is empty, calculation defaults incorrectly. Supplier debit note linkage not enforced. Document attachment not mandatory per GST rules.
- **Future Improvement Notes**: Add mandatory document attachment toggle per company config. Add reverse-charge auto-detection based on party type. Add multi-branch warehouse selection per line. Add landed-cost allocation across items. Add vendor performance scoring on entry.

### 2.5 PaymentVoucherScreen
- **Route Keys**: `payment-voucher`, `payment`
- **File Path**: `screens/PaymentVoucherScreen.jsx`
- **Props**: `mode`, `initialData`
- **APIs Used**:
  - `window.api.savePaymentVoucher()`
  - `window.api.getPaymentVoucher()`
  - `window.api.deletePaymentVoucher()`
  - `window.api.getPartyList()`, `getBankAccountList()`
  - `window.api.postVoucherToAccounting()`
- **Dependencies**: `components/forms/index`, `utils/formatters.js`
- **Child Components**: `BankAccountSelector`, `PaymentModeSelector`, `ReferenceBillSelector`
- **CSS Classes**: `.payment-form`, `.payment-mode-tabs`, `.reference-bills`, `.bank-detail-section`
- **Known Risk Areas**: Bill-wise referencing partial payments — no automatic suggestion of oldest bills first. Payment mode (cheque/cash/transfer) changes accounting entries but no mode validation on submission. Cheque date not validated against financial year.
- **Future Improvement Notes**: Implement FIFO/oldest-bill-first auto-suggestion. Add cheque printing integration. Add payment-advice PDF generation. Add bank reconciliation flag auto-update on payment. Add multi-currency FX rate entry.

### 2.6 ReceiptVoucherScreen
- **Route Keys**: `receipt-voucher`, `receipt`
- **File Path**: `screens/ReceiptVoucherScreen.jsx`
- **Props**: `mode`, `initialData`
- **APIs Used**:
  - `window.api.saveReceiptVoucher()`
  - `window.api.getReceiptVoucher()`
  - `window.api.deleteReceiptVoucher()`
  - `window.api.getPartyList()`, `getBankAccountList()`
  - `window.api.postVoucherToAccounting()`
- **Dependencies**: `components/forms/index`, `utils/formatters.js`
- **Child Components**: `BankAccountSelector`, `PaymentModeSelector`, `ReferenceBillSelector`, `DepositSlipGenerator`
- **CSS Classes**: `.receipt-form`, `.payment-mode-tabs`, `.reference-bills`, `.deposit-section`
- **Known Risk Areas**: Cash receipt entry may lack deposit slip linkage. Bank receipt without deposit slip or reference number creates reconciliation gap. Overpayment detection not implemented — excess treated as unadjusted advance.
- **Future Improvement Notes**: Add auto-deposit slip generation for cash/cheque receipts. Implement overpayment auto-adjustment as credit note. Add receipt acknowledgment SMS/email trigger. Add daily cash summary dashboard widget.

### 2.7 JournalVoucherScreen
- **Route Keys**: `journal-voucher`, `journal`
- **File Path**: `screens/JournalVoucherScreen.jsx`
- **Props**: `mode`, `initialData`
- **APIs Used**:
  - `window.api.saveJournalVoucher()`
  - `window.api.getJournalVoucher()`
  - `window.api.deleteJournalVoucher()`
  - `window.api.getLedgerList()`
  - `window.api.postVoucherToAccounting()`
- **Dependencies**: `components/forms/index`, `utils/formatters.js`
- **Child Components**: `LedgerEntryGrid`, `NarrationInput`, `ContraIndicator`
- **CSS Classes**: `.journal-form`, `.ledger-entry-row`, `.debit-credit-columns`, `.narration-box`
- **Known Risk Areas**: Debit-credit imbalance not prevented at client side (server validates). Contra flag is manual — no auto-detection of cash/bank ledgers on both sides. Narration is optional but auditing requires it. Round-off entries need auto-suggestion for balanced vouchers.
- **Future Improvement Notes**: Add auto-contra detection when both sides are bank/cash ledgers. Enforce narration minimum length in audit mode. Add round-off auto-entry suggestion. Add recurring journal template support. Add multi-currency FX gain/loss auto-entry.

### 2.8 CreditNoteScreen
- **Route Keys**: `credit-note`, `credit`
- **File Path**: `screens/CreditNoteScreen.jsx`
- **Props**: `mode`, `initialData`
- **APIs Used**:
  - `window.api.saveCreditNote()`
  - `window.api.getCreditNote()`
  - `window.api.deleteCreditNote()`
  - `window.api.getPartyList()`, `getStockItemList()`, `getGstRates()`
  - `window.api.postVoucherToAccounting()`
- **Dependencies**: `components/forms/index`, `utils/formatters.js`
- **Child Components**: `ReferenceInvoiceSelector`, `CreditLineItemGrid`, `GstAdjustmentSummary`
- **CSS Classes**: `.credit-note-form`, `.reference-invoice-section`, `.credit-line-items`, `.gst-adjustment`
- **Known Risk Areas**: GST credit note rules (9-digit matching, original invoice reference) not enforced. Time limit (6 months from invoice date) not validated. Debit note linkage for purchase returns not cross-checked. No auto-calculation of credit period impact on GST liability.
- **Future Improvement Notes**: Add GST rule wizard for credit notes (9-digit mandatory match). Add reference invoice auto-population with line-item copy. Add time-limit validation against original invoice. Add e-invoice cancellation integration.

### 2.9 DebitNoteScreen
- **Route Keys**: `debit-note`, `debit`
- **File Path**: `screens/DebitNoteScreen.jsx`
- **Props**: `mode`, `initialData`
- **APIs Used**:
  - `window.api.saveDebitNote()`
  - `window.api.getDebitNote()`
  - `window.api.deleteDebitNote()`
  - `window.api.getPartyList()`, `getStockItemList()`, `getGstRates()`
  - `window.api.postVoucherToAccounting()`
- **Dependencies**: `components/forms/index`, `utils/formatters.js`
- **Child Components**: `ReferencePurchaseSelector`, `DebitLineItemGrid`, `GstAdjustmentSummary`
- **CSS Classes**: `.debit-note-form`, `.reference-purchase-section`, `.debit-line-items`, `.gst-adjustment`
- **Known Risk Areas**: Mirrors CreditNoteScreen risks. No distinction between GST and non-GST debit notes. Purchase return must link to original purchase invoice but no validation enforces this. Time-limit not monitored.
- **Future Improvement Notes**: Same as CreditNoteScreen. Add purchase-return workflow widget. Add supplier notification when debit note issued. Add real-time credit limit re-calculation on debit note posting.

### 2.10 ContraVoucherScreen
- **Route Keys**: `contra-voucher`, `contra`
- **File Path**: `screens/ContraVoucherScreen.jsx`
- **Props**: `mode`, `initialData`
- **APIs Used**:
  - `window.api.saveContraVoucher()`
  - `window.api.getContraVoucher()`
  - `window.api.deleteContraVoucher()`
  - `window.api.getBankAccountList()`, `getCashAccountList()`
  - `window.api.postVoucherToAccounting()`
- **Dependencies**: `components/forms/index`, `utils/formatters.js`
- **Child Components**: `FromAccountSelector`, `ToAccountSelector`, `AmountInput`
- **CSS Classes**: `.contra-form`, `.account-pair`, `.mode-selector`
- **Known Risk Areas**: Only bank-to-bank or bank-to-cash transfers intended — no validation prevents cash-to-cash. Cheque deposit not linked to actual cheque clearing. Multi-legged contra (single entry with 3+ accounts) not supported.
- **Future Improvement Notes**: Add cheque-deposit slip integration. Support multi-legged contra entries. Add intra-bank transfer reference number tracking. Add daily cash-in-hand reconciliation prompt.

### 2.11 DeliveryNoteScreen
- **Route Keys**: `delivery-note`, `delivery`
- **File Path**: `screens/DeliveryNoteScreen.jsx`
- **Props**: `mode`, `initialData`
- **APIs Used**:
  - `window.api.saveDeliveryNote()`
  - `window.api.getDeliveryNote()`
  - `window.api.deleteDeliveryNote()`
  - `window.api.getStockItemList()`, `getPartyList()`
- **Dependencies**: `components/forms/index`, `utils/formatters.js`
- **Child Components**: `ItemDispatchGrid`, `TransportDetailSection`, `EwayBillSection`
- **CSS Classes**: `.delivery-note-form`, `.dispatch-items`, `.transport-detail`, `.eway-bill-link`
- **Known Risk Areas**: E-way bill number entry is manual — no API integration with GST portal. Stock valuation at delivery uses current average — may differ from invoice valuation. Delivery note can be created against sales order but no order-linkage enforcement. Multiple deliveries per sales order not tracked.
- **Future Improvement Notes**: Add e-way bill portal API integration. Add delivery-vs-invoice tracking dashboard. Add vehicle tracking integration. Add delivery confirmation with e-signature capture. Add partial delivery tracking with back-order auto-creation.

### 2.12 ReceiptNoteScreen
- **Route Keys**: `receipt-note`, `grn`
- **File Path**: `screens/ReceiptNoteScreen.jsx`
- **Props**: `mode`, `initialData`
- **APIs Used**:
  - `window.api.saveReceiptNote()`
  - `window.api.getReceiptNote()`
  - `window.api.deleteReceiptNote()`
  - `window.api.getStockItemList()`, `getPartyList()`
- **Dependencies**: `components/forms/index`, `utils/formatters.js`
- **Child Components**: `ItemReceiptGrid`, `QualityCheckSection`, `PurchaseOrderReferencePanel`
- **CSS Classes**: `.receipt-note-form`, `.receipt-items`, `.quality-check`, `.po-reference`
- **Known Risk Areas**: Quality check fields are text notes — no pass/fail enforcement. Multiple GRN against single PO not validated (over-receipt). Purchase order linked but no back-order auto-generation for short receipt. Inspection lot/batch tracking not implemented.
- **Future Improvement Notes**: Add pass/fail QC with rejection workflow. Add batch/lot tracking on receipt. Add PO closure state update on full receipt. Add vendor return-process initiation for rejected items. Add FIFO lot allocation on receipt.

### 2.13 StockJournalScreen
- **Route Keys**: `stock-journal`, `stock-jv`
- **File Path**: `screens/StockJournalScreen.jsx`
- **Props**: `mode`, `initialData`
- **APIs Used**:
  - `window.api.saveStockJournal()`
  - `window.api.getStockJournal()`
  - `window.api.deleteStockJournal()`
  - `window.api.getStockItemList()`, `getGodownList()`
- **Dependencies**: `components/forms/index`, `utils/formatters.js`
- **Child Components**: `StockTransferGrid`, `GodownSelector`, `BatchSelector`
- **CSS Classes**: `.stock-journal-form`, `.transfer-grid`, `.godown-pair`, `.batch-select`
- **Known Risk Areas**: No valuation impact tracking — stock journal changes godown but does not adjust average cost. Batch tracking not enforced when moving between godowns. No audit trail for physical stock count adjustments via journal.
- **Future Improvement Notes**: Add valuation impact preview before save. Enforce batch transfer tracking when batches exist. Add stock-count integration with journal auto-creation for variances. Add godown-wise stock valuation report button.

### 2.14 PhysicalStockScreen
- **Route Keys**: `physical-stock`, `stock-count`
- **File Path**: `screens/PhysicalStockScreen.jsx`
- **Props**: `mode`, `initialData`
- **APIs Used**:
  - `window.api.savePhysicalStock()`
  - `window.api.getPhysicalStock()`
  - `window.api.deletePhysicalStock()`
  - `window.api.getStockItemList()`, `getGodownList()`
- **Dependencies**: `components/forms/index`, `utils/formatters.js`
- **Child Components**: `StockCountGrid`, `VarianceDisplay`, `FreezeControls`
- **CSS Classes**: `.physical-stock-form`, `.count-entry-row`, `.variance-highlight`, `.freeze-banner`
- **Known Risk Areas**: Count entry can be frozen/unfrozen — no role-based access to freeze. Variance auto-creation of stock journal is optional, not mandatory. No count-sheet barcode scanning support. Multi-user simultaneous counting on same godown not prevented.
- **Future Improvement Notes**: Add barcode/QR scanning for count entry. Add role-based freeze with approval workflow. Add auto-creation of stock journal from variances. Add multi-user count session management. Add count-sheet PDF export.

### 2.15 SalesOrderScreen
- **Route Keys**: `sales-order`, `so`
- **File Path**: `screens/SalesOrderScreen.jsx`
- **Props**: `mode`, `initialData`
- **APIs Used**:
  - `window.api.saveSalesOrder()`
  - `window.api.getSalesOrder()`
  - `window.api.deleteSalesOrder()`
  - `window.api.getPartyList()`, `getStockItemList()`
- **Dependencies**: `components/forms/index`, `utils/formatters.js`
- **Child Components**: `OrderLineItemGrid`, `DeliverySchedulePanel`, `TermsSection`
- **CSS Classes**: `.sales-order-form`, `.order-items`, `.delivery-schedule`, `.terms-conditions`
- **Known Risk Areas**: No stock availability check at order entry. Delivery schedule dates not validated against item lead time. Order can exceed party credit limit without warning. Partial fulfillment tracking is manual.
- **Future Improvement Notes**: Add real-time stock availability indicator per item. Add credit limit check with override approval. Add auto-conversion to sales voucher workflow. Add order booking dashboard with fulfillment % tracking. Add quotation-to-order conversion.

### 2.16 PurchaseOrderScreen
- **Route Keys**: `purchase-order`, `po`
- **File Path**: `screens/PurchaseOrderScreen.jsx`
- **Props**: `mode`, `initialData`
- **APIs Used**:
  - `window.api.savePurchaseOrder()`
  - `window.api.getPurchaseOrder()`
  - `window.api.deletePurchaseOrder()`
  - `window.api.getPartyList()`, `getStockItemList()`
- **Dependencies**: `components/forms/index`, `utils/formatters.js`
- **Child Components**: `OrderLineItemGrid`, `DeliverySchedulePanel`, `TermsSection`, `RateNegotiationPanel`
- **CSS Classes**: `.purchase-order-form`, `.po-items`, `.delivery-schedule`, `.rate-history`
- **Known Risk Areas**: No rate-contract linkage — PO rates are manual entry. Multiple POs to same supplier for same item not flagged. Delivery schedule not enforced at GRN entry. Budget vs PO consumption not tracked.
- **Future Improvement Notes**: Add rate-contract reference with auto-rate population. Add duplicate PO detection for same supplier+item. Add budget-utilization indicator against purchase budget. Add vendor acknowledgment workflow. Add PO amendment workflow with versioning.

### 2.17 MasterDataToolsScreen
- **Route Keys**: `master-data-tools`, `master-tools`
- **File Path**: `screens/MasterDataToolsScreen.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.getAllMasters()` — all master records
  - `window.api.exportMasterData()` — CSV/Excel export
  - `window.api.importMasterData()` — bulk import
  - `window.api.validateMasterData()` — consistency checks
- **Dependencies**: `services/masterDataToolsService.js`
- **Child Components**: `components/tables/MasterDataTable`, `ImportDialog`, `ExportDialog`, `ValidationResultsPanel`
- **CSS Classes**: `.master-tools-layout`, `.import-export-bar`, `.validation-results`, `.bulk-actions`
- **Known Risk Areas**: Bulk import can overwrite existing masters with no rollback. CSV format rigid — extra columns cause silent skip. Validation checks run in-memory — large masters may spike RAM. No import preview feature.
- **Future Improvement Notes**: Add import dry-run with full preview before commit. Add undo/rollback for import operations. Add column-mapping UI for flexible CSV import. Add scheduled master data sync. Add field-level audit log for master changes.

### 2.18 InventoryStockScreen
- **Route Keys**: `inventory-stock`, `stock-summary`
- **File Path**: `screens/InventoryStockScreen.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.getStockSummary()`
  - `window.api.getStockMovement()`
  - `window.api.getStockValuation()`
  - `window.api.getGodownList()`
- **Dependencies**: `utils/formatters.js`, `features/inventory/StockSummary`
- **Child Components**: `StockSummaryTable`, `StockMovementChart`, `GodownFilter`, `CategoryFilter`
- **CSS Classes**: `.inventory-stock-screen`, `.stock-table`, `.movement-chart`, `.filter-bar`
- **Known Risk Areas**: Stock valuation uses average cost — may drift if negative stock exists. Movement report large date ranges cause performance issues. No reorder-level alerts displayed. No stock-aging breakdown.
- **Future Improvement Notes**: Add real-time reorder-level alerts. Add negative stock prevention at transaction level. Add stock-aging analysis (FIFO-based). Add drill-down from summary to movement. Add inventory turnover ratio widget.

### 2.19 BankRowsTableScreen
- **Route Keys**: `bank-rows`, `bank-rows-table`
- **File Path**: `screens/BankRowsTableScreen.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.getBankRows()`
  - `window.api.updateBankRow()`
  - `window.api.deleteBankRow()`
  - `window.api.reconcileBankRow()`
- **Dependencies**: None
- **Child Components**: `BankRowsGrid`, `ReconciliationDialog`, `FilterPanel`
- **CSS Classes**: `.bank-rows-table`, `.reconciliation-status`, `.row-filters`
- **Known Risk Areas**: Direct row editing may bypass reconciliation workflow. Bulk actions not supported. No bank statement import to compare against rows. Row matching against system vouchers is manual.
- **Future Improvement Notes**: Add bank statement CSV/PDF import with auto-matching. Add batch reconciliation. Add uncleared-items dashboard. Add bank reconciliation aging report. Add auto-reconciliation rules engine.
### 2.20 DocumentsScreen
- **Route Keys**: `documents`, `document-center`
- **File Path**: `screens/DocumentsScreen.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.listDocuments()` — paginated document list
  - `window.api.uploadDocument()` — file + metadata
  - `window.api.downloadDocument()` — file stream
  - `window.api.deleteDocument()` — soft-delete
  - `window.api.getDocumentTags()` — tag filter list
- **Dependencies**: `utils/formatters.js`, `config/navigation.js`
- **Child Components**: `DocumentList`, `DocumentUploader`, `DocumentPreviewer`, `TagFilter`
- **CSS Classes**: `.documents-screen`, `.document-list`, `.upload-zone`, `.preview-panel`, `.tag-filter-bar`
- **Known Risk Areas**: Upload size limited by IPC — files >100MB may fail silently. Document preview only supports PDF/images; other formats show placeholder. No version control — overwrite on same filename. No OCR for scanned document search.
- **Future Improvement Notes**: Add chunked upload for large files. Add drag-drop folder upload. Add version history with restore. Add OCR-based full-text search. Add document expiry/retention policy enforcement.

### 2.21 ProfitabilityScreen
- **Route Keys**: `profitability`, `profitability-analysis`
- **File Path**: `screens/ProfitabilityScreen.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.getProfitabilityData()` — aggregated P&L by period
  - `window.api.getPartyProfitability()` — customer-wise
  - `window.api.getProductProfitability()` — item-wise
- **Dependencies**: `utils/formatters.js`
- **Child Components**: `ProfitChart`, `PartyBreakdown`, `ProductBreakdown`, `PeriodSelector`
- **CSS Classes**: `.profitability-screen`, `.profit-chart`, `.breakdown-section`, `.period-selector`
- **Known Risk Areas**: Data computed server-side; large date ranges cause slow response. Party profitability includes only posted vouchers — unposted drafts excluded. Cost allocation method hardcoded (no user choice). No comparison with previous period.
- **Future Improvement Notes**: Add period-over-period comparison charts. Add configurable cost allocation method (absorption/marginal). Add export to PPT/PDF for management presentations. Add drill-down from profit to voucher level. Add budget vs actual overlay.

### 2.22 ReadOnlyReportsScreen
- **Route Keys**: `read-only-reports`, `reports`
- **File Path**: `screens/ReadOnlyReportsScreen.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.getReportList()` — available report definitions
  - `window.api.runReport()` — execute with params
  - `window.api.exportReport()` — PDF/CSV/Excel
- **Dependencies**: `utils/formatters.js`
- **Child Components**: `ReportListPanel`, `ReportViewer`, `ReportParameterForm`, `ExportToolbar`
- **CSS Classes**: `.reports-screen`, `.report-list`, `.report-viewer`, `.param-form`, `.export-toolbar`
- **Known Risk Areas**: Report execution runs synchronously in main process — blocks other IPC. Parameter validation is client-only. Large reports may consume excessive renderer memory. No report scheduling.
- **Future Improvement Notes**: Make report execution async with progress. Add report scheduler with email distribution. Add parameter validation on server side. Add row-limited preview before full export. Add custom report builder UI.

### 2.23 ReadOnlySummaryScreen
- **Route Keys**: `read-only-summary`, `summary`
- **File Path**: `screens/ReadOnlySummaryScreen.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.getSummaryData()` — dashboard summary values
  - `window.api.getPeriodSummary()` — period comparison
- **Dependencies**: `utils/formatters.js`
- **Child Components**: `SummaryCardGrid`, `TrendChart`, `PeriodComparisonTable`
- **CSS Classes**: `.summary-screen`, `.summary-cards`, `.trend-chart`, `.comparison-table`
- **Known Risk Areas**: Summary figures are cached for 5 minutes — may be stale during month-end closing. Period comparison uses only full months. No drill-down from summary value to voucher list. Zero-value categories still render with empty state.
- **Future Improvement Notes**: Add user-configurable refresh interval. Add drill-down click on any summary value. Add year-to-date vs month comparison modes. Add configurable card layout (show/hide metrics). Add KPI threshold alerts.

### 2.24 SettingsScreen
- **Route Keys**: `settings`
- **File Path**: `screens/SettingsScreen.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.getSettings()` — all app settings
  - `window.api.updateSetting()` — single key-value
  - `window.api.resetSettings()` — factory defaults
  - `window.api.getFiscalYearList()` — FY management
  - `window.api.createFiscalYear()`
  - `window.api.getCompanySettings()`
- **Dependencies**: `config/storageKeys.js`, `components/settings/index`
- **Child Components**: `GeneralSettings`, `FiscalYearManager`, `CompanyProfileForm`, `BackupSettings`, `PrintSettings`, `ImportSettings`
- **CSS Classes**: `.settings-screen`, `.settings-section`, `.settings-form`, `.fy-manager`, `.backup-config`
- **Known Risk Areas**: Fiscal year change mid-session can corrupt transaction dates. Settings changes apply immediately without restart prompt for some values. No setting version audit. Backup path configuration not validated for writability at save time.
- **Future Improvement Notes**: Add fiscal year soft-lock after transactions exist. Add setting-change audit log. Add validate-on-save for all configurable paths. Add settings import/export for environment cloning. Add multi-user setting profiles.

### 2.25 KeyboardShortcutsScreen
- **Route Keys**: `keyboard-shortcuts`, `shortcuts`
- **File Path**: `screens/KeyboardShortcutsScreen.jsx`
- **Props**: None
- **APIs Used**: None (client-side only)
- **Dependencies**: `config/keyboardShortcuts.js`
- **Child Components**: `ShortcutCategoryList`, `ShortcutKeyDisplay`, `SearchBar`
- **CSS Classes**: `.shortcuts-screen`, `.shortcut-category`, `.shortcut-row`, `.key-combo`
- **Known Risk Areas**: No custom shortcut remapping. Shortcuts conflict detection not implemented. Global vs context-aware shortcuts not differentiated. Missing search for action-by-key.
- **Future Improvement Notes**: Add custom shortcut remapping UI. Add conflict detection on save. Add search-by-key binding. Add printable shortcut reference card. Add per-screen shortcut context overlay.

### 2.26 HelpTrainingScreen
- **Route Keys**: `help-training`, `help`
- **File Path**: `screens/HelpTrainingScreen.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.getHelpContent()` — markdown/docs
  - `window.api.searchHelp()` — full-text search
  - `window.api.getTrainingModules()`
  - `window.api.trackHelpUsage()` — analytics
- **Dependencies**: `config/helpContent.js`, `modules/helpAssistant/`
- **Child Components**: `HelpSidebar`, `ContentViewer`, `SearchResults`, `TrainingModuleCard`, `HelpAssistantOverlay`
- **CSS Classes**: `.help-screen`, `.help-sidebar`, `.content-area`, `.search-bar`, `.training-grid`
- **Known Risk Areas**: Help content is static markdown files — no context-aware help per screen. Search uses simple substring match. Training modules are placeholder shells. No user progress tracking across sessions.
- **Future Improvement Notes**: Add context-aware help (F1 opens relevant topic). Add full-text search with relevance ranking. Add interactive training walkthroughs with progress tracking. Add help analytics to identify most-searched topics. Add in-app guided tour framework.

### 2.27 OperationsDrillDownScreen
- **Route Keys**: `operations-drilldown`, `ops-drill`
- **File Path**: `screens/OperationsDrillDownScreen.jsx`
- **Props**: `filterParams` (passed via route state)
- **APIs Used**:
  - `window.api.getOperationsDrillDownData()` — transaction list
  - `window.api.getOperationDetail()` — single transaction detail
- **Dependencies**: `components/operations/OperationsDrillDown`
- **Child Components**: `DrillDownFilterBar`, `TransactionList`, `DetailPanel`, `ExportButton`
- **CSS Classes**: `.ops-drilldown-screen`, `.filter-bar`, `.transaction-list`, `.detail-panel`
- **Known Risk Areas**: Large date ranges cause memory pressure. Filter combinations have no indexed query path — slow on 100K+ records. No drill-down from summary to this screen (no navigation state). Detail panel refresh overwrites current scroll position.
- **Future Improvement Notes**: Add server-side pagination for all drill-down queries. Add indexed filters (date, party, voucher type). Add summary-to-drilldown navigation with preserved state. Add inline edit for non-critical fields. Add bulk-action support (print selected).

### 2.28 HealthCenterDashboardScreen
- **Route Keys**: `health-center`, `health`
- **File Path**: `screens/HealthCenter/HealthCenterDashboard.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.getHealthSummary()` — overall health score
  - `window.api.runHealthCheck()` — all checks
  - `window.api.getRecentAlerts()` — latest issues
- **Dependencies**: `components/health/HealthScoreCard`, `components/health/AlertList`
- **Child Components**: `HealthScoreCircle`, `CategoryCards`, `RecentAlerts`, `RunAllChecksButton`
- **CSS Classes**: `.health-dashboard`, `.score-circle`, `.category-card`, `.alert-list`, `.run-checks-btn`
- **Known Risk Areas**: Health checks run synchronously — full suite blocks UI for up to 30s. Score algorithm not documented for users. Alert read/unread state not persisted. No auto-schedule for periodic health checks.
- **Future Improvement Notes**: Add async health checks with incremental results. Auto-schedule daily health checks with notification on failure. Add historical health score trend chart. Add alert acknowledge workflow. Add email alert forwarding.

### 2.29 AccountingVerificationScreen
- **Route Keys**: `health-accounting`, `verify-accounting`
- **File Path**: `screens/HealthCenter/AccountingVerification.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.verifyAccounting()` — full accounting check
  - `window.api.getAccountingIssues()` — issue list
  - `window.api.fixAccountingIssue()` — auto-fix
- **Dependencies**: `components/health/VerificationResultList`
- **Child Components**: `VerificationProgress`, `IssueTable`, `AutoFixButton`, `ExportReport`
- **CSS Classes**: `.accounting-verification`, `.verification-progress`, `.issue-row`, `.auto-fix-btn`
- **Known Risk Areas**: Auto-fix may create offset entries without user review — no undo. Verification re-runs full check even after fix. No single-ledger drill-down from issue. Large data sets (1M+ entries) may timeout.
- **Future Improvement Notes**: Add fix-preview before applying. Add single-ledger verification mode. Add undo/rollback for fixes. Add scheduled verification with alert. Add incremental verification (check only changed data since last run).

### 2.30 DiagnosticRunScreen
- **Route Keys**: `health-diagnostics`, `diagnostics`
- **File Path**: `screens/HealthCenter/DiagnosticRun.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.runDiagnostic()` — diagnostic suite
  - `window.api.getDiagnosticLog()` — log output
  - `window.api.exportDiagnosticReport()` — bundle
- **Dependencies**: `components/health/DiagnosticProgress`
- **Child Components**: `DiagnosticCategorySelector`, `ProgressConsole`, `ReportPreview`, `ExportBundle`
- **CSS Classes**: `.diagnostic-screen`, `.diagnostic-categories`, `.console-output`, `.report-preview`
- **Known Risk Areas**: Diagnostic may impact production performance. Log output unbounded — memory use grows with long diagnostics. Some diagnostics require exclusive DB access (blocks users). Bundle export may contain PII — no redaction.
- **Future Improvement Notes**: Add read-only diagnostic mode (no exclusive locks). Add log rotation for long-running diagnostics. Add PII redaction in export bundles. Add remote diagnostic upload for support. Add scheduled diagnostic with health alerts.

### 2.31 VerificationConsoleScreen
- **Route Keys**: `health-verification`, `verify`
- **File Path**: `screens/HealthCenter/VerificationConsole.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.runVerification()` — selected checks
  - `window.api.getVerificationHistory()` — past results
  - `window.api.compareVerification()` — diff with baseline
- **Dependencies**: `components/health/VerificationResultList`
- **Child Components**: `CheckSelector`, `ResultGrid`, `DiffViewer`, `BaselineManager`
- **CSS Classes**: `.verification-console`, `.check-selector`, `.result-grid`, `.diff-viewer`
- **Known Risk Areas**: Baseline comparison requires manual baseline set. Verification result volume may overwhelm grid rendering. No auto-remediation actions. Check ordering not customizable. No notification on verification failure.
- **Future Improvement Notes**: Add auto-baseline after clean verification. Add virtualized grid for large result sets. Add auto-remediation for known issue patterns. Add verification failure webhook/notification. Add check dependency ordering.

### 2.32 BackupRestoreScreen
- **Route Keys**: `health-backup`, `backup`
- **File Path**: `screens/HealthCenter/BackupRestore.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.createBackup()` — manual backup
  - `window.api.restoreBackup()` — restore from file
  - `window.api.getBackupList()` — available backups
  - `window.api.deleteBackup()` — remove backup
  - `window.api.getBackupSchedule()` — schedule config
- **Dependencies**: `components/health/BackupHistory`, `services/backup.js`
- **Child Components**: `BackupScheduleConfig`, `BackupHistoryList`, `RestoreWizard`, `CloudBackupConfig`
- **CSS Classes**: `.backup-screen`, `.schedule-config`, `.backup-history`, `.restore-wizard`, `.cloud-config`
- **Known Risk Areas**: Restore replaces current DB without integrity pre-check. No backup encryption at rest. Backup to same disk as DB is pointless (single-point failure). Restore progress not shown for large backups.
- **Future Improvement Notes**: Add pre-restore integrity check with warning. Add AES encryption for backup files. Add cloud backup support (S3/OneDrive). Add restore dry-run mode. Add backup verification after creation (test restore).

### 2.33 SystemHealthScreen
- **Route Keys**: `health-system`, `system-health`
- **File Path**: `screens/HealthCenter/SystemHealth.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.getSystemHealth()` — CPU, RAM, disk
  - `window.api.getAppVersion()` — version info
  - `window.api.getDbStats()` — DB size, page count
- **Dependencies**: `components/health/HealthScoreCard`
- **Child Components**: `CpuGauge`, `RamGauge`, `DiskGauge`, `DbStatsCard`, `VersionInfo`
- **CSS Classes**: `.system-health-screen`, `.gauge-card`, `.stats-row`, `.version-badge`
- **Known Risk Areas**: Stats are point-in-time — no trend/history. DB page count not actionable for end users. No alert threshold configuration. Disk space check only includes DB drive.
- **Future Improvement Notes**: Add historical trend charts (last 24h). Add configurable alert thresholds. Add multi-drive space monitoring. Add DB page-count optimization recommendation. Add memory leak detection (renderer heap growth tracking).

### 2.34 AuditLogScreen
- **Route Keys**: `health-audit`, `audit-log`
- **File Path**: `screens/HealthCenter/AuditLog.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.getAuditLog()` — paginated audit entries
  - `window.api.searchAuditLog()` — full-text search
  - `window.api.exportAuditLog()` — CSV/PDF
- **Dependencies**: None
- **Child Components**: `AuditLogTable`, `AuditFilterBar`, `AuditDetailPanel`, `ExportToolbar`
- **CSS Classes**: `.audit-log-screen`, `.audit-table`, `.filter-bar`, `.detail-panel`
- **Known Risk Areas**: Large audit tables degrade query performance (no pagination by default). Search over unstructured `details` column is slow. No audit retention policy enforcement. No user action context (IP, session) captured.
- **Future Improvement Notes**: Add audit table partitioning by month. Add structured JSON details column with indexed keys. Add configurable retention policy with auto-purge. Add session/IP tracking. Add audit anomaly detection (unusual patterns).

### 2.35 DataIntegrityScreen
- **Route Keys**: `health-integrity`, `data-integrity`
- **File Path**: `screens/HealthCenter/DataIntegrity.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.runIntegrityCheck()` — full integrity scan
  - `window.api.getIntegrityIssues()` — issue list
  - `window.api.repairIntegrity()` — auto-repair
- **Dependencies**: `components/health/VerificationResultList`
- **Child Components**: `IntegrityProgress`, `IssueTable`, `RepairButton`, `RepairLog`
- **CSS Classes**: `.data-integrity-screen`, `.integrity-progress`, `.issue-row`, `.repair-log`
- **Known Risk Areas**: Repair modifies DB — no undo. Some integrity issues require exclusive lock — blocks all users. Repair may cascade to related records without preview. Orphaned record detection scope is limited to 1-level FK depth.
- **Future Improvement Notes**: Add repair preview with affected-record count. Add multi-level cascade orphan detection. Add read-only mode for integrity checks. Add scheduled integrity checks. Add quarantine for suspicious records instead of delete.

### 2.36 PerformanceScreen
- **Route Keys**: `health-performance`, `performance`
- **File Path**: `screens/HealthCenter/Performance.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.getPerformanceMetrics()` — query timing, IPC latency
  - `window.api.getSlowQueries()` — slow query log
  - `window.api.optimizeTable()` — vacuum/reindex
- **Dependencies**: `components/health/HealthScoreCard`
- **Child Components**: `MetricGaugeGrid`, `SlowQueryTable`, `OptimizeButton`, `TimelineChart`
- **CSS Classes**: `.performance-screen`, `.metric-grid`, `.slow-query-table`, `.optimize-panel`
- **Known Risk Areas**: Slow query threshold is hardcoded (1000ms). Optimize (vacuum) requires exclusive DB lock — blocks all operations. Timeline data only collected since app start (lost on restart). No query plan visualization.
- **Future Improvement Notes**: Add configurable slow query threshold. Add query plan viewer for slow queries. Add persistent metrics store (across restarts). Add async optimize with progress. Add IPC latency breakdown by channel.

### 2.37 ReindexScreen
- **Route Keys**: `health-reindex`, `reindex`
- **File Path**: `screens/HealthCenter/Reindex.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.reindexTable()` — single table reindex
  - `window.api.reindexAll()` — full database reindex
  - `window.api.getIndexStats()` — fragmentation info
- **Dependencies**: None
- **Child Components**: `TableSelector`, `IndexStatsTable`, `ReindexButton`, `ProgressBar`
- **CSS Classes**: `.reindex-screen`, `.table-selector`, `.index-stats`, `.reindex-progress`
- **Known Risk Areas**: Reindex on large tables blocks reads/writes. Fragmentation percentage display may be misleading for small tables. No estimated time display before starting. No scheduled reindex.
- **Future Improvement Notes**: Add online reindex where possible (SQLite limitations noted). Add estimated duration before job starts. Add scheduled weekly reindex. Add index usage stats (used vs unused indexes). Add auto-reindex when fragmentation >30%.

### 2.38 CRACEntryScreen
- **Route Keys**: `crac-entry`, `crac`
- **File Path**: `screens/CRAC/CRACEntryScreen.jsx`
- **Props**: `mode`, `initialData`
- **APIs Used**:
  - `window.api.saveCRACEntry()` — create/update CRAC
  - `window.api.getCRACEntry()` — fetch by ID
  - `window.api.deleteCRACEntry()`
  - `window.api.getCRACConfig()`
- **Dependencies**: `components/crac/CRACEntryForm`, `services/cracService.js`
- **Child Components**: `CRACEntryForm`, `ApproverSelector`, `DocumentAttachments`
- **CSS Classes**: `.crac-entry-form`, `.approver-section`, `.attachment-list`, `.status-timeline`
- **Known Risk Areas**: CRAC workflow state machine not enforced client-side. Document upload before CRAC approval may include non-final versions. No auto-email notification to approvers. SLA breach timer not displayed.
- **Future Improvement Notes**: Add workflow state machine with visual tracker. Add auto-email/SMS notification to approver chain. Add SLA countdown timer. Add CRAC template from past entries. Add audit trail of all CRAC state changes.

### 2.39 CRACManagementScreen
- **Route Keys**: `crac-management`, `crac-mgmt`
- **File Path**: `screens/CRAC/CRACManagementScreen.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.getCRACList()` — paginated list
  - `window.api.getCRACSummary()` — stats
  - `window.api.approveCRAC()` — approval action
  - `window.api.rejectCRAC()` — rejection
- **Dependencies**: `components/crac/CRACSummaryCards`
- **Child Components**: `CRACListTable`, `SummaryCards`, `ApprovalDialog`, `FilterBar`
- **CSS Classes**: `.crac-management`, `.crac-table`, `.summary-cards`, `.approval-dialog`
- **Known Risk Areas**: Bulk approval not supported. List does not show SLA breach status. No role-based filtering (manager sees all). Approval action logs but doesn't enforce dual-approval for high-value CRACs.
- **Future Improvement Notes**: Add bulk approval/rejection. Add SLA breach highlighting. Add role-based filtering and dashboard. Add dual-approval workflow for configurable thresholds. Add CRAC aging report.

### 2.40 CRACTrackerScreen
- **Route Keys**: `crac-tracker`, `crac-track`
- **File Path**: `screens/CRAC/CRACTrackerScreen.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.getCRACTrackerData()` — status overview
  - `window.api.getCRACTimeline()` — lifecycle dates
- **Dependencies**: `components/crac/CRACTimeline`
- **Child Components**: `TimelineChart`, `StatusGrid`, `DueDateHighlights`, `FilterPanel`
- **CSS Classes**: `.crac-tracker`, `.timeline-chart`, `.status-grid`, `.due-highlights`
- **Known Risk Areas**: Timeline data may not update in real-time after approval. No Gantt/calendar view. Due dates don't trigger alerts. No export to MS Project or similar.
- **Future Improvement Notes**: Add Gantt chart view. Add real-time updates via IPC push. Add email/notification alerts before due dates. Add export to MS Project/CSV. Add dependency tracking between CRACs.

### 2.41 OrderClosureScreen
- **Route Keys**: `order-closure`, `close-order`
- **File Path**: `screens/CRAC/OrderClosureScreen.jsx`
- **Props**: `orderId`, `initialData`
- **APIs Used**:
  - `window.api.closeOrder()` — initiate closure
  - `window.api.getClosureStatus()` — closure progress
  - `window.api.getClosureDocuments()` — required docs
- **Dependencies**: `components/crac/ClosureWizard`, `services/orderClosureService.js`
- **Child Components**: `ClosureWizard`, `ChecklistPanel`, `DocumentVerification`, `FinalSummary`
- **CSS Classes**: `.order-closure`, `.closure-wizard`, `.checklist`, `.doc-verification`
- **Known Risk Areas**: Closure checklist is generic — not order-type specific. Document verification is manual (no auto-OCR). Closure can be initiated without all required checks passing. No closure cancellation workflow.
- **Future Improvement Notes**: Add order-type-specific closure checklists. Add OCR-based document verification. Add pre-closure mandatory check enforcement. Add closure cancellation with reason. Add post-closure satisfaction survey.

### 2.42 PaymentReadinessScreen
- **Route Keys**: `payment-readiness`, `pay-ready`
- **File Path**: `screens/CRAC/PaymentReadinessScreen.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.getPaymentReadiness()` — readiness list
  - `window.api.markReadyForPayment()` — flag
  - `window.api.holdPayment()` — hold
- **Dependencies**: `components/crac/PaymentReadinessSummary`, `services/paymentReadinessService.js`
- **Child Components**: `ReadinessTable`, `HoldReasonDialog`, `ReadinessIndicator`, `ExportList`
- **CSS Classes**: `.payment-readiness`, `.readiness-table`, `.hold-dialog`, `.status-indicator`
- **Known Risk Areas**: Readiness flags are manual — no auto-verification of underlying conditions. Hold reason not tracked against release. No approval workflow for payment release. List doesn't show payment due dates vs readiness.
- **Future Improvement Notes**: Add auto-verification of conditions (docs, approvals). Add hold-release workflow with audit. Add payment approval chain integration. Add due-date vs readiness gap report. Add batch payment file generation.

### 2.43 SafeModeScreen
- **Route Keys**: `safe-mode`, `repair`
- **File Path**: `screens/SafeMode/SafeModeScreen.jsx`
- **Props**: None
- **APIs Used**:
  - `window.api.startSafeMode()` — enter safe mode
  - `window.api.runSafeModeDiagnostics()` — basic checks
  - `window.api.exitSafeMode()` — restart normal
- **Dependencies**: `stability/safeFallback.js`
- **Child Components**: `SafeModeBanner`, `DiagnosticList`, `RepairOptions`, `RestartButton`
- **CSS Classes**: `.safe-mode-screen`, `.diagnostic-list`, `.repair-option`, `.restart-btn`
- **Known Risk Areas**: Safe mode disables all data modification — may confuse users expecting full app. No clear indication of what features are disabled. Repair options limited to reindex and vacuum. Exiting safe mode restarts app fully.
- **Future Improvement Notes**: Add clear "safe mode" indicator with feature-availability legend. Add more repair options (integrity check, backup restore). Add single-feature disable (not all-or-nothing). Add guided repair wizard.

### 2.44 RendererErrorScreen
- **Route Keys**: (internal — shown on renderer crash)
- **File Path**: `screens/SafeMode/RendererErrorScreen.jsx`
- **Props**: `error`, `errorInfo`
- **APIs Used**: None (static error display)
- **Dependencies**: `stability/RendererErrorBoundary.js`
- **Child Components**: `ErrorDetails`, `RestartAppButton`, `ReportBugButton`
- **CSS Classes**: `.renderer-error-screen`, `.error-details`, `.action-buttons`
- **Known Risk Areas**: No automatic error reporting. Stack trace may contain internal paths — exposed to user. Recovery limited to full app reload. No state preservation for form data on restart.
- **Future Improvement Notes**: Add automatic error report submission with user consent. Add state persistence with recovery on restart. Add component-level error boundary (not just full screen). Add crash analytics dashboard.

### 2.45 MasterDataTools/CreateMasterScreen
- **Route Keys**: `create-master`, `master-new`
- **File Path**: `screens/MasterDataTools/CreateMasterScreen.jsx`
- **Props**: `masterType`, `initialData`
- **APIs Used**:
  - `window.api.createMasterRecord()` — create record
  - `window.api.getMasterTemplate()` — field definition
  - `window.api.validateMasterField()` — field-level validation
- **Dependencies**: `components/tables/MasterDataTable`, `services/masterDataToolsService.js`
- **Child Components**: `DynamicForm`, `FieldValidator`, `DuplicateCheckPanel`, `BulkCreateGrid`
- **CSS Classes**: `.create-master-screen`, `.dynamic-form`, `.field-row`, `.duplicate-warning`
- **Known Risk Areas**: Master type fields are dynamically loaded — schema mismatch between versions causes blank form. Duplicate check is client-side only (name match). Required fields defined in template not enforced server-side. Bulk create has no partial-failure recovery.
- **Future Improvement Notes**: Add server-side duplicate check with merge suggestion. Add template versioning with fallback. Add bulk create with transaction rollback on failure. Add field-level audit for master changes. Add import-from-Excel with column mapping.

### 2.46 Settings Screens (components/settings/index)
- **Route Keys**: `settings-general`, `settings-print`, `settings-backup`, `settings-import`
- **File Path**: `screens/SettingsScreen.jsx` (sub-routes loaded via `components/settings/index`)
- **Props**: None
- **APIs Used**: Same as SettingsScreen (`getSettings`, `updateSetting`, etc.)
- **Dependencies**: `config/storageKeys.js`
- **Child Components**: Settings sub-forms based on active sub-tab
- **CSS Classes**: `.settings-tab-content`, `.setting-field`, `.save-indicator`
- **Known Risk Areas**: Sub-tab state not persisted across app restart. Sub-tab validation runs independently — cross-tab setting conflicts not detected. No settings search.
- **Future Improvement Notes**: Add cross-tab validation. Add settings search. Add settings change log. Add sub-tab state restoration on restart. Add factory-reset per sub-tab individually.
## 3. Database Schema Reference

### 3.1 System Tables

#### 3.1.1 `settings`
| Column | Type | Notes |
|--------|------|-------|
| `key` | TEXT PK | Setting identifier |
| `value` | TEXT | JSON-encoded value |
| `updated_at` | TEXT | ISO 8601 timestamp |

#### 3.1.2 `company_settings`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `company_id` | TEXT FK→companies | |
| `key` | TEXT | Setting name |
| `value` | TEXT | JSON-encoded |
| `updated_at` | TEXT | |

#### 3.1.3 `fiscal_years`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `name` | TEXT | e.g. "FY 2025-26" |
| `start_date` | TEXT | ISO date |
| `end_date` | TEXT | ISO date |
| `is_active` | INTEGER | 0/1 |
| `is_closed` | INTEGER | 0/1 |
| `created_at` | TEXT | |

#### 3.1.4 `audit_log`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `timestamp` | TEXT | ISO 8601 |
| `action` | TEXT | CRUD operation |
| `table_name` | TEXT | Affected table |
| `record_id` | INTEGER | Affected record |
| `user` | TEXT | Username/device |
| `details` | TEXT | JSON diff/changes |
| `ip_address` | TEXT | Client IP |

#### 3.1.5 `backup_history`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `file_path` | TEXT | Backup file location |
| `file_size` | INTEGER | Bytes |
| `checksum` | TEXT | SHA-256 |
| `created_at` | TEXT | |
| `status` | TEXT | success/failed |
| `notes` | TEXT | |

### 3.2 Masters Tables

#### 3.2.1 `companies`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `name` | TEXT | Company legal name |
| `gstin` | TEXT | GST registration |
| `pan` | TEXT | PAN number |
| `address` | TEXT | |
| `city` | TEXT | |
| `state` | TEXT | |
| `pincode` | TEXT | |
| `phone` | TEXT | |
| `email` | TEXT | |
| `is_active` | INTEGER | 0/1 soft-delete |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

#### 3.2.2 `parties`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `name` | TEXT | Party/business name |
| `party_type` | TEXT | customer/supplier/both |
| `gstin` | TEXT | GST number |
| `pan` | TEXT | |
| `address` | TEXT | |
| `city` | TEXT | |
| `state` | TEXT | |
| `pincode` | TEXT | |
| `phone` | TEXT | |
| `email` | TEXT | |
| `credit_limit` | REAL | Max credit amount |
| `credit_days` | INTEGER | Payment terms days |
| `opening_balance` | REAL | |
| `opening_balance_type` | TEXT | debit/credit |
| `is_active` | INTEGER | 0/1 |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

#### 3.2.3 `ledgers`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `name` | TEXT | Ledger name |
| `group_name` | TEXT | Accounting group |
| `ledger_type` | TEXT | asset/liability/income/expense |
| `is_bank` | INTEGER | 0/1 |
| `is_cash` | INTEGER | 0/1 |
| `opening_balance` | REAL | |
| `opening_balance_type` | TEXT | debit/credit |
| `is_active` | INTEGER | 0/1 |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

#### 3.2.4 `stock_items`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `name` | TEXT | Item name |
| `code` | TEXT | Item code/SKU |
| `category` | TEXT | Category |
| `unit` | TEXT | Unit of measure |
| `opening_stock` | REAL | |
| `opening_value` | REAL | |
| `rate` | REAL | Default rate |
| `gst_rate` | REAL | GST % |
| `hsn_code` | TEXT | HSN/SAC code |
| `is_active` | INTEGER | 0/1 |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

#### 3.2.5 `categories`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `name` | TEXT | Category name |
| `parent_id` | INTEGER FK | Self-referencing |
| `description` | TEXT | |
| `is_active` | INTEGER | 0/1 |

#### 3.2.6 `units`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `name` | TEXT | Unit name |
| `short_name` | TEXT | Abbreviation |
| `is_active` | INTEGER | 0/1 |

#### 3.2.7 `godowns`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `name` | TEXT | Godown/warehouse name |
| `parent_id` | INTEGER FK | Self-referencing |
| `address` | TEXT | |
| `is_active` | INTEGER | 0/1 |

#### 3.2.8 `gst_rates`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `rate` | REAL | GST % |
| `hsn_code` | TEXT | HSN code prefix |
| `description` | TEXT | |
| `effective_from` | TEXT | Date |
| `effective_to` | TEXT | Date (null=current) |

#### 3.2.9 `document_tags`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `name` | TEXT | Tag name |
| `color` | TEXT | Hex color |

### 3.3 Transaction Tables (Vouchers)

#### 3.3.1 `sales_vouchers`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `voucher_no` | TEXT | Auto-generated |
| `voucher_date` | TEXT | ISO date |
| `party_id` | INTEGER FK→parties | |
| `company_id` | INTEGER FK→companies | |
| `fiscal_year_id` | INTEGER FK→fiscal_years | |
| `narration` | TEXT | |
| `gross_total` | REAL | Before tax |
| `gst_total` | REAL | Tax total |
| `net_total` | REAL | Grand total |
| `round_off` | REAL | Rounding adjustment |
| `is_posted` | INTEGER | 0/1 accounting posted |
| `is_deleted` | INTEGER | 0/1 soft-delete |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

#### 3.3.2 `sales_voucher_items`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `voucher_id` | INTEGER FK→sales_vouchers | |
| `stock_item_id` | INTEGER FK→stock_items | |
| `quantity` | REAL | |
| `rate` | REAL | |
| `amount` | REAL | quantity × rate |
| `gst_rate` | REAL | |
| `gst_amount` | REAL | |
| `total` | REAL | amount + gst_amount |

#### 3.3.3 `purchase_vouchers`
Mirrors sales_vouchers with `party_id` as supplier. Same columns plus `invoice_ref` (TEXT), `supplier_invoice_no` (TEXT), `supplier_invoice_date` (TEXT).

#### 3.3.4 `purchase_voucher_items`
Mirrors sales_voucher_items structure.

#### 3.3.5 `payment_vouchers`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `voucher_no` | TEXT | |
| `voucher_date` | TEXT | |
| `party_id` | INTEGER FK→parties | |
| `company_id` | INTEGER FK | |
| `fiscal_year_id` | INTEGER FK | |
| `payment_mode` | TEXT | cash/cheque/transfer |
| `bank_account_id` | INTEGER FK→ledgers | |
| `cheque_no` | TEXT | |
| `cheque_date` | TEXT | |
| `amount` | REAL | |
| `narration` | TEXT | |
| `is_posted` | INTEGER | |
| `is_deleted` | INTEGER | |
| `created_at` | TEXT | |

#### 3.3.6 `payment_voucher_bills`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `voucher_id` | INTEGER FK→payment_vouchers | |
| `bill_id` | INTEGER FK→sales_vouchers | Ref invoice |
| `bill_type` | TEXT | sales/purchase |
| `amount_paid` | REAL | |

#### 3.3.7 `receipt_vouchers`
Mirrors payment_vouchers structure.

#### 3.3.8 `receipt_voucher_bills`
Mirrors payment_voucher_bills.

#### 3.3.9 `journal_vouchers`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `voucher_no` | TEXT | |
| `voucher_date` | TEXT | |
| `company_id` | INTEGER FK | |
| `fiscal_year_id` | INTEGER FK | |
| `narration` | TEXT | |
| `is_contra` | INTEGER | Auto-flagged |
| `is_posted` | INTEGER | |
| `is_deleted` | INTEGER | |
| `created_at` | TEXT | |

#### 3.3.10 `journal_voucher_entries`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `voucher_id` | INTEGER FK→journal_vouchers | |
| `ledger_id` | INTEGER FK→ledgers | |
| `debit_amount` | REAL | |
| `credit_amount` | REAL | |
| `narration` | TEXT | Per-line narration |

#### 3.3.11 `credit_notes`
Mirrors sales_vouchers with additional `reference_voucher_id` (FK→sales_vouchers) and `credit_note_type` (TEXT — GST/non-GST).

#### 3.3.12 `credit_note_items`
Mirrors sales_voucher_items.

#### 3.3.13 `debit_notes`
Mirrors purchase_vouchers with `reference_voucher_id` (FK→purchase_vouchers) and `debit_note_type`.

#### 3.3.14 `debit_note_items`
Mirrors purchase_voucher_items.

#### 3.3.15 `contra_vouchers`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `voucher_no` | TEXT | |
| `voucher_date` | TEXT | |
| `company_id` | INTEGER FK | |
| `fiscal_year_id` | INTEGER FK | |
| `from_account_id` | INTEGER FK→ledgers | |
| `to_account_id` | INTEGER FK→ledgers | |
| `amount` | REAL | |
| `narration` | TEXT | |
| `is_posted` | INTEGER | |
| `is_deleted` | INTEGER | |

#### 3.3.16 `delivery_notes`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `voucher_no` | TEXT | |
| `voucher_date` | TEXT | |
| `party_id` | INTEGER FK→parties | |
| `company_id` | INTEGER FK | |
| `fiscal_year_id` | INTEGER FK | |
| `transport_name` | TEXT | |
| `vehicle_no` | TEXT | |
| `eway_bill_no` | TEXT | |
| `narration` | TEXT | |
| `is_deleted` | INTEGER | |
| `created_at` | TEXT | |

#### 3.3.17 `delivery_note_items`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `voucher_id` | INTEGER FK→delivery_notes | |
| `stock_item_id` | INTEGER FK | |
| `quantity` | REAL | |
| `rate` | REAL | |
| `amount` | REAL | |

#### 3.3.18 `receipt_notes`
Mirrors delivery_notes with `purchase_order_id` FK, `inspection_status` TEXT.

#### 3.3.19 `receipt_note_items`
Mirrors delivery_note_items.

#### 3.3.20 `stock_journals`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `voucher_no` | TEXT | |
| `voucher_date` | TEXT | |
| `company_id` | INTEGER FK | |
| `fiscal_year_id` | INTEGER FK | |
| `narration` | TEXT | |
| `is_deleted` | INTEGER | |

#### 3.3.21 `stock_journal_items`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `voucher_id` | INTEGER FK→stock_journals | |
| `stock_item_id` | INTEGER FK | |
| `from_godown_id` | INTEGER FK→godowns | |
| `to_godown_id` | INTEGER FK→godowns | |
| `quantity` | REAL | |
| `rate` | REAL | |

#### 3.3.22 `physical_stock`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `voucher_no` | TEXT | |
| `voucher_date` | TEXT | |
| `company_id` | INTEGER FK | |
| `fiscal_year_id` | INTEGER FK | |
| `godown_id` | INTEGER FK→godowns | |
| `is_frozen` | INTEGER | 0/1 |
| `narration` | TEXT | |

#### 3.3.23 `physical_stock_items`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `voucher_id` | INTEGER FK→physical_stock | |
| `stock_item_id` | INTEGER FK | |
| `book_quantity` | REAL | System count |
| `actual_quantity` | REAL | Physical count |
| `variance` | REAL | actual − book |
| `rate` | REAL | |

#### 3.3.24 `sales_orders`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `order_no` | TEXT | |
| `order_date` | TEXT | |
| `party_id` | INTEGER FK→parties | |
| `company_id` | INTEGER FK | |
| `fiscal_year_id` | INTEGER FK | |
| `delivery_date` | TEXT | Expected |
| `terms` | TEXT | |
| `status` | TEXT | open/partial/closed |
| `is_deleted` | INTEGER | |

#### 3.3.25 `sales_order_items`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `order_id` | INTEGER FK→sales_orders | |
| `stock_item_id` | INTEGER FK | |
| `quantity` | REAL | Ordered |
| `rate` | REAL | |
| `amount` | REAL | |
| `delivered_quantity` | REAL | Fulfilled |

#### 3.3.26 `purchase_orders`
Mirrors sales_orders with `supplier_id` FK.

#### 3.3.27 `purchase_order_items`
Mirrors sales_order_items.

### 3.4 Accounting Tables

#### 3.4.1 `accounting_entries`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `voucher_type` | TEXT | e.g. sales, payment |
| `voucher_id` | INTEGER | FK to respective voucher |
| `ledger_id` | INTEGER FK→ledgers | |
| `debit_amount` | REAL | |
| `credit_amount` | REAL | |
| `entry_date` | TEXT | |
| `company_id` | INTEGER FK | |
| `fiscal_year_id` | INTEGER FK | |
| `narration` | TEXT | |
| `created_at` | TEXT | |

#### 3.4.2 `gst_entries`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `voucher_type` | TEXT | |
| `voucher_id` | INTEGER | |
| `gst_type` | TEXT | CGST/SGST/IGST |
| `gst_rate` | REAL | |
| `taxable_amount` | REAL | |
| `gst_amount` | REAL | |
| `party_id` | INTEGER FK | |
| `entry_date` | TEXT | |

#### 3.4.3 `ledger_balances`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `ledger_id` | INTEGER FK→ledgers | |
| `fiscal_year_id` | INTEGER FK | |
| `opening_balance` | REAL | |
| `opening_balance_type` | TEXT | debit/credit |
| `total_debits` | REAL | YTD |
| `total_credits` | REAL | YTD |
| `closing_balance` | REAL | |
| `closing_balance_type` | TEXT | |

### 3.5 Inventory Tables

#### 3.5.1 `stock_ledger`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `stock_item_id` | INTEGER FK | |
| `godown_id` | INTEGER FK→godowns | |
| `voucher_type` | TEXT | Transaction type |
| `voucher_id` | INTEGER | |
| `quantity_in` | REAL | |
| `quantity_out` | REAL | |
| `rate` | REAL | |
| `balance_quantity` | REAL | Running balance |
| `balance_value` | REAL | Running value |
| `entry_date` | TEXT | |
| `created_at` | TEXT | |

#### 3.5.2 `stock_batches`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `stock_item_id` | INTEGER FK | |
| `godown_id` | INTEGER FK | |
| `batch_no` | TEXT | |
| `manufacturing_date` | TEXT | |
| `expiry_date` | TEXT | |
| `quantity` | REAL | |
| `rate` | REAL | |

### 3.6 Document Tables

#### 3.6.1 `documents`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `file_name` | TEXT | Original filename |
| `file_path` | TEXT | Storage location |
| `file_size` | INTEGER | Bytes |
| `mime_type` | TEXT | |
| `voucher_type` | TEXT | Associated transaction type |
| `voucher_id` | INTEGER | FK |
| `company_id` | INTEGER FK | |
| `notes` | TEXT | |
| `is_deleted` | INTEGER | |
| `created_at` | TEXT | |

#### 3.6.2 `document_tags_map`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `document_id` | INTEGER FK→documents | |
| `tag_id` | INTEGER FK→document_tags | |

### 3.7 Operations Tables

#### 3.7.1 `operations_log`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `operation_type` | TEXT | e.g. import, export, backup |
| `status` | TEXT | running/completed/failed |
| `started_at` | TEXT | |
| `completed_at` | TEXT | |
| `details` | TEXT | JSON metadata |
| `error_message` | TEXT | |

### 3.8 CRAC Tables

#### 3.8.1 `crac_entries`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `crac_no` | TEXT | CRAC identifier |
| `title` | TEXT | CRAC description |
| `category` | TEXT | |
| `requested_by` | TEXT | |
| `approved_by` | TEXT | |
| `status` | TEXT | draft/pending/approved/rejected |
| `amount` | REAL | |
| `company_id` | INTEGER FK | |
| `fiscal_year_id` | INTEGER FK | |
| `notes` | TEXT | |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

#### 3.8.2 `crac_approvals`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `crac_id` | INTEGER FK→crac_entries | |
| `approver` | TEXT | |
| `action` | TEXT | approved/rejected |
| `comments` | TEXT | |
| `actioned_at` | TEXT | |

#### 3.8.3 `crac_documents`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `crac_id` | INTEGER FK→crac_entries | |
| `document_id` | INTEGER FK→documents | |
| `document_type` | TEXT | supporting/approval/final |

#### 3.8.4 `order_closure`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `order_type` | TEXT | sales/purchase |
| `order_id` | INTEGER | FK |
| `closure_status` | TEXT | initiated/verified/completed |
| `checklist_data` | TEXT | JSON checklist |
| `closed_by` | TEXT | |
| `closed_at` | TEXT | |

#### 3.8.5 `payment_readiness`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `voucher_type` | TEXT | |
| `voucher_id` | INTEGER | |
| `is_ready` | INTEGER | 0/1 |
| `hold_reason` | TEXT | |
| `verified_by` | TEXT | |
| `verified_at` | TEXT | |

### 3.9 Bank & Reconciliation Tables

#### 3.9.1 `bank_rows`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `bank_account_id` | INTEGER FK→ledgers | |
| `transaction_date` | TEXT | |
| `description` | TEXT | |
| `cheque_no` | TEXT | |
| `debit_amount` | REAL | |
| `credit_amount` | REAL | |
| `balance` | REAL | |
| `is_reconciled` | INTEGER | 0/1 |
| `reconciled_at` | TEXT | |
| `voucher_type` | TEXT | Linked voucher |
| `voucher_id` | INTEGER | |

### 3.10 Financial Statement Tables

#### 3.10.1 `financial_reports`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `report_type` | TEXT | P&L / BalanceSheet / TrialBalance |
| `company_id` | INTEGER FK | |
| `fiscal_year_id` | INTEGER FK | |
| `from_date` | TEXT | |
| `to_date` | TEXT | |
| `data` | TEXT | JSON snapshot |
| `generated_at` | TEXT | |

### 3.11 Proposal Tables

#### 3.11.1 `proposals`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `proposal_no` | TEXT | |
| `party_id` | INTEGER FK→parties | |
| `company_id` | INTEGER FK | |
| `valid_until` | TEXT | |
| `status` | TEXT | draft/sent/accepted/rejected |
| `total_amount` | REAL | |
| `terms` | TEXT | |
| `created_at` | TEXT | |

#### 3.11.2 `proposal_items`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `proposal_id` | INTEGER FK→proposals | |
| `stock_item_id` | INTEGER FK | |
| `quantity` | REAL | |
| `rate` | REAL | |
| `amount` | REAL | |

### 3.12 Import Tables

#### 3.12.1 `tally_import_log`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `file_name` | TEXT | Source XML filename |
| `import_type` | TEXT | masters/transactions |
| `status` | TEXT | success/partial/failed |
| `records_imported` | INTEGER | |
| `records_failed` | INTEGER | |
| `error_log` | TEXT | JSON array |
| `imported_at` | TEXT | |

#### 3.12.2 `import_templates`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `name` | TEXT | Template name |
| `template_type` | TEXT | party/item/voucher |
| `column_mapping` | TEXT | JSON mapping |
| `created_at` | TEXT | |

### 3.13 Advanced Tables

#### 3.13.1 `email_config`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `smtp_host` | TEXT | |
| `smtp_port` | INTEGER | |
| `smtp_user` | TEXT | |
| `smtp_pass` | TEXT | Encrypted |
| `from_address` | TEXT | |
| `is_default` | INTEGER | |

#### 3.13.2 `notification_log`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `notification_type` | TEXT | email/sms/in-app |
| `recipient` | TEXT | |
| `subject` | TEXT | |
| `message` | TEXT | |
| `status` | TEXT | sent/failed |
| `sent_at` | TEXT | |

#### 3.13.3 `user_preferences`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `key` | TEXT | Preference key |
| `value` | TEXT | JSON value |
| `user` | TEXT | Device/user identifier |

### 3.14 Module Tables

#### 3.14.1 `module_state`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `module_name` | TEXT | Module identifier |
| `state` | TEXT | JSON state data |
| `updated_at` | TEXT | |

### 3.15 Health & Integrity Tables

#### 3.15.1 `integrity_check_results`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `check_name` | TEXT | |
| `status` | TEXT | pass/fail/warning |
| `details` | TEXT | JSON |
| `checked_at` | TEXT | |

#### 3.15.2 `health_alerts`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `alert_type` | TEXT | |
| `severity` | TEXT | info/warning/critical |
| `message` | TEXT | |
| `is_read` | INTEGER | 0/1 |
| `created_at` | TEXT | |

### 3.16 Indexes Summary
All FK columns indexed automatically by SQLite FK enforcement. Additional explicit indexes:
- `idx_accounting_entries_date` ON accounting_entries(entry_date)
- `idx_accounting_entries_voucher` ON accounting_entries(voucher_type, voucher_id)
- `idx_stock_ledger_item` ON stock_ledger(stock_item_id, godown_id)
- `idx_gst_entries_voucher` ON gst_entries(voucher_type, voucher_id)
- `idx_audit_log_timestamp` ON audit_log(timestamp)
- `idx_parties_name` ON parties(name)
- `idx_stock_items_code` ON stock_items(code)
- `idx_ledger_balances_fy` ON ledger_balances(ledger_id, fiscal_year_id)
- `idx_bank_rows_reconciled` ON bank_rows(is_reconciled, bank_account_id)
## 4. Exported Function Reference

All functions exported from `src/main/database/init.js`. Grouped by module.

### 4.1 System & Company Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `getSystemInfo()` | `→ {version, dbSize, tableCount}` | App & DB metadata |
| `getAllCompanies()` | `→ Array<Company>` | All active companies |
| `createCompany(data)` | `data: CompanyInput → Integer` | Insert new company |
| `updateCompany(id, data)` | `(id, data) → void` | Update company fields |
| `deleteCompany(id)` | `(id) → void` | Soft-delete company |
| `getCompanyInfo()` | `→ Company` | Active company context |
| `switchCompany(id)` | `(id) → void` | Switch active company |

### 4.2 Settings & Fiscal Year Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `getSettings()` | `→ Object` | All settings key-value |
| `updateSetting(key, value)` | `(key, value) → void` | Upsert setting |
| `resetSettings()` | `→ void` | Factory reset |
| `getFiscalYearList()` | `→ Array<FiscalYear>` | All fiscal years |
| `createFiscalYear(data)` | `(data) → Integer` | New fiscal year |
| `updateFiscalYear(id, data)` | `(id, data) → void` | Update FY |
| `closeFiscalYear(id)` | `(id) → void` | Mark FY closed |
| `getFiscalYear()` | `→ FiscalYear` | Active FY |
| `getCompanySettings()` | `→ Object` | Company-level settings |

### 4.3 Master Data Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `getPartyList(filter)` | `(filter?) → Array<Party>` | All parties |
| `getSupplierList()` | `→ Array<Party>` | Parties where type=supplier/both |
| `createParty(data)` | `(data) → Integer` | Create party |
| `updateParty(id, data)` | `(id, data) → void` | Update party |
| `deleteParty(id)` | `(id) → void` | Soft-delete |
| `getLedgerList()` | `→ Array<Ledger>` | All ledgers |
| `createLedger(data)` | `(data) → Integer` | Create ledger |
| `updateLedger(id, data)` | `(id, data) → void` | Update ledger |
| `deleteLedger(id)` | `(id) → void` | Soft-delete |
| `getStockItemList()` | `→ Array<StockItem>` | All stock items |
| `createStockItem(data)` | `(data) → Integer` | Create item |
| `updateStockItem(id, data)` | `(id, data) → void` | Update item |
| `deleteStockItem(id)` | `(id) → void` | Soft-delete |
| `getGstRates()` | `→ Array<GstRate>` | Active GST rates |
| `createGstRate(data)` | `(data) → Integer` | New rate |
| `updateGstRate(id, data)` | `(id, data) → void` | |
| `deleteGstRate(id)` | `(id) → void` | |
| `getCategoryList()` | `→ Array<Category>` | All categories |
| `createCategory(data)` | `(data) → Integer` | |
| `updateCategory(id, data)` | `(id, data) → void` | |
| `deleteCategory(id)` | `(id) → void` | |
| `getUnitList()` | `→ Array<Unit>` | All units |
| `createUnit(data)` | `(data) → Integer` | |
| `updateUnit(id, data)` | `(id, data) → void` | |
| `deleteUnit(id)` | `(id) → void` | |
| `getGodownList()` | `→ Array<Godown>` | All godowns |
| `createGodown(data)` | `(data) → Integer` | |
| `updateGodown(id, data)` | `(id, data) → void` | |
| `deleteGodown(id)` | `(id) → void` | |

### 4.4 Voucher CRUD Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `saveSalesVoucher(data)` | `(data) → Integer` | Create/update sales |
| `getSalesVoucher(id)` | `(id) → Voucher` | Single with items |
| `deleteSalesVoucher(id)` | `(id) → void` | Soft-delete |
| `savePurchaseVoucher(data)` | `(data) → Integer` | Create/update purchase |
| `getPurchaseVoucher(id)` | `(id) → Voucher` | |
| `deletePurchaseVoucher(id)` | `(id) → void` | |
| `savePaymentVoucher(data)` | `(data) → Integer` | Create/update payment |
| `getPaymentVoucher(id)` | `(id) → Voucher` | |
| `deletePaymentVoucher(id)` | `(id) → void` | |
| `saveReceiptVoucher(data)` | `(data) → Integer` | |
| `getReceiptVoucher(id)` | `(id) → Voucher` | |
| `deleteReceiptVoucher(id)` | `(id) → void` | |
| `saveJournalVoucher(data)` | `(data) → Integer` | With entries validation |
| `getJournalVoucher(id)` | `(id) → Voucher` | |
| `deleteJournalVoucher(id)` | `(id) → void` | |
| `saveCreditNote(data)` | `(data) → Integer` | |
| `getCreditNote(id)` | `(id) → Voucher` | |
| `deleteCreditNote(id)` | `(id) → void` | |
| `saveDebitNote(data)` | `(data) → Integer` | |
| `getDebitNote(id)` | `(id) → Voucher` | |
| `deleteDebitNote(id)` | `(id) → void` | |
| `saveContraVoucher(data)` | `(data) → Integer` | |
| `getContraVoucher(id)` | `(id) → Voucher` | |
| `deleteContraVoucher(id)` | `(id) → void` | |
| `saveDeliveryNote(data)` | `(data) → Integer` | |
| `getDeliveryNote(id)` | `(id) → Voucher` | |
| `deleteDeliveryNote(id)` | `(id) → void` | |
| `saveReceiptNote(data)` | `(data) → Integer` | |
| `getReceiptNote(id)` | `(id) → Voucher` | |
| `deleteReceiptNote(id)` | `(id) → void` | |
| `saveStockJournal(data)` | `(data) → Integer` | |
| `getStockJournal(id)` | `(id) → Voucher` | |
| `deleteStockJournal(id)` | `(id) → void` | |
| `savePhysicalStock(data)` | `(data) → Integer` | |
| `getPhysicalStock(id)` | `(id) → Voucher` | |
| `deletePhysicalStock(id)` | `(id) → void` | |
| `saveSalesOrder(data)` | `(data) → Integer` | |
| `getSalesOrder(id)` | `(id) → Order` | |
| `deleteSalesOrder(id)` | `(id) → void` | |
| `savePurchaseOrder(data)` | `(data) → Integer` | |
| `getPurchaseOrder(id)` | `(id) → Order` | |
| `deletePurchaseOrder(id)` | `(id) → void` | |

### 4.5 Accounting Engine Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `postVoucherToAccounting(voucherType, voucherId)` | `(type, id) → void` | Generate accounting entries |
| `reverseAccountingEntries(voucherType, voucherId)` | `(type, id) → void` | Reverse on delete |
| `updateLedgerBalances(ledgerId, fyId)` | `(ledgerId, fyId) → void` | Recalculate balance |
| `recalculateAllBalances(fyId)` | `(fyId) → void` | Full balance rebuild |
| `getTrialBalance(fyId, companyId)` | `→ Array<{ledger, debit, credit}>` | Trial balance |
| `getProfitAndLoss(fyId, companyId, fromDate, toDate)` | `→ Object` | P&L statement |
| `getBalanceSheet(fyId, companyId, asOnDate)` | `→ Object` | Balance sheet |
| `getGstSummary(fyId, companyId, fromDate, toDate)` | `→ Object` | GST return summary |
| `getPartyLedger(partyId, fyId)` | `→ Array<Entry>` | Party ledger report |

### 4.6 Inventory Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `getStockSummary(companyId, godownId)` | `→ Array<StockRow>` | Current stock |
| `getStockMovement(itemId, fromDate, toDate)` | `→ Array<Movement>` | Item movement log |
| `getStockValuation(itemId, godownId)` | `→ Number` | Avg cost valuation |
| `updateStockLedger(voucherType, voucherId)` | `(type, id) → void` | Post inventory changes |
| `reverseStockEntries(voucherType, voucherId)` | `(type, id) → void` | Reverse on delete |

### 4.7 Document Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `listDocuments(voucherType?, voucherId?)` | `→ Array<Document>` | Filtered list |
| `uploadDocument(filePath, metadata)` | `→ Integer` | Copy to doc store |
| `downloadDocument(id)` | `→ String` | Get file path |
| `deleteDocument(id)` | `(id) → void` | Soft-delete |

### 4.8 Health & Verification Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `getHealthSummary()` | `→ Object` | Overall health |
| `runHealthCheck()` | `→ Array<CheckResult>` | All checks |
| `verifyAccounting()` | `→ Array<Issue>` | Accounting integrity |
| `getAccountingIssues()` | `→ Array<Issue>` | Current issues |
| `fixAccountingIssue(issueId)` | `→ void` | Auto-fix |
| `runIntegrityCheck()` | `→ Array<Issue>` | DB integrity |
| `getIntegrityIssues()` | `→ Array<Issue>` | |
| `repairIntegrity(issueId)` | `→ void` | Auto-repair |
| `runDiagnostic()` | `→ Object` | Diagnostic report |
| `getDiagnosticLog()` | `→ Array<String>` | Log output |
| `runVerification(checks)` | `→ Object` | Selected checks |
| `getVerificationHistory()` | `→ Array<Result>` | Past results |

### 4.9 Backup & Restore Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `createBackup()` | `→ String` | Backup file path |
| `restoreBackup(filePath)` | `→ void` | Full restore |
| `getBackupList()` | `→ Array<Backup>` | Available |
| `deleteBackup(id)` | `→ void` | Remove file |
| `getBackupSchedule()` | `→ Object` | Schedule config |
| `setBackupSchedule(config)` | `(config) → void` | |

### 4.10 CRAC Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `saveCRACEntry(data)` | `(data) → Integer` | Create/update CRAC |
| `getCRACEntry(id)` | `(id) → CRAC` | |
| `deleteCRACEntry(id)` | `(id) → void` | |
| `getCRACList()` | `→ Array<CRAC>` | Paginated |
| `getCRACSummary()` | `→ Object` | Stats |
| `approveCRAC(id, comments)` | `→ void` | |
| `rejectCRAC(id, reason)` | `→ void` | |
| `getCRACTrackerData()` | `→ Object` | Timeline |
| `getCRACTimeline(id)` | `(id) → Array<Event>` | |
| `closeOrder(orderType, orderId)` | `→ void` | Order closure |
| `getClosureStatus(orderId)` | `→ Object` | |
| `getPaymentReadiness()` | `→ Array<Readiness>` | |
| `markReadyForPayment(voucherType, voucherId)` | `→ void` | |
| `holdPayment(voucherType, voucherId, reason)` | `→ void` | |

### 4.11 Bank Reconciliation Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `getBankRows(bankAccountId)` | `→ Array<BankRow>` | |
| `updateBankRow(id, data)` | `(id, data) → void` | |
| `deleteBankRow(id)` | `(id) → void` | |
| `reconcileBankRow(id, voucherRef)` | `→ void` | Match to voucher |

### 4.12 Report Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `getReportList()` | `→ Array<ReportDef>` | Available reports |
| `runReport(reportName, params)` | `→ Object` | Execute |
| `exportReport(reportName, params, format)` | `→ String` | File path |
| `getDashboardData()` | `→ Object` | Summary cards |
| `getSummaryData()` | `→ Object` | Period summary |
| `getPeriodSummary(fromDate, toDate)` | `→ Object` | |
| `getProfitabilityData(fromDate, toDate)` | `→ Object` | |
| `getPartyProfitability(partyId, fromDate, toDate)` | `→ Object` | |
| `getProductProfitability(itemId, fromDate, toDate)` | `→ Object` | |
| `getOperationsDrillDownData(filters)` | `→ Array<Transaction>` | |
| `getOperationDetail(voucherType, voucherId)` | `→ Object` | |

### 4.13 Master Data Tools Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `getAllMasters()` | `→ Object` | All master records |
| `exportMasterData(masterType)` | `→ String` | CSV file path |
| `importMasterData(masterType, filePath)` | `→ ImportResult` | Bulk import |
| `validateMasterData()` | `→ Array<Issue>` | Consistency |

### 4.14 Performance & Maintenance Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `getPerformanceMetrics()` | `→ Object` | Timing stats |
| `getSlowQueries()` | `→ Array<Query>` | Slow query log |
| `optimizeTable(tableName)` | `→ void` | Vacuum/reindex |
| `reindexTable(tableName)` | `→ void` | |
| `reindexAll()` | `→ void` | |
| `getIndexStats()` | `→ Array<IndexStat>` | Fragmentation |
| `getDbStats()` | `→ Object` | DB metadata |
| `getSystemHealth()` | `→ Object` | CPU/RAM/disk |

### 4.15 Import/Export Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `importFromTally(filePath)` | `→ ImportResult` | XML import |
| `getImportTemplates()` | `→ Array<Template>` | |
| `saveImportTemplate(data)` | `→ Integer` | |
| `deleteImportTemplate(id)` | `→ void` | |

### 4.16 Help & Notification Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `getHelpContent(topic)` | `→ String` | Markdown content |
| `searchHelp(query)` | `→ Array<Result>` | |
| `getTrainingModules()` | `→ Array<Module>` | |
| `trackHelpUsage(topic)` | `→ void` | Analytics |
| `getRecentAlerts()` | `→ Array<Alert>` | |
| `dismissAlert(id)` | `→ void` | |

### 4.17 Print Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `printVoucher(voucherType, voucherId)` | `→ void` | Trigger print dialog |

---

## 5. IPC Channel Reference

All channels registered in `src/main/main.js`. Format: `channel → [direction] → handler`.

### 5.1 System & Company Channels

| Channel | Direction | Handler | Description |
|---------|-----------|---------|-------------|
| `api:get-system-info` | renderer→main | `getSystemInfo` | App/DB info |
| `api:get-all-companies` | renderer→main | `getAllCompanies` | Company list |
| `api:create-company` | renderer→main | `createCompany` | New company |
| `api:update-company` | renderer→main | `updateCompany` | Edit company |
| `api:delete-company` | renderer→main | `deleteCompany` | Soft-delete |
| `api:get-company-info` | renderer→main | `getCompanyInfo` | Active context |
| `api:switch-company` | renderer→main | `switchCompany` | Switch active |

### 5.2 Settings & Fiscal Year Channels

| Channel | Direction | Handler |
|---------|-----------|---------|
| `api:get-settings` | renderer→main | `getSettings` |
| `api:update-setting` | renderer→main | `updateSetting` |
| `api:reset-settings` | renderer→main | `resetSettings` |
| `api:get-fiscal-year-list` | renderer→main | `getFiscalYearList` |
| `api:create-fiscal-year` | renderer→main | `createFiscalYear` |
| `api:update-fiscal-year` | renderer→main | `updateFiscalYear` |
| `api:close-fiscal-year` | renderer→main | `closeFiscalYear` |
| `api:get-fiscal-year` | renderer→main | `getFiscalYear` |
| `api:get-company-settings` | renderer→main | `getCompanySettings` |

### 5.3 Master Data Channels

| Channel | Direction | Handler |
|---------|-----------|---------|
| `api:get-party-list` | renderer→main | `getPartyList` |
| `api:get-supplier-list` | renderer→main | `getSupplierList` |
| `api:create-party` | renderer→main | `createParty` |
| `api:update-party` | renderer→main | `updateParty` |
| `api:delete-party` | renderer→main | `deleteParty` |
| `api:get-ledger-list` | renderer→main | `getLedgerList` |
| `api:create-ledger` | renderer→main | `createLedger` |
| `api:update-ledger` | renderer→main | `updateLedger` |
| `api:delete-ledger` | renderer→main | `deleteLedger` |
| `api:get-stock-item-list` | renderer→main | `getStockItemList` |
| `api:create-stock-item` | renderer→main | `createStockItem` |
| `api:update-stock-item` | renderer→main | `updateStockItem` |
| `api:delete-stock-item` | renderer→main | `deleteStockItem` |
| `api:get-gst-rates` | renderer→main | `getGstRates` |
| `api:create-gst-rate` | renderer→main | `createGstRate` |
| `api:update-gst-rate` | renderer→main | `updateGstRate` |
| `api:delete-gst-rate` | renderer→main | `deleteGstRate` |
| `api:get-category-list` | renderer→main | `getCategoryList` |
| `api:create-category` | renderer→main | `createCategory` |
| `api:update-category` | renderer→main | `updateCategory` |
| `api:delete-category` | renderer→main | `deleteCategory` |
| `api:get-unit-list` | renderer→main | `getUnitList` |
| `api:create-unit` | renderer→main | `createUnit` |
| `api:update-unit` | renderer→main | `updateUnit` |
| `api:delete-unit` | renderer→main | `deleteUnit` |
| `api:get-godown-list` | renderer→main | `getGodownList` |
| `api:create-godown` | renderer→main | `createGodown` |
| `api:update-godown` | renderer→main | `updateGodown` |
| `api:delete-godown` | renderer→main | `deleteGodown` |

### 5.4 Voucher Channels

| Channel | Direction | Handler |
|---------|-----------|---------|
| `api:save-sales-voucher` | r→m | `saveSalesVoucher` |
| `api:get-sales-voucher` | r→m | `getSalesVoucher` |
| `api:delete-sales-voucher` | r→m | `deleteSalesVoucher` |
| `api:save-purchase-voucher` | r→m | `savePurchaseVoucher` |
| `api:get-purchase-voucher` | r→m | `getPurchaseVoucher` |
| `api:delete-purchase-voucher` | r→m | `deletePurchaseVoucher` |
| `api:save-payment-voucher` | r→m | `savePaymentVoucher` |
| `api:get-payment-voucher` | r→m | `getPaymentVoucher` |
| `api:delete-payment-voucher` | r→m | `deletePaymentVoucher` |
| `api:save-receipt-voucher` | r→m | `saveReceiptVoucher` |
| `api:get-receipt-voucher` | r→m | `getReceiptVoucher` |
| `api:delete-receipt-voucher` | r→m | `deleteReceiptVoucher` |
| `api:save-journal-voucher` | r→m | `saveJournalVoucher` |
| `api:get-journal-voucher` | r→m | `getJournalVoucher` |
| `api:delete-journal-voucher` | r→m | `deleteJournalVoucher` |
| `api:save-credit-note` | r→m | `saveCreditNote` |
| `api:get-credit-note` | r→m | `getCreditNote` |
| `api:delete-credit-note` | r→m | `deleteCreditNote` |
| `api:save-debit-note` | r→m | `saveDebitNote` |
| `api:get-debit-note` | r→m | `getDebitNote` |
| `api:delete-debit-note` | r→m | `deleteDebitNote` |
| `api:save-contra-voucher` | r→m | `saveContraVoucher` |
| `api:get-contra-voucher` | r→m | `getContraVoucher` |
| `api:delete-contra-voucher` | r→m | `deleteContraVoucher` |
| `api:save-delivery-note` | r→m | `saveDeliveryNote` |
| `api:get-delivery-note` | r→m | `getDeliveryNote` |
| `api:delete-delivery-note` | r→m | `deleteDeliveryNote` |
| `api:save-receipt-note` | r→m | `saveReceiptNote` |
| `api:get-receipt-note` | r→m | `getReceiptNote` |
| `api:delete-receipt-note` | r→m | `deleteReceiptNote` |
| `api:save-stock-journal` | r→m | `saveStockJournal` |
| `api:get-stock-journal` | r→m | `getStockJournal` |
| `api:delete-stock-journal` | r→m | `deleteStockJournal` |
| `api:save-physical-stock` | r→m | `savePhysicalStock` |
| `api:get-physical-stock` | r→m | `getPhysicalStock` |
| `api:delete-physical-stock` | r→m | `deletePhysicalStock` |
| `api:save-sales-order` | r→m | `saveSalesOrder` |
| `api:get-sales-order` | r→m | `getSalesOrder` |
| `api:delete-sales-order` | r→m | `deleteSalesOrder` |
| `api:save-purchase-order` | r→m | `savePurchaseOrder` |
| `api:get-purchase-order` | r→m | `getPurchaseOrder` |
| `api:delete-purchase-order` | r→m | `deletePurchaseOrder` |

### 5.5 Accounting Channels

| Channel | Direction | Handler |
|---------|-----------|---------|
| `api:post-voucher-to-accounting` | r→m | `postVoucherToAccounting` |
| `api:reverse-accounting-entries` | r→m | `reverseAccountingEntries` |
| `api:update-ledger-balances` | r→m | `updateLedgerBalances` |
| `api:recalculate-all-balances` | r→m | `recalculateAllBalances` |
| `api:get-trial-balance` | r→m | `getTrialBalance` |
| `api:get-profit-and-loss` | r→m | `getProfitAndLoss` |
| `api:get-balance-sheet` | r→m | `getBalanceSheet` |
| `api:get-gst-summary` | r→m | `getGstSummary` |
| `api:get-party-ledger` | r→m | `getPartyLedger` |

### 5.6 Inventory Channels

| Channel | Direction | Handler |
|---------|-----------|---------|
| `api:get-stock-summary` | r→m | `getStockSummary` |
| `api:get-stock-movement` | r→m | `getStockMovement` |
| `api:get-stock-valuation` | r→m | `getStockValuation` |
| `api:update-stock-ledger` | r→m | `updateStockLedger` |
| `api:reverse-stock-entries` | r→m | `reverseStockEntries` |

### 5.7 Document Channels

| Channel | Direction | Handler |
|---------|-----------|---------|
| `api:list-documents` | r→m | `listDocuments` |
| `api:upload-document` | r→m | `uploadDocument` |
| `api:download-document` | r→m | `downloadDocument` |
| `api:delete-document` | r→m | `deleteDocument` |
| `api:get-document-tags` | r→m | (inline) |

### 5.8 Health & Verification Channels

| Channel | Direction | Handler |
|---------|-----------|---------|
| `api:get-health-summary` | r→m | `getHealthSummary` |
| `api:run-health-check` | r→m | `runHealthCheck` |
| `api:verify-accounting` | r→m | `verifyAccounting` |
| `api:get-accounting-issues` | r→m | `getAccountingIssues` |
| `api:fix-accounting-issue` | r→m | `fixAccountingIssue` |
| `api:run-integrity-check` | r→m | `runIntegrityCheck` |
| `api:get-integrity-issues` | r→m | `getIntegrityIssues` |
| `api:repair-integrity` | r→m | `repairIntegrity` |
| `api:run-diagnostic` | r→m | `runDiagnostic` |
| `api:get-diagnostic-log` | r→m | `getDiagnosticLog` |
| `api:export-diagnostic-report` | r→m | (inline) |
| `api:run-verification` | r→m | `runVerification` |
| `api:get-verification-history` | r→m | `getVerificationHistory` |
| `api:compare-verification` | r→m | (inline) |
| `api:get-recent-alerts` | r→m | `getRecentAlerts` |
| `api:dismiss-alert` | r→m | (inline) |

### 5.9 Backup & Restore Channels

| Channel | Direction | Handler |
|---------|-----------|---------|
| `api:create-backup` | r→m | `createBackup` |
| `api:restore-backup` | r→m | `restoreBackup` |
| `api:get-backup-list` | r→m | `getBackupList` |
| `api:delete-backup` | r→m | `deleteBackup` |
| `api:get-backup-schedule` | r→m | `getBackupSchedule` |
| `api:set-backup-schedule` | r→m | `setBackupSchedule` |

### 5.10 CRAC Channels

| Channel | Direction | Handler |
|---------|-----------|---------|
| `api:save-crac-entry` | r→m | `saveCRACEntry` |
| `api:get-crac-entry` | r→m | `getCRACEntry` |
| `api:delete-crac-entry` | r→m | `deleteCRACEntry` |
| `api:get-crac-list` | r→m | `getCRACList` |
| `api:get-crac-summary` | r→m | `getCRACSummary` |
| `api:approve-crac` | r→m | `approveCRAC` |
| `api:reject-crac` | r→m | `rejectCRAC` |
| `api:get-crac-tracker-data` | r→m | `getCRACTrackerData` |
| `api:get-crac-timeline` | r→m | `getCRACTimeline` |
| `api:close-order` | r→m | `closeOrder` |
| `api:get-closure-status` | r→m | `getClosureStatus` |
| `api:get-closure-documents` | r→m | (inline) |
| `api:get-payment-readiness` | r→m | `getPaymentReadiness` |
| `api:mark-ready-for-payment` | r→m | `markReadyForPayment` |
| `api:hold-payment` | r→m | `holdPayment` |

### 5.11 Bank Channels

| Channel | Direction | Handler |
|---------|-----------|---------|
| `api:get-bank-rows` | r→m | `getBankRows` |
| `api:update-bank-row` | r→m | `updateBankRow` |
| `api:delete-bank-row` | r→m | `deleteBankRow` |
| `api:reconcile-bank-row` | r→m | `reconcileBankRow` |
| `api:get-bank-account-list` | r→m | (inline — filtered ledgers) |

### 5.12 Report Channels

| Channel | Direction | Handler |
|---------|-----------|---------|
| `api:get-report-list` | r→m | `getReportList` |
| `api:run-report` | r→m | `runReport` |
| `api:export-report` | r→m | `exportReport` |
| `api:get-dashboard-data` | r→m | `getDashboardData` |
| `api:get-summary-data` | r→m | `getSummaryData` |
| `api:get-period-summary` | r→m | `getPeriodSummary` |
| `api:get-profitability-data` | r→m | `getProfitabilityData` |
| `api:get-party-profitability` | r→m | `getPartyProfitability` |
| `api:get-product-profitability` | r→m | `getProductProfitability` |
| `api:get-operations-drilldown-data` | r→m | `getOperationsDrillDownData` |
| `api:get-operation-detail` | r→m | `getOperationDetail` |

### 5.13 Master Data Tools Channels

| Channel | Direction | Handler |
|---------|-----------|---------|
| `api:get-all-masters` | r→m | `getAllMasters` |
| `api:export-master-data` | r→m | `exportMasterData` |
| `api:import-master-data` | r→m | `importMasterData` |
| `api:validate-master-data` | r→m | `validateMasterData` |

### 5.14 Performance Channels

| Channel | Direction | Handler |
|---------|-----------|---------|
| `api:get-performance-metrics` | r→m | `getPerformanceMetrics` |
| `api:get-slow-queries` | r→m | `getSlowQueries` |
| `api:optimize-table` | r→m | `optimizeTable` |
| `api:reindex-table` | r→m | `reindexTable` |
| `api:reindex-all` | r→m | `reindexAll` |
| `api:get-index-stats` | r→m | `getIndexStats` |
| `api:get-db-stats` | r→m | `getDbStats` |
| `api:get-system-health` | r→m | `getSystemHealth` |

### 5.15 Import & Other Channels

| Channel | Direction | Handler |
|---------|-----------|---------|
| `api:import-from-tally` | r→m | `importFromTally` |
| `api:get-import-templates` | r→m | `getImportTemplates` |
| `api:save-import-template` | r→m | `saveImportTemplate` |
| `api:delete-import-template` | r→m | `deleteImportTemplate` |
| `api:get-help-content` | r→m | `getHelpContent` |
| `api:search-help` | r→m | `searchHelp` |
| `api:get-training-modules` | r→m | `getTrainingModules` |
| `api:track-help-usage` | r→m | `trackHelpUsage` |
| `api:print-voucher` | r→m | `printVoucher` |
| `api:start-safe-mode` | r→m | (inline) |
| `api:exit-safe-mode` | r→m | (inline) |
| `api:get-app-version` | r→m | (inline) |
| `api:get-cash-account-list` | r→m | (inline — filtered ledgers) |

### 5.16 Main-Process-to-Renderer Channels (Push)

| Channel | Direction | Payload |
|---------|-----------|---------|
| `api:backup-progress` | m→r | `{percent, stage}` |
| `api:health-check-progress` | m→r | `{current, total, status}` |
| `api:diagnostic-output` | m→r | `{line}` |
| `api:integrity-check-progress` | m→r | `{percent}` |
| `api:verification-complete` | m→r | `{result}` |
| `api:company-changed` | m→r | `{companyId}` |
## 6. Component Hierarchy

### 6.1 Renderer Root Tree

```
App (App.jsx)
├── RendererErrorBoundary (stability/RendererErrorBoundary.js)
│   └── AppRouter (React Router)
│       ├── LayoutShell (components/layout/index)
│       │   ├── Sidebar (navigation)
│       │   ├── Header (company info, fiscal year, user)
│       │   └── ContentArea (<Routes>)
│       │       ├── DashboardScreen
│       │       │   ├── SummaryCards (components/dashboard/)
│       │       │   └── FiscalYearBadge
│       │       ├── AllCompaniesRegScreen
│       │       │   ├── MasterDataTable (components/tables/)
│       │       │   └── CompanyForm (components/overlays/)
│       │       ├── VoucherScreens (Sales/Purchase/Payment/Receipt/Journal/CreditNote/DebitNote/Contra)
│       │       │   ├── VoucherForm (components/forms/)
│       │       │   ├── LineItemGrid
│       │       │   ├── GstSummary
│       │       │   └── FooterTotals
│       │       ├── DeliveryNoteScreen / ReceiptNoteScreen
│       │       │   ├── ItemDispatchGrid
│       │       │   ├── TransportDetailSection
│       │       │   └── EwayBillSection
│       │       ├── StockJournalScreen
│       │       │   ├── StockTransferGrid
│       │       │   └── GodownSelector
│       │       ├── PhysicalStockScreen
│       │       │   ├── StockCountGrid
│       │       │   └── VarianceDisplay
│       │       ├── SalesOrderScreen / PurchaseOrderScreen
│       │       │   ├── OrderLineItemGrid
│       │       │   └── DeliverySchedulePanel
│       │       ├── InventoryStockScreen
│       │       │   ├── StockSummaryTable
│       │       │   └── StockMovementChart
│       │       ├── BankRowsTableScreen
│       │       │   ├── BankRowsGrid
│       │       │   └── ReconciliationDialog
│       │       ├── DocumentsScreen
│       │       │   ├── DocumentList
│       │       │   ├── DocumentUploader
│       │       │   └── DocumentPreviewer
│       │       ├── ProfitabilityScreen
│       │       │   ├── ProfitChart
│       │       │   └── PartyBreakdown
│       │       ├── ReadOnlyReportsScreen
│       │       │   ├── ReportListPanel
│       │       │   └── ReportViewer
│       │       ├── ReadOnlySummaryScreen
│       │       │   ├── SummaryCardGrid
│       │       │   └── TrendChart
│       │       ├── SettingsScreen
│       │       │   └── SettingsSubForms (components/settings/)
│       │       ├── KeyboardShortcutsScreen
│       │       │   └── ShortcutCategoryList
│       │       ├── HelpTrainingScreen
│       │       │   ├── HelpSidebar
│       │       │   ├── ContentViewer
│       │       │   └── TrainingModuleCard
│       │       ├── OperationsDrillDownScreen
│       │       │   ├── DrillDownFilterBar
│       │       │   └── TransactionList
│       │       ├── HealthCenterDashboardScreen
│       │       │   ├── HealthScoreCircle
│       │       │   └── CategoryCards
│       │       ├── AccountingVerificationScreen
│       │       │   └── VerificationResultList
│       │       ├── DiagnosticRunScreen
│       │       │   └── DiagnosticProgress
│       │       ├── VerificationConsoleScreen
│       │       │   ├── CheckSelector
│       │       │   └── ResultGrid
│       │       ├── BackupRestoreScreen
│       │       │   ├── BackupScheduleConfig
│       │       │   └── RestoreWizard
│       │       ├── SystemHealthScreen
│       │       │   └── GaugeCards (CPU, RAM, Disk)
│       │       ├── AuditLogScreen
│       │       │   ├── AuditLogTable
│       │       │   └── AuditFilterBar
│       │       ├── DataIntegrityScreen
│       │       │   ├── IntegrityProgress
│       │       │   └── IssueTable
│       │       ├── PerformanceScreen
│       │       │   ├── MetricGaugeGrid
│       │       │   └── SlowQueryTable
│       │       ├── ReindexScreen
│       │       │   ├── TableSelector
│       │       │   └── IndexStatsTable
│       │       ├── MasterDataToolsScreen / CreateMasterScreen
│       │       │   ├── MasterDataTable
│       │       │   ├── ImportDialog
│       │       │   └── ValidationResultsPanel
│       │       ├── CRACEntryScreen / CRACManagementScreen / CRACTrackerScreen
│       │       │   ├── CRACEntryForm
│       │       │   ├── ApprovalDialog
│       │       │   └── TimelineChart
│       │       ├── OrderClosureScreen
│       │       │   └── ClosureWizard
│       │       ├── PaymentReadinessScreen
│       │       │   └── ReadinessTable
│       │       └── SafeModeScreen / RendererErrorScreen
│       │           ├── SafeModeBanner
│       │           └── DiagnosticList
│       └── Overlays (global)
│           ├── HelpAssistantOverlay (modules/helpAssistant/)
│           ├── QuickCreateFrame
│           └── ConfirmationDialogs
```

### 6.2 Shared Component Library (`components/`)

| Component | File | Usage |
|-----------|------|-------|
| `MasterDataTable` | `components/tables/MasterDataTable` | Reused across masters, CRAC, health |
| `Index` (layout) | `components/layout/index` | All screen shells |
| `SummaryCards` | `components/dashboard/` | Dashboard, SummaryScreen |
| `HealthScoreCard` | `components/health/HealthScoreCard` | Health screens |
| `VerificationResultList` | `components/health/VerificationResultList` | Accounting, Integrity, Verification |
| `CRACEntryForm` | `components/crac/CRACEntryForm` | CRAC entry screen |
| `FocusTrap` | `components/FocusTrap` | Modal accessibility |
| `common.jsx` | `components/common` | Shared UI primitives (buttons, inputs) |
| `forms/index` | `components/forms/` | Voucher form builder |
| `overlays/index` | `components/overlays/` | Modal/Dialog system |
| `settings/index` | `components/settings/` | Settings sub-forms |
| `tables/MasterDataTable` | `components/tables/` | Generic data table with pagination |

### 6.3 Feature Modules (`features/`)

| Module | Path | Purpose |
|--------|------|---------|
| `inventory/StockSummary` | `features/inventory/StockSummary` | Stock summary visualization |
| `reports/accounting/ProfitLossWidget` | `features/reports/accounting/` | P&L inline widget |

### 6.4 Print Templates (`print/templates/`)

| Template | File |
|----------|------|
| SalesInvoice | `print/templates/SalesInvoiceTemplate.jsx` |
| PurchaseInvoice | `print/templates/PurchaseInvoiceTemplate.jsx` |
| PaymentVoucher | `print/templates/PaymentVoucherTemplate.jsx` |
| ReceiptVoucher | `print/templates/ReceiptVoucherTemplate.jsx` |
| JournalVoucher | `print/templates/JournalVoucherTemplate.jsx` |
| CreditNote | `print/templates/CreditNoteTemplate.jsx` |
| DebitNote | `print/templates/DebitNoteTemplate.jsx` |
| DeliveryNote | `print/templates/DeliveryNoteTemplate.jsx` |
| GSTReport | `print/templates/GstReportTemplate.jsx` |
| StockSummary | `print/templates/StockSummaryTemplate.jsx` |
| OutstandingReport | `print/templates/OutstandingReportTemplate.jsx` |
| FinancialReport | `print/templates/FinancialReportTemplate.jsx` |
| OperationReport | `print/templates/OperationReportTemplate.jsx` |
| TemplateSelector | `print/templates/TemplateSelector.jsx` |

---

## 7. CSS Architecture

### 7.1 File Structure
Single file: `src/renderer/styles/app.css` (6238 lines).

### 7.2 Custom Properties (`:root`)

```css
:root {
  --primary: #1a73e8;
  --primary-hover: #1557b0;
  --secondary: #5f6368;
  --success: #34a853;
  --warning: #fbbc04;
  --danger: #ea4335;
  --info: #4285f4;
  --bg: #f8f9fa;
  --bg-white: #ffffff;
  --text: #202124;
  --text-secondary: #5f6368;
  --border: #dadce0;
  --border-light: #e8eaed;
  --shadow: 0 1px 3px rgba(0,0,0,0.12);
  --shadow-lg: 0 4px 12px rgba(0,0,0,0.15);
  --radius: 6px;
  --radius-lg: 10px;
  --font: 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'Consolas', monospace;
  --sidebar-width: 250px;
  --header-height: 48px;
  --transition: 0.2s ease;
}
```

### 7.3 Layout System
- **CSS Grid** for main layout: `.app-layout` grid with sidebar + header + content.
- **Flexbox** for component-level layouts: forms, toolbars, card grids.
- No CSS framework dependency — all custom grid/flex.

### 7.4 Naming Convention
- BEM-like: `.component__element--modifier`
- Utility classes: `.flex-center`, `.text-right`, `.mt-1`
- State classes: `.is-active`, `.is-loading`, `.is-disabled`, `.has-error`
- Component-scoped via unique class prefixes (e.g., `.voucher-form__line-item--highlighted`)

### 7.5 Key Class Groupings

| Category | Example Classes |
|----------|----------------|
| Layout | `.app-layout`, `.app-header`, `.sidebar`, `.content-area`, `.main-panel` |
| Dashboard | `.dashboard-grid`, `.summary-card`, `.card-value`, `.card-label` |
| Forms | `.voucher-form`, `.form-group`, `.form-label`, `.form-input`, `.form-select` |
| Tables | `.data-table`, `.table-header`, `.table-row`, `.table-cell`, `.table-actions` |
| Buttons | `.btn`, `.btn-primary`, `.btn-danger`, `.btn-sm`, `.btn-icon` |
| Modals | `.modal-overlay`, `.modal-content`, `.modal-header`, `.modal-footer` |
| Voucher | `.voucher-form`, `.line-item-grid`, `.gst-breakup`, `.voucher-footer`, `.totals-row` |
| Health | `.health-dashboard`, `.score-circle`, `.gauge-card`, `.verification-progress` |
| CRAC | `.crac-entry-form`, `.crac-table`, `.status-timeline`, `.approval-dialog` |
| Settings | `.settings-screen`, `.settings-section`, `.settings-form`, `.fy-manager` |
| Help | `.help-screen`, `.help-sidebar`, `.content-area`, `.training-grid` |
| Reports | `.reports-screen`, `.report-list`, `.report-viewer`, `.export-toolbar` |
| Inventory | `.inventory-stock-screen`, `.stock-table`, `.movement-chart`, `.filter-bar` |
| Responsive | `.mobile-only`, `.desktop-only`, `.table-responsive` |

### 7.6 Key Selectors by Line Range (app.css)

| Lines | Content |
|-------|---------|
| 1–30 | Custom properties (`:root`) |
| 31–80 | Reset, base typography, scrollbar |
| 81–200 | Layout grid (`.app-layout`, `.sidebar`, `.header`) |
| 201–400 | Buttons, inputs, form elements |
| 401–700 | Tables (`.data-table`, pagination) |
| 701–900 | Dashboard cards |
| 901–1200 | Voucher forms, line items, GST summaries |
| 1201–1400 | Modal/overlay system |
| 1401–1600 | Sidebar navigation |
| 1601–1900 | Settings forms |
| 1901–2200 | Health center styles |
| 2201–2500 | Report viewer |
| 2501–2800 | CRAC module |
| 2801–3100 | Help & training |
| 3101–3400 | Documents center |
| 3401–3700 | Inventory stock |
| 3701–4000 | Bank rows |
| 4001–4300 | Master data tools |
| 4301–4600 | Keyboard shortcuts |
| 4601–4900 | Operations drill-down |
| 4901–5200 | Print templates |
| 5201–5500 | Animations & transitions |
| 5501–5800 | Responsive breakpoints |
| 5801–6238 | Utility classes & helpers |

### 7.7 Responsive Breakpoints
- `@media (max-width: 1024px)`: Sidebar collapses to icon-only.
- `@media (max-width: 768px)`: Single-column layout, stacked cards.
- `@media (max-width: 480px)`: Reduced padding, smaller fonts, hidden secondary content.

---

## 8. Verification Command Reference

All verification scripts located in `scripts/` directory.

### 8.1 Accounting Verification

```bash
# Run full accounting integrity check
node scripts/verify-accounting.js

# Verify with specific fiscal year
node scripts/verify-accounting.js --fy "2025-26"

# Verify single ledger
node scripts/verify-accounting.js --ledger-id 42

# Export verification report
node scripts/verify-accounting.js --export report.json
```

### 8.2 Financial Statement Verification

```bash
# Verify trial balance, P&L, balance sheet
node scripts/verify-financials.js

# Verify specific period
node scripts/verify-financials.js --from "2025-04-01" --to "2025-09-30"
```

### 8.3 Operational Flow Verification

```bash
# Verify end-to-end transaction flows
node scripts/verify-operational-flow.js

# Verify specific voucher type
node scripts/verify-operational-flow.js --type sales
```

### 8.4 Voucher Workflow Verification

```bash
# Verify voucher posting chains
node scripts/verify-voucher-workflows-integration.js

# Test with sample data
node scripts/verify-voucher-workflows-integration.js --test-data
```

### 8.5 Phase-8b Voucher Proposal Verification

```bash
# Verify proposal-to-voucher conversion
node scripts/verify-phase8b-voucher-proposal.js
```

### 8.6 Phase-10 Inventory Automation Verification

```bash
# Verify inventory automation rules
node scripts/verify-phase10-inventory-automation.js
```

### 8.7 Controls Verification

```bash
# Verify UI control behaviors
node scripts/verify-controls.js

# Focused test on specific component
node scripts/verify-controls.js --component MasterDataTable
```

### 8.8 Backup Verification

```bash
# Verify backup integrity
node scripts/backup-restore-validation.js

# Verify specific backup file
node scripts/backup-restore-validation.js --file backup-2026-06-01.db
```

### 8.9 Company Context Isolation

```bash
# Verify company data isolation
node scripts/verify-company-context-isolation.js
```

### 8.10 Packaged Runtime Smoke Test

```bash
# Run smoke test on packaged app
node scripts/packaged-runtime-smoke.js

# Run with verbose logging
node scripts/packaged-runtime-smoke.js --verbose
```

### 8.11 Stability Edit Backup Smoke Test

```bash
# Verify stability of edit/backup cycle
node scripts/stability-edit-backup-smoke.js
```

### 8.12 Data Pack Creation

```bash
# Create test data pack
node scripts/create-erp-test-data-pack.js

# With specific company count
node scripts/create-erp-test-data-pack.js --companies 5
```

### 8.13 Desktop Functional Stability

```bash
# Verify desktop stability
node scripts/desktop-functional-stability.js
```

### 8.14 Common Options

| Option | Description |
|--------|-------------|
| `--verbose` | Detailed logging |
| `--export <file>` | Export results to JSON |
| `--format json` | Output as JSON (for CI) |
| `--no-color` | Disable ANSI colors |
| `--help` | Show help for script |

---

## 9. Development Setup

### 9.1 Prerequisites
- Node.js ≥18 LTS
- npm ≥9
- Windows 10+ (primary target)
- Git

### 9.2 Initial Setup

```bash
# Clone repository
git clone <repo-url>
cd outputs/gii-gem-erp

# Install dependencies
npm install

# Initialize database (creates SQLite DB with all tables)
npm run db:init

# Start development server (Vite + Electron)
npm run dev
```

### 9.3 Available Scripts

```bash
# Development
npm run dev          # Start Vite dev + Electron
npm run dev:renderer # Start Vite dev only (browser)
npm run dev:electron # Start Electron only (connect to Vite)

# Build
npm run build        # Build for production
npm run build:win    # Build Windows installer (NSIS)
npm run build:portable # Build portable .exe

# Database
npm run db:init      # Initialize/refresh database schema
npm run db:seed      # Seed with demo data
npm run db:reset     # Drop and recreate DB

# Lint & Format
npm run lint         # ESLint
npm run format       # Prettier

# Test
npm test             # Run all tests
npm run test:unit    # Unit tests
npm run test:integration # Integration tests

# Verification
npm run verify       # Run all verification scripts
npm run verify:accounting # Accounting checks
npm run verify:financials # Financial statement checks
npm run verify:ops   # Operational flow checks

# Packaging
npm run pack         # Package without installer
npm run pack:dir     # Package as directory
npm run dist         # Full distribution
```

### 9.4 Project Scripts (package.json)

```json
{
  "dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
  "build": "vite build && electron-builder",
  "build:win": "vite build && electron-builder --win",
  "db:init": "node src/main/database/init.js",
  "lint": "eslint src/",
  "verify": "node scripts/verify-accounting.js && node scripts/verify-financials.js"
}
```

### 9.5 Vite Configuration
- Entry: `src/renderer/index.html` → `src/renderer/main.js` → `App.jsx`
- Build output: `dist/renderer/`
- Electron main: `src/main/main.js`
- Preload: `src/preload/preload.cjs`

### 9.6 Database Paths
- Development: `runtime/user-data/DIPS` (SQLite file)
- Packaged: `runtime/packaged-smoke/database/gii-gem-erp.db`
- Backups: `runtime/packaged-smoke/backups/`
- Documents: `runtime/packaged-smoke/documents/`

### 9.7 Debugging Tips
1. **Renderer debugging**: Open Chromium DevTools (F12 / Ctrl+Shift+I)
2. **Main process debugging**: `npm run dev:electron -- --inspect=5858`
3. **Database inspection**: Use `better-sqlite3` CLI or DB Browser for SQLite
4. **IPC tracing**: Add `console.log` in `preload.cjs` context bridge methods
5. **CSS inspection**: Use DevTools Elements panel to trace CSS custom properties

### 9.8 Common Issues
- **Port conflict**: Change Vite port in `vite.config.js`
- **Database locked**: Close all app instances; delete WAL/SHM files
- **Preload not loaded**: Check `contextIsolation: true` and `preload` path in `main.js`
- **Build failures**: Clear `node_modules/.vite` cache and retry

---

*End of File 3 — Developer Module Reference*
