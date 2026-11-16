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
  const copies = fs.readdirSync(path.join(root, "backups")).filter((name) => name.startsWith("pre-upgrade-"));
  assert.equal(copies.length, 1, "copied aside before the upgrade");
  const copy = new (reopened.constructor)(path.join(root, "backups", copies[0]), { readonly: true });
  try {
    assert.equal(copy.prepare("SELECT 1 FROM sqlite_master WHERE name = 'stock_return_receipts'").get(), undefined, "the copy is from before the table existed");
  } finally { copy.close(); }
});

test("every migration after the 036 baseline gets the pre-upgrade backup", () => {
  // Names a fresh database records, plus every migration-shaped string in the database modules
  // (so a migration that runs only on older databases, or is written in any call shape, counts).
  const db = fresh();
  const run = db.prepare("SELECT migration_name FROM schema_migrations").all().map((x) => x.migration_name);
  const dir = path.join(REPO, "src/main/database");
  const written = fs.readdirSync(dir).filter((f) => f.endsWith(".js"))
    .flatMap((f) => [...fs.readFileSync(path.join(dir, f), "utf8").matchAll(/["'`](\d{3}_[a-z0-9_]+)["'`]/g)].map((x) => x[1]));
  const later = [...new Set([...run, ...written])].filter((name) => /^\d{3}_/.test(name) && Number(name.slice(0, 3)) >= 36);
  assert.ok(later.includes("039_stock_return_receipts"));
  for (const name of later) assert.ok(m.MIGRATIONS_WITH_BACKUP.includes(name), `${name} is in MIGRATIONS_WITH_BACKUP`);
});

test("recorded rows cannot be changed, and one return records each receipt once", () => {
  const db = fresh();
  const s = setup(db, "RR Locked");
  s.receive(10, 100, "RR-L1");
  const r = s.ret(2, "2026-07-02");
  assert.throws(() => db.prepare("UPDATE stock_return_receipts SET quantity = 9 WHERE stock_return_id = ?").run(r.id), /cannot be changed/);
  const row = db.prepare("SELECT * FROM stock_return_receipts WHERE stock_return_id = ?").get(r.id);
  assert.throws(() => db.prepare("INSERT INTO stock_return_receipts (company_id, stock_return_id, stock_ledger_id, quantity) VALUES (1, ?, ?, 1)").run(r.id, row.stock_ledger_id), /UNIQUE/);
});

test("a record pointing at a receipt that has left the pool is skipped, not a crash", () => {
  const db = fresh();
  const s = setup(db, "RR Gone");
  const a = s.receive(10, 100, "RR-G1");
  s.receive(10, 200, "RR-G2");
  s.ret(5, "2026-07-02");
  // The first receipt is marked reversed with no reversal row: it leaves no trace to replay.
  db.prepare("UPDATE stock_inwards SET posting_status = 'Reversed' WHERE id = ?").run(a.id);
  const r2 = s.ret(5, "2026-07-03");
  assert.deepEqual(recorded(db, r2.id).map((x) => [x.quantity, x.rate]), [[5, 200]]);
});

test("after a receipt is reversed, later returns use only the receipts still standing", () => {
  const db = fresh();
  const s = setup(db, "RR RevIn");
  const a = s.receive(10, 100, "RR-V1");
  s.receive(10, 200, "RR-V2");
  s.ret(5, "2026-07-02");
  m.reverseStockInward(db, a.id);
  const r2 = s.ret(5, "2026-07-03");
  assert.deepEqual(recorded(db, r2.id).map((x) => [x.quantity, x.rate]), [[5, 200]]);
});

test("each return's recorded rows add up to the GRNI it clears, to the paisa", () => {
  const db = fresh();
  const s = setup(db, "RR Zero");
  const before = balance(db, "Goods Received Not Invoiced");
  // Each receipt is worth 100.00 for 3 units, so a unit is 33.333...: a return taking one unit
  // from each receipt is 66.67, while two separately rounded rows would be 66.66.
  s.receive(3, 33.3333, "RR-Z1");
  s.receive(3, 33.3333, "RR-Z2");
  const returns = [s.ret(2, "2026-07-02"), s.ret(2, "2026-07-03"), s.ret(2, "2026-07-04")];
  // Each return is rounded to the paisa on its own, so three returns of a 1/3-paisa price can
  // clear one paisa more than was received (known, unchanged by this table).
  assert.ok(Math.abs(balance(db, "Goods Received Not Invoiced") - before) <= 0.01);
  for (const r of returns) {
    const rows = db.prepare("SELECT COALESCE(SUM(value_minor), 0) v FROM stock_return_receipts WHERE stock_return_id = ? AND billed = 0").get(r.id).v;
    const grniDebit = db.prepare("SELECT COALESCE(SUM(le.debit), 0) d FROM ledger_entries le JOIN accounts a ON a.id = le.account_id WHERE le.voucher_id = ? AND a.account_name = 'Goods Received Not Invoiced'").get(r.voucher_id).d;
    assert.equal(rows, Math.round(grniDebit * 100), `return ${r.id}: rows add up to the GRNI debit`);
  }
});

test("billed rows add up to the Trade Payables debit when receipts cover the return", () => {
  const db = fresh();
  const s = setup(db, "RR Billed");
  // Two billed receipts of 3 units for 100.00 each (33.333... a unit): one unit from each is 66.67.
  for (const no of ["RR-BL1", "RR-BL2"]) {
    const bill = m.createRecord(db, "procurements", { company_id: 1, order_id: s.order, purchase_date: "2026-07-01", supplier_id: 1, purchase_invoice_number: no, purchase_value: 100, purchase_gst: 0 });
    m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: s.order, procurement_id: bill.id, supplier_id: 1, item_id: s.item, warehouse_id: s.wh, inward_date: "2026-07-01", purchase_invoice_number: no, quantity: 3, rate: 33.3333, landed_cost: 0 }).id);
    m.postPurchaseVoucher(db, bill.id);
  }
  for (const [qty, date] of [[2, "2026-07-02"], [2, "2026-07-03"]]) {
    const r = s.ret(qty, date);
    const rows = recorded(db, r.id);
    assert.ok(rows.length && rows.every((x) => x.billed === 1), "billed receipts");
    const tpDebit = db.prepare("SELECT COALESCE(SUM(le.debit), 0) d FROM ledger_entries le JOIN accounts a ON a.id = le.account_id WHERE le.voucher_id = ? AND a.account_name = 'Trade Payables'").get(r.voucher_id).d;
    assert.equal(rows.reduce((t, x) => t + x.value_minor, 0), Math.round(tpDebit * 100), `return ${r.id}: rows add up to the Trade Payables debit`);
  }
});

test("a return using billed and unbilled receipts rounds each kind on its own", () => {
  const db = fresh();
  const s = setup(db, "RR Mixed");
  s.receive(3, 33.3333, "RR-MX1");
  const bill = m.createRecord(db, "procurements", { company_id: 1, order_id: s.order, purchase_date: "2026-07-01", supplier_id: 1, purchase_invoice_number: "RR-MX2", purchase_value: 100, purchase_gst: 0 });
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, order_id: s.order, procurement_id: bill.id, supplier_id: 1, item_id: s.item, warehouse_id: s.wh, inward_date: "2026-07-01", purchase_invoice_number: "RR-MX2", quantity: 3, rate: 33.3333, landed_cost: 0 }).id);
  m.postPurchaseVoucher(db, bill.id);
  // The second return takes the last unbilled unit and one billed unit: a shared running total
  // would round the billed unit to 33.34 while Trade Payables is debited 33.33.
  s.ret(2, "2026-07-02");
  const r = s.ret(2, "2026-07-03");
  const debit = (name) => Math.round(db.prepare("SELECT COALESCE(SUM(le.debit), 0) d FROM ledger_entries le JOIN accounts a ON a.id = le.account_id WHERE le.voucher_id = ? AND a.account_name = ?").get(r.voucher_id, name).d * 100);
  const sum = (billed) => db.prepare("SELECT COALESCE(SUM(value_minor), 0) v FROM stock_return_receipts WHERE stock_return_id = ? AND billed = ?").get(r.id, billed).v;
  assert.deepEqual(recorded(db, r.id).map((x) => x.billed), [0, 1]);
  assert.equal(sum(0), debit("Goods Received Not Invoiced"));
  assert.equal(sum(1), debit("Trade Payables"));
});

test("an earlier return that used no receipt is not backfilled again and again", () => {
  const db = fresh();
  const s = setup(db, "RR Empty");
  // Opening stock only: the supplier has no receipt, so the first return uses none.
  db.prepare("UPDATE items SET opening_stock = 20, opening_rate = 50, opening_value = 1000 WHERE id = ?").run(s.item);
  s.ret(2, "2026-07-02");
  s.receive(10, 100, "RR-E1");
  for (const date of ["2026-07-03", "2026-07-04", "2026-07-05"]) s.ret(1, date);
  const entries = db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action = 'stock_return_receipts_backfilled'").get().c;
  assert.equal(entries, 0, "no empty backfill entries");
});

test("the update trigger and unique index come back at start-up if missing", () => {
  const root = freshRoot();
  const db = fresh(root);
  db.exec("DROP TRIGGER trg_stock_return_receipts_no_update; DROP INDEX idx_stock_return_receipts_unique");
  db.close();
  const reopened = fresh(root);
  assert.ok(reopened.prepare("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_stock_return_receipts_no_update'").get());
  assert.ok(reopened.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_stock_return_receipts_unique'").get());
});

test("altered locks in a restored file are put back at start-up and logged", () => {
  const root = freshRoot();
  const db = fresh(root);
  const s = setup(db, "RR Tamper");
  s.receive(10, 100, "RR-T1");
  const r = s.ret(2, "2026-07-02");
  db.exec(`DROP TRIGGER trg_stock_return_receipts_no_update;
    CREATE TRIGGER trg_stock_return_receipts_no_update BEFORE UPDATE ON stock_return_receipts WHEN 0 BEGIN SELECT 1; END;
    CREATE TRIGGER planted_after_insert AFTER INSERT ON stock_return_receipts BEGIN SELECT 1; END;
    DROP INDEX idx_stock_return_receipts_unique;
    CREATE INDEX idx_stock_return_receipts_unique ON stock_return_receipts(stock_return_id, stock_ledger_id);`);
  db.close();
  const reopened = fresh(root);
  assert.throws(() => reopened.prepare("UPDATE stock_return_receipts SET quantity = 9 WHERE stock_return_id = ?").run(r.id), /cannot be changed/);
  const triggers = reopened.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'stock_return_receipts'").all().map((x) => x.name);
  assert.deepEqual(triggers, ["trg_stock_return_receipts_no_update"]);
  const row = reopened.prepare("SELECT * FROM stock_return_receipts WHERE stock_return_id = ?").get(r.id);
  assert.throws(() => reopened.prepare("INSERT INTO stock_return_receipts (company_id, stock_return_id, stock_ledger_id, quantity) VALUES (1, ?, ?, 1)").run(r.id, row.stock_ledger_id), /UNIQUE/);
  const entry = JSON.parse(reopened.prepare("SELECT new_value FROM audit_log WHERE action = 'stock_return_receipts_locks_restored'").get().new_value);
  assert.deepEqual(entry.triggersRemoved, ["planted_after_insert"]);
  assert.deepEqual(entry.indexesRebuilt, ["idx_stock_return_receipts_unique"]);
});

test("duplicate recorded rows in a file do not stop the app from starting", () => {
  const root = freshRoot();
  const db = fresh(root);
  const s = setup(db, "RR Dup");
  s.receive(10, 100, "RR-D1");
  const r = s.ret(2, "2026-07-02");
  const row = db.prepare("SELECT * FROM stock_return_receipts WHERE stock_return_id = ?").get(r.id);
  db.exec("DROP INDEX idx_stock_return_receipts_unique");
  db.prepare("INSERT INTO stock_return_receipts (company_id, stock_return_id, stock_ledger_id, quantity) VALUES (1, ?, ?, 1)").run(r.id, row.stock_ledger_id);
  db.close();
  const reopened = fresh(root);
  const guards = reopened.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type = 'trigger' AND tbl_name IN ('vouchers', 'voucher_lines', 'ledger_entries')").get().c;
  assert.ok(guards > 0, "the ledger guards are back");
  const entry = JSON.parse(reopened.prepare("SELECT new_value FROM audit_log WHERE action = 'stock_return_receipts_locks_restored'").get().new_value);
  assert.deepEqual(entry.duplicates.map((d) => [d.stock_return_id, d.copies]), [[r.id, 2]]);
});
