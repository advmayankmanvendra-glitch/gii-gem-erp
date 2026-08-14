// build-manual-graph.js — KG-5 Document and Manual Graph Generator
// Regenerates src/renderer/knowledge/manual-graph.json from:
//   - docs/manuals/*.md              (line counts, source inventory)
//   - src/renderer/modules/erpBrain/data/manualIndex.js (section index)
//   - CURATION map below             (cross-references to FF-1/WG-1/RG-1/BRAIN-1)
// Usage: node scripts/build-manual-graph.js
// Validation: npm run verify:manual-graph

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "src/renderer/knowledge/manual-graph.json");
const MANUAL_INDEX_PATH = join(ROOT, "src/renderer/modules/erpBrain/data/manualIndex.js");
const MANUALS_DIR = join(ROOT, "docs/manuals");

const MANUAL_SOURCES = [
  { id: "user-operations-manual", title: "Complete User Operations Manual", file: "GII-GeM-ERP-Complete-User-Operations-Manual.md", category: "user-operations", status: "current" },
  { id: "quick-start-guide", title: "Quick Start Guide", file: "GII-GeM-ERP-Quick-Start-Guide.md", category: "user-operations", status: "current" },
  { id: "training-workbook", title: "Training Workbook", file: "GII-GeM-ERP-Training-Workbook.md", category: "user-operations", status: "current" },
  { id: "daily-operations-checklist", title: "Daily Operations Checklist", file: "GII-GeM-ERP-Daily-Operations-Checklist.md", category: "user-operations", status: "current" },
  { id: "month-end-checklist", title: "Month-End Financial Checklist", file: "GII-GeM-ERP-Month-End-Financial-Checklist.md", category: "user-operations", status: "current" },
  { id: "troubleshooting-guide", title: "Troubleshooting Guide", file: "GII-GeM-ERP-Troubleshooting-Guide.md", category: "troubleshooting", status: "current" },
  { id: "command-execution-guide", title: "Command Execution Guide", file: "GII-GeM-ERP-Command-Execution-Guide.md", category: "administration", status: "current" },
  { id: "feature-status-matrix", title: "Feature Status Matrix", file: "GII-GeM-ERP-Feature-Status-Matrix.md", category: "administration", status: "current" },
  { id: "knowledge-gap-report", title: "Knowledge Gap Report", file: "GII-GeM-ERP-Knowledge-Gap-Report.md", category: "administration", status: "current" },
  { id: "manual-generation-report", title: "Manual Generation Report", file: "GII-GeM-ERP-Manual-Generation-Report.md", category: "administration", status: "current" }
];

// Hand-curated cross-references. Every id must resolve at verification time
// against FF-1 featureNodes, WG-1 nodes, RG-1 screens[].path, and BRAIN-1
// reports/errors indexes.
const CURATION = {
  "user-operations-manual": {
    topics: ["masters", "supply order", "procurement", "inventory", "billing", "receivables", "payables", "vouchers", "reports", "gst", "bank reconciliation", "year-end", "import", "backup", "security", "cr ac", "work order"],
    features: ["FEA-01", "FEA-02", "FEA-03", "FEA-04", "FEA-05", "FEA-06", "FEA-07", "FEA-08", "FEA-11", "FEA-12", "FEA-13", "FEA-14", "FEA-15", "FEA-16", "FEA-17", "FEA-18", "FEA-19", "FEA-20", "FEA-21", "FEA-22", "FEA-23", "FEA-24", "FEA-25", "FEA-26", "FEA-27", "FEA-28", "FEA-29", "FEA-30", "FEA-31", "FEA-32", "FEA-33", "FEA-34", "FEA-35", "FEA-36", "FEA-37", "FEA-38", "FEA-39", "FEA-40", "FEA-41", "FEA-42", "FEA-43", "FEA-45", "FEA-47", "FEA-49"],
    stages: ["WORK_ORDER", "PROCUREMENT_PLANNING", "SUPPLIER_PURCHASE_ORDER", "GOODS_RECEIPT_GRN", "INVENTORY_RESERVATION", "DELIVERY_CHALLAN", "INSTALLATION", "CRAC", "SALES_INVOICE_GST_INVOICE", "DEPARTMENT_RECEIVABLE", "RECEIPT", "ORDER_CLOSURE", "PROFITABILITY_ANALYSIS"],
    screens: ["screens/DashboardScreen.jsx", "screens/MasterScreen.jsx", "screens/LoginScreen.jsx", "screens/ReadOnlyReportFamilyScreen.jsx", "screens/ReadOnlySummaryReports.jsx", "screens/DocumentsScreen.jsx", "screens/InventoryStockSummaryReport.jsx", "screens/SettingsScreen.jsx", "screens/SummaryScreen.jsx", "screens/CRAC/CRACManagementScreen.jsx", "screens/CRAC/CRACEntryScreen.jsx", "screens/CRAC/CRACTrackerScreen.jsx"],
    reports: ["RPT-trial_balance", "RPT-profit_loss", "RPT-balance_sheet", "RPT-general_ledger", "RPT-cash_book", "RPT-bank_book", "RPT-stock_ledger", "RPT-stock_valuation", "RPT-gst_register", "RPT-gst_summary", "RPT-tds_register", "RPT-receivables", "RPT-payables", "RPT-bill_wise_receivable", "RPT-bill_wise_payable", "RPT-receivable_ageing", "RPT-order_profitability", "RPT-low_stock"],
    errors: ["ERR-001", "ERR-002", "ERR-003", "ERR-004", "ERR-005", "ERR-006", "ERR-007", "ERR-008", "ERR-009", "ERR-010"]
  },
  "quick-start-guide": {
    topics: ["installation", "login", "supply order", "procurement", "goods receipt", "invoice", "receipt"],
    features: ["FEA-01", "FEA-02", "FEA-11", "FEA-12", "FEA-13", "FEA-14", "FEA-19", "FEA-22"],
    stages: ["WORK_ORDER", "PROCUREMENT_PLANNING", "SUPPLIER_PURCHASE_ORDER", "GOODS_RECEIPT_GRN", "SALES_INVOICE_GST_INVOICE", "RECEIPT"],
    screens: ["screens/LoginScreen.jsx", "screens/DashboardScreen.jsx", "screens/MasterScreen.jsx"],
    reports: ["RPT-receivables"],
    errors: []
  },
  "training-workbook": {
    topics: ["navigation", "masters", "supply chain", "inventory", "vouchers", "gst", "reports", "period end"],
    features: ["FEA-01", "FEA-02", "FEA-11", "FEA-14", "FEA-19", "FEA-25", "FEA-26", "FEA-29", "FEA-30", "FEA-31", "FEA-34", "FEA-38", "FEA-49"],
    stages: ["WORK_ORDER", "GOODS_RECEIPT_GRN", "SALES_INVOICE_GST_INVOICE", "ORDER_CLOSURE", "PROFITABILITY_ANALYSIS"],
    screens: ["screens/DashboardScreen.jsx", "screens/ReadOnlyReportFamilyScreen.jsx", "screens/ReadOnlySummaryReports.jsx"],
    reports: ["RPT-trial_balance", "RPT-gst_register", "RPT-order_profitability", "RPT-receivable_ageing", "RPT-profit_loss", "RPT-balance_sheet"],
    errors: []
  },
  "daily-operations-checklist": {
    topics: ["daily checklist", "pending supply orders", "low stock", "goods receipt", "invoices", "receipt allocation", "trial balance", "backup"],
    features: ["FEA-01", "FEA-11", "FEA-14", "FEA-19", "FEA-22", "FEA-29", "FEA-47"],
    stages: ["WORK_ORDER", "GOODS_RECEIPT_GRN", "SALES_INVOICE_GST_INVOICE", "RECEIPT"],
    screens: ["screens/DashboardScreen.jsx", "screens/ReadOnlyReportFamilyScreen.jsx"],
    reports: ["RPT-trial_balance", "RPT-low_stock", "RPT-bill_wise_receivable", "RPT-operations_dashboard", "RPT-inventory_dashboard"],
    errors: []
  },
  "month-end-checklist": {
    topics: ["month end", "receivables", "payables", "bank reconciliation", "inventory verification", "gst return", "trial balance", "profitability"],
    features: ["FEA-21", "FEA-23", "FEA-39", "FEA-36", "FEA-37", "FEA-34", "FEA-29", "FEA-38", "FEA-49"],
    stages: ["ORDER_CLOSURE", "PROFITABILITY_ANALYSIS"],
    screens: ["screens/ReadOnlyReportFamilyScreen.jsx", "screens/ReadOnlySummaryReports.jsx", "screens/InventoryStockSummaryReport.jsx"],
    reports: ["RPT-receivable_ageing", "RPT-bill_wise_receivable", "RPT-bill_wise_payable", "RPT-gst_register", "RPT-gst_summary", "RPT-trial_balance", "RPT-order_profitability", "RPT-stock_ledger", "RPT-stock_valuation"],
    errors: []
  },
  "troubleshooting-guide": {
    topics: ["login", "voucher posting", "report blank", "gst errors", "stock discrepancy", "report mismatch", "import failures", "backup restore", "dashboard", "export"],
    features: ["FEA-29", "FEA-34", "FEA-36", "FEA-40", "FEA-42", "FEA-43", "FEA-45", "FEA-47"],
    stages: [],
    screens: ["screens/DashboardScreen.jsx", "screens/HealthCenter/HealthCenterScreen.jsx", "screens/HealthCenter/ErrorGuidancePanel.jsx"],
    reports: ["RPT-trial_balance", "RPT-gst_register"],
    errors: ["ERR-001", "ERR-002", "ERR-003", "ERR-004", "ERR-005", "ERR-006", "ERR-007", "ERR-008", "ERR-009", "ERR-010", "ERR-011", "ERR-012", "ERR-013", "ERR-014", "ERR-015"]
  },
  "command-execution-guide": {
    topics: ["database initialization", "verification commands", "build", "test data"],
    features: [],
    stages: [],
    screens: [],
    reports: [],
    errors: []
  },
  "feature-status-matrix": {
    topics: ["feature status", "graph intelligence", "production readiness"],
    features: ["FEA-01", "FEA-11", "FEA-12", "FEA-14", "FEA-19", "FEA-29", "FEA-30", "FEA-31", "FEA-34"],
    stages: [],
    screens: [],
    reports: [],
    errors: []
  },
  "knowledge-gap-report": {
    topics: ["knowledge gaps", "manual coverage", "resolution plan"],
    features: ["FEA-45", "FEA-46"],
    stages: [],
    screens: [],
    reports: [],
    errors: []
  },
  "manual-generation-report": {
    topics: ["manual generation", "section coverage", "quality metrics"],
    features: ["FEA-45"],
    stages: [],
    screens: [],
    reports: [],
    errors: []
  }
};

function loadManualIndex() {
  const txt = readFileSync(MANUAL_INDEX_PATH, "utf-8");
  const start = txt.indexOf("const manualIndex = ") + "const manualIndex = ".length;
  const end = txt.indexOf(";");
  let json = txt.slice(start, end).trim();
  json = json.replace(/(^|[{\[,]\s*)(heading|excerpt)\s*:/g, '$1"$2":');
  return JSON.parse(json);
}

function countLines(filePath) {
  const txt = readFileSync(filePath, "utf-8");
  return txt.split(/\r?\n/).length;
}

const index = loadManualIndex();

const manuals = MANUAL_SOURCES.map((src, i) => {
  const sections = (index[src.id] || []).map((s, j) => ({
    sectionId: `${src.id}-section-${j}`,
    heading: s.heading || s.title,
    excerpt: s.excerpt || s.summary
  }));
  const curation = CURATION[src.id] || { topics: [], features: [], stages: [], screens: [], reports: [], errors: [] };
  const sourcePath = `docs/manuals/${src.file}`;
  return {
    manualId: src.id,
    title: src.title,
    fileName: src.file,
    sourcePath,
    lineCount: countLines(join(ROOT, sourcePath)),
    sectionCount: sections.length,
    category: src.category,
    status: src.status,
    sections,
    topics: curation.topics,
    featureRefs: curation.features,
    workflowStageRefs: curation.stages,
    screenRefs: curation.screens,
    reportRefs: curation.reports,
    errorRefs: curation.errors
  };
});

const orphanedKeys = Object.keys(index).filter((k) => !MANUAL_SOURCES.some((m) => m.id === k));

const allSectionIds = manuals.flatMap((m) => m.sections.map((s) => s.sectionId));
const refCount =
  manuals.reduce((acc, m) => acc + m.featureRefs.length + m.workflowStageRefs.length + m.screenRefs.length + m.reportRefs.length + m.errorRefs.length, 0);

const graph = {
  schemaVersion: "1.0.0",
  graphId: "KG-5",
  generatedAt: new Date().toISOString(),
  owner: "Architecture & Governance",
  description: "Document and Manual Graph — governed inventory of ERP manuals with section indexes and resolved cross-references to FF-1 features, WG-1 workflow stages, RG-1 screens, BRAIN-1 reports and errors.",
  version: "1.0.0",
  status: "active",
  dependencies: {
    dependsOn: ["BRAIN-1", "KG-1", "RG-1", "WG-1", "FF-1"],
    dependedBy: []
  },
  relationships: {
    manualToFeature: [...new Set(manuals.flatMap((m) => m.featureRefs))].sort(),
    manualToWorkflowStage: [...new Set(manuals.flatMap((m) => m.workflowStageRefs))].sort(),
    manualToScreen: [...new Set(manuals.flatMap((m) => m.screenRefs))].sort(),
    manualToReport: [...new Set(manuals.flatMap((m) => m.reportRefs))].sort(),
    manualToError: [...new Set(manuals.flatMap((m) => m.errorRefs))].sort()
  },
  manuals,
  knownGaps: [
    {
      id: "KG5-GAP-001",
      description: `Runtime manualIndex.js exposes ${orphanedKeys.length} keys not registered in manualLoader MANUAL_SOURCES (${orphanedKeys.join(", ")}) — orphaned index entries with no consumer`,
      severity: "low",
      mitigation: "Documented here for the KG-5 inventory; cleanup is a separate maintenance task"
    },
    {
      id: "KG5-GAP-002",
      description: "BRAIN-1 repository has no manuals/index.json — manuals are governed by KG-5 and the runtime manual index only",
      severity: "medium",
      mitigation: "KG-5 is the governing inventory; a BRAIN-1 repository entry can be added in a future phase"
    },
    {
      id: "KG5-GAP-003",
      description: "WG-1 helpRefs point only to the Complete User Operations Manual; other manuals are not linked from workflow nodes",
      severity: "low",
      mitigation: "KG-5 manualToWorkflowStage references provide the cross-graph coverage"
    }
  ],
  sourceDocuments: manuals.map((m) => m.sourcePath),
  validationRules: [
    "Every manual sourcePath must resolve under docs/manuals/",
    "Every featureRef must resolve to an FF-1 feature node id",
    "Every workflowStageRef must resolve to a WG-1 node id",
    "Every screenRef must resolve to an RG-1 screen path",
    "Every reportRef must resolve to a BRAIN-1 reports index id",
    "Every errorRef must resolve to a BRAIN-1 errors index id",
    "No live business data may be embedded in the graph"
  ],
  risk: {
    overall: "low",
    notes: "Knowledge-only graph. Cross-reference drift is mitigated by the verifier; manual staleness is tracked per manual via the status field."
  },
  metadata: {
    generationTool: "scripts/build-manual-graph.js",
    generationCommand: "node scripts/build-manual-graph.js",
    sourceDirectories: ["docs/manuals/", "src/renderer/modules/erpBrain/data/manualIndex.js"],
    regenerationTrigger: "When manuals change, when the manual section index changes, or when referenced graphs change"
  },
  statistics: {
    manualCount: manuals.length,
    sectionCount: allSectionIds.length,
    topicCount: manuals.reduce((acc, m) => acc + m.topics.length, 0),
    referenceCount: refCount
  },
  compatibility: {
    kg5CompatibleWith: ["BRAIN-1", "KG-1", "RG-1", "DG-1", "WG-1", "KG-4", "FF-1", "AG-1"],
    graphRegistry: {
      requiresRegistryVersion: "1.0.0",
      requiresEILVersion: "1.0.0"
    }
  },
  futureExtensions: {
    plannedFeatures: [
      "BRAIN-1 manuals repository entry (manuals/index.json)",
      "Per-section cross-references where feature mapping confidence increases",
      "Manual staleness tracking against feature status matrix"
    ],
    runtimeIntegrationPhase: "None — descriptive graph; runtime wiring requires a separate approved phase"
  }
};

writeFileSync(OUT, JSON.stringify(graph, null, 2) + "\n", "utf-8");
console.log(`KG-5 graph written: ${manuals.length} manuals, ${allSectionIds.length} sections, ${refCount} references, ${orphanedKeys.length} orphaned index keys documented`);
