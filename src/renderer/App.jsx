import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { isDesktopRuntime, resolveApi } from "./api/client.js";
import { createBrowserFallbackApi } from "./api/browserFallbackApi.js";
import { accountingTableConfig } from "./features/accounting/accountingTableConfig.js";
import { inventoryTableConfig } from "./features/inventory/inventoryTableConfig.js";
import { voucherPlainLanguage, voucherTooltips, businessVoucherValidationMessages, businessVoucherPreview } from "./features/accounting/businessVouchers/businessVoucherUtils.js";
import { BusinessVoucherIntelligencePanel } from "./features/accounting/businessVouchers/BusinessVoucherIntelligencePanel.jsx";
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
import { Field, MetricLine, ReadOnlyBox, ReportActionButtons, ReportDateFilters, ReportSelectFilter, ReportToolbar, SearchableSelect, SelectBox, SelectField, ViewTabs } from "./components/forms/index.jsx";
import { MasterRecordsPanel } from "./components/tables/MasterRecordsPanel.jsx";
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
    const unsub = api.onConfirmClose(async () => {
      const result = await window.__giiGemExitHandler?.();
      if (result?.confirmed) {
        window.__giiGemIsExiting = true;
        api.forceClose?.();
      }
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== "Escape" || !session) return;
      if (confirmDialog) {
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
      if (view === "dashboard") return;
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
  }, [session, confirmDialog, globalSearchOpen, shortcutHelpOpen, userPreferencesOpen, navSearch, view, hasUnsavedChanges, navigationHistory]);

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
    if (command === "f1") setShortcutHelpOpen(true);
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
      if (event.key === "F1") {
        event.preventDefault();
        setShortcutHelpOpen(true);
        return;
      }
      if (event.key === "/" && !event.ctrlKey && !event.altKey && !isTextEntryElement(document.activeElement)) {
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
    return <Login onLogin={setSession} notify={notify} toast={toast} />;
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

        <RendererErrorBoundary
          title="Screen could not load"
          resetKey={`${effectiveView}-${refreshNonce}`}
          crashContext={{ ...rendererCrashContext, section: "screen" }}
          onError={(error) => notify(error.message || "Screen could not load", "error")}
          onOpenSafeMode={() => setView("safe_mode")}
          onReset={() => { setView("dashboard"); setRefreshNonce((current) => current + 1); }}
        >
          <div className="screen-host" key={`${effectiveView}-${refreshNonce}`}>
            {!isDesktopRuntime && (
              <div className="runtime-banner">
                <strong>Browser Preview Only:</strong> this screen is not connected to the SQLite desktop database. Real saving, posting, backup, restore, uploads and accounting entries require opening GII GeM ERP in the Windows Electron desktop app.
              </div>
            )}
            {trainingMode && <div className="training-banner"><strong>Training Mode:</strong> sample guidance is active. Live accounting data is not changed by the training workspace.</div>}
            {allCompaniesReadOnly ? (
              <AllCompaniesReadOnlyScreen
                companies={safeCompanies}
                onSwitchCompany={() => changeCompanyContext(currentCompanyId || safeCompanies[0]?.id || "")}
              />
            ) : (
              <>
            {effectiveView === "safe_mode" && <SafeModeRecoveryScreen notify={notify} apiClient={api} onNavigate={navigate} startupSelfTest={startupSelfTest} />}
            {effectiveView === "production_readiness" && <ProductionReadinessScreen apiClient={api} />}
            {effectiveView === "go_live_wizard" && <GoLiveWizard apiClient={api} />}
            {effectiveView === "dashboard" && <DashboardScreen notify={notify} setView={navigate} companyContext={companyContext} apiClient={api} />}
            {effectiveView === "billing_drilldown" && <BillingDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "collections_drilldown" && <CollectionsDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "receivables_drilldown" && <ReceivablesDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "profit_drilldown" && <ProfitDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "orders_drilldown" && <OrdersDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "treasury_drilldown" && <TreasuryDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "gst_drilldown" && <GstDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "stock_drilldown" && <StockDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "trial_balance_drilldown" && <TrialBalanceDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "unposted_drilldown" && <UnpostedDrilldown apiClient={api} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "settings" && <SettingsScreen notify={notify} apiClient={api} confirmAction={confirmAction} />}
            {effectiveView === "environment_manager" && <EnvironmentManagerScreen notify={notify} apiClient={api} session={session} companyContext={companyContext} />}
            {effectiveView === "health_center" && <HealthCenterScreen notify={notify} apiClient={api} session={session} companyContext={companyContext} onNavigate={navigate} />}
            {masterViews[effectiveView] && <MasterScreen table={effectiveView} config={masterViews[effectiveView]} notify={notify} companyContext={companyContext} />}
            {effectiveView === "invoices" && <BillingVoucherScreen notify={notify} role={session.role} companyContext={companyContext} onNavigate={navigate} />}
            {transactionViews[effectiveView] && effectiveView !== "invoices" && <TransactionScreen table={effectiveView} config={transactionViews[effectiveView]} notify={notify} companyContext={companyContext} onNavigate={navigate} />}
            {operationsReportViews.has(effectiveView) && <OperationsScreen view={effectiveView} notify={notify} onNavigate={navigate} companyContext={companyContext} />}
            {inventoryReportViews.has(effectiveView) && <InventoryReportScreen view={effectiveView} notify={notify} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "profitability" && <ProfitabilityScreen notify={notify} companyContext={companyContext} apiClient={api} onNavigate={navigate} />}
            {effectiveView === "voucher_dashboard" && <BusinessVoucherScreen notify={notify} onNavigate={navigate} role={session.role} requestedVoucherKind={businessVoucherRouteKinds[view]} companyContext={companyContext} />}
            {effectiveView === "manual_voucher" && <VoucherEntryScreen notify={notify} companyContext={companyContext} />}
            {bankStatementViews.has(effectiveView) && <BankStatementScreen view={effectiveView} notify={notify} companyContext={companyContext} />}
            {voucherProposalViews.has(effectiveView) && <VoucherProposalScreen view={effectiveView} notify={notify} role={session.role} companyContext={companyContext} />}
            {["receipt_allocation_workflow", "supplier_allocation_workflow", "advance_adjustment_wizard", "supplier_advance_adjustment_wizard", "party_opening_balances", "credit_terms"].includes(effectiveView) && <AllocationWorkflowScreen view={effectiveView} notify={notify} role={session.role} companyContext={companyContext} />}
            {["chart_accounts", "voucher_register", "ledger_view", "cash_bank_ledger", "day_book", "cash_book", "bank_book", "trial_balance", "profit_loss", "balance_sheet", "posting_control", "party_ledger", "department_ledger", "supplier_ledger", "bill_wise_receivables", "bill_wise_payables", "payment_allocations", "supplier_payment_allocations", "allocation_reconciliation", "unallocated_receipts", "unallocated_supplier_payments", "advance_receipts", "supplier_advances", "advance_adjustments", "allocation_audit", "receivable_ageing", "payable_ageing", "tds_reconciliation", "gst_tds_reconciliation", "party_ledger_summary", "party_reconciliation", "financial_control", "financial_years", "opening_balances", "approval_queue", "gst_register", "tds_register", "bill_outstanding", "year_end_closing", "carry_forward", "audit_log"].includes(effectiveView) && <AccountingScreen view={effectiveView} notify={notify} role={session.role} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "documents" && <DocumentsScreen notify={notify} companyContext={companyContext} apiClient={api} onNavigate={navigate} confirmAction={confirmAction} />}
            {["employee_performance", "receivables", "payables", "cash_flow", "gst", "reports"].includes(effectiveView) && <SummaryScreen view={effectiveView} notify={notify} companyContext={companyContext} onNavigate={navigate} />}
            {effectiveView === "master_data_tools" && <MasterDataToolsScreen notify={notify} apiClient={api} session={session} companyContext={companyContext} />}
            {effectiveView === "master_import_templates" && <MasterImportTemplatesScreen notify={notify} />}
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
          trainingMode={trainingMode}
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
          onTraining={() => { setTrainingMode((current) => !current); navigate("help_training"); }}
          onLogout={() => setSession(null)}
          companies={safeCompanies}
          companyContext={companyContext}
          currentCompanyId={currentCompanyId}
          adminUser={adminUser}
          onCompanyChange={changeCompanyContext}
          onCreateCompany={openCreateCompany}
          onAlterCompany={openAlterCompany}
          onSettings={() => navigate("settings")}
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
      {mobileSidebarOpen && <button className="sidebar-scrim" type="button" aria-label="Close menu" onClick={() => setMobileSidebarOpen(false)} />}
      {confirmDialog && <ConfirmDialog dialog={confirmDialog} onResolve={resolveConfirmation} />}
      {globalSearchOpen && <GlobalSearchOverlay query={globalSearchQuery} setQuery={setGlobalSearchQuery} results={globalSearchResults} onNavigate={(key) => { setGlobalSearchOpen(false); setGlobalSearchQuery(""); navigate(key); }} onClose={() => setGlobalSearchOpen(false)} />}
      {shortcutHelpOpen && <ShortcutHelpDialog onClose={() => setShortcutHelpOpen(false)} />}
      {contextShortcutOpen && <ContextShortcutOverlay view={effectiveView} onClose={() => setContextShortcutOpen(false)} />}
      {userPreferencesOpen && <UserPreferencesDialog onClose={() => setUserPreferencesOpen(false)} compactSidebar={compactSidebar} />}
      {contextHelpOpen && <ContextHelpDialog view={effectiveView} onClose={() => setContextHelpOpen(false)} onOpenTraining={() => { setContextHelpOpen(false); navigate("help_training"); }} />}
      {productivityLearnOpen && <ProductivityLearnDialog view={effectiveView} onClose={() => setProductivityLearnOpen(false)} onOpenTraining={() => { setProductivityLearnOpen(false); navigate("help_training"); }} />}
      {firstTourOpen && <FirstTimeTour onClose={() => setFirstTourOpen(false)} onOpenHelp={() => { setFirstTourOpen(false); navigate("help_training"); }} />}
      {printPreview && <PrintPreviewDialog preview={printPreview} onClose={() => setPrintPreview(null)} notify={notify} desktopApi={api} />}
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
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
  const refs = data?.references || {};
  const accounting = data?.accounting || {};
  const groups = [
    { label: "Reports & Screens", items: flatNavItems.filter((item) => include(`${item.label} ${item.group} ${viewTitles[item.key]?.join(" ") || ""}`)).map((item) => ({ key: item.key, label: item.label, note: item.group })).slice(0, 12) },
    { label: "Orders", items: (refs.orders || []).filter((row) => include(`${row.order_number} ${row.institution_name} ${row.department_name}`)).map((row) => ({ key: "supply_orders", label: row.order_number, note: row.institution_name || row.department_name })).slice(0, 8) },
    { label: "Invoices", items: (refs.invoices || accounting.invoices || []).filter((row) => include(`${row.invoice_number} ${row.order_number} ${row.department_name}`)).map((row) => ({ key: "invoices", label: row.invoice_number, note: row.order_number || "Billing" })).slice(0, 8) },
    { label: "Suppliers", items: (refs.suppliers || []).filter((row) => include(`${row.supplier_name} ${row.gstin} ${row.supplier_code}`)).map((row) => ({ key: "suppliers", label: row.supplier_name, note: row.gstin || "Supplier" })).slice(0, 8) },
    { label: "Departments", items: (refs.departments || []).filter((row) => include(`${row.department_name} ${row.contact_person}`)).map((row) => ({ key: "government_departments", label: row.department_name, note: row.contact_person || "Department" })).slice(0, 8) },
    { label: "Items", items: (refs.items || []).filter((row) => include(`${row.item_name} ${row.hsn_code} ${row.brand}`)).map((row) => ({ key: "items", label: row.item_name, note: row.hsn_code || row.category || "Item" })).slice(0, 8) },
    { label: "Vouchers", items: (accounting.vouchers || []).filter((row) => include(`${row.voucher_number} ${row.voucher_type} ${row.narration}`)).map((row) => ({ key: "voucher_register", label: row.voucher_number, note: row.voucher_type })).slice(0, 8) },
    { label: "Payments", items: (refs.payments || accounting.payments || []).filter((row) => include(`${row.utr_number} ${row.order_number} ${row.payment_amount}`)).map((row) => ({ key: "payments", label: row.utr_number || `Payment ${row.id}`, note: formatCurrency(row.payment_amount || row.amount || 0) })).slice(0, 8) }
  ];
  return groups;
}

async function confirmAction(options = {}) {
  if (typeof window !== "undefined" && typeof window.__giiGemConfirm === "function") {
    return window.__giiGemConfirm(options);
  }
  return { confirmed: window.confirm(options.message || "Do you want to continue?"), reason: "" };
}

function deleteConfirmOptions(moduleName, recordId = null) {
  return {
    mode: "danger",
    title: "Delete Record",
    message: "Are you sure you want to delete this record? This action may affect linked reports.",
    confirmLabel: "Yes, Delete",
    cancelLabel: "No, Cancel",
    moduleName,
    recordId
  };
}

function postedProtectionOptions(moduleName, recordId = null) {
  return {
    mode: "warning",
    title: "Posted Record Protected",
    message: "Posted records cannot be deleted directly. Please use reversal or correction workflow.",
    confirmLabel: "OK",
    hideCancel: true,
    moduleName,
    recordId
  };
}

function postConfirmOptions(moduleName, recordId = null) {
  return {
    mode: "warning",
    title: "Post Transaction",
    message: "Do you want to post this transaction? Once posted, it may be locked from direct editing.",
    confirmLabel: "Yes, Post",
    cancelLabel: "No, Cancel",
    moduleName,
    recordId
  };
}

function approveConfirmOptions(moduleName, recordId = null) {
  return {
    mode: "warning",
    title: "Approve Transaction",
    message: "Do you want to approve this transaction?",
    confirmLabel: "Yes, Approve",
    cancelLabel: "No, Cancel",
    moduleName,
    recordId
  };
}

function reversalConfirmOptions(moduleName, recordId = null) {
  return {
    mode: "danger",
    title: "Reverse Posted Transaction",
    message: "Do you want to reverse this posted transaction?",
    confirmLabel: "Yes, Reverse",
    cancelLabel: "No, Cancel",
    requireReason: true,
    reasonLabel: "Reason for reversal",
    reasonPlaceholder: "Enter correction/reversal reason",
    moduleName,
    recordId
  };
}

function Login({ onLogin, notify, toast }) {
  const [credentials, setCredentials] = useState({ username: "admin", password: "" });
  const [pendingUser, setPendingUser] = useState(null);
  const [passwordChange, setPasswordChange] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const mustChangePassword = Boolean(pendingUser?.forcePasswordChange);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const user = await api.login(credentials);
      if (!user) {
        notify("Invalid username or password", "error");
        return;
      }
      if (user.forcePasswordChange) {
        setPendingUser(user);
        setPasswordChange({ currentPassword: credentials.password, newPassword: "", confirmPassword: "" });
        notify("Please change the default admin password before continuing.", "warning");
        return;
      }
      onLogin(user);
    } catch (error) {
      notify(error.message || "Login failed", "error");
    } finally {
      setLoading(false);
    }
  }

  async function submitPasswordChange(event) {
    event.preventDefault();
    if (passwordChange.newPassword !== passwordChange.confirmPassword) {
      notify("New password and confirmation do not match", "error");
      return;
    }
    setLoading(true);
    try {
      const user = await api.changePassword({
        user_id: pendingUser.id,
        current_password: passwordChange.currentPassword,
        new_password: passwordChange.newPassword
      });
      notify("Password changed. Login session started.", "success");
      onLogin(user);
    } catch (error) {
      notify(error.message || "Password change failed", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={mustChangePassword ? submitPasswordChange : submit}>
        <div className="brand login-brand">
          <div className="brand-mark">G</div>
          <div>
            <strong>GII GeM ERP</strong>
            <span>Government Supply, Procurement & Profitability Management System</span>
          </div>
        </div>
        {!mustChangePassword ? (
          <>
            <label>
              Username
              <input value={credentials.username} onChange={(event) => setCredentials({ ...credentials, username: event.target.value })} required />
            </label>
            <label>
              Password
              <input type="password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} required />
            </label>
            <button className="primary-btn" disabled={loading}>{loading ? "Checking..." : "Login"}</button>
            <p className="hint">First internal login: admin / admin123. The password must be changed before using the ERP.</p>
          </>
        ) : (
          <>
            <div className="empty-state compact">
              <strong>Change Default Password</strong>
              <span>Create a private administrator password before opening company data.</span>
            </div>
            <label>
              Current Password
              <input
                type="password"
                value={passwordChange.currentPassword}
                onChange={(event) => setPasswordChange({ ...passwordChange, currentPassword: event.target.value })}
                required
              />
            </label>
            <label>
              New Password
              <input
                type="password"
                value={passwordChange.newPassword}
                onChange={(event) => setPasswordChange({ ...passwordChange, newPassword: event.target.value })}
                required
              />
            </label>
            <label>
              Confirm New Password
              <input
                type="password"
                value={passwordChange.confirmPassword}
                onChange={(event) => setPasswordChange({ ...passwordChange, confirmPassword: event.target.value })}
                required
              />
            </label>
            <button className="primary-btn" disabled={loading}>{loading ? "Saving..." : "Change Password & Continue"}</button>
            <p className="hint">Use at least 8 characters with uppercase, lowercase and a number.</p>
          </>
        )}
      </form>
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}


function MasterImportTemplatesScreen({ notify }) {
  const [selectedId, setSelectedId] = useState(masterImportTemplateDefinitions[0]?.id || "");
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [fieldMap, setFieldMap] = useState({});
  const [result, setResult] = useState(null);
  const [importMode, setImportMode] = useState("skip_existing");
  const selectedTemplate = useMemo(() => masterImportTemplateDefinitions.find((template) => template.id === selectedId) || masterImportTemplateDefinitions[0], [selectedId]);
  const detectedColumns = useMemo(() => Object.keys(rows[0] || {}), [rows]);
  const mappedRows = useMemo(() => mapTemplateRows(rows, selectedTemplate, fieldMap), [rows, selectedTemplate, fieldMap]);
  const previewColumns = selectedTemplate?.columns?.slice(0, 10) || [];

  useEffect(() => {
    setRows([]);
    setFileName("");
    setFieldMap({});
    setResult(null);
  }, [selectedId]);

  function downloadCsvTemplate(template = selectedTemplate) {
    const csv = [template.columns, template.sample].filter(Boolean).map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
    downloadText(`${template.id}.csv`, csv);
  }

  function downloadXlsxTemplate(template = selectedTemplate) {
    downloadXlsx(`${template.id}.xlsx`, [template.columns, template.sample].filter(Boolean));
  }

  async function chooseUploadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await loadTemplateRows(file.name, await parseUploadFile(file));
    } catch (error) {
      notify(error.message || "Template upload failed", "error");
    } finally {
      event.target.value = "";
    }
  }

  async function chooseDesktopImportFile() {
    try {
      if (!api.selectImportFile) throw new Error("Desktop file picker is available only inside the Windows app");
      const selected = await api.selectImportFile();
      if (!selected?.path) return;
      await loadTemplateRows(selected.name, await api.parseImportFile(selected.path));
    } catch (error) {
      notify(error.message || "Desktop file selection failed", "error");
    }
  }

  async function loadTemplateRows(uploadedFileName, parsedRows) {
    const normalizedRows = parsedRows.map((row) => Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [normalizeImportHeader(key), value])));
    setRows(normalizedRows);
    setFileName(uploadedFileName);
    setFieldMap(createInitialTemplateFieldMap(selectedTemplate, normalizedRows));
    setResult(null);
    notify(`${normalizedRows.length} row(s) loaded for template preview`);
  }

  async function validateRows() {
    if (!rows.length) {
      notify("Upload a filled template before validation", "error");
      return;
    }
    try {
      const validation = selectedTemplate.table
        ? await api.importRecords(selectedTemplate.table, mappedRows, { file_name: fileName, dry_run: true, module: "master_import_templates", import_mode: importMode })
        : validateStagedTemplateRows(selectedTemplate, mappedRows);
      setResult(validation);
      notify(`Validation complete: ${validation.successfulRows || 0} valid row(s)`);
    } catch (error) {
      notify(error.message || "Template validation failed", "error");
    }
  }

  async function confirmImport() {
    if (!selectedTemplate.table) {
      notify("This template is staging/mapping only and cannot write directly to live tables", "warning");
      return;
    }
    if (!rows.length) {
      notify("Upload and validate a filled template before import", "error");
      return;
    }
    try {
      const importResult = await api.importRecords(selectedTemplate.table, mappedRows, {
        file_name: fileName || `${selectedTemplate.id}.csv`,
        module: "master_import_templates",
        import_mode: importMode
      });
      setResult(importResult);
      notify(`Import completed: ${importResult.successfulRows || 0} valid row(s), ${importResult.updatedRows || 0} updated`);
    } catch (error) {
      notify(error.message || "Import failed", "error");
    }
  }

  function downloadCurrentErrorReport() {
    if (!result?.errors?.length) return;
    downloadErrorReport(selectedTemplate.id, result.errors);
  }

  return (
    <section className="template-center-layout">
      <aside className="panel template-list-panel">
        <div className="panel-head">
          <div>
            <h2>Master Import Templates</h2>
            <p>Prepare clean master data before controlled import.</p>
          </div>
        </div>
        <div className="template-list">
          {masterImportTemplateDefinitions.map((template) => (
            <button key={template.id} type="button" className={selectedId === template.id ? "active" : ""} onClick={() => setSelectedId(template.id)}>
              <span>{template.title}</span>
              <small>{template.category}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="panel template-workbench">
        <div className="template-workbench-head">
          <div>
            <span className={`status-pill ${selectedTemplate.table ? "active" : "warning"}`}>{selectedTemplate.table ? "Controlled Master Import" : "Staging / Mapping Only"}</span>
            <h2>{selectedTemplate.title}</h2>
            <p>{selectedTemplate.guidance}</p>
          </div>
          <div className="button-row">
            <button type="button" className="ghost-btn" onClick={() => downloadCsvTemplate()}>Download CSV</button>
            <button type="button" className="ghost-btn" onClick={() => downloadXlsxTemplate()}>Download XLSX</button>
          </div>
        </div>

        <div className="template-meta-grid">
          <div>
            <strong>Required Fields</strong>
            <div className="chip-row">{selectedTemplate.required.map((field) => <span key={field}>{field}</span>)}</div>
          </div>
          <div>
            <strong>Duplicate Detection</strong>
            <div className="chip-row">{selectedTemplate.duplicateKeys.map((field) => <span key={field}>{field}</span>)}</div>
          </div>
          <div>
            <strong>Import Mode</strong>
            <select value={importMode} onChange={(event) => setImportMode(event.target.value)} disabled={!selectedTemplate.table}>
              <option value="skip_existing">Skip existing records</option>
              <option value="update_existing">Update existing records</option>
            </select>
          </div>
        </div>

        <div className="template-flow">
          {["Upload Template", "Preview", "Validate", "Map Fields", "Confirm Import", "Audit Log"].map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>

        <div className="button-row">
          <input type="file" accept=".csv,.xlsx,.xls" onChange={chooseUploadFile} />
          <button type="button" className="ghost-btn" onClick={chooseDesktopImportFile}>Browse Desktop File</button>
          <button type="button" className="ghost-btn" onClick={validateRows} disabled={!rows.length}>Validate Before Import</button>
          <button type="button" className="primary-btn" onClick={confirmImport} disabled={!rows.length || !selectedTemplate.table}>Confirm Import</button>
        </div>

        <div className="template-audit-note">
          <strong>Safety:</strong> Confirmed imports use the existing import validation service and create an import audit log. Staging-only templates do not write to live accounting or master tables.
        </div>

        {fileName && <p className="muted-note">Uploaded file: <strong>{fileName}</strong></p>}

        {result && (
          <div className="import-result template-result">
            <span>Total: <strong>{result.totalRows || 0}</strong></span>
            <span>Valid: <strong>{result.successfulRows || 0}</strong></span>
            <span>Failed: <strong>{result.failedRows || 0}</strong></span>
            <span>Duplicates: <strong>{result.skippedDuplicates || 0}</strong></span>
            <span>Updated: <strong>{result.updatedRows || 0}</strong></span>
          </div>
        )}

        {rows.length ? (
          <>
            <section className="template-section">
              <h3>Field Mapping</h3>
              <p>Map uploaded columns to the standard ERP template before validation.</p>
              <div className="field-map-grid">
                {selectedTemplate.columns.map((column) => (
                  <label key={column} className={selectedTemplate.required.includes(column) ? "required" : ""}>
                    <span>{column}</span>
                    <select value={fieldMap[column] || ""} onChange={(event) => setFieldMap((current) => ({ ...current, [column]: event.target.value }))}>
                      <option value="">Not mapped</option>
                      {detectedColumns.map((detected) => <option key={detected} value={detected}>{detected}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </section>

            <section className="template-section">
              <h3>Preview</h3>
              <div className="table-wrap preview-table">
                <table>
                  <thead>
                    <tr>{previewColumns.map((column) => <th key={column}>{column}</th>)}</tr>
                  </thead>
                  <tbody>
                    {mappedRows.slice(0, 10).map((row, index) => (
                      <tr key={index}>{previewColumns.map((column) => <td key={column}>{row[normalizeImportHeader(column)] || ""}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {result?.errors?.length ? (
              <div className="error-list">
                <strong>Row-wise Validation Errors</strong>
                {result.errors.slice(0, 10).map((item) => <span key={`${item.row}-${item.status}`}>Row {item.row}: {item.errors.join("; ")}</span>)}
                <button type="button" className="ghost-btn" onClick={downloadCurrentErrorReport}>Download Error Report</button>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState title="No template uploaded yet" note="Download CSV/XLSX, fill records, then upload the file for preview and validation." />
        )}
      </section>
    </section>
  );
}


function MasterScreen({ table, config, notify, companyContext }) {
  const blank = useMemo(() => Object.fromEntries(config.fields.map(([name,, type]) => [name, type === "status" ? "active" : ""])), [config]);
  const companyScopedMaster = ["warehouses", "banks"].includes(table);
  const scopedBlank = useMemo(() => companyScopedMaster ? { ...blank, company_id: companyContext?.company_id || "" } : blank, [blank, companyScopedMaster, companyContext?.company_id]);
  const [records, setRecords] = useState([]);
  const [filters, setFilters] = useState({ search: "", status: "all" });
  const [form, setForm] = useState(scopedBlank);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const formDirty = editing ? formChanged(form, Object.fromEntries(config.fields.map(([name]) => [name, editing[name] ?? ""]))) : formChanged(form, scopedBlank);
  useUnsavedChanges(formDirty);

  async function load() {
    setLoading(true);
    try {
      setRecords(await api.listRecords(table, companyScopedMaster ? { ...filters, company_id: companyContext?.company_id } : filters));
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [table, filters.search, filters.status, companyContext?.company_id]);

  useEffect(() => {
    function newRecord() {
      setEditing(null);
      setForm(scopedBlank);
    }
    window.addEventListener("gii-gem-new-record", newRecord);
    window.addEventListener("gii-gem-refresh-screen", load);
    return () => {
      window.removeEventListener("gii-gem-new-record", newRecord);
      window.removeEventListener("gii-gem-refresh-screen", load);
    };
  }, [scopedBlank, table, filters.search, filters.status, companyContext?.company_id]);

  async function submit(event) {
    event.preventDefault();
    try {
      if (companyScopedMaster && !companyContext?.company_id) throw new Error("Select Current Company before saving this company-specific master.");
      validateForm(config, form);
      if (editing) {
        await api.updateRecord(table, editing.id, companyScopedMaster ? { ...form, company_id: form.company_id || companyContext?.company_id } : form);
        notify(`${config.title} updated`);
      } else {
        await api.createRecord(table, companyScopedMaster ? { ...form, company_id: form.company_id || companyContext?.company_id } : form);
        notify(`${config.title} saved`);
      }
      if (table === "companies") window.dispatchEvent(new CustomEvent("gii-gem-companies-updated"));
      setForm(scopedBlank);
      setEditing(null);
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function remove(record) {
    const confirmed = await confirmAction({
      ...deleteConfirmOptions(table, record.id),
      message: `Are you sure you want to delete ${record[config.primary] || "this record"}? Linked master records will be marked inactive instead of hard-deleted.`
    });
    if (!confirmed.confirmed) return;
    try {
      await api.deleteRecord(table, record.id);
      notify("Record deleted or marked inactive");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  function edit(record) {
    setEditing(record);
    setForm(Object.fromEntries(config.fields.map(([name]) => [name, record[name] ?? ""])));
  }

  async function deleteUnusedItems() {
    const confirmed = await confirmAction({
      ...deleteConfirmOptions("items"),
      message: "Delete all unused/imported Item Master records? The protected seed/used item will be kept."
    });
    if (!confirmed.confirmed) return;
    try {
      const result = await api.deleteUnusedImportedItems();
      notify(`Deleted ${result.deleted} Item Master record(s)`);
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <section className="master-layout">
      <AddRecordPanel api={api} table={table} title={config.title} notify={notify} onImported={load} records={records}>
        <form className="entry-form-inner" data-entry-form="true" onSubmit={submit}>
          <div className="panel-head">
            <h2>{editing ? "Edit Record" : "Add Record"}</h2>
            {editing && <button type="button" className="ghost-btn" onClick={() => { setEditing(null); setForm(scopedBlank); }}>Clear</button>}
          </div>
          <div className="form-grid">
            {config.fields.map(([name, label, type]) => (
              <Field
                key={name}
                name={name}
                label={label}
                type={type}
                value={form[name] ?? ""}
                onChange={(value) => setForm({ ...form, [name]: value })}
              />
            ))}
          </div>
          <button className="primary-btn">{editing ? "Update" : "Save"}</button>
        </form>
      </AddRecordPanel>

      <MasterRecordsPanel
        config={config}
        table={table}
        records={records}
        filters={filters}
        onFiltersChange={setFilters}
        loading={loading}
        onBulkDeleteImportedItems={deleteUnusedItems}
        onEditRecord={edit}
        onDeleteRecord={remove}
        onSelectRow={selectTableRow}
        displayPrimaryValue={displayPrimary}
      />
    </section>
  );
}

function BillingVoucherScreen({ notify, role, companyContext, onNavigate }) {
  const blankHeader = {
    company_id: "",
    financial_year_id: "",
    order_id: "",
    department_id: "",
    institution_name: "",
    invoice_number: "",
    invoice_date: new Date().toISOString().slice(0, 10),
    gem_order_number: "",
    gem_contract_number: "",
    consignee: "",
    place_of_supply: "",
    gst_type: "CGST/SGST",
    invoice_type: "Tax Invoice",
    invoice_status: "Draft",
    remarks: ""
  };
  const blankLine = { item_id: "", description: "", hsn: "", quantity: 1, unit: "Nos", billing_rate: 0, gst_rate: 18 };
  const [data, setData] = useState(null);
  const [header, setHeader] = useState(blankHeader);
  const [lines, setLines] = useState([blankLine]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadForm, setUploadForm] = useState({ document_type: "Invoice Copy", remarks: "" });
  const [allowExcessBilling, setAllowExcessBilling] = useState(false);
  const [quickItem, setQuickItem] = useState(null);
  const [quickCreate, setQuickCreate] = useState(null);
  const [duplicateItemPrompt, setDuplicateItemPrompt] = useState(null);
  const [gridExpanded, setGridExpanded] = useState(false);
  const [rowEditor, setRowEditor] = useState(null);

  async function load() {
    setLoading(true);
    try {
      setData(await api.getBillingData(companyContext));
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [companyContext?.company_id, companyContext?.company_scope]);

  useEffect(() => {
    function newRecord() {
      resetForm();
    }
    window.addEventListener("gii-gem-new-record", newRecord);
    window.addEventListener("gii-gem-refresh-screen", load);
    return () => {
      window.removeEventListener("gii-gem-new-record", newRecord);
      window.removeEventListener("gii-gem-refresh-screen", load);
    };
  }, []);

  const refs = data?.references || {};
  const selectedCompany = refs.companies?.find((row) => String(row.id) === String(header.company_id || companyContext?.company_id));
  const selectedCompanyId = header.company_id || companyContext?.company_id || selectedCompany?.id || "";
  const selectedOrder = refs.orders?.find((row) => String(row.id) === String(header.order_id));
  const selectedYear = (data?.financialYears || []).find((row) => String(row.id) === String(header.financial_year_id));
  const selectedDepartmentId = header.department_id || selectedOrder?.department_id || "";
  const selectedDepartment = refs.departments?.find((row) => String(row.id) === String(selectedDepartmentId));
  const institutionOptions = uniqueInstitutionOptions(data?.institutionOptions || [], selectedDepartmentId);
  const orderOptions = (refs.orders || [])
    .filter((row) => !selectedDepartmentId || String(row.department_id) === String(selectedDepartmentId))
    .filter((row) => !header.institution_name || String(row.institution_name || "") === String(header.institution_name))
    .map((row) => [row.id, row.order_number, `${row.department_name || ""} ${row.institution_name || ""}`.trim()]);
  const invoiceNumberSuggestion = suggestedInvoiceNumber(data, selectedCompanyId, header.financial_year_id);
  const selectedInvoice = editing ? data?.invoices?.find((row) => Number(row.id) === Number(editing.id)) : null;
  const invoiceLocked = isRecordLocked(selectedInvoice || editing || {});
  const calculatedLines = lines.map((line) => calculateInvoiceLine(line, header.gst_type));
  const rowEditorCalculated = rowEditor ? calculateInvoiceLine(rowEditor.form, header.gst_type) : null;
  const totals = calculatedLines.reduce((acc, line) => ({
    quantity: acc.quantity + Number(line.quantity || 0),
    taxable: acc.taxable + Number(line.taxable_value || 0),
    cgst: acc.cgst + Number(line.cgst || 0),
    sgst: acc.sgst + Number(line.sgst || 0),
    igst: acc.igst + Number(line.igst || 0),
    gst: acc.gst + Number(line.gst_amount || 0),
    gross: acc.gross + Number(line.gross_value || 0)
  }), { quantity: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, gst: 0, gross: 0 });
  const orderValidation = billingOrderValidation(data, header, calculatedLines, editing?.id);
  const profitability = profitabilityPreviewForOrder(data?.profitability || [], header.order_id, totals.taxable);
  const documents = (data?.documents || []).filter((doc) => {
    if (doc.linked_module === "invoices") return Number(doc.linked_record_id || 0) === Number(editing?.id || 0);
    if (doc.linked_module === "supply_orders") return Number(doc.linked_record_id || 0) === Number(header.order_id || 0);
    if (doc.linked_module === "delivery_challans") return Number(doc.document_order_id || 0) === Number(header.order_id || 0);
    return false;
  });
  const requiredBillingDocuments = ["Supply Order", "Delivery Challan", "Installation Report", "CRAC", "OEM Authorization"];
  const billingDirty = formChanged(header, blankHeader) || formChanged(lines, [blankLine]) || formChanged(uploadForm, { document_type: "Invoice Copy", remarks: "" });
  useUnsavedChanges(billingDirty);

  useEffect(() => {
    if (!data || editing) return;
    setHeader((current) => {
      const companyId = current.company_id || companyContext?.company_id || "";
      const yearId = current.financial_year_id || data.financialYears?.find((row) => row.status === "Open")?.id || data.financialYears?.[0]?.id || "";
      const nextInvoice = current.invoice_number || suggestedInvoiceNumber(data, companyId, yearId);
      return { ...current, company_id: companyId, financial_year_id: yearId, invoice_number: nextInvoice };
    });
  }, [data, editing, companyContext?.company_id]);

  function setOrder(orderId) {
    const order = refs.orders?.find((row) => String(row.id) === String(orderId));
    const nextLines = orderLinesForBilling(data, orderId, editing?.id);
    setHeader((current) => ({
      ...current,
      order_id: orderId,
      company_id: current.company_id || companyContext?.company_id || "",
      department_id: order?.department_id || current.department_id || "",
      institution_name: order?.institution_name || current.institution_name || "",
      consignee: order?.institution_name || current.consignee || "",
      place_of_supply: order?.location || current.place_of_supply || ""
    }));
    if (nextLines.length) setLines(nextLines);
  }

  function setDepartment(departmentId) {
    setHeader((current) => ({
      ...current,
      department_id: departmentId,
      order_id: current.department_id === departmentId ? current.order_id : "",
      institution_name: current.department_id === departmentId ? current.institution_name : ""
    }));
  }

  function setInstitution(institutionName) {
    setHeader((current) => ({
      ...current,
      institution_name: institutionName,
      order_id: current.institution_name === institutionName ? current.order_id : ""
    }));
  }

  function updateLine(index, patch) {
    setLines((current) => current.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      const next = { ...line, ...patch };
      if (patch.item_id) {
        const item = refs.items?.find((row) => String(row.id) === String(patch.item_id));
        const orderItem = (data?.orderItems || []).find((row) => Number(row.order_id) === Number(header.order_id) && Number(row.item_id || 0) === Number(patch.item_id || 0));
        if (item) {
          next.order_item_id = orderItem?.id || next.order_item_id || "";
          next.description = item.item_name || next.description;
          next.hsn = item.hsn_code || "";
          next.unit = item.unit || next.unit;
          next.gst_rate = Number(item.gst_rate || 0);
          next.pending_quantity = pendingQuantityForLine(data, header.order_id, { order_item_id: orderItem?.id, item_id: patch.item_id }, editing?.id);
        }
      }
      return next;
    }));
  }

  function hydrateBillingLine(line, patch) {
    const next = { ...line, ...patch };
    if (patch.item_id) {
      const item = refs.items?.find((row) => String(row.id) === String(patch.item_id));
      const orderItem = (data?.orderItems || []).find((row) => Number(row.order_id) === Number(header.order_id) && Number(row.item_id || 0) === Number(patch.item_id || 0));
      if (item) {
        next.order_item_id = orderItem?.id || next.order_item_id || "";
        next.description = item.item_name || next.description;
        next.hsn = item.hsn_code || "";
        next.unit = item.unit || next.unit;
        next.gst_rate = Number(item.gst_rate || 0);
        next.pending_quantity = pendingQuantityForLine(data, header.order_id, { order_item_id: orderItem?.id, item_id: patch.item_id }, editing?.id);
      }
    }
    return next;
  }

  function openRowEditor(index) {
    setRowEditor({ index, form: { ...lines[index] } });
  }

  function updateRowEditorLine(patch) {
    setRowEditor((current) => current ? { ...current, form: hydrateBillingLine(current.form, patch) } : current);
  }

  function saveRowEditor() {
    if (!rowEditor) return;
    updateLine(rowEditor.index, rowEditor.form);
    setRowEditor(null);
  }

  function resetForm() {
    const companyId = companyContext?.company_id || "";
    const yearId = data?.financialYears?.find((row) => row.status === "Open")?.id || data?.financialYears?.[0]?.id || "";
    setHeader({ ...blankHeader, company_id: companyId, financial_year_id: yearId, invoice_number: suggestedInvoiceNumber(data, companyId, yearId) });
    setLines([blankLine]);
    setEditing(null);
    setUploadForm({ document_type: "Invoice Copy", remarks: "" });
    setAllowExcessBilling(false);
  }

  function editInvoice(invoice) {
    setEditing(invoice);
    setHeader({
      company_id: invoice.company_id || "",
      financial_year_id: invoice.financial_year_id || "",
      order_id: invoice.order_id || "",
      department_id: invoice.department_id || "",
      institution_name: invoice.institution_name || "",
      invoice_number: invoice.invoice_number || "",
      invoice_date: invoice.invoice_date || new Date().toISOString().slice(0, 10),
      gem_order_number: invoice.gem_order_number || "",
      gem_contract_number: invoice.gem_contract_number || "",
      consignee: invoice.consignee || invoice.institution_name || "",
      place_of_supply: invoice.place_of_supply || invoice.location || "",
      gst_type: invoice.gst_type || "CGST/SGST",
      invoice_type: invoice.invoice_type || "Tax Invoice",
      invoice_status: invoice.invoice_status || invoice.approval_status || "Draft",
      remarks: invoice.remarks || ""
    });
    const existingLines = (data?.invoiceItems || []).filter((line) => Number(line.billing_id) === Number(invoice.id));
    setLines(existingLines.length ? existingLines.map((line) => ({
      order_item_id: line.order_item_id || "",
      item_id: line.item_id || "",
      description: line.description || line.item_name || "",
      hsn: line.hsn || line.hsn_code || "",
      quantity: line.quantity || 0,
      unit: line.unit || line.item_unit || "",
      billing_rate: line.billing_rate || 0,
      gst_rate: line.gst_rate || 0
    })) : [{ ...blankLine, billing_rate: invoice.billing_value || 0, gst_rate: invoice.gst_rate || 18 }]);
    scrollToSection("#billing-voucher-form");
  }

  async function submit(event) {
    event.preventDefault();
    try {
      if (!header.order_id) {
        scrollToSection("#billing-voucher-form");
        throw new Error("Order is required");
      }
      if (!companyContext?.company_id) throw new Error("Select Current Company before saving an invoice.");
      if (header.company_id && String(header.company_id) !== String(companyContext.company_id)) throw new Error("Selected company and invoice company do not match.");
      if (!selectedDepartmentId) {
        scrollToSection("#billing-voucher-form");
        throw new Error("Department is required before billing");
      }
      if (!header.invoice_number.trim() && !invoiceNumberSuggestion) {
        scrollToSection("#billing-voucher-form");
        throw new Error("Invoice number is required");
      }
      if (totals.gross <= 0) {
        scrollToSection("#billing-items-section");
        throw new Error("Invoice amount must be positive");
      }
      if (orderValidation.duplicate) {
        scrollToSection("#billing-order-validation");
        throw new Error("Duplicate billing warning: this order already has this invoice number");
      }
      if ((orderValidation.overBilling || orderValidation.excessQuantity || orderValidation.excessLineQuantity) && !allowExcessBilling) {
        scrollToSection("#billing-order-validation");
        throw new Error("Excess billing is blocked. Tick explicit authorization to proceed.");
      }
      const saved = await api.saveBillingVoucher({
        header: { ...header, company_id: companyContext.company_id, invoice_number: header.invoice_number || invoiceNumberSuggestion, id: editing?.id, billing_value: totals.taxable, gst_rate: maxLineGstRate(calculatedLines), posting_status: editing?.posting_status || "Draft", approval_status: header.invoice_status === "Approved" ? "Approved" : "Draft" },
        items: calculatedLines.map((line) => ({ ...line, gst_type: header.gst_type }))
      });
      notify(`Invoice ${saved.invoice_number} saved`);
      resetForm();
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function postInvoice(action) {
    if (!editing) {
      notify("Select an invoice before posting", "error");
      scrollToSection("#billing-invoice-list");
      return;
    }
    try {
      if (action === "reverse") {
        if (!selectedInvoice?.voucher_id) throw new Error("No posted voucher is linked to this invoice");
        const confirmed = await confirmAction(reversalConfirmOptions("invoices", selectedInvoice.id));
        if (!confirmed.confirmed) return;
        await api.reverseVoucher(selectedInvoice.voucher_id, confirmed.reason);
        notify("Invoice voucher reversed");
      } else {
        const confirmed = await confirmAction({
          ...postConfirmOptions("invoices", editing.id),
          message: "Do you want to post this voucher to the books of accounts?",
          cancelLabel: "No, Review Again"
        });
        if (!confirmed.confirmed) return;
        await api.postTransaction("billing", editing.id);
        notify(action === "repost" ? "Repost completed" : "Invoice posted");
      }
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function uploadAttachment(event) {
    event.preventDefault();
    const file = event.currentTarget.elements.billing_document.files?.[0];
    if (!editing) {
      notify("Save or select an invoice before uploading documents", "error");
      return;
    }
    if (!file?.path) {
      notify("Document upload is available in the desktop app", "error");
      return;
    }
    try {
      await api.uploadDocument({
        source_path: file.path,
        linked_module: "invoices",
        linked_record_id: editing.id,
        company_id: header.company_id || selectedCompany?.id,
        document_type: uploadForm.document_type,
        remarks: uploadForm.remarks
      });
      notify("Invoice document attached");
      event.currentTarget.reset();
      setUploadForm({ document_type: "Invoice Copy", remarks: "" });
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  function openQuickItem(lineIndex) {
    if (!roleAllowsAction(role, "new")) {
      confirmAction({
        title: "Permission Required",
        message: "You do not have permission to create new items. Please contact administrator.",
        confirmLabel: "OK",
        hideCancel: true
      });
      return;
    }
    setQuickItem({
      lineIndex,
      form: {
        item_name: "",
        hsn_code: "",
        gst_rate: "",
        unit: "Nos",
        brand: "",
        model: "",
        category: "",
        description: "",
        inventory_enabled: 1,
        track_serial_number: 0,
        minimum_stock_level: "",
        default_warehouse_id: "",
        status: "active"
      }
    });
  }

  function openQuickCreate(type, request = {}) {
    if (!roleAllowsAction(role, "new")) {
      confirmAction({
        title: "Permission Required",
        message: "You do not have permission to create master records. Please contact administrator.",
        confirmLabel: "OK",
        hideCancel: true
      });
      return;
    }
    setQuickCreate({ type, ...request });
  }

  async function handleQuickCreated(type, saved) {
    if (type === "department") setDepartment(saved.id);
    if (type === "institution") {
      setInstitution(saved.institution_name);
      setHeader((current) => ({
        ...current,
        institution_name: saved.institution_name || current.institution_name,
        consignee: saved.consignee || current.consignee,
        place_of_supply: saved.place_of_supply || current.place_of_supply
      }));
    }
    await load();
  }

  function similarItemForQuickCreate(form) {
    const name = String(form.item_name || "").trim().toLowerCase();
    const brand = String(form.brand || "").trim().toLowerCase();
    const model = String(form.model || "").trim().toLowerCase();
    const hsn = String(form.hsn_code || "").trim().toLowerCase();
    return (refs.items || []).find((item) => (
      String(item.item_name || "").trim().toLowerCase() === name
      && String(item.brand || "").trim().toLowerCase() === brand
      && String(item.model || "").trim().toLowerCase() === model
      && String(item.hsn_code || "").trim().toLowerCase() === hsn
    ));
  }

  function useQuickExistingItem(item) {
    if (!quickItem) return;
    updateLine(quickItem.lineIndex, { item_id: item.id });
    setRowEditor((current) => current && current.index === quickItem.lineIndex ? {
      ...current,
      form: hydrateBillingLine(current.form, { item_id: item.id })
    } : current);
    setDuplicateItemPrompt(null);
    setQuickItem(null);
    notify("Existing item selected");
  }

  async function saveQuickItem(createAnyway = false) {
    if (!quickItem) return;
    const form = quickItem.form;
    try {
      ["item_name", "hsn_code", "gst_rate", "unit"].forEach((field) => {
        if (!String(form[field] || "").trim()) throw new Error(`${field.replaceAll("_", " ")} is required`);
      });
      const duplicate = similarItemForQuickCreate(form);
      if (duplicate && !createAnyway) {
        setDuplicateItemPrompt(duplicate);
        return;
      }
      const saved = await api.createRecord("items", {
        item_name: form.item_name,
        brand: form.brand,
        model: form.model,
        hsn_code: form.hsn_code,
        gst_rate: Number(form.gst_rate || 0),
        unit: form.unit,
        category: form.category || "Billing Quick Create",
        inventory_enabled: form.inventory_enabled ? 1 : 0,
        track_serial_number: form.track_serial_number ? 1 : 0,
        minimum_stock_level: Number(form.minimum_stock_level || 0),
        default_warehouse_id: form.default_warehouse_id || null,
        status: "active"
      });
      setLines((current) => current.map((line, index) => index === quickItem.lineIndex ? {
        ...line,
        item_id: saved.id,
        description: form.description || saved.item_name,
        hsn: saved.hsn_code || "",
        unit: saved.unit || "Nos",
        gst_rate: Number(saved.gst_rate || 0)
      } : line));
      setRowEditor((current) => current && current.index === quickItem.lineIndex ? {
        ...current,
        form: {
          ...current.form,
          item_id: saved.id,
          description: form.description || saved.item_name,
          hsn: saved.hsn_code || "",
          unit: saved.unit || "Nos",
          gst_rate: Number(saved.gst_rate || 0)
        }
      } : current);
      setQuickItem(null);
      setDuplicateItemPrompt(null);
      notify(`Item ${saved.item_name} created and selected`);
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <section className={`billing-workspace ${gridExpanded ? "grid-expanded" : ""}`}>
      <form id="billing-voucher-form" className={`panel billing-form ${gridExpanded ? "grid-mode" : ""}`} data-entry-form="true" onSubmit={submit}>
        <div className="panel-head">
          <div>
            <h2>Billing Voucher</h2>
            <p>Government supply invoice header, item tax grid and posting control.</p>
          </div>
          <div className="billing-head-actions">
            <button type="button" className="ghost-btn" onClick={() => setGridExpanded((current) => !current)}>
              {gridExpanded ? "Exit Grid Mode" : "Expand Grid"}
            </button>
            {editing ? <span className={`status ${normalizeStatusClass(lifecycleStage(editing))}`}>{lifecycleStage(editing)}</span> : <span className={`status ${normalizeStatusClass(header.invoice_status)}`}>{header.invoice_status}</span>}
          </div>
        </div>

        {!gridExpanded && (
          <>
            <div className="billing-section-title">Invoice Header</div>
            <div className="billing-header-grid">
              <SearchableSelect label="Company" value={header.company_id || selectedCompany?.id || ""} onChange={(value) => setHeader({ ...header, company_id: value, invoice_number: suggestedInvoiceNumber(data, value, header.financial_year_id) })} options={(refs.companies || []).map((row) => [row.id, row.company_name])} />
              <SearchableSelect label="Financial Year" value={header.financial_year_id} onChange={(value) => setHeader({ ...header, financial_year_id: value, invoice_number: suggestedInvoiceNumber(data, header.company_id || selectedCompany?.id, value) })} options={(data?.financialYears || []).map((row) => [row.id, `${row.financial_year_name} (${row.status})`])} />
              <Field name="invoice_number" label="Invoice Number" type="text" value={header.invoice_number || invoiceNumberSuggestion} onChange={(value) => setHeader({ ...header, invoice_number: value })} />
              <Field name="invoice_date" label="Invoice Date" type="date" value={header.invoice_date} onChange={(value) => setHeader({ ...header, invoice_date: value })} />
              <SearchableSelect label="Order Number" value={header.order_id} onChange={setOrder} options={orderOptions} placeholder="Search order number" />
              <Field name="gem_order_number" label="GeM Order Number" type="text" value={header.gem_order_number} onChange={(value) => setHeader({ ...header, gem_order_number: value })} />
              <Field name="gem_contract_number" label="Contract Number" type="text" value={header.gem_contract_number} onChange={(value) => setHeader({ ...header, gem_contract_number: value })} />
              <SearchableSelect label="Department" value={selectedDepartmentId} onChange={setDepartment} options={(refs.departments || []).map((row) => [row.id, row.department_name])} placeholder="Search department" onQuickCreate={() => openQuickCreate("department")} />
              <SearchableSelect label="Institution" value={header.institution_name} onChange={setInstitution} options={institutionOptions} placeholder="Search institution" onQuickCreate={() => openQuickCreate("institution", { defaults: { place_of_supply: header.place_of_supply, consignee: header.consignee } })} />
              <Field name="consignee" label="Consignee" type="text" value={header.consignee} onChange={(value) => setHeader({ ...header, consignee: value })} />
              <Field name="place_of_supply" label="Place of Supply" type="text" value={header.place_of_supply} onChange={(value) => setHeader({ ...header, place_of_supply: value })} />
              <SelectBox label="GST Type" value={header.gst_type} onChange={(value) => setHeader({ ...header, gst_type: value })} options={[["CGST/SGST", "CGST + SGST"], ["CGST", "CGST only"], ["SGST", "SGST only"], ["IGST", "IGST"]]} />
              <SelectBox label="Invoice Status" value={header.invoice_status} onChange={(value) => setHeader({ ...header, invoice_status: value })} options={["Draft", "Pending Approval", "Approved", "Posted", "Reversed"].map((status) => [status, status])} />
            </div>
          </>
        )}

        <div className="billing-grid-toolbar">
          <div>
            <div className="billing-section-title">Invoice Item Grid</div>
            <small>Double-click a row or focus it and press Enter for the large row editor.</small>
          </div>
          <button type="button" className="ghost-btn" onClick={() => setGridExpanded((current) => !current)}>
            {gridExpanded ? "Exit Grid Mode" : "Expand Grid"}
          </button>
        </div>
        <div id="billing-items-section" className="invoice-grid-wrap">
          <table className="invoice-grid">
            <thead>
              <tr>
                <th>Item</th><th>Description</th><th>HSN</th><th>Pending</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Taxable</th><th>GST %</th><th>Tax Detail</th><th>Gross</th><th></th>
              </tr>
            </thead>
            <tbody>
              {calculatedLines.map((line, index) => (
                <tr key={index} tabIndex={0} onDoubleClick={() => openRowEditor(index)} onKeyDown={(event) => {
                  if (event.key === "Enter" && event.target === event.currentTarget) {
                    event.preventDefault();
                    openRowEditor(index);
                    return;
                  }
                  if (event.key === "F10") {
                    event.preventDefault();
                    openQuickItem(index);
                  }
                }}>
                  <td>
                    <div className="item-select-cell">
                      <SearchableSelect
                        label=""
                        value={line.item_id || ""}
                        onChange={(value) => updateLine(index, { item_id: value })}
                        onKeyDown={(event) => {
                          if (event.key === "F10") {
                            event.preventDefault();
                            event.stopPropagation();
                            openQuickItem(index);
                          }
                        }}
                        options={(refs.items || []).map((item) => [item.id, item.item_name, `${item.hsn_code || ""} ${item.brand || ""} ${item.model || ""}`.trim()])}
                        placeholder="Search item"
                      />
                      <button type="button" className="ghost-btn tiny-btn" onClick={() => openQuickItem(index)}>+ New Item</button>
                    </div>
                  </td>
                  <td><input value={line.description || ""} onChange={(event) => updateLine(index, { description: event.target.value })} /></td>
                  <td><input value={line.hsn || ""} readOnly onChange={(event) => updateLine(index, { hsn: event.target.value })} /></td>
                  <td>{formatNumber(line.pending_quantity ?? pendingQuantityForLine(data, header.order_id, line, editing?.id))}</td>
                  <td><input type="number" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></td>
                  <td><input value={line.unit || ""} onChange={(event) => updateLine(index, { unit: event.target.value })} /></td>
                  <td><input type="number" value={line.billing_rate} onChange={(event) => updateLine(index, { billing_rate: event.target.value })} /></td>
                  <td>{formatCurrency(line.taxable_value)}</td>
                  <td><input type="number" value={line.gst_rate} onChange={(event) => updateLine(index, { gst_rate: event.target.value })} /></td>
                  <td className="tax-detail-cell">
                    <strong>{formatCurrency(line.gst_amount)}</strong>
                    <span>C {formatCurrency(line.cgst)}</span>
                    <span>S {formatCurrency(line.sgst)}</span>
                    <span>I {formatCurrency(line.igst)}</span>
                  </td>
                  <td>{formatCurrency(line.gross_value)}</td>
                  <td><button type="button" className="ghost-btn" onClick={() => setLines((current) => current.length > 1 ? current.filter((_, lineIndex) => lineIndex !== index) : [blankLine])}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="invoice-total-strip">
          <span>Qty <strong>{totals.quantity}</strong></span>
          <span>Taxable <strong>{formatCurrency(totals.taxable)}</strong></span>
          <span>CGST <strong>{formatCurrency(totals.cgst)}</strong></span>
          <span>SGST <strong>{formatCurrency(totals.sgst)}</strong></span>
          <span>IGST <strong>{formatCurrency(totals.igst)}</strong></span>
          <span>Gross <strong>{formatCurrency(totals.gross)}</strong></span>
        </div>
        <div className="billing-actions">
          <label className="checkbox-field billing-excess-check">
            <input type="checkbox" checked={allowExcessBilling} onChange={(event) => setAllowExcessBilling(event.target.checked)} />
            <span>Authorize excess billing for this invoice</span>
          </label>
          <button type="button" className="ghost-btn" onClick={() => setLines((current) => [...current, blankLine])}>Add Line</button>
          <button type="button" className="ghost-btn" onClick={resetForm}>New Invoice</button>
          <button className="primary-btn" disabled={invoiceLocked}>{invoiceLocked ? "Locked" : editing ? "Update Invoice" : "Save Invoice"}</button>
        </div>
      </form>

      {rowEditor && rowEditorCalculated && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="help-dialog billing-row-editor"
            role="dialog"
            aria-modal="true"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setRowEditor(null);
              }
              if (event.ctrlKey && event.key.toLowerCase() === "s") {
                event.preventDefault();
                saveRowEditor();
              }
            }}
          >
            <div className="panel-head">
              <div>
                <h2>Invoice Row Editor</h2>
                <p>Large entry view for the selected billing line.</p>
              </div>
              <button type="button" className="ghost-btn" onClick={() => setRowEditor(null)}>Close</button>
            </div>
            <div className="row-editor-grid">
              <SearchableSelect
                label="Item"
                value={rowEditor.form.item_id || ""}
                onChange={(value) => updateRowEditorLine({ item_id: value })}
                onKeyDown={(event) => {
                  if (event.key === "F10") {
                    event.preventDefault();
                    event.stopPropagation();
                    openQuickItem(rowEditor.index);
                  }
                }}
                options={(refs.items || []).map((item) => [item.id, item.item_name, `${item.hsn_code || ""} ${item.brand || ""} ${item.model || ""}`.trim()])}
                placeholder="Search item"
              />
              <button type="button" className="ghost-btn row-editor-new-item" onClick={() => openQuickItem(rowEditor.index)}>+ New Item</button>
              <Field name="description" label="Description" type="text" value={rowEditor.form.description || ""} onChange={(value) => updateRowEditorLine({ description: value })} />
              {rowEditor.form.item_id
                ? <ReadOnlyBox label="HSN" value={rowEditor.form.hsn || "-"} />
                : <Field name="hsn" label="HSN" type="text" value={rowEditor.form.hsn || ""} onChange={(value) => updateRowEditorLine({ hsn: value })} />}
              <Field name="quantity" label="Qty" type="number" value={rowEditor.form.quantity} onChange={(value) => updateRowEditorLine({ quantity: value })} />
              <Field name="unit" label="Unit" type="text" value={rowEditor.form.unit || ""} onChange={(value) => updateRowEditorLine({ unit: value })} />
              <Field name="billing_rate" label="Rate" type="number" value={rowEditor.form.billing_rate} onChange={(value) => updateRowEditorLine({ billing_rate: value })} />
              <Field name="gst_rate" label="GST %" type="number" value={rowEditor.form.gst_rate} onChange={(value) => updateRowEditorLine({ gst_rate: value })} />
              <ReadOnlyBox label="Taxable" value={formatCurrency(rowEditorCalculated.taxable_value)} />
              <ReadOnlyBox label="CGST" value={formatCurrency(rowEditorCalculated.cgst)} />
              <ReadOnlyBox label="SGST" value={formatCurrency(rowEditorCalculated.sgst)} />
              <ReadOnlyBox label="IGST" value={formatCurrency(rowEditorCalculated.igst)} />
              <ReadOnlyBox label="Gross" value={formatCurrency(rowEditorCalculated.gross_value)} />
            </div>
            <div className="button-row">
              <button type="button" className="ghost-btn" onClick={() => setRowEditor(null)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={saveRowEditor}>Save Row</button>
            </div>
          </section>
        </div>
      )}

      {quickItem && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="help-dialog quick-item-dialog"
            role="dialog"
            aria-modal="true"
            onKeyDown={async (event) => {
              if (event.ctrlKey && event.key.toLowerCase() === "s") {
                event.preventDefault();
                await saveQuickItem(false);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                const hasQuickChanges = formChanged(quickItem.form, {
                  item_name: "",
                  hsn_code: "",
                  gst_rate: "",
                  unit: "Nos",
                  brand: "",
                  model: "",
                  category: "",
                  description: "",
                  inventory_enabled: 1,
                  track_serial_number: 0,
                  minimum_stock_level: "",
                  default_warehouse_id: "",
                  status: "active"
                });
                if (!hasQuickChanges) {
                  setQuickItem(null);
                  return;
                }
                const confirmed = await confirmAction({
                  title: "Unsaved Item",
                  message: "You have unsaved item details. Do you want to exit without saving?",
                  confirmLabel: "Yes, Exit",
                  cancelLabel: "No, Stay",
                  mode: "warning"
                });
                if (confirmed.confirmed) setQuickItem(null);
              }
            }}
          >
            <div className="panel-head">
              <div>
                <h2>Quick Create Item</h2>
                <p>Create a missing billing item without leaving the invoice.</p>
              </div>
              <button type="button" className="ghost-btn" onClick={() => setQuickItem(null)}>Close</button>
            </div>
            <div className="quick-item-grid">
              <Field name="item_name" label="Item Name" type="text" value={quickItem.form.item_name} onChange={(value) => setQuickItem({ ...quickItem, form: { ...quickItem.form, item_name: value } })} />
              <Field name="hsn_code" label="HSN Code" type="text" value={quickItem.form.hsn_code} onChange={(value) => setQuickItem({ ...quickItem, form: { ...quickItem.form, hsn_code: value } })} />
              <Field name="gst_rate" label="GST Rate" type="number" value={quickItem.form.gst_rate} onChange={(value) => setQuickItem({ ...quickItem, form: { ...quickItem.form, gst_rate: value } })} />
              <Field name="unit" label="Unit" type="text" value={quickItem.form.unit} onChange={(value) => setQuickItem({ ...quickItem, form: { ...quickItem.form, unit: value } })} />
              <Field name="brand" label="Brand" type="text" value={quickItem.form.brand} onChange={(value) => setQuickItem({ ...quickItem, form: { ...quickItem.form, brand: value } })} />
              <Field name="model" label="Model" type="text" value={quickItem.form.model} onChange={(value) => setQuickItem({ ...quickItem, form: { ...quickItem.form, model: value } })} />
              <Field name="category" label="Category" type="text" value={quickItem.form.category} onChange={(value) => setQuickItem({ ...quickItem, form: { ...quickItem.form, category: value } })} />
              <Field name="description" label="Description" type="textarea" value={quickItem.form.description} onChange={(value) => setQuickItem({ ...quickItem, form: { ...quickItem.form, description: value } })} />
              <label className="field checkbox-field">
                <input type="checkbox" checked={Boolean(quickItem.form.inventory_enabled)} onChange={(event) => setQuickItem({ ...quickItem, form: { ...quickItem.form, inventory_enabled: event.target.checked ? 1 : 0 } })} />
                <span>Inventory Enabled</span>
              </label>
              <label className="field checkbox-field">
                <input type="checkbox" checked={Boolean(quickItem.form.track_serial_number)} onChange={(event) => setQuickItem({ ...quickItem, form: { ...quickItem.form, track_serial_number: event.target.checked ? 1 : 0 } })} />
                <span>Track Serial Number</span>
              </label>
              <Field name="minimum_stock_level" label="Minimum Stock Level" type="number" value={quickItem.form.minimum_stock_level} onChange={(value) => setQuickItem({ ...quickItem, form: { ...quickItem.form, minimum_stock_level: value } })} />
              <SelectBox label="Default Warehouse" value={quickItem.form.default_warehouse_id} onChange={(value) => setQuickItem({ ...quickItem, form: { ...quickItem.form, default_warehouse_id: value } })} options={(refs.warehouses || []).map((row) => [row.id, row.warehouse_name])} />
            </div>
            {duplicateItemPrompt && (
              <div className="duplicate-item-warning">
                <strong>Similar item already exists.</strong>
                <span>{duplicateItemPrompt.item_name} {duplicateItemPrompt.brand || ""} {duplicateItemPrompt.model || ""} / HSN {duplicateItemPrompt.hsn_code || "-"}</span>
                <div className="button-row">
                  <button type="button" className="primary-btn" onClick={() => useQuickExistingItem(duplicateItemPrompt)}>Use Existing</button>
                  <button type="button" className="ghost-btn" onClick={() => saveQuickItem(true)}>Create Anyway</button>
                  <button type="button" className="ghost-btn" onClick={() => setDuplicateItemPrompt(null)}>Cancel</button>
                </div>
              </div>
            )}
            <div className="button-row">
              <button type="button" className="ghost-btn" onClick={() => setQuickItem(null)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={() => saveQuickItem(false)}>Save Item</button>
            </div>
          </section>
        </div>
      )}
      {quickCreate && (
        <QuickCreateMasterDialog
          request={quickCreate}
          records={quickCreateRecords(quickCreate.type, { references: refs, institutionOptions })}
          context={{ company_id: selectedCompanyId, source_module: "billing" }}
          role={role}
          notify={notify}
          onClose={() => setQuickCreate(null)}
          onCreated={handleQuickCreated}
        />
      )}

      {!gridExpanded && <aside className="billing-side">
        <section id="billing-posting-control" className="panel billing-control-panel">
          <h2>GST Invoice Finalization</h2>
          <div className="workflow-note" style={{ marginBottom: 10 }}>
            <strong>{lifecycleStage(selectedInvoice || editing || {})}</strong>
            <span>{
              selectedInvoice?.posting_status === "Posted" && lifecycleStage(selectedInvoice).includes("Paid") ? "Invoice is posted and fully paid. Ready for closure."
              : selectedInvoice?.posting_status === "Posted" ? "Invoice is posted to books. Ready for receivable tracking."
              : selectedInvoice?.posting_status === "Reversed" ? "Invoice has been reversed. No further actions apply."
              : selectedInvoice?.posting_status === "Error" ? "Posting encountered an error. Review and retry."
              : selectedInvoice?.invoice_status === "Approved" ? "Approved and awaiting posting."
              : selectedInvoice?.invoice_status === "Pending Approval" ? "Pending approval before posting."
              : "Invoice is in draft state. Complete item details and post."
            }</span>
            <small>{
              lifecycleStage(selectedInvoice || editing || {}).includes("Paid") ? "Next: Invoice is fully paid and ready for archival."
              : selectedInvoice?.posting_status === "Posted" ? "Next: Track receivable and receipt allocation."
              : selectedInvoice?.posting_status === "Reversed" ? "Next: Create a corrected invoice if needed."
              : selectedInvoice?.posting_status === "Error" ? "Next: Review error details and repost."
              : selectedInvoice?.invoice_status === "Approved" ? "Next: Post the invoice to create the sales voucher."
              : selectedInvoice?.invoice_status === "Pending Approval" ? "Next: Approve from the approval queue or update status."
              : "Next: Add invoice line items and save before posting."
            }</small>
          </div>
          <ReadOnlyBox label="Voucher Number" value={selectedInvoice?.voucher_number || "-"} />
          <ReadOnlyBox label="Lifecycle Stage" value={lifecycleStage(selectedInvoice || editing || {})} />
          <ReadOnlyBox label="Invoice Status" value={selectedInvoice?.invoice_status || editing?.invoice_status || "Draft"} />
          <ReadOnlyBox label="Posting Status" value={selectedInvoice?.posting_status || editing?.posting_status || "Draft"} />
          <ReadOnlyBox label="Posting Date" value={selectedInvoice?.posted_at || selectedInvoice?.voucher_date || "-"} />
          <ReadOnlyBox label="Posted By" value={selectedInvoice?.posted_by || "-"} />
          <div className="button-row">
            <button type="button" className="primary-btn" onClick={() => postInvoice("post")} disabled={!editing || selectedInvoice?.posting_status === "Posted"}>Post</button>
            <button type="button" className="ghost-btn" onClick={() => postInvoice("repost")} disabled={!editing || selectedInvoice?.posting_status !== "Posted"}>Repost</button>
            <button type="button" className="ghost-btn danger" onClick={() => postInvoice("reverse")} disabled={!editing || !selectedInvoice?.voucher_id}>Reverse</button>
          </div>
        </section>

        <section id="billing-order-validation" className="panel warning-panel">
          <h2>Billing vs Order</h2>
          <MetricLine label="Ordered Quantity" value={orderValidation.orderedQuantity || "-"} />
          <MetricLine label="Procured Quantity" value={formatNumber(orderProcuredQuantity(data, header.order_id)) || "-"} />
          <MetricLine label="Issued Quantity" value={formatNumber(orderIssuedQuantity(data, header.order_id)) || "-"} />
          <MetricLine label="Billed Quantity" value={orderValidation.billedQuantity} />
          <MetricLine label="Balance (Order - Billed)" value={orderValidation.balanceQuantity || "-"} />
          {orderValidation.messages.length ? orderValidation.messages.map((message) => <span className="warning-line" key={message}>{message}</span>) : <span className="ok-line">No duplicate or excess billing warning.</span>}
        </section>

        <section id="billing-readiness" className="panel compact-summary">
          <h2>Billing Readiness</h2>
          {editing || selectedInvoice ? <>
            <span className={`timeline-row ${orderProcuredQuantity(data, header.order_id) > 0 ? "done" : "pending"}`}>
              <span>Items Procured</span>
              <small>{orderProcuredQuantity(data, header.order_id) > 0 ? `${formatNumber(orderProcuredQuantity(data, header.order_id))} units` : "Not procured"}</small>
              {orderProcuredQuantity(data, header.order_id) > 0 ? <span className="timeline-check">&#10003;</span> : <span className="timeline-blocked">&#9888;</span>}
            </span>
            <span className={`timeline-row ${orderIssuedQuantity(data, header.order_id) > 0 ? "done" : "pending"}`}>
              <span>Items Issued (DC)</span>
              <small>{orderIssuedQuantity(data, header.order_id) > 0 ? `${formatNumber(orderIssuedQuantity(data, header.order_id))} units` : "Not issued"}</small>
              {orderIssuedQuantity(data, header.order_id) > 0 ? <span className="timeline-check">&#10003;</span> : <span className="timeline-blocked">&#9888;</span>}
            </span>
            <span className={`timeline-row ${documents.some((doc) => doc.document_type === "CRAC") ? "done" : "pending"}`}>
              <span>CRAC Completed</span>
              <small>{documents.some((doc) => doc.document_type === "CRAC") ? "Attached" : "Pending"}</small>
              {documents.some((doc) => doc.document_type === "CRAC") ? <span className="timeline-check">&#10003;</span> : <span className="timeline-blocked">&#9888;</span>}
            </span>
            <span className={`timeline-row ${documents.some((doc) => doc.document_type === "Supply Order") ? "done" : "pending"}`}>
              <span>Supply Order Attached</span>
              <small>{documents.some((doc) => doc.document_type === "Supply Order") ? "Attached" : "Pending"}</small>
              {documents.some((doc) => doc.document_type === "Supply Order") ? <span className="timeline-check">&#10003;</span> : <span className="timeline-blocked">&#9888;</span>}
            </span>
          </> : <small>Select or edit an invoice to see readiness status.</small>}
        </section>

        <section id="billing-receivable-summary" className="panel compact-summary">
          <h2>Receivable Summary</h2>
          <MetricLine label="Invoice Value" value={formatCurrency(selectedInvoice?.invoice_value || totals.gross)} />
          <MetricLine label="Amount Received" value={formatCurrency(selectedInvoice?.amount_received || 0)} />
          <MetricLine label="Advance Adjusted" value={formatCurrency(selectedInvoice?.advance_adjusted || 0)} />
          <MetricLine label="TDS Deducted" value={formatCurrency(selectedInvoice?.tds_deducted || 0)} />
          <MetricLine label="GST TDS Deducted" value={formatCurrency(selectedInvoice?.gst_tds_deducted || 0)} />
          <MetricLine label="Outstanding" value={formatCurrency(selectedInvoice?.balance_outstanding || totals.gross)} />
          {(editing?.id) ? <div className="document-checklist compact-allocations">
            {(data?.paymentAllocations || []).filter((pa) => Number(pa.billing_id) === Number(editing.id)).length > 0 ?
              (data?.paymentAllocations || []).filter((pa) => Number(pa.billing_id) === Number(editing.id)).map((pa) => (
                <span className={`timeline-row ${Number(pa.allocated_amount) > 0 ? "done" : "pending"}`} key={pa.id}>
                  <span>{pa.utr_number || `Allocation #${pa.id}`}</span>
                  <small>{formatCurrency(pa.allocated_amount)} {pa.tds_deducted > 0 ? `TDS ${formatCurrency(pa.tds_deducted)}` : ""} {pa.gst_tds_deducted > 0 ? `GST TDS ${formatCurrency(pa.gst_tds_deducted)}` : ""}</small>
                </span>
              )) : <small>No payment allocations yet.</small>}
          </div> : null}
        </section>

        <section id="billing-profitability-preview" className="panel compact-summary">
          <h2>Profitability Preview</h2>
          <MetricLine label="Purchase Cost" value={formatCurrency(profitability.purchaseValue)} />
          <MetricLine label="Billing Value" value={formatCurrency(totals.taxable || profitability.billingValue)} />
          <MetricLine label="Gross Margin" value={formatCurrency(profitability.grossMargin)} />
          <MetricLine label="Estimated GST Impact" value={formatCurrency(profitability.gstImpact)} />
          <MetricLine label="Estimated Expenses" value={formatCurrency(profitability.expenses)} />
          <MetricLine label="Expected Profit" value={formatCurrency(profitability.expectedProfit)} />
          <MetricLine label="ROI" value={`${formatNumber(profitability.roi)}%`} />
        </section>

        <section id="billing-gst-summary" className="panel compact-summary">
          <h2>GST Summary</h2>
          <MetricLine label="GST Type" value={header.gst_type || "-"} />
          <MetricLine label="Max GST Rate" value={`${maxLineGstRate(calculatedLines)}%`} />
          <MetricLine label="Total Taxable" value={formatCurrency(totals.taxable)} />
          <MetricLine label="CGST" value={formatCurrency(totals.cgst)} />
          <MetricLine label="SGST" value={formatCurrency(totals.sgst)} />
          <MetricLine label="IGST" value={formatCurrency(totals.igst)} />
          <MetricLine label="Total GST" value={formatCurrency(totals.gst)} />
          <MetricLine label="Gross Invoice Value" value={formatCurrency(totals.gross)} />
        </section>

        <section id="billing-documents" className="panel compact-summary">
          <h2>Documents</h2>
          <div className="document-checklist">
            {requiredBillingDocuments.map((type) => {
              const found = documents.some((doc) => doc.document_type === type);
              return <span className={found ? "done" : ""} key={type}>{type}<small>{found ? "Attached" : "Pending"}</small></span>;
            })}
            <div className="checklist-readiness">
              {requiredBillingDocuments.every((type) => documents.some((doc) => doc.document_type === type))
                ? <span className="ok-line">All required documents attached â€” ready for billing.</span>
                : <span className="warning-line">Complete missing documents before finalizing billing.</span>}
            </div>
          </div>
          <form className="mini-upload" onSubmit={uploadAttachment}>
            <select value={uploadForm.document_type} onChange={(event) => setUploadForm({ ...uploadForm, document_type: event.target.value })}>
              {["Supply Order", "Delivery Challan", "Installation Report", "OEM Authorization", "CRAC", "Invoice Copy"].map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <input name="billing_document" type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.csv" />
            <input placeholder="Remarks" value={uploadForm.remarks} onChange={(event) => setUploadForm({ ...uploadForm, remarks: event.target.value })} />
            <button className="ghost-btn">Attach</button>
          </form>
          {documents.length ? documents.map((doc) => (
            <span className="document-chip" key={doc.id}>
              {doc.document_type}: <button className="ghost-btn small-btn" type="button" onClick={() => api.viewDocument(doc.id).catch((e) => notify(e.message, "error"))}>{doc.original_file_name}</button>
            </span>
          )) : <small>No invoice attachments yet.</small>}
        </section>

        <section id="billing-lifecycle" className="panel compact-summary">
          <h2>Invoice Lifecycle</h2>
          {invoiceTimeline(selectedInvoice).map((item) => (
            <span className={`timeline-row ${item.done ? "done" : "pending"}`} key={item.label}>
              <span>{item.label}</span>
              <small>{item.value}</small>
              {item.done ? <span className="timeline-check">&#10003;</span> : item.blocked ? <span className="timeline-blocked">&#9888;</span> : null}
            </span>
          ))}
        </section>

        <section id="billing-corrections" className="panel compact-summary">
          <h2>Correction Workflow</h2>
          {editing ? <>
            {selectedInvoice?.invoice_type === "Credit Note" ? <span className="timeline-row done"><span>Credit Note</span><small>This invoice is a credit note</small></span> : null}
            {selectedInvoice?.invoice_type === "Debit Note" ? <span className="timeline-row done"><span>Debit Note</span><small>This invoice is a debit note</small></span> : null}
            {selectedInvoice?.posting_status === "Reversed" ? <span className="timeline-row done"><span>Reversed</span><small>This invoice has been reversed</small></span> : null}
            {selectedInvoice?.posting_status !== "Reversed" && selectedInvoice?.invoice_type !== "Credit Note" && selectedInvoice?.invoice_type !== "Debit Note" ? <>
              <span className="timeline-row pending"><span>Credit Note</span><small>Available for posted invoices</small></span>
              <span className="timeline-row pending"><span>Debit Note</span><small>Available for posted invoices</small></span>
            </> : null}
          </> : <small>Select an invoice to see correction options.</small>}
        </section>

        <section id="billing-einvoice" className="panel compact-summary">
          <h2>E-Invoice / E-Way Bill</h2>
          <span className="timeline-row pending">
            <span>E-Invoice</span>
            <small>Not configured</small>
            <span className="timeline-blocked">&#9888;</span>
          </span>
          <span className="timeline-row pending">
            <span>E-Way Bill</span>
            <small>Not configured</small>
            <span className="timeline-blocked">&#9888;</span>
          </span>
          <small style={{ display: "block", marginTop: 8, color: "#888" }}>E-invoice and e-way bill require separate portal integration and are not part of this phase.</small>
        </section>
      </aside>}

      <section id="billing-invoice-list" className="panel billing-list">
        <div className="panel-head">
          <div>
            <h2>Invoices</h2>
            <p>{data?.invoices?.length || 0} invoice(s)</p>
          </div>
        </div>
        {loading ? <EmptyState title="Loading billing records" /> : data?.invoices?.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Invoice</th><th>Order</th><th>Department</th><th>Taxable</th><th>Status</th><th>Voucher</th><th>Drill Down</th><th></th></tr></thead>
              <tbody>
                {data.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td><strong>{invoice.invoice_number}</strong><small>{invoice.invoice_date}</small></td>
                    <td>{invoice.order_number}</td>
                    <td>{invoice.department_name}</td>
                    <td>{formatCurrency(invoice.billing_value)}</td>
                    <td>
                      <span className={`status ${normalizeStatusClass(lifecycleStage(invoice))}`}>{lifecycleStage(invoice)}</span>
                      {lifecycleStage(invoice) !== (invoice.posting_status || invoice.invoice_status) && !lifecycleStage(invoice).includes("Paid") ? <small className="status-sub">{invoice.invoice_status}</small> : null}
                    </td>
                    <td>{invoice.voucher_number || "-"}</td>
                    <td><span className="drill-path"><button type="button" className="ghost-btn small-btn" title="View invoice" onClick={() => editInvoice(invoice)}>Invoice</button> / {invoice.voucher_id ? <button type="button" className="ghost-btn small-btn" title="View voucher" onClick={() => onNavigate?.("voucher_register", { recordId: invoice.voucher_id })}>Voucher</button> : <span>Voucher</span>} / {invoice.voucher_id ? <button type="button" className="ghost-btn small-btn" title="View ledger" onClick={() => onNavigate?.("ledger_view", { recordId: invoice.voucher_id })}>Ledger</button> : <span>Ledger</span>} / Receivable / Allocation / Payment</span></td>
                    <td><button type="button" className="ghost-btn" onClick={() => editInvoice(invoice)}>{isRecordLocked(invoice) ? "View" : "Open"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No invoices found" note="Create the first government supply invoice from the billing voucher form." />}
      </section>
    </section>
  );
}

function TransactionScreen({ table, config, notify, companyContext, onNavigate }) {
  const blank = useMemo(() => Object.fromEntries(config.fields.map(([name,, type]) => [name, defaultValueFor(type)])), [config]);
  const [records, setRecords] = useState([]);
  const [references, setReferences] = useState(null);
  const [inventorySnapshot, setInventorySnapshot] = useState(null);
  const [filters, setFilters] = useState({ search: "", status: "all" });
  const [form, setForm] = useState(blank);
  const [orderItems, setOrderItems] = useState(() => [blankSupplyOrderItem()]);
  const [showSupplyOrderEntry, setShowSupplyOrderEntry] = useState(table === "supply_orders");
  const [validationErrors, setValidationErrors] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const isSupplyOrder = table === "supply_orders";
  const isStockTable = ["stock_inwards", "stock_outwards", "stock_adjustments", "stock_returns"].includes(table);
  const orderItemBaseline = editing ? supplyOrderItemsFromRecord(editing) : [blankSupplyOrderItem()];
  const formDirty = editing
    ? formChanged(form, Object.fromEntries(config.fields.map(([name,, type]) => [name, editing[name] ?? defaultValueFor(type)]))) || (isSupplyOrder && formChanged(orderItems, orderItemBaseline))
    : formChanged(form, blank) || (isSupplyOrder && formChanged(orderItems, [blankSupplyOrderItem()]));
  useUnsavedChanges(formDirty);

  async function load() {
    setLoading(true);
    try {
      const shouldLoadInventorySnapshot = table === "stock_adjustments" && api.getInventoryData;
      const [rows, refs, inventory] = await Promise.all([
        api.listRecords(table, { ...filters, company_id: companyContext?.company_id }),
        api.getReferences(companyContext),
        shouldLoadInventorySnapshot ? api.getInventoryData(companyContext) : Promise.resolve(null)
      ]);
      setRecords(rows);
      setReferences(refs);
      setInventorySnapshot(inventory);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [table, filters.search, companyContext?.company_id]);

  useEffect(() => {
    setShowSupplyOrderEntry(table === "supply_orders");
    setInventorySnapshot(null);
    setValidationErrors([]);
  }, [table]);

  useEffect(() => {
    const prefillId = window.__giiGemPrefillRecordId;
    if (prefillId && records.length && !editing) {
      const record = records.find((r) => String(r.id) === String(prefillId));
      if (record) {
        setEditing(record);
        setForm(record);
        if (table === "supply_orders") {
          setOrderItems(supplyOrderItemsFromRecord(record));
          setShowSupplyOrderEntry(true);
        }
        window.__giiGemPrefillRecordId = null;
      }
    }
  }, [records, editing, table]);

  useEffect(() => {
    if (!isSupplyOrder || !references || editing) return;
    setForm((current) => {
      if (String(current.order_number || "").trim()) return current;
      return { ...current, order_number: nextSupplyOrderNumber(references.orders || records || []) };
    });
  }, [isSupplyOrder, references, editing, records]);

  useEffect(() => {
    function newRecord() {
      setEditing(null);
      setForm(blank);
      setOrderItems([blankSupplyOrderItem()]);
      setValidationErrors([]);
      if (table === "supply_orders") setShowSupplyOrderEntry(true);
    }
    window.addEventListener("gii-gem-new-record", newRecord);
    window.addEventListener("gii-gem-refresh-screen", load);
    return () => {
      window.removeEventListener("gii-gem-new-record", newRecord);
      window.removeEventListener("gii-gem-refresh-screen", load);
    };
  }, [blank, table, filters.search, companyContext?.company_id]);

  async function submit(event) {
    event.preventDefault();
    try {
      setValidationErrors([]);
      const uiErrors = isSupplyOrder ? buildSupplyOrderValidationErrors(config, form, orderItems, references, companyContext) : [];
      if (uiErrors.length) {
        setValidationErrors(uiErrors);
        window.setTimeout(() => focusValidationTarget(uiErrors[0]), 40);
        notify(`${uiErrors.length} validation issue${uiErrors.length === 1 ? "" : "s"} found. Start with ${uiErrors[0].section}: ${uiErrors[0].message}`, "error");
        return;
      }
      if (isSupplyOrder) {
        validateSupplyOrderItems(form, orderItems, references);
      } else {
        if (table === "stock_adjustments") validateStockAdjustmentDraft(form, inventorySnapshot);
        validateTransaction(config, form);
      }
      if (!companyContext?.company_id) throw new Error("Select Current Company before saving this transaction.");
      const payload = {
        ...form,
        company_id: companyContext.company_id,
        ...(isSupplyOrder ? { order_items: normalizedSupplyOrderItems(orderItems, references) } : {})
      };
      if (editing) {
        if (editing.company_id && String(editing.company_id) !== String(companyContext.company_id)) throw new Error("Selected company does not match this record. Switch company before editing.");
        await api.updateRecord(table, editing.id, payload);
        notify(`${config.title} updated`);
      } else {
        await api.createRecord(table, payload);
        notify(`${config.title} saved`);
      }
      setForm(blank);
      setOrderItems([blankSupplyOrderItem()]);
      setEditing(null);
      setValidationErrors([]);
      await load();
      if (isSupplyOrder) setShowSupplyOrderEntry(false);
    } catch (error) {
      const guidance = buildActionErrorGuidance(error, { table, config });
      if (isSupplyOrder && guidance.errors?.length) {
        setValidationErrors(guidance.errors);
        window.setTimeout(() => focusValidationTarget(guidance.errors[0]), 40);
      }
      notify(guidance.toast, "error");
    }
  }

  async function remove(record) {
    if (isRecordLocked(record)) {
      await confirmAction(postedProtectionOptions(table, record.id));
      return;
    }
    const confirmed = await confirmAction(deleteConfirmOptions(table, record.id));
    if (!confirmed.confirmed) return;
    try {
      await api.deleteRecord(table, record.id);
      notify("Record deleted");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  function edit(record) {
    setEditing(record);
    setForm(Object.fromEntries(config.fields.map(([name,, type]) => [name, record[name] ?? defaultValueFor(type)])));
    setOrderItems(isSupplyOrder ? supplyOrderItemsFromRecord(record) : [blankSupplyOrderItem()]);
    setValidationErrors([]);
    if (isSupplyOrder) setShowSupplyOrderEntry(true);
    scrollToSection(isSupplyOrder ? "#supply-order-entry-form" : "#transaction-entry-form");
  }

  async function postStockRecord(record) {
    const confirmed = await confirmAction({
      ...postConfirmOptions(table, record.id),
      message: "Do you want to proceed with this inventory action? Stock balances may be affected.",
      confirmLabel: "Yes, Proceed"
    });
    if (!confirmed.confirmed) return;
    try {
      if (table === "stock_inwards") await api.postStockInward(record.id);
      if (table === "stock_outwards") await api.postStockOutward(record.id);
      if (table === "stock_adjustments") await api.postStockAdjustment(record.id);
      if (table === "stock_returns") await api.postStockReturn(record.id);
      notify(`${config.title} posted`);
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function approveStockAdjustment(record) {
    const confirmed = await confirmAction({
      ...approveConfirmOptions("stock_adjustments", record.id),
      requireReason: true,
      reasonLabel: "Approval remarks",
      reasonPlaceholder: "Approved for stock correction"
    });
    if (!confirmed.confirmed) return;
    try {
      await api.approveStockAdjustment(record.id, null, confirmed.reason || "Approved for stock correction");
      notify("Stock adjustment approved");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  if (isSupplyOrder) {
    return (
      <section className="supply-order-screen">
        <div className="panel supply-order-viewbar">
          <div>
            <h2>{showSupplyOrderEntry ? (editing ? "Edit Supply Order" : "New Supply Order") : "Supply Order List"}</h2>
            <span>{showSupplyOrderEntry ? "Capture order identity, item grid, buyer, delivery and commercial controls." : `${records.length} order record(s)`}</span>
          </div>
          <div className="button-row">
            {showSupplyOrderEntry ? (
              <button type="button" className="ghost-btn" onClick={() => { setEditing(null); setForm(blank); setOrderItems([blankSupplyOrderItem()]); setShowSupplyOrderEntry(false); scrollToSection("#supply-order-list-panel", false); }}>Back to List</button>
            ) : (
              <button type="button" className="primary-btn" onClick={() => { setEditing(null); setForm(blank); setOrderItems([blankSupplyOrderItem()]); setShowSupplyOrderEntry(true); scrollToSection("#supply-order-entry-form"); }}>New Supply Order</button>
            )}
          </div>
        </div>

        {showSupplyOrderEntry ? (
          <AddRecordPanel api={api} table={table} title={config.title} notify={notify} onImported={load} records={records}>
            <SupplyOrderEntryForm
              config={config}
              form={form}
              setForm={setForm}
              orderItems={orderItems}
              setOrderItems={setOrderItems}
              references={references}
              validationErrors={validationErrors}
              onFieldChange={(name, value) => {
                setForm({ ...form, [name]: value });
                setValidationErrors((current) => current.filter((error) => error.name !== name));
              }}
              editing={editing}
              onSubmit={submit}
              onClear={() => { setEditing(null); setForm(blank); setOrderItems([blankSupplyOrderItem()]); setValidationErrors([]); }}
              TransactionField={TransactionField}
              formatCurrency={formatCurrency}
              formatNumber={formatNumber}
              SupplyOrderFieldSection={SupplyOrderFieldSection}
              SupplyOrderSummaryCard={SupplyOrderSummaryCard}
            />
            <PhasePanel title="Order item lifecycle visibility" note="Saved order item rows feed procurement planning, reservation, billing and order lifecycle reports. Incomplete received/draft orders stay usable for follow-up." />
          </AddRecordPanel>
        ) : (
          <SupplyOrderRecordsPanel
            config={config}
            records={records}
            references={references}
            filters={filters}
            setFilters={setFilters}
            loading={loading}
            edit={edit}
            remove={remove}
            isRecordLocked={isRecordLocked}
            transactionPrimary={transactionPrimary}
            transactionAmount={transactionAmount}
          />
        )}
      </section>
    );
  }

  return (
    <section className="transaction-layout">
      <AddRecordPanel api={api} table={table} title={config.title} notify={notify} onImported={load} records={records}>
        <form id="transaction-entry-form" className="entry-form-inner" data-entry-form="true" onSubmit={submit}>
          <div className="panel-head">
            <h2>{editing ? "Edit Entry" : "Add Entry"}</h2>
            {editing && <button type="button" className="ghost-btn" onClick={() => { setEditing(null); setForm(blank); setOrderItems([blankSupplyOrderItem()]); }}>Clear</button>}
          </div>
          <div className="form-grid">
            {config.fields.map(([name, label, type]) => (
              <TransactionField
                key={name}
                name={name}
                label={label}
                type={type}
                value={form[name] ?? ""}
                references={references}
                onChange={(value) => setForm({ ...form, [name]: value })}
              />
            ))}
          </div>
          {table === "supply_orders" && (
            <SupplyOrderItemsGrid
              items={orderItems}
              setItems={setOrderItems}
              references={references}
              orderStatus={form.order_status}
              formatCurrency={formatCurrency}
              formatNumber={formatNumber}
            />
          )}
          {table === "stock_adjustments" && (
            <StockAdjustmentControlPanel
              form={form}
              references={references}
              inventoryData={inventorySnapshot}
              onReasonSelect={(reason) => setForm((current) => ({ ...current, reason }))}
              onOpenStockLedger={() => onNavigate?.("stock_ledger")}
            />
          )}
          <button className="primary-btn">{editing ? "Update" : "Save"}</button>
        </form>
        {table === "supply_orders" && <PhasePanel title="Order item lifecycle visibility" note="Saved order item rows feed procurement planning, reservation, billing and order lifecycle reports. Incomplete received/draft orders stay usable for follow-up." />}
        {table === "procurements" && <PhasePanel title="Procurement item grid visibility" note="Use Operations > Purchase Bills and GRN Status to review item-wise procurement, warehouse receipt and posting status." />}
        {table === "payments" && <PhasePanel title="Receipt allocation controls" note="Use Receipt Allocation for invoice-wise allocation, TDS, GST TDS and before/after outstanding reconciliation." />}
      </AddRecordPanel>

      <section className="panel records-panel">
        <div className="records-toolbar">
          <div>
            <h2>{config.title}</h2>
            <span>{records.length} record(s)</span>
          </div>
          <div className="toolbar-controls">
            <input data-search-input="true" placeholder="Search records" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
          </div>
        </div>
        {loading ? <EmptyState title="Loading records" /> : records.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Primary</th>
                  <th>Order</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Posting</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    {(() => {
                      const locked = isRecordLocked(record);
                      return (
                        <>
                    <td><strong>{transactionPrimary(record, config)}</strong></td>
                    <td>{table === "supply_orders" ? `${record.order_item_count || 0} item(s)` : (orderLabel(record.order_id, references) || "-")}</td>
                    <td>{transactionAmount(record)}</td>
                    <td>{record.order_date || record.purchase_date || record.invoice_date || record.payment_date || "-"}</td>
                    <td><span className={`status ${(record.posting_status || "draft").toLowerCase().replaceAll(" ", "-")}`}>{record.posting_status || "Draft"}</span></td>
                    <td>
                      <div className="row-actions">
                        <button type="button" onClick={() => edit(record)} title={locked ? "Locked record" : "Edit"} disabled={locked}><Icon name="edit" /></button>
                        {table === "stock_adjustments" && <button type="button" onClick={() => approveStockAdjustment(record)} title="Approve adjustment" disabled={record.approval_status === "Approved" || record.posting_status === "Posted"}><Icon name="shield" /></button>}
                        {isStockTable && <button type="button" onClick={() => postStockRecord(record)} title="Post stock" disabled={record.posting_status === "Posted"}><Icon name="receipt" /></button>}
                        <button type="button" onClick={() => remove(record)} title={locked ? "Locked record" : "Delete"} disabled={locked}><Icon name="trash" /></button>
                      </div>
                    </td>
                        </>
                      );
                    })()}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No records found" note="Add the first Phase 2 entry from the form on the left." />}
      </section>
    </section>
  );
}


function TransactionField({ name, label, type, value, references, onChange, error }) {
  const fieldClass = `field ${error ? "field-error" : ""}`;
  const errorNote = error ? <small className="field-error-note">{error}</small> : null;
  const selectField = (options, fallback = "") => (
    <label className={fieldClass} data-field-name={name}>
      {label}
      <select value={value || fallback} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => {
          const valueLabel = Array.isArray(option) ? option : [option, option];
          return <option key={valueLabel[0]} value={valueLabel[0]}>{valueLabel[1]}</option>;
        })}
      </select>
      {errorNote}
    </label>
  );
  if (["department", "employee", "supplier", "bank", "expense_head", "order", "item", "warehouse"].includes(type)) {
    return (
      <label className={fieldClass} data-field-name={name}>
        {label}
        <select value={value || ""} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)} required>
          <option value="">Select</option>
          {referenceOptions(type, references).map(([id, text]) => <option key={id} value={id}>{text}</option>)}
        </select>
        {errorNote}
      </label>
    );
  }
  if (type === "order_status") {
    return selectField(["Draft", "Received", "Procurement Pending", "Procurement Completed", "Supply Pending", "Supplied", "Bill Raised", "Payment Pending", "Partially Received", "Fully Received", "Closed"], "Received");
  }
  if (type === "supply_type") {
    return selectField(["GeM", "eProc", "Manual", "Other"], "GeM");
  }
  if (type === "invoice_type") {
    return selectField(["Tax Invoice", "Revised Invoice", "Credit Note", "Debit Note"], "Tax Invoice");
  }
  if (type === "payment_mode") {
    return selectField(["Cash", "NEFT", "RTGS", "IMPS", "UPI", "Cheque", "Other"], "NEFT");
  }
  if (type === "procurement_status") {
    return selectField(["Draft", "Pending Receipt", "GRN Pending", "Partially Received", "Fully Received", "Posted"], "Draft");
  }
  if (type === "payment_status") {
    return selectField(["Paid", "Unpaid", "Partially Paid"], "Unpaid");
  }
  if (type === "allocation_status") {
    return selectField(["Unallocated", "Partially Allocated", "Allocated", "Advance"], "Unallocated");
  }
  if (type === "adjustment_type") {
    return selectField(["Increase", "Decrease"], "Increase");
  }
  if (type === "return_type") {
    return selectField(["Department", "Supplier"], "Department");
  }
  if (type === "condition_status") {
    return selectField(["Good", "Defective", "Damaged", "Warranty Claim"], "Good");
  }
  if (type === "textarea") {
    return (
      <label className={`${fieldClass} wide`} data-field-name={name}>
        {label}
        <textarea value={value || ""} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)} />
        {errorNote}
      </label>
    );
  }
  return (
    <label className={fieldClass} data-field-name={name}>
      {label}
      <input type={type} value={value || ""} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)} />
      {errorNote}
    </label>
  );
}

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function splitGrossByGst(grossAmount, gstRate) {
  const gross = roundMoney(grossAmount);
  const rate = Number(gstRate || 0);
  if (!rate) return { taxable: gross, gst: 0, gross };
  const taxable = roundMoney(gross / (1 + rate / 100));
  return { taxable, gst: roundMoney(gross - taxable), gross };
}

function displayPrimary(record, primary) {
  if (primary === "supplier_name") {
    return record.supplier_name || record.supplier_account_name || record.beneficiary_account_name || record.account_name || "Unnamed Supplier";
  }
  return record[primary] || "-";
}


function calculateInvoiceLine(line, gstType = "CGST/SGST") {
  const quantity = Number(line.quantity || 0);
  const billingRate = Number(line.billing_rate || 0);
  const taxableValue = quantity * billingRate;
  const gstRate = Number(line.gst_rate || 0);
  const gstAmount = taxableValue * gstRate / 100;
  const isIgst = gstType === "IGST";
  const isCgstOnly = gstType === "CGST";
  const isSgstOnly = gstType === "SGST";
  return {
    ...line,
    quantity,
    billing_rate: billingRate,
    gst_rate: gstRate,
    taxable_value: taxableValue,
    cgst: isIgst || isSgstOnly ? 0 : isCgstOnly ? gstAmount : gstAmount / 2,
    sgst: isIgst || isCgstOnly ? 0 : isSgstOnly ? gstAmount : gstAmount / 2,
    igst: isIgst ? gstAmount : 0,
    gst_amount: gstAmount,
    gross_value: taxableValue + gstAmount
  };
}

function uniqueInstitutionOptions(rows, departmentId) {
  const seen = new Set();
  return rows
    .filter((row) => !departmentId || String(row.department_id) === String(departmentId))
    .filter((row) => String(row.institution_name || "").trim())
    .filter((row) => {
      const key = String(row.institution_name || "").trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((row) => [row.institution_name, row.institution_name]);
}

function suggestedInvoiceNumber(data, companyId, financialYearId) {
  return (data?.invoiceSequence || []).find((row) => String(row.company_id) === String(companyId) && String(row.financial_year_id) === String(financialYearId))?.invoice_number || "";
}

function orderLinesForBilling(data, orderId, editingId) {
  return (data?.orderItems || [])
    .filter((row) => String(row.order_id) === String(orderId))
    .map((row) => {
      const pending = pendingQuantityForLine(data, orderId, { order_item_id: row.id, item_id: row.item_id }, editingId);
      const quantity = Math.max(0, pending || Number(row.quantity || 0));
      const rate = Number(row.quoted_rate || 0) || (Number(row.taxable_value || 0) && Number(row.quantity || 0) ? Number(row.taxable_value || 0) / Number(row.quantity || 1) : 0);
      return {
        order_item_id: row.id,
        item_id: row.item_id || "",
        description: row.item_description || row.item_name || "",
        hsn: row.hsn_code || "",
        quantity,
        pending_quantity: pending,
        unit: row.unit || "Nos",
        billing_rate: rate,
        gst_rate: Number(row.gst_rate || 0)
      };
    });
}

function pendingQuantityForLine(data, orderId, line, editingId) {
  const orderItems = (data?.orderItems || []).filter((row) => Number(row.order_id) === Number(orderId));
  const matchedOrderItem = line.order_item_id
    ? orderItems.find((row) => Number(row.id) === Number(line.order_item_id))
    : orderItems.find((row) => Number(row.item_id || 0) === Number(line.item_id || 0));
  if (!matchedOrderItem) return 0;
  const billed = (data?.invoiceItems || [])
    .filter((row) => Number(row.order_id) === Number(orderId) && Number(row.billing_id) !== Number(editingId || 0))
    .filter((row) => {
      if (line.order_item_id) return Number(row.order_item_id || 0) === Number(line.order_item_id);
      return Number(row.item_id || 0) === Number(line.item_id || 0);
    })
    .reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  return Number(matchedOrderItem.quantity || 0) - billed;
}

function maxLineGstRate(lines) {
  return lines.reduce((max, line) => Math.max(max, Number(line.gst_rate || 0)), 0);
}

function orderProcuredQuantity(data, orderId) {
  return (data?.procuredQuantities || [])
    .filter((row) => Number(row.order_id) === Number(orderId))
    .reduce((sum, row) => sum + Number(row.procured_quantity || 0), 0);
}

function orderIssuedQuantity(data, orderId) {
  return (data?.issuedQuantities || [])
    .filter((row) => Number(row.order_id) === Number(orderId))
    .reduce((sum, row) => sum + Number(row.issued_quantity || 0), 0);
}

function billingOrderValidation(data, header, lines, editingId) {
  const orderId = Number(header.order_id || 0);
  const orderItems = (data?.orderItems || []).filter((row) => Number(row.order_id) === orderId);
  const orderedQuantity = orderItems.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const otherBilledQuantity = (data?.invoiceItems || [])
    .filter((row) => Number(row.order_id) === orderId && Number(row.billing_id) !== Number(editingId || 0))
    .reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const currentQuantity = lines.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const billedQuantity = otherBilledQuantity + currentQuantity;
  const balanceQuantity = orderedQuantity ? orderedQuantity - billedQuantity : 0;
  const duplicate = (data?.invoices || []).some((row) => Number(row.id) !== Number(editingId || 0) && Number(row.order_id) === orderId && String(row.invoice_number || "").trim().toLowerCase() === String(header.invoice_number || "").trim().toLowerCase());
  const messages = [];
  if (duplicate) messages.push("Duplicate Billing: same invoice number already exists for this order.");
  if (orderedQuantity && balanceQuantity < 0) messages.push("Excess Quantity: billed quantity is above ordered quantity.");
  const excessLines = lines.filter((line) => {
    const pending = pendingQuantityForLine(data, orderId, line, editingId);
    return pending > 0 && Number(line.quantity || 0) > pending;
  });
  if (excessLines.length) messages.push("Excess Quantity: one or more item lines exceed pending order quantity.");
  const existingBilling = (data?.invoices || [])
    .filter((row) => Number(row.order_id) === orderId && Number(row.id) !== Number(editingId || 0))
    .reduce((sum, row) => sum + Number(row.billing_value || 0), 0);
  const currentBilling = lines.reduce((sum, row) => sum + Number(row.taxable_value || 0), 0);
  const order = (data?.references?.orders || []).find((row) => Number(row.id) === orderId);
  const orderValue = Number(order?.order_taxable_value || order?.order_value || 0);
  const overBilling = orderValue > 0 && existingBilling + currentBilling > orderValue;
  if (overBilling) messages.push("Over Billing: invoice value exceeds the recorded order value.");
  return { orderedQuantity, billedQuantity, balanceQuantity, duplicate, overBilling, excessQuantity: orderedQuantity && balanceQuantity < 0, excessLineQuantity: excessLines.length > 0, messages };
}

function profitabilityPreviewForOrder(rows, orderId, currentBilling) {
  const row = rows.find((item) => Number(item.id) === Number(orderId)) || {};
  const billingValue = Number(currentBilling || row.billingValue || 0);
  const purchaseValue = Number(row.purchaseValue || 0);
  const grossMargin = billingValue - purchaseValue;
  const gstImpact = grossMargin * (Number(row.gstRate || 0) / 100);
  const expenses = Number(row.totalExpenses || 0);
  return {
    purchaseValue,
    billingValue,
    grossMargin,
    gstImpact,
    expenses,
    expectedProfit: grossMargin - gstImpact - expenses,
    roi: purchaseValue ? ((grossMargin - gstImpact - expenses) / purchaseValue) * 100 : 0
  };
}

function invoiceTimeline(invoice) {
  const isPosted = invoice?.posting_status === "Posted";
  const amountReceived = Number(invoice?.amount_received || 0);
  const balanceOutstanding = Number(invoice?.balance_outstanding || 0);
  const isPaid = isPosted && amountReceived > 0 && balanceOutstanding <= 0;
  const isClosed = isPaid;
  return [
    { label: "Created", value: invoice?.created_at || "-", done: Boolean(invoice?.id) },
    { label: "Approved", value: invoice?.approval_status === "Approved" ? "Approved" : invoice?.approval_status || "-", done: invoice?.approval_status === "Approved" || isPosted },
    { label: "Posted", value: isPosted ? (invoice?.voucher_date || invoice?.posted_at || "Posted") : "-", done: isPosted },
    { label: "Paid", value: isPaid ? formatCurrency(amountReceived) : isPosted ? `${formatCurrency(amountReceived)} / ${formatCurrency(invoice?.invoice_value || 0)}` : "-", done: isPaid },
    { label: "Closed", value: isClosed ? "Closed" : invoice?.id ? "Open" : "-", done: isClosed }
  ];
}

function lifecycleStage(invoice) {
  if (!invoice?.id) return "New";
  if (invoice?.posting_status === "Reversed") return "Reversed";
  if (Number(invoice?.balance_outstanding || 0) <= 0 && Number(invoice?.amount_received || 0) > 0 && invoice?.posting_status === "Posted") return "Paid / Closed";
  if (invoice?.posting_status === "Posted") return "Posted";
  if (invoice?.approval_status === "Approved") return "Approved";
  if (invoice?.invoice_status === "Pending Approval") return "Pending Approval";
  return "Draft";
}

function normalizeStatusClass(status) {
  return String(status || "draft").toLowerCase().replaceAll(" ", "-").replaceAll("/", "-");
}

function isRecordLocked(record = {}) {
  return ["Posted", "Reversed", "Locked"].includes(record.posting_status) || ["Posted", "Reversed"].includes(record.status) || Number(record.order_locked) === 1;
}

function referenceOptions(type, refs) {
  if (!refs) return [];
  const map = {
    department: (refs.departments || []).map((row) => [row.id, row.department_name]),
    employee: (refs.employees || []).map((row) => [row.id, row.employee_name]),
    supplier: (refs.suppliers || []).map((row) => [row.id, row.supplier_name]),
    bank: (refs.banks || []).map((row) => [row.id, row.bank_account_name]),
    expense_head: (refs.expenseHeads || []).map((row) => [row.id, row.expense_head_name]),
    order: (refs.orders || []).map((row) => [row.id, `${row.order_number} - ${row.institution_name || row.department_name || "Order"}`]),
    item: (refs.items || []).map((row) => [row.id, row.item_name]),
    warehouse: (refs.warehouses || []).map((row) => [row.id, row.warehouse_name])
  };
  return map[type] || [];
}

function orderLabel(id, refs) {
  const order = refs?.orders?.find((row) => String(row.id) === String(id));
  return order ? order.order_number : "";
}

function transactionPrimary(record, config) {
  if (config.primary === "remarks") return record.remarks || `Entry #${record.id}`;
  return record[config.primary] || record.order_number || `Entry #${record.id}`;
}

function transactionAmount(record) {
  const value = record.computed_order_gross_value ?? record.order_gross_value ?? record.billing_value ?? record.payment_amount ?? record.purchase_value ?? record.expense_amount ?? record.fixed_amount ?? "";
  return value === "" ? "-" : formatCurrency(Number(value || 0));
}


function defaultValueFor(type) {
  if (type === "date") return new Date().toISOString().slice(0, 10);
  if (type === "number") return 0;
  if (type === "supply_type") return "GeM";
  if (type === "calculation") return "percentage_gross";
  if (type === "order_status") return "Received";
  if (type === "invoice_type") return "Tax Invoice";
  if (type === "payment_mode") return "NEFT";
  if (type === "procurement_status") return "Draft";
  if (type === "payment_status") return "Unpaid";
  if (type === "allocation_status") return "Unallocated";
  if (type === "adjustment_type") return "Increase";
  if (type === "return_type") return "Department";
  if (type === "condition_status") return "Good";
  if (type === "checkbox") return 0;
  return "";
}

function useUnsavedChanges(isDirty) {
  useEffect(() => {
    window.__giiGemHasUnsavedChanges = Boolean(isDirty);
    window.dispatchEvent(new CustomEvent("gii-gem-dirty-state"));
    return () => {
      window.__giiGemHasUnsavedChanges = false;
      window.dispatchEvent(new CustomEvent("gii-gem-dirty-state"));
    };
  }, [isDirty]);
}

function formChanged(current, baseline) {
  return JSON.stringify(normalizeFormValue(current)) !== JSON.stringify(normalizeFormValue(baseline));
}

function normalizeFormValue(value) {
  if (Array.isArray(value)) return value.map(normalizeFormValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).filter((key) => key !== "_key").sort().map((key) => [key, normalizeFormValue(value[key])]));
  }
  if (value === null || value === undefined) return "";
  return String(value);
}

function validateTransaction(config, form) {
  const required = config.fields.filter(([, , type]) => !["textarea"].includes(type)).slice(0, 4);
  required.forEach(([name, label]) => {
    if (!String(form[name] ?? "").trim()) throw new Error(`${label} is required`);
  });
  Object.entries(form).forEach(([key, value]) => {
    if ((key.includes("value") || key.includes("amount") || key.includes("gst") || key.includes("freight") || key.includes("charges") || key.includes("percentage")) && Number(value || 0) < 0) {
      throw new Error("Amount and percentage fields cannot be negative");
    }
  });
}

function SummaryScreen({ view, notify, companyContext, onNavigate }) {
  const [rows, setRows] = useState([]);
  const [accounting, setAccounting] = useState(null);

  useEffect(() => {
    Promise.all([api.getProfitability(companyContext), api.getAccountingData(companyContext)])
      .then(([profitRows, accountingRows]) => {
        setRows(profitRows);
        setAccounting(accountingRows);
      })
      .catch((error) => notify(error.message, "error"));
  }, [view, companyContext?.company_id, companyContext?.company_scope]);

  if (view === "employee_performance") {
    return <EmployeePerformanceSummary rows={rows} />;
  }

  if (view === "receivables") {
    return (
      <section className="page">
        <AddRecordPanel api={api} table="receivables" title="Receivables" notify={notify} records={accounting?.receivables || []}>
          <PhasePanel title="Receivables are generated from billing and payment allocation" note="Use Billing and Payments for accounting postings. Upload supporting documents here." />
        </AddRecordPanel>
        <SummaryTable title="Receivable Ledger" rows={(accounting?.receivables || []).map((row) => ({ name: row.invoice_number, invoice: row.invoice_amount, received: row.amount_received, tds: row.tds_deducted + row.gst_tds_deducted, outstanding: row.balance_outstanding, days: row.days_outstanding }))} columns={["invoice", "received", "tds", "outstanding", "days"]} />
        <div className="workflow-note" style={{ marginTop: 8 }}><button className="ghost-btn" type="button" onClick={() => onNavigate && onNavigate("bill_wise_receivables")}>View Full Receivables Report</button></div>
      </section>
    );
  }

  if (view === "payables") {
    return (
      <section className="page">
        <AddRecordPanel api={api} table="payables" title="Payables" notify={notify} records={accounting?.payables || []}>
          <PhasePanel title="Payables are generated from procurement and supplier payments" note="Use Procurement and supplier payment workflows for accounting postings. Upload supporting documents here." />
        </AddRecordPanel>
        <SummaryTable title="Supplier Payable Ledger" rows={(accounting?.payables || []).map((row) => ({ name: `${row.supplier_name} / ${row.purchase_invoice_number}`, purchase: row.purchase_value, paid: row.amount_paid, due: row.balance_due }))} columns={["purchase", "paid", "due"]} />
        <div className="workflow-note" style={{ marginTop: 8 }}><button className="ghost-btn" type="button" onClick={() => onNavigate && onNavigate("bill_wise_payables")}>View Full Payables Report</button></div>
      </section>
    );
  }

  if (view === "cash_flow") {
    return <CashFlowSummary accounting={accounting} onNavigate={onNavigate} />;
  }

  if (view === "gst") {
    return <GstSummary accounting={accounting} onNavigate={onNavigate} />;
  }

  return <AccountingReportsIndex accounting={accounting} onNavigate={onNavigate} />;
}

function OperationsScreen({ view, notify, onNavigate, companyContext }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [drilldown, setDrilldown] = useState(null);
  const [queueFilter, setQueueFilter] = useState("all");

  async function load() {
    setLoading(true);
    try {
      const [billing, inventory, accounting] = await Promise.all([
        api.getBillingData(companyContext),
        api.getInventoryData(companyContext),
        api.getAccountingData(companyContext)
      ]);
      setData(buildOperationsData(billing || {}, inventory || {}, accounting || {}));
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [view, companyContext?.company_id, companyContext?.company_scope]);

  if (loading || !data) return <section className="panel settings-panel report-panel"><EmptyState title="Loading operations data" note="Gathering order, procurement, billing, inventory and posting status." /></section>;

  if (view === "operations_dashboard") {
    const allAttentionRows = buildOperationsAttentionRows(data);
    const attentionRows = filterOperationsAttentionRows(allAttentionRows, queueFilter);
    const insightCards = buildOperationsDashboardInsights(allAttentionRows);
    const activeFilter = insightCards.find((card) => card.key === queueFilter);
    return (
      <section className="page operations-command-center">
        <div className="metric-grid profit-grid">
          <Metric label="Orders Received" value={data.orders.length} note="All active orders" icon="clipboard" onClick={() => onNavigate("supply_orders")} />
          <Metric label="Pending Procurement" value={data.pendingProcurement.length} note="Shortage or procurement pending" icon="cart" onClick={() => onNavigate("procurements")} />
          <Metric label="Pending Supply" value={data.pendingSupply.length} note="Not fully issued/supplied" icon="truck" onClick={() => onNavigate("order_lifecycle")} />
          <Metric label="Pending Billing" value={data.pendingBilling.length} note="Billed quantity/value pending" icon="file" onClick={() => onNavigate("invoices")} />
          <Metric label="Pending Collection" value={data.pendingPayment.length} note="Outstanding receivables" icon="wallet" onClick={() => onNavigate("payments")} />
          <Metric label="Pending GRNs" value={data.grnPending.length} note="Receipt completion pending" icon="box" onClick={() => onNavigate("grn_status")} />
          <Metric label="Missing Documents" value={data.missingDocuments.length} note="Checklist gaps" icon="file" onClick={() => onNavigate("missing_documents")} />
          <Metric label="Profitability Issues" value={data.profitabilityExceptions.length} note="Loss or missing basis" icon="trend" onClick={() => onNavigate("order_profitability_exceptions")} />
          <Metric label="Posting Errors" value={data.postingErrors.length} note="Operational posting issues" icon="shield" onClick={() => onNavigate("posting_control")} />
        </div>
        <div className="operations-insight-grid">
          {insightCards.map((card) => (
            <button
              key={card.key}
              type="button"
              className={`operations-insight-card ${queueFilter === card.key ? "active" : ""}`}
              onClick={() => setQueueFilter(queueFilter === card.key ? "all" : card.key)}
            >
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </button>
          ))}
        </div>
        {queueFilter !== "all" && (
          <div className="operations-filter-bar">
            <span>Filtered by: <strong>{activeFilter?.label || queueFilter}</strong></span>
            <button type="button" className="ghost-btn subtle" onClick={() => setQueueFilter("all")}>Clear Filter</button>
          </div>
        )}
        <OperationsAttentionQueueTable
          title={queueFilter === "all" ? "Operations Attention Queue" : `Operations Attention Queue - ${activeFilter?.label || "Filtered"}`}
          rows={attentionRows}
          columns={[
            ["attention", "Attention"],
            ["order_number_display", "Order Number"],
            ["department_name_display", "Department"],
            ["invoice_number_display", "Invoice Number"],
            ["amount_display", "Amount"],
            ["status_display", "Status"],
            ["attention_reason", "Attention Reason"],
            ["recommended_action", "Next Recommended Action"]
          ]}
          onNavigate={onNavigate}
          onDrilldown={(row) => { setDrilldown(buildOperationsDrilldown(row, data)); scrollToSection(".operations-drilldown-panel"); }}
          onExport={() => exportRows(queueFilter === "all" ? "Operations Attention Queue" : `Operations Attention Queue - ${activeFilter?.label || "Filtered"}`, attentionRows)}
          onPrint={requestPrintPreview}
        />
        {drilldown && <OperationsDrilldownPanel drilldown={drilldown} onClose={() => { setDrilldown(null); scrollToSection(".operations-command-center", false); }} onNavigate={onNavigate} notify={notify} />}
      </section>
    );
  }

  const reportMap = {
    order_items: ["Order Item Grid", data.orderItems, [
      ["order_number", "Order"],
      ["item_name", "Item"],
      ["item_description", "Description"],
      ["hsn_code", "HSN"],
      ["quantity_text", "Qty"],
      ["taxable_text", "Taxable"],
      ["gst_text", "GST"],
      ["gross_text", "Gross"],
      ["required_delivery_date", "Required Delivery"],
      ["billed_text", "Billed"]
    ]],
    order_lifecycle: ["Order Lifecycle Summary", data.lifecycle, [
      ["order_number", "Order"],
      ["department_name", "Department"],
      ["ordered_qty", "Ordered"],
      ["reserved_qty", "Reserved"],
      ["procured_qty", "Procured"],
      ["received_qty", "Received"],
      ["issued_qty", "Issued"],
      ["billed_qty", "Billed"],
      ["collected_text", "Collected"]
    ]],
    purchase_bills: ["Purchase Bills", data.purchaseBills, [
      ["purchase_invoice_number", "Purchase Bill"],
      ["order_number", "Order"],
      ["supplier_name", "Supplier"],
      ["purchase_date", "Date"],
      ["purchase_text", "Purchase"],
      ["procurement_status", "Procurement"],
      ["posting_status", "Posting"]
    ]],
    grn_status: ["GRN Status", data.grnRows, [
      ["purchase_bill", "Purchase Bill"],
      ["supplier_name", "Supplier"],
      ["item_name", "Item"],
      ["ordered_qty", "Ordered"],
      ["received_qty", "Received"],
      ["damaged_qty", "Damaged"],
      ["accepted_qty", "Accepted"],
      ["warehouse_name", "Warehouse"],
      ["status", "GRN Status"]
    ]],
    expense_posting_status: ["Expense Posting Status", data.expensePosting, [
      ["reference", "Expense"],
      ["order_number", "Order"],
      ["record_date", "Date"],
      ["amount_text", "Amount"],
      ["posting_status", "Posting"],
      ["voucher_number", "Voucher"],
      ["posting_error", "Posting Error"]
    ]],
    billing_pending: ["Billing Pending", data.pendingBilling, [
      ["order_number", "Order"],
      ["department_name", "Department"],
      ["ordered_qty", "Ordered"],
      ["billed_qty", "Billed"],
      ["balance_qty", "Balance"],
      ["status_text", "Status"]
    ]],
    order_documents: ["Order Documents", data.documentChecklist.filter((row) => ["Supply Order", "Work Order", "OEM Authorization"].includes(row.document_type)), documentChecklistColumns()],
    invoice_documents: ["Invoice Documents", data.documentChecklist.filter((row) => ["Delivery Challan", "Installation Report", "CRAC", "Invoice Copy"].includes(row.document_type)), documentChecklistColumns()],
    payment_documents: ["Payment Documents", data.documentChecklist.filter((row) => row.document_type === "Payment Proof"), documentChecklistColumns()],
    missing_documents: ["Missing Documents", data.missingDocuments, documentChecklistColumns()],
    pending_procurement: ["Pending Procurement Report", data.pendingProcurement, [
      ["order_number", "Order"],
      ["item_name", "Item"],
      ["ordered_qty", "Ordered"],
      ["procured_qty", "Procured"],
      ["balance_qty", "Required"],
      ["status_text", "Status"]
    ]],
    pending_billing: ["Pending Billing Report", data.pendingBilling, [
      ["order_number", "Order"],
      ["department_name", "Department"],
      ["ordered_qty", "Ordered"],
      ["issued_qty", "Issued"],
      ["billed_qty", "Billed"],
      ["balance_qty", "Balance"]
    ]],
    pending_payment: ["Pending Payment Report", data.pendingPayment, [
      ["invoice_number", "Invoice"],
      ["order_number", "Order"],
      ["department_name", "Department"],
      ["invoice_text", "Invoice Value"],
      ["received_text", "Received"],
      ["outstanding_text", "Outstanding"],
      ["status", "Status"]
    ]],
    order_posting_status_report: ["Order Posting Status Report", data.postingStatus, [
      ["module", "Module"],
      ["reference", "Reference"],
      ["record_date", "Date"],
      ["amount_text", "Amount"],
      ["posting_status", "Posting"],
      ["voucher_number", "Voucher"],
      ["posting_error", "Error"]
    ]],
    stock_issue_vs_billing: ["Stock Issue vs Billing Reconciliation", data.stockIssueVsBilling, [
      ["order_number", "Order"],
      ["item_name", "Item"],
      ["issued_qty", "Issued"],
      ["billed_qty", "Billed"],
      ["difference_qty", "Difference"],
      ["status_text", "Status"]
    ]],
    order_profitability_exceptions: ["Order Profitability Exception Report", data.profitabilityExceptions, [
      ["order_number", "Order"],
      ["department_name", "Department"],
      ["billing_text", "Billing"],
      ["cost_text", "Cost"],
      ["profit_text", "Net Profit"],
      ["roi_text", "ROI"],
      ["status_text", "Exception"]
    ]],
    grn_pending_report: ["GRN Pending Report", data.grnPending, [
      ["purchase_bill", "Purchase Bill"],
      ["supplier_name", "Supplier"],
      ["item_name", "Item"],
      ["accepted_qty", "Accepted"],
      ["status", "Status"]
    ]]
  };

  const documentReportViews = new Set(["order_documents", "invoice_documents", "payment_documents", "missing_documents", "purchase_bills"]);
  const [title, rows, columns] = reportMap[view] || ["Operations Report", [], []];
  return (
    <>
      {documentReportViews.has(view) && (
        <section className="panel operations-upload-panel">
          <div>
            <h2>Upload Documents</h2>
            <p>Open Document Center to attach PDF, image, Excel or CSV files to orders, invoices, payments and procurement records.</p>
          </div>
          <button type="button" className="primary-btn" onClick={() => onNavigate?.("documents")}>Open Document Center</button>
        </section>
      )}
      <OperationsAttentionQueueTable
        title={title}
        rows={rows}
        columns={columns}
        onNavigate={onNavigate}
        onDrilldown={(row) => { setDrilldown(buildOperationsDrilldown(row, data)); scrollToSection(".operations-drilldown-panel"); }}
        onExport={() => exportRows(title, rows)}
        onPrint={requestPrintPreview}
      />
      {drilldown && <OperationsDrilldownPanel drilldown={drilldown} onClose={() => { setDrilldown(null); scrollToSection(".operations-command-center", false); }} onNavigate={onNavigate} notify={notify} />}
    </>
  );
}


function BusinessVoucherScreen({ notify, onNavigate, role, requestedVoucherKind, companyContext }) {
  const today = new Date().toISOString().slice(0, 10);
  const businessVoucherWorkflows = [
    ["receipt", "Receipt Voucher", "Department receipt with TDS/GST TDS deductions"],
    ["supplier_payment", "Supplier Payment Voucher", "Payment against supplier bills or advances"],
    ["sales", "Sales Voucher", "Taxable billing with output GST"],
    ["purchase", "Purchase Voucher", "Inventory or purchase booking with input GST"],
    ["expense", "Expense Voucher", "Authorization, L1, transport, installation or other costs"],
    ["commission", "Work Incentive Voucher", "Percentage-based work incentive expense"],
    ["employee_incentive", "Employee Incentive Voucher", "Employee incentive accrual or payment"],
    ["contra", "Contra Voucher", "Cash/bank transfer between ledgers"],
    ["credit_note", "Credit Note", "Reduce department receivable and sales/GST"],
    ["debit_note", "Debit Note", "Reduce supplier payable or purchase/GST"]
  ];
  const originationDocuments = [
    ["supply_orders", "Work Order / Supply Order", "Root commercial document for procurement, stock, billing, receipt and profitability."]
  ];
  const accountingVoucherWorkflows = [
    ["manual_voucher", "Advanced Journal Entry", "Accountant-controlled debit and credit voucher", "manual_voucher"],
    ["gst_adjustment", "GST Adjustment", "GST correction through controlled journal entry", "manual_voucher"],
    ["opening_balance_voucher", "Opening Balance Voucher", "Create controlled opening balance entries", "opening_balances"],
    ["year_end_voucher", "Year End Voucher", "Close year and carry forward balances", "year_end_closing"],
    ["reversal_voucher", "Reversal Voucher", "Reverse posted vouchers through audit-controlled workflow", "voucher_register"]
  ];
  const workflows = businessVoucherWorkflows;
  const [data, setData] = useState(null);
  const [lastPostedVoucher, setLastPostedVoucher] = useState(null);
  const [form, setForm] = useState({
    company_id: "",
    voucher_kind: "receipt",
    voucher_date: today,
    amount: "",
    taxable_value: "",
    gst_rate: "18",
    gst_amount: "",
    billing_value: "",
    purchase_value: "",
    item_id: "",
    item_hsn: "",
    item_unit: "Nos",
    warehouse_id: "",
    quantity: "",
    damaged_quantity: "",
    accepted_quantity: "",
    rate: "",
    commission_percentage: "10",
    incentive_percentage: "15",
    initial_profit: "",
    tds_deducted: "",
    gst_tds_deducted: "",
    other_deduction: "",
    department_id: "",
    supplier_id: "",
    employee_id: "",
    bank_account_id: "",
    payment_mode: "Bank",
    reference_number: "",
    invoice_number: "",
    purchase_invoice_number: "",
    expense_head_name: "Transport",
    paid_status: "unpaid",
    inventory_enabled: "1",
    from_account_id: "",
    to_account_id: "",
    order_id: "",
    manual_order_number: "",
    linked_invoice_id: "",
    linked_purchase_id: "",
    allocation_amount: "",
    reason_code: "",
    authorize_excess: false,
    narration: ""
  });
  const [quickCreate, setQuickCreate] = useState(null);
  const [learnVoucherOpen, setLearnVoucherOpen] = useState(false);

  useEffect(() => {
    const preferred = requestedVoucherKind || window.__giiGemPreferredVoucherKind;
    if (preferred && workflows.some(([key]) => key === preferred)) {
      setForm((current) => ({ ...current, voucher_kind: preferred }));
      window.__giiGemPreferredVoucherKind = "";
    }
    function applyVoucherKind(event) {
      const kind = event.detail;
      if (kind && workflows.some(([key]) => key === kind)) {
        setForm((current) => ({ ...current, voucher_kind: kind }));
      }
    }
    window.addEventListener("gii-gem-voucher-kind", applyVoucherKind);
    return () => window.removeEventListener("gii-gem-voucher-kind", applyVoucherKind);
  }, [requestedVoucherKind]);

  async function load(companyId = companyContext?.company_id || form.company_id) {
    try {
      const result = await api.getAccountingData(companyId ? { company_id: companyId } : {});
      setData(result);
      if (companyId && String(form.company_id || "") !== String(companyId)) setForm((current) => ({ ...current, company_id: companyId }));
    } catch (error) {
      notify(error.message, "error");
    }
  }

  useEffect(() => {
    load(companyContext?.company_id);
  }, [companyContext?.company_id, companyContext?.company_scope]);

  useEffect(() => {
    if (companyContext?.company_id && String(form.company_id || "") !== String(companyContext.company_id)) {
      setForm((current) => ({ ...current, company_id: companyContext.company_id }));
    }
  }, [companyContext?.company_id, form.company_id]);

  const selectedWorkflow = workflows.find(([key]) => key === form.voucher_kind) || workflows[0];
  const accounts = (data?.accounts || []).map((account) => [account.id, `${account.account_code} - ${account.account_name}`]);
  const bankOptions = (data?.banks || []).map((bank) => [bank.id, `${bank.bank_account_name}${bank.bank_name ? ` / ${bank.bank_name}` : ""}`]);
  const supplierOptions = (data?.suppliers || data?.references?.suppliers || []).map((row) => [row.id, row.supplier_name]);
  const previewLines = businessVoucherPreview(form, data || {});
  const orderOptions = (data?.references?.orders || []).map((row) => [row.id, row.order_number || `Order #${row.id}`, [row.department_name, row.institution_name, row.location].filter(Boolean).join(" / ")]);
  const selectedOrder = (data?.references?.orders || []).find((row) => String(row.id) === String(form.order_id) || String(row.order_number) === String(form.order_id));
  const selectedInvoice = (data?.billWiseReceivables || []).find((row) => String(row.billing_id || row.id) === String(form.linked_invoice_id));
  const selectedPurchaseBill = (data?.billWisePayables || []).find((row) => String(row.procurement_id || row.id) === String(form.linked_purchase_id));
  const departmentInvoices = (data?.billWiseReceivables || [])
    .filter((row) => !form.department_id || String(row.department_id) === String(form.department_id))
    .filter((row) => Number(row.balance_outstanding || 0) > 0);
  const supplierBills = (data?.billWisePayables || [])
    .filter((row) => !form.supplier_id || String(row.supplier_id) === String(form.supplier_id))
    .filter((row) => Number(row.balance_due || row.balance_outstanding || 0) > 0);
  const orderInvoices = (data?.billWiseReceivables || []).filter((row) => selectedOrder && row.order_number === selectedOrder.order_number);
  const orderPurchases = (data?.billWisePayables || []).filter((row) => selectedOrder && row.order_number === selectedOrder.order_number);
  const orderBillingValue = orderInvoices.reduce((sum, row) => sum + Number(row.invoice_amount || 0), 0);
  const orderPurchaseValue = orderPurchases.reduce((sum, row) => sum + Number(row.invoice_amount || row.purchase_value || 0), 0);
  const selectedItem = (data?.references?.items || []).find((row) => String(row.id) === String(form.item_id));
  const validationMessages = businessVoucherValidationMessages({ form, selectedInvoice, selectedPurchaseBill, selectedOrder, previewLines });
  const cashSettlementKinds = ["receipt", "supplier_payment"];
  const accrualExpenseKinds = ["expense", "commission", "employee_incentive"];
  const isPaidAccrualVoucher = accrualExpenseKinds.includes(form.voucher_kind) && form.paid_status === "paid";
  const needsCashBank = cashSettlementKinds.includes(form.voucher_kind) || isPaidAccrualVoucher;
  const needsPaymentMode = needsCashBank;
  const needsReference = needsCashBank;
  const customerKinds = ["receipt", "sales", "credit_note"];
  const supplierKinds = ["supplier_payment", "purchase", "debit_note"];
  const salesLikeKinds = ["sales", "credit_note"];
  const noteLikeKinds = ["credit_note", "debit_note"];
  const taxableLabel = form.voucher_kind === "sales" ? "Sales Taxable Value" : form.voucher_kind === "credit_note" ? "Credit Note Taxable Value" : form.voucher_kind === "debit_note" ? "Debit Note Taxable Value" : "Taxable Value";
  const invoiceLabel = form.voucher_kind === "credit_note" ? "Original / Credit Note Invoice Number" : "Invoice Number";
  const purchaseInvoiceLabel = form.voucher_kind === "debit_note" ? "Original / Debit Note Purchase Invoice Number" : "Purchase Invoice Number";
  const amountLabel = form.voucher_kind === "receipt" ? "Receipt Amount" : form.voucher_kind === "supplier_payment" ? "Payment Amount" : form.voucher_kind === "contra" ? "Transfer Amount" : "Amount";

  function setValue(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateSalesLine(patch = {}) {
    setForm((current) => {
      const next = { ...current, ...patch };
      const quantity = Number(next.quantity || 0);
      const rate = Number(next.rate || 0);
      if (["sales", "credit_note"].includes(next.voucher_kind) && quantity > 0 && rate >= 0) {
        next.taxable_value = String(quantity * rate);
      }
      return next;
    });
  }

  function applyVoucherItem(value) {
    const item = (data?.references?.items || []).find((row) => String(row.id) === String(value));
    setForm((current) => ({
      ...current,
      item_id: value,
      gst_rate: item?.gst_rate ?? current.gst_rate,
      item_hsn: item?.hsn_code || current.item_hsn || "",
      item_unit: item?.unit || current.item_unit || "Nos"
    }));
  }

  function nextManualOrderReference() {
    const year = new Date(form.voucher_date || today).getFullYear();
    const count = (data?.references?.orders || []).length + 1;
    setValue("manual_order_number", `ORD-${year}-${String(count).padStart(5, "0")}`);
  }

  function applyOrder(value) {
    const order = (data?.references?.orders || []).find((row) => String(row.id) === String(value) || String(row.order_number) === String(value));
    const billingTotal = (data?.billWiseReceivables || []).filter((row) => order && row.order_number === order.order_number).reduce((sum, row) => sum + Number(row.invoice_amount || 0), 0);
    const purchaseTotal = (data?.billWisePayables || []).filter((row) => order && row.order_number === order.order_number).reduce((sum, row) => sum + Number(row.invoice_amount || row.purchase_value || 0), 0);
    setForm((current) => ({
      ...current,
      order_id: value,
      department_id: order?.department_id || current.department_id,
      billing_value: billingTotal || current.billing_value,
      purchase_value: purchaseTotal || current.purchase_value,
      manual_order_number: order?.order_number || current.manual_order_number,
      narration: current.narration || (order?.order_number ? `Against order ${order.order_number}` : "")
    }));
  }

  function applyInvoice(row, mode = "full") {
    const balance = Number(row.balance_outstanding || 0);
    const allocation = mode === "full" ? balance : Number(form.allocation_amount || form.amount || 0);
    setForm((current) => {
      const isCreditNote = current.voucher_kind === "credit_note";
      const noteSplit = isCreditNote ? splitGrossByGst(allocation, current.gst_rate || 18) : null;
      return {
        ...current,
        linked_invoice_id: row.billing_id || row.id,
        department_id: row.department_id || current.department_id,
        invoice_number: row.invoice_number || current.invoice_number,
        order_id: row.order_id || current.order_id,
        amount: String(allocation),
        allocation_amount: String(allocation),
        taxable_value: isCreditNote ? String(noteSplit.taxable) : current.taxable_value,
        gst_amount: isCreditNote ? String(noteSplit.gst) : current.gst_amount,
        gst_rate: isCreditNote ? String(current.gst_rate || 18) : current.gst_rate,
        reason_code: isCreditNote ? (current.reason_code || "Rate Difference") : current.reason_code,
        reference_number: isCreditNote ? (current.reference_number || `CN-${row.invoice_number || row.billing_id || row.id}`) : current.reference_number,
        narration: current.narration || `${isCreditNote ? "Credit note" : "Against"} invoice ${row.invoice_number || ""}`.trim()
      };
    });
  }

  function applyPurchaseBill(row, mode = "full") {
    const balance = Number(row.balance_due || row.balance_outstanding || 0);
    const allocation = mode === "full" ? balance : Number(form.allocation_amount || form.amount || 0);
    setForm((current) => {
      const isDebitNote = current.voucher_kind === "debit_note";
      const noteSplit = isDebitNote ? splitGrossByGst(allocation, current.gst_rate || 18) : null;
      return {
        ...current,
        linked_purchase_id: row.procurement_id || row.id,
        supplier_id: row.supplier_id || current.supplier_id,
        purchase_invoice_number: row.purchase_invoice_number || current.purchase_invoice_number,
        order_id: row.order_id || current.order_id,
        amount: String(allocation),
        allocation_amount: String(allocation),
        taxable_value: isDebitNote ? String(noteSplit.taxable) : current.taxable_value,
        gst_amount: isDebitNote ? String(noteSplit.gst) : current.gst_amount,
        gst_rate: isDebitNote ? String(current.gst_rate || 18) : current.gst_rate,
        reason_code: isDebitNote ? (current.reason_code || "Rate Difference") : current.reason_code,
        reference_number: isDebitNote ? (current.reference_number || `DN-${row.purchase_invoice_number || row.procurement_id || row.id}`) : current.reference_number,
        narration: current.narration || `${isDebitNote ? "Debit note" : "Against"} purchase bill ${row.purchase_invoice_number || ""}`.trim()
      };
    });
  }

  function applyAutoAmount(kind) {
    if (kind === "commission") {
      const commission = Number(form.billing_value || orderBillingValue || 0) * Number(form.commission_percentage || 0) / 100;
      setValue("amount", String(commission));
    }
    if (kind === "employee_incentive") {
      const incentive = Number(form.initial_profit || 0) * Number(form.incentive_percentage || 0) / 100;
      setValue("amount", String(incentive));
    }
  }

  function openQuickCreate(type, field, defaults = {}) {
    if (!roleAllowsAction(role, "new")) {
      confirmAction({
        title: "Permission Required",
        message: "You do not have permission to create master records. Please contact administrator.",
        confirmLabel: "OK",
        hideCancel: true
      });
      return;
    }
    setQuickCreate({ type, field, defaults });
  }

  async function handleQuickCreated(type, saved, request) {
    const field = request?.field;
    const valueMap = {
      department: saved.id,
      supplier: saved.id,
      employee: saved.id,
      bank: saved.id,
      item: saved.id,
      warehouse: saved.id,
      expense_head: saved.expense_head_name,
      ledger_account: saved.id
    };
    if (field && Object.prototype.hasOwnProperty.call(valueMap, type)) {
      if (type === "item") {
        setForm((current) => ({
          ...current,
          [field]: valueMap[type],
          gst_rate: saved.gst_rate ?? current.gst_rate,
          item_hsn: saved.hsn_code || current.item_hsn || "",
          item_unit: saved.unit || current.item_unit || "Nos"
        }));
      } else {
        setValue(field, valueMap[type]);
      }
    }
    await load(form.company_id);
  }

  async function submit(event) {
    event.preventDefault();
    const action = event.nativeEvent?.submitter?.value || "draft";
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before saving a business voucher.");
      if (form.company_id && String(form.company_id) !== String(companyContext.company_id)) throw new Error("Selected company and voucher company do not match.");
      const blocking = businessVoucherValidationMessages({ form, selectedInvoice, selectedPurchaseBill, selectedOrder, previewLines }).filter((message) => message.severity === "error");
      if (blocking.length) throw new Error(blocking[0].message);
      const voucher = await api.createBusinessVoucher({
        ...form,
        company_id: Number(companyContext.company_id),
        department_id: form.department_id ? Number(form.department_id) : null,
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
        employee_id: form.employee_id ? Number(form.employee_id) : null,
        bank_account_id: form.bank_account_id ? Number(form.bank_account_id) : null,
        from_account_id: form.from_account_id ? Number(form.from_account_id) : null,
        to_account_id: form.to_account_id ? Number(form.to_account_id) : null,
        inventory_enabled: form.inventory_enabled === "1"
      });
      if (action === "submit") {
        await api.updateGuidedVoucherStatus(voucher.id, "submit", 1, "Submitted from guided voucher entry");
        notify("Guided voucher saved and submitted for review");
      } else if (action === "post") {
        const confirmed = await confirmAction({
          ...postConfirmOptions("guided_vouchers", voucher.id),
          message: "Do you want to approve and post this guided voucher now? This will create ledger entries and may lock the transaction from direct editing.",
          confirmLabel: "Yes, Approve & Post",
          cancelLabel: "No, Keep Draft"
        });
        if (confirmed.confirmed) {
          await api.updateGuidedVoucherStatus(voucher.id, "submit", 1, "Admin fast-track submit");
          await api.updateGuidedVoucherStatus(voucher.id, "review", 1, "Admin fast-track review");
          await api.updateGuidedVoucherStatus(voucher.id, "approve", 1, "Admin fast-track approval");
          const posted = await api.postGuidedVoucher(voucher.id, 1);
          setLastPostedVoucher(posted);
          notify(`Guided voucher posted: ${posted.voucher_number}`);
        } else {
          notify(`Guided voucher saved as ${voucher.status}`);
        }
      } else {
        notify(`Guided voucher saved as ${voucher.status}. Submit, approve and post it from the queue below.`);
      }
      setForm((current) => ({
        ...current,
        amount: "",
        taxable_value: "",
        gst_amount: "",
        billing_value: "",
        purchase_value: "",
        manual_order_number: "",
        item_hsn: "",
        item_unit: "Nos",
        initial_profit: "",
        tds_deducted: "",
        gst_tds_deducted: "",
        other_deduction: "",
        reference_number: "",
        invoice_number: "",
        purchase_invoice_number: "",
        narration: ""
      }));
      await load(form.company_id);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function guidedAction(id, action) {
    try {
      if (action === "post") {
        const confirmed = await confirmAction(postConfirmOptions("guided_vouchers", id));
        if (!confirmed.confirmed) return;
        const voucher = await api.postGuidedVoucher(id, 1);
        setLastPostedVoucher(voucher);
        notify(`Guided voucher posted: ${voucher.voucher_number}`);
      } else {
        if (action === "approve") {
          const confirmed = await confirmAction(approveConfirmOptions("guided_vouchers", id));
          if (!confirmed.confirmed) return;
        }
        const row = await api.updateGuidedVoucherStatus(id, action, 1, "");
        notify(`Guided voucher moved to ${row.status}`);
      }
      await load(form.company_id);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function guidedPostNow(id) {
    try {
      const confirmed = await confirmAction({
        ...postConfirmOptions("guided_vouchers", id),
        message: "Do you want to move this guided voucher through review, approval and posting now? This will create ledger entries.",
        confirmLabel: "Yes, Approve & Post",
        cancelLabel: "No, Cancel"
      });
      if (!confirmed.confirmed) return;
      const current = (data?.guidedVouchers || []).find((row) => Number(row.id) === Number(id));
      if (!current) throw new Error("Guided voucher not found in the queue");
      if (current.status === "Draft") await api.updateGuidedVoucherStatus(id, "submit", 1, "Admin fast-track submit");
      if (["Draft", "Pending Review"].includes(current.status)) await api.updateGuidedVoucherStatus(id, "review", 1, "Admin fast-track review");
      if (["Draft", "Pending Review", "Pending Approval"].includes(current.status)) await api.updateGuidedVoucherStatus(id, "approve", 1, "Admin fast-track approval");
      const posted = await api.postGuidedVoucher(id, 1);
      setLastPostedVoucher(posted);
      notify(`Guided voucher posted: ${posted.voucher_number}`);
      await load(form.company_id);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <section className="voucher-layout">
      <form className="panel entry-form voucher-form" onSubmit={submit}>
        <div className="panel-head">
          <div>
            <h2>Voucher Dashboard</h2>
            <p>Start from Work Order / Supply Order, then post downstream business and accounting vouchers.</p>
          </div>
        </div>
        <div className="voucher-selector-section origination-section">
          <div className="voucher-section-head">
            <span>Origination Documents</span>
            <small>Start the GII business file here before procurement, stock, billing, receipts and ledger posting.</small>
          </div>
          <div className="voucher-type-grid origination-voucher-grid">
            {originationDocuments.map(([targetView, label, note]) => (
              <button key={targetView} type="button" title={note} onClick={() => onNavigate?.(targetView)}>
                {label}
              </button>
            ))}
          </div>
          <div className="voucher-flow-path">
            <span>Work Order / Supply Order</span>
            <span>Procurement</span>
            <span>Stock</span>
            <span>Billing</span>
            <span>Receipt</span>
            <span>Vouchers</span>
            <span>Reports</span>
          </div>
        </div>
        <div className="voucher-selector-section">
          <div className="voucher-section-head">
            <span>Business Vouchers</span>
            <small>Routine operational entries for supply, billing, payments and expenses.</small>
          </div>
          <div className="voucher-type-grid">
            {businessVoucherWorkflows.map(([key, label]) => (
              <button key={key} type="button" className={form.voucher_kind === key ? "active" : ""} onClick={() => setValue("voucher_kind", key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="voucher-selector-section accountant-section">
          <div className="voucher-section-head">
            <span>Accounting Vouchers</span>
            <small>Use for accountant-controlled corrections, opening entries, year-end and reversals.</small>
          </div>
          <div className="voucher-type-grid accounting-voucher-grid">
            {accountingVoucherWorkflows.map(([key, label, note, targetView]) => (
              <button key={key} type="button" className="accounting-voucher-btn" title={note} onClick={() => onNavigate?.(targetView)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="workflow-note">
          <strong>Selected business workflow</strong>
          <span>{selectedWorkflow[1]} - {selectedWorkflow[2]}</span>
        </div>
        <BusinessVoucherIntelligencePanel
          form={form}
          data={data || {}}
          selectedWorkflow={selectedWorkflow}
          selectedOrder={selectedOrder}
          selectedInvoice={selectedInvoice}
          selectedPurchaseBill={selectedPurchaseBill}
          departmentInvoices={departmentInvoices}
          supplierBills={supplierBills}
          orderInvoices={orderInvoices}
          orderPurchases={orderPurchases}
          selectedItem={selectedItem}
          validationMessages={validationMessages}
          onApplyInvoice={applyInvoice}
          onApplyPurchaseBill={applyPurchaseBill}
          onAutoAmount={applyAutoAmount}
          onLearn={() => setLearnVoucherOpen(true)}
        />
        <div className="form-grid">
          <SelectBox label="Company" value={form.company_id} onChange={(value) => setForm({ ...form, company_id: value })} options={(data?.companies || []).map((company) => [company.id, company.company_name])} />
          <Field name="voucher_date" label="Voucher Date" type="date" value={form.voucher_date} onChange={(value) => setValue("voucher_date", value)} />
          {form.voucher_kind !== "contra" && <SearchableSelect label="Order Number" value={form.order_id} onChange={applyOrder} options={orderOptions} placeholder="Search order number" />}
          {form.voucher_kind !== "contra" && (
            <label className="field">
              Order Reference
              <div className="field-with-action">
                <input
                  type="text"
                  value={form.manual_order_number}
                  onChange={(event) => setValue("manual_order_number", event.target.value)}
                  placeholder="Auto next or enter manually"
                />
                <button type="button" className="ghost-btn" onClick={nextManualOrderReference}>Auto Next</button>
              </div>
            </label>
          )}
          {needsCashBank && <SearchableSelect label={form.voucher_kind === "receipt" ? "Receiving Bank / Cash Account" : "Paying Bank / Cash Account"} value={form.bank_account_id} onChange={(value) => setValue("bank_account_id", value)} options={bankOptions} onQuickCreate={() => openQuickCreate("bank", "bank_account_id")} />}
          {needsPaymentMode && <SelectField label="Payment Mode" value={form.payment_mode} onChange={(value) => setValue("payment_mode", value)} options={["Bank", "Cash"]} />}
          {customerKinds.includes(form.voucher_kind) && <SearchableSelect label="Customer / Government Department" value={form.department_id} onChange={(value) => setValue("department_id", value)} options={(data?.departments || []).map((row) => [row.id, row.department_name])} onQuickCreate={() => openQuickCreate("department", "department_id")} />}
          {supplierKinds.includes(form.voucher_kind) && <SearchableSelect label="Supplier / Vendor" value={form.supplier_id} onChange={(value) => setValue("supplier_id", value)} options={supplierOptions} onQuickCreate={() => openQuickCreate("supplier", "supplier_id")} />}
          {form.voucher_kind === "employee_incentive" && <SearchableSelect label="Employee" value={form.employee_id} onChange={(value) => setValue("employee_id", value)} options={(data?.employees || []).map((row) => [row.id, row.employee_name])} onQuickCreate={() => openQuickCreate("employee", "employee_id")} />}
          {form.voucher_kind === "contra" && <SearchableSelect label="From Cash/Bank Account" value={form.from_account_id} onChange={(value) => setValue("from_account_id", value)} options={accounts} onQuickCreate={() => openQuickCreate("ledger_account", "from_account_id", { account_type: "Asset", normal_balance: "Debit" })} />}
          {form.voucher_kind === "contra" && <SearchableSelect label="To Cash/Bank Account" value={form.to_account_id} onChange={(value) => setValue("to_account_id", value)} options={accounts} onQuickCreate={() => openQuickCreate("ledger_account", "to_account_id", { account_type: "Asset", normal_balance: "Debit" })} />}
          {["sales", "credit_note", "debit_note"].includes(form.voucher_kind) && <Field name="taxable_value" label={taxableLabel} type="number" value={form.taxable_value} onChange={(value) => setValue("taxable_value", value)} />}
          {["sales", "purchase", "credit_note", "debit_note"].includes(form.voucher_kind) && <Field name="gst_rate" label="GST Rate %" type="number" value={form.gst_rate} onChange={(value) => setValue("gst_rate", value)} />}
          {["purchase"].includes(form.voucher_kind) && <Field name="purchase_value" label="Purchase Value" type="number" value={form.purchase_value} onChange={(value) => setValue("purchase_value", value)} />}
          {["sales", "purchase"].includes(form.voucher_kind) && <SelectField label="Inventory Posting" value={form.inventory_enabled} onChange={(value) => setValue("inventory_enabled", value)} options={[["1", "Inventory + Accounting"], ["0", "Accounting Only"]]} />}
          {["sales", "purchase"].includes(form.voucher_kind) && <SearchableSelect label={form.voucher_kind === "sales" ? "Item to Bill / Issue" : "Item for GRN"} value={form.item_id} onChange={applyVoucherItem} options={(data?.references?.items || []).map((row) => [row.id, row.item_name, [row.hsn_code, row.unit].filter(Boolean).join(" / ")])} onQuickCreate={() => openQuickCreate("item", "item_id")} />}
          {["sales", "purchase"].includes(form.voucher_kind) && <SearchableSelect label={form.voucher_kind === "sales" ? "Warehouse for Stock Issue" : "Warehouse for GRN"} value={form.warehouse_id} onChange={(value) => setValue("warehouse_id", value)} options={(data?.references?.warehouses || []).map((row) => [row.id, row.warehouse_name])} onQuickCreate={() => openQuickCreate("warehouse", "warehouse_id")} />}
          {["sales", "purchase"].includes(form.voucher_kind) && (
            <label className="field">
              HSN
              <input type="text" value={form.item_hsn || selectedItem?.hsn_code || ""} readOnly placeholder="Select item to auto-fill" />
            </label>
          )}
          {["sales", "purchase"].includes(form.voucher_kind) && (
            <label className="field">
              Unit
              <input type="text" value={form.item_unit || selectedItem?.unit || "Nos"} readOnly />
            </label>
          )}
          {["sales", "purchase"].includes(form.voucher_kind) && <Field name="quantity" label={form.voucher_kind === "sales" ? "Quantity to Issue" : "Quantity Received"} type="number" value={form.quantity} onChange={(value) => form.voucher_kind === "sales" ? updateSalesLine({ quantity: value }) : setValue("quantity", value)} />}
          {["purchase"].includes(form.voucher_kind) && <Field name="damaged_quantity" label="Damaged Quantity" type="number" value={form.damaged_quantity} onChange={(value) => setValue("damaged_quantity", value)} />}
          {["purchase"].includes(form.voucher_kind) && <Field name="accepted_quantity" label="Accepted Quantity" type="number" value={form.accepted_quantity} onChange={(value) => setValue("accepted_quantity", value)} />}
          {["sales", "purchase"].includes(form.voucher_kind) && <Field name="rate" label={form.voucher_kind === "sales" ? "Billing Rate" : "Receipt Rate"} type="number" value={form.rate} onChange={(value) => form.voucher_kind === "sales" ? updateSalesLine({ rate: value }) : setValue("rate", value)} />}
          {["expense"].includes(form.voucher_kind) && <SearchableSelect label="Expense Head" value={form.expense_head_name} onChange={(value) => setValue("expense_head_name", value)} options={(data?.references?.expenseHeads || []).map((row) => [row.expense_head_name, row.expense_head_name, row.category])} onQuickCreate={() => openQuickCreate("expense_head", "expense_head_name")} />}
          {["commission"].includes(form.voucher_kind) && <Field name="billing_value" label="Billing Value" type="number" value={form.billing_value} onChange={(value) => setValue("billing_value", value)} />}
          {["commission"].includes(form.voucher_kind) && <Field name="commission_percentage" label="Work Incentive %" type="number" value={form.commission_percentage} onChange={(value) => setValue("commission_percentage", value)} />}
          {["employee_incentive"].includes(form.voucher_kind) && <Field name="initial_profit" label="Initial Profit" type="number" value={form.initial_profit} onChange={(value) => setValue("initial_profit", value)} />}
          {["employee_incentive"].includes(form.voucher_kind) && <Field name="incentive_percentage" label="Incentive %" type="number" value={form.incentive_percentage} onChange={(value) => setValue("incentive_percentage", value)} />}
          {!["sales", "purchase", "commission", "employee_incentive", "credit_note", "debit_note"].includes(form.voucher_kind) && <Field name="amount" label={amountLabel} type="number" value={form.amount} onChange={(value) => setValue("amount", value)} />}
          {form.voucher_kind === "receipt" && <Field name="tds_deducted" label="TDS Deducted" type="number" value={form.tds_deducted} onChange={(value) => setValue("tds_deducted", value)} />}
          {form.voucher_kind === "receipt" && <Field name="gst_tds_deducted" label="GST TDS Deducted" type="number" value={form.gst_tds_deducted} onChange={(value) => setValue("gst_tds_deducted", value)} />}
          {form.voucher_kind === "receipt" && <Field name="other_deduction" label="Other Deduction" type="number" value={form.other_deduction} onChange={(value) => setValue("other_deduction", value)} />}
          {salesLikeKinds.includes(form.voucher_kind) && <Field name="invoice_number" label={invoiceLabel} type="text" value={form.invoice_number} onChange={(value) => setValue("invoice_number", value)} />}
          {["purchase", "debit_note"].includes(form.voucher_kind) && <Field name="purchase_invoice_number" label={purchaseInvoiceLabel} type="text" value={form.purchase_invoice_number} onChange={(value) => setValue("purchase_invoice_number", value)} />}
          {["expense", "commission", "employee_incentive"].includes(form.voucher_kind) && <SelectField label="Paid Status" value={form.paid_status} onChange={(value) => setValue("paid_status", value)} options={["unpaid", "paid"]} />}
          {noteLikeKinds.includes(form.voucher_kind) && <SelectField label="Reason Code" value={form.reason_code || "Rate Difference"} onChange={(value) => setValue("reason_code", value)} options={form.voucher_kind === "credit_note" ? ["Rate Difference", "Quantity Difference", "Return", "Billing Error", "Discount", "Other"] : ["Rate Difference", "Quantity Difference", "Supplier Return", "Purchase Error", "Other"]} />}
          {noteLikeKinds.includes(form.voucher_kind) && <Field name="reference_number" label="Note Reference" type="text" value={form.reference_number} onChange={(value) => setValue("reference_number", value)} />}
          {needsReference && <Field name="reference_number" label={form.payment_mode === "Cash" ? "Cash Receipt / Payment Reference" : "Reference / UTR"} type="text" value={form.reference_number} onChange={(value) => setValue("reference_number", value)} />}
          <Field name="narration" label="Narration" type="textarea" value={form.narration} onChange={(value) => setValue("narration", value)} />
        </div>
        {validationMessages.length > 0 && (
          <div className="voucher-validation-list">
            {validationMessages.map((message) => <span key={message.message} className={message.severity === "error" ? "warning-line" : "ok-line"}>{message.message}</span>)}
          </div>
        )}
        {validationMessages.some((message) => message.severity === "error" && /exceed|excess/i.test(message.message)) && (
          <label className="billing-excess-check">
            <input type="checkbox" checked={Boolean(form.authorize_excess)} onChange={(event) => setValue("authorize_excess", event.target.checked)} />
            Authorize controlled excess for this voucher
          </label>
        )}
        <div className="button-row guided-save-actions">
          <button className="ghost-btn" name="guided_action" value="draft">Save Draft</button>
          <button className="ghost-btn" name="guided_action" value="submit">Save & Submit</button>
          <button className="primary-btn" name="guided_action" value="post">Save, Approve & Post</button>
        </div>
      </form>
      {quickCreate && (
        <QuickCreateMasterDialog
          request={quickCreate}
          records={quickCreateRecords(quickCreate.type, { references: data?.references || {}, accounts: data?.accounts || [], departments: data?.departments || [], suppliers: supplierOptions, employees: data?.employees || [], banks: data?.banks || [] })}
          context={{ company_id: form.company_id, source_module: "voucher_dashboard" }}
          role={role}
          notify={notify}
          onClose={() => setQuickCreate(null)}
          onCreated={handleQuickCreated}
        />
      )}
      {learnVoucherOpen && <VoucherLearnDialog kind={form.voucher_kind} onClose={() => setLearnVoucherOpen(false)} />}
      <aside className="panel entry-form">
        <div className="panel-head">
          <div>
            <h2>Voucher Preview</h2>
            <p>System-generated debit and credit effect before posting.</p>
          </div>
        </div>
        {previewLines.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ledger</th><th>Debit</th><th>Credit</th></tr></thead>
              <tbody>
                {previewLines.map((line, index) => (
                  <tr key={`${line.account}-${index}`}>
                    <td>{line.account}</td>
                    <td>{formatCurrency(line.debit)}</td>
                    <td>{formatCurrency(line.credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="Enter voucher details" note="Preview appears when the current workflow has a calculable amount." />}
      </aside>
      <section className="panel billing-list">
        <div className="panel-head">
          <div>
            <h2>Guided Voucher Approval Queue</h2>
            <p>{data?.guidedVouchers?.length || 0} voucher(s)</p>
          </div>
          <button type="button" className="ghost-btn" onClick={() => onNavigate?.("voucher_register")}>Open Posted Vouchers</button>
        </div>
        {lastPostedVoucher && (
          <div className="workflow-note posted-note">
            <strong>Posted Successfully</strong>
            <span>{lastPostedVoucher.voucher_number || `Voucher #${lastPostedVoucher.id}`} has been posted to books. Check Vouchers, General Ledger and Trial Balance.</span>
            <button type="button" className="ghost-btn" onClick={() => onNavigate?.("voucher_register")}>View Posted Voucher</button>
          </div>
        )}
        <div className="workflow-note">
          <strong>Posting flow</strong>
          <span>Draft to Submit to Review to Approve to Post. Only posted vouchers appear in Vouchers, General Ledger and Trial Balance.</span>
        </div>
        {data?.guidedVouchers?.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Workflow</th><th>Narration</th><th>Status</th><th>Posted Voucher</th><th>Actions</th></tr></thead>
              <tbody>
                {data.guidedVouchers.map((row) => (
                  <tr key={row.id}>
                    <td>{row.voucher_date}</td>
                    <td>{row.voucher_kind}</td>
                    <td>{row.narration}</td>
                    <td><span className={`status ${normalizeStatusClass(row.status)}`}>{row.status}</span></td>
                    <td>{row.posted_voucher_number || row.posted_voucher_id || "-"}</td>
                    <td className="button-row">
                      {row.status === "Draft" && <button type="button" className="ghost-btn" onClick={() => guidedAction(row.id, "submit")}>Submit</button>}
                      {row.status === "Pending Review" && <button type="button" className="ghost-btn" onClick={() => guidedAction(row.id, "review")}>Review</button>}
                      {row.status === "Pending Approval" && <button type="button" className="ghost-btn" onClick={() => guidedAction(row.id, "approve")}>Approve</button>}
                      {row.status === "Approved" && <button type="button" className="primary-btn" onClick={() => guidedAction(row.id, "post")}>Post</button>}
                      {!["Posted", "Reversed"].includes(row.status) && <button type="button" className="primary-btn" onClick={() => guidedPostNow(row.id)}>Approve & Post</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No guided vouchers" note="Save a draft voucher to start the approval workflow." />}
      </section>
    </section>
  );
}

function VoucherEntryScreen({ notify, companyContext }) {
  const today = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(null);
  const [form, setForm] = useState({
    company_id: "",
    voucher_date: today,
    voucher_type: "Journal",
    voucher_number: "",
    reference_number: "",
    bank_account_id: "",
    narration: "",
    lines: [
      { account_id: "", debit: "", credit: "", narration: "" },
      { account_id: "", debit: "", credit: "", narration: "" }
    ]
  });

  async function load(companyId = companyContext?.company_id || form.company_id) {
    try {
      const result = await api.getAccountingData(companyId ? { company_id: companyId } : {});
      setData(result);
      if (companyId && String(form.company_id || "") !== String(companyId)) setForm((current) => ({ ...current, company_id: companyId }));
    } catch (error) {
      notify(error.message, "error");
    }
  }

  useEffect(() => {
    load(companyContext?.company_id);
  }, [companyContext?.company_id, companyContext?.company_scope]);

  useEffect(() => {
    if (companyContext?.company_id && String(form.company_id || "") !== String(companyContext.company_id)) {
      setForm((current) => ({ ...current, company_id: companyContext.company_id }));
    }
  }, [companyContext?.company_id, form.company_id]);

  const accounts = data?.accounts || [];
  const banks = data?.banks || [];
  const totalDebit = form.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const totalCredit = form.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  const difference = totalDebit - totalCredit;

  function updateLine(index, key, value) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line)
    }));
  }

  function addLine() {
    setForm((current) => ({ ...current, lines: [...current.lines, { account_id: "", debit: "", credit: "", narration: "" }] }));
  }

  function removeLine(index) {
    setForm((current) => ({ ...current, lines: current.lines.filter((_, lineIndex) => lineIndex !== index) }));
  }

  async function submit(event) {
    event.preventDefault();
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before posting a voucher.");
      if (form.company_id && String(form.company_id) !== String(companyContext.company_id)) throw new Error("Selected company and voucher company do not match.");
      if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) throw new Error("Voucher debit and credit totals must match");
      const voucher = await api.createVoucher({
        ...form,
        company_id: Number(companyContext.company_id),
        bank_account_id: form.bank_account_id ? Number(form.bank_account_id) : null,
        lines: form.lines.map((line) => ({
          ...line,
          account_id: Number(line.account_id),
          debit: Number(line.debit || 0),
          credit: Number(line.credit || 0)
        }))
      });
      notify(`Voucher posted: ${voucher.voucher_number}`);
      setForm((current) => ({
        ...current,
        voucher_number: "",
        reference_number: "",
        narration: "",
        lines: [
          { account_id: "", debit: "", credit: "", narration: "" },
          { account_id: "", debit: "", credit: "", narration: "" }
        ]
      }));
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <section className="voucher-layout">
      <form className="panel entry-form voucher-form" onSubmit={submit}>
        <div className="panel-head">
          <div>
            <h2>Advanced Journal Entry</h2>
            <p>Use for accountant-controlled adjustments, opening entries, year-end corrections and GST corrections.</p>
          </div>
        </div>
        <div className="voucher-meta">
          <label className="field">Company
            <select value={form.company_id} onChange={(event) => setForm({
              ...form,
              company_id: event.target.value,
              bank_account_id: "",
              lines: [
                { account_id: "", debit: "", credit: "", narration: "" },
                { account_id: "", debit: "", credit: "", narration: "" }
              ]
            })} required>
              {(data?.companies || []).map((company) => <option key={company.id} value={company.id}>{company.company_name}</option>)}
            </select>
          </label>
          <label className="field">Date
            <input type="date" value={form.voucher_date} onChange={(event) => setForm({ ...form, voucher_date: event.target.value })} required />
          </label>
          <label className="field">Voucher Type
            <select value={form.voucher_type} onChange={(event) => setForm({ ...form, voucher_type: event.target.value })}>
              {["Receipt", "Payment", "Purchase", "Sales", "Journal", "Contra", "Debit Note", "Credit Note"].map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label className="field">Voucher Number
            <input placeholder="Auto if blank" value={form.voucher_number} onChange={(event) => setForm({ ...form, voucher_number: event.target.value })} />
          </label>
          <label className="field">Cash/Bank Account
            <select value={form.bank_account_id} onChange={(event) => setForm({ ...form, bank_account_id: event.target.value })}>
              <option value="">Not linked</option>
              {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.bank_account_name}</option>)}
            </select>
          </label>
          <label className="field">Reference / UTR
            <input value={form.reference_number} onChange={(event) => setForm({ ...form, reference_number: event.target.value })} />
          </label>
        </div>
        <label className="field">Narration
          <textarea value={form.narration} onChange={(event) => setForm({ ...form, narration: event.target.value })} />
        </label>

        <div className="voucher-lines">
          <div className="voucher-line voucher-line-head">
            <span>Account</span>
            <span>Debit</span>
            <span>Credit</span>
            <span>Narration</span>
            <span></span>
          </div>
          {form.lines.map((line, index) => (
            <div className="voucher-line" key={index}>
              <select value={line.account_id} onChange={(event) => updateLine(index, "account_id", event.target.value)} required>
                <option value="">Select account</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.account_code} - {account.account_name}</option>)}
              </select>
              <input type="number" value={line.debit} onChange={(event) => updateLine(index, "debit", event.target.value)} min="0" step="0.01" />
              <input type="number" value={line.credit} onChange={(event) => updateLine(index, "credit", event.target.value)} min="0" step="0.01" />
              <input value={line.narration} onChange={(event) => updateLine(index, "narration", event.target.value)} />
              <button type="button" className="ghost-btn" onClick={() => removeLine(index)} disabled={form.lines.length <= 2}>Remove</button>
            </div>
          ))}
        </div>
        <div className="voucher-totals">
          <button type="button" className="ghost-btn" onClick={addLine}>Add Line</button>
          <span>Debit: <strong>{formatCurrency(totalDebit)}</strong></span>
          <span>Credit: <strong>{formatCurrency(totalCredit)}</strong></span>
          <span className={difference ? "loss" : "profit"}>Difference: <strong>{formatCurrency(difference)}</strong></span>
        </div>
        <button className="primary-btn">Post Voucher</button>
      </form>
    </section>
  );
}

function AllocationWorkflowScreen({ view, notify, role, companyContext }) {
  const today = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(null);
  const [form, setForm] = useState({
    company_id: "",
    payment_id: "",
    billing_id: "",
    advance_id: "",
    supplier_payment_id: "",
    procurement_id: "",
    allocated_amount: 0,
    adjusted_amount: 0,
    tds_deducted: 0,
    gst_tds_deducted: 0,
    other_deductions: 0,
    party_type: "department",
    party_id: "",
    financial_year_id: "",
    opening_date: today,
    opening_debit: 0,
    opening_credit: 0,
    default_credit_days: 30,
    grace_period: 0,
    due_date_rule: "invoice_date",
    status: "active",
    allow_excess: false,
    remarks: ""
  });
  const canPostOpening = roleAllowsAction(role, "voucher");
  const canMaintainCreditTerms = roleAllowsAction(role, "approve") || roleAllowsAction(role, "voucher");

  async function load() {
    try {
      const selectedCompanyId = companyContext?.company_id || form.company_id;
      const result = await api.getAccountingData(selectedCompanyId ? { company_id: selectedCompanyId } : {});
      setData(result);
      if (selectedCompanyId && String(form.company_id || "") !== String(selectedCompanyId)) setForm((current) => ({ ...current, company_id: selectedCompanyId }));
    } catch (error) {
      notify(error.message, "error");
    }
  }

  useEffect(() => {
    load();
  }, [form.company_id, companyContext?.company_id, companyContext?.company_scope]);

  const companyOptions = (data?.companies || []).map((row) => [row.id, row.company_name]);
  const invoiceOptions = (data?.billWiseReceivables || []).filter((row) => Number(row.balance_outstanding || 0) > 0).map((row) => [row.billing_id, `${row.invoice_number} - ${row.department_name} - ${formatCurrency(row.balance_outstanding)}`]);
  const paymentOptions = (data?.unallocatedReceipts || []).filter((row) => Number(row.unallocated_amount || 0) > 0).map((row) => [row.payment_id, `${row.receipt_reference} - ${formatCurrency(row.unallocated_amount)}`]);
  const procurementOptions = (data?.billWisePayables || []).filter((row) => Number(row.balance_due || 0) > 0).map((row) => [row.procurement_id, `${row.purchase_invoice_number} - ${row.supplier_name} - ${formatCurrency(row.balance_due)}`]);
  const supplierPaymentOptions = (data?.unallocatedSupplierPayments || []).filter((row) => Number(row.unallocated_amount || 0) > 0).map((row) => [row.supplier_payment_id, `${row.payment_reference} - ${formatCurrency(row.unallocated_amount)}`]);
  const receiptAdvanceOptions = (data?.advanceReceipts || []).filter((row) => Number(row.balance_advance || 0) > 0).map((row) => [row.id, `${row.receipt_reference || row.id} - ${row.department_name || "Department"} - ${formatCurrency(row.balance_advance)}`]);
  const supplierAdvanceOptions = (data?.supplierAdvances || []).filter((row) => Number(row.balance_advance || 0) > 0).map((row) => [row.id, `${row.payment_reference || row.id} - ${row.supplier_name || "Supplier"} - ${formatCurrency(row.balance_advance)}`]);
  const selectedReceiptAdvance = (data?.advanceReceipts || []).find((row) => String(row.id) === String(form.advance_id));
  const selectedSupplierAdvance = (data?.supplierAdvances || []).find((row) => String(row.id) === String(form.advance_id));
  const selectedInvoiceForAdjustment = (data?.billWiseReceivables || []).find((row) => String(row.billing_id) === String(form.billing_id));
  const selectedPurchaseForAdjustment = (data?.billWisePayables || []).find((row) => String(row.procurement_id) === String(form.procurement_id));
  const partyOptions = form.party_type === "supplier"
    ? (data?.suppliers || data?.references?.suppliers || []).map((row) => [row.id, row.supplier_name])
    : form.party_type === "department"
      ? (data?.departments || data?.references?.departments || []).map((row) => [row.id, row.department_name])
      : form.party_type === "employee"
        ? (data?.employees || []).map((row) => [row.id, row.employee_name])
        : [];

  async function submitReceipt(event) {
    event.preventDefault();
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before saving receipt allocation.");
      await api.createReceiptAllocation({
        company_id: companyContext.company_id,
        payment_id: form.payment_id,
        billing_id: form.billing_id,
        allocated_amount: Number(form.allocated_amount || 0),
        tds_deducted: Number(form.tds_deducted || 0),
        gst_tds_deducted: Number(form.gst_tds_deducted || 0),
        other_deductions: Number(form.other_deductions || 0),
        allow_excess: form.allow_excess,
        remarks: form.remarks
      });
      notify("Receipt allocation saved");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function submitSupplier(event) {
    event.preventDefault();
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before saving supplier allocation.");
      await api.createSupplierPaymentAllocation({
        company_id: companyContext.company_id,
        supplier_payment_id: form.supplier_payment_id,
        procurement_id: form.procurement_id,
        allocated_amount: Number(form.allocated_amount || 0),
        allow_excess: form.allow_excess,
        remarks: form.remarks
      });
      notify("Supplier payment allocation saved");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function createReceiptAdvance() {
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before creating an advance receipt.");
      const payment = (data?.unallocatedReceipts || []).find((row) => String(row.payment_id) === String(form.payment_id));
      if (!payment) throw new Error("Select an unallocated receipt first");
      await api.createAdvanceReceipt({
        company_id: companyContext.company_id,
        payment_id: form.payment_id,
        department_id: form.party_id || payment.department_id,
        advance_received: Number(form.allocated_amount || payment.unallocated_amount || 0),
        remarks: form.remarks
      });
      notify("Advance receipt created");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function createSupplierAdvance() {
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before creating a supplier advance.");
      await api.createSupplierAdvance({
        company_id: companyContext.company_id,
        supplier_payment_id: form.supplier_payment_id,
        advance_paid: Number(form.allocated_amount || 0),
        remarks: form.remarks
      });
      notify("Supplier advance created");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function submitAdvanceAdjustment(event) {
    event.preventDefault();
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before adjusting an advance receipt.");
      await api.adjustAdvanceReceipt({
        company_id: companyContext.company_id,
        advance_id: form.advance_id,
        billing_id: form.billing_id,
        adjusted_amount: Number(form.adjusted_amount || 0),
        reason: form.remarks || "Advance adjusted against invoice"
      });
      notify("Advance adjusted against invoice");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function submitSupplierAdvanceAdjustment(event) {
    event.preventDefault();
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before adjusting a supplier advance.");
      await api.adjustSupplierAdvance({
        company_id: companyContext.company_id,
        advance_id: form.advance_id,
        procurement_id: form.procurement_id,
        adjusted_amount: Number(form.adjusted_amount || 0),
        reason: form.remarks || "Supplier advance adjusted against purchase bill"
      });
      notify("Supplier advance adjusted against purchase bill");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function submitOpening(event) {
    event.preventDefault();
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before posting party opening balance.");
      await api.createPartyOpeningBalance({
        company_id: companyContext.company_id,
        party_type: form.party_type,
        party_id: form.party_id,
        financial_year_id: form.financial_year_id,
        opening_date: form.opening_date,
        opening_debit: Number(form.opening_debit || 0),
        opening_credit: Number(form.opening_credit || 0),
        narration: form.remarks || "Party opening balance"
      });
      notify("Party opening balance voucher posted");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function submitCreditTerms(event) {
    event.preventDefault();
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before saving credit terms.");
      await api.saveCreditTerm({
        company_id: companyContext.company_id,
        party_type: form.party_type === "supplier" ? "supplier" : "department",
        party_id: form.party_id,
        default_credit_days: Number(form.default_credit_days || 30),
        grace_period: Number(form.grace_period || 0),
        due_date_rule: form.due_date_rule,
        status: form.status
      });
      notify("Credit terms saved");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  if (view === "receipt_allocation_workflow") {
    return (
      <section className="workflow-layout">
        <div className="workflow-note" style={{ marginBottom: 8 }}>
          <strong>Receipt Allocation Lifecycle</strong>
          <span>Bank Receipt {">"} Allocate to Invoice {">"} Adjust Receivable Balance {">"} Update Ledger</span>
          <small>After allocation the invoice receivable is partially or fully settled. Use the Unallocate / Reallocate panel under reports to correct misallocations without editing posted entries.</small>
        </div>
        <form className="panel entry-form workflow-form" onSubmit={submitReceipt}>
          <div className="panel-head"><div><h2>Receipt Allocation</h2><p>Allocate receipt amount, TDS and GST TDS against open invoices.</p></div></div>
          <div className="form-grid">
            <SelectBox label="Company" value={form.company_id} onChange={(value) => setForm({ ...form, company_id: value })} options={companyOptions} />
            <SelectBox label="Payment Receipt" value={form.payment_id} onChange={(value) => setForm({ ...form, payment_id: value })} options={paymentOptions} />
            <SelectBox label="Open Invoice" value={form.billing_id} onChange={(value) => setForm({ ...form, billing_id: value })} options={invoiceOptions} />
            <Field name="allocated_amount" label="Allocate Amount" type="number" value={form.allocated_amount} onChange={(value) => setForm({ ...form, allocated_amount: value })} />
            <Field name="tds_deducted" label="TDS Deducted" type="number" value={form.tds_deducted} onChange={(value) => setForm({ ...form, tds_deducted: value })} />
            <Field name="gst_tds_deducted" label="GST TDS Deducted" type="number" value={form.gst_tds_deducted} onChange={(value) => setForm({ ...form, gst_tds_deducted: value })} />
            <Field name="other_deductions" label="Other Deduction" type="number" value={form.other_deductions} onChange={(value) => setForm({ ...form, other_deductions: value })} />
            <label className="field">Allow Excess<input type="checkbox" checked={form.allow_excess} onChange={(event) => setForm({ ...form, allow_excess: event.target.checked })} /></label>
            <Field name="remarks" label="Remarks" type="textarea" value={form.remarks} onChange={(value) => setForm({ ...form, remarks: value })} />
          </div>
          <button className="primary-btn">Save Allocation</button>
          <button type="button" className="ghost-btn" onClick={createReceiptAdvance}>Create Advance From Receipt</button>
        </form>
        <SummaryTable title="Unallocated Receipts" rows={data?.unallocatedReceipts || []} columns={["receipt_amount", "allocated_amount", "advance_balance", "unallocated_amount", "allocation_status"]} />
      </section>
    );
  }

  if (view === "supplier_allocation_workflow") {
    return (
      <section className="workflow-layout">
        <div className="workflow-note" style={{ marginBottom: 8 }}>
          <strong>Supplier Payment Allocation Lifecycle</strong>
          <span>Supplier Payment {">"} Allocate to Purchase Bill {">"} Adjust Payable Balance {">"} Update Ledger</span>
          <small>After allocation the purchase bill payable is partially or fully settled. Use the Unallocate / Reallocate panel under reports to correct misallocations without editing posted entries.</small>
        </div>
        <form className="panel entry-form workflow-form" onSubmit={submitSupplier}>
          <div className="panel-head"><div><h2>Supplier Payment Allocation</h2><p>Allocate supplier payments against open purchase bills.</p></div></div>
          <div className="form-grid">
            <SelectBox label="Company" value={form.company_id} onChange={(value) => setForm({ ...form, company_id: value })} options={companyOptions} />
            <SelectBox label="Supplier Payment" value={form.supplier_payment_id} onChange={(value) => setForm({ ...form, supplier_payment_id: value })} options={supplierPaymentOptions} />
            <SelectBox label="Purchase Bill" value={form.procurement_id} onChange={(value) => setForm({ ...form, procurement_id: value })} options={procurementOptions} />
            <Field name="allocated_amount" label="Allocate Amount" type="number" value={form.allocated_amount} onChange={(value) => setForm({ ...form, allocated_amount: value })} />
            <label className="field">Allow Advance/Excess<input type="checkbox" checked={form.allow_excess} onChange={(event) => setForm({ ...form, allow_excess: event.target.checked })} /></label>
            <Field name="remarks" label="Remarks" type="textarea" value={form.remarks} onChange={(value) => setForm({ ...form, remarks: value })} />
          </div>
          <button className="primary-btn">Save Supplier Allocation</button>
          <button type="button" className="ghost-btn" onClick={createSupplierAdvance}>Create Supplier Advance</button>
        </form>
        <SummaryTable title="Unallocated Supplier Payments" rows={data?.unallocatedSupplierPayments || []} columns={["payment_amount", "allocated_amount", "advance_balance", "unallocated_amount", "allocation_status"]} />
      </section>
    );
  }

  if (view === "advance_adjustment_wizard") {
    return (
      <section className="workflow-layout">
        <form className="panel entry-form workflow-form" onSubmit={submitAdvanceAdjustment}>
          <div className="panel-head"><div><h2>Advance Receipt Adjustment Wizard</h2><p>Adjust department advance receipts against open invoices.</p></div></div>
          <div className="wizard-flow"><span>Advance Receipt</span><span>Select Open Invoice</span><span>Adjust Amount</span><span>Update Receivable</span></div>
          <div className="form-grid">
            <SelectBox label="Company" value={form.company_id} onChange={(value) => setForm({ ...form, company_id: value })} options={companyOptions} />
            <SelectBox label="Advance Receipt" value={form.advance_id} onChange={(value) => setForm({ ...form, advance_id: value })} options={receiptAdvanceOptions} />
            <SelectBox label="Open Invoice" value={form.billing_id} onChange={(value) => setForm({ ...form, billing_id: value })} options={invoiceOptions} />
            <Field name="adjusted_amount" label="Adjust Amount" type="number" value={form.adjusted_amount} onChange={(value) => setForm({ ...form, adjusted_amount: value })} />
            <Field name="remarks" label="Adjustment Reason" type="textarea" value={form.remarks} onChange={(value) => setForm({ ...form, remarks: value })} />
          </div>
          <div className="invoice-total-strip">
            <span>Advance Received <strong>{formatCurrency(selectedReceiptAdvance?.advance_received || 0)}</strong></span>
            <span>Already Adjusted <strong>{formatCurrency(selectedReceiptAdvance?.advance_adjusted || 0)}</strong></span>
            <span>Remaining Advance <strong>{formatCurrency(selectedReceiptAdvance?.balance_advance || 0)}</strong></span>
            <span>Invoice Outstanding <strong>{formatCurrency(selectedInvoiceForAdjustment?.balance_outstanding || 0)}</strong></span>
          </div>
          <button className="primary-btn">Adjust Advance</button>
        </form>
        <SummaryTable title="Advance Adjustment History" rows={(data?.advanceAdjustments || []).filter((row) => row.adjustment_type === "receipt")} columns={["reference", "adjusted_amount", "status", "reason", "created_at"]} />
      </section>
    );
  }

  if (view === "supplier_advance_adjustment_wizard") {
    return (
      <section className="workflow-layout">
        <form className="panel entry-form workflow-form" onSubmit={submitSupplierAdvanceAdjustment}>
          <div className="panel-head"><div><h2>Supplier Advance Adjustment Wizard</h2><p>Adjust supplier advances paid against open purchase bills.</p></div></div>
          <div className="wizard-flow"><span>Supplier Advance</span><span>Select Purchase Bill</span><span>Adjust Amount</span><span>Update Payable</span></div>
          <div className="form-grid">
            <SelectBox label="Company" value={form.company_id} onChange={(value) => setForm({ ...form, company_id: value })} options={companyOptions} />
            <SelectBox label="Supplier Advance" value={form.advance_id} onChange={(value) => setForm({ ...form, advance_id: value })} options={supplierAdvanceOptions} />
            <SelectBox label="Purchase Bill" value={form.procurement_id} onChange={(value) => setForm({ ...form, procurement_id: value })} options={procurementOptions} />
            <Field name="adjusted_amount" label="Adjust Amount" type="number" value={form.adjusted_amount} onChange={(value) => setForm({ ...form, adjusted_amount: value })} />
            <Field name="remarks" label="Adjustment Reason" type="textarea" value={form.remarks} onChange={(value) => setForm({ ...form, remarks: value })} />
          </div>
          <div className="invoice-total-strip">
            <span>Advance Paid <strong>{formatCurrency(selectedSupplierAdvance?.advance_paid || 0)}</strong></span>
            <span>Already Adjusted <strong>{formatCurrency(selectedSupplierAdvance?.advance_adjusted || 0)}</strong></span>
            <span>Remaining Advance <strong>{formatCurrency(selectedSupplierAdvance?.balance_advance || 0)}</strong></span>
            <span>Bill Outstanding <strong>{formatCurrency(selectedPurchaseForAdjustment?.balance_due || 0)}</strong></span>
          </div>
          <button className="primary-btn">Adjust Supplier Advance</button>
        </form>
        <SummaryTable title="Supplier Advance Adjustment History" rows={(data?.advanceAdjustments || []).filter((row) => row.adjustment_type === "supplier")} columns={["reference", "adjusted_amount", "status", "reason", "created_at"]} />
      </section>
    );
  }

  if (view === "party_opening_balances") {
    return (
      <section className="workflow-layout">
        <form className="panel entry-form workflow-form" onSubmit={submitOpening}>
          <div className="panel-head"><div><h2>Party Opening Balance</h2><p>Create balanced opening voucher with linked party ledger.</p></div></div>
          <div className="mini-panel">
            <h3>Financial Control Check</h3>
            <p>Party opening balances create an opening voucher and affect party ledgers. Use this only for migration or year-opening differences, then verify through Opening Balances, Party Ledger and Audit Log.</p>
          </div>
          <div className="form-grid">
            <SelectBox label="Company" value={form.company_id} onChange={(value) => setForm({ ...form, company_id: value })} options={companyOptions} />
            <SelectBox label="Party Type" value={form.party_type} onChange={(value) => setForm({ ...form, party_type: value, party_id: "" })} options={[["department", "Department"], ["supplier", "Supplier"], ["employee", "Employee"], ["expense_party", "Expense Payable Party"]]} />
            <SelectBox label="Party Name" value={form.party_id} onChange={(value) => setForm({ ...form, party_id: value })} options={partyOptions} />
            <SelectBox label="Financial Year" value={form.financial_year_id} onChange={(value) => setForm({ ...form, financial_year_id: value })} options={(data?.financialYears || []).map((row) => [row.id, row.financial_year_name])} />
            <Field name="opening_date" label="Opening Date" type="date" value={form.opening_date} onChange={(value) => setForm({ ...form, opening_date: value })} />
            <Field name="opening_debit" label="Opening Debit" type="number" value={form.opening_debit} onChange={(value) => setForm({ ...form, opening_debit: value })} />
            <Field name="opening_credit" label="Opening Credit" type="number" value={form.opening_credit} onChange={(value) => setForm({ ...form, opening_credit: value })} />
            <Field name="remarks" label="Narration" type="textarea" value={form.remarks} onChange={(value) => setForm({ ...form, remarks: value })} />
          </div>
          <button className="primary-btn" disabled={!canPostOpening}>Post Opening Voucher</button>
        </form>
        <SummaryTable title="Opening Balances" rows={data?.openingBalances || []} columns={["opening_debit", "opening_credit", "voucher_number"]} />
      </section>
    );
  }

  return (
    <section className="workflow-layout">
      <form className="panel entry-form workflow-form" onSubmit={submitCreditTerms}>
        <div className="panel-head"><div><h2>Credit Terms</h2><p>Define due-date rules for departments and suppliers.</p></div></div>
        <div className="mini-panel">
          <h3>Control Scope</h3>
          <p>Credit terms drive due dates, ageing buckets and collection/payable review. They do not post accounting entries and should be reviewed whenever ageing reports look unexpected.</p>
        </div>
        <div className="form-grid">
          <SelectBox label="Company" value={form.company_id} onChange={(value) => setForm({ ...form, company_id: value })} options={companyOptions} />
          <SelectBox label="Party Type" value={form.party_type} onChange={(value) => setForm({ ...form, party_type: value, party_id: "" })} options={[["department", "Department"], ["supplier", "Supplier"]]} />
          <SelectBox label="Party Name" value={form.party_id} onChange={(value) => setForm({ ...form, party_id: value })} options={partyOptions} />
          <Field name="default_credit_days" label="Default Credit Days" type="number" value={form.default_credit_days} onChange={(value) => setForm({ ...form, default_credit_days: value })} />
          <Field name="grace_period" label="Grace Period" type="number" value={form.grace_period} onChange={(value) => setForm({ ...form, grace_period: value })} />
          <SelectBox label="Due Date Rule" value={form.due_date_rule} onChange={(value) => setForm({ ...form, due_date_rule: value })} options={[["invoice_date", "Invoice/Purchase Date"], ["posting_date", "Posting Date"]]} />
          <SelectBox label="Status" value={form.status} onChange={(value) => setForm({ ...form, status: value })} options={[["active", "Active"], ["inactive", "Inactive"]]} />
        </div>
        <button className="primary-btn" disabled={!canMaintainCreditTerms}>Save Credit Terms</button>
      </form>
      <SummaryTable title="Credit Terms Report" rows={data?.creditTerms || []} columns={["default_credit_days", "grace_period", "due_date_rule", "status"]} />
    </section>
  );
}

function InventoryReportScreen({ view, notify, companyContext, onNavigate }) {
  const today = new Date().toISOString().slice(0, 10);
  const [filters, setFilters] = useState({ company_id: companyContext?.company_id || "", date_from: "2026-01-01", date_to: today, low_stock_mode: "stocked" });
  const [data, setData] = useState(null);
  const [drilldown, setDrilldown] = useState(null);

  async function load() {
    try {
      const effectiveFilters = { ...filters, company_id: companyContext?.company_id || filters.company_id };
      const result = await api.getInventoryData(effectiveFilters);
      setData(result);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  useEffect(() => {
    if (companyContext?.company_id && String(filters.company_id || "") !== String(companyContext.company_id)) {
      setFilters((current) => ({ ...current, company_id: companyContext.company_id }));
      return;
    }
    load();
  }, [filters.company_id, filters.date_from, filters.date_to, filters.low_stock_mode, companyContext?.company_id, companyContext?.company_scope]);

  async function openInventoryDrilldown(row, mode = "account") {
    try {
      const payload = {
        company_id: filters.company_id,
        date_from: filters.date_from,
        date_to: filters.date_to
      };
      if (mode === "account") payload.account_id = row.id;
      if (mode === "voucher") payload.voucher_id = row.voucher_id || row.id;
      if (mode === "source") {
        payload.source_module = row.source_module;
        payload.source_id = row.source_id;
      }
      const result = await api.getDrilldownData(payload);
      setDrilldown({ mode, title: row.account_name || row.voucher_number || row.reference || "Drilldown", ...result });
      notify("Drilldown opened");
      scrollToSection(".voucher-detail-panel", false);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  const config = inventoryTableConfig(view, data || {});
  const rows = config.rows || [];
  if (view === "inventory_dashboard") {
    return (
      <InventoryDashboardPanel
        data={data || {}}
        rows={rows}
        filters={filters}
        setFilters={setFilters}
        companies={data?.companies || []}
        onNavigate={onNavigate}
        onExport={() => exportRows(config.title, rows)}
        onPrint={requestPrintPreview}
      />
    );
  }
  if (view === "stock_summary") {
    return (
      <InteractiveStockSummaryReport
        data={data || {}}
        filters={filters}
        setFilters={setFilters}
        rows={rows}
        title={config.title}
      />
    );
  }
  return (
    <>
      <InventoryReadOnlyReportPanel
        view={view}
        config={config}
        rows={rows}
        filters={filters}
        setFilters={setFilters}
        companies={data?.companies || []}
        formatValue={formatCell}
        onExport={() => exportRows(config.title, rows)}
        onPrint={requestPrintPreview}
        onDrillVoucher={(row) => openInventoryDrilldown(row, "voucher")}
        onDrillSource={(row) => openInventoryDrilldown(row, "source")}
        onDrillAccount={(row) => openInventoryDrilldown(row, "account")}
        onNavigate={onNavigate}
      >
        {view === "delivery_challans" && <DeliveryChallanQuickForm api={api} data={data || {}} notify={notify} onSaved={load} confirmAction={window.__giiGemConfirm || (() => Promise.resolve({ confirmed: true }))} />}
        {view === "warehouse_transfers" && <WarehouseTransferQuickForm data={data || {}} notify={notify} onSaved={load} />}
      </InventoryReadOnlyReportPanel>
      {drilldown && <DrilldownPanel drilldown={drilldown} onClose={() => setDrilldown(null)} onNavigate={onNavigate} notify={notify} />}
    </>
  );
}


function WarehouseTransferQuickForm({ data, notify, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ from_warehouse_id: "", to_warehouse_id: "", item_id: "", quantity: "", rate: "", transfer_date: today, reason: "" });
  async function submit(event) {
    event.preventDefault();
    try {
      const transfer = await api.createWarehouseTransfer({
        company_id: data.company_id,
        from_warehouse_id: Number(form.from_warehouse_id),
        to_warehouse_id: Number(form.to_warehouse_id),
        item_id: Number(form.item_id),
        quantity: Number(form.quantity),
        rate: Number(form.rate || 0),
        transfer_date: form.transfer_date,
        reason: form.reason
      });
      const confirmed = await confirmAction({
        mode: "warning",
        title: "Post Warehouse Transfer",
        message: "Do you want to proceed with this inventory action? Stock balances may be affected.",
        confirmLabel: "Yes, Proceed",
        cancelLabel: "No, Cancel",
        moduleName: "warehouse_transfers",
        recordId: transfer.id
      });
      if (!confirmed.confirmed) return;
      await api.postWarehouseTransfer(transfer.id, 1);
      notify(`Warehouse transfer posted: ${transfer.transfer_number || transfer.id}`);
      setForm({ from_warehouse_id: "", to_warehouse_id: "", item_id: "", quantity: "", rate: "", transfer_date: today, reason: "" });
      onSaved();
    } catch (error) {
      notify(error.message, "error");
    }
  }
  const warehouses = (data.references?.warehouses || []).map((row) => [row.id, row.warehouse_name]);
  return (
    <form className="inline-entry-form" onSubmit={submit}>
      <SelectBox label="From Warehouse" value={form.from_warehouse_id} onChange={(value) => setForm({ ...form, from_warehouse_id: value })} options={warehouses} />
      <SelectBox label="To Warehouse" value={form.to_warehouse_id} onChange={(value) => setForm({ ...form, to_warehouse_id: value })} options={warehouses} />
      <SelectBox label="Item" value={form.item_id} onChange={(value) => setForm({ ...form, item_id: value })} options={(data.references?.items || []).map((row) => [row.id, row.item_name])} />
      <Field name="quantity" label="Quantity" type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} />
      <Field name="rate" label="Rate" type="number" value={form.rate} onChange={(value) => setForm({ ...form, rate: value })} />
      <Field name="transfer_date" label="Transfer Date" type="date" value={form.transfer_date} onChange={(value) => setForm({ ...form, transfer_date: value })} />
      <Field name="reason" label="Reason" type="text" value={form.reason} onChange={(value) => setForm({ ...form, reason: value })} />
      <button className="primary-btn">Post Transfer</button>
    </form>
  );
}

function buildAllocationCorrectionForm(kind, row = {}) {
  return {
    action: "unallocate",
    target_id: kind === "receipt" ? row.billing_id || "" : row.procurement_id || "",
    allocated_amount: row.allocated_amount || "",
    tds_deducted: row.tds_deducted || 0,
    gst_tds_deducted: row.gst_tds_deducted || 0,
    other_deductions: row.other_deductions || 0,
    allow_excess: Number(row.allow_excess || 0) === 1,
    reason: ""
  };
}

function allocationTargetOptions(kind, data = {}) {
  if (kind === "receipt") {
    return (data.billWiseReceivables || [])
      .filter((row) => row.billing_id)
      .map((row) => [
        row.billing_id,
        `${row.invoice_number || `Invoice ${row.billing_id}`} | ${row.department_name || "Department"} | Balance ${formatCurrency(Number(row.balance_outstanding || 0))}`
      ]);
  }
  return (data.billWisePayables || [])
    .filter((row) => row.procurement_id)
    .map((row) => [
      row.procurement_id,
      `${row.purchase_invoice_number || `Purchase ${row.procurement_id}`} | ${row.supplier_name || "Supplier"} | Balance ${formatCurrency(Number(row.balance_due || 0))}`
    ]);
}

function AccountingScreen({ view, notify, role, companyContext, onNavigate }) {
  const today = new Date().toISOString().slice(0, 10);
  const [filters, setFilters] = useState({ company_id: companyContext?.company_id || "", date_from: "2026-01-01", date_to: today });
  const [data, setData] = useState(null);
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [drilldown, setDrilldown] = useState(null);
  const [allocationCorrection, setAllocationCorrection] = useState(null);
  const [allocationCorrectionForm, setAllocationCorrectionForm] = useState(buildAllocationCorrectionForm("receipt"));
  const canPostControls = roleAllowsAction(role, "voucher");
  const canApproveControls = roleAllowsAction(role, "approve");
  const canManagePeriods = roleAllowsAction(role, "approve");

  async function load() {
    try {
      const effectiveFilters = { ...filters, company_id: companyContext?.company_id || filters.company_id };
      const result = await api.getAccountingData(effectiveFilters);
      setData(result);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  useEffect(() => {
    if (companyContext?.company_id && String(filters.company_id || "") !== String(companyContext.company_id)) {
      setFilters((current) => ({ ...current, company_id: companyContext.company_id }));
      return;
    }
    load();
  }, [filters.company_id, filters.date_from, filters.date_to, companyContext?.company_id, companyContext?.company_scope]);

  const readOnlyReportFamily = isReadOnlyReportFamilyView(view);
  const config = readOnlyReportFamily
    ? buildReadOnlyReportFamilyConfig(view, data || {})
    : accountingTableConfig(view, data || {});
  const rows = config.rows || [];
  const accountingControlPanelViews = ["posting_control", "approval_queue", "financial_control", "audit_log"];
  const isAccountingControlPanelView = accountingControlPanelViews.includes(view);
  const voucherLines = selectedVoucher ? (data?.voucherLines || []).filter((line) => Number(line.voucher_id) === Number(selectedVoucher.id)) : [];

  async function handleReverse(row) {
    if (row.status === "Reversed" || row.source_module === "voucher_reversal") {
      notify("This voucher is already part of a reversal chain", "error");
      return;
    }
    const confirmed = await confirmAction({
      ...reversalConfirmOptions("vouchers", row.id),
      message: "Are you sure you want to proceed? This voucher may affect ledgers, trial balance, GST, receivables, payables and reports."
    });
    if (!confirmed.confirmed) return;
    try {
      await api.reverseVoucher(row.id, confirmed.reason);
      notify("Reversal voucher posted");
      setSelectedVoucher(null);
      load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function handlePostingAction(action, row) {
    try {
      if (action === "post" || action === "retry") {
        if (action === "retry" && row.retry_available !== "Yes") {
          notify("Retry is available only for safe failed posting records.", "error");
          return;
        }
        const confirmed = await confirmAction({
          ...postConfirmOptions(row.module, row.record_id),
          message: action === "retry"
            ? "Retry posting this failed record? Confirm only after reviewing the source record and posting error."
            : "Do you want to post this voucher to the books of accounts?",
          cancelLabel: "No, Review Again"
        });
        if (!confirmed.confirmed) return;
        await api.postTransaction(row.module, row.record_id);
        notify(action === "retry" ? `${row.reference} posting retried` : `${row.reference} posted`);
      } else if (action === "approve") {
        const confirmed = await confirmAction(approveConfirmOptions(row.module, row.record_id));
        if (!confirmed.confirmed) return;
        await api.approveTransaction(row.module, row.record_id, null, "Approved from Posting Control");
        notify(`${row.reference} approved`);
      } else if (action === "error") {
        await confirmAction({
          mode: "normal",
          title: "Posting Error",
          message: row.posting_error || "No posting error recorded",
          confirmLabel: "OK",
          hideCancel: true,
          moduleName: row.module,
          recordId: row.record_id
        });
      }
      load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function handleFinancialYearStatus(row, status) {
    try {
      const confirmed = await confirmAction({
        mode: "warning",
        title: `${status} Financial Year`,
        message: status === "Closed"
          ? "Closing the financial year will restrict posting and editing for this period. Do you want to continue?"
          : `Do you want to mark this financial year as ${status}?`,
        confirmLabel: status === "Closed" ? "Yes, Close Year" : "Yes, Proceed",
        cancelLabel: "No, Cancel",
        moduleName: "financial_years",
        recordId: row.id
      });
      if (!confirmed.confirmed) return;
      await api.updateFinancialYearStatus(row.id, status, null);
      notify(`Financial year marked ${status}`);
      load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  function handleAllocationAction(kind, row) {
    setAllocationCorrection({ kind, row });
    setAllocationCorrectionForm(buildAllocationCorrectionForm(kind, row));
  }

  async function submitAllocationCorrection(event) {
    event.preventDefault();
    if (!allocationCorrection) return;
    const { kind, row } = allocationCorrection;
    const reason = allocationCorrectionForm.reason.trim();
    const label = kind === "receipt" ? row.receipt_voucher : row.payment_voucher;
    if (!reason) {
      notify("Correction reason is required before changing an allocation", "error");
      return;
    }
    if (allocationCorrectionForm.action === "reallocate" && !allocationCorrectionForm.target_id) {
      notify(kind === "receipt" ? "Select the invoice to reallocate this receipt to" : "Select the purchase bill to reallocate this supplier payment to", "error");
      return;
    }
    const confirmed = await confirmAction({
      mode: "danger",
      title: allocationCorrectionForm.action === "reallocate" ? "Reallocate Entry" : "Unallocate Entry",
      message: allocationCorrectionForm.action === "reallocate"
        ? `Reallocate ${label}? This will reverse the current allocation and create a new controlled allocation.`
        : `Unallocate ${label}? This may affect receivable/payable reconciliation reports.`,
      confirmLabel: allocationCorrectionForm.action === "reallocate" ? "Yes, Reallocate" : "Yes, Unallocate",
      cancelLabel: "No, Cancel",
      moduleName: kind === "receipt" ? "payment_allocations" : "supplier_payment_allocations",
      recordId: row.id
    });
    if (!confirmed.confirmed) return;
    try {
      if (allocationCorrectionForm.action === "reallocate") {
        if (kind === "receipt") {
          await api.reallocateReceiptAllocation(row.id, {
            billing_id: allocationCorrectionForm.target_id,
            allocated_amount: Number(allocationCorrectionForm.allocated_amount || 0),
            tds_deducted: Number(allocationCorrectionForm.tds_deducted || 0),
            gst_tds_deducted: Number(allocationCorrectionForm.gst_tds_deducted || 0),
            other_deductions: Number(allocationCorrectionForm.other_deductions || 0),
            allow_excess: allocationCorrectionForm.allow_excess,
            remarks: reason,
            reason
          });
        } else {
          await api.reallocateSupplierPaymentAllocation(row.id, {
            procurement_id: allocationCorrectionForm.target_id,
            allocated_amount: Number(allocationCorrectionForm.allocated_amount || 0),
            allow_excess: allocationCorrectionForm.allow_excess,
            remarks: reason,
            reason
          });
        }
        notify("Allocation reallocated and audit trail updated");
      } else {
        if (kind === "receipt") {
          await api.unallocateReceiptAllocation(row.id, reason);
        } else {
          await api.unallocateSupplierPaymentAllocation(row.id, reason);
        }
        notify("Allocation removed and audit trail updated");
      }
      setAllocationCorrection(null);
      load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function handleAdvanceAdjustmentReverse(row) {
    const confirmed = await confirmAction({
      ...reversalConfirmOptions("advance_adjustments", row.id),
      message: `Reverse adjustment ${row.reference || row.id}?`
    });
    if (!confirmed.confirmed) return;
    try {
      await api.reverseAdvanceAdjustment(row.id, confirmed.reason, null);
      notify("Advance adjustment reversed");
      load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function openDrilldown(row, mode = "account") {
    try {
      const payload = {
        company_id: filters.company_id,
        date_from: filters.date_from,
        date_to: filters.date_to
      };
      if (mode === "account") payload.account_id = row.id;
      if (mode === "voucher") payload.voucher_id = row.voucher_id || row.id;
      if (mode === "source") {
        payload.source_module = row.source_module;
        payload.source_id = row.source_id;
      }
      const result = await api.getDrilldownData(payload);
      setDrilldown({ mode, title: row.account_name || row.voucher_number || row.reference || "Drilldown", ...result });
      notify("Drilldown opened");
      scrollToSection(".voucher-detail-panel", false);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  function openPartyReconciliationDrill(row) {
    const id = row.id;
    const drillMap = {
      receivable: {
        title: "Department Receivable Reconciliation Drilldown",
        ledgerTitle: "Department Ledger Entries",
        ledgerRows: data?.partyLedger?.filter((entry) => entry.party_type === "department") || [],
        subledgerTitle: "Bill-wise Receivables",
        subledgerRows: data?.billWiseReceivables || [],
        relatedTitle: "Receipt Allocations",
        relatedRows: data?.paymentAllocations || []
      },
      payable: {
        title: "Supplier Payable Reconciliation Drilldown",
        ledgerTitle: "Supplier Ledger Entries",
        ledgerRows: data?.partyLedger?.filter((entry) => entry.party_type === "supplier") || [],
        subledgerTitle: "Bill-wise Payables",
        subledgerRows: data?.billWisePayables || [],
        relatedTitle: "Supplier Payment Allocations",
        relatedRows: data?.supplierPaymentAllocations || []
      },
      receipt_allocations: {
        title: "Receipt Allocation Reconciliation Drilldown",
        ledgerTitle: "Receipt Allocation Rows",
        ledgerRows: data?.paymentAllocations || [],
        subledgerTitle: "Unallocated Receipts",
        subledgerRows: data?.unallocatedReceipts || [],
        relatedTitle: "Advance Receipts",
        relatedRows: data?.advanceReceipts || []
      },
      supplier_allocations: {
        title: "Supplier Allocation Reconciliation Drilldown",
        ledgerTitle: "Supplier Allocation Rows",
        ledgerRows: data?.supplierPaymentAllocations || [],
        subledgerTitle: "Unallocated Supplier Payments",
        subledgerRows: data?.unallocatedSupplierPayments || [],
        relatedTitle: "Supplier Advances",
        relatedRows: data?.supplierAdvances || []
      }
    };
    const drill = drillMap[id] || drillMap.receivable;
    setDrilldown({ mode: "party_reconciliation", sourceRow: row, ...drill });
    notify("Party reconciliation drilldown opened");
    scrollToSection(".voucher-detail-panel", false);
  }

  function tableNameForControlRow(row) {
    const moduleName = String(row.table_name || row.module_name || row.source_module || row.module || "").toLowerCase();
    const map = {
      billing: "invoices",
      invoices: "invoices",
      procurement: "procurements",
      procurements: "procurements",
      receipt: "payments",
      payment: "payments",
      payments: "payments",
      supplier_payment: "supplier_payments",
      expense: "expense_entries",
      expense_entries: "expense_entries",
      financial_years: "financial_years",
      opening_balances: "opening_balances",
      credit_terms: "credit_terms",
      voucher_proposals: "voucher_proposals"
    };
    return map[moduleName] || moduleName || "";
  }

  function sourceRowsForControl(row) {
    const recordId = Number(row.record_id || row.source_id || row.id || 0);
    const sourceModule = String(row.source_module || row.module || row.module_name || "").toLowerCase();
    const datasets = {
      billing: data?.invoices || [],
      procurement: data?.procurements || [],
      receipt: data?.payments || [],
      payment: data?.payments || [],
      expense: data?.expenseEntries || [],
      financial_years: data?.financialYears || [],
      opening_balances: data?.openingBalances || [],
      credit_terms: data?.creditTerms || []
    };
    const sourceRows = datasets[sourceModule] || [];
    return recordId ? sourceRows.filter((item) => Number(item.id || item.record_id) === recordId) : sourceRows;
  }

  function voucherRowsForControl(row) {
    const voucherId = Number(row.voucher_id || row.opening_voucher_id || 0);
    const voucherNumber = row.voucher_number;
    return (data?.dayBook || []).filter((item) => (voucherId && Number(item.id) === voucherId) || (voucherNumber && item.voucher_number === voucherNumber));
  }

  function ledgerRowsForControl(row) {
    const voucherId = Number(row.voucher_id || row.opening_voucher_id || 0);
    const voucherNumber = row.voucher_number;
    const sourceModule = row.source_module;
    const sourceId = Number(row.record_id || row.source_id || 0);
    return (data?.ledger || []).filter((item) => (
      (voucherId && Number(item.voucher_id) === voucherId)
      || (voucherNumber && item.voucher_number === voucherNumber)
      || (sourceModule && sourceId && item.source_module === sourceModule && Number(item.source_id) === sourceId)
    ));
  }

  function auditRowsForControl(row) {
    const tableName = tableNameForControlRow(row);
    const recordId = Number(row.record_id || row.source_id || row.id || 0);
    return (data?.auditLog || []).filter((item) => {
      const tableMatches = tableName ? item.table_name === tableName : true;
      const recordMatches = recordId ? Number(item.record_id || 0) === recordId : true;
      return tableMatches && recordMatches;
    });
  }

  function controlEvidenceFor(row) {
    const map = {
      current_year: { title: "Financial Year Evidence", rows: data?.financialYears || [] },
      period: { title: "Selected Control Period", rows: [{ date_from: filters.date_from, date_to: filters.date_to, company_id: filters.company_id }] },
      trial: { title: "Trial Balance Evidence", rows: data?.trialBalance || [] },
      unposted: { title: "Posting Queue Evidence", rows: data?.postingControl || [] },
      drafts: { title: "Draft Transaction Evidence", rows: (data?.postingControl || []).filter((item) => item.posting_status === "Draft") },
      approval: { title: "Approval Queue Evidence", rows: data?.approvalQueue || [] },
      reversed: { title: "Reversal Audit Evidence", rows: (data?.auditLog || []).filter((item) => String(item.action || "").toLowerCase().includes("revers")) },
      closed: { title: "Closed / Locked Year Evidence", rows: (data?.financialYears || []).filter((item) => ["Closed", "Locked"].includes(item.status)) },
      locked: { title: "Locked Year Evidence", rows: (data?.financialYears || []).filter((item) => item.status === "Locked") },
      profit: { title: "Profit & Loss Evidence", rows: data?.profitLoss?.rows || [] },
      bs_diff: { title: "Balance Sheet Evidence", rows: data?.balanceSheet?.rows || [] },
      gst: { title: "GST Register Evidence", rows: [...(data?.gstRegisters?.output || []), ...(data?.gstRegisters?.input || [])] },
      tds: { title: "TDS Register Evidence", rows: data?.tdsRegisters || [] },
      party_recon: { title: "Party Reconciliation Evidence", rows: data?.partyReconciliation || [] },
      rec_overdue: { title: "Receivable Ageing Evidence", rows: data?.receivableAgeing || [] },
      pay_overdue: { title: "Payable Ageing Evidence", rows: data?.payableAgeing || [] }
    };
    return map[row.id] || { title: "Control Evidence", rows: [] };
  }

  function openFinancialControlDrill(row) {
    const evidence = row.control ? controlEvidenceFor(row) : null;
    setDrilldown({
      mode: "control_evidence",
      title: row.control || row.reference || row.module_name || "Financial Control Evidence",
      sourceRow: row,
      sourceTitle: evidence?.title || "Source Record",
      sourceRows: evidence?.rows || sourceRowsForControl(row),
      voucherTitle: "Linked Vouchers",
      voucherRows: voucherRowsForControl(row),
      ledgerTitle: "Ledger Lines",
      ledgerRows: ledgerRowsForControl(row),
      auditTitle: "Audit Trail",
      auditRows: auditRowsForControl(row)
    });
    notify("Control drilldown opened");
    scrollToSection(".voucher-detail-panel", false);
  }

  async function handleDrilldownInlineAction(action, reason) {
    try {
      if (action.actionType === "reverse") {
        const voucherId = action.voucherId;
        if (!voucherId) throw new Error("No voucher ID available for reversal");
        await api.reverseVoucher(voucherId, reason);
        notify("Voucher reversed successfully. A reversal voucher was created.");
        setDrilldown(null);
        load();
      } else if (action.actionType === "unallocate_receipt") {
        const allocationId = action.allocationId;
        if (!allocationId) throw new Error("No allocation ID available");
        await api.unallocateReceiptAllocation(allocationId, reason);
        notify("Receipt allocation removed. Outstanding balance updated.");
        setDrilldown(null);
        load();
      } else if (action.actionType === "unallocate_supplier") {
        const allocationId = action.allocationId;
        if (!allocationId) throw new Error("No allocation ID available");
        await api.unallocateSupplierPaymentAllocation(allocationId, reason);
        notify("Supplier payment allocation removed. Balance due updated.");
        setDrilldown(null);
        load();
      } else if (action.actionType === "reverse_advance") {
        const adjustmentId = action.adjustmentId;
        if (!adjustmentId) throw new Error("No adjustment ID available");
        await api.reverseAdvanceAdjustment(adjustmentId, reason, null);
        notify("Advance adjustment reversed.");
        setDrilldown(null);
        load();
      }
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function closeYearFromPrompt() {
    if (!companyContext?.company_id) {
      notify("Select Current Company before closing a financial year", "error");
      return;
    }
    const openYears = data?.financialYears || [];
    if (openYears.length < 2) {
      notify("At least two financial years are required", "error");
      return;
    }
    const from = openYears[1] || openYears[0];
    const to = openYears[0];
    const confirmed = await confirmAction({
      mode: "warning",
      title: "Close Financial Year",
      message: "Closing the financial year will restrict posting and editing for this period. Do you want to continue?",
      confirmLabel: "Yes, Close Year",
      cancelLabel: "No, Cancel",
      moduleName: "financial_years",
      recordId: from.id
    });
    if (!confirmed.confirmed) return;
    try {
      await api.closeFinancialYear({ company_id: companyContext.company_id, from_financial_year_id: from.id, to_financial_year_id: to.id });
      notify("Year-end closing completed");
      load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function createFinancialYearFromPrompt() {
    if (!companyContext?.company_id) {
      notify("Select Current Company before creating a financial year", "error");
      return;
    }
    const name = window.prompt("Financial year name (example: FY 2027-28)");
    if (!name) return;
    const start = window.prompt("Start date (YYYY-MM-DD)");
    const end = window.prompt("End date (YYYY-MM-DD)");
    if (!start || !end) return;
    try {
      await api.createFinancialYear({ company_id: companyContext.company_id, financial_year_name: name, start_date: start, end_date: end, status: "Open" });
      notify("Financial year created");
      load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function openOpeningBalancePanel() {
    if (!companyContext?.company_id) {
      notify("Select Current Company before posting opening balance", "error");
      return;
    }
    const year = data?.financialYears?.find((row) => row.status === "Open");
    const account = data?.accounts?.[0];
    if (!year || !account) {
      notify("Open financial year and account are required", "error");
      return;
    }
    const amount = Number(window.prompt(`Opening debit amount for ${account.account_name}`) || 0);
    if (amount <= 0) return;
    const confirmed = await confirmAction({
      ...postConfirmOptions("opening_balances", account.id),
      message: "Do you want to post this opening balance? Once posted, it may affect trial balance and financial statements."
    });
    if (!confirmed.confirmed) return;
    try {
      await api.createOpeningBalance({
        company_id: companyContext?.company_id || filters.company_id,
        financial_year_id: year.id,
        balance_type: "Account",
        account_id: account.id,
        opening_debit: amount,
        opening_credit: 0,
        remarks: "Opening balance entered from control screen"
      });
      notify("Opening balance voucher posted");
      load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <section className="panel settings-panel report-panel">
      <ReportToolbar title={config.title} note={`${rows.length} row(s)`} className="accounting-toolbar">
          <ReportDateFilters
            companyId={filters.company_id}
            companies={data?.companies || []}
            dateFrom={filters.date_from}
            dateTo={filters.date_to}
            onCompanyChange={(company_id) => setFilters((prev) => ({ ...prev, company_id }))}
            onDateFromChange={(date_from) => setFilters((prev) => ({ ...prev, date_from }))}
            onDateToChange={(date_to) => setFilters((prev) => ({ ...prev, date_to }))}
            onPresetChange={(date_from, date_to) => setFilters((prev) => ({ ...prev, date_from, date_to }))}
          />
          <ReportActionButtons onExport={() => exportRows(config.title, rows)} onPrint={requestPrintPreview} />
          {view === "financial_years" && <button className="ghost-btn" onClick={createFinancialYearFromPrompt} disabled={!canManagePeriods}>New FY</button>}
          {view === "opening_balances" && <button className="ghost-btn" onClick={openOpeningBalancePanel} disabled={!canPostControls} data-action-key="opening_balances.add_opening">Add Opening</button>}
          {view === "year_end_closing" && <button className="ghost-btn" onClick={closeYearFromPrompt} disabled={!canManagePeriods}>Close Year</button>}
      </ReportToolbar>
      {view === "financial_control" && <FinancialControlOverview data={data || {}} onDrill={openFinancialControlDrill} />}
      {["financial_years", "year_end_closing", "carry_forward", "opening_balances"].includes(view) && <LockedYearControlNotice data={data || {}} />}
      {readOnlyReportFamily ? (
        <ReadOnlyReportFamilyTable
          view={view}
          data={data || {}}
          config={config}
          rows={rows}
          onDrillAccount={(row) => openDrilldown(row, "account")}
          onDrillVoucher={(row) => openDrilldown(row, "voucher")}
          onDrillSource={(row) => openDrilldown(row, "source")}
          onPartyReconciliationDrill={openPartyReconciliationDrill}
          onNavigate={onNavigate}
        />
      ) : isAccountingControlPanelView ? (
        <AccountingControlReportTable
          config={config}
          rows={rows}
          formatCell={formatCell}
          canApproveControls={canApproveControls}
          canPostControls={canPostControls}
          handlePostingAction={handlePostingAction}
          openFinancialControlDrill={openFinancialControlDrill}
        />
      ) : rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{config.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id || row.account_code || row.voucher_line_id || index}>
                  {config.columns.map((column) => (
                    <td key={column.key}>
                      {column.type === "actions" && view === "day_book" ? (
                        <div className="row-actions">
                          <button className="icon-btn" type="button" title="View voucher lines" onClick={() => setSelectedVoucher(row)}>
                            <Icon name="file" />
                          </button>
                          <button className="icon-btn danger" type="button" title="Reverse voucher" onClick={() => handleReverse(row)} disabled={row.status === "Reversed" || row.source_module === "voucher_reversal"}>
                            <Icon name="undo" />
                          </button>
                        </div>
                      ) : column.type === "drill_account" ? (
                        <button className="ghost-btn small-btn" type="button" onClick={() => openDrilldown(row, "account")}>Ledger</button>
                      ) : column.type === "drill_voucher" ? (
                        <button className="ghost-btn small-btn" type="button" onClick={() => openDrilldown(row, "voucher")}>Voucher</button>
                      ) : column.type === "drill_source" ? (
                        <button className="ghost-btn small-btn" type="button" onClick={() => openDrilldown(row, "source")} disabled={!row.source_module || !row.source_id}>Source</button>
                      ) : column.type === "posting_actions" ? (
                        <div className="row-actions">
                          <button type="button" title={canApproveControls ? "Approve" : "Approval requires approver role"} onClick={() => handlePostingAction("approve", row)} disabled={!canApproveControls || row.approval_status === "Approved" || row.posting_status === "Posted"}><Icon name="shield" /></button>
                          <button type="button" title={canPostControls ? "Post" : "Posting requires accounting role"} onClick={() => handlePostingAction("post", row)} disabled={!canPostControls || row.posting_status === "Posted" || row.posting_status === "Reversed"}><Icon name="receipt" /></button>
                          <button type="button" title={row.retry_available === "Yes" ? "Retry safe failed posting" : "Retry only appears for failed posting records"} onClick={() => handlePostingAction("retry", row)} disabled={!canPostControls || row.retry_available !== "Yes"}><Icon name="undo" /></button>
                          <button type="button" title="View Error" onClick={() => handlePostingAction("error", row)} disabled={!row.posting_error}><Icon name="file" /></button>
                          <button type="button" title="Control drilldown" onClick={() => openFinancialControlDrill(row)}><Icon name="grid" /></button>
                        </div>
                      ) : column.type === "fy_actions" ? (
                        <div className="row-actions">
                          <button type="button" title={canManagePeriods ? "Close year" : "Financial year action requires approver role"} onClick={() => handleFinancialYearStatus(row, "Closed")} disabled={!canManagePeriods || row.status !== "Open"}><Icon name="lock" /></button>
                          <button type="button" title={canManagePeriods ? "Reopen year" : "Financial year action requires approver role"} onClick={() => handleFinancialYearStatus(row, "Open")} disabled={!canManagePeriods || row.status === "Open"}><Icon name="undo" /></button>
                          <button type="button" title={canManagePeriods ? "Lock year" : "Financial year action requires approver role"} onClick={() => handleFinancialYearStatus(row, "Locked")} disabled={!canManagePeriods || row.status === "Locked"}><Icon name="shield" /></button>
                          <button type="button" title="Control drilldown" onClick={() => openFinancialControlDrill(row)}><Icon name="grid" /></button>
                        </div>
                      ) : column.type === "allocation_actions" ? (
                        <div className="row-actions">
                          <button type="button" title="Unallocate / reallocate" onClick={() => handleAllocationAction(view === "payment_allocations" ? "receipt" : "supplier", row)}>
                            <Icon name="undo" />
                          </button>
                        </div>
                      ) : column.type === "party_reconciliation_actions" ? (
                        <div className="row-actions">
                          <button type="button" title="Drill into ledger and sub-ledger rows" onClick={() => openPartyReconciliationDrill(row)}>
                            <Icon name="file" />
                          </button>
                        </div>
                      ) : column.type === "control_drill" ? (
                        <button className="ghost-btn small-btn" type="button" onClick={() => openFinancialControlDrill(row)}>Drill</button>
                      ) : column.type === "advance_adjustment_actions" ? (
                        <div className="row-actions">
                          <button type="button" title="Reverse adjustment" onClick={() => handleAdvanceAdjustmentReverse(row)} disabled={row.status === "Reversed"}>
                            <Icon name="undo" />
                          </button>
                        </div>
                      ) : formatCell(row[column.key], column.type)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="No accounting data" note="Post vouchers or run seed data to populate this view." />}
      {allocationCorrection && (
        <div className="voucher-detail-panel">
          <div className="panel-head">
            <div>
              <h3>{allocationCorrection.kind === "receipt" ? "Receipt Allocation Correction" : "Supplier Payment Allocation Correction"}</h3>
              <p>Use this controlled workflow to unallocate or reallocate without editing posted accounting entries directly.</p>
            </div>
            <button className="ghost-btn" type="button" onClick={() => setAllocationCorrection(null)}>Close</button>
          </div>
          <div className="workflow-note">
            <strong>{allocationCorrection.kind === "receipt" ? allocationCorrection.row.receipt_voucher : allocationCorrection.row.payment_voucher}</strong>
            <span>
              Current allocation: {formatCurrency(Number(allocationCorrection.row.allocated_amount || 0))}
              {allocationCorrection.kind === "receipt" ? ` | TDS ${formatCurrency(Number(allocationCorrection.row.tds_deducted || 0))} | GST TDS ${formatCurrency(Number(allocationCorrection.row.gst_tds_deducted || 0))}` : ""}
              {allocationCorrection.row.allocation_status ? <span className="badge" style={{ marginLeft: 8 }}>{allocationCorrection.row.allocation_status}</span> : null}
            </span>
            <small>Reason is mandatory and the action is written to allocation audit. {allocationCorrection.kind === "receipt" ? "Unallocation restores the invoice balance and removes the receipt-invoice link." : "Unallocation restores the purchase bill balance and removes the payment-bill link."}</small>
          </div>
          <form className="form-grid" onSubmit={submitAllocationCorrection}>
            <SelectBox
              label="Correction Action"
              value={allocationCorrectionForm.action}
              onChange={(action) => setAllocationCorrectionForm((current) => ({ ...current, action }))}
              options={[
                ["unallocate", "Unallocate only"],
                ["reallocate", "Reallocate to another invoice / bill"]
              ]}
            />
            {allocationCorrectionForm.action === "reallocate" && (
              <>
                <SelectBox
                  label={allocationCorrection.kind === "receipt" ? "Target Invoice" : "Target Purchase Bill"}
                  value={allocationCorrectionForm.target_id}
                  onChange={(target_id) => setAllocationCorrectionForm((current) => ({ ...current, target_id }))}
                  options={allocationTargetOptions(allocationCorrection.kind, data || {})}
                />
                <Field
                  label="Allocated Amount"
                  type="number"
                  value={allocationCorrectionForm.allocated_amount}
                  onChange={(allocated_amount) => setAllocationCorrectionForm((current) => ({ ...current, allocated_amount }))}
                />
                {allocationCorrection.kind === "receipt" && (
                  <>
                    <Field
                      label="TDS Deducted"
                      type="number"
                      value={allocationCorrectionForm.tds_deducted}
                      onChange={(tds_deducted) => setAllocationCorrectionForm((current) => ({ ...current, tds_deducted }))}
                    />
                    <Field
                      label="GST TDS Deducted"
                      type="number"
                      value={allocationCorrectionForm.gst_tds_deducted}
                      onChange={(gst_tds_deducted) => setAllocationCorrectionForm((current) => ({ ...current, gst_tds_deducted }))}
                    />
                    <Field
                      label="Other Deductions"
                      type="number"
                      value={allocationCorrectionForm.other_deductions}
                      onChange={(other_deductions) => setAllocationCorrectionForm((current) => ({ ...current, other_deductions }))}
                    />
                  </>
                )}
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={allocationCorrectionForm.allow_excess}
                    onChange={(event) => setAllocationCorrectionForm((current) => ({ ...current, allow_excess: event.target.checked }))}
                  />
                  Allow excess allocation after review
                </label>
              </>
            )}
            <Field
              label="Correction Reason"
              type="textarea"
              value={allocationCorrectionForm.reason}
              onChange={(reason) => setAllocationCorrectionForm((current) => ({ ...current, reason }))}
            />
            <div className="form-actions">
              <button className="ghost-btn" type="button" onClick={() => setAllocationCorrection(null)}>Cancel</button>
              <button className="primary-btn" type="submit">
                {allocationCorrectionForm.action === "reallocate" ? "Confirm Reallocation" : "Confirm Unallocation"}
              </button>
            </div>
          </form>
        </div>
      )}
      {view === "day_book" && selectedVoucher && (
        <div className="voucher-detail-panel">
          <div>
            <h3>{selectedVoucher.voucher_number} - {selectedVoucher.voucher_type}</h3>
            <p>{selectedVoucher.narration || "No narration"}</p>
          </div>
          <div className="table-wrap compact-table">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Debit</th>
                  <th>Credit</th>
                  <th>Narration</th>
                </tr>
              </thead>
              <tbody>
                {voucherLines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.account_code} - {line.account_name}</td>
                    <td>{formatCurrency(Number(line.debit || 0))}</td>
                    <td>{formatCurrency(Number(line.credit || 0))}</td>
                    <td>{line.narration || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {drilldown && <DrilldownPanel drilldown={drilldown} onClose={() => setDrilldown(null)} onNavigate={onNavigate} onInlineAction={handleDrilldownInlineAction} notify={notify} onDrillVoucher={(row) => openDrilldown(row, "voucher")} />}
    </section>
  );
}

function DrilldownPanel({ drilldown, onClose, onNavigate, onInlineAction, notify, onDrillVoucher }) {
  const voucher = drilldown.voucher;
  const source = drilldown.source;
  const actions = buildDrilldownActions(drilldown);
  const [inlineAction, setInlineAction] = useState(null);
  const [inlineReason, setInlineReason] = useState("");
  const [inlineLoading, setInlineLoading] = useState(false);

  function openAction(action) {
    if (action.disabled) return;
    if (action.inlineAction) {
      setInlineAction(action);
      setInlineReason("");
      return;
    }
    if (!action.view || !onNavigate) return;
    onNavigate(action.view);
    onClose?.();
  }

  async function submitInlineAction() {
    if (!inlineAction) return;
    const action = inlineAction;
    const reason = inlineReason.trim();
    if (["reverse", "unallocate_receipt", "unallocate_supplier"].includes(action.actionType) && !reason) {
      if (typeof notify === "function") notify("Reason is required for this correction action", "error");
      return;
    }
    setInlineLoading(true);
    try {
      if (onInlineAction) {
        await onInlineAction(action, reason);
      }
      setInlineAction(null);
      setInlineReason("");
    } catch (error) {
      if (typeof notify === "function") notify(error.message, "error");
    } finally {
      setInlineLoading(false);
    }
  }

  function cancelInlineAction() {
    setInlineAction(null);
    setInlineReason("");
  }

  function workflowNoteForMode(mode) {
    const row = drilldown.sourceRow || {};
    if (mode === "control_evidence") {
      return {
        status: row.status || "Review",
        message: row.blocking_reason || "Review linked source, voucher, ledger and audit evidence.",
        action: row.recommended_action || ""
      };
    }
    if (mode === "party_reconciliation") {
      return {
        status: row.status || "Review",
        message: row.possible_issue || "Check linked entries and allocations.",
        action: row.recommended_action || ""
      };
    }
    if (drilldown.ledger?.length) {
      const statusText = (voucher?.header?.status || "").toLowerCase();
      if (statusText === "posted") {
        return { status: "Posted (Locked)", message: "This voucher is posted and locked from direct editing.", action: "Use reversal workflow or create a correction voucher to adjust." };
      }
      if (statusText === "reversed") {
        return { status: "Reversed", message: "This voucher has been reversed. No further corrections are possible on this record.", action: "Review the reversal voucher or source records for context." };
      }
    }
    return { status: "Review", message: "Review ledger, voucher and source transaction below.", action: "Use Action Center to inspect, correct or allocate." };
  }

  const note = workflowNoteForMode(drilldown.mode);

  const inlineForm = inlineAction ? (
    <div className="source-box" style={{ border: "2px solid #d9534f", background: "#fff5f5" }}>
      <h3>{inlineAction.actionType === "reverse" ? "Reverse Voucher" : "Unallocation Confirmation"}</h3>
      <p>{inlineAction.description}</p>
      <div className="field-row">
        <label>Reason for {inlineAction.actionType === "reverse" ? "reversal" : "unallocation"}</label>
        <textarea
          value={inlineReason}
          onChange={(e) => setInlineReason(e.target.value)}
          placeholder={inlineAction.actionType === "reverse" ? "Enter the reason for reversing this posted voucher" : "Enter the reason for removing this allocation"}
          rows={2}
          disabled={inlineLoading}
        />
      </div>
      <div className="button-row">
        <button type="button" className="danger-btn" onClick={submitInlineAction} disabled={inlineLoading}>
          {inlineLoading ? "Processing..." : inlineAction.actionType === "reverse" ? "Yes, Reverse Voucher" : "Yes, Unallocate"}
        </button>
        <button type="button" className="ghost-btn" onClick={cancelInlineAction} disabled={inlineLoading}>Cancel</button>
      </div>
    </div>
  ) : null;

  if (drilldown.mode === "control_evidence") {
    return (
      <div className="voucher-detail-panel reconciliation-drill-panel">
        <div className="panel-head">
          <div>
            <h3>{drilldown.title}</h3>
            <p>{drilldown.sourceRow?.status_reason || "Financial control evidence and audit trace"}</p>
          </div>
          <button className="ghost-btn" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="workflow-note">
          <strong>{note.status}</strong>
          <span>{note.message}</span>
          {note.action ? <small>{note.action}</small> : null}
        </div>
        <DrilldownActionCenter actions={actions} onAction={openAction} />
        {inlineForm}
        <ReconciliationDrillTable title={drilldown.sourceTitle} rows={drilldown.sourceRows} />
        <ReconciliationDrillTable title={drilldown.voucherTitle} rows={drilldown.voucherRows} />
        <ReconciliationDrillTable title={drilldown.ledgerTitle} rows={drilldown.ledgerRows} />
        <ReconciliationDrillTable title={drilldown.auditTitle} rows={drilldown.auditRows} />
      </div>
    );
  }
  if (drilldown.mode === "party_reconciliation") {
    return (
      <div className="voucher-detail-panel reconciliation-drill-panel">
        <div className="panel-head">
          <div>
            <h3>{drilldown.title}</h3>
            <p>{drilldown.sourceRow?.check_scope || "Ledger and sub-ledger reconciliation evidence"}</p>
          </div>
          <button className="ghost-btn" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="workflow-note">
          <strong>{note.status}</strong>
          <span>{note.message}</span>
          {note.action ? <small>{note.action}</small> : null}
        </div>
        <DrilldownActionCenter actions={actions} onAction={openAction} />
        {inlineForm}
        <ReconciliationDrillTable title={drilldown.ledgerTitle} rows={drilldown.ledgerRows} />
        <ReconciliationDrillTable title={drilldown.subledgerTitle} rows={drilldown.subledgerRows} />
        <ReconciliationDrillTable title={drilldown.relatedTitle} rows={drilldown.relatedRows} />
      </div>
    );
  }
  return (
    <div className="voucher-detail-panel">
      <div className="panel-head">
        <div>
          <h3>{drilldown.title}</h3>
          <p>Ledger, voucher and source transaction drilldown</p>
        </div>
        <button className="ghost-btn" type="button" onClick={onClose}>Close</button>
      </div>
      <div className="workflow-note">
        <strong>{note.status}</strong>
        <span>{note.message}</span>
        {note.action ? <small>{note.action}</small> : null}
      </div>
      <DrilldownActionCenter actions={actions} onAction={openAction} />
      {inlineForm}
      {drilldown.ledger?.length ? (
        <div className="table-wrap compact-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Voucher</th>
                <th>Type</th>
                <th>Particulars</th>
                <th>Debit</th>
                <th>Credit</th>
                <th>Running</th>
                <th>Source</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {drilldown.ledger.map((row) => (
                <tr key={row.id}>
                  <td>{row.entry_date}</td>
                  <td>{row.voucher_number}</td>
                  <td>{row.voucher_type}</td>
                  <td>{row.narration || row.account_name}</td>
                  <td>{formatCurrency(Number(row.debit || 0))}</td>
                  <td>{formatCurrency(Number(row.credit || 0))}</td>
                  <td>{formatCurrency(Number(row.running_balance || 0))}</td>
                  <td>{row.source_module || "-"}</td>
                  <td>
                    <button className="ghost-btn small-btn" type="button" onClick={() => onDrillVoucher?.(row)} title="Open voucher drilldown">Voucher</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {voucher?.header && (
        <div className="drilldown-grid">
          <div>
            <h3>{voucher.header.voucher_number}</h3>
            <p>{voucher.header.voucher_date} | {voucher.header.voucher_type} | {voucher.header.status}</p>
            <p>{voucher.header.narration || "No narration"}</p>
          </div>
          <div>
            <strong>{voucher.header.company_name}</strong>
            <p>{voucher.header.financial_year_name || "No financial year"}</p>
            <p>{voucher.header.source_module || "-"} #{voucher.header.source_id || "-"}</p>
          </div>
        </div>
      )}
      {voucher?.lines?.length ? (
        <div className="table-wrap compact-table">
          <table>
            <thead><tr><th>Account</th><th>Debit</th><th>Credit</th><th>Narration</th></tr></thead>
            <tbody>
              {voucher.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.account_code} - {line.account_name}</td>
                  <td>{formatCurrency(Number(line.debit || 0))}</td>
                  <td>{formatCurrency(Number(line.credit || 0))}</td>
                  <td>{line.narration || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {source && (
        <div className="source-box">
          <h3>Source Transaction</h3>
          <p>{source.source_module} {source.record?.invoice_number || source.record?.purchase_invoice_number || source.record?.utr_number || source.record?.id || source.source_id}</p>
          <p>Order: {source.order?.order_number || "-"}</p>
          <p>Posting: {source.record?.posting_status || source.linkedVoucher?.status || "-"}</p>
          <p>Documents: {source.documents?.length || 0}</p>
        </div>
      )}
      {voucher?.audit?.length ? (
        <div className="source-box">
          <h3>Audit History</h3>
          {voucher.audit.slice(0, 5).map((row) => <p key={row.id}>{row.created_at} - {row.action}</p>)}
        </div>
      ) : null}
    </div>
  );
}


function buildDrilldownActions(drilldown) {
  const voucher = drilldown.voucher?.header || drilldown.source?.linkedVoucher || {};
  const source = drilldown.source || {};
  const record = source.record || drilldown.sourceRow || {};
  const sourceModule = source.source_module || record.source_module || record.module || record.module_name || "";
  const sourceView = viewForSourceModule(sourceModule);
  const statusInfo = drilldownStatusInfo(voucher, record);
  const voucherExists = Boolean(voucher?.voucher_number || voucher?.id || record?.voucher_number || record?.voucher_id);
  const isPosted = (String(voucher?.status || record?.posting_status || "").toLowerCase().includes("posted"));
  const isReversed = (String(voucher?.status || record?.status || "").toLowerCase().includes("reversed"));
  const voucherId = voucher?.id || record?.voucher_id;
  const actions = [];

  if (sourceView) {
    actions.push({
      group: "Source Record",
      label: "Open Source Record",
      view: sourceView,
      description: "Review the original transaction screen."
    });
    actions.push({
      group: "Source Record",
      label: "Edit Source Record",
      view: sourceView,
      tone: statusInfo.locked ? "blocked" : "warning",
      disabled: statusInfo.locked,
      description: statusInfo.locked ? "Locked after posting" : "Open source screen and use permitted edit controls.",
      reason: statusInfo.locked ? statusInfo.reason : ""
    });
  }

  if (voucherExists) {
    actions.push({
      group: "Voucher Correction",
      label: "Open Voucher Register",
      view: "voucher_register",
      description: "Trace posted voucher and line entries."
    });
    actions.push({
      group: "Voucher Correction",
      label: "Open Reversal Workflow",
      view: "reversal_voucher",
      tone: "danger",
      description: "Use reversal for posted vouchers; reason is required inside the workflow."
    });
    if (isPosted && !isReversed && voucherId) {
      actions.push({
        group: "Voucher Correction",
        label: "Reverse Voucher (Inline)",
        view: "",
        inlineAction: true,
        actionType: "reverse",
        voucherId,
        tone: "danger",
        description: "Reverse this posted voucher directly. A reason is required."
      });
    }
  } else {
    actions.push({
      group: "Voucher Correction",
      label: "Create Correction Voucher",
      view: "manual_voucher",
      tone: "warning",
      description: "Create a controlled journal only after source review."
    });
  }

  const moduleText = String(sourceModule || voucher.source_module || voucher.voucher_type || drilldown.title || "").toLowerCase();
  const isSalesContext = moduleText.includes("sale") || moduleText.includes("billing") || moduleText.includes("invoice") || moduleText.includes("receivable");
  const isPurchaseContext = moduleText.includes("purchase") || moduleText.includes("supplier") || moduleText.includes("payable") || moduleText.includes("procurement");

  if (isSalesContext) {
    actions.push({
      group: "Commercial Correction",
      label: "Open Credit Note",
      view: "business_credit_note",
      tone: "warning",
      description: "Use for sales/invoice reduction correction."
    });
    actions.push({
      group: "Allocation",
      label: "Review Receipt Allocation",
      view: "receipt_allocation_workflow",
      description: "Check receipt application against invoices."
    });
  }
  if (isPurchaseContext) {
    actions.push({
      group: "Commercial Correction",
      label: "Open Debit Note",
      view: "business_debit_note",
      tone: "warning",
      description: "Use for purchase/supplier correction."
    });
    actions.push({
      group: "Allocation",
      label: "Review Supplier Allocation",
      view: "supplier_allocation_workflow",
      description: "Check supplier payment application."
    });
  }

  if (drilldown.mode === "party_reconciliation") {
    actions.push(
      { group: "Allocation", label: "Receipt Allocation", view: "receipt_allocation_workflow", description: "Review customer/dept receipt allocation." },
      { group: "Allocation", label: "Supplier Allocation", view: "supplier_allocation_workflow", description: "Review supplier bill allocation." },
      { group: "Allocation", label: "Party Ledger", view: "party_ledger", description: "Compare party ledger movement." }
    );
  }

  if (drilldown.mode === "control_evidence") {
    actions.push(
      { group: "Financial Control", label: "Posting Queue", view: "posting_control", description: "Review blocking and retry status." },
      { group: "Financial Control", label: "Approval Queue", view: "approval_queue", description: "Review approval state and reasons." },
      { group: "Financial Control", label: "Controls Dashboard", view: "financial_control", description: "Review control health." }
    );
  }

  actions.push(
    { group: "Evidence", label: "General Ledger", view: "ledger_view", description: "Trace account movement." },
    { group: "Evidence", label: "Documents", view: "documents", description: "Attach or review supporting documents." },
    { group: "Evidence", label: "Audit Log", view: "audit_log", description: "Review historical actions and reasons." }
  );

  return dedupeDrilldownActions(actions);
}

function drilldownStatusInfo(voucher, record) {
  const statusText = [voucher?.status, voucher?.posting_status, record?.status, record?.posting_status, record?.status_display]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (statusText.includes("reversed")) {
    return { locked: true, reason: "Reversed records cannot be edited directly. Use correction workflow.", nextAction: "Open Reversal Workflow or create a correction voucher to adjust balances." };
  }
  if (statusText.includes("posted")) {
    return { locked: true, reason: "Posted records cannot be edited directly. Use reversal or correction workflow.", nextAction: "Reverse the posted voucher, or create a credit/debit note for commercial corrections." };
  }
  if (statusText.includes("closed") || statusText.includes("locked")) {
    return { locked: true, reason: "Financial year is closed or locked. Posting and editing are restricted.", nextAction: "Open a new financial year or unlock current year from Financial Control if permitted." };
  }
  if (statusText.includes("draft")) {
    return { locked: false, reason: "Record is in draft state. Review and post when ready.", nextAction: "Review entries and post the transaction when complete." };
  }
  if (statusText.includes("approved")) {
    return { locked: true, reason: "Approved records are locked from direct editing pending posting.", nextAction: "Post the approved transaction, or use approval queue to reverse if needed." };
  }
  return { locked: false, reason: "", nextAction: "" };
}

function viewForSourceModule(sourceModule) {
  const key = String(sourceModule || "").toLowerCase().replaceAll(" ", "_");
  const map = {
    billing: "invoices",
    invoice: "invoices",
    invoices: "invoices",
    sales: "invoices",
    procurement: "procurements",
    procurements: "procurements",
    purchase: "procurements",
    payment: "payments",
    payments: "payments",
    receipt: "payments",
    expense: "expenses",
    expenses: "expenses",
    expense_entries: "expenses",
    supplier_payment: "supplier_allocation_workflow",
    supplier_payments: "supplier_allocation_workflow",
    bank_statement_import: "bank_reconciliation",
    bank_statement_entries: "bank_reconciliation",
    voucher_proposals: "voucher_proposal_queue",
    stock_inward: "stock_inwards",
    stock_inwards: "stock_inwards",
    stock_outward: "stock_outwards",
    stock_outwards: "stock_outwards",
    stock_adjustment: "stock_adjustments",
    stock_adjustments: "stock_adjustments",
    warehouse_transfer: "warehouse_transfers",
    warehouse_transfers: "warehouse_transfers",
    supply_order: "supply_orders",
    supply_orders: "supply_orders"
  };
  return map[key] || "";
}

function dedupeDrilldownActions(actions) {
  const seen = new Set();
  return actions.filter((action) => {
    const key = `${action.group}-${action.label}-${action.view || ""}-${action.disabled ? "disabled" : "active"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ReconciliationDrillTable({ title, rows = [] }) {
  const visibleRows = rows.slice(0, 25);
  const keys = visibleRows.length
    ? Object.keys(visibleRows[0]).filter((key) => !["id", "company_id", "is_deleted", "deleted_at", "deleted_by"].includes(key)).slice(0, 8)
    : [];
  return (
    <div className="source-box">
      <h3>{title}</h3>
      {visibleRows.length ? (
        <div className="table-wrap compact-table">
          <table>
            <thead><tr>{keys.map((key) => <th key={key}>{key.replaceAll("_", " ")}</th>)}</tr></thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={row.id || index}>
                  {keys.map((key) => <td key={key}>{typeof row[key] === "number" ? formatNumber(row[key]) : row[key] || "-"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="No rows found" note="No linked rows are currently available for this drilldown." />}
      {rows.length > visibleRows.length ? <p className="hint">Showing first {visibleRows.length} of {rows.length} rows. Use export for full review.</p> : null}
    </div>
  );
}

function formatCell(value, type) {
  if (type === "money") return formatCurrency(Number(value || 0));
  return value ?? "-";
}


function VoucherProposalScreen({ view, notify, role, companyContext }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [review, setReview] = useState({});
  const canReview = roleAllowsAction(role, "voucher");
  const canApprove = roleAllowsAction(role, "approve");
  const canPost = roleAllowsAction(role, "voucher");

  async function load() {
    setLoading(true);
    try {
      const result = await api.getVoucherProposals(companyContext);
      setData(result);
      const first = result.proposals?.[0] || null;
      if (!selected && first) selectProposal(first);
    } catch (error) {
      notify(error.message || "Voucher proposals failed to load", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [companyContext?.company_id, companyContext?.company_scope]);

  function selectProposal(row) {
    setSelected(row);
    setReview({
      suggested_voucher_type: row.suggested_voucher_type || "Receipt",
      suggested_party_type: row.suggested_party_type || "",
      suggested_party_id: row.suggested_party_id || "",
      suggested_party_name: row.suggested_party_name || "",
      suggested_ledger_id: row.suggested_ledger_id || "",
      suggested_ledger_name: row.suggested_ledger_name || "",
      linked_invoice_id: row.linked_invoice_id || "",
      linked_procurement_id: row.linked_procurement_id || "",
      linked_order_id: row.linked_order_id || "",
      narration: row.narration || "",
      remarks: row.remarks || ""
    });
  }

  async function runAction(action) {
    if (!selected) {
      notify("Select a proposal first", "error");
      return;
    }
    if (["save", "draft", "post"].includes(action) && !canPost) {
      notify("Your role cannot create or post voucher proposal records", "error");
      return;
    }
    if (["approve", "reject"].includes(action) && !canApprove) {
      notify("Your role cannot approve or reject voucher proposals", "error");
      return;
    }
    try {
      let result;
      if (action === "save") result = await api.updateVoucherProposal(selected.id, review);
      if (action === "approve") {
        const confirmed = await confirmAction(approveConfirmOptions("voucher_proposals", selected.id));
        if (!confirmed.confirmed) return;
        result = await api.approveVoucherProposal(selected.id, null, review.remarks);
      }
      if (action === "reject") {
        const confirmed = await confirmAction({
          mode: "danger",
          title: "Reject Voucher Proposal",
          message: "Do you want to reject this voucher proposal?",
          confirmLabel: "Yes, Proceed",
          cancelLabel: "No, Cancel",
          requireReason: true,
          reasonLabel: "Reason for rejection",
          reasonPlaceholder: review.remarks || "Enter rejection reason",
          moduleName: "voucher_proposals",
          recordId: selected.id
        });
        if (!confirmed.confirmed) return;
        result = await api.rejectVoucherProposal(selected.id, null, confirmed.reason);
      }
      if (action === "draft") result = await api.createDraftVoucherFromProposal(selected.id, null);
      if (action === "post") {
        const confirmed = await confirmAction({
          ...postConfirmOptions("voucher_proposals", selected.id),
          message: "Post this draft voucher? This will affect ledger, trial balance, party ledgers and bank book."
        });
        if (!confirmed.confirmed) return;
        result = await api.postDraftVoucherFromProposal(selected.id, null);
      }
      setData(result);
      const refreshed = result.proposals.find((row) => Number(row.id) === Number(selected.id)) || result.proposals[0] || null;
      if (refreshed) selectProposal(refreshed);
      notify(action === "post" ? "Draft voucher posted" : `Proposal ${action} completed`);
    } catch (error) {
      notify(error.message || "Proposal action failed", "error");
    }
  }

  if (loading) return <PhasePanel title="Loading Voucher Proposal Queue" note="Reading controlled bank-to-voucher proposals." />;

  const proposals = data?.proposals || [];
  const reportRows = proposalRowsForView(view, proposals, data?.audit || []);
  const selectedAudit = selected ? (data?.audit || []).filter((row) => Number(row.proposal_id) === Number(selected.id)) : [];
  if (view !== "voucher_proposal_queue") {
    return (
      <section className="panel settings-panel report-panel">
        <ReportToolbar title={viewTitles[view]?.[0] || "Voucher Proposal Report"} note={`${reportRows.length} row(s)`}>
          <ReportActionButtons
            exportLabel="Export CSV"
            onExport={() => exportRows(viewTitles[view]?.[0] || "voucher-proposals", reportRows)}
            onPrint={requestPrintPreview}
          />
        </ReportToolbar>
        <VoucherProposalTable rows={reportRows} onSelect={selectProposal} reportOnly />
      </section>
    );
  }

  return (
    <div className="grid-two">
      <section className="panel settings-panel">
        <div className="panel-head">
          <div>
            <h2>Accounting Control Dashboard</h2>
            <p>Bank entries become accounting only after proposal approval, draft voucher creation and posting.</p>
          </div>
        </div>
        <div className="metric-grid compact-metrics">
          <Metric label="Pending" value={data?.dashboard?.pendingProposals || 0} note="Suggested / review" icon="file" />
          <Metric label="Approved" value={data?.dashboard?.approvedPendingPosting || 0} note="Pending draft/post" icon="shield" />
          <Metric label="Rejected" value={data?.dashboard?.rejectedProposals || 0} note="Stopped" icon="undo" />
          <Metric label="Posted" value={data?.dashboard?.postedProposals || 0} note="Ledger impact" icon="receipt" />
          <Metric label="Duplicates" value={data?.dashboard?.duplicateBankEntries || 0} note="Blocked rows" icon="grid" />
          <Metric label="Unmatched" value={data?.dashboard?.unmatchedEntries || 0} note="Needs review" icon="wallet" />
        </div>
        <div className="records-toolbar">
          <div>
            <h2>Voucher Proposal Queue</h2>
            <span>{proposals.length} proposal(s)</span>
          </div>
          <ReportActionButtons onExport={() => exportRows("voucher-proposal-queue", proposals)} />
        </div>
        <VoucherProposalTable rows={proposals} selectedId={selected?.id} onSelect={selectProposal} />
      </section>

      <section className="panel settings-panel">
        <div className="panel-head">
          <div>
            <h2>Proposal Review</h2>
            <p>{selected ? `Proposal #${selected.id} - ${selected.status}` : "Select a proposal to review."}</p>
          </div>
          {selected && <span className={`status ${normalizeStatusClass(selected.status)}`}>{selected.status}</span>}
        </div>
        {selected ? (
          <>
            <div className="metric-grid compact-metrics">
              <Metric label="Debit" value={formatCurrency(selected.debit || 0)} note="Bank debit" icon="wallet" />
              <Metric label="Credit" value={formatCurrency(selected.credit || 0)} note="Bank credit" icon="receipt" />
              <Metric label="Confidence" value={`${selected.confidence_score || 0}%`} note="Matching score" icon="trend" />
              <Metric label="Draft" value={selected.draft_voucher_number || "-"} note={selected.draft_voucher_status || "No draft"} icon="file" />
            </div>
            <div className="mini-panel">
              <h3>Control Status</h3>
              <p><strong>Status reason:</strong> {selected.status_reason || proposalControlMeta(selected).status_reason}</p>
              <p><strong>Blocking reason:</strong> {selected.blocking_reason || proposalControlMeta(selected).blocking_reason}</p>
              <p><strong>Recommended action:</strong> {selected.recommended_action || proposalControlMeta(selected).recommended_action}</p>
            </div>
            <div className="form-grid">
              <label>
                Voucher Type
                <select value={review.suggested_voucher_type} onChange={(event) => setReview({ ...review, suggested_voucher_type: event.target.value })}>
                  {["Receipt", "Advance Receipt", "Customer Receipt", "Other Income Receipt", "Payment", "Supplier Payment", "Expense Payment", "Bank Charges", "Contra"].map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
              <label>
                Party Type
                <select value={review.suggested_party_type} onChange={(event) => setReview({ ...review, suggested_party_type: event.target.value })}>
                  <option value="">No party</option>
                  <option>Department</option>
                  <option>Supplier</option>
                </select>
              </label>
              <label>
                Party
                <select value={review.suggested_party_id} onChange={(event) => {
                  const list = review.suggested_party_type === "Supplier" ? data.suppliers : data.departments;
                  const party = (list || []).find((item) => String(item.id) === event.target.value);
                  setReview({ ...review, suggested_party_id: event.target.value, suggested_party_name: party?.supplier_name || party?.department_name || "" });
                }}>
                  <option value="">No party selected</option>
                  {((review.suggested_party_type === "Supplier" ? data.suppliers : data.departments) || []).map((item) => <option key={item.id} value={item.id}>{item.supplier_name || item.department_name}</option>)}
                </select>
              </label>
              <label>
                Ledger Account
                <select value={review.suggested_ledger_id} onChange={(event) => {
                  const account = (data.accounts || []).find((item) => String(item.id) === event.target.value);
                  setReview({ ...review, suggested_ledger_id: event.target.value, suggested_ledger_name: account?.account_name || "" });
                }}>
                  <option value="">Default ledger</option>
                  {(data.accounts || []).map((account) => <option key={account.id} value={account.id}>{account.account_code} - {account.account_name}</option>)}
                </select>
              </label>
              <label>
                Invoice ID
                <input value={review.linked_invoice_id} onChange={(event) => setReview({ ...review, linked_invoice_id: event.target.value })} />
              </label>
              <label>
                Purchase Bill ID
                <input value={review.linked_procurement_id} onChange={(event) => setReview({ ...review, linked_procurement_id: event.target.value })} />
              </label>
              <label>
                Order ID
                <input value={review.linked_order_id} onChange={(event) => setReview({ ...review, linked_order_id: event.target.value })} />
              </label>
              <label>
                Remarks
                <input value={review.remarks} onChange={(event) => setReview({ ...review, remarks: event.target.value })} />
              </label>
            </div>
            <label>
              Narration
              <textarea value={review.narration} onChange={(event) => setReview({ ...review, narration: event.target.value })} />
            </label>
            <div className="button-row">
              <button className="ghost-btn" type="button" onClick={() => runAction("save")} disabled={!canReview || ["Draft Voucher Created", "Posted"].includes(selected.status)}>Save Review</button>
              <button className="ghost-btn" type="button" onClick={() => runAction("approve")} disabled={!canApprove || !["Suggested", "Needs Review", "Approved"].includes(selected.status)}>Approve</button>
              <button className="ghost-btn danger" type="button" onClick={() => runAction("reject")} disabled={!canApprove || selected.status === "Posted"}>Reject</button>
              <button className="primary-btn" type="button" onClick={() => runAction("draft")} disabled={!canPost || selected.status !== "Approved"}>Create Draft Voucher</button>
              <button className="primary-btn" type="button" onClick={() => runAction("post")} disabled={!canPost || selected.status !== "Draft Voucher Created"}>Post Draft</button>
            </div>
            <div className="mini-panel">
              <h3>Accounting Safety</h3>
              <p>Suggested, reviewed, approved and draft vouchers do not affect trial balance. Ledger, party ledger and bank book update only after Post Draft.</p>
            </div>
            <ReconciliationDrillTable title="Proposal Source and Voucher Links" rows={[selected]} />
            <ReconciliationDrillTable title="Proposal Audit Trail" rows={selectedAudit} />
          </>
        ) : <EmptyState title="No proposal selected" note="Generate proposals from an approved bank statement import." />}
      </section>
    </div>
  );
}

function proposalControlMeta(row) {
  const status = row?.status || "Suggested";
  if (status === "Posted") return { status_reason: "Posted voucher is linked and has ledger impact", blocking_reason: "Posted proposals cannot be edited directly", recommended_action: "Review posted voucher, ledger and audit trail" };
  if (status === "Draft Voucher Created") return { status_reason: "Draft voucher exists but is not posted", blocking_reason: "Posting is pending final review", recommended_action: "Review draft voucher and post only if safe" };
  if (status === "Approved") return { status_reason: "Proposal approved by checker", blocking_reason: "Draft voucher creation is pending", recommended_action: "Create draft voucher, then review before posting" };
  if (status === "Rejected") return { status_reason: "Proposal rejected and stopped", blocking_reason: row?.rejection_reason || row?.remarks || "Rejection reason not recorded", recommended_action: "Review rejection reason and source bank entry" };
  if (status === "Needs Review") return { status_reason: "Maker review changed or confirmed proposal mapping", blocking_reason: "Checker approval is pending", recommended_action: "Approve, reject or correct the proposal mapping" };
  return { status_reason: "Auto-suggested from approved bank statement", blocking_reason: Number(row?.confidence_score || 0) < 70 ? "Low confidence score requires manual review" : "Manual review is pending", recommended_action: "Review party, ledger, source links and narration" };
}

function proposalRowsForView(view, proposals, audit) {
  if (view === "pending_proposal_report") return proposals.filter((row) => ["Suggested", "Needs Review"].includes(row.status));
  if (view === "approved_proposal_report") return proposals.filter((row) => ["Approved", "Draft Voucher Created"].includes(row.status));
  if (view === "rejected_proposal_report") return proposals.filter((row) => row.status === "Rejected");
  if (view === "posted_bank_voucher_report") return proposals.filter((row) => row.status === "Posted");
  if (view === "proposal_audit_report") return audit.map((row) => ({ ...row, transaction_date: row.created_at, narration: row.action, status: row.remarks || row.new_value || "-" }));
  return proposals;
}


function BankStatementScreen({ view, notify, companyContext }) {
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ company_id: companyContext?.company_id || "", bank_id: "", bank_name: "Generic Format", file_name: "", remarks: "" });
  const [mapping, setMapping] = useState({});
  const [selectedImportId, setSelectedImportId] = useState("");

  async function load(filters = {}) {
    setLoading(true);
    try {
      const effectiveFilters = { ...filters, company_id: companyContext?.company_id || form.company_id || filters.company_id };
      const result = await api.getBankStatementData(effectiveFilters);
      setData(result);
      const activeImport = filters.import_id || result.imports?.[0]?.id || "";
      setSelectedImportId(activeImport ? String(activeImport) : "");
      setForm((current) => ({
        ...current,
        company_id: companyContext?.company_id || current.company_id || "",
        bank_id: current.bank_id || result.banks?.[0]?.id || ""
      }));
    } catch (error) {
      notify(error.message || "Bank reconciliation data failed to load", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load({ company_id: companyContext?.company_id });
  }, [companyContext?.company_id, companyContext?.company_scope]);

  async function handleFile(file) {
    if (!file) return;
    try {
      const parsed = await parseUploadFile(file);
      setRows(parsed);
      setPreview(null);
      setMapping({});
      setForm((current) => ({ ...current, file_name: file.name }));
      notify(`${parsed.length} bank rows loaded for preview`);
    } catch (error) {
      notify(error.message || "Bank statement file could not be read", "error");
    }
  }

  async function handleDesktopFile() {
    try {
      const selected = await api.selectImportFile();
      if (!selected) return;
      const parsed = await api.parseImportFile(selected.path);
      setRows(parsed);
      setPreview(null);
      setMapping({});
      setForm((current) => ({ ...current, file_name: selected.name }));
      notify(`${parsed.length} bank rows loaded from desktop file`);
    } catch (error) {
      notify(error.message || "Desktop bank statement file could not be read", "error");
    }
  }

  async function runPreview() {
    if (!rows.length) {
      notify("Upload a bank statement first", "error");
      return;
    }
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before previewing a bank import.");
      const result = await api.previewBankImport({ ...form, company_id: companyContext.company_id, rows, mapping });
      setPreview(result);
      setMapping(result.mapping || {});
      notify("Bank statement preview ready");
    } catch (error) {
      notify(error.message || "Preview failed", "error");
    }
  }

  async function saveDraft() {
    if (!preview?.rows?.length) await runPreview();
    const sourceRows = preview?.rows?.length ? rows : rows;
    if (!sourceRows.length) return;
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before saving a bank import.");
      const result = await api.createBankImport({ ...form, company_id: companyContext.company_id, rows: sourceRows, mapping });
      setData(result);
      setPreview(null);
      setRows([]);
      setSelectedImportId(result.imports?.[0]?.id ? String(result.imports[0].id) : "");
      notify("Bank statement saved as Draft. It has not affected accounting.");
    } catch (error) {
      notify(error.message || "Bank import failed", "error");
    }
  }

  async function changeStatus(status) {
    if (!selectedImportId) {
      notify("Select an import batch first", "error");
      return;
    }
    if (status === "Approved") {
      const confirmed = await confirmAction({
        mode: "warning",
        title: "Approve Bank Statement Import",
        message: "Approving this statement will allow reconciliation and bank book creation. Do you want to continue?",
        confirmLabel: "Yes, Approve",
        cancelLabel: "No, Cancel",
        moduleName: "bank_imports",
        recordId: selectedImportId
      });
      if (!confirmed.confirmed) return;
    }
    try {
      const result = await api.updateBankImportStatus(Number(selectedImportId), status, null, form.remarks);
      setData(result);
      notify(`Bank statement marked ${status}`);
    } catch (error) {
      notify(error.message || "Status update failed", "error");
    }
  }

  async function generateProposals() {
    if (!selectedImportId) {
      notify("Select an approved import first", "error");
      return;
    }
    const confirmed = await confirmAction({
      mode: "warning",
      title: "Generate Voucher Proposals",
      message: "Generate voucher proposals for this approved statement? No vouchers will be posted.",
      confirmLabel: "Yes, Proceed",
      cancelLabel: "No, Cancel",
      moduleName: "bank_imports",
      recordId: selectedImportId
    });
    if (!confirmed.confirmed) return;
    try {
      await api.generateVoucherProposals(Number(selectedImportId), null);
      await load({ import_id: selectedImportId });
      notify("Voucher proposals generated. Review them in Voucher Proposal Queue.");
    } catch (error) {
      notify(error.message || "Proposal generation failed", "error");
    }
  }

  async function manualMatch(entry) {
    const moduleName = window.prompt("Match module: vouchers, invoices, payments, supplier_payments, procurements, supply_orders", entry.matched_module || "payments");
    if (!moduleName) return;
    const recordId = Number(window.prompt("Record ID to link", entry.matched_record_id || ""));
    if (!recordId) return;
    const confirmed = await confirmAction({
      mode: "warning",
      title: "Manual Bank Match",
      message: "Do you want to manually match this bank entry? Reconciliation reports may be affected.",
      confirmLabel: "Yes, Proceed",
      cancelLabel: "No, Cancel",
      moduleName: "bank_entries",
      recordId: entry.id
    });
    if (!confirmed.confirmed) return;
    try {
      await api.manualBankEntryMatch(entry.id, { matched_module: moduleName, matched_record_id: recordId, confidence_score: 100 });
      await load({ import_id: selectedImportId });
      notify("Bank entry manually matched");
    } catch (error) {
      notify(error.message || "Manual match failed", "error");
    }
  }

  if (loading) return <PhasePanel title="Loading bank reconciliation" note="Reading imported statement rows and matching queues." />;
  if (view === "unmatched_bank_entries") {
    return (
      <>
        <SummaryTable title="Unmatched Receipts" rows={data?.unmatchedReceipts || []} columns={["transaction_date", "amount", "utr", "narration", "match_status"]} />
        <SummaryTable title="Unmatched Payments" rows={data?.unmatchedPayments || []} columns={["transaction_date", "amount", "utr", "narration", "match_status"]} />
      </>
    );
  }
  if (view === "duplicate_bank_entries") return <SummaryTable title="Duplicate Bank Entries" rows={data?.duplicates || []} columns={["transaction_date", "amount", "utr", "narration", "validation_errors"]} />;
  if (view === "imported_statement_report") return <SummaryTable title="Imported Statement Report" rows={(data?.imports || []).map((row) => ({ ...row, name: `${row.bank_name} / ${row.source_file_name || `Import #${row.id}`}` }))} columns={["status", "posting_status", "total_rows", "valid_rows", "duplicate_rows", "error_rows", "imported_at"]} />;

  const previewRows = preview?.rows || [];
  const entries = data?.entries || [];
  const selectedImport = (data?.imports || []).find((item) => String(item.id) === String(selectedImportId));
  const headers = Object.keys(rows[0] || {});

  return (
    <div className="grid-two">
      <section className="panel settings-panel">
        <h2>Bank Statement Upload</h2>
        <p className="muted">Imported rows remain operational review data until approved. They do not create vouchers automatically.</p>
        <label>
          Company
          <select value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value })}>
            {(data?.companies || []).map((company) => <option key={company.id} value={company.id}>{company.company_name}</option>)}
          </select>
        </label>
        <label>
          Bank Account
          <select value={form.bank_id} onChange={(event) => setForm({ ...form, bank_id: event.target.value })}>
            <option value="">No bank selected</option>
            {(data?.banks || []).map((bank) => <option key={bank.id} value={bank.id}>{bank.bank_account_name} - {bank.bank_name}</option>)}
          </select>
        </label>
        <label>
          Bank Format
          <select value={form.bank_name} onChange={(event) => setForm({ ...form, bank_name: event.target.value })}>
            {["SBI", "HDFC", "ICICI", "Axis", "Generic Format"].map((bank) => <option key={bank}>{bank}</option>)}
          </select>
        </label>
        <label>
          Upload XLSX / XLS / CSV
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => handleFile(event.target.files?.[0])} />
        </label>
        <button className="ghost-btn" type="button" onClick={handleDesktopFile}>Browse Desktop File</button>
        <label>
          Remarks
          <textarea value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} />
        </label>
        <div className="button-row">
          <button className="ghost-btn" type="button" onClick={runPreview}>Preview</button>
          <button className="primary-btn" type="button" onClick={saveDraft}>Save Draft Import</button>
        </div>
        {headers.length > 0 && (
          <div className="mini-panel">
            <h3>Column Mapping</h3>
            {["transaction_date", "narration", "debit", "credit", "balance", "utr", "reference_number", "cheque_number"].map((target) => (
              <label key={target}>
                {target.replaceAll("_", " ")}
                <select value={mapping[target] || ""} onChange={(event) => setMapping({ ...mapping, [target]: event.target.value })}>
                  <option value="">Auto / Not mapped</option>
                  {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="panel settings-panel">
        <div className="records-toolbar">
          <div>
            <h2>Import Review</h2>
            <span>{selectedImport ? `${selectedImport.status} / ${selectedImport.posting_status}` : "No import selected"}</span>
          </div>
          <select value={selectedImportId} onChange={(event) => { setSelectedImportId(event.target.value); load({ import_id: event.target.value }); }}>
            {(data?.imports || []).map((item) => <option key={item.id} value={item.id}>#{item.id} {item.bank_name} - {item.source_file_name}</option>)}
          </select>
        </div>
        <div className="metric-grid compact-metrics">
          <Metric label="Rows" value={preview?.totalRows ?? selectedImport?.total_rows ?? 0} note="Imported" icon="file" />
          <Metric label="Valid" value={preview?.validRows ?? selectedImport?.valid_rows ?? 0} note="Ready" icon="shield" />
          <Metric label="Duplicates" value={preview?.duplicateRows ?? selectedImport?.duplicate_rows ?? 0} note="Blocked" icon="undo" />
          <Metric label="Errors" value={preview?.errorRows ?? selectedImport?.error_rows ?? 0} note="Fix before approval" icon="receipt" />
        </div>
        <div className="button-row">
          <button className="ghost-btn" type="button" onClick={() => changeStatus("Ready for Review")}>Ready for Review</button>
          <button className="ghost-btn" type="button" onClick={() => changeStatus("Approved")}>Approve</button>
          <button className="ghost-btn danger" type="button" onClick={() => changeStatus("Rejected")}>Reject</button>
          <button className="primary-btn" type="button" onClick={generateProposals}>Generate Proposals</button>
        </div>
        <BankRowsTable rows={previewRows.length ? previewRows : entries} onMatch={manualMatch} />
      </section>

      {view === "bank_reconciliation" && (
        <section className="panel settings-panel wide-panel">
          <div className="records-toolbar">
            <div>
              <h2>Reconciliation Matches</h2>
              <span>{data?.matches?.length || 0} match row(s)</span>
            </div>
            <ReportActionButtons onExport={() => exportRows("bank-reconciliation", data?.matches || [])} />
          </div>
          <BankRowsTable rows={data?.matches || []} matchReport />
        </section>
      )}
    </div>
  );
}

function groupRows(rows, key, build) {
  const groups = new Map();
  rows.forEach((row) => {
    const name = row[key] || "Unassigned";
    groups.set(name, [...(groups.get(name) || []), row]);
  });
  return [...groups.entries()].map(([name, items]) => ({ name, ...build(items) })).sort((a, b) => (b.profit || 0) - (a.profit || 0));
}

function daysSince(date) {
  if (!date) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(`${date}T00:00:00`).getTime()) / 86400000));
}

function validateForm(config, form) {
  const primary = config.primary;
  if (!String(form[primary] || "").trim()) {
    throw new Error(`${config.fields.find(([name]) => name === primary)[1]} is required`);
  }
  if ("mobile_number" in form && form.mobile_number && !/^[0-9+\-\s]{8,15}$/.test(form.mobile_number)) {
    throw new Error("Enter a valid mobile number");
  }
  if ("gstin" in form && form.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(form.gstin).toUpperCase())) {
    throw new Error("Enter a valid GSTIN");
  }
  if ("supplier_bank_ifsc_code" in form && form.supplier_bank_ifsc_code && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(form.supplier_bank_ifsc_code).toUpperCase())) {
    throw new Error("Enter a valid supplier bank IFSC code");
  }
  if ("gst_rate" in form && Number(form.gst_rate) < 0) {
    throw new Error("GST rate cannot be negative");
  }
  if ("incentive_percentage" in form && Number(form.incentive_percentage) < 0) {
    throw new Error("Incentive percentage cannot be negative");
  }
}

function createInitialTemplateFieldMap(template, rows) {
  const detected = Object.keys(rows[0] || {});
  return Object.fromEntries((template.columns || []).map((column) => {
    const normalizedColumn = normalizeImportHeader(column);
    const match = detected.find((field) => normalizeImportHeader(field) === normalizedColumn);
    return [column, match || ""];
  }));
}

function mapTemplateRows(rows, template, fieldMap) {
  return rows.map((row) => Object.fromEntries((template.columns || []).map((column) => {
    const key = normalizeImportHeader(column);
    const mappedField = fieldMap[column];
    return [key, mappedField ? row[mappedField] ?? "" : row[key] ?? ""];
  })));
}

function validateStagedTemplateRows(template, rows) {
  const result = { totalRows: rows.length, successfulRows: 0, failedRows: 0, skippedDuplicates: 0, updatedRows: 0, errors: [] };
  const seen = new Set();
  rows.forEach((row, index) => {
    const errors = [];
    const rowNumber = index + 1;
    const value = (field) => String(row[normalizeImportHeader(field)] ?? "").trim();

    template.required.forEach((field) => {
      if (!value(field)) errors.push(`${field} is required`);
    });

    if (value("gstin") && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value("gstin"))) {
      errors.push("GSTIN format is invalid");
    }
    if (value("pan") && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value("pan"))) {
      errors.push("PAN format is invalid");
    }
    ["gst_rate", "purchase_rate", "sales_rate", "opening_balance", "opening_stock_qty", "opening_stock_value", "amount"].forEach((field) => {
      if (value(field) && !Number.isFinite(Number(value(field)))) errors.push(`${field} must be numeric`);
    });
    if (value("opening_balance") && !["debit", "credit"].includes(value("opening_balance_type").toLowerCase())) {
      errors.push("opening_balance_type must be Debit or Credit when opening balance is present");
    }
    if (template.id === "tally_ledger_mapping" && !value("erp_account_group")) {
      errors.push("erp_account_group is required for ledger mapping");
    }
    if (template.id === "tally_voucher_mapping") {
      const knownTypes = new Set(["sales", "purchase", "receipt", "payment", "journal", "contra", "credit note", "debit note"]);
      if (value("tally_voucher_type") && !knownTypes.has(value("tally_voucher_type").toLowerCase()) && !value("erp_voucher_type")) {
        errors.push("Unknown Tally voucher type requires erp_voucher_type mapping");
      }
    }

    const duplicateKey = template.duplicateKeys.map((field) => value(field).toLowerCase()).filter(Boolean).join("|");
    if (duplicateKey) {
      if (seen.has(duplicateKey)) {
        result.skippedDuplicates += 1;
        result.errors.push({ row: rowNumber, status: "Duplicate", errors: ["Duplicate key in uploaded template"] });
        return;
      }
      seen.add(duplicateKey);
    }

    if (errors.length) {
      result.failedRows += 1;
      result.errors.push({ row: rowNumber, status: "Failed", errors });
      return;
    }
    result.successfulRows += 1;
  });
  return result;
}

function downloadXlsx(fileName, rows) {
  const bytes = buildXlsxBytes(rows);
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function buildXlsxBytes(rows) {
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, cellIndex) => {
    const ref = `${excelColumnName(cellIndex)}${rowIndex + 1}`;
    return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
  }).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Template" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", sheetXml]
  ];
  return buildZip(files.map(([name, content]) => [name, new TextEncoder().encode(content)]));
}

function excelColumnName(index) {
  let name = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  files.forEach(([fileName, data]) => {
    const nameBytes = encoder.encode(fileName);
    const crc = crc32(data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  });
  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  return concatBytes([...localParts, ...centralParts, end]);
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function downloadErrorReport(table, errors) {
  const csv = ["row,status,errors", ...errors.map((item) => [item.row, item.status, `"${item.errors.join("; ").replaceAll('"', '""')}"`].join(","))].join("\n");
  downloadText(`${table}-import-errors.csv`, csv);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function parseUploadFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (file.path) return api.parseImportFile(file.path);
  if (extension === "xlsx") {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    return api.parseImportBuffer(file.name, bytes);
  }
  if (extension === "csv") return parseCsvText(await file.text());
  if (extension === "xls") return parseLegacyXlsText(await file.text());
  throw new Error("Only CSV, XLS and XLSX files are supported for import");
}

function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const headers = splitCsvLine(lines.shift() || "").map((header) => header.trim().toLowerCase().replaceAll(" ", "_"));
  return lines.map((line) => Object.fromEntries(splitCsvLine(line).map((cell, index) => [headers[index], cell.trim()])));
}

function parseLegacyXlsText(text) {
  const clean = text.replace(/\0/g, "");
  if (/<table|<tr|<td/i.test(clean)) {
    const rows = [];
    for (const rowMatch of clean.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [];
      for (const cellMatch of rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
        cells.push(decodeXmlBrowser(cellMatch[1].replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ")).trim());
      }
      if (cells.some(Boolean)) rows.push(cells);
    }
    return matrixToRows(rows);
  }
  if (clean.includes("\t")) return matrixToRows(clean.split(/\r?\n/).map((line) => line.split("\t").map((cell) => cell.trim())).filter((row) => row.some(Boolean)));
  return parseCsvText(clean);
}

function matrixToRows(matrix) {
  const headerIndex = matrix.findIndex((row) => row.some((cell) => /date|narration|debit|credit|balance|utr|reference|cheque/i.test(cell)));
  const sourceRows = headerIndex >= 0 ? matrix.slice(headerIndex) : matrix;
  const headers = (sourceRows.shift() || []).map(normalizeImportHeader);
  const entries = headers.map((header, index) => [header, index]).filter(([header]) => header);
  return sourceRows.map((cells) => Object.fromEntries(entries.map(([header, index]) => [header, cells[index] ?? ""])));
}

function splitCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  cells.push(value);
  return cells;
}

async function parseXlsxBufferBrowser(arrayBuffer) {
  const files = await unzipXlsxBrowser(arrayBuffer);
  const decoder = new TextDecoder();
  const sharedStrings = parseSharedStringsBrowser(files.get("xl/sharedStrings.xml") ? decoder.decode(files.get("xl/sharedStrings.xml")) : "");
  const workbook = files.get("xl/workbook.xml") ? decoder.decode(files.get("xl/workbook.xml")) : "";
  const rels = files.get("xl/_rels/workbook.xml.rels") ? decoder.decode(files.get("xl/_rels/workbook.xml.rels")) : "";
  const firstSheetId = /<sheet[^>]*r:id="([^"]+)"/.exec(workbook)?.[1];
  const target = firstSheetId ? new RegExp(`<Relationship[^>]*Id="${firstSheetId}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] : "worksheets/sheet1.xml";
  const sheetPath = `xl/${(target || "worksheets/sheet1.xml").replace(/^\/xl\//, "")}`;
  const sheetBytes = files.get(sheetPath) || files.get("xl/worksheets/sheet1.xml");
  if (!sheetBytes) throw new Error("No worksheet found in XLSX file");
  const sheetXml = decoder.decode(sheetBytes);
  const matrix = [];
  for (const rowMatch of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = /r="([A-Z]+)(\d+)"/.exec(attrs)?.[1] || "";
      const colIndex = excelColumnIndexBrowser(ref);
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] || /<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] || "";
      const value = type === "s" ? sharedStrings[Number(raw)] || "" : decodeXmlBrowser(raw);
      row[colIndex] = value;
    }
    if (row.some((cell) => String(cell || "").trim())) matrix.push(row.map((cell) => String(cell || "").trim()));
  }
  const headerIndex = matrix.findIndex((row) => {
    const normalized = row.map(normalizeImportHeader);
    return normalized.includes("supplier_name") ||
      normalized.includes("beneficiary_account_name") ||
      normalized.includes("item_name") ||
      normalized.includes("order_number") ||
      normalized.includes("company_name");
  });
  const sourceRows = headerIndex >= 0 ? matrix.slice(headerIndex) : matrix;
  const headers = (sourceRows.shift() || []).map(normalizeImportHeader);
  const entries = headers.map((header, index) => [header, index]).filter(([header]) => header);
  return sourceRows.map((cells) => Object.fromEntries(entries.map(([header, index]) => [header, cells[index] ?? ""])));
}

async function unzipXlsxBrowser(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const files = new Map();
  const eocd = findEndOfCentralDirectoryBrowser(view);
  const centralDirectoryOffset = view.getUint32(eocd + 16, true);
  const entries = view.getUint16(eocd + 10, true);
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entries; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    files.set(name, method === 0 ? compressed : await inflateRawBrowser(compressed));
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return files;
}

function findEndOfCentralDirectoryBrowser(view) {
  for (let index = view.byteLength - 22; index >= 0; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) return index;
  }
  throw new Error("Invalid XLSX file");
}

async function inflateRawBrowser(bytes) {
  if (!("DecompressionStream" in window)) throw new Error("XLSX decompression is not supported in this browser. Use the desktop file picker.");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function parseSharedStringsBrowser(xml) {
  return [...xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((match) => decodeXmlBrowser([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join("")));
}

function excelColumnIndexBrowser(column) {
  return column.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function decodeXmlBrowser(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function normalizeImportHeader(value) {
  return String(value || "").trim().toLowerCase().replaceAll(" ", "_");
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
