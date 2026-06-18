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

function normalizeIntentText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function detectHelpAssistantIntent(query, mode) {
  const normalized = normalizeIntentText(query);
  if (mode === "onboarding") return "onboarding";
  if (mode === "coach") return "coach";
  if (mode === "data") return "data";
  if (!normalized) return mode === "screen" ? "screen" : "general";

  if (
    includesAny(normalized, ["made the company", "created company", "where do i start", "how do i start", "new employee", "first time", "onboard", "setup erp"]) ||
    (normalized.includes("company") && includesAny(normalized, ["start", "next", "after"]))
  ) {
    return "onboarding";
  }

  if (includesAny(normalized, ["what should i do today", "today", "priority", "pending", "stuck", "next action", "attention"])) {
    return "coach";
  }

  if (includesAny(normalized, ["how much", "show me", "which", "list", "count", "outstanding", "payable", "receivable", "gst payable", "low stock", "unpaid"])) {
    return "data";
  }

  if (includesAny(normalized, ["this screen", "current screen", "where am i", "help here"])) return "screen";
  if (includesAny(normalized, ["voucher", "posting", "ledger", "trial balance"])) return "accounting";
  if (includesAny(normalized, ["gst", "tds", "invoice"])) return "gst";
  if (includesAny(normalized, ["stock", "inventory", "warehouse", "grn"])) return "inventory";
  if (includesAny(normalized, ["backup", "restore", "runtime", "health"])) return "recovery";
  if (includesAny(normalized, ["import", "tally", "xml", "template"])) return "import";
  return "general";
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
