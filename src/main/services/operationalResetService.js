import fs from "node:fs";
import path from "node:path";
import { createBackup, restoreBackup, listBackups } from "./backup.js";
import * as init from "../database/init.js";

const PRESERVED_TABLES = new Set([
  "companies", "users", "accounts", "financial_years",
  "government_departments", "suppliers", "items", "banks",
  "employees", "expense_heads", "warehouses", "credit_terms",
  "settings", "help_content", "email_templates", "print_templates",
  "architecture_documents", "audit_log", "import_templates"
]);

const RESET_TABLES = [
  { table: "voucher_lines", module: "Accounting" },
  { table: "vouchers", module: "Accounting" },
  { table: "ledger_entries", module: "Accounting" },
  { table: "cash_bank_ledger", module: "Accounting" },
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
  { table: "import_batches", module: "Import" },
  { table: "import_batch_records", module: "Import" },
  { table: "crac_records", module: "CRAC" },
  { table: "documents", module: "Operations" },
  { table: "advance_adjustments", module: "Receivables" },
  { table: "advance_receipts", module: "Receivables" },
  { table: "supplier_advances", module: "Payables" },
  { table: "allocation_audit", module: "Receivables" },
  { table: "approval_queue", module: "Approvals" }
];

function nowIso() {
  return new Date().toISOString();
}

function tableExists(db, name) {
  return db.prepare("SELECT count(*) cnt FROM sqlite_master WHERE type='table' AND name=?").get(name)?.cnt > 0;
}

export function previewReset(db) {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
  const counts = [];
  let totalOperational = 0;
  for (const { table, module } of RESET_TABLES) {
    if (!tables.has(table)) continue;
    const count = activeCount(db, table);
    if (count > 0) totalOperational += count;
    counts.push({ table, module, count });
  }
  const preservedCounts = [];
  for (const table of PRESERVED_TABLES) {
    if (!tables.has(table)) continue;
    const row = db.prepare(`SELECT COUNT(*) count FROM "${table}"`).get();
    preservedCounts.push({ table, count: Number(row?.count || 0) });
  }
  return { operational: counts, preserved: preservedCounts, totalOperational };
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

function activeCount(db, table) {
  const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map(r => r.name);
  const where = cols.includes("is_deleted") ? " WHERE COALESCE(is_deleted, 0) = 0" : "";
  return db.prepare(`SELECT COUNT(*) count FROM "${table}"${where}`).get().count;
}

export function rebuildZeroState(db) {
  const results = { rebuilt: [], warnings: [] };
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));

  const zeroChecks = [
    { key: "vouchers", label: "Voucher count", table: "vouchers" },
    { key: "ledgerEntries", label: "Ledger entries", table: "ledger_entries" },
    { key: "receivables", label: "Receivables", table: "receivables" },
    { key: "payables", label: "Payables", table: "supplier_payables" },
    { key: "stockLedger", label: "Stock ledger", table: "stock_ledger" }
  ];

  for (const check of zeroChecks) {
    if (!tables.has(check.table)) continue;
    const count = activeCount(db, check.table);
    if (count > 0) {
      results.warnings.push(`${check.label}: ${count} rows remain (expected 0)`);
    } else {
      results.rebuilt.push(`${check.label}: 0 (clean)`);
    }
  }

  const orphanTables = ["voucher_lines", "ledger_entries"];
  const orphanLabels = { voucher_lines: "Voucher lines without voucher", ledger_entries: "Ledger entries without voucher" };
  for (const table of orphanTables) {
    if (!tables.has(table)) continue;
    const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map(r => r.name);
    const isDeletedWhere = cols.includes("is_deleted") ? "COALESCE(is_deleted, 0) = 0 AND " : "";
    const row = db.prepare(`SELECT COUNT(*) count FROM "${table}" WHERE ${isDeletedWhere}voucher_id NOT IN (SELECT id FROM vouchers WHERE COALESCE(is_deleted, 0) = 0)`).get();
    const count = Number(row?.count || 0);
    if (count > 0) results.warnings.push(`${orphanLabels[table]}: ${count} orphans`);
  }

  return results;
}

export function executeReset(db, runtimeRoot, userId) {
  const backup = createBackup(runtimeRoot);
  const before = previewReset(db);
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));

  db.pragma("foreign_keys = OFF");

  const deleteTransaction = db.transaction(() => {
    for (const { table } of RESET_TABLES) {
      if (!tables.has(table)) continue;
      const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map(r => r.name);
      if (cols.includes("is_deleted")) {
        db.prepare(`UPDATE "${table}" SET is_deleted = 1 WHERE COALESCE(is_deleted, 0) = 0`).run();
      } else {
        db.prepare(`DELETE FROM "${table}"`).run();
      }
    }
  });

  deleteTransaction();

  db.pragma("foreign_keys = ON");

  const zeroState = rebuildZeroState(db);
  const after = previewReset(db);

  return { backup, before, after, zeroState, auditId: null };
}

export function executeEnhancedReset(db, runtimeRoot, userId) {
  const backup = createBackup(runtimeRoot);
  const before = previewReset(db);
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));

  db.pragma("foreign_keys = OFF");

  const deleteTransaction = db.transaction(() => {
    for (const { table } of RESET_TABLES) {
      if (!tables.has(table)) continue;
      const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map(r => r.name);
      if (cols.includes("is_deleted")) {
        db.prepare(`UPDATE "${table}" SET is_deleted = 1 WHERE COALESCE(is_deleted, 0) = 0`).run();
      } else {
        db.prepare(`DELETE FROM "${table}"`).run();
      }
    }
  });

  deleteTransaction();

  db.pragma("foreign_keys = ON");

  const zeroState = rebuildZeroState(db);
  const after = previewReset(db);
  init.auditLog(db, {
    action: "operational_reset",
    module: "go_live_preparation",
    table_name: "system",
    user_id: userId,
    new_value: JSON.stringify({
      backupPath: backup.path,
      backupFileName: backup.fileName,
      beforeCounts: before,
      afterCounts: after,
      zeroState,
      userId,
      resetAt: nowIso()
    })
  });
  const auditId = db.prepare("SELECT last_insert_rowid() as id").get()?.id || null;

  return {
    backup: { fileName: backup.fileName, path: backup.path, size: backup.size, createdAt: backup.createdAt },
    before,
    after,
    zeroState,
    auditId
  };
}

export function rollbackReset(runtimeRoot, backupIdentifier) {
  try {
    const backups = listBackups(runtimeRoot);
    let targetBackup = backupIdentifier;
    if (!targetBackup) {
      targetBackup = backups[0];
    } else {
      const match = backups.find(b => b.includes(backupIdentifier) || backupIdentifier.includes(b));
      targetBackup = match || backupIdentifier;
    }
    if (!targetBackup) {
      return { success: false, reason: "No backup found to restore from. Reset rollback requires a valid backup." };
    }
    const pendingFile = path.join(runtimeRoot, "database", "pending_restore.json");
    if (fs.existsSync(pendingFile)) {
      return { success: false, reason: "A pending database restore is already queued. Complete or cancel it before rolling back." };
    }
    restoreBackup(targetBackup, runtimeRoot);
    return { success: true, restoredFrom: targetBackup };
  } catch (error) {
    return { success: false, reason: error.message };
  }
}

export class OperationalResetError extends Error {
  constructor(message) { super(message); this.name = "OperationalResetError"; }
}