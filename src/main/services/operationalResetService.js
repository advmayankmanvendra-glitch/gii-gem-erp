import fs from "node:fs";
import path from "node:path";
import { createBackup, restoreBackup, listBackups } from "./backup.js";
import * as init from "../database/init.js";

const PRESERVED_TABLES = new Set([
  "companies", "users", "accounts", "financial_years",
  "government_departments", "suppliers", "items", "banks",
  "employees", "expense_heads", "warehouses", "credit_terms",
  "settings", "help_content", "email_templates", "print_templates",
  "architecture_documents", "audit_log", "import_templates",
  // Import history has no company column, so it cannot be cleared for one company.
  "import_batches", "import_batch_records",
  "account_group_assignments", "feedback_log",
  // Pre-sales pipeline: kept, with its links to deleted orders cleared (UNLINK_ON_RESET).
  "leads", "requirement_queries", "quotations", "negotiations", "purchase_orders"
]);

const RESET_TABLES = [
  // ledger_entries must be deleted before voucher_lines (FK voucher_line_id → voucher_lines.id)
  { table: "ledger_entries", module: "Accounting" },
  { table: "cash_bank_ledger", module: "Accounting" },
  { table: "voucher_lines", module: "Accounting" },
  { table: "vouchers", module: "Accounting" },
  { table: "guided_vouchers", module: "Accounting" },
  { table: "invoice_items", module: "Billing" },
  { table: "invoices", module: "Billing" },
  { table: "payment_allocations", module: "Payments" },
  { table: "supplier_payment_allocations", module: "Payments" },
  { table: "payments", module: "Payments" },
  { table: "supplier_payments", module: "Payments" },
  { table: "procurement_items", module: "Procurement" },
  { table: "procurements", module: "Procurement" },
  { table: "expense_entries", module: "Expenses" },
  { table: "order_items", module: "Orders" },
  { table: "supply_orders", module: "Orders" },
  { table: "receivables", module: "Receivables" },
  { table: "delivery_challan_items", module: "Inventory" },
  { table: "delivery_challans", module: "Inventory" },
  { table: "goods_receipt_items", module: "Inventory" },
  { table: "goods_receipts", module: "Inventory" },
  { table: "stock_outwards", module: "Inventory" },
  { table: "stock_inwards", module: "Inventory" },
  { table: "stock_adjustments", module: "Inventory" },
  { table: "stock_returns", module: "Inventory" },
  { table: "stock_reservations", module: "Inventory" },
  { table: "warehouse_transfers", module: "Inventory" },
  { table: "inventory_movements", module: "Inventory" },
  { table: "stock_ledger", module: "Inventory" },
  { table: "serial_numbers", module: "Inventory" },
  { table: "batches", module: "Inventory" },
  { table: "voucher_proposal_audit", module: "Bank" },
  { table: "voucher_proposals", module: "Bank" },
  { table: "bank_reconciliation_matches", module: "Bank" },
  { table: "bank_statement_entries", module: "Bank" },
  { table: "bank_statement_imports", module: "Bank" },
  { table: "crac_records", module: "CRAC" },
  { table: "documents", module: "Operations" },
  { table: "advance_adjustments", module: "Receivables" },
  { table: "advance_receipts", module: "Receivables" },
  { table: "supplier_advances", module: "Payables" },
  { table: "allocation_audit", module: "Receivables" },
  { table: "approval_queue", module: "Approvals" },
  // Order follow-ups point at supply orders and delivery challans. If they stayed
  // behind, the foreign key check refused the whole reset.
  { table: "installations", module: "Operations" },
  { table: "procurement_plans", module: "Procurement" },
  // Opening balances are posted together with their own opening voucher, which the
  // reset removes with every other voucher.
  { table: "opening_balances", module: "Accounting" }
];

// Year-end records are removed with the transactions; they are not listed in the preview.
const YEAR_END_TABLES = ["carry_forward_entries", "year_end_closings"];

// The pre-sales pipeline (leads to purchase orders) is kept. Its links to the
// orders a reset deletes are cleared instead, so the records stay and the foreign
// key check passes.
const UNLINK_ON_RESET = [
  { table: "quotations", set: "supply_order_id = NULL" },
  { table: "negotiations", set: "supply_order_id = NULL" },
  { table: "purchase_orders", set: "work_order_id = NULL, converted_to_work_order = 0" }
];


// Every table with a company column must be either cleared or kept on purpose.
// A new table that is neither is reported, so a reset can never silently skip it.
export function unclassifiedCompanyTables(db) {
  const known = new Set([...PRESERVED_TABLES, ...RESET_TABLES.map((row) => row.table), ...YEAR_END_TABLES]);
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name)
    .filter((name) => !known.has(name) && !name.startsWith("sqlite_"))
    .filter((name) => db.prepare(`PRAGMA table_info("${name}")`).all().some((col) => col.name === "company_id"));
}

function nowIso() {
  return new Date().toISOString();
}

function tableExists(db, name) {
  return db.prepare("SELECT count(*) cnt FROM sqlite_master WHERE type='table' AND name=?").get(name)?.cnt > 0;
}

function formatForeignKeyIssues(issues) {
  return issues
    .slice(0, 5)
    .map((issue) => `${issue.table} row ${issue.rowid} references ${issue.parent}`)
    .join("; ");
}

function assertNoForeignKeyIssues(db) {
  const issues = db.prepare("PRAGMA foreign_key_check").all();
  if (issues.length > 0) {
    throw new OperationalResetError(`Reset would leave ${issues.length} foreign key issue(s): ${formatForeignKeyIssues(issues)}`);
  }
}

function runWithForeignKeysDisabled(db, callback) {
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    return callback();
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

// With a company id, counts exactly the rows a reset of that company deletes.
// Without one (All Companies view), counts every company and says so.
export function previewReset(db, companyId = null) {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
  const id = Number(companyId || 0) || null;
  const company = id ? db.prepare("SELECT id, company_name FROM companies WHERE id = ?").get(id) : null;
  if (id && !company) throw new OperationalResetError(`Preview refused: company #${id} does not exist. Select a valid company and retry.`);
  const counts = [];
  let totalOperational = 0;
  for (const { table, module } of RESET_TABLES) {
    if (!tables.has(table)) continue;
    const count = company ? companyRowCount(db, table, company.id) : activeCount(db, table);
    if (count > 0) totalOperational += count;
    counts.push({ table, module, count });
  }
  const preservedCounts = [];
  for (const table of PRESERVED_TABLES) {
    if (!tables.has(table)) continue;
    const hasCompany = db.prepare(`PRAGMA table_info("${table}")`).all().some((col) => col.name === "company_id");
    const row = company && hasCompany
      ? db.prepare(`SELECT COUNT(*) count FROM "${table}" WHERE company_id = ?`).get(company.id)
      : db.prepare(`SELECT COUNT(*) count FROM "${table}"`).get();
    preservedCounts.push({ table, count: Number(row?.count || 0) });
  }
  return {
    scope: company ? "company" : "all",
    company: company ? { id: company.id, name: company.company_name } : null,
    operational: counts,
    preserved: preservedCounts,
    totalOperational,
    unclassifiedTables: unclassifiedCompanyTables(db)
  };
}

export function analyzeDependencies(db) {
  const issues = [];
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
  const foreignKeys = [];

  for (const { table } of RESET_TABLES) {
    if (!tables.has(table)) continue;
    const fkInfo = db.prepare(`PRAGMA foreign_key_list("${table}")`).all();
    for (const fk of fkInfo) {
      foreignKeys.push({ from: table, column: fk.from, to: fk.table, toColumn: fk.to });
    }
  }

  for (const { table, module } of RESET_TABLES) {
    if (!tables.has(table)) continue;
    const childRefs = foreignKeys.filter(fk => fk.to === table);
    const parentRefs = foreignKeys.filter(fk => fk.from === table);
    const row = db.prepare(`SELECT COUNT(*) count FROM "${table}"`).get();
    const count = Number(row?.count || 0);

    const orphanChecks = parentRefs.map(fk => {
      if (!tables.has(fk.from)) return null;
      try {
        const orphanRow = db.prepare(`SELECT COUNT(*) count FROM "${fk.from}" LEFT JOIN "${fk.to}" ON "${fk.from}"."${fk.column}" = "${fk.to}"."${fk.toColumn}" WHERE "${fk.to}"."${fk.toColumn}" IS NULL AND "${fk.from}"."${fk.column}" IS NOT NULL`).get();
        return { table: fk.from, column: fk.column, orphanCount: Number(orphanRow?.count || 0) };
      } catch { return null; }
    }).filter(Boolean);
    issues.push({ table, module, rowCount: count, childTables: childRefs.map(fk => fk.from), parentTables: parentRefs.map(fk => fk.to), orphans: orphanChecks });
  }

  const blocked = issues.filter(i => i.orphans.some(o => o.orphanCount > 0));
  const warnings = issues.filter(i => !blocked.includes(i) && i.rowCount > 0 && i.orphans.some(o => o.orphanCount > 0));
  const safe = issues.filter(i => i.rowCount === 0);

  return {
    safe: safe.map(i => ({ table: i.table, rowCount: i.rowCount, module: i.module })),
    warnings: warnings.map(i => ({ table: i.table, rowCount: i.rowCount, module: i.module, orphans: i.orphans.filter(o => o.orphanCount > 0) })),
    blocked: blocked.map(i => ({ table: i.table, rowCount: i.rowCount, module: i.module, orphans: i.orphans.filter(o => o.orphanCount > 0) })),
    total: { safe: safe.length, warnings: warnings.length, blocked: blocked.length }
  };
}

// With a company id, counts only that company's rows (directly or through the parent table).
function activeCount(db, table, companyId = null) {
  const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map(r => r.name);
  const where = cols.includes("is_deleted") ? ["COALESCE(is_deleted, 0) = 0"] : [];
  const params = [];
  if (companyId) {
    const child = CHILD_TABLE_PARENTS[table];
    if (cols.includes("company_id")) { where.push("company_id = ?"); params.push(companyId); }
    else if (child) { where.push(`"${child.column}" IN (SELECT id FROM "${child.parent}" WHERE company_id = ?)`); params.push(companyId); }
  }
  const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  return db.prepare(`SELECT COUNT(*) count FROM "${table}"${clause}`).get(...params).count;
}

export function rebuildZeroState(db, companyId = null) {
  const results = { rebuilt: [], warnings: [] };
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));

  const zeroChecks = [
    { key: "voucherLines", label: "Voucher lines", table: "voucher_lines" },
    { key: "vouchers", label: "Voucher count", table: "vouchers" },
    { key: "ledgerEntries", label: "Ledger entries", table: "ledger_entries" },
    { key: "cashBankEntries", label: "Cash/Bank entries", table: "cash_bank_ledger" },
    { key: "receivables", label: "Receivables", table: "receivables" },
    { key: "supplierPayments", label: "Supplier payments", table: "supplier_payments" },
    { key: "supplierPaymentAllocations", label: "Supplier payment allocations", table: "supplier_payment_allocations" },
    { key: "stockLedger", label: "Stock ledger", table: "stock_ledger" },
    { key: "paymentAllocations", label: "Payment allocations", table: "payment_allocations" },
    { key: "inventoryMovements", label: "Inventory movements", table: "inventory_movements" },
    { key: "stockInwards", label: "Stock inwards", table: "stock_inwards" },
    { key: "stockOutwards", label: "Stock outwards", table: "stock_outwards" },
    { key: "stockAdjustments", label: "Stock adjustments", table: "stock_adjustments" },
    { key: "stockReturns", label: "Stock returns", table: "stock_returns" },
    { key: "invoices", label: "Invoices", table: "invoices" },
    { key: "procurements", label: "Procurements", table: "procurements" },
    { key: "supplyOrders", label: "Supply orders", table: "supply_orders" },
    { key: "orderItems", label: "Order items", table: "order_items" },
    { key: "openingBalances", label: "Opening balances", table: "opening_balances" },
    { key: "installations", label: "Installations", table: "installations" },
    { key: "procurementPlans", label: "Procurement plans", table: "procurement_plans" }
  ];

  for (const check of zeroChecks) {
    if (!tables.has(check.table)) continue;
    const count = activeCount(db, check.table, companyId);
    if (count > 0) {
      results.warnings.push(`${check.label}: ${count} rows remain (expected 0)`);
    } else {
      results.rebuilt.push(`${check.label}: 0 (clean)`);
    }
  }

  const orphanRules = {
    voucher_lines: { fk: "voucher_id", parent: "vouchers", label: "Voucher lines without voucher" },
    ledger_entries: { fk: "voucher_id", parent: "vouchers", label: "Ledger entries without voucher" },
    payment_allocations: { fk: "payment_id", parent: "payments", label: "Payment allocations without payment" },
    supplier_payment_allocations: { fk: "supplier_payment_id", parent: "supplier_payments", label: "Supplier payment allocations without supplier payment" },
    stock_inwards: { fk: "order_id", parent: "supply_orders", label: "Stock inwards without order" },
    stock_outwards: { fk: "order_id", parent: "supply_orders", label: "Stock outwards without order" },
    stock_adjustments: { fk: "id", parent: null, label: "Stock adjustments without reference" },
    stock_returns: { fk: "id", parent: null, label: "Stock returns without reference" },
    inventory_movements: { fk: "voucher_id", parent: "vouchers", label: "Inventory movements without voucher" },
    procurement_items: { fk: "procurement_id", parent: "procurements", label: "Procurement items without procurement" },
    order_items: { fk: "order_id", parent: "supply_orders", label: "Order items without order" }
  };
  for (const [table, rule] of Object.entries(orphanRules)) {
    if (!tables.has(table)) continue;
    if (!rule.parent) continue;
    if (!tables.has(rule.parent)) continue;
    const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map(r => r.name);
    if (!cols.includes(rule.fk)) continue;
    const isDeletedWhere = cols.includes("is_deleted") ? "COALESCE(is_deleted, 0) = 0 AND " : "";
    const parentCols = db.prepare(`PRAGMA table_info("${rule.parent}")`).all().map(r => r.name);
    const parentDeletedWhere = parentCols.includes("is_deleted") ? "WHERE COALESCE(is_deleted, 0) = 0" : "";
    const row = db.prepare(`SELECT COUNT(*) count FROM "${table}" WHERE ${isDeletedWhere}"${rule.fk}" IS NOT NULL AND "${rule.fk}" NOT IN (SELECT id FROM "${rule.parent}" ${parentDeletedWhere})`).get();
    const count = Number(row?.count || 0);
    if (count > 0) results.warnings.push(`${rule.label}: ${count} orphans`);
  }

  return results;
}

// Tables that belong to a company only through their parent row.
const CHILD_TABLE_PARENTS = {
  voucher_lines: { column: "voucher_id", parent: "vouchers" }
};

function resolveResetCompany(db, companyId) {
  const id = Number(companyId || 0);
  if (!id) {
    throw new OperationalResetError("Reset refused: no company is selected. Select the company to reset in the company switcher (top bar), then run the reset again. The reset only clears one company at a time.");
  }
  const company = db.prepare("SELECT id, company_name, company_code FROM companies WHERE id = ?").get(id);
  if (!company) throw new OperationalResetError(`Reset refused: company #${id} does not exist. Select a valid company and retry.`);
  return company;
}

function assertResetConfirmation(company, confirmText) {
  const typed = String(confirmText || "").trim();
  if (typed !== "RESET") {
    throw new OperationalResetError(`Reset refused: type RESET in the confirmation box to clear the transactions of ${company.company_name}. Nothing was changed.`);
  }
}

function companyRowCount(db, table, companyId) {
  const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map((r) => r.name);
  if (cols.includes("company_id")) return db.prepare(`SELECT COUNT(*) c FROM "${table}" WHERE company_id = ?`).get(companyId).c;
  const child = CHILD_TABLE_PARENTS[table];
  const parentCols = child ? db.prepare(`PRAGMA table_info("${child.parent}")`).all().map((r) => r.name) : [];
  if (child && parentCols.includes("company_id")) return db.prepare(`SELECT COUNT(*) c FROM "${table}" WHERE "${child.column}" IN (SELECT id FROM "${child.parent}" WHERE company_id = ?)`).get(companyId).c;
  return 0;
}

// Clears every transaction of ONE company (masters, users, chart of accounts and
// financial years are kept). Always takes a consistent backup first and always
// writes an audit row, so the reset can be rolled back and is traceable.
function performCompanyReset(db, runtimeRoot, { userId, companyId, confirmText, module = "operational_reset" } = {}) {
  const company = resolveResetCompany(db, companyId);
  assertResetConfirmation(company, confirmText);
  const unclassified = unclassifiedCompanyTables(db);
  if (unclassified.length) {
    throw new OperationalResetError(`Reset refused: these tables hold company data but the reset does not know whether to clear or keep them: ${unclassified.join(", ")}. Nothing was changed. Report this so the reset can be updated.`);
  }
  const backup = createBackup(runtimeRoot, db, "pre_reset");
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
  const before = [];
  RESET_TABLES.forEach(({ table, module: area }) => {
    if (tables.has(table)) before.push({ table, module: area, count: companyRowCount(db, table, company.id) });
  });

  let after;
  let zeroState;
  let auditId;
  runWithForeignKeysDisabled(db, () => {
    db.transaction(() => {
      // Children first, while their parents still exist to identify the company.
      Object.entries(CHILD_TABLE_PARENTS).forEach(([table, rule]) => {
        if (!tables.has(table) || !tables.has(rule.parent)) return;
        const parentCols = db.prepare(`PRAGMA table_info("${rule.parent}")`).all().map((r) => r.name);
        if (!parentCols.includes("company_id")) return;
        db.prepare(`DELETE FROM "${table}" WHERE "${rule.column}" IN (SELECT id FROM "${rule.parent}" WHERE company_id = ?)`).run(company.id);
      });
      for (const { table } of RESET_TABLES) {
        if (!tables.has(table) || CHILD_TABLE_PARENTS[table]) continue;
        const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map((r) => r.name);
        if (!cols.includes("company_id")) continue;
        db.prepare(`DELETE FROM "${table}" WHERE company_id = ?`).run(company.id);
      }
      UNLINK_ON_RESET.forEach(({ table, set }) => {
        if (!tables.has(table)) return;
        db.prepare(`UPDATE "${table}" SET ${set}, updated_at = CURRENT_TIMESTAMP WHERE company_id = ?`).run(company.id);
      });
      YEAR_END_TABLES.forEach((table) => {
        if (tables.has(table)) db.prepare(`DELETE FROM "${table}" WHERE company_id = ?`).run(company.id);
      });
      assertNoForeignKeyIssues(db);
      // The audit row is written in the same transaction, so a reset never lands without
      // its record (the go-live rollback guard relies on it).
      after = before.map((row) => ({ ...row, count: tables.has(row.table) ? companyRowCount(db, row.table, company.id) : 0 }));
      zeroState = {
        rebuilt: after.filter((row) => row.count === 0).map((row) => `${row.table}: 0 (clean)`),
        warnings: after.filter((row) => row.count > 0).map((row) => `${row.table}: ${row.count} rows remain (expected 0)`)
      };
      init.auditLog(db, {
        company_id: company.id,
        action: "operational_reset",
        module,
        table_name: "system",
        user_id: userId || null,
        new_value: JSON.stringify({
          company: company.company_name,
          backupFileName: backup.fileName,
          removedRows: before.reduce((sum, row) => sum + row.count, 0),
          before,
          after,
          resetAt: nowIso()
        })
      });
      auditId = db.prepare("SELECT last_insert_rowid() as id").get()?.id || null;
    })();
  });
  return {
    company: { id: company.id, name: company.company_name },
    backup: { fileName: backup.fileName, path: backup.path, size: backup.size, createdAt: backup.createdAt },
    before: { operational: before, totalOperational: before.reduce((sum, row) => sum + row.count, 0) },
    after: { operational: after, totalOperational: after.reduce((sum, row) => sum + row.count, 0) },
    zeroState,
    auditId
  };
}

export function executeReset(db, runtimeRoot, options = {}) {
  return performCompanyReset(db, runtimeRoot, typeof options === "object" && options ? options : { userId: options });
}

// The audit module of an Enhanced Reset (the go-live reset). The go-live rollback guard
// looks for this module's audit row.
export const GO_LIVE_RESET_MODULE = "go_live_preparation";

export function executeEnhancedReset(db, runtimeRoot, options = {}) {
  return performCompanyReset(db, runtimeRoot, { ...(typeof options === "object" && options ? options : { userId: options }), module: GO_LIVE_RESET_MODULE });
}

// Restores the database from a backup. The caller MUST close its connection to
// the live database before calling this and reopen it afterwards.
export function rollbackReset(runtimeRoot, backupIdentifier) {
  try {
    const backups = listBackups(runtimeRoot);
    // Restore only the backup the caller names (the one taken for this reset); never guess,
    // because the newest backup may belong to another company or an older state of the books.
    const targetBackup = String(backupIdentifier || "").trim();
    if (!targetBackup) {
      return { success: false, reason: "Rollback refused: no backup was named. Open Backup & Restore and pick the pre-reset backup taken for this reset. Nothing was changed." };
    }
    if (!backups.includes(targetBackup)) {
      return { success: false, reason: `Rollback refused: backup "${targetBackup}" is not in the backups folder. Choose one from the backup list. Nothing was changed.` };
    }
    const pendingFile = path.join(runtimeRoot, "database", "pending_restore.json");
    if (fs.existsSync(pendingFile)) {
      return { success: false, reason: "A pending database restore is already queued. Complete or cancel it before rolling back." };
    }
    const restored = restoreBackup(targetBackup, runtimeRoot);
    return { success: true, restoredFrom: targetBackup, safetyBackup: restored.safetyBackup || null };
  } catch (error) {
    return { success: false, reason: error.message };
  }
}

export class OperationalResetError extends Error {
  constructor(message) { super(message); this.name = "OperationalResetError"; }
}
