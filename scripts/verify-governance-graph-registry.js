/**
 * GGR-1 Governance and Graph Registry Reconciliation verifier.
 *
 * This script is read-only. It validates constitutional numbering/versioning,
 * graph lifecycle metadata, dependency reciprocity, graph counts/versions,
 * pending metrics and the 316-file report disposition manifest.
 */

import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(__dirname, "..");

const EXPECTED_LIFECYCLE_STATUSES = [
  "ACTIVE",
  "COMPLETED",
  "MERGED",
  "SUPERSEDED",
  "PLANNED",
  "DEFERRED",
  "RETIRED",
  "UNVERIFIED",
];

const EXPECTED_EFFECTIVE_PENDING = ["DG-1", "WG-1", "KG-4", "FF-1", "AG-1", "KG-5"];

function readText(root, path) {
  return readFileSync(resolve(root, path), "utf8");
}

function readJson(root, path) {
  return JSON.parse(readText(root, path));
}

function sha256(root, path) {
  return createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex").toUpperCase();
}

function sorted(values) {
  return [...values].sort((a, b) => String(a).localeCompare(String(b)));
}

function sameMembers(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function ruleHeadings(text) {
  return [...text.matchAll(/^## (\d+)\. (.+)$/gm)].map((match) => ({
    number: Number(match[1]),
    title: match[2].trim(),
    index: match.index,
  }));
}

function ruleBlock(text, number) {
  const headings = ruleHeadings(text);
  const index = headings.findIndex((heading) => heading.number === number);
  if (index < 0) return null;
  const start = headings[index].index;
  const end = index + 1 < headings.length ? headings[index + 1].index : text.length;
  return text
    .slice(start, end)
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "---")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function repositoryEntryCount(root, repositoryName) {
  const data = readJson(root, `src/renderer/modules/erpBrain/repository/${repositoryName}/index.json`);
  const entries = Array.isArray(data)
    ? data
    : data[repositoryName] || data.entries || data.items;
  if (!Array.isArray(entries)) throw new Error(`BRAIN-1 ${repositoryName} index is not an array`);
  return entries.length;
}

function isGitIgnored(root, path) {
  try {
    execFileSync("git", ["check-ignore", "-q", "--", path], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function isGitTracked(root, path) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", path], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function collectGovernanceGraphRegistryFindings(root = DEFAULT_ROOT) {
  const findings = [];
  const pass = (message) => findings.push({ level: "PASS", message });
  const info = (message) => findings.push({ level: "INFO", message });
  const fail = (message) => findings.push({ level: "FAIL", message });
  const check = (condition, ok, bad = ok) => (condition ? pass(ok) : fail(bad));

  try {
    const agents = readText(root, "AGENTS.md");
    const constitution = readText(root, "docs/architecture/permanent-architecture-rules.md");
    const agentsVersion = agents.match(/^Version:\s*([0-9.]+)/m)?.[1];
    const constitutionVersion = constitution.match(/^Version:\s*([0-9.]+)/m)?.[1];
    check(
      agentsVersion === "3.4" && constitutionVersion === "3.4",
      "Permanent Architecture Rules headers agree at v3.4",
      `Permanent Architecture Rules version mismatch: AGENTS=${agentsVersion || "missing"}, constitution=${constitutionVersion || "missing"}`,
    );

    const agentsRules = ruleHeadings(agents);
    const constitutionRules = ruleHeadings(constitution);
    const expectedNumbers = Array.from({ length: 32 }, (_, index) => index + 1);
    check(
      sameMembers(agentsRules.map((rule) => rule.number), expectedNumbers),
      "AGENTS.md contains exactly Rules 1-32 with no gap or duplicate",
      `AGENTS.md rule numbers are ${agentsRules.map((rule) => rule.number).join(", ")}`,
    );
    check(
      sameMembers(constitutionRules.map((rule) => rule.number), expectedNumbers),
      "Canonical constitution contains exactly Rules 1-32 with no gap or duplicate",
      `Constitution rule numbers are ${constitutionRules.map((rule) => rule.number).join(", ")}`,
    );

    const titleMismatch = expectedNumbers.filter((number) => {
      const agentsTitle = agentsRules.find((rule) => rule.number === number)?.title;
      const constitutionTitle = constitutionRules.find((rule) => rule.number === number)?.title;
      return agentsTitle !== constitutionTitle;
    });
    check(
      titleMismatch.length === 0,
      "Rule titles are synchronized between AGENTS.md and the canonical constitution",
      `Rule title mismatch at: ${titleMismatch.join(", ")}`,
    );
    check(
      ruleBlock(agents, 31) === ruleBlock(constitution, 31),
      "Rule 31 AIR content is synchronized exactly",
      "Rule 31 AIR content differs between AGENTS.md and the canonical constitution",
    );
    const historyVersions = [...constitution.matchAll(/^\| v(\d+\.\d+) \|/gm)].map((match) => match[1]);
    check(
      historyVersions.includes("3.4") && constitutionVersion === "3.4",
      "Constitution header matches its latest v3.4 history entry",
      `Constitution history/header mismatch: header=${constitutionVersion}, history=${historyVersions.join(", ")}`,
    );
  } catch (error) {
    fail(`Permanent Architecture Rules validation error: ${error.message}`);
  }

  let registry;
  try {
    registry = readJson(root, "repository/graph-registry.json");
    pass("Graph registry JSON parses successfully");
  } catch (error) {
    fail(`Graph registry JSON parse error: ${error.message}`);
    return findings;
  }

  check(registry.registryVersion === "1.4.0", "Graph registry is reconciled at v1.4.0", `Registry version is ${registry.registryVersion}`);
  const lifecycleStatuses = Object.keys(registry.lifecyclePolicy?.statuses || {});
  check(
    JSON.stringify(lifecycleStatuses) === JSON.stringify(EXPECTED_LIFECYCLE_STATUSES),
    "Lifecycle policy defines the eight canonical statuses in governed order",
    `Lifecycle statuses are ${lifecycleStatuses.join(", ")}`,
  );

  const graphs = Array.isArray(registry.graphs) ? registry.graphs : [];
  const historical = Array.isArray(registry.historicalStages) ? registry.historicalStages : [];
  const graphIds = graphs.map((graph) => graph.graphId);
  const historicalIds = historical.map((stage) => stage.id);
  check(graphs.length === 9, "Nine primary graphs are registered", `Primary graph count is ${graphs.length}`);
  check(new Set(graphIds).size === graphIds.length, "Primary graph identifiers are unique", "Duplicate primary graph identifier detected");
  check(new Set(historicalIds).size === historicalIds.length, "Historical-stage identifiers are unique", "Duplicate historical-stage identifier detected");
  const crossSection = graphIds.filter((id) => historicalIds.includes(id));
  check(crossSection.length === 0, "Primary and historical sections have no duplicate identifier", `Cross-section duplicate identifiers: ${crossSection.join(", ")}`);

  const allowedStatuses = new Set(EXPECTED_LIFECYCLE_STATUSES);
  const invalidPrimaryStatuses = graphs.filter((graph) => !allowedStatuses.has(graph.lifecycleStatus));
  check(invalidPrimaryStatuses.length === 0, "All primary graphs use a valid canonical lifecycleStatus", `Invalid primary lifecycle status: ${invalidPrimaryStatuses.map((graph) => graph.graphId).join(", ")}`);
  const legacyMismatch = graphs.filter((graph) => registry.lifecyclePolicy?.legacyValueMap?.[graph.status] !== graph.lifecycleStatus);
  check(legacyMismatch.length === 0, "Legacy status values map to canonical lifecycle statuses", `Legacy/canonical mismatch: ${legacyMismatch.map((graph) => graph.graphId).join(", ")}`);
  const invalidHistoricalStatuses = historical.filter((stage) => !allowedStatuses.has(stage.recommendedStatus));
  check(invalidHistoricalStatuses.length === 0, "All historical stages use valid canonical statuses", `Invalid historical status: ${invalidHistoricalStatuses.map((stage) => stage.id).join(", ")}`);
  const missingSuccessors = historical.filter(
    (stage) => ["MERGED", "SUPERSEDED"].includes(stage.recommendedStatus) && !String(stage.successor || "").trim(),
  );
  check(missingSuccessors.length === 0, "MERGED and SUPERSEDED stages identify successors", `Missing successors: ${missingSuccessors.map((stage) => stage.id).join(", ")}`);

  const allVersionsValid = graphs.every((graph) => /^\d+\.\d+\.\d+$/.test(graph.version));
  check(allVersionsValid, "All primary graph versions use three-part semantic versions", "A primary graph version is not three-part semantic versioning");
  const matrixMismatch = graphs.filter((graph) => registry.compatibilityMatrix?.[graph.graphId]?.version !== graph.version);
  check(matrixMismatch.length === 0, "Compatibility-matrix graph versions match primary records", `Version mismatch: ${matrixMismatch.map((graph) => graph.graphId).join(", ")}`);

  const dependencyKeys = Object.keys(registry.dependencies || {});
  check(sameMembers(dependencyKeys, graphIds), "Dependency index covers every primary graph exactly once", "Dependency index keys do not match primary graph identifiers");
  const dependencyProblems = [];
  for (const graphId of graphIds) {
    const node = registry.dependencies?.[graphId] || { dependsOn: [], dependedBy: [] };
    for (const dependency of node.dependsOn || []) {
      if (!graphIds.includes(dependency)) dependencyProblems.push(`${graphId} depends on unknown ${dependency}`);
      else if (!(registry.dependencies?.[dependency]?.dependedBy || []).includes(graphId)) dependencyProblems.push(`${dependency} missing reverse edge to ${graphId}`);
    }
    for (const consumer of node.dependedBy || []) {
      if (!graphIds.includes(consumer)) dependencyProblems.push(`${graphId} referenced by unknown ${consumer}`);
      else if (!(registry.dependencies?.[consumer]?.dependsOn || []).includes(graphId)) dependencyProblems.push(`${consumer} missing forward edge to ${graphId}`);
    }
  }
  check(dependencyProblems.length === 0, "All registry dependency edges are reciprocal and resolve", dependencyProblems.join("; "));

  try {
    const repositories = ["modules", "workflows", "reports", "screens", "rules", "glossary", "navigation", "errors"];
    const repositoryCounts = Object.fromEntries(repositories.map((name) => [name, repositoryEntryCount(root, name)]));
    const brainCount = Object.values(repositoryCounts).reduce((sum, count) => sum + count, 0);
    const brainManifest = readJson(root, "src/renderer/modules/erpBrain/repository/index.json");
    const brainRegistry = graphs.find((graph) => graph.graphId === "BRAIN-1");
    const manifestRepositoryMismatch = repositories.filter(
      (name) => brainManifest.meta?.repositories?.[name]?.entryCount !== repositoryCounts[name],
    );
    check(brainCount === 224, "BRAIN-1 fresh repository count is 224", `BRAIN-1 fresh count is ${brainCount}`);
    check(brainManifest.meta?.totalEntries === brainCount, "BRAIN-1 manifest total matches fresh count", `BRAIN-1 manifest total is ${brainManifest.meta?.totalEntries}, fresh=${brainCount}`);
    check(brainRegistry?.entryCount === brainCount, "BRAIN-1 registry entryCount matches fresh count", `BRAIN-1 registry count is ${brainRegistry?.entryCount}, fresh=${brainCount}`);
    check(manifestRepositoryMismatch.length === 0, "BRAIN-1 per-repository manifest counts match source indexes", `BRAIN-1 manifest mismatch: ${manifestRepositoryMismatch.join(", ")}`);

    const rg = readJson(root, "src/renderer/knowledge/renderer-graph.json");
    const dg = readJson(root, "src/renderer/knowledge/database-graph.json");
    const wg = readJson(root, "src/renderer/knowledge/workflow-graph.json");
    const kg4 = readJson(root, "src/renderer/knowledge/voucher-accounting-graph.json");
    const ff1 = readJson(root, "src/renderer/knowledge/feature-function-graph.json");
    const ag1 = readJson(root, "src/renderer/knowledge/audit-graph.json");
    const kg5 = readJson(root, "src/renderer/knowledge/manual-graph.json");
    const actualCounts = {
      "RG-1": rg.filesScanned,
      "DG-1": dg.tables?.length,
      "WG-1": wg.nodes?.length,
      "KG-4": kg4.voucherTypes?.length,
      "FF-1": ff1.featureNodes?.length,
      "AG-1": ag1.eventCatalog?.length,
      "KG-5": kg5.manuals?.length,
    };
    const countMismatch = Object.entries(actualCounts).filter(([graphId, count]) => graphs.find((graph) => graph.graphId === graphId)?.entryCount !== count);
    check(countMismatch.length === 0, "Generated graph entry counts match registry metadata", `Entry-count mismatch: ${countMismatch.map(([id, count]) => `${id}=${count}`).join(", ")}`);
    check(rg.meta?.version === "2.0.0" && rg.metadata?.version === "2.0.0", "RG-1 graph-data version is consistently 2.0.0", `RG-1 versions are ${rg.meta?.version}/${rg.metadata?.version}`);
    check(rg.evolution?.future?.graphsActive === 9, "RG-1 evolution metadata records nine Active graphs", `RG-1 active graph count is ${rg.evolution?.future?.graphsActive}`);
    const ffText = JSON.stringify(ff1.futureExtensions || {});
    check(!/requires a separate FF-2 phase/i.test(ffText), "FF-1 no longer carries the stale separate-FF-2 requirement", "FF-1 still claims a separate FF-2 runtime-routing phase is required");
    check(ff1.futureExtensions?.plannedFeatures?.length === 2, "FF-1 retains exactly two genuine future obligations", `FF-1 planned feature count is ${ff1.futureExtensions?.plannedFeatures?.length}`);
  } catch (error) {
    fail(`Graph artefact metadata validation error: ${error.message}`);
  }

  const reconciliation = registry.reconciliation || {};
  const storedCounts = reconciliation.counts || {};
  const calculatedPending = graphs.filter((graph) => graph.lifecycleStatus === "PLANNED").length;
  const uniqueIdentifiers = new Set([...graphIds, ...historicalIds]).size;
  const calculatedStatusCounts = Object.fromEntries(EXPECTED_LIFECYCLE_STATUSES.map((status) => [status, 0]));
  for (const graph of graphs) calculatedStatusCounts[graph.lifecycleStatus] += 1;
  for (const stage of historical) calculatedStatusCounts[stage.recommendedStatus] += 1;
  check(storedCounts.primaryRegisteredGraphs === graphs.length, "Stored primary graph count is correct", "Stored primary graph count is stale");
  check(storedCounts.activePrimaryGraphs === graphs.filter((graph) => graph.lifecycleStatus === "ACTIVE").length, "Stored Active graph count is correct", "Stored Active graph count is stale");
  check(storedCounts.historicalOnlyStages === historical.length, "Stored historical-stage count is correct", "Stored historical-stage count is stale");
  check(storedCounts.uniqueIdentifiers === uniqueIdentifiers, "Stored unique-identifier count is correct", "Stored unique-identifier count is stale");
  check(storedCounts.crossSectionConflicts === crossSection.length, "Stored cross-section conflict count is correct", "Stored cross-section conflict count is stale");
  check(storedCounts.registryPendingCount === calculatedPending && calculatedPending === 0, "Registry Pending Count recalculates to 0", `Registry Pending Count stored=${storedCounts.registryPendingCount}, calculated=${calculatedPending}`);
  check(
    storedCounts.effectivePendingCount === EXPECTED_EFFECTIVE_PENDING.length && sameMembers(reconciliation.effectivePendingGraphs || [], EXPECTED_EFFECTIVE_PENDING),
    "Effective Pending Count recalculates to 6 with the governed graph set",
    `Effective pending metadata is ${storedCounts.effectivePendingCount}: ${(reconciliation.effectivePendingGraphs || []).join(", ")}`,
  );
  check(
    EXPECTED_LIFECYCLE_STATUSES.every((status) => storedCounts.statusCounts?.[status] === calculatedStatusCounts[status]),
    "Stored lifecycle status totals match all 24 unique identifiers",
    `Stored status totals differ from calculated totals ${JSON.stringify(calculatedStatusCounts)}`,
  );
  const kg5Transition = reconciliation.statusTransitions?.find((transition) => transition.id === "KG-5");
  check(kg5Transition?.from === "PLANNED" && kg5Transition?.to === "ACTIVE", "KG-5 Planned-to-Active transition is preserved", "KG-5 transition history is missing or incorrect");
  check(reconciliation.nextGraphProgramme?.id === "BRAIN-3.5" && reconciliation.nextGraphProgramme?.executionGate === "BLOCKED", "BRAIN-3.5/KG-5 runtime consumption remains BLOCKED", "BRAIN-3.5 execution gate is not BLOCKED");

  try {
    const manifestPath = "docs/architecture/report-evidence-disposition-manifest.json";
    const manifest = readJson(root, manifestPath);
    const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
    const paths = entries.map((entry) => entry.path);
    check(manifest.baselineIgnoredLocalReportCount === 316 && entries.length === 316, "Report disposition manifest covers all 316 baseline files", `Report manifest count is ${entries.length}/${manifest.baselineIgnoredLocalReportCount}`);
    check(new Set(paths).size === paths.length, "Report disposition paths are unique", "Report disposition manifest has duplicate paths");
    const expectedDispositions = { GOVERNANCE_EVIDENCE: 3, SUPERSEDED: 46, FORMALLY_EXCLUDED: 7, INTENTIONALLY_ARCHIVED: 260 };
    check(
      Object.entries(expectedDispositions).every(([key, count]) => manifest.counts?.[key] === count),
      "Report dispositions reconcile to 3 evidence, 46 superseded, 7 excluded and 260 archived",
      `Report disposition counts are ${JSON.stringify(manifest.counts)}`,
    );
    const integrityMismatch = entries.filter((entry) => {
      const fullPath = resolve(root, entry.path);
      return !existsSync(fullPath) || readFileSync(fullPath).length !== entry.bytes || sha256(root, entry.path) !== entry.sha256;
    });
    check(integrityMismatch.length === 0, "All 316 report paths, sizes and SHA-256 checksums remain valid", `Report manifest integrity mismatch: ${integrityMismatch.map((entry) => entry.path).join(", ")}`);
    const evidence = entries.filter((entry) => entry.disposition === "GOVERNANCE_EVIDENCE");
    const ignoredEvidence = evidence.filter((entry) => isGitIgnored(root, entry.path));
    check(ignoredEvidence.length === 0, "All three governance-evidence reports are allowlisted from reports/*", `Governance evidence still ignored: ${ignoredEvidence.map((entry) => entry.path).join(", ")}`);
    const trackedEvidence = evidence.filter((entry) => isGitTracked(root, entry.path));
    if (trackedEvidence.length === evidence.length) pass("All governance-evidence reports are tracked");
    else info(`${evidence.length - trackedEvidence.length} governance-evidence report(s) await the separately authorized GGR-1 commit`);
    check(existsSync(resolve(root, "reports/README.md")), "Tracked-ready reports archive policy exists", "reports/README.md is missing");
  } catch (error) {
    fail(`Report disposition validation error: ${error.message}`);
  }

  try {
    const tallyDoc = readText(root, "docs/tally-intelligence/AIR/erp9-air-integration.md");
    check(!/all others are at v0 \(proposed\/design\)/i.test(tallyDoc), "Tally AIR draft no longer claims all other graphs are proposals", "Tally AIR draft still carries stale live-registry metadata");
    const addendum = readText(root, "docs/architecture/kg-5-document-and-manual-graph-lifecycle-reconciliation-addendum.md");
    check(/BRAIN-3\.5 \/ KG-5 runtime-consumption gate:\*\* BLOCKED/.test(addendum), "KG-5 lifecycle addendum blocks BRAIN-3.5", "KG-5 lifecycle addendum does not block BRAIN-3.5");
  } catch (error) {
    fail(`Governance addendum validation error: ${error.message}`);
  }

  return findings;
}

function main() {
  console.log("GII GeM ERP — GGR-1 Governance and Graph Registry Verification");
  console.log("===============================================================");
  const findings = collectGovernanceGraphRegistryFindings();
  for (const finding of findings) console.log(`${finding.level.padEnd(5)} ${finding.message}`);
  const summary = {
    PASS: findings.filter((finding) => finding.level === "PASS").length,
    INFO: findings.filter((finding) => finding.level === "INFO").length,
    FAIL: findings.filter((finding) => finding.level === "FAIL").length,
  };
  console.log("===============================================================");
  console.log(`PASS: ${summary.PASS}  INFO: ${summary.INFO}  FAIL: ${summary.FAIL}`);
  process.exit(summary.FAIL > 0 ? 2 : 0);
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) main();
