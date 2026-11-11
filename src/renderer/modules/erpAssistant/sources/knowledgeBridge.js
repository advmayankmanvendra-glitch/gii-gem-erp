import { classifyQuery } from "../classifier/queryClassifier.js";
import { sourceBackedSearch, searchByCategory } from "../../erpBrain/services/sourceBackedSearchService.js";
import { resolveContext } from "../../helpAssistant/contextualBrainHelp.js";
import { enforceSafety } from "../response/safetyEnforcer.js";
import { assembleContract, buildFeatureAnswer } from "../response/answerContractBuilder.js";
import { findFeatureByQuery } from "./featureFunctionBridge.js";

function resolveQuery(query, currentViewKey) {
  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return emptyResponse(query);
  }

  const classification = classifyQuery(query, currentViewKey);

  // Layer 1: unsafe_action short-circuits immediately
  if (classification.category === "unsafe_action") {
    return buildUnsafeRefusal(query, classification);
  }

  const screenContext = currentViewKey ? resolveContext(currentViewKey) : null;

  // Layer 2: query FF-1 for feature match (skip for unknown category — prevents hallucination)
  const repositoryFirstCategories = new Set(["manual_training", "troubleshooting", "known_gap"]);
  let featureMatch = classification.category === "unknown" || repositoryFirstCategories.has(classification.category)
    ? null
    : findFeatureByQuery(query, classification, currentViewKey);

  // Do not let a generic FF-1 phrase such as "summary" replace an inventory
  // answer with an unrelated financial-report feature.
  if (classification.category === "inventory" && featureMatch && !/inventory|stock|warehouse/i.test(featureMatch.category || "")) {
    featureMatch = null;
  }

  if (featureMatch && featureMatch.matchLevel === "strong") {
    return buildFeatureResponse(query, featureMatch, classification, screenContext);
  }

  // Layer 3: medium FF-1 match — constrain BRAIN-2 search
  if (featureMatch && featureMatch.matchLevel === "medium") {
    return buildConstrainedSearchResponse(query, featureMatch, classification, screenContext);
  }

  // Layer 4: weak or no FF-1 match — fallback to BRAIN-2
  const searchResult = searchByCategory(query, classification);
  const safetyInfo = enforceSafety(classification, searchResult);
  const response = assembleContract(query, searchResult, classification, safetyInfo, screenContext);

  // Layer 4b: fallback add source reference for known categories when BRAIN-2 returns nothing
  if (classification.category && classification.category !== "unknown" && !repositoryFirstCategories.has(classification.category) && (!response.sourceReferences || response.sourceReferences.length === 0)) {
    response.sourceReferences = [{
      title: `${classification.categoryLabel} — general guidance`,
      sourceKind: "feature-function-graph",
      sourcePath: "src/renderer/knowledge/feature-function-graph.json",
      graphId: "FF-1",
      summary: `Queries classified as ${classification.category} use the feature function graph as the primary routing layer.`
    }];
  }

  // Layer 4c: unknown category guard — force low confidence even if BRAIN-2 found something
  if (classification.category === "unknown") {
    response.confidence = "low";
    response.needsReview = true;
    response.answer = "I do not have a source-backed answer for this query yet.";
    response.sourceReferences = [];
    response.relatedWorkflowStages = [];
    response.relatedScreens = [];
    response.relatedTables = [];
    response.relatedVoucherTypes = [];
    response.relatedReports = [];
    response.safetyBoundary = "read-only guidance";
  }

  // Layer 5: confidence guard
  const highConfidenceAuthorized = isHighConfidenceAuthorized(query, classification, searchResult);
  if (!highConfidenceAuthorized && response.confidence === "high") {
    response.confidence = "medium";
  }

  response.suggestedNextHelpTopic = suggestNextTopic(classification.category, searchResult);
  return response;
}

function buildUnsafeRefusal(query, classification) {
  const screenContext = null;
  const searchResult = {
    query, results: [], bestCandidate: null,
    confidence: "high", categoryUsed: "unsafe_action", sourceUsed: null
  };
  const safetyInfo = enforceSafety(classification, searchResult);
  const response = assembleContract(query, searchResult, classification, safetyInfo, screenContext);
  return response;
}

function buildFeatureResponse(query, featureMatch, classification, screenContext) {
  const answer = buildFeatureAnswer(featureMatch, query, classification, screenContext);

  const safetyInfo = enforceSafety(classification, {
    results: [{ sourceKind: featureMatch.safetyBoundary }]
  });

  return {
    query,
    answer: answer.text,
    confidence: "high",
    needsReview: false,
    sourceReferences: [
      {
        title: `${featureMatch.featureName}`,
        sourceKind: "feature-function-graph",
        sourcePath: "src/renderer/knowledge/feature-function-graph.json",
        graphId: "FF-1",
        summary: `FF-1 Feature: ${featureMatch.canonicalName || featureMatch.featureName} (${featureMatch.matchReason})`
      },
      ...(featureMatch.preferredSourceGraph ? [{
        title: `Preferred source: ${featureMatch.preferredSourceGraph}`,
        sourceKind: "feature-function-graph",
        sourcePath: "src/renderer/knowledge/feature-function-graph.json",
        graphId: "FF-1",
        summary: `Refer to ${featureMatch.preferredSourceGraph} graph for detailed ${featureMatch.featureName} intelligence`
      }] : [])
    ],
    relatedWorkflowStages: featureMatch.workflowStage ? [featureMatch.workflowStage] : [],
    relatedScreens: featureMatch.screenRef ? [featureMatch.screenRef] : [],
    relatedTables: featureMatch.databaseTables || [],
    relatedVoucherTypes: featureMatch.voucherTypes || [],
    relatedReports: featureMatch.reportDependencies || [],
    safetyBoundary: safetyInfo.boundary || featureMatch.safetyBoundary || "read-only guidance",
    knownGaps: featureMatch.knownGaps || [],
    suggestedNextHelpTopic: null,
    prohibitedActions: computeFeatureProhibitedActions(featureMatch),
    rolePresentation: {
      depth: "standard",
      showSources: true,
      showSafety: true,
      showGaps: (featureMatch.knownGaps || []).length > 0
    }
  };
}

function buildConstrainedSearchResponse(query, featureMatch, classification, screenContext) {
  const constrainedQuery = `${query} ${featureMatch.featureName}`;
  const searchResult = searchByCategory(constrainedQuery, classification);

  const matchedBySearch = (searchResult.results || []).some((r) => {
    const text = `${r.title} ${r.summary}`.toLowerCase();
    const featureName = (featureMatch.featureName || "").toLowerCase();
    return text.includes(featureName) || (featureMatch.aliases || []).some((a) => text.includes(a.toLowerCase()));
  });

  if (!matchedBySearch && (searchResult.results || []).length > 0) {
    searchResult.results = [];
    searchResult.bestCandidate = null;
    searchResult.confidence = "low";
  }

  if (searchResult.bestCandidate) {
    searchResult.bestCandidate.sourceKind = "feature-function-graph";
  }

  const safetyInfo = enforceSafety(classification, searchResult);
  const response = assembleContract(query, searchResult, classification, safetyInfo, screenContext);

  // Add FF-1 context to the response
  response.sourceReferences = [
    {
      title: `${featureMatch.featureName} (FF-1)`,
      sourceKind: "feature-function-graph",
      sourcePath: "src/renderer/knowledge/feature-function-graph.json",
      graphId: "FF-1",
      summary: `Best feature match: ${featureMatch.canonicalName}`
    },
    ...(response.sourceReferences || []).slice(0, 2)
  ];
  if (featureMatch.knownGaps && featureMatch.knownGaps.length > 0) {
    response.knownGaps = [...new Set([...(response.knownGaps || []), ...featureMatch.knownGaps])];
  }
  // Only override safetyBoundary if the FF-1 feature's category aligns with classification
  const featureCategory = featureMatch.category;
  if (featureCategory && featureCategory === classification.category) {
    response.safetyBoundary = featureMatch.safetyBoundary || response.safetyBoundary;
  }

  const highConfidenceAuthorized = isHighConfidenceAuthorized(query, classification, searchResult);
  if (!highConfidenceAuthorized && response.confidence === "high") {
    response.confidence = "medium";
  }

  response.suggestedNextHelpTopic = suggestNextTopic(classification.category, searchResult);
  return response;
}

function emptyResponse(query) {
  return {
    query: query || "",
    answer: null,
    confidence: "low",
    needsReview: true,
    sourceReferences: [],
    relatedWorkflowStages: [],
    relatedScreens: [],
    relatedTables: [],
    relatedVoucherTypes: [],
    relatedReports: [],
    safetyBoundary: "read-only guidance",
    knownGaps: [],
    suggestedNextHelpTopic: null,
    prohibitedActions: ["post", "reverse", "approve", "delete", "restore", "import", "export"],
    rolePresentation: { depth: "basic", showSources: false, showSafety: false, showGaps: false }
  };
}

function isHighConfidenceAuthorized(query, classification, searchResult) {
  if (classification.category === "unsafe_action") return true;
  if (!searchResult) return false;

  const candidate = searchResult.bestCandidate;
  if (!candidate) return false;

  const preferredMatches = classification.preferredSource &&
    (candidate.sourceKind === classification.preferredSource ||
     candidate.graphId === classification.preferredSource);

  if (preferredMatches) return true;

  const q = query.toLowerCase();
  const title = (candidate.title || "").toLowerCase();
  const summary = (candidate.summary || "").toLowerCase();
  const queryWords = q.split(/\s+/).filter((w) => w.length >= 4);
  const directMatch = queryWords.some((w) => title.includes(w) || summary.includes(w));

  return directMatch;
}

function computeFeatureProhibitedActions(featureMatch) {
  const boundary = featureMatch.safetyBoundary || "read-only guidance";
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
  if (boundary.includes("import") || boundary.includes("export")) {
    return ["import", "export", "migrate"];
  }
  if (boundary.includes("administration")) {
    return ["delete", "restore", "export"];
  }
  return ["post", "reverse", "approve", "delete", "restore", "import", "export"];
}

function suggestNextTopic(category, searchResult) {
  const suggestions = {
    workflow: "How does CRAC trigger invoicing?",
    screen_help: "What is the purpose of this screen?",
    manual_training: "How do I complete month-end closing?",
    database_table: "Which reports depend on this table?",
    voucher_accounting: "What is the debit/credit pattern for a sales invoice?",
    report: "Which table supports this report?",
    gst_tax: "How is GST calculated on a sales invoice?",
    inventory: "How does GRN affect stock valuation?",
    troubleshooting: "Where can I find the troubleshooting manual?",
    known_gap: "What are the planned features for this module?",
    unsafe_action: "How do I navigate to the correct screen for this task?"
  };
  return suggestions[category] || null;
}

export { resolveQuery };
