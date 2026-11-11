#!/usr/bin/env node
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const results = { passed: 0, warnings: 0, failed: 0, details: [] };

function pass(msg) { results.passed++; results.details.push({ level: "PASS", msg }); console.log(`  ${"\u2713".padEnd(3)} ${msg}`); }

function warn(msg) { results.warnings++; results.details.push({ level: "WARN", msg }); console.log(`  ${"!".padEnd(3)} ${msg}`); }

function fail(msg) { results.failed++; results.details.push({ level: "FAIL", msg }); console.log(`  ${"\u2717".padEnd(3)} ${msg}`); }

function fileExists(relPath) {
  return existsSync(resolve(ROOT, relPath));
}

function fileContains(relPath, pattern) {
  if (!fileExists(relPath)) return false;
  return pattern.test(readFileSync(resolve(ROOT, relPath), "utf-8"));
}

console.log("============================================================");
console.log("BRAIN-3 Contextual Help Assistant Integration — Verification");
console.log("============================================================\n");

// 1. contextualBrainHelp.js exists
if (fileExists("src/renderer/modules/helpAssistant/contextualBrainHelp.js")) {
  pass("BRAIN-3: contextualBrainHelp.js resolver exists");
} else {
  fail("BRAIN-3: contextualBrainHelp.js missing");
}

// 2. contextualBrainHelp exports resolveContext
if (fileContains("src/renderer/modules/helpAssistant/contextualBrainHelp.js", /\bresolveContext\b/)) {
  pass("BRAIN-3: resolveContext exported from contextualBrainHelp.js");
} else {
  fail("BRAIN-3: resolveContext not exported");
}

// 3. contextualBrainHelp exports getAccountingSafetyBoundary
if (fileContains("src/renderer/modules/helpAssistant/contextualBrainHelp.js", /\bgetAccountingSafetyBoundary\b/)) {
  pass("BRAIN-3: getAccountingSafetyBoundary exported");
} else {
  fail("BRAIN-3: getAccountingSafetyBoundary not exported");
}

// 4. contextualBrainHelp exports resolveWorkflowGuidance
if (fileContains("src/renderer/modules/helpAssistant/contextualBrainHelp.js", /\bresolveWorkflowGuidance\b/)) {
  pass("BRAIN-3: resolveWorkflowGuidance exported");
} else {
  fail("BRAIN-3: resolveWorkflowGuidance not exported");
}

// 5. contextualBrainHelp has WORKFLOW_STAGE_MAP
if (fileContains("src/renderer/modules/helpAssistant/contextualBrainHelp.js", /\bWORKFLOW_STAGE_MAP\b/)) {
  pass("BRAIN-3: WORKFLOW_STAGE_MAP defined in contextualBrainHelp.js");
} else {
  fail("BRAIN-3: WORKFLOW_STAGE_MAP missing");
}

// 6. contextualBrainHelp has SCREEN_IMPACT_MAP
if (fileContains("src/renderer/modules/helpAssistant/contextualBrainHelp.js", /\bSCREEN_IMPACT_MAP\b/)) {
  pass("BRAIN-3: SCREEN_IMPACT_MAP defined in contextualBrainHelp.js");
} else {
  fail("BRAIN-3: SCREEN_IMPACT_MAP missing");
}

// 7. contextualBrainHelp has VIEW_KEY_TO_SCREEN (25+ entries)
const contextualContent = fileExists("src/renderer/modules/helpAssistant/contextualBrainHelp.js")
  ? readFileSync(resolve(ROOT, "src/renderer/modules/helpAssistant/contextualBrainHelp.js"), "utf-8")
  : "";
if (contextualContent.includes("VIEW_KEY_TO_SCREEN")) {
  pass("BRAIN-3: VIEW_KEY_TO_SCREEN defined in contextualBrainHelp.js");
} else {
  fail("BRAIN-3: VIEW_KEY_TO_SCREEN missing in contextualBrainHelp.js");
}

// 8. helpAssistantUtils.js imports contextualBrainHelp functions
if (fileContains("src/renderer/modules/helpAssistant/helpAssistantUtils.js", /import.*resolveContext.*from.*contextualBrainHelp/)) {
  pass("BRAIN-3: helpAssistantUtils.js imports contextualBrainHelp");
} else {
  fail("BRAIN-3: helpAssistantUtils.js missing contextualBrainHelp import");
}

// 9. helpAssistantUtils.js imports sourceBackedSearch
if (fileContains("src/renderer/modules/helpAssistant/helpAssistantUtils.js", /import.*sourceBackedSearch.*from.*erpBrain/)) {
  pass("BRAIN-3: helpAssistantUtils.js imports ERP Brain sourceBackedSearch");
} else {
  fail("BRAIN-3: helpAssistantUtils.js missing ERP Brain import");
}

// 10. helpAssistantUtils.js imports brainSearchAsTopics
if (fileContains("src/renderer/modules/helpAssistant/helpAssistantUtils.js", /import.*brainSearchAsTopics.*from/)) {
  pass("BRAIN-3: helpAssistantUtils.js imports brainSearchAsTopics");
} else {
  fail("BRAIN-3: helpAssistantUtils.js missing brainSearchAsTopics import");
}

// 11. buildHelpAssistantAnswer accepts currentView parameter
if (fileContains("src/renderer/modules/helpAssistant/helpAssistantUtils.js", /currentView/)) {
  pass("BRAIN-3: buildHelpAssistantAnswer accepts currentView parameter");
} else {
  fail("BRAIN-3: buildHelpAssistantAnswer missing currentView parameter");
}

// 12. HelpAssistant.jsx passes currentView to answerContext
const haJsx = fileExists("src/renderer/modules/helpAssistant/HelpAssistant.jsx")
  ? readFileSync(resolve(ROOT, "src/renderer/modules/helpAssistant/HelpAssistant.jsx"), "utf-8")
  : "";
if (haJsx.includes("answerContext") && haJsx.includes("currentView") && haJsx.indexOf("answerContext") > haJsx.indexOf("currentView")) {
  pass("BRAIN-3: HelpAssistant.jsx wires currentView to answer context");
} else {
  fail("BRAIN-3: HelpAssistant.jsx missing currentView in answer context");
}

// 13. HelpAssistantAnswer.jsx renders brain-backed badge
if (fileContains("src/renderer/modules/helpAssistant/HelpAssistantAnswer.jsx", /brainBacked/)) {
  pass("BRAIN-3: HelpAssistantAnswer.jsx renders brain-backing UI");
} else {
  fail("BRAIN-3: HelpAssistantAnswer.jsx missing brain-backed badge rendering");
}

// 14. HelpAssistantAnswer.jsx renders workflow stage
if (fileContains("src/renderer/modules/helpAssistant/HelpAssistantAnswer.jsx", /workflowStage/)) {
  pass("BRAIN-3: HelpAssistantAnswer.jsx renders workflow stage info");
} else {
  fail("BRAIN-3: HelpAssistantAnswer.jsx missing workflow stage rendering");
}

// 15. HelpAssistantAnswer.jsx renders source references
if (fileContains("src/renderer/modules/helpAssistant/HelpAssistantAnswer.jsx", /sourceReferences/)) {
  pass("BRAIN-3: HelpAssistantAnswer.jsx renders source references");
} else {
  fail("BRAIN-3: HelpAssistantAnswer.jsx missing source references rendering");
}

// 16. HelpAssistantAnswer.jsx renders accounting safety boundary
if (fileContains("src/renderer/modules/helpAssistant/HelpAssistantAnswer.jsx", /accountingSafetyBoundary/)) {
  pass("BRAIN-3: HelpAssistantAnswer.jsx renders accounting safety boundary");
} else {
  fail("BRAIN-3: HelpAssistantAnswer.jsx missing accounting safety boundary rendering");
}

// 17. HelpAssistantAnswer.jsx renders brain results on noMatch
if (fileContains("src/renderer/modules/helpAssistant/HelpAssistantAnswer.jsx", /brainResults/)) {
  pass("BRAIN-3: HelpAssistantAnswer.jsx renders BRAIN-2 search results on noMatch");
} else {
  warn("BRAIN-3: HelpAssistantAnswer.jsx missing brainResults rendering");
}

// 18. HelpAssistantAnswer.jsx renders work order boundary
if (fileContains("src/renderer/modules/helpAssistant/HelpAssistantAnswer.jsx", /workOrderBoundary/)) {
  pass("BRAIN-3: HelpAssistantAnswer.jsx renders work order boundary");
} else {
  warn("BRAIN-3: HelpAssistantAnswer.jsx missing workOrderBoundary rendering");
}

if (fileContains("src/renderer/modules/helpAssistant/HelpAssistant.jsx", /answer\?\.safetyBoundary === "action-refused"/)) {
  pass("BRAIN-3: Help Assistant suppresses search action paths for refused requests");
} else {
  fail("BRAIN-3: Help Assistant may expose search action paths beside refused requests");
}

// 19. ERP Brain is not modified
if (fileContains("src/renderer/modules/erpBrain/index.js", /helpAssistant/)) {
  warn("BRAIN-3: ERP Brain index.js references Help Assistant (clean separation check)");
} else {
  pass("BRAIN-3: ERP Brain module has no Help Assistant dependency (clean separation)");
}

// 20. No LLM/chatbot references in help assistant files
const haFiles = [
  "src/renderer/modules/helpAssistant/helpAssistantUtils.js",
  "src/renderer/modules/helpAssistant/contextualBrainHelp.js",
  "src/renderer/modules/helpAssistant/HelpAssistant.jsx",
  "src/renderer/modules/helpAssistant/HelpAssistantAnswer.jsx"
];
let hasLLMRef = false;
for (const f of haFiles) {
  if (!fileExists(f)) continue;
  const c = readFileSync(resolve(ROOT, f), "utf-8").toLowerCase();
  if (c.includes("chatgpt") || c.includes("openai") || c.includes("claude") || c.includes("gemini") || c.includes("llm") || c.includes("chatbot") || c.includes("apiKey")) {
    fail(`BRAIN-3: ${f} contains LLM/chatbot/API key reference`);
    hasLLMRef = true;
  }
}
if (!hasLLMRef) pass("BRAIN-3: No LLM/chatbot/API key references in Help Assistant integration");

// 21. No database/write imports in contextualBrainHelp
const brainContextContent = contextualContent.toLowerCase();
if (brainContextContent.includes("init.js") || brainContextContent.includes("better-sqlite3") || brainContextContent.includes("ipc")) {
  fail("BRAIN-3: contextualBrainHelp.js imports database/IPC layer");
} else {
  pass("BRAIN-3: contextualBrainHelp.js has no database/IPC imports");
}

// 22. Runtime BRAIN-3 screen and source-backed query behavior
try {
  const knowledgeUrl = pathToFileURL(resolve(ROOT, "src/renderer/modules/helpAssistant/helpAssistantKnowledge.js")).href;
  const utilsUrl = pathToFileURL(resolve(ROOT, "src/renderer/modules/helpAssistant/helpAssistantUtils.js")).href;
  const { buildHelpAssistantKnowledge } = await import(knowledgeUrl);
  const { buildHelpAssistantAnswer, navigationLocationTopics } = await import(utilsUrl);
  const currentHelp = { title: "Billing / GST Invoice", viewKey: "invoices", description: "Invoice guidance" };
  const topics = buildHelpAssistantKnowledge(currentHelp);
  const screenAnswer = buildHelpAssistantAnswer({ query: "", mode: "screen", topics, currentHelp, currentView: "invoices", readiness: {}, coach: {}, stats: {} });
  if (screenAnswer.brainBacked && screenAnswer.workflowStage && screenAnswer.accountingSafetyBoundary && screenAnswer.sourceReferences?.length) {
    pass("BRAIN-3: Runtime screen guidance includes source-backed workflow and accounting safety context");
  } else {
    fail("BRAIN-3: Runtime screen guidance missing source-backed workflow or accounting safety context");
  }

  const billHistoryAnswer = buildHelpAssistantAnswer({ query: "Where is Bill History?Where is Bill History?", mode: "help", topics, currentHelp, currentView: "invoices", readiness: {}, coach: {}, stats: {} });
  const serializedBillHistoryAnswer = JSON.stringify(billHistoryAnswer);
  if (billHistoryAnswer.question === "Where is Bill History?" && billHistoryAnswer.viewKey === "purchase_bills" && billHistoryAnswer.directAnswer?.includes("Operations > Purchase Bills")) {
    pass("BRAIN-3: Runtime Bill History guidance normalizes duplicate input and returns deterministic navigation");
  } else {
    fail("BRAIN-3: Runtime Bill History guidance is duplicated or missing deterministic navigation");
  }
  if (!/BRAIN-\d|Brain Source|workflow-graph|database-graph|voucher-accounting-graph|renderer-graph|\"repository\"/.test(serializedBillHistoryAnswer)) {
    pass("BRAIN-3: Runtime user-facing answer contains no internal intelligence labels");
  } else {
    fail("BRAIN-3: Runtime user-facing answer leaks internal intelligence labels");
  }
  const navigationResults = navigationLocationTopics("Where is Bill History?", topics);
  if (navigationResults.map((topic) => topic.viewKey).join(",") === "purchase_bills,invoices") {
    pass("BRAIN-3: Live Bill History search results align with the deterministic navigation answer");
  } else {
    fail("BRAIN-3: Live Bill History search results contradict the deterministic navigation answer");
  }

  const unsafeActionAnswer = buildHelpAssistantAnswer({ query: "Post this voucher", mode: "help", topics, currentHelp, currentView: "invoices", readiness: {}, coach: {}, stats: {} });
  const refusalIsExplicit = /\b(cannot|unable)\b/i.test(unsafeActionAnswer.directAnswer || "");
  const hasNoExecutionPath = !unsafeActionAnswer.viewKey && !unsafeActionAnswer.relatedActions?.length && !unsafeActionAnswer.suggestedNextActions?.length;
  if (unsafeActionAnswer.safetyBoundary === "action-refused" && refusalIsExplicit && unsafeActionAnswer.prohibitedActions?.length && hasNoExecutionPath) {
    pass("BRAIN-3: Runtime Help mode refuses unsafe actions without exposing an execution path");
  } else {
    fail("BRAIN-3: Runtime Help mode does not enforce the read-only unsafe-action boundary");
  }
} catch (error) {
  fail(`BRAIN-3: Runtime integration failed: ${error.message}`);
}

console.log("\n------------------------------------------------------------");
console.log(`Summary:  ${results.passed} passed,  ${results.warnings} warnings,  ${results.failed} failed`);
console.log("============================================================");

process.exit(results.failed > 0 ? 1 : results.warnings > 0 ? 0 : 0);
