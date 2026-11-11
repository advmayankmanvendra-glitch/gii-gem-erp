#!/usr/bin/env node
// verify-audit-graph.js — AG-1 Audit Intelligence Graph Validation
// Checks:
//  1. Audit graph exists at expected path.
//  2. Audit graph JSON is valid.
//  3. Schema exists.
//  4. AG-1 is registered in graph registry as Active with populated schema/location/validation.
//  5. All event IDs are unique.
//  6. Every event references a known module.
//  7. Every critical event appears in criticalActions.
//  8. Event actions map to documented severity values.
//  9. All mutations reference known tables and classify mutation severity.
// 10. Approval stages reference known audit actions.
// 11. metadata counts match the arrays they describe.
// 12. statistics counts match the event severity distribution.
// 13. No live business data present (no real record ids / user ids / amounts).
// 14. All sourceDocuments paths resolve.
// 15. trust boundaries and audit stores are present.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const AUDIT_GRAPH_PATH = resolve(ROOT, "src/renderer/knowledge/audit-graph.json");
const SCHEMA_PATH = resolve(ROOT, "repository/schema/audit-graph.schema.json");
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

// ---- 1. Audit graph exists ----
check(
  "AG-1: Audit graph file exists",
  existsSync(AUDIT_GRAPH_PATH),
  AUDIT_GRAPH_PATH
);

if (!existsSync(AUDIT_GRAPH_PATH)) {
  printResults();
  process.exit(1);
}

// ---- 2. JSON is valid ----
let graph;
try {
  const raw = readFileSync(AUDIT_GRAPH_PATH, "utf-8");
  graph = JSON.parse(raw);
  check("AG-1: JSON is valid", true, "Parsed successfully");
} catch (e) {
  check("AG-1: JSON is valid", false, e.message);
  printResults();
  process.exit(1);
}

// ---- 3. Schema exists ----
if (existsSync(SCHEMA_PATH)) {
  check("AG-1: Schema file exists", true, SCHEMA_PATH);
} else {
  warn("AG-1: Schema file not found", SCHEMA_PATH);
}

// ---- 4. AG-1 is registered in graph registry ----
if (existsSync(REGISTRY_PATH)) {
  try {
    const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
    const ag1Entry = registry.graphs?.find((g) => g.graphId === "AG-1");
    check("AG-1: Registered in graph registry", !!ag1Entry, ag1Entry ? `Status: ${ag1Entry?.status}` : "Not found");
    if (ag1Entry) {
      check("AG-1: Registry entry Active", ag1Entry.status === "Active", `Status = ${ag1Entry.status}`);
      check("AG-1: Registry entry schema populated", ag1Entry.schema !== "TBD", ag1Entry.schema);
      check("AG-1: Registry entry location populated", ag1Entry.location !== "TBD", ag1Entry.location);
      check("AG-1: Registry entry validation method populated", ag1Entry.validationMethod !== "TBD", ag1Entry.validationMethod);
    }
  } catch (e) {
    check("AG-1: Registry parseable", false, e.message);
  }
} else {
  check("AG-1: Registry file exists", false, REGISTRY_PATH);
}

// ---- 4b. EIL contract fields present ----
const requiredTopLevel = [
  "schemaVersion", "graphId", "generatedAt", "owner", "description",
  "dependencies", "relationships", "risk", "metadata", "statistics",
  "compatibility", "futureExtensions"
];
const missingTopLevel = requiredTopLevel.filter((f) => graph[f] === undefined);
check(
  "AG-1: EIL schema contract fields present",
  missingTopLevel.length === 0,
  missingTopLevel.length ? `Missing: ${missingTopLevel.join(", ")}` : `${requiredTopLevel.length} required fields present`
);
check("AG-1: graphId = AG-1", graph.graphId === "AG-1", `graphId = ${graph.graphId}`);
check("AG-1: schemaVersion = 1.0.0", graph.schemaVersion === "1.0.0", `schemaVersion = ${graph.schemaVersion}`);
check("AG-1: status = active", graph.status === "active", `status = ${graph.status}`);

// ---- 5. All event IDs are unique ----
const eventIds = graph.eventCatalog?.map((e) => e.eventId) || [];
const uniqueEventIds = new Set(eventIds);
check(
  "AG-1: All event IDs unique",
  eventIds.length === uniqueEventIds.size,
  `${eventIds.length} events, ${uniqueEventIds.size} unique IDs`
);

// ---- 6. Every event references a known module ----
const moduleIds = new Set(graph.modules?.map((m) => m.moduleId) || []);
const unknownModuleEvents = eventIds.filter((_, i) => !moduleIds.has(graph.eventCatalog[i].module));
check(
  "AG-1: Every event references a known module",
  unknownModuleEvents.length === 0,
  unknownModuleEvents.length ? `Unknown modules: ${unknownModuleEvents.join(", ")}` : `${eventIds.length} events reference known modules`
);

// ---- 7. Every critical event appears in criticalActions ----
const criticalSet = new Set(graph.criticalActions || []);
const criticalEvents = graph.eventCatalog?.filter((e) => e.severity === "critical") || [];
const criticalMissingFromList = criticalEvents
  .map((e) => e.action)
  .filter((action) => !criticalSet.has(action));
const criticalListNotInEvents = [...criticalSet].filter(
  (action) => !graph.eventCatalog?.some((e) => e.action === action)
);
check(
  "AG-1: All critical events listed in criticalActions",
  criticalMissingFromList.length === 0 && criticalListNotInEvents.length === 0,
  criticalMissingFromList.length
    ? `Missing from criticalActions: ${criticalMissingFromList.join(", ")}`
    : criticalListNotInEvents.length
      ? `criticalActions without event: ${criticalListNotInEvents.join(", ")}`
      : `${criticalEvents.length} critical events match criticalActions`
);

// ---- 8. Event actions map to documented severity ----
const validSeverity = new Set(["critical", "sensitive", "informational"]);
const invalidSeverityEvents = graph.eventCatalog?.filter((e) => !validSeverity.has(e.severity)) || [];
check(
  "AG-1: All events have valid severity",
  invalidSeverityEvents.length === 0,
  invalidSeverityEvents.length ? `Invalid severity: ${invalidSeverityEvents.map((e) => e.eventId).join(", ")}` : "All severities valid"
);

// ---- 9. All mutations reference known tables and classify severity ----
const mutationTables = graph.mutations?.map((m) => m.tableName) || [];
const auditStoreTables = new Set(graph.auditStores?.map((s) => s.tableName) || []);
const knownTableRefs = new Set([
  ...mutationTables,
  ...auditStoreTables,
  "vouchers", "voucher_lines", "ledger_entries", "guided_vouchers",
  "receivables", "payables", "allocation_audit", "stock_inwards",
  "stock_outwards", "stock_adjustments", "stock_returns", "financial_years",
  "year_end_closings", "opening_balances", "users", "voucher_proposals",
  "voucher_proposal_audit", "import_batches", "items", "invoices",
  "documents", "supply_orders", "procurement_plans", "purchase_orders",
  "system", "bank_statement_imports", "bank_statement_entries",
  "account_group_assignments", "credit_terms", "warehouse_transfers",
  "delivery_challans", "stock_reservations", "accounts", "varies"
]);
const invalidMutationSev = graph.mutations?.filter((m) => !validSeverity.has(m.mutationSeverity)) || [];
const invalidMutationTable = graph.mutations?.filter((m) => !knownTableRefs.has(m.tableName)) || [];
check(
  "AG-1: Mutations have valid mutationSeverity",
  invalidMutationSev.length === 0,
  invalidMutationSev.length ? `Invalid: ${invalidMutationSev.map((m) => m.tableName).join(", ")}` : `${graph.mutations?.length || 0} mutations classified`
);
check(
  "AG-1: Mutations reference known tables",
  invalidMutationTable.length === 0,
  invalidMutationTable.length ? `Unknown: ${invalidMutationTable.map((m) => m.tableName).join(", ")}` : "All mutation tables recognized"
);

// ---- 10. Approval stages reference known audit actions ----
const catalogActions = new Set(graph.eventCatalog?.map((e) => e.action) || []);
const approvalActionErrors = [];
(graph.approvals || []).forEach((a) => {
  (a.stages || []).forEach((s) => {
    if (!catalogActions.has(s.auditAction)) approvalActionErrors.push(`${a.approvalId}:${s.stage}=${s.auditAction}`);
  });
});
check(
  "AG-1: Approval stages reference known audit actions",
  approvalActionErrors.length === 0,
  approvalActionErrors.length ? `Unresolved: ${approvalActionErrors.join("; ")}` : `${graph.approvals?.length || 0} approval flows resolve`
);

// ---- 11. metadata counts match the arrays ----
const meta = graph.metadata || {};
const metaChecks = [
  ["modules", graph.modules?.length],
  ["events", graph.eventCatalog?.length],
  ["mutations", graph.mutations?.length],
  ["actors", graph.actors?.length],
  ["approvals", graph.approvals?.length],
  ["complianceControls", graph.complianceControls?.length],
  ["criticalActions", graph.criticalActions?.length],
  ["auditStores", graph.auditStores?.length],
  ["trustBoundaries", graph.trustBoundaries?.length]
];
const metaMismatch = metaChecks.filter(([key, actual]) => meta[key] !== actual);
check(
  "AG-1: metadata counts match graph arrays",
  metaMismatch.length === 0,
  metaMismatch.length
    ? metaMismatch.map(([key, actual]) => `${key}: metadata=${meta[key]}, actual=${actual}`).join("; ")
    : "All metadata counts match"
);

// ---- 12. statistics counts match severity distribution ----
const stats = graph.statistics || {};
const criticalCount = criticalEvents.length;
const sensitiveCount = (graph.eventCatalog?.filter((e) => e.severity === "sensitive") || []).length;
const infoCount = (graph.eventCatalog?.filter((e) => e.severity === "informational") || []).length;
const statMismatch = [];
if (stats.totalEvents !== eventIds.length) statMismatch.push(`totalEvents=${stats.totalEvents} expected ${eventIds.length}`);
if (stats.criticalEvents !== criticalCount) statMismatch.push(`criticalEvents=${stats.criticalEvents} expected ${criticalCount}`);
if (stats.sensitiveEvents !== sensitiveCount) statMismatch.push(`sensitiveEvents=${stats.sensitiveEvents} expected ${sensitiveCount}`);
if (stats.informationalEvents !== infoCount) statMismatch.push(`informationalEvents=${stats.informationalEvents} expected ${infoCount}`);
check(
  "AG-1: statistics match event severity distribution",
  statMismatch.length === 0,
  statMismatch.length ? statMismatch.join("; ") : `total=${stats.totalEvents}, critical=${stats.criticalEvents}, sensitive=${stats.sensitiveEvents}, info=${stats.informationalEvents}`
);

// ---- 13. No live business data ----
const rawGraph = readFileSync(AUDIT_GRAPH_PATH, "utf-8");
const liveDataPatterns = [
  { re: /"record_id"\s*:\s*\d+/, label: "numeric record_id" },
  { re: /"user_id"\s*:\s*\d+/, label: "numeric user_id" },
  { re: /"company_id"\s*:\s*\d+/, label: "numeric company_id" },
  { re: /"amount"\s*:\s*\d+/, label: "amount value" },
  { re: /"voucher_number"\s*:\s*"/, label: "live voucher number" },
];
const liveDataHits = liveDataPatterns.filter((p) => p.re.test(rawGraph));
check(
  "AG-1: No live business data embedded",
  liveDataHits.length === 0,
  liveDataHits.length ? `Live data patterns: ${liveDataHits.map((p) => p.label).join(", ")}` : "No live business data found"
);

// ---- 14. All sourceDocuments paths resolve ----
const sourceMissing = (graph.sourceDocuments || []).filter((p) => !existsSync(resolve(ROOT, p)));
check(
  "AG-1: All sourceDocuments paths resolve",
  sourceMissing.length === 0,
  sourceMissing.length ? `Missing: ${sourceMissing.join("; ")}` : `${graph.sourceDocuments?.length || 0} source references resolve`
);

// ---- 15. trust boundaries and audit stores present ----
check(
  "AG-1: Audit stores present",
  Array.isArray(graph.auditStores) && graph.auditStores.length >= 3,
  `${graph.auditStores?.length || 0} audit stores`
);
check(
  "AG-1: Trust boundaries present",
  Array.isArray(graph.trustBoundaries) && graph.trustBoundaries.length > 0,
  `${graph.trustBoundaries?.length || 0} trust boundaries`
);
check(
  "AG-1: Compliance controls present",
  Array.isArray(graph.complianceControls) && graph.complianceControls.length > 0,
  `${graph.complianceControls?.length || 0} compliance controls`
);
check(
  "AG-1: Known gaps documented",
  Array.isArray(graph.knownGaps) && graph.knownGaps.length > 0,
  `${graph.knownGaps?.length || 0} known gaps`
);

// ---- Print results ----
function printResults() {
  console.log("=".repeat(60));
  console.log("AG-1 Audit Intelligence Graph Validation");
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
