const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dbPath = path.join(__dirname, "database", "gii_gem_erp.db");
console.log("DB path:", dbPath);
console.log("DB exists:", fs.existsSync(dbPath));

const db = new Database(dbPath);

// Check all RESET_TABLES columns for is_deleted
const RESET_TABLES = [
  "voucher_lines", "vouchers", "ledger_entries", "cash_bank_ledger", "guided_vouchers",
  "invoice_items", "invoices", "payment_allocations", "supplier_payment_allocations",
  "payments", "supplier_payments", "procurement_items", "procurements", "expense_entries",
  "order_items", "supply_orders", "receivables", "delivery_challan_items", "delivery_challans",
  "goods_receipt_items", "goods_receipts", "stock_outwards", "stock_inwards",
  "stock_adjustments", "stock_returns", "stock_reservations", "warehouse_transfers",
  "inventory_movements", "stock_ledger", "serial_numbers", "batches",
  "voucher_proposal_audit", "voucher_proposals", "bank_reconciliation_matches",
  "bank_statement_entries", "bank_statement_imports"
];

const existingTables = new Set(
  db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
);

console.log("\n=== RESET_TABLES Analysis ===");
let totalBefore = 0;
for (const table of RESET_TABLES) {
  if (!existingTables.has(table)) {
    console.log(`${table}: TABLE NOT FOUND`);
    continue;
  }
  const cols = db.pragma(`table_info('${table}')`).map(r => r.name);
  const count = db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get().c;
  const hasDeleted = cols.includes("is_deleted");
  const action = hasDeleted ? "SOFT (UPDATE is_deleted=1)" : "HARD (DELETE FROM)";
  console.log(`${table}: ${count} rows, has is_deleted=${hasDeleted}, action=${action}`);
  totalBefore += count;
}
console.log(`\nTotal rows across RESET_TABLES: ${totalBefore}`);

// Test: try DELETE inside a ROLLBACK transaction with PRAGMA foreign_keys = OFF
console.log("\n=== Simulating reset transaction (ROLLBACK after) ===");

db.pragma("foreign_keys = OFF");
console.log("FK pragma:", JSON.stringify(db.pragma("foreign_keys")));

const testTransaction = db.transaction(() => {
  // Simulate the exact same operations as executeEnhancedReset
  for (const table of RESET_TABLES) {
    if (!existingTables.has(table)) continue;
    const cols = db.pragma(`table_info('${table}')`).map(r => r.name);
    if (cols.includes("is_deleted")) {
      const info = db.prepare(`UPDATE "${table}" SET is_deleted = 1 WHERE COALESCE(is_deleted, 0) = 0`).run();
      console.log(`  ${table}: UPDATE ${info.changes} rows (soft-delete)`);
    } else {
      const beforeCount = db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get().c;
      const info = db.prepare(`DELETE FROM "${table}"`).run();
      console.log(`  ${table}: DELETE ${info.changes} rows (was ${beforeCount})`);
    }
  }
  // ROLLBACK (simulate the test without destroying data)
  throw new Error("ROLLBACK");
});

try {
  testTransaction();
} catch (e) {
  if (e.message === "ROLLBACK") {
    console.log("\nTransaction rolled back (test completed cleanly)");
  } else {
    console.log("\nTransaction FAILED:", e.message);
  }
}

db.pragma("foreign_keys = ON");

// Verify data is still intact (rollback worked)
console.log("\n=== Verification (post-rollback) ===");
for (const table of ["cash_bank_ledger", "ledger_entries", "voucher_lines", "vouchers"]) {
  if (!existingTables.has(table)) continue;
  const count = db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get().c;
  console.log(`${table}: ${count} rows (should match original)`);
}

db.close();
console.log("\nDiagnostic complete.");
