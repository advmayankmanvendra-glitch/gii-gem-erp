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
const { fixtures, findings, names, istToday, shift, tracedReads, tracingQuery } = await load("scripts/audit/lib/auditWatchFixtures.mjs");

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
// The runner's lock is shared by the whole process; wait for any earlier run to end.
async function runnerIdle() {
  const { createAuditWatchRunner } = await load("src/main/services/auditWatch/auditWatchRunner.js");
  const probe = createAuditWatchRunner({ runInProcess: () => ({ results: [] }) });
  const deadline = Date.now() + 10000;
  while (probe.isRunning() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(probe.isRunning(), false, "an earlier Audit Watch run never released the lock");
}

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
  // The streaming form refuses the same, including a write that returns rows.
  for (const sql of ["DELETE FROM vouchers", "INSERT INTO audit_log (action, table_name) VALUES ('x', 'y') RETURNING id", "UPDATE items SET item_name = item_name RETURNING id"]) {
    assert.throws(() => q.each(sql, [], () => {}), undefined, sql);
  }
  assert.equal(db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action = 'x'").get().c, 0);
});

test("q.each streams its rows, and AW-I01 streams its large reads", () => {
  const { db, f } = fresh();
  for (let i = 0; i < 5; i += 1) f.item();
  // A connection whose statements note whether rows were read whole or streamed.
  const calls = [];
  const spy = { prepare: (sql) => {
    const statement = db.prepare(sql);
    return { readonly: statement.readonly, reader: statement.reader,
      all: (...params) => { calls.push("all"); return statement.all(...params); },
      iterate: (...params) => { calls.push("iterate"); return statement.iterate(...params); } };
  } };
  const q = readOnlyQuery(spy);
  const seen = [];
  q.each("SELECT id FROM items ORDER BY id", [], (row) => seen.push(row.id));
  assert.deepEqual(calls, ["iterate"]);
  assert.deepEqual(seen, db.prepare("SELECT id FROM items ORDER BY id").all().map((row) => row.id));
  // AW-I01 reads the grouped sums, the earlier falls and the period's rows through q.each.
  const w = f.warehouse();
  const short = f.item();
  f.stockMove(short, w, "2025-03-01", -2);
  f.stockMove(short, w, "2025-06-01", -1);
  let streamed = 0;
  findings(m, db, "AW-I01", { wrapQuery: (inner, context) => { const traced = tracingQuery(inner, context); const wrapped = (sql, params) => traced(sql, params); wrapped.each = (sql, params, visit) => { streamed += 1; return traced.each(sql, params, visit); }; return wrapped; } });
  assert.equal(streamed, 3, `AW-I01 streamed ${streamed} read(s)`);
});

test("the test tracer records what a streamed read reads", () => {
  const { db } = fresh();
  const q = tracingQuery(readOnlyQuery(db), { checkId: "AW-probe-each", db });
  q.each("SELECT w.warehouse_code FROM warehouses w", [], () => {});
  assert.deepEqual(tracedReads()["AW-probe-each"], { warehouses: ["warehouse_code"] });
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

test("AW-I01 reports stock already below zero when the period begins, moved or not", () => {
  const { db, f } = fresh();
  const w = f.warehouse();
  const still = f.item();
  const rising = f.item();
  const fine = f.item();
  f.stockMove(still, w, "2026-03-25", -10);
  f.stockMove(still, w, "2026-05-20", 10);
  f.stockMove(rising, w, "2026-03-25", -10);
  f.stockMove(rising, w, "2026-04-10", 5);
  f.stockMove(fine, w, "2026-03-25", 10);
  f.stockMove(fine, w, "2026-04-10", -4);
  const april = findings(m, db, "AW-I01", { from: "2026-04-01", to: "2026-04-30" });
  flagged(april, ["items", still]);
  flagged(april, ["items", rising]);
  clean(april, ["items", fine]);
  const rose = april.find((row) => row.refs.some((ref) => ref.table === "items" && ref.id === rising));
  assert.equal(rose.date, "2026-04-01");
  assert.match(rose.summary, /went below zero on 2026-03-25 \(to -10\); at -10 when the period began on 2026-04-01/);
  // The same unchanged stretch keeps one fingerprint whatever period is chosen, and it
  // matches the finding of the period that saw the fall.
  const stillIn = (options) => findings(m, db, "AW-I01", options).find((row) => row.key === `AW-I01:${still}-${w}`);
  const fall = stillIn({ from: "2026-03-01", to: "2026-03-31" });
  assert.equal(fall.fingerprint, "2026-03-25|-10000000");
  assert.equal(stillIn({ from: "2026-04-01", to: "2026-04-30" }).fingerprint, fall.fingerprint);
  assert.equal(stillIn({ from: "2026-05-01", to: "2026-05-10" }).fingerprint, fall.fingerprint);
  // A further fall while still below zero is named in the summary, and the fingerprint
  // stays that of the original fall whichever period is chosen.
  f.stockMove(rising, w, "2026-04-20", -8);
  const risingIn = (options) => findings(m, db, "AW-I01", options).find((row) => row.key === `AW-I01:${rising}-${w}`);
  const early = risingIn({ from: "2026-04-01", to: "2026-04-30" });
  assert.match(early.summary, /lowest -13 on 2026-04-20/);
  assert.equal(risingIn({ from: "2026-04-15", to: "2026-04-30" }).fingerprint, early.fingerprint);
  assert.equal(risingIn({ from: "2026-05-01", to: "2026-05-31" }).fingerprint, early.fingerprint);
  // Once the receipt brings it back to zero, a later period is clear.
  clean(findings(m, db, "AW-I01", { from: "2026-06-01", to: "2026-06-30" }), ["items", still]);
});

test("AW-I01 adds fractional quantities exactly, so one stretch keeps one fingerprint", () => {
  const { db, f } = fresh();
  const w = f.warehouse();
  const item = f.item();
  f.stockMove(item, w, "2026-03-01", -0.1);
  f.stockMove(item, w, "2026-03-02", -0.2);
  f.stockMove(item, w, "2026-03-03", 0.3001);
  f.stockMove(item, w, "2026-03-04", -0.0003);
  const at = (options) => findings(m, db, "AW-I01", options).find((row) => row.key === `AW-I01:${item}-${w}`);
  const whole = at({ from: "2026-03-01", to: "2026-03-31" });
  assert.equal(whole.fingerprint, "2026-03-04|-200");
  assert.equal(at({ from: "2026-03-10", to: "2026-03-31" }).fingerprint, whole.fingerprint);
  assert.doesNotMatch(at({ from: "2026-03-10", to: "2026-03-31" }).summary, /opening stock/);
  assert.equal(at({ from: "2026-03-01", to: "2026-03-02" }).fingerprint, "2026-03-01|-100000");
});

test("AW-I01 keeps one fingerprint for quantities past six decimals and for very large ones", () => {
  const { db, f } = fresh();
  const w = f.warehouse();
  const fine = f.item();
  // Four issues on the fall day, each with seven decimals: each row is rounded to
  // micro-units before it is added, on every path.
  f.stockMove(fine, w, "2026-03-05", 0.4);
  for (const quantity of [-0.1234567, -0.2345678, -0.3456789, -0.0567891]) f.stockMove(fine, w, "2026-03-10", quantity);
  f.stockMove(fine, w, "2026-03-20", -0.0000004);
  const big = f.item();
  f.stockMove(big, w, "2026-03-05", 1234567890.1234567);
  f.stockMove(big, w, "2026-03-10", -1234567890.2345678);
  f.stockMove(big, w, "2026-03-10", -0.0000013);
  for (const item of [fine, big]) {
    const at = (options) => findings(m, db, "AW-I01", options).find((row) => row.key === `AW-I01:${item}-${w}`);
    const fall = at({ from: "2026-03-01", to: "2026-03-31" });
    assert.match(fall.fingerprint, /^2026-03-10\|-\d+$/);
    assert.equal(at({ from: "2026-03-15", to: "2026-03-31" }).fingerprint, fall.fingerprint);
    assert.equal(at({ from: "2026-04-01", to: "2026-04-30" }).fingerprint, fall.fingerprint);
  }
});

test("AW-I01 says when one item's quantities are too large to add up exactly, and checks the rest", () => {
  const { db, f } = fresh();
  const w = f.warehouse();
  const huge = f.item();
  for (let i = 0; i < 6; i += 1) f.stockMove(huge, w, `2026-0${i + 1}-05`, 5e9);
  f.stockMove(huge, w, "2026-03-20", -3.000000007e10);
  const short = f.item();
  f.stockMove(short, w, "2026-03-10", -5);
  // Huge movements after the period end do not stop an earlier period being checked.
  const later = f.item();
  for (let i = 0; i < 20; i += 1) f.stockMove(later, w, "2027-06-10", i % 2 ? -5e8 : 5e8);
  const march = findings(m, db, "AW-I01", { from: "2026-03-01", to: "2026-03-31" });
  // The oversized item is not a finding: it is named as not checked, under the check.
  assert.ok(!march.some((row) => row.key === `AW-I01:${huge}-${w}`));
  const run = m.runAuditWatch(db, { companyId: 1, role: "admin", from: "2026-03-01", to: "2026-03-31", today: "2026-11-17", checkIds: ["AW-I01"] });
  const result = run.results.find((row) => row.id === "AW-I01");
  assert.equal(result.notCheckedCount, 1);
  assert.match(result.notChecked[0], /too many for this check to add up exactly/);
  assert.equal(result.findingCount, 1);
  assert.ok(march.some((row) => row.key === `AW-I01:${short}-${w}`), "the other item's shortfall is still reported");
  assert.ok(!march.some((row) => row.key === `AW-I01:${later}-${w}`));
  const earlier = findings(m, db, "AW-I01", { from: "2026-01-01", to: "2026-01-31" });
  assert.ok(!earlier.some((row) => row.key === `AW-I01:${huge}-${w}`), "below the limit up to January's end, and never below zero");
  // Opening stock counts towards the limit, and an oversized item already below zero at
  // the start is still only named as not checked.
  const { db: db3, f: f3 } = fresh();
  const w3 = f3.warehouse();
  // Each alone is under the limit (about 9.007e9); together they pass it.
  const stocked = f3.item({ opening_stock: 9.0e9, default_warehouse_id: w3 });
  f3.stockMove(stocked, w3, "2026-02-10", -1e8);
  // An oversized item already below zero when the period begins is not a finding either.
  const sunk = f3.item({ opening_stock: 9.1e9, default_warehouse_id: w3 });
  f3.stockMove(sunk, w3, "2026-02-10", -9.2e9);
  const april = m.runAuditWatch(db3, { companyId: 1, role: "admin", from: "2026-04-01", to: "2026-04-30", today: "2026-11-17", checkIds: ["AW-I01"] }).results.find((row) => row.id === "AW-I01");
  assert.equal(april.notCheckedCount, 2);
  assert.equal(april.findingCount, 0);
  assert.equal(april.status, "clear");
  // Below the limit, many large rows still keep one fingerprint in every period.
  const { db: db2, f: f2 } = fresh();
  const w2 = f2.warehouse();
  const large = f2.item();
  for (let i = 0; i < 6; i += 1) f2.stockMove(large, w2, `2026-0${i + 1}-05`, 7e8 + 0.123457);
  f2.stockMove(large, w2, "2026-02-20", -1.5e9 - 0.987654);
  const at = (options) => findings(m, db2, "AW-I01", options).find((row) => row.key === `AW-I01:${large}-${w2}`);
  const fall = at({ from: "2026-02-01", to: "2026-02-28" });
  assert.equal(fall.fingerprint, at({ from: "2026-01-01", to: "2026-03-31" }).fingerprint);
  assert.equal(fall.fingerprint, at({ from: "2026-02-25", to: "2026-02-28" }).fingerprint);
});

test("AW-I01 keeps the fall day's rows and the lowest day's rows, not rows of other days", () => {
  const { db, f } = fresh();
  const w = f.warehouse();
  const item = f.item();
  const fallRows = [];
  for (let i = 0; i < 7; i += 1) fallRows.push(f.stockMove(item, w, "2026-03-02", -1));
  const between = [];
  for (let i = 0; i < 4; i += 1) between.push(f.stockMove(item, w, "2026-03-05", -1));
  const lowest = [];
  for (let i = 0; i < 6; i += 1) lowest.push(f.stockMove(item, w, "2026-03-09", -1));
  const finding = findings(m, db, "AW-I01", { from: "2026-03-01", to: "2026-03-31" }).find((row) => row.key === `AW-I01:${item}-${w}`);
  const kept = finding.evidence[0].ledger_rows.map(Number);
  assert.deepEqual(kept, [...fallRows.slice(0, 5), ...lowest.slice(0, 5)].map(Number));
  assert.ok(between.every((id) => !kept.includes(Number(id))));
  // With a short lowest day, more of the fall day's rows are kept.
  const other = f.item();
  const otherFall = [];
  for (let i = 0; i < 7; i += 1) otherFall.push(f.stockMove(other, w, "2026-03-02", -1));
  const otherLow = f.stockMove(other, w, "2026-03-09", -1);
  const second = findings(m, db, "AW-I01", { from: "2026-03-01", to: "2026-03-31" }).find((row) => row.key === `AW-I01:${other}-${w}`);
  assert.deepEqual(second.evidence[0].ledger_rows.map(Number), [...otherFall, otherLow].map(Number));
});

test("AW-I01 gives the same findings whether its large reads are streamed or read whole", () => {
  const { db, f } = fresh();
  const w = f.warehouse();
  for (let i = 0; i < 6; i += 1) {
    const item = f.item();
    f.stockMove(item, w, "2026-02-10", i % 2 ? -3 : 2);
    f.stockMove(item, w, "2026-03-05", -2);
    f.stockMove(item, w, "2026-03-15", i);
  }
  const streamed = findings(m, db, "AW-I01", { from: "2026-03-01", to: "2026-03-31" });
  const whole = findings(m, db, "AW-I01", { from: "2026-03-01", to: "2026-03-31", wrapQuery: (q) => (sql, params) => q(sql, params) });
  assert.ok(streamed.length > 0);
  assert.deepEqual(whole, streamed);
});

test("AW-I01 names the latest stretch below zero, any recovery and later falls, with one fingerprint per stretch", () => {
  const { db, f } = fresh();
  const w = f.warehouse();
  // (a) below zero at the start, recovers, then falls again (less deeply).
  const a = f.item();
  f.stockMove(a, w, "2026-03-25", -5);
  f.stockMove(a, w, "2026-04-10", 5);
  f.stockMove(a, w, "2026-04-20", -2);
  const aIn = (options) => findings(m, db, "AW-I01", options).find((row) => row.key === `AW-I01:${a}-${w}`);
  const april = aIn({ from: "2026-04-01", to: "2026-04-30" });
  assert.match(april.summary, /went below zero on 2026-04-20 \(to -2\); 2 separate stretches below zero in this period/);
  assert.equal(april.fingerprint, "2026-04-20|-2000000");
  assert.equal(aIn({ from: "2026-04-15", to: "2026-05-31" }).fingerprint, april.fingerprint);
  const early = aIn({ from: "2026-04-01", to: "2026-04-12" });
  assert.match(early.summary, /went below zero on 2026-03-25 \(to -5\).*back to zero or above on 2026-04-10/);
  assert.equal(early.fingerprint, "2026-03-25|-5000000");
  // (b) two falls in one stretch: the stretch is named by its first fall in every period.
  const b = f.item();
  f.stockMove(b, w, "2026-03-05", -2);
  f.stockMove(b, w, "2026-03-25", -3);
  const bIn = (options) => findings(m, db, "AW-I01", options).find((row) => row.key === `AW-I01:${b}-${w}`);
  const march = bIn({ from: "2026-03-01", to: "2026-03-31" });
  assert.equal(march.fingerprint, "2026-03-05|-2000000");
  assert.match(march.summary, /lowest -5 on 2026-03-25/);
  assert.equal(bIn({ from: "2026-03-15", to: "2026-03-31" }).fingerprint, march.fingerprint);
  assert.equal(bIn({ from: "2026-04-01", to: "2026-04-30" }).fingerprint, march.fingerprint);
  // (c) a fall inside the period that deepens is shown with its lowest point.
  const c = f.item();
  f.stockMove(c, w, "2026-05-02", -5);
  f.stockMove(c, w, "2026-05-09", -8);
  assert.match(findings(m, db, "AW-I01", { from: "2026-05-01", to: "2026-05-31" }).find((row) => row.key === `AW-I01:${c}-${w}`).summary, /went below zero on 2026-05-02 \(to -5\); lowest -13 on 2026-05-09/);
});

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
  // Key and fingerprint stay the same across periods and as ordinary audited work
  // goes on, so a reviewed finding does not look new or changed the next day.
  const before = findings(m, db, "AW-G10", { from: "2026-04-01", to: "2026-06-30" });
  for (let i = 0; i < 3; i += 1) m.auditLog(db, { company_id: 1, action: "update", table_name: "items", record_id: i + 1 });
  const after = findings(m, db, "AW-G10", { from: "2026-07-01", to: "2027-03-31" });
  assert.deepEqual(after.map((row) => [row.key, row.fingerprint]), before.map((row) => [row.key, row.fingerprint]));
  assert.deepEqual(list.map((row) => row.key), before.map((row) => row.key));
});

test("AW-G10 notices one more tampered audit row even past the twenty the detail lists", () => {
  const { db } = fresh();
  for (let i = 0; i < 40; i += 1) m.auditLog(db, { company_id: 1, action: "update", table_name: "items", record_id: i + 1 });
  const ids = db.prepare("SELECT id FROM audit_log ORDER BY id DESC LIMIT 30").all().map((row) => row.id).reverse();
  const tamper = (id) => db.prepare("UPDATE audit_log SET new_value = 'edited' WHERE id = ?").run(id);
  ids.slice(0, 22).forEach(tamper);
  const chainRow = () => findings(m, db, "AW-G10").find((row) => row.key === "AW-G10:audit_chain");
  const first = chainRow();
  assert.ok(first, "a tampered audit chain should be reported");
  assert.match(first.summary, /and 2 more/);
  assert.match(first.fingerprint, /^22:[0-9a-f]{32}:0$/, "the audit chain hands over the count and a digest of every broken row");
  tamper(ids[27]);
  const second = chainRow();
  assert.equal(second.key, first.key);
  assert.notEqual(second.fingerprint, first.fingerprint);
  assert.match(second.summary, /and 3 more/);
});

test("the audit chain counts verified rows right when rows are deleted", () => {
  const { db } = fresh();
  for (let i = 0; i < 30; i += 1) m.auditLog(db, { company_id: 1, action: "update", table_name: "items", record_id: i + 1 });
  const before = m.verifyAuditChain(db);
  const ids = db.prepare("SELECT id FROM audit_log ORDER BY id DESC LIMIT 20").all().map((row) => row.id).reverse();
  db.prepare("DELETE FROM audit_log WHERE id IN (?, ?, ?)").run(ids[3], ids[4], ids[5]);
  db.prepare("UPDATE audit_log SET new_value = 'edited' WHERE id = ?").run(ids[10]);
  const after = m.verifyAuditChain(db);
  // Three rows are gone; two present rows fail their hash (the edited row, and the row
  // after the gap, whose previous hash is now a different row's). Deleted rows were never
  // there to verify, so verified drops by exactly five.
  assert.equal(after.broken.length > 0, true);
  assert.equal(after.verified, before.verified - 5);
  assert.equal(after.brokenCount, 3);
  // Deleting the newest rows is reported as such, not as a broken older row.
  db.prepare("DELETE FROM audit_log WHERE id >= ?").run(ids[15]);
  assert.equal(m.verifyAuditChain(db).missingNewestRows, 5);
});

test("AW-G10 notices one more unbalanced voucher even past the ten the detail names", () => {
  const { db, f } = fresh();
  db.exec("DROP TRIGGER IF EXISTS trg_ledger_guard_voucher_post; DROP TRIGGER IF EXISTS trg_ledger_guard_voucher_posted_update");
  const lopsided = () => f.voucher({ date: "2026-06-01", lines: [["Transport Expense", 100, 0], ["Cash", 0, 90]] });
  for (let i = 0; i < 11; i += 1) lopsided();
  const balanceRow = () => findings(m, db, "AW-G10").find((row) => row.key === "AW-G10:voucher_balance");
  const eleven = balanceRow();
  assert.ok(eleven, "unbalanced vouchers should be reported");
  assert.match(eleven.summary, /and 1 more/);
  // The book check hands over a digest of every failing voucher (the contract G10 relies on).
  assert.match(eleven.fingerprint, /^11:[0-9a-f]{32}$/);
  lopsided();
  const twelve = balanceRow();
  assert.equal(twelve.key, eleven.key);
  assert.notEqual(twelve.fingerprint, eleven.fingerprint);
  assert.match(twelve.summary, /and 2 more/);
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

// ------------------------------------------------------------ through the app's own write paths
// These go through the functions the screens use (posting, reversal, guided vouchers,
// approvals, stock adjustments), not hand-planted rows, so a check that reads columns
// the app never fills cannot pass.

test("a reverse-and-re-enter correction is not a duplicate (AW-P01, AW-P02, AW-S05)", () => {
  const { db, f } = fresh();
  const s = f.supplier();
  const first = f.bill(s, { purchase_invoice_number: "SUP/77", purchase_date: "2026-07-01", posting_status: "Draft", approval_status: "Approved" });
  m.postPurchaseVoucher(db, first);
  m.reverseVoucher(db, db.prepare("SELECT id FROM vouchers WHERE source_module = 'procurement' AND source_id = ?").get(first).id, "wrong rate");
  assert.equal(db.prepare("SELECT posting_status FROM procurements WHERE id = ?").get(first).posting_status, "Reversed");
  const again = f.bill(s, { purchase_invoice_number: "SUP/77", purchase_date: "2026-07-01", posting_status: "Draft", approval_status: "Approved" });
  m.postPurchaseVoucher(db, again);
  clean(findings(m, db, "AW-P01"), ["procurements", first], ["procurements", again]);

  const paid = f.supplierPayment(s, { payment_date: "2026-07-10", amount_paid: 11800, posting_status: "Draft", utr_number: "UTR0000001" });
  m.postSupplierPaymentVoucher(db, paid);
  m.reverseVoucher(db, db.prepare("SELECT id FROM vouchers WHERE source_module = 'supplier_payment' AND source_id = ?").get(paid).id, "wrong bank");
  const repaid = f.supplierPayment(s, { payment_date: "2026-07-11", amount_paid: 11800, utr_number: "UTR0000002" });
  clean(findings(m, db, "AW-P02"), ["supplier_payments", paid], ["supplier_payments", repaid]);

  const order = f.order();
  const line = f.orderItem(order, { quantity: 10 });
  const bill = f.invoice(order, { posting_status: "Draft", approval_status: "Approved", invoice_date: "2026-08-01" });
  f.invoiceLine(bill, { order_item_id: line, quantity: 10, billing_rate: 1000, taxable_value: 10000, gst_amount: 1800, gross_value: 11800 });
  m.postSalesVoucher(db, bill);
  m.reverseVoucher(db, db.prepare("SELECT id FROM vouchers WHERE source_module = 'billing' AND source_id = ?").get(bill).id, "wrong consignee");
  const rebill = f.invoice(order, { invoice_date: "2026-08-02" });
  f.invoiceLine(rebill, { order_item_id: line, quantity: 10, billing_rate: 1000 });
  clean(findings(m, db, "AW-S05"), ["order_items", line]);
});

test("AW-P01 and AW-P02 skip placeholders and a bill number reused in a new financial year", () => {
  const { db, f } = fresh();
  const s = f.supplier();
  const lastYear = f.bill(s, { purchase_invoice_number: "15", purchase_date: "2025-06-10", purchase_value: 4000, purchase_gst: 720 });
  const thisYear = f.bill(s, { purchase_invoice_number: "15", purchase_date: "2026-06-12", purchase_value: 9000, purchase_gst: 1620 });
  const na1 = f.bill(s, { purchase_invoice_number: "NA", purchase_date: "2026-05-01", purchase_value: 300 });
  const na2 = f.bill(s, { purchase_invoice_number: "N.A.", purchase_date: "2026-09-01", purchase_value: 700 });
  const bills = findings(m, db, "AW-P01");
  clean(bills, ["procurements", lastYear], ["procurements", thisYear]);
  clean(bills, ["procurements", na1], ["procurements", na2]);
  const other = f.supplier();
  const x = f.supplierPayment(s, { utr_number: "NA", amount_paid: 1200, payment_date: "2026-07-01", payment_mode: "Cash" });
  const y = f.supplierPayment(other, { utr_number: "N.A.", amount_paid: 3400, payment_date: "2026-09-01", payment_mode: "Cash" });
  clean(findings(m, db, "AW-P02"), ["supplier_payments", x], ["supplier_payments", y]);
});

test("AW-T03 sees a guided voucher keyed and approved by one user through the real workflow", () => {
  const { db, f } = fresh();
  const u = f.user({ role: "admin" });
  const other = f.user({ role: "admin" });
  const keyedBy = (user) => m.runAsActor({ id: user, role: "admin" }, () => m.createBusinessVoucher(db, {
    company_id: 1, voucher_kind: "journal", voucher_date: "2026-08-10",
    lines: [{ account_id: f.accountId("Cash"), debit: 500000, credit: 0 }, { account_id: f.accountId("Capital"), debit: 0, credit: 500000 }]
  }));
  const own = keyedBy(u);
  const checked = keyedBy(u);
  assert.equal(own.created_by, null, "the screen sends no created_by; the draft's audit row carries the maker");
  for (const step of ["submit", "review", "approve"]) m.updateGuidedVoucherStatus(db, own.id, step, u, "");
  m.updateGuidedVoucherStatus(db, checked.id, "submit", u, "");
  m.updateGuidedVoucherStatus(db, checked.id, "review", other, "");
  m.updateGuidedVoucherStatus(db, checked.id, "approve", other, "");
  const list = findings(m, db, "AW-T03");
  flagged(list, ["guided_vouchers", own.id]);
  clean(list, ["guided_vouchers", checked.id]);
  // Approval queue: maker_id is empty in the app, so the maker is the record's create row.
  const bill = f.bill(f.supplier(), { purchase_date: "2026-08-12" });
  m.auditLog(db, { company_id: 1, user_id: u, action: "create", table_name: "procurements", record_id: bill, new_value: "{}" });
  m.approveTransaction(db, "procurements", bill, u, "ok");
  assert.equal(db.prepare("SELECT maker_id FROM approval_queue WHERE record_id = ?").get(bill).maker_id, null);
  flagged(findings(m, db, "AW-T03"), ["approval_queue", db.prepare("SELECT id FROM approval_queue WHERE record_id = ?").get(bill).id]);
});

test("AW-G01 and AW-G03 cover journals keyed through Guided Vouchers", () => {
  const { db, f } = fresh();
  const u = f.user({ role: "admin" });
  const gv = m.createBusinessVoucher(db, { company_id: 1, voucher_kind: "journal", voucher_date: "2026-08-10",
    lines: [{ account_id: f.accountId("Cash"), debit: 500000, credit: 0 }, { account_id: f.accountId("Capital"), debit: 0, credit: 500000 }] });
  for (const step of ["submit", "review", "approve"]) m.updateGuidedVoucherStatus(db, gv.id, step, u, "");
  m.postGuidedVoucher(db, gv.id, u);
  const voucher = db.prepare("SELECT posted_voucher_id id FROM guided_vouchers WHERE id = ?").get(gv.id).id;
  flagged(findings(m, db, "AW-G01"), ["vouchers", voucher]);
  flagged(findings(m, db, "AW-G03"), ["vouchers", voucher]);
});

test("ledger checks follow the account groups, not the ledger names (AW-G01, AW-G09)", () => {
  const { db, f } = fresh();
  // The client calls the cash ledger "Cash in Hand"; its group still says it is cash.
  db.prepare("UPDATE accounts SET account_name = 'Cash in Hand' WHERE company_id = 1 AND account_name = 'Cash'").run();
  f.voucher({ date: "2026-07-01", source: "payment", lines: [["Trade Payables", 2000, 0], ["Cash in Hand", 0, 2000]] });
  const list = findings(m, db, "AW-G09");
  assert.ok(list.some((row) => row.summary.startsWith("Cash in Hand fell to")), JSON.stringify(list.map((row) => row.summary)));
  // A bank overdraft is not cash below zero.
  f.voucher({ date: "2026-07-02", source: "payment", lines: [["Trade Payables", 5000, 0], ["Bank", 0, 5000]] });
  assert.ok(!findings(m, db, "AW-G09").some((row) => row.summary.startsWith("Bank")));
  const journal = f.voucher({ date: "2026-07-03", lines: [["Cash in Hand", 20000, 0], ["Sales", 0, 20000]] });
  flagged(findings(m, db, "AW-G01"), ["vouchers", journal]);
});

test("AW-G05 measures lateness only where a person chose the date", () => {
  const { db, f } = fresh();
  // A supplier bill posted ten days after its date is normal posting lag.
  const lag = f.voucher({ date: "2026-07-01", createdAt: "2026-07-11 06:00:00", source: "procurement", lines: [["Purchase", 1000, 0], ["Trade Payables", 0, 1000]] });
  const backdated = f.voucher({ date: "2026-07-01", createdAt: "2026-07-11 06:00:00", lines: [["Cash", 1000, 0], ["Capital", 0, 1000]] });
  const list = findings(m, db, "AW-G05");
  clean(list, ["vouchers", lag]);
  flagged(list, ["vouchers", backdated]);
});

test("AW-G07 counts a proposal-booked line as matched and an unconfirmed suggestion as open", () => {
  const { db, f } = fresh();
  const voucher = f.voucher({ date: "2026-08-01", source: "voucher_proposal", lines: [["Bank Charges", 2500, 0], ["Bank", 0, 2500]] });
  const imp = f.insert("bank_statement_imports", { company_id: 1 });
  const base = { company_id: 1, import_id: imp, transaction_date: "2026-08-01", narration: "x", debit: 2500, credit: 0, amount: -2500 };
  const bookedLine = f.insert("bank_statement_entries", { ...base, match_status: "Unmatched", review_status: "Posted", voucher_id: voucher });
  const suggested = f.insert("bank_statement_entries", { ...base, match_status: "Suggested", review_status: "Pending" });
  const list = findings(m, db, "AW-G07");
  clean(list, ["bank_statement_entries", bookedLine]);
  flagged(list, ["bank_statement_entries", suggested]);
});

test("AW-I03 values a rate-less write-off at what was posted", () => {
  const { db, f } = fresh();
  const item = f.item();
  const store = f.warehouse();
  f.stockMove(item, store, "2026-06-01", 100);
  db.prepare("UPDATE stock_ledger SET value = 500000, value_minor = 50000000, rate = 5000 WHERE item_id = ?").run(item);
  const writeOff = f.insert("stock_adjustments", { company_id: 1, item_id: item, warehouse_id: store, adjustment_date: "2026-08-01", adjustment_type: "Decrease", quantity: 40, reason: "write off", approval_status: "Approved" });
  m.postStockAdjustment(db, writeOff);
  assert.equal(db.prepare("SELECT rate FROM stock_adjustments WHERE id = ?").get(writeOff).rate, 0);
  const list = findings(m, db, "AW-I03");
  assert.ok(list.some((row) => row.key === `AW-I03:${writeOff}` && row.amountMinor === 20000000), JSON.stringify(list.map((row) => row.summary)));
});

test("AW-I02 sees opening stock that never moved", () => {
  const { db, f } = fresh();
  const store = f.warehouse();
  const idle = f.item({ opening_stock: 50, opening_rate: 1000, opening_value: 50000, default_warehouse_id: store, created_at: "2025-01-01 06:00:00" });
  const fresher = f.item({ opening_stock: 5, opening_rate: 1000, opening_value: 5000, default_warehouse_id: store });
  const list = findings(m, db, "AW-I02");
  flagged(list, ["items", idle]);
  clean(list, ["items", fresher]);
});

test("AW-S04 uses the stored due date as final (credit days and grace already in it)", () => {
  const { db, f } = fresh();
  m.saveCreditTerm(db, { company_id: 1, party_type: "department", party_id: 1, default_credit_days: 30, grace_period: 30, status: "active" });
  const order = f.order();
  const bill = f.invoice(order, { invoice_date: "2026-08-01", posting_status: "Draft", approval_status: "Approved" });
  f.invoiceLine(bill, { quantity: 1, billing_rate: 10000, taxable_value: 10000, gst_amount: 1800, gross_value: 11800 });
  m.postSalesVoucher(db, bill);
  assert.equal(db.prepare("SELECT due_date FROM receivables WHERE billing_id = ?").get(bill).due_date, "2026-09-30");
  const due = (today) => findings(m, db, "AW-S04", { today }).filter((row) => names([row], ["invoices", bill]));
  assert.equal(due("2026-10-10").length, 0, "10 days past due is inside the 15-day reporting buffer");
  assert.match(due("2026-10-25")[0]?.summary || "", /25 days past due/);
});

test("AW-I07 counts only confirmed challans as delivered", () => {
  const { db, f } = fresh();
  const item = f.item();
  const store = f.warehouse();
  const order = f.order();
  f.challanLine(f.challan(order, { status: "Draft" }), item, store, 10);
  f.invoiceLine(f.invoice(order, { invoice_date: "2026-08-05" }), { item_id: item, quantity: 10 });
  assert.ok(findings(m, db, "AW-I07").some((row) => row.key === `AW-I07:billed-${order}-${item}`));
});

test("AW-T04 sees bank details changed in bulk through Master Data Tools", () => {
  const { db } = fresh();
  const today = istToday();
  m.auditLog(db, { company_id: 1, user_id: 1, action: "bank_details_changed", module: "security", table_name: "suppliers", new_value: JSON.stringify({ source: "master_data_import", batch: "B1" }) });
  const list = findings(m, db, "AW-T04", { today, from: shift(today, -30), to: today });
  assert.ok(list.some((row) => row.summary.includes("in bulk on suppliers")), JSON.stringify(list.map((row) => row.summary)));
});

// ------------------------------------------------------------ keys, speed and the runner

test("finding keys stay the same across periods and unrelated rows; fingerprints show change", () => {
  const { db, f } = fresh();
  const s = f.supplier();
  f.bill(s, { purchase_invoice_number: "B-100", purchase_date: "2026-06-01" });
  f.bill(s, { purchase_invoice_number: "B 100", purchase_date: "2026-06-20", purchase_value: 7 });
  const keyOf = (options) => findings(m, db, "AW-P01", options).find((row) => row.key.startsWith("AW-P01:number-"));
  const wide = keyOf({ from: "2026-04-01", to: "2026-12-31" });
  const narrow = keyOf({ from: "2026-06-15", to: "2026-07-31" });
  assert.ok(wide && narrow);
  assert.equal(wide.key, narrow.key);
  f.bill(f.supplier(), { purchase_invoice_number: "Z-9", purchase_date: "2026-06-21" });
  assert.equal(keyOf({}).key, wide.key);
  f.bill(s, { purchase_invoice_number: "B/100", purchase_date: "2026-07-01", purchase_value: 9 });
  const grown = keyOf({});
  assert.equal(grown.key, wide.key);
  assert.notEqual(grown.fingerprint, wide.fingerprint);
  // Every finding of every check carries a key and a fingerprint, and the report says
  // which version of each check produced it.
  const report = m.runAuditWatch(db, { companyId: 1, role: "admin", today: "2026-11-17" });
  for (const result of report.results.filter((row) => row.status === "findings")) {
    assert.ok(Number.isInteger(result.version) && ["company", "installation"].includes(result.scope), result.id);
    result.findings.forEach((finding) => assert.ok(finding.key.startsWith(`${result.id}:`) && typeof finding.fingerprint === "string", `${result.id} ${finding.key}`));
  }
});

test("the purchase checks stay fast on large books", () => {
  const { db, f } = fresh();
  const s = f.supplier();
  const item = f.item();
  const order = f.order();
  db.transaction(() => {
    for (let i = 0; i < 6000; i += 1) {
      const date = shift("2025-06-01", i % 500);
      const bill = f.bill(s, { order_id: order, purchase_invoice_number: i % 2 ? "NA" : `B${i % 40}`, purchase_date: date, purchase_value: 1000, purchase_gst: 0 });
      f.insert("procurement_items", { company_id: 1, procurement_id: bill, order_id: order, item_id: item, quantity: 1, purchase_rate: 100 + (i % 7), gross_value: 100 });
      f.supplierPayment(s, { payment_date: date, amount_paid: 500, utr_number: null });
    }
  })();
  const started = Date.now();
  const report = m.runAuditWatch(db, { companyId: 1, role: "admin", areas: ["procurement"], from: "2025-04-01", to: "2026-12-31", today: "2026-11-17" });
  const ms = Date.now() - started;
  assert.equal(report.results.filter((row) => row.status === "error").length, 0);
  assert.ok(ms < 15000, `procurement checks took ${ms} ms on 6,000 bills`);
  assert.ok(JSON.stringify(report).length < 5e6, "report stays small: duplicates are grouped, not paired");
});

test("the runner uses a worker thread, falls back in-process, refuses overlap and stops at the time limit", async () => {
  await runnerIdle();
  const { createAuditWatchRunner } = await load("src/main/services/auditWatch/auditWatchRunner.js");
  const { db } = fresh();
  const options = { companyId: 1, role: "admin", today: "2026-11-17" };
  const runner = createAuditWatchRunner({ runInProcess: (opts) => m.runAuditWatch(db, opts) });
  const viaWorker = await runner.run(db.name, options);
  assert.equal(viaWorker.engine, "worker");
  const inProcess = m.runAuditWatch(db, options);
  assert.deepEqual(viaWorker.results.map((row) => `${row.id}:${row.status}:${row.findingCount}`), inProcess.results.map((row) => `${row.id}:${row.status}:${row.findingCount}`));
  // A refusal inside the worker comes back as the same plain message.
  await assert.rejects(runner.run(db.name, { ...options, role: "viewer" }), /cannot open Audit Watch/);
  await runnerIdle();
  const broken = createAuditWatchRunner({ runInProcess: (opts) => m.runAuditWatch(db, opts), workerUrl: new URL("file:///nonexistent/audit-watch-worker.js") });
  assert.equal((await broken.run(db.name, options)).engine, "in-process");
  await runnerIdle();
  const first = runner.run(db.name, options);
  await assert.rejects(runner.run(db.name, options), /already running/);
  await first;
  await runnerIdle();
  const slow = createAuditWatchRunner({ runInProcess: (opts) => m.runAuditWatch(db, opts), timeLimitMs: 1 });
  await assert.rejects(slow.run(db.name, options), /stopped after/);
  // Every runner shares one lock: a second runner cannot start beside the first.
  assert.equal(runner.isRunning(), slow.isRunning());
  await runnerIdle();
  const one = runner.run(db.name, options);
  const other = createAuditWatchRunner({ runInProcess: (opts) => m.runAuditWatch(db, opts) });
  assert.equal(other.isRunning(), true);
  await assert.rejects(other.run(db.name, options), /already running/);
  await one;
  await runnerIdle();
});

test("the runner holds its lock until a stopped worker has exited, and never re-runs a started worker in-process", async () => {
  await runnerIdle();
  const { createAuditWatchRunner } = await load("src/main/services/auditWatch/auditWatchRunner.js");
  const { db } = fresh();
  const logged = [];
  let inProcessRuns = 0;
  const runInProcess = () => { inProcessRuns += 1; return { results: [] }; };
  const workerUrl = (name) => new URL(`./lib/workers/${name}`, import.meta.url);
  // A worker that started and then died gives an error; it is not run again on the main thread.
  const crashing = createAuditWatchRunner({ runInProcess, workerUrl: workerUrl("startedThenCrash.mjs"), log: (line) => logged.push(line) });
  await assert.rejects(crashing.run(db.name, {}), /stopped unexpectedly/);
  assert.equal(inProcessRuns, 0);
  assert.equal(logged.length, 0);
  await runnerIdle();
  // Past the time limit the caller gets an answer at once, but the lock stays until the
  // worker has really gone (a long SQLite step cannot be cut short).
  const busy = createAuditWatchRunner({ runInProcess, workerUrl: workerUrl("startedThenBusy.mjs"), timeLimitMs: 50 });
  await assert.rejects(busy.run(db.name, { busyMs: 600 }), /stopped after/);
  assert.equal(busy.isRunning(), true);
  await assert.rejects(busy.run(db.name, {}), /already running/);
  const deadline = Date.now() + 5000;
  while (busy.isRunning() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(busy.isRunning(), false);
  // A worker that could not start at all is logged and falls back.
  const missing = createAuditWatchRunner({ runInProcess, workerUrl: new URL("file:///nonexistent/audit-watch-worker.js"), log: (line) => logged.push(line) });
  assert.equal((await missing.run(db.name, {})).engine, "in-process");
  assert.equal(inProcessRuns, 1);
  assert.match(logged[0], /could not start/);
});

// ------------------------------------------------------------ round-2 fixes

test("AW-G09 treats an ungrouped asset ledger named cash as cash, not an income ledger that says cash", () => {
  const { db, f } = fresh();
  const petty = f.insert("accounts", { company_id: 1, account_code: "1005", account_name: "Petty Cash", account_type: "Asset", normal_balance: "Debit", opening_balance: 0, status: "active" });
  const discount = f.insert("accounts", { company_id: 1, account_code: "4105", account_name: "Cash Discount Received", account_type: "Income", normal_balance: "Credit", opening_balance: 0, status: "active" });
  f.voucher({ date: "2026-07-01", lines: [["Transport Expense", 300, 0], ["Petty Cash", 0, 300]] });
  f.voucher({ date: "2026-07-02", lines: [["Trade Payables", 500, 0], ["Cash Discount Received", 0, 500]] });
  const list = findings(m, db, "AW-G09");
  flagged(list, ["accounts", petty]);
  clean(list, ["accounts", discount]);
});

test("AW-G09 shows cash that was already below zero when the period starts, under one key", () => {
  const { db, f } = fresh();
  const cashId = f.accountId("Cash");
  f.voucher({ date: "2026-05-10", lines: [["Transport Expense", 4000, 0], ["Cash", 0, 4000]] });
  f.voucher({ date: "2026-08-10", lines: [["Transport Expense", 100, 0], ["Cash", 0, 100]] });
  const fromStart = findings(m, db, "AW-G09", { from: "2026-04-01", to: "2026-12-31" }).filter((row) => names([row], ["accounts", cashId]));
  const later = findings(m, db, "AW-G09", { from: "2026-07-01", to: "2026-12-31" }).filter((row) => names([row], ["accounts", cashId]));
  const quiet = findings(m, db, "AW-G09", { from: "2026-09-01", to: "2026-12-31" }).filter((row) => names([row], ["accounts", cashId]));
  assert.equal(fromStart.length, 1);
  assert.equal(later.length, 1, "a stretch below zero that began before the period is still shown");
  assert.equal(quiet.length, 1, "still below zero with no movement in the period");
  assert.equal(later[0].key, fromStart[0].key);
  assert.equal(quiet[0].key, fromStart[0].key);
  assert.equal(later[0].fingerprint, fromStart[0].fingerprint, "the fingerprint does not hold the period");
  assert.equal(quiet[0].fingerprint, fromStart[0].fingerprint);
  assert.match(later[0].summary, /below zero since 2026-05-10/);
});

test("run-based and pair-based keys do not change with the period chosen (P01, P02, P05, I03, G06)", () => {
  const { db, f } = fresh();
  const s = f.supplier();
  ["2026-07-01", "2026-07-03", "2026-07-06"].forEach((date) => f.bill(s, { purchase_invoice_number: "NA", purchase_date: date, purchase_value: 90000, purchase_gst: 0 }));
  ["2026-07-01", "2026-07-04"].forEach((date) => f.supplierPayment(s, { payment_date: date, amount_paid: 777, utr_number: null }));
  const item = f.item();
  ["2026-07-01", "2026-07-02", "2026-07-03"].forEach((date) => f.insert("stock_adjustments", { company_id: 1, item_id: item, warehouse_id: 1, adjustment_date: date, adjustment_type: "Decrease", quantity: 1, rate: 10, reason: "count" }));
  const keysFor = (id, options) => findings(m, db, id, { limits: { "AW-P05": { minimumBills: 3 }, "AW-I03": { repeatCount: 3 }, "AW-G06": { repeatCount: 3 } }, ...options }).map((row) => `${row.key}|${row.fingerprint}`).sort();
  const reverser = f.user({ role: "admin" });
  // The guard lets a voucher become Reversed only once a reversal posts; fixtures stand in for that here.
  db.exec("DROP TRIGGER IF EXISTS trg_ledger_guard_voucher_posted_update");
  ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-05", "2026-07-06"].forEach((date) => {
    const voucher = f.voucher({ date: "2026-06-01", lines: [["Transport Expense", 100, 0], ["Cash", 0, 100]] });
    db.prepare("UPDATE vouchers SET status = 'Reversed', reversal_date = ?, reversed_by = ? WHERE id = ?").run(date, reverser, voucher);
  });
  for (const id of ["AW-P01", "AW-P02", "AW-P05", "AW-I03", "AW-G06"]) {
    const wide = keysFor(id, { from: "2026-04-01", to: "2026-12-31" });
    const narrow = keysFor(id, { from: "2026-07-03", to: "2026-07-31" });
    assert.ok(wide.length > 0, `${id} found nothing`);
    assert.ok(narrow.length > 0, `${id}: the run or pair touching the narrow period is still found`);
    for (const key of narrow) assert.ok(wide.includes(key), `${id}: ${key} only appears in the narrow period`);
  }
});

test("every finding stays bounded: at most 50 record links with the full count, and long fingerprints are hashed", async () => {
  const { boundFinding } = await load("src/main/services/auditWatch/auditWatchService.js");
  const refs = Array.from({ length: 120 }, (_, id) => ({ table: "procurements", id }));
  const bounded = boundFinding({ key: "AW-X:1", refs, evidence: refs, fingerprint: "x".repeat(500) });
  assert.equal(bounded.refs.length, 50);
  assert.equal(bounded.refCount, 120);
  assert.equal(bounded.evidence.length, 20);
  assert.match(bounded.fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(boundFinding({ key: "AW-X:1", refs, fingerprint: "x".repeat(499) }).fingerprint, bounded.fingerprint);
  assert.equal(boundFinding({ key: "AW-X:1", amountMinor: 5, date: "2026-07-01" }).fingerprint, "5|2026-07-01");
  const huge = boundFinding({ key: `AW-P07:${"S1-".repeat(5000)}`, summary: "x".repeat(10000), evidence: [{ names: "y".repeat(10000), id: 3 }] });
  assert.match(huge.key, /^AW-P07:sha256-[0-9a-f]{64}$/);
  assert.equal(huge.key, boundFinding({ key: `AW-P07:${"S1-".repeat(5000)}` }).key, "a hashed key is still stable");
  assert.ok(huge.summary.length <= 400 && huge.evidence[0].names.length <= 300 && huge.evidence[0].id === 3);
});

// ------------------------------------------------------------ round-3 fixes

test("repeat checks leave out no row of a qualifying window (overlapping windows are merged)", () => {
  const { db, f } = fresh();
  const s = f.supplier();
  // Windows from 1 Jul, 3 Jul and 6 Jul each hold three near-limit bills worth more than
  // the limit together; the bills of 9 and 12 Jul must not be dropped.
  const ids = ["2026-07-01", "2026-07-03", "2026-07-06", "2026-07-09", "2026-07-12"].map((date) => f.bill(s, { purchase_invoice_number: "NA", purchase_date: date, purchase_value: 90000, purchase_gst: 0 }));
  for (const options of [{ from: "2026-04-01", to: "2026-12-31" }, { from: "2026-07-08", to: "2026-07-31" }]) {
    const list = findings(m, db, "AW-P05", { limits: { "AW-P05": { minimumBills: 3 } }, ...options });
    flagged(list, ...ids.map((id) => ["procurements", id]));
    assert.equal(list.length, 1);
    assert.equal(list[0].key, `AW-P05:${ids[0]}`);
  }
});

test("stockBalances gives the same balance as stockBalance for every item, warehouse and company (random books)", async () => {
  const { stockBalances } = await load("src/main/services/auditWatch/stockBalances.js");
  for (let seed = 1; seed <= 6; seed += 1) {
    const { db, f } = fresh();
    let state = seed * 7919;
    const rand = (n) => { state = (state * 1103515245 + 12345) % 2147483648; return state % n; };
    const second = f.insert("companies", { company_name: `Second ${seed}` });
    const warehouses = [1,
      f.insert("warehouses", { warehouse_name: "Shared", status: "active", company_id: null }),
      f.insert("warehouses", { warehouse_name: "Zero", status: "active", company_id: 0 }),
      f.insert("warehouses", { warehouse_name: "Theirs", status: "active", company_id: second }),
      f.insert("warehouses", { warehouse_name: "Closed", status: "inactive", company_id: 1 })];
    // In odd seeds the first warehouse is closed, so the first active one is not the
    // lowest id: a change to that rule in stockBalance shows up here.
    if (seed % 2) db.prepare("UPDATE warehouses SET status = 'inactive' WHERE id = 1").run();
    const items = [];
    for (let i = 0; i < 12; i += 1) {
      const opening = rand(3) ? rand(20) : 0;
      items.push(f.item({
        opening_stock: opening, opening_rate: rand(4) ? rand(500) / 7 : 0, opening_value: rand(3) ? 0 : rand(9000) / 3,
        default_warehouse_id: rand(3) ? warehouses[rand(warehouses.length)] : null, is_deleted: rand(8) ? 0 : 1
      }));
    }
    for (let i = 0; i < 80; i += 1) {
      const quantity = rand(15) + 1;
      const inward = rand(3) > 0;
      f.insert("stock_ledger", {
        company_id: rand(4) ? 1 : second, item_id: items[rand(items.length)], warehouse_id: warehouses[rand(warehouses.length)],
        // Dates run past today, and types include reservations and adjustments, so a rule
        // about either in stockBalance shows up here as a difference.
        // Dates are counted back from today, so some always lie in the future.
        transaction_date: shift(istToday(), rand(500) - 300), transaction_type: ["Reservation", "Adjustment", "Transfer"][rand(6)] || (inward ? "Inward" : "Outward"),
        source_module: ["sales_voucher", "stock_adjustment", "supplier_return", "stock_transfer", "order_reservation"][rand(5)], source_id: i,
        inward_quantity: inward ? quantity : 0, outward_quantity: inward ? 0 : quantity, rate: 10, value_minor: rand(90000), is_deleted: rand(10) ? 0 : 1
      });
    }
    for (const company of [1, second]) {
      const balances = stockBalances(db, company);
      for (const item of [...items, 999999]) {
        for (const warehouse of [...warehouses, 999999]) {
          assert.deepEqual(balances.get(item, warehouse), m.stockBalance(db, company, item, warehouse), `seed ${seed}, company ${company}, item ${item}, warehouse ${warehouse}`);
          // opening() is the stockBalance quantity less the pair's live ledger rows.
          const moved = db.prepare("SELECT COALESCE(SUM(inward_quantity - outward_quantity), 0) q FROM stock_ledger WHERE company_id = ? AND item_id = ? AND warehouse_id = ? AND COALESCE(is_deleted, 0) = 0").get(company, item, warehouse).q;
          assert.ok(Math.abs(balances.opening(item, warehouse) - (m.stockBalance(db, company, item, warehouse).quantity - moved)) < 1e-9, `opening: seed ${seed}, company ${company}, item ${item}, warehouse ${warehouse}`);
        }
      }
      for (const entry of balances.entries()) {
        assert.deepEqual(entry.balance, m.stockBalance(db, company, entry.itemId, entry.warehouseId));
        assert.ok(entry.moved || entry.balance.quantity !== 0);
      }
    }
  }
});

test("stockBalance (used by stock posting) keeps its known results", () => {
  const { db, f } = fresh();
  const shared = f.insert("warehouses", { warehouse_name: "Shared", status: "active", company_id: null });
  const withOpening = f.item({ opening_stock: 4, opening_rate: 25, default_warehouse_id: shared });
  const valued = f.item({ opening_stock: 3, opening_rate: 10, opening_value: 45, default_warehouse_id: shared });
  const empty = f.item({ opening_rate: 12 });
  f.insert("stock_ledger", { company_id: 1, item_id: withOpening, warehouse_id: shared, transaction_date: "2026-07-01", transaction_type: "Outward", source_module: "audit_watch_fixture", source_id: 1, inward_quantity: 0, outward_quantity: 1, value_minor: 2500 });
  assert.deepEqual(m.stockBalance(db, 1, withOpening, shared), { quantity: 3, value: 75, value_minor: 7500, rate: 25 });
  assert.deepEqual(m.stockBalance(db, 1, valued, shared), { quantity: 3, value: 45, value_minor: 4500, rate: 15 });
  // No stock: the rate is the item's opening rate, and value never goes below zero.
  assert.deepEqual(m.stockBalance(db, 1, empty, shared), { quantity: 0, value: 0, value_minor: 0, rate: 12 });
  assert.deepEqual(m.stockBalance(db, 1, withOpening, 1), { quantity: 0, value: 0, value_minor: 0, rate: 25 });
});

test("a worker that loaded but cannot open the books gives an error and is not re-run in the main process", async () => {
  await runnerIdle();
  const { createAuditWatchRunner } = await load("src/main/services/auditWatch/auditWatchRunner.js");
  let inProcessRuns = 0;
  const runner = createAuditWatchRunner({ runInProcess: () => { inProcessRuns += 1; return { results: [] }; }, log: () => {} });
  await assert.rejects(runner.run("/nonexistent/folder/gii.db", { companyId: 1, role: "admin" }), /could not open the books/);
  assert.equal(inProcessRuns, 0);
  const deadline = Date.now() + 5000;
  while (runner.isRunning() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(runner.isRunning(), false);
});

// ------------------------------------------------------------ round-4 fixes

test("a long repeat run names the period's own records first, and its amount is the period's", () => {
  const { db, f } = fresh();
  const s = f.supplier();
  // A near-limit bill every third day for a year chains into one long run.
  const ids = [];
  for (let day = 0; day < 360; day += 3) ids.push({ id: f.bill(s, { purchase_invoice_number: "NA", purchase_date: shift("2025-11-01", day), purchase_value: 90000, purchase_gst: 0 }), date: shift("2025-11-01", day) });
  const october = ids.filter((row) => row.date >= "2026-10-01" && row.date <= "2026-10-31");
  const list = findings(m, db, "AW-P05", { limits: { "AW-P05": { minimumBills: 3 } }, from: "2026-10-01", to: "2026-10-31" });
  assert.equal(list.length, 1);
  assert.equal(list[0].refCount, ids.length, "the whole run is counted");
  assert.deepEqual(list[0].refs.slice(0, october.length).map((ref) => ref.id), october.map((row) => row.id), "October's bills come first");
  assert.equal(list[0].amountMinor, october.length * 9000000);
  assert.match(list[0].summary, new RegExp(`^.*: ${october.length} bills in this period .* \\(part of a run of ${ids.length} since 2025-11-01\\)$`));
});

test("a buyer (department) stock return posts no sales or receivable line, so AW-S02 may leave stock_returns out", async () => {
  const { db, f } = fresh();
  const item = f.item({ opening_stock: 10, opening_rate: 50 });
  const order = f.order();
  const ret = m.createRecord(db, "stock_returns", { company_id: 1, return_type: "Department", order_id: order, department_id: 1, item_id: item, warehouse_id: 1, return_date: "2026-07-03", quantity: 2 });
  m.postStockReturn(db, ret.id);
  const lines = db.prepare(`
    SELECT a.account_name, a.account_type FROM voucher_lines vl JOIN vouchers v ON v.id = vl.voucher_id JOIN accounts a ON a.id = vl.account_id
    WHERE v.source_module = 'stock_returns' AND v.source_id = ?
  `).all(ret.id);
  assert.ok(lines.length > 0, "the return was posted");
  for (const line of lines) {
    assert.notEqual(line.account_type, "Income", `${line.account_name} is a sales account`);
    assert.ok(!/receivable/i.test(line.account_name), `${line.account_name} is a receivable`);
  }
  const { checkById } = await load("src/main/services/auditWatch/catalogue.js");
  assert.ok("stock_returns" in checkById("AW-S02").uncovered.notSalesCredit);
});

// ------------------------------------------------------------ catalogue contract (keep last)

test("the catalogue declares every table and column the checks read, and no table they do not", () => {
  const traced = tracedReads();
  if (process.env.AW_DUMP_READS) fs.writeFileSync(process.env.AW_DUMP_READS, JSON.stringify(traced, null, 2));
  const problems = [];
  for (const check of CHECKS.filter((row) => row.readiness === "now")) {
    const actual = traced[check.id];
    if (!actual) {
      // A check that only calls a shared helper sends no query of its own.
      if (!check.helpers?.length) problems.push(`${check.id}: never ran through the tracer`);
      continue;
    }
    for (const [table, columns] of Object.entries(actual)) {
      if (!check.reads[table]) { problems.push(`${check.id}: reads table ${table}, not declared`); continue; }
      columns.filter((column) => !check.reads[table].includes(column)).forEach((column) => problems.push(`${check.id}: reads ${table}.${column}, not declared`));
    }
    // Tables read through a shared helper (stockBalance, bookIntegrityChecks) are not traced.
    if (!check.helpers?.length) Object.keys(check.reads).filter((table) => !actual[table]).forEach((table) => problems.push(`${check.id}: declares ${table} but never reads it`));
  }
  assert.deepEqual(problems, []);
});

test("verify-erp rules: the verifier refuses a verify-erp.js that could run another command or hide an Audit Watch failure", async () => {
  const { readVerifyErpPipeline } = await load("scripts/lib/verifyErpRules.mjs");
  const original = fs.readFileSync(path.join(REPO, "scripts/verify-erp.js"), "utf8");
  const pipeline = readVerifyErpPipeline(original);
  assert.ok(pipeline.some((step) => step.name === "test:audit-watch" && step.frozenStep), "the real verify-erp.js is accepted");
  const patch = (from, to) => {
    assert.ok(original.includes(from), `plant anchor not found: ${from}`);
    return original.replace(from, to);
  };
  const RUN = "const result = run(step.cmd);";
  const EXEC = "const stdout = execSync(cmd, { cwd: ROOT, encoding: \"utf-8\", timeout: 600000 });";
  const CALLED = /run must be called exactly once, directly in the run loop/;
  const RUN_FN = /run\(cmd\) must be one top-level function that passes its parameter unchanged/;
  // Each plant must be refused by the rule it targets, shown by that rule's message.
  const refused = [
    ["command swapped at the call", patch(RUN, 'const result = run(step.name === "test:audit-watch" ? "node -e 0" : step.cmd);'), CALLED],
    ["a second run() call", patch(RUN, `${RUN}\n    if (step.name === "test:audit-watch") run("node -e 0");`), CALLED],
    ["run aliased", patch(RUN, `const go = run;\n    ${RUN}`), CALLED],
    ["run called inside a nested function", patch(RUN, "const result = (() => run(step.cmd))();"), CALLED],
    ["the loop variable shadowed before the call", patch("for (const step of PIPELINE) {", "for (const step of PIPELINE) {\n    { }").replace(RUN, "const result = ((step) => run(step.cmd))({ cmd: \"node -e 0\" });"), CALLED],
    ["command swapped inside run()", patch(EXEC, EXEC.replace("execSync(cmd,", 'execSync(cmd.includes("audit-watch") ? "node -e 0" : cmd,')), RUN_FN],
    ["run() parameter reassigned", patch("  const start = Date.now();\n  try {", '  const start = Date.now();\n  if (cmd.includes("audit-watch")) cmd = "node -e 0";\n  try {'), RUN_FN],
    ["a shell option", patch(EXEC, EXEC.replace("timeout: 600000", 'timeout: 600000, shell: "/bin/true"')), RUN_FN],
    ["a second execSync call in run()", patch("  const start = Date.now();\n  try {", '  const start = Date.now();\n  execSync("node -e 0");\n  try {'), RUN_FN],
    ["another child_process import", patch('import { execSync } from "child_process";', 'import { execSync, spawnSync } from "child_process";'), /execSync must be the only import from child_process/],
    ["run redefined", patch(RUN, `${RUN}\n    void function run() {};`), /run must be declared once|run must be called exactly once/],
    ["a decoy evaluateMasterLockGate call", patch("function main() {", "function unused() { return evaluateMasterLockGate([], \"\"); }\nfunction main() {"), /exactly one evaluateMasterLockGate call/],
    ["strictExitCode removed", patch("result.exitCode = strictExitCode(step.name, result.exitCode);", ""), /does not apply strictExitCode/],
    ["PIPELINE not frozen", patch("const PIPELINE = Object.freeze([", "const PIPELINE = (["), /PIPELINE must be Object.freeze/],
    ["PIPELINE declared with let", patch("const PIPELINE = Object.freeze([", "let PIPELINE = Object.freeze(["), /PIPELINE must be declared once, at top level, with const/],
    ["Object redefined", patch("const PIPELINE = Object.freeze([", "const Object = { freeze: (value) => value };\nconst PIPELINE = Object.freeze(["), /Object is redefined or changed/],
    ["PIPELINE changed after its literal", patch("function main() {", "PIPELINE.length = 0;\nfunction main() {"), /PIPELINE is changed after its literal/],
    ["strictExitCode replaced by a local function", patch("import { LOCK_BLOCKING_STEPS, evaluateMasterLockGate, strictExitCode } from", "function strictExitCode(name, code) { return name && 0 * code; }\nimport { LOCK_BLOCKING_STEPS, evaluateMasterLockGate } from"), /strictExitCode must be imported/],
    ["the run loop skips a step", patch("for (const step of PIPELINE) {", 'for (const step of PIPELINE.filter((item) => item.name !== "test:audit-watch")) {'), /exactly one loop over PIPELINE/],
    ["another binding named run", patch("function main() {", "function unused(run) { return run; }\nfunction main() {"), /run must be declared once/],
    ["an Audit Watch step with a spread", patch('Object.freeze({ name: "test:audit-watch",', 'Object.freeze({ ...{}, name: "test:audit-watch",'), /an Audit Watch step is not a plain object/]
  ];
  for (const [name, text, message] of refused) {
    assert.throws(() => readVerifyErpPipeline(text), message, `not refused by its own rule: ${name}`);
  }
  // Ordinary refactors stay accepted.
  const accepted = {
    "record built in a const first": patch("    steps.push({", "    const record = {").replace("      warningDetail,\n    });", "      warningDetail,\n    };\n    steps.push(record);"),
    "unrelated inner const named record or result": patch(RUN, `${RUN}\n    if (process.env.VERBOSE) { const record = { cmd: step.cmd }; const result = record; console.log(result); }`),
    "export function run": patch("function run(", "export function run("),
    "loops and copies over the steps array": patch("  const lockGate = evaluateMasterLockGate(steps, workingTreeStatus);", "  for (const s of steps) void s;\n  void JSON.stringify([...steps]);\n  const lockGate = evaluateMasterLockGate(steps, workingTreeStatus);"),
    "the run result destructured or logged": patch(RUN, `${RUN}\n    const { duration } = result;\n    console.log(duration, result);`),
    "a retry loop inside the run loop": patch(RUN, "let result;\n    for (let attempt = 0; attempt < 2; attempt += 1) { result = run(step.cmd); if (result.exitCode === 0) break; }")
  };
  for (const [name, text] of Object.entries(accepted)) {
    assert.doesNotThrow(() => readVerifyErpPipeline(text), `wrongly refused: ${name}`);
  }
});
