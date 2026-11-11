// Posts sales invoices through the app's real billing and posting code and proves the
// books stay exact to the paisa. Used by scripts/audit/paise-proof.test.mjs (a sample,
// on every test run) and scripts/audit/paise-proof-full.mjs (all 2 lakh amounts).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// The amounts from the 29 Oct check: ₹1,000.01 to ₹3,000.00 in steps of one paisa.
export const FIRST_MINOR = 100001;
export const LAST_MINOR = 300000;
export const AMOUNT_COUNT = LAST_MINOR - FIRST_MINOR + 1;

// GST worked out with whole numbers only, half a paisa rounding up: the independent
// answer every posted voucher is checked against.
export function expectedMinor(taxableMinor, rate) {
  const gst = Math.floor((taxableMinor * rate + 50) / 100);
  return { taxable: taxableMinor, gst, gross: taxableMinor + gst };
}

export async function openProofDatabase() {
  process.env.GII_GEM_ERP_NO_DEMO = "1";
  const m = await import(pathToFileURL(path.join(REPO, "src/main/database/init.js")).href);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-paise-proof-"));
  const db = m.initializeDatabase(root);
  const dept = db.prepare("SELECT id FROM government_departments ORDER BY id LIMIT 1").get()?.id
    || db.prepare("INSERT INTO government_departments (department_name, status) VALUES ('Proof Department', 'active')").run().lastInsertRowid;
  const emp = db.prepare("SELECT id FROM employees ORDER BY id LIMIT 1").get()?.id
    || db.prepare("INSERT INTO employees (employee_name, status) VALUES ('Proof Employee', 'active')").run().lastInsertRowid;
  const order = m.createRecord(db, "supply_orders", {
    company_id: 1, order_number: "PAISE-PROOF", order_date: "2026-06-01", order_status: "Received",
    institution_name: "Proof", department_id: dept, employee_id: emp, location: "Proof", supply_due_date: "2026-06-30"
  }).id;
  const close = () => {
    try { if (db.open) db.close(); } catch { /* closed */ }
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  };
  return { m, db, order, close };
}

// invoices: [{ items: [{ taxableMinor, rate, gstType? }] }]. Each is saved and posted
// through saveBillingVoucher and postSalesVoucher, exactly as the Billing screen does.
export function postInvoices({ m, db, order }, invoices) {
  const problems = [];
  let posted = 0;
  for (const invoice of invoices) {
    const items = invoice.items.map(({ taxableMinor, rate, gstType = "CGST/SGST" }) => ({ quantity: 1, billing_rate: taxableMinor / 100, gst_rate: rate, gst_type: gstType }));
    const expected = invoice.items.reduce((sum, item) => {
      const one = expectedMinor(item.taxableMinor, item.rate);
      return { taxable: sum.taxable + one.taxable, gst: sum.gst + one.gst, gross: sum.gross + one.gross };
    }, { taxable: 0, gst: 0, gross: 0 });
    const label = invoice.items.map((item) => `${(item.taxableMinor / 100).toFixed(2)}@${item.rate}%`).join(" + ");
    try {
      const saved = m.saveBillingVoucher(db, { header: { order_id: order, company_id: 1, invoice_date: "2026-07-03", gst_type: invoice.items[0].gstType || "CGST/SGST" }, items });
      const voucher = m.postSalesVoucher(db, saved.id);
      posted += 1;
      const lines = db.prepare(`
        SELECT a.account_name, vl.debit_minor, vl.credit_minor FROM voucher_lines vl JOIN accounts a ON a.id = vl.account_id WHERE vl.voucher_id = ?
      `).all(voucher.id);
      const by = (name, side) => lines.filter((line) => line.account_name === name).reduce((sum, line) => sum + Number(line[side]), 0);
      const got = { taxable: by("Sales", "credit_minor"), gst: by("Output GST", "credit_minor"), gross: by("Trade Receivables", "debit_minor") };
      if (got.taxable !== expected.taxable || got.gst !== expected.gst || got.gross !== expected.gross) {
        problems.push(`${label}: posted ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
      }
      const split = db.prepare("SELECT cgst, sgst, igst, gst_amount FROM invoice_items WHERE billing_id = ?").all(saved.id);
      for (const row of split) {
        const parts = Math.round(row.cgst * 100) + Math.round(row.sgst * 100) + Math.round(row.igst * 100);
        if (parts !== Math.round(row.gst_amount * 100)) problems.push(`${label}: CGST + SGST + IGST ${parts} paise differs from GST ${row.gst_amount}`);
      }
    } catch (error) {
      problems.push(`${label}: ${error.message}`);
    }
  }
  return { posted, problems };
}

// The books-wide checks: every voucher balances on its lines and its ledger entries,
// the trial balance difference is exactly zero, and every stored rupee amount is
// exactly its paise value divided by 100.
export function checkBooks({ m, db }) {
  const problems = [];
  const unbalancedLines = db.prepare(`
    SELECT v.voucher_number FROM vouchers v JOIN voucher_lines vl ON vl.voucher_id = v.id
    WHERE v.status IN ('Posted', 'Reversed') GROUP BY v.id HAVING SUM(vl.debit_minor) <> SUM(vl.credit_minor)
  `).all();
  if (unbalancedLines.length) problems.push(`${unbalancedLines.length} voucher(s) whose lines do not balance, e.g. ${unbalancedLines[0].voucher_number}`);
  const unbalancedLedger = db.prepare(`
    SELECT v.voucher_number FROM vouchers v JOIN ledger_entries le ON le.voucher_id = v.id
    WHERE v.status IN ('Posted', 'Reversed') GROUP BY v.id HAVING SUM(le.debit_minor) <> SUM(le.credit_minor)
  `).all();
  if (unbalancedLedger.length) problems.push(`${unbalancedLedger.length} voucher(s) whose ledger entries do not balance, e.g. ${unbalancedLedger[0].voucher_number}`);

  const rows = m.trialBalance(db, 1, "2026-04-01", "2027-03-31");
  const debitMinor = rows.reduce((sum, row) => sum + Number(row.debit_minor_total || 0), 0);
  const creditMinor = rows.reduce((sum, row) => sum + Number(row.credit_minor_total || 0), 0);
  if (debitMinor !== creditMinor) problems.push(`trial balance differs by ${(debitMinor - creditMinor) / 100}`);
  const report = m.moneyIntegrityReport(db, 1);
  if (!report.ok) problems.push(`money integrity check is not clean: ${JSON.stringify({ tb: report.trial_balance, unbalanced: report.unbalanced_vouchers.length, mismatches: report.line_ledger_mismatches.length, mirrors: report.mirror_mismatches, guards: report.missing_guards })}`);

  const mirrors = [
    ["voucher_lines", "debit"], ["voucher_lines", "credit"],
    ["ledger_entries", "debit"], ["ledger_entries", "credit"], ["ledger_entries", "running_balance"]
  ];
  for (const [table, column] of mirrors) {
    const bad = db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE ${column} <> ${column}_minor / 100.0`).get().c;
    if (bad) problems.push(`${bad} ${table}.${column} value(s) are not exactly their paise / 100`);
  }
  const vouchers = db.prepare("SELECT COUNT(*) c FROM vouchers WHERE status IN ('Posted', 'Reversed')").get().c;
  return { problems, vouchers, trialBalance: { debit: debitMinor / 100, credit: creditMinor / 100, difference: (debitMinor - creditMinor) / 100 } };
}
