// The database's own protection for the books (src/main/database/ledgerGuards.js) and
// the money integrity check with its labelled rounding adjustment.
// Each test builds its own throwaway database in the OS temp folder.
// Run from the repo root:  node --test scripts/audit/ledger-guards.test.mjs
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const m = await import(pathToFileURL(path.join(REPO, "src/main/database/init.js")).href);
const guards = await import(pathToFileURL(path.join(REPO, "src/main/database/ledgerGuards.js")).href);
const { bookIntegrityChecks } = await import(pathToFileURL(path.join(REPO, "src/main/services/errorConsoleService.js")).href);

const handles = [];
const roots = [];
afterEach(() => {
  while (handles.length) { const db = handles.pop(); try { if (db.open) db.close(); } catch { /* closed */ } }
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
function freshRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-guards-"));
  roots.push(root);
  return root;
}
function open(root) {
  const db = m.initializeDatabase(root);
  handles.push(db);
  return db;
}
function fresh() {
  return open(freshRoot());
}

const DATE = "2026-07-01";
const account = (db, name) => db.prepare("SELECT id FROM accounts WHERE company_id = 1 AND account_name = ?").get(name).id;
const GUARD = /Ledger guard:/;

function postBalanced(db, amount = 100) {
  return m.createBalancedVoucher(db, {
    company_id: 1, voucher_date: DATE, voucher_type: "Journal", narration: "guard test", source_module: "manual", source_id: null,
    lines: [{ account_id: account(db, "Cash"), debit: amount, credit: 0 }, { account_id: account(db, "Capital"), debit: 0, credit: amount }]
  });
}

function insertDraft(db, number) {
  return db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status) VALUES (1, ?, ?, 'Journal', 'Draft')").run(number, DATE).lastInsertRowid;
}

function addLine(db, voucherId, accountName, debitMinor, creditMinor, { ledger = true, ledgerDebitMinor = debitMinor, ledgerCreditMinor = creditMinor } = {}) {
  const accountIdValue = account(db, accountName);
  const line = db.prepare("INSERT INTO voucher_lines (voucher_id, account_id, debit, credit, debit_minor, credit_minor) VALUES (?, ?, ?, ?, ?, ?)")
    .run(voucherId, accountIdValue, debitMinor / 100, creditMinor / 100, debitMinor, creditMinor).lastInsertRowid;
  if (ledger) {
    db.prepare(`INSERT INTO ledger_entries (company_id, voucher_id, voucher_line_id, account_id, entry_date, debit, credit, running_balance, debit_minor, credit_minor, running_balance_minor)
      VALUES (1, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0)`).run(voucherId, line, accountIdValue, DATE, ledgerDebitMinor / 100, ledgerCreditMinor / 100, ledgerDebitMinor, ledgerCreditMinor);
  }
  return line;
}

// An older, unbalanced voucher as books written before amounts were kept exact may
// hold. It can only be written inside a maintenance window, as an older app did freely.
function legacyUnbalanced(db, number, debitMinor, creditMinor, date = DATE) {
  return db.transaction(() => guards.withLedgerMaintenance(db, 1, "test: older books", () => {
    const year = db.prepare("SELECT id FROM financial_years WHERE company_id = 1 AND start_date <= ? AND end_date >= ?").get(date, date);
    const id = db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status, financial_year_id, source_module) VALUES (1, ?, ?, 'Sales', 'Posted', ?, 'legacy')")
      .run(number, date, year.id).lastInsertRowid;
    addLine(db, id, "Trade Receivables", debitMinor, 0);
    addLine(db, id, "Sales", 0, creditMinor);
    return id;
  }))();
}

test("every guard is installed and the Rounding Off account exists", () => {
  const db = fresh();
  assert.deepEqual(guards.missingLedgerGuards(db), []);
  assert.ok(db.prepare("SELECT 1 FROM accounts WHERE company_id = 1 AND account_code = '5180' AND account_name = 'Rounding Off'").get());
  assert.equal(db.prepare("SELECT COUNT(*) c FROM ledger_maintenance").get().c, 0);
});

test("a voucher cannot be inserted already posted", () => {
  const db = fresh();
  assert.throws(() => db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status) VALUES (1, 'G-1', ?, 'Journal', 'Posted')").run(DATE), GUARD);
  assert.throws(() => db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status) VALUES (1, 'G-2', ?, 'Journal', 'Reversed')").run(DATE), GUARD);
});

test("posting is refused for a voucher with no lines, unbalanced lines, or ledger entries that disagree", () => {
  const db = fresh();
  const post = (id) => db.prepare("UPDATE vouchers SET status = 'Posted' WHERE id = ?").run(id);

  const empty = insertDraft(db, "G-EMPTY");
  assert.throws(() => post(empty), /at least one line/);

  const unbalanced = insertDraft(db, "G-UNBAL");
  addLine(db, unbalanced, "Cash", 10001, 0);
  addLine(db, unbalanced, "Capital", 0, 10000);
  assert.throws(() => post(unbalanced), /do not balance to the paisa/);

  const missingLedger = insertDraft(db, "G-NOLEDGER");
  addLine(db, missingLedger, "Cash", 10000, 0);
  addLine(db, missingLedger, "Capital", 0, 10000, { ledger: false });
  assert.throws(() => post(missingLedger), /do not agree/);

  const shifted = insertDraft(db, "G-SHIFT");
  addLine(db, shifted, "Cash", 10000, 0, { ledgerDebitMinor: 20000 });
  addLine(db, shifted, "Capital", 0, 10000, { ledgerCreditMinor: 20000 });
  assert.throws(() => post(shifted), /do not agree/, "balanced ledger entries with different amounts from the lines are refused");

  const good = insertDraft(db, "G-GOOD");
  addLine(db, good, "Cash", 10000, 0);
  addLine(db, good, "Capital", 0, 10000);
  assert.doesNotThrow(() => post(good));
});

test("the app's own posting still works and balances", () => {
  const db = fresh();
  const v = postBalanced(db, 1181.48);
  assert.equal(v.status, "Posted");
  const sums = db.prepare("SELECT SUM(debit_minor) d, SUM(credit_minor) c FROM ledger_entries WHERE voucher_id = ?").get(v.id);
  assert.deepEqual(sums, { d: 118148, c: 118148 });
});

test("a posted voucher, its lines and its ledger entries cannot be edited or deleted", () => {
  const db = fresh();
  const v = postBalanced(db);
  const line = db.prepare("SELECT id FROM voucher_lines WHERE voucher_id = ? ORDER BY id LIMIT 1").get(v.id).id;
  const entry = db.prepare("SELECT id FROM ledger_entries WHERE voucher_id = ? ORDER BY id LIMIT 1").get(v.id).id;

  assert.throws(() => db.prepare("UPDATE vouchers SET narration = 'changed' WHERE id = ?").run(v.id), /cannot be edited/);
  assert.throws(() => db.prepare("UPDATE vouchers SET voucher_date = '2026-07-02' WHERE id = ?").run(v.id), /cannot be edited/);
  assert.throws(() => db.prepare("UPDATE vouchers SET is_deleted = 1 WHERE id = ?").run(v.id), /cannot be edited/);
  assert.throws(() => db.prepare("UPDATE vouchers SET status = 'Draft' WHERE id = ?").run(v.id), /cannot be edited/);
  assert.throws(() => db.prepare("DELETE FROM vouchers WHERE id = ?").run(v.id), /cannot be deleted/);

  assert.throws(() => db.prepare("UPDATE voucher_lines SET debit = 999, debit_minor = 99900 WHERE id = ?").run(line), /cannot be changed/);
  assert.throws(() => db.prepare("DELETE FROM voucher_lines WHERE id = ?").run(line), /cannot be deleted/);
  assert.throws(() => db.prepare("INSERT INTO voucher_lines (voucher_id, account_id, debit, credit, debit_minor, credit_minor) VALUES (?, ?, 1, 0, 100, 0)").run(v.id, account(db, "Cash")), /cannot be added/);

  assert.throws(() => db.prepare("UPDATE ledger_entries SET debit = 999, debit_minor = 99900 WHERE id = ?").run(entry), /cannot be changed/);
  assert.throws(() => db.prepare("DELETE FROM ledger_entries WHERE id = ?").run(entry), /cannot be deleted/);
  assert.throws(() => db.prepare(`INSERT INTO ledger_entries (company_id, voucher_id, account_id, entry_date, debit, credit, debit_minor, credit_minor)
    VALUES (1, ?, ?, ?, 1, 0, 100, 0)`).run(v.id, account(db, "Cash"), DATE), /not yet posted/);
});

test("ledger entries must belong to an existing voucher of the same company", () => {
  const db = fresh();
  const other = db.prepare("INSERT INTO companies (company_name) VALUES ('Guard Other Co')").run().lastInsertRowid;
  const draft = insertDraft(db, "G-COMPANY");
  const insert = (companyId, voucherId) => db.prepare(`INSERT INTO ledger_entries (company_id, voucher_id, account_id, entry_date, debit, credit, debit_minor, credit_minor)
    VALUES (?, ?, ?, ?, 1, 0, 100, 0)`).run(companyId, voucherId, account(db, "Cash"), DATE);
  assert.throws(() => insert(other, draft), GUARD);
  assert.throws(() => insert(1, 999999), GUARD);
  assert.doesNotThrow(() => addLine(db, draft, "Cash", 100, 0));
});

test("reversal still works and a reversed voucher cannot be brought back", () => {
  const db = fresh();
  const v = postBalanced(db);
  const reversal = m.reverseVoucher(db, v.id, "guard test");
  assert.equal(reversal.status, "Posted");
  const original = db.prepare("SELECT status, reversal_reason FROM vouchers WHERE id = ?").get(v.id);
  assert.deepEqual(original, { status: "Reversed", reversal_reason: "guard test" });
  assert.throws(() => db.prepare("UPDATE vouchers SET status = 'Posted' WHERE id = ?").run(v.id), /cannot be edited/);
  assert.throws(() => db.prepare("DELETE FROM vouchers WHERE id = ?").run(v.id), /cannot be deleted/);
});

test("a guard dropped outside the app is put back on the next start, and a stray maintenance row is cleared", () => {
  const root = freshRoot();
  let db = open(root);
  db.exec("DROP TRIGGER trg_ledger_guard_entry_update; DROP TRIGGER trg_ledger_guard_voucher_post");
  db.prepare("INSERT INTO ledger_maintenance (company_id, reason) VALUES (0, 'left behind')").run();
  assert.deepEqual(guards.missingLedgerGuards(db), ["trg_ledger_guard_voucher_post", "trg_ledger_guard_entry_update"]);
  db.close();
  db = open(root);
  assert.deepEqual(guards.missingLedgerGuards(db), []);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM ledger_maintenance").get().c, 0);
  const v = postBalanced(db);
  const entry = db.prepare("SELECT id FROM ledger_entries WHERE voucher_id = ? LIMIT 1").get(v.id).id;
  assert.throws(() => db.prepare("UPDATE ledger_entries SET debit = 1 WHERE id = ?").run(entry), GUARD);
});

test("a maintenance window needs a transaction and closes even when its work fails", () => {
  const db = fresh();
  assert.throws(() => guards.withLedgerMaintenance(db, 1, "no transaction", () => {}), /inside a database transaction/);
  assert.throws(() => db.transaction(() => guards.withLedgerMaintenance(db, 1, "fails", () => { throw new Error("boom"); }))(), /boom/);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM ledger_maintenance").get().c, 0);
  const v = postBalanced(db);
  assert.throws(() => db.prepare("DELETE FROM vouchers WHERE id = ?").run(v.id), GUARD);
});

test("a maintenance window for one company leaves another company's books guarded", () => {
  const db = fresh();
  const v = postBalanced(db);
  assert.throws(() => db.transaction(() => guards.withLedgerMaintenance(db, 2, "other company", () => {
    db.prepare("DELETE FROM ledger_entries WHERE voucher_id = ?").run(v.id);
  }))(), GUARD);
});

test("operational reset still clears a company's posted books", async () => {
  const { executeReset } = await import(pathToFileURL(path.join(REPO, "src/main/services/operationalResetService.js")).href);
  const root = freshRoot();
  const db = open(root);
  postBalanced(db);
  const result = executeReset(db, root, { companyId: 1, confirmText: "RESET" });
  assert.ok(result);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM vouchers WHERE company_id = 1").get().c, 0);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM ledger_entries WHERE company_id = 1").get().c, 0);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM ledger_maintenance").get().c, 0);
  assert.deepEqual(guards.missingLedgerGuards(db), []);
});

test("an older voucher off by paise is reported and corrected by a labelled rounding adjustment", () => {
  const db = fresh();
  const before = m.moneyIntegrityReport(db, 1);
  assert.equal(before.ok, true, JSON.stringify(before, null, 2));
  const id = legacyUnbalanced(db, "OLD-1", 118148, 118147);
  const originalBefore = db.prepare("SELECT * FROM vouchers WHERE id = ?").get(id);

  const report = m.moneyIntegrityReport(db, 1);
  assert.equal(report.ok, false);
  assert.equal(report.trial_balance.difference, 0.01);
  assert.equal(report.unbalanced_vouchers.length, 1);
  assert.deepEqual(
    (({ voucher_number, difference, adjustable }) => ({ voucher_number, difference, adjustable }))(report.unbalanced_vouchers[0]),
    { voucher_number: "OLD-1", difference: 0.01, adjustable: true }
  );
  assert.equal(bookIntegrityChecks(db, 1).find((c) => c.id === "voucher_balance").status, "fail");

  const adjustment = m.postRoundingAdjustment(db, { company_id: 1, voucher_id: id });
  assert.equal(adjustment.status, "Posted");
  assert.equal(adjustment.voucher_type, "Journal");
  assert.equal(adjustment.source_module, "rounding_adjustment");
  assert.equal(adjustment.source_id, id);
  assert.equal(adjustment.voucher_date, DATE);
  assert.match(adjustment.voucher_number, /^RNDADJ-/);
  assert.match(adjustment.narration, /Rounding adjustment for OLD-1/);
  const line = db.prepare("SELECT a.account_name, vl.debit_minor, vl.credit_minor FROM voucher_lines vl JOIN accounts a ON a.id = vl.account_id WHERE vl.voucher_id = ?").all(adjustment.id);
  assert.deepEqual(line, [{ account_name: "Rounding Off", debit_minor: 0, credit_minor: 1 }]);
  assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'rounding adjustment posted' AND record_id = ?").get(adjustment.id));

  assert.deepEqual(db.prepare("SELECT * FROM vouchers WHERE id = ?").get(id), originalBefore, "the older voucher itself is never changed");
  const after = m.moneyIntegrityReport(db, 1);
  assert.equal(after.trial_balance.difference, 0);
  assert.equal(after.ok, true, JSON.stringify(after, null, 2));
  assert.equal(after.unbalanced_vouchers[0].adjusted_by, adjustment.voucher_number);
  assert.equal(bookIntegrityChecks(db, 1).find((c) => c.id === "voucher_balance").status, "pass");

  assert.throws(() => m.postRoundingAdjustment(db, { company_id: 1, voucher_id: id }), /cannot take a rounding adjustment. Already corrected/);
  assert.throws(() => m.reverseVoucher(db, adjustment.id, "undo"), /rounding adjustment and cannot be reversed/);
});

test("the database refuses a rounding adjustment that is not an exact, single correction of at most one rupee", () => {
  const db = fresh();
  const small = legacyUnbalanced(db, "OLD-SMALL", 10003, 10000);
  const large = legacyUnbalanced(db, "OLD-LARGE", 10200, 10000);
  const balanced = postBalanced(db);
  const fakeAdjustment = (sourceId, number, creditMinor) => {
    const id = db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status, source_module, source_id) VALUES (1, ?, ?, 'Journal', 'Draft', 'rounding_adjustment', ?)")
      .run(number, DATE, sourceId).lastInsertRowid;
    addLine(db, id, "Rounding Off", 0, creditMinor);
    return () => db.prepare("UPDATE vouchers SET status = 'Posted' WHERE id = ?").run(id);
  };

  assert.throws(fakeAdjustment(small, "ADJ-WRONG", 2), /do not balance/, "it must cancel the difference exactly");
  assert.throws(fakeAdjustment(large, "ADJ-LARGE", 200), /do not balance/, "more than one rupee is not rounding");
  assert.throws(fakeAdjustment(balanced.id, "ADJ-BAL", 1), /do not balance/, "a balanced voucher needs no adjustment");
  assert.doesNotThrow(fakeAdjustment(small, "ADJ-OK", 3));
  assert.throws(fakeAdjustment(small, "ADJ-TWICE", 3), /do not balance/, "only one adjustment per voucher");

  const report = m.moneyIntegrityReport(db, 1);
  const largeRow = report.unbalanced_vouchers.find((row) => row.voucher_number === "OLD-LARGE");
  assert.equal(largeRow.adjustable, false);
  assert.match(largeRow.reason, /more than one rupee/);
  assert.throws(() => m.postRoundingAdjustment(db, { company_id: 1, voucher_id: large }), /more than one rupee/);
  assert.throws(() => m.postRoundingAdjustment(db, { company_id: 1, voucher_id: balanced.id }), /balances to the paisa/);
});

test("a rounding adjustment is refused for another company's voucher or a closed year", () => {
  const db = fresh();
  const id = legacyUnbalanced(db, "OLD-CLOSED", 10001, 10000);
  assert.throws(() => m.postRoundingAdjustment(db, { company_id: 2, voucher_id: id }), /different company/);
  db.prepare("UPDATE financial_years SET status = 'Closed' WHERE company_id = 1 AND start_date <= ? AND end_date >= ?").run(DATE, DATE);
  const row = m.moneyIntegrityReport(db, 1).unbalanced_vouchers[0];
  assert.equal(row.adjustable, false);
  assert.match(row.reason, /closed/);
  assert.throws(() => m.postRoundingAdjustment(db, { company_id: 1, voucher_id: id }), /closed/);
});

test("an older amount saved with a fraction of a paisa is listed apart and does not fail the check", () => {
  const db = fresh();
  const v = postBalanced(db, 1181.48);
  db.transaction(() => guards.withLedgerMaintenance(db, 1, "test: older sub-paisa row", () => {
    db.prepare("UPDATE voucher_lines SET debit = 1181.474 WHERE voucher_id = ? AND debit_minor > 0").run(v.id);
  }))();
  const report = m.moneyIntegrityReport(db, 1);
  assert.equal(report.ok, true, JSON.stringify(report.mirror_mismatches));
  assert.deepEqual(report.sub_paisa_legacy.map((row) => [row.table, row.column, row.count]), [["voucher_lines", "debit", 1]]);
  db.transaction(() => guards.withLedgerMaintenance(db, 1, "test: drifted row", () => {
    db.prepare("UPDATE voucher_lines SET debit = 1181.50 WHERE voucher_id = ? AND debit_minor > 0").run(v.id);
  }))();
  const drifted = m.moneyIntegrityReport(db, 1);
  assert.equal(drifted.ok, false);
  assert.deepEqual(drifted.mirror_mismatches.map((row) => [row.table, row.column, row.count]), [["voucher_lines", "debit", 1]]);

  db.transaction(() => guards.withLedgerMaintenance(db, 1, "test: far-off fractional row", () => {
    db.prepare("UPDATE voucher_lines SET debit = 1000.001 WHERE voucher_id = ? AND debit_minor > 0").run(v.id);
  }))();
  const farOff = m.moneyIntegrityReport(db, 1);
  assert.equal(farOff.ok, false, "a fraction of a paisa does not hide a large gap");
  assert.deepEqual(farOff.sub_paisa_legacy, []);
});

test("every vouchers column is either fixed once posted or listed as editable", () => {
  const db = fresh();
  const columns = db.prepare("SELECT name FROM pragma_table_info('vouchers')").all().map((row) => row.name).sort();
  const classified = [...guards.POSTED_VOUCHER_FIXED_COLUMNS, ...guards.POSTED_VOUCHER_EDITABLE_COLUMNS].sort();
  assert.deepEqual(columns, classified, "add the new column to POSTED_VOUCHER_FIXED_COLUMNS (and the posted-update trigger) or to POSTED_VOUCHER_EDITABLE_COLUMNS");
  const v = postBalanced(db);
  for (const column of guards.POSTED_VOUCHER_FIXED_COLUMNS) {
    const value = column === "is_deleted" ? 1 : column.endsWith("_id") || column === "id" ? 987654 : "changed";
    assert.throws(() => db.prepare(`UPDATE vouchers SET ${column} = ? WHERE id = ?`).run(value, v.id), GUARD, column);
  }
});

test("a guard changed outside the app is reported and replaced on the next start", () => {
  const root = freshRoot();
  let db = open(root);
  db.exec("DROP TRIGGER trg_ledger_guard_entry_delete; CREATE TRIGGER trg_ledger_guard_entry_delete BEFORE DELETE ON ledger_entries WHEN 0 BEGIN SELECT 1; END");
  assert.deepEqual(guards.missingLedgerGuards(db), ["trg_ledger_guard_entry_delete"]);
  assert.equal(m.moneyIntegrityReport(db, 1).ok, false);
  db.close();
  db = open(root);
  assert.deepEqual(guards.missingLedgerGuards(db), []);
  const v = postBalanced(db);
  assert.throws(() => db.prepare("DELETE FROM ledger_entries WHERE voucher_id = ?").run(v.id), GUARD);
});

test("a draft cannot be marked reversed without the posting checks, and rupee and paise amounts must agree", () => {
  const db = fresh();
  const unbalanced = insertDraft(db, "G-DRAFT-REV");
  addLine(db, unbalanced, "Cash", 10001, 0);
  addLine(db, unbalanced, "Capital", 0, 10000);
  assert.throws(() => db.prepare("UPDATE vouchers SET status = 'Reversed' WHERE id = ?").run(unbalanced), /do not balance/);
  const legacyOnly = insertDraft(db, "G-REAL-ONLY");
  const cash = account(db, "Cash");
  const capital = account(db, "Capital");
  for (const [accountIdValue, debit, credit] of [[cash, 100, 0], [capital, 0, 100]]) {
    const line = db.prepare("INSERT INTO voucher_lines (voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?)").run(legacyOnly, accountIdValue, debit, credit).lastInsertRowid;
    db.prepare("INSERT INTO ledger_entries (company_id, voucher_id, voucher_line_id, account_id, entry_date, debit, credit) VALUES (1, ?, ?, ?, ?, ?, ?)").run(legacyOnly, line, accountIdValue, DATE, debit, credit);
  }
  assert.throws(() => db.prepare("UPDATE vouchers SET status = 'Posted' WHERE id = ?").run(legacyOnly), /rupee and paise amounts that differ/);
});

test("an older voucher off by more than a rupee can be reversed, and the pair nets to zero", () => {
  const db = fresh();
  const id = legacyUnbalanced(db, "OLD-BIG", 150000, 149500);
  assert.equal(m.moneyIntegrityReport(db, 1).unbalanced_vouchers[0].adjustable, false);
  const reversal = m.reverseVoucher(db, id, "wrong amounts");
  const sums = db.prepare("SELECT SUM(debit_minor) d, SUM(credit_minor) c FROM voucher_lines WHERE voucher_id = ?").get(reversal.id);
  assert.deepEqual(sums, { d: 149500, c: 150000 }, "the reversal mirrors the original exactly");
  const report = m.moneyIntegrityReport(db, 1);
  assert.equal(report.trial_balance.difference, 0);
  assert.equal(report.ok, true, JSON.stringify(report.unbalanced_vouchers));
  assert.equal(report.unbalanced_vouchers.length, 1, "the reversal is listed only as the original's correction");
  assert.equal(report.unbalanced_vouchers[0].reversed_by, reversal.voucher_number);
  assert.equal(bookIntegrityChecks(db, 1).find((c) => c.id === "voucher_balance").status, "pass");
});

test("reversing a voucher that took a rounding adjustment reverses the adjustment with it", () => {
  const db = fresh();
  const id = legacyUnbalanced(db, "OLD-ADJ", 10003, 10000);
  const adjustment = m.postRoundingAdjustment(db, { company_id: 1, voucher_id: id });
  const reversal = m.reverseVoucher(db, id, "re-enter");
  const sums = db.prepare("SELECT SUM(debit_minor) d, SUM(credit_minor) c FROM voucher_lines WHERE voucher_id = ?").get(reversal.id);
  assert.equal(sums.d, sums.c, "original and adjustment reversed together balance");
  assert.equal(db.prepare("SELECT status FROM vouchers WHERE id = ?").get(adjustment.id).status, "Reversed");
  const report = m.moneyIntegrityReport(db, 1);
  assert.equal(report.ok, true, JSON.stringify(report.unbalanced_vouchers));
  assert.equal(report.trial_balance.difference, 0);
  assert.equal(bookIntegrityChecks(db, 1).find((c) => c.id === "voucher_balance").status, "pass");
});

test("a reversal rebuilds amounts from the paise columns", () => {
  const db = fresh();
  const v = postBalanced(db, 1.01);
  db.transaction(() => guards.withLedgerMaintenance(db, 1, "test: older rupee mirror", () => {
    db.prepare("UPDATE voucher_lines SET debit = 1.005 WHERE voucher_id = ? AND debit_minor > 0").run(v.id);
    db.prepare("UPDATE voucher_lines SET credit = 1.005 WHERE voucher_id = ? AND credit_minor > 0").run(v.id);
  }))();
  const reversal = m.reverseVoucher(db, v.id, "paise source");
  const sums = db.prepare("SELECT SUM(debit_minor) d, SUM(credit_minor) c FROM voucher_lines WHERE voucher_id = ?").get(reversal.id);
  assert.deepEqual(sums, { d: 101, c: 101 });
});

test("a rounding adjustment is refused when the voucher's lines and ledger entries disagree", () => {
  const db = fresh();
  const id = db.transaction(() => guards.withLedgerMaintenance(db, 1, "test: disagreeing voucher", () => {
    const year = db.prepare("SELECT id FROM financial_years WHERE company_id = 1 AND start_date <= ? AND end_date >= ?").get(DATE, DATE);
    const voucher = db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status, financial_year_id) VALUES (1, 'OLD-SPLIT', ?, 'Sales', 'Posted', ?)").run(DATE, year.id).lastInsertRowid;
    addLine(db, voucher, "Trade Receivables", 10001, 0, { ledgerDebitMinor: 10000 });
    addLine(db, voucher, "Sales", 0, 10000);
    return voucher;
  }))();
  const row = m.moneyIntegrityReport(db, 1).unbalanced_vouchers.find((item) => item.id === id);
  assert.equal(row.adjustable, false);
  assert.match(row.reason, /ledger entries do not agree/);
  assert.throws(() => m.postRoundingAdjustment(db, { company_id: 1, voucher_id: id }), /ledger entries do not agree/);
});

test("the Rounding Off ledger never takes over a code or name the user already has", () => {
  const root = freshRoot();
  let db = open(root);
  const other = db.prepare("INSERT INTO companies (company_name) VALUES ('Code Taken Co')").run().lastInsertRowid;
  db.prepare("DELETE FROM accounts WHERE company_id = ? AND account_name = 'Rounding Off'").run(other);
  db.prepare("INSERT INTO accounts (company_id, account_code, account_name, account_type, normal_balance, status) VALUES (?, '5180', 'Packing Expense', 'Expense', 'Debit', 'active')").run(other);
  db.close();
  db = open(root);
  assert.equal(db.prepare("SELECT account_name FROM accounts WHERE company_id = ? AND account_code = '5180'").get(other).account_name, "Packing Expense");
  assert.equal(db.prepare("SELECT account_code FROM accounts WHERE company_id = ? AND account_name = 'Rounding Off'").get(other).account_code, "5181");
  assert.equal(db.prepare("SELECT COUNT(*) c FROM accounts WHERE company_id = 1 AND account_name = 'Rounding Off'").get().c, 1);
});

test("one older imbalance can be cancelled only once, by an adjustment or a reversal", () => {
  const db = fresh();
  // A hand-made correction voucher that cancels creditMinor paise of the original.
  const correction = (sourceId, number, sourceModule, creditMinor) => {
    const id = db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status, source_module, source_id) VALUES (1, ?, ?, 'Journal', 'Draft', ?, ?)")
      .run(number, DATE, sourceModule, sourceId).lastInsertRowid;
    if (sourceModule === "voucher_reversal") {
      // A one-sided reversal must mirror the original's lines exactly.
      db.prepare("SELECT a.account_name, l.debit_minor, l.credit_minor FROM voucher_lines l JOIN accounts a ON a.id = l.account_id WHERE l.voucher_id = ?").all(sourceId)
        .forEach((line) => addLine(db, id, line.account_name, line.credit_minor, line.debit_minor));
    } else {
      addLine(db, id, "Rounding Off", 0, creditMinor);
    }
    return () => db.prepare("UPDATE vouchers SET status = 'Posted' WHERE id = ?").run(id);
  };

  const twice = legacyUnbalanced(db, "OLD-REV", 10003, 10000);
  assert.doesNotThrow(correction(twice, "REV-1", "voucher_reversal", 3));
  assert.throws(correction(twice, "REV-2", "voucher_reversal", 3), /do not balance/, "a second mirror reversal");
  assert.throws(correction(twice, "ADJ-AFTER-REV", "rounding_adjustment", 3), /do not balance/, "an adjustment after a reversal");

  const adjusted = legacyUnbalanced(db, "OLD-ADJ", 10003, 10000);
  assert.doesNotThrow(correction(adjusted, "ADJ-1", "rounding_adjustment", 3));
  assert.throws(correction(adjusted, "REV-AFTER-ADJ", "voucher_reversal", 3), /do not balance/, "an unbalanced reversal after an adjustment");

  const reversed = legacyUnbalanced(db, "OLD-GONE", 10003, 10000);
  m.reverseVoucher(db, reversed, "wrong amounts");
  assert.throws(correction(reversed, "REV-AGAIN", "voucher_reversal", 3), /do not balance/, "the original is already reversed");
  assert.equal(m.moneyIntegrityReport(db, 1).trial_balance.difference, 0);
});

test("INSERT OR REPLACE cannot overwrite a posted voucher, line or ledger entry", () => {
  const db = fresh();
  const posted = postBalanced(db);
  const line = db.prepare("SELECT * FROM voucher_lines WHERE voucher_id = ? ORDER BY id LIMIT 1").get(posted.id);
  const entry = db.prepare("SELECT * FROM ledger_entries WHERE voucher_id = ? ORDER BY id LIMIT 1").get(posted.id);
  const draft = insertDraft(db, "DRAFT-R");

  assert.throws(() => db.prepare("INSERT OR REPLACE INTO vouchers (id, company_id, voucher_number, voucher_date, voucher_type, status, narration) VALUES (?, 1, ?, ?, 'Journal', 'Draft', 'replaced')")
    .run(posted.id, "OTHER-NUMBER", DATE), GUARD, "same id");
  assert.throws(() => db.prepare("INSERT OR REPLACE INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status, narration) VALUES (1, ?, ?, 'Journal', 'Draft', 'replaced')")
    .run(posted.voucher_number, DATE), GUARD, "same voucher number");
  assert.throws(() => db.prepare("INSERT OR REPLACE INTO voucher_lines (id, voucher_id, account_id, debit, credit, debit_minor, credit_minor) VALUES (?, ?, ?, 1, 0, 100, 0)")
    .run(line.id, draft, line.account_id), GUARD, "a posted line");
  assert.throws(() => db.prepare(`INSERT OR REPLACE INTO ledger_entries (id, company_id, voucher_id, voucher_line_id, account_id, entry_date, debit, credit, running_balance, debit_minor, credit_minor, running_balance_minor)
    VALUES (?, 1, ?, ?, ?, ?, 1, 0, 0, 100, 0, 0)`).run(entry.id, draft, entry.voucher_line_id, entry.account_id, DATE), GUARD, "a posted ledger entry");

  const after = db.prepare("SELECT status, narration FROM vouchers WHERE id = ?").get(posted.id);
  assert.equal(after.status, "Posted");
  assert.equal(db.prepare("SELECT COUNT(*) c FROM ledger_entries WHERE id = ?").get(entry.id).c, 1);
});

test("a rounding adjustment needs one selected company, so All Companies View stays read-only", () => {
  const db = fresh();
  const id = legacyUnbalanced(db, "OLD-NOCO", 10001, 10000);
  for (const company of [undefined, "", 0]) {
    assert.throws(() => m.postRoundingAdjustment(db, { company_id: company, voucher_id: id }), /Select the voucher's company/);
  }
  assert.ok(m.postRoundingAdjustment(db, { company_id: 1, voucher_id: id }).id);
});

test("UPDATE OR REPLACE cannot move a voucher or line onto a posted one", () => {
  const db = fresh();
  const posted = postBalanced(db);
  const postedLine = db.prepare("SELECT * FROM voucher_lines WHERE voucher_id = ? ORDER BY id LIMIT 1").get(posted.id);
  const draft = insertDraft(db, "DRAFT-U");
  const draftLine = addLine(db, draft, "Cash", 100, 0, { ledger: false });

  assert.throws(() => db.prepare("UPDATE OR REPLACE vouchers SET id = ? WHERE id = ?").run(posted.id, draft), GUARD, "onto a posted id");
  assert.throws(() => db.prepare("UPDATE OR REPLACE vouchers SET voucher_number = ? WHERE id = ?").run(posted.voucher_number, draft), GUARD, "onto a posted number");
  assert.throws(() => db.prepare("UPDATE OR REPLACE voucher_lines SET id = ? WHERE id = ?").run(postedLine.id, draftLine), GUARD, "a line onto a posted line's id");

  assert.equal(db.prepare("SELECT status FROM vouchers WHERE id = ?").get(posted.id).status, "Posted");
  assert.equal(db.prepare("SELECT voucher_id FROM voucher_lines WHERE id = ?").get(postedLine.id).voucher_id, posted.id);
  // Ordinary edits of a draft still work.
  assert.doesNotThrow(() => db.prepare("UPDATE vouchers SET voucher_number = 'DRAFT-U2' WHERE id = ?").run(draft));
});

test("a maintenance window for one company cannot move lines or entries into another company's books", () => {
  const db = fresh();
  const posted = postBalanced(db);
  const other = Number(db.prepare("INSERT INTO companies (company_name) VALUES ('Window Co')").run().lastInsertRowid);
  const otherDraft = db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status) VALUES (?, 'W-1', ?, 'Journal', 'Draft')").run(other, DATE).lastInsertRowid;
  const otherCash = db.prepare("INSERT INTO accounts (company_id, account_code, account_name, account_type, normal_balance, status) VALUES (?, '1001', 'Window Cash', 'Asset', 'Debit', 'active')").run(other).lastInsertRowid;
  const otherLine = db.prepare("INSERT INTO voucher_lines (voucher_id, account_id, debit, credit, debit_minor, credit_minor) VALUES (?, ?, 1, 0, 100, 0)")
    .run(otherDraft, otherCash).lastInsertRowid;
  const entry = db.prepare("SELECT id FROM ledger_entries WHERE voucher_id = ? LIMIT 1").get(posted.id);

  assert.throws(() => db.transaction(() => guards.withLedgerMaintenance(db, other, "test: other company", () => {
    db.prepare("UPDATE voucher_lines SET voucher_id = ? WHERE id = ?").run(posted.id, otherLine);
  }))(), GUARD, "a line moved onto company 1's posted voucher");
  assert.throws(() => db.transaction(() => guards.withLedgerMaintenance(db, 1, "test: company 1", () => {
    db.prepare("UPDATE ledger_entries SET company_id = ? WHERE id = ?").run(other, entry.id);
  }))(), GUARD, "an entry moved to a company whose books are not open");
  assert.throws(() => db.transaction(() => guards.withLedgerMaintenance(db, 0, "test: zero", () => null))(), /needs a company id/);
  assert.throws(() => db.transaction(() => guards.withLedgerMaintenance(db, undefined, "test: missing", () => null))(), /needs a company id/);
});

test("an unbalanced older voucher is reversed on its own date, and refused when that year is closed", () => {
  const db = fresh();
  const id = legacyUnbalanced(db, "OLD-DATED", 150000, 149500);
  const reversal = m.reverseVoucher(db, id, "wrong amounts");
  assert.equal(reversal.voucher_date, DATE, "the mirror stays in the original's year");

  const closed = legacyUnbalanced(db, "OLD-CLOSED", 150000, 149500);
  db.prepare("UPDATE financial_years SET status = 'Closed' WHERE company_id = 1 AND start_date <= ? AND end_date >= ?").run(DATE, DATE);
  assert.throws(() => m.reverseVoucher(db, closed, "too late"), /must be reversed on its own date/);
  assert.equal(db.prepare("SELECT status FROM vouchers WHERE id = ?").get(closed).status, "Posted");
});

test("the database refuses a correction dated in another financial year, and accepts it inside the year", () => {
  const db = fresh();
  const original = legacyUnbalanced(db, "OLD-YEAR", 10003, 10000);
  const adjustment = (number, date) => {
    const id = db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status, source_module, source_id) VALUES (1, ?, ?, 'Journal', 'Draft', 'rounding_adjustment', ?)")
      .run(number, date, original).lastInsertRowid;
    addLine(db, id, "Rounding Off", 0, 3);
    return () => db.prepare("UPDATE vouchers SET status = 'Posted' WHERE id = ?").run(id);
  };
  assert.throws(adjustment("ADJ-NEXT-YEAR", "2027-07-01"), /do not balance/);
  assert.doesNotThrow(adjustment("ADJ-SAME-YEAR", "2026-09-30"), "a later date in the same year is accepted");
});

test("a voucher holding a line of zero paise can still be reversed", () => {
  const db = fresh();
  const id = db.transaction(() => guards.withLedgerMaintenance(db, 1, "test: zero line", () => {
    const year = db.prepare("SELECT id FROM financial_years WHERE company_id = 1 AND start_date <= ? AND end_date >= ?").get(DATE, DATE);
    const voucher = db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status, financial_year_id) VALUES (1, 'OLD-ZERO', ?, 'Journal', 'Posted', ?)").run(DATE, year.id).lastInsertRowid;
    addLine(db, voucher, "Cash", 10000, 0);
    addLine(db, voucher, "Capital", 0, 10000);
    addLine(db, voucher, "Rounding Off", 0, 0);
    return voucher;
  }))();
  const reversal = m.reverseVoucher(db, id, "zero line");
  assert.equal(db.prepare("SELECT COUNT(*) c FROM voucher_lines WHERE voucher_id = ?").get(reversal.id).c, 2);
  assert.equal(m.moneyIntegrityReport(db, 1).trial_balance.difference, 0);
});

test("a stock receipt worth less than a paisa posts without a voucher", () => {
  const db = fresh();
  const wh = m.createRecord(db, "warehouses", { company_id: 1, warehouse_name: "Tiny WH", status: "active" }).id;
  const item = m.createRecord(db, "items", { item_name: "Tiny Widget", unit: "Nos", status: "active", gst_rate: 0, opening_stock: 0, opening_rate: 0, opening_value: 0, default_warehouse_id: wh }).id;
  const tiny = m.createRecord(db, "stock_inwards", { company_id: 1, item_id: item, warehouse_id: wh, inward_date: DATE, purchase_invoice_number: "TINY-1", quantity: 1, rate: 0.004, landed_cost: 0 });
  const posted = m.postStockInward(db, tiny.id);
  assert.equal(posted.posting_status, "Posted");
  assert.equal(posted.voucher_id, null);
  const small = m.createRecord(db, "stock_inwards", { company_id: 1, item_id: item, warehouse_id: wh, inward_date: DATE, purchase_invoice_number: "TINY-2", quantity: 3, rate: 0.335, landed_cost: 0 });
  const voucher = db.prepare("SELECT SUM(debit_minor) d, SUM(credit_minor) c FROM voucher_lines WHERE voucher_id = ?").get(m.postStockInward(db, small.id).voucher_id);
  assert.deepEqual(voucher, { d: 101, c: 101 }, "1.005 rounds half away from zero to 1.01");
});

test("start-up records a rise in unbalanced posted vouchers left by work done with the guards off", () => {
  const db = fresh();
  assert.equal(guards.ledgerDefectCount(db), 0);
  const before = guards.ledgerDefectCount(db);
  legacyUnbalanced(db, "OLD-STARTUP", 10001, 10000);
  assert.equal(guards.ledgerDefectCount(db), 1);
  m.recordStartupLedgerCheck(db, before);
  const row = db.prepare("SELECT new_value FROM audit_log WHERE action = 'ledger_startup_check_failed' ORDER BY id DESC LIMIT 1").get();
  assert.deepEqual(JSON.parse(row.new_value), { unbalanced_before: 0, unbalanced_after: 1 });
  m.recordStartupLedgerCheck(db, 1);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action = 'ledger_startup_check_failed'").get().c, 1, "no row when nothing grew");
});

test("only ledgerGuards.js writes the maintenance table", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(m?js|jsx)$/.test(entry.name) && !full.endsWith(path.join("database", "ledgerGuards.js"))
        && /(INSERT\s+INTO|DELETE\s+FROM|UPDATE)\s+ledger_maintenance/i.test(fs.readFileSync(full, "utf8"))) offenders.push(path.relative(REPO, full));
    }
  };
  walk(path.join(REPO, "src"));
  assert.deepEqual(offenders, []);
});

test("Health Center and Error Console agree on whether the vouchers balance", () => {
  const db = fresh();
  const agree = (expectOk) => {
    const report = m.moneyIntegrityReport(db, 1);
    const check = bookIntegrityChecks(db, 1).find((c) => c.id === "voucher_balance");
    assert.equal(report.unbalanced_vouchers.every((row) => row.settled || row.reversed_by || row.adjusted_by), expectOk);
    assert.equal(check.status === "pass", expectOk);
  };
  agree(true);
  const id = legacyUnbalanced(db, "OLD-AGREE", 10002, 10000);
  agree(false);
  m.postRoundingAdjustment(db, { company_id: 1, voucher_id: id });
  agree(true);
  const big = legacyUnbalanced(db, "OLD-AGREE-2", 150000, 149000);
  agree(false);
  m.reverseVoucher(db, big, "agree");
  agree(true);
});

test("a one-sided correction must be a Rounding Off line or an exact mirror of the original", () => {
  const db = fresh();
  const draftFor = (number, sourceModule, sourceId, lines) => {
    const id = db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status, source_module, source_id) VALUES (1, ?, ?, 'Journal', 'Draft', ?, ?)")
      .run(number, DATE, sourceModule, sourceId).lastInsertRowid;
    lines.forEach(([name, debit, credit]) => addLine(db, id, name, debit, credit));
    return () => db.prepare("UPDATE vouchers SET status = 'Posted' WHERE id = ?").run(id);
  };
  const small = legacyUnbalanced(db, "OLD-CASH", 10003, 10000);
  assert.throws(draftFor("ADJ-CASH", "rounding_adjustment", small, [["Cash", 0, 3]]), /do not balance/, "an adjustment to another account");
  assert.throws(draftFor("ADJ-TWO", "rounding_adjustment", small, [["Rounding Off", 0, 1], ["Rounding Off", 0, 2]]), /do not balance/, "an adjustment of two lines");
  const big = legacyUnbalanced(db, "OLD-CAP", 150000, 100000);
  assert.throws(draftFor("REV-CAP", "voucher_reversal", big, [["Capital", 0, 50000]]), /do not balance/, "a reversal that is not a mirror");
  assert.doesNotThrow(draftFor("REV-MIRROR", "voucher_reversal", big, [["Trade Receivables", 0, 150000], ["Sales", 100000, 0]]));
});

test("posting refuses ledger entries that differ from their lines or belong to another company", () => {
  const db = fresh();
  const draft = insertDraft(db, "DRAFT-MISMATCH");
  addLine(db, draft, "Cash", 100, 0, { ledger: false });
  addLine(db, draft, "Capital", 0, 100);
  const line = db.prepare("SELECT id FROM voucher_lines WHERE voucher_id = ? AND debit_minor = 100").get(draft).id;
  db.prepare(`INSERT INTO ledger_entries (company_id, voucher_id, voucher_line_id, account_id, entry_date, debit, credit, running_balance, debit_minor, credit_minor, running_balance_minor)
    VALUES (1, ?, ?, ?, ?, 1, 0, 0, 100, 0, 0)`).run(draft, line, account(db, "Sales"), DATE);
  assert.throws(() => db.prepare("UPDATE vouchers SET status = 'Posted' WHERE id = ?").run(draft), /does not match its voucher line/);

  const other = Number(db.prepare("INSERT INTO companies (company_name) VALUES ('Moved Co')").run().lastInsertRowid);
  const moved = insertDraft(db, "DRAFT-MOVED");
  addLine(db, moved, "Cash", 100, 0);
  addLine(db, moved, "Capital", 0, 100);
  db.prepare("UPDATE vouchers SET company_id = ? WHERE id = ?").run(other, moved);
  assert.throws(() => db.prepare("UPDATE vouchers SET status = 'Posted' WHERE id = ?").run(moved), /names another company/);
});

test("one company's maintenance window cannot touch another company's posted voucher or its entries", () => {
  const db = fresh();
  const posted = postBalanced(db);
  const other = Number(db.prepare("INSERT INTO companies (company_name) VALUES ('Other Window Co')").run().lastInsertRowid);
  const entry = db.prepare("SELECT * FROM ledger_entries WHERE voucher_id = ? LIMIT 1").get(posted.id);
  const otherDraft = db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status) VALUES (?, 'OW-1', ?, 'Journal', 'Draft')").run(other, DATE).lastInsertRowid;
  const inWindow = (company, fn) => db.transaction(() => guards.withLedgerMaintenance(db, company, "test", fn))();
  assert.throws(() => inWindow(other, () => db.prepare(`INSERT INTO ledger_entries (company_id, voucher_id, voucher_line_id, account_id, entry_date, debit, credit, running_balance, debit_minor, credit_minor, running_balance_minor)
    VALUES (?, ?, ?, ?, ?, 1, 0, 0, 100, 0, 0)`).run(other, posted.id, entry.voucher_line_id, entry.account_id, DATE)), GUARD, "an entry added to company 1's voucher");
  assert.throws(() => inWindow(1, () => db.prepare("UPDATE ledger_entries SET voucher_id = ? WHERE id = ?").run(otherDraft, entry.id)), GUARD, "an entry moved to another company's voucher");
  assert.throws(() => inWindow(1, () => db.prepare("UPDATE vouchers SET company_id = ? WHERE id = ?").run(other, posted.id)), GUARD, "a posted voucher moved to another company");
  assert.equal(db.prepare("SELECT company_id FROM vouchers WHERE id = ?").get(posted.id).company_id, 1);
});

test("a trigger on the accounting tables that the app did not create is reported and removed on the next start", () => {
  const root = freshRoot();
  let db = open(root);
  db.exec("CREATE TRIGGER planted_after_post AFTER UPDATE OF status ON vouchers BEGIN SELECT 1; END");
  const report = m.moneyIntegrityReport(db, 1);
  assert.deepEqual(report.unexpected_triggers, ["planted_after_post"]);
  assert.equal(report.ok, false);
  db.close();
  db = open(root);
  assert.deepEqual(guards.unexpectedLedgerTriggers(db), []);
  assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'ledger_unexpected_triggers_removed'").get());
  assert.equal(m.moneyIntegrityReport(db, 1).ok, true);
});

test("an unposted voucher left holding ledger entries is reported", () => {
  const db = fresh();
  const draft = insertDraft(db, "DRAFT-LEFT");
  addLine(db, draft, "Cash", 100, 0);
  const report = m.moneyIntegrityReport(db, 1);
  assert.equal(report.draft_entries.length, 1);
  assert.equal(report.draft_entries[0].voucher_number, "DRAFT-LEFT");
  assert.equal(report.ok, false);
});

test("the start-up ledger count needs no index and stays fast on a large book", () => {
  const db = fresh();
  const cash = account(db, "Cash");
  const capital = account(db, "Capital");
  db.transaction(() => {
    guards.dropLedgerGuards(db);
    db.exec("DROP INDEX IF EXISTS idx_voucher_lines_voucher; DROP INDEX IF EXISTS idx_ledger_entries_voucher; DROP INDEX IF EXISTS idx_ledger_entries_company_account");
    const voucher = db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status) VALUES (1, ?, ?, 'Journal', 'Posted')");
    const line = db.prepare("INSERT INTO voucher_lines (voucher_id, account_id, debit, credit, debit_minor, credit_minor) VALUES (?, ?, ?, ?, ?, ?)");
    const entry = db.prepare("INSERT INTO ledger_entries (company_id, voucher_id, voucher_line_id, account_id, entry_date, debit, credit, running_balance, debit_minor, credit_minor, running_balance_minor) VALUES (1, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0)");
    for (let i = 0; i < 20000; i++) {
      const id = voucher.run(`BULK-${i}`, DATE).lastInsertRowid;
      const credit = i === 7 ? 99 : 100;
      entry.run(id, line.run(id, cash, 1, 0, 100, 0).lastInsertRowid, cash, DATE, 1, 0, 100, 0);
      entry.run(id, line.run(id, capital, 0, credit / 100, 0, credit).lastInsertRowid, capital, DATE, 0, credit / 100, 0, credit);
    }
  })();
  const started = Date.now();
  assert.equal(guards.ledgerDefectCount(db), 1);
  assert.ok(Date.now() - started < 3000, `took ${Date.now() - started} ms`);
});

test("Health Center and Error Console also agree after reversing an adjusted voucher and on lines that disagree with the ledger", () => {
  const db = fresh();
  const voucherCheck = () => bookIntegrityChecks(db, 1).find((c) => c.id === "voucher_balance").status === "pass";
  const id = legacyUnbalanced(db, "OLD-ADJ-REV", 10002, 10000);
  m.postRoundingAdjustment(db, { company_id: 1, voucher_id: id });
  m.reverseVoucher(db, id, "re-enter");
  assert.equal(m.moneyIntegrityReport(db, 1).ok, true);
  assert.equal(voucherCheck(), true);
  db.transaction(() => guards.withLedgerMaintenance(db, 1, "test: split", () => {
    const year = db.prepare("SELECT id FROM financial_years WHERE company_id = 1 AND start_date <= ? AND end_date >= ?").get(DATE, DATE);
    const voucher = db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status, financial_year_id) VALUES (1, 'OLD-SPLIT-AGREE', ?, 'Sales', 'Posted', ?)").run(DATE, year.id).lastInsertRowid;
    addLine(db, voucher, "Trade Receivables", 10001, 0, { ledgerDebitMinor: 10000 });
    addLine(db, voucher, "Sales", 0, 10000);
  }))();
  assert.equal(m.moneyIntegrityReport(db, 1).ok, false);
  assert.equal(voucherCheck(), false);
});

test("posting refuses fractional paise and a line without exactly one ledger entry", () => {
  const db = fresh();
  const half = insertDraft(db, "DRAFT-HALF");
  addLine(db, half, "Cash", 0.5, 0);
  addLine(db, half, "Capital", 0, 0.5);
  assert.throws(() => db.prepare("UPDATE vouchers SET status = 'Posted' WHERE id = ?").run(half), /whole numbers/);

  const missing = insertDraft(db, "DRAFT-NO-ENTRY");
  addLine(db, missing, "Cash", 100, 0, { ledger: false });
  addLine(db, missing, "Capital", 0, 100);
  const capitalLine = db.prepare("SELECT id FROM voucher_lines WHERE voucher_id = ? AND credit_minor = 100").get(missing).id;
  // A second entry on the Capital line makes the totals match but leaves the Cash line without one.
  db.prepare(`INSERT INTO ledger_entries (company_id, voucher_id, voucher_line_id, account_id, entry_date, debit, credit, running_balance, debit_minor, credit_minor, running_balance_minor)
    VALUES (1, ?, ?, ?, ?, 1, 0, 0, 100, 0, 0)`).run(missing, capitalLine, account(db, "Capital"), DATE);
  assert.throws(() => db.prepare("UPDATE vouchers SET status = 'Posted' WHERE id = ?").run(missing), /does not match its voucher line/);
});

test("a correction is refused when lines and ledger differ in debit and credit totals with the same net difference", () => {
  const db = fresh();
  const id = db.transaction(() => guards.withLedgerMaintenance(db, 1, "test: doubled ledger", () => {
    const year = db.prepare("SELECT id FROM financial_years WHERE company_id = 1 AND start_date <= ? AND end_date >= ?").get(DATE, DATE);
    const voucher = db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status, financial_year_id) VALUES (1, 'OLD-DOUBLED', ?, 'Sales', 'Posted', ?)").run(DATE, year.id).lastInsertRowid;
    addLine(db, voucher, "Trade Receivables", 10001, 0, { ledgerDebitMinor: 20001 });
    addLine(db, voucher, "Sales", 0, 10000, { ledgerCreditMinor: 20000 });
    return voucher;
  }))();
  assert.throws(() => m.postRoundingAdjustment(db, { company_id: 1, voucher_id: id }), /ledger entries do not agree/);
  assert.ok(m.moneyIntegrityReport(db, 1).line_ledger_mismatches.some((row) => row.voucher_number === "OLD-DOUBLED"));
});

test("a stock receipt worth less than half a paisa adds no value to stock", () => {
  const db = fresh();
  const wh = m.createRecord(db, "warehouses", { company_id: 1, warehouse_name: "Zero WH", status: "active" }).id;
  const item = m.createRecord(db, "items", { item_name: "Zero Widget", unit: "Nos", status: "active", gst_rate: 0, opening_stock: 0, opening_rate: 0, opening_value: 0, default_warehouse_id: wh }).id;
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, item_id: item, warehouse_id: wh, inward_date: DATE, purchase_invoice_number: "Z-1", quantity: 1, rate: 100, landed_cost: 0 }).id);
  m.postStockInward(db, m.createRecord(db, "stock_inwards", { company_id: 1, item_id: item, warehouse_id: wh, inward_date: DATE, purchase_invoice_number: "Z-2", quantity: 1, rate: 0.004, landed_cost: 0 }).id);
  const balance = m.stockBalance(db, 1, item, wh);
  assert.equal(balance.quantity, 2);
  assert.equal(balance.value, 100, "the tiny receipt adds no value, not the average cost");
});

test("a planted trigger is found whatever table it is on or however the table is spelt", () => {
  const root = freshRoot();
  let db = open(root);
  db.exec("CREATE TRIGGER zz_case AFTER UPDATE OF status ON Vouchers BEGIN SELECT 1; END");
  db.exec("CREATE TRIGGER zz_foreign AFTER INSERT ON audit_log BEGIN UPDATE ledger_entries SET account_id = account_id WHERE 0; END");
  assert.deepEqual(guards.unexpectedLedgerTriggers(db).sort(), ["zz_case", "zz_foreign"]);
  assert.equal(m.moneyIntegrityReport(db, 1).ok, false);
  db.close();
  db = open(root);
  assert.deepEqual(guards.unexpectedLedgerTriggers(db), []);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'zz_%'").get().c, 0);
  assert.ok(db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_%mapping%'").get().c > 0, "the app's own other triggers stay");
});

test("a one-sided reversal must use each original line exactly once", () => {
  const db = fresh();
  const original = db.transaction(() => guards.withLedgerMaintenance(db, 1, "test: multi-line older voucher", () => {
    const year = db.prepare("SELECT id FROM financial_years WHERE company_id = 1 AND start_date <= ? AND end_date >= ?").get(DATE, DATE);
    const id = db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status, financial_year_id, source_module) VALUES (1, 'OLD-MULTI', ?, 'Journal', 'Posted', ?, 'legacy')").run(DATE, year.id).lastInsertRowid;
    addLine(db, id, "Cash", 10000, 0);
    addLine(db, id, "Capital", 0, 10000);
    addLine(db, id, "Purchase", 5000, 0);
    addLine(db, id, "Sales", 0, 5000);
    addLine(db, id, "Trade Receivables", 1, 0);
    return id;
  }))();
  const reversal = db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status, source_module, source_id) VALUES (1, 'REV-DUP', ?, 'Journal', 'Draft', 'voucher_reversal', ?)").run(DATE, original).lastInsertRowid;
  addLine(db, reversal, "Cash", 0, 10000);
  addLine(db, reversal, "Capital", 10000, 0);
  addLine(db, reversal, "Cash", 0, 10000);
  addLine(db, reversal, "Capital", 10000, 0);
  addLine(db, reversal, "Trade Receivables", 0, 1);
  assert.throws(() => db.prepare("UPDATE vouchers SET status = 'Posted' WHERE id = ?").run(reversal), /do not balance/);
  // Remove the refused draft (its ledger entries can only go inside a window).
  db.transaction(() => guards.withLedgerMaintenance(db, 1, "test: remove refused draft", () => {
    db.prepare("DELETE FROM ledger_entries WHERE voucher_id = ?").run(reversal);
    db.prepare("DELETE FROM voucher_lines WHERE voucher_id = ?").run(reversal);
    db.prepare("DELETE FROM vouchers WHERE id = ?").run(reversal);
  }))();
  assert.ok(m.reverseVoucher(db, original, "proper mirror").id, "the app's own mirror reversal still posts");
});

test("a rounding adjustment needs the active Rounding Off expense ledger, and windows keep accounts in their company", () => {
  const db = fresh();
  const small = legacyUnbalanced(db, "OLD-RO", 10003, 10000);
  const fakeRounding = db.prepare("INSERT INTO accounts (company_id, account_code, account_name, account_type, normal_balance, status, is_deleted) VALUES (1, '9990', 'Rounding Off', 'Asset', 'Debit', 'inactive', 1)").run().lastInsertRowid;
  const adj = db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status, source_module, source_id) VALUES (1, 'ADJ-FAKE', ?, 'Journal', 'Draft', 'rounding_adjustment', ?)").run(DATE, small).lastInsertRowid;
  const line = db.prepare("INSERT INTO voucher_lines (voucher_id, account_id, debit, credit, debit_minor, credit_minor) VALUES (?, ?, 0, 0.03, 0, 3)").run(adj, fakeRounding).lastInsertRowid;
  db.prepare(`INSERT INTO ledger_entries (company_id, voucher_id, voucher_line_id, account_id, entry_date, debit, credit, running_balance, debit_minor, credit_minor, running_balance_minor)
    VALUES (1, ?, ?, ?, ?, 0, 0.03, 0, 0, 3, 0)`).run(adj, line, fakeRounding, DATE);
  assert.throws(() => db.prepare("UPDATE vouchers SET status = 'Posted' WHERE id = ?").run(adj), /do not balance/);

  const posted = postBalanced(db);
  const other = Number(db.prepare("INSERT INTO companies (company_name) VALUES ('Account Co')").run().lastInsertRowid);
  const otherAccount = db.prepare("INSERT INTO accounts (company_id, account_code, account_name, account_type, normal_balance, status) VALUES (?, '1001', 'Other Cash', 'Asset', 'Debit', 'active')").run(other).lastInsertRowid;
  const inWindow = (fn) => db.transaction(() => guards.withLedgerMaintenance(db, 1, "test", fn))();
  assert.throws(() => inWindow(() => db.prepare("UPDATE voucher_lines SET account_id = ? WHERE voucher_id = ?").run(otherAccount, posted.id)), GUARD);
  assert.throws(() => inWindow(() => db.prepare("UPDATE ledger_entries SET account_id = ? WHERE voucher_id = ?").run(otherAccount, posted.id)), GUARD);
});

test("a draft with lines and no ledger entries (as Bank Reconciliation leaves) does not upset the report or adjustments", () => {
  const db = fresh();
  postBalanced(db);
  const id = legacyUnbalanced(db, "OLD-DRAFTCASE", 10001, 10000);
  // Drafts in this company and in another one, with lines but no ledger entries yet.
  addLine(db, insertDraft(db, "BR-DRAFT-1"), "Cash", 5000, 0, { ledger: false });
  const other = Number(db.prepare("INSERT INTO companies (company_name) VALUES ('Draft Co')").run().lastInsertRowid);
  const otherAccount = db.prepare("INSERT INTO accounts (company_id, account_code, account_name, account_type, normal_balance, status) VALUES (?, '1001', 'Draft Cash', 'Asset', 'Debit', 'active')").run(other).lastInsertRowid;
  const otherDraft = db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status) VALUES (?, 'BR-DRAFT-2', ?, 'Journal', 'Draft')").run(other, DATE).lastInsertRowid;
  db.prepare("INSERT INTO voucher_lines (voucher_id, account_id, debit, credit, debit_minor, credit_minor) VALUES (?, ?, 50, 0, 5000, 0)").run(otherDraft, otherAccount);

  const report = m.moneyIntegrityReport(db, 1);
  assert.deepEqual(report.line_ledger_mismatches, []);
  assert.equal(report.unbalanced_vouchers.find((row) => row.id === id).adjustable, true);
  assert.ok(m.postRoundingAdjustment(db, { company_id: 1, voucher_id: id }).id);
  assert.equal(m.moneyIntegrityReport(db, 1).ok, true);
  assert.equal(m.moneyIntegrityReport(db, null).line_ledger_mismatches.length, 0);
});

test("Health Center, Error Console and the start-up count flag the same line/ledger defects", () => {
  const cases = {
    "balanced lines with no ledger entries": (db, id) => {
      addLine(db, id, "Cash", 1000, 0, { ledger: false });
      addLine(db, id, "Capital", 0, 1000, { ledger: false });
    },
    "entries doubled on both sides (same net)": (db, id) => {
      addLine(db, id, "Cash", 1000, 0, { ledgerDebitMinor: 2000 });
      addLine(db, id, "Capital", 0, 1000, { ledgerCreditMinor: 2000 });
    },
    "entries on swapped accounts": (db, id) => {
      const cash = addLine(db, id, "Cash", 1000, 0, { ledger: false });
      const capital = addLine(db, id, "Capital", 0, 1000, { ledger: false });
      const entry = db.prepare(`INSERT INTO ledger_entries (company_id, voucher_id, voucher_line_id, account_id, entry_date, debit, credit, running_balance, debit_minor, credit_minor, running_balance_minor)
        VALUES (1, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0)`);
      entry.run(id, cash, account(db, "Capital"), DATE, 10, 0, 1000, 0);
      entry.run(id, capital, account(db, "Cash"), DATE, 0, 10, 0, 1000);
    },
    "one line with two entries, the other with none": (db, id) => {
      const cash = addLine(db, id, "Cash", 1000, 0);
      addLine(db, id, "Capital", 0, 1000, { ledger: false });
      db.prepare(`INSERT INTO ledger_entries (company_id, voucher_id, voucher_line_id, account_id, entry_date, debit, credit, running_balance, debit_minor, credit_minor, running_balance_minor)
        VALUES (1, ?, ?, ?, ?, 0, 10, 0, 0, 1000, 0)`).run(id, cash, account(db, "Capital"), DATE);
    }
  };
  for (const [name, build] of Object.entries(cases)) {
    const db = fresh();
    postBalanced(db);
    assert.equal(guards.ledgerDefectCount(db), 0, `${name}: clean before`);
    db.transaction(() => guards.withLedgerMaintenance(db, 1, "test: older books", () => {
      const year = db.prepare("SELECT id FROM financial_years WHERE company_id = 1 AND start_date <= ? AND end_date >= ?").get(DATE, DATE);
      const id = db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status, financial_year_id, source_module) VALUES (1, 'OLD-BAD', ?, 'Journal', 'Posted', ?, 'legacy')").run(DATE, year.id).lastInsertRowid;
      build(db, id);
    }))();
    const report = m.moneyIntegrityReport(db, 1);
    assert.equal(report.ok, false, `${name}: Health Center`);
    assert.deepEqual(report.line_ledger_mismatches.map((row) => row.voucher_number), ["OLD-BAD"], `${name}: Health Center lists it`);
    assert.equal(bookIntegrityChecks(db, 1).find((c) => c.id === "voucher_balance").status, "fail", `${name}: Error Console`);
    assert.equal(guards.ledgerDefectCount(db), 1, `${name}: start-up count`);
  }
});

test("a guard that no longer fits the schema fails at start-up, not on the next posting", () => {
  const db = fresh();
  db.exec("ALTER TABLE ledger_entries RENAME COLUMN voucher_line_id TO line_ref");
  assert.throws(() => guards.ensureLedgerGuards(db), /Ledger guard does not fit the current schema/);
});

test("the integrity report reads the books in grouped passes (20,000 vouchers)", () => {
  const db = fresh();
  const cash = account(db, "Cash");
  const capital = account(db, "Capital");
  const year = db.prepare("SELECT id FROM financial_years WHERE company_id = 1 AND start_date <= ? AND end_date >= ?").get(DATE, DATE);
  // Written directly inside a window: posting 20,000 vouchers one by one would time the
  // posting path, not the report.
  db.transaction(() => guards.withLedgerMaintenance(db, 1, "test: bulk books", () => {
    const voucher = db.prepare("INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, status, financial_year_id, source_module) VALUES (1, ?, ?, 'Journal', 'Posted', ?, 'manual')");
    const line = db.prepare("INSERT INTO voucher_lines (voucher_id, account_id, debit, credit, debit_minor, credit_minor) VALUES (?, ?, ?, ?, ?, ?)");
    const entry = db.prepare(`INSERT INTO ledger_entries (company_id, voucher_id, voucher_line_id, account_id, entry_date, debit, credit, running_balance, debit_minor, credit_minor, running_balance_minor)
      VALUES (1, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0)`);
    for (let i = 0; i < 20000; i += 1) {
      const id = voucher.run(`BULK-${i}`, DATE, year.id).lastInsertRowid;
      entry.run(id, line.run(id, cash, 1, 0, 100, 0).lastInsertRowid, cash, DATE, 1, 0, 100, 0);
      entry.run(id, line.run(id, capital, 0, 1, 0, 100).lastInsertRowid, capital, DATE, 0, 1, 0, 100);
    }
  }))();
  const started = Date.now();
  const report = m.moneyIntegrityReport(db, 1);
  const elapsed = Date.now() - started;
  assert.deepEqual(report.line_ledger_mismatches, []);
  // Generous for slow machines; the per-voucher version took minutes here.
  assert.ok(elapsed < 20000, `report took ${elapsed} ms`);
});
