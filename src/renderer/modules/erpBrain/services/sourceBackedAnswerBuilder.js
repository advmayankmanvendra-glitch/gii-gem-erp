import { sourceBackedSearch } from "./sourceBackedSearchService.js";

function buildAnswer(query) {
  if (!query || typeof query !== "string") {
    return {
      query: query || "",
      answer: null,
      confidence: "low",
      sourceReferences: [],
      safetyBoundary: "read-only",
      needsReview: false
    };
  }

  const searchResult = sourceBackedSearch(query);
  const { results, bestCandidate, confidence } = searchResult;
  const needsReview = confidence === "low" || !bestCandidate;
  const preferredSource = getPreferredSource(query);
  const reRanked = preferSource(results, preferredSource);
  const selectedCandidate = reRanked[0] || bestCandidate;

  const answer = selectedCandidate ? generateAnswerText(selectedCandidate, query, confidence) : null;

  const sourceReferences = reRanked.slice(0, 3).map((r) => ({
    title: r.title,
    sourceKind: r.sourceKind,
    sourcePath: r.sourcePath,
    graphId: r.graphId,
    summary: r.summary
  }));

  const relatedWorkflowStages = [...new Set(results.flatMap((r) => r.relatedWorkflowStages || []))];
  const relatedTables = [...new Set(results.flatMap((r) => r.relatedTables || []))];
  const relatedVoucherTypes = [...new Set(results.flatMap((r) => r.relatedVoucherTypes || []))];
  const relatedReports = [...new Set(results.flatMap((r) => r.relatedReports || []))];
  const relatedScreens = [...new Set(results.flatMap((r) => r.relatedScreens || []))];

  const safetyWarning = detectSafetyBoundary(query, results);

  return {
    query,
    answer,
    confidence,
    sourceReferences,
    reRankedSource: reRanked.slice(0, 3),
    relatedWorkflowStages,
    relatedTables,
    relatedVoucherTypes,
    relatedReports,
    relatedScreens,
    safetyBoundary: safetyWarning || "read-only guidance",
    needsReview
  };
}

function generateAnswerText(best, query, confidence) {
  const sourceLabel = getSourceLabel(best.sourceKind);
  const confidenceLabel = confidence === "high" ? "I am confident" : confidence === "medium" ? "I have moderate confidence" : "I have low confidence";
  return `${confidenceLabel} that "${best.title}" is the most relevant result. ${best.summary ? best.summary + " " : ""}Source: ${sourceLabel} (${best.sourcePath}).`;
}

function getSourceLabel(sourceKind) {
  const labels = {
    "workflow-graph": "WG-1 Workflow Intelligence Graph",
    "database-graph": "DG-1 Database Intelligence Graph",
    "voucher-accounting-graph": "KG-4 Voucher and Accounting Graph",
    "renderer-graph": "RG-1 Renderer Intelligence Graph",
    "repository": "BRAIN-1 ERP Knowledge Repository",
    "manual": "User Manual / Documentation"
  };
  return labels[sourceKind] || "ERP Knowledge Source";
}

function getPreferredSource(query) {
  const q = query.toLowerCase();
  if (q.includes("voucher") || q.includes("debit") || q.includes("credit") || q.includes("ledger") || q.includes("accounting") || q.includes("journal") || q.includes("posting")) return "voucher-accounting-graph";
  if (q.includes("table") || q.includes("column") || q.includes("database") || q.includes("schema")) return "database-graph";
  if (q.includes("workflow") || q.includes("stage") || q.includes("order") || q.includes("work order") || q.includes("supply order") || q.includes("crac") || q.includes("closure")) return "workflow-graph";
  if (q.includes("screen") || q.includes("route") || q.includes("ui") || q.includes("component") || q.includes("view")) return "renderer-graph";
  if (q.includes("manual") || q.includes("guide") || q.includes("how to") || q.includes("checklist") || q.includes("troubleshoot")) return "manual";
  return null;
}

function preferSource(results, preferredKind) {
  if (!preferredKind) return results;
  const preferred = results.filter((r) => r.sourceKind === preferredKind);
  const others = results.filter((r) => r.sourceKind !== preferredKind);
  return [...preferred, ...others];
}

function detectSafetyBoundary(query, results) {
  const q = query.toLowerCase();
  if (q.includes("post") || q.includes("reverse") || q.includes("delete") || q.includes("approve") || q.includes("import") || q.includes("export data")) {
    return "This action is accounting-sensitive. I cannot post, reverse, approve, delete, or import ERP data. Please use the relevant module screen.";
  }
  if (results.some((r) => r.sourceKind === "voucher-accounting-graph")) {
    return "This question touches voucher or accounting logic. I provide sourced guidance only — no live record mutation is possible.";
  }
  return null;
}

function formatSourceReferences(references) {
  if (!references || references.length === 0) return "No source references available.";
  return references.map((ref) => `- ${ref.title} (${ref.sourceKind}, ${ref.sourcePath})`).join("\n");
}

function explainWorkflowStage(stageId) {
  const result = sourceBackedSearch(stageId);
  const stage = result.results.find((r) => r.sourceKind === "workflow-graph" && (r.title === stageId || r.sourceId === `wg1-${stageId}`));
  if (stage) {
    return {
      stageId,
      title: stage.title,
      summary: stage.summary,
      relatedTables: stage.relatedTables,
      relatedScreens: stage.relatedScreens,
      source: "WG-1 Workflow Intelligence Graph"
    };
  }
  return { stageId, title: null, summary: `Stage "${stageId}" not found in WG-1.`, source: null };
}

function explainDatabaseTable(tableName) {
  const result = sourceBackedSearch(tableName);
  const table = result.results.find((r) => r.sourceKind === "database-graph" && r.title === tableName);
  if (table) {
    return {
      tableName,
      title: table.title,
      summary: table.summary,
      relatedWorkflowStages: table.relatedWorkflowStages,
      source: "DG-1 Database Intelligence Graph"
    };
  }
  return { tableName, title: null, summary: `Table "${tableName}" not found in DG-1.`, source: null };
}

function explainVoucherType(voucherType) {
  const result = sourceBackedSearch(voucherType);
  const vt = result.results.find((r) => r.sourceKind === "voucher-accounting-graph" && r.relatedVoucherTypes?.includes(voucherType));
  if (vt) {
    return {
      voucherType,
      title: vt.title,
      summary: vt.summary,
      source: "KG-4 Voucher and Accounting Graph"
    };
  }
  return { voucherType, title: null, summary: `Voucher type "${voucherType}" not found in KG-4.`, source: null };
}

function explainReport(reportId) {
  const result = sourceBackedSearch(reportId);
  const report = result.results.find((r) => r.sourceKind === "voucher-accounting-graph" && r.relatedReports?.includes(reportId))
    || result.results.find((r) => r.repoName === "reports" && (r.title === reportId || r.sourceId === reportId));
  if (report) {
    return {
      reportId,
      title: report.title,
      summary: report.summary,
      relatedTables: report.relatedTables,
      relatedWorkflowStages: report.relatedWorkflowStages,
      source: report.graphId ? `${report.graphId} graph` : "BRAIN-1 repository"
    };
  }
  return { reportId, title: null, summary: `Report "${reportId}" not found.`, source: null };
}

function getManualHelp(topic) {
  const result = sourceBackedSearch(topic);
  const manualResults = result.results.filter((r) => r.sourceKind === "manual");
  if (manualResults.length > 0) {
    return {
      topic,
      sections: manualResults.slice(0, 5).map((r) => ({
        title: r.title,
        summary: r.summary,
        sourcePath: r.sourcePath
      })),
      source: "User Manual"
    };
  }
  return { topic, sections: [], source: null };
}

function getKnownGaps(topic) {
  const result = sourceBackedSearch(topic);
  const gapResults = result.results.filter((r) => {
    const text = `${r.title} ${r.summary}`.toLowerCase();
    return text.includes("gap") || text.includes("known") || text.includes("limitation") || r.sourceId?.startsWith("kg4-gap");
  });
  return {
    topic,
    gaps: gapResults.slice(0, 10).map((r) => ({
      title: r.title,
      summary: r.summary,
      sourceKind: r.sourceKind,
      sourcePath: r.sourcePath
    })),
    source: gapResults.length > 0 ? "KG-4 Voucher and Accounting Graph / known gaps" : "No known gaps found for this topic"
  };
}

export { buildAnswer, formatSourceReferences, explainWorkflowStage, explainDatabaseTable, explainVoucherType, explainReport, getManualHelp, getKnownGaps };
