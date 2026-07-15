import { CATEGORIES } from "./categoryDefinitions.js";

const MINIMUM_SCORE_THRESHOLD = 1;
const PRIMARY_KEYWORD_WEIGHT = 3;
const SECONDARY_KEYWORD_WEIGHT = 1;
const UNSAFE_ACTION_MATCH_WEIGHT = 10;

const CATEGORY_SPECIFICITY_ORDER = [
  "unsafe_action", "known_gap", "troubleshooting",
  "voucher_accounting", "gst_tax", "database_table",
  "inventory", "report", "workflow",
  "screen_help", "manual_training", "unknown"
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
  const hasActionObject = /\b(voucher|vocuher|vou?cher|record|entry|file|command|sql|ledger|database|stock)\b/.test(query);
  if (!hasActionObject) return false;

  const educationalIntent = /\b(how|what|why|explain|guide|meaning|process|work|works|rule|rules|when|where)\b/.test(query);
  const imperativeIntent = /\b(this|that|now|please|do|run|execute|create|delete|approve|reverse|post|import|export|cancel)\b/.test(query);
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

  const unsafeCategory = CATEGORIES.find((c) => c.id === "unsafe_action");
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
