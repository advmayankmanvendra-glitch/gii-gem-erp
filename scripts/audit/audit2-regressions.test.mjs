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
  assert.throws(() => m.parseImportBuffer("wide.csv", Buffer.from(`${header}\n${"x\n".repeat(4000)}`)), /the limit is 500/);
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
  const strings = `<sst>${"<si><t></t></si>".repeat(1000001)}</sst>`;
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
  assert.throws(() => m.parseImportBuffer("ss.xlsx", zip({ "xl/sharedStrings.xml": strings, "xl/worksheets/sheet1.xml": "<worksheet/>" })), /more than 1,000,000 text values/);
  assert.ok(Date.now() - started < 3000, `took ${Date.now() - started} ms`);
  // Blank lines do not count toward the row limit.
  const tsv = m.parseImportBuffer("t.xls", Buffer.from(`supplier_name\tcity\nA\tX\n${"\n".repeat(200005)}B\tY\n`));
  assert.equal(tsv.length, 2);
  const row = (r, v) => `<row r="${r}"><c r="A${r}" t="inlineStr"><is><t>${v}</t></is></c></row>`;
  const title = Array.from({ length: 60 }, (_, i) => row(i + 1, `title ${i}`)).join("");
  const row2 = (r, a, b) => `<row r="${r}"><c r="A${r}" t="inlineStr"><is><t>${a}</t></is></c><c r="B${r}" t="inlineStr"><is><t>${b}</t></is></c></row>`;
  assert.throws(() => m.parseImportBuffer("far.xlsx", sheetZip(`<worksheet><sheetData>${title}${row2(61, "supplier_name", "city")}${row2(62, "Acme", "Pune")}</sheetData></worksheet>`)), /is Excel row 61/);
  // A single data cell that reads like a title far down is data, not a header.
  assert.equal(m.parseImportBuffer("data.xlsx", sheetZip(`<worksheet><sheetData>${title}${row(61, "item_name")}</sheetData></worksheet>`)).length, 60);
  const near = Array.from({ length: 5 }, (_, i) => row(i + 1, `title ${i}`)).join("");
  assert.deepEqual(m.parseImportBuffer("near.xlsx", sheetZip(`<worksheet><sheetData>${near}${row(6, "supplier_name")}${row(7, "Acme")}</sheetData></worksheet>`)), [{ supplier_name: "Acme" }]);
  // Long cells are skipped by the header search at once.
  const spaces = `<row r="1">${Array.from({ length: 2000 }, (_, i) => `<c r="A1" t="inlineStr"><is><t>a${" ".repeat(30000)}b</t></is></c>`).slice(0, 2000).join("")}</row>`;
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
  const big = Array.from({ length: 2 }, (_, i) => { const f = path.join(root, `big${i}.xml`); fs.writeFileSync(f, Buffer.alloc(13 * 1024 * 1024, 32)); return { filePath: f }; });
  assert.throws(() => preview(big), /one preview reads at most 25 MB/);
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
  assert.doesNotThrow(() => m.updateRecord(db, "suppliers", id, { remarks: false }));
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
  assert.throws(() => m.parseImportBuffer("blank.xls", Buffer.from(`supplier_name\tcity\n${"\n".repeat(400005)}`)), /most of them blank/);
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
