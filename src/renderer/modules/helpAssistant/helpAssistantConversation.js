const CONTEXT_TERMS = [
  "supplier",
  "vendor",
  "payment",
  "receipt",
  "department",
  "invoice",
  "billing",
  "order",
  "stock",
  "warehouse",
  "voucher",
  "ledger",
  "gst",
  "import",
  "tally",
  "procurement",
  "payable",
  "receivable"
];

/**
 * Keeps a compact rolling memory of recent guidance questions.
 */
function rememberConversation(history = [], query, answer) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return history.slice(-5);
  return [
    ...history,
    {
      query: cleanQuery,
      answerTitle: answer?.title || "",
      mode: answer?.mode || "",
      timestamp: Date.now()
    }
  ].slice(-5);
}

/**
 * Finds ERP context terms that can make a short follow-up question understandable.
 */
function extractContextTerms(text) {
  const normalized = String(text || "").toLowerCase();
  return CONTEXT_TERMS.filter((term) => normalized.includes(term));
}

/**
 * Detects whether the latest question likely depends on the previous answer.
 */
function isFollowUpQuestion(query) {
  const normalized = String(query || "").toLowerCase().trim();
  return /^(what about|and |also|same for|then|next|what next|how about)\b/.test(normalized) ||
    normalized.length < 28;
}

/**
 * Appends recent ERP context to short follow-up questions without changing visible text.
 */
function inferFollowUpQuery(query, history = []) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery || !history.length || !isFollowUpQuestion(cleanQuery)) return cleanQuery;

  const queryTerms = extractContextTerms(cleanQuery);
  const previous = [...history].reverse().find((entry) => extractContextTerms(`${entry.query} ${entry.answerTitle}`).length);
  const previousTerms = previous ? extractContextTerms(`${previous.query} ${previous.answerTitle}`) : [];
  const missingTerms = previousTerms.filter((term) => !queryTerms.includes(term)).slice(0, 3);

  if (!missingTerms.length) return cleanQuery;
  return `${cleanQuery} ${missingTerms.join(" ")}`;
}

export { inferFollowUpQuery, rememberConversation };
