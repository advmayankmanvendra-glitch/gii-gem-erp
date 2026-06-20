import { expandQueryTerms } from "./helpAssistantIntentMap.js";

/**
 * Normalizes search text for local help scoring.
 */
function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Converts searchable text into a de-duplicated token list.
 */
function tokenSet(value) {
  return new Set(normalizeSearchText(value).split(/\s+/).filter((token) => token.length > 1));
}

/**
 * Builds a combined searchable string for one help topic.
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
 * Scores one help topic against the expanded query terms.
 */
function scoreTopic(topic, query) {
  const expanded = expandQueryTerms(query);
  if (!expanded.normalized) return 0;

  const fields = [
    { text: topic.title, weight: 0.42 },
    { text: topic.summary, weight: 0.2 },
    { text: [...(topic.keywords || []), ...(topic.relatedTopics || [])].join(" "), weight: 0.2 },
    { text: topicHaystack(topic), weight: 0.18 }
  ];

  const originalTerms = expanded.normalized.split(/\s+/).filter((term) => term.length > 1);
  const phraseBoost = fields.some((field) => normalizeSearchText(field.text).includes(expanded.normalized)) ? 0.18 : 0;
  const titleDirectScore = scoreTextAgainstTerms(normalizeSearchText(topic.title), originalTerms);
  const titleBoost = titleDirectScore >= 0.7 ? 0.22 : 0;
  const weighted = fields.reduce((total, field) => {
    const fieldText = normalizeSearchText(field.text);
    return total + (scoreTextAgainstTerms(fieldText, expanded.terms) * field.weight);
  }, 0);

  return Math.min(1, Number((weighted + phraseBoost + titleBoost).toFixed(4)));
}

/**
 * Searches help topics with local fuzzy scoring and confidence metadata.
 */
function searchHelpTopics(topics, query, limit = 8) {
  return topics
    .map((topic) => ({ topic, score: scoreTopic(topic, query) }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((row) => ({ ...row.topic, confidence: row.score }));
}

/**
 * Scores one help field against expanded query terms on a 0-1 scale.
 */
function scoreTextAgainstTerms(text, terms) {
  if (!text || !terms.length) return 0;
  const fieldTokens = Array.from(tokenSet(text));
  if (!fieldTokens.length) return 0;
  const bestScores = terms
    .filter((term) => term.length > 1)
    .map((term) => scoreTermAgainstTokens(term, fieldTokens, text));
  if (!bestScores.length) return 0;
  const strongestScores = [...bestScores].sort((left, right) => right - left).slice(0, Math.min(4, bestScores.length));
  const matched = strongestScores.filter((score) => score >= 0.68).length;
  const average = strongestScores.reduce((sum, score) => sum + score, 0) / strongestScores.length;
  const coverage = matched / strongestScores.length;
  return Math.min(1, (average * 0.65) + (coverage * 0.35));
}

/**
 * Finds the best exact, partial or fuzzy token match for one query term.
 */
function scoreTermAgainstTokens(term, tokens, text) {
  if (!term) return 0;
  if (text.includes(term)) return term.includes(" ") ? 0.92 : 0.86;
  return tokens.reduce((best, token) => Math.max(best, fuzzyTokenScore(term, token)), 0);
}

/**
 * Compares two normalized tokens while tolerating common spelling mistakes.
 */
function fuzzyTokenScore(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (right.startsWith(left) || left.startsWith(right)) return 0.82;
  if (right.includes(left) || left.includes(right)) return 0.74;
  const distance = levenshteinDistance(left, right);
  const longest = Math.max(left.length, right.length);
  if (!longest) return 0;
  const score = 1 - (distance / longest);
  return score >= 0.62 ? score : 0;
}

/**
 * Computes edit distance for local fuzzy matching without an npm dependency.
 */
function levenshteinDistance(left, right) {
  const matrix = Array.from({ length: left.length + 1 }, () => []);
  for (let row = 0; row <= left.length; row += 1) matrix[row][0] = row;
  for (let column = 0; column <= right.length; column += 1) matrix[0][column] = column;
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost
      );
    }
  }
  return matrix[left.length][right.length];
}

export { searchHelpTopics };
