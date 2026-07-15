#!/usr/bin/env node
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const results = { passed: 0, warnings: 0, failed: 0, details: [] };

function pad(n) { return n.toString().padStart(2, "0"); }

function pass(msg) { results.passed++; results.details.push({ level: "PASS", msg }); console.log(`  ${pad(results.passed)}. ${"✓".padEnd(3)} ${msg}`); }

function warn(msg) { results.warnings++; results.details.push({ level: "WARN", msg }); console.log(`  ${"!".padEnd(3)} ${msg}`); }

function fail(msg) { results.failed++; results.details.push({ level: "FAIL", msg }); console.log(`  ${"✗".padEnd(3)} ${msg}`); }

function fileExists(relPath) { return existsSync(resolve(ROOT, relPath)); }

function fileContains(relPath, pattern) {
  if (!fileExists(relPath)) return false;
  return pattern.test(readFileSync(resolve(ROOT, relPath), "utf-8"));
}

function fileNotContains(relPath, pattern) {
  if (!fileExists(relPath)) return true;
  return !pattern.test(readFileSync(resolve(ROOT, relPath), "utf-8"));
}

function dirContains(relPath, pattern) {
  if (!fileExists(relPath)) return false;
  const content = readFileSync(resolve(ROOT, relPath), "utf-8");
  return content.includes(pattern);
}

let count = 0;

console.log("============================================================");
console.log("BRAIN-4E Read-Only ERP Assistant — Verification");
console.log("============================================================\n");

// R4-001: Planning report exists
count++;
if (fileExists("docs/architecture/brain-4-read-only-erp-assistant-planning-report.md")) {
  pass("R4-001: BRAIN-4 planning report exists");
} else {
  fail("R4-001: BRAIN-4 planning report missing");
}

// R4-002: Lock note exists
count++;
if (fileExists("docs/architecture/brain-4a-read-only-erp-assistant-design-specification-lock-note.md")) {
  pass("R4-002: BRAIN-4A lock note exists");
} else {
  fail("R4-002: BRAIN-4A lock note missing");
}

const ASSISTANT_DIR = "src/renderer/modules/erpAssistant";

// R4-003: No LLM/API import
count++;
const llmPatterns = ["openai", "anthropic", "@anthropic-ai", "langchain", "llama", "gemini", "claude", "gpt-"];
let llmClean = true;
for (const pattern of llmPatterns) {
  if (dirContains(`${ASSISTANT_DIR}/sources/knowledgeBridge.js`, pattern)) llmClean = false;
  if (dirContains(`${ASSISTANT_DIR}/response/answerContractBuilder.js`, pattern)) llmClean = false;
  if (dirContains(`${ASSISTANT_DIR}/classifier/queryClassifier.js`, pattern)) llmClean = false;
}
if (llmClean) {
  pass("R4-003: No LLM/API import detected in erpAssistant module");
} else {
  fail("R4-003: LLM/API import found in erpAssistant module");
}

// R4-004: No write IPC import
count++;
if (fileNotContains(`${ASSISTANT_DIR}/sources/knowledgeBridge.js`, /ipcRenderer/) &&
    fileNotContains(`${ASSISTANT_DIR}/response/answerContractBuilder.js`, /ipcRenderer/) &&
    fileNotContains(`${ASSISTANT_DIR}/classifier/queryClassifier.js`, /ipcRenderer/)) {
  pass("R4-004: No write IPC import in erpAssistant module");
} else {
  fail("R4-004: Write IPC import found in erpAssistant module");
}

// R4-005: No database driver import
count++;
const dbPatterns = ["better-sqlite3", "sql.js", "sqlite3", "mysql", "pg"];
let dbClean = true;
for (const pattern of dbPatterns) {
  if (dirContains(`${ASSISTANT_DIR}/sources/knowledgeBridge.js`, pattern)) dbClean = false;
  if (dirContains(`${ASSISTANT_DIR}/response/answerContractBuilder.js`, pattern)) dbClean = false;
  if (dirContains(`${ASSISTANT_DIR}/classifier/queryClassifier.js`, pattern)) dbClean = false;
}
if (dbClean) {
  pass("R4-005: No database driver import in erpAssistant module");
} else {
  fail("R4-005: Database driver import found in erpAssistant module");
}

// R4-006: No fetch/axios import
count++;
const httpPatterns = ["axios", "fetch", "got", "superagent", "request"];
let httpClean = true;
for (const pattern of httpPatterns) {
  if (dirContains(`${ASSISTANT_DIR}/sources/knowledgeBridge.js`, pattern)) httpClean = false;
  if (dirContains(`${ASSISTANT_DIR}/response/answerContractBuilder.js`, pattern)) httpClean = false;
  if (dirContains(`${ASSISTANT_DIR}/classifier/queryClassifier.js`, pattern)) httpClean = false;
}
if (httpClean) {
  pass("R4-006: No HTTP client import in erpAssistant module");
} else {
  fail("R4-006: HTTP client import found in erpAssistant module");
}

// R4-007: No shell/child_process import
count++;
if (fileNotContains(`${ASSISTANT_DIR}/sources/knowledgeBridge.js`, /child_process/) &&
    fileNotContains(`${ASSISTANT_DIR}/sources/knowledgeBridge.js`, /shell/) &&
    fileNotContains(`${ASSISTANT_DIR}/response/answerContractBuilder.js`, /child_process/) &&
    fileNotContains(`${ASSISTANT_DIR}/classifier/queryClassifier.js`, /child_process/)) {
  pass("R4-007: No shell/child_process import in erpAssistant module");
} else {
  fail("R4-007: Shell/child_process import found in erpAssistant module");
}

// R4-008: Query categories defined (12 categories)
count++;
const catPath = `${ASSISTANT_DIR}/classifier/categoryDefinitions.js`;
if (fileExists(catPath)) {
  const catContent = readFileSync(resolve(ROOT, catPath), "utf-8");
  const categoryMatches = catContent.match(/id:\s*"/g);
  const count12 = categoryMatches ? categoryMatches.length : 0;
  if (count12 >= 12) {
    pass(`R4-008: ${count12} query categories defined in categoryDefinitions.js`);
  } else {
    fail(`R4-008: Only ${count12} categories found, expected 12`);
  }
} else {
  fail("R4-008: categoryDefinitions.js missing");
}

// R4-009: Preferred source rules defined per category
count++;
if (fileExists(catPath)) {
  const catContent = readFileSync(resolve(ROOT, catPath), "utf-8");
  const preferredSources = catContent.match(/preferredSource:/g);
  const sourceCount = preferredSources ? preferredSources.length : 0;
  if (sourceCount >= 12) {
    pass(`R4-009: ${sourceCount} categories have preferredSource defined`);
  } else {
    fail(`R4-009: Only ${sourceCount} categories have preferredSource`);
  }
} else {
  fail("R4-009: categoryDefinitions.js missing");
}

// R4-010: Safety boundaries defined per domain
count++;
const safetyPath = `${ASSISTANT_DIR}/response/safetyEnforcer.js`;
if (fileExists(safetyPath)) {
  const safetyContent = readFileSync(resolve(ROOT, safetyPath), "utf-8");
  const boundaries = safetyContent.match(/boundary:/g);
  const boundaryCount = boundaries ? boundaries.length : 0;
  if (boundaryCount >= 6) {
    pass(`R4-010: ${boundaryCount} safety boundaries defined in safetyEnforcer.js`);
  } else {
    fail(`R4-010: Only ${boundaryCount} boundaries found, expected >= 6`);
  }
} else {
  fail("R4-010: safetyEnforcer.js missing");
}

function checkAnyFileContains(files, pattern) {
  return files.some((f) => fileExists(f) && fileContains(f, pattern));
}

// R4-011: Response contract includes sourceReferences
count++;
const contractPaths = [`${ASSISTANT_DIR}/response/answerContractBuilder.js`, `src/renderer/modules/erpBrain/services/sourceBackedAnswerBuilder.js`];
if (checkAnyFileContains(contractPaths, /sourceReferences/)) {
  pass("R4-011: Response contract includes sourceReferences");
} else {
  fail("R4-011: sourceReferences missing from response contract");
}

// R4-012: Response contract includes confidence
count++;
if (checkAnyFileContains(contractPaths, /\bconfidence\b/)) {
  pass("R4-012: Response contract includes confidence");
} else {
  fail("R4-012: confidence missing from response contract");
}

function contractExists(p) { return fileExists(p) && fileContains(p, /assembleContract|buildAnswerContract/); }
const contractPath = `${ASSISTANT_DIR}/response/answerContractBuilder.js`;

// R4-013: Response contract includes safetyBoundary
count++;
if (fileExists(contractPath) && fileContains(contractPath, /safetyBoundary/)) {
  pass("R4-013: Response contract includes safetyBoundary");
} else {
  fail("R4-013: safetyBoundary missing from response contract");
}

// R4-014: Unsafe action request returns refusal
count++;
const classifierPath = `${ASSISTANT_DIR}/classifier/queryClassifier.js`;
if (fileExists(classifierPath) && fileContains(classifierPath, /unsafe_action/)) {
  pass("R4-014: Unsafe action detection (unsafe_action category) implemented");
} else {
  fail("R4-014: Unsafe action detection missing");
}

// R4-015: Accounting-sensitive query applies safety notice
count++;
if (fileExists(safetyPath) && fileContains(safetyPath, /accounting/)) {
  pass("R4-015: Accounting-sensitive safety notice implemented");
} else {
  fail("R4-015: Accounting-sensitive safety notice missing");
}

// R4-016: Manual fallback defined
count++;
if (fileExists(catPath)) {
  const catContent = readFileSync(resolve(ROOT, catPath), "utf-8");
  const fallbackMatches = catContent.match(/fallbackSource:/g);
  if (fallbackMatches && fallbackMatches.length > 0) {
    pass(`R4-016: ${fallbackMatches.length} categories have fallbackSource defined`);
  } else {
    fail("R4-016: No categories have fallbackSource defined");
  }
} else {
  fail("R4-016: categoryDefinitions.js missing");
}

// R4-017: No UI mutation buttons
count++;
const assistantPanelPath = `${ASSISTANT_DIR}/ui/AssistantPanel.jsx`;
const answerCardPath = `${ASSISTANT_DIR}/ui/AssistantAnswerCard.jsx`;
const mutationButtonPatterns = ["post this voucher", "reverse this voucher", "approve this record", "import this file", "fix database", "run command", "delete record"];
let hasMutationButton = false;
for (const btnPattern of mutationButtonPatterns) {
  if (fileContains(assistantPanelPath, new RegExp(btnPattern, "i"))) hasMutationButton = true;
  if (fileContains(answerCardPath, new RegExp(btnPattern, "i"))) hasMutationButton = true;
}
if (!hasMutationButton) {
  pass("R4-017: No mutation action buttons in assistant UI");
} else {
  fail("R4-017: Mutation action button found in assistant UI");
}

// R4-018: AssistantPanel reads role, does not write it
count++;
if (fileExists(assistantPanelPath)) {
  const panelContent = readFileSync(resolve(ROOT, assistantPanelPath), "utf-8");
  const readsRole = panelContent.includes("currentRole");
  const writesRole = panelContent.includes("setRole") || panelContent.includes("role=");
  if (readsRole && !writesRole) {
    pass("R4-018: AssistantPanel reads role, does not write it");
  } else if (!readsRole) {
    fail("R4-018: AssistantPanel does not read currentRole");
  } else {
    fail("R4-018: AssistantPanel may write role data");
  }
} else {
  fail("R4-018: AssistantPanel.jsx missing");
}

// R4-019: BRAIN-2 backward compatible
count++;
try {
  const brain2Result = execSync("node scripts/verify-erp-brain.js", { cwd: ROOT, timeout: 30000, encoding: "utf-8" });
  const brain2PassCount = (brain2Result.match(/✓/g) || []).length;
  if (brain2PassCount >= 51) {
    pass(`R4-019: BRAIN-2 backward compatible (${brain2PassCount} checks pass)`);
  } else {
    fail(`R4-019: BRAIN-2 regression — only ${brain2PassCount} checks pass`);
  }
} catch {
  fail("R4-019: BRAIN-2 verification failed to execute");
}

// R4-020: BRAIN-3 backward compatible
count++;
try {
  const brain3Result = execSync("node scripts/verify-help-assistant-brain.js", { cwd: ROOT, timeout: 30000, encoding: "utf-8" });
  const brain3PassCount = (brain3Result.match(/✓/g) || []).length;
  if (brain3PassCount >= 23) {
    pass(`R4-020: BRAIN-3 backward compatible (${brain3PassCount} checks pass)`);
  } else {
    fail(`R4-020: BRAIN-3 regression — only ${brain3PassCount} checks pass`);
  }
} catch {
  fail("R4-020: BRAIN-3 verification failed to execute");
}

// R4-E01: knowledgeBridge.js exists and exports resolveQuery
count++;
if (fileExists(`${ASSISTANT_DIR}/sources/knowledgeBridge.js`) && 
    fileContains(`${ASSISTANT_DIR}/sources/knowledgeBridge.js`, /resolveQuery/)) {
  pass("R4-E01: knowledgeBridge.js exists and exports resolveQuery");
} else {
  fail("R4-E01: knowledgeBridge.js missing or resolveQuery not exported");
}

// R4-E02: queryClassifier.js exports classifyQuery
count++;
if (fileContains(`${ASSISTANT_DIR}/classifier/queryClassifier.js`, /classifyQuery/)) {
  pass("R4-E02: queryClassifier.js exports classifyQuery");
} else {
  fail("R4-E02: classifyQuery not exported");
}

// R4-E03: roleRenderer.js exports renderForRole
count++;
if (fileContains(`${ASSISTANT_DIR}/response/roleRenderer.js`, /renderForRole/)) {
  pass("R4-E03: roleRenderer.js exports renderForRole");
} else {
  fail("R4-E03: renderForRole not exported");
}

// R4-E04: Assistant RoleProvider does not mutate permissions
count++;
const roleProviderPath = `${ASSISTANT_DIR}/ui/AssistantRoleProvider.jsx`;
if (fileExists(roleProviderPath)) {
  const rpContent = readFileSync(resolve(ROOT, roleProviderPath), "utf-8");
  if (!rpContent.includes("permission") && !rpContent.includes("grant") && !rpContent.includes("bypass")) {
    pass("R4-E04: AssistantRoleProvider does not mutate permissions");
  } else {
    warn("R4-E04: AssistantRoleProvider references permission concepts — review");
  }
} else {
  fail("R4-E04: AssistantRoleProvider.jsx missing");
}

// R4-E05: Prohibited actions present in answer contract
count++;
if (fileContains(contractPath, /prohibitedActions/)) {
  pass("R4-E05: Prohibited actions included in response contract");
} else {
  fail("R4-E05: prohibitedActions missing from response contract");
}

// R4-E06: Answer contract has answer field
count++;
if (fileContains(contractPath, /answer:/) || fileContains(contractPath, /answer =/)) {
  pass("R4-E06: Answer contract includes answer field");
} else {
  fail("R4-E06: answer field missing from response contract");
}

console.log("\n------------------------------------------------------------");
console.log(`Summary:  ${results.passed} passed,  ${results.warnings} warnings,  ${results.failed} failed`);
console.log("============================================================");

process.exit(results.failed > 0 ? 1 : 0);
