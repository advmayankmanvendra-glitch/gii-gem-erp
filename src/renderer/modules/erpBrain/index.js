import {
  getRepository,
  getAllRepositories,
  getRepositoryMeta,
  getRepositoryKeys,
  getEntryCount,
  getRepositoryEntryCounts,
  getRepositoryEntryCountTotal
} from "./loaders/repositoryLoader.js";

import {
  searchAll,
  searchRepository,
  getById,
  getRelated,
  getModuleWorkflows,
  getScreenByViewKey,
  getReportByViewKey
} from "./services/repositorySearchService.js";

import {
  loadGraph,
  loadAllGraphs,
  getGraphRegistry,
  getActiveGraphs,
  getGraphByKind
} from "./loaders/graphLoader.js";

import {
  loadAllManuals,
  getManualSections,
  searchManuals,
  getAllManualIds
} from "./loaders/manualLoader.js";

import {
  buildSearchIndex,
  getSearchIndex,
  searchIndex
} from "./services/sourceBackedSearchIndex.js";

import {
  sourceBackedSearch,
  searchByKind,
  searchModules,
  searchScreens,
  searchWorkflows,
  searchDatabaseTables,
  searchVoucherAccounting,
  searchReports,
  searchManuals as searchManualTopics,
  searchKnownGaps
} from "./services/sourceBackedSearchService.js";

import {
  buildAnswer,
  formatSourceReferences,
  explainWorkflowStage,
  explainDatabaseTable,
  explainVoucherType,
  explainReport,
  getManualHelp,
  getKnownGaps
} from "./services/sourceBackedAnswerBuilder.js";

export {
  getRepository,
  getAllRepositories,
  getRepositoryMeta,
  getRepositoryKeys,
  getEntryCount,
  getRepositoryEntryCounts,
  getRepositoryEntryCountTotal,
  searchAll,
  searchRepository,
  getById,
  getRelated,
  getModuleWorkflows,
  getScreenByViewKey,
  getReportByViewKey,
  loadGraph,
  loadAllGraphs,
  getGraphRegistry,
  getActiveGraphs,
  getGraphByKind,
  loadAllManuals,
  getManualSections,
  searchManuals,
  getAllManualIds,
  buildSearchIndex,
  getSearchIndex,
  searchIndex,
  sourceBackedSearch,
  searchByKind,
  searchModules,
  searchScreens,
  searchWorkflows,
  searchDatabaseTables,
  searchVoucherAccounting,
  searchReports,
  searchManualTopics,
  searchKnownGaps,
  buildAnswer,
  formatSourceReferences,
  explainWorkflowStage,
  explainDatabaseTable,
  explainVoucherType,
  explainReport,
  getManualHelp,
  getKnownGaps
};
