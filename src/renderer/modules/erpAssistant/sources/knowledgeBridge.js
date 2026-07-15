import { classifyQuery } from "../classifier/queryClassifier.js";
import { sourceBackedSearch, searchByCategory } from "../../erpBrain/services/sourceBackedSearchService.js";
import { resolveContext } from "../../helpAssistant/contextualBrainHelp.js";
import { enforceSafety } from "../response/safetyEnforcer.js";
import { assembleContract } from "../response/answerContractBuilder.js";

function resolveQuery(query, currentViewKey) {
  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return emptyResponse(query);
  }

  const classification = classifyQuery(query, currentViewKey);

  const screenContext = currentViewKey ? resolveContext(currentViewKey) : null;

  const searchResult = classification.category === "unsafe_action"
    ? { query, results: [], bestCandidate: null, confidence: "high", categoryUsed: "unsafe_action", sourceUsed: null }
    : searchByCategory(query, classification);

  const safetyInfo = enforceSafety(classification, searchResult);

  const response = assembleContract(query, searchResult, classification, safetyInfo, screenContext);

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
