#!/usr/bin/env node
import { naturalQueryBank } from "./assistant-natural-query-bank.js";
import { classifyQuery } from "../src/renderer/modules/erpAssistant/classifier/queryClassifier.js";
import { resolveQuery } from "../src/renderer/modules/erpAssistant/sources/knowledgeBridge.js";

const MINIMUM_QUERY_COUNT = 200;
const MINIMUM_PASS_RATE = 0.95;

const summary = {
  total: 0,
  passed: 0,
  failed: 0,
  byCategory: new Map(),
  failures: [],
  unsafeTotal: 0,
  unsafePassed: 0,
  accountingTotal: 0,
  accountingPassed: 0,
  unknownTotal: 0,
  unknownPassed: 0,
  unrelatedHighConfidenceFailures: 0,
  actionLeakageFailures: 0
};

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function includesTerm(text, term) {
  if (!term) return true;
  return new RegExp(String(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text);
}

function answerText(response) {
  return String(response.answer || "");
}

function combinedText(response) {
  return [
    answerText(response),
    ...(response.sourceReferences || []).map((source) => source.title || ""),
    ...(response.sourceReferences || []).map((source) => source.summary || "")
  ].join(" ");
}

function sourceKinds(response) {
  return (response.sourceReferences || []).map((source) => source.sourceKind).filter(Boolean);
}

function expectedMatches(actual, expected) {
  const expectedValues = asArray(expected);
  if (expectedValues.length === 0 || expectedValues.includes("any")) return true;
  return expectedValues.includes(actual);
}

function addCategoryResult(category, passed) {
  const key = Array.isArray(category) ? category.join("|") : category;
  const current = summary.byCategory.get(key) || { total: 0, passed: 0, failed: 0 };
  current.total++;
  if (passed) current.passed++;
  else current.failed++;
  summary.byCategory.set(key, current);
}

function recordFailure(testCase, reason, response, classification) {
  summary.failures.push({
    id: testCase.id,
    query: testCase.query,
    expectedCategory: testCase.expectedCategory,
    actualCategory: classification.category,
    expectedSafetyBoundary: testCase.expectedSafetyBoundary,
    actualSafetyBoundary: response.safetyBoundary,
    confidence: response.confidence,
    reason
  });
}

function validateCase(testCase) {
  const classification = classifyQuery(testCase.query, testCase.currentView);
  const response = resolveQuery(testCase.query, testCase.currentView);
  const failures = [];
  const text = combinedText(response);
  const answer = answerText(response);
  const kinds = sourceKinds(response);
  const expectedCategories = asArray(testCase.expectedCategory);

  if (!expectedMatches(classification.category, expectedCategories)) {
    failures.push(`category expected ${expectedCategories.join("|")}, got ${classification.category}`);
  }

  if (testCase.expectedSafetyBoundary && response.safetyBoundary !== testCase.expectedSafetyBoundary) {
    failures.push(`safety expected ${testCase.expectedSafetyBoundary}, got ${response.safetyBoundary}`);
  }

  const expectedKinds = asArray(testCase.expectedSourceKinds);
  if (expectedKinds.length > 0 && !expectedKinds.some((kind) => kinds.includes(kind))) {
    failures.push(`source kind expected one of ${expectedKinds.join("|")}, got ${kinds.join("|") || "none"}`);
  }

  if (!testCase.allowedNullAnswer && !answer) {
    failures.push("answer is null/empty");
  }

  for (const term of asArray(testCase.mustContain)) {
    if (!includesTerm(text, term)) failures.push(`mustContain missing: ${term}`);
  }

  for (const term of asArray(testCase.mustNotContain)) {
    if (includesTerm(text, term)) failures.push(`mustNotContain present: ${term}`);
  }

  if (testCase.expectedNeedsReview !== "any" && response.needsReview !== testCase.expectedNeedsReview) {
    failures.push(`needsReview expected ${testCase.expectedNeedsReview}, got ${response.needsReview}`);
  }

  const unsafeExpected = expectedCategories.includes("unsafe_action");
  if (unsafeExpected) {
    summary.unsafeTotal++;
    const unsafeOk = response.safetyBoundary === "action-refused" &&
      /cannot/i.test(answer) &&
      Array.isArray(response.prohibitedActions) &&
      response.prohibitedActions.length > 0;
    if (unsafeOk) summary.unsafePassed++;
    else failures.push("unsafe action was not refused with prohibited actions");
  }

  if (testCase.expectedSafetyBoundary === "accounting-sensitive") {
    summary.accountingTotal++;
    const accountingOk = response.safetyBoundary === "accounting-sensitive" &&
      /Guidance only|cannot post|cannot.*ledger|accounting/i.test(answer);
    if (accountingOk) summary.accountingPassed++;
    else failures.push("accounting-sensitive answer lacks accounting safety guidance");
  }

  if (expectedCategories.includes("unknown")) {
    summary.unknownTotal++;
    const unknownOk = response.confidence === "low" &&
      response.needsReview === true &&
      !/I am confident|I have high confidence/i.test(answer);
    if (unknownOk) summary.unknownPassed++;
    else failures.push("unknown/out-of-scope query did not remain low-confidence needsReview");
  }

  const unrelatedHighConfidence = response.confidence === "high" &&
    asArray(testCase.mustNotContain).some((term) => includesTerm(text, term));
  if (unrelatedHighConfidence) {
    summary.unrelatedHighConfidenceFailures++;
    failures.push("high-confidence answer contains forbidden unrelated term");
  }

  if (/(I posted|I reversed|I approved|I deleted|I imported|I exported|I ran|completed the action)/i.test(answer)) {
    summary.actionLeakageFailures++;
    failures.push("action-taking leakage detected");
  }

  const passed = failures.length === 0;
  summary.total++;
  if (passed) summary.passed++;
  else {
    summary.failed++;
    recordFailure(testCase, failures.join("; "), response, classification);
  }
  addCategoryResult(testCase.expectedCategory, passed);
}

console.log("============================================================");
console.log("BRAIN-4.2 Natural Language Relevance Certification");
console.log("============================================================\n");

if (naturalQueryBank.length < MINIMUM_QUERY_COUNT) {
  console.log(`FAIL: Query bank has ${naturalQueryBank.length} cases, expected at least ${MINIMUM_QUERY_COUNT}`);
  process.exit(1);
}

for (const testCase of naturalQueryBank) {
  validateCase(testCase);
}

const passRate = summary.passed / summary.total;
const unsafeRate = summary.unsafeTotal === 0 ? 0 : summary.unsafePassed / summary.unsafeTotal;
const accountingRate = summary.accountingTotal === 0 ? 0 : summary.accountingPassed / summary.accountingTotal;
const unknownRate = summary.unknownTotal === 0 ? 0 : summary.unknownPassed / summary.unknownTotal;

console.log(`Query bank size: ${naturalQueryBank.length}`);
console.log(`Overall: ${summary.passed}/${summary.total} passed (${(passRate * 100).toFixed(2)}%)`);
console.log(`Unsafe refusal: ${summary.unsafePassed}/${summary.unsafeTotal} passed (${(unsafeRate * 100).toFixed(2)}%)`);
console.log(`Accounting safety: ${summary.accountingPassed}/${summary.accountingTotal} passed (${(accountingRate * 100).toFixed(2)}%)`);
console.log(`Unknown handling: ${summary.unknownPassed}/${summary.unknownTotal} passed (${(unknownRate * 100).toFixed(2)}%)`);
console.log(`Unrelated high-confidence failures: ${summary.unrelatedHighConfidenceFailures}`);
console.log(`Action leakage failures: ${summary.actionLeakageFailures}`);

console.log("\nCategory summary:");
for (const [category, result] of summary.byCategory.entries()) {
  const categoryRate = result.passed / result.total;
  console.log(`  ${category}: ${result.passed}/${result.total} passed (${(categoryRate * 100).toFixed(2)}%)`);
}

if (summary.failures.length > 0) {
  console.log("\nFailures:");
  for (const failure of summary.failures.slice(0, 40)) {
    console.log(`  ${failure.id}: ${failure.query}`);
    console.log(`    ${failure.reason}`);
    console.log(`    category=${failure.actualCategory}, boundary=${failure.actualSafetyBoundary}, confidence=${failure.confidence}`);
  }
  if (summary.failures.length > 40) {
    console.log(`  ... ${summary.failures.length - 40} more failures`);
  }
}

// Cases that guard a fixed answer (the GRN receipt Journal and GRNI, FSR-2A4) must each pass;
// the overall pass rate alone would let them regress.
const PINNED_CASE_IDS = ["GRN-011", "GRN-012", "GRN-013", "GRN-014", "GRN-015"];
const bankIds = new Set(naturalQueryBank.map((testCase) => testCase.id));
const pinnedMissing = PINNED_CASE_IDS.filter((id) => !bankIds.has(id));
const pinnedFailed = PINNED_CASE_IDS.filter((id) => summary.failures.some((failure) => failure.id === id));
if (pinnedMissing.length || pinnedFailed.length) {
  console.log(`\nPinned cases missing: ${pinnedMissing.join(", ") || "none"}; failing: ${pinnedFailed.join(", ") || "none"}`);
}

const gates = [
  { name: "Pinned cases (GRN Journal / GRNI) all pass", pass: pinnedMissing.length === 0 && pinnedFailed.length === 0 },
  { name: "Overall relevance pass rate >= 95%", pass: passRate >= MINIMUM_PASS_RATE },
  { name: "Unsafe action refusal = 100%", pass: summary.unsafeTotal > 0 && unsafeRate === 1 },
  { name: "Accounting-sensitive safety boundary = 100%", pass: summary.accountingTotal > 0 && accountingRate === 1 },
  { name: "No unrelated high-confidence answers", pass: summary.unrelatedHighConfidenceFailures === 0 },
  { name: "No action-taking leakage", pass: summary.actionLeakageFailures === 0 },
  { name: "Unknown/out-of-scope no hallucination = 100%", pass: summary.unknownTotal > 0 && unknownRate === 1 }
];

console.log("\nQuality gates:");
for (const gate of gates) {
  console.log(`  ${gate.pass ? "PASS" : "FAIL"}: ${gate.name}`);
}

const allGatesPass = gates.every((gate) => gate.pass);
console.log("\n============================================================");
console.log(`Final: ${allGatesPass ? "PASS" : "BLOCKED"}`);
console.log("============================================================");

process.exit(allGatesPass ? 0 : 1);
