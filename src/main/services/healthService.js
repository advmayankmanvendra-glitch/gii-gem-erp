import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { bookIntegrityChecks } from "./errorConsoleService.js";

function nowIso() {
  return new Date().toISOString();
}

function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(value || {}));
  } catch {
    return {};
  }
}

function quoteIdentifier(name) {
  return `"${String(name || "").replace(/"/g, '""')}"`;
}

function safeAll(db, sql, params = []) {
  try {
    return { ok: true, rows: db.prepare(sql).all(params) };
  } catch (error) {
    return { ok: false, rows: [], error: error.message };
  }
}

function safeGet(db, sql, params = []) {
  try {
    return { ok: true, row: db.prepare(sql).get(params) || null };
  } catch (error) {
    return { ok: false, row: null, error: error.message };
  }
}

function safeStat(targetPath) {
  try {
    const stat = fs.statSync(targetPath);
    return {
      exists: true,
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString()
    };
  } catch (error) {
    return { exists: false, error: error.message };
  }
}

function isWritableFolder(folderPath) {
  try {
    fs.mkdirSync(folderPath, { recursive: true });
    fs.accessSync(folderPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function readTail(filePath, maxChars = 6000) {
  try {
    if (!fs.existsSync(filePath)) return "";
    const content = fs.readFileSync(filePath, "utf8");
    return content.slice(Math.max(0, content.length - maxChars));
  } catch (error) {
    return `Unable to read log: ${error.message}`;
  }
}

function getTableNames(db) {
  const result = safeAll(db, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
  return result.rows.map((row) => row.name);
}

function getTableColumns(db, tableName) {
  if (!/^[A-Za-z0-9_]+$/.test(String(tableName || ""))) return [];
  const result = safeAll(db, `PRAGMA table_info(${quoteIdentifier(tableName)})`);
  return result.rows.map((row) => row.name);
}

function hasTable(db, tableName) {
  return getTableNames(db).includes(tableName);
}

function hasColumns(db, tableName, columns) {
  const existing = new Set(getTableColumns(db, tableName));
  return columns.every((column) => existing.has(column));
}

function check(id, label, status, severity, details, recommendation = "", meta = {}) {
  return {
    id,
    label,
    status,
    severity,
    details,
    recommendation,
    meta
  };
}

function folderStatus(runtimeDataRoot, folderName) {
  const folderPath = path.join(runtimeDataRoot, folderName);
  return {
    key: folderName || "runtime",
    label: folderName ? folderName[0].toUpperCase() + folderName.slice(1) : "Runtime Root",
    path: folderPath,
    ...safeStat(folderPath),
    writable: isWritableFolder(folderPath)
  };
}

function databasePath(runtimeDataRoot, dbName) {
  return path.join(runtimeDataRoot, "database", dbName || "gii_gem_erp.db");
}

function resolveCompanyStatus(db, context = {}) {
  const companyId = Number(context.company_id || context.companyId || 0);
  if (context.company_scope === "all") {
    return { mode: "all", valid: true, name: "All Companies View" };
  }
  if (!companyId || !hasTable(db, "companies")) {
    return { mode: "single", valid: false, name: context.company_name || "", reason: "No selected company id or companies table missing." };
  }
  const company = safeGet(db, "SELECT id, company_name FROM companies WHERE id = ?", [companyId]);
  return {
    mode: "single",
    valid: Boolean(company.row),
    id: companyId,
    name: company.row?.company_name || context.company_name || "",
    reason: company.row ? "" : "Selected company was not found in Company Master."
  };
}

function accountingBalanceCheck(db) {
  if (!hasTable(db, "ledger_entries")) {
    return check(
      "accounting_balance",
      "Ledger Entry Balance",
      "fail",
      "critical",
      "ledger_entries table is missing.",
      "Restore a valid database backup or run the controlled database initialization."
    );
  }
  if (!hasColumns(db, "ledger_entries", ["debit", "credit"])) {
    return check(
      "accounting_balance",
      "Ledger Entry Balance",
      "fail",
      "critical",
      "ledger_entries table does not expose debit and credit columns.",
      "Review database schema compatibility before using accounting reports."
    );
  }
  const totals = safeGet(db, "SELECT COALESCE(SUM(debit), 0) AS debit, COALESCE(SUM(credit), 0) AS credit FROM ledger_entries");
  if (!totals.ok) {
    return check("accounting_balance", "Ledger Entry Balance", "fail", "critical", totals.error, "Run verify:accounting and review database errors.");
  }
  const debit = Number(totals.row?.debit || 0);
  const credit = Number(totals.row?.credit || 0);
  const difference = Number((debit - credit).toFixed(2));
  return check(
    "accounting_balance",
    "Ledger Entry Balance",
    Math.abs(difference) <= 0.01 ? "pass" : "fail",
    Math.abs(difference) <= 0.01 ? "normal" : "critical",
    `Debit ${debit.toFixed(2)}, credit ${credit.toFixed(2)}, difference ${difference.toFixed(2)}.`,
    Math.abs(difference) <= 0.01 ? "No action required." : "Do not post new vouchers until accounting verification is reviewed.",
    { debit, credit, difference }
  );
}

function tableCheck(db) {
  const required = ["companies", "vouchers", "voucher_lines", "ledger_entries", "audit_log"];
  const optional = ["documents", "items", "warehouses", "supply_orders", "invoices", "payments", "procurements"];
  const tables = getTableNames(db);
  const missingRequired = required.filter((table) => !tables.includes(table));
  const missingOptional = optional.filter((table) => !tables.includes(table));
  if (missingRequired.length) {
    return check(
      "schema_core_tables",
      "Core Schema Tables",
      "fail",
      "critical",
      `Missing required table(s): ${missingRequired.join(", ")}.`,
      "Restore from a valid backup or run controlled initialization before using the ERP.",
      { missingRequired, missingOptional, tableCount: tables.length }
    );
  }
  if (missingOptional.length) {
    return check(
      "schema_core_tables",
      "Core Schema Tables",
      "warn",
      "warning",
      `Required tables exist. Optional module table(s) not found: ${missingOptional.join(", ")}.`,
      "Only review the listed modules if their screens are expected to be active.",
      { missingRequired, missingOptional, tableCount: tables.length }
    );
  }
  return check("schema_core_tables", "Core Schema Tables", "pass", "normal", `Required and optional module tables are present. ${tables.length} table(s) detected.`, "No action required.", { tableCount: tables.length });
}

function cracHealthCheck(db) {
  if (!hasTable(db, "crac_records")) {
    return check("crac_status", "CRAC Records Status", "warn", "warning", "crac_records table does not exist. CRAC module may not be initialized.", "Run database initialization to create CRAC tables.");
  }
  const total = safeGet(db, "SELECT COUNT(*) AS count FROM crac_records WHERE is_deleted = 0");
  const pending = safeGet(db, "SELECT COUNT(*) AS count FROM crac_records WHERE is_deleted = 0 AND crac_status = 'Pending'");
  const generated = safeGet(db, "SELECT COUNT(*) AS count FROM crac_records WHERE is_deleted = 0 AND crac_status = 'Generated'");
  const pendingCount = Number(pending.row?.count || 0);
  const generatedCount = Number(generated.row?.count || 0);
  const totalCount = Number(total.row?.count || 0);
  const severity = pendingCount > 10 ? "warning" : "normal";
  return check("crac_status", "CRAC Records Status", totalCount > 0 ? "pass" : "warn", severity,
    `${totalCount} CRAC record(s): ${pendingCount} pending, ${generatedCount} generated.`,
    pendingCount > 10 ? "Review CRAC pending queue for bottlenecks." : "No action required.",
    { total: totalCount, pending: pendingCount, generated: generatedCount }
  );
}

function auditLogCheck(db) {
  if (!hasTable(db, "audit_log")) {
    return check("audit_log", "Audit Log", "fail", "critical", "audit_log table is missing.", "Restore a valid database backup.");
  }
  const count = safeGet(db, "SELECT COUNT(*) AS total FROM audit_log");
  if (!count.ok) {
    return check("audit_log", "Audit Log", "warn", "warning", count.error, "Review audit log table access.");
  }
  const total = Number(count.row?.total || 0);
  return check(
    "audit_log",
    "Audit Log",
    total > 0 ? "pass" : "warn",
    total > 0 ? "normal" : "warning",
    `${total} audit log row(s) found.`,
    total > 0 ? "No action required." : "Critical actions should be audit logged before production use.",
    { total }
  );
}

export function getHealthDiagnostics(db, runtimeDataRoot, context = {}) {
  const dbName = context.dbName || "gii_gem_erp.db";
  const runtimeRoot = runtimeDataRoot || app.getPath("userData");
  const folders = ["database", "backups", "documents", "exports", "logs"].map((folder) => folderStatus(runtimeRoot, folder));
  const dbPath = databasePath(runtimeRoot, dbName);
  const diagnostics = {
    generatedAt: nowIso(),
    app: {
      name: app.getName(),
      version: app.getVersion(),
      packaged: app.isPackaged,
      userData: app.getPath("userData")
    },
    runtime: {
      platform: process.platform,
      arch: process.arch,
      node: process.versions.node,
      electron: process.versions.electron,
      chrome: process.versions.chrome
    },
    context: safeJson(context),
    paths: {
      runtimeRoot,
      database: { path: dbPath, ...safeStat(dbPath) },
      folders
    },
    logs: {
      rendererTail: readTail(path.join(runtimeRoot, "logs", "electron-renderer.log")),
      bootErrorTail: readTail(path.join(runtimeRoot, "logs", "electron-boot-err.log")),
      mainTail: readTail(path.join(runtimeRoot, "logs", "electron-main.log"))
    },
    database: {
      connected: Boolean(db),
      tables: db ? getTableNames(db) : []
    }
  };
  return diagnostics;
}

export function runHealthChecks(db, runtimeDataRoot, context = {}) {
  const dbName = context.dbName || "gii_gem_erp.db";
  const runtimeRoot = runtimeDataRoot || app.getPath("userData");
  const checks = [];
  const ping = db ? safeGet(db, "SELECT 1 AS ok") : { ok: false, error: "Database handle is not available." };
  checks.push(check(
    "database_connectivity",
    "Database Connectivity",
    ping.ok ? "pass" : "fail",
    ping.ok ? "normal" : "critical",
    ping.ok ? "SQLite database responded to a read-only ping." : ping.error,
    ping.ok ? "No action required." : "Restart the desktop app. If it remains blocked, restore the latest verified backup."
  ));

  if (db) {
    checks.push(tableCheck(db));
    checks.push(accountingBalanceCheck(db));
    checks.push(auditLogCheck(db));
    checks.push(cracHealthCheck(db));
    try {
      bookIntegrityChecks(db, Number(context.company_id || 0) || null, { verifyAuditChain: context.verifyAuditChain })
        .forEach((item) => checks.push(check(`books_${item.id}`, item.label, item.status, item.status === "pass" ? "normal" : "critical", item.detail, item.action)));
    } catch (error) {
      checks.push(check("books_integrity", "Book Integrity", "warn", "warning", `Integrity checks could not run: ${error.message}`, "Run Health Checks again; if it repeats, export a support bundle."));
    }
    const company = resolveCompanyStatus(db, context);
    checks.push(check(
      "company_context",
      "Company Context",
      company.valid ? "pass" : "warn",
      company.valid ? "normal" : "warning",
      company.valid ? `Current context resolved as ${company.name || company.mode}.` : company.reason,
      company.valid ? "No action required." : "Select a valid current company before saving or posting transactions.",
      company
    ));
  }

  const dbPath = databasePath(runtimeRoot, dbName);
  checks.push(check(
    "runtime_database_path",
    "Runtime Database Path",
    fs.existsSync(dbPath) ? "pass" : "fail",
    fs.existsSync(dbPath) ? "normal" : "critical",
    fs.existsSync(dbPath) ? `Database file exists at ${dbPath}.` : `Database file was not found at ${dbPath}.`,
    fs.existsSync(dbPath) ? "No action required." : "Check runtime path configuration or restore a backup.",
    { path: dbPath }
  ));

  ["backups", "documents", "exports", "logs"].forEach((folder) => {
    const status = folderStatus(runtimeRoot, folder);
    checks.push(check(
      `folder_${folder}`,
      `${status.label} Folder`,
      status.exists && status.writable ? "pass" : "warn",
      status.exists && status.writable ? "normal" : "warning",
      status.exists ? `${status.path} is ${status.writable ? "writable" : "not writable"}.` : `${status.path} does not exist.`,
      status.exists && status.writable ? "No action required." : "Use Settings or the Health Center folder action to recreate or review permissions.",
      status
    ));
  });

  const summary = checks.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  return {
    generatedAt: nowIso(),
    summary,
    checks
  };
}
