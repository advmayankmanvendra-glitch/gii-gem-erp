import { searchIndex } from "./sourceBackedSearchIndex.js";

const SYNONYM_MAP = {
  "bill history": ["billing", "gst invoice", "invoice register"],
  "work order": "supply order",
  "wo": "supply order",
  "gem order": "purchase order",
  "crac": "consignee receipt and acceptance certificate",
  "payment received": "receipt",
  "party ledger": ["department ledger", "supplier ledger"],
  "cash book": "cash bank book",
  "stock issue": "stock outward",
  "stock issue": "delivery challan",
  "supplier bill": "procurement",
  "supplier bill": "purchase",
  "customer": "government department",
  "department": "government department",
  "accounting voucher": ["journal", "contra"],
  "business voucher": "guided voucher",
  "receipt voucher": "receipt",
  "bill-wise": "receivables",
  "bill-wise": "payables",
  "profit": "profitability analysis",
  "wo": "work order",
  "grn": "goods receipt",
  "dc": "delivery challan",
  "pi": "proforma invoice",
  "po": "purchase order",
  "so": "supply order",
  "tb": "trial balance",
  "pl": "profit and loss",
  "pnl": "profit and loss",
  "bs": "balance sheet",
  "gst": "goods and services tax",
  "hsn": "harmonized system of nomenclature",
  "sac": "services accounting code",
  "utr": "unique transaction reference",
  "tan": "tax deduction and collection account number"
};

function expandQuery(query) {
  const q = query.toLowerCase().trim();
  const expanded = new Set([q]);
  for (const [synonym, target] of Object.entries(SYNONYM_MAP)) {
    if (q.includes(synonym) || q === synonym) {
      for (const value of Array.isArray(target) ? target : [target]) expanded.add(value);
    }
  }
  return [...expanded];
}

function sourceBackedSearch(query) {
  if (!query || typeof query !== "string") {
    return { query, results: [], bestCandidate: null, confidence: "low" };
  }

  const expandedQueries = expandQuery(query);
  const allResults = [];

  for (const eq of expandedQueries) {
    const results = searchIndex(eq);
    for (const r of results) {
      const existing = allResults.find((ar) => ar.sourceId === r.sourceId);
      if (existing) {
        existing.score = Math.max(existing.score, r.score);
      } else {
        allResults.push(r);
      }
    }
  }

  allResults.sort((a, b) => b.score - a.score);
  const topResults = allResults.slice(0, 10);

  const bestCandidate = topResults[0] || null;
  const confidence = determineConfidence(bestCandidate, topResults);

  return {
    query,
    expandedQueries,
    results: topResults.map((r) => ({
      sourceId: r.sourceId,
      sourceKind: r.sourceKind,
      sourcePath: r.sourcePath,
      graphId: r.graphId,
      repoName: r.repoName,
      title: r.title,
      summary: r.summary,
      score: r.score,
      tags: r.tags,
      relatedWorkflowStages: r.relatedWorkflowStages,
      relatedTables: r.relatedTables,
      relatedVoucherTypes: r.relatedVoucherTypes,
      relatedReports: r.relatedReports,
      relatedScreens: r.relatedScreens
    })),
    bestCandidate: bestCandidate ? {
      sourceId: bestCandidate.sourceId,
      sourceKind: bestCandidate.sourceKind,
      sourcePath: bestCandidate.sourcePath,
      graphId: bestCandidate.graphId,
      title: bestCandidate.title,
      summary: bestCandidate.summary
    } : null,
    confidence,
    safetyBoundary: "read-only"
  };
}

function determineConfidence(best, results) {
  if (!best) return "low";
  if (best.score >= 15) return "high";
  if (best.score >= 8) return "medium";
  return "low";
}

function searchByKind(query, kind) {
  const results = sourceBackedSearch(query);
  return {
    ...results,
    results: results.results.filter((r) => r.sourceKind === kind || r.graphId === kind)
  };
}

function searchModules(query) { return searchByKind(query, "repository"); }
function searchScreens(query) { return searchByKind(query, "renderer-graph"); }
function searchWorkflows(query) { return searchByKind(query, "workflow-graph"); }
function searchDatabaseTables(query) { return searchByKind(query, "database-graph"); }
function searchVoucherAccounting(query) { return searchByKind(query, "voucher-accounting-graph"); }
function searchReports(query) { return searchByKind(query, "repository").results.filter((r) => r.repoName === "reports"); }
function searchManuals(query) { return searchByKind(query, "manual"); }
function searchKnownGaps(query) {
  const all = sourceBackedSearch(query);
  return {
    ...all,
    results: all.results.filter((r) => {
      const text = `${r.title} ${r.summary}`.toLowerCase();
      return text.includes("gap") || text.includes("known") || text.includes("limitation");
    })
  };
}

export { sourceBackedSearch, searchByKind, searchModules, searchScreens, searchWorkflows, searchDatabaseTables, searchVoucherAccounting, searchReports, searchManuals, searchKnownGaps, SYNONYM_MAP };
