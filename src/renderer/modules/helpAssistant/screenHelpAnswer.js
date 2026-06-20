/**
 * Normalizes help metadata into a clean list.
 */
function normalizeHelpList(value, fallback = []) {
  if (Array.isArray(value) && value.length) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return fallback;
}

/**
 * Normalizes text for screen guidance matching.
 */
function normalizeHelpText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Converts related action metadata into answer-safe button definitions.
 */
function normalizeRelatedActions(actions = []) {
  return normalizeHelpList(actions)
    .map((action) => {
      if (typeof action === "string") return { title: action, detail: "Review related workflow", tone: "Action" };
      return {
        title: action.title || action.label || action.view || "Open related screen",
        detail: action.detail || action.description || "",
        view: action.view || action.viewKey || "",
        tone: action.tone || "Action"
      };
    })
    .filter((action) => action.title);
}

/**
 * Converts the active screen metadata into a screen-guidance answer topic.
 */
function buildCurrentScreenTopic(currentHelp) {
  const title = currentHelp?.title || "Current Screen Guidance";
  const purpose = currentHelp?.description || "Use this screen according to its purpose, required fields and report controls.";
  const steps = normalizeHelpList(currentHelp?.howToUse, [
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
    viewKey: currentHelp?.viewKey || currentHelp?.key,
    purpose,
    fieldsToCheck: buildScreenFieldsToCheck(title, currentHelp),
    keyFields: normalizeHelpList(currentHelp?.keyFields || currentHelp?.fieldExplanations),
    requiredFields: normalizeHelpList(currentHelp?.requiredFields),
    accountingImpact: normalizeHelpList(currentHelp?.accountingImpact),
    inventoryImpact: normalizeHelpList(currentHelp?.inventoryImpact),
    gstImpact: normalizeHelpList(currentHelp?.gstImpact),
    relatedActions: normalizeRelatedActions(currentHelp?.relatedActions),
    relatedReports: normalizeHelpList(currentHelp?.relatedReports),
    relatedShortcuts: normalizeHelpList(currentHelp?.relatedShortcuts),
    recommendedNextStep: currentHelp?.recommendedNextAction || buildScreenRecommendedNextStep(title, steps),
    steps,
    commonMistakes: normalizeHelpList(currentHelp?.commonMistakes, [
      "Saving records under the wrong company.",
      "Treating draft operational records as posted accounting impact.",
      "Ignoring posting, approval or locked-year warnings."
    ])
  };
}

/**
 * Builds screen-specific field checks from the active screen metadata.
 */
function buildScreenFieldsToCheck(title, currentHelp) {
  const configured = normalizeHelpList(currentHelp?.fieldsToCheck);
  if (configured.length) return configured;
  const haystack = normalizeHelpText([title, currentHelp?.description, currentHelp?.menuPath].join(" "));
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

/**
 * Picks the first safe action for current-screen guidance.
 */
function buildScreenRecommendedNextStep(title, steps) {
  const firstStep = Array.isArray(steps) ? steps.find(Boolean) : "";
  if (firstStep) return firstStep;
  return `Review ${title || "this screen"} inputs, warnings and linked records before taking the next action.`;
}

export { buildCurrentScreenTopic };
