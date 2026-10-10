// Critical-defect verification for gii-gem-erp, written against commit acf6d02
// (branch phase-16-enterprise-crm-integration).
//
// Each test asserts the CORRECT behaviour. A failing test means the defect is
// still present. Every test builds its own throwaway database in the OS temp
// folder; no real data folder is touched.
//
// Scope: service-level only. Not covered: desktop buttons, permissions, real
// Windows file locks, the historical-report checksum, SEC-1.
//
// Run:   node --test critical-defects.test.mjs
//        or from the repo root:  node --test scripts/audit/critical-defects.test.mjs
// Repo:  defaults to the repo this file sits in (scripts/audit/../..). Set
//        GII_REPO to test another checkout. node_modules must be built for
//        Node (npm ci / npm rebuild better-sqlite3), not the Electron rebuild.
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const REPO = process.env.GII_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const load = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);
const m = await load("src/main/database/init.js");
const backup = await load("src/main/services/backup.js");
const Sqlite = createRequire(path.join(REPO, "package.json"))("better-sqlite3");

// Runs fn. A throw counts as a deliberate refusal only when its message matches
// `refusal` and it is not a programming or SQLite error; anything else fails the
// test, so an unrelated crash can never pass as "correctly refused".
function attempt(fn, refusal) {
  try { return { refused: false, value: fn() }; }
  catch (e) {
    const unrelated = e instanceof TypeError || e instanceof ReferenceError || e instanceof RangeError
      || String(e?.code || "").startsWith("SQLITE_") || !refusal.test(String(e?.message || ""));
    if (unrelated) throw new Error(`unexpected error, not a guided refusal: ${e?.message}`, { cause: e });
    return { refused: true, message: e.message };
  }
}
const REFUSAL = /exceed|more than|greater than|already|not available|insufficient|cannot|can ?not|not allowed|requires? approval|must be approved|pending approval|not approved|invalid|duplicate/i;

// Every database handle and temp folder a test creates is registered here and
// released after the test, whether it passed or failed.
const openHandles = [];
const tempRoots = [];
const track = (db) => { openHandles.push(db); return db; };
afterEach(() => {
  while (openHandles.length) { const db = openHandles.pop(); try { if (db?.open) db.close(); } catch { /* already closed */ } }
  while (tempRoots.length) fs.rmSync(tempRoots.pop(), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function freshRoot() { const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-verify-")); tempRoots.push(root); return root; }
const openLive = (root) => track(m.initializeDatabase(root));
function fresh() { const root = freshRoot(); return { db: openLive(root), root }; }
const acc = (db, company, name) => db.prepare("SELECT id FROM accounts WHERE company_id = ? AND account_name = ?").get(company, name).id;
const rcv = (db, billingId) => db.prepare("SELECT invoice_amount, amount_received, balance_outstanding, status FROM receivables WHERE billing_id = ?").get(billingId);

function newOrder(db, number) {
  const required = db.prepare("PRAGMA table_info(supply_orders)").all().filter((c) => c.notnull && c.dflt_value == null && !c.pk).map((c) => c.name);
  const row = { company_id: 1, order_number: number, order_date: "2026-07-01", department_id: 1, employee_id: 1, order_status: "Received", institution_name: "X", location: "X" };
  for (const c of required) if (!(c in row)) row[c] = "X";
  const keys = Object.keys(row);
  return Number(db.prepare(`INSERT INTO supply_orders (${keys}) VALUES (${keys.map((k) => "@" + k)})`).run(row).lastInsertRowid);
}
function newInvoice(db, orderId, amount = 100000) {
  const inv = m.saveBillingVoucher(db, { header: { order_id: orderId, company_id: 1, invoice_date: "2026-07-01" }, items: [{ quantity: 1, billing_rate: amount, gst_rate: 18 }] });
  m.postSalesVoucher(db, inv.id);
  return inv.id;
}
function newPayment(db, amount, orderId, status = "Draft") {
  return Number(db.prepare("INSERT INTO payments (company_id, order_id, payment_date, payment_amount, payment_mode, posting_status) VALUES (1, ?, '2026-07-02', ?, 'NEFT', ?)").run(orderId, amount, status).lastInsertRowid);
}
function inventorySetup() {
  const { db } = fresh();
  const co = 1;
  const wA = m.createRecord(db, "warehouses", { company_id: co, warehouse_name: "WA", status: "active" }).id;
  const wB = m.createRecord(db, "warehouses", { company_id: co, warehouse_name: "WB", status: "active" }).id;
  const item = m.createRecord(db, "items", { item_name: "Verify Widget", unit: "Nos", status: "active", gst_rate: 18, opening_stock: 0, opening_rate: 0, opening_value: 0, default_warehouse_id: wA }).id;
  const dept = db.prepare("SELECT id FROM government_departments LIMIT 1").get().id;
  const emp = db.prepare("SELECT id FROM employees LIMIT 1").get().id;
  const order = m.createRecord(db, "supply_orders", { company_id: co, order_number: "SO-INV", order_date: "2026-06-01", order_status: "Received", institution_name: "X", department_id: dept, employee_id: emp, location: "M", supply_due_date: "2026-06-30" });
  let n = 0;
  const inward = (wh, qty, rate) => m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: co, item_id: item, warehouse_id: wh, inward_date: "2026-06-10", purchase_invoice_number: `P${++n}`, quantity: qty, rate, landed_cost: 0 }).id);
  const outward = (wh, qty) => m.postStockOutward(db, m.createRecord(db, "stock_outwards", { company_id: co, item_id: item, warehouse_id: wh, issue_date: "2026-06-15", delivery_challan_number: `DC${++n}`, quantity_issued: qty, order_id: order.id, department_id: dept }).id);
  const summary = (wh) => m.inventoryData(db, { company_id: co }).stockSummary.find((r) => r.item_id === item && r.warehouse_id === wh) || { closing_quantity: 0, stock_value: 0 };
  return { db, co, wA, wB, item, inward, outward, summary };
}

// ---------------------------------------------------------------- Claim 1
const SOURCE_TABLE = { billing: "invoices", procurement: "procurements", payment: "payments", supplier_payment: "supplier_payments" };
const netByAccount = (db, voucherIds) => Object.fromEntries(db.prepare(`
  SELECT account_id, ROUND(SUM(debit) - SUM(credit), 2) net FROM ledger_entries
  WHERE voucher_id IN (${voucherIds.map(() => "?").join(",")}) AND COALESCE(is_deleted, 0) = 0 GROUP BY account_id`).all(...voucherIds).map((r) => [r.account_id, r.net]));
const liveAllocations = (db, table, column, id) => db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE ${column} = ? AND COALESCE(is_deleted, 0) = 0`).get(id).c;

for (const module of Object.keys(SOURCE_TABLE)) {
  test(`C1 reversing a posted ${module} voucher fully reverses it`, () => {
    const { db } = fresh();
    const v = db.prepare("SELECT * FROM vouchers WHERE source_module = ? AND status = 'Posted'").get(module);
    assert.ok(v, `seed data has a posted ${module} voucher`);
    const originalNet = netByAccount(db, [v.id]);
    assert.ok(Object.keys(originalNet).length >= 2, "original voucher has ledger entries");
    const receivableBefore = module === "payment"
      ? db.prepare("SELECT r.billing_id, r.balance_outstanding, (SELECT SUM(allocated_amount) FROM payment_allocations pa WHERE pa.payment_id = ? AND pa.billing_id = r.billing_id AND COALESCE(pa.is_deleted,0) = 0) allocated FROM receivables r WHERE r.billing_id IN (SELECT billing_id FROM payment_allocations WHERE payment_id = ? AND COALESCE(is_deleted,0) = 0)").all(v.source_id, v.source_id)
      : [];
    if (module === "payment") assert.ok(receivableBefore.length > 0, "seed receipt has at least one allocation to release");

    let reversal;
    assert.doesNotThrow(() => { reversal = m.reverseVoucher(db, v.id, "verification"); }, `reversing ${v.voucher_number}`);

    // A new, posted reversal voucher that points back at the original.
    const rv = db.prepare("SELECT * FROM vouchers WHERE id = ?").get(reversal?.id);
    assert.ok(rv && rv.id !== v.id, "a new reversal voucher exists");
    assert.equal(rv.source_module, "voucher_reversal");
    assert.equal(rv.source_id, v.id);
    // Ledger: the reversal is the exact mirror, so the pair nets to zero on every account.
    const reversalNet = netByAccount(db, [rv.id]);
    assert.deepEqual(reversalNet, Object.fromEntries(Object.entries(originalNet).map(([k, n]) => [k, -n])), "reversal ledger lines mirror the original");
    assert.ok(Object.values(netByAccount(db, [v.id, rv.id])).every((n) => Math.abs(n) < 0.005), "original + reversal nets to zero");
    // Status of the voucher and of the source document.
    assert.equal(db.prepare("SELECT status FROM vouchers WHERE id = ?").get(v.id).status, "Reversed");
    assert.equal(db.prepare(`SELECT posting_status FROM ${SOURCE_TABLE[module]} WHERE id = ?`).get(v.source_id).posting_status, "Reversed");
    // Sub-ledger effects.
    if (module === "billing") {
      const r = db.prepare("SELECT balance_outstanding, status FROM receivables WHERE billing_id = ?").get(v.source_id);
      assert.deepEqual({ outstanding: r.balance_outstanding, status: r.status }, { outstanding: 0, status: "Reversed" });
      assert.equal(liveAllocations(db, "payment_allocations", "billing_id", v.source_id), 0, "receipt allocations against the invoice released");
    }
    if (module === "payment") {
      assert.equal(liveAllocations(db, "payment_allocations", "payment_id", v.source_id), 0, "the receipt's allocations released");
      for (const before of receivableBefore) {
        const after = db.prepare("SELECT balance_outstanding FROM receivables WHERE billing_id = ?").get(before.billing_id).balance_outstanding;
        assert.equal(after, before.balance_outstanding + before.allocated, `invoice ${before.billing_id} outstanding restored`);
      }
    }
    if (module === "procurement") assert.equal(liveAllocations(db, "supplier_payment_allocations", "procurement_id", v.source_id), 0, "supplier payment allocations against the purchase released");
    if (module === "supplier_payment") assert.equal(liveAllocations(db, "supplier_payment_allocations", "supplier_payment_id", v.source_id), 0, "the supplier payment's allocations released");
    // A second reversal is refused.
    assert.throws(() => m.reverseVoucher(db, v.id, "again"), /already reversed|reversal already exists/i);
  });
}

// ---------------------------------------------------------------- Claim 2
function closeFirstYearWithProfit() {
  const { db } = fresh();
  db.prepare("UPDATE expense_entries SET posting_status = 'Posted' WHERE posting_status NOT IN ('Posted','Reversed')").run();
  m.createManualVoucher(db, { company_id: 1, voucher_date: "2025-05-01", voucher_type: "Journal", lines: [{ account_id: acc(db, 1, "Trade Receivables"), debit: 1000 }, { account_id: acc(db, 1, "Sales"), credit: 1000 }] });
  return db;
}
const bs = (db, from, to) => m.balanceSheetReport(db, 1, from, to);
const tradeReceivables = (report) => report.rows.find((r) => r.account_name === "Trade Receivables")?.amount || 0;

// Trade Receivables per the ledger itself, cumulative to a date (all posted entries).
const ledgerTr = (db, to) => db.prepare("SELECT COALESCE(SUM(le.debit),0) - COALESCE(SUM(le.credit),0) b FROM ledger_entries le JOIN vouchers v ON v.id = le.voucher_id JOIN accounts a ON a.id = le.account_id WHERE a.company_id = 1 AND a.account_name = 'Trade Receivables' AND le.entry_date <= ? AND v.status IN ('Posted','Reversed') AND COALESCE(le.is_deleted,0) = 0").get(to).b;
const ties = (r) => Math.round((r.assets - r.liabilitiesAndEquity) * 100) === 0;

test("C2 after closing FY 2025-26, the FY 2026-27 balance sheet ties and carries the prior-year balances", () => {
  const db = closeFirstYearWithProfit();
  m.closeFinancialYear(db, { company_id: 1, from_financial_year_id: 1, to_financial_year_id: 2 });
  const report = bs(db, "2026-04-01", "2027-03-31");
  assert.ok(ties(report), `assets ${report.assets} vs liabilities+equity ${report.liabilitiesAndEquity}`);
  assert.equal(tradeReceivables(report), ledgerTr(db, "2027-03-31"), "Trade Receivables on the balance sheet equals the ledger balance");
});

test("C2b the second year can itself be closed into a third year, and that year ties", () => {
  const db = closeFirstYearWithProfit();
  m.closeFinancialYear(db, { company_id: 1, from_financial_year_id: 1, to_financial_year_id: 2 });
  const fy3 = m.createFinancialYear(db, { company_id: 1, financial_year_name: "FY 2027-28", start_date: "2027-04-01", end_date: "2028-03-31" });
  m.closeFinancialYear(db, { company_id: 1, from_financial_year_id: 2, to_financial_year_id: fy3.id });
  const report = bs(db, "2027-04-01", "2028-03-31");
  assert.ok(ties(report), `FY 2027-28 assets ${report.assets} vs liabilities+equity ${report.liabilitiesAndEquity}`);
  assert.equal(tradeReceivables(report), ledgerTr(db, "2028-03-31"), "Trade Receivables on the balance sheet equals the ledger balance");
});

test("C2c before the prior year is closed, the next year's balance sheet still shows the full ledger balance", () => {
  const db = closeFirstYearWithProfit();
  const report = bs(db, "2026-04-01", "2027-03-31");
  assert.equal(tradeReceivables(report), ledgerTr(db, "2027-03-31"), `ledger says ${ledgerTr(db, "2027-03-31")}, balance sheet shows ${tradeReceivables(report)} (FY 2025-26 not yet closed)`);
});

// ---------------------------------------------------------------- Claims 3 and 4
test("C3 one receipt cannot be applied twice (advance adjustment + allocation)", () => {
  const { db } = fresh();
  const so = newOrder(db, "SO-C3");
  const A = newInvoice(db, so), B = newInvoice(db, so);
  const pay = newPayment(db, 100000, so, "Posted");
  const adv = m.createAdvanceReceipt(db, { payment_id: pay, department_id: 1 });
  m.adjustAdvanceReceipt(db, { advance_id: adv.id, billing_id: A, adjusted_amount: 100000 });
  const second = attempt(() => m.createReceiptAllocation(db, { payment_id: pay, billing_id: B, allocated_amount: 100000 }), REFUSAL);
  const a = rcv(db, A), b = rcv(db, B);
  // The money must be applied exactly once: the advance adjustment on A stays, B gets nothing.
  assert.deepEqual(
    { secondAllocationRefused: second.refused, appliedToA: a.amount_received, appliedToB: b.amount_received },
    { secondAllocationRefused: true, appliedToA: 100000, appliedToB: 0 });
});

test("C4 an advance cannot exceed its receipt", () => {
  const { db } = fresh();
  const so = newOrder(db, "SO-C4");
  const pay = newPayment(db, 100000, so, "Posted");
  const tooBig = attempt(() => m.createAdvanceReceipt(db, { payment_id: pay, department_id: 1, advance_received: 500000 }), REFUSAL);
  assert.equal(tooBig.refused, true, `a 100000 receipt recorded an advance of ${tooBig.value?.advance_received}`);
  // Control: an advance equal to the receipt is still accepted.
  const exact = m.createAdvanceReceipt(db, { payment_id: pay, department_id: 1, advance_received: 100000 });
  assert.equal(Number(exact.advance_received), 100000);
});

// ---------------------------------------------------------------- Claim 5
test("C5 posting receipts never pushes an invoice below zero", () => {
  const { db } = fresh();
  const so = newOrder(db, "SO-C5");
  const A = newInvoice(db, so), B = newInvoice(db, so);
  for (const amount of [118000, 118000]) m.postBusinessTransaction(db, "payments", newPayment(db, amount, so));
  const a = rcv(db, A), b = rcv(db, B);
  const allocated = db.prepare("SELECT COALESCE(SUM(allocated_amount),0) s FROM payment_allocations WHERE billing_id IN (?, ?) AND COALESCE(is_deleted,0) = 0").get(A, B).s;
  // Two 118000 receipts against two 118000 invoices: both settle, nothing lost, nothing over-applied.
  assert.deepEqual(
    { outstandingA: a.balance_outstanding, outstandingB: b.balance_outstanding, receivedTotal: a.amount_received + b.amount_received, allocatedTotal: allocated },
    { outstandingA: 0, outstandingB: 0, receivedTotal: 236000, allocatedTotal: 236000 });
});

// ---------------------------------------------------------------- Claim 6
test("C6 a second Post click does not unlock or double-book a posted purchase", () => {
  const { db } = fresh();
  const p = m.createRecord(db, "procurements", { company_id: 1, order_id: 1, purchase_date: "2025-06-01", supplier_id: 1, purchase_invoice_number: "INV-C6", purchase_value: 10000, purchase_gst: 1800 });
  m.postPurchaseVoucher(db, p.id);
  assert.throws(() => m.postPurchaseVoucher(db, p.id), /already posted/i);
  const statusAfter = db.prepare("SELECT posting_status FROM procurements WHERE id = ?").get(p.id).posting_status;
  const third = attempt(() => m.postPurchaseVoucher(db, p.id), /already posted/i);
  const vouchers = db.prepare("SELECT COUNT(*) c FROM vouchers WHERE source_module = 'procurement' AND source_id = ?").get(p.id).c;
  const credit = db.prepare("SELECT SUM(le.credit) s FROM ledger_entries le JOIN accounts a ON a.id = le.account_id WHERE a.account_name = 'Trade Payables' AND le.source_module = 'procurement' AND le.source_id = ?").get(p.id).s;
  assert.deepEqual(
    { statusAfterSecondClick: statusAfter, thirdClickRefused: third.refused, vouchers, tradePayablesCredit: credit },
    { statusAfterSecondClick: "Posted", thirdClickRefused: true, vouchers: 1, tradePayablesCredit: 11800 });
});

// ---------------------------------------------------------------- Claim 7
test("C7 a failed sales posting leaves nothing behind, and the retry posts once and completely", () => {
  const { db } = fresh();
  const order = db.prepare("SELECT order_id FROM invoices LIMIT 1").get().order_id;
  const id = db.prepare("INSERT INTO invoices (company_id, order_id, invoice_number, invoice_date, billing_value, gst_rate) VALUES (1, ?, 'INV-C7', '2026-07-01', 1000, 18)").run(order).lastInsertRowid;
  const state = () => ({
    vouchers: db.prepare("SELECT COUNT(*) c FROM vouchers WHERE source_module = 'billing' AND source_id = ?").get(id).c,
    ledgerEntries: db.prepare("SELECT COUNT(*) c FROM ledger_entries WHERE source_module = 'billing' AND source_id = ?").get(id).c,
    receivables: db.prepare("SELECT COUNT(*) c FROM receivables WHERE billing_id = ?").get(id).c,
    invoicePosted: db.prepare("SELECT posting_status FROM invoices WHERE id = ?").get(id).posting_status === "Posted"
  });
  db.exec("CREATE TEMP TRIGGER verify_fail BEFORE INSERT ON receivables BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;");
  assert.throws(() => m.postSalesVoucher(db, id), /simulated failure/);
  db.exec("DROP TRIGGER verify_fail");
  // Immediately after the failure: nothing may be left committed.
  assert.deepEqual(state(), { vouchers: 0, ledgerEntries: 0, receivables: 0, invoicePosted: false }, "state right after the injected failure");

  m.postSalesVoucher(db, id);
  const after = state();
  assert.ok(after.ledgerEntries >= 2, `retry wrote ${after.ledgerEntries} ledger entries`);
  assert.deepEqual({ ...after, ledgerEntries: undefined }, { vouchers: 1, ledgerEntries: undefined, receivables: 1, invoicePosted: true }, "state after the retry");
  const lines = db.prepare("SELECT a.account_name, SUM(le.debit) dr, SUM(le.credit) cr FROM ledger_entries le JOIN accounts a ON a.id = le.account_id WHERE le.source_module = 'billing' AND le.source_id = ? GROUP BY a.account_name").all(id);
  const by = Object.fromEntries(lines.map((l) => [l.account_name, Math.round((l.dr - l.cr) * 100) / 100]));
  const gst = Object.entries(by).filter(([n]) => /gst/i.test(n)).reduce((t, [, n]) => t + n, 0);
  assert.deepEqual({ tradeReceivables: by["Trade Receivables"], sales: by.Sales, gst: Math.round(gst * 100) / 100 }, { tradeReceivables: 1180, sales: -1000, gst: -180 });
  const r = db.prepare("SELECT invoice_amount, balance_outstanding FROM receivables WHERE billing_id = ?").get(id);
  assert.deepEqual(r, { invoice_amount: 1180, balance_outstanding: 1180 });
});

// ---------------------------------------------------------------- Claim 8
test("C8 a warehouse transfer keeps stock value", () => {
  const s = inventorySetup();
  s.inward(s.wA, 10, 100);
  const t = m.createWarehouseTransfer(s.db, { company_id: s.co, from_warehouse_id: s.wA, to_warehouse_id: s.wB, item_id: s.item, quantity: 4, transfer_date: "2026-06-11" });
  m.postWarehouseTransfer(s.db, t.id);
  const a = s.summary(s.wA), b = s.summary(s.wB);
  s.outward(s.wB, 2);
  const issue = s.db.prepare("SELECT rate, value FROM stock_ledger WHERE transaction_type = 'Outward' AND item_id = ?").get(s.item);
  assert.deepEqual({ a: a.stock_value, b: b.stock_value, issueRate: issue.rate }, { a: 600, b: 400, issueRate: 100 });
});

// ---------------------------------------------------------------- Claim 9
test("C9 item opening stock cannot be issued from a warehouse that never held it", () => {
  const s = inventorySetup();
  s.db.prepare("UPDATE items SET opening_stock = 10, opening_rate = 50, opening_value = 500 WHERE id = ?").run(s.item);
  assert.equal(s.summary(s.wB).closing_quantity, 0, "stock summary shows nothing in warehouse B");
  const issue = attempt(() => s.outward(s.wB, 10), /stock|available|negative|insufficient|exceed/i);
  const issued = s.db.prepare("SELECT COALESCE(SUM(outward_quantity), 0) q FROM stock_ledger WHERE item_id = ? AND warehouse_id = ?").get(s.item, s.wB).q;
  assert.deepEqual({ refused: issue.refused, issuedFromB: issued }, { refused: true, issuedFromB: 0 }, "issuing 10 from warehouse B should be refused");
});

// ---------------------------------------------------------------- Claim 10
function liveDbWithMarker() {
  const root = freshRoot();
  const db = openLive(root);
  m.createRecord(db, "suppliers", { supplier_name: "Must Survive", status: "active" });
  db.close();
  return root;
}
// Mirrors the backup:restore IPC handler in src/main/main.js: close, restore, reopen.
// Only a guided refusal counts; a crash (TypeError, raw SQLite error, unrelated
// message) fails the test instead of passing as "refused".
const RESTORE_REFUSAL = /backup|restore|not a valid|invalid|corrupt|damaged|integrity|not an? (ERP|GII|application)|unrecogni[sz]ed|unsupported|empty/i;
function attemptRestore(root, fileName) {
  const r = attempt(() => backup.restoreBackup(fileName, root), RESTORE_REFUSAL);
  return r.refused ? `refused: ${r.message}` : "accepted";
}
const pendingFiles = (root) => ["pending_restore.db", "pending_restore.json"].filter((f) => fs.existsSync(path.join(root, "database", f)));
// Opens the live file read-only with the raw driver (no migration or seeding),
// so a restore that silently replaced it with a fresh database is caught.
function liveState(root, marker = "Must Survive") {
  const file = path.join(root, "database", m.DB_NAME);
  let raw;
  try {
    raw = track(new Sqlite(file, { readonly: true, fileMustExist: true }));
    const integrity = raw.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") return `corrupt: integrity_check ${integrity}`;
    const hasSuppliers = raw.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'suppliers'").get();
    if (!hasSuppliers) return "not an ERP database";
    if (!raw.prepare("SELECT id FROM suppliers WHERE supplier_name = ?").get(marker)) return `original data is gone (no '${marker}')`;
  } catch (e) { return `will not open: ${e.message}`; }
  finally { raw?.close(); }
  try { openLive(root).close(); } catch (e) { return `app will not start on it: ${e.message}`; }
  return "intact";
}
function restoreCase(name, writeBackup) {
  test(name, () => {
    const root = liveDbWithMarker();
    const fileName = writeBackup(root);
    const outcome = attemptRestore(root, fileName);
    const state = liveState(root);
    assert.deepEqual({ outcome: outcome.startsWith("refused") ? "refused" : outcome, live: state }, { outcome: "refused", live: "intact" }, `restore ${outcome}; live database ${state}`);
  });
}
restoreCase("C10a restoring a non-SQLite file is rejected and the live database stays intact", (root) => {
  fs.writeFileSync(path.join(root, "backups", "bad.db"), "this is not sqlite");
  return "bad.db";
});
restoreCase("C10b restoring a truncated copy of a real database is rejected and the live database stays intact", (root) => {
  const good = fs.readFileSync(path.join(root, "database", m.DB_NAME));
  fs.writeFileSync(path.join(root, "backups", "truncated.db"), good.subarray(0, Math.floor(good.length / 3)));
  return "truncated.db";
});
restoreCase("C10c restoring a zero-byte file is rejected and the live database stays intact", (root) => {
  fs.writeFileSync(path.join(root, "backups", "zero.db"), Buffer.alloc(0));
  return "zero.db";
});
restoreCase("C10d restoring a valid SQLite file that is not an ERP database is rejected and the live database stays intact", (root) => {
  const file = path.join(root, "backups", "foreign.db");
  const other = track(new Sqlite(file));
  other.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT); INSERT INTO notes (body) VALUES ('unrelated');");
  other.close();
  return "foreign.db";
});
test("C10e a good backup really restores: data changed after the backup is rolled back", () => {
  const root = liveDbWithMarker();
  const fileName = backup.createBackup(root).fileName;
  const db = openLive(root);
  db.prepare("UPDATE suppliers SET supplier_name = 'Changed After Backup' WHERE supplier_name = 'Must Survive'").run();
  m.createRecord(db, "suppliers", { supplier_name: "Added After Backup", status: "active" });
  db.close();
  assert.equal(liveState(root), "original data is gone (no 'Must Survive')", "fixture really changed before restore");
  assert.equal(attemptRestore(root, fileName), "accepted");
  assert.equal(liveState(root), "intact", "the backed-up row is back");
  const raw = track(new Sqlite(path.join(root, "database", m.DB_NAME), { readonly: true }));
  try {
    assert.equal(raw.prepare("SELECT COUNT(*) c FROM suppliers WHERE supplier_name IN ('Changed After Backup', 'Added After Backup')").get().c, 0, "post-backup changes are gone");
  } finally { raw.close(); }
});
test("C10f the pending-restore path (used when the file is locked) explicitly refuses a bad file", () => {
  const root = liveDbWithMarker();
  fs.writeFileSync(path.join(root, "backups", "bad.db"), "this is not sqlite");
  // Either step may refuse, but one of them must, with a guided message.
  const prepared = attempt(() => backup.preparePendingRestore("bad.db", root), RESTORE_REFUSAL);
  const applied = prepared.refused ? prepared : attempt(() => backup.applyPendingRestore(root), RESTORE_REFUSAL);
  // Simulate the next app start, which always calls applyPendingRestore first.
  const nextStart = attempt(() => backup.applyPendingRestore(root), RESTORE_REFUSAL);
  assert.deepEqual(
    { refused: prepared.refused || applied.refused, pendingFilesLeft: pendingFiles(root), nextStartRestored: Boolean(nextStart.value?.restored), live: liveState(root) },
    { refused: true, pendingFilesLeft: [], nextStartRestored: false, live: "intact" });
});
test("C10g the pending-restore path still restores a good backup (control case)", () => {
  const root = liveDbWithMarker();
  const fileName = backup.createBackup(root).fileName;
  const db = openLive(root);
  db.prepare("UPDATE suppliers SET supplier_name = 'Changed After Backup' WHERE supplier_name = 'Must Survive'").run();
  db.close();
  backup.preparePendingRestore(fileName, root);
  assert.equal(backup.applyPendingRestore(root)?.restored, true);
  assert.deepEqual({ pendingFilesLeft: pendingFiles(root), live: liveState(root) }, { pendingFilesLeft: [], live: "intact" });
});

// ---------------------------------------------------------------- Claim 11
test("C11a the generic save cannot create a purchase that is already Posted", () => {
  const { db } = fresh();
  const saved = attempt(() => m.createRecord(db, "procurements", { company_id: 1, order_id: 1, purchase_date: "2025-06-01", supplier_id: 1, purchase_invoice_number: "FAKE-1", purchase_value: 50000, posting_status: "Posted", approval_status: "Approved" }), REFUSAL);
  const row = saved.refused ? null : db.prepare("SELECT posting_status, approval_status FROM procurements WHERE id = ?").get(saved.value.id);
  assert.ok(saved.refused || (row.posting_status !== "Posted" && row.approval_status !== "Approved"), `purchase stored as ${row?.posting_status}/${row?.approval_status} with no voucher`);
  // Control: the record can still be posted through the real posting path afterwards.
  if (!saved.refused) {
    m.postPurchaseVoucher(db, saved.value.id);
    assert.equal(db.prepare("SELECT COUNT(*) c FROM vouchers WHERE source_module = 'procurement' AND source_id = ?").get(saved.value.id).c, 1);
  }
});
test("C11c an ordinary draft purchase saves as unposted and posts exactly once (control case)", () => {
  const { db } = fresh();
  const p = m.createRecord(db, "procurements", { company_id: 1, order_id: 1, purchase_date: "2026-06-01", supplier_id: 1, purchase_invoice_number: "INV-C11C", purchase_value: 10000, purchase_gst: 1800 });
  assert.notEqual(db.prepare("SELECT posting_status FROM procurements WHERE id = ?").get(p.id).posting_status, "Posted", "saved as unposted");
  m.postPurchaseVoucher(db, p.id);
  const credit = db.prepare("SELECT SUM(le.credit) s FROM ledger_entries le JOIN accounts a ON a.id = le.account_id WHERE a.account_name = 'Trade Payables' AND le.source_module = 'procurement' AND le.source_id = ?").get(p.id).s;
  assert.deepEqual(
    { status: db.prepare("SELECT posting_status FROM procurements WHERE id = ?").get(p.id).posting_status, vouchers: db.prepare("SELECT COUNT(*) c FROM vouchers WHERE source_module = 'procurement' AND source_id = ?").get(p.id).c, tradePayablesCredit: credit },
    { status: "Posted", vouchers: 1, tradePayablesCredit: 11800 });
});

test("C11b the generic save cannot create a stock adjustment that is already Approved", () => {
  const { db } = fresh();
  const saved = attempt(() => m.createRecord(db, "stock_adjustments", { company_id: 1, item_id: 1, warehouse_id: 1, adjustment_date: "2025-06-01", adjustment_type: "Increase", quantity: 100, rate: 1000, reason: "verification", approval_status: "Approved" }), REFUSAL);
  if (!saved.refused) attempt(() => m.postStockAdjustment(db, saved.value.id), REFUSAL);
  const rows = db.prepare("SELECT COUNT(*) c FROM stock_ledger WHERE transaction_type = 'Adjustment Increase' AND item_id = 1 AND warehouse_id = 1").get().c;
  assert.equal(rows, 0, "stock was adjusted with no approval step");
});
test("C11d a draft stock adjustment posts only after the approval step (control case)", () => {
  const { db } = fresh();
  const adj = m.createRecord(db, "stock_adjustments", { company_id: 1, item_id: 1, warehouse_id: 1, adjustment_date: "2026-06-01", adjustment_type: "Increase", quantity: 100, rate: 1000, reason: "verification" });
  assert.throws(() => m.postStockAdjustment(db, adj.id), /requires approval/i, "unapproved adjustment is refused");
  m.approveStockAdjustment(db, adj.id, 1);
  m.postStockAdjustment(db, adj.id);
  const row = db.prepare("SELECT SUM(inward_quantity) q, SUM(value) v FROM stock_ledger WHERE transaction_type = 'Adjustment Increase' AND item_id = 1 AND warehouse_id = 1").get();
  assert.deepEqual({ quantity: row.q, value: row.v }, { quantity: 100, value: 100000 });
});

// ---------------------------------------------------------------- Claim 12
test("C12 a bank line for an already-posted receipt does not book the receipt again", () => {
  const { db } = fresh();
  const p = db.prepare("SELECT * FROM payments WHERE utr_number = 'UTR10001'").get();
  assert.equal(p?.posting_status, "Posted", "seed receipt UTR10001 is posted before the test");
  const bank = () => db.prepare("SELECT SUM(le.debit) - SUM(le.credit) b FROM ledger_entries le JOIN accounts a ON a.id = le.account_id WHERE a.account_name = 'Bank' AND le.company_id = 1").get().b;
  const vouchersBefore = db.prepare("SELECT COUNT(*) c FROM vouchers").get().c;
  const before = bank();
  m.createBankStatementImport(db, { company_id: 1, file_name: "verify-c12.csv", rows: [{ date: p.payment_date, narration: `NEFT ${p.utr_number} receipt`, credit: String(p.payment_amount), debit: "", utr: p.utr_number }] });
  const entry = db.prepare("SELECT * FROM bank_statement_entries WHERE utr = ? ORDER BY id DESC").get(p.utr_number);
  assert.ok(entry, "the statement line for UTR10001 was imported");
  m.updateBankImportStatus(db, entry.import_id, "Approved", 1);
  const prop = db.prepare("SELECT * FROM voucher_proposals WHERE bank_entry_id = ?").get(entry.id);
  if (prop) {
    // A proposal may exist (e.g. as "already booked"), but it must not post again.
    const steps = attempt(() => {
      m.approveVoucherProposal(db, prop.id, 1);
      m.createDraftVoucherFromProposal(db, prop.id, 1);
      m.postDraftVoucherFromProposal(db, prop.id, 1);
    }, REFUSAL);
    void steps;
  }
  assert.deepEqual(
    { bankBalance: bank(), newVouchers: db.prepare("SELECT COUNT(*) c FROM vouchers").get().c - vouchersBefore },
    { bankBalance: before, newVouchers: 0 },
    `proposal ${prop?.id ?? "none"} for bank entry ${entry.id} (matched ${entry.matched_module} #${entry.matched_record_id})`);
});
