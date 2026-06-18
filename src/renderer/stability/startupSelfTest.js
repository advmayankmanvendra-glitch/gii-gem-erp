import { flatNavItems, viewTitles } from "../config/navigation.js";
import { safeArray, safeObject } from "./rendererStabilityUtils.js";

const REQUIRED_PRELOAD_METHODS = [
  "getDashboardCounts",
  "listRecords",
  "getReferences",
  "getHealthDiagnostics",
  "runHealthChecks",
  "exportSupportBundle"
];

export function runStartupSelfTest({
  apiClient,
  companyContext,
  currentView,
  hasDashboardRoute,
  hasHealthCenterRoute,
  helpers = {}
} = {}) {
  const api = safeObject(apiClient);
  const context = safeObject(companyContext);
  const helperMap = safeObject(helpers);
  const navItems = safeArray(flatNavItems);
  const checks = [];
  const addCheck = (id, label, passed, severity, details, recommendation) => {
    checks.push({
      id,
      label,
      status: passed ? "pass" : severity === "warning" ? "warn" : "fail",
      severity: passed ? "normal" : severity,
      details,
      recommendation
    });
  };

  addCheck(
    "preload-api",
    "Preload API availability",
    REQUIRED_PRELOAD_METHODS.every((name) => typeof api[name] === "function"),
    "critical",
    "Required renderer API methods are checked before normal operation.",
    "Open ERP Health Center or restart the desktop app if any preload API is missing."
  );

  REQUIRED_PRELOAD_METHODS.forEach((name) => {
    addCheck(
      `preload-api-${name}`,
      `Preload API: ${name}`,
      typeof api[name] === "function",
      "critical",
      typeof api[name] === "function" ? "Available." : "Missing from renderer API contract.",
      "Review preload/API wiring before using this screen."
    );
  });

  addCheck(
    "company-context",
    "Company context availability",
    Boolean(context.company_scope === "all" || context.company_id || context.company_name),
    "warning",
    context.company_name || "No active company context detected.",
    "Select or create a company before entering transactions."
  );

  addCheck(
    "dashboard-route",
    "Dashboard route availability",
    Boolean(hasDashboardRoute ?? navItems.some((item) => item.key === "dashboard")),
    "critical",
    "Dashboard route is required for recovery navigation.",
    "Restore the dashboard route before continuing."
  );

  addCheck(
    "health-center-route",
    "Health Center route availability",
    Boolean(hasHealthCenterRoute ?? navItems.some((item) => item.key === "health_center")),
    "critical",
    "Health Center route is required for recovery guidance.",
    "Restore the Health Center route before continuing."
  );

  addCheck(
    "view-title",
    "Current view title availability",
    Boolean(viewTitles[currentView]?.[0] || currentView),
    "warning",
    currentView ? `Current view: ${currentView}` : "No current view key detected.",
    "Use Dashboard or Safe Mode if screen title metadata is missing."
  );

  ["productivityScopeForView", "helpForView"].forEach((name) => {
    addCheck(
      `helper-${name}`,
      `Renderer helper: ${name}`,
      typeof helperMap[name] === "function",
      "critical",
      typeof helperMap[name] === "function" ? "Available." : "Missing helper can break productivity/help panels.",
      "Open Safe Mode and review recent renderer crash details."
    );
  });

  const failed = checks.filter((item) => item.status === "fail");
  const warnings = checks.filter((item) => item.status === "warn");
  return {
    generatedAt: new Date().toISOString(),
    status: failed.length ? "fail" : warnings.length ? "warn" : "pass",
    checks,
    summary: {
      pass: checks.filter((item) => item.status === "pass").length,
      warn: warnings.length,
      fail: failed.length
    }
  };
}
