// Regression tests for the posting-integrity phase (branch claude/erp-full-automation-qbhv8k).
// Each test builds its own throwaway database in the OS temp folder.
// Run from the repo root:  node --test scripts/audit/posting-regressions.test.mjs
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const m = await import(pathToFileURL(path.join(REPO, "src/main/database/init.js")).href);
const money = await import(pathToFileURL(path.join(REPO, "src/main/domain/money.js")).href);

const handles = [];
const roots = [];
afterEach(() => {
  while (handles.length) { const db = handles.pop(); try { if (db.open) db.close(); } catch { /* closed */ } }
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
function fresh() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-regress-"));
  roots.push(root);
  const db = m.initializeDatabase(root);
  handles.push(db);
  return db;
}

test("money rounds half-up exactly, including binary edge cases", () => {
  assert.equal(money.parseMoneyToMinor(1.005), 101);
  assert.equal(money.parseMoneyToMinor(2.675), 268);
  assert.equal(money.parseMoneyToMinor(1181.475), 118148);
  assert.equal(money.roundMoney(0.1 + 0.2), 0.3);
});

test("voucher numbers never repeat after a voucher is deleted", () => {
  const db = fresh();
  const first = m.nextVoucherNumber(db, 1, "RGT");
  db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status) VALUES (1, ?, '2026-07-01', 'Journal', 'Draft')").run(first);
  const second = m.nextVoucherNumber(db, 1, "RGT");
  db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status) VALUES (1, ?, '2026-07-01', 'Journal', 'Draft')").run(second);
  db.prepare("DELETE FROM vouchers WHERE voucher_number = ?").run(first);
  const third = m.nextVoucherNumber(db, 1, "RGT");
  assert.notEqual(third, second, "the next number must not reuse the last number still in the books");
  assert.equal(third, "RGT-00003");
});

test("reversing a posted stock inward moves the stock back exactly once", () => {
  const db = fresh();
  const wh = m.createRecord(db, "warehouses", { company_id: 1, warehouse_name: "RW", status: "active" }).id;
  const item = m.createRecord(db, "items", { item_name: "Regression Widget", unit: "Nos", status: "active", gst_rate: 18, opening_stock: 0, opening_rate: 0, opening_value: 0, default_warehouse_id: wh }).id;
  const inward = m.createRecord(db, "stock_inwards", { company_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-06-10", purchase_invoice_number: "RP1", quantity: 10, rate: 100, landed_cost: 0 });
  m.postStockInward(db, inward.id);
  m.reverseStockInward(db, inward.id);
  const balance = m.stockBalance(db, 1, item, wh);
  assert.deepEqual({ quantity: balance.quantity, value: Math.round(balance.value) }, { quantity: 0, value: 0 });
  assert.throws(() => m.reverseStockInward(db, inward.id), /already reversed/i);
});

test("a stock inward whose goods were already issued cannot be reversed into negative stock", () => {
  const db = fresh();
  const wh = m.createRecord(db, "warehouses", { company_id: 1, warehouse_name: "RW2", status: "active" }).id;
  const item = m.createRecord(db, "items", { item_name: "Regression Widget 2", unit: "Nos", status: "active", gst_rate: 18, opening_stock: 0, opening_rate: 0, opening_value: 0, default_warehouse_id: wh }).id;
  const order = db.prepare("SELECT id, department_id FROM supply_orders LIMIT 1").get();
  const inward = m.createRecord(db, "stock_inwards", { company_id: 1, item_id: item, warehouse_id: wh, inward_date: "2026-06-10", purchase_invoice_number: "RP2", quantity: 5, rate: 100, landed_cost: 0 });
  m.postStockInward(db, inward.id);
  const outward = m.createRecord(db, "stock_outwards", { company_id: 1, item_id: item, warehouse_id: wh, issue_date: "2026-06-12", delivery_challan_number: "RDC1", quantity_issued: 5, order_id: order.id, department_id: order.department_id });
  m.postStockOutward(db, outward.id);
  assert.throws(() => m.reverseStockInward(db, inward.id), /below zero|Reverse the later issue/i);
  assert.equal(db.prepare("SELECT posting_status FROM stock_inwards WHERE id = ?").get(inward.id).posting_status, "Posted");
});

test("a failed second posting attempt never marks a posted document as Error", () => {
  const db = fresh();
  const p = m.createRecord(db, "procurements", { company_id: 1, order_id: 1, purchase_date: "2025-06-01", supplier_id: 1, purchase_invoice_number: "RINV1", purchase_value: 1000, purchase_gst: 180 });
  m.postPurchaseVoucher(db, p.id);
  assert.throws(() => m.postPurchaseVoucher(db, p.id), /already posted/i);
  assert.equal(db.prepare("SELECT posting_status FROM procurements WHERE id = ?").get(p.id).posting_status, "Posted");
});
