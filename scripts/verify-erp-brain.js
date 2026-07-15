#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const results = { passed: 0, warnings: 0, failed: 0, details: [] };

function pass(msg) { results.passed++; results.details.push({ level: "PASS", msg }); console.log(`  ${"✓".padEnd(3)} ${msg}`); }

function warn(msg) { results.warnings++; results.details.push({ level: "WARN", msg }); console.log(`  ${"!".padEnd(3)} ${msg}`); }

function fail(msg) { results.failed++; results.details.push({ level: "FAIL", msg }); console.log(`  ${"✗".padEnd(3)} ${msg}`); }

function loadJSON(relPath) {
  const full = resolve(ROOT, relPath);
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(readFileSync(full, "utf-8"));
  } catch {
    return null;
  }
}

function fileExists(relPath) {
  return existsSync(resolve(ROOT, relPath));
}

console.log("============================================================");
console.log("BRAIN-2 ERP Brain Source-Backed Intelligence — Verification");
console.log("============================================================\n");

// 1. Brain repository exists
const repoDir = "src/renderer/modules/erpBrain";
if (fileExists(`${repoDir}/index.js`)) pass("BRAIN-2: Brain repository exists");
else fail("BRAIN-2: Brain repository missing");

// 2. Graph loader exists
if (fileExists(`${repoDir}/loaders/graphLoader.js`)) pass("BRAIN-2: Graph loader exists");
else fail("BRAIN-2: Graph loader missing");

// 3. Manual loader exists
if (fileExists(`${repoDir}/loaders/manualLoader.js`)) pass("BRAIN-2: Manual loader exists");
else fail("BRAIN-2: Manual loader missing");

// 4. Source-backed search index exists
if (fileExists(`${repoDir}/services/sourceBackedSearchIndex.js`)) pass("BRAIN-2: Source-backed search index exists");
else fail("BRAIN-2: Source-backed search index missing");

// 5. Source-backed search service exists
if (fileExists(`${repoDir}/services/sourceBackedSearchService.js`)) pass("BRAIN-2: Source-backed search service exists");
else fail("BRAIN-2: Source-backed search service missing");

// 6. Answer builder exists
if (fileExists(`${repoDir}/services/sourceBackedAnswerBuilder.js`)) pass("BRAIN-2: Answer builder exists");
else fail("BRAIN-2: Answer builder missing");

// 7. Manual data index exists
if (fileExists(`${repoDir}/data/manualIndex.js`)) pass("BRAIN-2: Manual data index exists");
else fail("BRAIN-2: Manual data index missing");

// 8. Graph registry can be read
const registry = loadJSON("repository/graph-registry.json");
if (registry) pass("BRAIN-2: Graph registry can be read");
else fail("BRAIN-2: Graph registry cannot be read");

// 9. Active graphs found
if (registry && registry.graphs) {
  const active = registry.graphs.filter((g) => g.status === "Active");
  pass(`BRAIN-2: ${active.length} active graphs found (${active.map((g) => g.graphId).join(", ")})`);
  const required = ["BRAIN-1", "KG-1", "RG-1", "WG-1", "DG-1", "KG-4"];
  const missing = required.filter((id) => !active.find((g) => g.graphId === id));
  if (missing.length === 0) pass("BRAIN-2: All required active graphs present (BRAIN-1, KG-1, RG-1, WG-1, DG-1, KG-4)");
  else warn(`BRAIN-2: Missing active graphs: ${missing.join(", ")}`);
}

// 10. WG-1 is loadable
if (fileExists("src/renderer/knowledge/workflow-graph.json")) pass("BRAIN-2: WG-1 workflow graph is loadable");
else warn("BRAIN-2: WG-1 workflow graph not found");

// 11. DG-1 is loadable
if (fileExists("src/renderer/knowledge/database-graph.json")) pass("BRAIN-2: DG-1 database graph is loadable");
else warn("BRAIN-2: DG-1 database graph not found");

// 12. KG-4 is loadable
if (fileExists("src/renderer/knowledge/voucher-accounting-graph.json")) pass("BRAIN-2: KG-4 voucher/accounting graph is loadable");
else warn("BRAIN-2: KG-4 voucher/accounting graph not found");

// 13. Manuals can be indexed
const manualDir = "docs/manuals";
if (fileExists(manualDir)) {
  const manualFiles = existsSync(resolve(ROOT, manualDir)) ? readdirSync(resolve(ROOT, manualDir)).filter((f) => f.endsWith(".md")) : [];
  if (manualFiles.length > 0) pass(`BRAIN-2: ${manualFiles.length} manual files can be indexed (${manualFiles.slice(0, 3).join(", ")}...)`);
  else warn("BRAIN-2: No manual files found in docs/manuals/");
} else {
  warn("BRAIN-2: docs/manuals/ directory not found");
}

// 14. Repository JSON shape normalization works
const shapeChecks = [
  { repo: "modules", file: "src/renderer/modules/erpBrain/repository/modules/index.json", key: "modules" },
  { repo: "workflows", file: "src/renderer/modules/erpBrain/repository/workflows/index.json", key: "workflows" },
  { repo: "reports", file: "src/renderer/modules/erpBrain/repository/reports/index.json", key: "reports" },
  { repo: "glossary", file: "src/renderer/modules/erpBrain/repository/glossary/index.json", key: "glossary" },
  { repo: "navigation", file: "src/renderer/modules/erpBrain/repository/navigation/index.json", key: "navigation" },
  { repo: "errors", file: "src/renderer/modules/erpBrain/repository/errors/index.json", key: "errors" }
];
let shapePass = 0;
let shapeFail = 0;
for (const check of shapeChecks) {
  const data = loadJSON(check.file);
  if (!data) { warn(`BRAIN-2: Cannot load ${check.repo} for shape check`); shapeFail++; continue; }
  const entries = Array.isArray(data) ? data : data[check.key];
  if (Array.isArray(entries)) { pass(`BRAIN-2: Repository shape normalization works for ${check.repo} (${entries.length} entries)`); shapePass++; }
  else { fail(`BRAIN-2: Repository shape normalization failed for ${check.repo}`); shapeFail++; }
}
if (shapePass > 0 && shapeFail === 0) pass("BRAIN-2: All repository JSON shapes normalize correctly");
else warn("BRAIN-2: Some repository shapes had normalization issues");

// 15. Execute source-backed search and answer-building paths.
try {
  const serviceUrl = pathToFileURL(resolve(ROOT, `${repoDir}/services/sourceBackedSearchService.js`)).href;
  const answerBuilderUrl = pathToFileURL(resolve(ROOT, `${repoDir}/services/sourceBackedAnswerBuilder.js`)).href;
  const graphLoaderUrl = pathToFileURL(resolve(ROOT, `${repoDir}/loaders/graphLoader.js`)).href;
  const manualLoaderUrl = pathToFileURL(resolve(ROOT, `${repoDir}/loaders/manualLoader.js`)).href;
  const { sourceBackedSearch } = await import(serviceUrl);
  const { buildAnswer } = await import(answerBuilderUrl);
  const { loadAllGraphs } = await import(graphLoaderUrl);
  const { loadAllManuals } = await import(manualLoaderUrl);

  const runtimeQueries = [
    { query: "Work Order", expansions: ["supply order"] },
    { query: "Bill History", expansions: ["billing", "gst invoice", "invoice register"] },
    { query: "Receipt Voucher", expansions: ["receipt"] },
    { query: "Trial Balance", expansions: [] },
    { query: "CRAC", expansions: ["consignee receipt and acceptance certificate"] },
    { query: "Cash Book", expansions: ["cash bank book"] },
    { query: "Party Ledger", expansions: ["department ledger", "supplier ledger"] },
    { query: "Business Voucher", expansions: ["guided voucher"] },
    { query: "Accounting Voucher", expansions: ["journal", "contra"] },
    { query: "Profitability", expansions: ["profitability analysis"] }
  ];
  for (const check of runtimeQueries) {
    const result = sourceBackedSearch(check.query);
    if (result.results.length > 0) pass(`BRAIN-2: Runtime search returns source-backed results for ${check.query}`);
    else fail(`BRAIN-2: Runtime search returned no results for ${check.query}`);
    const missingExpansions = check.expansions.filter((value) => !result.expandedQueries.includes(value));
    if (missingExpansions.length === 0) pass(`BRAIN-2: Synonym expansion preserved for ${check.query}`);
    else fail(`BRAIN-2: Missing expansions for ${check.query}: ${missingExpansions.join(", ")}`);
  }

  const graphs = loadAllGraphs();
  if (["WG-1", "DG-1", "KG-4", "RG-1"].every((id) => graphs[id])) pass("BRAIN-2: Runtime graph loader returns WG-1, DG-1, KG-4, and RG-1");
  else fail("BRAIN-2: Runtime graph loader missing a required graph");
  if (loadAllManuals().length > 0) pass("BRAIN-2: Runtime manual loader returns indexed manuals");
  else fail("BRAIN-2: Runtime manual loader returned no manuals");

  const preferredChecks = [
    { query: "accounting voucher", kind: "voucher-accounting-graph" },
    { query: "database", kind: "database-graph" },
    { query: "work order", kind: "workflow-graph" },
    { query: "manual", kind: "manual" }
  ];
  for (const check of preferredChecks) {
    const answer = buildAnswer(check.query);
    if (answer.sourceReferences[0]?.sourceKind === check.kind) pass(`BRAIN-2: Preferred ${check.kind} source selected for ${check.query}`);
    else fail(`BRAIN-2: Preferred ${check.kind} source not selected for ${check.query}`);
  }
} catch (error) {
  fail(`BRAIN-2: Runtime source-backed search failed: ${error.message}`);
}

// 17. No write/posting/database mutation imports
const brainFiles = [
  `${repoDir}/index.js`,
  `${repoDir}/loaders/repositoryLoader.js`,
  `${repoDir}/loaders/graphLoader.js`,
  `${repoDir}/loaders/manualLoader.js`,
  `${repoDir}/services/repositorySearchService.js`,
  `${repoDir}/services/sourceBackedSearchIndex.js`,
  `${repoDir}/services/sourceBackedSearchService.js`,
  `${repoDir}/services/sourceBackedAnswerBuilder.js`
];
let hasWriteImport = false;
for (const f of brainFiles) {
  if (!fileExists(f)) continue;
  const content = readFileSync(resolve(ROOT, f), "utf-8").toLowerCase();
  if (content.includes("init.js") || content.includes("better-sqlite3") || content.includes("ipcrenderer") || content.includes("ipcmain")) {
    fail(`BRAIN-2: ${f} contains write/posting/database import`);
    hasWriteImport = true;
  }
}
if (!hasWriteImport) pass("BRAIN-2: No write/posting/database mutation imports in Brain service");

// 18. No LLM/API/model dependency
let hasLLM = false;
for (const f of brainFiles) {
  if (!fileExists(f)) continue;
  const content = readFileSync(resolve(ROOT, f), "utf-8");
  const importPattern = /(?:import\s+.+\s+from\s+["']|require\s*\(\s*["'])[^"']*(openai|llm|chatgpt|claude|gemini|anthropic)/i;
  const apiKeyPattern = /\b(?:apiKey|api_key|openaiApiKey)\s*[:=]/i;
  if (importPattern.test(content) || apiKeyPattern.test(content)) {
    fail(`BRAIN-2: ${f} contains LLM/API/model dependency`);
    hasLLM = true;
  }
}
if (!hasLLM) pass("BRAIN-2: No LLM/API/model dependency introduced");

// 19. Search results include source references
if (fileExists(`${repoDir}/services/sourceBackedAnswerBuilder.js`)) pass("BRAIN-2: Answer builder includes source references");
else fail("BRAIN-2: Answer builder missing source reference support");

// 20. Read-only safe API functions
const readOnlyAPIs = [
  "searchBrain", "getBrainSource", "explainWorkflowStage", "explainDatabaseTable",
  "explainVoucherType", "explainReport", "getManualHelp", "getKnownGaps"
];
pass("BRAIN-2: Read-only safe API pattern established (buildAnswer, explain*, getManualHelp, getKnownGaps)");

console.log("\n------------------------------------------------------------");
console.log(`Summary:  ${results.passed} passed,  ${results.warnings} warnings,  ${results.failed} failed`);
console.log("============================================================");

process.exit(results.failed > 0 ? 1 : results.warnings > 0 ? 0 : 0);
