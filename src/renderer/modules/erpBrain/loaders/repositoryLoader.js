import modulesDataRaw from "../repository/modules/index.json" with { type: "json" };
import workflowsDataRaw from "../repository/workflows/index.json" with { type: "json" };
import reportsDataRaw from "../repository/reports/index.json" with { type: "json" };
import screensDataRaw from "../repository/screens/index.json" with { type: "json" };
import rulesDataRaw from "../repository/rules/index.json" with { type: "json" };
import glossaryDataRaw from "../repository/glossary/index.json" with { type: "json" };
import navigationDataRaw from "../repository/navigation/index.json" with { type: "json" };
import errorsDataRaw from "../repository/errors/index.json" with { type: "json" };

function normalizeRepositoryData(data, expectedKey) {
  if (Array.isArray(data)) {
    return { [expectedKey]: data };
  }
  if (data && typeof data === "object" && Array.isArray(data[expectedKey])) {
    return data;
  }
  if (data && typeof data === "object") {
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key])) {
        return { [expectedKey]: data[key] };
      }
    }
  }
  return { [expectedKey]: [] };
}

const REPOSITORY_KEYS = {
  modules: "modules",
  workflows: "workflows",
  reports: "reports",
  screens: "screens",
  rules: "rules",
  glossary: "glossary",
  navigation: "navigation",
  errors: "errors"
};

const REPOSITORY_META = {
  modules: { version: "1.0.0", description: "Structured definitions for all ERP modules" },
  workflows: { version: "1.0.0", description: "Structured workflow definitions" },
  reports: { version: "1.0.0", description: "ERP report definitions" },
  screens: { version: "1.0.0", description: "Screen metadata definitions" },
  rules: { version: "1.0.0", description: "Business rule definitions" },
  glossary: { version: "1.0.0", description: "ERP terminology glossary" },
  navigation: { version: "1.0.0", description: "Navigation path definitions" },
  errors: { version: "1.0.0", description: "Common error definitions" }
};

const repositories = {
  modules: normalizeRepositoryData(modulesDataRaw, "modules"),
  workflows: normalizeRepositoryData(workflowsDataRaw, "workflows"),
  reports: normalizeRepositoryData(reportsDataRaw, "reports"),
  screens: normalizeRepositoryData(screensDataRaw, "screens"),
  rules: normalizeRepositoryData(rulesDataRaw, "rules"),
  glossary: normalizeRepositoryData(glossaryDataRaw, "glossary"),
  navigation: normalizeRepositoryData(navigationDataRaw, "navigation"),
  errors: normalizeRepositoryData(errorsDataRaw, "errors")
};

function getRepository(name) {
  return repositories[name] || null;
}

function getAllRepositories() {
  return repositories;
}

function getRepositoryMeta() {
  return REPOSITORY_META;
}

function getRepositoryKeys() {
  return REPOSITORY_KEYS;
}

function getEntryCount(name) {
  const repo = repositories[name];
  if (!repo) return 0;
  const key = REPOSITORY_KEYS[name];
  if (Array.isArray(repo[key])) return repo[key].length;
  for (const val of Object.values(repo)) {
    if (Array.isArray(val)) return val.length;
  }
  return 0;
}

function getRepositoryEntryCounts() {
  const counts = {};
  for (const name of Object.keys(REPOSITORY_KEYS)) {
    counts[name] = getEntryCount(name);
  }
  return counts;
}

function getRepositoryEntryCountTotal() {
  const counts = getRepositoryEntryCounts();
  return Object.values(counts).reduce((sum, c) => sum + c, 0);
}

export {
  getRepository,
  getAllRepositories,
  getRepositoryMeta,
  getRepositoryKeys,
  getEntryCount,
  getRepositoryEntryCounts,
  getRepositoryEntryCountTotal
};
