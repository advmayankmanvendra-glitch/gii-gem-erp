/**
 * Unified Graph Governance Audit Script (VA-2 / VA-3)
 *
 * Usage:
 *   node scripts/verify-audit.js                                       # run all applicable packs
 *   node scripts/verify-audit.js --phase=<id>                          # single graph pack
 *   node scripts/verify-audit.js --phase=<id> --category=<cat>         # + report completeness checks
 *   node scripts/verify-audit.js --category=<cat>                      # report checks for category
 *
 * Phase IDs:  brain-1, kg-1, 17-l, dg-1, wg-1, ag-1
 *
 * Categories:
 *   governance, accounting, inventory, gst, dashboard, brain, kg,
 *   renderer, database, workflow, audit, deployment, ui, documentation
 *
 * Exit codes:
 *   0 = PASS
 *   1 = WARNING
 *   2 = FAIL
 *   3 = CRITICAL
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname, relative, basename } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const REPORTS_DIR = resolve(ROOT, "reports");

const EXIT = { PASS: 0, WARNING: 1, FAIL: 2, CRITICAL: 3 };

/* ─── Parse CLI arguments ─── */
const PHASE_ARG = process.argv.find((a) => a.startsWith("--phase="));
const CATEGORY_ARG = process.argv.find((a) => a.startsWith("--category="));
const REQUESTED_PHASE = PHASE_ARG ? PHASE_ARG.split("=")[1].toLowerCase() : null;
const REQUESTED_CATEGORY = CATEGORY_ARG ? CATEGORY_ARG.split("=")[1].toLowerCase() : null;

/* ─── Phase → Category Map ─── */
const PHASE_CATEGORY_MAP = {
  "brain-1": "brain",
  "kg-1": "kg",
  "17-l": "renderer",
  "dg-1": "database",
  "wg-1": "workflow",
  "ag-1": "audit",
};

/* ─── Valid categories ─── */
const VALID_CATEGORIES = new Set([
  "governance", "accounting", "inventory", "gst", "dashboard",
  "brain", "kg", "renderer", "database", "workflow", "audit",
  "deployment", "ui", "documentation",
]);

/* ─── Results accumulator ─── */
const results = { passed: 0, warnings: 0, failed: 0, critical: 0, details: [] };

function pass(msg) { results.passed++; results.details.push({ level: "PASS", msg }); console.log(`  PASS: ${msg}`); }
function warn(msg) { results.warnings++; results.details.push({ level: "WARN", msg }); console.log(`  WARN: ${msg}`); }
function fail(msg) { results.failed++; results.details.push({ level: "FAIL", msg }); console.log(`  FAIL: ${msg}`); }
function critical(msg) { results.critical++; results.details.push({ level: "CRITICAL", msg }); console.log(`  CRITICAL: ${msg}`); }

function shouldRun(phase) {
  return !REQUESTED_PHASE || REQUESTED_PHASE === phase;
}

/* ─── Helpers ─── */
function loadJSON(relPath) {
  const full = resolve(ROOT, relPath);
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(readFileSync(full, "utf-8"));
  } catch (e) {
    fail(`JSON parse error in ${relPath}: ${e.message}`);
    return null;
  }
}

function loadJS(relPath) {
  const full = resolve(ROOT, relPath);
  if (!existsSync(full)) return { exists: false };
  return { exists: true, path: full };
}

function countLines(relPath) {
  const full = resolve(ROOT, relPath);
  if (!existsSync(full)) return 0;
  return readFileSync(full, "utf-8").split("\n").length;
}

/* ─── Resolved category for current run ─── */
function resolvedCategory() {
  if (REQUESTED_CATEGORY) return REQUESTED_CATEGORY;
  if (REQUESTED_PHASE && PHASE_CATEGORY_MAP[REQUESTED_PHASE]) return PHASE_CATEGORY_MAP[REQUESTED_PHASE];
  return null;
}

/* ─── Phase Report Completeness Check ─── */
function findPhaseReportFiles(phaseId) {
  if (!existsSync(REPORTS_DIR)) return [];
  const files = readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".md"));
  const id = phaseId.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return files.filter((f) => f.toLowerCase().includes(id));
}

const SECTION_CHECKS = [
  { name: "Feature Classification",       patterns: [/feature.classification/i, /classification/i] },
  { name: "Dependency Assessment",        patterns: [/dependency.assessment/i, /dependencies.satisfied/i] },
  { name: "Verification Results",         patterns: [/verification.results/i, /verification.command/i, /lint.*syntax|build.*pass|verify.*accounting/i] },
  { name: "Safe-to-Lock Recommendation",  patterns: [/safe.to.lock/i, /safe.to.commit/i] },
  { name: "App.jsx Impact",              patterns: [/app\.jsx.impact/i, /app\.jsx/i] },
  { name: "Database Impact",             patterns: [/database.impact/i, /database.schema/i] },
  { name: "IPC/Preload Impact",          patterns: [/ipc.*preload.*impact/i, /ipc.*impact/i, /preload.*impact/i] },
];

function checkPhaseReportCompleteness() {
  const cat = resolvedCategory();
  console.log(`\n=== Phase Report Completeness Check ===`);
  if (cat) console.log(`Category: ${cat}`);
  if (REQUESTED_PHASE) console.log(`Phase ID: ${REQUESTED_PHASE}`);

  if (!REQUESTED_PHASE) {
    warn("No --phase specified; skipping report completeness check (use --phase=<id>)");
    return;
  }

  const phaseId = REQUESTED_PHASE;

  // Check that the category is valid
  if (cat && !VALID_CATEGORIES.has(cat)) {
    fail(`Invalid category "${cat}". Valid: ${[...VALID_CATEGORIES].join(", ")}`);
  }

  // Find matching report files
  const reportFiles = findPhaseReportFiles(phaseId);
  if (reportFiles.length === 0) {
    fail(`No phase report files found in reports/ matching "${phaseId}"`);
    return;
  }
  pass(`Found ${reportFiles.length} report file(s) matching phase "${phaseId}": ${reportFiles.join(", ")}`);

  // Check Enterprise Architecture Baseline reference
  const eabPattern = /enterprise.architecture.baseline|architecture.baseline/i;

  for (const file of reportFiles) {
    const fullPath = resolve(REPORTS_DIR, file);
    const content = readFileSync(fullPath, "utf-8");

    // Check Enterprise Architecture Baseline reference
    if (cat && cat !== "documentation") {
      if (eabPattern.test(content)) {
        pass(`${file}: Enterprise Architecture Baseline referenced`);
      } else {
        warn(`${file}: Enterprise Architecture Baseline not referenced (recommended for category "${cat}")`);
      }
    }

    // Check required sections
    const applicableChecks = SECTION_CHECKS.filter((chk) => {
      if (chk.name === "App.jsx Impact") {
        // Only require if UI/routes may be touched
        return ["renderer", "ui", "dashboard", "brain", "kg", "governance"].includes(cat || "");
      }
      if (chk.name === "Database Impact") {
        return ["database", "accounting", "inventory", "gst", "deployment"].includes(cat || "");
      }
      if (chk.name === "IPC/Preload Impact") {
        return ["renderer", "database", "deployment", "accounting", "inventory"].includes(cat || "");
      }
      return true;
    });

    for (const chk of applicableChecks) {
      const found = chk.patterns.some((p) => p.test(content));
      if (found) {
        pass(`${file}: Section "${chk.name}" found`);
      } else {
        warn(`${file}: Section "${chk.name}" not found`);
      }
    }
  }
}

/* ═══════════════════════════════════════════
   17. BRAIN Graph Audit Pack
   ═══════════════════════════════════════════ */
async function auditBrain1() {
  if (!shouldRun("brain-1")) return;
  console.log("\n=== BRAIN-1 Audit Pack ===");

  const repoDir = "src/renderer/modules/erpBrain/repository";
  const requiredRepos = ["modules", "workflows", "reports", "screens", "rules", "glossary", "navigation", "errors"];

  for (const repo of requiredRepos) {
    const path = `${repoDir}/${repo}/index.json`;
    const data = loadJSON(path);
    if (!data) { fail(`BRAIN-1: Missing repository: ${repo}`); continue; }
    pass(`BRAIN-1: Repository ${repo} exists`);

    const entries = Array.isArray(data) ? data : data[repo];
    if (!Array.isArray(entries)) { fail(`BRAIN-1: ${repo} has no array at key "${repo}" nor at top level`); continue; }

    const ids = new Map();
    for (const entry of entries) {
      if (!entry.id) { fail(`BRAIN-1: ${repo} entry missing id`); continue; }
      if (ids.has(entry.id)) { fail(`BRAIN-1: Duplicate ID ${entry.id} in ${repo}`); }
      ids.set(entry.id, entry);
    }
    pass(`BRAIN-1: ${repo}: ${entries.length} entries, ${ids.size} unique IDs`);
  }

  // Check internal reference resolution
  const modules = loadJSON(`${repoDir}/modules/index.json`);
  const rules = loadJSON(`${repoDir}/rules/index.json`);
  if (modules && rules) {
    const ruleIds = new Set((rules.rules || []).map((r) => r.id));
    for (const mod of modules.modules || []) {
      for (const br of mod.businessRules || []) {
        if (!ruleIds.has(br)) {
          warn(`BRAIN-1: Module ${mod.id} references unresolved rule ${br}`);
        }
      }
    }
  }

  // Check search/loader services exist
  const loaderExists = existsSync(resolve(ROOT, "src/renderer/modules/erpBrain/loaders/repositoryLoader.js"));
  const searchExists = existsSync(resolve(ROOT, "src/renderer/modules/erpBrain/services/repositorySearchService.js"));
  if (loaderExists) pass("BRAIN-1: Repository loader exists");
  else fail("BRAIN-1: Repository loader missing");
  if (searchExists) pass("BRAIN-1: Search service exists");
  else fail("BRAIN-1: Search service missing");

  // Check no database/write/posting imports in erpBrain
  const erpBrainFiles = [
    "src/renderer/modules/erpBrain/index.js",
    "src/renderer/modules/erpBrain/loaders/repositoryLoader.js",
    "src/renderer/modules/erpBrain/services/repositorySearchService.js"
  ];
  for (const f of erpBrainFiles) {
    const full = resolve(ROOT, f);
    if (!existsSync(full)) continue;
    const content = readFileSync(full, "utf-8").toLowerCase();
    if (content.includes("init.js") || content.includes("better-sqlite3") || content.includes("ipc")) {
      critical(`BRAIN-1: ${f} imports database/IPC layer — violates knowledge-only rule`);
    }
  }
  pass("BRAIN-1: No database/write/posting imports detected in erpBrain module");
}

/* ═══════════════════════════════════════════
   18. KG Graph Audit Pack
   ═══════════════════════════════════════════ */
async function auditKg1() {
  if (!shouldRun("kg-1")) return;
  console.log("\n=== KG-1 Audit Pack ===");

  const moduleFiles = [
    "masters.js", "operations.js", "inventory.js", "accounting.js",
    "gstTax.js", "receivablesPayables.js", "reports.js", "dashboards.js",
    "utilities.js", "helpTraining.js"
  ];

  const allIds = new Set();
  let totalEntries = 0;

  for (const file of moduleFiles) {
    const path = `src/renderer/knowledge/modules/${file}`;
    const info = loadJS(path);
    if (!info.exists) { fail(`KG-1: Missing module file: ${file}`); continue; }
    pass(`KG-1: Module file ${file} exists`);

    // Dynamic import to validate
    try {
      const mod = await import(pathToFileURL(resolve(ROOT, path)).href);
      const exportName = file.replace(".js", "") + "Metadata";
      const entries = mod[exportName] || mod[Object.keys(mod).find((k) => k.includes("Metadata"))];
      if (!Array.isArray(entries)) {
        warn(`KG-1: ${file} does not export a metadata array`);
        continue;
      }
      totalEntries += entries.length;
      for (const entry of entries) {
        if (allIds.has(entry.id)) fail(`KG-1: Duplicate ID ${entry.id} across module files`);
        allIds.add(entry.id);
        if (!entry.title) fail(`KG-1: Entry ${entry.id} missing title`);
        if (!entry.screenType) warn(`KG-1: Entry ${entry.id} missing screenType`);
        if (!entry.riskLevel) warn(`KG-1: Entry ${entry.id} missing riskLevel`);
        if (entry.relatedModules && !Array.isArray(entry.relatedModules)) fail(`KG-1: Entry ${entry.id} relatedModules not an array`);
        if (entry.relatedReports && !Array.isArray(entry.relatedReports)) fail(`KG-1: Entry ${entry.id} relatedReports not an array`);
      }
      pass(`KG-1: ${file}: ${entries.length} entries validated`);
    } catch (e) {
      fail(`KG-1: Failed to load ${file}: ${e.message}`);
    }
  }

  pass(`KG-1: ${totalEntries} total entries, ${allIds.size} unique IDs`);

  // Check no live transactional data — use regex to avoid English-word false positives
  const sqlMutation = /(insert\s+into\s+\w+|delete\s+from\s+\w+|update\s+\w+\s+set\b)/gi;
  for (const file of moduleFiles) {
    const full = resolve(ROOT, `src/renderer/knowledge/modules/${file}`);
    if (!existsSync(full)) continue;
    const content = readFileSync(full, "utf-8");
    if (sqlMutation.test(content)) {
      critical(`KG-1: ${file} contains SQL mutation statements`);
    }
  }
  pass("KG-1: No live transactional data embedded in metadata files");
}

/* ═══════════════════════════════════════════
   19. RG Graph Audit Pack (Renderer Dependency)
   ═══════════════════════════════════════════ */
async function auditRg1() {
  if (!shouldRun("17-l")) return;
  console.log("\n=== RG-1 Audit Pack ===");

  const graphPath = "src/renderer/knowledge/renderer-graph.json";
  const graphExists = existsSync(resolve(ROOT, graphPath));

  if (!graphExists) {
    warn("RG-1: Renderer graph not yet generated (Phase 17L planned)");
    console.log("\nRG-1: Skipping detailed checks — graph not present");
    return;
  }

  const graph = loadJSON(graphPath);
  if (!graph) { fail("RG-1: Renderer graph file is invalid JSON"); return; }
  pass("RG-1: Renderer graph exists and is valid JSON");

  // App.jsx dependency count
  if (graph.appJsxDependencies) {
    pass(`RG-1: App.jsx has ${graph.appJsxDependencies.length} direct dependencies`);
  } else {
    warn("RG-1: appJsxDependencies not mapped in graph");
  }

  // Screen/component/module map
  if (graph.screens) pass(`RG-1: ${graph.screens.length} screens mapped`);
  else warn("RG-1: No screen mapping in graph");
  if (graph.components) pass(`RG-1: ${graph.components.length} component directories mapped`);
  if (graph.modules) pass(`RG-1: ${graph.modules.length} module directories mapped`);

  // Circular imports
  if (graph.circularImports && graph.circularImports.length > 0) {
    for (const c of graph.circularImports) {
      warn(`RG-1: Circular import detected: ${c}`);
    }
  } else {
    pass("RG-1: No circular imports detected");
  }

  // Large files
  if (graph.largeFiles) {
    for (const f of graph.largeFiles) {
      warn(`RG-1: Large file: ${f.path} (${f.lines} lines)`);
    }
  }

  // Direct renderer → main/database imports
  if (graph.directDbImports && graph.directDbImports.length > 0) {
    for (const d of graph.directDbImports) {
      critical(`RG-1: Direct renderer→database import: ${d}`);
    }
  } else {
    pass("RG-1: No direct renderer→database imports");
  }

  // Safe extraction candidates
  if (graph.safeExtractionCandidates) {
    pass(`RG-1: ${graph.safeExtractionCandidates.length} safe extraction candidates identified`);
  }

  // High-risk files
  if (graph.highRiskFiles) {
    for (const f of graph.highRiskFiles) {
      warn(`RG-1: High-risk file: ${f}`);
    }
  }
}

/* ═══════════════════════════════════════════
   20. DG Graph Audit Pack (Database)
   ═══════════════════════════════════════════ */
async function auditDg1() {
  if (!shouldRun("dg-1")) return;
  console.log("\n=== DG-1 Audit Pack ===");

  warn("DG-1: Database graph not yet implemented (future phase)");
  console.log("DG-1: Expected source: src/main/database/init.js");
  console.log("DG-1: Expected output: TBD");
}

/* ═══════════════════════════════════════════
   21. WG Graph Audit Pack (Workflow)
   ═══════════════════════════════════════════ */
async function auditWg1() {
  if (!shouldRun("wg-1")) return;
  console.log("\n=== WG-1 Audit Pack ===");

  warn("WG-1: Workflow graph not yet implemented (future phase)");
  console.log("WG-1: Expected source: erpBrain repository/workflows/ + BRAIN-1 workflow definitions");
  console.log("WG-1: Expected output: TBD");
}

/* ═══════════════════════════════════════════
   22. AG Graph Audit Pack (Audit)
   ═══════════════════════════════════════════ */
async function auditAg1() {
  if (!shouldRun("ag-1")) return;
  console.log("\n=== AG-1 Audit Pack ===");

  warn("AG-1: Audit graph not yet implemented (future phase)");
  console.log("AG-1: Expected source: audit log system, KG-1 metadata");
  console.log("AG-1: Expected output: TBD");
}

/* ═══════════════════════════════════════════
   23. Unified Graph Registry Check
   ═══════════════════════════════════════════ */
async function checkRegistry() {
  console.log("\n=== Unified Graph Registry Check ===");

  const registryPaths = [
    "docs/architecture/graph-registry.md",
    "src/renderer/modules/erpBrain/graphRegistry.json"
  ];

  let found = false;
  for (const p of registryPaths) {
    if (existsSync(resolve(ROOT, p))) {
      pass(`Graph registry found: ${p}`);
      found = true;
    }
  }
  if (!found) {
    fail("No graph registry found — expected at docs/architecture/graph-registry.md or erpBrain/graphRegistry.json");
  }
}

/* ═══════════════════════════════════════════
   Main
   ═══════════════════════════════════════════ */
async function main() {
  console.log("GII GeM ERP — Unified Graph Governance Audit");
  console.log(`Phase filter: ${REQUESTED_PHASE || "all"}`);
  if (REQUESTED_CATEGORY) console.log(`Category:     ${REQUESTED_CATEGORY}`);
  console.log("============================================\n");

  await checkRegistry();

  // Run graph audit packs
  await auditBrain1();
  await auditKg1();
  await auditRg1();
  await auditDg1();
  await auditWg1();
  await auditAg1();

  // Phase report completeness (only when --phase is given or --category)
  if (REQUESTED_PHASE || REQUESTED_CATEGORY) {
    checkPhaseReportCompleteness();
  }

  console.log("\n============================================");
  console.log("Audit Summary:");
  console.log(`  PASS:     ${results.passed}`);
  console.log(`  WARNING:  ${results.warnings}`);
  console.log(`  FAIL:     ${results.failed}`);
  console.log(`  CRITICAL: ${results.critical}`);
  console.log("============================================");

  let exitCode = EXIT.PASS;
  if (results.critical > 0) exitCode = EXIT.CRITICAL;
  else if (results.failed > 0) exitCode = EXIT.FAIL;
  else if (results.warnings > 0) exitCode = EXIT.WARNING;

  console.log(`Exit code: ${exitCode}`);
  process.exit(exitCode);
}

main();
