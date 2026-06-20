import { INTENT_WEIGHTS, normalizeHelpText } from "./helpAssistantIntentMap.js";

const ONBOARDING_SEQUENCE = [
  "Confirm Current Company in the right utility sidebar.",
  "Create or verify Company Master, Bank Master and Warehouse Master.",
  "Import or create Departments, Suppliers and Items.",
  "Review Chart of Accounts and financial year controls.",
  "Create a backup before live imports or bulk entry.",
  "Create the Supply Order with item rows and commercial values.",
  "Reserve stock or generate procurement requirement.",
  "Complete procurement, GRN and stock receipt.",
  "Issue stock or complete delivery workflow.",
  "Raise billing, then verify receivable and GST summary.",
  "Allocate receipt, pay supplier, post expenses and review profitability."
];

/**
 * Checks exact phrase or token matches inside the expanded intent text.
 */
function phraseMatches(text, phrase) {
  const normalizedPhrase = normalizeHelpText(phrase);
  if (!normalizedPhrase) return false;
  if (normalizedPhrase.includes(" ")) return text.includes(normalizedPhrase);
  return new RegExp(`(^|\\s)${escapeRegex(normalizedPhrase)}(\\s|$)`).test(text);
}

/**
 * Escapes a token before building a strict word-boundary regular expression.
 */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Scores available guidance intents and returns the strongest match.
 */
function detectHelpAssistantIntent(query, mode, history = []) {
  if (mode === "onboarding") return "onboarding";
  if (mode === "coach") return "coach";
  if (mode === "data") return "data";
  if (mode === "screen") return "screen";

  const historyText = history.map((entry) => `${entry.query || ""} ${entry.answerTitle || ""}`).join(" ");
  const normalized = normalizeHelpText(`${query || ""} ${historyText}`);
  if (!normalized) return mode === "screen" ? "screen" : "general";
  if (["this screen", "current screen", "where am i", "help here", "on this page", "this page"].some((phrase) => phraseMatches(normalized, phrase))) {
    return "screen";
  }

  const ranked = INTENT_WEIGHTS
    .map((definition) => {
      const matched = definition.words.filter((word) => phraseMatches(normalized, word));
      return {
        intent: definition.intent,
        score: matched.length * definition.weight,
        matched
      };
    })
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.intent || "general";
}

function buildIntentAnswer({ intent, readiness, coach }) {
  if (intent === "onboarding") {
    return {
      mode: "Onboarding Mode",
      title: "I made the company. Where do I start?",
      type: "Guided Setup",
      summary: "Start with company context, core masters, accounting controls, backup safety, then the order-to-cash workflow.",
      steps: ONBOARDING_SEQUENCE,
      commonMistakes: [
        "Entering a supply order before selecting the correct Current Company.",
        "Importing Tally data without reviewing duplicate and ledger mapping rows.",
        "Treating draft records as posted accounting impact."
      ],
      suggestedNextActions: readiness?.suggestedActions || [],
      sourceLabel: readiness?.sourceLabel || "Guided setup rules",
      safetyNote: "Guidance only: this assistant does not create masters, import records or post vouchers."
    };
  }

  if (intent === "coach") {
    return {
      mode: "ERP Coach Mode",
      title: "What should I do next?",
      type: "Operational Priorities",
      summary: "These priorities are based only on safe summary data already loaded by the ERP shell.",
      steps: (coach?.priorities || []).map((priority) => `${priority.severity}: ${priority.title} - ${priority.detail}`),
      commonMistakes: [
        "Closing an order before receipt allocation and supplier payment review.",
        "Ignoring missing documents before billing or collection follow-up.",
        "Assuming report totals are final while vouchers remain unposted."
      ],
      suggestedNextActions: (coach?.priorities || []).map((priority) => ({
        title: priority.actionLabel,
        detail: priority.detail,
        view: priority.view,
        tone: priority.severity === "Critical" ? "danger" : "warning"
      })),
      sourceLabel: coach?.sourceLabel || "Safe summary data",
      safetyNote: "Guidance only: no workflow action is executed from the coach."
    };
  }

  return null;
}

export { ONBOARDING_SEQUENCE, buildIntentAnswer, detectHelpAssistantIntent };
