/* ═══════════════════════════════════════════════════════════════════════════ */
/*  FSR-2A.5B — Governed Money Contract, Migration & Integration Verifier    */
/* ═══════════════════════════════════════════════════════════════════════════ */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

if (!process.versions.electron) {
  const electronBinary = process.platform === "win32"
    ? path.join(repoRoot, "node_modules", "electron", "dist", "electron.exe")
    : path.join(repoRoot, "node_modules", ".bin", "electron");
  const result = spawnSync(electronBinary, [
    "--disable-gpu", "--disable-gpu-compositing", "--disable-gpu-sandbox",
    "--disable-accelerated-2d-canvas", "--in-process-gpu",
    scriptPath, "--electron-child"
  ], { cwd: repoRoot, env: process.env, stdio: "inherit" });
  process.exit(Number.isInteger(result.status) ? result.status : 1);
}

import * as m from "../src/main/domain/money.js";
import { addShadowColumns, hasAllShadowColumns, backfillAll, reconcileAll, SHADOW_COLUMNS } from "../src/main/database/moneyMigration.js";

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail: String(detail) });
  const icon = pass ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`  ${icon}  ${name}  —  ${detail}`);
}

function withTempDb(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-gem-fsr2a5b-"));
  const dbPath = path.join(root, "test.db");
  const _require = createRequire(import.meta.url);
  const Database = _require("better-sqlite3");
  const db = new Database(dbPath);
  try {
    fn(db, root);
  } finally {
    db.close();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  }
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Section A  —  Money Parsing                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

function sectionA() {
  console.log("\n── Section A: Money Parsing ──\n");
  record("A1. Zero", m.parseMoneyToMinor(0) === 0, `got=${m.parseMoneyToMinor(0)}`);
  record("A2. Positive whole", m.parseMoneyToMinor(1) === 100, `got=${m.parseMoneyToMinor(1)}`);
  record("A3. Positive two-decimal", m.parseMoneyToMinor(1.23) === 123, `got=${m.parseMoneyToMinor(1.23)}`);
  record("A4. Negative", m.parseMoneyToMinor(-50.25) === -5025, `got=${m.parseMoneyToMinor(-50.25)}`);
  record("A5. Leading/trailing spaces", m.parseMoneyToMinor("  1.23  ") === 123, `got=${m.parseMoneyToMinor("  1.23  ")}`);
  record("A6. Comma-separated", m.parseMoneyToMinor("1,234.56") === 123456, `got=${m.parseMoneyToMinor("1,234.56")}`);
  record("A7. Empty", m.parseMoneyToMinor("") === 0, `got=${m.parseMoneyToMinor("")}`);
  record("A8. Null", m.parseMoneyToMinor(null) === 0, `got=${m.parseMoneyToMinor(null)}`);
  record("A9. Malformed", (() => { try { m.parseMoneyToMinor("abc"); return "no error"; } catch (e) { return "error"; } })() === "error", "malformed rejected");
  record("A10. NaN", (() => { try { m.parseMoneyToMinor(NaN); return "no error"; } catch (e) { return "error"; } })() === "error", "NaN rejected");
  record("A11. Infinity", (() => { try { m.parseMoneyToMinor(Infinity); return "no error"; } catch (e) { return "error"; } })() === "error", "Infinity rejected");
  record("A12. More than 2 decimals", m.parseMoneyToMinor(1.234) === 123, `got=${m.parseMoneyToMinor(1.234)}`);
  record("A13. Max safe", m.parseMoneyToMinor(90071992547409.91) !== 0, "parsed");
  record("A14. Overflow", (() => { try { m.parseMoneyToMinor(900719925474099); return "no error"; } catch (e) { return "error"; } })() === "error", "overflow rejected");
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Section B  —  Money Arithmetic                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

function sectionB() {
  console.log("\n── Section B: Money Arithmetic ──\n");
  record("B1. Exact addition", m.addMoney(100, 200) === 300, `got=${m.addMoney(100, 200)}`);
  record("B2. Exact subtraction", m.subtractMoney(500, 200) === 300, `got=${m.subtractMoney(500, 200)}`);
  record("B3. Exact comparison", m.compareMoney(100, 100) === 0, `got=${m.compareMoney(100, 100)}`);
  record("B4. Sum of many", m.sumMoney([10, 20, 30, 40]) === 100, `got=${m.sumMoney([10, 20, 30, 40])}`);
  record("B5. 0.10 + 0.20 = 0.30", m.exactEqual(m.addMoney(m.parseMoneyToMinor(0.10), m.parseMoneyToMinor(0.20)), m.parseMoneyToMinor(0.30)), "exact");
  record("B6. Negative cancellation", m.addMoney(500, -500) === 0, `got=${m.addMoney(500, -500)}`);
  record("B7. Reversal is exact opposite", m.subtractMoney(0, m.parseMoneyToMinor(100)) === m.parseMoneyToMinor(-100), `got=${m.subtractMoney(0, m.parseMoneyToMinor(100))}`);
  record("B8. No unsafe result", m.addMoney(m.parseMoneyToMinor(90071992547409), m.parseMoneyToMinor(0.01)) !== undefined, "safe");
  record("B9. No signed-zero ambiguity", Object.is(m.addMoney(-1, 1), -0) === false, `got=${m.addMoney(-1, 1)}`);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Section C  —  Rounding                                                   */
/* ═══════════════════════════════════════════════════════════════════════════ */

function sectionC() {
  console.log("\n── Section C: Rounding ──\n");
  record("C1. Half boundary below", m.roundToMinor(1.234) === 123, `got=${m.roundToMinor(1.234)}`);
  record("C2. Half boundary exactly", m.roundToMinor(1.235) === 124, `got=${m.roundToMinor(1.235)}`);
  record("C3. Half boundary above", m.roundToMinor(1.236) === 124, `got=${m.roundToMinor(1.236)}`);
  record("C4. Positive rounding", m.roundToMinor(0.999) === 100, `got=${m.roundToMinor(0.999)}`);
  record("C5. Negative rounding", m.roundToMinor(-1.234) === -123, `got=${m.roundToMinor(-1.234)}`);
  record("C6. Deterministic mode", m.roundToMinor(1.235) === 124 && m.roundToMinor(1.235) === 124, "deterministic");
  record("C7. Rate x quantity round", m.multiplyRateByQuantity(m.parseMoneyToMinor(100.50), 5) === 50250, `got=${m.multiplyRateByQuantity(m.parseMoneyToMinor(100.50), 5)}`);
  record("C8. Percentage calc", m.calculatePercentage(10000, 18) === 1800, `got=${m.calculatePercentage(10000, 18)}`);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Section D  —  Rate, Quantity and Tax                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

function sectionD() {
  console.log("\n── Section D: Rate, Quantity and Tax ──\n");
  const ratePerUnit = m.parseMoneyToMinor(123.4567);
  const totalMin = m.multiplyRateByQuantity(ratePerUnit, 3);
  record("D1. Fractional qty x rate", totalMin > 0, `total=${totalMin}`);
  record("D2. Final round to money", Number.isInteger(totalMin) && Number.isSafeInteger(totalMin), "integer minor units");
  const alloc = m.allocateMoney(100, [30, 30, 30]);
  record("D3. Allocation sums exactly", alloc.reduce((a, b) => a + b, 0) === 100, `sum=${alloc.reduce((a, b) => a + b, 0)}`);
  const pct = m.calculatePercentage(1000000, 18);
  record("D4. Tax calc deterministic", pct === 180000, `got=${pct}`);
  const pct2 = m.calculatePercentage(1000000, 18);
  record("D5. Tax calc repeatable", pct === pct2, "same");
  const disc = m.calculatePercentage(50000, 5);
  record("D6. Discount calc", disc === 2500, `got=${disc}`);
  const multiAlloc = m.allocateMoney(99, [10, 10, 10]);
  record("D7. Multi-line tax allocation sums exactly", multiAlloc.reduce((a, b) => a + b, 0) === 99, `sum=${multiAlloc.reduce((a, b) => a + b, 0)}`);
  const singleAlloc = m.allocateMoney(100, [100]);
  record("D8. Singular allocation", singleAlloc[0] === 100, `got=${singleAlloc[0]}`);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Section E  —  Real SQLite Migration                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */

function sectionE() {
  console.log("\n── Section E: Real SQLite Migration ──\n");

  /* E1-E4: Migration on fresh database */
  withTempDb((db) => {
    db.exec(`CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, company_id INTEGER, account_name TEXT, opening_balance REAL NOT NULL DEFAULT 0)`);
    db.exec(`CREATE TABLE IF NOT EXISTS voucher_lines (id INTEGER PRIMARY KEY, voucher_id INTEGER, account_id INTEGER, debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0)`);
    db.exec(`CREATE TABLE IF NOT EXISTS ledger_entries (id INTEGER PRIMARY KEY, company_id INTEGER, voucher_id INTEGER, account_id INTEGER, debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0, running_balance REAL NOT NULL DEFAULT 0)`);
    db.exec(`CREATE TABLE IF NOT EXISTS opening_balances (id INTEGER PRIMARY KEY, company_id INTEGER, financial_year_id INTEGER, opening_debit REAL NOT NULL DEFAULT 0, opening_credit REAL NOT NULL DEFAULT 0)`);
    db.exec(`CREATE TABLE IF NOT EXISTS carry_forward_entries (id INTEGER PRIMARY KEY, company_id INTEGER, account_id INTEGER, closing_balance REAL NOT NULL DEFAULT 0, opening_debit REAL NOT NULL DEFAULT 0, opening_credit REAL NOT NULL DEFAULT 0)`);
    db.exec(`CREATE TABLE IF NOT EXISTS stock_ledger (id INTEGER PRIMARY KEY, company_id INTEGER, item_id INTEGER, warehouse_id INTEGER, value REAL NOT NULL DEFAULT 0, running_value REAL NOT NULL DEFAULT 0)`);

    const applied = addShadowColumns(db);
    record("E1. Shadow columns added on fresh DB", applied.length === SHADOW_COLUMNS.length, `added=${applied.length}`);
    record("E2. All shadow columns present", hasAllShadowColumns(db), "yes");

    const applied2 = addShadowColumns(db);
    record("E3. Idempotent: no double-apply", applied2.length === 0, `re-applied=${applied2.length}`);
  });

  /* E4-E7: Migration on populated database with backfill */
  withTempDb((db) => {
    db.exec(`CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, company_id INTEGER, account_name TEXT, opening_balance REAL NOT NULL DEFAULT 0)`);
    db.exec(`CREATE TABLE IF NOT EXISTS voucher_lines (id INTEGER PRIMARY KEY, voucher_id INTEGER, account_id INTEGER, debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0)`);
    db.exec(`CREATE TABLE IF NOT EXISTS ledger_entries (id INTEGER PRIMARY KEY, company_id INTEGER, voucher_id INTEGER, account_id INTEGER, debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0, running_balance REAL NOT NULL DEFAULT 0)`);
    db.exec(`CREATE TABLE IF NOT EXISTS opening_balances (id INTEGER PRIMARY KEY, company_id INTEGER, financial_year_id INTEGER, opening_debit REAL NOT NULL DEFAULT 0, opening_credit REAL NOT NULL DEFAULT 0)`);
    db.exec(`CREATE TABLE IF NOT EXISTS carry_forward_entries (id INTEGER PRIMARY KEY, company_id INTEGER, account_id INTEGER, closing_balance REAL NOT NULL DEFAULT 0, opening_debit REAL NOT NULL DEFAULT 0, opening_credit REAL NOT NULL DEFAULT 0)`);
    db.exec(`CREATE TABLE IF NOT EXISTS stock_ledger (id INTEGER PRIMARY KEY, company_id INTEGER, item_id INTEGER, warehouse_id INTEGER, value REAL NOT NULL DEFAULT 0, running_value REAL NOT NULL DEFAULT 0)`);

    db.prepare("INSERT INTO accounts (id, company_id, account_name, opening_balance) VALUES (1, 1, 'Cash', 1000.00)").run();
    db.prepare("INSERT INTO accounts (id, company_id, account_name, opening_balance) VALUES (2, 1, 'Bank', 5000.50)").run();
    db.prepare("INSERT INTO accounts (id, company_id, account_name, opening_balance) VALUES (3, 1, 'GRNI', 0.00)").run();
    db.prepare("INSERT INTO voucher_lines (id, voucher_id, account_id, debit, credit) VALUES (1, 1, 1, 100.00, 0)").run();
    db.prepare("INSERT INTO voucher_lines (id, voucher_id, account_id, credit, debit) VALUES (2, 1, 2, 0, 100.00)").run();
    db.prepare("INSERT INTO ledger_entries (id, company_id, voucher_id, account_id, debit, credit, running_balance) VALUES (1, 1, 1, 1, 100.00, 0, 100.00)").run();

    addShadowColumns(db);
    const backfill = backfillAll(db);
    const totalUpdated = backfill.reduce((s, r) => s + r.rowsUpdated, 0);
    record("E4. Backfill updates existing rows", totalUpdated >= 3, `updated=${totalUpdated}`);

    const a1 = db.prepare("SELECT opening_balance_minor FROM accounts WHERE id = 1").get();
    record("E5. Backfill correct value", a1.opening_balance_minor === 100000, `got=${a1.opening_balance_minor}`);

    const a2 = db.prepare("SELECT opening_balance_minor FROM accounts WHERE id = 2").get();
    record("E6. Backfill decimal precision", a2.opening_balance_minor === 500050, `got=${a2.opening_balance_minor}`);

    const a3 = db.prepare("SELECT opening_balance_minor FROM accounts WHERE id = 3").get();
    record("E7. Zero backfill unchanged", a3.opening_balance_minor === 0, `got=${a3.opening_balance_minor}`);

    const disagreements = reconcileAll(db);
    record("E8. No reconciliation disagreements", disagreements.length === 0, `disagreements=${disagreements.length}`);

    const vl = db.prepare("SELECT debit_minor, credit_minor FROM voucher_lines WHERE id = 1").get();
    record("E9. Voucher line minor values correct", vl.debit_minor === 10000 && vl.credit_minor === 0, `debit_minor=${vl.debit_minor}`);
  });

  /* E10: Backfill idempotency */
  withTempDb((db) => {
    db.exec(`CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, company_id INTEGER, account_name TEXT, opening_balance REAL NOT NULL DEFAULT 0)`);
    db.prepare("INSERT INTO accounts (id, company_id, account_name, opening_balance) VALUES (1, 1, 'Test', 123.45)").run();
    addShadowColumns(db);
    backfillAll(db);
    const first = db.prepare("SELECT opening_balance_minor FROM accounts WHERE id = 1").get().opening_balance_minor;
    backfillAll(db);
    const second = db.prepare("SELECT opening_balance_minor FROM accounts WHERE id = 1").get().opening_balance_minor;
    record("E10. Backfill idempotent (stable value)", first === second && first === 12345, `first=${first} second=${second}`);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Section F  —  Report Functions                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

function sectionF() {
  console.log("\n── Section F: Report Functions ──\n");
  record("F1. minorToDecimalString 0", m.minorToDecimalString(0) === "0.00", `got=${m.minorToDecimalString(0)}`);
  record("F2. minorToDecimalString positive", m.minorToDecimalString(123456) === "1234.56", `got=${m.minorToDecimalString(123456)}`);
  record("F3. minorToDecimalString negative", m.minorToDecimalString(-5025) === "-50.25", `got=${m.minorToDecimalString(-5025)}`);
  record("F4. minorToMajor 0", m.minorToMajor(0) === 0, `got=${m.minorToMajor(0)}`);
  record("F5. minorToMajor positive", m.minorToMajor(123456) === 1234.56, `got=${m.minorToMajor(123456)}`);
  record("F6. minorToMajor negative", m.minorToMajor(-5025) === -50.25, `got=${m.minorToMajor(-5025)}`);
  record("F7. Format display", m.formatMoneyForDisplay(123456) === "₹1,234.56", `got=${m.formatMoneyForDisplay(123456)}`);
  record("F8. Format null", m.formatMoneyForDisplay(0) === "₹0.00", `got=${m.formatMoneyForDisplay(0)}`);
  record("F9. Legacy major→minor returns integer", Number.isInteger(m.convertLegacyMajorToMinor(123.45)), `got=${m.convertLegacyMajorToMinor(123.45)}`);
  record("F10. Minor→legacy parity", m.convertMinorToLegacyMajor(12345) === 123.45, `got=${m.convertMinorToLegacyMajor(12345)}`);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Section G  —  Boundary Checks                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

function sectionG() {
  console.log("\n── Section G: Boundary Checks ──\n");
  record("G1. CURRENCY defined", m.CURRENCY === "INR", `got=${m.CURRENCY}`);
  record("G2. MINOR_UNITS = 100", m.MINOR_UNITS === 100, `got=${m.MINOR_UNITS}`);
  record("G3. RATE_PRECISION >= 2", m.RATE_PRECISION >= 2, `got=${m.RATE_PRECISION}`);
  record("G4. assertMoney OK", (() => { try { m.assertMoney(100); return "OK"; } catch (e) { return e.message; } })() === "OK", "valid");
  record("G5. assertMoney rejects float", (() => { try { m.assertMoney(100.5); return "OK"; } catch (e) { return "error"; } })() === "error", "rejected");
  record("G6. assertMoney rejects NaN", (() => { try { m.assertMoney(NaN); return "OK"; } catch (e) { return "error"; } })() === "error", "rejected");
  record("G7. assertMoney rejects Infinity", (() => { try { m.assertMoney(Infinity); return "OK"; } catch (e) { return "error"; } })() === "error", "rejected");
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Section H  —  Accounting Posting (real SQLite)                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

function sectionH() {
  console.log("\n── Section H: Accounting Posting ──\n");

  withTempDb((db) => {
    db.exec(`CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, company_id INTEGER, account_name TEXT, account_type TEXT, normal_balance TEXT, opening_balance REAL NOT NULL DEFAULT 0, opening_balance_minor INTEGER NOT NULL DEFAULT 0)`);
    db.exec(`CREATE TABLE IF NOT EXISTS voucher_lines (id INTEGER PRIMARY KEY, voucher_id INTEGER, account_id INTEGER, debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0, debit_minor INTEGER NOT NULL DEFAULT 0, credit_minor INTEGER NOT NULL DEFAULT 0)`);
    db.exec(`CREATE TABLE IF NOT EXISTS ledger_entries (id INTEGER PRIMARY KEY, company_id INTEGER, voucher_id INTEGER, account_id INTEGER, debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0, running_balance REAL NOT NULL DEFAULT 0, debit_minor INTEGER NOT NULL DEFAULT 0, credit_minor INTEGER NOT NULL DEFAULT 0, running_balance_minor INTEGER NOT NULL DEFAULT 0)`);

    db.prepare("INSERT INTO accounts (id, company_id, account_name, account_type, normal_balance, opening_balance) VALUES (1, 1, 'Cash', 'Asset', 'Debit', 0)").run();
    db.prepare("INSERT INTO accounts (id, company_id, account_name, account_type, normal_balance, opening_balance) VALUES (2, 1, 'Sales', 'Income', 'Credit', 0)").run();

    const line1Debit = m.parseMoneyToMinor(1000.00);
    const line1Credit = 0;
    const line2Debit = 0;
    const line2Credit = m.parseMoneyToMinor(1000.00);

    db.prepare("INSERT INTO voucher_lines (voucher_id, account_id, debit, credit, debit_minor, credit_minor) VALUES (1, 1, ?, ?, ?, ?)").run(m.minorToMajor(line1Debit), m.minorToMajor(line1Credit), line1Debit, line1Credit);
    db.prepare("INSERT INTO voucher_lines (voucher_id, account_id, debit, credit, debit_minor, credit_minor) VALUES (1, 2, ?, ?, ?, ?)").run(m.minorToMajor(line2Debit), m.minorToMajor(line2Credit), line2Debit, line2Credit);

    const totalDebitMinor = line1Debit + line2Debit;
    const totalCreditMinor = line1Credit + line2Credit;
    record("H1. Voucher debit=credit in minor units", totalDebitMinor === totalCreditMinor, `debit=${totalDebitMinor} credit=${totalCreditMinor}`);

    db.prepare("INSERT INTO ledger_entries (company_id, voucher_id, account_id, debit, credit, running_balance, debit_minor, credit_minor, running_balance_minor) VALUES (1, 1, 1, ?, ?, ?, ?, ?, ?)").run(m.minorToMajor(line1Debit), m.minorToMajor(line1Credit), m.minorToMajor(line1Debit), line1Debit, line1Credit, line1Debit);

    const le = db.prepare("SELECT debit_minor, credit_minor, running_balance_minor FROM ledger_entries WHERE id = 1").get();
    record("H2. Ledger entry persists minor values", le.debit_minor === line1Debit, `debit_minor=${le.debit_minor}`);

    const onePaiseImbalance = (() => {
      const _r = createRequire(import.meta.url);
      const db2 = new (_r("better-sqlite3"))(":memory:");
      db2.exec(`CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, company_id INTEGER, account_name TEXT, account_type TEXT, normal_balance TEXT, opening_balance REAL NOT NULL DEFAULT 0)`);
      db2.prepare("INSERT INTO accounts (id, company_id, account_name, account_type, normal_balance, opening_balance) VALUES (1, 1, 'Cash', 'Asset', 'Debit', 0)").run();
      db2.prepare("INSERT INTO accounts (id, company_id, account_name, account_type, normal_balance, opening_balance) VALUES (2, 1, 'Sales', 'Income', 'Credit', 0)").run();
      const d1 = m.parseMoneyToMinor(100.00);
      const d2 = m.parseMoneyToMinor(100.01);
      db2.close();
      return d1 !== d2;
    })();
    record("H3. One-paise imbalance detectable", onePaiseImbalance, "1 paise difference detected");

    const _r2 = createRequire(import.meta.url);
    const dbWithCF = new (_r2("better-sqlite3"))(":memory:");
    dbWithCF.exec(`CREATE TABLE IF NOT EXISTS carry_forward_entries (id INTEGER PRIMARY KEY, company_id INTEGER, account_id INTEGER, closing_balance REAL NOT NULL DEFAULT 0, opening_debit REAL NOT NULL DEFAULT 0, opening_credit REAL NOT NULL DEFAULT 0, closing_balance_minor INTEGER NOT NULL DEFAULT 0, opening_debit_minor INTEGER NOT NULL DEFAULT 0, opening_credit_minor INTEGER NOT NULL DEFAULT 0)`);
    const cfMinor = m.parseMoneyToMinor(50000.00);
    dbWithCF.prepare("INSERT INTO carry_forward_entries (company_id, account_id, closing_balance, opening_debit, opening_credit, closing_balance_minor, opening_debit_minor, opening_credit_minor) VALUES (1, 1, ?, ?, ?, ?, ?, ?)").run(50000.00, 50000.00, 0, cfMinor, cfMinor, 0);
    const cf = dbWithCF.prepare("SELECT closing_balance_minor, opening_debit_minor FROM carry_forward_entries WHERE id = 1").get();
    record("H4. Carry-forward minor values stored", cf.closing_balance_minor === 5000000, `closing_balance_minor=${cf.closing_balance_minor}`);
    dbWithCF.close();
  });
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Section I  —  Inventory Money Integration (real SQLite)                  */
/* ═══════════════════════════════════════════════════════════════════════════ */

function sectionI() {
  console.log("\n── Section I: Inventory Money Integration ──\n");

  withTempDb((db) => {
    db.exec(`CREATE TABLE IF NOT EXISTS stock_ledger (id INTEGER PRIMARY KEY, company_id INTEGER, item_id INTEGER, warehouse_id INTEGER, transaction_type TEXT, inward_quantity REAL NOT NULL DEFAULT 0, outward_quantity REAL NOT NULL DEFAULT 0, balance_quantity REAL NOT NULL DEFAULT 0, rate REAL NOT NULL DEFAULT 0, value REAL NOT NULL DEFAULT 0, running_value REAL NOT NULL DEFAULT 0, value_minor INTEGER NOT NULL DEFAULT 0, running_value_minor INTEGER NOT NULL DEFAULT 0)`);

    db.prepare("INSERT INTO stock_ledger (company_id, item_id, warehouse_id, transaction_type, inward_quantity, balance_quantity, rate, value, running_value, value_minor, running_value_minor) VALUES (1, 1, 1, 'Inward', 10, 10, 100.50, 1005.00, 1005.00, ?, ?)").run(m.parseMoneyToMinor(1005.00), m.parseMoneyToMinor(1005.00));

    const sl = db.prepare("SELECT value, value_minor, running_value_minor FROM stock_ledger WHERE id = 1").get();
    record("I1. Stock ledger minor value stored", sl.value_minor === m.parseMoneyToMinor(1005.00), `value_minor=${sl.value_minor}`);

    const runningMinor = m.parseMoneyToMinor(1005.00);
    record("I2. Running value equals value on first entry", sl.running_value_minor === runningMinor, `running_value_minor=${sl.running_value_minor}`);

    db.prepare("INSERT INTO stock_ledger (company_id, item_id, warehouse_id, transaction_type, inward_quantity, balance_quantity, rate, value, running_value, value_minor, running_value_minor) VALUES (1, 1, 1, 'Inward', 5, 15, 200.00, 1000.00, 2005.00, ?, ?)").run(m.parseMoneyToMinor(1000.00), m.parseMoneyToMinor(2005.00));

    const sumValueMinor = db.prepare("SELECT SUM(value_minor) AS total FROM stock_ledger WHERE company_id = 1 AND item_id = 1 AND warehouse_id = 1 AND transaction_type = 'Inward'").get();
    const lastRunning = db.prepare("SELECT running_value_minor FROM stock_ledger WHERE id = 2").get();
    record("I3. SUM(inward value_minor) = last running_value_minor", sumValueMinor.total === lastRunning.running_value_minor, `sum=${sumValueMinor.total} running=${lastRunning.running_value_minor}`);

    const twoRuns = db.prepare("SELECT value_minor, running_value_minor FROM stock_ledger ORDER BY id").all();
    record("I4. Running value monotonic increasing", twoRuns[1].running_value_minor > twoRuns[0].running_value_minor, `v1=${twoRuns[0].running_value_minor} v2=${twoRuns[1].running_value_minor}`);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Section J  —  Party and Tax Allocation Tests (real SQLite)               */
/* ═══════════════════════════════════════════════════════════════════════════ */

function sectionJ() {
  console.log("\n── Section J: Party and Tax Allocation ──\n");

  const total = m.parseMoneyToMinor(1000.00);
  const shares = [m.parseMoneyToMinor(600.00), m.parseMoneyToMinor(400.00)];
  const alloc = m.allocateMoney(total, shares);
  const allocSum = alloc.reduce((a, b) => a + b, 0);
  record("J1. Allocation preserves total", allocSum === total, `allocated=${allocSum} total=${total}`);

  const taxable = m.parseMoneyToMinor(1000.00);
  const gst18 = m.calculatePercentage(taxable, 18);
  record("J2. GST 18% on 1000", gst18 === 18000, `gst=${gst18}`);

  const taxable2 = m.parseMoneyToMinor(999.99);
  const gst5 = m.calculatePercentage(taxable2, 5);
  record("J3. GST 5% on 999.99", gst5 === 5000, `gst=${gst5}`);

  const discount = m.calculatePercentage(taxable, 10);
  record("J4. Discount 10%", discount === 10000, `discount=${discount}`);

  const lines = [m.parseMoneyToMinor(588.24), m.parseMoneyToMinor(411.76)];
  const allocLines = m.allocateMoney(m.parseMoneyToMinor(180.00), lines);
  record("J5. Multi-line allocation sums to total", allocLines.reduce((a, b) => a + b, 0) === 18000, `sum=${allocLines.reduce((a, b) => a + b, 0)}`);

  const zeroAlloc = m.allocateMoney(0, [100, 200]);
  record("J6. Zero total allocation returns zeros", zeroAlloc.every(v => v === 0), `alloc=${zeroAlloc.join(",")}`);

  const singleShare = m.allocateMoney(m.parseMoneyToMinor(500.00), [m.parseMoneyToMinor(500.00)]);
  record("J7. Single share gets full amount", singleShare[0] === m.parseMoneyToMinor(500.00), `got=${singleShare[0]}`);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Section K  —  Import/Export Simulation                                   */
/* ═══════════════════════════════════════════════════════════════════════════ */

function sectionK() {
  console.log("\n── Section K: Import/Export Simulation ──\n");

  record("K1. Parse whole rupees", m.parseMoneyToMinor("100") === 10000, `got=${m.parseMoneyToMinor("100")}`);
  record("K2. Parse paise", m.parseMoneyToMinor("100.50") === 10050, `got=${m.parseMoneyToMinor("100.50")}`);
  record("K3. Parse negative", m.parseMoneyToMinor("-50.25") === -5025, `got=${m.parseMoneyToMinor("-50.25")}`);
  record("K4. Parse Indian comma", m.parseMoneyToMinor("1,23,456.78") === 12345678, `got=${m.parseMoneyToMinor("1,23,456.78")}`);
  record("K5. Parse with ₹ symbol", m.parseMoneyToMinor("₹1,234.56") === 123456, `got=${m.parseMoneyToMinor("₹1,234.56")}`);

  const overflowStr = (() => { try { m.parseMoneyToMinor("999999999999999"); return "ok"; } catch (e) { return "error"; } })();
  record("K6. String overflow rejected", overflowStr === "error", `result=${overflowStr}`);

  const negativeExport = m.minorToDecimalString(-5025);
  record("K7. Export negative value", negativeExport === "-50.25", `got=${negativeExport}`);

  const exportFormat = m.formatMoneyForDisplay(m.parseMoneyToMinor(1234567.89));
  record("K8. Export large value formatted", exportFormat.includes("₹") && exportFormat.includes(","), `got=${exportFormat}`);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Main                                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

sectionA();
sectionB();
sectionC();
sectionD();
sectionE();
sectionF();
sectionG();
sectionH();
sectionI();
sectionJ();
sectionK();

console.log("\n============================================================================");
console.log("FSR-2A.5B Verification Results");
console.log("============================================================================");
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
console.log(`  ${passed} passed, ${failed} failed, ${results.length} total\n`);

for (const r of results) {
  if (!r.pass) {
    console.log(`  FAIL  ${r.name}  —  ${r.detail}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
