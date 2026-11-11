/**
 * RG-1 Renderer Dependency Graph Builder v2.0.0 (Enhanced)
 *
 * Scans src/renderer/ and builds:
 *   - renderer-graph.json   (machine-readable, with ownership, criticality, workflow, AI metadata)
 *   - renderer-graph.md     (human-readable with heat map, evolution map)
 *   - renderer-summary.md   (executive summary)
 *
 * Usage: node scripts/build-renderer-graph.js
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { resolve, dirname, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RENDERER = resolve(ROOT, "src", "renderer");
const KNOWLEDGE = resolve(RENDERER, "knowledge");
const OUT_JSON = resolve(KNOWLEDGE, "renderer-graph.json");
const OUT_MD = resolve(KNOWLEDGE, "renderer-graph.md");
const OUT_SUMMARY = resolve(KNOWLEDGE, "renderer-summary.md");

if (!existsSync(KNOWLEDGE)) mkdirSync(KNOWLEDGE, { recursive: true });

/* ═══════════════════════════════════════════
   Metadata Tables (Enhancements 1-6)
   ═══════════════════════════════════════════ */

function ownerFromPath(rp) {
  if (rp.startsWith("features/dashboards") || rp.startsWith("config/dashboard")) return "Dashboard";
  if (rp.includes("crac") || rp.startsWith("screens/CRAC") || rp.startsWith("components/crac")) return "CRAC";
  if (rp.includes("health") || rp.startsWith("screens/HealthCenter") || rp.startsWith("components/health")) return "Health Center";
  if (rp.includes("help") || rp.includes("training") || rp.startsWith("modules/helpAssistant")) return "Help";
  if (rp.startsWith("print")) return "Print";
  if (rp.startsWith("modules/deployment")) return "Deployment";
  if (rp.startsWith("modules/erpBrain") || rp.startsWith("knowledge")) return "Knowledge";
  if (rp.startsWith("screens/EnvironmentManager") || rp.startsWith("stability")) return "Renderer Shell";
  if (rp.startsWith("screens/SafeMode")) return "Renderer Shell";
  if (rp.startsWith("screens/MasterDataTools") || rp.startsWith("features/inventory")) return "Master Data";
  if (rp.startsWith("features/reports")) return "Reports";
  if (rp.startsWith("features")) return "Dashboard";
  if (rp.startsWith("config")) return "Renderer Shell";
  if (rp.startsWith("utils")) return "Utilities";
  if (rp.startsWith("api")) return "Utilities";
  if (rp.startsWith("components") && !rp.includes("/")) return "Renderer Shell";
  if (rp.startsWith("components/layout") || rp.startsWith("components/overlays") || rp.startsWith("components/forms") || rp.startsWith("components/common")) return "Renderer Shell";
  if (rp.startsWith("components/accountingControls")) return "Accounting";
  if (rp.startsWith("components/inventoryReports")) return "Inventory";
  if (rp.startsWith("components/operations")) return "Operations";
  if (rp.startsWith("components/settings")) return "Settings";
  if (rp.startsWith("components/tables")) return "Renderer Shell";
  if (rp.startsWith("components/dashboard")) return "Dashboard";
  if (rp.startsWith("components/helpProductivity")) return "Help";
  if (rp.startsWith("components/helpTraining")) return "Help";
  if (rp.startsWith("screens/DashboardScreen")) return "Dashboard";
  if (rp.startsWith("screens/SettingsScreen")) return "Settings";
  if (rp.startsWith("screens/DocumentsScreen")) return "Operations";
  if (rp.startsWith("screens/ProfitabilityScreen")) return "Profitability";
  if (rp.startsWith("screens/HelpTrainingScreen")) return "Help";
  if (rp.startsWith("screens/KeyboardShortcutScreen")) return "Help";
  if (rp.startsWith("screens/BankRowsTable")) return "Accounting";
  if (rp.startsWith("screens/InventoryStock")) return "Inventory";
  if (rp.startsWith("screens/OperationsDrilldown")) return "Operations";
  if (rp.startsWith("screens/AllCompaniesReadOnly")) return "Accounting";
  if (rp.startsWith("screens/ReadOnlyReportFamily") || rp.startsWith("screens/ReadOnlySummary")) return "Reports";
  if (rp.startsWith("App.jsx")) return "Renderer Shell";
  if (rp.startsWith("styles")) return "Renderer Shell";
  return "Other";
}

function criticalityFromPath(rp) {
  const voucherScreens = ["App.jsx", "screens/BankRowsTable", "screens/ProfitabilityScreen"];
  const critical = ["App.jsx", "components/common.jsx", "components/forms/index.jsx", "api/client.js",
    "config/navigation.js", "config/viewDefinitions.js", "screens/DashboardScreen.jsx"];
  const high = ["screens/ReadOnlyReportFamilyScreen.jsx", "screens/ReadOnlySummaryReports.jsx",
    "screens/DocumentsScreen.jsx", "screens/SettingsScreen.jsx", "screens/AllCompaniesReadOnlyScreen.jsx",
    "screens/InventoryStockSummaryReport.jsx", "components/layout/index.jsx", "components/overlays/index.jsx",
    "print/printTemplateConfig.js", "print/PrintTemplateHost.jsx", "print/printUtils.js",
    "config/dashboard.js", "config/dashboardDrilldowns.js",
    "modules/helpAssistant/HelpAssistant.jsx"];
  const low = ["screens/KeyboardShortcutScreen.jsx", "screens/HelpTrainingScreen.jsx",
    "modules/helpAssistant/HelpAssistantOnboarding.jsx",
    "components/helpTraining/index.jsx", "components/helpProductivity/index.jsx",
    "screens/EnvironmentManager/EnvironmentManagerScreen.jsx"];
  if (critical.includes(rp)) return "Critical";
  if (high.includes(rp)) return "High";
  if (low.includes(rp)) return "Low";
  if (rp.includes("Screen") || rp.startsWith("features/dashboards") ||
      rp.startsWith("components/crac") || rp.startsWith("screens/CRAC") ||
      rp.startsWith("screens/HealthCenter") || rp.startsWith("modules/deployment") ||
      rp.startsWith("config/") || rp.startsWith("utils/")) return "High";
  if (rp.startsWith("knowledge/") || rp.startsWith("modules/erpBrain") ||
      rp.startsWith("stability/") || rp.startsWith("styles/")) return "Medium";
  return "Low";
}

function changeFrequency(rp) {
  if (rp === "App.jsx") return "Frequently Modified";
  if (rp.startsWith("config/navigation") || rp.startsWith("config/viewDefinitions")) return "Frequently Modified";
  if (rp.startsWith("features/dashboards")) return "Occasionally Modified";
  if (rp.startsWith("screens/HealthCenter")) return "Occasionally Modified";
  if (rp.startsWith("modules/helpAssistant")) return "Occasionally Modified";
  if (rp.startsWith("modules/deployment")) return "Occasionally Modified";
  if (rp.includes("crac") || rp.startsWith("screens/CRAC")) return "Occasionally Modified";
  if (rp.startsWith("print/")) return "Occasionally Modified";
  if (rp.startsWith("knowledge/") || rp.startsWith("modules/erpBrain") ||
      rp.startsWith("stability/") || rp.startsWith("utils/") ||
      rp.startsWith("api/") || rp.startsWith("styles/")) return "Stable";
  if (rp.startsWith("config/")) return "Stable";
  if (rp.startsWith("components/health")) return "Stable";
  if (rp.startsWith("components/accountingControls")) return "Stable";
  if (rp.startsWith("components/inventoryReports")) return "Stable";
  return "Occasionally Modified";
}

function workflowReference(rp) {
  const map = [
    { pat: /App\.jsx/, wf: "Renderer Shell" },
    { pat: /crac|CRAC/, wf: "CRAC Workflow" },
    { pat: /health|Health/, wf: "Health Center Workflow" },
    { pat: /help|Help|training|Training/, wf: "Help & Training Workflow" },
    { pat: /inventory|Inventory|stock|Stock/, wf: "Inventory Workflow" },
    { pat: /dashboard|Dashboard/, wf: "Dashboard Workflow" },
    { pat: /print|Print/, wf: "Print Workflow" },
    { pat: /deployment|Deployment/, wf: "Deployment Workflow" },
    { pat: /settings|Settings/, wf: "Settings Workflow" },
    { pat: /document|Document/, wf: "Document Workflow" },
    { pat: /profit|Profit/, wf: "Profitability Workflow" },
    { pat: /accounting|Accounting|bank|Bank|ledger|Ledger/, wf: "Accounting Workflow" },
    { pat: /operation|Operation|order|Order|grn|GRN|billing|Billing/, wf: "Operations Workflow" },
    { pat: /knowledge|erpBrain/, wf: "Knowledge Graph Workflow" },
    { pat: /stability|SafeMode|safe/, wf: "Recovery Workflow" },
    { pat: /master|Master/, wf: "Master Data Workflow" },
  ];
  for (const m of map) {
    if (m.pat.test(rp)) return m.wf;
  }
  return "General";
}

function futurePhase(rp) {
  if (rp === "App.jsx") return "18 (Route Registry)";
  if (rp.startsWith("components/common") || rp.startsWith("components/forms")) return "17 (Presentation Extraction)";
  if (rp.startsWith("config/")) return "17 (Config Extraction)";
  if (rp.startsWith("print/")) return "17 (Print Extraction)";
  if (rp.startsWith("knowledge/") || rp.startsWith("modules/erpBrain")) return "17 (Knowledge Isolation)";
  if (rp.startsWith("utils/")) return "17 (Utils Extraction)";
  if (rp.startsWith("api/")) return "18 (API Layer)";
  if (rp.startsWith("stability/")) return "17 (Stability Module)";
  if (rp.startsWith("modules/helpAssistant")) return "17 (Help Module)";
  if (rp.startsWith("modules/deployment")) return "18 (Deployment Module)";
  if (rp.startsWith("screens/HealthCenter")) return "17 (Health Module)";
  if (rp.startsWith("screens/SafeMode")) return "17 (Safe Mode)";
  if (rp.startsWith("screens/CRAC")) return "18 (CRAC Module)";
  if (rp.startsWith("features/dashboards")) return "17 (Dashboard Feature)";
  if (rp.startsWith("features/inventory") || rp.startsWith("features/reports")) return "18 (Feature Extraction)";
  return "17 (Stabilization)";
}

function extractionCandidate(rp) {
  if (rp === "App.jsx") return "Route Registry";
  if (rp.startsWith("components/common") || rp.startsWith("components/forms") ||
      rp.startsWith("components/layout") || rp.startsWith("components/overlays") ||
      rp.startsWith("components/tables")) return "Presentation Library";
  if (rp.startsWith("config/")) return "Config Module";
  if (rp.startsWith("print/")) return "Print Module";
  if (rp.startsWith("knowledge/") || rp.startsWith("modules/erpBrain")) return "Knowledge Graph";
  if (rp.startsWith("utils/")) return "Utils Package";
  if (rp.startsWith("api/")) return "API Service";
  if (rp.startsWith("stability/")) return "Stability Module";
  if (rp.startsWith("modules/helpAssistant")) return "Help Assistant Module";
  if (rp.startsWith("modules/deployment")) return "Deployment Module";
  if (rp.startsWith("screens/HealthCenter")) return "Health Center Module";
  if (rp.startsWith("screens/SafeMode")) return "Safe Mode Module";
  if (rp.startsWith("screens/CRAC")) return "CRAC Module";
  if (rp.startsWith("features/dashboards")) return "Dashboard Feature";
  if (rp.startsWith("features/")) return "Feature Module";
  if (rp.startsWith("screens/")) return "Screen Module";
  if (rp.startsWith("components/")) return "Component Library";
  return "Stabilization";
}

function primaryEntryPoint(rp) {
  const screenMatch = rp.match(/screens\/(\w+Screen)/);
  if (screenMatch) return screenMatch[1];
  if (rp === "App.jsx") return "App.jsx";
  if (rp.startsWith("modules/helpAssistant/HelpAssistant.jsx")) return "HelpAssistant";
  if (rp.startsWith("modules/deployment/ProductionReadinessScreen")) return "ProductionReadinessScreen";
  if (rp.startsWith("modules/deployment/GoLiveWizard")) return "GoLiveWizard";
  if (rp.startsWith("features/dashboards/widgetFramework")) return "WidgetFramework";
  if (rp.startsWith("features/dashboards/dashboardService")) return "DashboardService";
  if (rp.startsWith("features/dashboards/dashboardContext")) return "DashboardContext";
  return rp.split("/").pop().replace(/\.\w+$/, "");
}

function relatedScreens(rp) {
  const owner = ownerFromPath(rp);
  const screenMap = {
    "Dashboard": ["DashboardScreen"],
    "Accounting": ["BankRowsTable", "AllCompaniesReadOnlyScreen", "ReadOnlyReportFamilyScreen", "ReadOnlySummaryReports"],
    "Inventory": ["InventoryStockSummaryReport"],
    "Operations": ["DocumentsScreen", "OperationsDrilldownPanel"],
    "Profitability": ["ProfitabilityScreen"],
    "Help": ["HelpTrainingScreen", "KeyboardShortcutScreen"],
    "Settings": ["SettingsScreen"],
    "Reports": ["ReadOnlyReportFamilyScreen", "ReadOnlySummaryReports"],
    "CRAC": ["CRACManagementScreen", "CRACEntryScreen", "CRACTrackerScreen", "PaymentReadinessScreen", "OrderClosureScreen"],
    "Health Center": ["HealthCenterScreen", "RecoveryCenterScreen", "SafeModeScreen"],
    "Renderer Shell": ["All screens via App.jsx"],
    "Knowledge": [],
    "Print": [],
    "Deployment": ["ProductionReadinessScreen"],
    "Master Data": ["MasterDataToolsScreen"],
    "Utilities": [],
  };
  return screenMap[owner] || [];
}

function relatedReports(rp) {
  const owner = ownerFromPath(rp);
  const reportMap = {
    "Accounting": ["Trial Balance", "P&L", "Balance Sheet", "Day Book", "Cash/Bank Book", "GST Report", "Receivables", "Payables"],
    "Inventory": ["Stock Summary", "Stock Ledger", "Stock Movement", "Stock Valuation", "Inventory Profitability"],
    "Operations": ["Operations Dashboard", "Order Lifecycle", "Purchase Bills", "GRN Status"],
    "Profitability": ["Profitability Report", "Order Profitability"],
    "Reports": ["Accounting Reports", "Cash Flow", "GST Summary", "Employee Performance"],
    "Dashboard": ["Dashboard Summary"],
    "CRAC": ["CRAC Tracker", "Order Closure Report", "Payment Readiness"],
  };
  return reportMap[owner] || [];
}

function relatedDialogs(rp) {
  const dialogs = [];
  if (rp === "App.jsx") dialogs.push("ConfirmDialog", "GlobalSearchOverlay", "PrintPreviewDialog");
  if (rp.includes("confirm") || rp.startsWith("components/overlays")) dialogs.push("ConfirmDialog");
  if (rp.includes("search") || rp.startsWith("components/overlays")) dialogs.push("GlobalSearchOverlay");
  if (rp.startsWith("print") || rp.startsWith("components/overlays")) dialogs.push("PrintPreviewDialog");
  return dialogs;
}

function relatedContext(rp) {
  const contexts = [];
  if (rp === "App.jsx" || rp.includes("Company") || rp.includes("company")) contexts.push("CompanyContext");
  if (rp.includes("Session") || rp.includes("session") || rp.includes("Role") || rp.includes("role")) contexts.push("SessionContext");
  if (rp.startsWith("features/dashboards/dashboardContext")) contexts.push("DashboardContext");
  return contexts.length ? contexts : ["CompanyContext"];
}

function relatedPrintTemplates(rp) {
  const owner = ownerFromPath(rp);
  const printMap = {
    "Accounting": ["SalesInvoicePrint", "PurchaseVoucherPrint", "ReceiptVoucherPrint", "PaymentVoucherPrint", "JournalVoucherPrint", "DebitNotePrint", "CreditNotePrint", "FinancialReportPrints", "GstReportPrint"],
    "Inventory": ["StockReportPrint", "DeliveryChallanPrint"],
    "Operations": ["OperationalPrints", "DeliveryChallanPrint", "PurchaseVoucherPrint"],
    "Print": ["All templates"],
  };
  return printMap[owner] || [];
}

function relatedIPC(rp) {
  const ipcs = [];
  if (rp === "App.jsx" || rp.startsWith("api/") || rp.includes("apiClient") || rp.includes("api")) ipcs.push("ipcRenderer.invoke");
  if (rp.startsWith("print")) ipcs.push("ipcRenderer.invoke (print)");
  if (rp.startsWith("modules/deployment")) ipcs.push("ipcRenderer.invoke (deployment)");
  if (rp.startsWith("modules/helpAssistant")) ipcs.push("ipcRenderer.invoke (help)");
  if (rp.startsWith("screens/DocumentsScreen")) ipcs.push("ipcRenderer.invoke (documents)");
  return ipcs.length ? ipcs : ["ipcRenderer.invoke"];
}

/* ═══════════════════════════════════════════
   Walk & Parse
   ═══════════════════════════════════════════ */

const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
const SKIP_FILES = new Set(["renderer-graph.json", "renderer-graph.md", "renderer-summary.md"]);

function walk(dir) {
  const result = [];
  try {
    const entries = readdirSync(dir);
    for (const e of entries) {
      const full = resolve(dir, e);
      const stat = statSync(full);
      if (stat.isDirectory()) { if (SKIP_DIRS.has(e)) continue; result.push(...walk(full)); }
      else if (stat.isFile()) {
        const ext = e.toLowerCase().split(".").pop();
        if (["jsx", "js", "mjs", "cjs"].includes(ext) && !e.startsWith(".") && !SKIP_FILES.has(e)) {
          result.push({ path: full, ext: "." + ext, size: stat.size, mtime: stat.mtimeMs });
        }
      }
    }
  } catch {}
  return result;
}

function relPath(p) { return relative(RENDERER, p).replace(/\\/g, "/"); }
function readFileSafe(p) { try { return readFileSync(p, "utf-8"); } catch { return ""; } }

function extractImports(content) {
  const imports = [];
  const re = /import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+(?:,\s*\{[^}]*\})?)\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(content)) !== null) imports.push(m[1]);
  return imports;
}

function extractNamedExports(content) {
  const exports = [];
  const re1 = /export\s+(?:const|function|class|let|var)\s+(\w+)/g;
  let m;
  while ((m = re1.exec(content)) !== null) exports.push(m[1]);
  return exports;
}

function extractComponentNames(content) {
  const names = [];
  const re = /(?:const|function)\s+(\w+(?:Screen|Panel|Card|Table|Dashboard|Host|Wizard|Overview|Row|Box|Grid|Button|Input|Dialog|Overlay|Form|List|Item|Badge|Modal|Banner|Header|Footer|Layout|Frame|Sidebar|Provider|Context|Service|Utils|Config|Data|Entry|Tracker|Report|Checklist|Score|History|Label|Summary))(?:\s*[:=]\s*\(|\s*\()/g;
  let m;
  while ((m = re.exec(content)) !== null) { if (!names.includes(m[1])) names.push(m[1]); }
  return names;
}

function categorizePath(rel) {
  if (rel.startsWith("App.jsx")) return "app";
  if (rel.startsWith("screens/")) return "screen";
  if (rel.startsWith("components/")) return "component";
  if (rel.startsWith("features/")) return "feature";
  if (rel.startsWith("config/")) return "config";
  if (rel.startsWith("utils/")) return "util";
  if (rel.startsWith("api/")) return "api";
  if (rel.startsWith("print/")) return "print";
  if (rel.startsWith("modules/")) return "module";
  if (rel.startsWith("knowledge/")) return "knowledge";
  if (rel.startsWith("stability/")) return "stability";
  if (rel.startsWith("styles/")) return "style";
  return "other";
}

/* ═══════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════ */

const files = walk(RENDERER);
console.log(`Found ${files.length} files`);

/* ─── Build dependency graph ─── */
const nodes = {};
const edges = [];

for (const f of files) {
  const rp = relPath(f.path);
  const content = readFileSafe(f.path);
  const imports = extractImports(content);
  const exports = extractNamedExports(content);
  const components = extractComponentNames(content);
  const lines = content.split("\n").length;

  nodes[rp] = {
    path: rp,
    category: categorizePath(rp),
    ext: f.ext,
    size: f.size,
    lines,
    imports,
    exports,
    components,
    importCount: imports.length,
    exportCount: exports.length,
    componentCount: components.length,
    riskLevel: lines > 1000 ? "high" : lines > 300 ? "medium" : "low",
    /* ─── Enhancement 1: Component Ownership ─── */
    ownerModule: ownerFromPath(rp),
    /* ─── Enhancement 2: Business Criticality ─── */
    businessCriticality: criticalityFromPath(rp),
    /* ─── Enhancement 3: Change Frequency ─── */
    changeFrequency: changeFrequency(rp),
    /* ─── Enhancement 4: Workflow Linkage ─── */
    workflowReference: workflowReference(rp),
    /* ─── Enhancement 5: Risk Metadata ─── */
    riskMetadata: {
      riskLevel: lines > 1000 ? "high" : lines > 300 ? "medium" : "low",
      reason: lines > 1000 ? "File exceeds 1000 lines" : lines > 500 ? "Moderate complexity" : "Small file, low risk",
      futurePhase: futurePhase(rp),
      extractionCandidate: extractionCandidate(rp),
    },
    /* ─── Enhancement 6: AI Navigation Metadata ─── */
    aiNavigation: {
      primaryEntryPoint: primaryEntryPoint(rp),
      relatedScreens: relatedScreens(rp),
      relatedReports: relatedReports(rp),
      relatedDialogs: relatedDialogs(rp),
      relatedContext: relatedContext(rp),
      relatedPrintTemplates: relatedPrintTemplates(rp),
      relatedIPC: relatedIPC(rp),
    },
  };

  for (const imp of imports) {
    edges.push({ from: rp, to: imp });
  }
}

/* ─── Compute graph statistics ─── */
const byCategory = {};
const byRisk = { low: 0, medium: 0, high: 0 };
const byCriticality = {};
const byOwner = {};
const byChangeFreq = {};
let totalLines = 0;
let totalImports = 0;
for (const n of Object.values(nodes)) {
  byCategory[n.category] = (byCategory[n.category] || 0) + 1;
  byRisk[n.riskLevel] = (byRisk[n.riskLevel] || 0) + 1;
  byCriticality[n.businessCriticality] = (byCriticality[n.businessCriticality] || 0) + 1;
  byOwner[n.ownerModule] = (byOwner[n.ownerModule] || 0) + 1;
  byChangeFreq[n.changeFrequency] = (byChangeFreq[n.changeFrequency] || 0) + 1;
  totalLines += n.lines;
  totalImports += n.importCount;
}

// Most connected
const mostConnected = Object.entries(nodes)
  .sort((a, b) => b[1].importCount - a[1].importCount)
  .slice(0, 20)
  .map(([rp, n]) => ({ path: rp, importCount: n.importCount, lines: n.lines, category: n.category, owner: n.ownerModule }));

// Most depended-upon
const importCounter = {};
for (const e of edges) {
  const resolved = e.to.split("/").slice(-2).join("/");
  importCounter[resolved] = (importCounter[resolved] || 0) + 1;
}
const mostDepended = Object.entries(importCounter)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .map(([name, count]) => ({ name, count }));

// Fan-out (how many different files does each file import)
const fanOut = Object.entries(nodes).map(([rp, n]) => ({ path: rp, fanOut: n.importCount, category: n.category }))
  .sort((a, b) => b.fanOut - a.fanOut);

// Fan-in (how many files import this file)
const fanIn = {};
for (const n of Object.values(nodes)) {
  for (const imp of n.imports) {
    const key = imp.split("/").pop().replace(/\.\w+$/, "");
    fanIn[key] = (fanIn[key] || 0) + 1;
  }
}
const fanInArray = Object.entries(fanIn).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, count]) => ({ name, count }));

// High-risk files
const highRiskFiles = Object.entries(nodes)
  .filter(([, n]) => n.riskLevel === "high")
  .map(([rp, n]) => ({ path: rp, lines: n.lines, imports: n.importCount, owner: n.ownerModule, criticality: n.businessCriticality }));

// Circular import detection
const importMap = {};
for (const n of Object.keys(nodes)) {
  importMap[n] = new Set();
  for (const imp of nodes[n].imports) {
    const dir = n.substring(0, n.lastIndexOf("/") + 1);
    let resolved = imp.startsWith(".") ? resolve(dir, imp).replace(/\\/g, "/") : imp;
    if (!resolved.endsWith(".jsx") && !resolved.endsWith(".js")) {
      for (const ext of [".jsx", ".js", "/index.jsx", "/index.js"]) {
        if (nodes[resolved + ext]) { resolved += ext; break; }
        if (nodes[resolved.replace(/\/[^/]*$/, "") + ext]) { resolved = resolved.replace(/\/[^/]*$/, "") + ext; break; }
      }
    }
    importMap[n].add(resolved);
  }
}
const circularImports = [];
for (const a of Object.keys(importMap)) {
  for (const b of importMap[a]) {
    if (importMap[b] && importMap[b].has(a) && a < b) circularImports.push({ a, b });
  }
}

// Component reuse (how many times each component is exported/imported)
const componentReuseCounts = {};
for (const n of Object.values(nodes)) {
  for (const comp of n.components) {
    const count = Object.values(nodes).filter((other) =>
      other.path !== n.path && other.imports.some((i) => i.includes(comp))
    ).length;
    componentReuseCounts[comp] = count;
  }
}
const mostSharedComponents = Object.entries(componentReuseCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .map(([name, count]) => ({ name, reuseCount: count }));

/* ─── Route list ─── */
const ROUTE_KEYS = [
  "dashboard", "billing_drilldown", "collections_drilldown", "receivables_drilldown",
  "profit_drilldown", "orders_drilldown", "treasury_drilldown", "gst_drilldown",
  "stock_drilldown", "trial_balance_drilldown", "unposted_drilldown",
  "settings", "environment_manager", "health_center", "safe_mode",
  "production_readiness", "go_live_wizard",
  "invoices", "profitability", "voucher_dashboard", "manual_voucher",
  "documents", "master_data_tools", "master_import_templates",
  "tally_migration_assistant", "tally_xml_import",
  "crac_management", "crac_entry", "crac_tracker", "payment_readiness", "order_closure_tracking",
  "help_assistant", "help_keyboard", "help_training",
  "supply_orders", "procurement_workflow", "billing_workflow",
  "companies", "employees", "government_departments", "suppliers", "items", "banks", "warehouses",
  "accounting_ledgers", "accounting_groups",
  "purchase_voucher", "sales_voucher", "receipt_voucher", "payment_voucher", "journal_voucher",
  "credit_note", "debit_note",
  "operations_dashboard", "order_items", "order_lifecycle", "purchase_bills", "grn_status",
  "expense_posting_status", "billing_pending", "order_documents", "invoice_documents",
  "payment_documents", "missing_documents", "pending_procurement", "pending_billing", "pending_payment",
  "order_posting_status_report", "stock_issue_vs_billing", "order_profitability_exceptions", "grn_pending_report",
  "inventory_dashboard", "stock_summary", "stock_ledger", "stock_movement", "inventory_movements",
  "stock_reservations", "procurement_requirements", "grn_report", "delivery_challans",
  "warehouse_transfers", "cogs_report", "reservation_ageing", "low_stock",
  "serial_register", "batch_register", "stock_valuation", "inventory_profitability",
  "voucher_register", "general_ledger", "trial_balance", "profit_loss", "balance_sheet",
  "day_book", "cash_bank_book", "receivables_report", "payables_report", "gst_report",
  "tds_report", "gst_tds_report", "party_ledger", "accounting_reports",
  "bank_statement_import", "bank_reconciliation", "unmatched_bank_entries",
  "duplicate_bank_entries", "imported_statement_report",
  "voucher_proposal_queue", "voucher_proposal_report", "pending_proposal_report",
  "approved_proposal_report", "rejected_proposal_report", "posted_bank_voucher_report", "proposal_audit_report",
];

// Workflow linkage for routes (Enhancement 4)
function routeWorkflow(key) {
  if (key.includes("crac") || key.includes("order_closure") || key.includes("payment_readiness")) return "CRAC Workflow";
  if (key.includes("health")) return "Health Center Workflow";
  if (key.includes("help") || key.includes("training")) return "Help & Training Workflow";
  if (key.includes("inventory") || key.includes("stock") || key.includes("reservation") || key.includes("warehouse")) return "Inventory Workflow";
  if (key.includes("dashboard") || key.includes("drilldown")) return "Dashboard Workflow";
  if (key.includes("voucher") || key.includes("invoice") || key.includes("billing") || key.includes("_note")) return "Voucher Workflow";
  if (key.includes("purchase") || key.includes("sales") || key.includes("receipt") || key.includes("payment") || key.includes("journal")) return "Voucher Workflow";
  if (key.includes("supply") || key.includes("procurement") || key.includes("order") || key.includes("grn")) return "Operations Workflow";
  if (key.includes("document")) return "Document Workflow";
  if (key.includes("profit")) return "Profitability Workflow";
  if (key.includes("company") || key.includes("employee") || key.includes("supplier") || key.includes("item") || key.includes("bank") || key.includes("warehouse") || key.includes("ledger")) return "Master Data Workflow";
  if (key.includes("bank_statement") || key.includes("reconciliation")) return "Bank Reconciliation Workflow";
  if (key.includes("proposal")) return "Voucher Proposal Workflow";
  if (key.includes("production") || key.includes("go_live")) return "Deployment Workflow";
  return "General";
}

// Contexts
const CONTEXTS = [
  { name: "CompanyContext", source: "App.jsx (state)", consumers: ["AllCompaniesReadOnlyScreen", "DashboardScreen", "BillingVoucherScreen", "BusinessVoucherScreen", "VoucherEntryScreen", "DocumentsScreen", "CRAC screens", "HealthCenterScreen", "ProfitabilityScreen", "MasterDataToolsScreen", "Tally screens"] },
  { name: "Session/Role", source: "App.jsx (state)", consumers: ["HealthCenterScreen", "EnvironmentManagerScreen", "BusinessVoucherScreen", "MasterDataToolsScreen", "Tally screens"] },
  { name: "Theme/View", source: "App.jsx (effectiveView state)", consumers: "All screens via App.jsx rendering" },
];

const DIALOGS = [
  { name: "ConfirmDialog", source: "components/overlays/index.jsx", consumers: ["App.jsx (all confirm actions)"] },
  { name: "GlobalSearchOverlay", source: "components/overlays/index.jsx", consumers: ["App.jsx"] },
  { name: "PrintPreviewDialog", source: "components/overlays/index.jsx", consumers: ["App.jsx"] },
];

const PRINT = {
  host: "print/PrintTemplateHost.jsx",
  config: "print/printTemplateConfig.js",
  utils: "print/printUtils.js",
  templates: [
    "CreditNotePrint", "DebitNotePrint", "DeliveryChallanPrint", "FinancialReportPrints",
    "GstReportPrint", "JournalVoucherPrint", "OperationalPrints", "OutstandingReportPrints",
    "PaymentVoucherPrint", "PurchaseVoucherPrint", "ReceiptVoucherPrint", "SalesInvoicePrint",
    "StockReportPrint", "TemplateSections",
  ],
};

const APP_JSX = nodes["App.jsx"];
const appLines = APP_JSX ? APP_JSX.lines : 13289;
const approximateTokensSaved = Math.round((appLines + totalLines * 0.3) * 0.8 * 0.75);

/* ─── Statistics (Enhancement 8: Expanded) ─── */
const screenNodes = Object.entries(nodes).filter(([, n]) => n.category === "screen");
const compNodes = Object.entries(nodes).filter(([, n]) => n.category === "component");
const avgImportsPerScreen = screenNodes.length ? Math.round(screenNodes.reduce((s, [, n]) => s + n.importCount, 0) / screenNodes.length) : 0;
const avgComponentReuse = mostSharedComponents.length ? Math.round(mostSharedComponents.reduce((s, c) => s + c.reuseCount, 0) / mostSharedComponents.length) : 0;
const largestComponent = compNodes.sort((a, b) => b[1].lines - a[1].lines).slice(0, 1).map(([rp, n]) => ({ path: rp, lines: n.lines }))[0] || { path: "N/A", lines: 0 };
const largestScreen = screenNodes.sort((a, b) => b[1].lines - a[1].lines).slice(0, 1).map(([rp, n]) => ({ path: rp, lines: n.lines }))[0] || { path: "N/A", lines: 0 };
const layerCount = Object.keys(byCategory).length;
const architectureDensity = Math.round((totalImports / files.length) * 100) / 100;

/* ═══════════════════════════════════════════
   OUTPUT: renderer-graph.json
   ═══════════════════════════════════════════ */

const graph = {
  /* ─── RG-1 Schema Contract (frozen v1.0.0) ─── */
  schemaVersion: "1.0.0",
  graphId: "RG-1",
  generatedAt: new Date().toISOString(),
  sourceRoot: "src/renderer/",
  filesScanned: files.length,

  /* Backward-compatible nested meta */
  meta: {
    graphId: "RG-1",
    name: "Renderer Dependency Graph",
    version: "2.0.0",
    generated: new Date().toISOString(),
    source: "src/renderer/",
    description: "Enhanced renderer architecture dependency graph with ownership, criticality, workflow linkage, and AI navigation metadata",
    fileCount: files.length,
    totalLines,
    totalImports,
  },
  statistics: {
    filesByCategory: byCategory,
    filesByRisk: byRisk,
    filesByCriticality: byCriticality,
    filesByOwner: byOwner,
    filesByChangeFrequency: byChangeFreq,
    /* Enhancement 8: Expanded statistics */
    avgImportsPerScreen,
    avgComponentReuse,
    largestComponent,
    largestScreen,
    layerCount,
    architectureDensity,
    mostConnected,
    mostDepended,
    highRiskFiles,
    totalRoutes: ROUTE_KEYS.length,
    totalScreens: screenNodes.length,
    totalComponents: compNodes.length,
    totalFeatures: Object.entries(nodes).filter(([, n]) => n.category === "feature").length,
    totalModules: Object.entries(nodes).filter(([, n]) => n.category === "module").length,
    totalConfigFiles: Object.entries(nodes).filter(([, n]) => n.category === "config").length,
    circularImports: circularImports.length,
    circularImportDetails: circularImports,
    approximateTokenSavings: `~${approximateTokensSaved} tokens per AI operation`,
  },
  /* Enhancement 7: Dependency Heat Map */
  heatMap: {
    mostConnected: mostConnected.slice(0, 10),
    mostDepended: mostDepended.slice(0, 10),
    highestFanOut: fanOut.slice(0, 10),
    highestFanIn: fanInArray.slice(0, 10),
    mostCritical: Object.entries(nodes)
      .filter(([, n]) => n.businessCriticality === "Critical")
      .map(([rp, n]) => ({ path: rp, lines: n.lines, imports: n.importCount })),
    mostSharedComponents: mostSharedComponents.slice(0, 10),
  },
  routes: ROUTE_KEYS.map((key) => ({
    key,
    category: key.includes("_drilldown") ? "drilldown" :
              key.includes("_voucher") || key.includes("_note") || key === "voucher_dashboard" ? "voucher" :
              key.includes("crac_") || key.includes("order_closure") || key.includes("payment_readiness") ? "crac" :
              key.includes("help_") ? "help" :
              key.includes("master_") || key.includes("tally_") ? "tool" :
              key.includes("stock_") || key.includes("inventory_") ? "inventory" :
              key.includes("operations_") || key.includes("order_") || key.includes("grn_") || key.includes("purchase_") || key.includes("billing_") || key.includes("expense_") ? "operations" :
              key.includes("bank_") ? "bank" :
              key.includes("voucher_proposal") || key.includes("proposal_") ? "proposal" :
              "general",
    /* Enhancement 4: Workflow references for routes */
    workflowReference: routeWorkflow(key),
    screen: nodes[`screens/${key.charAt(0).toUpperCase() + key.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())}Screen.jsx`] ? "dedicated screen" : "in-App.jsx rendering",
  })),
  screens: screenNodes.map(([rp, n]) => ({
    path: rp, components: n.components, exports: n.exports, imports: n.imports,
    lines: n.lines, riskLevel: n.riskLevel,
    ownerModule: n.ownerModule, businessCriticality: n.businessCriticality,
    changeFrequency: n.changeFrequency, workflowReference: n.workflowReference,
    riskMetadata: n.riskMetadata, aiNavigation: n.aiNavigation,
  })),
  components: compNodes.map(([rp, n]) => ({
    path: rp, components: n.components, exports: n.exports, imports: n.imports,
    lines: n.lines, riskLevel: n.riskLevel,
    ownerModule: n.ownerModule, businessCriticality: n.businessCriticality,
    changeFrequency: n.changeFrequency, workflowReference: n.workflowReference,
    riskMetadata: n.riskMetadata, aiNavigation: n.aiNavigation,
  })),
  features: Object.entries(nodes).filter(([, n]) => n.category === "feature").map(([rp, n]) => ({
    path: rp, components: n.components, exports: n.exports, imports: n.imports,
    lines: n.lines, ownerModule: n.ownerModule, businessCriticality: n.businessCriticality,
    changeFrequency: n.changeFrequency, workflowReference: n.workflowReference,
  })),
  contexts: CONTEXTS,
  dialogs: DIALOGS,
  print: PRINT,
  knowledge: {
    brain: { path: "modules/erpBrain/", type: "ERP Knowledge Repository", references: [], status: "active" },
    kg: { path: "knowledge/", type: "Metadata Registry", entries: 167, status: "active" },
  },
  /* ─── Schema contract fields ─── */
  dependencies: {
    apiClient: "src/renderer/api/client.js",
    database: "src/main/database/init.js (via main process)",
    preload: "src/preload/preload.cjs (via contextBridge)",
    electron: "Electron shell",
  },
  ipcReferences: ["ipcRenderer.invoke", "ipcRenderer.on", "ipcRenderer.send"],
  risk: {
    highRiskCount: highRiskFiles.length,
    highRiskPaths: highRiskFiles.map((f) => f.path),
    complexityScore: Math.round((totalLines / 100) + (totalImports / 5) + (files.length / 2)),
    suggestedExtractionOrder: [
      "1. Presentation-only components (components/common.jsx, overslays)",
      "2. Config files (static data — navigation.js, viewDefinitions.js, etc.)",
      "3. Print system (standalone template host)",
      "4. Knowledge graphs (already separate)",
      "5. Feature drilldowns (dashboard sub-screens)",
      "6. Help/assistant modules",
      "7. Health center and stability modules",
      "8. Screens by domain (CRAC → master tools → settings → documents)",
      "9. Core business voucher screens (highest risk — last)",
    ],
  },
  intelligenceLayer: {
    brain: { path: "modules/erpBrain/", type: "ERP Knowledge Repository", references: [], status: "active" },
    kg: { path: "knowledge/", type: "Metadata Registry", entries: 167, status: "active" },
  },
  metadata: {
    name: "Renderer Dependency Graph",
    version: "2.0.0",
    description: "Enhanced renderer architecture dependency graph with ownership, criticality, workflow linkage, and AI navigation metadata",
    totalLines,
    totalImports,
  },
  /* Backward-compatible aliases */
  knowledge: {
    brain: { path: "modules/erpBrain/", type: "ERP Knowledge Repository", references: [], status: "active" },
    kg: { path: "knowledge/", type: "Metadata Registry", entries: 167, status: "active" },
  },
  externalDependencies: {
    apiClient: "src/renderer/api/client.js",
    ipcChannels: ["ipcRenderer.invoke", "ipcRenderer.on", "ipcRenderer.send"],
    database: "src/main/database/init.js (via main process)",
    preload: "src/preload/preload.cjs (via contextBridge)",
    electron: "Electron shell",
  },
  riskAssessment: {
    highRiskCount: highRiskFiles.length,
    highRiskPaths: highRiskFiles.map((f) => f.path),
    complexityScore: Math.round((totalLines / 100) + (totalImports / 5) + (files.length / 2)),
    suggestedExtractionOrder: [
      "1. Presentation-only components (components/common.jsx, overslays)",
      "2. Config files (static data — navigation.js, viewDefinitions.js, etc.)",
      "3. Print system (standalone template host)",
      "4. Knowledge graphs (already separate)",
      "5. Feature drilldowns (dashboard sub-screens)",
      "6. Help/assistant modules",
      "7. Health center and stability modules",
      "8. Screens by domain (CRAC → master tools → settings → documents)",
      "9. Core business voucher screens (highest risk — last)",
    ],
  },
  /* Enhancement 11: Renderer Evolution Map */
  evolution: {
    current: { description: "Monolithic App.jsx, flat routing, single CSS, direct IPC", appJsxLines: appLines, cssLines: 7042, style: "Monolithic" },
    phase17: { description: "CSS segmentation, presentation extraction, config isolation, knowledge graph stabilization", expectedReduction: "200-500 App.jsx lines, ~6,700 CSS lines", style: "Stabilized" },
    phase18: { description: "Route registry, dialog manager, nav controller, context providers, API service layer", style: "Architecture Separated" },
    future: { description: "Intelligence layer complete — all 9 registered graphs active; runtime consumption remains separately governed", graphsActive: 9, style: "Intelligence-Driven" },
  },
  edges: edges.slice(0, 500),
};

writeFileSync(OUT_JSON, JSON.stringify(graph, null, 2), "utf-8");
console.log(`Wrote ${OUT_JSON}`);

/* ═══════════════════════════════════════════
   OUTPUT: renderer-graph.md
   ═══════════════════════════════════════════ */

const md = [
  `# GII GeM ERP — Renderer Dependency Graph (RG-1 v2.0.0)`,
  ``,
  `**Graph ID:** RG-1`,
  `**Version:** 2.0.0 (Enhanced)`,
  `**Generated:** ${new Date().toISOString()}`,
  `**Source:** \`src/renderer/\``,
  ``,
  `---`,
  ``,
  `## 1. Architecture Overview`,
  ``,
  `The GII GeM ERP renderer is a React SPA (Vite + Electron) with flat routing via \`effectiveView\` (${ROUTE_KEYS.length} routes, ${appLines} App.jsx lines).`,
  ``,
  `**Stack:** React → Vite → Electron → IPC → SQLite`,
  ``,
  `---`,
  ``,
  `## 2. Statistics`,
  ``,
  `| Metric | Value |`,
  `|--------|-------|`,
  `| Total Files | ${files.length} |`,
  `| Total Lines | ${totalLines.toLocaleString()} |`,
  `| Total Imports | ${totalImports} |`,
  `| Routes | ${ROUTE_KEYS.length} |`,
  `| Screens | ${screenNodes.length} |`,
  `| Components | ${compNodes.length} |`,
  `| Features | ${Object.entries(nodes).filter(([, n]) => n.category === "feature").length} |`,
  `| Layers | ${layerCount} |`,
  `| Architecture Density | ${architectureDensity} imports/file |`,
  `| Avg Imports/Screen | ${avgImportsPerScreen} |`,
  `| Avg Component Reuse | ${avgComponentReuse}x |`,
  `| Largest Component | ${largestComponent.path} (${largestComponent.lines} lines) |`,
  `| Largest Screen | ${largestScreen.path} (${largestScreen.lines} lines) |`,
  `| Complexity Score | ${graph.riskAssessment.complexityScore} |`,
  `| Circular Imports | ${circularImports.length} |`,
  `| Token Savings | ${graph.statistics.approximateTokenSavings} |`,
  ``,
  `### By Owner`,
  ...Object.entries(byOwner).sort((a, b) => b[1] - a[1]).map(([o, c]) => `- **${o}:** ${c} files`),
  ``,
  `### By Criticality`,
  ...Object.entries(byCriticality).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- **${k}:** ${v} files`),
  ``,
  `---`,
  ``,
  `## 3. Dependency Heat Map (Enhancement 7)`,
  ``,
  `### Highest Fan-Out (Most Imports)`,
  `| File | Imports | Category | Owner |`,
  `|------|---------|----------|-------|`,
  ...fanOut.slice(0, 10).map((f) => `| ${f.path} | ${f.fanOut} | ${f.category} | ${nodes[f.path]?.ownerModule || "N/A"} |`),
  ``,
  `### Highest Fan-In (Most Imported By Others)`,
  `| Module/File | Times Imported |`,
  `|-------------|----------------|`,
  ...fanInArray.slice(0, 10).map((f) => `| ${f.name} | ${f.count} |`),
  ``,
  `### Most Shared Components`,
  `| Component | Reuse Count |`,
  `|-----------|-------------|`,
  ...mostSharedComponents.slice(0, 10).map((c) => `| ${c.name} | ${c.reuseCount} |`),
  ``,
  `### Critical Files (Business Criticality: Critical)`,
  `| File | Lines | Imports |`,
  `|------|-------|---------|`,
  ...graph.heatMap.mostCritical.map((f) => `| ${f.path} | ${f.lines} | ${f.imports} |`),
  ``,
  `---`,
  ``,
  `## 4. Route Graph with Workflow Linkage`,
  ``,
  `All routes via \`effectiveView\`. No React Router.`,
  ``,
  `| Route Key | Category | Workflow | Screen |`,
  `|-----------|----------|----------|--------|`,
  ...ROUTE_KEYS.slice(0, 40).map((r) => {
    const info = graph.routes.find((gr) => gr.key === r);
    return `| ${r} | ${info?.category || "general"} | ${info?.workflowReference || "General"} | ${info?.screen || "in-App.jsx"} |`;
  }),
  `| ... (${ROUTE_KEYS.length - 40} more routes) | ... | ... | ... |`,
  ``,
  `---`,
  ``,
  `## 5. Component Graph with Ownership`,
  ``,
  `| File | Lines | Imports | Owner | Criticality | Change Frequency |`,
  `|------|-------|---------|-------|-------------|-----------------|`,
  ...compNodes.sort((a, b) => b[1].lines - a[1].lines).slice(0, 15).map(([rp, n]) =>
    `| ${rp} | ${n.lines} | ${n.importCount} | ${n.ownerModule} | ${n.businessCriticality} | ${n.changeFrequency} |`),
  ``,
  `---`,
  ``,
  `## 6. Context Graph`,
  ...CONTEXTS.map((c) => `- **${c.name}:** ${c.source} → ${c.consumers}`),
  ``,
  `---`,
  ``,
  `## 7. Print Graph`,
  `- Host: ${PRINT.host}`,
  `- Config: ${PRINT.config}`,
  `- Utils: ${PRINT.utils}`,
  `- Templates (${PRINT.templates.length}): ${PRINT.templates.join(", ")}`,
  ``,
  `---`,
  ``,
  `## 8. Dialog Graph`,
  ...DIALOGS.map((d) => `- **${d.name}:** ${d.source} → ${d.consumers}`),
  ``,
  `---`,
  ``,
  `## 9. Knowledge Layer`,
  `- BRAIN-1: ERP Knowledge Repository (224 entries)`,
  `- KG-1: Metadata Registry (167 entries)`,
  `- RG-1: Renderer Dependency Graph **(Active, v2.0.0)**`,
  `- DG-1: Database Intelligence Graph (73 tables)`,
  `- WG-1: Workflow Intelligence Graph (18 stages)`,
  `- KG-4: Voucher and Accounting Graph (14 voucher types)`,
  `- FF-1: Feature Function Correlation Graph (50 features)`,
  `- AG-1: Audit Intelligence Graph (97 events)`,
  `- KG-5: Document and Manual Graph (10 manuals)`,
  ``,
  `---`,
  ``,
  `## 10. External Dependencies`,
  `\`\`\``,
  `Renderer → API Client (api/client.js) → IPC → Main Process → Database (init.js)`,
  `                                              → Preload (preload.cjs)`,
  `\`\`\``,
  ``,
  `---`,
  ``,
  `## 11. Renderer Evolution Map (Enhancement 11)`,
  ``,
  `| Stage | Description | Key Metrics |`,
  `|-------|-------------|-------------|`,
  `| **Current** | Monolithic App.jsx, flat routing, single CSS | ${appLines} App.jsx lines, 7,042 CSS lines |`,
  `| **Phase 17** | CSS segmentation, presentation extraction, config isolation | -200-500 App.jsx, -6,700 CSS |`,
  `| **Phase 18** | Route registry, dialog manager, nav controller, API service | Architecture separated |`,
  `| **Future** | Runtime consumption remains separately governed | 9 active graphs |`,
  ``,
  `---`,
  ``,
  `## 12. Renderer Layers`,
  `| Layer | Description | Files |`,
  `|-------|-------------|-------|`,
  `| 1. Shell | App shell + navigation | App.jsx, layout |`,
  `| 2. Config | Static definitions | ${byCategory.config || 0} config files |`,
  `| 3. API | IPC bridge | api/client.js |`,
  `| 4. Print | Template printing | ${byCategory.print || 0} print files |`,
  `| 5. Screens | App screens | ${screenNodes.length} screen files |`,
  `| 6. Components | Shared UI | ${compNodes.length} component files |`,
  `| 7. Features | Domain logic | ${Object.entries(nodes).filter(([, n]) => n.category === "feature").length} feature files |`,
  `| 8. Modules | Subsystems | ${byCategory.module || 0} module files |`,
  `| 9. Knowledge | Metadata | ${byCategory.knowledge || 0} knowledge files |`,
  `| 10. Stability | Recovery | ${byCategory.stability || 0} stability files |`,
  `| 11. Styles | CSS | 1 style file |`,
  ``,
].join("\n");

writeFileSync(OUT_MD, md, "utf-8");
console.log(`Wrote ${OUT_MD}`);

/* ═══════════════════════════════════════════
   OUTPUT: renderer-summary.md
   ═══════════════════════════════════════════ */

const summary = [
  `# GII GeM ERP — Renderer Summary (RG-1 v2.0.0 Enhanced)`,
  ``,
  `**Graph ID:** RG-1`,
  `**Version:** 2.0.0`,
  `**Generated:** ${new Date().toISOString()}`,
  ``,
  `---`,
  ``,
  `## 1. Renderer Size`,
  `| Metric | Value |`,
  `|--------|-------|`,
  `| Source Files | ${files.length} |`,
  `| Total Lines | ${totalLines.toLocaleString()} |`,
  `| Import Statements | ${totalImports} |`,
  `| App.jsx | ${appLines} lines (~${Math.round(appLines / 20)}KB) |`,
  `| CSS (single file) | 7,042 lines (125KB) |`,
  `| Complexity Score | ${graph.riskAssessment.complexityScore} |`,
  `| Architecture Density | ${architectureDensity} imports/file |`,
  ``,
  `## 2. Screens (${screenNodes.length} dedicated files, ${ROUTE_KEYS.length} routes)`,
  `- **Master Data:** companies, employees, suppliers, items, banks, warehouses, ledgers, groups`,
  `- **Transactions:** purchase, sales, receipt, payment, journal vouchers, credit/debit notes`,
  `- **Dashboard:** main dashboard with drilldown panels`,
  `- **Operations:** operations dashboard, order lifecycle, GRN, billing, procurement`,
  `- **Inventory:** stock summary, stock ledger, movements, reservations, low stock, valuation`,
  `- **Accounting:** voucher register, general ledger, trial balance, P&L, balance sheet, GST reports`,
  `- **Bank:** statement import, reconciliation, unmatched/duplicate entries`,
  `- **Voucher Proposals:** proposal queue, approval workflow, audit trail`,
  `- **CRAC:** CRAC management, entry, tracker, payment readiness, order closure (5 routes)`,
  `- **Settings, Documents, Help, Health Center, Safe Mode, Deployment**`,
  ``,
  `## 3. Components (${compNodes.length} files)`,
  `- **Categories:** Layout, Overlays, Forms, Common UI, Tables, Health, CRAC, Help, Inventory, Operations, Accounting Controls, Dashboard`,
  `- **Most Shared Components:** ${mostSharedComponents.slice(0, 3).map((c) => `${c.name} (${c.reuseCount}x)`).join(", ")}`,
  `- **Avg Reuse:** ${avgComponentReuse}x`,
  ``,
  `## 4. Ownership`,
  ...Object.entries(byOwner).sort((a, b) => b[1] - a[1]).map(([o, c]) => `- **${o}:** ${c} files`),
  ``,
  `## 5. Business Criticality`,
  ...Object.entries(byCriticality).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- **${k}:** ${v} files`),
  ``,
  `## 6. Change Frequency`,
  ...Object.entries(byChangeFreq).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- **${k}:** ${v} files`),
  ``,
  `## 7. Architectural Pattern`,
  `1. **Flat routing** — effectiveView state, no router library`,
  `2. **Monolithic App.jsx** — ${appLines} lines with inline CRUD and view switching`,
  `3. **Flat hierarchy** — App.jsx imports screens and components directly`,
  `4. **Single CSS** — styles/app.css with 7,042 lines`,
  `5. **Direct IPC** — apiClient prop passed from App.jsx`,
  ``,
  `## 8. Suggested Future Extraction Order`,
  ...graph.riskAssessment.suggestedExtractionOrder.map((s) => `- ${s}`),
  ``,
  `## 9. Dependencies`,
  `\`\`\``,
  `Renderer → API Client → IPC → Main Process → Database / Preload`,
  `\`\`\``,
  ``,
  `## 10. Risk Assessment`,
  `| Risk Level | Count |`,
  `|------------|-------|`,
  `| High | ${byRisk.high} |`,
  `| Medium | ${byRisk.medium} |`,
  `| Low | ${byRisk.low} |`,
  ...highRiskFiles.map((f) => `- **High:** \`${f.path}\` (${f.lines} lines, ${f.imports} imports) — ${f.owner}`),
  ``,
  `## 11. Integration with Intelligence Layer`,
  `| Graph | Status |`,
  `|-------|--------|`,
  `| BRAIN-1 (ERP Knowledge) | Active (224 entries) |`,
  `| KG-1 (Metadata Registry) | Active (167 entries) |`,
  `| **RG-1 (Renderer Graph)** | **Active (v2.0.0 Enhanced)** |`,
  `| DG-1 (Database Graph) | Active (73 tables) |`,
  `| WG-1 (Workflow Graph) | Active (18 stages) |`,
  `| KG-4 (Voucher and Accounting Graph) | Active (14 voucher types) |`,
  `| FF-1 (Feature Function Graph) | Active (50 features) |`,
  `| AG-1 (Audit Graph) | Active (97 events) |`,
  `| KG-5 (Document and Manual Graph) | Active (10 manuals) |`,
  ``,
].join("\n");

writeFileSync(OUT_SUMMARY, summary, "utf-8");
console.log(`Wrote ${OUT_SUMMARY}`);
console.log("Done.");
