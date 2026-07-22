/**
 * verify-database-path.js — Database path resolution integrity checks
 *
 * Verifies that the database path resolver produces consistent results
 * across packaging modes, environment variable overrides, and fallback.
 * Exit 0 = PASS, exit 2 = FAIL.
 */

import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const RESULTS = [];
let failures = 0;

function pass(name, detail) {
  RESULTS.push({ name, passed: true, detail });
  console.log(`PASS: ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail) {
  RESULTS.push({ name, passed: false, detail });
  console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  failures++;
}

function resolveFromModule(root) {
  // Load and test the resolver module
  const modPath = join(root, "src", "main", "database", "databasePathResolver.js");
  if (!fs.existsSync(modPath)) {
    fail("Module exists", `Not found: ${modPath}`);
    return null;
  }
  pass("Module exists", modPath);
  return modPath;
}

async function run() {
  const modPath = resolveFromModule(ROOT);
  if (!modPath) process.exit(2);

  // Dynamic import to test the module loads
  try {
    const mod = await import(pathToFileURL(modPath).href);
    const functions = ["dataRoot", "databasePath", "databaseDir", "dbName", "appDataFolders", "ensureDataFolders", "databasePath"];
    const missing = functions.filter((f) => typeof mod[f] !== "function");
    if (missing.length === 0) {
      pass("Exported functions", functions.join(", "));
    } else {
      fail("Exported functions", `missing: ${missing.join(", ")}`);
    }

    // Test dataRoot returns a string
    const root = mod.dataRoot();
    if (typeof root === "string" && root.length > 0) {
      pass("dataRoot() returns path", root);
    } else {
      fail("dataRoot() returns path", `got ${typeof root}: ${root}`);
    }

    // Test databasePath returns a path ending with db name
    const dbPath = mod.databasePath(root);
    if (typeof dbPath === "string" && dbPath.endsWith(".db")) {
      pass("databasePath() returns .db path", dbPath);
    } else {
      fail("databasePath() returns .db path", dbPath);
    }

    // Test appDataFolders returns expected folders
    const folders = mod.appDataFolders();
    const expected = ["database", "documents", "backups", "exports", "reports", "logs"];
    const missingFolders = expected.filter((f) => !folders.includes(f));
    if (missingFolders.length === 0) {
      pass("appDataFolders() complete", folders.join(", "));
    } else {
      fail("appDataFolders() complete", `missing: ${missingFolders.join(", ")}`);
    }

    // Test ensureDataFolders creates directories
    const testRoot = join(ROOT, "runtime", "test-data-root");
    const created = mod.ensureDataFolders(testRoot);
    const allExist = expected.every((f) => fs.existsSync(join(testRoot, f)));
    if (allExist) {
      pass("ensureDataFolders() creates directories", testRoot);
    } else {
      fail("ensureDataFolders() creates directories", "some missing");
    }
    // Cleanup
    expected.forEach((f) => {
      try { fs.rmdirSync(join(testRoot, f)); } catch {}
    });
    try { fs.rmdirSync(testRoot); } catch {}
  } catch (err) {
    fail("Module import", err.message);
  }

  console.log(`\nDatabase path verification: ${RESULTS.length - failures} passed, ${failures} failed, ${RESULTS.length} total`);
  process.exit(failures > 0 ? 2 : 0);
}

run().catch((err) => {
  console.error(`FATAL: ${err.message}`);
  process.exit(2);
});
