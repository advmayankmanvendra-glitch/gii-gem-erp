import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const VALID_SCREEN_TYPES = ["Master", "Transaction", "Register", "Report", "Dashboard", "Utility", "Help", "Migration", "Control"];
const VALID_RISK_LEVELS = ["Low", "Medium", "High", "Critical"];
const VALID_STATUS = ["Active", "Partial", "Planned", "Deprecated"];
const REQUIRED_FIELDS = ["id", "title", "moduleGroup", "screenType", "purpose", "riskLevel", "status"];
const ARRAY_FIELDS = ["relatedModules", "relatedReports", "relatedDashboards"];
const IMPACT_FIELDS = ["accountingImpact", "gstImpact", "inventoryImpact", "profitabilityImpact"];

const MODULE_FILES = [
  "masters.js",
  "operations.js",
  "inventory.js",
  "accounting.js",
  "gstTax.js",
  "receivablesPayables.js",
  "reports.js",
  "dashboards.js",
  "utilities.js",
  "helpTraining.js"
];

const EXPORT_MAP = {
  "masters.js": "mastersMetadata",
  "operations.js": "operationsMetadata",
  "inventory.js": "inventoryMetadata",
  "accounting.js": "accountingMetadata",
  "gstTax.js": "gstTaxMetadata",
  "receivablesPayables.js": "receivablesPayablesMetadata",
  "reports.js": "reportsMetadata",
  "dashboards.js": "dashboardsMetadata",
  "utilities.js": "utilitiesMetadata",
  "helpTraining.js": "helpTrainingMetadata"
};

const MODULES_DIR = resolve(__dirname, "..", "src", "renderer", "knowledge", "modules");

async function main() {
  let totalErrors = 0;
  let totalWarnings = 0;
  let allEntries = [];
  const seenIds = new Map();
  const seenRouteKeys = new Map();
  const fileResults = [];

  console.log("KG-1 Knowledge Repository Validation");
  console.log("====================================\n");

  for (const file of MODULE_FILES) {
    const filePath = resolve(MODULES_DIR, file);
    let module;
    try {
      module = await import(pathToFileURL(filePath).href);
    } catch (e) {
      console.error(`  FAILED to load ${file}: ${e.message}`);
      totalErrors++;
      continue;
    }

    const exportName = EXPORT_MAP[file];
    const entries = module[exportName];
    if (!Array.isArray(entries)) {
      console.error(`  FAILED: ${file} does not export an array named ${exportName}`);
      totalErrors++;
      continue;
    }

    console.log(`\n[${file}] ${entries.length} entries`);

    let fileErrors = 0;
    let fileWarnings = 0;

    for (const entry of entries) {
      const errors = validateEntry(entry, seenIds, seenRouteKeys);
      if (errors.length > 0) {
        console.log(`  ${entry.id || "(no id)"}:`);
        for (const err of errors) {
          console.log(`    ERROR: ${err}`);
          totalErrors++;
          fileErrors++;
        }
      }
      allEntries.push(entry);
    }

    fileResults.push({ file, entries: entries.length, errors: fileErrors, warnings: fileWarnings });
    totalWarnings += fileWarnings;
  }

  console.log("\n====================================");
  console.log(`Summary: ${allEntries.length} entries, ${totalErrors} errors, ${totalWarnings} warnings`);

  for (const r of fileResults) {
    const status = r.errors > 0 ? "FAILED" : "PASSED";
    console.log(`  ${r.file}: ${r.entries} entries, ${r.errors} errors - ${status}`);
  }

  console.log("\n====================================");

  if (totalErrors > 0) {
    console.log("\nKnowledge validation FAILED.");
    process.exit(1);
  } else {
    console.log("\nKnowledge validation PASSED.");
    process.exit(0);
  }
}

function validateEntry(entry, seenIds, seenRouteKeys) {
  const errors = [];

  for (const field of REQUIRED_FIELDS) {
    const val = entry[field];
    if (val === undefined || val === null || val === "") {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (entry.id) {
    if (seenIds.has(entry.id)) {
      errors.push(`Duplicate ID: ${entry.id} (also in ${seenIds.get(entry.id)})`);
    } else {
      seenIds.set(entry.id, entry.title || "(no title)");
    }
  }

  if (entry.routeKey) {
    if (seenRouteKeys.has(entry.routeKey)) {
      errors.push(`Duplicate routeKey: ${entry.routeKey}`);
    } else {
      seenRouteKeys.set(entry.routeKey, entry.id);
    }
  }

  if (entry.screenType && !VALID_SCREEN_TYPES.includes(entry.screenType)) {
    errors.push(`Invalid screenType: "${entry.screenType}". Valid: ${VALID_SCREEN_TYPES.join(", ")}`);
  }

  if (entry.riskLevel && !VALID_RISK_LEVELS.includes(entry.riskLevel)) {
    errors.push(`Invalid riskLevel: "${entry.riskLevel}". Valid: ${VALID_RISK_LEVELS.join(", ")}`);
  }

  if (entry.status && !VALID_STATUS.includes(entry.status)) {
    errors.push(`Invalid status: "${entry.status}". Valid: ${VALID_STATUS.join(", ")}`);
  }

  for (const field of ARRAY_FIELDS) {
    const val = entry[field];
    if (val !== undefined && val !== null && !Array.isArray(val)) {
      errors.push(`${field} must be an array`);
    }
  }

  for (const field of IMPACT_FIELDS) {
    if (entry[field] === undefined || entry[field] === null) {
      errors.push(`Missing impact field: ${field}`);
    }
  }

  if (entry.dataEnteredHere !== undefined && entry.dataEnteredHere !== null && !Array.isArray(entry.dataEnteredHere)) {
    errors.push(`dataEnteredHere must be an array`);
  }

  if (entry.dataComesFrom !== undefined && entry.dataComesFrom !== null && !Array.isArray(entry.dataComesFrom)) {
    errors.push(`dataComesFrom must be an array`);
  }

  if (entry.feedsInto !== undefined && entry.feedsInto !== null && !Array.isArray(entry.feedsInto)) {
    errors.push(`feedsInto must be an array`);
  }

  if (entry.sourceTables !== undefined && entry.sourceTables !== null && !Array.isArray(entry.sourceTables)) {
    errors.push(`sourceTables must be an array`);
  }

  if (entry.dependentTables !== undefined && entry.dependentTables !== null && !Array.isArray(entry.dependentTables)) {
    errors.push(`dependentTables must be an array`);
  }

  if (entry.permissions !== undefined && entry.permissions !== null && !Array.isArray(entry.permissions)) {
    errors.push(`permissions must be an array`);
  }

  if (entry.helpTopics !== undefined && entry.helpTopics !== null && !Array.isArray(entry.helpTopics)) {
    errors.push(`helpTopics must be an array`);
  }

  if (entry.auditEvents !== undefined && entry.auditEvents !== null && !Array.isArray(entry.auditEvents)) {
    errors.push(`auditEvents must be an array`);
  }

  if (entry.verificationChecks !== undefined && entry.verificationChecks !== null && !Array.isArray(entry.verificationChecks)) {
    errors.push(`verificationChecks must be an array`);
  }

  return errors;
}

main();
