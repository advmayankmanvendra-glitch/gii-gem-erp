// Regression tests for the 2026-10-22 in-house audits of PR #4 (correctness, security,
// architecture). Each test builds its own throwaway database in the OS temp folder.
// Run from the repo root:  node --test scripts/audit/audit2-regressions.test.mjs
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

// Due dates must not shift a day in India; run the date tests in IST.
process.env.TZ = "Asia/Kolkata";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const m = await import(pathToFileURL(path.join(REPO, "src/main/database/init.js")).href);
const service = (rel) => import(pathToFileURL(path.join(REPO, "src/main/services", rel)).href);

const handles = [];
const roots = [];
afterEach(() => {
  while (handles.length) { const db = handles.pop(); try { if (db.open) db.close(); } catch { /* closed */ } }
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
function freshRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-audit2-"));
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
function widget(db, name = "A2 Widget") {
  const wh = m.createRecord(db, "warehouses", { company_id: 1, warehouse_name: `${name} WH`, status: "active" }).id;
  const item = m.createRecord(db, "items", { item_name: name, unit: "Nos", status: "active", gst_rate: 0, opening_stock: 0, opening_rate: 0, opening_value: 0, default_warehouse_id: wh }).id;
  return { wh, item };
}
function newOrder(db, number) {
  const dept = db.prepare("SELECT id FROM government_departments LIMIT 1").get().id;
  const emp = db.prepare("SELECT id FROM employees LIMIT 1").get().id;
  return m.createRecord(db, "supply_orders", { company_id: 1, order_number: number, order_date: "2026-06-01", order_status: "Received", institution_name: "X", department_id: dept, employee_id: emp, location: "M", supply_due_date: "2026-06-30" }).id;
}

test("go-live rollback refuses a completed or older run", async () => {
  const goLive = await service("deployment/goLiveService.js");
  const history = await service("deployment/goLiveHistoryService.js");
  const root = freshRoot();
  const older = history.recordGoLiveEntry(root, { status: "failed", backup: { fileName: "old.db" }, resetResult: {} });
  const done = history.recordGoLiveEntry(root, { status: "completed", backup: { fileName: "done.db" } });
  assert.match(goLive.failGoLiveWithRollback(root, done.id, "test").rollbackResult.reason, /is completed/);
  assert.match(goLive.failGoLiveWithRollback(root, older.id, "test").rollbackResult.reason, /not the latest/);
  assert.equal(history.getGoLiveHistory(root).find((e) => e.id === done.id).status, "completed", "entry left as it was");
});

test("go-live rollback refuses a run that never reset the books, or one with work entered after it", async () => {
  const goLive = await service("deployment/goLiveService.js");
  const history = await service("deployment/goLiveHistoryService.js");
  const db = fresh();
  const root = freshRoot();
  const stopped = history.recordGoLiveEntry(root, { status: "failed", backup: { fileName: "x.db" }, failureReason: "wrong company" });
  assert.match(goLive.failGoLiveWithRollback(root, stopped.id, "test").rollbackResult.reason, /never reset the books/);
  const maxVoucher = db.prepare("SELECT COALESCE(MAX(id), 0) id FROM vouchers").get().id;
  const run = history.recordGoLiveEntry(root, { status: "in_progress", backup: { fileName: "y.db" }, resetResult: {}, highWater: { vouchers: maxVoucher - 1 } });
  assert.throws(() => goLive.assertGoLiveRollbackSafe(db, root, run.id), /entered after go-live/);
  history.updateGoLiveEntry(root, run.id, { highWater: { vouchers: maxVoucher, invoices: 1e9, payments: 1e9, procurements: 1e9, stock_ledger: 1e9 } });
  assert.doesNotThrow(() => goLive.assertGoLiveRollbackSafe(db, root, run.id));
});

test("go-live reset needs GO-LIVE typed by the person, and records nothing otherwise", async () => {
  const goLive = await service("deployment/goLiveService.js");
  const history = await service("deployment/goLiveHistoryService.js");
  const db = fresh();
  const root = freshRoot();
  assert.throws(() => goLive.executeGoLiveReset(db, root, { companyId: 1, confirmText: "RESET" }), /type GO-LIVE/);
  assert.equal(history.getGoLiveHistory(root).length, 0);
});

test("reset rollback needs the backup to be named and never guesses one", async () => {
  const { rollbackReset } = await service("operationalResetService.js");
  const root = freshRoot();
  fs.mkdirSync(path.join(root, "backups"), { recursive: true });
  fs.writeFileSync(path.join(root, "backups", "pre_reset_other_company.db"), "x");
  const result = rollbackReset(root, "");
  assert.equal(result.success, false);
  assert.match(result.reason, /no backup was named/);
});

test("an advance cannot be adjusted against a reversed invoice", () => {
  const db = fresh();
  const dept = db.prepare("SELECT id FROM government_departments LIMIT 1").get().id;
  const so = newOrder(db, "A2-ADV");
  const pay = db.prepare("INSERT INTO payments (company_id, order_id, payment_date, payment_amount, payment_mode, posting_status) VALUES (1, ?, '2026-07-02', 500, 'NEFT', 'Draft')").run(so).lastInsertRowid;
  m.postReceiptVoucher(db, pay);
  const adv = m.createAdvanceReceipt(db, { payment_id: pay, advance_received: 500, department_id: dept, order_id: so });
  const inv = m.saveBillingVoucher(db, { header: { order_id: so, company_id: 1, invoice_date: "2026-07-03" }, items: [{ quantity: 1, billing_rate: 1000, gst_rate: 0 }] });
  assert.throws(() => m.adjustAdvanceReceipt(db, { advance_id: adv.id, billing_id: inv.id, adjusted_amount: 500 }), /posted invoice|Receivable is not available/);
  const v = m.postSalesVoucher(db, inv.id);
  m.reverseVoucher(db, v.id, "wrong invoice");
  assert.throws(() => m.adjustAdvanceReceipt(db, { advance_id: adv.id, billing_id: inv.id, adjusted_amount: 500 }), /reversed/);
  assert.deepEqual(db.prepare("SELECT status, balance_outstanding FROM receivables WHERE billing_id = ?").get(inv.id), { status: "Reversed", balance_outstanding: 0 });
});

test("a supplier advance cannot be adjusted against a draft bill", () => {
  const db = fresh();
  const bill = m.createRecord(db, "procurements", { company_id: 1, order_id: firstOrder(db), purchase_date: "2026-07-01", supplier_id: 1, purchase_invoice_number: "A2-DRAFT", purchase_value: 1000, purchase_gst: 0 });
  const advance = db.prepare("INSERT INTO supplier_advances (company_id, supplier_id, advance_paid, balance_advance) VALUES (1, 1, 500, 500)").run().lastInsertRowid;
  assert.throws(() => m.adjustSupplierAdvance(db, { advance_id: advance, procurement_id: bill.id, adjusted_amount: 100 }), /draft/i);
});

test("returning goods that were never billed clears GRNI even when another receipt was billed", () => {
  const db = fresh();
  const billedItem = widget(db, "A2 Billed");
  const unbilledItem = widget(db, "A2 Unbilled");
  const order = firstOrder(db);
  const bill = m.createRecord(db, "procurements", { company_id: 1, order_id: order, purchase_date: "2026-07-01", supplier_id: 1, purchase_invoice_number: "A2-RET", purchase_value: 1000, purchase_gst: 0 });
  const a = m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, procurement_id: bill.id, supplier_id: 1, item_id: billedItem.item, warehouse_id: billedItem.wh, inward_date: "2026-07-01", purchase_invoice_number: "A2-RET", quantity: 10, rate: 100, landed_cost: 0 });
  m.postStockInward(db, a.id);
  m.postPurchaseVoucher(db, bill.id);
  const b = m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, supplier_id: 1, item_id: unbilledItem.item, warehouse_id: unbilledItem.wh, inward_date: "2026-07-02", purchase_invoice_number: "A2-RET-B", quantity: 10, rate: 100, landed_cost: 0 });
  m.postStockInward(db, b.id);
  const payables = balance(db, "Trade Payables");
  const grni = balance(db, "Goods Received Not Invoiced");
  const ret = m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", order_id: order, supplier_id: 1, item_id: unbilledItem.item, warehouse_id: unbilledItem.wh, return_date: "2026-07-03", quantity: 10 });
  m.postStockReturn(db, ret.id);
  assert.equal(balance(db, "Trade Payables"), payables, "billed supplier balance untouched");
  assert.equal(Math.round((balance(db, "Goods Received Not Invoiced") - grni) * 100) / 100, 1000, "GRNI liability for the returned goods is cleared");
  // Returning the billed item still reduces the supplier payable.
  const ret2 = m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", order_id: order, supplier_id: 1, item_id: billedItem.item, warehouse_id: billedItem.wh, return_date: "2026-07-03", quantity: 2 });
  m.postStockReturn(db, ret2.id);
  assert.equal(Math.round((balance(db, "Trade Payables") - payables) * 100) / 100, 200);
});

test("a return of partly billed goods splits between Trade Payables and GRNI", () => {
  const db = fresh();
  const { wh, item } = widget(db, "A2 Split");
  const order = firstOrder(db);
  const bill = m.createRecord(db, "procurements", { company_id: 1, order_id: order, purchase_date: "2026-07-01", supplier_id: 1, purchase_invoice_number: "A2-SPLIT", purchase_value: 500, purchase_gst: 0 });
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, procurement_id: bill.id, supplier_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: "A2-SPLIT", quantity: 5, rate: 100, landed_cost: 0 }).id);
  m.postPurchaseVoucher(db, bill.id);
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-02", purchase_invoice_number: "A2-SPLIT-B", quantity: 3, rate: 100, landed_cost: 0 }).id);
  const payables = balance(db, "Trade Payables");
  const grni = balance(db, "Goods Received Not Invoiced");
  const ret = m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, return_date: "2026-07-03", quantity: 5 });
  m.postStockReturn(db, ret.id);
  assert.equal(Math.round((balance(db, "Goods Received Not Invoiced") - grni) * 100) / 100, 300);
  assert.equal(Math.round((balance(db, "Trade Payables") - payables) * 100) / 100, 200);
});

test("a record cannot link to another company's order, bill or warehouse", () => {
  const db = fresh();
  const other = db.prepare("INSERT INTO companies (company_name) VALUES ('A2 Other Co')").run().lastInsertRowid;
  const foreignWh = m.createRecord(db, "warehouses", { company_id: other, warehouse_name: "A2 Foreign WH", status: "active" }).id;
  const { item } = widget(db, "A2 Link");
  assert.throws(() => m.createRecord(db, "stock_inwards", { company_id: 1, item_id: item, warehouse_id: foreignWh, inward_date: "2026-07-01", purchase_invoice_number: "A2-X", quantity: 1, rate: 1, landed_cost: 0 }), /another company/);
  assert.throws(() => m.createRecord(db, "procurements", { company_id: other, order_id: firstOrder(db), purchase_date: "2026-07-01", supplier_id: 1, purchase_invoice_number: "A2-X2", purchase_value: 10, purchase_gst: 0 }), /another company/);
});

test("reversing an over-issue never reserves more than the reservation held", () => {
  const db = fresh();
  const { wh, item } = widget(db, "A2 Reserve");
  const order = firstOrder(db);
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: "A2-RSV", quantity: 20, rate: 10, landed_cost: 0 }).id);
  db.prepare("INSERT INTO order_items (company_id, order_id, item_id, quantity) VALUES (1, ?, ?, 5)").run(order, item);
  m.autoReserveOrderStock(db, order);
  const out = m.createRecord(db, "stock_outwards", { company_id: 1, order_id: order, item_id: item, warehouse_id: wh, issue_date: "2026-07-02", quantity_issued: 8 });
  m.postStockOutward(db, out.id);
  m.reverseStockOutward(db, out.id);
  const row = db.prepare("SELECT reserved_quantity, issued_quantity, balance_reserved FROM stock_reservations WHERE order_id = ? AND item_id = ? AND status <> 'Cancelled'").get(order, item);
  assert.equal(row.issued_quantity, 0);
  assert.ok(row.balance_reserved <= row.reserved_quantity, JSON.stringify(row));
});

test("readiness does not fail a company that carries input GST credit forward", async () => {
  const { assessGst } = await service("deployment/readinessService.js");
  const db = fresh();
  const bill = m.createRecord(db, "procurements", { company_id: 1, order_id: firstOrder(db), purchase_date: "2026-07-01", supplier_id: 1, purchase_invoice_number: "A2-ITC", purchase_value: 100000000, purchase_gst: 18000000 });
  m.postPurchaseVoucher(db, bill.id);
  const check = assessGst(db, 1).checks.find((c) => c.key === "gstReconciled");
  assert.equal(check.passed, true, check.detail);
});

test("credit due dates are not a day early in India", () => {
  const db = fresh();
  const so = newOrder(db, "A2-DUE");
  const inv = m.saveBillingVoucher(db, { header: { order_id: so, company_id: 1, invoice_date: "2026-10-22" }, items: [{ quantity: 1, billing_rate: 1000, gst_rate: 0 }] });
  m.postSalesVoucher(db, inv.id);
  const due = db.prepare("SELECT due_date FROM receivables WHERE billing_id = ?").get(inv.id)?.due_date;
  const term = db.prepare("SELECT default_credit_days, grace_period FROM credit_terms WHERE company_id = 1 AND status = 'active'").get();
  const days = term ? Number(term.default_credit_days) + Number(term.grace_period || 0) : 30;
  const expected = new Date(Date.UTC(2026, 9, 22 + days)).toISOString().slice(0, 10);
  assert.equal(due, expected);
});

test("CSV exports open formula-looking cells as text", async () => {
  const { csvCell } = await import(pathToFileURL(path.join(REPO, "src/renderer/utils/spreadsheetExport.js")).href);
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("-500"), "-500");
  assert.equal(csvCell("Supplier A"), "Supplier A");
  const formatters = await import(pathToFileURL(path.join(REPO, "src/renderer/utils/formatters.js")).href);
  const csvSafety = await import(pathToFileURL(path.join(REPO, "src/main/domain/csvSafety.js")).href);
  for (const neutralize of [formatters.neutralizeFormula, csvSafety.neutralizeFormula]) {
    assert.equal(neutralize("=1+1"), "'=1+1");
    assert.equal(neutralize("-12.5"), "-12.5");
    assert.equal(neutralize("-1,234.50"), "-1,234.50");
    assert.equal(neutralize("+91 98765 43210"), "+91 98765 43210");
    assert.equal(neutralize("-2+3"), "'-2+3");
  }
});

test("an .xlsx that inflates past the limit is refused instead of freezing the app", () => {
  // One stored-deflate entry that expands to 70 MB of zeros.
  const name = Buffer.from("xl/worksheets/sheet1.xml");
  const data = zlib.deflateRawSync(Buffer.alloc(70 * 1024 * 1024));
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
  const cdOffset = local.length + name.length + data.length;
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(central.length + name.length, 12); eocd.writeUInt32LE(cdOffset, 16);
  const zip = Buffer.concat([local, name, data, central, name, eocd]);
  assert.throws(() => m.parseImportBuffer("bomb.xlsx", zip), /expands to more than 64 MB/);
  assert.throws(() => m.parseImportBuffer("big.csv", Buffer.alloc(26 * 1024 * 1024)), /limit is 25 MB/);
});
