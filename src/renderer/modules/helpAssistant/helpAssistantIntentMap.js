const SYNONYM_GROUPS = [
  ["voucher", "vocher", "vouchar", "accounting entry", "posting entry"],
  ["invoice", "invice", "bill", "billing", "billed", "gst invoice"],
  ["receipt", "reciept", "collection", "payment received", "customer payment"],
  ["payment", "payout", "payment made", "supplier payment", "vendor payment"],
  ["supplier", "vendor", "creditor", "party payable"],
  ["department", "government department", "govt department", "client", "customer", "debtor"],
  ["purchase order", "po", "procurement", "purchase", "purchase voucher"],
  ["delivery challan", "dc", "delivery note", "dispatch"],
  ["goods receipt note", "grn", "goods receipt", "stock receipt", "inward"],
  ["stock", "inventory", "warehouse", "warehosue", "godown", "store"],
  ["employee", "staff", "user", "person", "operator"],
  ["profit", "margin", "profitability", "roi"],
  ["import", "upload", "migration", "tally", "xml", "batch"],
  ["backup", "restore", "recovery", "health", "runtime"],
  ["gst", "tax", "tds", "gst tds", "hsn"],
  ["ledger", "account", "chart of accounts", "general ledger"],
  ["order", "supply order", "gem order", "work order"]
];

const SYNONYM_MAP = SYNONYM_GROUPS.reduce((map, group) => {
  group.forEach((term) => {
    map[term] = group.filter((candidate) => candidate !== term);
  });
  return map;
}, {});

const INTENT_WEIGHTS = [
  {
    intent: "onboarding",
    weight: 3,
    words: ["setup", "first time", "start", "begin", "new to", "new employee", "created company", "made the company", "where do i start"]
  },
  {
    intent: "coach",
    weight: 3,
    words: ["next", "today", "priority", "pending", "stuck", "attention", "what should i", "next action"]
  },
  {
    intent: "screen",
    weight: 3,
    words: ["this screen", "current screen", "where am i", "help here", "on this page", "this page"]
  },
  {
    intent: "data",
    weight: 2,
    words: ["count", "total", "how many", "show", "list", "outstanding", "balance", "summary"]
  },
  {
    intent: "accounting",
    weight: 2,
    words: ["voucher", "ledger", "post", "posting", "trial balance", "debit", "credit", "journal", "contra"]
  },
  {
    intent: "inventory",
    weight: 2,
    words: ["stock", "warehouse", "grn", "inward", "outward", "inventory", "reservation"]
  },
  {
    intent: "import",
    weight: 2,
    words: ["tally", "import", "xml", "migration", "batch", "upload", "template"]
  },
  {
    intent: "gst",
    weight: 2,
    words: ["gst", "tds", "hsn", "tax", "gst invoice"]
  },
  {
    intent: "recovery",
    weight: 2,
    words: ["backup", "restore", "runtime", "health", "recovery", "blank screen"]
  }
];

const SUGGESTED_KEYWORDS = [
  "voucher",
  "invoice",
  "billing",
  "receipt",
  "supplier payment",
  "stock",
  "warehouse",
  "import",
  "GST",
  "ledger",
  "backup",
  "profitability"
];

/**
 * Normalizes help text for matching without changing the original answer text.
 */
function normalizeHelpText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Expands a user query with equivalent ERP terms so search and intent scoring share vocabulary.
 */
function expandQueryTerms(query) {
  const normalized = normalizeHelpText(query);
  const terms = new Set(normalized.split(/\s+/).filter(Boolean));

  Object.entries(SYNONYM_MAP).forEach(([term, synonyms]) => {
    const normalizedTerm = normalizeHelpText(term);
    if (!normalizedTerm) return;
    const phraseMatch = normalized.includes(normalizedTerm);
    const tokenMatch = terms.has(normalizedTerm);
    if (phraseMatch || tokenMatch) {
      synonyms.forEach((synonym) => {
        normalizeHelpText(synonym).split(/\s+/).filter(Boolean).forEach((token) => terms.add(token));
        terms.add(normalizeHelpText(synonym));
      });
    }
  });

  return {
    normalized,
    terms: Array.from(terms).filter(Boolean),
    expandedText: [normalized, ...terms].filter(Boolean).join(" ")
  };
}

export { INTENT_WEIGHTS, SUGGESTED_KEYWORDS, SYNONYM_MAP, expandQueryTerms, normalizeHelpText };
