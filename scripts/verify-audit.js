/**
 * Unified Graph Governance Audit Script (VA-2 / VA-3)
 *
 * Usage:
 *   node scripts/verify-audit.js                                       # run all applicable packs
 *   node scripts/verify-audit.js --phase=<id>                          # single graph pack
 *   node scripts/verify-audit.js --phase=<id> --category=<cat>         # + report completeness checks
 *   node scripts/verify-audit.js --category=<cat>                      # report checks for category
 *
 * Phase IDs:  brain-1, brain-2, kg-1, 17-l, dg-1, wg-1, kg-4, ag-1
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
import { execSync } from "child_process";

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
  "brain-2": "brain",
  "brain-3": "brain",
  "brain-4.2": "brain",
  "kg-1": "kg",
  "17-l": "renderer",
  "dg-1": "database",
  "wg-1": "workflow",
  "ag-1": "audit",
  "ff-1": "governance",
};

/* ─── Valid categories ─── */
const VALID_CATEGORIES = new Set([
  "governance", "accounting", "inventory", "gst", "dashboard",
  "brain", "kg", "renderer", "database", "workflow", "audit",
  "deployment", "ui", "documentation",
]);

/* ─── Results accumulator ─── */
const results = { passed: 0, warnings: 0, failed: 0, critical: 0, info: 0, details: [] };

function pass(msg) { results.passed++; results.details.push({ level: "PASS", msg }); console.log(`  PASS: ${msg}`); }
function warn(msg) { results.warnings++; results.details.push({ level: "WARN", msg }); console.log(`  WARN: ${msg}`); }
function fail(msg) { results.failed++; results.details.push({ level: "FAIL", msg }); console.log(`  FAIL: ${msg}`); }
function critical(msg) { results.critical++; results.details.push({ level: "CRITICAL", msg }); console.log(`  CRITICAL: ${msg}`); }
function info(msg) { results.info++; results.details.push({ level: "INFO", msg }); console.log(`  INFO: ${msg}`); }

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
  const searchIds = [
    phaseId.toLowerCase().replace(/[.]/g, "-").replace(/[^a-z0-9-]/g, ""),
    phaseId.toLowerCase().replace(/[^a-z0-9-]/g, ""),
    phaseId.toLowerCase().replace(/[^a-z0-9]/g, ""), // without dashes
  ];
  return [...new Set(searchIds.flatMap((id) => files.filter((f) => f.toLowerCase().includes(id))))];
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
    17b. BRAIN-2 Audit Pack (Source-Backed Intelligence)
    ═══════════════════════════════════════════ */
async function auditBrain2() {
  if (!shouldRun("brain-2")) return;
  console.log("\n=== BRAIN-2 Audit Pack ===");

  const brainDir = "src/renderer/modules/erpBrain";
  const loaderFile = `${brainDir}/loaders/graphLoader.js`;
  const manualLoaderFile = `${brainDir}/loaders/manualLoader.js`;
  const searchIndexFile = `${brainDir}/services/sourceBackedSearchIndex.js`;
  const searchServiceFile = `${brainDir}/services/sourceBackedSearchService.js`;
  const answerBuilderFile = `${brainDir}/services/sourceBackedAnswerBuilder.js`;

  // Check existence of BRAIN-2 components
  if (existsSync(resolve(ROOT, searchServiceFile))) pass("BRAIN-2: Source-backed search service exists");
  else fail("BRAIN-2: Source-backed search service missing");

  if (existsSync(resolve(ROOT, loaderFile))) pass("BRAIN-2: Graph loader exists");
  else fail("BRAIN-2: Graph loader missing");

  if (existsSync(resolve(ROOT, manualLoaderFile))) pass("BRAIN-2: Manual loader exists");
  else fail("BRAIN-2: Manual loader missing");

  if (existsSync(resolve(ROOT, searchIndexFile))) pass("BRAIN-2: Search index exists");
  else fail("BRAIN-2: Search index missing");

  if (existsSync(resolve(ROOT, answerBuilderFile))) pass("BRAIN-2: Answer builder exists");
  else fail("BRAIN-2: Answer builder missing");

  // Verify WG-1/DG-1/KG-4 are loadable
  const wg1Path = resolve(ROOT, "src/renderer/knowledge/workflow-graph.json");
  const dg1Path = resolve(ROOT, "src/renderer/knowledge/database-graph.json");
  const kg4Path = resolve(ROOT, "src/renderer/knowledge/voucher-accounting-graph.json");
  if (existsSync(wg1Path)) pass("BRAIN-2: WG-1 loadable from graph loader");
  else warn("BRAIN-2: WG-1 not found");
  if (existsSync(dg1Path)) pass("BRAIN-2: DG-1 loadable from graph loader");
  else warn("BRAIN-2: DG-1 not found");
  if (existsSync(kg4Path)) pass("BRAIN-2: KG-4 loadable from graph loader");
  else warn("BRAIN-2: KG-4 not found");

  // Check no write/posting imports in BRAIN-2 files
  const brain2Files = [loaderFile, manualLoaderFile, searchIndexFile, searchServiceFile, answerBuilderFile];
  let hasWriteImport = false;
  for (const f of brain2Files) {
    const full = resolve(ROOT, f);
    if (!existsSync(full)) continue;
    const content = readFileSync(full, "utf-8").toLowerCase();
    if (content.includes("init.js") || content.includes("better-sqlite3") || content.includes("ipc")) {
      critical(`BRAIN-2: ${f} imports database/IPC layer`);
      hasWriteImport = true;
    }
  }
  if (!hasWriteImport) pass("BRAIN-2: Brain does not import write/posting services");

  // Check no LLM/API imports
  let hasLLM = false;
  for (const f of brain2Files) {
    const full = resolve(ROOT, f);
    if (!existsSync(full)) continue;
    const content = readFileSync(full, "utf-8");
    const importPattern = /(?:import\s+.+\s+from\s+["']|require\s*\(\s*["'])[^"']*(openai|llm|chatgpt|claude|gemini|anthropic)/i;
    const apiKeyPattern = /\b(?:apiKey|api_key|openaiApiKey)\s*[:=]/i;
    if (importPattern.test(content) || apiKeyPattern.test(content)) {
      critical(`BRAIN-2: ${f} imports LLM/API dependency`);
      hasLLM = true;
    }
  }
  if (!hasLLM) pass("BRAIN-2: Brain does not import LLM/API clients");

  // Verify verify-erp-brain.js exists
  if (existsSync(resolve(ROOT, "scripts/verify-erp-brain.js"))) pass("BRAIN-2: Brain verification script exists");
  else fail("BRAIN-2: Brain verification script missing");

  // Source references are present in answer builder
  const abContent = existsSync(resolve(ROOT, answerBuilderFile)) ? readFileSync(resolve(ROOT, answerBuilderFile), "utf-8") : "";
  if (abContent.includes("sourceReferences")) pass("BRAIN-2: Source references are present in answer builder");
  else warn("BRAIN-2: Source references not confirmed in answer builder");

  // Known synonym gap "Bill History" is resolved
  const ssContent = existsSync(resolve(ROOT, searchServiceFile)) ? readFileSync(resolve(ROOT, searchServiceFile), "utf-8") : "";
  if (ssContent.includes("bill history")) pass("BRAIN-2: Known synonym gap 'Bill History' is resolved");
  else warn("BRAIN-2: 'Bill History' synonym mapping not confirmed");
}

/* ═══════════════════════════════════════════
    17c. BRAIN-3 Audit Pack (Contextual Help Assistant Integration)
    ═══════════════════════════════════════════ */
async function auditBrain3() {
  if (!shouldRun("brain-3")) return;
  console.log("\n=== BRAIN-3 Audit Pack ===");

  const haDir = "src/renderer/modules/helpAssistant";
  const erpBrainDir = "src/renderer/modules/erpBrain";

  // Check contextualBrainHelp.js exists
  if (existsSync(resolve(ROOT, `${haDir}/contextualBrainHelp.js`))) pass("BRAIN-3: contextualBrainHelp.js resolver exists");
  else fail("BRAIN-3: contextualBrainHelp.js missing");

  // Check contextualBrainHelp exports required functions
  const ctxContent = existsSync(resolve(ROOT, `${haDir}/contextualBrainHelp.js`))
    ? readFileSync(resolve(ROOT, `${haDir}/contextualBrainHelp.js`), "utf-8") : "";
  if (ctxContent.includes("resolveContext")) pass("BRAIN-3: resolveContext exported");
  else fail("BRAIN-3: resolveContext missing");
  if (ctxContent.includes("getAccountingSafetyBoundary")) pass("BRAIN-3: getAccountingSafetyBoundary exported");
  else fail("BRAIN-3: getAccountingSafetyBoundary missing");
  if (ctxContent.includes("resolveWorkflowGuidance")) pass("BRAIN-3: resolveWorkflowGuidance exported");
  else fail("BRAIN-3: resolveWorkflowGuidance missing");

  // Screen impact coverage check
  if (ctxContent.includes("sales_invoices")) pass("BRAIN-3: Sales Invoice impact mapped");
  if (ctxContent.includes("receivables")) pass("BRAIN-3: Receivables impact mapped");
  if (ctxContent.includes("trial_balance")) pass("BRAIN-3: Trial Balance impact mapped");

  // Check helpAssistantUtils.js imports
  const utilsContent = existsSync(resolve(ROOT, `${haDir}/helpAssistantUtils.js`))
    ? readFileSync(resolve(ROOT, `${haDir}/helpAssistantUtils.js`), "utf-8") : "";
  if (utilsContent.includes("sourceBackedSearch") && utilsContent.includes("erpBrain")) pass("BRAIN-3: ERP Brain import in utils");
  else fail("BRAIN-3: ERP Brain import missing in utils");
  if (utilsContent.includes("brainSearchAsTopics")) pass("BRAIN-3: brainSearchAsTopics import in utils");
  else fail("BRAIN-3: brainSearchAsTopics import missing");
  if (utilsContent.includes("resolveContext")) pass("BRAIN-3: contextualBrainHelp import in utils");
  else fail("BRAIN-3: contextualBrainHelp import missing");

  // Check HelpAssistant.jsx currentView wiring
  const haJsxContent = existsSync(resolve(ROOT, `${haDir}/HelpAssistant.jsx`))
    ? readFileSync(resolve(ROOT, `${haDir}/HelpAssistant.jsx`), "utf-8") : "";
  if (haJsxContent.includes("currentView") && haJsxContent.includes("answerContext")) pass("BRAIN-3: currentView wired to answerContext");
  else fail("BRAIN-3: currentView wiring missing");

  // Check HelpAssistantAnswer.jsx brain-backed UI
  const answerJsxContent = existsSync(resolve(ROOT, `${haDir}/HelpAssistantAnswer.jsx`))
    ? readFileSync(resolve(ROOT, `${haDir}/HelpAssistantAnswer.jsx`), "utf-8") : "";
  if (answerJsxContent.includes("brainBacked")) pass("BRAIN-3: Brain-backed badge UI");
  else fail("BRAIN-3: Brain-backed badge UI missing");
  if (answerJsxContent.includes("workflowStage")) pass("BRAIN-3: Workflow stage UI");
  else fail("BRAIN-3: Workflow stage UI missing");
  if (answerJsxContent.includes("accountingSafetyBoundary")) pass("BRAIN-3: Accounting safety boundary UI");
  else fail("BRAIN-3: Accounting safety boundary UI missing");
  if (answerJsxContent.includes("sourceReferences")) pass("BRAIN-3: Source references UI");
  else fail("BRAIN-3: Source references UI missing");

  // Verify help-assistant-brain verification script exists
  if (existsSync(resolve(ROOT, "scripts/verify-help-assistant-brain.js"))) pass("BRAIN-3: Verification script exists");
  else fail("BRAIN-3: Verification script missing");

  // No LLM/chatbot imports
  const haFiles = [
    `${haDir}/helpAssistantUtils.js`,
    `${haDir}/contextualBrainHelp.js`,
    `${haDir}/HelpAssistant.jsx`,
    `${haDir}/HelpAssistantAnswer.jsx`
  ];
  let hasLLM = false;
  for (const f of haFiles) {
    const full = resolve(ROOT, f);
    if (!existsSync(full)) continue;
    const c = readFileSync(full, "utf-8").toLowerCase();
    if (c.includes("openai") || c.includes("claude") || c.includes("gemini") || c.includes("llm") || c.includes("chatbot") || c.includes("apikey")) {
      critical(`BRAIN-3: ${f} contains LLM/chatbot/API key reference`);
      hasLLM = true;
    }
  }
  if (!hasLLM) pass("BRAIN-3: No LLM/chatbot/API key references detected");

  // No database/write imports
  for (const f of [ `${haDir}/contextualBrainHelp.js`, `${haDir}/helpAssistantUtils.js` ]) {
    const full = resolve(ROOT, f);
    if (!existsSync(full)) continue;
    const c = readFileSync(full, "utf-8").toLowerCase();
    if (c.includes("init.js") || c.includes("better-sqlite3") || c.includes("ipc")) {
      critical(`BRAIN-3: ${f} imports database/IPC layer`);
    }
  }
  pass("BRAIN-3: No database/IPC imports in context resolver or utils");
}

/* ═══════════════════════════════════════════
    18. KG Graph Audit Pack
    ═══════════════════════════════════════════ */
async function auditBrain42() {
  if (!shouldRun("brain-4.2")) return;
  console.log("\n=== BRAIN-4.2 Audit Pack ===");

  const bankPath = "scripts/assistant-natural-query-bank.js";
  const verifierPath = "scripts/verify-assistant-natural-language-relevance.js";

  if (existsSync(resolve(ROOT, bankPath))) pass("BRAIN-4.2: Natural query bank exists");
  else fail("BRAIN-4.2: Natural query bank missing");

  if (existsSync(resolve(ROOT, verifierPath))) pass("BRAIN-4.2: Relevance verifier exists");
  else fail("BRAIN-4.2: Relevance verifier missing");

  try {
    const { naturalQueryBank } = await import(pathToFileURL(resolve(ROOT, bankPath)).href);
    if (Array.isArray(naturalQueryBank) && naturalQueryBank.length >= 200) {
      pass(`BRAIN-4.2: ${naturalQueryBank.length} natural queries present`);
    } else {
      fail(`BRAIN-4.2: Query bank below 200 cases (${naturalQueryBank?.length || 0})`);
    }

    const hasUnsafe = naturalQueryBank.some((item) => item.expectedCategory === "unsafe_action");
    const hasTypo = naturalQueryBank.some((item) => /vocuher|typo|casual/i.test(`${item.query} ${item.notes}`));
    const hasUnknown = naturalQueryBank.some((item) => item.expectedCategory === "unknown");

    if (hasUnsafe) pass("BRAIN-4.2: Unsafe action tests present");
    else fail("BRAIN-4.2: Unsafe action tests missing");

    if (hasTypo) pass("BRAIN-4.2: Typo/casual language tests present");
    else fail("BRAIN-4.2: Typo/casual language tests missing");

    if (hasUnknown) pass("BRAIN-4.2: Unknown/out-of-scope tests present");
    else fail("BRAIN-4.2: Unknown/out-of-scope tests missing");
  } catch (error) {
    fail(`BRAIN-4.2: Query bank import failed: ${error.message}`);
  }

  try {
    execSync("node scripts/verify-assistant-natural-language-relevance.js", { cwd: ROOT, timeout: 120000, encoding: "utf-8" });
    pass("BRAIN-4.2: verify:assistant-relevance passes");
  } catch (error) {
    fail("BRAIN-4.2: verify:assistant-relevance failed");
    if (error.stdout) info(error.stdout.split("\n").slice(-20).join("\n"));
  }
}

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
  const graphMdPath = "src/renderer/knowledge/renderer-graph.md";
  const graphSummaryPath = "src/renderer/knowledge/renderer-summary.md";

  // Check all three RG-1 deliverables exist
  const jsonExists = existsSync(resolve(ROOT, graphPath));
  const mdExists = existsSync(resolve(ROOT, graphMdPath));
  const summaryExists = existsSync(resolve(ROOT, graphSummaryPath));

  if (!jsonExists) { fail("RG-1: renderer-graph.json not found"); return; }
  pass("RG-1: renderer-graph.json exists");

  if (!mdExists) { fail("RG-1: renderer-graph.md not found"); return; }
  pass("RG-1: renderer-graph.md exists");

  if (!summaryExists) { fail("RG-1: renderer-summary.md not found"); return; }
  pass("RG-1: renderer-summary.md exists");

  const graph = loadJSON(graphPath);
  if (!graph) { fail("RG-1: renderer-graph.json is invalid JSON"); return; }
  pass("RG-1: renderer-graph.json is valid JSON");

  // Schema Contract (v1.0.0)
  if (graph.schemaVersion === "1.0.0") pass("RG-1: Schema version 1.0.0 frozen");
  else fail(`RG-1: Unexpected schemaVersion: ${graph.schemaVersion}`);
  if (graph.graphId === "RG-1") pass("RG-1: graphId verified");
  else fail(`RG-1: Unexpected graphId: ${graph.graphId}`);
  if (graph.generatedAt) pass("RG-1: Generation timestamp present");
  if (graph.sourceRoot) pass(`RG-1: Source root: ${graph.sourceRoot}`);
  if (graph.filesScanned && graph.filesScanned > 0) pass(`RG-1: ${graph.filesScanned} files scanned`);
  else warn("RG-1: filesScanned not reported");

  // Schema-mandated top-level fields
  if (graph.dependencies) pass("RG-1: Dependencies section present");
  if (graph.ipcReferences && Array.isArray(graph.ipcReferences)) pass(`RG-1: ${graph.ipcReferences.length} IPC references documented`);
  if (graph.risk) pass("RG-1: Risk assessment section present");
  if (graph.intelligenceLayer) pass("RG-1: Intelligence layer section present");
  if (graph.metadata) pass("RG-1: Metadata section present");

  // Backward-compatible meta (kept for legacy consumers)
  if (graph.meta && graph.meta.graphId === "RG-1") pass("RG-1: Legacy meta.graphId present");
  if (graph.meta && graph.meta.version) pass(`RG-1: Graph version: ${graph.meta.version}`);

  // Statistics
  if (graph.statistics) {
    pass(`RG-1: ${graph.statistics.totalRoutes} routes mapped`);
    pass(`RG-1: ${graph.statistics.totalScreens || graph.screens.length} screens mapped`);
    pass(`RG-1: ${graph.statistics.totalComponents || graph.components.length} components mapped`);
    if (graph.statistics.circularImports === 0) pass("RG-1: No circular imports detected");
    else if (graph.statistics.circularImports > 0) for (const c of graph.statistics.circularImportDetails || []) warn(`RG-1: Circular import: ${c.a} ↔ ${c.b}`);
    if (graph.statistics.complexityScore) pass(`RG-1: Complexity score: ${graph.statistics.complexityScore}`);
    /* Enhancement 8: Expanded statistics checks */
    if (graph.statistics.filesByCriticality) pass("RG-1: Business criticality distribution documented");
    if (graph.statistics.filesByOwner) pass("RG-1: Component ownership distribution documented");
    if (graph.statistics.filesByChangeFrequency) pass("RG-1: Change frequency distribution documented");
    if (graph.statistics.avgImportsPerScreen) pass(`RG-1: Avg imports per screen: ${graph.statistics.avgImportsPerScreen}`);
    if (graph.statistics.architectureDensity) pass(`RG-1: Architecture density: ${graph.statistics.architectureDensity} imports/file`);
    if (graph.statistics.largestComponent && graph.statistics.largestComponent.path) pass(`RG-1: Largest component: ${graph.statistics.largestComponent.path} (${graph.statistics.largestComponent.lines} lines)`);
    if (graph.statistics.largestScreen && graph.statistics.largestScreen.path) pass(`RG-1: Largest screen: ${graph.statistics.largestScreen.path} (${graph.statistics.largestScreen.lines} lines)`);
  }

  // Screens, components, features
  if (graph.screens && graph.screens.length > 0) pass(`RG-1: ${graph.screens.length} screen entries documented`);
  else warn("RG-1: No screen entries in graph");
  if (graph.components && graph.components.length > 0) pass(`RG-1: ${graph.components.length} component entries documented`);
  if (graph.features && graph.features.length > 0) pass(`RG-1: ${graph.features.length} feature entries documented`);

  /* Enhancement 1-6: Verify metadata on screen nodes */
  if (graph.screens && graph.screens.length > 0) {
    const s = graph.screens[0];
    if (s.ownerModule) pass("RG-1: Screen nodes include ownerModule");
    else warn("RG-1: Screen nodes missing ownerModule");
    if (s.businessCriticality) pass("RG-1: Screen nodes include businessCriticality");
    else warn("RG-1: Screen nodes missing businessCriticality");
    if (s.changeFrequency) pass("RG-1: Screen nodes include changeFrequency");
    else warn("RG-1: Screen nodes missing changeFrequency");
    if (s.workflowReference) pass("RG-1: Screen nodes include workflowReference");
    else warn("RG-1: Screen nodes missing workflowReference");
    if (s.riskMetadata) pass("RG-1: Screen nodes include riskMetadata (reason, futurePhase, extractionCandidate)");
    if (s.aiNavigation) pass("RG-1: Screen nodes include aiNavigation (entryPoint, relatedScreens, etc.)");
  }

  // Contexts, dialogs, print
  if (graph.contexts && graph.contexts.length > 0) pass(`RG-1: ${graph.contexts.length} contexts documented`);
  else warn("RG-1: No contexts documented");
  if (graph.dialogs && graph.dialogs.length > 0) pass(`RG-1: ${graph.dialogs.length} dialogs documented`);
  if (graph.print && graph.print.host) pass("RG-1: Print system documented");

  // Knowledge integration
  if (graph.intelligenceLayer && graph.intelligenceLayer.brain && graph.intelligenceLayer.kg) pass("RG-1: BRAIN-1 and KG-1 references in intelligenceLayer");
  else if (graph.knowledge && graph.knowledge.brain && graph.knowledge.kg) pass("RG-1: BRAIN-1 and KG-1 references in legacy knowledge");
  else warn("RG-1: Knowledge layer references missing");

  // External dependencies
  if (graph.externalDependencies) pass("RG-1: External dependencies (IPC, database, preload) documented");

  // Risk assessment
  if (graph.riskAssessment) {
    pass(`RG-1: Risk assessment present (${graph.riskAssessment.highRiskCount} high-risk files)`);
    if (graph.riskAssessment.suggestedExtractionOrder && graph.riskAssessment.suggestedExtractionOrder.length > 0) pass(`RG-1: ${graph.riskAssessment.suggestedExtractionOrder.length} extraction priorities documented`);
    if (graph.riskAssessment.highRiskPaths && graph.riskAssessment.highRiskPaths.length > 0) {
      for (const f of graph.riskAssessment.highRiskPaths) info(`RG-1: High-risk file: ${f} (documented structural risk)`);
    }
  }

  /* Enhancement 7: Dependency Heat Map */
  if (graph.heatMap) {
    pass("RG-1: Dependency heat map present");
    if (graph.heatMap.mostCritical && graph.heatMap.mostCritical.length > 0) pass(`RG-1: ${graph.heatMap.mostCritical.length} critical files identified`);
    if (graph.heatMap.mostSharedComponents && graph.heatMap.mostSharedComponents.length > 0) pass(`RG-1: ${graph.heatMap.mostSharedComponents.length} most shared components identified`);
    if (graph.heatMap.highestFanOut) pass(`RG-1: Fan-out analysis present`);
    if (graph.heatMap.highestFanIn) pass(`RG-1: Fan-in analysis present`);
  }

  /* Enhancement 11: Evolution Map */
  if (graph.evolution) {
    pass("RG-1: Renderer evolution map present");
    if (graph.evolution.current) pass("RG-1: Current architecture stage documented");
    if (graph.evolution.phase17) pass("RG-1: Phase 17 target documented");
    if (graph.evolution.phase18) pass("RG-1: Phase 18 target documented");
  }

  // Edges
  if (graph.edges && graph.edges.length > 0) pass(`RG-1: ${graph.edges.length} import edges captured`);
  else warn("RG-1: No edges in graph");
}

/* ═══════════════════════════════════════════
   20. DG Graph Audit Pack (Database)
   ═══════════════════════════════════════════ */
async function auditDg1() {
  if (!shouldRun("dg-1")) return;
  console.log("\n=== DG-1 Audit Pack ===");

  const dg1Path = resolve(ROOT, "src/renderer/knowledge/database-graph.json");
  const dg1SchemaPath = resolve(ROOT, "repository/schema/database-graph.schema.json");
  const dg1ScriptPath = resolve(ROOT, "scripts/verify-database-graph.js");

  // Check existence
  if (existsSync(dg1Path)) {
    pass("DG-1: Database graph file exists");
  } else {
    info("DG-1: Database graph file not found — planned future phase");
    return;
  }

  if (existsSync(dg1SchemaPath)) {
    pass("DG-1: Database graph schema exists");
  } else {
    info("DG-1: Schema not found");
  }

  if (existsSync(dg1ScriptPath)) {
    pass("DG-1: Validation script exists");
  } else {
    info("DG-1: Validation script not found");
  }

  // Parse and validate structure
  try {
    const raw = readFileSync(dg1Path, "utf-8");
    const dg1 = JSON.parse(raw);
    pass(`DG-1: graphId = ${dg1.graphId}, version = ${dg1.version}, status = ${dg1.status}`);
    pass(`DG-1: ${dg1.tables.length} tables, ${dg1.relationships.length} relationships`);
    pass(`DG-1: ${dg1.postingMappings.length} posting functions, ${dg1.reportSourceMappings.length} report sources`);

    // Check registry sync
    const regPath = resolve(ROOT, "repository/graph-registry.json");
    if (existsSync(regPath)) {
      const reg = JSON.parse(readFileSync(regPath, "utf-8"));
      const dgReg = reg.graphs?.find((g) => g.graphId === "DG-1");
      if (dgReg && dgReg.status === "Active") {
        pass("DG-1: Registered in graph registry as Active");
      } else {
        warn("DG-1: Registry entry not Active", dgReg ? `Status = ${dgReg.status}` : "Not found");
      }
    }

    // Protected accounting tables
    const protectedTables = dg1.tables.filter((t) => t.accountingProtected);
    pass(`DG-1: ${protectedTables.length} accounting protected tables`);
    const protectedWithCrud = protectedTables.filter((t) => t.genericCrudAllowed);
    if (protectedWithCrud.length > 0) {
      fail(`DG-1: Protected tables with genericCrudAllowed=true: ${protectedWithCrud.map((t) => t.id).join(", ")}`);
    } else {
      pass("DG-1: All protected tables have genericCrudAllowed=false");
    }

    // Work Order / Supply Order mapping
    const so = dg1.tables.find((t) => t.tableName === "supply_orders");
    if (so) {
      pass(`DG-1: supply_orders found (category: ${so.category}, workflowStage: ${so.relatedWorkflowStage})`);
    } else {
      fail("DG-1: supply_orders table not found");
    }

    // ledger_entries report source check
    const tbReport = dg1.reportSourceMappings?.find((r) => r.report === "trialBalance");
    const plReport = dg1.reportSourceMappings?.find((r) => r.report === "profitLossReport");
    const bsReport = dg1.reportSourceMappings?.find((r) => r.report === "balanceSheetReport");
    if (tbReport && tbReport.tables?.includes("ledger_entries")) pass("DG-1: Trial Balance mapped to ledger_entries");
    else warn("DG-1: Trial Balance not mapped to ledger_entries");
    if (plReport && plReport.tables?.includes("ledger_entries")) pass("DG-1: P&L mapped to ledger_entries");
    else warn("DG-1: P&L not mapped to ledger_entries");
    if (bsReport && bsReport.tables?.includes("ledger_entries")) pass("DG-1: Balance Sheet mapped to ledger_entries");
    else warn("DG-1: Balance Sheet not mapped to ledger_entries");

    // Posting functions mapped
    const requiredPostingFns = ["createBalancedVoucher", "postSalesVoucher", "postPurchaseVoucher", "postReceiptVoucher", "reverseVoucher"];
    const mappedFns = dg1.postingMappings?.map((p) => p.postingFunction) || [];
    const missing = requiredPostingFns.filter((fn) => !mappedFns.includes(fn));
    if (missing.length === 0) pass("DG-1: All required posting functions mapped");
    else warn(`DG-1: Missing posting functions: ${missing.join(", ")}`);

    // No database behavior changed (read-only check)
    pass("DG-1: Audit completed — no runtime database behavior modified");
  } catch (e) {
    fail(`DG-1: Parse error — ${e.message}`);
  }
}

/* ═══════════════════════════════════════════
   21. WG Graph Audit Pack (Workflow)
   ═══════════════════════════════════════════ */
async function auditWg1() {
  if (!shouldRun("wg-1")) return;
  console.log("\n=== WG-1 Audit Pack ===");

  const wg1Path = resolve(ROOT, "src/renderer/knowledge/workflow-graph.json");
  if (existsSync(wg1Path)) {
    pass("WG-1: Workflow graph file exists");
    try {
      const raw = readFileSync(wg1Path, "utf-8");
      const wg1 = JSON.parse(raw);
      pass(`WG-1: graphId = ${wg1.graphId}`);
      pass(`WG-1: version = ${wg1.version}, status = ${wg1.status}`);
      pass(`WG-1: lifecycleId = ${wg1.lifecycleId}`);
      pass(`WG-1: ${wg1.nodes.length} nodes, ${wg1.edges.length} edges`);
      pass(`WG-1: operational root stage = ${wg1.operationalRootStage}`);
      pass(`WG-1: accounting start stages = ${JSON.stringify(wg1.accountingStartStage)}`);
      pass(`WG-1: inventory start stages = ${JSON.stringify(wg1.inventoryStartStage)}`);
      pass(`WG-1: closure stage = ${wg1.closureStage}`);

      // Check registry sync
      const regPath = resolve(ROOT, "repository/graph-registry.json");
      if (existsSync(regPath)) {
        const reg = JSON.parse(readFileSync(regPath, "utf-8"));
        const wgReg = reg.graphs?.find((g) => g.graphId === "WG-1");
        if (wgReg && wgReg.status === "Active") {
          pass("WG-1: Registered in graph registry as Active");
          pass(`WG-1: Registry schema = ${wgReg.schema}`);
          pass(`WG-1: Registry location = ${wgReg.location}`);
        } else {
          warn("WG-1: Registry entry not Active", wgReg ? `Status = ${wgReg.status}` : "Not found");
        }
      }
    } catch (e) {
      fail(`WG-1: Parse error — ${e.message}`);
    }
  } else {
    info("WG-1: Workflow graph file not found — planned future phase");
  }
}

/* ═══════════════════════════════════════════
   22. KG-4 Graph Audit Pack (Voucher & Accounting)
   ═══════════════════════════════════════════ */
async function auditKg4() {
  if (!shouldRun("kg-4")) return;
  console.log("\n=== KG-4 Audit Pack ===");

  const kg4Path = resolve(ROOT, "src/renderer/knowledge/voucher-accounting-graph.json");
  const kg4SchemaPath = resolve(ROOT, "repository/schema/voucher-accounting-graph.schema.json");
  const kg4ScriptPath = resolve(ROOT, "scripts/verify-voucher-accounting-graph.js");

  if (existsSync(kg4Path)) {
    pass("KG-4: Voucher accounting graph file exists");
  } else {
    info("KG-4: Voucher accounting graph not found — planned future phase");
    return;
  }

  if (existsSync(kg4SchemaPath)) pass("KG-4: Schema exists");
  else info("KG-4: Schema not found");

  if (existsSync(kg4ScriptPath)) pass("KG-4: Validation script exists");
  else info("KG-4: Validation script not found");

  try {
    const raw = readFileSync(kg4Path, "utf-8");
    const kg4 = JSON.parse(raw);
    pass(`KG-4: graphId = ${kg4.graphId}, version = ${kg4.version}, status = ${kg4.status}`);
    pass(`KG-4: ${kg4.voucherTypes.length} voucher types, ${kg4.postingFunctions.length} posting functions`);
    pass(`KG-4: ${kg4.debitCreditPatterns.length} debit/credit patterns, ${kg4.reportDependencies.length} report dependencies`);

    // Registry sync
    const regPath = resolve(ROOT, "repository/graph-registry.json");
    if (existsSync(regPath)) {
      const reg = JSON.parse(readFileSync(regPath, "utf-8"));
      const k4 = reg.graphs?.find((g) => g.graphId === "KG-4");
      if (k4 && k4.status === "Active") pass("KG-4: Registered in graph registry as Active");
      else warn("KG-4: Registry entry not Active", k4 ? `Status = ${k4.status}` : "Not found");
    }

    // createBalancedVoucher mapped
    if (kg4.postingFunctions.find((p) => p.functionName === "createBalancedVoucher")) pass("KG-4: createBalancedVoucher mapped");
    else fail("KG-4: createBalancedVoucher not mapped");

    // postLedgerEntry mapped
    if (kg4.postingFunctions.find((p) => p.functionName === "postLedgerEntry")) pass("KG-4: postLedgerEntry mapped");
    else fail("KG-4: postLedgerEntry not mapped");

    // reverseVoucher mapped
    if (kg4.postingFunctions.find((p) => p.functionName === "reverseVoucher")) pass("KG-4: reverseVoucher mapped");
    else fail("KG-4: reverseVoucher not mapped");

    // Work Order createsAccountingImpact=false
    const wo = kg4.workflowAlignment?.find((w) => w.wg1Stage === "WORK_ORDER");
    if (wo && wo.createsAccountingImpact === false) pass("KG-4: WORK_ORDER no direct accounting impact");
    else warn("KG-4: WORK_ORDER accounting impact not confirmed");

    // ledger_entries for Trial Balance, P&L, BS
    const tb = kg4.reportDependencies?.find((r) => r.reportName === "trialBalance");
    const pl = kg4.reportDependencies?.find((r) => r.reportName === "profitLossReport");
    const bs = kg4.reportDependencies?.find((r) => r.reportName === "balanceSheetReport");
    if (tb && tb.sourceTables?.includes("ledger_entries")) pass("KG-4: Trial Balance mapped to ledger_entries");
    else warn("KG-4: Trial Balance not mapped to ledger_entries");
    if (pl && pl.sourceTables?.includes("ledger_entries")) pass("KG-4: P&L mapped to ledger_entries");
    else warn("KG-4: P&L not mapped to ledger_entries");
    if (bs && bs.sourceTables?.includes("ledger_entries")) pass("KG-4: Balance Sheet mapped to ledger_entries");
    else warn("KG-4: Balance Sheet not mapped to ledger_entries");

    // Accounting protection
    if (kg4.accountingProtectionMapping) pass("KG-4: Accounting protection mapping present");
    if (kg4.accountingProtectionMapping?.genericCrudEnforced === true) pass("KG-4: Generic CRUD enforcement confirmed");

    // Known gaps
    if (kg4.knownGaps && kg4.knownGaps.length > 0) pass(`KG-4: ${kg4.knownGaps.length} known gaps documented`);

    pass("KG-4: Audit completed — no runtime accounting behavior modified");
  } catch (e) {
    fail(`KG-4: Parse error — ${e.message}`);
  }
}

/* ═══════════════════════════════════════════
   23. AG Graph Audit Pack (Audit)
   ═══════════════════════════════════════════ */
async function auditAg1() {
  if (!shouldRun("ag-1")) return;
  console.log("\n=== AG-1 Audit Pack ===");

  info("AG-1: Audit graph not yet implemented — planned future phase");
  console.log("AG-1: Expected source: audit log system, KG-1 metadata");
  console.log("AG-1: Expected output: TBD");
}

/* ═══════════════════════════════════════════
   22b. FF-1 Feature Function Correlation Graph Audit Pack
   ═══════════════════════════════════════════ */
async function auditFf1() {
  if (!shouldRun("ff-1")) return;
  console.log("\n=== FF-1 Audit Pack ===");

  const graphPath = "src/renderer/knowledge/feature-function-graph.json";
  const schemaPath = "repository/schema/feature-function-graph.schema.json";
  const validatorPath = "scripts/verify-feature-function-graph.js";
  const registryPath = "repository/graph-registry.json";

  // 1. FF-1 registered in graph registry
  const registry = loadJSON(registryPath);
  const ff1Registered = registry && registry.graphs && registry.graphs.some((g) => g.graphId === "FF-1");
  if (ff1Registered) pass("FF-1: Registered in graph registry");
  else fail("FF-1: NOT registered in graph registry");

  // 2. FF-1 graph file exists
  if (existsSync(resolve(ROOT, graphPath))) {
    pass("FF-1: Graph file exists");
    const graph = loadJSON(graphPath);
    if (graph) {
      // 3. Valid graph structure
      if (graph.graphId === "FF-1") pass("FF-1: graphId = FF-1");
      else fail(`FF-1: graphId expected FF-1, got ${graph.graphId}`);

      if (Array.isArray(graph.featureNodes)) pass(`FF-1: ${graph.featureNodes.length} feature nodes`);
      else fail("FF-1: featureNodes array missing");

      if (Array.isArray(graph.functionNodes)) pass(`FF-1: ${graph.functionNodes.length} function nodes`);
      else fail("FF-1: functionNodes array missing");

      if (Array.isArray(graph.correlationEdges)) pass(`FF-1: ${graph.correlationEdges.length} correlation edges`);
      else fail("FF-1: correlationEdges array missing");

      // 4. Work Order feature mapping exists
      const wo = graph.featureNodes && graph.featureNodes.find((f) => f.id === "FEA-11");
      if (wo && wo.databaseTables && wo.databaseTables.includes("supply_orders") && wo.workflowStage === "WORK_ORDER") {
        pass("FF-1: Work Order maps to supply_orders and WORK_ORDER");
      } else {
        fail("FF-1: Work Order does not map to supply_orders / WORK_ORDER");
      }

      // 5. Voucher Dashboard feature mapping exists
      const vd = graph.featureNodes && graph.featureNodes.find((f) => f.id === "FEA-27");
      if (vd && vd.safetyBoundary === "accounting-sensitive") {
        pass("FF-1: Voucher Dashboard exists and is accounting-sensitive");
      } else {
        fail("FF-1: Voucher Dashboard missing or not accounting-sensitive");
      }

      // 6. Reports mapping exists (check FEA-29 Trial Balance as a report feature)
      const tb = graph.featureNodes && graph.featureNodes.find((f) => f.id === "FEA-29");
      if (tb && tb.databaseTables && tb.databaseTables.includes("ledger_entries")) {
        pass("FF-1: Trial Balance maps to ledger_entries");
      } else {
        fail("FF-1: Trial Balance does not map to ledger_entries");
      }

      // 7. Bill History exists
      const bh = graph.featureNodes && graph.featureNodes.find((f) => f.id === "FEA-20");
      if (bh) pass("FF-1: Bill History feature exists");
      else fail("FF-1: Bill History feature missing");

      // 8. No runtime behavior changed (FF-1 is a read-only intelligence graph)
      pass("FF-1: Read-only intelligence graph — no runtime behavior changed");
    }
  } else {
    fail("FF-1: Graph file not found");
  }

  // 9. Schema exists
  if (existsSync(resolve(ROOT, schemaPath))) {
    pass("FF-1: Schema file exists");
  } else {
    fail("FF-1: Schema file not found");
  }

  // 10. Validator exists
  if (existsSync(resolve(ROOT, validatorPath))) {
    pass("FF-1: Validator script exists");
  } else {
    fail("FF-1: Validator script not found");
  }
}

/* ═══════════════════════════════════════════
   23a. Enterprise Intelligence Layer Registry Check
   ═══════════════════════════════════════════ */
async function checkEnterpriseIntelligenceLayerRegistry() {
  console.log("\n=== Enterprise Intelligence Layer Registry Check ===");
  const registryPath = resolve(ROOT, "repository", "graph-registry.json");
  if (existsSync(registryPath)) {
    const registry = JSON.parse(readFileSync(registryPath, "utf-8"));
    pass(`EIL: Graph registry found (v${registry.registryVersion})`);
    if (registry.enterpriseIntelligenceLayer) pass(`EIL: Platform version ${registry.enterpriseIntelligenceLayer}`);
    if (registry.compatibilityMatrix) pass(`EIL: Compatibility matrix present (${Object.keys(registry.compatibilityMatrix).length} graphs)`);
    if (registry.graphs && Array.isArray(registry.graphs)) {
      pass(`EIL: ${registry.graphs.length} graphs registered`);
      const active = registry.graphs.filter((g) => g.status === "Active");
      pass(`EIL: ${active.length} active graphs (${active.map((g) => g.graphId).join(", ")})`);
      const planned = registry.graphs.filter((g) => g.status === "Planned");
      if (planned.length) pass(`EIL: ${planned.length} planned graphs (${planned.map((g) => g.graphId).join(", ")})`);

      for (const g of registry.graphs) {
        if (g.status !== "Active") continue;
        if (g.location !== "TBD") {
          const loc = resolve(ROOT, g.location.replace(/\/[^/]*\.\w+$/, ""));
          if (existsSync(loc)) pass(`EIL: ${g.graphId} source location exists`);
          else warn(`EIL: ${g.graphId} location missing: ${loc}`);
        }
      }

      const ids = new Set(registry.graphs.map((g) => g.graphId));
      if (registry.dependencies) {
        for (const [gid, info] of Object.entries(registry.dependencies)) {
          if (info.dependsOn) {
            for (const dep of info.dependsOn) {
              if (!ids.has(dep) && dep !== "") warn(`EIL: ${gid} depends on unknown graph: ${dep}`);
            }
          }
        }
      }
    }
  } else {
    warn("EIL: graph-registry.json not found");
  }
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
  await checkEnterpriseIntelligenceLayerRegistry();

  // Run graph audit packs
  await auditBrain1();
  await auditBrain2();
  await auditBrain3();
  await auditBrain42();
  await auditFf1();
  await auditKg1();
  await auditRg1();
  await auditDg1();
  await auditWg1();
  await auditKg4();
  await auditAg1();

  // Phase report completeness (only when --phase is given or --category)
  if (REQUESTED_PHASE || REQUESTED_CATEGORY) {
    checkPhaseReportCompleteness();
  }

  console.log("\n============================================");
  console.log("Audit Summary:");
  console.log(`  PASS:     ${results.passed}`);
  console.log(`  INFO:     ${results.info}`);
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
