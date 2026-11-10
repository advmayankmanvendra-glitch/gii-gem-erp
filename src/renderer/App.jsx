import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { isDesktopRuntime, resolveApi } from "./api/client.js";
import { createBrowserFallbackApi } from "./api/browserFallbackApi.js";
import { accountingTableConfig } from "./features/accounting/accountingTableConfig.js";
import { inventoryTableConfig } from "./features/inventory/inventoryTableConfig.js";
import { voucherPlainLanguage, voucherTooltips, businessVoucherValidationMessages, businessVoucherPreview } from "./features/accounting/businessVouchers/businessVoucherUtils.js";
import { BusinessVoucherIntelligencePanel } from "./features/accounting/businessVouchers/BusinessVoucherIntelligencePanel.jsx";
import { BusinessVoucherScreen } from "./features/accounting/businessVouchers/BusinessVoucherScreen.jsx";
import { downloadText, exportRows, formatCurrency } from "./utils/formatters.js";
import { resetWorkspaceScroll, scrollToNavigationTarget, scrollToSection } from "./utils/navigationScroll.js";
import { isAdminUser, requestPrintPreview } from "./utils/uiHelpers.js";
import { COMPANY_CONTEXT_KEY, COMPANY_SCOPE_KEY, RIGHT_UTILITY_SIDEBAR_KEY } from "./config/storageKeys.js";
import { masterViews, transactionViews } from "./config/viewDefinitions.js";
import { importTemplates, importTemplateSampleRows, masterImportTemplateDefinitions } from "./config/importTemplates.js";
import { bankStatementViews, businessVoucherRouteKinds, flatNavItems, inventoryReportViews, navGroups, operationsReportViews, routeAliases, viewTitles, voucherProposalViews } from "./config/navigation.js";
import { getPrintTemplateOptionsForView } from "./print/printTemplateConfig.js";
import { collectPrintTemplateData } from "./print/printUtils.js";
import { EmptyState, Icon, IntelligenceCard, Metric, MetricRows, MiniDataTable, SummaryTable } from "./components/common.jsx";
import { LoginScreen } from "./screens/LoginScreen.jsx";
import { MasterImportTemplatesScreen } from "./features/importExport/MasterImportTemplatesScreen.jsx";
import { VoucherEntryScreen } from "./features/accounting/VoucherEntryScreen.jsx";
import { VoucherProposalScreen } from "./features/accounting/VoucherProposalScreen.jsx";
import { OperationsScreen } from "./features/operations/OperationsScreen.jsx";
import { SummaryScreen } from "./features/dashboards/SummaryScreen.jsx";
import { InventoryReportScreen } from "./features/inventory/InventoryReportScreen.jsx";
import { Field, MetricLine, ReadOnlyBox, ReportActionButtons, ReportDateFilters, ReportSelectFilter, ReportToolbar, SearchableSelect, SelectBox, SelectField, ViewTabs } from "./components/forms/index.jsx";
import { MasterRecordsPanel } from "./components/tables/MasterRecordsPanel.jsx";
import { MasterScreen } from "./screens/MasterScreen.jsx";
import {
  ContextHelpDialog,
  ContextShortcutOverlay,
  ContextShortcutPanel,
  FirstTimeTour,
  ProductivityLearnDialog,
  ShortcutHelpDialog,
  UserPreferencesDialog,
  helpForView,
  matchesHelpQuery,
  productivityScopeForView,
  roleAllowsAction
} from "./components/helpProductivity/index.jsx";
import { NavigationSidebar, RightUtilitySidebar, WorkspaceFrame } from "./components/layout/index.jsx";
import { RuntimeBanner, SidebarScrim, ToastNotification, TrainingModeBanner } from "./components/workspace/index.jsx";
import HelpQuickActionsBar from "./components/help/HelpQuickActionsBar.jsx";
import { ConfirmDialog, GlobalSearchOverlay, PrintPreviewDialog, QuickCreateMasterDialog, quickCreateRecords } from "./components/overlays/index.jsx";
import { AddRecordPanel } from "./components/panels/AddRecordPanel.jsx";
import { OperationsAttentionQueueTable } from "./components/operations/index.jsx";
import { TallyMasterMigrationAssistantScreen } from "./features/importExport/TallyMasterMigrationAssistantScreen.jsx";
import { TallyXmlImportScreen } from "./features/importExport/TallyXmlImportScreen.jsx";
import { PhasePanel, ValidationGuidanceBanner, SupplyOrderFieldSection, SupplyOrderSummaryCard, VoucherLearnDialog, DeliveryChallanQuickForm, DrilldownActionCenter, VoucherProposalTable } from "./components/panels/SmallComponents.jsx";
import { SupplyOrderEntryForm, SupplyOrderItemsGrid, SupplyOrderReadinessPanel, SupplyOrderRecordsPanel, blankSupplyOrderItem, supplyOrderLineHasInput, itemById, calculatedSupplyOrderLine, normalizedSupplyOrderItems, supplyOrderItemsFromRecord, supplyOrderItemTotals, statusRequiresSupplyOrderItems, validateSupplyOrderItems, focusValidationTarget, supplyOrderDocumentReadiness, supplyOrderOperationalReadiness, buildSupplyOrderValidationErrors, nextSupplyOrderNumber } from "./features/operations/supplyOrders/index.jsx";
import { buildOperationsData, buildOperationsAttentionRows, filterOperationsAttentionRows, buildOperationsDashboardInsights, buildOperationsDrilldown, documentChecklistColumns } from "./features/operations/operationsIntelligence.js";
import { InventoryDashboardPanel, InventoryReadOnlyReportPanel } from "./components/inventoryReports/index.jsx";
import { AccountingControlReportTable, FinancialControlOverview, LockedYearControlNotice } from "./components/accountingControls/index.jsx";
import { StockAdjustmentControlPanel, validateStockAdjustmentDraft } from "./features/inventory/StockAdjustmentControlPanel.jsx";
import { ProfitSimulatorScreen } from "./screens/ProfitSimulatorScreen.jsx";
import { AllCompaniesReadOnlyScreen } from "./screens/AllCompaniesReadOnlyScreen.jsx";
import { BankRowsTable } from "./screens/BankRowsTable.jsx";
import { DashboardScreen } from "./screens/DashboardScreen.jsx";
import {
  BillingDrilldown, CollectionsDrilldown, ReceivablesDrilldown,
  ProfitDrilldown, OrdersDrilldown, TreasuryDrilldown,
  GstDrilldown, StockDrilldown, TrialBalanceDrilldown, UnpostedDrilldown
} from "./features/dashboards/drilldowns/index.js";
import { DocumentsScreen } from "./screens/DocumentsScreen.jsx";
import { EnvironmentManagerScreen } from "./screens/EnvironmentManager/EnvironmentManagerScreen.jsx";
import { HealthCenterScreen } from "./screens/HealthCenter/index.js";
import { HelpTrainingScreen } from "./screens/HelpTrainingScreen.jsx";
import { KeyboardShortcutScreen } from "./screens/KeyboardShortcutScreen.jsx";
import { HelpAssistant } from "./modules/helpAssistant/HelpAssistant.jsx";
import { InteractiveStockSummaryReport } from "./screens/InventoryStockSummaryReport.jsx";
import { MasterDataToolsScreen } from "./screens/MasterDataTools/index.js";
import { OperationsDrilldownPanel } from "./screens/OperationsDrilldownPanel.jsx";
import { ProfitabilityScreen } from "./screens/ProfitabilityScreen.jsx";
import { buildReadOnlyReportFamilyConfig, isReadOnlyReportFamilyView, ReadOnlyReportFamilyTable } from "./screens/ReadOnlyReportFamilyScreen.jsx";
import { CRACManagementScreen, CRACEntryScreen, CRACTrackerScreen, PaymentReadinessScreen, OrderClosureScreen } from "./screens/CRAC/index.js";
import { AccountingReportsIndex, CashFlowSummary, EmployeePerformanceSummary, GstSummary } from "./screens/ReadOnlySummaryReports.jsx";
import { SettingsScreen } from "./screens/SettingsScreen.jsx";
import { SafeModeRecoveryScreen } from "./screens/SafeMode/index.js";
import { ProductionReadinessScreen } from "./modules/deployment/ProductionReadinessScreen.jsx";
import { GoLiveWizard } from "./modules/deployment/GoLiveWizard.jsx";
import { RendererErrorBoundary } from "./stability/RendererErrorBoundary.jsx";
import { runStartupSelfTest } from "./stability/startupSelfTest.js";
import "./styles/app.css";
import { DrilldownPanel, ReconciliationDrillTable } from "./components/panels/DrilldownPanel.jsx";
import { BillingVoucherScreen } from "./features/billing/BillingVoucherScreen.jsx";
import { TransactionScreen } from "./features/transactions/TransactionScreen.jsx";
import { AccountingScreen } from "./features/accounting/AccountingScreen.jsx";
import { AllocationWorkflowScreen } from "./features/accounting/AllocationWorkflowScreen.jsx";
import { BankStatementScreen } from "./features/accounting/BankStatementScreen.jsx";
import { confirmAction, postedProtectionOptions, deleteConfirmOptions, postConfirmOptions, approveConfirmOptions, reversalConfirmOptions, isRecordLocked } from "./utils/actionUtils.js";
import { normalizeStatusClass } from "./utils/fileParsers.js";

const fallbackApi = createBrowserFallbackApi(businessVoucherPreview);
const api = resolveApi(fallbackApi);

function friendlyToastMessage(message) {
  const guidance = buildActionErrorGuidance(message);
  return guidance.toast || guidance.clean || "Action could not be completed.";
}

function cleanErrorMessage(error) {
  return String(error?.message || error || "Action could not be completed.")
    .replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/i, "")
    .replace(/^Unhandled error:\s*/i, "")
    .replace(/^SqliteError:\s*/i, "Database error: ")
    .trim();
}

const UNIQUE_CONSTRAINT_FIELD_GUIDANCE = {
  "supply_orders.order_number": {
    name: "order_number",
    section: "Order Identification",
    message: "This order number already exists.",
    action: "Use the next auto-generated order number or enter a unique manual order number."
  },
  "invoices.invoice_number": {
    name: "invoice_number",
    section: "Invoice Header",
    message: "This invoice number already exists.",
    action: "Use the next invoice sequence or verify whether the invoice is already saved."
  },
  "payments.utr_number": {
    name: "utr_number",
    section: "Payment Details",
    message: "This UTR/reference number is already used.",
    action: "Check the payment reference and avoid duplicate receipt/payment entry."
  },
  "warehouses.warehouse_name": {
    name: "warehouse_name",
    section: "Warehouse",
    message: "This warehouse name already exists.",
    action: "Map to the existing warehouse or use a clearly different warehouse name."
  },
  "items.item_name": {
    name: "item_name",
    section: "Item Master",
    message: "This item name already exists.",
    action: "Use the existing item, update it, or rename the new item."
  },
  "companies.company_name": {
    name: "company_name",
    section: "Company",
    message: "This company already exists.",
    action: "Switch to the existing company or alter its master record."
  }
};

function buildActionErrorGuidance(error, context = {}) {
  const clean = cleanErrorMessage(error);
  const lower = clean.toLowerCase();
  const fallbackSection = context?.config?.title || context?.table || "Current Screen";
  const errors = [];
  const add = (entry) => {
    errors.push({
      severity: entry.severity || "error",
      section: entry.section || fallbackSection,
      name: entry.name || null,
      itemIndex: entry.itemIndex ?? null,
      message: entry.message || clean,
      action: entry.action || "",
      detail: entry.detail || ""
    });
  };

  if (/no such column:\s*is_deleted/i.test(clean)) {
    add({
      severity: "system",
      section: "Database / Migration",
      message: "Database compatibility issue: missing column `is_deleted`.",
      detail: "The current SQLite database does not match the code path used by this screen.",
      action: "Restart the desktop app so database initialization can run. If it repeats, run the schema/migration fix before entering more records."
    });
  } else if (/no such column:\s*company_id/i.test(clean)) {
    add({
      severity: "system",
      section: "Company Context",
      message: "Database compatibility issue: missing company linkage.",
      detail: "A company-filtered save/read was attempted against a table that is missing company context support.",
      action: "Stop this entry and run the company-context/schema regression fix before continuing."
    });
  } else if (/unique constraint failed:\s*([a-z0-9_]+)\.([a-z0-9_]+)/i.test(clean)) {
    const [, tableName, columnName] = clean.match(/unique constraint failed:\s*([a-z0-9_]+)\.([a-z0-9_]+)/i);
    const key = `${tableName}.${columnName}`;
    add(UNIQUE_CONSTRAINT_FIELD_GUIDANCE[key] || {
      section: "Duplicate Check",
      name: columnName,
      message: `Duplicate value blocked for ${columnName.replaceAll("_", " ")}.`,
      detail: clean,
      action: "Search existing records first, then update/map/skip instead of creating another record."
    });
  } else if (/select current company|company context|required.*company|selected company does not match/i.test(clean)) {
    add({
      section: "Current Company",
      message: "Current Company needs attention.",
      detail: clean,
      action: "Select the correct company from the right utility panel before saving or posting."
    });
  } else if (/gem order number is required/i.test(clean)) {
    add({
      name: "gem_order_number",
      section: "Order Identification",
      message: "GeM Order Number is required.",
      action: "Enter the GeM order number, or change Supply Type away from GeM if this is not a GeM order."
    });
  } else if (/gem contract number is required/i.test(clean)) {
    add({
      name: "gem_contract_number",
      section: "Order Identification",
      message: "GeM Contract Number is required.",
      action: "Enter the GeM contract number, or change Supply Type away from GeM if this order is not from GeM."
    });
  } else if (/department is required/i.test(clean)) {
    add({
      name: "department_id",
      section: "Buyer & Department",
      message: "Department is required.",
      action: "Select the buying department before saving this order."
    });
  } else if (/employee assigned is required/i.test(clean)) {
    add({
      name: "employee_id",
      section: "Internal Control",
      message: "Employee Assigned is required.",
      action: "Select the employee responsible for this order."
    });
  } else if (/order item\s+(\d+)/i.test(clean)) {
    const rowMatch = clean.match(/order item\s+(\d+)/i);
    const rowIndex = Math.max(0, Number(rowMatch?.[1] || 1) - 1);
    const fieldName = lower.includes("quantity") ? "quantity"
      : lower.includes("rate") ? "quoted_rate"
        : lower.includes("hsn") ? "hsn_sac"
          : lower.includes("gst") ? "gst_rate"
            : lower.includes("remarks") ? "remarks"
              : "item_id";
    add({
      name: fieldName,
      itemIndex: rowIndex,
      section: "Order Items",
      message: clean,
      action: "Review the highlighted order item row and correct the missing or invalid value."
    });
  } else if (/at least one order item/i.test(clean)) {
    add({
      name: "order_items",
      section: "Order Items",
      message: "At least one order item is required.",
      action: "Add item-wise order details before moving the order beyond Draft/Received."
    });
  } else if (/date|invalid date/i.test(clean)) {
    add({
      section: "Date Field",
      message: clean,
      action: "Check the date format and use the calendar picker where available."
    });
  } else if (/required|cannot be negative|must be greater than|invalid/i.test(clean)) {
    add({
      section: fallbackSection,
      message: clean,
      action: "Review required fields and highlighted values on this screen."
    });
  } else {
    add({
      severity: clean.startsWith("Database error:") ? "system" : "error",
      section: clean.startsWith("Database error:") ? "Database" : fallbackSection,
      message: clean,
      action: clean.startsWith("Database error:")
        ? "Do not continue repeated entry attempts. Capture this message and run the relevant stability fix."
        : "Review the current screen and try again."
    });
  }

  const first = errors[0];
  const toast = first?.section && first.section !== fallbackSection
    ? `${first.section}: ${first.message}`
    : first?.message || clean;
  return { clean, errors, toast };
}

function App() {
  const [session, setSession] = useState(null);
  const [view, setView] = useState("dashboard");
  const [companies, setCompanies] = useState([]);
  const [currentCompanyId, setCurrentCompanyId] = useState(() => window.localStorage?.getItem(COMPANY_CONTEXT_KEY) || "");
  const [companyScope, setCompanyScope] = useState(() => window.localStorage?.getItem(COMPANY_SCOPE_KEY) || "single");
  const [toast, setToast] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [navSearch, setNavSearch] = useState("");
  const [favorites, setFavorites] = useState(["supply_orders", "invoices"]);
  const [recentScreens, setRecentScreens] = useState([]);
  const [compactSidebar, setCompactSidebar] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [navigationHistory, setNavigationHistory] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchData, setGlobalSearchData] = useState(null);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [contextShortcutOpen, setContextShortcutOpen] = useState(false);
  const [userPreferencesOpen, setUserPreferencesOpen] = useState(false);
  const [contextHelpOpen, setContextHelpOpen] = useState(false);
  const [helpAssistantSourceView, setHelpAssistantSourceView] = useState("dashboard");
  const [helpAssistantInitialMode, setHelpAssistantInitialMode] = useState("screen");
  const [firstTourOpen, setFirstTourOpen] = useState(false);
  const [trainingMode, setTrainingMode] = useState(false);
  const [shortcutPanelCollapsed, setShortcutPanelCollapsed] = useState(() => window.localStorage?.getItem("gii-gem-shortcut-panel-collapsed") !== "no");
  const [rightUtilityCollapsed, setRightUtilityCollapsed] = useState(() => window.localStorage?.getItem(RIGHT_UTILITY_SIDEBAR_KEY) === "yes");
  const [productivityStats, setProductivityStats] = useState(null);
  const [productivityLearnOpen, setProductivityLearnOpen] = useState(false);
  const [printPreview, setPrintPreview] = useState(null);
  const [utilityExtension, setUtilityExtension] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const confirmResolverRef = useRef(null);
  const exitConfirmResolverRef = useRef(null);
  const exitRequestPendingRef = useRef(false);
  const lastExitEscRef = useRef(0);
  const currentTitle = viewTitles[view] || [masterViews[view]?.title || transactionViews[view]?.title, masterViews[view]?.description || transactionViews[view]?.description];
  const effectiveView = routeAliases[view] || view;
  const activeMeta = flatNavItems.find((item) => item.key === view) || flatNavItems.find((item) => item.key === effectiveView) || flatNavItems[0];
  const breadcrumb = ["Dashboard", activeMeta?.group, activeMeta?.label].filter((item, index, list) => item && list.indexOf(item) === index);
  const searchedGroups = buildVisibleNavGroups(navSearch).filter((group) => group.id !== "dashboard");
  const globalSearchResults = useMemo(() => buildGlobalSearchResults(globalSearchQuery, globalSearchData), [globalSearchQuery, globalSearchData]);
  const adminUser = isAdminUser(session);
  const safeCompanies = Array.isArray(companies) ? companies : [];
  const currentCompany = safeCompanies.find((company) => String(company.id) === String(currentCompanyId));
  const effectiveCompanyScope = adminUser ? companyScope : "single";
  const companyContext = useMemo(() => ({
    company_id: effectiveCompanyScope === "all" ? "" : currentCompanyId,
    company_name: effectiveCompanyScope === "all" ? "All Companies" : currentCompany?.company_name || "",
    company_scope: effectiveCompanyScope
  }), [effectiveCompanyScope, currentCompanyId, currentCompany?.company_name]);
  const allCompaniesReadOnly = companyContext.company_scope === "all" && !["dashboard", "companies", "settings", "help_training", "help_keyboard", "help_assistant", "environment_manager", "health_center", "master_data_tools", "safe_mode"].includes(effectiveView);
  const rendererCrashContext = useMemo(() => ({
    view: effectiveView,
    routeView: view,
    company: companyContext.company_name || "Unselected",
    companyId: companyContext.company_id,
    companyScope: companyContext.company_scope,
    user: session?.displayName || session?.username || session?.name || session?.role || "Unknown",
    role: session?.role || ""
  }), [effectiveView, view, companyContext.company_name, companyContext.company_id, companyContext.company_scope, session]);
  const startupSelfTest = useMemo(() => runStartupSelfTest({
    apiClient: api,
    companyContext,
    currentView: effectiveView,
    hasDashboardRoute: flatNavItems.some((item) => item.key === "dashboard"),
    hasHealthCenterRoute: flatNavItems.some((item) => item.key === "health_center"),
    helpers: { productivityScopeForView, helpForView }
  }), [companyContext, effectiveView]);

  const notify = (message, type = "success") => {
    setToast({ message: type === "error" ? friendlyToastMessage(message) : message, type });
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => setToast(null), 2600);
  };

  async function logout() {
    try {
      await api.logout();
    } catch {
      // The local renderer session must still close if the main process is unavailable.
    } finally {
      setSession(null);
    }
  }

  async function loadCompanies() {
    if (!session) return;
    try {
      const rows = await api.listRecords("companies", { status: "active" });
      const normalizedRows = Array.isArray(rows) ? rows : [];
      setCompanies(normalizedRows);
      setCurrentCompanyId((current) => {
        if (current && normalizedRows.some((company) => String(company.id) === String(current))) return current;
        const firstCompanyId = normalizedRows[0]?.id ? String(normalizedRows[0].id) : "";
        if (firstCompanyId) window.localStorage?.setItem(COMPANY_CONTEXT_KEY, firstCompanyId);
        return firstCompanyId;
      });
    } catch (error) {
      notify(error.message, "error");
    }
  }

  useEffect(() => {
    loadCompanies();
  }, [session]);

  useEffect(() => {
    function refreshCompanies() {
      loadCompanies();
    }
    window.addEventListener("gii-gem-companies-updated", refreshCompanies);
    return () => window.removeEventListener("gii-gem-companies-updated", refreshCompanies);
  }, [session]);

  function changeCompanyContext(value) {
    if (value === "__all") {
      if (!adminUser) {
        notify("All Companies View is administrator-only.", "error");
        return;
      }
      setCompanyScope("all");
      window.localStorage?.setItem(COMPANY_SCOPE_KEY, "all");
      api.logContextAudit?.({ action: "company_scope_changed", module: "company_context", new_value: "All Companies View" }).catch(() => {});
      setRefreshNonce((current) => current + 1);
      return;
    }
    const selected = safeCompanies.find((company) => String(company.id) === String(value));
    setCompanyScope("single");
    setCurrentCompanyId(value);
    window.localStorage?.setItem(COMPANY_SCOPE_KEY, "single");
    window.localStorage?.setItem(COMPANY_CONTEXT_KEY, value);
    api.logContextAudit?.({ company_id: Number(value), action: "company_switched", module: "company_context", record_id: Number(value), new_value: selected?.company_name || value }).catch(() => {});
    setRefreshNonce((current) => current + 1);
  }

  function openCreateCompany() {
    navigate("companies");
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("gii-gem-new-record")), 0);
  }

  function openAlterCompany() {
    navigate("companies");
    notify("Company Master opened. Use the edit button on the selected company to alter details.", "warning");
  }

  useEffect(() => {
    if (!session) return;
    const seenKey = "gii-gem-help-tour-seen";
    if (window.localStorage?.getItem(seenKey) !== "yes") {
      setFirstTourOpen(true);
      window.localStorage?.setItem(seenKey, "yes");
    }
  }, [session]);

  useEffect(() => {
    window.__giiGemScrollToSection = scrollToSection;
    window.__giiGemResetScroll = resetWorkspaceScroll;
    return () => {
      window.__giiGemScrollToSection = null;
      window.__giiGemResetScroll = null;
    };
  }, []);

  function navigate(nextView, context) {
    if (nextView === view) {
      const preferredKind = businessVoucherRouteKinds[nextView];
      if (preferredKind) window.dispatchEvent(new CustomEvent("gii-gem-voucher-kind", { detail: preferredKind }));
      setMobileSidebarOpen(false);
      window.setTimeout(() => {
        if (!scrollToNavigationTarget(nextView, context)) resetWorkspaceScroll();
      }, 50);
      return;
    }
    const preferredKind = businessVoucherRouteKinds[nextView];
    if (preferredKind) window.__giiGemPreferredVoucherKind = preferredKind;
    if (context?.recordId) window.__giiGemPrefillRecordId = context.recordId;
    setNavigationHistory((current) => [view, ...current.filter((item) => item !== view)].slice(0, 12));
    setView(nextView);
    setRecentScreens((current) => [nextView, ...current.filter((item) => item !== nextView)].slice(0, 2));
    const groupId = flatNavItems.find((item) => item.key === nextView)?.groupId || "dashboard";
    setExpandedGroups((current) => {
      if (groupId === "dashboard") return {};
      const existingSections = Object.fromEntries(Object.entries(current).filter(([k]) => k === groupId || k.startsWith(`${groupId}:`)));
      return { ...existingSections, [groupId]: true };
    });
    setMobileSidebarOpen(false);
    setTimeout(() => {
      if (!scrollToNavigationTarget(nextView, context)) resetWorkspaceScroll();
    }, 50);
  }

  function exitCurrentScreen() {
    const previous = navigationHistory.find((item) => item !== view) || "dashboard";
    setNavigationHistory((current) => current.filter((item) => item !== previous));
    setView(previous);
    const groupId = flatNavItems.find((item) => item.key === previous)?.groupId || "dashboard";
    setExpandedGroups((current) => {
      if (groupId === "dashboard") return {};
      const existingSections = Object.fromEntries(Object.entries(current).filter(([k]) => k === groupId || k.startsWith(`${groupId}:`)));
      return { ...existingSections, [groupId]: true };
    });
    setRecentScreens((current) => [previous, ...current.filter((item) => item !== previous)].slice(0, 2));
    setMobileSidebarOpen(false);
    setTimeout(resetWorkspaceScroll, 50);
  }

  async function requestApplicationExit() {
    if (exitRequestPendingRef.current) return;
    exitRequestPendingRef.current = true;
    try {
      const handler = window.__giiGemExitHandler;
      if (!handler) {
        window.__giiGemIsExiting = true;
        api.forceClose?.();
        return;
      }
      const result = await handler();
      if (result?.confirmed) {
        window.__giiGemIsExiting = true;
        api.forceClose?.();
      }
    } catch (error) {
      window.__giiGemIsExiting = false;
      notify(error?.message || "The ERP could not exit. Please try again.", "error");
    } finally {
      exitRequestPendingRef.current = false;
    }
  }

  useEffect(() => {
    window.__giiGemConfirm = (options = {}) => new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmDialog({
        mode: options.mode || "normal",
        title: options.title || "Confirm Action",
        message: options.message || "Do you want to continue?",
        confirmLabel: options.confirmLabel || "Yes",
        cancelLabel: options.cancelLabel || "No",
        hideCancel: Boolean(options.hideCancel),
        requireReason: Boolean(options.requireReason),
        reasonLabel: options.reasonLabel || "Reason",
        reasonPlaceholder: options.reasonPlaceholder || "Enter reason",
        moduleName: options.moduleName || view,
        recordId: options.recordId || null
      });
    });
    return () => {
      window.__giiGemConfirm = null;
      confirmResolverRef.current = null;
    };
  }, [view]);

  function resolveConfirmation(result) {
    if (result?.confirmed) {
      window.__giiGemConfirmationAudit = [
        ...(window.__giiGemConfirmationAudit || []),
        {
          action_type: confirmDialog?.title || "Confirmation",
          module: confirmDialog?.moduleName || view,
          record_id: confirmDialog?.recordId || null,
          user: session?.displayName || "System Administrator",
          confirmed: true,
          reason: result.reason || "",
          confirmed_at: new Date().toISOString()
        }
      ].slice(-100);
    }
    if (confirmDialog?.title === "Exit Application") {
      exitConfirmResolverRef.current?.(result || { confirmed: false, reason: "" });
      exitConfirmResolverRef.current = null;
    } else {
      confirmResolverRef.current?.(result || { confirmed: false, reason: "" });
      confirmResolverRef.current = null;
    }
    setConfirmDialog(null);
  }

  useEffect(() => {
    function readDirtyState() {
      setHasUnsavedChanges(Boolean(window.__giiGemHasUnsavedChanges));
    }
    readDirtyState();
    window.addEventListener("gii-gem-dirty-state", readDirtyState);
    return () => window.removeEventListener("gii-gem-dirty-state", readDirtyState);
  }, []);

  useEffect(() => {
    window.__giiGemExitHandler = () => new Promise((resolve) => {
      exitConfirmResolverRef.current = resolve;
      setConfirmDialog({
        mode: "normal",
        title: "Exit Application",
        message: "Are you sure you want to exit? Any unsaved changes will be lost.",
        confirmLabel: "Exit",
        cancelLabel: "Stay",
        hideCancel: false
      });
    });
    return () => {
      window.__giiGemExitHandler = null;
      exitConfirmResolverRef.current?.({ confirmed: false, reason: "" });
      exitConfirmResolverRef.current = null;
    };
  }, []);

  useEffect(() => {
    function onBeforeUnload(event) {
      if (window.__giiGemIsExiting) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    if (!api.onConfirmClose) return;
    const unsub = api.onConfirmClose(requestApplicationExit);
    return () => unsub?.();
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== "Escape" || !session) return;
      if (confirmDialog || productivityLearnOpen || printPreview) {
        return;
      }
      if (globalSearchOpen) {
        setGlobalSearchOpen(false);
        setGlobalSearchQuery("");
        return;
      }
      if (shortcutHelpOpen) {
        setShortcutHelpOpen(false);
        return;
      }
      if (contextShortcutOpen) {
        setContextShortcutOpen(false);
        return;
      }
      if (userPreferencesOpen) {
        setUserPreferencesOpen(false);
        return;
      }
      if (contextHelpOpen) {
        setContextHelpOpen(false);
        return;
      }
      if (firstTourOpen) {
        setFirstTourOpen(false);
        return;
      }
      if (document.activeElement?.tagName === "SELECT") {
        document.activeElement.blur?.();
        return;
      }
      const openDialog = document.querySelector("[data-esc-close='true']");
      if (openDialog) {
        openDialog.dispatchEvent(new CustomEvent("gii-gem-close", { bubbles: true }));
        return;
      }
      if (navSearch) {
        setNavSearch("");
        document.activeElement?.blur?.();
        return;
      }
      if (view === "dashboard") {
        event.preventDefault();
        void requestApplicationExit();
        return;
      }
      event.preventDefault();
      const now = Date.now();
      if (now - lastExitEscRef.current < 900) {
        lastExitEscRef.current = 0;
        exitCurrentScreen();
        return;
      }
      lastExitEscRef.current = now;
      if (hasUnsavedChanges) {
        setConfirmDialog({
          mode: "danger",
          title: "Unsaved changes",
          message: "You have unsaved changes. Do you want to exit without saving? Press Esc again to exit directly.",
          confirmLabel: "Yes, Exit",
          cancelLabel: "No, Stay",
          onConfirm: exitCurrentScreen,
          moduleName: view
        });
      } else {
        notify("Press Esc again to go back", "info");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [session, confirmDialog, globalSearchOpen, shortcutHelpOpen, contextShortcutOpen, userPreferencesOpen, contextHelpOpen, productivityLearnOpen, firstTourOpen, printPreview, navSearch, view, hasUnsavedChanges, navigationHistory]);

  function toggleFavorite(key) {
    setFavorites((current) => current.includes(key) ? current.filter((item) => item !== key) : [key, ...current].slice(0, 2));
  }

  function toggleShortcutPanel() {
    setShortcutPanelCollapsed((current) => {
      const next = !current;
      window.localStorage?.setItem("gii-gem-shortcut-panel-collapsed", next ? "yes" : "no");
      return next;
    });
  }

  function toggleRightUtilitySidebar() {
    setRightUtilityCollapsed((current) => {
      const next = !current;
      window.localStorage?.setItem(RIGHT_UTILITY_SIDEBAR_KEY, next ? "yes" : "no");
      return next;
    });
  }

  function openPrintPreview() {
    const host = document.querySelector(".screen-host");
    if (!host) {
      notify("Nothing is available to preview on this screen.", "warning");
      return;
    }
    setPrintPreview({
      title: currentTitle[0] || "GII GeM ERP",
      subtitle: currentTitle[1] || "",
      breadcrumb: breadcrumb.join(" > "),
      generatedAt: new Date().toLocaleString("en-IN"),
      html: createPrintableSnapshot(host),
      templateData: collectPrintTemplateData(host),
      templateOptions: getPrintTemplateOptionsForView(effectiveView),
      selectedTemplateKey: "screen_snapshot",
      sourceView: effectiveView
    });
  }

  function executeDesktopShortcut(command) {
    if (!session) return;
    if (confirmDialog || globalSearchOpen || shortcutHelpOpen || userPreferencesOpen || contextHelpOpen || firstTourOpen) return;
    if (!command) return;

    if (/^f[2-9]$/.test(command) && handleModuleFunctionKey(command.toUpperCase())) return;

    const quickViews = {
      "nav-1": "dashboard",
      "nav-2": "companies",
      "nav-3": "supply_orders",
      "nav-4": "inventory_dashboard",
      "nav-5": "voucher_dashboard",
      "nav-6": "receivables",
      "nav-7": "payables",
      "nav-8": "gst",
      "nav-9": "reports"
    };
    if (quickViews[command]) {
      navigate(quickViews[command]);
      return;
    }

    const voucherCommands = {
      "voucher-receipt": ["receipt", "voucher_dashboard"],
      "voucher-supplier-payment": ["supplier_payment", "voucher_dashboard"],
      "voucher-sales": ["sales", "voucher_dashboard"],
      "voucher-purchase": ["purchase", "voucher_dashboard"],
      "voucher-journal": ["journal", "manual_voucher"],
      "voucher-contra": ["contra", "voucher_dashboard"],
      "voucher-credit-note": ["credit_note", "voucher_dashboard"],
      "voucher-debit-note": ["debit_note", "voucher_dashboard"]
    };
    if (voucherCommands[command]) {
      const [kind, targetView] = voucherCommands[command];
      openVoucherShortcut(kind, targetView);
      return;
    }

    const inventoryCommands = {
      "inventory-issue": "stock_outwards",
      "inventory-receipt": "stock_inwards",
      "inventory-transfer": "warehouse_transfers",
      "inventory-adjustment": "stock_adjustments"
    };
    if (inventoryCommands[command]) {
      openRecordAction(inventoryCommands[command]);
      return;
    }

    if (command === "save") submitCurrentForm();
    if (command === "new-record") window.dispatchEvent(new CustomEvent("gii-gem-new-record"));
    if (command === "edit-or-export") {
      const activeGroupId = flatNavItems.find((item) => item.key === view || item.key === effectiveView)?.groupId;
      if (activeGroupId === "reports") clickExportButton(notify);
      else editSelectedTableRow();
    }
    if (command === "focus-search") focusSearchField();
    if (command === "print-preview") openPrintPreview();
    if (command === "refresh") window.dispatchEvent(new CustomEvent("gii-gem-refresh-screen"));
    if (command === "settings") navigate("settings");
    if (command === "global-search") setGlobalSearchOpen(true);
    if (command === "backup-create") createBackupFromShortcut();
    if (command === "backup-restore") {
      navigate("settings");
      notify("Open Backup & Restore in Settings, then select the backup to restore.", "warning");
    }
    if (command === "production-health") navigate("financial_control");
    if (command === "audit-log") navigate("audit_log");
    if (command === "dashboard") navigate("dashboard");
    if (command === "back" && view !== "dashboard") exitCurrentScreen();
    if (command === "f1") setContextHelpOpen(true);
    if (command === "shift-f1") setProductivityLearnOpen(true);
    if (command === "f2") openRecordAction("supply_orders");
    if (command === "f3") editSelectedTableRow();
    if (command === "f4") viewSelectedTableRow();
    if (command === "f5") window.dispatchEvent(new CustomEvent("gii-gem-refresh-screen"));
    if (command === "f6") openRecordAction("procurements");
    if (command === "f7") openRecordAction("stock_reservations");
    if (command === "f8") openRecordAction("invoices");
    if (command === "f9") openVoucherShortcut("debit_note");
    if (command === "f10") window.dispatchEvent(new CustomEvent("gii-gem-quick-create"));
    if (command === "f11") toggleFullScreen();
    if (command === "f12") setUserPreferencesOpen(true);
  }

  useEffect(() => {
    function handlePrintPreviewRequest() {
      openPrintPreview();
    }
    const unsubscribeLegacyPrint = api.onPrintShortcut?.(handlePrintPreviewRequest);
    const unsubscribeDesktopShortcut = api.onDesktopShortcut?.(executeDesktopShortcut);
    window.addEventListener("gii-gem-print-preview", handlePrintPreviewRequest);
    return () => {
      unsubscribeLegacyPrint?.();
      unsubscribeDesktopShortcut?.();
      window.removeEventListener("gii-gem-print-preview", handlePrintPreviewRequest);
    };
  }, [session, confirmDialog, globalSearchOpen, shortcutHelpOpen, userPreferencesOpen, contextHelpOpen, firstTourOpen, currentTitle, breadcrumb, view, effectiveView, navigationHistory]);

  async function createBackupFromShortcut() {
    const confirmed = await confirmAction({
      mode: "warning",
      title: "Create Backup",
      message: "Do you want to create a backup of the current database?",
      confirmLabel: "Yes, Backup",
      cancelLabel: "No, Cancel",
      moduleName: "backup"
    });
    if (!confirmed.confirmed) return;
    try {
      const backup = await api.createBackup();
      notify(`Backup created: ${backup.fileName || "database backup"}`);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  function openVoucherShortcut(voucherKind, targetView = "voucher_dashboard") {
    window.__giiGemPreferredVoucherKind = voucherKind;
    navigate(targetView, { section: "entry" });
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("gii-gem-voucher-kind", { detail: voucherKind }));
      window.dispatchEvent(new CustomEvent("gii-gem-new-record"));
    }, 0);
  }

  function openRecordAction(viewKey) {
    navigate(viewKey, { section: "entry" });
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("gii-gem-new-record")), 0);
  }

  function handleProductivityAction(action) {
    if (!action) return;
    if (action.type === "new") {
      openRecordAction(action.view);
      return;
    }
    if (action.type === "voucher") {
      openVoucherShortcut(action.kind, action.targetView || "voucher_dashboard");
      return;
    }
    if (action.type === "navigate") {
      navigate(action.view, action.navigationContext || (action.section ? { section: action.section } : undefined));
      return;
    }
    if (action.type === "refresh") {
      window.dispatchEvent(new CustomEvent("gii-gem-refresh-screen"));
      notify("Screen refreshed");
      return;
    }
    if (action.type === "print") {
      openPrintPreview();
      return;
    }
    if (action.type === "export") {
      notify("Use the screen export button or report toolbar for the current data set.", "warning");
      return;
    }
    if (action.type === "pdf") {
      openPrintPreview();
      notify("Use Save PDF in the ERP print preview.");
    }
  }

  function selectedSupplyOrderAction(targetView, actionName) {
    const row = getSelectedTableRow();
    if (!row) {
      notify("Please select an order first.", "warning");
      return;
    }
    if (selectedRowLocked(row)) {
      notify("Selected order is locked or closed. Unsafe actions are disabled.", "warning");
      return;
    }
    navigate(targetView, { section: "entry", recordId: row.id });
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("gii-gem-new-record")), 0);
    notify(`${actionName} opened for the selected order`);
  }

  function handleModuleFunctionKey(key) {
    const activeGroupId = flatNavItems.find((item) => item.key === view || item.key === effectiveView)?.groupId;
    const inSupplyOrders = effectiveView === "supply_orders";
    const inInventory = activeGroupId === "inventory" || inventoryReportViews.has(effectiveView) || ["stock_inwards", "stock_outwards", "stock_adjustments", "stock_returns"].includes(effectiveView);
    const inAccounting = activeGroupId === "accounting" || effectiveView === "voucher_dashboard";

    if (inSupplyOrders) {
      const orderShortcuts = {
        F2: () => openRecordAction("supply_orders"),
        F3: () => editSelectedTableRow({ requireSelection: true, notify }),
        F4: () => viewSelectedTableRow({ requireSelection: true, notify }),
        F6: () => selectedSupplyOrderAction("procurements", "Procurement"),
        F7: () => selectedSupplyOrderAction("stock_reservations", "Stock reservation"),
        F8: () => selectedSupplyOrderAction("invoices", "Invoice")
      };
      if (orderShortcuts[key]) {
        orderShortcuts[key]();
        return true;
      }
    }

    if (inInventory) {
      const inventoryShortcuts = {
        F2: () => openRecordAction("stock_inwards"),
        F3: () => openRecordAction("stock_outwards"),
        F4: () => openRecordAction("warehouse_transfers")
      };
      if (key === "F5" && ["inventory_dashboard", "stock_adjustments", "stock_inwards", "stock_outwards"].includes(effectiveView)) {
        openRecordAction("stock_adjustments");
        return true;
      }
      if (inventoryShortcuts[key]) {
        inventoryShortcuts[key]();
        return true;
      }
    }

    if (inAccounting) {
      const accountingShortcuts = {
        F2: () => openVoucherShortcut("receipt"),
        F3: () => openVoucherShortcut("supplier_payment"),
        F4: () => openVoucherShortcut("sales"),
        F5: () => openVoucherShortcut("purchase"),
        F6: () => openVoucherShortcut("contra"),
        F7: () => openVoucherShortcut("journal", "manual_voucher"),
        F8: () => openVoucherShortcut("credit_note"),
        F9: () => openVoucherShortcut("debit_note")
      };
      if (accountingShortcuts[key]) {
        accountingShortcuts[key]();
        return true;
      }
    }

    return false;
  }

  useEffect(() => {
    function refreshCurrentScreen() {
      setRefreshNonce((current) => current + 1);
    }
    window.addEventListener("gii-gem-refresh-screen", refreshCurrentScreen);
    return () => window.removeEventListener("gii-gem-refresh-screen", refreshCurrentScreen);
  }, []);

  useEffect(() => {
    if (!globalSearchOpen) return;
    let cancelled = false;
    Promise.allSettled([api.getReferences(companyContext), api.getAccountingData(companyContext)]).then(([refs, accounting]) => {
      if (cancelled) return;
      setGlobalSearchData({
        references: refs.status === "fulfilled" ? refs.value : {},
        accounting: accounting.status === "fulfilled" ? accounting.value : {}
      });
    });
    return () => {
      cancelled = true;
    };
  }, [globalSearchOpen, companyContext.company_id, companyContext.company_scope]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const scope = productivityScopeForView(effectiveView);
    const accountingNeeded = ["accounting", "receivables", "payables"].includes(scope);
    const inventoryNeeded = scope === "inventory";
    const requests = [api.getDashboardCounts(companyContext)];
    if (accountingNeeded) requests.push(api.getAccountingData(companyContext));
    if (inventoryNeeded && api.getInventoryData) requests.push(api.getInventoryData(companyContext));
    Promise.allSettled(requests).then((results) => {
      if (cancelled) return;
      setProductivityStats({
        counts: results[0]?.status === "fulfilled" ? results[0].value : {},
        accounting: accountingNeeded && results[1]?.status === "fulfilled" ? results[1].value : {},
        inventory: inventoryNeeded && results[1]?.status === "fulfilled" ? results[1].value : {},
        refreshedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      });
    }).catch(() => {
      if (!cancelled) setProductivityStats({ counts: {}, accounting: {}, inventory: {}, refreshedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
    });
    return () => {
      cancelled = true;
    };
  }, [session, effectiveView, refreshNonce, companyContext.company_id, companyContext.company_scope]);

  useEffect(() => {
    function onProductivityKeyDown(event) {
      if (!session || (event.defaultPrevented && event.key !== "Enter")) return;
      if (confirmDialog || globalSearchOpen || shortcutHelpOpen || userPreferencesOpen || contextHelpOpen || firstTourOpen) return;

      if ((event.key === "Enter" || event.key === "Escape") && document.activeElement?.tagName === "SELECT") {
        if (event.key === "Escape") document.activeElement.blur?.();
        return;
      }
      if (event.key === "Enter" && !event.ctrlKey && !event.altKey && !event.metaKey && isEditableFormElement(document.activeElement)) {
        event.preventDefault();
        moveFormFocus(document.activeElement, event.shiftKey ? -1 : 1);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "e" && document.querySelector(".workspace table tbody tr.keyboard-row-selected")) {
        event.preventDefault();
        editSelectedTableRow();
        return;
      }
      const keyboardBackKey = event.key === "BrowserBack" || event.code === "BrowserBack";
      const altLeftBackKey = event.altKey && !event.ctrlKey && !event.metaKey && event.key === "ArrowLeft";
      const safeBackspaceKey = event.key === "Backspace" && !isTextEntryElement(document.activeElement);
      if (keyboardBackKey || altLeftBackKey || safeBackspaceKey) {
        event.preventDefault();
        if (view !== "dashboard") exitCurrentScreen();
        return;
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey && !isTextEntryElement(document.activeElement)) {
        if (moveTableSelection(event.key)) event.preventDefault();
        return;
      }
      if (event.key === "Enter" && !isTextEntryElement(document.activeElement) && document.querySelector(".workspace table tbody tr.keyboard-row-selected")) {
        if (moveTableSelection(event.key)) event.preventDefault();
        return;
      }
      if (/^F[2-9]$/.test(event.key) && !event.ctrlKey && !event.altKey && !event.metaKey && handleModuleFunctionKey(event.key)) {
        event.preventDefault();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (event.shiftKey) {
          if (key === "b") {
            event.preventDefault();
            createBackupFromShortcut();
            return;
          }
          if (key === "r") {
            event.preventDefault();
            navigate("settings");
            notify("Open Backup & Restore in Settings, then select the backup to restore.", "warning");
            return;
          }
          if (key === "p") {
            event.preventDefault();
            navigate("financial_control");
            return;
          }
          if (key === "l") {
            event.preventDefault();
            navigate("audit_log");
            return;
          }
        }
        if (/^[1-9]$/.test(key)) {
          event.preventDefault();
          const quickViews = {
            "1": "dashboard",
            "2": "companies",
            "3": "supply_orders",
            "4": "inventory_dashboard",
            "5": "voucher_dashboard",
            "6": "receivables",
            "7": "payables",
            "8": "gst",
            "9": "reports"
          };
          navigate(quickViews[key]);
          return;
        }
        if (key === "s") {
          event.preventDefault();
          submitCurrentForm();
          return;
        }
        if (key === "n") {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent("gii-gem-new-record"));
          return;
        }
        if (key === "e") {
          event.preventDefault();
          const activeGroupId = flatNavItems.find((item) => item.key === view || item.key === effectiveView)?.groupId;
          if (activeGroupId === "reports") {
            clickExportButton(notify);
            return;
          }
          editSelectedTableRow();
          return;
        }
        if (key === "f") {
          event.preventDefault();
          focusSearchField();
          return;
        }
        if (key === "p") {
          event.preventDefault();
          openPrintPreview();
          return;
        }
        if (key === "r") {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent("gii-gem-refresh-screen"));
          return;
        }
        if (key === "b") {
          event.preventDefault();
          navigate("settings");
          return;
        }
        if (key === "k") {
          event.preventDefault();
          setGlobalSearchOpen(true);
          return;
        }
      }
      if (event.altKey && event.key === "Home") {
        event.preventDefault();
        navigate("dashboard");
        return;
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key !== "ArrowLeft") {
        const key = event.key.toLowerCase();
        const voucherShortcuts = {
          r: ["receipt", "voucher_dashboard"],
          p: ["supplier_payment", "voucher_dashboard"],
          s: ["sales", "voucher_dashboard"],
          u: ["purchase", "voucher_dashboard"],
          j: ["journal", "manual_voucher"],
          c: ["contra", "voucher_dashboard"],
          n: ["credit_note", "voucher_dashboard"],
          d: ["debit_note", "voucher_dashboard"]
        };
        const inventoryShortcuts = {
          i: "stock_outwards",
          g: "stock_inwards",
          t: "warehouse_transfers",
          a: "stock_adjustments"
        };
        if (voucherShortcuts[key]) {
          event.preventDefault();
          const [kind, targetView] = voucherShortcuts[key];
          openVoucherShortcut(kind, targetView);
          return;
        }
        if (inventoryShortcuts[key]) {
          event.preventDefault();
          openRecordAction(inventoryShortcuts[key]);
          return;
        }
      }
      if (event.key === "F1" && event.shiftKey) {
        event.preventDefault();
        setProductivityLearnOpen(true);
        return;
      }
      if (event.key === "F1") {
        event.preventDefault();
        setContextHelpOpen(true);
        return;
      }
      if (event.key === "/" && event.ctrlKey && !event.altKey && !isTextEntryElement(document.activeElement)) {
        event.preventDefault();
        setContextShortcutOpen((prev) => !prev);
        return;
      }
      if (event.key === "F2") {
        event.preventDefault();
        openRecordAction("supply_orders");
        return;
      }
      if (event.key === "F3") {
        event.preventDefault();
        editSelectedTableRow();
        return;
      }
      if (event.key === "F4") {
        event.preventDefault();
        viewSelectedTableRow();
        return;
      }
      if (event.key === "F5") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("gii-gem-refresh-screen"));
        return;
      }
      if (event.key === "F6") {
        event.preventDefault();
        openRecordAction("procurements");
        return;
      }
      if (event.key === "F7") {
        event.preventDefault();
        openRecordAction("stock_reservations");
        return;
      }
      if (event.key === "F8") {
        event.preventDefault();
        openRecordAction("invoices");
        return;
      }
      if (event.key === "F9") {
        event.preventDefault();
        openVoucherShortcut("debit_note");
        return;
      }
      if (event.key === "Insert" && event.altKey && !event.ctrlKey && !event.metaKey) {
        if (document.activeElement?.closest(".entity-picker-trigger")) return;
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("gii-gem-quick-create"));
        return;
      }
      if (event.key === "F11") {
        event.preventDefault();
        toggleFullScreen();
        return;
      }
      if (event.key === "F12") {
        event.preventDefault();
        setUserPreferencesOpen(true);
        return;
      }
    }
    window.addEventListener("keydown", onProductivityKeyDown, true);
    return () => window.removeEventListener("keydown", onProductivityKeyDown, true);
  }, [session, confirmDialog, globalSearchOpen, shortcutHelpOpen, userPreferencesOpen, contextHelpOpen, firstTourOpen, view, navigationHistory]);

  if (!session) {
    return (
      <>
        <LoginScreen onLogin={setSession} notify={notify} toast={toast} api={api} />
        {confirmDialog && <ConfirmDialog dialog={confirmDialog} onResolve={resolveConfirmation} />}
      </>
    );
  }

  return (
    <div className={`app-shell ${compactSidebar ? "compact-shell" : ""} ${rightUtilityCollapsed ? "utility-compact-shell" : ""} ${mobileSidebarOpen ? "sidebar-open" : ""}`}>
      <RendererErrorBoundary
        title="Navigation could not load"
        resetKey={`nav-${view}-${navSearch}`}
        crashContext={{ ...rendererCrashContext, section: "navigation" }}
        onError={(error) => notify(error.message || "Navigation could not load", "error")}
        onOpenSafeMode={() => setView("safe_mode")}
        onReset={() => { setView("dashboard"); setNavSearch(""); setExpandedGroups({}); }}
      >
        <NavigationSidebar
          compactSidebar={compactSidebar}
          navSearch={navSearch}
          onNavSearchChange={setNavSearch}
          onToggleCompact={() => setCompactSidebar((current) => !current)}
          view={view}
          effectiveView={effectiveView}
          searchedGroups={searchedGroups}
          expandedGroups={expandedGroups}
          onSetExpandedGroups={setExpandedGroups}
          recentScreens={recentScreens}
          favorites={favorites}
          onNavigate={navigate}
          onFavorite={toggleFavorite}
        />
      </RendererErrorBoundary>

      <WorkspaceFrame
        breadcrumb={breadcrumb.join(" > ")}
        title={currentTitle[0]}
        subtitle={currentTitle[1]}
        canGoBack={effectiveView !== "dashboard"}
        onBack={exitCurrentScreen}
        onToggleMobileSidebar={() => setMobileSidebarOpen((current) => !current)}
      >

        <HelpQuickActionsBar
          onHelp={() => {
            setHelpAssistantSourceView(effectiveView);
            setHelpAssistantInitialMode("screen");
            navigate("help_assistant");
          }}
          onHelpAssistant={() => {
            setHelpAssistantSourceView(effectiveView);
            setHelpAssistantInitialMode("help");
            navigate("help_assistant");
          }}
          onLearnThisScreen={() => setProductivityLearnOpen(true)}
          onTraining={() => { setTrainingMode((current) => !current); navigate("help_training"); }}
          session={session}
          companyContext={companyContext}
          api={api}
        />

        <RendererErrorBoundary
          title="Screen could not load"
          resetKey={`${effectiveView}-${refreshNonce}`}
          crashContext={{ ...rendererCrashContext, section: "screen" }}
          onError={(error) => notify(error.message || "Screen could not load", "error")}
          onOpenSafeMode={() => setView("safe_mode")}
          onReset={() => { setView("dashboard"); setRefreshNonce((current) => current + 1); }}
        >
          <div className="screen-host" key={`${effectiveView}-${refreshNonce}`}>
            <RuntimeBanner isDesktopRuntime={isDesktopRuntime} />
            <TrainingModeBanner trainingMode={trainingMode} />
            {allCompaniesReadOnly ? (
              <AllCompaniesReadOnlyScreen
                companies={safeCompanies}
                onSwitchCompany={() => changeCompanyContext(currentCompanyId || safeCompanies[0]?.id || "")}
              />
            ) : (
              <>
            {effectiveView === "safe_mode" && <SafeModeRecoveryScreen notify={notify} apiClient={api} onNavigate={navigate} startupSelfTest={startupSelfTest} />}
            {effectiveView === "production_readiness" && <ProductionReadinessScreen apiClient={api} />}
            {effectiveView === "go_live_wizard" && <GoLiveWizard apiClient={api} companyContext={companyContext} />}
            {effectiveView === "dashboard" && <DashboardScreen notify={notify} setView={navigate} companyContext={companyContext} apiClient={api} />}
            {effectiveView === "billing_drilldown" && <BillingDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "collections_drilldown" && <CollectionsDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "receivables_drilldown" && <ReceivablesDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "profit_drilldown" && <ProfitDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "orders_drilldown" && <OrdersDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "treasury_drilldown" && <TreasuryDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "gst_drilldown" && <GstDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "profit_simulator" && <ProfitSimulatorScreen notify={notify} companyContext={companyContext} apiClient={api} />}
            {effectiveView === "stock_drilldown" && <StockDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "trial_balance_drilldown" && <TrialBalanceDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "unposted_drilldown" && <UnpostedDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "settings" && <SettingsScreen notify={notify} apiClient={api} confirmAction={confirmAction} role={session.role} userId={session.id} companyContext={companyContext} />}
            {effectiveView === "environment_manager" && <EnvironmentManagerScreen notify={notify} apiClient={api} session={session} companyContext={companyContext} onDataReset={() => { setGlobalSearchData(null); setProductivityStats(null); loadCompanies(); }} />}
            {effectiveView === "health_center" && <HealthCenterScreen notify={notify} apiClient={api} session={session} companyContext={companyContext} onNavigate={navigate} />}
            {masterViews[effectiveView] && <MasterScreen table={effectiveView} config={masterViews[effectiveView]} notify={notify} companyContext={companyContext} selectTableRow={selectTableRow} api={api} />}
            {effectiveView === "invoices" && <BillingVoucherScreen notify={notify} role={session.role} companyContext={companyContext} onNavigate={navigate} api={api} confirmAction={confirmAction} reversalConfirmOptions={reversalConfirmOptions} postConfirmOptions={postConfirmOptions} isRecordLocked={isRecordLocked} normalizeStatusClass={normalizeStatusClass} />}
            {transactionViews[effectiveView] && effectiveView !== "invoices" && <TransactionScreen table={effectiveView} config={transactionViews[effectiveView]} notify={notify} companyContext={companyContext} onNavigate={navigate} api={api} role={session.role} />}
            {operationsReportViews.has(effectiveView) && <OperationsScreen view={effectiveView} notify={notify} onNavigate={navigate} companyContext={companyContext} api={api} />}
            {inventoryReportViews.has(effectiveView) && <InventoryReportScreen view={effectiveView} notify={notify} companyContext={companyContext} onNavigate={navigate} api={api} />}
            {effectiveView === "profitability" && <ProfitabilityScreen notify={notify} companyContext={companyContext} apiClient={api} onNavigate={navigate} />}
            {effectiveView === "voucher_dashboard" && <BusinessVoucherScreen notify={notify} onNavigate={navigate} role={session.role} requestedVoucherKind={businessVoucherRouteKinds[view]} companyContext={companyContext} api={api} />}
            {effectiveView === "manual_voucher" && <VoucherEntryScreen notify={notify} companyContext={companyContext} api={api} />}
            {bankStatementViews.has(effectiveView) && <BankStatementScreen view={effectiveView} notify={notify} companyContext={companyContext} api={api} />}
            {voucherProposalViews.has(effectiveView) && <VoucherProposalScreen view={effectiveView} notify={notify} role={session.role} companyContext={companyContext} api={api} confirmAction={confirmAction} />}
            {["receipt_allocation_workflow", "supplier_allocation_workflow", "advance_adjustment_wizard", "supplier_advance_adjustment_wizard", "party_opening_balances", "credit_terms"].includes(effectiveView) && <AllocationWorkflowScreen view={effectiveView} notify={notify} role={session.role} companyContext={companyContext} api={api} />}
            {["chart_accounts", "voucher_register", "ledger_view", "cash_bank_ledger", "day_book", "cash_book", "bank_book", "trial_balance", "profit_loss", "balance_sheet", "posting_control", "party_ledger", "department_ledger", "supplier_ledger", "bill_wise_receivables", "bill_wise_payables", "payment_allocations", "supplier_payment_allocations", "allocation_reconciliation", "unallocated_receipts", "unallocated_supplier_payments", "advance_receipts", "supplier_advances", "advance_adjustments", "allocation_audit", "receivable_ageing", "payable_ageing", "tds_reconciliation", "gst_tds_reconciliation", "party_ledger_summary", "party_reconciliation", "financial_control", "financial_years", "opening_balances", "approval_queue", "gst_register", "tds_register", "bill_outstanding", "year_end_closing", "carry_forward", "audit_log"].includes(effectiveView) && <AccountingScreen view={effectiveView} notify={notify} role={session.role} companyContext={companyContext} onNavigate={navigate} api={api} />}
            {effectiveView === "documents" && <DocumentsScreen notify={notify} companyContext={companyContext} apiClient={api} onNavigate={navigate} confirmAction={confirmAction} />}
            {["employee_performance", "receivables", "payables", "cash_flow", "gst", "reports"].includes(effectiveView) && <SummaryScreen view={effectiveView} notify={notify} companyContext={companyContext} onNavigate={navigate} api={api} />}
            {effectiveView === "master_data_tools" && <MasterDataToolsScreen notify={notify} apiClient={api} session={session} companyContext={companyContext} />}
            {effectiveView === "master_import_templates" && <MasterImportTemplatesScreen notify={notify} api={api} />}
            {effectiveView === "tally_migration_assistant" && <TallyMasterMigrationAssistantScreen api={api} notify={notify} session={session} companyContext={companyContext} setUtilityExtension={setUtilityExtension} />}
            {effectiveView === "tally_xml_import" && <TallyXmlImportScreen api={api} notify={notify} session={session} companyContext={companyContext} />}
            {effectiveView === "crac_management" && <CRACManagementScreen notify={notify} companyContext={companyContext} apiClient={api} onNavigate={navigate} />}
            {effectiveView === "crac_entry" && <CRACEntryScreen notify={notify} companyContext={companyContext} apiClient={api} onNavigate={navigate} />}
            {effectiveView === "crac_tracker" && <CRACTrackerScreen notify={notify} companyContext={companyContext} apiClient={api} onNavigate={navigate} />}
            {effectiveView === "payment_readiness" && <PaymentReadinessScreen notify={notify} companyContext={companyContext} apiClient={api} onNavigate={navigate} />}
            {effectiveView === "order_closure_tracking" && <OrderClosureScreen notify={notify} companyContext={companyContext} apiClient={api} onNavigate={navigate} />}
            {effectiveView === "help_assistant" && (
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
            )}
            {effectiveView === "help_keyboard" && <KeyboardShortcutScreen onNavigate={navigate} />}
            {effectiveView === "help_training" && (
              <HelpTrainingScreen
                currentView={view}
                trainingMode={trainingMode}
                setTrainingMode={setTrainingMode}
                onNavigate={navigate}
                onShortcutHelp={() => setShortcutHelpOpen(true)}
                helpForView={helpForView}
                matchesHelpQuery={matchesHelpQuery}
              />
            )}
              </>
            )}
          </div>
        </RendererErrorBoundary>
      </WorkspaceFrame>
      <RendererErrorBoundary
        title="Utilities panel could not load"
        resetKey={`utility-${effectiveView}-${rightUtilityCollapsed}-${shortcutPanelCollapsed}`}
        crashContext={{ ...rendererCrashContext, section: "right_utility_sidebar" }}
        onError={(error) => notify(error.message || "Utilities panel could not load", "error")}
        onOpenSafeMode={() => setView("safe_mode")}
        onReset={() => { setRightUtilityCollapsed(true); setShortcutPanelCollapsed(true); }}
      >
        <RightUtilitySidebar
          collapsed={rightUtilityCollapsed}
          onToggle={toggleRightUtilitySidebar}
          session={session}
          onLogout={logout}
          companies={safeCompanies}
          companyContext={companyContext}
          currentCompanyId={currentCompanyId}
          adminUser={adminUser}
          onCompanyChange={changeCompanyContext}
          onCreateCompany={openCreateCompany}
          onAlterCompany={openAlterCompany}
          onSettings={() => navigate("settings")}
          onLearnThisScreen={() => setProductivityLearnOpen(true)}
          onShortcutPanelToggle={toggleShortcutPanel}
          productivityPanel={(
            <ContextShortcutPanel
              view={effectiveView}
              role={session.role}
              stats={productivityStats}
              collapsed={shortcutPanelCollapsed}
              onToggle={toggleShortcutPanel}
              onAction={handleProductivityAction}
              onLearn={() => setProductivityLearnOpen(true)}
            />
          )}
          extension={utilityExtension}
        />
      </RendererErrorBoundary>
      {mobileSidebarOpen && <SidebarScrim onClose={() => setMobileSidebarOpen(false)} />}
      {confirmDialog && <ConfirmDialog dialog={confirmDialog} onResolve={resolveConfirmation} />}
      {globalSearchOpen && <GlobalSearchOverlay query={globalSearchQuery} setQuery={setGlobalSearchQuery} results={globalSearchResults} onNavigate={(key) => { setGlobalSearchOpen(false); setGlobalSearchQuery(""); navigate(key); }} onClose={() => setGlobalSearchOpen(false)} />}
      {shortcutHelpOpen && <ShortcutHelpDialog onClose={() => setShortcutHelpOpen(false)} />}
      {contextShortcutOpen && <ContextShortcutOverlay view={effectiveView} onClose={() => setContextShortcutOpen(false)} />}
      {userPreferencesOpen && <UserPreferencesDialog onClose={() => setUserPreferencesOpen(false)} compactSidebar={compactSidebar} />}
      {contextHelpOpen && <ContextHelpDialog view={effectiveView} onClose={() => setContextHelpOpen(false)} onOpenTraining={() => { setContextHelpOpen(false); navigate("help_training"); }} onOpenAssistant={() => { setContextHelpOpen(false); setHelpAssistantSourceView(effectiveView); setHelpAssistantInitialMode("brain"); navigate("help_assistant"); }} />}
      {productivityLearnOpen && <ProductivityLearnDialog view={effectiveView} onClose={() => setProductivityLearnOpen(false)} onOpenTraining={() => { setProductivityLearnOpen(false); navigate("help_training"); }} />}
      {firstTourOpen && <FirstTimeTour onClose={() => setFirstTourOpen(false)} onOpenHelp={() => { setFirstTourOpen(false); navigate("help_training"); }} />}
      {printPreview && <PrintPreviewDialog preview={printPreview} onClose={() => setPrintPreview(null)} notify={notify} desktopApi={api} />}
      <ToastNotification toast={toast} />
    </div>
  );
}

function createPrintableSnapshot(sourceNode) {
  const clone = sourceNode.cloneNode(true);
  clone.querySelectorAll(".runtime-banner, .training-banner, .productivity-panel, .button-row, .toolbar-controls, .billing-actions, .quick-create-modal, button, input[type='file'], [data-print-ignore='true']").forEach((node) => node.remove());
  clone.querySelectorAll("input, textarea, select").forEach((field) => {
    if (field.type === "hidden") {
      field.remove();
      return;
    }
    let value = "";
    if (field.tagName === "SELECT") {
      value = field.options?.[field.selectedIndex]?.text || field.value || "";
    } else if (field.type === "checkbox") {
      value = field.checked ? "Yes" : "No";
    } else if (field.type === "radio") {
      value = field.checked ? field.value || "Selected" : "";
    } else {
      value = field.value || field.getAttribute("value") || "";
    }
    const replacement = document.createElement("span");
    replacement.className = "print-field-value";
    replacement.textContent = value || "-";
    field.replaceWith(replacement);
  });
  clone.querySelectorAll("[contenteditable='true']").forEach((node) => node.removeAttribute("contenteditable"));
  return clone.innerHTML;
}

function buildVisibleNavGroups(query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return navGroups;
  return navGroups
    .map((group) => {
      const itemMatches = ([key, label, aliases]) => {
        const title = viewTitles[key]?.[0] || label;
        const description = viewTitles[key]?.[1] || "";
        return [label, aliases, title, description, group.label].join(" ").toLowerCase().includes(needle);
      };
      const sections = group.sections?.map((section) => ({
        ...section,
        items: section.items.filter((item) => itemMatches(item))
      })).filter((section) => section.items.length);
      const items = group.items.filter((item) => itemMatches(item));
      return { ...group, sections, items };
    })
    .filter((group) => group.items.length);
}

function submitCurrentForm() {
  const form = document.activeElement?.closest?.("form") || document.querySelector("form[data-entry-form='true'], .workspace form");
  form?.requestSubmit?.();
}

function focusSearchField() {
  const field = document.querySelector("input[data-search-input='true'], .records-toolbar input[placeholder*='Search'], .sidebar-tools input");
  field?.focus?.();
  field?.select?.();
}

function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

function isEditableFormElement(element) {
  if (!element || !["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName)) return false;
  if (element.disabled || element.readOnly || element.type === "hidden") return false;
  return Boolean(element.closest("form"));
}

function isTextEntryElement(element) {
  return element && ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

async function moveFormFocus(element, direction) {
  const form = element.closest("form");
  const fields = editableFields(form);
  const index = fields.indexOf(element);
  if (index < 0) return;
  const next = fields[index + direction];
  if (next) {
    document.querySelectorAll(".smart-enter-next").forEach((el) => el.classList.remove("smart-enter-next"));
    next.classList.add("smart-enter-next");
    next.focus();
    next.select?.();
    setTimeout(() => next.classList.remove("smart-enter-next"), 600);
    return;
  }
  if (direction > 0) {
    document.querySelectorAll(".smart-enter-next").forEach((el) => el.classList.remove("smart-enter-next"));
    const confirmed = await confirmAction({
      mode: "normal",
      title: "Save Record",
      message: "Do you want to save this record?",
      confirmLabel: "Yes",
      cancelLabel: "No",
      moduleName: "keyboard"
    });
    if (confirmed.confirmed) form.requestSubmit?.();
  }
}

function editableFields(form) {
  if (!form) return [];
  return Array.from(form.querySelectorAll("input, select, textarea"))
    .filter((field) => !field.disabled && !field.readOnly && field.type !== "hidden" && field.offsetParent !== null);
}

function selectableRows() {
  return Array.from(document.querySelectorAll(".workspace table tbody tr")).filter((row) => row.offsetParent !== null);
}

function moveTableSelection(key) {
  const rows = selectableRows();
  if (!rows.length) return false;
  const currentIndex = Math.max(0, rows.findIndex((row) => row.classList.contains("keyboard-row-selected")));
  let nextIndex = currentIndex;
  if (key === "ArrowDown") nextIndex = Math.min(rows.length - 1, currentIndex + 1);
  if (key === "ArrowUp") nextIndex = Math.max(0, currentIndex - 1);
  if (key === "Home") nextIndex = 0;
  if (key === "End") nextIndex = rows.length - 1;
  if (key === "PageDown") nextIndex = Math.min(rows.length - 1, currentIndex + 10);
  if (key === "PageUp") nextIndex = Math.max(0, currentIndex - 10);
  if (key === "Enter") {
    rows[currentIndex]?.querySelector("button:not(:disabled)")?.click();
    return true;
  }
  selectTableRow(rows[nextIndex]);
  rows[nextIndex]?.scrollIntoView({ block: "nearest" });
  return ["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp", "ArrowLeft", "ArrowRight"].includes(key);
}

function selectTableRow(row) {
  if (!row) return;
  row.closest("tbody")?.querySelectorAll("tr").forEach((item) => item.classList.remove("keyboard-row-selected"));
  row.classList.add("keyboard-row-selected");
}

function getSelectedTableRow() {
  return document.querySelector(".workspace table tbody tr.keyboard-row-selected");
}

function selectedRowLocked(row) {
  if (!row) return false;
  const status = [row.dataset.orderStatus, row.dataset.postingStatus, row.dataset.status].join(" ").toLowerCase();
  return status.includes("closed") || status.includes("locked") || status.includes("posted") || status.includes("reversed");
}

function editSelectedTableRow(options = {}) {
  const row = getSelectedTableRow() || (options.requireSelection ? null : document.querySelector(".workspace table tbody tr"));
  if (!row) {
    options.notify?.("Please select an order first.", "warning");
    return;
  }
  if (selectedRowLocked(row)) {
    options.notify?.("Selected record is locked or closed.", "warning");
    return;
  }
  const editButton = row?.querySelector("button[title*='Edit']:not(:disabled), button[title*='Open']:not(:disabled), button:not(:disabled)");
  editButton?.click?.();
}

function viewSelectedTableRow(options = {}) {
  const row = getSelectedTableRow() || (options.requireSelection ? null : document.querySelector(".workspace table tbody tr"));
  if (!row) {
    options.notify?.("Please select an order first.", "warning");
    return;
  }
  const viewButton = row?.querySelector("button[title*='View']:not(:disabled), button[title*='Open']:not(:disabled), button[title*='Details']:not(:disabled), button:not(:disabled)");
  viewButton?.click?.();
}

function clickExportButton(notify) {
  const buttons = Array.from(document.querySelectorAll(".workspace button:not(:disabled)"));
  const exportButton = buttons.find((button) => button.textContent?.trim().toLowerCase() === "export" || button.title?.toLowerCase().includes("export"));
  if (exportButton) {
    exportButton.click();
  } else {
    notify?.("Export is not available on this screen.", "warning");
  }
}

function buildGlobalSearchResults(query, data) {
  const needle = query.trim().toLowerCase();
  const include = (text) => !needle || String(text || "").toLowerCase().includes(needle);
  const rank = (items, limit) => items
    .sort((left, right) => globalSearchRank(left, needle) - globalSearchRank(right, needle)
      || String(left.label || "").localeCompare(String(right.label || ""), "en", { numeric: true, sensitivity: "base" }))
    .slice(0, limit);
  const refs = data?.references || {};
  const accounting = data?.accounting || {};
  const groups = [
    { label: "Reports & Screens", items: rank(flatNavItems.filter((item) => include(`${item.label} ${item.group} ${viewTitles[item.key]?.join(" ") || ""}`)).map((item) => ({ key: item.key, label: item.label, note: item.group })), 12) },
    { label: "Orders", items: rank((refs.orders || []).filter((row) => include(`${row.order_number} ${row.institution_name} ${row.department_name}`)).map((row) => ({ key: "supply_orders", label: row.order_number, note: row.institution_name || row.department_name })), 8) },
    { label: "Invoices", items: rank((refs.invoices || accounting.invoices || []).filter((row) => include(`${row.invoice_number} ${row.order_number} ${row.department_name}`)).map((row) => ({ key: "invoices", label: row.invoice_number, note: row.order_number || "Billing" })), 8) },
    { label: "Suppliers", items: rank((refs.suppliers || []).filter((row) => include(`${row.supplier_name} ${row.gstin} ${row.supplier_code}`)).map((row) => ({ key: "suppliers", label: row.supplier_name, note: row.gstin || "Supplier" })), 8) },
    { label: "Departments", items: rank((refs.departments || []).filter((row) => include(`${row.department_name} ${row.contact_person}`)).map((row) => ({ key: "government_departments", label: row.department_name, note: row.contact_person || "Department" })), 8) },
    { label: "Items", items: rank((refs.items || []).filter((row) => include(`${row.item_name} ${row.hsn_code} ${row.brand}`)).map((row) => ({ key: "items", label: row.item_name, note: row.hsn_code || row.category || "Item" })), 8) },
    { label: "Vouchers", items: rank((accounting.vouchers || []).filter((row) => include(`${row.voucher_number} ${row.voucher_type} ${row.narration}`)).map((row) => ({ key: "voucher_register", label: row.voucher_number, note: row.voucher_type })), 8) },
    { label: "Payments", items: rank((refs.payments || accounting.payments || []).filter((row) => include(`${row.utr_number} ${row.order_number} ${row.payment_amount}`)).map((row) => ({ key: "payments", label: row.utr_number || `Payment ${row.id}`, note: formatCurrency(row.payment_amount || row.amount || 0) })), 8) }
  ];
  return groups;
}

function globalSearchRank(item, needle) {
  if (!needle) return 4;
  const label = String(item?.label || "").trim().toLowerCase();
  const note = String(item?.note || "").trim().toLowerCase();
  if (label === needle) return 0;
  if (label.startsWith(needle)) return 1;
  if (label.includes(needle)) return 2;
  if (note.includes(needle)) return 3;
  return 4;
}

const rootElement = document.getElementById("root");

if (rootElement) {
  rootElement.innerHTML = `
    <div class="boot-fallback">
      <strong>Loading GII GeM ERP...</strong>
      <span>If this stays visible, the renderer did not finish starting.</span>
    </div>
  `;

  createRoot(rootElement).render(
    <RendererErrorBoundary
      title="ERP could not load"
      resetKey="root"
      crashContext={{ section: "root", view: "root", company: "Unknown", user: "Unknown" }}
      onError={(error) => console.error("ERP root failed", error)}
      onReset={() => window.location.reload()}
    >
      <App />
    </RendererErrorBoundary>
  );
}
