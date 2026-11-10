import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { dashboardCounts, initializeDatabase } from "../src/main/database/init.js";
import { MODE_CARDS } from "../src/renderer/features/dashboards/dashboardConfig.js";
import { dashboardFilters, getPeriodRange } from "../src/renderer/features/dashboards/dashboardService.js";
import { routeAliases, viewTitles } from "../src/renderer/config/navigation.js";

let passed = 0;
let failed = 0;
let db;
let fixtureRoot;

function check(name, condition, detail = "") {
  const status = condition ? "PASS" : "FAIL";
  if (condition) passed += 1;
  else failed += 1;
  console.log(`${status}: ${name}${detail ? ` - ${detail}` : ""}`);
}

function source(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function sameNumber(left, right) {
  return Math.abs(Number(left || 0) - Number(right || 0)) <= 0.01;
}

function localDate(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

try {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gii-dashboard-wiring-"));
  db = initializeDatabase(fixtureRoot);

  const cards = Object.values(MODE_CARDS).flat();
  const valueKeys = [...new Set(cards.map((card) => card.valueKey).filter(Boolean))].sort();
  const routeKeys = [...new Set(cards.flatMap((card) => [card.target, card.drilldownTarget, card.reconcileTarget]).filter(Boolean))].sort();
  const activeCompanies = db.prepare("SELECT id FROM companies WHERE status = 'active' AND COALESCE(is_deleted, 0) = 0 ORDER BY id").all();
  const fullRange = { date_from: "1900-01-01", date_to: "2999-12-31" };
  const noDataRange = { date_from: "1800-01-01", date_to: "1800-12-31" };
  const allCounts = dashboardCounts(db, fullRange);
  const noDataCounts = dashboardCounts(db, noDataRange);

  check("Dashboard fixture has an active company", activeCompanies.length > 0, `${activeCompanies.length} active company record(s)`);
  check("Every configured Dashboard value key is returned", valueKeys.every((key) => Object.hasOwn(allCounts, key)), valueKeys.filter((key) => !Object.hasOwn(allCounts, key)).join(", ") || `${valueKeys.length} keys covered`);
  check("Every numeric Dashboard value is finite", valueKeys.filter((key) => !["balanceSheetStatus", "trialBalanceStatus"].includes(key)).every((key) => Number.isFinite(Number(allCounts[key]))));
  check("Trial Balance status is governed", ["Balanced", "Mismatch"].includes(allCounts.trialBalanceStatus), String(allCounts.trialBalanceStatus));
  check("Balance Sheet status is governed", ["Balanced", "Mismatch"].includes(allCounts.balanceSheetStatus), String(allCounts.balanceSheetStatus));

  const periodKeys = ["totalOrders", "activeOrders", "totalOrderValue", "amountReceived", "totalProfit", "itemsIssued", "returnedItems", "postedVouchers"];
  check("Date filters reach period-sensitive Dashboard values", periodKeys.every((key) => Number(noDataCounts[key] || 0) === 0), JSON.stringify(Object.fromEntries(periodKeys.map((key) => [key, noDataCounts[key]]))));

  const companyCounts = activeCompanies.map((company) => dashboardCounts(db, { company_id: company.id, ...fullRange }));
  const additiveKeys = [
    "totalOrders", "activeOrders", "totalOrderValue", "amountReceived", "outstanding", "totalProfit",
    "supplierPayables", "pendingProcurement", "pendingSupply", "pendingBilling", "pendingDocuments",
    "pendingDeliveries", "cracPending", "cracGenerated", "paymentReadyOrders", "readyForClosure",
    "unpostedVouchers", "draftVouchers", "postedVouchers", "pendingApprovals", "gstPayable",
    "tdsReceivable", "profitLoss", "cashBankBalance"
  ];
  check(
    "All-companies Dashboard equals active-company totals",
    additiveKeys.every((key) => sameNumber(allCounts[key], companyCounts.reduce((sum, row) => sum + Number(row[key] || 0), 0))),
    additiveKeys.filter((key) => !sameNumber(allCounts[key], companyCounts.reduce((sum, row) => sum + Number(row[key] || 0), 0))).join(", ") || `${additiveKeys.length} additive values reconciled`
  );

  check("Every Dashboard card route resolves", routeKeys.every((key) => Object.hasOwn(viewTitles, key) || Object.hasOwn(routeAliases, key)), routeKeys.filter((key) => !Object.hasOwn(viewTitles, key) && !Object.hasOwn(routeAliases, key)).join(", ") || `${routeKeys.length} routes covered`);

  const preload = source("src/preload/preload.cjs");
  const main = source("src/main/main.js");
  const rendererService = source("src/renderer/features/dashboards/dashboardService.js");
  const dashboardScreen = source("src/renderer/screens/DashboardScreen.jsx");
  check("Dashboard count API is exposed through preload", preload.includes('getDashboardCounts: (filters) => ipcRenderer.invoke("dashboard:counts", filters)'));
  check("Dashboard count IPC handler exists in main", /(ipcMain\.handle|\bhandle)\("dashboard:counts"/.test(main));
  check("Accounting read API is exposed through preload", preload.includes('getAccountingData: (filters) => ipcRenderer.invoke("accounting:data", filters)'));
  check("Treasury no longer depends on an unexposed bank-ledger API", !rendererService.includes("getBankLedgers"));
  check("Renderer passes selected dates to Dashboard API", rendererService.includes("filters.date_from") && rendererService.includes("filters.date_to"));
  const now = new Date();
  const currentQuarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const expectedQuarterStart = new Date(currentQuarterStart.getFullYear(), currentQuarterStart.getMonth() - 3, 1);
  const expectedQuarterEnd = new Date(currentQuarterStart.getFullYear(), currentQuarterStart.getMonth(), 0, 23, 59, 59, 999);
  const lastQuarter = getPeriodRange("last_quarter");
  const lastQuarterFilters = dashboardFilters({ company_id: 1 }, lastQuarter);
  check(
    "Last Quarter resolves to the immediately preceding quarter",
    lastQuarter.start.getTime() === expectedQuarterStart.getTime()
      && lastQuarter.end.getTime() === expectedQuarterEnd.getTime()
      && lastQuarterFilters.date_from === localDate(expectedQuarterStart)
      && lastQuarterFilters.date_to === localDate(expectedQuarterEnd),
    `${lastQuarterFilters.date_from} to ${lastQuarterFilters.date_to}`
  );
  check("Comparison data is loaded and rendered", rendererService.includes("comparisonCounts") && dashboardScreen.includes("comparisonData={comparisonData}"));
  check("Auto Refresh has a governed timer", dashboardScreen.includes("window.setInterval(refreshData, 60000)") && dashboardScreen.includes("DASHBOARD_AUTO_REFRESH_KEY"));
  check("Widget order preference uses object storage", dashboardScreen.includes("safeObject(readJsonPreference(DASHBOARD_WIDGET_ORDER_KEY, {}))"));
  check("Fresh-profile widget customization starts from mode defaults", dashboardScreen.includes("defaultHiddenCardIds(dashboardMode)") && dashboardScreen.includes("dashboardMode in safe ? safeArray(safe[dashboardMode])"));

  const packageJson = JSON.parse(source("package.json"));
  const packagedFiles = packageJson.build?.files || [];
  const packagedResources = packageJson.build?.extraResources || [];
  check("Packaged renderer, main process, and preload are included", ["dist", "src/main", "src/preload"].every((entry) => packagedFiles.includes(entry)));
  check("Packaged seed database resource is included", packagedResources.some((entry) => entry.from === "database/gii_gem_erp.db" && entry.to === "database/gii_gem_erp.db"));
} catch (error) {
  check("Dashboard wiring verifier completed", false, error?.stack || error?.message || String(error));
} finally {
  if (db?.open) db.close();
  if (fixtureRoot) fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log(`\nDashboard wiring verification: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
