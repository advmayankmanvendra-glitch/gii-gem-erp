import { createBackup } from "./backup.js";
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
  { table: "delivery_challan_lines", module: "Inventory" },
  { table: "delivery_challans", module: "Inventory" },
  { table: "goods_receipts", module: "Inventory" },
  { table: "stock_outwards", module: "Inventory" },
  { table: "stock_inwards", module: "Inventory" },
  { table: "stock_adjustments", module: "Inventory" },
  { table: "stock_returns", module: "Inventory" },
  { table: "stock_reservations", module: "Inventory" },
  { table: "warehouse_transfer_lines", module: "Inventory" },
  { table: "warehouse_transfers", module: "Inventory" },
  { table: "inventory_movements", module: "Inventory" },
  { table: "stock_ledger", module: "Inventory" },
  { table: "voucher_proposal_audit", module: "Bank" },
  { table: "voucher_proposals", module: "Bank" },
  { table: "bank_statement_matches", module: "Bank" },
  { table: "bank_statement_entries", module: "Bank" },
  { table: "bank_statement_imports", module: "Bank" },
  { table: "import_batches", module: "Import" },
  { table: "supplier_payables", module: "Payables" },
  { table: "crac_records", module: "CRAC" }
];

export function previewReset(db) {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
  const counts = [];
  let totalOperational = 0;
  for (const { table, module } of RESET_TABLES) {
    if (!tables.has(table)) continue;
    const row = db.prepare(`SELECT COUNT(*) count FROM "${table}"`).get();
    const count = Number(row?.count || 0);
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

export function executeReset(db, runtimeRoot, userId) {
  const backup = createBackup(runtimeRoot);
  const before = previewReset(db);
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));

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

  const after = previewReset(db);
  const auditId = init.createRecord(db, "audit_log", {
    action: "operational_reset",
    module: "go_live_preparation",
    record_id: null,
    details: JSON.stringify({
      backupPath: backup.path,
      backupFileName: backup.fileName,
      beforeCounts: before,
      afterCounts: after,
      userId
    }),
    user_id: userId
  });

  return {
    backup: { fileName: backup.fileName, path: backup.path, size: backup.size, createdAt: backup.createdAt },
    before,
    after,
    auditId
  };
}

export class OperationalResetError extends Error {
  constructor(message) { super(message); this.name = "OperationalResetError"; }
}
