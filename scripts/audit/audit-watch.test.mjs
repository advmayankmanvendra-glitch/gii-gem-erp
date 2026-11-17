// Audit Watch: every runnable check is tested on planted exceptions. Each test plants
// at least one row the check must flag and a look-alike it must leave alone, so both
// missed exceptions and false alarms fail the build.
// Run from the repo root:  node --test scripts/audit/audit-watch.test.mjs
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const load = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);
const m = await load("src/main/database/init.js");
const { CHECKS } = await load("src/main/services/auditWatch/catalogue.js");
const { CHECK_FUNCTIONS } = await load("src/main/services/auditWatch/checks.js");
const { readOnlyQuery, resolveLimits } = await load("src/main/services/auditWatch/auditWatchService.js");
const { fixtures, findings, names, istToday, shift } = await load("scripts/audit/lib/auditWatchFixtures.mjs");

const cleanup = [];
afterEach(() => { while (cleanup.length) cleanup.pop()(); });
function fresh() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-audit-watch-"));
  const db = m.initializeDatabase(root);
  cleanup.push(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { db, f: fixtures(db) };
}
const flagged = (list, ...refs) => assert.ok(names(list, ...refs), `expected a finding naming ${JSON.stringify(refs)}; got ${JSON.stringify(list.map((x) => x.summary))}`);
const clean = (list, ...refs) => assert.ok(!names(list, ...refs), `did not expect a finding naming ${JSON.stringify(refs)}`);

// ------------------------------------------------------------ engine

test("every runnable catalogue check has a function, and nothing else does", () => {
  const runnable = CHECKS.filter((check) => check.readiness === "now").map((check) => check.id).sort();
  assert.deepEqual(Object.keys(CHECK_FUNCTIONS).sort(), runnable);
});

test("the query helper refuses anything that writes", () => {
  const { db } = fresh();
  const q = readOnlyQuery(db);
  assert.ok(q("SELECT COUNT(*) c FROM vouchers")[0].c >= 0);
  for (const sql of ["DELETE FROM vouchers", "UPDATE users SET role = 'admin'", "INSERT INTO audit_log (action, table_name) VALUES ('x', 'y')",
    "CREATE TABLE aw_probe (id INTEGER)", "WITH x AS (SELECT 1) DELETE FROM items", "PRAGMA writable_schema = 1", "ATTACH DATABASE ':memory:' AS aw"]) {
    assert.throws(() => q(sql), undefined, sql);
  }
  assert.throws(() => q("SELECT 1; DELETE FROM vouchers"));
});

test("a full run changes nothing in the database", () => {
  const { db } = fresh();
  const snapshot = () => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()
    .map(({ name }) => `${name}:${db.prepare(`SELECT COUNT(*) c FROM "${name}"`).get().c}`).join("|");
  const before = snapshot();
  const changesBefore = db.prepare("SELECT total_changes() c").get().c;
  const result = m.runAuditWatch(db, { companyId: 1, role: "admin", today: "2026-11-17" });
  assert.equal(result.results.filter((row) => row.status === "error").length, 0, JSON.stringify(result.results.filter((row) => row.status === "error")));
  assert.equal(snapshot(), before);
  assert.equal(db.prepare("SELECT total_changes() c").get().c, changesBefore);
});

test("roles see only their areas; data entry and viewers are refused", () => {
  const { db } = fresh();
  const areas = (role) => [...new Set(m.runAuditWatch(db, { companyId: 1, role, today: "2026-11-17" }).results.map((row) => row.area))].sort();
  assert.deepEqual(areas("admin"), ["inventory", "it", "ledger", "procurement", "sales"]);
  assert.deepEqual(areas("accountant"), ["inventory", "ledger", "procurement", "sales"]);
  assert.deepEqual(areas("manager"), ["inventory", "procurement", "sales"]);
  assert.throws(() => m.runAuditWatch(db, { companyId: 1, role: "data_entry_operator" }), /cannot open Audit Watch/);
  assert.throws(() => m.runAuditWatch(db, { companyId: 1, role: "viewer" }), /cannot open Audit Watch/);
  assert.throws(() => m.runAuditWatch(db, { companyId: 1, role: "" }), /cannot open Audit Watch/);
  // Asking for an area the role cannot see returns nothing from it.
  const asked = m.runAuditWatch(db, { companyId: 1, role: "manager", areas: ["it", "ledger"], today: "2026-11-17" });
  assert.equal(asked.results.length, 0);
  assert.equal(m.auditWatchCatalogue("viewer").checks.length, 0);
});

test("bad companies, dates and limits are refused or ignored", () => {
  const { db } = fresh();
  assert.throws(() => m.runAuditWatch(db, { companyId: 0, role: "admin" }), /Choose a company/);
  assert.throws(() => m.runAuditWatch(db, { companyId: 999, role: "admin" }), /Company not found/);
  assert.throws(() => m.runAuditWatch(db, { companyId: 1, role: "admin", from: "2026-06-01", to: "2026-01-01" }), /start date/);
  assert.throws(() => m.runAuditWatch(db, { companyId: 1, role: "admin", from: "2020-01-01", to: "2026-01-01" }), /three years/);
  const check = CHECKS.find((row) => row.id === "AW-G02");
  assert.deepEqual(resolveLimits(check, { officeStart: "25:00", officeEnd: "18:30", junk: 5 }), { officeStart: "09:00", officeEnd: "18:30" });
  const p05 = CHECKS.find((row) => row.id === "AW-P05");
  assert.equal(resolveLimits(p05, { approvalLimitRupees: -5 }).approvalLimitRupees, 100000);
  assert.equal(resolveLimits(p05, { approvalLimitRupees: "50000" }).approvalLimitRupees, 50000);
  assert.equal(resolveLimits(p05, { nearLimitPercent: 5000 }).nearLimitPercent, 80);
});

test("findings never carry full bank account numbers", () => {
  const { db, f } = fresh();
  const a = f.supplier({ supplier_account_number: "123456789012", supplier_bank_ifsc_code: "SBIN0000001" });
  f.supplier({ supplier_account_number: "123456789012", supplier_bank_ifsc_code: "SBIN0000001" });
  f.bill(a);
  m.auditLog(db, { company_id: 1, user_id: 1, action: "update", table_name: "suppliers", record_id: a, old_value: JSON.stringify({ supplier_account_number: "111122223333" }), new_value: JSON.stringify({ supplier_account_number: "123456789012" }) });
  f.supplierPayment(a, { payment_date: istToday() });
  const result = m.runAuditWatch(db, { companyId: 1, role: "admin", from: shift(istToday(), -400), to: istToday(), today: istToday() });
  const text = JSON.stringify(result);
  assert.ok(!text.includes("123456789012") && !text.includes("111122223333"), "account numbers leaked into findings");
  assert.ok(text.includes("xx9012"));
});

// ------------------------------------------------------------ purchases

test("AW-P01 flags a bill keyed twice and a same-amount repeat, not different suppliers", () => {
  const { db, f } = fresh();
  const s = f.supplier();
  const other = f.supplier();
  const a = f.bill(s, { purchase_invoice_number: "INV/2026-07" });
  const b = f.bill(s, { purchase_invoice_number: "inv 2026 07", purchase_date: "2026-08-01", purchase_value: 999 });
  const c = f.bill(s, { purchase_invoice_number: "X-1", purchase_date: "2026-09-01", purchase_value: 5000, purchase_gst: 900 });
  const d = f.bill(s, { purchase_invoice_number: "X-2", purchase_date: "2026-09-05", purchase_value: 5000, purchase_gst: 900 });
  const e = f.bill(s, { purchase_invoice_number: "X-3", purchase_date: "2026-10-30", purchase_value: 5000, purchase_gst: 900 });
  const g = f.bill(other, { purchase_invoice_number: "INV/2026-07" });
  const list = findings(m, db, "AW-P01");
  flagged(list, ["procurements", a], ["procurements", b]);
  flagged(list, ["procurements", c], ["procurements", d]);
  clean(list, ["procurements", d], ["procurements", e]);
  clean(list, ["procurements", g]);
});

test("AW-P02 flags a reused UTR and a same-amount repeat within 7 days, not 30 days apart", () => {
  const { db, f } = fresh();
  const s = f.supplier();
  const a = f.supplierPayment(s, { utr_number: "UTR123", amount_paid: 100 });
  const b = f.supplierPayment(f.supplier(), { utr_number: " utr123 ", amount_paid: 200, payment_date: "2026-06-20" });
  const c = f.supplierPayment(s, { amount_paid: 7777, payment_date: "2026-07-01" });
  const d = f.supplierPayment(s, { amount_paid: 7777, payment_date: "2026-07-04" });
  const e = f.supplierPayment(s, { amount_paid: 7777, payment_date: "2026-08-10" });
  const list = findings(m, db, "AW-P02");
  flagged(list, ["supplier_payments", a], ["supplier_payments", b]);
  flagged(list, ["supplier_payments", c], ["supplier_payments", d]);
  clean(list, ["supplier_payments", e]);
});

test("AW-P03 flags a payment soon after a bank change, not after a phone change", () => {
  const { db, f } = fresh();
  const today = istToday();
  const changed = f.supplier();
  const phoneOnly = f.supplier();
  const late = f.supplier();
  const audit = (id, oldValue, newValue) => m.auditLog(db, { company_id: 1, user_id: 1, action: "update", table_name: "suppliers", record_id: id, old_value: JSON.stringify(oldValue), new_value: JSON.stringify(newValue) });
  audit(changed, { supplier_bank_ifsc_code: "HDFC0000001", mobile: "1" }, { supplier_bank_ifsc_code: "ICIC0000002", mobile: "1" });
  audit(phoneOnly, { mobile: "1", supplier_bank_ifsc_code: "HDFC0000001" }, { mobile: "2", supplier_bank_ifsc_code: "HDFC0000001" });
  audit(late, { upi_id: "a@x" }, { upi_id: "b@x" });
  const p1 = f.supplierPayment(changed, { payment_date: today });
  const p2 = f.supplierPayment(phoneOnly, { payment_date: today });
  const p3 = f.supplierPayment(late, { payment_date: shift(today, -3) });
  const list = findings(m, db, "AW-P03", { from: shift(today, -30), to: shift(today, 30), today });
  flagged(list, ["supplier_payments", p1]);
  clean(list, ["supplier_payments", p2]);
  clean(list, ["supplier_payments", p3]);
});

test("AW-P04 flags a bill paid beyond its amount, not one paid exactly", () => {
  const { db, f } = fresh();
  const s = f.supplier();
  const over = f.bill(s, { purchase_value: 1000, purchase_gst: 180 });
  const exact = f.bill(s, { purchase_value: 1000, purchase_gst: 180 });
  const pay = f.supplierPayment(s, { amount_paid: 3000 });
  f.allocate(pay, over, 1500);
  f.allocate(pay, exact, 1180);
  const list = findings(m, db, "AW-P04");
  flagged(list, ["procurements", over]);
  clean(list, ["procurements", exact]);
  assert.equal(list.find((row) => names([row], ["procurements", over])).amountMinor, 32000);
});

test("AW-P05 flags bills split under the approval limit, not two ordinary bills", () => {
  const { db, f } = fresh();
  const s = f.supplier();
  const quiet = f.supplier();
  const ids = ["2026-07-01", "2026-07-03", "2026-07-06"].map((date) => f.bill(s, { purchase_date: date, purchase_value: 90000 }));
  const q1 = f.bill(quiet, { purchase_date: "2026-07-01", purchase_value: 90000 });
  const q2 = f.bill(quiet, { purchase_date: "2026-07-20", purchase_value: 90000 });
  const list = findings(m, db, "AW-P05", { limits: { "AW-P05": { minimumBills: 3 } } });
  flagged(list, ...ids.map((id) => ["procurements", id]));
  clean(list, ["procurements", q1]);
  clean(list, ["procurements", q2]);
});

test("AW-P06 flags a rate far above the item's median, not a normal one", () => {
  const { db, f } = fresh();
  const s = f.supplier();
  const item = f.item();
  ["2026-04-05", "2026-05-05", "2026-06-05"].forEach((date, i) => f.billLine(f.bill(s, { purchase_date: date }), { item_id: item, purchase_rate: 100 + i }));
  const high = f.billLine(f.bill(s, { purchase_date: "2026-07-05" }), { item_id: item, purchase_rate: 140 });
  const normal = f.billLine(f.bill(s, { purchase_date: "2026-08-05" }), { item_id: item, purchase_rate: 110 });
  const list = findings(m, db, "AW-P06");
  flagged(list, ["procurement_items", high]);
  clean(list, ["procurement_items", normal]);
});

test("AW-P07 flags a bank account shared by a supplier and an employee, not one with another IFSC", () => {
  const { db, f } = fresh();
  const s = f.supplier({ supplier_account_number: "5555 4444 3333", supplier_bank_ifsc_code: "SBIN0001234" });
  f.bill(s);
  const e = f.insert("employees", { employee_name: "Clerk", mobile_number: "1", account_number: "555544443333", ifsc: "sbin0001234" });
  const s2 = f.supplier({ supplier_account_number: "999", supplier_bank_ifsc_code: "SBIN0001234" });
  const s3 = f.supplier({ supplier_account_number: "999", supplier_bank_ifsc_code: "HDFC0001234" });
  f.bill(s2);
  const list = findings(m, db, "AW-P07");
  flagged(list, ["suppliers", s], ["employees", e]);
  clean(list, ["suppliers", s2]);
  clean(list, ["suppliers", s3]);
});

test("AW-P08 flags a large payment to a supplier with no GSTIN, not a small one", () => {
  const { db, f } = fresh();
  const noGst = f.supplier({ gstin: "" });
  const inactive = f.supplier({ status: "inactive" });
  const big = f.supplierPayment(noGst, { amount_paid: 60000 });
  const small = f.supplierPayment(noGst, { amount_paid: 5000 });
  const toInactive = f.supplierPayment(inactive, { amount_paid: 70000 });
  const fine = f.supplierPayment(f.supplier(), { amount_paid: 90000 });
  const list = findings(m, db, "AW-P08");
  flagged(list, ["supplier_payments", big]);
  flagged(list, ["supplier_payments", toInactive]);
  clean(list, ["supplier_payments", small]);
  clean(list, ["supplier_payments", fine]);
});

// ------------------------------------------------------------ sales

test("AW-S01 flags billing below cost or the quote, not billing at the quote", () => {
  const { db, f } = fresh();
  const order = f.order();
  const cheap = f.orderItem(order, { quoted_rate: 1000 });
  const atCost = f.orderItem(order, { quoted_rate: 1000 });
  const fine = f.orderItem(order, { quoted_rate: 1000 });
  f.billLine(f.bill(f.supplier(), { order_id: order }), { order_item_id: atCost, quantity: 2, purchase_rate: 900, landed_cost: 2000 });
  const inv = f.invoice(order);
  const l1 = f.invoiceLine(inv, { order_item_id: cheap, billing_rate: 850 });
  const l2 = f.invoiceLine(inv, { order_item_id: atCost, billing_rate: 950 });
  const l3 = f.invoiceLine(inv, { order_item_id: fine, billing_rate: 1000 });
  const list = findings(m, db, "AW-S01");
  flagged(list, ["invoice_items", l1]);
  flagged(list, ["invoice_items", l2]);
  clean(list, ["invoice_items", l3]);
});

test("AW-S02 flags a credit note dated after the bill's month, not one in the same month", () => {
  const { db, f } = fresh();
  const order = f.order();
  const inv = f.invoice(order, { invoice_date: "2026-03-20" });
  const note = (date) => f.insert("guided_vouchers", { company_id: 1, voucher_kind: "credit_note", voucher_date: date, payload_json: JSON.stringify({ linked_invoice_id: inv }), status: "Posted" });
  const late = note("2026-04-05");
  const same = note("2026-03-28");
  const list = findings(m, db, "AW-S02");
  flagged(list, ["guided_vouchers", late]);
  assert.match(list.find((row) => names([row], ["guided_vouchers", late])).summary, /earlier financial year/);
  clean(list, ["guided_vouchers", same]);
});

test("AW-S03 flags a bill keyed weeks late or dated before dispatch, not a timely one", () => {
  const { db, f } = fresh();
  const order = f.order();
  f.challan(order, { dispatch_date: "2026-06-10" });
  const late = f.invoice(order, { invoice_date: "2026-06-12", created_at: "2026-07-20 05:00:00" });
  const early = f.invoice(order, { invoice_date: "2026-06-05", created_at: "2026-06-05 05:00:00" });
  const fine = f.invoice(order, { invoice_date: "2026-06-12", created_at: "2026-06-13 05:00:00" });
  const list = findings(m, db, "AW-S03");
  flagged(list, ["invoices", late]);
  flagged(list, ["invoices", early]);
  clean(list, ["invoices", fine]);
});

test("AW-S04 flags a receivable past its credit terms, not one inside them", () => {
  const { db, f } = fresh();
  const order = f.order();
  const old = f.receivable(f.invoice(order, { invoice_date: "2026-06-01" }));
  const recent = f.receivable(f.invoice(order, { invoice_date: "2026-10-20" }));
  const paid = f.receivable(f.invoice(order, { invoice_date: "2026-01-01" }), { balance_outstanding: 0, amount_received: 10000 });
  const list = findings(m, db, "AW-S04");
  flagged(list, ["receivables", old]);
  clean(list, ["receivables", recent]);
  clean(list, ["receivables", paid]);
});

test("AW-S05 flags a GeM contract billed on two orders and over-billed lines", () => {
  const { db, f } = fresh();
  const o1 = f.order();
  const o2 = f.order();
  const a = f.invoice(o1, { gem_contract_number: "GEMC-1" });
  const b = f.invoice(o2, { gem_contract_number: "gemc-1 " });
  const c = f.invoice(o1, { gem_contract_number: "GEMC-2" });
  const d = f.invoice(o1, { gem_contract_number: "GEMC-2" });
  const line = f.orderItem(o1, { quantity: 5 });
  const exact = f.orderItem(o1, { quantity: 5 });
  f.invoiceLine(c, { order_item_id: line, quantity: 4 });
  f.invoiceLine(d, { order_item_id: line, quantity: 3 });
  f.invoiceLine(c, { order_item_id: exact, quantity: 5 });
  const list = findings(m, db, "AW-S05");
  flagged(list, ["invoices", a], ["invoices", b]);
  clean(list, ["invoices", c], ["invoices", d]);
  flagged(list, ["order_items", line]);
  clean(list, ["order_items", exact]);
});

test("AW-S06 flags more received than billed, not an exact settlement", () => {
  const { db, f } = fresh();
  const order = f.order();
  const over = f.receivable(f.invoice(order), { amount_received: 9500, tds_deducted: 200, other_deductions: 400, balance_outstanding: 0 });
  const exact = f.receivable(f.invoice(order), { amount_received: 9800, tds_deducted: 200, balance_outstanding: 0 });
  const list = findings(m, db, "AW-S06");
  flagged(list, ["receivables", over]);
  clean(list, ["receivables", exact]);
});

test("AW-S07 flags a deduction above 5% of the bill, not one at 4%", () => {
  const { db, f } = fresh();
  const order = f.order();
  const big = f.receivable(f.invoice(order), { other_deductions: 600 });
  const small = f.receivable(f.invoice(order), { other_deductions: 400 });
  const list = findings(m, db, "AW-S07");
  flagged(list, ["receivables", big]);
  clean(list, ["receivables", small]);
});

// ------------------------------------------------------------ stock

test("AW-I01 flags stock going below zero, not a same-day receipt and issue", () => {
  const { db, f } = fresh();
  const w = f.warehouse();
  const short = f.item();
  const sameDay = f.item();
  f.stockMove(short, w, "2026-06-01", 2);
  f.stockMove(short, w, "2026-06-02", -5);
  f.stockMove(short, w, "2026-06-03", 10);
  f.stockMove(sameDay, w, "2026-06-01", -3);
  f.stockMove(sameDay, w, "2026-06-01", 3);
  const list = findings(m, db, "AW-I01");
  flagged(list, ["items", short]);
  clean(list, ["items", sameDay]);
});

test("AW-I02 flags stock idle for six months, not stock that moved recently or is used up", () => {
  const { db, f } = fresh();
  const w = f.warehouse();
  const idle = f.item();
  const moving = f.item();
  const empty = f.item();
  f.stockMove(idle, w, "2026-01-10", 4);
  f.stockMove(moving, w, "2026-01-10", 4);
  f.stockMove(moving, w, "2026-10-01", -1);
  f.stockMove(empty, w, "2026-01-10", 4);
  f.stockMove(empty, w, "2026-02-10", -4);
  const list = findings(m, db, "AW-I02");
  flagged(list, ["items", idle]);
  clean(list, ["items", moving]);
  clean(list, ["items", empty]);
});

test("AW-I03 flags a large adjustment and repeated adjustments, not one small one", () => {
  const { db, f } = fresh();
  const w = f.warehouse();
  const adjust = (item, date, quantity, rate) => f.insert("stock_adjustments", { company_id: 1, item_id: item, warehouse_id: w, adjustment_date: date, adjustment_type: "Decrease", quantity, rate });
  const bigItem = f.item();
  const big = adjust(bigItem, "2026-06-01", 10, 3000);
  const busy = f.item();
  const repeats = ["2026-07-01", "2026-07-08", "2026-07-15"].map((date) => adjust(busy, date, 1, 10));
  const small = adjust(f.item(), "2026-06-01", 1, 100);
  const list = findings(m, db, "AW-I03");
  flagged(list, ["stock_adjustments", big]);
  flagged(list, ...repeats.map((id) => ["stock_adjustments", id]));
  clean(list, ["stock_adjustments", small]);
});

test("AW-I04 flags a supplier with repeated damaged returns, not good-condition returns", () => {
  const { db, f } = fresh();
  const w = f.warehouse();
  const item = f.item();
  const bad = f.supplier();
  const good = f.supplier();
  const ret = (supplier, condition, date) => f.insert("stock_returns", { company_id: 1, return_type: "Supplier", supplier_id: supplier, item_id: item, warehouse_id: w, return_date: date, quantity: 1, condition_status: condition });
  ["2026-09-01", "2026-09-10", "2026-10-01"].forEach((date) => ret(bad, "Damaged", date));
  ["2026-09-01", "2026-09-10", "2026-10-01"].forEach((date) => ret(good, "Good", date));
  const list = findings(m, db, "AW-I04");
  flagged(list, ["suppliers", bad]);
  clean(list, ["suppliers", good]);
});

test("AW-I05 flags one serial number recorded twice for an item, not the same text on two items", () => {
  const { db, f } = fresh();
  const a = f.item();
  const b = f.item();
  const s1 = f.insert("serial_numbers", { company_id: 1, item_id: a, serial_number: "SN-001" });
  const s2 = f.insert("serial_numbers", { company_id: 1, item_id: a, serial_number: " sn-001" });
  const s3 = f.insert("serial_numbers", { company_id: 1, item_id: b, serial_number: "SN-002" });
  const s4 = f.insert("serial_numbers", { company_id: 1, item_id: a, serial_number: "SN-002" });
  const list = findings(m, db, "AW-I05");
  flagged(list, ["serial_numbers", s1], ["serial_numbers", s2]);
  clean(list, ["serial_numbers", s3]);
  clean(list, ["serial_numbers", s4]);
});

test("AW-I06 flags an expired batch with stock, not a used-up or unexpired one", () => {
  const { db, f } = fresh();
  const item = f.item();
  const batch = (no, balance, expiry) => f.insert("batches", { company_id: 1, item_id: item, batch_number: no, quantity: 5, balance_quantity: balance, expiry_date: expiry });
  const expired = batch("B1", 2, "2026-10-01");
  const used = batch("B2", 0, "2026-10-01");
  const fresh1 = batch("B3", 2, "2027-01-01");
  const list = findings(m, db, "AW-I06");
  flagged(list, ["batches", expired]);
  clean(list, ["batches", used]);
  clean(list, ["batches", fresh1]);
});

test("AW-I07 flags over-buying and billing beyond delivery, not exact quantities", () => {
  const { db, f } = fresh();
  const w = f.warehouse();
  const order = f.order();
  const item = f.item();
  const itemOk = f.item();
  const overLine = f.orderItem(order, { quantity: 5, item_id: item });
  const exactLine = f.orderItem(order, { quantity: 5, item_id: itemOk });
  const bill = f.bill(f.supplier(), { order_id: order });
  f.billLine(bill, { order_item_id: overLine, quantity: 7 });
  f.billLine(bill, { order_item_id: exactLine, quantity: 5 });
  const dc = f.challan(order);
  f.challanLine(dc, item, w, 3);
  f.challanLine(dc, itemOk, w, 5);
  const inv = f.invoice(order);
  f.invoiceLine(inv, { order_item_id: overLine, item_id: item, quantity: 5 });
  f.invoiceLine(inv, { order_item_id: exactLine, item_id: itemOk, quantity: 5 });
  const list = findings(m, db, "AW-I07");
  flagged(list, ["order_items", overLine]);
  clean(list, ["order_items", exactLine]);
  flagged(list, ["supply_orders", order], ["items", item]);
  clean(list, ["supply_orders", order], ["items", itemOk]);
});

// ------------------------------------------------------------ ledger

test("AW-G01 flags a large hand journal through Cash, not one between expense ledgers", () => {
  const { db, f } = fresh();
  const cash = f.voucher({ date: "2026-07-07", lines: [["Cash", 25000, 0], ["Capital", 0, 25000]] });
  const expenses = f.voucher({ date: "2026-07-07", lines: [["Transport Expense", 25000, 0], ["Installation Expense", 0, 25000]] });
  const system = f.voucher({ date: "2026-07-07", source: "payment", lines: [["Cash", 25000, 0], ["Capital", 0, 25000]] });
  const list = findings(m, db, "AW-G01");
  flagged(list, ["vouchers", cash]);
  clean(list, ["vouchers", expenses]);
  clean(list, ["vouchers", system]);
});

test("AW-G02 flags a Sunday date or a late-night keying, not a weekday in office hours", () => {
  const { db, f } = fresh();
  const lines = [["Transport Expense", 100, 0], ["Cash", 0, 100]];
  const sunday = f.voucher({ date: "2026-07-05", createdAt: "2026-07-06 05:00:00", lines });
  const night = f.voucher({ date: "2026-07-07", createdAt: "2026-07-07 17:00:00", lines });
  const day = f.voucher({ date: "2026-07-07", createdAt: "2026-07-07 06:00:00", lines });
  const list = findings(m, db, "AW-G02");
  flagged(list, ["vouchers", sunday]);
  flagged(list, ["vouchers", night]);
  clean(list, ["vouchers", day]);
});

test("AW-G03 flags a large round-sum journal, not an uneven amount", () => {
  const { db, f } = fresh();
  const round = f.voucher({ date: "2026-07-07", lines: [["Transport Expense", 200000, 0], ["Expense Payable", 0, 200000]] });
  const uneven = f.voucher({ date: "2026-07-07", lines: [["Transport Expense", 201437.5, 0], ["Expense Payable", 0, 201437.5]] });
  const list = findings(m, db, "AW-G03");
  flagged(list, ["vouchers", round]);
  clean(list, ["vouchers", uneven]);
});

test("AW-G04 flags an old suspense balance, not one cleared later", () => {
  const { db, f } = fresh();
  const suspenseId = f.accountId("Opening Balance Suspense");
  f.voucher({ date: "2026-05-01", source: "opening_balance", lines: [["Trade Receivables", 5000, 0], ["Opening Balance Suspense", 0, 5000]] });
  let list = findings(m, db, "AW-G04");
  flagged(list, ["accounts", suspenseId]);
  f.voucher({ date: "2026-11-10", lines: [["Opening Balance Suspense", 5000, 0], ["Capital", 0, 5000]] });
  list = findings(m, db, "AW-G04");
  clean(list, ["accounts", suspenseId]);
});

test("AW-G05 flags a voucher keyed weeks after its date, not an opening balance", () => {
  const { db, f } = fresh();
  const lines = [["Transport Expense", 100, 0], ["Cash", 0, 100]];
  const back = f.voucher({ date: "2026-07-01", createdAt: "2026-08-15 06:00:00", lines });
  const timely = f.voucher({ date: "2026-07-01", createdAt: "2026-07-03 06:00:00", lines });
  const opening = f.voucher({ date: "2026-04-01", createdAt: "2026-08-15 06:00:00", source: "opening_balance", lines: [["Trade Receivables", 100, 0], ["Opening Balance Suspense", 0, 100]] });
  const list = findings(m, db, "AW-G05");
  flagged(list, ["vouchers", back]);
  clean(list, ["vouchers", timely]);
  clean(list, ["vouchers", opening]);
});

test("AW-G06 flags a late reversal and a burst of reversals by one user", () => {
  const { db, f } = fresh();
  const user = f.user();
  const lines = [["Transport Expense", 100, 0], ["Cash", 0, 100]];
  const reverse = (date, on) => {
    const id = f.voucher({ date, lines });
    db.prepare("UPDATE vouchers SET status = 'Reversed', reversal_date = ?, reversed_by = ?, reversal_reason = 'fixture' WHERE id = ?").run(on, user, id);
    return id;
  };
  // The guard lets a voucher become Reversed only once a reversal posts; fixtures stand in for that here.
  db.exec("DROP TRIGGER IF EXISTS trg_ledger_guard_voucher_posted_update");
  const late = reverse("2026-04-10", "2026-07-20");
  const burst = ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05"].map((date) => reverse(date, date));
  const list = findings(m, db, "AW-G06");
  flagged(list, ["vouchers", late]);
  clean(list.filter((row) => !row.key.includes("user-")), ["vouchers", burst[0]]);
  flagged(list, ...burst.map((id) => ["vouchers", id]));
});

test("AW-G07 flags an old unmatched bank line, not a matched or recent one", () => {
  const { db, f } = fresh();
  const imp = f.insert("bank_statement_imports", { company_id: 1 });
  const line = (date, status) => f.insert("bank_statement_entries", { company_id: 1, import_id: imp, transaction_date: date, amount: 500, match_status: status });
  const old = line("2026-09-01", "Unmatched");
  const matched = line("2026-09-01", "Matched");
  const recent = line("2026-11-15", "Unmatched");
  const list = findings(m, db, "AW-G07");
  flagged(list, ["bank_statement_entries", old]);
  clean(list, ["bank_statement_entries", matched]);
  clean(list, ["bank_statement_entries", recent]);
});

test("AW-G08 flags a ledger whose first digits break Benford's pattern, not one that follows it", () => {
  const { db, f } = fresh();
  const odd = f.accountId("Transport Expense");
  const natural = f.accountId("Installation Expense");
  // 320 entries all starting with 7 or 8 against 320 entries spread like natural amounts.
  for (let i = 0; i < 320; i += 1) {
    const amount = (i % 2 ? 7000 : 8000) + i;
    const benford = Math.round(10 ** (2 + (i + 0.5) / 320) * 100) / 100;
    f.voucher({ date: "2026-07-07", source: "expense", lines: [["Transport Expense", amount, 0], ["Expense Payable", 0, amount]] });
    f.voucher({ date: "2026-07-07", source: "expense", lines: [["Installation Expense", benford, 0], ["Expense Payable", 0, benford]] });
  }
  const list = findings(m, db, "AW-G08", { limits: { "AW-G08": { minimumRows: 300 } } });
  flagged(list, ["accounts", odd]);
  clean(list, ["accounts", natural]);
});

test("AW-G09 flags cash going below zero, not cash that stays positive", () => {
  const { db, f } = fresh();
  const cashId = f.accountId("Cash");
  const before = findings(m, db, "AW-G09");
  f.voucher({ date: "2026-09-01", lines: [["Cash", 100000, 0], ["Capital", 0, 100000]] });
  f.voucher({ date: "2026-09-02", lines: [["Transport Expense", 50000, 0], ["Cash", 0, 50000]] });
  assert.equal(findings(m, db, "AW-G09").length, before.length, "positive cash raised a finding");
  f.voucher({ date: "2026-09-03", lines: [["Transport Expense", 900000, 0], ["Cash", 0, 900000]] });
  const list = findings(m, db, "AW-G09");
  flagged(list, ["accounts", cashId]);
  assert.ok(list.some((row) => row.date === "2026-09-03"));
});

test("AW-G10 reports a failed book check and is clear on sound books", () => {
  const { db } = fresh();
  assert.equal(findings(m, db, "AW-G10").length, 0);
  db.prepare("INSERT INTO audit_log (company_id, action, table_name, created_at, event_hash) VALUES (1, 'tamper', 'vouchers', '2026-07-01 00:00:00', 'not-a-real-hash')").run();
  const list = findings(m, db, "AW-G10");
  assert.ok(list.length >= 1, "a broken audit chain should be reported");
});

// ------------------------------------------------------------ users and access

test("AW-T01 flags an admin idle for 90 days, not an active one or a non-admin", () => {
  const { db, f } = fresh();
  const today = "2026-11-17";
  const idle = f.user({ role: "admin", last_login_at: "2026-06-01T05:00:00.000Z" });
  const active = f.user({ role: "admin", last_login_at: "2026-11-10T05:00:00.000Z" });
  const clerk = f.user({ role: "accountant", last_login_at: "2026-01-01T05:00:00.000Z" });
  const disabled = f.user({ role: "admin", status: "inactive", last_login_at: "2026-01-01T05:00:00.000Z" });
  const list = findings(m, db, "AW-T01", { today });
  flagged(list, ["users", idle]);
  clean(list, ["users", active]);
  clean(list, ["users", clerk]);
  clean(list, ["users", disabled]);
});

test("AW-T02 flags repeated failed logins and locked accounts", () => {
  const { db, f } = fresh();
  const tries = f.user({ failed_login_count: 4 });
  const locked = f.user({ failed_login_count: 0, locked_until: "2999-01-01T00:00:00.000Z" });
  const fine = f.user({ failed_login_count: 1 });
  const list = findings(m, db, "AW-T02");
  flagged(list, ["users", tries]);
  flagged(list, ["users", locked]);
  clean(list, ["users", fine]);
});

test("AW-T03 flags the same maker and approver, not two different people", () => {
  const { db, f } = fresh();
  const a = f.user();
  const b = f.user();
  const gv = (maker, checker) => f.insert("guided_vouchers", { company_id: 1, voucher_kind: "journal", voucher_date: "2026-07-01", payload_json: "{}", status: "Approved", created_by: maker, approved_by: checker });
  const self = gv(a, a);
  const pair = gv(a, b);
  let record = 0;
  const aq = (maker, checker) => f.insert("approval_queue", { company_id: 1, module_name: "stock_adjustments", record_id: ++record, maker_id: maker, checker_id: checker, approval_status: "Approved", approved_at: "2026-07-01 06:00:00" });
  const selfQ = aq(b, b);
  const pairQ = aq(a, b);
  const list = findings(m, db, "AW-T03");
  flagged(list, ["guided_vouchers", self]);
  clean(list, ["guided_vouchers", pair]);
  flagged(list, ["approval_queue", selfQ]);
  clean(list, ["approval_queue", pairQ]);
});

test("AW-T04 flags a role raised to admin and an incentive change, not a name change", () => {
  const { db, f } = fresh();
  const today = istToday();
  const u = f.user();
  const log = (table, id, oldValue, newValue) => m.auditLog(db, { company_id: 1, user_id: 1, action: "update", table_name: table, record_id: id, old_value: JSON.stringify(oldValue), new_value: JSON.stringify(newValue) });
  log("users", u, { role: "accountant" }, { role: "admin" });
  log("employees", 7, { incentive_percentage: 1 }, { incentive_percentage: 5 });
  log("employees", 8, { employee_name: "A", incentive_percentage: 1 }, { employee_name: "B", incentive_percentage: 1 });
  const list = findings(m, db, "AW-T04", { today, from: shift(today, -30), to: today });
  flagged(list, ["users", u]);
  flagged(list, ["employees", 7]);
  clean(list, ["employees", 8]);
});

test("AW-T05 flags record changes logged without a user, not attributed ones", () => {
  const { db } = fresh();
  const today = istToday();
  const base = findings(m, db, "AW-T05", { today }).map((row) => row.key);
  m.auditLog(db, { company_id: 1, user_id: null, action: "delete", table_name: "items", record_id: 1 });
  m.auditLog(db, { company_id: 1, user_id: 1, action: "delete", table_name: "warehouses", record_id: 1 });
  const list = findings(m, db, "AW-T05", { today });
  assert.ok(list.some((row) => !base.includes(row.key) && row.summary.includes("items")), JSON.stringify(list.map((row) => row.summary)));
  assert.ok(!list.some((row) => row.summary.includes("delete action(s) on warehouses")));
});
