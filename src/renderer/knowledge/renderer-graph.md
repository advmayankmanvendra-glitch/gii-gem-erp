# GII GeM ERP — Renderer Dependency Graph (RG-1 v2.0)

**Graph ID:** RG-1
**Version:** 2.0 (Enhanced)
**Generated:** 2026-07-01T11:05:33.665Z
**Source:** `src/renderer/`

---

## 1. Architecture Overview

The GII GeM ERP renderer is a React SPA (Vite + Electron) with flat routing via `effectiveView` (114 routes, 13290 App.jsx lines).

**Stack:** React → Vite → Electron → IPC → SQLite

---

## 2. Statistics

| Metric | Value |
|--------|-------|
| Total Files | 153 |
| Total Lines | 34,513 |
| Total Imports | 349 |
| Routes | 114 |
| Screens | 36 |
| Components | 24 |
| Features | 20 |
| Layers | 11 |
| Architecture Density | 2.28 imports/file |
| Avg Imports/Screen | 3 |
| Avg Component Reuse | 1x |
| Largest Component | components/helpProductivity/index.jsx (626 lines) |
| Largest Screen | screens/EnvironmentManager/EnvironmentManagerScreen.jsx (961 lines) |
| Complexity Score | 491 |
| Circular Imports | 0 |
| Token Savings | ~14186 tokens per AI operation |

### By Owner
- **Help:** 23 files
- **Dashboard:** 22 files
- **Renderer Shell:** 20 files
- **Health Center:** 17 files
- **Print:** 17 files
- **Knowledge:** 15 files
- **CRAC:** 11 files
- **Deployment:** 5 files
- **Utilities:** 4 files
- **Accounting:** 3 files
- **Inventory:** 3 files
- **Operations:** 3 files
- **Master Data:** 3 files
- **Reports:** 3 files
- **Settings:** 2 files
- **Other:** 1 files
- **Profitability:** 1 files

### By Criticality
- **High:** 70 files
- **Low:** 55 files
- **Medium:** 21 files
- **Critical:** 7 files

---

## 3. Dependency Heat Map (Enhancement 7)

### Highest Fan-Out (Most Imports)
| File | Imports | Category | Owner |
|------|---------|----------|-------|
| App.jsx | 45 | app | Renderer Shell |
| print/PrintTemplateHost.jsx | 14 | print | Print |
| modules/helpAssistant/HelpAssistant.jsx | 11 | module | Help |
| knowledge/registry.js | 10 | knowledge | Knowledge |
| screens/DashboardScreen.jsx | 10 | screen | Dashboard |
| components/helpProductivity/index.jsx | 9 | component | Help |
| screens/HealthCenter/HealthCenterScreen.jsx | 9 | screen | Health Center |
| modules/erpBrain/loaders/repositoryLoader.js | 8 | module | Knowledge |
| modules/helpAssistant/helpAssistantUtils.js | 7 | module | Help |
| screens/CRAC/CRACManagementScreen.jsx | 5 | screen | CRAC |

### Highest Fan-In (Most Imported By Others)
| Module/File | Times Imported |
|-------------|----------------|
| react | 99 |
| index | 38 |
| formatters | 29 |
| common | 16 |
| TemplateSections | 13 |
| DrilldownBase | 10 |
| uiHelpers | 7 |
| navigation | 6 |
| rendererStabilityUtils | 6 |
| healthCenterConfig | 4 |

### Most Shared Components
| Component | Reuse Count |
|-----------|-------------|
| CRACStatusCard | 3 |
| ClosureChecklist | 1 |
| CRACDocumentPanel | 1 |
| PaymentReadinessTable | 1 |
| MasterRecordsPanel | 1 |
| StockAdjustmentControlPanel | 1 |
| CertificationHistory | 1 |
| GoLiveChecklist | 1 |
| GoLiveWizard | 1 |
| ProductionReadinessScreen | 1 |

### Critical Files (Business Criticality: Critical)
| File | Lines | Imports |
|------|-------|---------|
| api/client.js | 98 | 0 |
| App.jsx | 13290 | 45 |
| components/common.jsx | 135 | 2 |
| components/forms/index.jsx | 364 | 1 |
| config/navigation.js | 321 | 0 |
| config/viewDefinitions.js | 302 | 0 |
| screens/DashboardScreen.jsx | 286 | 10 |

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
| master_import_templates | tool | General | in-App.jsx rendering |
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
| components/helpProductivity/index.jsx | 626 | 9 | Help | Low | Occasionally Modified |
| components/operations/index.jsx | 489 | 4 | Operations | Low | Occasionally Modified |
| components/forms/index.jsx | 364 | 1 | Renderer Shell | Critical | Occasionally Modified |
| components/inventoryReports/index.jsx | 326 | 4 | Inventory | Low | Stable |
| components/dashboard/index.jsx | 293 | 2 | Dashboard | Low | Occasionally Modified |
| components/overlays/index.jsx | 241 | 3 | Renderer Shell | High | Occasionally Modified |
| components/layout/index.jsx | 233 | 3 | Renderer Shell | High | Occasionally Modified |
| components/helpTraining/index.jsx | 197 | 3 | Help | Low | Occasionally Modified |
| components/inventoryReports/InventoryDashboardPanel.jsx | 165 | 4 | Inventory | Low | Stable |
| components/common.jsx | 135 | 2 | Renderer Shell | Critical | Occasionally Modified |
| components/settings/index.jsx | 120 | 2 | Settings | Low | Occasionally Modified |
| components/accountingControls/index.jsx | 110 | 2 | Accounting | Low | Stable |
| components/tables/MasterRecordsPanel.jsx | 88 | 2 | Renderer Shell | Low | Occasionally Modified |
| components/crac/PaymentReadinessTable.jsx | 50 | 2 | CRAC | High | Occasionally Modified |
| components/crac/CRACDocumentPanel.jsx | 39 | 1 | CRAC | High | Occasionally Modified |

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
- BRAIN-1: ERP Knowledge Repository (214 entries)
- KG-1: Metadata Registry (167 entries)
- RG-1: Renderer Dependency Graph **(Active, v2.0)**

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
| **Current** | Monolithic App.jsx, flat routing, single CSS | 13290 App.jsx lines, 7,042 CSS lines |
| **Phase 17** | CSS segmentation, presentation extraction, config isolation | -200-500 App.jsx, -6,700 CSS |
| **Phase 18** | Route registry, dialog manager, nav controller, API service | Architecture separated |
| **Future** | DG-1, WG-1, AG-1 graphs — full intelligence layer | 6 active graphs |

---

## 12. Renderer Layers
| Layer | Description | Files |
|-------|-------------|-------|
| 1. Shell | App shell + navigation | App.jsx, layout |
| 2. Config | Static definitions | 8 config files |
| 3. API | IPC bridge | api/client.js |
| 4. Print | Template printing | 17 print files |
| 5. Screens | App screens | 36 screen files |
| 6. Components | Shared UI | 24 component files |
| 7. Features | Domain logic | 20 feature files |
| 8. Modules | Subsystems | 25 module files |
| 9. Knowledge | Metadata | 13 knowledge files |
| 10. Stability | Recovery | 5 stability files |
| 11. Styles | CSS | 1 style file |
