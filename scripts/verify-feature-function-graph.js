#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const FF_GRAPH_PATH = resolve(ROOT, "src/renderer/knowledge/feature-function-graph.json");
const SCHEMA_PATH = resolve(ROOT, "repository/schema/feature-function-graph.schema.json");
const REGISTRY_PATH = resolve(ROOT, "repository/graph-registry.json");

let passed = 0, failed = 0, total = 0;

function pad(n) { return n.toString().padStart(2, "0"); }

function check(label, condition, detail) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ${pad(total)}. \u2713   ${label}`);
    if (detail) console.log(`       ${detail}`);
  } else {
    failed++;
    console.log(`  ${pad(total)}. \u2717   ${label}`);
    if (detail) console.log(`       ${detail}`);
  }
}

function hasOwn(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

console.log("============================================================");
console.log("FF-1 Feature Function Correlation Graph — Verification");
console.log("============================================================\n");

// 1. FF-1 graph exists
check("FF1-01: FF-1 graph file exists",
  existsSync(FF_GRAPH_PATH), FF_GRAPH_PATH);

if (!existsSync(FF_GRAPH_PATH)) {
  printSummary();
  process.exit(1);
}

const graph = JSON.parse(readFileSync(FF_GRAPH_PATH, "utf-8"));

// 2. FF-1 schema exists
check("FF1-02: FF-1 schema file exists",
  existsSync(SCHEMA_PATH), SCHEMA_PATH);

// 3. Graph validates basic structure
check("FF1-03: graphId is FF-1",
  graph.graphId === "FF-1", `graphId=${graph.graphId}`);

check("FF1-04: version exists",
  typeof graph.version === "string" && graph.version.length > 0, `version=${graph.version}`);

check("FF1-05: schemaVersion is 1.0.0",
  graph.schemaVersion === "1.0.0", `schemaVersion=${graph.schemaVersion}`);

// 4. Feature IDs are unique
const featureIds = graph.featureNodes.map((f) => f.id);
const uniqueFeatureIds = new Set(featureIds);
check("FF1-06: feature node IDs are unique",
  uniqueFeatureIds.size === featureIds.length,
  `${featureIds.length} features, ${uniqueFeatureIds.size} unique IDs`);

// 5. Function IDs are unique
const funcIds = graph.functionNodes.map((f) => f.id);
const uniqueFuncIds = new Set(funcIds);
check("FF1-07: function node IDs are unique",
  uniqueFuncIds.size === funcIds.length,
  `${funcIds.length} functions, ${uniqueFuncIds.size} unique IDs`);

// 6. All 50 required features present
const requiredFeatureIds = Array.from({ length: 50 }, (_, i) => `FEA-${String(i + 1).padStart(2, "0")}`);
const presentFeatures = requiredFeatureIds.filter((id) => featureIds.includes(id));
check("FF1-08: all 50 required features present",
  presentFeatures.length === 50,
  `${presentFeatures.length}/50 present. Missing: ${requiredFeatureIds.filter(id => !featureIds.includes(id)).join(", ") || "none"}`);

// 7. Active features have purpose, canonicalName, aliases, safetyBoundary, preferredSourceGraph
const activeFeatures = graph.featureNodes.filter((f) => f.status === "active");
let activeValid = true;
for (const f of activeFeatures) {
  if (!f.canonicalName) { activeValid = false; break; }
  if (!Array.isArray(f.aliases) || f.aliases.length === 0) { activeValid = false; break; }
  if (!f.whatThisFeatureDoes) { activeValid = false; break; }
  if (!f.safetyBoundary) { activeValid = false; break; }
  if (!f.preferredSourceGraph) { activeValid = false; break; }
  if (!f.whatThisFeatureDoesNotDo) { activeValid = false; break; }
}
check("FF1-09: active features have canonicalName, aliases, purpose, safetyBoundary, preferredSourceGraph, whatThisFeatureDoesNotDo",
  activeValid, `${activeFeatures.length} active features checked`);

// 8. Every feature has whatThisFeatureDoes and whatThisFeatureDoesNotDo
let hasDoAndDoNot = true;
for (const f of graph.featureNodes) {
  if (!f.whatThisFeatureDoes || !f.whatThisFeatureDoesNotDo) { hasDoAndDoNot = false; break; }
}
check("FF1-10: every feature has whatThisFeatureDoes and whatThisFeatureDoesNotDo",
  hasDoAndDoNot, `${graph.featureNodes.length} features checked`);

// 9. Work Order / Supply Order exists
const wo = graph.featureNodes.find((f) => f.id === "FEA-11");
check("FF1-11: Work Order / Supply Order exists (FEA-11)",
  wo !== undefined, wo ? `canonicalName=${wo.canonicalName}` : "NOT FOUND");

// 10. Work Order maps to supply_orders and WORK_ORDER
check("FF1-12: Work Order maps to supply_orders table",
  wo && wo.databaseTables && wo.databaseTables.includes("supply_orders"),
  wo ? `tables=${wo.databaseTables.join(", ")}` : "feature not found");

check("FF1-13: Work Order maps to WORK_ORDER workflow stage",
  wo && wo.workflowStage === "WORK_ORDER",
  wo ? `workflowStage=${wo.workflowStage}` : "feature not found");

// 11. Work Order has no direct accounting impact
check("FF1-14: Work Order has createsAccountingImpact=false",
  wo && wo.createsAccountingImpact === false,
  wo ? `createsAccountingImpact=${wo.createsAccountingImpact}` : "feature not found");

check("FF1-15: Work Order has createsInventoryImpact=false",
  wo && wo.createsInventoryImpact === false,
  wo ? `createsInventoryImpact=${wo.createsInventoryImpact}` : "feature not found");

check("FF1-16: Work Order has createsGSTImpact=false",
  wo && wo.createsGSTImpact === false,
  wo ? `createsGSTImpact=${wo.createsGSTImpact}` : "feature not found");

// 12. Voucher Dashboard exists and is accounting-sensitive
const vd = graph.featureNodes.find((f) => f.id === "FEA-27");
check("FF1-17: Voucher Dashboard exists (FEA-27)",
  vd !== undefined, vd ? `canonicalName=${vd.canonicalName}` : "NOT FOUND");

check("FF1-18: Voucher Dashboard has accounting-sensitive safety boundary",
  vd && vd.safetyBoundary === "accounting-sensitive",
  vd ? `safetyBoundary=${vd.safetyBoundary}` : "feature not found");

// 13. Reports feature exists
const reportsFeat = graph.featureNodes.find((f) => f.id === "FEA-29" || f.id === "FEA-30" || f.id === "FEA-31" || f.id === "FEA-32");
check("FF1-19: Trial Balance / P&L / Balance Sheet / Ledger feature exists",
  reportsFeat !== undefined, reportsFeat ? `feature=${reportsFeat.canonicalName}` : "no report feature found");

// 14. Bill History exists
const bh = graph.featureNodes.find((f) => f.id === "FEA-20");
check("FF1-20: Bill History exists (FEA-20)",
  bh !== undefined, bh ? `canonicalName=${bh.canonicalName}` : "NOT FOUND");

// 15. Trial Balance maps to ledger_entries
const tb = graph.featureNodes.find((f) => f.id === "FEA-29");
check("FF1-21: Trial Balance maps to ledger_entries",
  tb && tb.databaseTables && tb.databaseTables.includes("ledger_entries"),
  tb ? `tables=${tb.databaseTables.join(", ")}` : "feature not found");

// 16. Alias map has minimum entries
const aliasCount = Object.keys(graph.aliasMap || {}).length;
check("FF1-22: aliasMap has at least 20 entries",
  aliasCount >= 20, `${aliasCount} aliases`);

// 17. Known gaps recorded
check("FF1-23: knownGaps array has entries",
  Array.isArray(graph.knownGaps) && graph.knownGaps.length > 0,
  `${graph.knownGaps.length} gaps recorded`);

// 18. Natural question map has entries
const nqCount = Object.keys(graph.naturalQuestionMap || {}).length;
check("FF1-24: naturalQuestionMap has at least 10 entries",
  nqCount >= 10, `${nqCount} features with natural questions`);

// 19. Safety boundary map covers all features
const sbCount = Object.keys(graph.safetyBoundaryMap || {}).length;
check("FF1-25: safetyBoundaryMap covers at least 5 entries",
  sbCount >= 5, `${sbCount} safety boundaries mapped`);

// 20. FF-1 registered in graph registry
const registryExists = existsSync(REGISTRY_PATH);
let ff1Registered = false;
if (registryExists) {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
  ff1Registered = registry.graphs && registry.graphs.some((g) => g.graphId === "FF-1");
}
check("FF1-26: FF-1 registered in graph-registry.json",
  ff1Registered, registryExists ? "found" : "registry not found");

// 21. Graph has correlation edges
check("FF1-27: correlationEdges array has entries",
  Array.isArray(graph.correlationEdges) && graph.correlationEdges.length > 0,
  `${graph.correlationEdges.length} edges`);

// 22. Edge references are valid (from/to point to existing feature or function nodes)
// For certain relationship types, 'to' may reference external objects (table names, etc.)
const allNodeIds = [...featureIds, ...funcIds];
const externalRefTypes = ["feature_uses_table", "feature_creates_voucher", "feature_affects_report", "feature_has_screen", "feature_belongs_to_workflow_stage", "feature_explained_by_manual"];
let edgeRefsValid = true;
let invalidEdges = [];
if (graph.correlationEdges) {
  for (let i = 0; i < graph.correlationEdges.length; i++) {
    const e = graph.correlationEdges[i];
    const fromValid = allNodeIds.includes(e.from);
    const toValid = allNodeIds.includes(e.to) || externalRefTypes.includes(e.relationshipType);
    if (!fromValid || !toValid) {
      edgeRefsValid = false;
      invalidEdges.push(`${e.from}->${e.to} (type=${e.relationshipType}, fromOk=${fromValid}, toOk=${toValid})`);
    }
  }
}
check("FF1-28: all edge from references are valid feature/function nodes; to references valid or external",
  edgeRefsValid,
  edgeRefsValid ? `${graph.correlationEdges.length} edges valid` : `invalid (first 3): ${invalidEdges.slice(0, 3).join("; ")}`);

// 23. Receipt Voucher feature exists
const rv = graph.featureNodes.find((f) => f.id === "FEA-22");
check("FF1-29: Receipt Voucher exists (FEA-22)",
  rv !== undefined, rv ? `canonicalName=${rv.canonicalName}` : "NOT FOUND");

// 24. Correlation edges include safety boundary type
const safetyEdges = graph.correlationEdges ? graph.correlationEdges.filter((e) => e.relationshipType === "feature_requires_safety_boundary").length : 0;
check("FF1-30: correlation edges include feature_requires_safety_boundary relationships",
  safetyEdges > 0, `${safetyEdges} safety boundary edges`);

// 25. Every active feature has at least one source reference
let allHaveSources = true;
for (const f of graph.featureNodes) {
  if (f.status === "active" && (!Array.isArray(f.sourceReferences) || f.sourceReferences.length === 0)) {
    allHaveSources = false;
    break;
  }
}
check("FF1-31: active features have at least one source reference",
  allHaveSources, `${activeFeatures.length} active features with sources`);

// ---- Summary ----
console.log("\n------------------------------------------------------------");
console.log(`FF-1 Verification:  ${passed} passed,  ${failed} failed,  ${total} total`);
console.log("============================================================");

process.exit(failed > 0 ? 1 : 0);
