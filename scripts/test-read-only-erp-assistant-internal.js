#!/usr/bin/env node
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const results = { pass: 0, fail: 0, total: 0, details: [] };

function pad(n) { return n.toString().padStart(2, "0"); }

function pass(label, detail) {
  results.pass++; results.total++;
  results.details.push({ label, status: "PASS", detail });
  console.log(`  ${pad(results.total)}. ${"✓".padEnd(3)} ${label}`);
  if (detail) console.log(`       ${detail}`);
}

function fail(label, detail) {
  results.fail++; results.total++;
  results.details.push({ label, status: "FAIL", detail });
  console.log(`  ${pad(results.total)}. ${"✗".padEnd(3)} ${label}`);
  if (detail) console.log(`       ${detail}`);
}

function assert(condition, label, detail) {
  if (condition) pass(label, detail);
  else fail(label, detail);
}

console.log("============================================================");
console.log("BRAIN-4F Read-Only ERP Assistant — Internal User Testing");
console.log("============================================================\n");

const { resolveQuery } = await import("../src/renderer/modules/erpAssistant/sources/knowledgeBridge.js");

// ---- 1. Workflow Query Test ----
console.log("--- Category: Workflow ---");

let r = resolveQuery("Where is Work Order in the workflow?");
assert(r.safetyBoundary !== undefined, "WF-1: 'Where is Work Order in the workflow?' has safetyBoundary",
  `boundary=${r.safetyBoundary}, confidence=${r.confidence}`);
assert(r.sourceReferences !== undefined, "WF-1b: sourceReferences present", `count=${r.sourceReferences.length}`);

r = resolveQuery("What happens after CRAC?");
assert(r.answer === null || r.answer.length > 0, "WF-2: 'What happens after CRAC?' returns valid answer or null",
  `answer=${r.answer ? r.answer.substring(0, 40) : 'null'}`);

r = resolveQuery("What should I do after CRAC?");
assert(r.answer === null || r.answer.length > 0, "WF-3: 'What should I do after CRAC?' returns valid answer or null",
  `answer=${r.answer ? r.answer.substring(0, 40) : 'null'}`);

// ---- 2. Database/Table Query Test ----
console.log("\n--- Category: Database/Table ---");
r = resolveQuery("Which table supports billing?");
assert(r.safetyBoundary !== undefined, "DB-1: 'Which table supports billing?' has safetyBoundary",
  `boundary=${r.safetyBoundary}`);
assert(typeof r.relatedTables !== "undefined", "DB-1b: relatedTables present", Array.isArray(r.relatedTables) ? `tables=${r.relatedTables.join(",")}` : "is array");

r = resolveQuery("What table stores ledger entries?");
assert(typeof r.relatedTables !== "undefined", "DB-2: relatedTables present", Array.isArray(r.relatedTables) ? `tables=${r.relatedTables.join(",")}` : "is array");

// ---- 3. Voucher/Accounting Query Test ----
console.log("\n--- Category: Voucher/Accounting ---");
r = resolveQuery("Which voucher is created by a receipt?");
assert(r.safetyBoundary !== undefined, "VA-1: 'Which voucher is created by a receipt?' has safetyBoundary",
  `boundary=${r.safetyBoundary}`);
assert(typeof r.relatedVoucherTypes !== "undefined", "VA-1b: relatedVoucherTypes present", Array.isArray(r.relatedVoucherTypes) ? `types=${r.relatedVoucherTypes.join(",")}` : "is array");

r = resolveQuery("What is the debit/credit pattern for a sales invoice?");
assert(r.answer === null || r.answer.length > 0, "VA-2: 'debit/credit pattern for sales invoice' returns answer or null",
  `answer=${r.answer ? r.answer.substring(0, 40) : 'null'}`);

// ---- 4. Screen/Help Query Test ----
console.log("\n--- Category: Screen/Help ---");
r = resolveQuery("Where is Bill History?", "supply_orders");
assert(r.answer !== null, "SH-1: 'Where is Bill History?' returns answer with context",
  r.answer ? r.answer.substring(0, 60) : "null");

r = resolveQuery("How do I open purchase bills?");
assert(r.answer === null || r.answer.length > 0, "SH-2: 'How do I open purchase bills?' returns answer or null (low confidence)",
  r.answer ? r.answer.substring(0, 60) : "null");
assert(r.safetyBoundary !== undefined, "SH-2b: safetyBoundary present", `boundary=${r.safetyBoundary}`);

// ---- 5. Report Query Test ----
console.log("\n--- Category: Report ---");
r = resolveQuery("Which reports depend on ledger_entries?");
assert(typeof r.relatedReports !== "undefined", "RP-1: 'reports depend on ledger_entries' returns relatedReports",
  `count=${r.relatedReports?.length}`);

// ---- 6. GST/Tax Query Test ----
console.log("\n--- Category: GST/Tax ---");
r = resolveQuery("How is GST calculated on a sales invoice?");
assert(r.safetyBoundary !== undefined, "GT-1: GST query returns safetyBoundary", `boundary=${r.safetyBoundary}`);
assert(r.prohibitedActions !== undefined, "GT-1b: prohibitedActions present", `count=${r.prohibitedActions.length}`);

// ---- 7. Manual/Training Query Test ----
console.log("\n--- Category: Manual/Training ---");
r = resolveQuery("How do I complete month-end closing?");
assert(r.answer !== null, "MT-1: 'month-end closing' returns answer",
  r.answer ? r.answer.substring(0, 60) : "null");

// ---- 8. Troubleshooting Query Test ----
console.log("\n--- Category: Troubleshooting ---");
r = resolveQuery("Why is my voucher not posting?");
assert(typeof r.needsReview !== "undefined", "TS-1: troubleshooting query returns needsReview",
  `needsReview=${r.needsReview}`);

// ---- 9. Known Gap Query Test ----
console.log("\n--- Category: Known Gap ---");
r = resolveQuery("What are the known gaps in billing?");
assert(typeof r.knownGaps !== "undefined", "KG-1: known gaps query returns knownGaps array",
  `count=${r.knownGaps?.length}`);

// ---- 10. Unsafe Action Refusal Test ----
console.log("\n--- Category: Unsafe Action ---");
const unsafeQueries = [
  "post this voucher",
  "reverse this voucher",
  "approve this record",
  "delete this record",
  "restore this record",
  "import this file",
  "run command"
];
for (const q of unsafeQueries) {
  r = resolveQuery(q);
  assert(r.prohibitedActions && r.prohibitedActions.length > 0, `UA: '${q}' returns prohibitedActions`,
    `actions=[${r.prohibitedActions.join(",")}]`);
  assert(r.safetyBoundary && r.safetyBoundary.length > 0, `UA-${q}: safetyBoundary present`,
    `boundary=${r.safetyBoundary}`);
  assert(r.answer !== null, `UA-${q}: answer is not null (refusal)`,
    r.answer ? r.answer.substring(0, 50) : "null");
}

// ---- 11. Safety Boundary Tests ----
console.log("\n--- Category: Safety Boundary ---");
r = resolveQuery("What is the accounting impact of a sales invoice?");
assert(r.safetyBoundary !== "read-only guidance", "SB-1: accounting query overrides default boundary",
  `boundary=${r.safetyBoundary}`);

r = resolveQuery("How does inventory valuation work?");
assert(r.safetyBoundary !== undefined, "SB-2: inventory query returns safetyBoundary",
  `boundary=${r.safetyBoundary}`);

// ---- 12. Response Contract Structure Tests ----
console.log("\n--- Category: Response Contract ---");
r = resolveQuery("Work Order stage");
const contractFields = ["query", "answer", "confidence", "needsReview", "sourceReferences",
  "relatedWorkflowStages", "relatedScreens", "relatedTables", "relatedVoucherTypes",
  "relatedReports", "safetyBoundary", "knownGaps", "suggestedNextHelpTopic",
  "prohibitedActions", "rolePresentation"];
for (const field of contractFields) {
  assert(r[field] !== undefined, `RC: '${field}' present in response contract`,
    r[field] !== null ? `ok` : 'null');
}

// ---- 13. Role Presentation Tests ----
console.log("\n--- Category: Role Presentation ---");
const { renderForRole } = await import("../src/renderer/modules/erpAssistant/response/roleRenderer.js");
const baseResponse = resolveQuery("What is Trial Balance?");

const adminResult = renderForRole(baseResponse, "admin");
assert(adminResult.rolePresentation.depth === "diagnostic", "RP-1: admin depth = diagnostic",
  `depth=${adminResult.rolePresentation.depth}`);

const operatorResult = renderForRole(baseResponse, "operator");
assert(operatorResult.rolePresentation.depth === "basic", "RP-2: operator depth = basic",
  `depth=${operatorResult.rolePresentation.depth}`);

const readonlyResult = renderForRole(baseResponse, "readonly");
assert(readonlyResult.rolePresentation.depth === "basic", "RP-3: readonly depth = basic",
  `depth=${readonlyResult.rolePresentation.depth}`);

const accountantResult = renderForRole(baseResponse, "accountant");
assert(accountantResult.rolePresentation.depth === "detailed", "RP-4: accountant depth = detailed",
  `depth=${accountantResult.rolePresentation.depth}`);

// ---- 14. Screen Context Tests ----
console.log("\n--- Category: Screen Context ---");
const { resolveContext, resolveScreenAssistantContext } = await import("../src/renderer/modules/helpAssistant/contextualBrainHelp.js");
const salesContext = resolveContext("sales_invoices");
assert(salesContext.screenName !== null, "SC-1: sales_invoices resolves screenName",
  `screenName=${salesContext.screenName}`);
assert(salesContext.impact.accounting === true, "SC-2: sales_invoices has accounting impact", true);

const woContext = resolveContext("supply_orders");
assert(woContext.workflowInfo !== null, "SC-3: supply_orders has workflowInfo",
  `stage=${woContext.workflowInfo?.stage}`);

const salesAssistantContext = resolveScreenAssistantContext("sales_invoices");
assert(salesAssistantContext.safetyBoundaries.includes("accounting-sensitive"), "SC-4: sales_invoices has accounting-sensitive boundary",
  `boundaries=${JSON.stringify(salesAssistantContext.safetyBoundaries)}`);

// ---- 15. Empty Query Edge Case ----
console.log("\n--- Category: Edge Cases ---");
const emptyResult = resolveQuery("");
assert(emptyResult.answer === null, "EC-1: empty query returns null answer", true);
assert(emptyResult.needsReview === true, "EC-2: empty query needsReview is true", true);

const whitespaceResult = resolveQuery("   ");
assert(whitespaceResult.answer === null, "EC-3: whitespace query returns null answer", true);
assert(whitespaceResult.needsReview === true, "EC-4: whitespace query needsReview is true", true);

const nullResult = resolveQuery(null);
assert(nullResult.answer === null, "EC-5: null query returns null answer", true);

// ---- 16. Read-Only Guarantee Tests ----
console.log("\n--- Category: Read-Only Guarantee ---");
r = resolveQuery("post this voucher");
assert(r.answer !== null, "RO-1: unsafe action produces refusal answer",
  r.answer ? r.answer.substring(0, 60) : "null");
assert(r.answer.toLowerCase().includes("cannot") || r.answer.toLowerCase().includes("not") || r.answer.toLowerCase().includes("only"),
  "RO-2: refusal answer contains cannot/not/only", r.answer.substring(0, 80));

console.log("\n--- Category: BRAIN-4.1 Live Relevance Regression ---");
const typoUnsafe = resolveQuery("post this vocuher", "dashboard");
assert(typoUnsafe.safetyBoundary === "action-refused", "B4.1-1: typo unsafe voucher action is refused",
  `boundary=${typoUnsafe.safetyBoundary}`);
assert(!/Purchase Order|GeM Order/i.test(`${typoUnsafe.answer || ""} ${(typoUnsafe.sourceReferences || []).map((s) => s.title).join(" ")}`),
  "B4.1-2: typo unsafe refusal has no unrelated Purchase Order source",
  typoUnsafe.answer ? typoUnsafe.answer.substring(0, 80) : "null");

const reportQuery = resolveQuery("how many type of reports are there", "dashboard");
assert(/report/i.test(reportQuery.answer || ""), "B4.1-3: report type query returns report guidance",
  reportQuery.answer ? reportQuery.answer.substring(0, 80) : "null");
assert(!/Purchase Order|GeM Order/i.test(`${reportQuery.answer || ""} ${(reportQuery.sourceReferences || []).map((s) => s.title).join(" ")}`),
  "B4.1-4: report type query has no unrelated Purchase Order answer",
  reportQuery.answer ? reportQuery.answer.substring(0, 80) : "null");

const voucherDashboardQuery = resolveQuery("what is voucher dashboard for", "dashboard");
assert(/voucher dashboard|business voucher|guided voucher|accounting voucher/i.test(voucherDashboardQuery.answer || ""),
  "B4.1-5: voucher dashboard query returns voucher dashboard guidance",
  voucherDashboardQuery.answer ? voucherDashboardQuery.answer.substring(0, 80) : "null");
assert(voucherDashboardQuery.safetyBoundary === "accounting-sensitive",
  "B4.1-6: voucher dashboard query is accounting-sensitive",
  `boundary=${voucherDashboardQuery.safetyBoundary}`);

// ---- 17. Boundary Precision Tests ----
console.log("\n--- Category: Boundary Precision ---");
r = resolveQuery("What is the workflow stage for Supply Order?");
assert(r.relatedWorkflowStages !== undefined, "BP-1: workflow query has relatedWorkflowStages",
  `count=${r.relatedWorkflowStages?.length}`);

r = resolveQuery("What is the impact of a sales invoice on accounts?");
assert(r.safetyBoundary !== undefined, "BP-2: accounting-impact query has safetyBoundary",
  `boundary=${r.safetyBoundary}`);

// ---- Summary ----
console.log("\n------------------------------------------------------------");
console.log(`Results:  ${results.pass} passed,  ${results.fail} failed,  ${results.total} total`);
console.log("============================================================");

process.exit(results.fail > 0 ? 1 : 0);
