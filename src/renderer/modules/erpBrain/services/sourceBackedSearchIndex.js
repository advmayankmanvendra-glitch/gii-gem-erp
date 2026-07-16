import { getAllRepositories, getRepositoryKeys, getEntryCount } from "../loaders/repositoryLoader.js";
import { loadAllGraphs } from "../loaders/graphLoader.js";
import { loadAllManuals } from "../loaders/manualLoader.js";

let searchIndexEntries = null;

const SEARCH_STOP_WORDS = new Set([
  "a", "an", "and", "are", "can", "do", "does", "for", "how", "i", "in", "is",
  "it", "me", "my", "of", "on", "or", "the", "this", "to", "what", "where", "which",
  "with", "you", "your", "all", "any", "available", "before", "can", "do", "from", "has",
  "have", "if", "not", "should", "there", "was", "were", "will"
]);

function getSearchTerms(query) {
  return query.toLowerCase().split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3 && !SEARCH_STOP_WORDS.has(term));
}

function buildSearchIndex() {
  if (searchIndexEntries) return searchIndexEntries;
  searchIndexEntries = [];

  indexRepositorySources();
  indexGraphSources();
  indexManualSources();

  return searchIndexEntries;
}

function getSearchIndex() {
  return searchIndexEntries || buildSearchIndex();
}

function indexRepositorySources() {
  const repos = getAllRepositories();
  const keys = getRepositoryKeys();
  for (const [repoName, repoData] of Object.entries(repos)) {
    const entryKey = keys[repoName];
    const entries = repoData[entryKey];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      searchIndexEntries.push({
        sourceId: entry.id || `${repoName}-${searchIndexEntries.length}`,
        sourceKind: "repository",
        sourcePath: `repository/${repoName}/index.json`,
        repoName,
        title: entry.name || entry.term || entry.title || entry.error || entry.id,
        summary: entry.purpose || entry.description || entry.definition || entry.possibleCauses?.[0] || "",
        searchableText: [entry.name, entry.term, entry.title, entry.purpose, entry.description, entry.definition, entry.error].filter(Boolean).join(" "),
        tags: entry.tags || entry.modules || [],
        aliases: entry.aliases || [],
        relatedModules: entry.modules || entry.relatedModules || [],
        relatedScreens: entry.relatedScreens || [],
        relatedWorkflowStages: [],
        relatedTables: [],
        relatedVoucherTypes: [],
        relatedReports: entry.relatedReports || [],
        sensitivity: "read-only",
        readOnly: true,
        confidenceBasis: "repository"
      });
    }
  }
}

function indexGraphSources() {
  const graphs = loadAllGraphs();

  const wg1 = graphs["WG-1"];
  if (wg1 && wg1.nodes) {
    for (const node of wg1.nodes) {
      searchIndexEntries.push({
        sourceId: `wg1-${node.id}`,
        sourceKind: "workflow-graph",
        sourcePath: "src/renderer/knowledge/workflow-graph.json",
        graphId: "WG-1",
        title: node.label || node.id,
        summary: node.description || `${node.label || node.id} workflow stage`,
        searchableText: [node.label, node.id, node.description, node.stageType].filter(Boolean).join(" "),
        tags: [node.stageType, "workflow"],
        aliases: [],
        relatedModules: [],
        relatedScreens: node.screenRef ? [node.screenRef] : [],
        relatedWorkflowStages: [node.id],
        relatedTables: node.tableRef ? [node.tableRef] : [],
        relatedVoucherTypes: [],
        relatedReports: node.reportRef ? [node.reportRef] : [],
        sensitivity: "read-only",
        readOnly: true,
        confidenceBasis: "graph"
      });
    }
  }

  const dg1 = graphs["DG-1"];
  if (dg1 && dg1.tables) {
    for (const table of dg1.tables) {
      searchIndexEntries.push({
        sourceId: `dg1-${table.id}`,
        sourceKind: "database-graph",
        sourcePath: "src/renderer/knowledge/database-graph.json",
        graphId: "DG-1",
        title: table.tableName || table.name || table.id,
        summary: table.description || `${table.tableName} database table`,
        searchableText: [table.tableName, table.name, table.id, table.description, table.category].filter(Boolean).join(" "),
        tags: [table.category, "database", ...(table.accountingProtected ? ["accounting-protected"] : [])],
        aliases: [],
        relatedModules: [],
        relatedScreens: [],
        relatedWorkflowStages: table.relatedWorkflowStage ? [table.relatedWorkflowStage] : [],
        relatedTables: [table.tableName],
        relatedVoucherTypes: [],
        relatedReports: [],
        sensitivity: "read-only",
        readOnly: true,
        confidenceBasis: "graph"
      });
    }
  }

  const kg4 = graphs["KG-4"];
  if (kg4) {
    if (kg4.voucherTypes) {
      for (const vt of kg4.voucherTypes) {
        searchIndexEntries.push({
          sourceId: `kg4-vt-${vt.voucherTypeId || vt.id}`,
          sourceKind: "voucher-accounting-graph",
          sourcePath: "src/renderer/knowledge/voucher-accounting-graph.json",
          graphId: "KG-4",
          title: vt.displayName || vt.voucherTypeName || vt.name || vt.voucherTypeId || vt.id,
          summary: vt.description || `${vt.displayName || vt.voucherTypeName || vt.name || vt.voucherTypeId || vt.id} voucher type`,
          searchableText: [vt.displayName, vt.voucherTypeName, vt.name, vt.voucherTypeId, vt.id, vt.description, vt.voucherTypeDb].filter(Boolean).join(" "),
          tags: ["voucher", "accounting", vt.voucherTypeDb],
          aliases: [],
          relatedModules: [],
          relatedScreens: [],
          relatedWorkflowStages: [],
          relatedTables: [],
          relatedVoucherTypes: [vt.voucherTypeId || vt.id],
          relatedReports: [],
          sensitivity: "read-only",
          readOnly: true,
          confidenceBasis: "graph"
        });
      }
    }
    if (kg4.debitCreditPatterns) {
      for (const dcp of kg4.debitCreditPatterns) {
        searchIndexEntries.push({
          sourceId: `kg4-dcp-${dcp.patternId || searchIndexEntries.length}`,
          sourceKind: "voucher-accounting-graph",
          sourcePath: "src/renderer/knowledge/voucher-accounting-graph.json",
          graphId: "KG-4",
          title: `${dcp.patternName || dcp.name} debit/credit pattern`,
          summary: dcp.description || `${dcp.patternName} pattern: debit ${dcp.debitAccount || "?"}, credit ${dcp.creditAccount || "?"}`,
          searchableText: [dcp.patternName, dcp.name, dcp.description, dcp.debitAccount, dcp.creditAccount].filter(Boolean).join(" "),
          tags: ["debit-credit", "accounting"],
          aliases: [],
          relatedModules: [],
          relatedScreens: [],
          relatedWorkflowStages: [],
          relatedTables: [],
          relatedVoucherTypes: dcp.voucherType ? [dcp.voucherType] : [],
          relatedReports: [],
          sensitivity: "read-only",
          readOnly: true,
          confidenceBasis: "graph"
        });
      }
    }
    if (kg4.reportDependencies) {
      for (const rd of kg4.reportDependencies) {
        searchIndexEntries.push({
          sourceId: `kg4-rd-${rd.reportName || searchIndexEntries.length}`,
          sourceKind: "voucher-accounting-graph",
          sourcePath: "src/renderer/knowledge/voucher-accounting-graph.json",
          graphId: "KG-4",
          title: rd.reportName || rd.name,
          summary: rd.description || `${rd.reportName} report depends on ${(rd.sourceTables || []).join(", ")}`,
          searchableText: [rd.reportName, rd.name, rd.description, ...(rd.sourceTables || [])].filter(Boolean).join(" "),
          tags: ["report", ...(rd.sourceTables || [])],
          aliases: [],
          relatedModules: [],
          relatedScreens: [],
          relatedWorkflowStages: [],
          relatedTables: rd.sourceTables || [],
          relatedVoucherTypes: [],
          relatedReports: [rd.reportName || rd.name],
          sensitivity: "read-only",
          readOnly: true,
          confidenceBasis: "graph"
        });
      }
    }
  }

  const rg1 = graphs["RG-1"];
  if (rg1) {
    if (rg1.screens) {
      for (const screen of rg1.screens) {
        searchIndexEntries.push({
          sourceId: `rg1-screen-${screen.id || screen.viewKey || searchIndexEntries.length}`,
          sourceKind: "renderer-graph",
          sourcePath: "src/renderer/knowledge/renderer-graph.json",
          graphId: "RG-1",
          title: screen.name || screen.title || screen.id,
          summary: screen.purpose || screen.description || "",
          searchableText: [screen.name, screen.title, screen.id, screen.viewKey, screen.purpose, screen.description, screen.module].filter(Boolean).join(" "),
          tags: ["screen", screen.module, screen.businessCriticality],
          aliases: [],
          relatedModules: screen.module ? [screen.module] : [],
          relatedScreens: screen.viewKey ? [screen.viewKey] : [],
          relatedWorkflowStages: screen.workflowReference ? [screen.workflowReference] : [],
          relatedTables: [],
          relatedVoucherTypes: [],
          relatedReports: screen.relatedReports || [],
          sensitivity: "read-only",
          readOnly: true,
          confidenceBasis: "graph"
        });
      }
    }
  }
}

function indexManualSources() {
  const manuals = loadAllManuals();
  for (const manual of manuals) {
    for (const section of manual.sections) {
      searchIndexEntries.push({
        sourceId: section.sectionId,
        sourceKind: "manual",
        sourcePath: section.sourcePath,
        graphId: null,
        title: section.heading,
        summary: section.excerpt,
        searchableText: [section.heading, section.excerpt, manual.title].filter(Boolean).join(" "),
        tags: ["manual", manual.id],
        aliases: [],
        relatedModules: [],
        relatedScreens: [],
        relatedWorkflowStages: [],
        relatedTables: [],
        relatedVoucherTypes: [],
        relatedReports: [],
        sensitivity: "read-only",
        readOnly: true,
        confidenceBasis: "manual"
      });
    }
  }
}

function searchIndex(query) {
  const index = getSearchIndex();
  if (!query || typeof query !== "string") return [];
  const q = query.toLowerCase().trim();
  const queryTerms = getSearchTerms(q);
  const results = [];
  for (const entry of index) {
    const haystack = entry.searchableText.toLowerCase();
    let score = 0;
    if (haystack.includes(q)) {
      score = haystack === q ? 20 : haystack.startsWith(q) ? 10 : 3;
      if (haystack.includes(` ${q} `)) score += 2;
    }
    if (entry.title && entry.title.toLowerCase().includes(q)) score += 5;
    for (const tag of entry.tags || []) {
      if (tag && tag.toLowerCase().includes(q)) score += 1;
    }
    // Natural questions rarely occur verbatim in manuals or repositories. Score
    // meaningful term overlap while keeping title matches stronger than body text.
    let matchingTerms = 0;
    for (const term of queryTerms) {
      if (!haystack.includes(term)) continue;
      matchingTerms += 1;
      score += 2;
      if (entry.title && entry.title.toLowerCase().includes(term)) score += 3;
      if ((entry.tags || []).some((tag) => String(tag).toLowerCase().includes(term))) score += 1;
    }
    if (queryTerms.length > 1 && matchingTerms === queryTerms.length) score += 4;
    if (matchingTerms === 0 && score === 0) continue;
    if (score > 0) results.push({ ...entry, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

export { buildSearchIndex, getSearchIndex, searchIndex };
