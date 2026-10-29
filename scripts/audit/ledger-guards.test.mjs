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
