// Regression tests for the findings of audit 1 (2026-10-17) on branch claude/erp-full-automation-qbhv8k.
// Each test builds its own throwaway database in the OS temp folder.
// Run from the repo root:  node --test scripts/audit/audit1-regressions.test.mjs
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const m = await import(pathToFileURL(path.join(REPO, "src/main/database/init.js")).href);
const guards = await import(pathToFileURL(path.join(REPO, "src/main/database/ledgerGuards.js")).href);

const handles = [];
const roots = [];
afterEach(() => {
  while (handles.length) { const db = handles.pop(); try { if (db.open) db.close(); } catch { /* closed */ } }
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
function freshRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-audit1-"));
  roots.push(root);
  return root;
}
function fresh() {
  const db = m.initializeDatabase(freshRoot());
  handles.push(db);
  return db;
}
const balance = (db, name) => db.prepare(`
  SELECT ROUND(COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0), 2) b
  FROM ledger_entries le JOIN vouchers v ON v.id = le.voucher_id JOIN accounts a ON a.id = le.account_id
  WHERE a.company_id = 1 AND a.account_name = ? AND v.status IN ('Posted', 'Reversed') AND v.is_deleted = 0 AND COALESCE(le.is_deleted, 0) = 0
`).get(name).b;
const firstOrder = (db) => db.prepare("SELECT id FROM supply_orders WHERE company_id = 1 ORDER BY id LIMIT 1").get().id;
function widget(db) {
  const wh = m.createRecord(db, "warehouses", { company_id: 1, warehouse_name: "A1W", status: "active" }).id;
  const item = m.createRecord(db, "items", { item_name: "A1 Widget", unit: "Nos", status: "active", gst_rate: 18, opening_stock: 0, opening_rate: 0, opening_value: 0, default_warehouse_id: wh }).id;
  return { wh, item };
}

test("invoice GST is computed on the server, not taken from the screen", () => {
  const db = fresh();
  const inv = m.saveBillingVoucher(db, { header: { order_id: firstOrder(db), company_id: 1, invoice_date: "2026-07-01" }, items: [{ quantity: 1, billing_rate: 1000, gst_rate: 18, taxable_value: 1000, gst_amount: 1, gross_value: 1001 }] });
  const before = balance(db, "Output GST");
  m.postSalesVoucher(db, inv.id);
  assert.equal(Math.round((balance(db, "Output GST") - before) * 100) / 100, -180);
  const line = db.prepare("SELECT cgst, sgst, gross_value FROM invoice_items WHERE billing_id = ?").get(inv.id);
  assert.deepEqual(line, { cgst: 90, sgst: 90, gross_value: 1180 });
});

test("bill posted before the goods arrive leaves nothing in Goods Received Not Invoiced", () => {
  const db = fresh();
  const { wh, item } = widget(db);
  const grni = balance(db, "Goods Received Not Invoiced");
  const p = m.createRecord(db, "procurements", { company_id: 1, order_id: 1, purchase_date: "2026-07-01", supplier_id: 1, purchase_invoice_number: "A1-BILL-FIRST", purchase_value: 10000, purchase_gst: 1800 });
  m.postPurchaseVoucher(db, p.id);
  const si = m.createRecord(db, "stock_inwards", { company_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-02", purchase_invoice_number: "A1-BILL-FIRST", quantity: 10, rate: 1000, landed_cost: 0, procurement_id: p.id, supplier_id: 1 });
  m.postStockInward(db, si.id);
  assert.equal(balance(db, "Goods Received Not Invoiced"), grni);
});

test("a receipt with TDS is refused when the order has no posted invoice", () => {
  const db = fresh();
  const dept = db.prepare("SELECT id FROM government_departments LIMIT 1").get().id;
  const emp = db.prepare("SELECT id FROM employees LIMIT 1").get().id;
  const so = m.createRecord(db, "supply_orders", { company_id: 1, order_number: "A1-NOINV", order_date: "2026-06-01", order_status: "Received", institution_name: "X", department_id: dept, employee_id: emp, location: "M", supply_due_date: "2026-06-30" }).id;
  const pay = db.prepare("INSERT INTO payments (company_id, order_id, payment_date, payment_amount, payment_mode, posting_status, tds_deducted, gst_tds_deducted) VALUES (1, ?, '2026-07-02', 9800, 'NEFT', 'Draft', 200, 0)").run(so).lastInsertRowid;
  assert.throws(() => m.postReceiptVoucher(db, pay), /deductions/i);
});

test("a receipt naming a draft invoice is refused", () => {
  const db = fresh();
  const order = firstOrder(db);
  const draft = m.saveBillingVoucher(db, { header: { order_id: order, company_id: 1, invoice_date: "2026-07-04" }, items: [{ quantity: 1, billing_rate: 1000, gst_rate: 0 }] });
  const pay = db.prepare("INSERT INTO payments (company_id, order_id, billing_id, payment_date, payment_amount, payment_mode, posting_status) VALUES (1, ?, ?, '2026-07-05', 1000, 'NEFT', 'Draft')").run(order, draft.id).lastInsertRowid;
  assert.throws(() => m.postReceiptVoucher(db, pay), /not posted|post the invoice/i);
});

test("a percentage expense posts its computed amount", () => {
  const db = fresh();
  const order = firstOrder(db);
  const inv = m.saveBillingVoucher(db, { header: { order_id: order, company_id: 1, invoice_date: "2026-07-01" }, items: [{ quantity: 1, billing_rate: 10000, gst_rate: 18 }] });
  m.postSalesVoucher(db, inv.id);
  const head = db.prepare("SELECT id FROM expense_heads LIMIT 1").get();
  const exp = m.createRecord(db, "expense_entries", { company_id: 1, order_id: order, expense_head_id: head?.id || null, expense_date: "2026-07-02", calculation_method: "percentage_taxable", percentage: 2, expense_amount: 0, approval_status: "Approved" });
  m.postBusinessTransaction(db, "expense_entries", exp.id);
  const voucher = db.prepare("SELECT v.id FROM vouchers v WHERE v.source_module = 'expense' AND v.source_id = ?").get(exp.id);
  assert.ok(voucher, "the expense should have its own voucher");
  const total = db.prepare("SELECT SUM(debit) d FROM ledger_entries WHERE voucher_id = ?").get(voucher.id).d;
  assert.ok(total > 0, "the voucher should carry the computed amount");
});

test("a bank line matching a reversed receipt is not treated as already booked", () => {
  const db = fresh();
  const p = db.prepare("SELECT * FROM payments WHERE utr_number = 'UTR10001'").get();
  const v = db.prepare("SELECT id FROM vouchers WHERE source_module = 'payment' AND source_id = ?").get(p.id);
  m.reverseVoucher(db, v.id, "wrong receipt entered");
  m.createBankStatementImport(db, { company_id: 1, file_name: "a1.csv", rows: [{ date: p.payment_date, narration: `NEFT ${p.utr_number} receipt`, credit: String(p.payment_amount), debit: "", utr: p.utr_number }] });
  const entry = db.prepare("SELECT * FROM bank_statement_entries WHERE utr = ? ORDER BY id DESC").get(p.utr_number);
  m.updateBankImportStatus(db, entry.import_id, "Approved", 1);
  const proposal = db.prepare("SELECT status FROM voucher_proposals WHERE bank_entry_id = ?").get(entry.id);
  assert.notEqual(proposal?.status, "Already Booked");
});

test("a bank proposal cannot point at a ledger of another company", () => {
  const db = fresh();
  const other = db.prepare("INSERT INTO companies (company_name) VALUES ('A1 Other Co')").run().lastInsertRowid;
  const foreign = db.prepare("INSERT INTO accounts (company_id, account_name, account_code, account_type, normal_balance) VALUES (?, 'Foreign Ledger', 'FX-1', 'Expense', 'Debit')").run(other).lastInsertRowid;
  m.createBankStatementImport(db, { company_id: 1, file_name: "a1b.csv", rows: [{ date: "2026-07-03", narration: "Bank charges July", credit: "", debit: "118", utr: "A1CHG" }] });
  const entry = db.prepare("SELECT * FROM bank_statement_entries WHERE utr = 'A1CHG'").get();
  m.updateBankImportStatus(db, entry.import_id, "Approved", 1);
  const proposal = db.prepare("SELECT id FROM voucher_proposals WHERE bank_entry_id = ?").get(entry.id);
  assert.ok(proposal, "a proposal should exist for the bank line");
  assert.throws(() => m.updateVoucherProposal(db, proposal.id, { suggested_ledger_id: foreign }), /another company/);
});

test("deleting the newest audit rows is detected", () => {
  const db = fresh();
  m.auditLog(db, { action: "A1 Test", table_name: "audit_test", record_id: 1 });
  m.auditLog(db, { action: "A1 Test", table_name: "audit_test", record_id: 2 });
  const before = m.verifyAuditChain(db);
  assert.deepEqual({ broken: before.broken.length, missing: before.missingNewestRows }, { broken: 0, missing: 0 });
  db.prepare("DELETE FROM audit_log WHERE id = (SELECT MAX(id) FROM audit_log)").run();
  assert.equal(m.verifyAuditChain(db).missingNewestRows, 1);
});

test("upgrading an older database restores missing columns and paise amounts, with a backup first", () => {
  const root = freshRoot();
  let db = m.initializeDatabase(root);
  // An older database has no ledger guard triggers yet.
  guards.LEDGER_GUARD_TRIGGERS.forEach((name) => db.exec(`DROP TRIGGER IF EXISTS ${name}`));
  db.prepare("UPDATE voucher_lines SET debit_minor = 0, credit_minor = 0").run();
  db.exec("ALTER TABLE approval_queue DROP COLUMN deleted_by; ALTER TABLE approval_queue DROP COLUMN deleted_at; ALTER TABLE approval_queue DROP COLUMN is_deleted;");
  db.prepare("DELETE FROM schema_migrations WHERE migration_name = '036_upgrade_soft_delete_and_money_backfill'").run();
  db.close();
  db = m.initializeDatabase(root);
  handles.push(db);
  assert.ok(db.prepare("PRAGMA table_info(approval_queue)").all().some((c) => c.name === "is_deleted"));
  const mismatched = db.prepare("SELECT COUNT(*) c FROM voucher_lines WHERE debit_minor <> CAST(ROUND(debit * 100) AS INTEGER) OR credit_minor <> CAST(ROUND(credit * 100) AS INTEGER)").get().c;
  assert.equal(mismatched, 0);
  assert.deepEqual(guards.missingLedgerGuards(db), []);
  assert.ok(fs.readdirSync(path.join(root, "backups")).some((f) => f.startsWith("pre-upgrade-")));
});

test("reversing a guided voucher leaves another company's stock issue with the same number alone", () => {
  const db = fresh();
  const gv = db.prepare("INSERT INTO guided_vouchers (company_id, voucher_kind, voucher_date, payload_json, status) VALUES (1, 'Sales', '2026-07-01', '{}', 'Posted')").run().lastInsertRowid;
  const account = (name) => db.prepare("SELECT id FROM accounts WHERE company_id = 1 AND account_name = ?").get(name).id;
  const v = m.createBalancedVoucher(db, { company_id: 1, voucher_date: "2026-07-01", voucher_type: "Sales", narration: "a1", source_module: "guided_vouchers", source_id: gv,
    lines: [{ account_id: account("Trade Receivables"), debit: 100, credit: 0 }, { account_id: account("Sales"), debit: 0, credit: 100 }] });
  const other = db.prepare("INSERT INTO companies (company_name) VALUES ('A1 Other Co')").run().lastInsertRowid;
  const item = db.prepare("SELECT id FROM items LIMIT 1").get().id;
  const wh = db.prepare("SELECT id FROM warehouses LIMIT 1").get().id;
  const outward = db.prepare("INSERT INTO stock_outwards (company_id, order_id, item_id, warehouse_id, issue_date, quantity_issued, posting_status) VALUES (?, 1, ?, ?, '2026-07-01', 1, 'Posted')").run(other, item, wh).lastInsertRowid;
  m.auditLog(db, { company_id: other, action: "automatic_sales_stock_issue", table_name: "stock_outwards", record_id: outward, new_value: JSON.stringify({ voucher_number: v.voucher_number, quantity: 1 }) });
  m.reverseVoucher(db, v.id, "a1 test");
  assert.equal(db.prepare("SELECT posting_status FROM stock_outwards WHERE id = ?").get(outward).posting_status, "Posted");
});

test("item opening stock is counted in one company only", () => {
  const db = fresh();
  const item = m.createRecord(db, "items", { item_name: "A1 Shared", unit: "Nos", status: "active", gst_rate: 18, opening_stock: 10, opening_rate: 100, opening_value: 1000 }).id;
  const other = db.prepare("INSERT INTO companies (company_name) VALUES ('A1 Other')").run().lastInsertRowid;
  const otherWh = db.prepare("INSERT INTO warehouses (company_id, warehouse_name, status) VALUES (?, 'A1 C2 WH', 'active')").run(other).lastInsertRowid;
  const firstWh = db.prepare("SELECT id FROM warehouses WHERE company_id = 1 AND status = 'active' ORDER BY id LIMIT 1").get().id;
  assert.equal(m.stockBalance(db, 1, item, firstWh).quantity, 10);
  assert.equal(m.stockBalance(db, other, item, otherWh).quantity, 0);
});

test("reversing an invoice with an advance adjusted keeps its receivable closed", () => {
  const db = fresh();
  const dept = db.prepare("SELECT id FROM government_departments LIMIT 1").get().id;
  const emp = db.prepare("SELECT id FROM employees LIMIT 1").get().id;
  const so = m.createRecord(db, "supply_orders", { company_id: 1, order_number: "A1-ADV", order_date: "2026-06-01", order_status: "Received", institution_name: "X", department_id: dept, employee_id: emp, location: "M", supply_due_date: "2026-06-30" }).id;
  const pay = db.prepare("INSERT INTO payments (company_id, order_id, payment_date, payment_amount, payment_mode, posting_status) VALUES (1, ?, '2026-07-02', 500, 'NEFT', 'Draft')").run(so).lastInsertRowid;
  m.postReceiptVoucher(db, pay);
  const adv = m.createAdvanceReceipt(db, { payment_id: pay, advance_received: 500, department_id: dept, order_id: so });
  const inv = m.saveBillingVoucher(db, { header: { order_id: so, company_id: 1, invoice_date: "2026-07-03" }, items: [{ quantity: 1, billing_rate: 1000, gst_rate: 0 }] });
  const v = m.postSalesVoucher(db, inv.id);
  m.adjustAdvanceReceipt(db, { advance_id: adv.id, billing_id: inv.id, adjusted_amount: 500 });
  m.reverseVoucher(db, v.id, "wrong invoice");
  assert.deepEqual(db.prepare("SELECT status, balance_outstanding FROM receivables WHERE billing_id = ?").get(inv.id), { status: "Reversed", balance_outstanding: 0 });
});

test("go-live zero-state check looks only at the company that was reset", async () => {
  const { rebuildZeroState } = await import(pathToFileURL(path.join(REPO, "src/main/services/operationalResetService.js")).href);
  const db = fresh();
  const empty = db.prepare("INSERT INTO companies (company_name) VALUES ('A1 Empty Co')").run().lastInsertRowid;
  assert.ok(rebuildZeroState(db).warnings.length > 0, "the seeded company still has transactions");
  assert.deepEqual(rebuildZeroState(db, empty).warnings, []);
});

test("CGST only and SGST only invoices keep the whole tax in the chosen component", () => {
  const db = fresh();
  const order = firstOrder(db);
  const save = (gstType) => m.saveBillingVoucher(db, { header: { order_id: order, company_id: 1, invoice_date: "2026-07-01", gst_type: gstType }, items: [{ quantity: 1, billing_rate: 1000, gst_rate: 18, gst_type: gstType }] });
  const line = (inv) => db.prepare("SELECT cgst, sgst, igst FROM invoice_items WHERE billing_id = ?").get(inv.id);
  assert.deepEqual(line(save("CGST")), { cgst: 180, sgst: 0, igst: 0 });
  assert.deepEqual(line(save("SGST")), { cgst: 0, sgst: 180, igst: 0 });
});

test("go-live rollback refuses an unknown run instead of restoring another backup", async () => {
  const { executeAutoRollback } = await import(pathToFileURL(path.join(REPO, "src/main/services/deployment/rollbackService.js")).href);
  const root = freshRoot();
  fs.mkdirSync(path.join(root, "backups"), { recursive: true });
  fs.writeFileSync(path.join(root, "backups", "unrelated.db"), "x");
  assert.equal(executeAutoRollback(root, null, "test").success, false);
  assert.equal(executeAutoRollback(root, { backup: { fileName: "missing.db" } }, "test").success, false);
});

test("go-live verification runs in the app and passes on a freshly reset company", async () => {
  const { runProductionVerification } = await import(pathToFileURL(path.join(REPO, "src/main/services/deployment/goLiveVerificationService.js")).href);
  const db = fresh();
  const empty = db.prepare("INSERT INTO companies (company_name) VALUES ('A1 Go-live Co')").run().lastInsertRowid;
  const result = runProductionVerification(db, empty);
  assert.equal(result.overallPassed, true, JSON.stringify(result));
  assert.equal(runProductionVerification(db, 1).additionalPassed, false, "the seeded company still has vouchers");
});

test("an invoice cannot be saved under a company other than its supply order's", () => {
  const db = fresh();
  const other = db.prepare("INSERT INTO companies (company_name) VALUES ('A1 Billing Other')").run().lastInsertRowid;
  assert.throws(() => m.saveBillingVoucher(db, { header: { order_id: firstOrder(db), company_id: other, invoice_date: "2026-07-01" }, items: [{ quantity: 1, billing_rate: 100, gst_rate: 18 }] }), /another company/);
});

test("go-live deletes nothing when the safety backup fails", async () => {
  const goLive = await import(pathToFileURL(path.join(REPO, "src/main/services/deployment/goLiveService.js")).href);
  const db = fresh();
  const vouchers = db.prepare("SELECT COUNT(*) c FROM vouchers").get().c;
  // A root whose backups folder is a file makes the backup fail before anything is deleted.
  const root = freshRoot();
  fs.writeFileSync(path.join(root, "backups"), "not a folder");
  assert.throws(() => goLive.executeGoLiveReset(db, root, { companyId: 1, confirmText: "GO-LIVE" }));
  assert.equal(db.prepare("SELECT COUNT(*) c FROM vouchers").get().c, vouchers);
});

test("go-live completion re-checks the books instead of trusting the screen's verification", async () => {
  const goLive = await import(pathToFileURL(path.join(REPO, "src/main/services/deployment/goLiveService.js")).href);
  const db = fresh();
  const root = freshRoot();
  assert.throws(() => goLive.completeGoLive(db, root, 1, "no-such-run", { overallPassed: true }), /not found/);
});

test("reversing a serial- and batch-tracked inward takes the serial and batch out of stock", () => {
  const db = fresh();
  const { wh, item } = widget(db);
  const inward = m.createRecord(db, "stock_inwards", { company_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: "A1-SER", quantity: 1, rate: 100, landed_cost: 0, serial_number: "A1-SN-1", batch_number: "A1-B1" });
  m.postStockInward(db, inward.id);
  m.reverseStockInward(db, inward.id);
  assert.equal(db.prepare("SELECT status FROM serial_numbers WHERE serial_number = 'A1-SN-1'").get().status, "Reversed");
  assert.equal(db.prepare("SELECT balance_quantity FROM batches WHERE batch_number = 'A1-B1'").get().balance_quantity, 0);
});

test("saving an invoice cannot mark it approved or posted", () => {
  const db = fresh();
  const inv = m.saveBillingVoucher(db, { header: { order_id: firstOrder(db), company_id: 1, invoice_date: "2026-07-01", invoice_status: "Approved", approval_status: "Approved", posting_status: "Posted" }, items: [{ quantity: 1, billing_rate: 100, gst_rate: 18 }] });
  assert.deepEqual(db.prepare("SELECT invoice_status, approval_status, posting_status FROM invoices WHERE id = ?").get(inv.id), { invoice_status: "Draft", approval_status: "Draft", posting_status: "Draft" });
  const pending = m.saveBillingVoucher(db, { header: { order_id: firstOrder(db), company_id: 1, invoice_date: "2026-07-01", invoice_status: "Pending Approval" }, items: [{ quantity: 1, billing_rate: 100, gst_rate: 18 }] });
  assert.equal(db.prepare("SELECT approval_status FROM invoices WHERE id = ?").get(pending.id).approval_status, "Pending Approval");
});

test("go-live readiness looks at the selected company's own set-up", async () => {
  const { calculateReadinessScore } = await import(pathToFileURL(path.join(REPO, "src/main/services/deployment/readinessService.js")).href);
  const db = fresh();
  const empty = db.prepare("INSERT INTO companies (company_name) VALUES ('A1 Not Set Up')").run().lastInsertRowid;
  const result = calculateReadinessScore(db, freshRoot(), empty);
  assert.ok(result.failedChecks.includes("Financial years exist"), JSON.stringify(result.failedChecks));
  assert.ok(result.failedChecks.includes("Chart of accounts exists"));
});

test("an inward cannot be reversed once part of its batch was issued", () => {
  const db = fresh();
  const { wh, item } = widget(db);
  const a = m.createRecord(db, "stock_inwards", { company_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: "A1-BA", quantity: 10, rate: 100, landed_cost: 0, batch_number: "A1-BATCH-A" });
  const b = m.createRecord(db, "stock_inwards", { company_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: "A1-BB", quantity: 10, rate: 100, landed_cost: 0, batch_number: "A1-BATCH-B" });
  m.postStockInward(db, a.id);
  m.postStockInward(db, b.id);
  db.prepare("UPDATE batches SET balance_quantity = 5 WHERE batch_number = 'A1-BATCH-A'").run();
  assert.throws(() => m.reverseStockInward(db, a.id), /batch A1-BATCH-A/);
  assert.equal(db.prepare("SELECT posting_status FROM stock_inwards WHERE id = ?").get(a.id).posting_status, "Posted");
});

test("a delivery challan cannot be saved under a company other than its order's", () => {
  const db = fresh();
  const other = db.prepare("INSERT INTO companies (company_name) VALUES ('A1 Challan Other')").run().lastInsertRowid;
  const wh = db.prepare("SELECT id FROM warehouses LIMIT 1").get().id;
  const item = db.prepare("SELECT id FROM items LIMIT 1").get().id;
  assert.throws(() => m.createDeliveryChallan(db, { company_id: other, order_id: firstOrder(db), lines: [{ item_id: item, warehouse_id: wh, quantity: 1 }] }), /another company/);
});

test("issuing stock for an order updates its automatic reservation", () => {
  const db = fresh();
  const { wh, item } = widget(db);
  const order = firstOrder(db);
  const inward = m.createRecord(db, "stock_inwards", { company_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: "A1-RSV", quantity: 10, rate: 100, landed_cost: 0 });
  m.postStockInward(db, inward.id);
  db.prepare("INSERT INTO order_items (company_id, order_id, item_id, quantity) VALUES (1, ?, ?, 4)").run(order, item);
  m.autoReserveOrderStock(db, order);
  const outward = m.createRecord(db, "stock_outwards", { company_id: 1, order_id: order, item_id: item, warehouse_id: wh, issue_date: "2026-07-02", quantity_issued: 4 });
  m.postStockOutward(db, outward.id);
  const reservation = db.prepare("SELECT issued_quantity, balance_reserved FROM stock_reservations WHERE order_id = ? AND item_id = ? AND status <> 'Cancelled'").get(order, item);
  assert.deepEqual(reservation, { issued_quantity: 4, balance_reserved: 0 });
});

test("one issue uses up only as much reservation as it issued when an order lists the item twice", () => {
  const db = fresh();
  const { wh, item } = widget(db);
  const order = firstOrder(db);
  const inward = m.createRecord(db, "stock_inwards", { company_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: "A1-RSV2", quantity: 10, rate: 100, landed_cost: 0 });
  m.postStockInward(db, inward.id);
  db.prepare("INSERT INTO order_items (company_id, order_id, item_id, quantity) VALUES (1, ?, ?, 3)").run(order, item);
  db.prepare("INSERT INTO order_items (company_id, order_id, item_id, quantity) VALUES (1, ?, ?, 3)").run(order, item);
  m.autoReserveOrderStock(db, order);
  const outward = m.createRecord(db, "stock_outwards", { company_id: 1, order_id: order, item_id: item, warehouse_id: wh, issue_date: "2026-07-02", quantity_issued: 3 });
  m.postStockOutward(db, outward.id);
  const issued = () => db.prepare("SELECT SUM(issued_quantity) issued FROM stock_reservations WHERE order_id = ? AND item_id = ? AND status <> 'Cancelled'").get(order, item).issued;
  assert.equal(issued(), 3);
  m.reverseStockOutward(db, outward.id);
  assert.equal(issued(), 0);
});

test("go-live reset is refused when its preconditions fail, even if called directly", async () => {
  const goLive = await import(pathToFileURL(path.join(REPO, "src/main/services/deployment/goLiveService.js")).href);
  const db = fresh();
  const vouchers = db.prepare("SELECT COUNT(*) c FROM vouchers").get().c;
  assert.throws(() => goLive.executeGoLiveReset(db, freshRoot(), { companyId: 1, confirmText: "GO-LIVE", currentEnv: "development" }), /Environment must be Production/);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM vouchers").get().c, vouchers);
});
