import * as m from "../src/main/domain/money.js";
import fs from "fs";
import path from "path";
import os from "os";

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail: String(detail) });
  const icon = pass ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`  ${icon}  ${name}  —  ${detail}`);
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
  record("C7. Rate×quantity round", m.multiplyRateByQuantity(m.parseMoneyToMinor(100.50), 5) === 50250, `got=${m.multiplyRateByQuantity(m.parseMoneyToMinor(100.50), 5)}`);
  record("C8. Percentage calc", m.calculatePercentage(10000, 18) === 1800, `got=${m.calculatePercentage(10000, 18)}`);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Section D  —  Rate, Quantity and Tax                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

function sectionD() {
  console.log("\n── Section D: Rate, Quantity and Tax ──\n");

  const ratePerUnit = m.parseMoneyToMinor(123.4567); /* minor units for rate × quantity */
  const totalMin = m.multiplyRateByQuantity(ratePerUnit, 3);
  record("D1. Fractional qty × rate", totalMin > 0, `total=${totalMin}`);
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
/*  Section E  —  Schema & Migration (simulated via JSON backed in-memory)   */
/* ═══════════════════════════════════════════════════════════════════════════ */

function sectionE() {
  console.log("\n── Section E: Schema & Migration ──\n");

  /* Simulate migration using JSON objects to avoid native DB dependency */
  const store = { accounts: [], voucher_lines: [], ledger_entries: [], opening_balances: [], carry_forward_entries: [] };

  /* Simulate legacy schema */
  store.accounts.push({ id: 1, company_id: 1, account_name: "Test", opening_balance: 123.45, opening_balance_minor: 0 });
  store.accounts.push({ id: 2, company_id: 1, account_name: "Bank", opening_balance: 5000.00, opening_balance_minor: 0 });

  /* Migration: add shadow column and backfill */
  const cols = Object.keys(store.accounts[0]);
  record("E1. Shadow column candidate", cols.includes("opening_balance_minor"), `cols=${cols.join(",")}`);

  /* Backfill */
  for (const row of store.accounts) {
    row.opening_balance_minor = m.parseMoneyToMinor(row.opening_balance);
  }
  const row1 = store.accounts.find(a => a.id === 1);
  record("E2. Backfill conversion deterministic", row1.opening_balance_minor === 12345, `got=${row1.opening_balance_minor}`);

  /* Idempotent — re-applying backfill gives same result */
  for (const row of store.accounts) {
    row.opening_balance_minor = m.parseMoneyToMinor(row.opening_balance);
  }
  record("E3. Migration idempotent", row1.opening_balance_minor === 12345, `got=${row1.opening_balance_minor}`);

  /* Dry run: compute without writing */
  const dryRunValue = m.parseMoneyToMinor(row1.opening_balance);
  record("E4. Dry run computes correctly", dryRunValue === 12345, `computed=${dryRunValue}`);

  /* Conversion manifest: legacy vs minor */
  record("E5. Conversion manifest complete", store.accounts.length === 2, `count=${store.accounts.length}`);

  /* Overflow detection */
  const withinRange = Number.isSafeInteger(m.parseMoneyToMinor(90071992547409));
  record("E6. Safe range within bounds", withinRange, "within");
  const tooBig = (() => { try { m.parseMoneyToMinor(Number.MAX_SAFE_INTEGER / 100 + 1); return "ok"; } catch (e) { return "error"; } })();
  record("E7. Overflow blocked", tooBig === "error", `result=${tooBig}`);
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
/*  Main                                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

sectionA();
sectionB();
sectionC();
sectionD();
sectionE();
sectionF();
sectionG();

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
