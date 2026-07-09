import { SHARED_LEVELS, ARCHITECTURE_LAYERS, COMPONENT_TYPES, RESPONSIBILITY_TYPES, STABILITY_LEVELS, RISK_LEVELS, EXTRACTION_STATUS, BUSINESS_IMPACT } from "./schema.js";

let _allComponents = null;

export function setComponentList(components) {
  _allComponents = components;
}

export function getComponentList() {
  return _allComponents || [];
}

export function validateComponent(entry, index) {
  const errors = [];
  if (!entry.componentId) errors.push(`[${index}] Missing componentId`);
  if (!entry.componentName) errors.push(`[${index}] Missing componentName`);
  if (!entry.ownerModule) errors.push(`[${index}] Missing ownerModule`);
  if (!entry.currentLocation) errors.push(`[${index}] Missing currentLocation`);
  if (entry.sharedLevel && !SHARED_LEVELS.includes(entry.sharedLevel)) {
    errors.push(`[${index}] Invalid sharedLevel "${entry.sharedLevel}" for ${entry.componentId}`);
  }
  if (entry.architectureLayer && !ARCHITECTURE_LAYERS.includes(entry.architectureLayer)) {
    errors.push(`[${index}] Invalid architectureLayer "${entry.architectureLayer}" for ${entry.componentId}`);
  }
  if (entry.componentType && !COMPONENT_TYPES.includes(entry.componentType)) {
    errors.push(`[${index}] Invalid componentType "${entry.componentType}" for ${entry.componentId}`);
  }
  if (entry.responsibility && !RESPONSIBILITY_TYPES.includes(entry.responsibility)) {
    errors.push(`[${index}] Invalid responsibility "${entry.responsibility}" for ${entry.componentId}`);
  }
  if (entry.stability && !STABILITY_LEVELS.includes(entry.stability)) {
    errors.push(`[${index}] Invalid stability "${entry.stability}" for ${entry.componentId}`);
  }
  if (entry.riskLevel && !RISK_LEVELS.includes(entry.riskLevel)) {
    errors.push(`[${index}] Invalid riskLevel "${entry.riskLevel}" for ${entry.componentId}`);
  }
  if (entry.extractionStatus && !EXTRACTION_STATUS.includes(entry.extractionStatus)) {
    errors.push(`[${index}] Invalid extractionStatus "${entry.extractionStatus}" for ${entry.componentId}`);
  }
  if (entry.businessImpact && !BUSINESS_IMPACT.includes(entry.businessImpact)) {
    errors.push(`[${index}] Invalid businessImpact "${entry.businessImpact}" for ${entry.componentId}`);
  }
  return errors;
}

export function validateRegistry(components) {
  const allErrors = [];
  const ids = new Set();
  const owners = new Set();

  components.forEach((entry, index) => {
    const errors = validateComponent(entry, index);
    allErrors.push(...errors);

    if (entry.componentId) {
      if (ids.has(entry.componentId)) {
        allErrors.push(`Duplicate componentId: ${entry.componentId}`);
      }
      ids.add(entry.componentId);
    }

    if (entry.ownerModule) {
      owners.add(entry.ownerModule);
    }
  });

  const idsArr = [...ids];
  const orphanConsumers = [];
  components.forEach((entry) => {
    (entry.consumers || []).forEach((consumer) => {
      if (consumer && !idsArr.includes(consumer) && !consumer.startsWith("App.jsx:")) {
        orphanConsumers.push(`${entry.componentId} references unknown consumer: ${consumer}`);
      }
    });
  });
  allErrors.push(...orphanConsumers);

  const sharedComponents = components.filter((c) => c.sharedLevel === "Global Shared" || c.sharedLevel === "Cross Module");
  sharedComponents.forEach((sc) => {
    if (!sc.consumers || sc.consumers.length === 0) {
      allErrors.push(`Global/Cross-Module component ${sc.componentId} has no consumers declared`);
    }
  });

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    totalComponents: components.length,
    uniqueIds: ids.size,
    uniqueOwners: owners.size
  };
}

export function verifyUniqueOwnership(components) {
  const ownerMap = {};
  components.forEach((entry) => {
    if (!entry.ownerModule) return;
    if (!ownerMap[entry.ownerModule]) ownerMap[entry.ownerModule] = [];
    ownerMap[entry.ownerModule].push(entry.componentId);
  });
  return ownerMap;
}
