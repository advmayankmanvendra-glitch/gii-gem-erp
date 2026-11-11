export const SHARED_LEVELS = [
  "Global Shared",
  "Cross Module",
  "Module Shared",
  "Screen Local",
  "Internal Helper",
  "Deprecated"
];

export const ARCHITECTURE_LAYERS = [
  "Presentation",
  "Shared UI",
  "Business Logic",
  "Accounting",
  "Inventory",
  "GST",
  "Reporting",
  "Dashboard",
  "Knowledge",
  "Brain",
  "Deployment",
  "Utility"
];

export const COMPONENT_TYPES = [
  "Component",
  "Hook",
  "Utility",
  "Service",
  "Config",
  "Screen",
  "Template",
  "Helper"
];

export const RESPONSIBILITY_TYPES = [
  "Presentation",
  "Form Input",
  "Validation",
  "Navigation",
  "Accounting",
  "Inventory",
  "GST",
  "Reporting",
  "Dashboard",
  "Help",
  "Utility",
  "Deployment",
  "Knowledge",
  "Brain",
  "Print"
];

export const STABILITY_LEVELS = [
  "Stable",
  "Mature",
  "Experimental",
  "Deprecated",
  "Legacy"
];

export const RISK_LEVELS = [
  "Low",
  "Medium",
  "High",
  "Critical"
];

export const EXTRACTION_STATUS = [
  "Inline",
  "Extracted",
  "Pending Review",
  "Not Extractable"
];

export const BUSINESS_IMPACT = [
  "None",
  "Low",
  "Medium",
  "High",
  "Critical"
];

export function createComponentEntry(overrides = {}) {
  const defaults = {
    componentId: "",
    componentName: "",
    ownerModule: "",
    ownerFeature: "",
    currentLocation: "",
    componentType: "Component",
    responsibility: "",
    consumers: [],
    dependencies: [],
    sharedLevel: "Screen Local",
    extractionStatus: "Inline",
    stability: "Stable",
    architectureLayer: "Shared UI",
    businessImpact: "None",
    accountingImpact: false,
    inventoryImpact: false,
    gstImpact: false,
    navigationImpact: false,
    reportImpact: false,
    dashboardImpact: false,
    helpImpact: false,
    riskLevel: "Low",
    duplicateRisk: false,
    migrationHistory: [],
    replacementPolicy: "",
    deprecationStatus: "Active",
    verificationStatus: "Unverified"
  };
  return { ...defaults, ...overrides };
}
