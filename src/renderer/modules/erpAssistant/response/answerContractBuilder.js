import { buildAnswerContract } from "../../erpBrain/services/sourceBackedAnswerBuilder.js";

function assembleContract(query, searchResult, classification, safetyInfo, screenContext) {
  const base = buildAnswerContract(query, searchResult, classification, safetyInfo, screenContext);

  const cat = classification || {};
  const safety = safetyInfo || {};

  if (cat.category === "unsafe_action") {
    return {
      ...base,
      answer: generateRefusalAnswer(query),
      confidence: "high",
      needsReview: false,
      sourceReferences: [{
        title: "BRAIN-4 Read-Only Safety Policy",
        sourceKind: "safety-policy",
        sourcePath: "src/renderer/modules/erpAssistant/response/safetyEnforcer.js",
        graphId: "BRAIN-4",
        summary: "Unsafe action attempts are refused by the read-only assistant boundary."
      }],
      safetyBoundary: "action-refused",
      prohibitedActions: ["post", "reverse", "approve", "delete", "restore", "import", "export", "run command"],
      rolePresentation: { depth: "basic", showSources: true, showSafety: true, showGaps: false }
    };
  }

  if (safety.requiresNotice && base.answer) {
    base.answer = `${safety.notice}\n\n${base.answer}`;
  }

  const knownGaps = (searchResult?.results || []).filter((r) => {
    const text = `${r.title} ${r.summary}`.toLowerCase();
    return text.includes("gap") || text.includes("limitation") || r.sourceId?.includes("gap");
  }).map((r) => ({
    title: r.title,
    summary: r.summary,
    sourceKind: r.sourceKind
  }));

  return {
    ...base,
    knownGaps,
    prohibitedActions: computeProhibitedActions(safety.boundary),
    rolePresentation: {
      depth: "standard",
      showSources: true,
      showSafety: safety.requiresNotice || false,
      showGaps: knownGaps.length > 0
    }
  };
}

function generateRefusalAnswer(query) {
  const action = query.toLowerCase().trim();
  return `I cannot ${action}. I am a read-only guidance assistant. To perform this action, use the relevant controlled ERP module. I can help you navigate to the correct screen if you tell me which screen you need.`;
}

function computeProhibitedActions(boundary) {
  if (!boundary || boundary === "read-only guidance") {
    return ["post", "reverse", "approve", "delete", "restore", "import", "export"];
  }
  if (boundary.includes("accounting") || boundary.includes("action")) {
    return ["post", "reverse", "approve", "delete", "restore", "import", "export", "run command"];
  }
  if (boundary.includes("inventory")) {
    return ["post stock", "adjust stock", "delete", "restore", "export"];
  }
  if (boundary.includes("gst")) {
    return ["file return", "certify compliance", "post", "reverse"];
  }
  if (boundary.includes("workflow")) {
    return ["bypass stage", "approve", "reject", "delete"];
  }
  if (boundary.includes("import")) {
    return ["import", "export", "migrate"];
  }
  return ["post", "reverse", "approve", "delete", "restore", "import", "export"];
}

export { assembleContract };
