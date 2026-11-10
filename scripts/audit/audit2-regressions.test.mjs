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
  assert.throws(() => goLive.assertGoLiveRollbackSafe(db, root, run.id), /changed after go-live/, "older five-table marks still work");
  history.updateGoLiveEntry(root, run.id, { highWater: { vouchers: maxVoucher, invoices: 1e9, payments: 1e9, procurements: 1e9, stock_ledger: 1e9 } });
  assert.doesNotThrow(() => goLive.assertGoLiveRollbackSafe(db, root, run.id));
});

test("go-live rollback sees any new or edited record, not just vouchers and bills", async () => {
  const goLive = await service("deployment/goLiveService.js");
  const history = await service("deployment/goLiveHistoryService.js");
  const root = freshRoot();
  const check = (db, mark) => {
    const run = history.recordGoLiveEntry(root, { status: "in_progress", backup: { fileName: "z.db" }, resetResult: {}, highWater: mark });
    return () => goLive.assertGoLiveRollbackSafe(db, root, run.id);
  };
  let db = fresh();
  let safe = check(db, goLive.bookHighWater(db));
  assert.doesNotThrow(safe, "nothing entered yet");
  m.createRecord(db, "suppliers", { supplier_name: "After Go-Live", status: "active" });
  assert.throws(safe, /suppliers changed after go-live/);
  db = fresh();
  const supplier = db.prepare("SELECT * FROM suppliers ORDER BY id LIMIT 1").get();
  safe = check(db, goLive.bookHighWater(db));
  m.updateRecord(db, "suppliers", supplier.id, { ...supplier, remarks: "edited after go-live" });
  assert.throws(safe, /suppliers changed after go-live/, "an edit adds no row but is still seen");
  db = fresh();
  safe = check(db, goLive.bookHighWater(db));
  m.auditLog(db, { company_id: 1, action: "voucher drilldown access", table_name: "vouchers", record_id: 1 });
  m.auditLog(db, { company_id: 1, action: "document view", table_name: "documents", record_id: 1 });
  m.auditLog(db, { company_id: 1, action: "permission_denied", table_name: "suppliers" });
  assert.doesNotThrow(safe, "looking at records or a refused action is not new work");
});

test("a go-live whose reset finished but whose history update was lost can still be rolled back", async () => {
  const goLive = await service("deployment/goLiveService.js");
  const { GO_LIVE_RESET_MODULE } = await service("operationalResetService.js");
  const history = await service("deployment/goLiveHistoryService.js");
  const root = freshRoot();
  const db = fresh();
  const start = () => db.prepare("SELECT COALESCE(MAX(id), 0) id FROM audit_log").get().id;
  const resetRow = () => m.auditLog(db, { company_id: 1, action: "operational_reset", module: GO_LIVE_RESET_MODULE, table_name: "system", new_value: "{}" });
  let lost = history.recordGoLiveEntry(root, { status: "in_progress", backup: { fileName: "missing.db" }, auditIdAtStart: start(), companyId: 1 });
  const result = goLive.failGoLiveWithRollback(root, lost.id, "test");
  assert.doesNotMatch(result.rollbackResult.reason || "", /never reset the books/);
  // Without its stored mark, the rollback check uses the run's start and its own reset row.
  assert.throws(() => goLive.assertGoLiveRollbackSafe(db, root, lost.id), /no record of a reset/);
  resetRow();
  assert.doesNotThrow(() => goLive.assertGoLiveRollbackSafe(db, root, lost.id));
  m.createRecord(db, "suppliers", { supplier_name: "Entered After Lost Mark", status: "active" });
  assert.throws(() => goLive.assertGoLiveRollbackSafe(db, root, lost.id), /suppliers changed after go-live/);
  resetRow();
  assert.throws(() => goLive.assertGoLiveRollbackSafe(db, root, lost.id), /suppliers changed after go-live/, "a later reset does not hide earlier work");
  // A run that stopped before its reset: work entered, then a separate Enhanced Reset.
  lost = history.recordGoLiveEntry(root, { status: "in_progress", backup: { fileName: "missing2.db" }, auditIdAtStart: start(), companyId: 1 });
  m.createRecord(db, "suppliers", { supplier_name: "Entered Before Another Reset", status: "active" });
  resetRow();
  assert.throws(() => goLive.assertGoLiveRollbackSafe(db, root, lost.id), /suppliers changed after go-live/);
  // An older entry with neither a stored mark nor a start position cannot be checked: refused,
  // even when a later Enhanced Reset row exists.
  const legacy = history.recordGoLiveEntry(root, { status: "in_progress", backup: { fileName: "legacy.db" }, companyId: 1, generatedAt: "2026-10-01T00:00:00.000Z" });
  m.createRecord(db, "suppliers", { supplier_name: "T4 Live Work", status: "active" });
  resetRow();
  assert.throws(() => goLive.assertGoLiveRollbackSafe(db, root, legacy.id), (error) => error.code === goLive.ROLLBACK_REFUSED && /older version/.test(error.message));
  const failed = history.recordGoLiveEntry(root, { status: "failed", resetFailed: true, backup: { fileName: "x.db" }, failureReason: "disk full" });
  assert.match(goLive.failGoLiveWithRollback(root, failed.id, "test").rollbackResult.reason, /never reset the books/);
});

test("the go-live history is replaced whole on each write and rejects reused ids", async () => {
  const history = await service("deployment/goLiveHistoryService.js");
  const root = freshRoot();
  const first = history.recordGoLiveEntry(root, { status: "in_progress" });
  history.updateGoLiveEntry(root, first.id, { status: "failed" });
  const file = path.join(root, "deployment", "go-live-history.json");
  assert.equal(JSON.parse(fs.readFileSync(`${file}.bak`, "utf8")).entries[0].status, "in_progress", "previous version kept");
  assert.deepEqual(fs.readdirSync(path.dirname(file)).filter((name) => name.includes(".tmp-")), [], "no temp file left behind");
  fs.writeFileSync(file, JSON.stringify({ entries: [{ id: 3 }], nextId: 2 }));
  assert.throws(() => history.getGoLiveHistory(root), /was damaged/, "nextId at or below an existing id is refused");
});

test("a partial supplier update keeps the name and the other stored fields", () => {
  const db = fresh();
  const supplier = db.prepare("SELECT * FROM suppliers ORDER BY id LIMIT 1").get();
  m.updateRecord(db, "suppliers", supplier.id, { supplier_account_name: "Account Name Only" });
  const after = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplier.id);
  assert.equal(after.supplier_name, supplier.supplier_name, "sending only the account name does not rename the supplier");
  assert.equal(after.supplier_account_name, "Account Name Only");
  assert.equal(after.supplier_account_number, supplier.supplier_account_number);
  assert.equal(after.gstin, supplier.gstin);
  m.updateRecord(db, "suppliers", supplier.id, { beneficiary_account_name: "Beneficiary Name" });
  m.updateRecord(db, "suppliers", supplier.id, { branch: "" });
  const later = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplier.id);
  assert.equal(later.supplier_name, supplier.supplier_name, "a beneficiary-name alias does not rename the supplier");
  assert.equal(later.supplier_account_name, "Beneficiary Name");
  assert.equal(later.supplier_branch, supplier.supplier_branch, "a blank alias does not blank the stored branch");
  m.updateRecord(db, "suppliers", supplier.id, { account_number: null, supplier_branch: later.supplier_branch, branch: "Other" });
  const last = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplier.id);
  assert.equal(last.supplier_account_number, supplier.supplier_account_number, "a null alias does not blank the account number");
  assert.equal(last.supplier_branch, later.supplier_branch, "the column wins over a disagreeing alias");
  assert.equal(last.bank_details, later.bank_details, "nothing changed, so the bank text is kept");
  m.updateRecord(db, "suppliers", supplier.id, { supplier_bank_ifsc_code: ` ${supplier.supplier_bank_ifsc_code}\u2028` });
  assert.equal(db.prepare("SELECT supplier_bank_ifsc_code c FROM suppliers WHERE id = ?").get(supplier.id).c, supplier.supplier_bank_ifsc_code, "bank values are stored trimmed");
});

test("the signed-in user survives an await inside a handler", async () => {
  const seen = await m.runAsActor({ id: 7, role: "accountant" }, async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return m.currentActor();
  });
  assert.deepEqual(seen, { id: 7, role: "accountant" });
  assert.equal(m.currentActor(), null, "no actor outside the call");
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

test("master-data export and re-import keeps apostrophes and formula-like names exactly", async () => {
  const tools = await service("masterDataToolsService.js");
  const parser = (await service("importParserService.js")).createImportParserService();
  const db = fresh();
  const names = ["'Gold Ring", "=SUM(A1)", "''Two", "-500", "@Note", "'=Kept as typed", "'-2+3"];
  names.forEach((item_name, i) => m.createRecord(db, "items", { item_name, item_code: `RT-${i}`, unit: "Nos", status: "active", gst_rate: 0 }));
  const exported = tools.exportMasterData(db, { masterKey: "items", exportType: "all" }, { company_id: 1 });
  const rows = parser.parseImportBuffer("items.csv", Buffer.from(exported.csv)).filter((row) => String(row.item_code).startsWith("RT-"));
  assert.equal(rows.length, names.length);
  const preview = tools.previewMasterDataUpdate(db, { masterKey: "items", mode: "update_existing", rows }, { company_id: 1 });
  for (const row of preview.rows) {
    assert.equal(row.action, "updated", row.errors.join("; "));
    assert.deepEqual(row.changes.filter((change) => /name/.test(change.field || change.key || "")), [], `${row.code} came back changed`);
  }
  assert.deepEqual(preview.rows.map((row) => row.name).sort(), [...names].sort());
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

function sheetZip(sheetXml) {
  const name = Buffer.from("xl/worksheets/sheet1.xml");
  const data = zlib.deflateRawSync(Buffer.from(sheetXml));
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt16LE(name.length, 28);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(central.length + name.length, 12); eocd.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, central, name, eocd]);
}

test("an import with a crafted very wide header is refused quickly", () => {
  const header = Array.from({ length: 20000 }, (_, i) => `c${i}`).join(",");
  const started = Date.now();
  assert.throws(() => m.parseImportBuffer("wide.csv", Buffer.from(`${header}\n${"x\n".repeat(4000)}`)), /the limit is 500|more than 16,384 cells/);
  const html = `<table><tr><td>supplier_name</td></tr><tr><td>${"<".repeat(160000)}</td></tr></table>`;
  assert.equal(m.parseImportBuffer("lt.xls", Buffer.from(html)).length, 1);
  assert.ok(Date.now() - started < 2000, `took ${Date.now() - started} ms`);
});

test("real wide sheets still import: blank trailing headers and 300 columns x 15,000 rows", () => {
  const header = Array.from({ length: 300 }, (_, i) => `c${i}`).join(",") + ",".repeat(250);
  const row = Array(300).fill("x").join(",");
  const rows = m.parseImportBuffer("wide.csv", Buffer.from(`${header}\n${`${row}\n`.repeat(15000)}`));
  assert.equal(rows.length, 15000);
  assert.equal(Object.keys(rows[0]).length, 300);
});

test("an .xlsx full of unclosed tags is read quickly, and normal sheets still parse", () => {
  for (const body of ["<row>".repeat(200000), `<row r="1">${"<c r=\"A1\">".repeat(200000)}</row>`]) {
    const started = Date.now();
    m.parseImportBuffer("tags.xlsx", sheetZip(`<worksheet><sheetData>${body}</sheetData></worksheet>`));
    assert.ok(Date.now() - started < 2000, `took ${Date.now() - started} ms`);
  }
  const rows = m.parseImportBuffer("ok.xlsx", sheetZip('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>supplier_name</t></is></c><c r="B1"/><c r="C1" t="inlineStr"><is><t>remarks</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Acme &amp; Co</t></is></c><c r="C2"><v>42</v></c></row></sheetData></worksheet>'));
  assert.deepEqual(rows, [{ supplier_name: "Acme & Co", remarks: "42" }]);
});

// ---- 219b2d3 audit fixes (security N9-N12, architecture N1-N4) ----

test("go-live rollback sees allocation and bank-proposal work, and proposal writes leave audit rows", async () => {
  const goLive = await service("deployment/goLiveService.js");
  const history = await service("deployment/goLiveHistoryService.js");
  const root = freshRoot();
  const db = fresh();
  const run = history.recordGoLiveEntry(root, { status: "in_progress", backup: { fileName: "a.db" }, resetResult: {}, highWater: goLive.bookHighWater(db) });
  db.prepare("INSERT INTO allocation_audit (company_id, allocation_type, action) VALUES (1, 'receipt', 'unallocate')").run();
  assert.throws(() => goLive.assertGoLiveRollbackSafe(db, root, run.id), /allocation audit changed after go-live/);

  const db2 = fresh();
  db2.pragma("foreign_keys = OFF");
  const proposal = db2.prepare("INSERT INTO voucher_proposals (company_id, bank_entry_id, transaction_date, suggested_voucher_type, status) VALUES (1, 1, '2026-06-01', 'Receipt', 'Suggested')").run().lastInsertRowid;
  db2.pragma("foreign_keys = ON");
  const run2 = history.recordGoLiveEntry(root, { status: "in_progress", backup: { fileName: "b.db" }, resetResult: {}, highWater: goLive.bookHighWater(db2) });
  m.rejectVoucherProposal(db2, proposal, null, "wrong party");
  assert.throws(() => goLive.assertGoLiveRollbackSafe(db2, root, run2.id), /voucher proposal/);
  const row = db2.prepare("SELECT * FROM audit_log WHERE table_name = 'voucher_proposals' ORDER BY id DESC LIMIT 1").get();
  assert.equal(row.action, "voucher proposal rejected");
  assert.equal(row.record_id, proposal);
});

test("a rollback mark taken at audit position 0 still checks the audit trail", async () => {
  const goLive = await service("deployment/goLiveService.js");
  const history = await service("deployment/goLiveHistoryService.js");
  const root = freshRoot();
  const db = fresh();
  const mark = goLive.bookHighWater(db);
  const supplier = db.prepare("SELECT * FROM suppliers ORDER BY id LIMIT 1").get();
  const run = history.recordGoLiveEntry(root, { status: "in_progress", backup: { fileName: "z.db" }, resetResult: {}, highWater: { ...mark, auditId: 0 } });
  m.updateRecord(db, "suppliers", supplier.id, { ...supplier, remarks: "edited" });
  // Position 0 is a real mark (an empty audit trail), not "no mark".
  assert.throws(() => goLive.assertGoLiveRollbackSafe(db, root, run.id), /\bsuppliers\b.*changed after go-live/);
});

test("bank values are cleaned before the supplier bank text is built, and numbers keep their digits", () => {
  const db = fresh();
  const id = m.createRecord(db, "suppliers", { supplier_name: "Bank Clean", status: "active", supplier_account_number: " 123456 ", supplier_bank_ifsc_code: "​SBIN0000001", supplier_bank_name: "SBI" }).id;
  let s = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
  assert.equal(s.supplier_account_number, "123456");
  assert.equal(s.supplier_bank_ifsc_code, "SBIN0000001");
  assert.match(s.bank_details, /Account Number: 123456; Bank: SBI; IFSC: SBIN0000001;/);
  // The same IFSC resent with an invisible character is not a change: the text is kept.
  m.updateRecord(db, "suppliers", id, { supplier_bank_ifsc_code: "SBIN0000001​" });
  assert.equal(db.prepare("SELECT bank_details FROM suppliers WHERE id = ?").get(id).bank_details, s.bank_details);
  m.updateRecord(db, "suppliers", id, { supplier_account_number: 111122223333 });
  s = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
  assert.equal(s.supplier_account_number, "111122223333");
  assert.match(s.bank_details, /Account Number: 111122223333;/);
  assert.throws(() => m.updateRecord(db, "suppliers", id, { supplier_account_number: 1.5e21 }), /must be entered as text/);
  assert.throws(() => m.updateRecord(db, "suppliers", id, { account_number: false }), /must be entered as text/);
  assert.throws(() => m.updateRecord(db, "suppliers", id, { supplier_bank_ifsc_code: { x: 1 } }), /must be entered as text/);
  assert.equal(db.prepare("SELECT supplier_account_number FROM suppliers WHERE id = ?").get(id).supplier_account_number, "111122223333", "refusals change nothing");
});

test("import parser caps: long header names, shared-string count, blank TSV lines, and a header too far down", () => {
  const long = "h".repeat(101);
  assert.throws(() => m.parseImportBuffer("long.csv", Buffer.from(`supplier_name,${long}\nA,B\n`)), /header of 101 characters; the limit is 100/);
  const strings = `<sst>${"<si><t></t></si>".repeat(2000001)}</sst>`;
  const zip = (files) => {
    const parts = []; const centrals = []; let offset = 0;
    for (const [n, text] of Object.entries(files)) {
      const name = Buffer.from(n); const data = zlib.deflateRawSync(Buffer.from(text));
      const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(name.length, 26);
      const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
      parts.push(local, name, data); centrals.push(central, name); offset += local.length + name.length + data.length;
    }
    const cd = Buffer.concat(centrals);
    const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(centrals.length / 2, 8); eocd.writeUInt16LE(centrals.length / 2, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
    return Buffer.concat([...parts, cd, eocd]);
  };
  let started = Date.now();
  assert.throws(() => m.parseImportBuffer("ss.xlsx", zip({ "xl/sharedStrings.xml": strings, "xl/worksheets/sheet1.xml": "<worksheet/>" })), /more than 2,000,000 text values|expands \d+ times when opened/);
  assert.ok(Date.now() - started < 3000, `took ${Date.now() - started} ms`);
  // Blank lines do not count toward the row limit.
  const tsv = m.parseImportBuffer("t.xls", Buffer.from(`supplier_name\tcity\nA\tX\n${"\n".repeat(200005)}B\tY\n`));
  assert.equal(tsv.length, 2);
  const row = (r, v) => `<row r="${r}"><c r="A${r}" t="inlineStr"><is><t>${v}</t></is></c></row>`;
  const title = Array.from({ length: 60 }, (_, i) => row(i + 1, `title ${i}`)).join("");
  const row2 = (r, a, b) => `<row r="${r}"><c r="A${r}" t="inlineStr"><is><t>${a}</t></is></c><c r="B${r}" t="inlineStr"><is><t>${b}</t></is></c></row>`;
  assert.throws(() => m.parseImportBuffer("far.xlsx", sheetZip(`<worksheet><sheetData>${title}${row2(61, "supplier_name", "city")}${row2(62, "Acme", "Pune")}</sheetData></worksheet>`)), /is Excel row 61/);
  // In a sheet with wider rows, a lone cell far down that reads like a title is data.
  const wide = Array.from({ length: 60 }, (_, i) => row2(i + 1, `date ${i}`, `amount ${i}`)).join("");
  assert.equal(m.parseImportBuffer("data.xlsx", sheetZip(`<worksheet><sheetData>${wide}${row(61, "item_name")}</sheetData></worksheet>`)).length, 60);
  // In a one-column sheet, a header has one cell, so a late one is refused, not misread.
  assert.throws(() => m.parseImportBuffer("one.xlsx", sheetZip(`<worksheet><sheetData>${title}${row(61, "item_name")}${row(62, "Bolt")}</sheetData></worksheet>`)), /is Excel row 61/);
  const near = Array.from({ length: 5 }, (_, i) => row(i + 1, `title ${i}`)).join("");
  assert.deepEqual(m.parseImportBuffer("near.xlsx", sheetZip(`<worksheet><sheetData>${near}${row(6, "supplier_name")}${row(7, "Acme")}</sheetData></worksheet>`)), [{ supplier_name: "Acme" }]);
  // Long cells are skipped by the header search at once.
  // Varied text, as in a real sheet (a sheet of one repeated character is refused as a zip bomb).
  let seed = 7;
  const varied = (n) => Array.from({ length: n }, () => { seed = (seed * 1103515245 + 12345) % 2147483648; return "abcdefghij klmnopqrst"[seed % 21]; }).join("");
  const spaces = `<row r="1">${Array.from({ length: 2000 }, () => `<c r="A1" t="inlineStr"><is><t>a${varied(30000)}b</t></is></c>`).join("")}</row>`;
  started = Date.now();
  m.parseImportBuffer("sp.xlsx", sheetZip(`<worksheet><sheetData>${spaces}${row(2, "supplier_name")}</sheetData></worksheet>`));
  assert.ok(Date.now() - started < 3000, `took ${Date.now() - started} ms`);
});

test("the Tally migration preview reads a file picked twice only once, and caps the list", async () => {
  const db = fresh();
  const admin = db.prepare("SELECT * FROM users WHERE role IN ('admin', 'super_admin') ORDER BY id LIMIT 1").get();
  const root = freshRoot();
  const preview = (files) => m.previewTallyMasterMigration(db, files, { user_id: admin.id });
  const file = path.join(root, "masters.xml");
  fs.writeFileSync(file, "<ENVELOPE><BODY><DATA><TALLYMESSAGE><LEDGER NAME=\"Cash\"><PARENT>Cash-in-hand</PARENT></LEDGER></TALLYMESSAGE></DATA></BODY></ENVELOPE>");
  const once = preview([{ filePath: file }]);
  const twice = preview([{ filePath: file }, { filePath: file }, { filePath: path.join(root, ".", "masters.xml") }]);
  const summaries = (result) => result.fileSummaries || result.summary?.fileSummaries || result.files;
  assert.equal(summaries(once).length, 1);
  assert.equal(summaries(twice).length, 1, "the same file picked three times is read once");
  const many = Array.from({ length: 21 }, (_, i) => { const f = path.join(root, `m${i}.xml`); fs.writeFileSync(f, "<ENVELOPE/>"); return { filePath: f }; });
  assert.throws(() => preview(many), /reads at most 20/);
  const big = Array.from({ length: 2 }, (_, i) => { const f = path.join(root, `big${i}.xml`); fs.writeFileSync(f, Buffer.alloc(26 * 1024 * 1024, 32)); return { filePath: f }; });
  assert.throws(() => preview(big), /one preview reads at most 50 MB/);
  const huge = path.join(root, "huge.xml"); fs.writeFileSync(huge, Buffer.alloc(51 * 1024 * 1024, 32));
  assert.throws(() => preview([{ filePath: huge }]), /huge\.xml is 51\.0 MB.*export the masters in parts/);
});

test("CRAC writes and the closure mark are audited with their company, in the same transaction", async () => {
  const crac = await service("cracService.js");
  const db = fresh();
  const audit = (entry) => m.auditLog(db, entry);
  const order = firstOrder(db);
  const record = crac.createCracRecord(db, { company_id: 1, supply_order_id: order, crac_status: "Pending" }, audit);
  crac.updateCracRecord(db, record.id, { remarks: "checked" }, audit);
  crac.deleteCracRecord(db, record.id, null, audit);
  const rows = db.prepare("SELECT action, company_id, old_value FROM audit_log WHERE table_name = 'crac_records' ORDER BY id").all();
  assert.deepEqual(rows.map((row) => [row.action, row.company_id]), [["crac_created", 1], ["crac_updated", 1], ["crac_deleted", 1]]);
  assert.ok(rows[2].old_value, "the delete row keeps what was deleted");
  // A failing audit write rolls the CRAC write back.
  const before = db.prepare("SELECT COUNT(*) c FROM crac_records").get().c;
  assert.throws(() => crac.createCracRecord(db, { company_id: 1, supply_order_id: order }, () => { throw new Error("audit down"); }), /audit down/);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM crac_records").get().c, before);
});

test("219b2d3+1 round: undefined, invisible and conflicting supplier values never wipe stored bank details", () => {
  const db = fresh();
  const id = m.createRecord(db, "suppliers", { supplier_name: "Keep Bank", status: "active", supplier_account_number: "123456", supplier_bank_ifsc_code: "SBIN0000001", supplier_branch: "Pune" }).id;
  const before = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
  const changes = () => db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action = 'bank_details_changed'").get().c;
  const logged = changes();
  for (const payload of [{ supplier_account_number: undefined }, { bank_details: undefined }, { branch: "\u200B" }, { ifsc: "\uFEFF" }, { supplier_branch: null }, { remarks: "x", supplier_bank_ifsc_code: "SBIN0000001\u200B" }]) {
    m.updateRecord(db, "suppliers", id, payload);
    const after = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
    for (const field of ["supplier_account_number", "supplier_bank_ifsc_code", "supplier_branch", "bank_details"]) {
      assert.equal(after[field], before[field], `${JSON.stringify(payload)} changed ${field}`);
    }
  }
  assert.equal(changes(), logged, "no bank change was logged");
});

test("219b2d3+1 round: yes/no values are stored as 1/0 and lists are refused with a guided message", () => {
  const db = fresh();
  const id = m.createRecord(db, "suppliers", { supplier_name: "Typed Values", status: "active" }).id;
  assert.throws(() => m.updateRecord(db, "suppliers", id, { contact_details: { a: 1 } }), /contact details must be a single value/);
  m.updateRecord(db, "suppliers", id, { remarks: false });
  assert.equal(db.prepare("SELECT remarks FROM suppliers WHERE id = ?").get(id).remarks, "0", "stored as \"0\", not \"0.0\"");
});

test("219b2d3+1 round: xlsx text values and blank-line files are refused before they hold the app", () => {
  const big = `<sst><si><t>${"&amp;".repeat(40000)}</t></si></sst>`;
  const name = "xl/sharedStrings.xml";
  const files = { [name]: big, "xl/worksheets/sheet1.xml": "<worksheet/>" };
  const parts = []; const centrals = []; let offset = 0;
  for (const [n, text] of Object.entries(files)) {
    const nb = Buffer.from(n); const data = zlib.deflateRawSync(Buffer.from(text));
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(nb.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt16LE(nb.length, 28); central.writeUInt32LE(offset, 42);
    parts.push(local, nb, data); centrals.push(central, nb); offset += local.length + nb.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(2, 8); eocd.writeUInt16LE(2, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  assert.throws(() => m.parseImportBuffer("long.xlsx", Buffer.concat([...parts, cd, eocd])), /longer than 32,767 characters/);
  const started = Date.now();
  assert.throws(() => m.parseImportBuffer("blank.xls", Buffer.from(`supplier_name\tcity\n${"\n".repeat(400005)}`)), /blank lines included/);
  assert.ok(Date.now() - started < 1500, `took ${Date.now() - started} ms`);
});

test("219b2d3+1 round: a failing audit write rolls back a proposal change, and CRAC writes need an audit writer", async () => {
  const crac = await service("cracService.js");
  const db = fresh();
  db.pragma("foreign_keys = OFF");
  const proposal = db.prepare("INSERT INTO voucher_proposals (company_id, bank_entry_id, transaction_date, suggested_voucher_type, status) VALUES (1, 1, '2026-06-01', 'Receipt', 'Suggested')").run().lastInsertRowid;
  db.pragma("foreign_keys = ON");
  db.exec("CREATE TEMP TRIGGER fail_proposal_audit BEFORE INSERT ON voucher_proposal_audit BEGIN SELECT RAISE(ABORT, 'audit down'); END;");
  assert.throws(() => m.rejectVoucherProposal(db, proposal, null, "x"), /audit down/);
  assert.equal(db.prepare("SELECT status FROM voucher_proposals WHERE id = ?").get(proposal).status, "Suggested");
  assert.throws(() => crac.createCracRecord(db, { company_id: 1, supply_order_id: firstOrder(db) }), /no audit writer was passed/);
});

test("219b2d3+1 round: a csv cell past Excel's limit and an oversized reply are refused quickly", () => {
  const started = Date.now();
  assert.throws(() => m.parseImportBuffer("q.csv", Buffer.from(`supplier_name\n"${"x".repeat(40000)}"\n`)), /longer than 32,767 characters/);
  assert.throws(() => m.parseImportBuffer("qq.csv", Buffer.from(`supplier_name\n"${'""'.repeat(40000)}"\n`)), /longer than 32,767 characters/);
  const header = Array.from({ length: 400 }, (_, i) => `h${String(i).padStart(3, "0")}${"x".repeat(90)}`).join(",");
  assert.throws(() => m.parseImportBuffer("wide.csv", Buffer.from(`${header}\n${"a\n".repeat(4000)}`)), /more than one import can hold|more text than one import can hold/);
  assert.ok(Date.now() - started < 2000, `took ${Date.now() - started} ms`);
});

test("Profit Simulator: the scenario is calculated in the main process from the profitability report", async () => {
  const sim = await service("profitSimulatorService.js");
  const rows = [
    { billingValue: 1000, purchaseValue: 600, grossMargin: 400, gstInputLoss: 0, totalExpenses: 100, employeeIncentive: 30, netCompanyProfit: 270 },
    { billingValue: 500, inventoryCostBasis: 300, purchaseValue: 350, grossMargin: 200, gstInputLoss: 10, totalExpenses: 50, employeeIncentive: 14, netCompanyProfit: 126 }
  ];
  const { baseline, scenario } = sim.profitSimulation(rows, {});
  assert.equal(baseline.billingValue, 1500);
  assert.equal(baseline.purchaseValue, 900, "the inventory cost basis wins over the purchase value");
  assert.equal(scenario.billing, 1500);
  assert.equal(scenario.netProfit, 1500 - 900 - 10 - 150, "no adjustment: billing less cost, GST loss and expenses");
  const raised = sim.simulateScenario(baseline, { billingAdjustment: 10, incentivePercent: 5000 });
  assert.ok(Math.abs(raised.billing - 1650) < 1e-6);
  assert.ok(Math.abs(raised.netProfit) < 1e-6, "an incentive above 100% is held at 100%");
  const db = fresh();
  assert.ok(Array.isArray(sim.profitSimulation(m.orderProfitability(db, { company_id: 1 }), {}).rows));
});

test("a go-live rollback refusal carries a code, so it is told apart from a fault without reading its text", async () => {
  const goLive = await service("deployment/goLiveService.js");
  const root = freshRoot();
  const db = fresh();
  try { goLive.assertGoLiveRollbackSafe(db, root, 12345); assert.fail("should refuse"); } catch (error) {
    assert.equal(error.code, goLive.ROLLBACK_REFUSED);
    assert.match(error.message, /^Rollback refused:/);
  }
});

test("order closure needs every posted invoice settled and nothing saved but unposted", async () => {
  const closure = await service("orderClosureService.js");
  const db = fresh();
  const so = newOrder(db, "A2-CLOSE");
  const check = (result, key) => result.checks.find((row) => row.key === key);
  const options = { outstandingFor: m.receivableOutstandingForSettlement };

  // A receipt alone, with no posted invoice, is not settlement.
  db.prepare("INSERT INTO payments (company_id, order_id, payment_date, payment_amount, payment_mode, posting_status) VALUES (1, ?, '2026-07-02', 10, 'NEFT', 'Posted')").run(so);
  let result = closure.computeOrderClosure(db, so, options);
  assert.equal(check(result, "payment_received").ready, false);

  // A saved but unposted invoice is open work.
  const inv = m.saveBillingVoucher(db, { header: { order_id: so, company_id: 1, invoice_date: "2026-07-03" }, items: [{ quantity: 1, billing_rate: 1000, gst_rate: 0 }] });
  result = closure.computeOrderClosure(db, so, options);
  assert.equal(check(result, "invoice_submitted").ready, false);
  assert.equal(check(result, "no_outstanding_issues").ready, false);
  assert.match(check(result, "no_outstanding_issues").detail, /1 invoice\(s\)/);

  // Posted but unpaid: the invoice is named as still to receive.
  m.postSalesVoucher(db, inv.id);
  result = closure.computeOrderClosure(db, so, options);
  assert.equal(check(result, "invoice_submitted").ready, true);
  assert.equal(check(result, "no_outstanding_issues").ready, true);
  assert.equal(check(result, "payment_received").ready, false);
  const number = db.prepare("SELECT invoice_number FROM invoices WHERE id = ?").get(inv.id).invoice_number;
  assert.ok(check(result, "payment_received").detail.includes(number));
  assert.throws(() => closure.markOrderOperationallyClosed(db, so, (entry) => m.auditLog(db, entry), options), /Order cannot be closed yet\. Still open: .*Payment Settled \(Still to receive on /);
  assert.equal(db.prepare("SELECT operationally_closed FROM supply_orders WHERE id = ?").get(so).operationally_closed || 0, 0);

  // Nothing left to receive: settled.
  result = closure.computeOrderClosure(db, so, { outstandingFor: () => 0 });
  assert.equal(check(result, "payment_received").ready, true);
  // No receivable on record: not provably settled. No calculation passed: refused.
  db.prepare("UPDATE receivables SET is_deleted = 1 WHERE billing_id = ?").run(inv.id);
  assert.equal(check(closure.computeOrderClosure(db, so, { outstandingFor: () => 0 }), "payment_received").ready, false);
  assert.throws(() => closure.computeOrderClosure(db, so), /no outstanding-amount calculation/);

  // Credit notes settle what they correct, in both forms the app books them.
  const dept = db.prepare("SELECT id FROM government_departments LIMIT 1").get().id;
  const pay = (order, amount) => db.prepare("INSERT INTO payments (company_id, order_id, payment_date, payment_amount, payment_mode, posting_status) VALUES (1, ?, '2026-07-05', ?, 'NEFT', 'Draft')").run(order, amount).lastInsertRowid;
  const bill = (order, amount, extra = {}) => { const saved = m.saveBillingVoucher(db, { header: { order_id: order, company_id: 1, invoice_date: "2026-07-03", ...extra }, items: [{ quantity: 1, billing_rate: amount, gst_rate: 0 }] }); m.postSalesVoucher(db, saved.id); return saved; };
  const s9 = newOrder(db, "A2-CLOSE-CN");
  bill(s9, 1000); bill(s9, 100, { invoice_type: "Credit Note" });
  m.postReceiptVoucher(db, pay(s9, 900));
  assert.equal(check(closure.computeOrderClosure(db, s9, options), "payment_received").ready, true, "a credit-note invoice nets against the order");
  const s10 = newOrder(db, "A2-CLOSE-GN");
  const corrected = bill(s10, 1000);
  const note = m.createBusinessVoucher(db, { company_id: 1, voucher_kind: "credit_note", voucher_date: "2026-07-04", taxable_value: 100, gst_rate: 18, department_id: dept, linked_invoice_id: corrected.id, reason_code: "short supply" });
  for (const step of ["submit", "review", "approve"]) m.updateGuidedVoucherStatus(db, note.id, step, 1);
  m.postGuidedVoucher(db, note.id, 1);
  m.postReceiptVoucher(db, pay(s10, 882));
  assert.equal(check(closure.computeOrderClosure(db, s10, options), "payment_received").ready, true, "a guided credit note linked to the invoice settles it, as the bill-wise report shows");
  const s12 = newOrder(db, "A2-CLOSE-TWO");
  bill(s12, 1000); bill(s12, 500);
  m.postReceiptVoucher(db, pay(s12, 1000));
  assert.equal(check(closure.computeOrderClosure(db, s12, options), "payment_received").ready, false);
  // An ordinary invoice that went below zero (excess receipt, or a credit note larger than
  // what was left on it) never hides another invoice that is still unpaid.
  const s13 = newOrder(db, "A2-CLOSE-OVER");
  const over = bill(s13, 1000); const unpaid = bill(s13, 1000);
  const stub = { outstandingFor: (_db, id) => (id === over.id ? -1000 : id === unpaid.id ? 1000 : 0) };
  assert.equal(check(closure.computeOrderClosure(db, s13, stub), "payment_received").ready, false, "an overpaid invoice does not settle another one");
  const s14 = newOrder(db, "A2-CLOSE-BIGCN");
  const paidInFull = bill(s14, 1000); bill(s14, 590);
  m.postReceiptVoucher(db, pay(s14, 1000));
  const bigNote = m.createBusinessVoucher(db, { company_id: 1, voucher_kind: "credit_note", voucher_date: "2026-07-04", taxable_value: 500, gst_rate: 18, department_id: dept, linked_invoice_id: paidInFull.id, reason_code: "short supply" });
  for (const step of ["submit", "review", "approve"]) m.updateGuidedVoucherStatus(db, bigNote.id, step, 1);
  m.postGuidedVoucher(db, bigNote.id, 1);
  assert.equal(check(closure.computeOrderClosure(db, s14, options), "payment_received").ready, false, "a credit note on a paid invoice does not settle another invoice");
});

test("the order picker shows only the selected company's orders", async () => {
  const search = await service("entitySearchService.js");
  const db = fresh();
  const other = db.prepare("INSERT INTO companies (company_name) VALUES ('A2 Other Co')").run().lastInsertRowid;
  newOrder(db, "A2-SCOPE-1");
  const second = newOrder(db, "A2-SCOPE-2");
  db.prepare("UPDATE supply_orders SET company_id = ? WHERE id = ?").run(other, second);
  const numbers = (companyId) => search.searchEntities(db, "supply_order", "A2-SCOPE", { company_id: companyId }).results.map((row) => row.order_number).sort();
  assert.deepEqual(numbers(1), ["A2-SCOPE-1"]);
  assert.deepEqual(numbers(other), ["A2-SCOPE-2"]);
});

test("a97daf4 round: entity-heavy xlsx text, long rows, blank HTML rows and two-byte titles are refused quickly", async () => {
  const zip = (files) => {
    const parts = []; const centrals = []; let offset = 0;
    for (const [n, text] of Object.entries(files)) {
      const name = Buffer.from(n); const data = zlib.deflateRawSync(Buffer.from(text));
      const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(name.length, 26);
      const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
      parts.push(local, name, data); centrals.push(central, name); offset += local.length + name.length + data.length;
    }
    const cd = Buffer.concat(centrals);
    const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(centrals.length / 2, 8); eocd.writeUInt16LE(centrals.length / 2, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
    return Buffer.concat([...parts, cd, eocd]);
  };
  const timed = (fn, pattern, label) => {
    const started = Date.now();
    assert.throws(fn, pattern, label);
    // Generous for a busy machine; the refused cases took minutes before these limits.
    assert.ok(Date.now() - started < 6000, `${label} took ${Date.now() - started} ms`);
  };
  const amp = "&amp;".repeat(32767);
  timed(() => m.parseImportBuffer("ss.xlsx", zip({ "xl/sharedStrings.xml": `<sst>${`<si><t>${amp}</t></si>`.repeat(110)}</sst>`, "xl/worksheets/sheet1.xml": "<worksheet/>" })), /expands \d+ times when opened/, "entity-heavy shared strings");
  timed(() => m.parseImportBuffer("in.xlsx", zip({ "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row><c r="A1" t="str"><v>${"&amp;".repeat(2_000_000)}</v></c></row></sheetData></worksheet>` })), /holds more than 32,767 characters|expands \d+ times when opened/, "inline cell");
  timed(() => m.parseImportBuffer("runs.xlsx", zip({ "xl/sharedStrings.xml": `<sst><si>${"<t/>".repeat(5000)}</si></sst>`, "xl/worksheets/sheet1.xml": "<worksheet/>" })), /formatted parts/, "text runs");
  timed(() => m.parseImportBuffer("w.csv", Buffer.from("a,".repeat(2_000_000) + "\nx")), /more than 16,384 cells/, "wide csv header");
  timed(() => m.parseImportBuffer("w.xls", Buffer.from("a\t".repeat(2_000_000) + "\nx")), /more than 16,384 cells/, "wide tsv header");
  timed(() => m.parseImportBuffer("b.xls", Buffer.from("<tr><td>h</td></tr>" + "<tr></tr>".repeat(500_000))), /blank rows included/, "blank html rows");
  assert.deepEqual(m.parseImportBuffer("u.xls", Buffer.from("<TABLE><TR><TH>supplier_name</TH><Th>City</Th></TR><tR><Td>Acme &amp; Co</Td><TD>Pune</TD></tR></TABLE>")), [{ supplier_name: "Acme & Co", city: "Pune" }]);
  // Two-byte titles count two bytes a character toward the reply budget.
  const titles = Array.from({ length: 500 }, (_, i) => (`h${i}_` + "あ".repeat(100)).slice(0, 100));
  timed(() => m.parseImportBuffer("k.csv", Buffer.from(titles.join(",") + "\n" + "x\n".repeat(1500))), /column titles total/, "two-byte titles");
  // Ordinary text with entities still decodes once and correctly.
  const ok = zip({ "xl/sharedStrings.xml": "<sst><si><t>supplier_name</t></si><si><t>A &amp; B &lt;Pvt&gt; &quot;Ltd&quot; &apos;x&apos; &amp;amp;</t></si></sst>", "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row></sheetData></worksheet>' });
  assert.deepEqual(m.parseImportBuffer("ok.xlsx", ok), [{ supplier_name: "A & B <Pvt> \"Ltd\" 'x' &amp;" }]);
});

test("a97daf4 round: Tally exports with unclosed tags are read in one pass, and a review edit never approves a proposal", async () => {
  const db = fresh();
  const root = freshRoot();
  const admin = db.prepare("SELECT id FROM users ORDER BY id LIMIT 1").get();
  const file = path.join(root, "unclosed.xml");
  fs.writeFileSync(file, "<SVCURRENTCOMPANY>x".repeat(60000) + "<LEDGER NAME=\"Kept\"><PARENT>Sundry Debtors</PARENT></LEDGER>");
  let started = Date.now();
  m.previewTallyMasterMigration(db, [{ filePath: file }], { user_id: admin.id });
  assert.ok(Date.now() - started < 2000, `took ${Date.now() - started} ms`);
  const ledgers = path.join(root, "ledgers.xml");
  fs.writeFileSync(ledgers, `<ENVELOPE><SVCURRENTCOMPANY>Acme</SVCURRENTCOMPANY>${Array.from({ length: 3 }, (_, i) => `<LEDGER NAME="L${i}"><PARENT>Sundry Debtors</PARENT></LEDGER>`).join("")}<STOCKITEM NAME="Bolt"><RATEDETAILS.LIST><GSTRATEDUTYHEAD>IGST</GSTRATEDUTYHEAD><GSTRATE>18</GSTRATE></RATEDETAILS.LIST></STOCKITEM></ENVELOPE>`);
  const preview = m.previewTallyMasterMigration(db, [{ filePath: ledgers }], { user_id: admin.id });
  assert.ok(JSON.stringify(preview).includes("L2"), "ledgers are still read");

  // Approval only through approve: a review edit that sends status "Approved" stays Needs Review.
  db.pragma("foreign_keys = OFF");
  const proposal = db.prepare("INSERT INTO voucher_proposals (company_id, bank_entry_id, transaction_date, suggested_voucher_type, status) VALUES (1, 1, '2026-06-01', 'Receipt', 'Suggested')").run().lastInsertRowid;
  db.pragma("foreign_keys = ON");
  m.updateVoucherProposal(db, proposal, { status: "Approved", narration: "edited", user_id: admin.id });
  assert.equal(db.prepare("SELECT status FROM voucher_proposals WHERE id = ?").get(proposal).status, "Needs Review");
  assert.throws(() => m.createDraftVoucherFromProposal(db, proposal, admin.id), /must be approved/);
});

test("owner decision EXP: % of gross uses the invoice's gross value and % of taxable its taxable value", () => {
  const db = fresh();
  const order = newOrder(db, "A2-EXP");
  const inv = m.saveBillingVoucher(db, { header: { order_id: order, company_id: 1, invoice_date: "2026-07-01" }, items: [{ quantity: 1, billing_rate: 10000, gst_rate: 18 }] });
  m.postSalesVoucher(db, inv.id);
  const head = db.prepare("SELECT id FROM expense_heads LIMIT 1").get().id;
  const posted = (method) => {
    const exp = m.createRecord(db, "expense_entries", { company_id: 1, order_id: order, expense_head_id: head, expense_date: "2026-07-02", calculation_method: method, percentage: 5, expense_amount: 0, approval_status: "Approved" });
    m.postBusinessTransaction(db, "expense_entries", exp.id);
    const voucher = db.prepare("SELECT id FROM vouchers WHERE source_module = 'expense' AND source_id = ?").get(exp.id);
    return db.prepare("SELECT SUM(debit) d FROM ledger_entries WHERE voucher_id = ?").get(voucher.id).d;
  };
  assert.equal(posted("percentage_gross"), 590, "5% of 11,800 gross");
  assert.equal(posted("percentage_taxable"), 500, "5% of 10,000 taxable");
  const row = m.orderProfitability(db, { company_id: 1 }).find((r) => r.id === order);
  assert.equal(Math.round(row.totalExpenses * 100) / 100, 1090, "profitability uses the same formula");
});

test("owner decision CV: a supplier return's price gap goes to Purchase Price Variance, not Trade Payables", () => {
  const db = fresh();
  const { wh, item } = widget(db, "A2 Variance");
  const order = newOrder(db, "A2-PPV");
  const supplier2 = m.createRecord(db, "suppliers", { supplier_name: "A2 Second Supplier", status: "active" }).id;
  // Supplier 1: 10 units at 100, never billed. Supplier 2: 10 units at 200, billed. Average 150.
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: "A2-PPV-1", quantity: 10, rate: 100, landed_cost: 0 }).id);
  const bill = m.createRecord(db, "procurements", { company_id: 1, order_id: order, purchase_date: "2026-07-01", supplier_id: supplier2, purchase_invoice_number: "A2-PPV-2", purchase_value: 2000, purchase_gst: 0 });
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, procurement_id: bill.id, supplier_id: supplier2, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: "A2-PPV-2", quantity: 10, rate: 200, landed_cost: 0 }).id);
  m.postPurchaseVoucher(db, bill.id);
  const before = { tp: balance(db, "Trade Payables"), grni: balance(db, "Goods Received Not Invoiced"), inv: balance(db, "Inventory"), ppv: balance(db, "Purchase Price Variance") };
  const ret = m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, return_date: "2026-07-03", quantity: 5 });
  m.postStockReturn(db, ret.id);
  const diff = (name, was) => Math.round((balance(db, name) - was) * 100) / 100;
  assert.equal(diff("Trade Payables", before.tp), 0, "supplier 1 has no bill, so nothing comes off Trade Payables");
  assert.equal(diff("Goods Received Not Invoiced", before.grni), 500, "GRNI clears at supplier 1's price");
  assert.equal(diff("Purchase Price Variance", before.ppv), 250, "the gap to the 150 average is a price variance");
  assert.equal(diff("Inventory", before.inv), -750, "stock leaves at average cost");
  // The ledger is reported under Purchases.
  const group = db.prepare("SELECT g.group_code FROM accounts a JOIN account_group_assignments x ON x.account_id = a.id JOIN account_groups g ON g.id = x.account_group_id WHERE a.company_id = 1 AND a.account_name = 'Purchase Price Variance'").get();
  assert.equal(group?.group_code, "PURCHASES");
  // A return to the billed supplier comes off Trade Payables at that supplier's price.
  const tp = balance(db, "Trade Payables"); const ppv = balance(db, "Purchase Price Variance");
  const ret2 = m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", order_id: order, supplier_id: supplier2, item_id: item, warehouse_id: wh, return_date: "2026-07-04", quantity: 2 });
  m.postStockReturn(db, ret2.id);
  assert.equal(diff("Trade Payables", tp), 400, "2 units at supplier 2's 200");
  assert.equal(diff("Purchase Price Variance", ppv), -100, "stock at 150 leaves for 200: a credit to the variance");
});

test("owner decision CV: an existing ledger named Purchase Price Variance is reused and a taken code is never taken over", () => {
  const db = fresh();
  const other = db.prepare("INSERT INTO companies (company_name) VALUES ('A2 PPV Co')").run().lastInsertRowid;
  db.prepare("INSERT INTO accounts (company_id, account_code, account_name, account_type, normal_balance, opening_balance, status) VALUES (?, '5065', 'My Own Ledger', 'Expense', 'Debit', 0, 'active')").run(other);
  m.ensurePurchasePriceVarianceAccount(db, other);
  assert.equal(db.prepare("SELECT account_name FROM accounts WHERE company_id = ? AND account_code = '5065'").get(other).account_name, "My Own Ledger");
  assert.equal(db.prepare("SELECT account_code FROM accounts WHERE company_id = ? AND account_name = 'Purchase Price Variance'").get(other).account_code, "5066");
  m.ensurePurchasePriceVarianceAccount(db, other);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM accounts WHERE company_id = ? AND account_name = 'Purchase Price Variance'").get(other).n, 1);
});

test("9dac174 round: every Tally master kind counts against the preview cap, and the stock preview is capped too", () => {
  const db = fresh();
  const root = freshRoot();
  const admin = db.prepare("SELECT id FROM users ORDER BY id LIMIT 1").get();
  const groups = path.join(root, "groups.xml");
  fs.writeFileSync(groups, `<ENVELOPE>${"<GROUP NAME=\"G\"></GROUP>".repeat(100001)}</ENVELOPE>`);
  let started = Date.now();
  assert.throws(() => m.previewTallyMasterMigration(db, [{ filePath: groups }], { user_id: admin.id }), /more than 1,00,000 masters/);
  assert.ok(Date.now() - started < 5000, `took ${Date.now() - started} ms`);
  const stock = path.join(root, "stock.xml");
  fs.writeFileSync(stock, `<ENVELOPE>${"<STOCKITEM NAME=\"S\"></STOCKITEM>".repeat(100001)}</ENVELOPE>`);
  started = Date.now();
  assert.throws(() => m.previewTallyStockXml(stock), /more than 1,00,000 masters/);
  assert.ok(Date.now() - started < 5000, `took ${Date.now() - started} ms`);
});

test("9dac174 round: padding after a compressed xlsx part does not dodge the expansion check", () => {
  const sheet = `<worksheet><sheetData>${"<row><c t=\"str\"><v>a</v></c></row>".repeat(400000)}</sheetData></worksheet>`;
  const data = zlib.deflateRawSync(Buffer.from(sheet));
  const padded = Buffer.concat([data, Buffer.alloc(Math.ceil(Buffer.byteLength(sheet) / 150))]);
  const name = Buffer.from("xl/worksheets/sheet1.xml");
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(padded.length, 18); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(padded.length, 20); central.writeUInt16LE(name.length, 28);
  const cd = Buffer.concat([central, name]);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(30 + name.length + padded.length, 16);
  assert.throws(() => m.parseImportBuffer("pad.xlsx", Buffer.concat([local, name, padded, cd, eocd])), /expands \d+ times when opened/);
});

test("605a873 round: a supplier return with a variance reverses exactly, and a part-billed return splits at each price", () => {
  const db = fresh();
  const { wh, item } = widget(db, "A2 Var Rev");
  const order = newOrder(db, "A2-PPV-REV");
  const supplier2 = m.createRecord(db, "suppliers", { supplier_name: "A2 Var Supplier", status: "active" }).id;
  // Supplier 1: 4 units billed at 120 and 6 unbilled at 100. Supplier 2: 10 billed at 200.
  const bill1 = m.createRecord(db, "procurements", { company_id: 1, order_id: order, purchase_date: "2026-07-01", supplier_id: 1, purchase_invoice_number: "A2-VR-1", purchase_value: 480, purchase_gst: 0 });
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, procurement_id: bill1.id, supplier_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: "A2-VR-1", quantity: 4, rate: 120, landed_cost: 0 }).id);
  m.postPurchaseVoucher(db, bill1.id);
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: "A2-VR-1B", quantity: 6, rate: 100, landed_cost: 0 }).id);
  const bill2 = m.createRecord(db, "procurements", { company_id: 1, order_id: order, purchase_date: "2026-07-01", supplier_id: supplier2, purchase_invoice_number: "A2-VR-2", purchase_value: 2000, purchase_gst: 0 });
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, procurement_id: bill2.id, supplier_id: supplier2, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: "A2-VR-2", quantity: 10, rate: 200, landed_cost: 0 }).id);
  m.postPurchaseVoucher(db, bill2.id);
  const names = ["Trade Payables", "Goods Received Not Invoiced", "Inventory", "Purchase Price Variance"];
  const snap = () => Object.fromEntries(names.map((n) => [n, balance(db, n)]));
  const before = snap();
  // Average cost = (480 + 600 + 2000) / 20 = 154. Return 8 units to supplier 1: 6 unbilled at 100, 2 billed at 120.
  const ret = m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, return_date: "2026-07-03", quantity: 8 });
  m.postStockReturn(db, ret.id);
  const after = snap();
  const d = (n) => Math.round((after[n] - before[n]) * 100) / 100;
  assert.equal(d("Goods Received Not Invoiced"), 600);
  assert.equal(d("Trade Payables"), 240);
  assert.equal(d("Inventory"), -1232);
  assert.equal(d("Purchase Price Variance"), 392);
  const voucher = db.prepare("SELECT id FROM vouchers WHERE source_module = 'stock_returns' AND source_id = ?").get(ret.id);
  m.reverseVoucher(db, voucher.id, "returned in error");
  const reversed = snap();
  for (const n of names) assert.equal(Math.round((reversed[n] - before[n]) * 100) / 100, 0, `${n} is back where it was`);
});

test("605a873 round: a typed expense amount still wins over the formula", () => {
  const db = fresh();
  const order = newOrder(db, "A2-EXP-TYPED");
  const inv = m.saveBillingVoucher(db, { header: { order_id: order, company_id: 1, invoice_date: "2026-07-01" }, items: [{ quantity: 1, billing_rate: 10000, gst_rate: 18 }] });
  m.postSalesVoucher(db, inv.id);
  const head = db.prepare("SELECT id FROM expense_heads LIMIT 1").get().id;
  const exp = m.createRecord(db, "expense_entries", { company_id: 1, order_id: order, expense_head_id: head, expense_date: "2026-07-02", calculation_method: "percentage_gross", percentage: 5, expense_amount: 123, approval_status: "Approved" });
  m.postBusinessTransaction(db, "expense_entries", exp.id);
  const voucher = db.prepare("SELECT id FROM vouchers WHERE source_module = 'expense' AND source_id = ?").get(exp.id);
  assert.equal(db.prepare("SELECT SUM(debit) d FROM ledger_entries WHERE voucher_id = ?").get(voucher.id).d, 123);
});

test("605a873 round: the variance ledger refuses a same-name ledger of the wrong type", () => {
  const db = fresh();
  const other = db.prepare("INSERT INTO companies (company_name) VALUES ('A2 Wrong Type Co')").run().lastInsertRowid;
  db.prepare("INSERT INTO accounts (company_id, account_code, account_name, account_type, normal_balance, opening_balance, status) VALUES (?, '2999', 'purchase price variance', 'Liability', 'Credit', 0, 'active')").run(other);
  assert.throws(() => m.ensurePurchasePriceVarianceAccount(db, other), /exists as Liability.*Rename that ledger/);
});

test("605a873 round: a reversed invoice stays Reversed after the app restarts", () => {
  const root = freshRoot();
  let db = m.initializeDatabase(root);
  const order = newOrder(db, "A2-RESTART");
  const inv = m.saveBillingVoucher(db, { header: { order_id: order, company_id: 1, invoice_date: "2026-07-01" }, items: [{ quantity: 1, billing_rate: 100, gst_rate: 0 }] });
  m.postSalesVoucher(db, inv.id);
  const voucher = db.prepare("SELECT id FROM vouchers WHERE source_module = 'billing' AND source_id = ?").get(inv.id);
  m.reverseVoucher(db, voucher.id, "restart probe");
  db.close();
  db = m.initializeDatabase(root);
  handles.push(db);
  assert.equal(db.prepare("SELECT posting_status FROM invoices WHERE id = ?").get(inv.id).posting_status, "Reversed");
});

test("605a873 round: the stock XML preview counts units, godowns and stock groups against the cap", () => {
  const root = freshRoot();
  const file = path.join(root, "units.xml");
  fs.writeFileSync(file, `<ENVELOPE>${Array.from({ length: 100001 }, (_, i) => `<UNIT NAME="U${i}"></UNIT>`).join("")}</ENVELOPE>`);
  const started = Date.now();
  assert.throws(() => m.previewTallyStockXml(file), /more than 1,00,000 masters/);
  assert.ok(Date.now() - started < 5000, `took ${Date.now() - started} ms`);
});

test("605a873 round: GRNI is priced from what earlier returns left, oldest receipt first", () => {
  const db = fresh();
  const { wh, item } = widget(db, "A2 FIFO");
  const order = newOrder(db, "A2-FIFO");
  const receive = (qty, rate, no) => m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: no, quantity: qty, rate, landed_cost: 0 }).id);
  const ret = (qty, date) => m.postStockReturn(db, m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, return_date: date, quantity: qty }).id);
  const before = { grni: balance(db, "Goods Received Not Invoiced"), ppv: balance(db, "Purchase Price Variance") };
  receive(10, 100, "A2-F1");
  ret(5, "2026-07-02");
  receive(10, 200, "A2-F2");
  ret(15, "2026-07-03");
  assert.equal(Math.round((balance(db, "Goods Received Not Invoiced") - before.grni) * 100) / 100, 0, "every unbilled unit returned: GRNI is back to where it was");
  assert.equal(Math.round((balance(db, "Purchase Price Variance") - before.ppv) * 100) / 100, 0, "no variance when stock cost equals the supplier's prices");
});

test("dc030e6 round: a same-name ledger of the wrong type never stops the books opening; only the return refuses", () => {
  const root = freshRoot();
  let db = m.initializeDatabase(root);
  db.prepare("DELETE FROM account_group_assignments WHERE account_id IN (SELECT id FROM accounts WHERE company_id = 1 AND account_name = 'Purchase Price Variance')").run();
  db.prepare("UPDATE accounts SET account_type = 'Liability', normal_balance = 'Credit' WHERE company_id = 1 AND account_name = 'Purchase Price Variance'").run();
  db.close();
  db = m.initializeDatabase(root);
  handles.push(db);
  // The books open; posting a return that needs the variance ledger refuses with guidance.
  const { wh, item } = widget(db, "A2 WrongType");
  const order = newOrder(db, "A2-WRONGTYPE");
  const supplier2 = m.createRecord(db, "suppliers", { supplier_name: "A2 WrongType Supplier", status: "active" }).id;
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: "A2-WT-1", quantity: 10, rate: 100, landed_cost: 0 }).id);
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, supplier_id: supplier2, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: "A2-WT-2", quantity: 10, rate: 200, landed_cost: 0 }).id);
  const ret = m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, return_date: "2026-07-02", quantity: 2 });
  assert.throws(() => m.postStockReturn(db, ret.id), /Chart of Accounts/);
  assert.equal(db.prepare("SELECT posting_status FROM stock_returns WHERE id = ?").get(ret.id).posting_status, "Draft");
});

test("dc030e6 round: billed goods come off Trade Payables at the supplier's rate, not landed cost, and free receipts cost nothing", () => {
  const db = fresh();
  const { wh, item } = widget(db, "A2 Landed");
  const order = newOrder(db, "A2-LANDED");
  const bill = m.createRecord(db, "procurements", { company_id: 1, order_id: order, purchase_date: "2026-07-01", supplier_id: 1, purchase_invoice_number: "A2-LC", purchase_value: 1000, purchase_gst: 0 });
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, procurement_id: bill.id, supplier_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: "A2-LC", quantity: 10, rate: 100, landed_cost: 100 }).id);
  m.postPurchaseVoucher(db, bill.id);
  const tp = balance(db, "Trade Payables");
  m.postStockReturn(db, m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, return_date: "2026-07-02", quantity: 2 }).id);
  assert.equal(Math.round((balance(db, "Trade Payables") - tp) * 100) / 100, 200, "2 units at the supplier's 100, freight not charged back");
  m.postStockReturn(db, m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, return_date: "2026-07-03", quantity: 3 }).id);
  assert.equal(Math.round((balance(db, "Trade Payables") - tp) * 100) / 100, 500, "an earlier return used up its own billed units");
  const free = widget(db, "A2 Free");
  const grni = balance(db, "Goods Received Not Invoiced");
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, supplier_id: 1, item_id: free.item, warehouse_id: free.wh, inward_date: "2026-07-01", purchase_invoice_number: "A2-FREE", quantity: 5, rate: 0, landed_cost: 0 }).id);
  // A paid receipt after the free one: an earlier return's value is taken off the paid receipt, never the free one.
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, supplier_id: 1, item_id: free.item, warehouse_id: free.wh, inward_date: "2026-07-02", purchase_invoice_number: "A2-PAID", quantity: 5, rate: 100, landed_cost: 0 }).id);
  for (const qty of [2, 4, 4]) {
    assert.doesNotThrow(() => m.postStockReturn(db, m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", order_id: order, supplier_id: 1, item_id: free.item, warehouse_id: free.wh, return_date: "2026-07-03", quantity: qty }).id));
  }
  assert.equal(Math.round((balance(db, "Goods Received Not Invoiced") - grni) * 100) / 100, 0, "all ten units returned: GRNI is back where it was");
});

test("dc030e6 round: support bundles keep only the newest twenty", async () => {
  const bundles = await service("supportBundleService.js");
  const root = freshRoot();
  for (let i = 0; i < 23; i += 1) bundles.createSupportBundle(null, root, {}, {}, { n: i });
  const folder = path.join(root, "exports", "support-bundles");
  assert.equal(fs.readdirSync(folder).length, 20);
  assert.match(bundles.boundedScreenContext({ user_id: 9, crashes: [1], big: "x".repeat(2 * 1024 * 1024) }), /\(cut\)/);
  const many = {};
  for (let i = 0; i < 100; i += 1) many[`k${i}`] = "x".repeat(19000);
  assert.match(bundles.boundedScreenContext(many), /larger than 1 MB/);
  assert.deepEqual(JSON.parse(bundles.boundedScreenContext({ user_id: 9, user_name: "x", crashes: [1] })), { crashes: [1] });
  // Deep nesting stays one compact text in the file, so it cannot expand when written.
  const nested = "[".repeat(300) + "]".repeat(300);
  const written = bundles.createSupportBundle(null, root, {}, {}, { screenContextJson: bundles.boundedScreenContext({ deep: JSON.parse(nested) }) });
  assert.ok(written.size < 64 * 1024, `bundle is ${written.size} bytes`);
});

test("d661346 round: a huge sparse list or typed array in a support bundle request returns at once", async () => {
  const bundles = await service("supportBundleService.js");
  const started = Date.now();
  const sparse = bundles.boundedScreenContext({ crashes: new Array(1e8) });
  const typed = bundles.boundedScreenContext({ blob: new Uint8Array(20 * 1024 * 1024), crashes: [{ message: "kept" }] });
  assert.ok(Date.now() - started < 3000, `took ${Date.now() - started} ms (an unbounded copy took over 10 s)`);
  assert.ok(Buffer.byteLength(sparse) < 64 * 1024);
  assert.deepEqual(JSON.parse(typed), { crashes: [{ message: "kept" }] });
  assert.equal(bundles.boundedScreenContext(new Uint8Array(10)), null);
  // One object referenced many times is copied once (IPC sends it once, too).
  const shared = {};
  for (let i = 0; i < 100000; i += 1) shared[`k${i}`] = i;
  const refs = { list: new Array(200).fill(shared), nested: Array.from({ length: 200 }, () => Array(200).fill(shared)) };
  const again = Date.now();
  const text = bundles.boundedScreenContext(refs);
  assert.ok(Date.now() - again < 3000, `repeated references took ${Date.now() - again} ms`);
  assert.match(text, /\(repeated\)/);
});

test("dc030e6 round: returns with and without an order never clear the same units twice, and the supplier ledger shows the return", async () => {
  const db = fresh();
  const { wh, item } = widget(db, "A2 NoOrder");
  const order = newOrder(db, "A2-NOORDER");
  const grni = balance(db, "Goods Received Not Invoiced");
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: "A2-NO-1", quantity: 10, rate: 100, landed_cost: 0 }).id);
  m.postStockReturn(db, m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", supplier_id: 1, item_id: item, warehouse_id: wh, return_date: "2026-07-02", quantity: 5 }).id);
  m.postStockReturn(db, m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, return_date: "2026-07-03", quantity: 5 }).id);
  assert.ok(balance(db, "Goods Received Not Invoiced") - grni <= 0.005, "GRNI is never cleared past what was received");
  const bill = m.createRecord(db, "procurements", { company_id: 1, order_id: order, purchase_date: "2026-07-01", supplier_id: 1, purchase_invoice_number: "A2-NO-B", purchase_value: 500, purchase_gst: 0 });
  const b = widget(db, "A2 NoOrder Billed");
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, procurement_id: bill.id, supplier_id: 1, item_id: b.item, warehouse_id: b.wh, inward_date: "2026-07-01", purchase_invoice_number: "A2-NO-B", quantity: 5, rate: 100, landed_cost: 0 }).id);
  m.postPurchaseVoucher(db, bill.id);
  const ret = m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", order_id: order, supplier_id: 1, item_id: b.item, warehouse_id: b.wh, return_date: "2026-07-04", quantity: 1 });
  m.postStockReturn(db, ret.id);
  const line = db.prepare("SELECT vl.linked_party_type, vl.linked_party_id FROM voucher_lines vl JOIN vouchers v ON v.id = vl.voucher_id JOIN accounts a ON a.id = vl.account_id WHERE v.source_module = 'stock_returns' AND v.source_id = ? AND a.account_name = 'Trade Payables'").get(ret.id);
  assert.deepEqual({ ...line }, { linked_party_type: "supplier", linked_party_id: 1 });
  const bundles = await service("supportBundleService.js");
  const kept = JSON.parse(bundles.boundedScreenContext({ crashes: [{ message: "boom" }], big: "x".repeat(2 * 1024 * 1024) }));
  assert.equal(kept.crashes[0].message, "boom", "Safe Mode's crash list survives an oversized context");
});

test("d661346 round: returns are replayed by quantity, so a no-order return never hides another order's receipt", () => {
  const db = fresh();
  const { wh, item } = widget(db, "A2 Replay");
  const o1 = newOrder(db, "A2-RP-1");
  const o2 = newOrder(db, "A2-RP-2");
  const grni = balance(db, "Goods Received Not Invoiced");
  const payables = balance(db, "Trade Payables");
  const inward = (order, n) => m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: `A2-RP-${n}`, quantity: 10, rate: 100, landed_cost: 0 }).id);
  inward(o1, 1);
  inward(o2, 2);
  const ret = (order, date) => m.postStockReturn(db, m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", ...(order ? { order_id: order } : {}), supplier_id: 1, item_id: item, warehouse_id: wh, return_date: date, quantity: 10 }).id);
  ret(null, "2026-07-02");
  ret(o2, "2026-07-03");
  assert.equal(balance(db, "Goods Received Not Invoiced") - grni, 0, "both receipts are cleared from GRNI");
  assert.equal(balance(db, "Trade Payables") - payables, 0, "nothing is charged to the supplier for goods never billed");
});

test("d661346 round: a free receipt is used once, and a billed receipt with no rate returns at its stock value", () => {
  const db = fresh();
  const { wh, item } = widget(db, "A2 Free Once");
  const order = newOrder(db, "A2-FREE-ONCE");
  const grni = balance(db, "Goods Received Not Invoiced");
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: "A2-FO-1", quantity: 5, rate: 0, landed_cost: 0 }).id);
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-02", purchase_invoice_number: "A2-FO-2", quantity: 10, rate: 100, landed_cost: 0 }).id);
  for (const [date, quantity] of [["2026-07-03", 5], ["2026-07-04", 5], ["2026-07-05", 5]]) {
    m.postStockReturn(db, m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, return_date: date, quantity }).id);
  }
  assert.equal(balance(db, "Goods Received Not Invoiced") - grni, 0, "the paid receipt is cleared in full once");

  const b = widget(db, "A2 No Rate");
  const bill = m.createRecord(db, "procurements", { company_id: 1, order_id: order, purchase_date: "2026-07-01", supplier_id: 1, purchase_invoice_number: "A2-NR-B", purchase_value: 800, purchase_gst: 0 });
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, procurement_id: bill.id, supplier_id: 1, item_id: b.item, warehouse_id: b.wh, inward_date: "2026-07-01", purchase_invoice_number: "A2-NR-B", quantity: 10, rate: 0, landed_cost: 800 }).id);
  m.postPurchaseVoucher(db, bill.id);
  const ret = m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", order_id: order, supplier_id: 1, item_id: b.item, warehouse_id: b.wh, return_date: "2026-07-06", quantity: 10 });
  m.postStockReturn(db, ret.id);
  const tp = db.prepare("SELECT COALESCE(SUM(vl.debit), 0) d FROM voucher_lines vl JOIN vouchers v ON v.id = vl.voucher_id JOIN accounts a ON a.id = vl.account_id WHERE v.source_module = 'stock_returns' AND v.source_id = ? AND a.account_name = 'Trade Payables'").get(ret.id).d;
  assert.equal(tp, 800, "the billed receipt is returned against Trade Payables at its stock value, not all to variance");
});

test("d661346 round: a billed supplier return keeps party reconciliation matched", () => {
  const db = fresh();
  const { wh, item } = widget(db, "A2 Recon");
  const order = newOrder(db, "A2-RECON");
  const bill = m.createRecord(db, "procurements", { company_id: 1, order_id: order, purchase_date: "2026-07-01", supplier_id: 1, purchase_invoice_number: "A2-RC-B", purchase_value: 1000, purchase_gst: 0 });
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, procurement_id: bill.id, supplier_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: "A2-RC-B", quantity: 10, rate: 100, landed_cost: 0 }).id);
  m.postPurchaseVoucher(db, bill.id);
  const payable = () => m.accountingData(db, { company_id: 1 }).partyReconciliation.find((row) => row.id === "payable");
  const before = payable();
  const ret = m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, return_date: "2026-07-02", quantity: 4 });
  m.postStockReturn(db, ret.id);
  const after = payable();
  assert.equal(after.difference, before.difference, "the return moves the ledger and the comparison together");
  assert.equal(after.status, before.status);
  m.reverseStockReturn(db, ret.id);
  const reversed = payable();
  assert.equal(reversed.difference, before.difference, "a reversed return nets out of both sides");
  assert.equal(reversed.status, before.status);
});

test("d661346 round: a purchase voucher's receipt rate is per unit", () => {
  const db = fresh();
  const { wh, item } = widget(db, "A2 Guided Rate");
  const bank = db.prepare("SELECT id FROM accounts WHERE company_id = 1 AND account_name LIKE '%Bank%' AND is_deleted = 0 ORDER BY id LIMIT 1").get()?.id;
  const guided = m.createBusinessVoucher(db, { company_id: 1, voucher_kind: "purchase", voucher_date: "2026-07-01", supplier_id: 1, bank_account_id: bank, purchase_invoice_number: "A2-GR-1", taxable_value: 1000, gst_rate: 0, item_id: item, warehouse_id: wh, quantity: 10, accepted_quantity: 10, rate: 100, narration: "rate only" });
  for (const step of ["submit", "review", "approve"]) m.updateGuidedVoucherStatus(db, guided.id, step, 1);
  m.postGuidedVoucher(db, guided.id, 1);
  const inward = db.prepare("SELECT rate FROM stock_inwards WHERE item_id = ? ORDER BY id DESC LIMIT 1").get(item);
  assert.equal(Number(inward.rate), 100);
  const stock = db.prepare("SELECT COALESCE(SUM(value_minor), 0) / 100.0 v FROM stock_ledger WHERE item_id = ? AND transaction_type = 'Inward' AND COALESCE(is_deleted, 0) = 0").get(item).v;
  assert.equal(stock, 1000, "10 units at 100 are stock worth 1,000");
});

test("66b024f round: an earlier return is judged as it stood when it posted", () => {
  const db = fresh();
  const { wh, item } = widget(db, "A2 AsOf");
  const order = newOrder(db, "A2-ASOF");
  const grni = balance(db, "Goods Received Not Invoiced");
  const payables = balance(db, "Trade Payables");
  const variance = () => db.prepare("SELECT COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0) b FROM ledger_entries le JOIN accounts a ON a.id = le.account_id WHERE a.company_id = 1 AND a.account_name = 'Purchase Price Variance'").get()?.b || 0;
  const ppv = variance();
  const bill = m.createRecord(db, "procurements", { company_id: 1, order_id: order, purchase_date: "2026-07-01", supplier_id: 1, purchase_invoice_number: "A2-AO-B", purchase_value: 2000, purchase_gst: 0 });
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, procurement_id: bill.id, supplier_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: "A2-AO-B", quantity: 10, rate: 200, landed_cost: 0 }).id);
  m.postPurchaseVoucher(db, bill.id);
  const ret = (date) => m.postStockReturn(db, m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, return_date: date, quantity: 10 }).id);
  ret("2026-07-02");
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-03", purchase_invoice_number: "A2-AO-2", quantity: 10, rate: 100, landed_cost: 0 }).id);
  ret("2026-07-01"); // back-dated, posted last
  assert.equal(balance(db, "Goods Received Not Invoiced") - grni, 0, "the unbilled receipt is cleared from GRNI");
  assert.equal(balance(db, "Trade Payables") - payables, 0, "the supplier's 2,000 bill is cleared once, not twice");
  assert.equal(Math.round(variance() - ppv), 0, "no made-up price variance");
});

function guidedPurchase(db, item, wh, fields) {
  const bank = db.prepare("SELECT id FROM accounts WHERE company_id = 1 AND account_name LIKE '%Bank%' AND is_deleted = 0 ORDER BY id LIMIT 1").get()?.id;
  const guided = m.createBusinessVoucher(db, { company_id: 1, voucher_kind: "purchase", voucher_date: "2026-07-01", supplier_id: 1, bank_account_id: bank, purchase_invoice_number: `A2-GP-${item}`, gst_rate: 0, item_id: item, warehouse_id: wh, quantity: 10, accepted_quantity: 10, narration: "guided", ...fields });
  for (const step of ["submit", "review", "approve"]) m.updateGuidedVoucherStatus(db, guided.id, step, 1);
  m.postGuidedVoucher(db, guided.id, 1);
}

test("66b024f round: purchase-voucher receipts match the voucher, skip Accounting Only, and return against the supplier", () => {
  const db = fresh();
  const grni = balance(db, "Goods Received Not Invoiced");
  const payables = balance(db, "Trade Payables");
  const a = widget(db, "A2 GP Only");
  guidedPurchase(db, a.item, a.wh, { taxable_value: 1000, rate: 100, inventory_enabled: false });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM stock_inwards WHERE item_id = ?").get(a.item).n, 0, "Accounting Only brings no stock in");
  const b = widget(db, "A2 GP Value");
  guidedPurchase(db, b.item, b.wh, { taxable_value: 1000, purchase_value: 50000, rate: 100 });
  assert.equal(balance(db, "Goods Received Not Invoiced") - grni, 0, "the receipt clears exactly what the voucher put into GRNI");
  const ret = m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", supplier_id: 1, item_id: b.item, warehouse_id: b.wh, return_date: "2026-07-02", quantity: 4 });
  m.postStockReturn(db, ret.id);
  assert.equal(balance(db, "Goods Received Not Invoiced") - grni, 0, "a billed receipt is not returned through GRNI");
  // Two bills of 1,000 (the Accounting Only one too); the return takes 400 off.
  assert.equal(balance(db, "Trade Payables") - payables, -1600, "the supplier owes back 400 of the 1,000 bill");
});
