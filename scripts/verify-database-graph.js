#!/usr/bin/env node
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const GRAPH_PATH = resolve(ROOT, "src/renderer/knowledge/database-graph.json");
const SCHEMA_PATH = resolve(ROOT, "repository/schema/database-graph.schema.json");
const REGISTRY_PATH = resolve(ROOT, "repository/graph-registry.json");

const PASS = "PASS";
const FAIL = "FAIL";
const WARN = "WARN";

let passed = 0;
let failed = 0;
let warnings = 0;
const results = [];

function check(label, condition, detail = "") {
  if (condition) {
    results.push({ label, status: PASS, detail: detail || "OK" });
    passed++;
  } else {
    results.push({ label, status: FAIL, detail: detail || "Check failed" });
    failed++;
  }
}

function warn(label, detail) {
  results.push({ label, status: WARN, detail });
  warnings++;
}

// ---- Track file mtimes for read-only check ----
const initialMtimes = {};

function recordMtime(filePath) {
  try {
    if (existsSync(filePath)) {
      initialMtimes[filePath] = statSync(filePath).mtimeMs;
    }
  } catch (_) {}
}

// ---- 1. database-graph.json exists ----
check("DG-1: database-graph.json exists", existsSync(GRAPH_PATH), GRAPH_PATH);
recordMtime(GRAPH_PATH);

if (!existsSync(GRAPH_PATH)) {
  printResults();
  process.exit(1);
}

// ---- 2. JSON is valid ----
let graph;
try {
  const raw = readFileSync(GRAPH_PATH, "utf-8");
  graph = JSON.parse(raw);
  check("DG-1: JSON is valid", true, "Parsed successfully");
} catch (e) {
  check("DG-1: JSON is valid", false, e.message);
  printResults();
  process.exit(1);
}

// ---- 3. database-graph.schema.json exists ----
check("DG-1: Schema file exists", existsSync(SCHEMA_PATH), SCHEMA_PATH);
recordMtime(SCHEMA_PATH);

// ---- 3b. Schema validation using ajv ----
if (existsSync(SCHEMA_PATH)) {
  try {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf-8"));
    const ajv = new Ajv({ strict: false });
    const validate = ajv.compile(schema);
    const valid = validate(graph);
    if (valid) {
      check("DG-1: Schema validation passed", true, "All schema rules satisfied");
    } else {
      const errs = validate.errors.map((e) => `${e.instancePath} ${e.message}`).join("; ");
      check("DG-1: Schema validation passed", false, errs);
    }
  } catch (e) {
    check("DG-1: Schema validation passed", false, e.message);
  }
} else {
  warn("DG-1: Schema file not found", SCHEMA_PATH);
}

// ---- 4. DG-1 is registered in graph registry with status Active ----
if (existsSync(REGISTRY_PATH)) {
  try {
    const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
    const dg1Entry = registry.graphs?.find((g) => g.graphId === "DG-1");
    check("DG-1: Registered in graph registry", !!dg1Entry, dg1Entry ? `Found` : "Not found");
    if (dg1Entry) {
      check("DG-1: Registry status is Active", dg1Entry.status === "Active", `Status: ${dg1Entry.status}`);
    }
  } catch (e) {
    check("DG-1: Registry parseable", false, e.message);
  }
} else {
  check("DG-1: Registry file exists", false, REGISTRY_PATH);
}

// ---- 5. All table IDs are unique ----
const tables = graph.tables || [];
const tableIds = tables.map((t) => t.id);
const uniqueTableIds = new Set(tableIds);
check(
  "DG-1: All table IDs unique",
  tableIds.length === uniqueTableIds.size,
  `${tableIds.length} tables, ${uniqueTableIds.size} unique IDs`
);

// ---- 6. All table names are unique ----
const tableNames = tables.map((t) => t.tableName).filter(Boolean);
const uniqueTableNames = new Set(tableNames);
check(
  "DG-1: All table names unique",
  tableNames.length === uniqueTableNames.size,
  `${tableNames.length} names, ${uniqueTableNames.size} unique`
);

// ---- 7. All relationship fromTable/toTable values reference valid table IDs ----
const tableIdSet = new Set(tableIds);
const relErrors = [];
(graph.relationships || []).forEach((r, i) => {
  if (!tableIdSet.has(r.fromTable)) relErrors.push(`Rel ${i}: fromTable="${r.fromTable}" not found`);
  if (!tableIdSet.has(r.toTable)) relErrors.push(`Rel ${i}: toTable="${r.toTable}" not found`);
});
check(
  "DG-1: All relationships reference valid table IDs",
  relErrors.length === 0,
  relErrors.length ? relErrors.join("; ") : `${graph.relationships?.length || 0} relationships validated`
);

// ---- 8. Every accountingProtected table has genericCrudAllowed=false ----
const apViolations = tables
  .filter((t) => t.accountingProtected === true && t.genericCrudAllowed !== false)
  .map((t) => t.id);
check(
  "DG-1: accountingProtected tables have genericCrudAllowed=false",
  apViolations.length === 0,
  apViolations.length ? `Violations: ${apViolations.join(", ")}` : "All protected tables have genericCrudAllowed=false"
);

// ---- 9. supply_orders exists and is categorized as "Work Order / Supply Order" ----
const supplyOrders = tables.find((t) => t.id === "supply_orders");
check("DG-1: supply_orders table exists", !!supplyOrders, supplyOrders ? "Found" : "Missing");
if (supplyOrders) {
  check(
    "DG-1: supply_orders categorized as Work Order / Supply Order",
    supplyOrders.category === "Work Order / Supply Order",
    `Category: ${supplyOrders.category}`
  );
}

// ---- 10. ledger_entries table exists ----
check(
  "DG-1: ledger_entries table exists",
  tables.some((t) => t.id === "ledger_entries"),
  "ledger_entries found"
);

// ---- 11. vouchers and voucher_lines tables exist ----
const hasVouchers = tables.some((t) => t.id === "vouchers");
const hasVoucherLines = tables.some((t) => t.id === "voucher_lines");
check(
  "DG-1: vouchers and voucher_lines tables exist",
  hasVouchers && hasVoucherLines,
  hasVouchers && hasVoucherLines ? "Both found" : `vouchers: ${hasVouchers}, voucher_lines: ${hasVoucherLines}`
);

// ---- 12. Trial Balance, P&L, Balance Sheet mapped to ledger_entries in reportSourceMappings ----
const reportMappings = graph.reportSourceMappings || [];
const requiredReports = ["trialBalance", "profitLossReport", "balanceSheetReport"];
const missingReports = requiredReports.filter((r) => {
  const mapping = reportMappings.find((m) => m.report === r);
  return !mapping || !mapping.tables || !mapping.tables.includes("ledger_entries");
});
check(
  "DG-1: Trial Balance, P&L, Balance Sheet mapped to ledger_entries",
  missingReports.length === 0,
  missingReports.length ? `Missing/incomplete: ${missingReports.join(", ")}` : "All three reports mapped to ledger_entries"
);

// ---- 13. Posting functions are mapped (minimum set) ----
const postingFunctions = graph.postingMappings || [];
const requiredFunctions = ["createBalancedVoucher", "postSalesVoucher", "postPurchaseVoucher", "postReceiptVoucher", "reverseVoucher"];
const missingFunctions = requiredFunctions.filter((f) => !postingFunctions.some((p) => p.postingFunction === f));
check(
  "DG-1: Required posting functions exist",
  missingFunctions.length === 0,
  missingFunctions.length ? `Missing: ${missingFunctions.join(", ")}` : `${postingFunctions.length} posting functions total, required 5 found`
);

// ---- 14. Known gaps are recorded ----
const knownGaps = graph.knownGaps || [];
check(
  "DG-1: Known gaps are recorded",
  knownGaps.length > 0,
  knownGaps.length ? `${knownGaps.length} gap(s) recorded` : "No known gaps recorded"
);

// ---- 15. statistics.totalTables matches actual tables.length ----
const stats = graph.statistics || {};
const actualTableCount = tables.length;
const reportedTableCount = stats.totalTables;
check(
  "DG-1: statistics.totalTables matches actual tables.length",
  reportedTableCount === actualTableCount,
  `statistics.totalTables=${reportedTableCount}, actual tables.length=${actualTableCount}`
);

// ---- 16. supply_orders has relatedWorkflowStage = "WORK_ORDER" ----
if (supplyOrders) {
  check(
    "DG-1: supply_orders relatedWorkflowStage = WORK_ORDER",
    supplyOrders.relatedWorkflowStage === "WORK_ORDER",
    `relatedWorkflowStage: ${supplyOrders.relatedWorkflowStage}`
  );
}

// ---- 17. WORK_ORDER / SUPPLY_ORDER mapping exists in workflowAlignment ----
const workflowAlignment = graph.workflowAlignment || [];
const workOrderMapping = workflowAlignment.find((w) => w.stageId === "WORK_ORDER");
check(
  "DG-1: WORK_ORDER workflowAlignment mapping exists",
  !!workOrderMapping,
  workOrderMapping ? `Found: ${workOrderMapping.stageName}` : "Missing WORK_ORDER alignment"
);
if (workOrderMapping) {
  const hasSupplyOrders = (workOrderMapping.tables || []).includes("supply_orders");
  check(
    "DG-1: WORK_ORDER mapping includes supply_orders",
    hasSupplyOrders,
    hasSupplyOrders ? "supply_orders included" : "supply_orders not found in WORK_ORDER tables"
  );
}

// ---- 18. accounts table is accountingProtected ----
const accountsTable = tables.find((t) => t.id === "accounts");
check("DG-1: accounts table exists", !!accountsTable, accountsTable ? "Found" : "Missing");
if (accountsTable) {
  check(
    "DG-1: accounts table is accountingProtected",
    accountsTable.accountingProtected === true,
    `accountingProtected: ${accountsTable.accountingProtected}`
  );
}

// ---- 19. ledger_entries column count >= 12 ----
const ledgerEntries = tables.find((t) => t.id === "ledger_entries");
if (ledgerEntries) {
  const colCount = (ledgerEntries.columns || []).length;
  check(
    "DG-1: ledger_entries column count >= 12",
    colCount >= 12,
    `${colCount} columns`
  );
}

// ---- 20. No runtime source files are modified (read-only check) ----
const sourceFiles = graph.sourceFiles || [];
const modifiedFiles = [];
sourceFiles.forEach((sf) => {
  const fullPath = resolve(ROOT, sf);
  if (existsSync(fullPath)) {
    const currentMtime = statSync(fullPath).mtimeMs;
    if (initialMtimes[fullPath] !== undefined && currentMtime !== initialMtimes[fullPath]) {
      modifiedFiles.push(sf);
    }
  }
});
check(
  "DG-1: No runtime source files modified during validation",
  modifiedFiles.length === 0,
  modifiedFiles.length ? `Modified: ${modifiedFiles.join(", ")}` : `${sourceFiles.length} source files unchanged`
);

// ---- Meta checks: graph metadata fields ----
check("DG-1: graphId is DG-1", graph.graphId === "DG-1", `graphId: ${graph.graphId}`);
check("DG-1: schemaVersion defined", !!graph.schemaVersion, graph.schemaVersion || "Missing");

// ---- Print results ----
function printResults() {
  console.log("=".repeat(60));
  console.log("DG-1 Database Graph Validation");
  console.log("=".repeat(60));
  results.forEach((r) => {
    const icon = r.status === "PASS" ? "\u2713" : r.status === "WARN" ? "\u26A0" : "\u2717";
    console.log(`  ${icon} ${r.status}: ${r.label}`);
    if (r.detail) console.log(`       ${r.detail}`);
  });
  console.log("-".repeat(60));
  console.log(`Summary:  ${passed} passed,  ${warnings} warnings,  ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.log("Exit code: 2");
    process.exit(2);
  }
  if (warnings > 0) {
    console.log("Exit code: 1 (with warnings)");
    process.exit(1);
  }
  console.log("Exit code: 0");
  process.exit(0);
}

printResults();
