import {
  getRepository,
  getAllRepositories,
  getRepositoryMeta,
  getRepositoryKeys
} from "../loaders/repositoryLoader.js";

function searchAll(query) {
  if (!query || typeof query !== "string") return [];
  const q = query.toLowerCase().trim();
  const repos = getAllRepositories();
  const keys = getRepositoryKeys();
  const results = [];

  for (const [repoName, repoData] of Object.entries(repos)) {
    const entryKey = keys[repoName];
    const entries = repoData[entryKey];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const match = matchEntry(entry, q, repoName);
      if (match) {
        results.push({
          repository: repoName,
          entry,
          score: match.score,
          matchedField: match.field
        });
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

function searchRepository(repoName, query) {
  if (!query || typeof query !== "string") return [];
  const q = query.toLowerCase().trim();
  const repo = getRepository(repoName);
  if (!repo) return [];
  const keys = getRepositoryKeys();
  const entryKey = keys[repoName];
  const entries = repo[entryKey];
  if (!Array.isArray(entries)) return [];

  const results = [];
  for (const entry of entries) {
    const match = matchEntry(entry, q, repoName);
    if (match) {
      results.push({
        repository: repoName,
        entry,
        score: match.score,
        matchedField: match.field
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

function getById(repoName, id) {
  const repo = getRepository(repoName);
  if (!repo) return null;
  const keys = getRepositoryKeys();
  const entryKey = keys[repoName];
  const entries = repo[entryKey];
  if (!Array.isArray(entries)) return null;
  return entries.find((e) => e.id === id) || null;
}

function getRelated(repoName, id, relationField) {
  const entry = getById(repoName, id);
  if (!entry) return [];
  const relatedIds = entry[relationField];
  if (!Array.isArray(relatedIds)) return [];
  return relatedIds.map((rid) => getById(repoName, rid)).filter(Boolean);
}

function getModuleWorkflows(moduleName) {
  const repo = getRepository("workflows");
  if (!repo) return [];
  const entries = repo.workflows;
  if (!Array.isArray(entries)) return [];
  return entries.filter((w) =>
    w.modules && w.modules.some((m) =>
      m.toLowerCase() === moduleName.toLowerCase()
    )
  );
}

function getScreenByViewKey(viewKey) {
  const repo = getRepository("screens");
  if (!repo) return null;
  const entries = repo.screens;
  if (!Array.isArray(entries)) return null;
  return entries.find((s) => s.viewKey === viewKey) || null;
}

function getReportByViewKey(viewKey) {
  const repo = getRepository("reports");
  if (!repo) return null;
  const entries = repo.reports;
  if (!Array.isArray(entries)) return null;
  return entries.find((r) => r.viewKey === viewKey) || null;
}

function matchEntry(entry, query, repoName) {
  const searchableFields = getSearchableFields(repoName);
  let bestScore = 0;
  let bestField = null;

  for (const field of searchableFields) {
    const value = entry[field];
    if (!value) continue;
    const str = String(value).toLowerCase();
    if (str.includes(query)) {
      const score = calculateScore(str, query, field);
      if (score > bestScore) {
        bestScore = score;
        bestField = field;
      }
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const itemStr = String(item).toLowerCase();
        if (itemStr.includes(query)) {
          const score = calculateScore(itemStr, query, field);
          if (score > bestScore) {
            bestScore = score;
            bestField = field;
          }
        }
      }
    }
  }

  if (bestScore > 0) {
    return { score: bestScore, field: bestField };
  }
  return null;
}

function calculateScore(text, query, fieldName) {
  let score = 0;
  if (text.startsWith(query)) score += 10;
  if (text === query) score += 20;
  score += query.length / text.length * 5;
  const weightMap = {
    id: 15,
    name: 8,
    term: 8,
    title: 8,
    error: 7,
    purpose: 5,
    description: 4,
    definition: 4
  };
  score += weightMap[fieldName] || 2;
  return score;
}

function getSearchableFields(repoName) {
  const fieldMap = {
    modules: ["id", "name", "purpose", "description"],
    workflows: ["id", "name", "purpose"],
    reports: ["id", "name", "purpose"],
    screens: ["id", "name", "purpose"],
    rules: ["id", "name", "description"],
    glossary: ["id", "term", "definition"],
    navigation: ["id", "name", "purpose"],
    errors: ["id", "error", "possibleCauses"]
  };
  return fieldMap[repoName] || ["id", "name", "purpose"];
}

export {
  searchAll,
  searchRepository,
  getById,
  getRelated,
  getModuleWorkflows,
  getScreenByViewKey,
  getReportByViewKey
};
