import { searchIndex } from "./sourceBackedSearchIndex.js";

const SYNONYM_MAP = {
  "bill history": ["billing", "gst invoice", "invoice register"],
  "voucher dashboard": ["voucher dashboard", "business voucher", "guided voucher", "accounting voucher"],
  "types of reports": ["reports", "financial reports", "gst reports", "inventory reports", "profitability reports"],
  "type of reports": ["reports", "financial reports", "gst reports", "inventory reports", "profitability reports"],
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

function searchByCategory(query, category) {
  const base = sourceBackedSearch(query);
  if (!category || !category.preferredSource) {
    return { ...base, categoryUsed: null, sourceUsed: null };
  }
  const preferredResults = base.results.filter((r) => categorySourceMatches(r, category, category.preferredSource));
  const fallbackResults = category.fallbackSource
    ? base.results.filter((r) => categorySourceMatches(r, category, category.fallbackSource))
    : [];
  const selectedResults = preferredResults.length > 0 ? preferredResults : fallbackResults;
  const relevantResults = selectedResults.filter((r) => isRelevantToQuery(r, query, category));
  const finalResults = relevantResults.length > 0 ? relevantResults : [];
  const sourceUsed = preferredResults.length > 0
    ? category.preferredSource
    : fallbackResults.length > 0
      ? category.fallbackSource
      : null;
  const best = finalResults[0] || null;
  return {
    ...base,
    results: finalResults,
    bestCandidate: best ? {
      sourceId: best.sourceId,
      sourceKind: best.sourceKind,
      sourcePath: best.sourcePath,
      graphId: best.graphId,
      title: best.title,
      summary: best.summary
    } : null,
    confidence: determineCategoryConfidence(best, category),
    categoryUsed: category.id || null,
    sourceUsed: best ? sourceUsed : null
  };
}

function categorySourceMatches(result, category, source) {
  if (!result || !category || !source) return false;
  if (category.id === "report") {
    return (result.sourceKind === "repository" && result.repoName === "reports")
      || (source === "database-graph" && result.sourceKind === "database-graph" && isReportish(result))
      || result.sourceKind === "voucher-accounting-graph" && Array.isArray(result.relatedReports) && result.relatedReports.length > 0
      || result.sourceKind === "manual" && isReportish(result);
  }
  if (category.id === "voucher_accounting") {
    return result.sourceKind === source
      || result.graphId === source
      || (result.sourceKind === "repository" && ["screens", "navigation", "rules"].includes(result.repoName) && isVoucherish(result))
      || (result.sourceKind === "manual" && isVoucherish(result));
  }
  return result.sourceKind === source || result.graphId === source;
}

function isReportish(result) {
  const text = resultText(result);
  return /\breport|reports|trial balance|profit and loss|balance sheet|gst|tds|stock|inventory|receivable|payable|profitability|audit|register|statement\b/.test(text);
}

function isVoucherish(result) {
  const text = resultText(result);
  return /\bvoucher|business voucher|guided voucher|journal|contra|receipt|payment|debit note|credit note|accounting\b/.test(text);
}

function resultText(result) {
  return `${result.title || ""} ${result.summary || ""} ${(result.tags || []).join(" ")} ${(result.relatedReports || []).join(" ")} ${(result.relatedScreens || []).join(" ")}`.toLowerCase();
}

function isRelevantToQuery(result, query, category) {
  if (!result) return false;
  const q = String(query || "").toLowerCase();
  const text = resultText(result);
  if (category.id === "report") return isReportish(result);
  if (category.id === "voucher_accounting") return isVoucherish(result);
  const queryTerms = q.split(/[^a-z0-9]+/).filter((term) => term.length >= 4 && !["what", "where", "which", "there", "does", "this", "that", "many", "type", "types"].includes(term));
  return queryTerms.some((term) => text.includes(term));
}

function determineCategoryConfidence(best, category) {
  if (!best) return "low";
  if (best.score >= 15 && categorySourceMatches(best, category, category.preferredSource)) return "high";
  if (best.score >= 8) return "medium";
  return "low";
}

export { sourceBackedSearch, searchByCategory, searchByKind, searchModules, searchScreens, searchWorkflows, searchDatabaseTables, searchVoucherAccounting, searchReports, searchManuals, searchKnownGaps, SYNONYM_MAP };
