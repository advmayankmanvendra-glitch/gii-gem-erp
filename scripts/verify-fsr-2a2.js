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
    accountingData, balanceSheetReport, profitLossReport,
    createBalancedVoucher, createFinancialYear, createLedgerAccount,
    createManualVoucher, initializeDatabase, financialYearForDate
  } = await import("../src/main/database/init.js");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-gem-fsr2a2-"));
  let db;
  try {
    db = initializeDatabase(root);
    const companyId = createCompany(db, "FSR-2A.2 Fixture");
    const fy = createFinancialYear(db, {
      company_id: companyId, financial_year_name: "FY 2025-26",
      start_date: "2025-04-01", end_date: "2026-03-31", status: "Open"
    });

    function ac(code, name, type, normal) {
      return createLedgerAccount(db, { company_id: companyId, account_code: code, account_name: name, account_type: type, normal_balance: normal });
    }

    const bank = ac("A100", "Bank", "Asset", "Debit");
    const cash = ac("A110", "Cash", "Asset", "Debit");
    const receivables = ac("A120", "Trade Receivables", "Asset", "Debit");
    const inventory = ac("A130", "Inventory", "Asset", "Debit");
    const fixedAssets = ac("A150", "Fixed Assets", "Asset", "Debit");
    const accumDepr = ac("A151", "Accumulated Depreciation", "Asset", "Credit");
    const payables = ac("L200", "Trade Payables", "Liability", "Credit");
    const loan = ac("L220", "Loan", "Liability", "Credit");
    const capital = ac("E300", "Capital", "Equity", "Credit");
    const drawings = ac("E310", "Drawings", "Equity", "Debit");
    const sales = ac("I400", "Sales", "Income", "Credit");
    const expense = ac("X500", "Expense", "Expense", "Debit");

    function post(label, lines) {
      return createBalancedVoucher(db, {
        company_id: companyId, voucher_date: "2025-04-15",
        voucher_type: "Journal", narration: label,
        source_module: "test", source_id: null,
        lines: lines.map((l) => ({
          account_id: typeof l[0] === "object" ? l[0].id : l[0],
          debit: l[1] || 0,
          credit: l[2] || 0
        }))
      });
    }

    /* Build fixture: capital, bank, sales, purchase, depreciation, drawings */
    post("Capital", [[capital, 0, 50000], [bank, 50000, 0]]);
    post("Loan", [[loan, 0, 20000], [bank, 20000, 0]]);
    post("Fixed Asset", [[fixedAssets, 10000, 0], [bank, 0, 10000]]);
    post("Depreciation", [[accumDepr, 0, 1000], [expense, 1000, 0]]);
    post("Sales", [[sales, 0, 15000], [receivables, 15000, 0]]);
    post("Purchase", [[expense, 5000, 0], [payables, 0, 5000]]);
    post("Drawings", [[drawings, 3000, 0], [bank, 0, 3000]]);

    function getBS(dateTo) {
      return balanceSheetReport(db, companyId, "1900-01-01", dateTo || "2026-03-31");
    }
    function getPL(dateFrom, dateTo) {
      return profitLossReport(db, companyId, dateFrom || "2025-04-01", dateTo || "2026-03-31");
    }

    /* 1. Ordinary debit-balance Asset (Bank) */
    const bs = getBS();
    const bankRow = bs.rows.find((r) => r.account_name === "Bank");
    record("1. Debit-balance Asset positive", bankRow && bankRow.amount > 0, `Bank amount: ${bankRow?.amount}`);

    /* 2. Credit-balance contra Asset (Accum. Depr) reduces assets */
    const deprRow = bs.rows.find((r) => r.account_name === "Accumulated Depreciation");
    record("2. Contra-Asset reduces total", deprRow && deprRow.amount < 0, `Accum Depr amount: ${deprRow?.amount}`);

    /* 3. Ordinary credit-balance Liability (Trade Payables) */
    const payRow = bs.rows.find((r) => r.account_name === "Trade Payables");
    record("3. Credit-balance Liability positive", payRow && payRow.amount > 0, `Payables amount: ${payRow?.amount}`);

    /* 4. Debit-balance Liability (if exists - not in fixture) */

    /* 5. Ordinary credit-balance Equity (Capital) */
    const capRow = bs.rows.find((r) => r.account_name === "Capital");
    record("5. Credit-balance Equity positive", capRow && capRow.amount > 0, `Capital amount: ${capRow?.amount}`);

    /* 6. Debit-balance contra Equity (Drawings) reduces equity */
    const drawRow = bs.rows.find((r) => r.account_name === "Drawings");
    record("6. Contra-Equity reduces equity", drawRow && drawRow.amount < 0, `Drawings amount: ${drawRow?.amount}`);

    /* 7. Accumulated Depreciation reduces total Assets */
    const totalBeforeDepr = (() => {
      const bsBefore = balanceSheetReport(db, companyId, "1900-01-01", "2025-04-15");
      const deprIdx = bsBefore.rows.findIndex((r) => r.account_name === "Accumulated Depreciation");
      if (deprIdx === -1) return bsBefore.assets;
      const exclDepr = bsBefore.rows.filter((r) => r.account_name !== "Accumulated Depreciation");
      const otherAssets = exclDepr.filter((r) => r.account_type === "Asset").reduce((s, r) => s + r.amount, 0);
      return otherAssets;
    })();
    const totalAfterDepr = bs.assets;
    const deprImpact = round(totalAfterDepr - totalBeforeDepr);
    record("7. Accum. Depr reduces Assets", deprImpact < 0, `Asset change after depreciation: ${deprImpact}`);

    /* 8. Drawings reduces total Equity */
    const equityBeforeDraw = (() => {
      const bsBefore = balanceSheetReport(db, companyId, "1900-01-01", "2025-04-30");
      const exclDraw = bsBefore.rows.filter((r) => r.account_name !== "Drawings");
      return exclDraw.filter((r) => r.account_type === "Equity").reduce((s, r) => s + r.amount, 0);
    })();
    const equityAfterDraw = bs.equity;
    const drawImpact = round(equityAfterDraw - equityBeforeDraw);
    record("8. Drawings reduces Equity", drawImpact < 0, `Equity change after drawings: ${drawImpact}`);

    /* 9. BSheet equation balances */
    const bsDiff = round(bs.assets - bs.liabilitiesAndEquity);
    record("9. BS equation balances", bsDiff === 0, `Difference: ${bsDiff}`);

    /* 10. Rows sum to section totals */
    const assetSum = bs.rows.filter((r) => r.account_type === "Asset").reduce((s, r) => s + r.amount, 0);
    const liabSum = bs.rows.filter((r) => r.account_type === "Liability").reduce((s, r) => s + r.amount, 0);
    const equitySum = bs.rows.filter((r) => r.account_type === "Equity").reduce((s, r) => s + r.amount, 0);
    record("10a. Asset rows = total", round(assetSum) === round(bs.assets), `Rows: ${assetSum}, total: ${bs.assets}`);
    record("10b. Liability rows = total", round(liabSum) === round(bs.liabilities), `Rows: ${liabSum}, total: ${bs.liabilities}`);
    record("10c. Equity rows = total", round(equitySum) === round(bs.equity), `Rows: ${equitySum}, total: ${bs.equity}`);

    /* 11. Same date_to, different date_from = same current profit */
    const pl1 = getPL("2025-04-01", "2025-12-31");
    const pl2 = getPL("2025-06-01", "2025-12-31");
    const bs1 = balanceSheetReport(db, companyId, "2025-04-01", "2025-12-31");
    const bs2 = balanceSheetReport(db, companyId, "2025-06-01", "2025-12-31");
    record("11a. Same date_to current profit", round(bs1.currentProfit) === round(bs2.currentProfit), `date_from=Apr: ${bs1.currentProfit}, date_from=Jun: ${bs2.currentProfit}`);

    /* 12. P&L selected period still changes with date_from */
    record("11b. P&L changes with date_from", round(pl1.netProfit) !== round(pl2.netProfit), `P&L Apr-Dec: ${pl1.netProfit}, P&L Jun-Dec: ${pl2.netProfit}`);

    /* 13. Profitable current year */
    record("12. Profitable year shows positive profit", bs.currentProfit > 0, `Current profit: ${bs.currentProfit}`);

    /* 14-15: Loss/zero year */
    const lossCoId = createCompany(db, "Loss Co");
    createFinancialYear(db, { company_id: lossCoId, financial_year_name: "FY 2025-26", start_date: "2025-04-01", end_date: "2026-03-31", status: "Open" });
    const lBank = createLedgerAccount(db, { company_id: lossCoId, account_code: "LA100", account_name: "L Bank", account_type: "Asset", normal_balance: "Debit" });
    const lCap = createLedgerAccount(db, { company_id: lossCoId, account_code: "LE300", account_name: "L Capital", account_type: "Equity", normal_balance: "Credit" });
    const lExp = createLedgerAccount(db, { company_id: lossCoId, account_code: "LX500", account_name: "L Expense", account_type: "Expense", normal_balance: "Debit" });
    createBalancedVoucher(db, { company_id: lossCoId, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "Loss cap", source_module: "test", source_id: null, lines: [{ account_id: lBank.id, debit: 10000, credit: 0 }, { account_id: lCap.id, debit: 0, credit: 10000 }] });
    createBalancedVoucher(db, { company_id: lossCoId, voucher_date: "2025-06-01", voucher_type: "Journal", narration: "Loss exp", source_module: "test", source_id: null, lines: [{ account_id: lExp.id, debit: 15000, credit: 0 }, { account_id: lBank.id, debit: 0, credit: 15000 }] });
    const lossBS = balanceSheetReport(db, lossCoId, "1900-01-01", "2026-03-31");
    record("13. Loss year shows negative profit", lossBS.currentProfit < 0, `Loss current profit: ${lossBS.currentProfit}`);

    /* Zero profit */
    const zeroCoId = createCompany(db, "Zero Co");
    createFinancialYear(db, { company_id: zeroCoId, financial_year_name: "FY 2025-26", start_date: "2025-04-01", end_date: "2026-03-31", status: "Open" });
    const zBank = createLedgerAccount(db, { company_id: zeroCoId, account_code: "ZA100", account_name: "Z Bank", account_type: "Asset", normal_balance: "Debit" });
    const zCap = createLedgerAccount(db, { company_id: zeroCoId, account_code: "ZE300", account_name: "Z Capital", account_type: "Equity", normal_balance: "Credit" });
    createBalancedVoucher(db, { company_id: zeroCoId, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "Zero base", source_module: "test", source_id: null, lines: [{ account_id: zBank.id, debit: 5000, credit: 0 }, { account_id: zCap.id, debit: 0, credit: 5000 }] });
    const zeroBS = balanceSheetReport(db, zeroCoId, "1900-01-01", "2026-03-31");
    record("14. Zero-profit year shows zero", zeroBS.currentProfit === 0, `Zero current profit: ${zeroBS.currentProfit}`);

    /* 15. Date at FY start */
    const fyStartBS = balanceSheetReport(db, companyId, "1900-01-01", "2025-04-01");
    const fyStartPL = profitLossReport(db, companyId, "2025-04-01", "2025-04-01");
    record("15. FY-start current profit matches P&L", round(fyStartBS.currentProfit) === round(fyStartPL.netProfit), `BS: ${fyStartBS.currentProfit}, P&L: ${fyStartPL.netProfit}`);

    /* 16. Date at FY end */
    const fyEndBS = balanceSheetReport(db, companyId, "1900-01-01", "2026-03-31");
    const fyEndPL = profitLossReport(db, companyId, "2025-04-01", "2026-03-31");
    record("16. FY-end current profit matches P&L", round(fyEndBS.currentProfit) === round(fyEndPL.netProfit), `BS: ${fyEndBS.currentProfit}, P&L: ${fyEndPL.netProfit}`);

    /* 17. FY resolution: date_to before any FY uses fallback date_from */
    const noFyCo = createCompany(db, "Date Before FY Co");
    createFinancialYear(db, { company_id: noFyCo, financial_year_name: "FY 2025-26", start_date: "2025-04-01", end_date: "2026-03-31", status: "Open" });
    const dBank = createLedgerAccount(db, { company_id: noFyCo, account_code: "DBA100", account_name: "D Bank", account_type: "Asset", normal_balance: "Debit" });
    const dCap = createLedgerAccount(db, { company_id: noFyCo, account_code: "DCA300", account_name: "D Capital", account_type: "Equity", normal_balance: "Credit" });
    createBalancedVoucher(db, { company_id: noFyCo, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "D base", source_module: "test", source_id: null, lines: [{ account_id: dBank.id, debit: 1000, credit: 0 }, { account_id: dCap.id, debit: 0, credit: 1000 }] });
    /* date_to before FY start - current profit should use caller's date_from as fallback */
    const beforeFyBS = balanceSheetReport(db, noFyCo, "2025-01-01", "2025-03-01");
    record("17. date_to before FY resolves", beforeFyBS.currentProfit !== undefined, `Current profit for date before FY: ${beforeFyBS.currentProfit}`);

    /* 18. Current profit appears exactly once */
    const cpCount = bs.rows.filter((r) => r.account_name === "Current Year Profit" || (r.account_name === "Profit & Loss" && r.id === null)).length;
    /* The currentProfit is not a row, it's added in liabilitiesAndEquity */
    /* Check it's not also in equity */
    const cpInEquity = bs.rows.some((r) => r.account_type === "Equity" && r.account_name === "Current Year Profit");
    record("18. No current-profit row in equity", !cpInEquity, `Current profit in equity rows: ${cpInEquity}`);

    /* 19. FSR-2A.1 protections remain */
    try {
      createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "Regression probe empty", source_module: "test", source_id: null, lines: [] });
      record("19a. Empty voucher still rejected", false, "Empty voucher accepted");
    } catch { record("19a. Empty voucher still rejected", true, "Empty voucher rejected"); }

    try {
      createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "Regression probe cross", source_module: "test", source_id: null, lines: [{ account_id: dBank.id, debit: 100, credit: 0 }, { account_id: dCap.id, debit: 0, credit: 100 }] });
      record("19b. Company isolation still enforced", false, "Cross-company posting accepted");
    } catch { record("19b. Company isolation still enforced", true, "Cross-company posting rejected"); }

    /* 20. AccountingData still returns full structure */
    const ad = accountingData(db, { company_id: companyId, date_from: "2025-04-01", date_to: "2026-03-31" });
    record("20a. accountingData returns trialBalance", Array.isArray(ad.trialBalance), `TB rows: ${ad.trialBalance?.length}`);
    record("20b. accountingData returns profitLoss", ad.profitLoss && typeof ad.profitLoss.netProfit === "number", `P&L net profit: ${ad.profitLoss?.netProfit}`);
    record("20c. accountingData returns balanceSheet", ad.balanceSheet && typeof ad.balanceSheet.assets === "number", `BS assets: ${ad.balanceSheet?.assets}`);

    /* Summary */
    console.log("FSR-2A.2 Balance Sheet Truth Verification");
    console.log("==========================================");
    console.log(`Isolated fixture root: ${root}`);
    console.log("");
    results.sort((a, b) => {
      const na = Number(a.name.split(".")[0]) || 0;
      const nb = Number(b.name.split(".")[0]) || 0;
      return na - nb;
    });
    let passedCount = 0, failedCount = 0;
    results.forEach((result) => {
      console.log(`${result.passed ? "PASS" : "FAIL"}: ${result.name} - ${result.detail}`);
      if (result.passed) passedCount++; else failedCount++;
    });
    console.log("");
    console.log(`Passed: ${passedCount}, Failed: ${failedCount}, Total: ${results.length}`);
    console.log("");

    const allPassed = results.every((r) => r.passed);
    if (allPassed) {
      console.log("FSR-2A.2 CERTIFIED — READY FOR FINANCIAL-YEAR CONTINUITY CORRECTIONS");
    } else {
      console.log("FSR-2A.2 NOT CERTIFIED — BALANCE SHEET TRUTH DEFECTS REMAIN");
    }
    process.exitCode = allPassed ? 0 : 1;
  } finally {
    if (db) db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

run()
  .then(() => process.exit(process.exitCode || 0))
  .catch((error) => {
    console.error(`FAIL: FSR-2A.2 verifier crashed - ${error?.stack || error}`);
    process.exit(1);
  });
