// Tests for the return-receipts table (owner decision 16 Nov 2026): each supplier return
// records which receipts it used, and later returns take those records as they are.
// Run from the repo root:  node --test scripts/audit/return-receipts.test.mjs
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.TZ = "Asia/Kolkata";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const m = await import(pathToFileURL(path.join(REPO, "src/main/database/init.js")).href);

const handles = [];
const roots = [];
afterEach(() => {
  while (handles.length) { const db = handles.pop(); try { if (db.open) db.close(); } catch { /* closed */ } }
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
function freshRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-rr-"));
  roots.push(root);
  return root;
}
function fresh(root = freshRoot()) {
  const db = m.initializeDatabase(root);
  handles.push(db);
  return db;
}
const balance = (db, name) => db.prepare(`
  SELECT ROUND(COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0), 2) b
  FROM ledger_entries le JOIN vouchers v ON v.id = le.voucher_id JOIN accounts a ON a.id = le.account_id
  WHERE a.company_id = 1 AND a.account_name = ? AND v.status IN ('Posted', 'Reversed') AND v.is_deleted = 0 AND COALESCE(le.is_deleted, 0) = 0
`).get(name).b;
function newOrder(db, number) {
  const dept = db.prepare("SELECT id FROM government_departments LIMIT 1").get().id;
  const emp = db.prepare("SELECT id FROM employees LIMIT 1").get().id;
  return m.createRecord(db, "supply_orders", { company_id: 1, order_number: number, order_date: "2026-06-01", order_status: "Received", institution_name: "X", department_id: dept, employee_id: emp, location: "M", supply_due_date: "2026-06-30" }).id;
}
function setup(db, name) {
  const wh = m.createRecord(db, "warehouses", { company_id: 1, warehouse_name: `${name} WH`, status: "active" }).id;
  const item = m.createRecord(db, "items", { item_name: name, unit: "Nos", status: "active", gst_rate: 0, opening_stock: 0, opening_rate: 0, opening_value: 0, default_warehouse_id: wh }).id;
  const order = newOrder(db, `${name}-O`);
  const receive = (qty, rate, no) => m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-07-01", purchase_invoice_number: no, quantity: qty, rate, landed_cost: 0 }).id);
  const ret = (qty, date, extra = {}) => m.postStockReturn(db, m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Supplier", order_id: order, supplier_id: 1, item_id: item, warehouse_id: wh, return_date: date, quantity: qty, ...extra }).id);
  return { wh, item, order, receive, ret };
}
const recorded = (db, returnId) => db.prepare("SELECT sl.source_id inward_id, r.quantity, r.rate, r.billed, r.value_minor, r.recorded_by FROM stock_return_receipts r JOIN stock_ledger sl ON sl.id = r.stock_ledger_id WHERE r.stock_return_id = ? ORDER BY r.id").all(returnId);

test("a posted supplier return records the receipts it used, oldest first, with units, rate and value", () => {
  const db = fresh();
  const s = setup(db, "RR Record");
  const a = s.receive(10, 100, "RR-A");
  const b = s.receive(10, 200, "RR-B");
  const r = s.ret(15, "2026-07-02");
  assert.deepEqual(recorded(db, r.id), [
    { inward_id: a.id, quantity: 10, rate: 100, billed: 0, value_minor: 100000, recorded_by: "posting" },
    { inward_id: b.id, quantity: 5, rate: 200, billed: 0, value_minor: 100000, recorded_by: "posting" }
  ]);
});

test("a later return takes an earlier return's records as they are, not a fresh replay", () => {
  const db = fresh();
  const s = setup(db, "RR Wins");
  s.receive(10, 100, "RR-W1");
  s.receive(10, 200, "RR-W2");
  const r1 = s.ret(5, "2026-07-02");
  // Change what a replay would see for the first return: on another order it would use no
  // receipt of this order. Its record still says it used five units of the first receipt.
  const other = newOrder(db, "RR-OTHER");
  db.prepare("UPDATE stock_returns SET order_id = ? WHERE id = ?").run(other, r1.id);
  const before = balance(db, "Goods Received Not Invoiced");
  const r2 = s.ret(10, "2026-07-03");
  assert.equal(Math.round((balance(db, "Goods Received Not Invoiced") - before) * 100) / 100, 1500, "5 left at 100 plus 5 at 200");
  assert.deepEqual(recorded(db, r2.id).map((x) => [x.quantity, x.rate]), [[5, 100], [5, 200]]);
});

test("a return posted before the records existed is recorded once, by replay, when the next return posts", () => {
  const db = fresh();
  const s = setup(db, "RR Backfill");
  s.receive(10, 100, "RR-B1");
  const r1 = s.ret(4, "2026-07-02");
  db.prepare("DELETE FROM stock_return_receipts WHERE stock_return_id = ?").run(r1.id);
  const r2 = s.ret(3, "2026-07-03");
  assert.deepEqual(recorded(db, r1.id).map((x) => [x.quantity, x.recorded_by]), [[4, "backfill"]]);
  assert.deepEqual(recorded(db, r2.id).map((x) => [x.quantity, x.recorded_by]), [[3, "posting"]]);
  const r3 = s.ret(1, "2026-07-04");
  assert.equal(recorded(db, r1.id).length, 1, "recorded only once");
  assert.deepEqual(recorded(db, r3.id).map((x) => x.quantity), [1]);
});

test("a reversed return gives its recorded units back to the receipts", () => {
  const db = fresh();
  const s = setup(db, "RR Reverse");
  s.receive(10, 100, "RR-R1");
  s.receive(10, 200, "RR-R2");
  const r1 = s.ret(10, "2026-07-02");
  m.reverseStockReturn(db, r1.id);
  const r2 = s.ret(10, "2026-07-03");
  assert.deepEqual(recorded(db, r2.id).map((x) => [x.quantity, x.rate]), [[10, 100]], "the first receipt is whole again");
});

test("a department return records nothing", () => {
  const db = fresh();
  const s = setup(db, "RR Dept");
  s.receive(10, 100, "RR-D1");
  const dept = db.prepare("SELECT id FROM government_departments LIMIT 1").get().id;
  const r = m.postStockReturn(db, m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Department", order_id: s.order, department_id: dept, item_id: s.item, warehouse_id: s.wh, return_date: "2026-07-02", quantity: 2 }).id);
  assert.equal(recorded(db, r.id).length, 0);
});

test("an existing database gets the table and the stock-ledger index, with a backup first", () => {
  const root = freshRoot();
  const db = fresh(root);
  db.exec("DROP TABLE stock_return_receipts; DROP INDEX idx_stock_ledger_source");
  db.prepare("DELETE FROM schema_migrations WHERE migration_name = '039_stock_return_receipts'").run();
  db.close();
  const reopened = fresh(root);
  assert.ok(reopened.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'stock_return_receipts'").get());
  assert.ok(reopened.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_stock_ledger_source'").get());
  assert.ok(fs.readdirSync(path.join(root, "backups")).some((name) => name.startsWith("pre-upgrade-")), "copied aside before the upgrade");
});
