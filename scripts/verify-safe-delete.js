import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeDatabase } from "../src/main/database/init.js";
import { assertBulkDeleteSafe, getBulkChildReferences } from "../src/main/services/safeDeleteService.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
let passed = 0;
let failed = 0;

/** Records a passing verification line. */
function pass(message) {
  passed += 1;
  console.log(`  PASS: ${message}`);
}

/** Records a failing verification line. */
function fail(message) {
  failed += 1;
  console.log(`  FAIL: ${message}`);
}

/** Extracts an exported or local function body from source text for targeted checks. */
function extractFunctionBody(content, functionName) {
  const exportStart = content.indexOf(`export function ${functionName}`);
  const localStart = content.indexOf(`function ${functionName}`);
  const start = exportStart >= 0 ? exportStart : localStart;
  if (start < 0) return "";
  const nextExport = content.indexOf("\nexport function ", start + 1);
  const nextLocal = content.indexOf("\nfunction ", start + 1);
  const nextCandidates = [nextExport, nextLocal].filter((idx) => idx > start);
  const next = nextCandidates.length ? Math.min(...nextCandidates) : content.length;
  return content.slice(start, next);
}

console.log("=== Safe Delete Service Verification ===\n");

const serviceContent = readFileSync(join(projectRoot, "src", "main", "services", "safeDeleteService.js"), "utf8");
if (serviceContent.includes("export function assertBulkDeleteSafe")) pass("assertBulkDeleteSafe is exported");
else fail("assertBulkDeleteSafe export missing");

if (serviceContent.includes("pragma_foreign_key_list")) pass("Safe delete service uses SQLite FK metadata");
else fail("Safe delete service does not inspect FK metadata");

if (!serviceContent.includes("COALESCE(is_deleted")) pass("Safe delete FK guard counts soft-deleted child rows that still block hard deletes");
else fail("Safe delete FK guard filters soft-deleted child rows before hard delete");

if (serviceContent.includes("quoteIdentifier")) pass("Safe delete dynamic SQL identifiers are validated and quoted");
else fail("Safe delete dynamic SQL identifiers are not centrally validated");

const initContent = readFileSync(join(projectRoot, "src", "main", "database", "init.js"), "utf8");
const importValidationContent = readFileSync(join(projectRoot, "src", "main", "services", "importValidationService.js"), "utf8");
const crudContent = readFileSync(join(projectRoot, "src", "main", "database", "crudHelpers.js"), "utf8");
const mainContent = readFileSync(join(projectRoot, "src", "main", "main.js"), "utf8");
const deleteBatchBody = extractFunctionBody(importValidationContent, "deleteItemImportBatch");
const deleteUnusedBody = extractFunctionBody(importValidationContent, "deleteUnusedImportedItems");

if (deleteBatchBody.includes('assertBulkDeleteSafe(db, "items", ids)')) pass("deleteItemImportBatch uses bulk safe-delete guard");
else fail("deleteItemImportBatch missing bulk safe-delete guard");

if (deleteUnusedBody.includes('assertBulkDeleteSafe(db, "items", deleteIds)')) pass("deleteUnusedImportedItems uses final bulk safe-delete guard");
else fail("deleteUnusedImportedItems missing final bulk safe-delete guard");

const expectedManualChecks = [
  "order_items",
  "procurement_items",
  "invoice_items",
  "stock_inwards",
  "stock_outwards",
  "stock_adjustments",
  "stock_returns",
  "stock_ledger",
  "serial_numbers",
  "batches",
  "inventory_movements",
  "stock_reservations",
  "goods_receipt_items",
  "delivery_challan_items",
  "warehouse_transfers",
];

for (const table of expectedManualChecks) {
  if (deleteUnusedBody.includes(table)) pass(`Manual imported-item protection includes ${table}`);
  else fail(`Manual imported-item protection missing ${table}`);
}

const masterDeactivateIndex = crudContent.indexOf("MASTER_TABLES[table] && masterRecordIsReferenced");
const ownedDeleteGuardIndex = crudContent.indexOf("assertDeleteSafe(db, table, id)", masterDeactivateIndex);
const softDeleteIndex = crudContent.indexOf('columnExists(db, table, "is_deleted")', masterDeactivateIndex);
if (masterDeactivateIndex >= 0 && ownedDeleteGuardIndex > masterDeactivateIndex && ownedDeleteGuardIndex < softDeleteIndex) {
  pass("CRUD ownership boundary guards every destructive delete after linked-master deactivation");
} else {
  fail("CRUD ownership boundary does not guard destructive deletes after linked-master deactivation");
}

if (!mainContent.includes("if (!MASTER_TABLES[table])")) pass("Generic records delete IPC has no master-table guard bypass");
else fail("Generic records delete IPC still bypasses the guard for master tables");

if (initContent.includes("assertDeleteSafe,") && crudContent.includes("assertDeleteSafe,")) {
  pass("Safe-delete guard is injected into the CRUD ownership boundary");
} else {
  fail("Safe-delete guard is not injected into the CRUD ownership boundary");
}

const db = initializeDatabase();
try {
  const refs = getBulkChildReferences(db, "items", [999999, 999998]);
  if (Array.isArray(refs) && refs.length === 0) pass("Bulk FK lookup handles non-existent item IDs");
  else fail("Bulk FK lookup returned references for non-existent item IDs");

  try {
    assertBulkDeleteSafe(db, "items", []);
    pass("Empty bulk delete guard is safe");
  } catch (error) {
    fail(`Empty bulk delete guard threw: ${error.message}`);
  }
} finally {
  db.close();
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
