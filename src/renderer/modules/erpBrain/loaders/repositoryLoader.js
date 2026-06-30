import modulesData from "../repository/modules/index.json";
import workflowsData from "../repository/workflows/index.json";
import reportsData from "../repository/reports/index.json";
import screensData from "../repository/screens/index.json";
import rulesData from "../repository/rules/index.json";
import glossaryData from "../repository/glossary/index.json";
import navigationData from "../repository/navigation/index.json";
import errorsData from "../repository/errors/index.json";

const REPOSITORY_META = {
  modules: { version: "1.0.0", description: "Structured definitions for all ERP modules", entryCount: 17 },
  workflows: { version: "1.0.0", description: "Structured workflow definitions", entryCount: 6 },
  reports: { version: "1.0.0", description: "ERP report definitions", entryCount: 31 },
  screens: { version: "1.0.0", description: "Screen metadata definitions", entryCount: 30 },
  rules: { version: "1.0.0", description: "Business rule definitions", entryCount: 40 },
  glossary: { version: "1.0.0", description: "ERP terminology glossary", entryCount: 40 },
  navigation: { version: "1.0.0", description: "Navigation path definitions", entryCount: 20 },
  errors: { version: "1.0.0", description: "Common error definitions", entryCount: 30 }
};

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

const repositories = {
  modules: modulesData,
  workflows: workflowsData,
  reports: reportsData,
  screens: screensData,
  rules: rulesData,
  glossary: glossaryData,
  navigation: navigationData,
  errors: errorsData
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
  return Array.isArray(repo[key]) ? repo[key].length : 0;
}

export {
  getRepository,
  getAllRepositories,
  getRepositoryMeta,
  getRepositoryKeys,
  getEntryCount
};
