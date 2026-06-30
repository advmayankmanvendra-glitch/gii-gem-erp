const SCREEN_TYPES = ["Master", "Transaction", "Register", "Report", "Dashboard", "Utility", "Help", "Migration", "Control"];

const RISK_LEVELS = ["Low", "Medium", "High", "Critical"];

const STATUS_VALUES = ["Active", "Partial", "Planned", "Deprecated"];

const REQUIRED_FIELDS = [
  "id",
  "title",
  "moduleGroup",
  "screenType",
  "purpose",
  "riskLevel",
  "status"
];

const METADATA_SCHEMA = {
  id: { type: "string", required: true, description: "Unique identifier (e.g., KNG-MST-001)" },
  title: { type: "string", required: true, description: "Display name" },
  moduleGroup: { type: "string", required: true, description: "Group this entry belongs to" },
  routeKey: { type: "string", required: false, description: "View/route key if applicable" },
  screenType: { type: "string", required: true, enum: SCREEN_TYPES, description: "Classification of the screen" },
  purpose: { type: "string", required: true, description: "What this module/screen does" },
  dataEnteredHere: { type: "array", required: false, description: "Fields/data entered on this screen" },
  dataComesFrom: { type: "array", required: false, description: "Sources that feed data into this screen" },
  feedsInto: { type: "array", required: false, description: "Modules/screens that consume data from this" },
  sourceTables: { type: "array", required: false, description: "Database tables read by this screen" },
  dependentTables: { type: "array", required: false, description: "Database tables written by this screen" },
  relatedModules: { type: "array", required: false, description: "Related module IDs" },
  relatedReports: { type: "array", required: false, description: "Related report IDs" },
  relatedDashboards: { type: "array", required: false, description: "Related dashboard IDs" },
  accountingImpact: { type: "string", required: false, description: "Description of accounting impact" },
  gstImpact: { type: "string", required: false, description: "Description of GST impact" },
  inventoryImpact: { type: "string", required: false, description: "Description of inventory impact" },
  profitabilityImpact: { type: "string", required: false, description: "Description of profitability impact" },
  correctionPolicy: { type: "string", required: false, description: "How corrections are handled" },
  editDeletePolicy: { type: "string", required: false, description: "Edit/delete restrictions" },
  riskLevel: { type: "string", required: true, enum: RISK_LEVELS, description: "Risk classification" },
  permissions: { type: "array", required: false, description: "Required permissions" },
  helpTopics: { type: "array", required: false, description: "Related help topics" },
  auditEvents: { type: "array", required: false, description: "Audit events logged for this screen" },
  verificationChecks: { type: "array", required: false, description: "Verification checks applicable" },
  status: { type: "string", required: true, enum: STATUS_VALUES, description: "Current status" }
};

const ID_PREFIXES = {
  masters: "KNG-MST",
  operations: "KNG-OPS",
  inventory: "KNG-INV",
  accounting: "KNG-ACC",
  gstTax: "KNG-GST",
  receivablesPayables: "KNG-REC",
  reports: "KNG-RPT",
  dashboards: "KNG-DSH",
  utilities: "KNG-UTL",
  helpTraining: "KNG-HLP"
};

function validateEntry(entry) {
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (entry[field] === undefined || entry[field] === null || entry[field] === "") {
      errors.push(`Missing required field: ${field}`);
    }
  }
  if (entry.screenType && !SCREEN_TYPES.includes(entry.screenType)) {
    errors.push(`Invalid screenType: ${entry.screenType}. Valid: ${SCREEN_TYPES.join(", ")}`);
  }
  if (entry.riskLevel && !RISK_LEVELS.includes(entry.riskLevel)) {
    errors.push(`Invalid riskLevel: ${entry.riskLevel}. Valid: ${RISK_LEVELS.join(", ")}`);
  }
  if (entry.status && !STATUS_VALUES.includes(entry.status)) {
    errors.push(`Invalid status: ${entry.status}. Valid: ${STATUS_VALUES.join(", ")}`);
  }
  if (entry.relatedModules && !Array.isArray(entry.relatedModules)) {
    errors.push("relatedModules must be an array");
  }
  if (entry.relatedReports && !Array.isArray(entry.relatedReports)) {
    errors.push("relatedReports must be an array");
  }
  if (entry.relatedDashboards && !Array.isArray(entry.relatedDashboards)) {
    errors.push("relatedDashboards must be an array");
  }
  return errors;
}

export {
  SCREEN_TYPES,
  RISK_LEVELS,
  STATUS_VALUES,
  REQUIRED_FIELDS,
  METADATA_SCHEMA,
  ID_PREFIXES,
  validateEntry
};
