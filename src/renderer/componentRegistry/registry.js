import sharedComponents from "./ownership/shared.json" with { type: "json" };
import mastersComponents from "./ownership/masters.json" with { type: "json" };
import operationsComponents from "./ownership/operations.json" with { type: "json" };
import inventoryComponents from "./ownership/inventory.json" with { type: "json" };
import accountingComponents from "./ownership/accounting.json" with { type: "json" };
import gstComponents from "./ownership/gst.json" with { type: "json" };
import reportsComponents from "./ownership/reports.json" with { type: "json" };
import dashboardsComponents from "./ownership/dashboards.json" with { type: "json" };
import helpComponents from "./ownership/help.json" with { type: "json" };
import utilitiesComponents from "./ownership/utilities.json" with { type: "json" };
import deploymentComponents from "./ownership/deployment.json" with { type: "json" };

const _allComponents = [
  ...sharedComponents,
  ...mastersComponents,
  ...operationsComponents,
  ...inventoryComponents,
  ...accountingComponents,
  ...gstComponents,
  ...reportsComponents,
  ...dashboardsComponents,
  ...helpComponents,
  ...utilitiesComponents,
  ...deploymentComponents
];

const _idMap = new Map();
const _ownerMap = new Map();
const _layerMap = new Map();
const _consumerMap = new Map();

_allComponents.forEach((entry) => {
  if (entry.componentId) _idMap.set(entry.componentId, entry);
  if (entry.ownerModule) {
    if (!_ownerMap.has(entry.ownerModule)) _ownerMap.set(entry.ownerModule, []);
    _ownerMap.get(entry.ownerModule).push(entry);
  }
  if (entry.architectureLayer) {
    if (!_layerMap.has(entry.architectureLayer)) _layerMap.set(entry.architectureLayer, []);
    _layerMap.get(entry.architectureLayer).push(entry);
  }
  (entry.consumers || []).forEach((consumer) => {
    if (!_consumerMap.has(consumer)) _consumerMap.set(consumer, []);
    _consumerMap.get(consumer).push(entry);
  });
});

export function getAllComponents() {
  return _allComponents;
}

export function getComponent(componentId) {
  return _idMap.get(componentId) || null;
}

export function getOwner(componentId) {
  const entry = _idMap.get(componentId);
  return entry ? entry.ownerModule : null;
}

export function getOwnerComponents(ownerModule) {
  return _ownerMap.get(ownerModule) || [];
}

export function getConsumers(componentId) {
  const entry = _idMap.get(componentId);
  return entry ? (entry.consumers || []) : [];
}

export function getDependencies(componentId) {
  const entry = _idMap.get(componentId);
  return entry ? (entry.dependencies || []) : [];
}

export function getSharedComponents() {
  return _allComponents.filter((c) => c.sharedLevel === "Global Shared" || c.sharedLevel === "Cross Module");
}

export function getModuleComponents(ownerModule) {
  return getOwnerComponents(ownerModule);
}

export function getExtractableComponents() {
  return _allComponents.filter((c) => c.extractionStatus === "Inline" || c.extractionStatus === "Pending Review");
}

export function getDuplicateCandidates() {
  return _allComponents.filter((c) => c.duplicateRisk);
}

export function getArchitectureLayer(layer) {
  return _layerMap.get(layer) || [];
}

export function searchComponents(query) {
  const lower = String(query).toLowerCase();
  return _allComponents.filter((entry) =>
    String(entry.componentId).toLowerCase().includes(lower) ||
    String(entry.componentName).toLowerCase().includes(lower) ||
    String(entry.ownerModule).toLowerCase().includes(lower) ||
    String(entry.responsibility).toLowerCase().includes(lower) ||
    String(entry.currentLocation).toLowerCase().includes(lower)
  );
}

export function getConsumersOf(componentId) {
  return _consumerMap.get(componentId) || [];
}

export function getStatistics() {
  const byOwner = {};
  const byLayer = {};
  const byShared = {};
  const byExtraction = {};

  _allComponents.forEach((entry) => {
    const o = entry.ownerModule || "Unknown";
    byOwner[o] = (byOwner[o] || 0) + 1;
    const l = entry.architectureLayer || "Unknown";
    byLayer[l] = (byLayer[l] || 0) + 1;
    const s = entry.sharedLevel || "Unknown";
    byShared[s] = (byShared[s] || 0) + 1;
    const e = entry.extractionStatus || "Unknown";
    byExtraction[e] = (byExtraction[e] || 0) + 1;
  });

  return {
    totalComponents: _allComponents.length,
    byOwner,
    byLayer,
    byShared,
    byExtraction,
    uniqueOwners: Object.keys(byOwner).length,
    inlineCount: _allComponents.filter((c) => c.extractionStatus === "Inline").length,
    extractedCount: _allComponents.filter((c) => c.extractionStatus === "Extracted").length
  };
}

export function getComponentIds() {
  return _allComponents.map((c) => c.componentId).filter(Boolean);
}
