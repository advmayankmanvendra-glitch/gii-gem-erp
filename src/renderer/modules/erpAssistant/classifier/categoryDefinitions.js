const CATEGORIES = [
  {
    id: "workflow",
    label: "Workflow Question",
    description: "Questions about workflow stages, dependencies, operational sequence, and lifecycle",
    matchKeywords: {
      primary: ["workflow", "stage", "lifecycle", "operational", "predecessor", "successor", "dependency", "work order", "supply order", "crac", "grn", "goods receipt", "delivery challan", "procurement planning", "closure", "order closure", "procurement", "purchase order", "supplier purchase", "installation", "challan", "billing", "invoice readiness"],
      secondary: ["after", "before", "next step", "what next", "then what", "chain", "sequence", "process flow", "flow"]
    },
    preferredSource: "workflow-graph",
    fallbackSource: "manual",
    isAccountingSensitive: false,
    isInventorySensitive: false,
    isGSTSensitive: false,
    isWorkflowSensitive: true,
    isImportExportSensitive: false,
    requiresSafetyNotice: false,
    requiresManualFallback: true,
    requiresNeedsReview: false,
    confidenceModel: "high if workflow-graph matches stage node; medium if only secondary keywords match; low otherwise"
  },
  {
    id: "screen_help",
    label: "Screen / Help Question",
    description: "Where to find ERP features, screens, menus, routes, and navigation",
    matchKeywords: {
      primary: ["where is", "how do i open", "which menu", "which screen", "navigate", "route to", "open the", "find the", "go to", "dashboard", "screen"],
      secondary: ["screen", "page", "tab", "window", "view", "sidebar", "menu", "button", "panel", "section"]
    },
    preferredSource: "renderer-graph",
    fallbackSource: "repository",
    isAccountingSensitive: false,
    isInventorySensitive: false,
    isGSTSensitive: false,
    isWorkflowSensitive: false,
    isImportExportSensitive: false,
    requiresSafetyNotice: false,
    requiresManualFallback: true,
    requiresNeedsReview: false,
    confidenceModel: "high if renderer-graph route key matches; medium if secondary keyword with module match; low otherwise"
  },
  {
    id: "manual_training",
    label: "Manual / Training Question",
    description: "How-to procedures, step-by-step guides, checklists, training materials",
    matchKeywords: {
      primary: ["how to", "guide", "steps", "procedure", "tutorial", "walkthrough", "training", "checklist", "steps to", "process for", "how do i", "import", "export", "migration", "month end", "migrate", "monthly close", "year end"],
      secondary: ["instructions", "documentation", "manual", "help", "learn", "basics", "introduction", "overview", "what is the process", "should i"]
    },
    preferredSource: "manual",
    fallbackSource: "repository",
    isAccountingSensitive: false,
    isInventorySensitive: false,
    isGSTSensitive: false,
    isWorkflowSensitive: false,
    isImportExportSensitive: false,
    requiresSafetyNotice: false,
    requiresManualFallback: false,
    requiresNeedsReview: false,
    confidenceModel: "high if manual section title matches query; medium if manual content keyword matches; low otherwise"
  },
  {
    id: "database_table",
    label: "Database / Table Question",
    description: "Questions about database tables, columns, schemas, relationships, and table purposes",
    matchKeywords: {
      primary: ["table", "column", "field", "database", "schema", "sql", "query", "stored in", "stores", "columns of"],
      secondary: ["relationship", "foreign key", "primary key", "index", "data type", "structure", "what table"]
    },
    preferredSource: "database-graph",
    fallbackSource: "repository",
    isAccountingSensitive: true,
    isInventorySensitive: false,
    isGSTSensitive: false,
    isWorkflowSensitive: false,
    isImportExportSensitive: false,
    requiresSafetyNotice: true,
    requiresManualFallback: true,
    requiresNeedsReview: false,
    confidenceModel: "high if database-graph table name matches; medium if table column or relationship matches; low if only generic DB terms"
  },
  {
    id: "voucher_accounting",
    label: "Voucher / Accounting Question",
    description: "Questions about voucher types, debit/credit patterns, posting rules, ledger impact, accounting entries",
    matchKeywords: {
      primary: ["voucher", "voucher dashboard", "business voucher", "guided voucher", "accounting voucher", "debit", "credit", "journal", "posting", "ledger entry", "accounting entry", "double entry", "ledger", "trial balance", "tb", "profit and loss", "balance sheet", "pnl", "p&l", "receivables", "payables", "receivable", "payable", "assets", "liabilities", "equity"],
      secondary: ["entry", "account", "post", "reverse", "cancellation", "storno", "contra", "payment", "receipt", "accrual", "dashboard"]
    },
    preferredSource: "voucher-accounting-graph",
    fallbackSource: "database-graph",
    isAccountingSensitive: true,
    isInventorySensitive: false,
    isGSTSensitive: false,
    isWorkflowSensitive: false,
    isImportExportSensitive: false,
    requiresSafetyNotice: true,
    requiresManualFallback: true,
    requiresNeedsReview: false,
    confidenceModel: "high if voucher-accounting-graph voucher type matches; medium if posting function or report matches; low otherwise"
  },
  {
    id: "report",
    label: "Report Question",
    description: "Questions about report purposes, sources, dependencies, and how reports are generated",
    matchKeywords: {
      primary: ["report", "reports", "report type", "report types", "types of reports", "type of reports", "trial balance", "profit and loss", "balance sheet", "gst register", "stock summary", "receivables", "payables", "aging", "cash flow"],
      secondary: ["shows", "displays", "generates", "prints", "exports", "summary", "list of", "how many", "types", "register", "statement"]
    },
    preferredSource: "repository",
    fallbackSource: "database-graph",
    isAccountingSensitive: true,
    isInventorySensitive: false,
    isGSTSensitive: false,
    isWorkflowSensitive: false,
    isImportExportSensitive: false,
    requiresSafetyNotice: true,
    requiresManualFallback: true,
    requiresNeedsReview: false,
    confidenceModel: "high if report source maps to known report; medium if report keyword matches without source mapping; low otherwise"
  },
  {
    id: "gst_tax",
    label: "GST / Tax Question",
    description: "Questions about GST, tax rates, HSN/SAC codes, e-way bills, GST returns, and tax reports",
    matchKeywords: {
      primary: ["gst", "tax", "hsn", "sac", "e-way bill", "eway bill", "gst return", "gst register", "input tax credit", "itc", "output tax", "reverse charge", "rcm"],
      secondary: ["rate", "percentage", "exempt", "nil rated", "zero rated", "composition", "quarterly", "monthly return"]
    },
    preferredSource: "voucher-accounting-graph",
    fallbackSource: "manual",
    isAccountingSensitive: false,
    isInventorySensitive: false,
    isGSTSensitive: true,
    isWorkflowSensitive: false,
    isImportExportSensitive: false,
    requiresSafetyNotice: true,
    requiresManualFallback: true,
    requiresNeedsReview: false,
    confidenceModel: "high if voucher-accounting-graph has GST-specific entry; medium if manual section matches; low otherwise"
  },
  {
    id: "inventory",
    label: "Inventory Question",
    description: "Questions about stock movement, inward, outward, adjustment, valuation, GRN, and inventory reports",
    matchKeywords: {
      primary: ["stock", "inventory", "inward", "outward", "adjustment", "valuation", "cogs", "cost of goods", "reservation", "warehouse"],
      secondary: ["bin", "location", "serial", "batch", "quantity", "rate", "average cost", "fifo", "moving average"]
    },
    preferredSource: "workflow-graph",
    fallbackSource: "database-graph",
    isAccountingSensitive: false,
    isInventorySensitive: true,
    isGSTSensitive: false,
    isWorkflowSensitive: false,
    isImportExportSensitive: false,
    requiresSafetyNotice: true,
    requiresManualFallback: true,
    requiresNeedsReview: false,
    confidenceModel: "high if workflow-graph inventory stage matches; medium if database-graph stock table matches; low otherwise"
  },
  {
    id: "troubleshooting",
    label: "Troubleshooting Question",
    description: "Questions about errors, failures, blank screens, and operational issues",
    matchKeywords: {
      primary: ["error", "fail", "failed", "failure", "blank", "not working", "issue", "problem", "broken", "crash", "not showing", "not loading", "stuck"],
      secondary: ["why", "cause", "reason", "fix", "solution", "resolve", "workaround", "troubleshoot"]
    },
    preferredSource: "repository",
    fallbackSource: "manual",
    isAccountingSensitive: false,
    isInventorySensitive: false,
    isGSTSensitive: false,
    isWorkflowSensitive: false,
    isImportExportSensitive: false,
    requiresSafetyNotice: false,
    requiresManualFallback: true,
    requiresNeedsReview: true,
    confidenceModel: "medium if BRAIN error entry matches error code/keyword; low otherwise (no live inspection)"
  },
  {
    id: "known_gap",
    label: "Known Gap Question",
    description: "Questions about documented limitations, unimplemented features, and known issues",
    matchKeywords: {
      primary: ["known gap", "limitation", "not implemented", "not yet", "planned", "roadmap", "known issue", "not available", "missing feature", "not supported"],
      secondary: ["gap", "missing", "lacking", "todo", "future", "pending"]
    },
    preferredSource: "repository",
    fallbackSource: null,
    isAccountingSensitive: false,
    isInventorySensitive: false,
    isGSTSensitive: false,
    isWorkflowSensitive: false,
    isImportExportSensitive: false,
    requiresSafetyNotice: false,
    requiresManualFallback: false,
    requiresNeedsReview: true,
    confidenceModel: "high if graph knownGaps entry matches; medium if gap referenced in architecture report; low if no documented gap found"
  },
  {
    id: "unsafe_action",
    label: "Unsafe Action Request",
    description: "Requests to perform operations that the assistant must refuse",
    matchKeywords: {
      primary: [],
      secondary: []
    },
    preferredSource: null,
    fallbackSource: null,
    isAccountingSensitive: false,
    isInventorySensitive: false,
    isGSTSensitive: false,
    isWorkflowSensitive: false,
    isImportExportSensitive: false,
    requiresSafetyNotice: true,
    requiresManualFallback: false,
    requiresNeedsReview: false,
    confidenceModel: "N/A — classification triggers immediate refusal",
    unsafeActionKeywords: [
      "post voucher", "reverse voucher", "approve", "delete", "restore",
      "import file", "export file", "run command",
      "execute sql", "fix database", "fix ledger", "fix accounting",
      "edit stock", "edit ledger", "create voucher", "cancel voucher"
    ]
  },
  {
    id: "unknown",
    label: "Unknown / Needs Review",
    description: "Queries that do not match any defined category",
    matchKeywords: {
      primary: [],
      secondary: []
    },
    preferredSource: null,
    fallbackSource: "manual",
    isAccountingSensitive: false,
    isInventorySensitive: false,
    isGSTSensitive: false,
    isWorkflowSensitive: false,
    isImportExportSensitive: false,
    requiresSafetyNotice: false,
    requiresManualFallback: true,
    requiresNeedsReview: true,
    confidenceModel: "low — no category surpassed minimum score threshold"
  }
];

function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}

function getAllCategories() {
  return CATEGORIES.map((c) => ({ id: c.id, label: c.label, description: c.description }));
}

export { CATEGORIES, getCategory, getAllCategories };
