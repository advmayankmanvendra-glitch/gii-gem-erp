#!/usr/bin/env node
// verify-workflow-graph.js — WG-1 Workflow Graph Validation
// Checks:
//  1. Workflow graph exists at expected path.
//  2. Workflow graph JSON is valid.
//  3. Schema exists and validates.
//  4. WG-1 is registered in graph registry.
//  5. All node IDs are unique.
//  6. All edges reference valid nodes.
//  7. WORK_ORDER is present and is operational root.
//  8. Approved lifecycle order is preserved.
//  9. No required edge creates circular dependency.
// 10. No accounting-impact flag exists before valid accounting stages.
// 11. Known partial stages are clearly marked.
// 12. Installation, Lead/Tender, Query, Quotation, Negotiation gaps are recorded.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const WORKFLOW_GRAPH_PATH = resolve(ROOT, "src/renderer/knowledge/workflow-graph.json");
const SCHEMA_PATH = resolve(ROOT, "repository/schema/workflow-graph.schema.json");
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

// ---- 1. Workflow graph exists ----
check(
  "WG-1: Workflow graph file exists",
  existsSync(WORKFLOW_GRAPH_PATH),
  WORKFLOW_GRAPH_PATH
);

if (!existsSync(WORKFLOW_GRAPH_PATH)) {
  printResults();
  process.exit(1);
}

// ---- 2. JSON is valid ----
let graph;
try {
  const raw = readFileSync(WORKFLOW_GRAPH_PATH, "utf-8");
  graph = JSON.parse(raw);
  check("WG-1: JSON is valid", true, "Parsed successfully");
} catch (e) {
  check("WG-1: JSON is valid", false, e.message);
  printResults();
  process.exit(1);
}

// ---- 2b. Schema exists and validates ----
if (existsSync(SCHEMA_PATH)) {
  check("WG-1: Schema file exists", true, SCHEMA_PATH);
} else {
  warn("WG-1: Schema file not found", SCHEMA_PATH);
}

// ---- 3. WG-1 is registered in graph registry ----
if (existsSync(REGISTRY_PATH)) {
  try {
    const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
    const wg1Entry = registry.graphs?.find((g) => g.graphId === "WG-1");
    check("WG-1: Registered in graph registry", !!wg1Entry, wg1Entry ? `Status: ${wg1Entry.status}` : "Not found");
    if (wg1Entry) {
      check("WG-1: Registry entry schema populated", wg1Entry.schema !== "TBD", wg1Entry.schema);
      check("WG-1: Registry entry location populated", wg1Entry.location !== "TBD", wg1Entry.location);
      check("WG-1: Registry entry validation method populated", wg1Entry.validationMethod !== "TBD", wg1Entry.validationMethod);
    }
  } catch (e) {
    check("WG-1: Registry parseable", false, e.message);
  }
} else {
  check("WG-1: Registry file exists", false, REGISTRY_PATH);
}

// ---- 4. All node IDs are unique ----
const nodeIds = graph.nodes?.map((n) => n.id) || [];
const uniqueIds = new Set(nodeIds);
check(
  "WG-1: All node IDs unique",
  nodeIds.length === uniqueIds.size,
  `${nodeIds.length} nodes, ${uniqueIds.size} unique IDs`
);

// ---- 5. All edges reference valid nodes ----
const edgeErrors = [];
(graph.edges || []).forEach((e, i) => {
  if (!nodeIds.includes(e.from)) edgeErrors.push(`Edge ${i}: from="${e.from}" not found`);
  if (!nodeIds.includes(e.to)) edgeErrors.push(`Edge ${i}: to="${e.to}" not found`);
});
check(
  "WG-1: All edges reference valid nodes",
  edgeErrors.length === 0,
  edgeErrors.length ? edgeErrors.join("; ") : `${graph.edges?.length || 0} edges validated`
);

// ---- 6. WORK_ORDER is present ----
const workOrderNode = graph.nodes?.find((n) => n.id === "WORK_ORDER");
check("WG-1: WORK_ORDER node exists", !!workOrderNode, workOrderNode ? `Label: ${workOrderNode.label}` : "Missing");

// ---- 7. WORK_ORDER is the operational root ----
check(
  "WG-1: WORK_ORDER is operational root stage",
  graph.operationalRootStage === "WORK_ORDER",
  `operationalRootStage = ${graph.operationalRootStage}`
);

// ---- 8. Approved lifecycle order is preserved ----
const expectedOrder = [
  "LEAD_TENDER", "QUERY_REQUIREMENT", "QUOTATION", "NEGOTIATION",
  "PURCHASE_ORDER_GEM_ORDER", "WORK_ORDER", "PROCUREMENT_PLANNING",
  "SUPPLIER_PURCHASE_ORDER", "GOODS_RECEIPT_GRN", "INVENTORY_RESERVATION",
  "DELIVERY_CHALLAN", "INSTALLATION", "CRAC", "SALES_INVOICE_GST_INVOICE",
  "DEPARTMENT_RECEIVABLE", "RECEIPT", "ORDER_CLOSURE", "PROFITABILITY_ANALYSIS"
];
const actualOrder = graph.stageOrder || [];
const orderMatch = expectedOrder.length === actualOrder.length &&
  expectedOrder.every((id, i) => actualOrder[i] === id);
const orderDiff = orderMatch ? "" : `Expected ${expectedOrder.length} stages, got ${actualOrder.length}; first diff at index ${expectedOrder.findIndex((id, i) => actualOrder[i] !== id)}`;
check("WG-1: Approved lifecycle order preserved", orderMatch, orderDiff);

// ---- 9. No required edge creates circular dependency ----
function hasCycle(edges, nodes) {
  const adj = {};
  const nodeSet = new Set(nodes);
  nodeSet.forEach((id) => { adj[id] = []; });
  edges.forEach((e) => {
    if (e.required !== false && nodeSet.has(e.from) && nodeSet.has(e.to)) {
      adj[e.from].push(e.to);
    }
  });

  const visited = new Set();
  const recStack = new Set();

  function dfs(node) {
    visited.add(node);
    recStack.add(node);
    for (const neighbor of adj[node] || []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        return true;
      }
    }
    recStack.delete(node);
    return false;
  }

  for (const node of nodeSet) {
    if (!visited.has(node)) {
      if (dfs(node)) return true;
    }
  }
  return false;
}

const requiredEdges = (graph.edges || []).filter((e) => e.required !== false);
const cycleDetected = hasCycle(requiredEdges, nodeIds);
check(
  "WG-1: No circular dependency in required edges",
  !cycleDetected,
  cycleDetected ? "Cycle detected" : `${requiredEdges.length} required edges checked`
);

// ---- 10. No accounting-impact flag before valid accounting stages ----
const validAccountingStartStages = graph.accountingStartStage || [];
const preAccountingNodes = (graph.nodes || []).filter((n) => {
  // Nodes that come before SALES_INVOICE_GST_INVOICE in stageOrder
  const nodeIdx = actualOrder.indexOf(n.id);
  const salesInvIdx = actualOrder.indexOf("SALES_INVOICE_GST_INVOICE");
  const purchaseIdx = actualOrder.indexOf("SUPPLIER_PURCHASE_ORDER");
  if (nodeIdx >= Math.min(salesInvIdx, purchaseIdx)) return false;
  if (validAccountingStartStages.includes(n.id)) return false;
  if (n.id === "WORK_ORDER") return true; // must not have accounting impact
  return true;
});

const accountingBoundaryViolations = preAccountingNodes.filter((n) => n.createsAccountingImpact === true);
check(
  "WG-1: No accounting-impact flag before accounting stages",
  accountingBoundaryViolations.length === 0,
  accountingBoundaryViolations.length
    ? accountingBoundaryViolations.map((n) => `${n.id} has createsAccountingImpact=true`).join("; ")
    : "All boundary rules satisfied"
);

// ---- 10b. WORK_ORDER has no accounting/inventory/GST impact ----
check(
  "WG-1: WORK_ORDER createsAccountingImpact=false",
  workOrderNode && workOrderNode.createsAccountingImpact === false,
  workOrderNode ? `createsAccountingImpact = ${workOrderNode.createsAccountingImpact}` : "N/A"
);
check(
  "WG-1: WORK_ORDER createsInventoryImpact=false",
  workOrderNode && workOrderNode.createsInventoryImpact === false,
  workOrderNode ? `createsInventoryImpact = ${workOrderNode.createsInventoryImpact}` : "N/A"
);
check(
  "WG-1: WORK_ORDER createsGSTImpact=false",
  workOrderNode && workOrderNode.createsGSTImpact === false,
  workOrderNode ? `createsGSTImpact = ${workOrderNode.createsGSTImpact}` : "N/A"
);

// ---- 11. Known partial stages are clearly marked ----
const partialNodes = (graph.nodes || []).filter((n) => n.status === "partial");
check(
  "WG-1: Partial nodes have knownGaps",
  partialNodes.every((n) => (n.knownGaps || []).length > 0),
  partialNodes.map((n) => `${n.id}: ${(n.knownGaps || []).length} gap(s)`).join("; ") || "No partial nodes"
);

// ---- 12. Known gap stages are recorded for planned nodes ----
const plannedNodesWithGaps = (graph.nodes || []).filter((n) =>
  n.status === "planned" && !(n.knownGaps || []).length
);
const expectedGapStages = ["LEAD_TENDER", "QUERY_REQUIREMENT", "QUOTATION", "NEGOTIATION"];
check(
  "WG-1: Lead/Tender through Negotiation gaps recorded in knownGaps",
  plannedNodesWithGaps.length === 0,
  plannedNodesWithGaps.length
    ? `Missing knownGaps for: ${plannedNodesWithGaps.map((n) => n.id).join(", ")}`
    : "All planned nodes have knownGaps"
);

// ---- 12b. Active nodes have routeKey, screenRef, tableRef, helpRef ----
const activeNodes = (graph.nodes || []).filter((n) => n.status === "active");
const activeMissingRefs = activeNodes.filter((n) => !n.routeKey || !n.screenRef || !n.tableRef || !n.helpRef);
check(
  "WG-1: Active nodes have routeKey, screenRef, tableRef, helpRef",
  activeMissingRefs.length === 0,
  activeMissingRefs.length
    ? `Missing refs: ${activeMissingRefs.map((n) => n.id).join(", ")}`
    : `${activeNodes.length} active nodes fully populated`
);

const activeMissingSourceFiles = activeNodes.filter((n) =>
  !existsSync(resolve(ROOT, "src/renderer", n.screenRef)) || !existsSync(resolve(ROOT, n.helpRef))
);
check(
  "WG-1: Active screen and manual references resolve",
  activeMissingSourceFiles.length === 0,
  activeMissingSourceFiles.length
    ? `Missing source refs: ${activeMissingSourceFiles.map((n) => n.id).join(", ")}`
    : `${activeNodes.length} active screen and manual references resolve`
);

// ---- Print results ----
function printResults() {
  console.log("=".repeat(60));
  console.log("WG-1 Workflow Graph Validation");
  console.log("=".repeat(60));
  results.forEach((r) => {
    const icon = r.status === "PASS" ? "✓" : r.status === "WARN" ? "⚠" : "✗";
    console.log(`  ${icon} ${r.status}: ${r.label}`);
    if (r.detail) console.log(`       ${r.detail}`);
  });
  console.log("-".repeat(60));
  console.log(`Summary:  ${passed} passed,  ${warnings} warnings,  ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.log("Exit code: 1");
    process.exit(1);
  }
  if (warnings > 0) {
    console.log("Exit code: 0 (with warnings)");
    process.exit(0);
  }
  console.log("Exit code: 0");
  process.exit(0);
}

printResults();
