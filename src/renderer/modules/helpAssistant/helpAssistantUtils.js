import { buildIntentAnswer, detectHelpAssistantIntent } from "./helpAssistantIntents.js";
import { inferFollowUpQuery } from "./helpAssistantConversation.js";
import { extractEntities } from "./helpAssistantEntities.js";
import { SUGGESTED_KEYWORDS, expandQueryTerms } from "./helpAssistantIntentMap.js";
import { searchHelpTopics } from "./helpAssistantScoring.js";
import { answerReadOnlyDataQuestion } from "./helpAssistantReadiness.js";
import { buildCurrentScreenTopic } from "./screenHelpAnswer.js";
import { brainSearchAsTopics } from "./helpAssistantKnowledge.js";
import { sourceBackedSearch } from "../erpBrain/services/sourceBackedSearchService.js";
import { resolveContext, getAccountingSafetyBoundary, resolveWorkflowGuidance, getWorkOrderBoundary, VIEW_KEY_TO_SCREEN } from "./contextualBrainHelp.js";

const LOW_CONFIDENCE_THRESHOLD = 0.24;
const SOURCE_BACKED_GUIDANCE_TERMS = [
  "bill history", "work order", "receipt voucher", "trial balance", "crac",
  "cash book", "party ledger", "business voucher", "accounting voucher", "profitability"
];

/**
 * Normalizes answer text for local rule checks.
 */
function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Builds a combined topic string for answer enrichment checks.
 */
function topicHaystack(topic) {
  return [
    topic.title,
    topic.type,
    topic.summary,
    topic.menuPath,
    ...(topic.steps || []),
    ...(topic.commonMistakes || []),
    ...(topic.relatedTopics || []),
    ...(topic.keywords || [])
  ].join(" ");
}

/**
 * Detects whether the user's wording asks for the current screen rather than the knowledge base.
 */
function isScreenGuidanceQuestion(query) {
  const normalized = normalizeText(query);
  return normalized.includes("this screen") ||
    normalized.includes("current screen") ||
    normalized.includes("what should i do") ||
    normalized.includes("where am i") ||
    normalized.includes("help here");
}

/**
 * Builds the help assistant answer while preserving the existing answer object shape.
 */
function buildHelpAssistantAnswer({ query, mode, topics, currentHelp, currentView, readiness, coach, stats, conversationHistory = [] }) {
  const submittedQuestion = String(query || "").trim();
  const effectiveQuery = inferFollowUpQuery(submittedQuestion, conversationHistory);
  const extractedEntities = extractEntities(submittedQuestion);
  const intent = detectHelpAssistantIntent(effectiveQuery, mode, conversationHistory);
  const intentAnswer = buildIntentAnswer({ intent, readiness, coach });
  if (intentAnswer) {
    return enrichAnswer(intentAnswer, {
      query: submittedQuestion,
      extractedEntities,
      intent,
      relatedQuestions: buildRelatedQuestions(intentAnswer, intent)
    });
  }

  if (intent === "data") {
    const dataAnswer = answerReadOnlyDataQuestion({ query, stats });
    return enrichAnswer({
      mode: "Read-only Data Mode",
      title: dataAnswer.title,
      type: "Safe Data Guidance",
      summary: dataAnswer.summary,
      directAnswer: dataAnswer.summary,
      sourceLabel: dataAnswer.sourceLabel,
      steps: normalizeList(dataAnswer.steps),
      commonMistakes: dataAnswer.limitation ? [dataAnswer.limitation] : [],
      prerequisites: ["Stay in Data Mode for read-only summary questions.", "Open the relevant report before making corrections."],
      commonBlockers: dataAnswer.limitation ? [dataAnswer.limitation] : ["Live transactional drilldown must be done from the actual module screen."],
      whatToCheckNext: ["Compare the summary with the related report, ledger or ageing view."],
      relatedTopics: [],
      safetyNote: "Read-only foundation: this assistant does not run SQL, write records, post, import, restore, delete or alter ERP data."
    }, {
      query: submittedQuestion,
      extractedEntities,
      intent,
      relatedQuestions: buildRelatedQuestions(dataAnswer, intent)
    });
  }

  const normalizedQuery = normalizeText(effectiveQuery);
  const screenMode = mode === "screen" || intent === "screen" || (mode !== "help" && isScreenGuidanceQuestion(query));
  const matches = screenMode ? [] : searchHelpTopics(topics, effectiveQuery, 6);
  const topConfidence = matches[0]?.confidence || 0;
  if (!screenMode && normalizedQuery && topConfidence < LOW_CONFIDENCE_THRESHOLD) {
    let noMatchAnswer = buildNoMatchAnswer({
      query: submittedQuestion,
      matches,
      topics,
      extractedEntities
    });
    noMatchAnswer = enrichWithBrainSearch(noMatchAnswer, submittedQuestion);
    return noMatchAnswer;
  }

  const topic = screenMode
    ? buildScreenTopicWithBrain(currentHelp, currentView)
    : normalizedQuery ? matches[0] : buildHelpIntroTopic();
  const related = screenMode ? searchHelpTopics(topics, topic.title, 5).filter((item) => item.id !== topic.id) : matches.slice(1, 6);

  let answer = enrichAnswer({
    mode: screenMode ? "Screen Guidance Mode" : "Help Mode",
    title: topic.title,
    type: topic.type,
    summary: topic.summary,
    directAnswer: screenMode
      ? `You are on ${topic.title}. Use this screen guidance to verify visible fields, warnings and the next safe action.`
      : topic.summary,
    menuPath: topic.menuPath,
    viewKey: topic.viewKey,
    purpose: topic.purpose,
    fieldsToCheck: normalizeList(topic.fieldsToCheck),
    keyFields: normalizeList(topic.keyFields),
    requiredFields: normalizeList(topic.requiredFields),
    accountingImpact: normalizeList(topic.accountingImpact),
    inventoryImpact: normalizeList(topic.inventoryImpact),
    gstImpact: normalizeList(topic.gstImpact),
    relatedActions: normalizeList(topic.relatedActions),
    relatedReports: normalizeList(topic.relatedReports),
    relatedShortcuts: normalizeList(topic.relatedShortcuts),
    recommendedNextStep: topic.recommendedNextStep,
    steps: normalizeList(topic.steps),
    commonMistakes: normalizeList(topic.commonMistakes),
    prerequisites: buildPrerequisites(topic, screenMode),
    commonBlockers: buildCommonBlockers(topic),
    whatToCheckNext: buildWhatToCheckNext(topic, screenMode),
    suggestedNextAction: topic.viewKey ? `Open ${topic.title} and review the linked records before taking action.` : "Use the related help and screen links to continue safely.",
    relatedTopics: related.map((item) => ({ id: item.id, title: item.title, type: item.type, menuPath: item.menuPath, viewKey: item.viewKey })),
    sourceLabel: topic.type || "Help knowledge base",
    confidence: topConfidence || undefined,
    workflowStage: topic.workflowStage,
    accountingSafetyBoundary: topic.accountingSafetyBoundary,
    workOrderBoundary: topic.workOrderBoundary,
    safetyNote: "Guidance only: this assistant does not save, post, reverse, import, restore, delete or alter ERP records."
  }, {
    query: submittedQuestion,
    extractedEntities,
    intent,
    relatedQuestions: buildRelatedQuestions(topic, intent)
  });

  if (screenMode) {
    answer = enrichWithBrainSearch(answer, topic.title);
  } else if (isSourceBackedGuidanceQuery(submittedQuestion)) {
    answer = enrichWithBrainSearch(answer, submittedQuestion, true);
  } else if (answer.confidence && answer.confidence < 0.4 && !answer.noMatch) {
    answer = enrichWithBrainSearch(answer, submittedQuestion);
  }

  return answer;
}

/**
 * Returns the default Help Mode landing answer.
 */
function buildHelpIntroTopic() {
  return {
    id: "help-mode-intro",
    type: "Help Library",
    title: "Search the ERP Help Library",
    summary: "Use Help Mode when you want to search across modules, reports, workflows, FAQ, troubleshooting notes and keyboard shortcuts.",
    steps: [
      "Type a business keyword, module name, report name, shortcut or error message.",
      "Use Search Results to inspect matching help topics.",
      "Use Open Screen on screen results when you want to go directly to the matching ERP page."
    ],
    commonMistakes: [
      "Use Screen Guidance when you want help for the current screen only.",
      "Use Data Mode only for safe read-only summary questions."
    ]
  };
}

/**
 * Builds a safe fallback answer when confidence is too low for a direct answer.
 */
function buildNoMatchAnswer({ query, matches, topics, extractedEntities }) {
  const alternativeKeywords = buildAlternativeKeywords(query);
  const closeMatches = matches.slice(0, 5).map((item) => ({
    id: item.id,
    title: item.title,
    type: item.type,
    menuPath: item.menuPath,
    viewKey: item.viewKey,
    confidence: item.confidence
  }));
  const relatedScreens = searchHelpTopics(topics, alternativeKeywords.join(" "), 4)
    .filter((item) => item.viewKey)
    .map((item) => ({ id: item.id, title: item.title, type: item.type, menuPath: item.menuPath, viewKey: item.viewKey }));

  return {
    mode: "Help Mode",
    title: "No exact help topic found",
    type: "Search Guidance",
    summary: `I could not find an exact match for "${query}". Try a shorter keyword such as voucher, GST, stock, payment, backup, import, ledger or billing.`,
    directAnswer: "I do not have enough confidence to answer this safely. I am showing safer keywords, close matches and related screens instead of guessing.",
    question: query,
    extractedEntities,
    noMatch: true,
    alternativeKeywords,
    closeMatches,
    relatedScreens,
    exampleQuestions: [
      "Why is my voucher not posting?",
      "How do I import stock items?",
      "Where can I check receivable outstanding?",
      "What should I do on this screen?"
    ],
    steps: [
      "Use one or two business keywords.",
      "Search by module name, report name, shortcut or error message.",
      "Open Help & Training for the full manual if needed."
    ],
    commonMistakes: ["Avoid using an unrelated result when the assistant says confidence is low."],
    relatedQuestions: [
      "Why is my voucher not posting?",
      "How do I review stock?",
      "How do I use Tally import safely?"
    ],
    safetyNote: "Guidance only: this assistant does not save, post, reverse, import, restore, delete or alter ERP records."
  };
}

/**
 * Builds screen topic enriched with contextual brain data (workflow stage, DB tables, manual ref, safety boundary).
 */
function buildScreenTopicWithBrain(currentHelp, currentView) {
  const topic = buildCurrentScreenTopic(currentHelp);
  if (!currentView) return topic;

  const context = resolveContext(currentView);
  if (!context.screenName) return topic;

  topic.brainBacked = true;
  topic.screenName = context.screenName;

  if (context.workflowInfo) {
    const flowGuidance = resolveWorkflowGuidance(context.workflowInfo.stage);
    topic.workflowStage = { stage: context.workflowInfo.label, guidance: flowGuidance };
  }

  if (context.impact.accounting) {
    topic.accountingSafetyBoundary = getAccountingSafetyBoundary();
  }

  if (context.workflowInfo && !context.impact.accounting && !context.impact.inventory) {
    topic.workOrderBoundary = getWorkOrderBoundary();
  }

  return topic;
}

/**
 * Enriches a help answer with BRAIN-2 source-backed search results.
 */
function enrichWithBrainSearch(answer, query, preferBrainAnswer = false) {
  try {
    const searchResult = sourceBackedSearch(query);
    const brainResults = brainSearchAsTopics(() => searchResult, query);
    if (!brainResults || brainResults.length === 0) return answer;
    const useBrainAnswer = answer.noMatch || preferBrainAnswer;

    return {
      ...answer,
      brainBacked: true,
      title: useBrainAnswer ? brainResults[0].title : answer.title,
      type: useBrainAnswer ? "Brain Source" : answer.type,
      brainResults: brainResults.map((r) => ({
        title: r.title,
        summary: r.summary,
        sourceKind: r.sourceKind,
        sourcePath: r.sourcePath,
        graphId: r.graphId,
        confidence: r.confidence,
        relatedTables: r.relatedTables,
        relatedReports: r.relatedReports,
        manualReference: r.manualReference
      })),
      summary: answer.noMatch
        ? `${answer.summary} Through BRAIN-2 source-backed search, ${brainResults.length} related result(s) were found from ERP manuals, workflows, and knowledge graphs.`
        : answer.summary,
      directAnswer: useBrainAnswer && brainResults.length > 0
        ? brainResults[0].summary
        : answer.directAnswer,
      sourceLabel: useBrainAnswer ? "BRAIN-2 source-backed guidance" : answer.sourceLabel,
      sourceReferences: brainResults.filter((r) => r.sourceKind).map((r) => r.sourceKind),
      relatedTables: mergeUnique(answer.relatedTables, brainResults.flatMap((r) => r.relatedTables || [])),
      relatedReports: mergeUnique(answer.relatedReports, brainResults.flatMap((r) => r.relatedReports || [])),
      manualReferences: mergeUnique(answer.manualReferences, brainResults.map((r) => r.manualReference).filter(Boolean)),
      needsReview: answer.needsReview || brainResults.some((r) => r.needsReview)
    };
  } catch {
    return answer;
  }
}

/**
 * Adds optional intelligence metadata while preserving the existing answer shape.
 */
function enrichAnswer(answer, additions) {
  return {
    ...answer,
    question: additions.query,
    extractedEntities: additions.extractedEntities || [],
    relatedQuestions: additions.relatedQuestions || [],
    intent: additions.intent
  };
}

function mergeUnique(existing = [], additions = []) {
  return [...new Set([...(existing || []), ...(additions || [])].filter(Boolean))];
}

function isSourceBackedGuidanceQuery(query) {
  const normalized = normalizeText(query);
  return SOURCE_BACKED_GUIDANCE_TERMS.some((term) => normalized.includes(term));
}

/**
 * Creates practical prerequisites for the selected help topic.
 */
function buildPrerequisites(topic, screenMode) {
  if (screenMode) return ["Confirm Current Company.", "Review required fields and visible warnings.", "Use the module screen for actual save, post or correction actions."];
  const haystack = normalizeText(topicHaystack(topic));
  if (haystack.includes("voucher") || haystack.includes("ledger")) return ["Current Company is selected.", "Financial year is open.", "Source record or approval status is clear."];
  if (haystack.includes("stock") || haystack.includes("warehouse") || haystack.includes("inventory")) return ["Item and warehouse exist.", "Stock movement is posted or visible in the relevant inventory report."];
  if (haystack.includes("import") || haystack.includes("tally")) return ["Correct company is selected.", "Preview and validation have been run.", "Mapping and duplicate decisions are reviewed."];
  return ["Current Company is selected.", "Relevant master records exist.", "Use posted reports for accounting conclusions."];
}

/**
 * Creates blocker guidance based on the topic's ERP area.
 */
function buildCommonBlockers(topic) {
  const haystack = normalizeText(topicHaystack(topic));
  if (haystack.includes("voucher") || haystack.includes("posting")) return ["Unbalanced debit and credit lines.", "Closed financial year.", "Missing approval or source reference."];
  if (haystack.includes("payment") || haystack.includes("receipt")) return ["Missing party or invoice allocation.", "Incorrect bank account or UTR/reference.", "Outstanding already cleared."];
  if (haystack.includes("stock") || haystack.includes("warehouse")) return ["No confirmed stock movement.", "Wrong warehouse selected.", "Never-stocked items included in a report filter."];
  if (haystack.includes("import") || haystack.includes("tally")) return ["Import locked because validation has not passed.", "Ledger rows need review.", "Duplicate action or company mapping is incomplete."];
  return ["Wrong company context.", "Draft record mistaken for posted impact.", "Missing linked record or document."];
}

/**
 * Suggests the next report or screen a user should verify.
 */
function buildWhatToCheckNext(topic, screenMode) {
  if (screenMode) return ["Check the current screen's visible warnings.", "Use related reports or drilldown before correcting data."];
  const haystack = normalizeText(topicHaystack(topic));
  if (haystack.includes("voucher") || haystack.includes("ledger")) return ["Voucher Register", "General Ledger", "Trial Balance"];
  if (haystack.includes("stock") || haystack.includes("inventory")) return ["Stock Summary", "Stock Ledger", "Low Stock filter"];
  if (haystack.includes("payment") || haystack.includes("receipt")) return ["Party Ledger", "Bill-wise Outstanding", "Cash/Bank Book"];
  if (haystack.includes("gst")) return ["GST Register", "GST Summary", "Invoice details"];
  return ["Related module screen", "Relevant report", "Audit Log if action history matters"];
}

/**
 * Suggests safer search keywords when a user query is unclear.
 */
function buildAlternativeKeywords(query) {
  const expanded = expandQueryTerms(query);
  const queryTokens = new Set(expanded.normalized.split(/\s+/).filter(Boolean));
  return SUGGESTED_KEYWORDS
    .filter((keyword) => !queryTokens.has(normalizeText(keyword)))
    .slice(0, 8);
}

/**
 * Produces follow-up questions that fit the active answer context.
 */
function buildRelatedQuestions(topic, intent) {
  const haystack = normalizeText([topic?.title, topic?.summary, intent].join(" "));
  if (haystack.includes("screen")) return ["What fields should I check here?", "What can go wrong on this screen?", "Which report verifies this screen?"];
  if (haystack.includes("voucher") || haystack.includes("ledger")) return ["Why is a voucher not posting?", "Where do I check ledger impact?", "How do I reverse a wrong voucher?"];
  if (haystack.includes("stock") || haystack.includes("inventory")) return ["Where can I check stock value?", "Why is low stock showing?", "How do I verify warehouse stock?"];
  if (haystack.includes("import") || haystack.includes("tally")) return ["Why is import locked?", "How do I resolve duplicate rows?", "What should I validate before import?"];
  return ["What should I do next?", "Which report should I open?", "What are common mistakes here?"];
}

/**
 * Normalizes optional list-like answer fields.
 */
function normalizeList(value, fallback = []) {
  if (Array.isArray(value) && value.length) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return fallback;
}

function dispatchToAssistant(query, currentView) {
  try {
    const { resolveQuery } = require("../erpAssistant/sources/knowledgeBridge.js");
    const result = resolveQuery(query, currentView);
    return {
      brainAssistant: true,
      answer: result.answer,
      confidence: result.confidence,
      needsReview: result.needsReview,
      sourceReferences: result.sourceReferences,
      safetyBoundary: result.safetyBoundary,
      relatedWorkflowStages: result.relatedWorkflowStages,
      relatedTables: result.relatedTables,
      relatedVoucherTypes: result.relatedVoucherTypes,
      relatedReports: result.relatedReports,
      knownGaps: result.knownGaps,
      suggestedNextHelpTopic: result.suggestedNextHelpTopic,
      prohibitedActions: result.prohibitedActions
    };
  } catch {
    return { brainAssistant: false };
  }
}

export { buildHelpAssistantAnswer, normalizeText, searchHelpTopics, dispatchToAssistant };
