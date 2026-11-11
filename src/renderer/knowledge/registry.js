import { mastersMetadata } from "./modules/masters.js";
import { operationsMetadata } from "./modules/operations.js";
import { inventoryMetadata } from "./modules/inventory.js";
import { accountingMetadata } from "./modules/accounting.js";
import { gstTaxMetadata } from "./modules/gstTax.js";
import { receivablesPayablesMetadata } from "./modules/receivablesPayables.js";
import { reportsMetadata } from "./modules/reports.js";
import { dashboardsMetadata } from "./modules/dashboards.js";
import { utilitiesMetadata } from "./modules/utilities.js";
import { helpTrainingMetadata } from "./modules/helpTraining.js";

const allEntries = [
  ...mastersMetadata,
  ...operationsMetadata,
  ...inventoryMetadata,
  ...accountingMetadata,
  ...gstTaxMetadata,
  ...receivablesPayablesMetadata,
  ...reportsMetadata,
  ...dashboardsMetadata,
  ...utilitiesMetadata,
  ...helpTrainingMetadata
];

const byId = new Map();
const byRouteKey = new Map();
const byModuleGroup = new Map();

for (const entry of allEntries) {
  byId.set(entry.id, entry);
  if (entry.routeKey) {
    byRouteKey.set(entry.routeKey, entry);
  }
  const group = entry.moduleGroup || "Other";
  if (!byModuleGroup.has(group)) {
    byModuleGroup.set(group, []);
  }
  byModuleGroup.get(group).push(entry);
}

function getKnowledgeEntry(id) {
  return byId.get(id) || null;
}

function getKnowledgeByRoute(routeKey) {
  return byRouteKey.get(routeKey) || null;
}

function getKnowledgeByModuleGroup(moduleGroup) {
  return byModuleGroup.get(moduleGroup) || [];
}

function getRelatedReports(id) {
  const entry = byId.get(id);
  if (!entry || !Array.isArray(entry.relatedReports)) return [];
  return entry.relatedReports
    .map((rid) => byId.get(rid))
    .filter(Boolean);
}

function getRelatedDashboards(id) {
  const entry = byId.get(id);
  if (!entry || !Array.isArray(entry.relatedDashboards)) return [];
  return entry.relatedDashboards
    .map((did) => byId.get(did))
    .filter(Boolean);
}

function getSourceTables(id) {
  const entry = byId.get(id);
  if (!entry || !Array.isArray(entry.sourceTables)) return [];
  return entry.sourceTables;
}

function getDependentModules(id) {
  const entry = byId.get(id);
  if (!entry || !Array.isArray(entry.relatedModules)) return [];
  return entry.relatedModules
    .map((mid) => byId.get(mid))
    .filter(Boolean);
}

function getCorrectionPolicy(id) {
  const entry = byId.get(id);
  return entry ? entry.correctionPolicy || null : null;
}

function getRiskLevel(id) {
  const entry = byId.get(id);
  return entry ? entry.riskLevel || null : null;
}

function searchKnowledge(query) {
  if (!query || typeof query !== "string") return [];
  const q = query.toLowerCase().trim();
  const results = [];
  for (const entry of allEntries) {
    const searchable = [
      entry.id,
      entry.title,
      entry.purpose,
      entry.moduleGroup,
      entry.screenType
    ].filter(Boolean).map((s) => s.toLowerCase());
    let score = 0;
    for (const field of searchable) {
      if (field.includes(q)) {
        score += field === q ? 20 : field.startsWith(q) ? 10 : 3;
      }
    }
    if (Array.isArray(entry.dataEnteredHere)) {
      for (const f of entry.dataEnteredHere) {
        if (f.toLowerCase().includes(q)) score += 2;
      }
    }
    if (Array.isArray(entry.helpTopics)) {
      for (const t of entry.helpTopics) {
        if (t.toLowerCase().includes(q)) score += 2;
      }
    }
    if (score > 0) {
      results.push({ entry, score });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.map((r) => r.entry);
}

function getAllEntries() {
  return allEntries;
}

function getModuleGroups() {
  return Array.from(byModuleGroup.keys());
}

function getEntryCount() {
  return allEntries.length;
}

export {
  getKnowledgeEntry,
  getKnowledgeByRoute,
  getKnowledgeByModuleGroup,
  getRelatedReports,
  getRelatedDashboards,
  getSourceTables,
  getDependentModules,
  getCorrectionPolicy,
  getRiskLevel,
  searchKnowledge,
  getAllEntries,
  getModuleGroups,
  getEntryCount
};
