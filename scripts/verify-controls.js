import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  authenticate,
  bulkImportRecords,
  createManualVoucher,
  createRecord,
  enforcePermission,
  initializeDatabase,
  listImportBatches,
  listRecords,
  rollbackImportBatch,
  updateFinancialYearStatus,
  reverseVoucher
} from "../src/main/database/init.js";
import { createBackup, listBackups, restoreBackup } from "../src/main/services/backup.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectBlocked(name, fn, pattern) {
  try {
    fn();
  } catch (error) {
    assert(pattern.test(error.message), `${name} failed with unexpected message: ${error.message}`);
    return { name, status: "pass", detail: error.message };
  }
  throw new Error(`${name} was not blocked`);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-gem-controls-"));
let db = initializeDatabase(root);
const results = [];

try {
  const company = db.prepare("SELECT * FROM companies ORDER BY id LIMIT 1").get();
  const admin = db.prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();
  const viewerInsert = db.prepare(`
    INSERT INTO users (username, password_hash, display_name, role, status)
    VALUES ('viewer-controls', (SELECT password_hash FROM users WHERE id = ?), 'Viewer Controls', 'viewer', 'active')
  `).run(admin.id);
  const viewerId = viewerInsert.lastInsertRowid;

  results.push(expectBlocked("Viewer backend permission denied", () => enforcePermission(db, "post", { user_id: viewerId, module: "controls" }), /Permission denied/));
  assert(db.prepare("SELECT COUNT(*) count FROM audit_log WHERE action = 'permission_denied'").get().count > 0, "Permission denial was not logged");
  results.push({ name: "Permission denial audit logged", status: "pass" });

  assert(authenticate(db, "admin", "bad-password") === null, "Failed login should return null");
  const failedLoginUser = db.prepare("SELECT failed_login_count FROM users WHERE username = 'admin'").get();
  assert(Number(failedLoginUser.failed_login_count || 0) >= 1, "Failed login count was not incremented");
  results.push({ name: "Failed login tracking", status: "pass", detail: `failed_login_count=${failedLoginUser.failed_login_count}` });

  const fy = db.prepare("SELECT * FROM financial_years WHERE company_id = ? AND start_date <= '2026-06-12' AND end_date >= '2026-06-12'").get(company.id);
  assert(fy, "Expected FY 2026-27 to exist");
  updateFinancialYearStatus(db, fy.id, "Locked", admin.id);

  const department = createRecord(db, "government_departments", { department_name: "Controls Department", contact_person: "Audit", contact_number: "1", address: "Test", status: "active" });
  const employee = createRecord(db, "employees", { employee_name: "Controls Employee", mobile_number: "9999999999", designation: "Audit", incentive_percentage: 15, status: "active" });
  const supplier = createRecord(db, "suppliers", { supplier_name: "Controls Supplier", status: "active" });
  const item = createRecord(db, "items", { item_name: "Controls Item", gst_rate: 18, unit: "Nos", status: "active" });
  const warehouse = createRecord(db, "warehouses", { company_id: company.id, warehouse_name: "Controls Warehouse", location: "Test", warehouse_type: "Main", responsible_person: "Audit", status: "active" });
  const order = createRecord(db, "supply_orders", {
    company_id: company.id,
    order_number: `CTRL-${Date.now()}`,
    order_date: "2026-06-12",
    department_id: department.id,
    institution_name: "Controls Institution",
    location: "Test",
    employee_id: employee.id,
    supply_due_date: "2026-06-30",
    order_status: "Received",
    remarks: "Locked-year control test"
  });

  [
    ["Sales/Billing locked year", () => createRecord(db, "invoices", { company_id: company.id, order_id: order.id, invoice_number: `CTRL-INV-${Date.now()}`, invoice_date: "2026-06-12", billing_value: 1000, gst_rate: 18 })],
    ["Purchase/Procurement locked year", () => createRecord(db, "procurements", { company_id: company.id, order_id: order.id, purchase_date: "2026-06-12", supplier_id: supplier.id, purchase_invoice_number: `CTRL-PUR-${Date.now()}`, purchase_value: 500, purchase_gst: 90 })],
    ["Receipt/Payment locked year", () => createRecord(db, "payments", { company_id: company.id, order_id: order.id, payment_date: "2026-06-12", payment_amount: 100, payment_mode: "Bank Transfer", utr_number: `CTRL-UTR-${Date.now()}` })],
    ["Inventory Adjustment locked year", () => createRecord(db, "stock_adjustments", { company_id: company.id, item_id: item.id, warehouse_id: warehouse.id, adjustment_date: "2026-06-12", adjustment_type: "Increase", quantity: 1, rate: 10, reason: "Locked-year test" })],
    ["Manual Voucher locked year", () => createManualVoucher(db, { company_id: company.id, voucher_date: "2026-06-12", voucher_type: "Journal", narration: "Locked-year test", lines: [{ account_id: 1, debit: 100 }, { account_id: 2, credit: 100 }] })]
  ].forEach(([name, fn]) => results.push(expectBlocked(name, fn, /closed|locked/i)));

  updateFinancialYearStatus(db, fy.id, "Open", admin.id);

  const importResult = bulkImportRecords(db, "expense_heads", [
    { expense_head_name: `Rollback Expense ${Date.now()}`, default_calculation_method: "fixed", default_percentage: 0, category: "Controls", status: "active" }
  ], { file_name: "controls-import.csv", user_id: admin.id });
  assert(importResult.importBatchId, "Import batch id was not created");
  const batches = listImportBatches(db, { table: "expense_heads" });
  assert(batches.some((batch) => batch.id === importResult.importBatchId), "Import batch was not listed");
  const rollback = rollbackImportBatch(db, importResult.importBatchId, { user_id: admin.id, module: "imports" });
  assert(rollback.rolledBackRecords === 1, "Import rollback did not roll back one record");
  results.push({ name: "Import rollback works", status: "pass", detail: importResult.importBatchId });

  const accountIds = db.prepare("SELECT id FROM accounts WHERE company_id = ? ORDER BY id LIMIT 2").all(company.id).map((row) => row.id);
  const voucher = createManualVoucher(db, {
    company_id: company.id,
    voucher_date: "2025-04-10",
    voucher_type: "Journal",
    narration: "Controls reversal test",
    lines: [{ account_id: accountIds[0], debit: 100 }, { account_id: accountIds[1], credit: 100 }]
  });
  reverseVoucher(db, voucher.id, "Controls verification");
  assert(db.prepare("SELECT status FROM vouchers WHERE id = ?").get(voucher.id).status === "Reversed", "Voucher reversal failed");
  results.push({ name: "Posting and reversal workflow", status: "pass", detail: voucher.voucher_number });

  const criticalAuditCount = db.prepare("SELECT COUNT(*) count FROM audit_log WHERE action IN ('permission_denied','bulk import','rollback import','voucher reversal')").get().count;
  assert(criticalAuditCount >= 4, "Critical audit actions were not captured");
  results.push({ name: "Critical audit logging", status: "pass", detail: `${criticalAuditCount} critical audit rows` });

  const beforeBackups = listBackups(root).length;
  const backup = createBackup(root);
  assert(fs.existsSync(backup.path), "Backup file was not created");
  assert(listBackups(root).length === beforeBackups + 1, "Backup list did not refresh");
  const marker = createRecord(db, "expense_heads", { expense_head_name: `Controls Restore Marker ${Date.now()}`, default_calculation_method: "fixed", default_percentage: 0, category: "Controls", status: "active" });
  db.close();
  restoreBackup(backup.fileName, root);
  db = initializeDatabase(root);
  assert(listRecords(db, "expense_heads", { search: marker.expense_head_name, status: "all" }).length === 0, "Restore did not remove marker");
  results.push({ name: "Backup validation", status: "pass", detail: backup.fileName });

  console.log(JSON.stringify({ root, passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ root, passed: results.length, failed: 1, results, error: error.message }, null, 2));
  process.exitCode = 1;
} finally {
  db?.close();
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(process.exitCode || 0);
}
