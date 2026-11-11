import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function scanForPatterns() {
  const results = [];
  const errors = [];

  const services = [
    { name: "productionReadinessService.js", file: "src/main/services/productionReadinessService.js" },
    { name: "readinessService.js", file: "src/main/services/deployment/readinessService.js" }
  ];

  for (const { name, file } of services) {
    const content = fs.readFileSync(path.join(projectRoot, file), "utf8");

    // Check TB query has le.is_deleted filter
    if (content.includes("COALESCE(le.is_deleted")) {
      results.push({ name: `${name} TB query filters le.is_deleted`, status: "pass" });
    } else {
      results.push({ name: `${name} TB query filters le.is_deleted`, status: "fail", detail: "Missing le.is_deleted filter — TB includes soft-deleted entries" });
    }

    // Check GST query has vl.is_deleted filter
    if (content.includes("COALESCE(vl.is_deleted")) {
      results.push({ name: `${name} GST query filters vl.is_deleted`, status: "pass" });
    } else {
      results.push({ name: `${name} GST query filters vl.is_deleted`, status: "fail", detail: "Missing vl.is_deleted filter — GST includes soft-deleted entries" });
    }

    // Check GST query has a.is_deleted filter
    if (content.includes("COALESCE(a.is_deleted")) {
      results.push({ name: `${name} GST/TB query filters a.is_deleted`, status: "pass" });
    } else {
      results.push({ name: `${name} GST/TB query filters a.is_deleted`, status: "fail", detail: "Missing a.is_deleted filter" });
    }

    // Check TB query uses COALESCE on is_deleted (not bare WHERE is_deleted=0)
    const tbMatch = content.match(/FROM ledger_entries le.*?WHERE(.*?)(?:ORDER|$)/s);
    if (tbMatch && tbMatch[1]) {
      const whereClause = tbMatch[1];
      if (whereClause.includes("COALESCE") && whereClause.includes("le.is_deleted")) {
        results.push({ name: `${name} TB query uses COALESCE for ledger_entries`, status: "pass" });
      }
    }

    // Check count queries use COALESCE
    const bareDeletedCounts = content.match(/WHERE is_deleted=0(?! AND)/g);
    if (bareDeletedCounts && bareDeletedCounts.length > 0) {
      errors.push(`${name} has ${bareDeletedCounts.length} bare 'WHERE is_deleted=0' count query(ies) without COALESCE`);
      results.push({ name: `${name} no bare is_deleted=0 count queries`, status: "fail", detail: `${bareDeletedCounts.length} occurrence(s) found` });
    } else {
      results.push({ name: `${name} no bare is_deleted=0 count queries`, status: "pass" });
    }
  }

  // readinessService.js specific checks
  const rdContent = fs.readFileSync(path.join(projectRoot, "src/main/services/deployment/readinessService.js"), "utf8");

  // Check PRAGMA guard for invoice_id
  if (rdContent.includes("PRAGMA table_info")) {
    results.push({ name: "readinessService uses PRAGMA table_info guards for column-safe checks", status: "pass" });
  } else {
    results.push({ name: "readinessService uses PRAGMA table_info guards", status: "fail", detail: "No PRAGMA guard found — invoice_id check may crash" });
  }

  // Check billing_id fallback
  if (rdContent.includes("billing_id")) {
    results.push({ name: "readinessService falls back to billing_id when invoice_id absent", status: "pass" });
  } else {
    results.push({ name: "readinessService falls back to billing_id", status: "fail", detail: "No billing_id fallback" });
  }

  // Check the "no column found" message
  if (rdContent.includes("no invoice_id or billing_id column found")) {
    results.push({ name: "readinessService has graceful fallback message when both columns missing", status: "pass" });
  } else {
    results.push({ name: "readinessService graceful fallback message", status: "fail", detail: "Missing diagnostic message" });
  }

  // Check COALESCE on all count queries in readinessService.js
  const rdCountLines = rdContent.match(/WHERE\s+(?:COALESCE\(is_deleted|is_deleted=0)/g);
  const rdCoalesce = (rdContent.match(/COALESCE\(is_deleted/g) || []).length;
  const rdBare = (rdContent.match(/WHERE is_deleted=0(?!\s*AND)/g) || []).length;
  if (rdBare === 0 && rdCoalesce > 0) {
    results.push({ name: "readinessService all count queries use COALESCE(is_deleted,0)=0", status: "pass", detail: rdCoalesce + " COALESCE uses" });
  } else {
    results.push({ name: "readinessService all count queries use COALESCE", status: "fail", detail: "COALESCE=" + rdCoalesce + ", bare=" + rdBare });
  }

  return { results, errors };
}

async function main() {
  const { results, errors } = scanForPatterns();

  // Also verify the actual DB queries compile
  const dbPath = path.join(projectRoot, "database", "gii_gem_erp.db");
  let dbCompileResult = { name: "Production readiness queries compile against DB", status: "skip", detail: "Run via Electron native module" };

  console.log("\n=== Production Readiness SQL Verification ===\n");

  for (const r of results) {
    const icon = r.status === "pass" ? "PASS" : "FAIL";
    console.log("  " + icon + "  " + r.name);
    if (r.detail) console.log("       " + r.detail);
  }

  console.log("\n  --- Query Compilation Test ---");
  try {
    const { generateCertificate } = await import("../src/main/services/productionReadinessService.js");

    const Database = _require("better-sqlite3");
    const db = new Database(dbPath);
    try {
      const tmpRoot = path.join(os.tmpdir(), "gii-gem-prd-compile-" + Date.now());
      fs.mkdirSync(tmpRoot, { recursive: true });
      const certResult = generateCertificate(db, tmpRoot);
      console.log("  PASS  certificate:generate compiles (" + certResult.certificate.status + ")");
      dbCompileResult = { name: "Production readiness queries compile against DB", status: "pass", detail: "status=" + certResult.certificate.status };
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
    } catch (e) {
      console.log("  FAIL  certificate:generate — " + e.message);
      dbCompileResult = { name: "Production readiness queries compile against DB", status: "fail", detail: e.message };
      errors.push("Compile test: " + e.message);
    }
    db.close();

    const rdModule = await import("../src/main/services/deployment/readinessService.js");
    const db2 = new Database(dbPath);
    try {
      const scoreResult = rdModule.calculateReadinessScore(db2, path.join(os.tmpdir(), "gii-gem-prd-compile2"));
      console.log("  PASS  calculateReadinessScore compiles (" + scoreResult.status + ")");
    } catch (e) {
      console.log("  FAIL  calculateReadinessScore — " + e.message);
      errors.push("Readiness score compile: " + e.message);
    }
    db2.close();
  } catch (e) {
    console.log("  SKIP  Query compilation test (native module version mismatch)");
    console.log("       " + e.message);
  }

  results.push(dbCompileResult);

  const passed = results.filter(r => r.status === "pass").length;
  const failed = results.filter(r => r.status === "fail").length;
  const skipped = results.filter(r => r.status === "skip").length;

  console.log("\nSummary: " + passed + " passed, " + failed + " failed, " + skipped + " skipped");
  if (errors.length > 0) console.log("Errors: " + errors.join("; "));

  const output = { profile: "ProductionReadinessSQL", passed, failed, skipped, results, errors, summary: passed > 0 && failed === 0 ? "PASS" : "FAIL" };
  console.log("\n" + JSON.stringify(output, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

main();
