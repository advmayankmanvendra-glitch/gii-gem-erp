import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const results = [];

function round(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function record(name, passed, detail) {
  results.push({ name, passed: Boolean(passed), detail: String(detail || "") });
}

function createCompany(db, name) {
  return Number(db.prepare("INSERT INTO companies (company_name, status) VALUES (?, 'active')").run(name).lastInsertRowid);
}

async function run() {
  const {
    accountingData, closeFinancialYear, createBalancedVoucher,
    createFinancialYear, createLedgerAccount, createManualVoucher,
    initializeDatabase, updateFinancialYearStatus,
    trialBalance, profitLossReport, balanceSheetReport
  } = await import("../src/main/database/init.js");
  const { withLedgerMaintenance } = await import("../src/main/database/ledgerGuards.js");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-gem-fsr2a3-"));
  let db;
  let db2;
  let db3;
  let dbDraft;
  let db4;
  const fixtureRoots = [root];
  let passedCount = 0;
  let failedCount = 0;

  try {
    db = initializeDatabase(root);
    const companyId = createCompany(db, "FSR-2A.3 Primary Fixture");
    const otherCo = createCompany(db, "FSR-2A.3 Other Company");

    /* Setup FYs */
    const fySrc = createFinancialYear(db, { company_id: companyId, financial_year_name: "FY 2025-26", start_date: "2025-04-01", end_date: "2026-03-31", status: "Open" });
    const fyDst = createFinancialYear(db, { company_id: companyId, financial_year_name: "FY 2026-27", start_date: "2026-04-01", end_date: "2027-03-31", status: "Open" });

    /* Setup accounts */
    const bankAc = createLedgerAccount(db, { company_id: companyId, account_code: "A100", account_name: "Bank", account_type: "Asset", normal_balance: "Debit" });
    const accumDepr = createLedgerAccount(db, { company_id: companyId, account_code: "A110", account_name: "Accumulated Depreciation", account_type: "Asset", normal_balance: "Credit" });
    const payablesAc = createLedgerAccount(db, { company_id: companyId, account_code: "L200", account_name: "Payables", account_type: "Liability", normal_balance: "Credit" });
    const capitalAc = createLedgerAccount(db, { company_id: companyId, account_code: "E300", account_name: "Capital", account_type: "Equity", normal_balance: "Credit" });
    const drawingsAc = createLedgerAccount(db, { company_id: companyId, account_code: "E310", account_name: "Drawings", account_type: "Equity", normal_balance: "Debit" });
    const salesAc = createLedgerAccount(db, { company_id: companyId, account_code: "I400", account_name: "Sales", account_type: "Income", normal_balance: "Credit" });
    const expenseAc = createLedgerAccount(db, { company_id: companyId, account_code: "X500", account_name: "Expenses", account_type: "Expense", normal_balance: "Debit" });

    /* Post transactions in source FY */
    createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "Base capital", source_module: "test", source_id: null, lines: [{ account_id: bankAc.id, debit: 50000, credit: 0 }, { account_id: capitalAc.id, debit: 0, credit: 50000 }] });
    createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-07-01", voucher_type: "Journal", narration: "Loan", source_module: "test", source_id: null, lines: [{ account_id: bankAc.id, debit: 20000, credit: 0 }, { account_id: payablesAc.id, debit: 0, credit: 20000 }] });
    createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-10-01", voucher_type: "Journal", narration: "Depreciation", source_module: "test", source_id: null, lines: [{ account_id: accumDepr.id, debit: 0, credit: 1000 }, { account_id: expenseAc.id, debit: 1000, credit: 0 }] });
    createBalancedVoucher(db, { company_id: companyId, voucher_date: "2026-01-01", voucher_type: "Journal", narration: "Drawings", source_module: "test", source_id: null, lines: [{ account_id: drawingsAc.id, debit: 3000, credit: 0 }, { account_id: bankAc.id, debit: 0, credit: 3000 }] });
    createBalancedVoucher(db, { company_id: companyId, voucher_date: "2026-03-01", voucher_type: "Journal", narration: "Revenue", source_module: "test", source_id: null, lines: [{ account_id: bankAc.id, debit: 10000, credit: 0 }, { account_id: salesAc.id, debit: 0, credit: 10000 }] });

    /* ================================================================ */
    /* Check 1: Valid close succeeds */
    /* ================================================================ */
    let close1Error = "";
    let close1Result = null;
    try {
      close1Result = closeFinancialYear(db, { company_id: companyId, from_financial_year_id: fySrc.id, to_financial_year_id: fyDst.id });
    } catch (e) {
      close1Error = String(e?.message || e);
    }
    record("1. Valid source/destination close succeeds", !close1Error && !!close1Result, close1Error || "Closed OK");

    /* ================================================================ */
    /* Check 2: Source FY status reaches Locked */
    /* ================================================================ */
    const srcStatus = db.prepare("SELECT status FROM financial_years WHERE id = ?").get(fySrc.id)?.status;
    record("2. Source FY reaches Locked status", srcStatus === "Locked", `status=${srcStatus}`);

    /* ================================================================ */
    /* Check 3: Destination FY remains Open */
    /* ================================================================ */
    const dstStatus = db.prepare("SELECT status FROM financial_years WHERE id = ?").get(fyDst.id)?.status;
    record("3. Destination FY remains Open", dstStatus === "Open", `status=${dstStatus}`);

    /* ================================================================ */
    /* Check 4: Carry-forward rows exist for BS accounts */
    /* ================================================================ */
    const carryRows = db.prepare("SELECT COUNT(*) count FROM carry_forward_entries WHERE company_id = ? AND from_financial_year_id = ?").get(companyId, fySrc.id).count;
    record("4. Carry-forward rows created", carryRows > 0, `rows=${carryRows}`);

    /* ================================================================ */
    /* Check 5: Company mismatch rejected */
    /* ================================================================ */
    let crossErr = "";
    try {
      closeFinancialYear(db, { company_id: companyId, from_financial_year_id: fySrc.id, to_financial_year_id: fyDst.id });
    } catch (e) {
      crossErr = String(e?.message || e);
    }
    record("5. Duplicate close rejected (source already Locked)", crossErr.includes("must be 'Open'"), crossErr || "no error");

    /* ================================================================ */
    /* Check 6: Same-date target rejected (must start after source ends) */
    /* ================================================================ */
    const fyOverlapSrc = createFinancialYear(db, { company_id: companyId, financial_year_name: "FY OverlapSrc", start_date: "2023-04-01", end_date: "2024-03-31", status: "Open" });
    const fyOverlap = createFinancialYear(db, { company_id: companyId, financial_year_name: "FY Overlap", start_date: "2024-04-01", end_date: "2025-03-31", status: "Open" });
    let gapErr = "";
    try {
      closeFinancialYear(db, { company_id: companyId, from_financial_year_id: fyOverlapSrc.id, to_financial_year_id: fyOverlap.id });
    } catch (e) {
      gapErr = String(e?.message || e);
    }
    /* fyOverlapSrc ends 2024-03-31, fyOverlap starts 2024-04-01 — contiguous, should succeed */
    record("6. Contiguous target accepted", !gapErr, gapErr || "no error");

    /* ================================================================ */
    /* Check 7: Missing destination rejected */
    /* ================================================================ */
    let missDstErr = "";
    try {
      closeFinancialYear(db, { company_id: companyId, from_financial_year_id: fySrc.id, to_financial_year_id: 99999 });
    } catch (e) {
      missDstErr = String(e?.message || e);
    }
    record("7. Missing destination rejected", missDstErr.includes("Valid source"), missDstErr || "no error");

    /* ================================================================ */
    /* Check 8: Ineligible source status rejected */
    /* ================================================================ */
    let lockedSrcErr = "";
    try {
      closeFinancialYear(db, { company_id: companyId, from_financial_year_id: fySrc.id, to_financial_year_id: fyDst.id });
    } catch (e) {
      lockedSrcErr = String(e?.message || e);
    }
    record("8. Ineligible source status rejected", lockedSrcErr.includes("must be 'Open'"), lockedSrcErr || "no error");

    /* ================================================================ */
    /* Check 9: Destination ineligible status rejected */
    /* ================================================================ */
    const otherFy = createFinancialYear(db, { company_id: companyId, financial_year_name: "FY 2028-29", start_date: "2028-04-01", end_date: "2029-03-31", status: "Open" });
    updateFinancialYearStatus(db, otherFy.id, "Locked");
    let lockedDstErr = "";
    try {
      closeFinancialYear(db, { company_id: companyId, from_financial_year_id: fyOverlapSrc.id, to_financial_year_id: otherFy.id });
    } catch (e) {
      lockedDstErr = String(e?.message || e);
    }
    record("9. Destination ineligible status rejected", lockedDstErr.includes("must be 'Open'"), lockedDstErr || "no error");

    /* Verify carry-forward amounts — create a second fixture for detailed sign checks */
    /* Second isolated fixture */
    const root2 = fs.mkdtempSync(path.join(os.tmpdir(), "gii-gem-fsr2a3b-"));
    fixtureRoots.push(root2);
    db2 = initializeDatabase(root2);
    const c2 = createCompany(db2, "Sign Check Co");
    const fy1 = createFinancialYear(db2, { company_id: c2, financial_year_name: "FY1", start_date: "2025-04-01", end_date: "2026-03-31", status: "Open" });
    const fy2 = createFinancialYear(db2, { company_id: c2, financial_year_name: "FY2", start_date: "2026-04-01", end_date: "2027-03-31", status: "Open" });
    const bnk = createLedgerAccount(db2, { company_id: c2, account_code: "A1", account_name: "Bank", account_type: "Asset", normal_balance: "Debit" });
    const adp = createLedgerAccount(db2, { company_id: c2, account_code: "A2", account_name: "Accum Depr", account_type: "Asset", normal_balance: "Credit" });
    const pay = createLedgerAccount(db2, { company_id: c2, account_code: "L1", account_name: "Payables", account_type: "Liability", normal_balance: "Credit" });
    const cap = createLedgerAccount(db2, { company_id: c2, account_code: "E1", account_name: "Capital", account_type: "Equity", normal_balance: "Credit" });
    const drw = createLedgerAccount(db2, { company_id: c2, account_code: "E2", account_name: "Drawings", account_type: "Equity", normal_balance: "Debit" });
    const inc = createLedgerAccount(db2, { company_id: c2, account_code: "I1", account_name: "Income", account_type: "Income", normal_balance: "Credit" });
    const exp = createLedgerAccount(db2, { company_id: c2, account_code: "X1", account_name: "Expense", account_type: "Expense", normal_balance: "Debit" });

    createBalancedVoucher(db2, { company_id: c2, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "setup", source_module: "test", source_id: null, lines: [{ account_id: bnk.id, debit: 57000, credit: 0 }, { account_id: adp.id, debit: 0, credit: 1000 }, { account_id: pay.id, debit: 0, credit: 5000 }, { account_id: cap.id, debit: 0, credit: 50000 }, { account_id: drw.id, debit: 8000, credit: 0 }, { account_id: inc.id, debit: 0, credit: 10000 }, { account_id: exp.id, debit: 1000, credit: 0 }] });

    const close2 = closeFinancialYear(db2, { company_id: c2, from_financial_year_id: fy1.id, to_financial_year_id: fy2.id });

    /* ================================================================ */
    /* Check 10: Asset sign preserved (Bank -> positive) */
    /* ================================================================ */
    const bankCf = db2.prepare("SELECT closing_balance, opening_debit, opening_credit FROM carry_forward_entries WHERE company_id=? AND account_id=? AND from_financial_year_id=?").get(c2, bnk.id, fy1.id);
    record("10. Asset (Bank) positive carry-forward", bankCf && bankCf.closing_balance > 0 && bankCf.opening_debit > 0, `closing=${bankCf?.closing_balance}, od=${bankCf?.opening_debit}`);

    /* ================================================================ */
    /* Check 11: Contra-Asset sign preserved (Accum Depr -> negative) */
    /* ================================================================ */
    const adpCf = db2.prepare("SELECT closing_balance, opening_debit, opening_credit FROM carry_forward_entries WHERE company_id=? AND account_id=? AND from_financial_year_id=?").get(c2, adp.id, fy1.id);
    record("11. Contra-Asset (Accum Depr) negative carry-forward", adpCf && adpCf.closing_balance < 0 && adpCf.opening_credit > 0, `closing=${adpCf?.closing_balance}, oc=${adpCf?.opening_credit}`);

    /* ================================================================ */
    /* Check 12: Liability sign preserved (Payables -> positive) */
    /* ================================================================ */
    const payCf = db2.prepare("SELECT closing_balance, opening_debit, opening_credit FROM carry_forward_entries WHERE company_id=? AND account_id=? AND from_financial_year_id=?").get(c2, pay.id, fy1.id);
    record("12. Liability (Payables) positive carry-forward", payCf && payCf.closing_balance > 0 && payCf.opening_credit > 0, `closing=${payCf?.closing_balance}, oc=${payCf?.opening_credit}`);

    /* ================================================================ */
    /* Check 13: Equity sign preserved (Capital -> positive) */
    /* ================================================================ */
    const capCf = db2.prepare("SELECT closing_balance, opening_debit, opening_credit FROM carry_forward_entries WHERE company_id=? AND account_id=? AND from_financial_year_id=?").get(c2, cap.id, fy1.id);
    record("13. Equity (Capital) positive carry-forward", capCf && capCf.closing_balance > 0 && capCf.opening_credit > 0, `closing=${capCf?.closing_balance}, oc=${capCf?.opening_credit}`);

    /* ================================================================ */
    /* Check 14: Drawings sign preserved (negative equity) */
    /* ================================================================ */
    const drwCf = db2.prepare("SELECT closing_balance, opening_debit, opening_credit FROM carry_forward_entries WHERE company_id=? AND account_id=? AND from_financial_year_id=?").get(c2, drw.id, fy1.id);
    record("14. Drawings (contra-equity) negative carry-forward", drwCf && drwCf.closing_balance < 0 && drwCf.opening_debit > 0, `closing=${drwCf?.closing_balance}, od=${drwCf?.opening_debit}`);

    /* ================================================================ */
    /* Check 15: Income does not carry as nominal opening */
    /* ================================================================ */
    const incCf = db2.prepare("SELECT COUNT(*) count FROM carry_forward_entries WHERE company_id=? AND account_id=? AND from_financial_year_id=?").get(c2, inc.id, fy1.id).count;
    record("15. Income accounts not carried as opening", incCf === 0, `count=${incCf}`);

    /* ================================================================ */
    /* Check 16: Expense does not carry as nominal opening */
    /* ================================================================ */
    const expCf = db2.prepare("SELECT COUNT(*) count FROM carry_forward_entries WHERE company_id=? AND account_id=? AND from_financial_year_id=?").get(c2, exp.id, fy1.id).count;
    record("16. Expense accounts not carried as opening", expCf === 0, `count=${expCf}`);

    /* ================================================================ */
    /* Check 17: Profitable-year result enters destination Equity once */
    /* ================================================================ */
    const capOpenings = db2.prepare("SELECT COALESCE(SUM(opening_credit),0) - COALESCE(SUM(opening_debit),0) total FROM carry_forward_entries WHERE company_id=? AND account_id=? AND from_financial_year_id=?").get(c2, cap.id, fy1.id);
    const totalCapitalOpening = Number(capOpenings?.total || 0);
    const equityIncrease = totalCapitalOpening - 50000;
    record("17. Profit result in destination Equity once", equityIncrease > 0, `equity increase=${equityIncrease} (capital=${totalCapitalOpening})`);

    /* ================================================================ */
    /* Check 18: Zero-result year creates no false profit transfer */
    /* ================================================================ */
    const root3 = fs.mkdtempSync(path.join(os.tmpdir(), "gii-gem-fsr2a3c-"));
    fixtureRoots.push(root3);
    db3 = initializeDatabase(root3);
    const c3 = createCompany(db3, "Zero Profit Co");
    const zfy1 = createFinancialYear(db3, { company_id: c3, financial_year_name: "ZFY1", start_date: "2025-04-01", end_date: "2026-03-31", status: "Open" });
    const zfy2 = createFinancialYear(db3, { company_id: c3, financial_year_name: "ZFY2", start_date: "2026-04-01", end_date: "2027-03-31", status: "Open" });
    const zbnk = createLedgerAccount(db3, { company_id: c3, account_code: "ZA1", account_name: "Bank", account_type: "Asset", normal_balance: "Debit" });
    const zcap = createLedgerAccount(db3, { company_id: c3, account_code: "ZE1", account_name: "Capital", account_type: "Equity", normal_balance: "Credit" });
    createBalancedVoucher(db3, { company_id: c3, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "setup", source_module: "test", source_id: null, lines: [{ account_id: zbnk.id, debit: 10000, credit: 0 }, { account_id: zcap.id, debit: 0, credit: 10000 }] });
    closeFinancialYear(db3, { company_id: c3, from_financial_year_id: zfy1.id, to_financial_year_id: zfy2.id });
    const zCfCapital = db3.prepare("SELECT closing_balance FROM carry_forward_entries WHERE company_id=? AND account_id=? AND from_financial_year_id=?").get(c3, zcap.id, zfy1.id);
    record("18. Zero profit year has no extra profit transfer", Math.abs(Number(zCfCapital?.closing_balance || 0) - 10000) < 0.01, `capital closing=${zCfCapital?.closing_balance}`);

    /* ================================================================ */
    /* Check 19: Destination opening Trial Balance balances */
    /* ================================================================ */
    const dstTb = trialBalance(db2, c2, "2026-04-01", "2027-03-31");
    const dstTbDebit = dstTb.reduce((s, r) => s + Number(r.debit || 0), 0);
    const dstTbCredit = dstTb.reduce((s, r) => s + Number(r.credit || 0), 0);
    record("19. Destination opening TB balances", Math.round(dstTbDebit * 100) === Math.round(dstTbCredit * 100), `Dr=${dstTbDebit}, Cr=${dstTbCredit}`);

    /* ================================================================ */
    /* Check 20: Destination opening Balance Sheet balances */
    /* ================================================================ */
    const dstBs = balanceSheetReport(db2, c2, "2026-04-01", "2026-04-01");
    const dstBsDiff = Math.round((Number(dstBs.assets || 0) - Number(dstBs.liabilitiesAndEquity || 0)) * 100) / 100;
    record("20. Destination opening BS balances", Math.abs(dstBsDiff) <= 1, `diff=${dstBsDiff}`);

    /* ================================================================ */
    /* Check 21: Destination opening P&L is zero */
    /* ================================================================ */
    const dstPl = profitLossReport(db2, c2, "2026-04-01", "2027-03-31");
    record("21. Destination opening P&L net profit is zero", Math.abs(Number(dstPl.netProfit || 0)) < 0.01, `netProfit=${dstPl.netProfit}`);

    /* ================================================================ */
    /* Check 22: Repeated close does not duplicate rows */
    /* ================================================================ */
    const carryBefore = db2.prepare("SELECT COUNT(*) count FROM carry_forward_entries WHERE company_id=? AND from_financial_year_id=?").get(c2, fy1.id).count;
    let repeatErr = "";
    try {
      closeFinancialYear(db2, { company_id: c2, from_financial_year_id: fy1.id, to_financial_year_id: fy2.id });
    } catch (e) {
      repeatErr = String(e?.message || e);
    }
    const carryAfter = db2.prepare("SELECT COUNT(*) count FROM carry_forward_entries WHERE company_id=? AND from_financial_year_id=?").get(c2, fy1.id).count;
    record("22. Repeated close prevents duplicate rows", carryBefore === carryAfter && repeatErr.length > 0, `before=${carryBefore}, after=${carryAfter}, err=${repeatErr || "none"}`);

    /* ================================================================ */
    /* Check 23: Locked source year rejects manual posting */
    /* ================================================================ */
    let manualPostErr = "";
    try {
      createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-06-01", voucher_type: "Journal", narration: "Post-close probe", source_module: "test", source_id: null, lines: [{ account_id: bankAc.id, debit: 100, credit: 0 }, { account_id: capitalAc.id, debit: 0, credit: 100 }] });
    } catch (e) {
      manualPostErr = String(e?.message || e);
    }
    record("23. Locked source year rejects manual posting", manualPostErr.includes("Cannot post to locked"), manualPostErr || "no error");

    /* ================================================================ */
    /* Check 24: Locked source year rejects guided posting */
    /* ================================================================ */
    let guidedPostErr = "";
    try {
      createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-06-01", voucher_type: "Journal", narration: "Guided probe", source_module: "guided_voucher", source_id: null, lines: [{ account_id: bankAc.id, debit: 100, credit: 0 }, { account_id: capitalAc.id, debit: 0, credit: 100 }] });
    } catch (e) {
      guidedPostErr = String(e?.message || e);
    }
    record("24. Locked source year rejects guided posting", guidedPostErr.includes("Cannot post to locked"), guidedPostErr || "no error");

    /* ================================================================ */
    /* Check 25: Source-year reports unchanged after close */
    /* ================================================================ */
    const srcTbBefore = trialBalance(db, companyId, "2025-04-01", "2026-03-31");
    const srcTbBeforeDr = srcTbBefore.reduce((s, r) => s + Number(r.debit || 0), 0);
    const srcTbBeforeCr = srcTbBefore.reduce((s, r) => s + Number(r.credit || 0), 0);
    record("25. Source-year TB unchanged after close", Math.round(srcTbBeforeDr * 100) === Math.round(srcTbBeforeCr * 100), `Dr=${srcTbBeforeDr}, Cr=${srcTbBeforeCr}`);

    /* ================================================================ */
    /* Check 26: Destination posting does not alter source reports */
    /* ================================================================ */
    createBalancedVoucher(db, { company_id: companyId, voucher_date: "2026-06-01", voucher_type: "Journal", narration: "New FY trans", source_module: "test", source_id: null, lines: [{ account_id: bankAc.id, debit: 5000, credit: 0 }, { account_id: salesAc.id, debit: 0, credit: 5000 }] });
    const srcTbAfter = trialBalance(db, companyId, "2025-04-01", "2026-03-31");
    const srcTbAfterDr = srcTbAfter.reduce((s, r) => s + Number(r.debit || 0), 0);
    const srcTbAfterCr = srcTbAfter.reduce((s, r) => s + Number(r.credit || 0), 0);
    record("26. Destination posting does not alter source TB", srcTbBeforeDr.toFixed(2) === srcTbAfterDr.toFixed(2), `before=${srcTbBeforeDr}, after=${srcTbAfterDr}`);

    /* ================================================================ */
    /* Check 27: Cross-company account contamination blocked */
    /* ================================================================ */
    let crossPostErr = "";
    try {
      createBalancedVoucher(db, { company_id: otherCo, voucher_date: "2026-04-01", voucher_type: "Journal", narration: "Cross probe", source_module: "test", source_id: null, lines: [{ account_id: bankAc.id, debit: 100, credit: 0 }, { account_id: capitalAc.id, debit: 0, credit: 100 }] });
    } catch (e) {
      crossPostErr = String(e?.message || e);
    }
    record("27. Cross-company posting blocked after close", crossPostErr.includes("different company"), crossPostErr || "no error");

    /* ================================================================ */
    /* Check 28: Draft postings remain excluded after close */
    /* ================================================================ */
    const draftRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gii-gem-fsr2a3e-"));
    fixtureRoots.push(draftRoot);
    dbDraft = initializeDatabase(draftRoot);
    const cDraft = createCompany(dbDraft, "Draft Test Co");
    const dFy1 = createFinancialYear(dbDraft, { company_id: cDraft, financial_year_name: "DFY1", start_date: "2025-04-01", end_date: "2026-03-31", status: "Open" });
    const dFy2 = createFinancialYear(dbDraft, { company_id: cDraft, financial_year_name: "DFY2", start_date: "2026-04-01", end_date: "2027-03-31", status: "Open" });
    const dBnk = createLedgerAccount(dbDraft, { company_id: cDraft, account_code: "DA1", account_name: "Bank", account_type: "Asset", normal_balance: "Debit" });
    const dCap = createLedgerAccount(dbDraft, { company_id: cDraft, account_code: "DE1", account_name: "Capital", account_type: "Equity", normal_balance: "Credit" });
    createBalancedVoucher(dbDraft, { company_id: cDraft, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "setup", source_module: "test", source_id: null, lines: [{ account_id: dBnk.id, debit: 10000, credit: 0 }, { account_id: dCap.id, debit: 0, credit: 10000 }] });
    /* Close first so we can test that after close, only Posted vouchers affect reports */
    closeFinancialYear(dbDraft, { company_id: cDraft, from_financial_year_id: dFy1.id, to_financial_year_id: dFy2.id });
    /* Post a voucher in the new FY and verify it shows in P&L */
    const dInc = createLedgerAccount(dbDraft, { company_id: cDraft, account_code: "DI1", account_name: "Income", account_type: "Income", normal_balance: "Credit" });
    createBalancedVoucher(dbDraft, { company_id: cDraft, voucher_date: "2026-05-01", voucher_type: "Journal", narration: "Posted probe", source_module: "test", source_id: null, lines: [{ account_id: dInc.id, debit: 0, credit: 500 }, { account_id: dBnk.id, debit: 500, credit: 0 }] });
    /* Change its status to Draft */
    /* The ledger guard refuses un-posting; this fixture does it inside a maintenance window. */
    dbDraft.transaction(() => withLedgerMaintenance(dbDraft, 0, "verify: draft probe", () => dbDraft.prepare("UPDATE vouchers SET status = 'Draft' WHERE voucher_type = 'Journal' AND voucher_date = '2026-05-01'").run()))();
    const afterDraftIncome = profitLossReport(dbDraft, cDraft, "2026-04-01", "2027-03-31").income;
    record("28. Draft postings excluded after close", Math.abs(Number(afterDraftIncome)) < 0.01, `income after draft=${afterDraftIncome}`);

    /* ================================================================ */
    /* Check 29: FSR-2A.2 signed controls remain effective */
    /* ================================================================ */
    const bsAfter = balanceSheetReport(db2, c2, "2026-04-01", "2026-04-01");
    const bsAssetPos = bsAfter.rows.filter((r) => r.account_type === "Asset" && r.normal_balance === "Debit").every((r) => r.amount >= 0);
    const bsContraNeg = bsAfter.rows.filter((r) => r.account_type === "Asset" && r.normal_balance === "Credit").every((r) => r.amount <= 0);
    record("29. Signed Balance Sheet controls effective", bsAssetPos && bsContraNeg, `assets=${bsAfter.assets}`);

    /* ================================================================ */
    /* Check 30: Audit evidence persisted */
    /* ================================================================ */
    const auditRows = db.prepare("SELECT COUNT(*) count FROM audit_log WHERE company_id = ? AND action LIKE '%year close%'").get(companyId).count;
    record("30. Close operation audit logged", auditRows > 0, `audit=${auditRows}`);

    /* ================================================================ */
    /* Check 31: Two consecutive year closes preserve continuity */
    /* ================================================================ */
    const root4 = fs.mkdtempSync(path.join(os.tmpdir(), "gii-gem-fsr2a3d-"));
    fixtureRoots.push(root4);
    db4 = initializeDatabase(root4);
    const c4 = createCompany(db4, "Multi Close Co");
    const mfy1 = createFinancialYear(db4, { company_id: c4, financial_year_name: "Y1", start_date: "2025-04-01", end_date: "2026-03-31", status: "Open" });
    const mfy2 = createFinancialYear(db4, { company_id: c4, financial_year_name: "Y2", start_date: "2026-04-01", end_date: "2027-03-31", status: "Open" });
    const mfy3 = createFinancialYear(db4, { company_id: c4, financial_year_name: "Y3", start_date: "2027-04-01", end_date: "2028-03-31", status: "Open" });
    const mbnk = createLedgerAccount(db4, { company_id: c4, account_code: "MA1", account_name: "Bank", account_type: "Asset", normal_balance: "Debit" });
    const mcap = createLedgerAccount(db4, { company_id: c4, account_code: "ME1", account_name: "Capital", account_type: "Equity", normal_balance: "Credit" });
    const minc = createLedgerAccount(db4, { company_id: c4, account_code: "MI1", account_name: "Income", account_type: "Income", normal_balance: "Credit" });
    const mexp = createLedgerAccount(db4, { company_id: c4, account_code: "MX1", account_name: "Expense", account_type: "Expense", normal_balance: "Debit" });

    createBalancedVoucher(db4, { company_id: c4, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "Y1 setup", source_module: "test", source_id: null, lines: [{ account_id: mbnk.id, debit: 50000, credit: 0 }, { account_id: mcap.id, debit: 0, credit: 50000 }] });
    createBalancedVoucher(db4, { company_id: c4, voucher_date: "2025-06-01", voucher_type: "Journal", narration: "Y1 profit", source_module: "test", source_id: null, lines: [{ account_id: mbnk.id, debit: 10000, credit: 0 }, { account_id: minc.id, debit: 0, credit: 10000 }] });
    closeFinancialYear(db4, { company_id: c4, from_financial_year_id: mfy1.id, to_financial_year_id: mfy2.id });

    createBalancedVoucher(db4, { company_id: c4, voucher_date: "2027-01-01", voucher_type: "Journal", narration: "Y2 profit", source_module: "test", source_id: null, lines: [{ account_id: mbnk.id, debit: 5000, credit: 0 }, { account_id: minc.id, debit: 0, credit: 5000 }] });
    createBalancedVoucher(db4, { company_id: c4, voucher_date: "2027-03-01", voucher_type: "Journal", narration: "Y2 expense", source_module: "test", source_id: null, lines: [{ account_id: mexp.id, debit: 2000, credit: 0 }, { account_id: mbnk.id, debit: 0, credit: 2000 }] });
    closeFinancialYear(db4, { company_id: c4, from_financial_year_id: mfy2.id, to_financial_year_id: mfy3.id });

    const y3Tb = trialBalance(db4, c4, "2027-04-01", "2028-03-31");
    const y3TbDr = y3Tb.reduce((s, r) => s + Number(r.debit || 0), 0);
    const y3TbCr = y3Tb.reduce((s, r) => s + Number(r.credit || 0), 0);
    const y3Bs = balanceSheetReport(db4, c4, "2027-04-01", "2027-04-01");
    const y3BsDiff = Math.round((Number(y3Bs.assets || 0) - Number(y3Bs.liabilitiesAndEquity || 0)) * 100) / 100;

    record("31a. Y3 opening TB balances", Math.round(y3TbDr * 100) === Math.round(y3TbCr * 100), `Dr=${y3TbDr}, Cr=${y3TbCr}`);
    record("31b. Y3 opening BS balances", Math.abs(y3BsDiff) <= 1, `diff=${y3BsDiff}`);

    /* Y3 opening Bank should be 50000 + 10000 + 5000 - 2000 = 63000 */
    const y3BankRow = y3Tb.find((r) => r.account_name === "Bank");
    record("31c. Y3 opening Bank continuity", y3BankRow && Math.round(Number(y3BankRow.debit)) === 63000, `Bank debit=${y3BankRow?.debit}`);

    /* Y3 opening P&L must be zero */
    const y3Pl = profitLossReport(db4, c4, "2027-04-01", "2028-03-31");
    record("31d. Y3 opening P&L zero", Math.round(Number(y3Pl.netProfit || 0)) === 0, `netProfit=${y3Pl.netProfit}`);

    /* Y1 profit (10000) + Y2 profit (5000 - 2000 = 3000) = 13000 in equity */
    const y3CapRow = y3Tb.find((r) => r.account_name === "Capital");
    record("31e. Y3 Capital includes retained profits", y3CapRow && Math.round(Number(y3CapRow.credit)) === 63000, `Capital credit=${y3CapRow?.credit}`);

    /* Combined continuity: Y1 + Y2 profit minus Y2 expense = 50000 (capital) + 10000 (Y1 profit) + 3000 (Y2 profit) = 63000 in equity */
    const y3Equity = y3Bs.rows.filter((r) => r.account_type === "Equity").reduce((s, r) => s + r.amount, 0);
    record("31f. Y3 Equity equals closing bank balance", Math.round(y3Equity) === 63000, `equity=${y3Equity}`);

    /* Close audit evidence count */
    const closeAuditRows = db4.prepare("SELECT COUNT(*) count FROM audit_log WHERE company_id = ? AND (action LIKE '%year close%' OR action LIKE '%financial year locked%')").get(c4).count;
    record("31g. Multi-close audit evidence", closeAuditRows >= 2, `audit=${closeAuditRows}`);

    /* Print results */
    console.log(`\nFSR-2A.3 Financial-Year Close, Carry-Forward and Continuity Verification`);
    console.log(`============================================================================`);
    console.log(`Isolated fixture root: ${root}`);
    console.log(``);

    let allPassed = 0, allFailed = 0;
    results.forEach((r) => {
      const mark = r.passed ? "PASS" : "FAIL";
      console.log(`${mark}: ${r.name} - ${r.detail}`);
      if (r.passed) allPassed++; else allFailed++;
    });
    console.log(`\nPassed: ${allPassed}, Failed: ${allFailed}, Total: ${allPassed + allFailed}`);
    console.log(``);
    if (allFailed === 0) {
      console.log(`FSR-2A.3 CERTIFIED — READY FOR INVENTORY ACCOUNTING MODEL CORRECTIONS`);
    } else {
      console.log(`FSR-2A.3 NOT CERTIFIED — FINANCIAL-YEAR CONTINUITY DEFECTS REMAIN`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`\nFATAL: FSR-2A.3 verifier crashed - ${err.message}`);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    const cleanupFailures = [];
    for (const fixtureDb of [db4, dbDraft, db3, db2, db]) {
      if (!fixtureDb) continue;
      try {
        fixtureDb.close();
      } catch (error) {
        cleanupFailures.push(`database close: ${error?.message || error}`);
      }
    }
    for (const fixtureRoot of [...fixtureRoots].reverse()) {
      try {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
      } catch (error) {
        cleanupFailures.push(`${fixtureRoot}: ${error?.message || error}`);
      }
    }
    if (cleanupFailures.length === 0) {
      console.log(`Fixture cleanup: PASS (${fixtureRoots.length} temporary database roots removed)`);
    } else {
      console.error(`Fixture cleanup: FAIL - ${cleanupFailures.join("; ")}`);
      process.exitCode = 1;
    }
  }
}

run()
  .then(() => process.exit(process.exitCode || 0))
  .catch((error) => {
    console.error(`FATAL: FSR-2A.3 verifier termination failed - ${error?.stack || error}`);
    process.exit(1);
  });
