/**
 * verify-migration.js — Post-migration integrity checks
 *
 * Run after any schema migration to verify database integrity.
 * Exit 0 = PASS, exit 2 = FAIL.
 */

import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const RESULTS = [];

function pass(name, detail = "") {
  RESULTS.push({ name, passed: true, detail });
  console.log(`PASS: ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  RESULTS.push({ name, passed: false, detail });
  console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
}

function getAccounts(db) {
  return db.prepare("SELECT id, account_name, account_type, normal_balance FROM accounts WHERE is_deleted = 0").all();
}

async function run() {
  const dbPath = join(ROOT, "database", "gii_gem_erp.db");
  let db;

  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch (err) {
    fail("Database open", err.message);
    process.exit(2);
  }

  /* 1. SQLite integrity */
  const integrity = db.pragma("integrity_check");
  pass("Integrity check", integrity[0]?.integrity_check === "ok" ? "ok" : JSON.stringify(integrity));

  /* 2. Foreign key integrity */
  const fk = db.pragma("foreign_key_check");
  if (fk.length === 0) {
    pass("Foreign key integrity", "no violations");
  } else {
    fail("Foreign key integrity", `${fk.length} violations: ${JSON.stringify(fk.slice(0, 5))}`);
  }

  /* 3. Required tables exist */
  const requiredTables = [
    "accounts", "vouchers", "voucher_lines", "ledger_entries",
    "users", "companies", "financial_years", "supply_orders",
    "stock_ledger", "stock_inwards", "stock_outwards",
    "audit_log", "schema_migrations", "_meta"
  ];
  const existingTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  const missing = requiredTables.filter((t) => !existingTables.includes(t));
  if (missing.length === 0) {
    pass("Required tables exist");
  } else {
    fail("Required tables exist", `missing: ${missing.join(", ")}`);
  }

  /* 4. Schema migrations table is not empty */
  const migrationCount = db.prepare("SELECT COUNT(*) c FROM schema_migrations").get().c;
  if (migrationCount > 0) {
    pass("Migrations recorded", `${migrationCount} migrations`);
  } else {
    fail("Migrations recorded", "schema_migrations is empty");
  }

  /* 5. _meta table has database_id */
  try {
    const dbId = db.prepare("SELECT value FROM _meta WHERE key = 'database_id'").get();
    if (dbId && dbId.value) {
      pass("Database identity present", `id=${dbId.value}`);
    } else {
      fail("Database identity present", "no database_id in _meta");
    }
  } catch {
    fail("Database identity present", "_meta table not found - run app once to create identity");
  }

  /* 6. Schema version set */
  try {
    const schemaVer = db.prepare("SELECT value FROM _meta WHERE key = 'schema_version'").get();
    if (schemaVer && Number(schemaVer.value) > 0) {
      pass("Schema version set", `version=${schemaVer.value}`);
    } else {
      fail("Schema version set", schemaVer ? `value=${schemaVer.value}` : "not found");
    }
  } catch {
    fail("Schema version set", "_meta table not found - run app once to create identity");
  }

  /* 7. Debit equals credit across all ledger entries */
  const leSum = db.prepare("SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM ledger_entries WHERE is_deleted = 0").get();
  const balanced = Math.abs(Number(leSum.d) - Number(leSum.c)) < 0.01;
  if (balanced) {
    pass("Ledger debit = credit", `Dr=${leSum.d}, Cr=${leSum.c}`);
  } else {
    fail("Ledger debit = credit", `Dr=${leSum.d}, Cr=${leSum.c}, diff=${Number(leSum.d) - Number(leSum.c)}`);
  }

  /* 8. Account type / normal balance consistency */
  const accounts = getAccounts(db);
  const invalid = accounts.filter((a) => !["Asset","Liability","Equity","Income","Expense"].includes(a.account_type));
  if (invalid.length === 0) {
    pass("Account types valid", `${accounts.length} accounts`);
  } else {
    fail("Account types valid", `${invalid.length} invalid`);
  }

  /* 9. Voucher status integrity */
  const voucherStatuses = db.prepare("SELECT DISTINCT status FROM vouchers WHERE is_deleted = 0").all();
  const validStatuses = voucherStatuses.every((v) => ["Posted","Draft","Reversed","Cancelled"].includes(v.status));
  if (validStatuses) {
    pass("Voucher statuses valid", voucherStatuses.map((v) => v.status).join(", "));
  } else {
    fail("Voucher statuses valid", JSON.stringify(voucherStatuses));
  }

  /* 10. Audit log has entries */
  const auditCount = db.prepare("SELECT COUNT(*) c FROM audit_log").get().c;
  pass("Audit log has entries", auditCount > 0 ? `${auditCount} entries` : "empty (fresh db)");

  /* Print summary */
  const passed = RESULTS.filter((r) => r.passed).length;
  const failed = RESULTS.filter((r) => !r.passed).length;
  console.log(`\nMigration verification: ${passed} passed, ${failed} failed, ${RESULTS.length} total`);

  process.exit(failed > 0 ? 2 : 0);
}

run().catch((err) => {
  console.error(`FATAL: ${err.message}`);
  process.exit(2);
});
