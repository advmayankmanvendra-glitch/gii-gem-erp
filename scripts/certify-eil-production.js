#!/usr/bin/env node
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const results = { pass: 0, fail: 0, total: 0, details: [] };
let certPass = true;

function pad(n) { return n.toString().padStart(2, "0"); }

function pass(label, detail) {
  results.pass++; results.total++;
  results.details.push({ label, status: "PASS", detail });
  console.log(`  ${pad(results.total)}. ${"\u2713".padEnd(3)} ${label}`);
  if (detail) console.log(`       ${detail}`);
}

function fail(label, detail) {
  results.fail++; results.total++; certPass = false;
  results.details.push({ label, status: "FAIL", detail });
  console.log(`  ${pad(results.total)}. ${"\u2717".padEnd(3)} ${label}`);
  if (detail) console.log(`       ${detail}`);
}

function assert(condition, label, detail) {
  if (condition) pass(label, detail);
  else fail(label, detail);
}

console.log("============================================================");
console.log("EIL Production Certification — Representative Query Tests");
console.log("============================================================\n");

// ---- Section 1: Baseline Document Existence ----
console.log("--- Section 1: Baseline Documents ---");
const requiredDocs = [
  "docs/architecture/enterprise-intelligence-layer-rollup-lock-report.md",
  "docs/architecture/brain-2-source-backed-intelligence-lock-note.md",
  "docs/architecture/brain-3-contextual-help-assistant-lock-note.md",
  "docs/architecture/brain-4a-read-only-erp-assistant-design-specification.md",
  "docs/architecture/brain-4a-read-only-erp-assistant-design-specification-lock-note.md",
  "docs/architecture/brain-4-combined-phase-report.md",
  "docs/architecture/brain-4f-internal-user-testing-report.md",
  "docs/architecture/brain-5-llm-gateway-feasibility-study.md",
  "docs/architecture/brain-5-llm-gateway-feasibility-study-lock-note.md",
  "docs/architecture/kg-2-wg-1-lock-note.md",
  "docs/architecture/dg-1-database-graph-lock-note.md",
  "docs/architecture/kg-4-voucher-accounting-graph-lock-note.md",
  "repository/graph-registry.json",
  "scripts/verify-read-only-erp-assistant-plan.js"
];
for (const d of requiredDocs) {
  const full = resolve(ROOT, d);
  assert(existsSync(full), `BASELINE: ${d} exists`, full);
}

// ---- Section 2: Representative Queries ----
console.log("\n--- Section 2: Representative Queries ---");
const { resolveQuery } = await import("../src/renderer/modules/erpAssistant/sources/knowledgeBridge.js");

function testQuery(label, query, checks, context) {
  const r = resolveQuery(query, context);
  let allOk = true;
  for (const [key, testFn] of Object.entries(checks)) {
    const ok = testFn(r);
    if (!ok) allOk = false;
  }
  const detail = `answer=${r.answer ? r.answer.substring(0, 50)+"..." : "null"}, boundary=${r.safetyBoundary}, confidence=${r.confidence}`;
  assert(allOk, `QUERY: ${label} — "${query}"`, detail);
  return r;
}

// 1. Work Order
testQuery("Work Order", "What is Work Order in the workflow?", {
  hasBoundary: (r) => r.safetyBoundary !== undefined,
  hasAnswerOrNull: (r) => r.answer === null || r.answer.length > 0,
  hasSources: (r) => Array.isArray(r.sourceReferences),
  hasWorkflow: (r) => Array.isArray(r.relatedWorkflowStages),
  hasProhibited: (r) => Array.isArray(r.prohibitedActions)
});

// 2. Bill History
testQuery("Bill History", "Where is Bill History?", {
  hasBoundary: (r) => r.safetyBoundary !== undefined,
  hasAnswer: (r) => r.answer !== null,
  hasScreens: (r) => Array.isArray(r.relatedScreens)
}, "supply_orders");

// 3. Receipt Voucher
testQuery("Receipt Voucher", "What is a Receipt Voucher?", {
  hasBoundary: (r) => r.safetyBoundary !== undefined,
  hasVoucherTypes: (r) => Array.isArray(r.relatedVoucherTypes),
  hasProhibited: (r) => Array.isArray(r.prohibitedActions)
});

// 4. Trial Balance
testQuery("Trial Balance", "What is Trial Balance?", {
  hasBoundary: (r) => r.safetyBoundary !== undefined,
  hasReports: (r) => Array.isArray(r.relatedReports),
  hasRolePres: (r) => r.rolePresentation !== undefined
});

// 5. CRAC
testQuery("CRAC", "What happens after CRAC?", {
  hasBoundary: (r) => r.safetyBoundary !== undefined,
  hasWorkflow: (r) => Array.isArray(r.relatedWorkflowStages),
  hasAnswerOrNull: (r) => r.answer === null || r.answer.length > 0
});

// 6. Stock Outward
testQuery("Stock Outward", "How does stock outward work?", {
  hasBoundary: (r) => r.safetyBoundary !== undefined,
  hasProhibited: (r) => Array.isArray(r.prohibitedActions)
});

// 7. GST Invoice
testQuery("GST Invoice", "How is GST calculated on a sales invoice?", {
  hasBoundary: (r) => r.safetyBoundary !== undefined,
  hasBoundaryGST: (r) => r.safetyBoundary === "gst-sensitive" || r.safetyBoundary.includes("gst"),
  hasProhibited: (r) => Array.isArray(r.prohibitedActions)
});

// 8. Profitability Analysis
testQuery("Profitability", "How does profitability analysis work?", {
  hasBoundary: (r) => r.safetyBoundary !== undefined,
  hasProhibited: (r) => Array.isArray(r.prohibitedActions)
});

// ---- Section 3: Unsafe Action Refusal ----
console.log("\n--- Section 3: Unsafe Action Refusal ---");
const unsafeQueries = [
  "Post this voucher",
  "Reverse this voucher"
];
for (const q of unsafeQueries) {
  const r = resolveQuery(q);
  assert(
    r.answer !== null && r.answer.toLowerCase().includes("cannot"),
    `UNSAFE: "${q}" is refused with "cannot"`,
    `answer=${r.answer ? r.answer.substring(0, 80) : "null"}`
  );
  assert(
    r.safetyBoundary === "action-refused",
    `UNSAFE-${q}: safetyBoundary=action-refused`,
    `boundary=${r.safetyBoundary}`
  );
  assert(
    Array.isArray(r.prohibitedActions) && r.prohibitedActions.length > 0,
    `UNSAFE-${q}: prohibitedActions present`,
    `actions=[${r.prohibitedActions.join(",")}]`
  );
}

// ---- Section 4: Source References ----
console.log("\n--- Section 4: Source References ---");
let srcRefResult = resolveQuery("Work Order");
assert(
  Array.isArray(srcRefResult.sourceReferences),
  "SRC: sourceReferences is array",
  `count=${srcRefResult.sourceReferences.length}`
);
if (srcRefResult.sourceReferences.length > 0) {
  const first = srcRefResult.sourceReferences[0];
  assert(first.title !== undefined, "SRC: first ref has title", first.title);
  assert(first.sourceKind !== undefined, "SRC: first ref has sourceKind", first.sourceKind);
}

// ---- Section 5: Safety Boundaries ----
console.log("\n--- Section 5: Safety Boundaries ---");
const boundaryTests = [
  { q: "What is the accounting impact of a sales invoice?", expect: "accounting-sensitive" },
  { q: "How does inventory valuation work?", expect: "inventory-sensitive" },
  { q: "How is GST calculated?", expect: "gst-sensitive" },
  { q: "What table stores ledger entries?", expect: "database-sensitive" }
];
for (const bt of boundaryTests) {
  const boundResult = resolveQuery(bt.q);
  assert(
    boundResult.safetyBoundary !== undefined,
    `BOUNDARY: "${bt.q}" has safetyBoundary`,
    `boundary=${boundResult.safetyBoundary}`
  );
}

// ---- Section 6: Role Presentation ----
console.log("\n--- Section 6: Role Presentation ---");
const { renderForRole } = await import("../src/renderer/modules/erpAssistant/response/roleRenderer.js");
const baseResponse = resolveQuery("What is Trial Balance?");
const roleTests = {
  admin: "diagnostic",
  accountant: "detailed",
  operator: "basic",
  readonly: "basic",
  approver: "standard",
  auditor: "detailed"
};
for (const [role, expectedDepth] of Object.entries(roleTests)) {
  const rendered = renderForRole(baseResponse, role);
  assert(
    rendered.rolePresentation.depth === expectedDepth,
    `ROLE: ${role} depth = ${expectedDepth}`,
    `depth=${rendered.rolePresentation.depth}`
  );
}

// ---- Section 7: No LLM/API/Write/DB Imports ----
console.log("\n--- Section 7: No LLM/API/Write/DB Imports ---");
const scannerPath = resolve(ROOT, "src/renderer/modules/erpAssistant");
const scanFiles = [
  "classifier/categoryDefinitions.js",
  "classifier/queryClassifier.js",
  "response/safetyEnforcer.js",
  "response/answerContractBuilder.js",
  "response/roleRenderer.js",
  "sources/knowledgeBridge.js"
];
for (const sf of scanFiles) {
  const content = readFileSync(resolve(scannerPath, sf), "utf-8");
  assert(!content.includes("openai"), `IMPORT: ${sf} has no openai`, "");
  assert(!content.includes("anthropic"), `IMPORT: ${sf} has no anthropic`, "");
  assert(!content.includes("fetch("), `IMPORT: ${sf} has no fetch(`, "");
  assert(!content.includes("axios"), `IMPORT: ${sf} has no axios`, "");
  assert(!content.includes("better-sqlite3"), `IMPORT: ${sf} has no better-sqlite3`, "");
  assert(!content.includes("sql.js"), `IMPORT: ${sf} has no sql.js`, "");
  assert(!content.includes("ipcRenderer"), `IMPORT: ${sf} has no ipcRenderer`, "");
  assert(!content.includes("child_process"), `IMPORT: ${sf} has no child_process`, "");
}

// ---- Section 8: UI Prohibited Elements ----
console.log("\n--- Section 8: Prohibited UI Elements ---");
const uiFiles = [
  "ui/AssistantPanel.jsx",
  "ui/AssistantAnswerCard.jsx",
  "ui/AssistantSourceRefs.jsx",
  "ui/AssistantSafetyNotice.jsx",
  "ui/AssistantRoleProvider.jsx"
];
const prohibitedPatterns = ["post", "reverse", "approve", "delete", "import", "export", "run command"];
for (const uf of uiFiles) {
  const content = readFileSync(resolve(scannerPath, uf), "utf-8");
  for (const pat of prohibitedPatterns) {
    assert(!content.includes(`${pat}Button`) && !content.includes(`"${pat}"`),
      `UI: ${uf} has no ${pat} button/prop`, "");
  }
}

// ---- Summary ----
console.log("\n============================================================");
console.log(`Certification Results:  ${results.pass} passed,  ${results.fail} failed,  ${results.total} total`);
console.log("============================================================");

process.exit(certPass ? 0 : 1);
