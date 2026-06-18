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
  return !normalized ||
    normalized.includes("this screen") ||
    normalized.includes("current screen") ||
    normalized.includes("what should i do") ||
    normalized.includes("where am i") ||
    normalized.includes("help here");
}

function buildHelpAssistantAnswer({ query, mode, topics, currentHelp }) {
  const screenMode = mode === "screen" || isScreenGuidanceQuestion(query);
  const matches = screenMode ? [] : searchHelpTopics(topics, query, 6);
  const topic = screenMode
    ? buildCurrentScreenTopic(currentHelp)
    : matches[0] || buildNoMatchTopic(query);
  const related = screenMode ? searchHelpTopics(topics, topic.title, 5).filter((item) => item.id !== topic.id) : matches.slice(1, 6);

  return {
    mode: screenMode ? "Screen Guidance Mode" : "Help Mode",
    title: topic.title,
    type: topic.type,
    summary: topic.summary,
    menuPath: topic.menuPath,
    steps: normalizeList(topic.steps),
    commonMistakes: normalizeList(topic.commonMistakes),
    relatedTopics: related.map((item) => ({ id: item.id, title: item.title, type: item.type, menuPath: item.menuPath })),
    safetyNote: "Guidance only: this assistant does not save, post, reverse, import, restore, delete or alter ERP records."
  };
}

function buildCurrentScreenTopic(currentHelp) {
  return {
    id: "current-screen-answer",
    type: "Current Screen",
    title: currentHelp?.title || "Current Screen Guidance",
    summary: currentHelp?.description || "Use this screen according to its purpose, required fields and report controls.",
    menuPath: currentHelp?.menuPath || "",
    steps: normalizeList(currentHelp?.howToUse, [
      "Review the screen title and purpose.",
      "Check Current Company before entering company-specific records.",
      "Use required fields, filters and report buttons shown on the screen.",
      "Open the related report or ledger before making corrections."
    ]),
    commonMistakes: normalizeList(currentHelp?.commonMistakes, [
      "Saving records under the wrong company.",
      "Treating draft operational records as posted accounting impact.",
      "Ignoring posting, approval or locked-year warnings."
    ])
  };
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
