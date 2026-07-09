import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
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

console.log("=== FK Constraint Safe Delete Verification ===\n");

const db = initializeDatabase();
try {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name")
    .all()
    .map((row) => row.name);
  const itemReferenceTables = [];

  for (const table of tables) {
    const refs = db
      .prepare('SELECT p."table" AS parent_table, p."from" AS child_column FROM pragma_foreign_key_list(?) p')
      .all(table);
    for (const ref of refs) {
      if (ref.parent_table === "items") itemReferenceTables.push(`${table}.${ref.child_column}`);
    }
  }

  if (itemReferenceTables.length > 0) pass(`Detected ${itemReferenceTables.length} item FK relationship(s)`);
  else fail("No item FK relationships detected");

  const initContent = readFileSync(join(projectRoot, "src", "main", "database", "init.js"), "utf8");
  const deleteBatchBody = extractFunctionBody(initContent, "deleteItemImportBatch");
  const deleteUnusedBody = extractFunctionBody(initContent, "deleteUnusedImportedItems");

  if (deleteBatchBody.includes('assertBulkDeleteSafe(db, "items", ids)')) pass("deleteItemImportBatch guards batch item deletes");
  else fail("deleteItemImportBatch missing bulk FK guard");

  if (deleteUnusedBody.includes('assertBulkDeleteSafe(db, "items", deleteIds)')) pass("deleteUnusedImportedItems guards computed delete IDs");
  else fail("deleteUnusedImportedItems missing final bulk FK guard");

  const noRefs = getBulkChildReferences(db, "items", [999999, 999998]);
  if (Array.isArray(noRefs) && noRefs.length === 0) pass("Bulk FK lookup handles non-existent item IDs");
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
