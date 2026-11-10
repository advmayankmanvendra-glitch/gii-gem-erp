// Regression tests for "the ERP never resets" and the manual update flow (10 Nov 2026).
// Each test builds its own throwaway database in the OS temp folder.
// Run from the repo root:  node --test scripts/audit/reset-update.test.mjs
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const m = await import(pathToFileURL(path.join(REPO, "src/main/database/init.js")).href);
const reset = await import(pathToFileURL(path.join(REPO, "src/main/services/operationalResetService.js")).href);
const updates = await import(pathToFileURL(path.join(REPO, "src/main/services/updateVersion.js")).href);

const handles = [];
const roots = [];
afterEach(() => {
  while (handles.length) { const db = handles.pop(); try { if (db.open) db.close(); } catch { /* closed */ } }
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
function freshRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-reset-"));
  roots.push(root);
  return root;
}

const insert = (db, table, row) => {
  const cols = Object.keys(row);
  return Number(db.prepare(`INSERT INTO "${table}" (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(...Object.values(row)).lastInsertRowid);
};

// Adds, for one company, the pre-sales and follow-up chain that points at its supply
// order, plus a posted opening balance (which owns an opening voucher).
function addLinkedRecords(db, companyId, tag) {
  const order = db.prepare("SELECT id FROM supply_orders WHERE company_id = ? ORDER BY id LIMIT 1").get(companyId).id;
  const supplier = db.prepare("SELECT id FROM suppliers ORDER BY id LIMIT 1").get().id;
  const lead = insert(db, "leads", { company_id: companyId, lead_number: `L-${tag}`, title: "Lead" });
  const query = insert(db, "requirement_queries", { company_id: companyId, query_number: `Q-${tag}`, title: "Need", lead_id: lead });
  const quote = insert(db, "quotations", { company_id: companyId, quotation_number: `QT-${tag}`, supplier_id: supplier, quotation_date: "2026-04-02", requirement_query_id: query, supply_order_id: order });
  const negotiation = insert(db, "negotiations", { company_id: companyId, negotiation_number: `N-${tag}`, negotiation_date: "2026-04-03", quotation_id: quote, supplier_id: supplier, supply_order_id: order });
  insert(db, "purchase_orders", { company_id: companyId, po_number: `PO-${tag}`, po_date: "2026-04-04", work_order_id: order, negotiation_id: negotiation, converted_to_work_order: 1 });
  insert(db, "installations", { company_id: companyId, installation_number: `I-${tag}`, supply_order_id: order });
  insert(db, "procurement_plans", { company_id: companyId, plan_number: `PP-${tag}`, plan_date: "2026-04-05", order_id: order });
  const year = db.prepare("SELECT id FROM financial_years WHERE company_id = ? AND status = 'Open' ORDER BY id LIMIT 1").get(companyId).id;
  return m.createOpeningBalance(db, { company_id: companyId, financial_year_id: year, balance_type: "Cash", opening_debit: 5000 });
}

function secondCompany(db) {
  return insert(db, "companies", { company_name: "Second Test Co" });
}

test("a reset clears a company whose order is linked from CRM records and a posted opening balance", () => {
  const root = freshRoot();
  let db = m.initializeDatabase(root);
  handles.push(db);
  const opening = addLinkedRecords(db, 1, "c1");
  assert.ok(opening.voucher_id, "opening balance is posted with its own voucher");

  const preview = reset.previewReset(db, 1);
  assert.equal(preview.scope, "company");
  assert.equal(preview.company.id, 1);
  assert.ok(preview.totalOperational > 0);

  // Before the fix this threw "Reset would leave N foreign key issue(s)" and nothing was cleared.
  const result = reset.executeReset(db, root, { userId: 1, companyId: 1, confirmText: "RESET" });
  assert.equal(result.after.totalOperational, 0);
  assert.equal(result.before.totalOperational, preview.totalOperational, "the preview counts exactly the rows the reset clears");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  for (const table of ["vouchers", "voucher_lines", "ledger_entries", "supply_orders", "purchase_orders", "quotations", "negotiations", "installations", "procurement_plans", "requirement_queries", "leads", "opening_balances"]) {
    const where = table === "voucher_lines" ? "voucher_id IN (SELECT id FROM vouchers WHERE company_id = 1)" : "company_id = 1";
    assert.equal(db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE ${where}`).get().c, 0, `${table} is empty after the reset`);
  }

  // The reset survives a restart (the app reopens the database after a reset).
  db.close();
  db = m.initializeDatabase(root);
  handles.push(db);
  assert.equal(reset.previewReset(db, 1).totalOperational, 0, "nothing comes back after reopening");
  assert.ok(db.prepare("SELECT COUNT(*) c FROM accounts WHERE company_id = 1").get().c > 0, "chart of accounts is kept");
});

test("a reset leaves every other company untouched", () => {
  const root = freshRoot();
  const db = m.initializeDatabase(root);
  handles.push(db);
  const other = secondCompany(db);
  const order = db.prepare("SELECT * FROM supply_orders WHERE company_id = 1 ORDER BY id LIMIT 1").get();
  const { id: _id, order_number: _n, ...copy } = order;
  insert(db, "supply_orders", { ...copy, company_id: other, order_number: "OTHER-1" });
  insert(db, "leads", { company_id: other, lead_number: "L-other", title: "Other lead" });
  const before = reset.previewReset(db, other).totalOperational;
  assert.ok(before >= 2);
  reset.executeReset(db, root, { userId: 1, companyId: 1, confirmText: "RESET" });
  assert.equal(reset.previewReset(db, other).totalOperational, before);
});

test("every table with a company column is either cleared or kept on purpose", () => {
  const db = m.initializeDatabase(freshRoot());
  handles.push(db);
  assert.deepEqual(reset.unclassifiedCompanyTables(db), []);
});

test("the preview in the All Companies view says it covers every company", () => {
  const db = m.initializeDatabase(freshRoot());
  handles.push(db);
  const preview = reset.previewReset(db);
  assert.equal(preview.scope, "all");
  assert.equal(preview.company, null);
});

test("update versions compare in semantic-version order", () => {
  const c = (a, b) => Math.sign(updates.compareUpdateVersions(a, b));
  assert.equal(c("0.2.0-internal-test", "0.1.0-internal-test"), 1);
  assert.equal(c("0.1.0-internal-test", "0.1.0-internal-test"), 0);
  assert.equal(c("0.2.0", "0.2.0-beta"), 1, "a release is newer than its pre-release");
  assert.equal(c("0.2.0-rc.1", "0.2.0"), -1);
  assert.equal(c("1.2.10", "1.2.9"), 1);
  assert.equal(c("0.1.0-rc.2", "0.1.0-rc.10"), -1);
  assert.equal(c("v1.0.0", "1.0.0"), 0);
});

test("portable EXEs are not treated as updates", () => {
  assert.equal(updates.isPortableInstaller("GII-GeM-ERP-Portable-0.2.0-x64.exe"), true);
  assert.equal(updates.isPortableInstaller("GII-GeM-ERP-Setup-0.2.0-x64.exe"), false);
});

test("the package version was raised past the version every earlier build carried", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
  assert.equal(Math.sign(updates.compareUpdateVersions(pkg.version, "0.1.0-internal-test")), 1);
});
