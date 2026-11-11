import { CATEGORIES } from "./categoryDefinitions.js";

const MINIMUM_SCORE_THRESHOLD = 1;
const PRIMARY_KEYWORD_WEIGHT = 3;
const SECONDARY_KEYWORD_WEIGHT = 1;
const UNSAFE_ACTION_MATCH_WEIGHT = 10;

const CATEGORY_SPECIFICITY_ORDER = [
  "unsafe_action", "known_gap", "troubleshooting",
  "screen_help",
  "voucher_accounting", "gst_tax", "database_table",
  "workflow", "report", "inventory",
  "manual_training", "unknown"
];

function normalizeQuery(query) {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

function hasUnsafeActionKeywords(query, category) {
  const keywords = category.unsafeActionKeywords;
  if (!keywords || keywords.length === 0) return false;
  const queryWords = query.split(/\s+/);
  const directMatch = keywords.some((kw) => {
    const kwWords = kw.split(/\s+/);
    return kwWords.every((w) => queryWords.includes(w));
  });
  if (directMatch) return true;
  return hasUnsafeActionPattern(query);
}

function hasUnsafeActionPattern(query) {
  const hasActionVerb = /\b(post|reverse|approve|delete|restore|import|export|run|execute|create|cancel)\b/.test(query);
  if (!hasActionVerb) return false;
  const hasActionObject = /\b(voucher|vocuher|vou?cher|record|entry|file|command|sql|ledger|database|stock|journal|receipt|payment|bill|invoice)\b/.test(query);
  if (!hasActionObject) return false;

  const educationalIntent = /\b(how|what|why|explain|guide|meaning|process|work|works|rule|rules|when|where|does|is|are|can)\b/.test(query);
  const imperativeIntent = /\b(this|that|now|please|do|run|execute)\b/.test(query);
  return imperativeIntent || !educationalIntent;
}

function scoreQueryAgainstCategory(query, category) {
  let score = 0;
  for (const kw of category.matchKeywords.primary) {
    if (query.includes(kw)) score += PRIMARY_KEYWORD_WEIGHT;
  }
  for (const kw of category.matchKeywords.secondary) {
    if (query.includes(kw)) score += SECONDARY_KEYWORD_WEIGHT;
  }
  return score;
}

function deriveSafetyFlags(category) {
  return {
    isAccountingSensitive: category.isAccountingSensitive,
    isInventorySensitive: category.isInventorySensitive,
    isGSTSensitive: category.isGSTSensitive,
    isWorkflowSensitive: category.isWorkflowSensitive,
    isImportExportSensitive: category.isImportExportSensitive,
    requiresSafetyNotice: category.requiresSafetyNotice,
    requiresManualFallback: category.requiresManualFallback,
    requiresNeedsReview: category.requiresNeedsReview
  };
}

function buildCategoryResult(query, category, confidence = "high") {
  return {
    query: query.trim(),
    category: category.id,
    categoryLabel: category.label,
    confidence,
    preferredSource: category.preferredSource,
    fallbackSource: category.fallbackSource,
    safetyFlags: deriveSafetyFlags(category),
    needsReview: confidence === "low" || category.requiresNeedsReview
  };
}

function categoryById(id) {
  return CATEGORIES.find((category) => category.id === id);
}

function hasNavigationIntent(query) {
  return /^(where is|where do i|where can i|which menu|which screen|which sidebar|how do i open|how do i find|how do i create|how can i open|how can i find)\b/.test(query)
    || /\b(where is|where do i find|where can i see|which menu contains|which screen has)\b/.test(query);
}

function isLiveDataOrExternalRequest(query) {
  return /\b(weather|joke|train ticket|poem|cricket|browse internet|bank balance|customer wise|list all orders|how much did i pay|live gst|youtube|send email|capital of france|salary slip|password|read all invoices|live records?|actual bills?|actual stock|personal tax)\b/.test(query);
}

function classifyQuery(query, currentViewKey) {
  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return {
      query: query || "",
      category: "unknown",
      categoryLabel: "Unknown / Needs Review",
      confidence: "low",
      preferredSource: null,
      fallbackSource: "manual",
      safetyFlags: {
        isAccountingSensitive: false, isInventorySensitive: false,
        isGSTSensitive: false, isWorkflowSensitive: false,
        isImportExportSensitive: false, requiresSafetyNotice: false,
        requiresManualFallback: true, requiresNeedsReview: true
      },
      needsReview: true
    };
  }

  const normalized = normalizeQuery(query);

  const unsafeCategory = categoryById("unsafe_action");
  if (hasUnsafeActionKeywords(normalized, unsafeCategory)) {
    return buildCategoryResult(query, unsafeCategory);
  }

  // Navigation is safe guidance under Rule 32 and must not lose to a content term.
  if (hasNavigationIntent(normalized) && !/\bin the workflow\b/.test(normalized)) {
    return buildCategoryResult(query, categoryById("screen_help"));
  }

  // These questions ask for unavailable live/external information, not ERP guidance.
  if (/\b(known gap|limitation|not implemented|not yet|not supported|not available|planned|roadmap|pending assistant|missing (?:in )?reports?|live records?|brain inspect|inspect actual bills?)\b/.test(normalized)) {
    return buildCategoryResult(query, categoryById("known_gap"), "high");
  }

  if (isLiveDataOrExternalRequest(normalized)) {
    return buildCategoryResult(query, categoryById("unknown"), "low");
  }

  if (/\b(error|fail(?:ed|ure)?|blank|not working|not loading|does not load|not load|not showing|not posting|wrong|stuck|troubleshoot)\b/.test(normalized)) {
    return buildCategoryResult(query, categoryById("troubleshooting"), "high");
  }

  if (/\b(import|export|migration|migrate|month[ -]end|monthly close|year[ -]end|financial year closing|before closing|checklist|accountant check|pending vouchers|daily operations|how to)\b/.test(normalized)) {
    return buildCategoryResult(query, categoryById("manual_training"), "high");
  }

  if (/\b(stock summary|reserved stock|goods receipts?.*stock|stock.*goods receipts?)\b/.test(normalized)) {
    return buildCategoryResult(query, categoryById("inventory"));
  }

  // GRNI is the account the GRN receipt Journal credits, so it is an accounting question.
  if (/\b(grni|goods received not invoiced)\b/.test(normalized)) {
    return buildCategoryResult(query, categoryById("voucher_accounting"));
  }

  if (/\b(work order|supply order|\bgrn\b|goods receipt)\b/.test(normalized) && !/\b(stock|accounting voucher|ledger entries|accounting)\b/.test(normalized)) {
    return buildCategoryResult(query, categoryById("workflow"));
  }

  if (/\b(gst|hsn|sac|input tax|output tax)\b/.test(normalized) && !/\b(accounts?|accounting|ledger|report|reports|gst invoice)\b/.test(normalized)) {
    return buildCategoryResult(query, categoryById("gst_tax"));
  }

  if (/\b(accounts?|accounting|ledger|profit|loss|income|expense|assets?|liabilities|equity|financial position|opening balance|p&l|pnl|gst invoice|billing linked to receipt)\b/.test(normalized) && !/\breports?\b/.test(normalized)) {
    return buildCategoryResult(query, categoryById("voucher_accounting"));
  }

  if (/\b(report|reports)\b/.test(normalized) && /\b(stock|inventory)\b/.test(normalized) && !/\b(report|reports)\b/.test(normalized)) {
    return buildCategoryResult(query, categoryById("inventory"));
  }

  if (/\b(report|reports)\b/.test(normalized) && !/\b(gst|hsn|sac)\b/.test(normalized)) {
    return buildCategoryResult(query, categoryById("report"));
  }

  const unsafeScore = hasUnsafeActionKeywords(normalized, unsafeCategory) ? UNSAFE_ACTION_MATCH_WEIGHT : 0;

  if (unsafeScore >= UNSAFE_ACTION_MATCH_WEIGHT) {
    const unknownCat = CATEGORIES.find((c) => c.id === "unknown");
    return {
      query: query.trim(),
      category: "unsafe_action",
      categoryLabel: unsafeCategory.label,
      confidence: "high",
      preferredSource: null,
      fallbackSource: null,
      safetyFlags: deriveSafetyFlags(unsafeCategory),
      needsReview: false
    };
  }

  const scores = CATEGORIES
    .filter((c) => c.id !== "unsafe_action")
    .map((c) => ({
      category: c,
      score: scoreQueryAgainstCategory(normalized, c)
    }))
    .filter((s) => s.score > 0);

  if (scores.length === 0) {
    const unknownCat = CATEGORIES.find((c) => c.id === "unknown");
    return {
      query: query.trim(),
      category: "unknown",
      categoryLabel: unknownCat.label,
      confidence: "low",
      preferredSource: null,
      fallbackSource: "manual",
      safetyFlags: deriveSafetyFlags(unknownCat),
      needsReview: true
    };
  }

  const maxScore = Math.max(...scores.map((s) => s.score));

  const tied = scores.filter((s) => s.score === maxScore);

  let winner;
  if (tied.length === 1) {
    winner = tied[0].category;
  } else {
    const tiedIds = tied.map((s) => s.category.id);
    for (const specId of CATEGORY_SPECIFICITY_ORDER) {
      if (tiedIds.includes(specId)) {
        winner = tied[0].category.id === specId
          ? tied.find((s) => s.category.id === specId).category
          : tied.find((s) => s.category.id === specId).category;
        break;
      }
    }
    if (!winner) winner = tied[0].category;
  }

  const confidence = maxScore >= PRIMARY_KEYWORD_WEIGHT * 2 ? "high"
    : maxScore >= PRIMARY_KEYWORD_WEIGHT ? "medium"
    : "low";

  const needsReview = confidence === "low" || winner.requiresNeedsReview;

  const result = {
    query: query.trim(),
    category: winner.id,
    categoryLabel: winner.label,
    confidence,
    preferredSource: winner.preferredSource,
    fallbackSource: winner.fallbackSource,
    safetyFlags: deriveSafetyFlags(winner),
    needsReview
  };

  return result;
}

export { classifyQuery };
