import { DashboardScreen } from "../screens/DashboardScreen.jsx";
import {
  BillingDrilldown, CollectionsDrilldown, ReceivablesDrilldown,
  ProfitDrilldown, OrdersDrilldown, TreasuryDrilldown,
  GstDrilldown, StockDrilldown, TrialBalanceDrilldown, UnpostedDrilldown
} from "../features/dashboards/drilldowns/index.js";
import { SettingsScreen } from "../screens/SettingsScreen.jsx";
import { EnvironmentManagerScreen } from "../screens/EnvironmentManager/EnvironmentManagerScreen.jsx";
import { HealthCenterScreen } from "../screens/HealthCenter/index.js";
import { masterViews, transactionViews } from "./viewDefinitions.js";
import { businessVoucherRouteKinds } from "./navigation.js";
import { ProfitabilityScreen } from "../screens/ProfitabilityScreen.jsx";
import { ProfitSimulatorScreen } from "../screens/ProfitSimulatorScreen.jsx";
import { BillingVoucherScreen } from "../features/billing/BillingVoucherScreen.jsx";
import { DocumentsScreen } from "../screens/DocumentsScreen.jsx";
import {
  CRACManagementScreen, CRACEntryScreen, CRACTrackerScreen,
  PaymentReadinessScreen, OrderClosureScreen
} from "../screens/CRAC/index.js";
import { MasterDataToolsScreen } from "../screens/MasterDataTools/index.js";
import { MasterImportTemplatesScreen } from "../screens/MasterImportTemplatesScreen.jsx";
import { TallyMasterMigrationAssistantScreen } from "../features/importExport/TallyMasterMigrationAssistantScreen.jsx";
import { TallyXmlImportScreen } from "../features/importExport/TallyXmlImportScreen.jsx";
import { HelpAssistant } from "../modules/helpAssistant/HelpAssistant.jsx";
import { KeyboardShortcutScreen } from "../screens/KeyboardShortcutScreen.jsx";
import { HelpTrainingScreen } from "../screens/HelpTrainingScreen.jsx";
import { SummaryScreen } from "../screens/SummaryScreen.jsx";
import { SafeModeRecoveryScreen } from "../screens/SafeMode/index.js";
import { ProductionReadinessScreen } from "../modules/deployment/ProductionReadinessScreen.jsx";
import { GoLiveWizard } from "../modules/deployment/GoLiveWizard.jsx";

export function resolveScreen(effectiveView, {
  session, api, notify, navigate, companyContext, confirmAction,
  reversalConfirmOptions, postConfirmOptions, isRecordLocked, normalizeStatusClass,
  view, startupSelfTest, trainingMode, setTrainingMode,
  helpForView, matchesHelpQuery, setUtilityExtension,
  productivityStats, helpAssistantSourceView, helpAssistantInitialMode,
  operationsReportViews, inventoryReportViews, bankStatementViews,
  voucherProposalViews, safeCompanies, exitCurrentScreen,
  setShortcutHelpOpen,
  inlineScreens = {}
}) {
  const {
    MasterScreen, TransactionScreen,
    OperationsScreen, InventoryReportScreen, VoucherEntryScreen,
    BankStatementScreen, VoucherProposalScreen, AllocationWorkflowScreen,
    AccountingScreen
  } = inlineScreens;

  if (effectiveView === "safe_mode") return <SafeModeRecoveryScreen notify={notify} apiClient={api} onNavigate={navigate} startupSelfTest={startupSelfTest} />;
  if (effectiveView === "production_readiness") return <ProductionReadinessScreen apiClient={api} />;
  if (effectiveView === "go_live_wizard") return <GoLiveWizard apiClient={api} />;
  if (effectiveView === "dashboard") return <DashboardScreen notify={notify} setView={navigate} companyContext={companyContext} apiClient={api} />;
  if (effectiveView === "billing_drilldown") return <BillingDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />;
  if (effectiveView === "collections_drilldown") return <CollectionsDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />;
  if (effectiveView === "receivables_drilldown") return <ReceivablesDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />;
  if (effectiveView === "profit_drilldown") return <ProfitDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />;
  if (effectiveView === "orders_drilldown") return <OrdersDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />;
  if (effectiveView === "treasury_drilldown") return <TreasuryDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />;
  if (effectiveView === "gst_drilldown") return <GstDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />;
  if (effectiveView === "stock_drilldown") return <StockDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />;
  if (effectiveView === "trial_balance_drilldown") return <TrialBalanceDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />;
  if (effectiveView === "unposted_drilldown") return <UnpostedDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />;
  if (effectiveView === "settings") return <SettingsScreen notify={notify} apiClient={api} confirmAction={confirmAction} />;
  if (effectiveView === "environment_manager") return <EnvironmentManagerScreen notify={notify} apiClient={api} session={session} companyContext={companyContext} />;
  if (effectiveView === "health_center") return <HealthCenterScreen notify={notify} apiClient={api} session={session} companyContext={companyContext} onNavigate={navigate} />;
  if (masterViews[effectiveView]) return <MasterScreen table={effectiveView} config={masterViews[effectiveView]} notify={notify} companyContext={companyContext} />;
  if (effectiveView === "invoices") return <BillingVoucherScreen notify={notify} role={session?.role} companyContext={companyContext} onNavigate={navigate} api={api} confirmAction={confirmAction} reversalConfirmOptions={reversalConfirmOptions} postConfirmOptions={postConfirmOptions} isRecordLocked={isRecordLocked} normalizeStatusClass={normalizeStatusClass} />;
  if (transactionViews[effectiveView]) return <TransactionScreen table={effectiveView} config={transactionViews[effectiveView]} notify={notify} companyContext={companyContext} onNavigate={navigate} api={api} role={session?.role} />;
  if (operationsReportViews?.has(effectiveView)) return <OperationsScreen view={effectiveView} notify={notify} onNavigate={navigate} companyContext={companyContext} />;
  if (inventoryReportViews?.has(effectiveView)) return <InventoryReportScreen view={effectiveView} notify={notify} companyContext={companyContext} onNavigate={navigate} />;
  if (effectiveView === "profitability") return <ProfitabilityScreen notify={notify} companyContext={companyContext} apiClient={api} onNavigate={navigate} />;
  if (effectiveView === "profit_simulator") return <ProfitSimulatorScreen notify={notify} companyContext={companyContext} apiClient={api} />;
  if (effectiveView === "voucher_dashboard") return <BillingVoucherScreen notify={notify} onNavigate={navigate} role={session?.role} requestedVoucherKind={businessVoucherRouteKinds[view]} companyContext={companyContext} api={api} confirmAction={confirmAction} reversalConfirmOptions={reversalConfirmOptions} postConfirmOptions={postConfirmOptions} isRecordLocked={isRecordLocked} normalizeStatusClass={normalizeStatusClass} />;
  if (effectiveView === "manual_voucher") return <VoucherEntryScreen notify={notify} companyContext={companyContext} />;
  if (bankStatementViews?.has(effectiveView)) return <BankStatementScreen view={effectiveView} notify={notify} companyContext={companyContext} />;
  if (voucherProposalViews?.has(effectiveView)) return <VoucherProposalScreen view={effectiveView} notify={notify} role={session?.role} companyContext={companyContext} />;
  if (["receipt_allocation_workflow", "supplier_allocation_workflow", "advance_adjustment_wizard", "supplier_advance_adjustment_wizard", "party_opening_balances", "credit_terms"].includes(effectiveView)) return <AllocationWorkflowScreen view={effectiveView} notify={notify} role={session?.role} companyContext={companyContext} />;
  if (["chart_accounts", "voucher_register", "ledger_view", "cash_bank_ledger", "day_book", "cash_book", "bank_book", "trial_balance", "profit_loss", "balance_sheet", "posting_control", "party_ledger", "department_ledger", "supplier_ledger", "bill_wise_receivables", "bill_wise_payables", "payment_allocations", "supplier_payment_allocations", "allocation_reconciliation", "unallocated_receipts", "unallocated_supplier_payments", "advance_receipts", "supplier_advances", "advance_adjustments", "allocation_audit", "receivable_ageing", "payable_ageing", "tds_reconciliation", "gst_tds_reconciliation", "party_ledger_summary", "party_reconciliation", "financial_control", "financial_years", "opening_balances", "approval_queue", "gst_register", "tds_register", "bill_outstanding", "year_end_closing", "carry_forward", "audit_log"].includes(effectiveView)) return <AccountingScreen view={effectiveView} notify={notify} role={session?.role} companyContext={companyContext} onNavigate={navigate} />;
  if (effectiveView === "documents") return <DocumentsScreen notify={notify} companyContext={companyContext} apiClient={api} onNavigate={navigate} confirmAction={confirmAction} />;
  if (["employee_performance", "receivables", "payables", "cash_flow", "gst", "reports"].includes(effectiveView)) return <SummaryScreen view={effectiveView} notify={notify} companyContext={companyContext} onNavigate={navigate} />;
  if (effectiveView === "master_data_tools") return <MasterDataToolsScreen notify={notify} apiClient={api} session={session} companyContext={companyContext} />;
  if (effectiveView === "master_import_templates") return <MasterImportTemplatesScreen notify={notify} />;
  if (effectiveView === "tally_migration_assistant") return <TallyMasterMigrationAssistantScreen api={api} notify={notify} session={session} companyContext={companyContext} setUtilityExtension={setUtilityExtension} />;
  if (effectiveView === "tally_xml_import") return <TallyXmlImportScreen api={api} notify={notify} session={session} companyContext={companyContext} />;
  if (effectiveView === "crac_management") return <CRACManagementScreen notify={notify} companyContext={companyContext} apiClient={api} onNavigate={navigate} />;
  if (effectiveView === "crac_entry") return <CRACEntryScreen notify={notify} companyContext={companyContext} apiClient={api} onNavigate={navigate} />;
  if (effectiveView === "crac_tracker") return <CRACTrackerScreen notify={notify} companyContext={companyContext} apiClient={api} onNavigate={navigate} />;
  if (effectiveView === "payment_readiness") return <PaymentReadinessScreen notify={notify} companyContext={companyContext} apiClient={api} onNavigate={navigate} />;
  if (effectiveView === "order_closure_tracking") return <OrderClosureScreen notify={notify} companyContext={companyContext} apiClient={api} onNavigate={navigate} />;
  if (effectiveView === "help_assistant") return (
    <HelpAssistant
      companies={safeCompanies}
      companyContext={companyContext}
      currentView={helpAssistantSourceView || view}
      currentHelp={helpForView(helpAssistantSourceView || view)}
      initialMode={helpAssistantInitialMode}
      onBack={exitCurrentScreen}
      onNavigate={navigate}
      session={session}
      stats={productivityStats}
    />
  );
  if (effectiveView === "help_keyboard") return <KeyboardShortcutScreen onNavigate={navigate} />;
  if (effectiveView === "help_training") return (
    <HelpTrainingScreen
      currentView={view}
      trainingMode={trainingMode}
      setTrainingMode={setTrainingMode}
      onNavigate={navigate}
      onShortcutHelp={() => setShortcutHelpOpen?.(true)}
      helpForView={helpForView}
      matchesHelpQuery={matchesHelpQuery}
    />
  );
  return null;
}
