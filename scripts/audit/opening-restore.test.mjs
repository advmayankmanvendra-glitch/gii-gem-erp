// Opening balances after a reset (owner, 16 Nov 2026 IST): restored from a backup where
// one exists, entered by hand otherwise. Each test uses a throwaway database.
// Run from the repo root:  node --test scripts/audit/opening-restore.test.mjs
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const m = await import(pathToFileURL(path.join(REPO, "src/main/database/init.js")).href);
const reset = await import(pathToFileURL(path.join(REPO, "src/main/services/operationalResetService.js")).href);
const restore = await import(pathToFileURL(path.join(REPO, "src/main/services/openingBalanceRestoreService.js")).href);

const handles = [];
const roots = [];
afterEach(() => {
  while (handles.length) { const db = handles.pop(); try { if (db.open) db.close(); } catch { /* closed */ } }
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
function fresh() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-obr-"));
  roots.push(root);
  const db = m.initializeDatabase(root);
  handles.push(db);
  return { root, db };
}
const openYear = (db, companyId = 1) => db.prepare("SELECT * FROM financial_years WHERE company_id = ? AND status = 'Open' ORDER BY start_date LIMIT 1").get(companyId);
const supplierId = (db) => db.prepare("SELECT id FROM suppliers ORDER BY id LIMIT 1").get()?.id;

function seedOpenings(db) {
  const year = openYear(db);
  const cash = m.createOpeningBalance(db, { company_id: 1, financial_year_id: year.id, balance_type: "Cash", opening_debit: 5000.25, remarks: "cash in hand" });
  const supplier = supplierId(db) || Number(db.prepare("INSERT INTO suppliers (supplier_name) VALUES ('Opening Supplier')").run().lastInsertRowid);
  const party = m.createPartyOpeningBalance(db, { company_id: 1, party_type: "supplier", party_id: supplier, financial_year_id: year.id, opening_date: year.start_date, opening_credit: 1200.5, narration: "supplier owed" });
  return { year, cash, party, supplier };
}

// The panel always restores what the user checked; tests do the same.
function checkedRestore(db, root, args) {
  const p = restore.previewOpeningBalanceRestore(db, root, args);
  return restore.restoreOpeningBalancesFromBackup(db, root, { ...args, expected: { fingerprint: p.fingerprint, ready: p.ready, totals: p.totals } });
}

const openingSummary = (db) => db.prepare(`
  SELECT ob.balance_type, ob.account_id, ob.financial_year_id, ob.opening_debit_minor AS d, ob.opening_credit_minor AS c,
         (SELECT linked_party_type || ':' || linked_party_id FROM voucher_lines WHERE voucher_id = ob.voucher_id AND linked_party_type IS NOT NULL) AS party,
         v.status, v.voucher_date
  FROM opening_balances ob JOIN vouchers v ON v.id = ob.voucher_id WHERE ob.company_id = 1 ORDER BY ob.balance_type`).all();

test("after a reset, opening balances come back from the pre-reset backup with new posted vouchers", () => {
  const { root, db } = fresh();
  seedOpenings(db);
  const before = openingSummary(db);
  assert.equal(before.length, 2);
  const result = reset.executeReset(db, root, { userId: 1, companyId: 1, confirmText: "RESET" });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM opening_balances WHERE company_id = 1").get().n, 0, "the reset clears openings");

  const preview = restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup: result.backup.fileName });
  assert.equal(preview.canRestore, true, JSON.stringify(preview.blockers));
  assert.equal(preview.ready, 2);
  assert.deepEqual(preview.totals, { debit: 5000.25, credit: 1200.5 });

  const done = checkedRestore(db, root, { companyId: 1, backup: result.backup.fileName, userId: 1 });
  assert.equal(done.restored, 2);
  assert.ok(fs.existsSync(path.join(root, "backups", done.safetyBackup)), "a safety backup is taken first");
  assert.deepEqual(openingSummary(db), before, "same amounts, accounts, years, party and dates; vouchers posted");
  const tb = db.prepare("SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM ledger_entries WHERE company_id = 1 AND COALESCE(is_deleted,0) = 0").get();
  assert.equal(Math.round(tb.d * 100), Math.round(tb.c * 100), "ledger stays balanced");
  const audit = db.prepare("SELECT new_value FROM audit_log WHERE action = 'opening_balances_restored' ORDER BY id DESC LIMIT 1").get();
  assert.equal(JSON.parse(audit.new_value).restored, 2);
  assert.equal(db.pragma("foreign_key_check").length, 0);
});

test("restoring twice is refused, so openings are never entered twice", () => {
  const { root, db } = fresh();
  seedOpenings(db);
  const { backup } = reset.executeReset(db, root, { userId: 1, companyId: 1, confirmText: "RESET" });
  checkedRestore(db, root, { companyId: 1, backup: backup.fileName });
  const again = restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup: backup.fileName });
  assert.equal(again.canRestore, false);
  assert.match(again.blockers.join(" "), /already has 2 opening balance/);
  assert.throws(() => restore.restoreOpeningBalancesFromBackup(db, root, { companyId: 1, backup: backup.fileName }), /Nothing was changed/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM opening_balances WHERE company_id = 1").get().n, 2);
});

test("a closed year blocks the restore and says to reopen it; nothing is written", () => {
  const { root, db } = fresh();
  const { year } = seedOpenings(db);
  const { backup } = reset.executeReset(db, root, { userId: 1, companyId: 1, confirmText: "RESET" });
  db.prepare("UPDATE financial_years SET status = 'Closed' WHERE id = ?").run(year.id);
  const preview = restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup: backup.fileName });
  assert.equal(preview.canRestore, false);
  assert.match(preview.blockers.join(" "), /reopen it from Financial Years/);
  const vouchers = db.prepare("SELECT COUNT(*) n FROM vouchers WHERE company_id = 1").get().n;
  assert.throws(() => restore.restoreOpeningBalancesFromBackup(db, root, { companyId: 1, backup: backup.fileName }), /Nothing was changed/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM vouchers WHERE company_id = 1").get().n, vouchers);
});

test("a reversed opening voucher in the backup is skipped, not restored", () => {
  const { root, db } = fresh();
  const { cash } = seedOpenings(db);
  db.exec("PRAGMA foreign_keys = OFF");
  const guards = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_ledger_guard%'").all();
  guards.forEach((t) => db.exec(`DROP TRIGGER "${t.name}"`));
  db.prepare("UPDATE vouchers SET status = 'Reversed' WHERE id = ?").run(cash.voucher_id);
  guards.forEach((t) => db.exec(t.sql));
  db.exec("PRAGMA foreign_keys = ON");
  const { backup } = reset.executeReset(db, root, { userId: 1, companyId: 1, confirmText: "RESET" });
  const preview = restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup: backup.fileName });
  assert.equal(preview.ready, 1);
  assert.equal(preview.skipped, 1);
  assert.equal(checkedRestore(db, root, { companyId: 1, backup: backup.fileName }).restored, 1);
});

test("only files inside the backups folder are accepted, and another company's books are not matched", () => {
  const { root, db } = fresh();
  seedOpenings(db);
  const { backup } = reset.executeReset(db, root, { userId: 1, companyId: 1, confirmText: "RESET" });
  assert.throws(() => restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup: "../database/gii_gem_erp.db" }), /invalid backup path/);
  assert.throws(() => restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup: "" }), /Pick a backup/);
  db.prepare("UPDATE companies SET company_name = 'Renamed Co' WHERE id = 1").run();
  const preview = restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup: backup.fileName });
  assert.equal(preview.canRestore, false);
  assert.match(preview.blockers.join(" "), /does not hold "Renamed Co"/);
});

test("with no backup, openings can still be entered by hand after a reset", () => {
  const { root, db } = fresh();
  seedOpenings(db);
  reset.executeReset(db, root, { userId: 1, companyId: 1, confirmText: "RESET" });
  const year = openYear(db);
  const row = m.createOpeningBalance(db, { company_id: 1, financial_year_id: year.id, balance_type: "Bank", opening_debit: 750 });
  assert.ok(row.voucher_id);
  assert.equal(db.prepare("SELECT status FROM vouchers WHERE id = ?").get(row.voucher_id).status, "Posted");
});

// --- Audit findings on 847103d (16 Nov 2026 IST) ---
const Database = (await import("node:module")).createRequire(import.meta.url)("better-sqlite3");
function editBackup(root, fileName, fn) {
  const file = path.join(root, "backups", fileName);
  const db = new Database(file);
  db.exec("PRAGMA foreign_keys = OFF");
  db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all().forEach((t) => db.exec(`DROP TRIGGER "${t.name}"`));
  try { fn(db); } finally { db.close(); }
}
function resetWithBackup(db, root) {
  return reset.executeReset(db, root, { userId: 1, companyId: 1, confirmText: "RESET" }).backup.fileName;
}

test("preview posts and rolls back, so an inactive account blocks before anything is written", () => {
  const { root, db } = fresh();
  const { cash } = seedOpenings(db);
  const backup = resetWithBackup(db, root);
  db.prepare("UPDATE accounts SET status = 'inactive' WHERE id = ?").run(cash.account_id);
  const vouchers = db.prepare("SELECT COUNT(*) n FROM vouchers").get().n;
  const preview = restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup });
  assert.equal(preview.canRestore, false);
  assert.match(preview.blockers.join(" "), /cannot be posted/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM vouchers").get().n, vouchers, "the dry run leaves nothing behind");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM opening_balances").get().n, 0);
  assert.equal(fs.readdirSync(path.join(root, "backups")).filter((f) => f.startsWith("pre_opening_restore")).length, 0, "no safety backup for a refused restore");
});

test("paise columns are authoritative and an amount that disagrees with its voucher blocks", () => {
  const { root, db } = fresh();
  seedOpenings(db);
  const backup = resetWithBackup(db, root);
  editBackup(root, backup, (b) => b.prepare("UPDATE opening_balances SET opening_credit = 0.004 WHERE balance_type = 'Cash'").run());
  let preview = restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup });
  assert.equal(preview.canRestore, true, "a stale rupee column is ignored when paise are present");
  editBackup(root, backup, (b) => b.prepare("UPDATE opening_balances SET opening_debit_minor = 400000 WHERE balance_type = 'Cash'").run());
  preview = restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup });
  assert.equal(preview.canRestore, false);
  assert.match(preview.blockers.join(" "), /does not match its voucher/);
});

test("parties are matched by type and name, and unknown party types block", () => {
  const { root, db } = fresh();
  const { supplier } = seedOpenings(db);
  const backup = resetWithBackup(db, root);
  db.prepare("UPDATE suppliers SET supplier_name = 'Someone Else' WHERE id = ?").run(supplier);
  assert.match(restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup }).blockers.join(" "), /not the same in the live masters/);
  editBackup(root, backup, (b) => b.prepare("UPDATE voucher_lines SET linked_party_type = 'contractor' WHERE linked_party_type = 'supplier'").run());
  assert.match(restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup }).blockers.join(" "), /party type "contractor" cannot be restored/);
});

test("a crafted backup with views or computed columns is refused before it is read", () => {
  const { root, db } = fresh();
  seedOpenings(db);
  const backup = resetWithBackup(db, root);
  editBackup(root, backup, (b) => { b.exec("ALTER TABLE voucher_lines RENAME TO vl_real"); b.exec("CREATE VIEW voucher_lines AS SELECT * FROM vl_real"); });
  assert.throws(() => restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup }), /objects a GII GeM ERP backup never has \(voucher_lines\)/);
});

test("an expression index or an oversized remark in a backup is refused without evaluating it", () => {
  const { root, db } = fresh();
  seedOpenings(db);
  const backup = resetWithBackup(db, root);
  const copy = `copy-${backup}`;
  fs.copyFileSync(path.join(root, "backups", backup), path.join(root, "backups", copy));
  editBackup(root, backup, (b) => b.exec("CREATE INDEX evil ON vouchers (length(narration) * 2)"));
  const started = Date.now();
  assert.throws(() => restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup }), /never has \(evil\)/);
  assert.ok(Date.now() - started < 5000);
  editBackup(root, copy, (b) => b.prepare("UPDATE opening_balances SET remarks = ? WHERE balance_type = 'Cash'").run("x".repeat(5000)));
  const preview = restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup: copy });
  assert.equal(preview.canRestore, false);
  assert.match(preview.blockers.join(" "), /remark is longer than 500/);
});

test("a hard link into the backups folder and a WAL sidecar added after the check are not trusted", () => {
  const { root, db } = fresh();
  seedOpenings(db);
  const backup = resetWithBackup(db, root);
  const outside = path.join(root, "outside.db");
  fs.copyFileSync(path.join(root, "backups", backup), outside);
  fs.linkSync(outside, path.join(root, "backups", "hard.db"));
  assert.throws(() => restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup: "hard.db" }), /not a backup file in the backups folder/);
  const preview = restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup });
  fs.writeFileSync(path.join(root, "backups", `${backup}-wal`), Buffer.alloc(4096, 1));
  const done = restore.restoreOpeningBalancesFromBackup(db, root, { companyId: 1, backup, expected: { fingerprint: preview.fingerprint, ready: preview.ready, totals: preview.totals } });
  assert.equal(done.restored, 2, "only the hashed main file is read; the sidecar is ignored");
});

test("a symbolic link out of the backups folder and a non-.db name are refused", () => {
  const { root, db } = fresh();
  seedOpenings(db);
  const backup = resetWithBackup(db, root);
  const outside = path.join(root, "outside.db");
  fs.copyFileSync(path.join(root, "backups", backup), outside);
  fs.symlinkSync(outside, path.join(root, "backups", "link.db"));
  assert.throws(() => restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup: "link.db" }), /not a backup file in the backups folder/);
  assert.throws(() => restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup: "." }), /not a backup file|Pick a backup/);
});

test("the restore refuses when the backup changed after the check", () => {
  const { root, db } = fresh();
  seedOpenings(db);
  const backup = resetWithBackup(db, root);
  const preview = restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup });
  const expected = { fingerprint: preview.fingerprint, ready: preview.ready, totals: preview.totals };
  editBackup(root, backup, (b) => b.prepare("UPDATE opening_balances SET remarks = 'changed'").run());
  assert.throws(() => restore.restoreOpeningBalancesFromBackup(db, root, { companyId: 1, backup, expected }), /changed since you checked/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM opening_balances").get().n, 0);
  const fresh2 = restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup });
  const done = restore.restoreOpeningBalancesFromBackup(db, root, { companyId: 1, backup, expected: { fingerprint: fresh2.fingerprint, ready: fresh2.ready, totals: fresh2.totals } });
  assert.equal(done.restored, 2);
  const audit = JSON.parse(db.prepare("SELECT new_value FROM audit_log WHERE action = 'opening_balances_restored'").get().new_value);
  assert.equal(audit.backupSha256, fresh2.fingerprint);
});

test("an empty party remark comes back empty", () => {
  const { root, db } = fresh();
  const year = openYear(db);
  const supplier = supplierId(db) || Number(db.prepare("INSERT INTO suppliers (supplier_name) VALUES ('S')").run().lastInsertRowid);
  m.createPartyOpeningBalance(db, { company_id: 1, party_type: "supplier", party_id: supplier, financial_year_id: year.id, opening_date: year.start_date, opening_debit: 10 });
  const before = db.prepare("SELECT remarks FROM opening_balances").get().remarks;
  const backup = resetWithBackup(db, root);
  checkedRestore(db, root, { companyId: 1, backup });
  assert.equal(db.prepare("SELECT remarks FROM opening_balances").get().remarks, before);
});

test("a restore without the check's values is refused", () => {
  const { root, db } = fresh();
  seedOpenings(db);
  const backup = resetWithBackup(db, root);
  assert.throws(() => restore.restoreOpeningBalancesFromBackup(db, root, { companyId: 1, backup }), /check the backup first/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM opening_balances").get().n, 0);
});

test("an opening booked against another contra account in the backup blocks instead of moving to Capital", () => {
  const { root, db } = fresh();
  const { cash } = seedOpenings(db);
  const backup = resetWithBackup(db, root);
  const suspense = db.prepare("SELECT id FROM accounts WHERE company_id = 1 AND account_name = 'Opening Balance Suspense'").get().id;
  editBackup(root, backup, (b) => b.prepare("UPDATE voucher_lines SET account_id = ? WHERE voucher_id = ? AND account_id <> ?").run(suspense, cash.voucher_id, cash.account_id));
  const preview = restore.previewOpeningBalanceRestore(db, root, { companyId: 1, backup });
  assert.equal(preview.canRestore, false);
  assert.match(preview.blockers.join(" "), /other side is Opening Balance Suspense, but it would now be posted against Capital/);
});
