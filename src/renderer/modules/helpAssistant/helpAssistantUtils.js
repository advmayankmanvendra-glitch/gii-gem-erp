import { buildIntentAnswer, detectHelpAssistantIntent } from "./helpAssistantIntents.js";
import { answerReadOnlyDataQuestion } from "./helpAssistantReadiness.js";

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalizeText(value).split(/\s+/).filter((token) => token.length > 1));
}

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

function scoreTopic(topic, query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;
  const title = normalizeText(topic.title);
  const summary = normalizeText(topic.summary);
  const haystack = normalizeText(topicHaystack(topic));
  let score = 0;
  if (title === normalizedQuery) score += 80;
  if (title.includes(normalizedQuery)) score += 45;
  if (summary.includes(normalizedQuery)) score += 22;
  if (haystack.includes(normalizedQuery)) score += 18;

  const queryTokens = tokenSet(normalizedQuery);
  const haystackTokens = tokenSet(haystack);
  queryTokens.forEach((token) => {
    if (haystackTokens.has(token)) score += 9;
    if (title.includes(token)) score += 6;
  });
  return score;
}

function searchHelpTopics(topics, query, limit = 8) {
  return topics
    .map((topic) => ({ topic, score: scoreTopic(topic, query) }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((row) => row.topic);
}

function isScreenGuidanceQuestion(query) {
  const normalized = normalizeText(query);
  return normalized.includes("this screen") ||
    normalized.includes("current screen") ||
    normalized.includes("what should i do") ||
    normalized.includes("where am i") ||
    normalized.includes("help here");
}

function buildHelpAssistantAnswer({ query, mode, topics, currentHelp, readiness, coach, stats }) {
  const intent = detectHelpAssistantIntent(query, mode);
  const intentAnswer = buildIntentAnswer({ intent, readiness, coach });
  if (intentAnswer) return intentAnswer;

  if (intent === "data") {
    const dataAnswer = answerReadOnlyDataQuestion({ query, stats });
    return {
      mode: "Read-only Data Mode",
      title: dataAnswer.title,
      type: "Safe Data Guidance",
      summary: dataAnswer.summary,
      sourceLabel: dataAnswer.sourceLabel,
      steps: normalizeList(dataAnswer.steps),
      commonMistakes: dataAnswer.limitation ? [dataAnswer.limitation] : [],
      relatedTopics: [],
      safetyNote: "Read-only foundation: this assistant does not run SQL, write records, post, import, restore, delete or alter ERP data."
    };
  }

  const normalizedQuery = normalizeText(query);
  const screenMode = mode === "screen" || intent === "screen" || (mode !== "help" && isScreenGuidanceQuestion(query));
  const matches = screenMode ? [] : searchHelpTopics(topics, query, 6);
  const topic = screenMode
    ? buildCurrentScreenTopic(currentHelp)
    : normalizedQuery ? (matches[0] || buildNoMatchTopic(query)) : buildHelpIntroTopic();
  const related = screenMode ? searchHelpTopics(topics, topic.title, 5).filter((item) => item.id !== topic.id) : matches.slice(1, 6);

  return {
    mode: screenMode ? "Screen Guidance Mode" : "Help Mode",
    title: topic.title,
    type: topic.type,
    summary: topic.summary,
    menuPath: topic.menuPath,
    viewKey: topic.viewKey,
    purpose: topic.purpose,
    fieldsToCheck: normalizeList(topic.fieldsToCheck),
    recommendedNextStep: topic.recommendedNextStep,
    steps: normalizeList(topic.steps),
    commonMistakes: normalizeList(topic.commonMistakes),
    relatedTopics: related.map((item) => ({ id: item.id, title: item.title, type: item.type, menuPath: item.menuPath, viewKey: item.viewKey })),
    sourceLabel: topic.type || "Help knowledge base",
    safetyNote: "Guidance only: this assistant does not save, post, reverse, import, restore, delete or alter ERP records."
  };
}

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

function buildCurrentScreenTopic(currentHelp) {
  const title = currentHelp?.title || "Current Screen Guidance";
  const purpose = currentHelp?.description || "Use this screen according to its purpose, required fields and report controls.";
  const steps = normalizeList(currentHelp?.howToUse, [
    "Review the screen title and purpose.",
    "Check Current Company before entering company-specific records.",
    "Use required fields, filters and report buttons shown on the screen.",
    "Open the related report or ledger before making corrections."
  ]);

  return {
    id: "current-screen-answer",
    type: "Screen Guidance",
    title,
    summary: `You are currently on ${title}. Use this mode to understand this exact screen before entering, saving, posting or correcting records.`,
    menuPath: currentHelp?.menuPath || "",
    viewKey: currentHelp?.viewKey,
    purpose,
    fieldsToCheck: buildScreenFieldsToCheck(title, currentHelp),
    recommendedNextStep: buildScreenRecommendedNextStep(title, steps),
    steps,
    commonMistakes: normalizeList(currentHelp?.commonMistakes, [
      "Saving records under the wrong company.",
      "Treating draft operational records as posted accounting impact.",
      "Ignoring posting, approval or locked-year warnings."
    ])
  };
}

function buildScreenFieldsToCheck(title, currentHelp) {
  const haystack = normalizeText([title, currentHelp?.description, currentHelp?.menuPath].join(" "));
  if (haystack.includes("billing") || haystack.includes("invoice")) {
    return [
      "Order number, department, invoice date and Current Company.",
      "Item rows with item, HSN, quantity, rate, GST rate and gross value.",
      "Receivable summary, posting status and linked document readiness."
    ];
  }
  if (haystack.includes("supply order") || haystack.includes("order")) {
    return [
      "Order number, department, order date, employee assigned and supply type.",
      "At least one order item row with quantity, rate, GST and gross value.",
      "Buyer, consignee, delivery, document readiness and operational readiness."
    ];
  }
  if (haystack.includes("procurement") || haystack.includes("purchase")) {
    return [
      "Linked order, supplier, purchase date, warehouse and purchase invoice.",
      "Procurement item rows with quantity, rate, GST and freight/loading allocation.",
      "Balance procurement quantity and GRN or stock receipt status."
    ];
  }
  if (haystack.includes("payment") || haystack.includes("receipt") || haystack.includes("receivable") || haystack.includes("payable")) {
    return [
      "Party type, party name, linked invoice or supplier bill and bank account.",
      "Payment amount, TDS, GST TDS, other deductions and UTR/reference.",
      "Outstanding before payment and remaining outstanding after allocation."
    ];
  }
  if (haystack.includes("inventory") || haystack.includes("stock") || haystack.includes("warehouse")) {
    return [
      "Current Company, warehouse, item, quantity and movement type.",
      "Stock availability, reservation status and source document reference.",
      "Whether the screen is a report, draft transaction or posted movement."
    ];
  }
  if (haystack.includes("voucher") || haystack.includes("ledger") || haystack.includes("trial") || haystack.includes("balance")) {
    return [
      "Voucher date, financial year, company and posting status.",
      "Debit and credit lines, party linkage and source reference.",
      "Approval status, reversal status and locked-year warnings."
    ];
  }
  if (haystack.includes("import") || haystack.includes("tally")) {
    return [
      "Selected company, file name, duplicate action and validation status.",
      "Failed rows, warning rows, mapping rows and reference-only rows.",
      "Import locked reason before confirming any controlled import."
    ];
  }
  return [
    "Current Company is correct.",
    "Required fields, filters and visible warnings are reviewed.",
    "Save, post, import, restore or delete actions are only used after confirmation."
  ];
}

function buildScreenRecommendedNextStep(title, steps) {
  const firstStep = Array.isArray(steps) ? steps.find(Boolean) : "";
  if (firstStep) return firstStep;
  return `Review ${title || "this screen"} inputs, warnings and linked records before taking the next action.`;
}

function buildNoMatchTopic(query) {
  return {
    id: "no-match",
    type: "Search",
    title: "No exact help topic found",
    summary: `I could not find an exact match for "${query}". Try a shorter keyword such as voucher, GST, stock, payment, backup, import, ledger or billing.`,
    steps: [
      "Use one or two business keywords.",
      "Search by module name, report name, shortcut or error message.",
      "Open Help & Training for the full manual if needed."
    ],
    commonMistakes: []
  };
}

function normalizeList(value, fallback = []) {
  if (Array.isArray(value) && value.length) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return fallback;
}

export { buildHelpAssistantAnswer, normalizeText, searchHelpTopics };
