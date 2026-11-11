# GII GeM ERP — Renderer Dependency Graph (RG-1 v2.0.0)

**Graph ID:** RG-1
**Version:** 2.0.0 (Enhanced)
**Generated:** 2026-08-14T10:26:34.669Z
**Source:** `src/renderer/`

---

## 1. Architecture Overview

The GII GeM ERP renderer is a React SPA (Vite + Electron) with flat routing via `effectiveView` (114 routes, 1684 App.jsx lines).

**Stack:** React → Vite → Electron → IPC → SQLite

---

## 2. Statistics

| Metric | Value |
|--------|-------|
| Total Files | 252 |
| Total Lines | 43,446 |
| Total Imports | 700 |
| Routes | 114 |
| Screens | 41 |
| Components | 41 |
| Features | 53 |
| Layers | 12 |
| Architecture Density | 2.78 imports/file |
| Avg Imports/Screen | 3 |
| Avg Component Reuse | 2x |
| Largest Component | components/helpProductivity/index.jsx (597 lines) |
| Largest Screen | screens/EnvironmentManager/EnvironmentManagerScreen.jsx (963 lines) |
| Complexity Score | 700 |
| Circular Imports | 0 |
| Token Savings | ~8831 tokens per AI operation |

### By Owner
- **Dashboard:** 53 files
- **Other:** 47 files
- **Help:** 25 files
- **Renderer Shell:** 24 files
- **Knowledge:** 21 files
- **Health Center:** 17 files
- **Print:** 17 files
- **Utilities:** 12 files
- **CRAC:** 11 files
- **Master Data:** 5 files
- **Deployment:** 5 files
- **Accounting:** 3 files
- **Inventory:** 3 files
- **Operations:** 3 files
- **Reports:** 3 files
- **Settings:** 2 files
- **Profitability:** 1 files

### By Criticality
- **Low:** 118 files
- **High:** 100 files
- **Medium:** 27 files
- **Critical:** 7 files

---

## 3. Dependency Heat Map (Enhancement 7)

### Highest Fan-Out (Most Imports)
| File | Imports | Category | Owner |
|------|---------|----------|-------|
| App.jsx | 75 | app | Renderer Shell |
| config/screenRegistry.jsx | 23 | config | Renderer Shell |
| features/accounting/AccountingScreen.jsx | 16 | feature | Dashboard |
| features/transactions/TransactionScreen.jsx | 16 | feature | Dashboard |
| print/PrintTemplateHost.jsx | 14 | print | Print |
| modules/helpAssistant/HelpAssistant.jsx | 12 | module | Help |
| componentRegistry/registry.js | 11 | other | Other |
| features/accounting/businessVouchers/BusinessVoucherScreen.jsx | 11 | feature | Dashboard |
| features/accounting/VoucherProposalScreen.jsx | 11 | feature | Dashboard |
| features/inventory/InventoryReportScreen.jsx | 11 | feature | Master Data |

### Highest Fan-In (Most Imported By Others)
| Module/File | Times Imported |
|-------------|----------------|
| react | 142 |
| index | 76 |
| formatters | 55 |
| common | 38 |
| optionSorting | 17 |
| TemplateSections | 13 |
| uiHelpers | 11 |
| SmallComponents | 11 |
| DrilldownBase | 10 |
| navigation | 9 |

### Most Shared Components
| Component | Reuse Count |
|-----------|-------------|
| AddRecordPanel | 5 |
| DrilldownPanel | 5 |
| CRACStatusCard | 3 |
| MasterRecordsPanel | 2 |
| accountingTableConfig | 2 |
| BusinessVoucherIntelligencePanel | 2 |
| BillingVoucherScreen | 2 |
| SummaryScreen | 2 |
| MasterImportTemplatesScreen | 2 |
| TallyMasterMigrationAssistantScreen | 2 |

### Critical Files (Business Criticality: Critical)
| File | Lines | Imports |
|------|-------|---------|
| api/client.js | 104 | 0 |
| App.jsx | 1684 | 75 |
| components/common.jsx | 135 | 2 |
| components/forms/index.jsx | 378 | 2 |
| config/navigation.js | 332 | 0 |
| config/viewDefinitions.js | 447 | 0 |
| screens/DashboardScreen.jsx | 333 | 10 |

---

## 4. Route Graph with Workflow Linkage

All routes via `effectiveView`. No React Router.

| Route Key | Category | Workflow | Screen |
|-----------|----------|----------|--------|
| dashboard | general | Dashboard Workflow | dedicated screen |
| billing_drilldown | drilldown | Dashboard Workflow | in-App.jsx rendering |
| collections_drilldown | drilldown | Dashboard Workflow | in-App.jsx rendering |
| receivables_drilldown | drilldown | Dashboard Workflow | in-App.jsx rendering |
| profit_drilldown | drilldown | Dashboard Workflow | in-App.jsx rendering |
| orders_drilldown | drilldown | Dashboard Workflow | in-App.jsx rendering |
| treasury_drilldown | drilldown | Dashboard Workflow | in-App.jsx rendering |
| gst_drilldown | drilldown | Dashboard Workflow | in-App.jsx rendering |
| stock_drilldown | drilldown | Inventory Workflow | in-App.jsx rendering |
| trial_balance_drilldown | drilldown | Dashboard Workflow | in-App.jsx rendering |
| unposted_drilldown | drilldown | Dashboard Workflow | in-App.jsx rendering |
| settings | general | General | dedicated screen |
| environment_manager | general | General | in-App.jsx rendering |
| health_center | general | Health Center Workflow | in-App.jsx rendering |
| safe_mode | general | General | in-App.jsx rendering |
| production_readiness | general | Deployment Workflow | in-App.jsx rendering |
| go_live_wizard | general | Deployment Workflow | in-App.jsx rendering |
| invoices | general | Voucher Workflow | in-App.jsx rendering |
| profitability | general | Profitability Workflow | dedicated screen |
| voucher_dashboard | voucher | Dashboard Workflow | in-App.jsx rendering |
| manual_voucher | voucher | Voucher Workflow | in-App.jsx rendering |
| documents | general | Document Workflow | dedicated screen |
| master_data_tools | tool | General | in-App.jsx rendering |
| master_import_templates | tool | General | dedicated screen |
| tally_migration_assistant | tool | General | in-App.jsx rendering |
| tally_xml_import | tool | General | in-App.jsx rendering |
| crac_management | crac | CRAC Workflow | in-App.jsx rendering |
| crac_entry | crac | CRAC Workflow | in-App.jsx rendering |
| crac_tracker | crac | CRAC Workflow | in-App.jsx rendering |
| payment_readiness | crac | CRAC Workflow | in-App.jsx rendering |
| order_closure_tracking | crac | CRAC Workflow | in-App.jsx rendering |
| help_assistant | help | Help & Training Workflow | in-App.jsx rendering |
| help_keyboard | help | Help & Training Workflow | in-App.jsx rendering |
| help_training | help | Help & Training Workflow | dedicated screen |
| supply_orders | general | Operations Workflow | in-App.jsx rendering |
| procurement_workflow | general | Operations Workflow | in-App.jsx rendering |
| billing_workflow | operations | Voucher Workflow | in-App.jsx rendering |
| companies | general | General | in-App.jsx rendering |
| employees | general | Master Data Workflow | in-App.jsx rendering |
| government_departments | general | General | in-App.jsx rendering |
| ... (74 more routes) | ... | ... | ... |

---

## 5. Component Graph with Ownership

| File | Lines | Imports | Owner | Criticality | Change Frequency |
|------|-------|---------|-------|-------------|-----------------|
| components/helpProductivity/index.jsx | 597 | 9 | Help | Low | Occasionally Modified |
| components/operations/index.jsx | 489 | 4 | Operations | Low | Occasionally Modified |
| components/forms/index.jsx | 378 | 2 | Renderer Shell | Critical | Occasionally Modified |
| components/overlays/QuickCreateMasterDialog.jsx | 367 | 8 | Renderer Shell | Low | Occasionally Modified |
| components/inventoryReports/index.jsx | 326 | 4 | Inventory | Low | Stable |
| components/settings/index.jsx | 301 | 2 | Settings | Low | Occasionally Modified |
| components/dashboard/index.jsx | 298 | 2 | Dashboard | Low | Occasionally Modified |
| components/panels/DrilldownPanel.jsx | 282 | 5 | Other | Low | Occasionally Modified |
| components/panels/SmallComponents.jsx | 252 | 4 | Other | Low | Occasionally Modified |
| components/overlays/index.jsx | 243 | 3 | Renderer Shell | High | Occasionally Modified |
| components/panels/AddRecordPanel.jsx | 223 | 9 | Other | Low | Occasionally Modified |
| components/layout/index.jsx | 218 | 4 | Renderer Shell | High | Occasionally Modified |
| components/helpTraining/index.jsx | 197 | 3 | Help | Low | Occasionally Modified |
| components/inventoryReports/InventoryDashboardPanel.jsx | 165 | 4 | Inventory | Low | Stable |
| components/entityPicker/SmartEntityPicker.jsx | 161 | 10 | Other | Low | Occasionally Modified |

---

## 6. Context Graph
- **CompanyContext:** App.jsx (state) → AllCompaniesReadOnlyScreen,DashboardScreen,BillingVoucherScreen,BusinessVoucherScreen,VoucherEntryScreen,DocumentsScreen,CRAC screens,HealthCenterScreen,ProfitabilityScreen,MasterDataToolsScreen,Tally screens
- **Session/Role:** App.jsx (state) → HealthCenterScreen,EnvironmentManagerScreen,BusinessVoucherScreen,MasterDataToolsScreen,Tally screens
- **Theme/View:** App.jsx (effectiveView state) → All screens via App.jsx rendering

---

## 7. Print Graph
- Host: print/PrintTemplateHost.jsx
- Config: print/printTemplateConfig.js
- Utils: print/printUtils.js
- Templates (14): CreditNotePrint, DebitNotePrint, DeliveryChallanPrint, FinancialReportPrints, GstReportPrint, JournalVoucherPrint, OperationalPrints, OutstandingReportPrints, PaymentVoucherPrint, PurchaseVoucherPrint, ReceiptVoucherPrint, SalesInvoicePrint, StockReportPrint, TemplateSections

---

## 8. Dialog Graph
- **ConfirmDialog:** components/overlays/index.jsx → App.jsx (all confirm actions)
- **GlobalSearchOverlay:** components/overlays/index.jsx → App.jsx
- **PrintPreviewDialog:** components/overlays/index.jsx → App.jsx

---

## 9. Knowledge Layer
- BRAIN-1: ERP Knowledge Repository (224 entries)
- KG-1: Metadata Registry (167 entries)
- RG-1: Renderer Dependency Graph **(Active, v2.0.0)**
- DG-1: Database Intelligence Graph (73 tables)
- WG-1: Workflow Intelligence Graph (18 stages)
- KG-4: Voucher and Accounting Graph (14 voucher types)
- FF-1: Feature Function Correlation Graph (50 features)
- AG-1: Audit Intelligence Graph (97 events)
- KG-5: Document and Manual Graph (10 manuals)

---

## 10. External Dependencies
```
Renderer → API Client (api/client.js) → IPC → Main Process → Database (init.js)
                                              → Preload (preload.cjs)
```

---

## 11. Renderer Evolution Map (Enhancement 11)

| Stage | Description | Key Metrics |
|-------|-------------|-------------|
| **Current** | Monolithic App.jsx, flat routing, single CSS | 1684 App.jsx lines, 7,042 CSS lines |
| **Phase 17** | CSS segmentation, presentation extraction, config isolation | -200-500 App.jsx, -6,700 CSS |
| **Phase 18** | Route registry, dialog manager, nav controller, API service | Architecture separated |
| **Future** | Runtime consumption remains separately governed | 9 active graphs |

---

## 12. Renderer Layers
| Layer | Description | Files |
|-------|-------------|-------|
| 1. Shell | App shell + navigation | App.jsx, layout |
| 2. Config | Static definitions | 11 config files |
| 3. API | IPC bridge | api/client.js |
| 4. Print | Template printing | 17 print files |
| 5. Screens | App screens | 41 screen files |
| 6. Components | Shared UI | 41 component files |
| 7. Features | Domain logic | 53 feature files |
| 8. Modules | Subsystems | 54 module files |
| 9. Knowledge | Metadata | 13 knowledge files |
| 10. Stability | Recovery | 5 stability files |
| 11. Styles | CSS | 1 style file |
