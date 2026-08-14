// verify-manual-graph.js — KG-5 Document and Manual Graph Validation
// Checks:
//  1. KG-5 graph file exists and parses as JSON
//  2. KG-5 schema file exists
//  3. KG-5 identity (graphId, schemaVersion, status)
//  4. EIL schema contract fields present
//  5. Manual IDs unique; all manuals resolve to real files under docs/manuals/
//  6. Section indexes complete (non-zero, unique section IDs)
//  7. Cross-references resolve: featureRefs -> FF-1, workflowStageRefs -> WG-1,
//     screenRefs -> RG-1, reportRefs/errorRefs -> BRAIN-1
//  8. No live business data embedded
//  9. Registry sync: KG-5 registered Active with populated schema/location/validation
// 10. Statistics integrity
// Usage: node scripts/verify-manual-graph.js

import { existsSync, readFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GRAPH_PATH = join(ROOT, "src/renderer/knowledge/manual-graph.json");
const SCHEMA_PATH = join(ROOT, "repository/schema/manual-graph.schema.json");
const REGISTRY_PATH = join(ROOT, "repository/graph-registry.json");
const MANUALS_DIR = join(ROOT, "docs/manuals");

const EIL_CONTRACT_FIELDS = [
  "schemaVersion", "graphId", "generatedAt", "owner", "description",
  "dependencies", "relationships", "risk", "metadata", "statistics",
  "compatibility", "futureExtensions"
];

const results = [];
let warnings = 0;

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) warnings++;
  console.log(`  ${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

function warn(name, detail = "") {
  results.push({ name, ok: false, detail });
  warnings++;
  console.log(`  WARN: ${name}${detail ? ` — ${detail}` : ""}`);
}

console.log("\n=== KG-5 Document and Manual Graph Validation ===");

// 1. Graph file exists and parses
if (!existsSync(GRAPH_PATH)) {
  check("KG-5: Graph file exists", false, GRAPH_PATH);
} else {
  check("KG-5: Graph file exists", true, GRAPH_PATH);
  let graph;
  try {
    graph = JSON.parse(readFileSync(GRAPH_PATH, "utf-8"));
    check("KG-5: JSON is valid", true, "Parsed successfully");
  } catch (e) {
    check("KG-5: JSON is valid", false, e.message);
  }

  if (graph) {
    // 2. Schema file exists
    if (existsSync(SCHEMA_PATH)) check("KG-5: Schema file exists", true, SCHEMA_PATH);
    else warn("KG-5: Schema file not found", SCHEMA_PATH);

    // 3. Identity
    check("KG-5: graphId = KG-5", graph.graphId === "KG-5", `graphId = ${graph.graphId}`);
    check("KG-5: schemaVersion = 1.0.0", graph.schemaVersion === "1.0.0", `schemaVersion = ${graph.schemaVersion}`);
    check("KG-5: status = active", graph.status === "active", `status = ${graph.status}`);

    // 4. EIL contract fields
    const missing = EIL_CONTRACT_FIELDS.filter((f) => !(f in graph));
    check("KG-5: EIL schema contract fields present", missing.length === 0, missing.length ? `Missing: ${missing.join(", ")}` : "All present");

    // 5. Manual integrity
    const manuals = Array.isArray(graph.manuals) ? graph.manuals : [];
    check("KG-5: manuals array present", manuals.length > 0, `${manuals.length} manuals`);
    const ids = manuals.map((m) => m.manualId);
    check("KG-5: Manual IDs unique", new Set(ids).size === ids.length, `${ids.length} unique ids`);
    const missingFiles = manuals.filter((m) => !existsSync(join(MANUALS_DIR, m.fileName)));
    check("KG-5: All manual files resolve under docs/manuals/", missingFiles.length === 0, missingFiles.length ? `Missing: ${missingFiles.map((m) => m.fileName).join(", ")}` : `${manuals.length}/${manuals.length} resolve`);
    check("KG-5: All manuals have non-zero line counts", manuals.every((m) => m.lineCount > 0), "lineCount > 0 for all");
    check("KG-5: Section counts match section arrays", manuals.every((m) => m.sectionCount === m.sections.length), "counts match");

    const allSectionIds = manuals.flatMap((m) => m.sections.map((s) => s.sectionId));
    check("KG-5: Section IDs unique", new Set(allSectionIds).size === allSectionIds.length, `${allSectionIds.length} unique section ids`);
    check("KG-5: Every manual has sections", manuals.every((m) => m.sections.length > 0), "sectionCount > 0 for all");

    // 6. Cross-reference resolution
    const ff = JSON.parse(readFileSync(join(ROOT, "src/renderer/knowledge/feature-function-graph.json"), "utf-8"));
    const ffIds = new Set(ff.featureNodes.map((n) => n.id));

    const wg = JSON.parse(readFileSync(join(ROOT, "src/renderer/knowledge/workflow-graph.json"), "utf-8"));
    const wgIds = new Set(wg.nodes.map((n) => n.id));

    const rg = JSON.parse(readFileSync(join(ROOT, "src/renderer/knowledge/renderer-graph.json"), "utf-8"));
    const rgScreens = new Set(rg.screens.map((s) => s.path));

    const reports = JSON.parse(readFileSync(join(ROOT, "src/renderer/modules/erpBrain/repository/reports/index.json"), "utf-8"));
    const reportIds = new Set(reports.map((r) => r.id));

    const errors = JSON.parse(readFileSync(join(ROOT, "src/renderer/modules/erpBrain/repository/errors/index.json"), "utf-8"));
    const errorIds = new Set(errors.map((e) => e.id));

    const allFeatureRefs = manuals.flatMap((m) => m.featureRefs);
    const badFeatureRefs = [...new Set(allFeatureRefs.filter((r) => !ffIds.has(r)))];
    check("KG-5: Feature refs resolve in FF-1", badFeatureRefs.length === 0, badFeatureRefs.length ? `Unresolved: ${badFeatureRefs.join(", ")}` : `${allFeatureRefs.length} refs resolve`);

    const allStageRefs = manuals.flatMap((m) => m.workflowStageRefs);
    const badStageRefs = [...new Set(allStageRefs.filter((r) => !wgIds.has(r)))];
    check("KG-5: Workflow stage refs resolve in WG-1", badStageRefs.length === 0, badStageRefs.length ? `Unresolved: ${badStageRefs.join(", ")}` : `${allStageRefs.length} refs resolve`);

    const allScreenRefs = manuals.flatMap((m) => m.screenRefs);
    const badScreenRefs = [...new Set(allScreenRefs.filter((r) => !rgScreens.has(r)))];
    check("KG-5: Screen refs resolve in RG-1", badScreenRefs.length === 0, badScreenRefs.length ? `Unresolved: ${badScreenRefs.join(", ")}` : `${allScreenRefs.length} refs resolve`);

    const allReportRefs = manuals.flatMap((m) => m.reportRefs);
    const badReportRefs = [...new Set(allReportRefs.filter((r) => !reportIds.has(r)))];
    check("KG-5: Report refs resolve in BRAIN-1", badReportRefs.length === 0, badReportRefs.length ? `Unresolved: ${badReportRefs.join(", ")}` : `${allReportRefs.length} refs resolve`);

    const allErrorRefs = manuals.flatMap((m) => m.errorRefs);
    const badErrorRefs = [...new Set(allErrorRefs.filter((r) => !errorIds.has(r)))];
    check("KG-5: Error refs resolve in BRAIN-1", badErrorRefs.length === 0, badErrorRefs.length ? `Unresolved: ${badErrorRefs.join(", ")}` : `${allErrorRefs.length} refs resolve`);

    // 7. No live business data
    const graphText = JSON.stringify(graph);
    const livePatterns = [/₹/, /\bINV-\d{4,}/i, /\b[0-9]{2}-[0-9]{2}-[0-9]{4}\b/, /"(customer|supplier|vendor)":\s*"[A-Za-z][^" ]+/i, /balance:\s*\d+\.\d{2}/i];
    const liveHits = livePatterns.filter((re) => re.test(graphText));
    check("KG-5: No live business data embedded", liveHits.length === 0, liveHits.length ? `Suspicious patterns: ${liveHits.join(", ")}` : "Clean");

    // 8. Registry sync
    if (existsSync(REGISTRY_PATH)) {
      const reg = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
      const kg5Reg = reg.graphs?.find((g) => g.graphId === "KG-5");
      check("KG-5: Registered in graph registry", !!kg5Reg, kg5Reg ? `Status: ${kg5Reg?.status}` : "Not found");
      if (kg5Reg) {
        check("KG-5: Registry entry Active", kg5Reg.status === "Active", `Status = ${kg5Reg.status}`);
        check("KG-5: Registry schema populated", kg5Reg.schema !== "TBD", kg5Reg.schema);
        check("KG-5: Registry location populated", kg5Reg.location !== "TBD", kg5Reg.location);
        check("KG-5: Registry validation method populated", kg5Reg.validationMethod !== "TBD", kg5Reg.validationMethod);
      }
    } else {
      check("KG-5: Registry file exists", false, REGISTRY_PATH);
    }

    // 9. Statistics integrity
    const stats = graph.statistics || {};
    check("KG-5: statistics manualCount matches", stats.manualCount === manuals.length, `manualCount = ${stats.manualCount}`);
    check("KG-5: statistics sectionCount matches", stats.sectionCount === allSectionIds.length, `sectionCount = ${stats.sectionCount}`);
    const computedRefs = manuals.reduce((acc, m) => acc + m.featureRefs.length + m.workflowStageRefs.length + m.screenRefs.length + m.reportRefs.length + m.errorRefs.length, 0);
    check("KG-5: statistics referenceCount matches", stats.referenceCount === computedRefs, `referenceCount = ${stats.referenceCount}`);

    // 10. Known gaps and source documents
    check("KG-5: Known gaps documented", Array.isArray(graph.knownGaps) && graph.knownGaps.length > 0, `${graph.knownGaps?.length || 0} known gaps`);
    const docsMissing = (graph.sourceDocuments || []).filter((p) => !existsSync(join(ROOT, p)));
    check("KG-5: All source documents resolve", docsMissing.length === 0, docsMissing.length ? `Missing: ${docsMissing.join(", ")}` : `${graph.sourceDocuments?.length || 0} documents resolve`);
  }
}

const failed = warnings;
console.log("------------------------------------------------------------");
console.log(`KG-5 Verification:  ${results.length - failed} passed,  ${failed} failed (incl. warnings),  ${results.length} total`);
console.log("============================================================");
process.exit(failed > 0 ? (results.some((r) => !r.ok && !r.detail?.startsWith("WARN")) ? 2 : 1) : 0);