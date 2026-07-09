export { createComponentEntry, SHARED_LEVELS, ARCHITECTURE_LAYERS, COMPONENT_TYPES, RESPONSIBILITY_TYPES, STABILITY_LEVELS, RISK_LEVELS, EXTRACTION_STATUS, BUSINESS_IMPACT } from "./schema.js";
export { validateComponent, validateRegistry, setComponentList, getComponentList, verifyUniqueOwnership } from "./validators.js";
export {
  getAllComponents,
  getComponent,
  getOwner,
  getOwnerComponents,
  getConsumers,
  getDependencies,
  getSharedComponents,
  getModuleComponents,
  getExtractableComponents,
  getDuplicateCandidates,
  getArchitectureLayer,
  searchComponents,
  getConsumersOf,
  getStatistics,
  getComponentIds
} from "./registry.js";
