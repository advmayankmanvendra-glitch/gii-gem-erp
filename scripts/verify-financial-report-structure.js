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
    "--disable-gpu",
    "--disable-gpu-compositing",
    "--disable-gpu-sandbox",
    "--disable-accelerated-2d-canvas",
    "--in-process-gpu",
    scriptPath,
    "--electron-child"
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

function columnNames(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
}

function tableNames(db) {
  return new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
}

function createCompany(db, name) {
  return Number(db.prepare("INSERT INTO companies (company_name, status) VALUES (?, 'active')").run(name).lastInsertRowid);
}

function expectedTotals(accountDefinitions, expectedLedger) {
  const byCode = new Map(accountDefinitions.map((account) => [account.code, account]));
  const balances = new Map();
  expectedLedger.forEach((line) => {
    const current = balances.get(line.code) || { debit: 0, credit: 0 };
    current.debit += Number(line.debit || 0);
    current.credit += Number(line.credit || 0);
    balances.set(line.code, current);
  });
  let income = 0;
  let expenses = 0;
  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  balances.forEach((movement, code) => {
    const account = byCode.get(code);
    if (!account) return;
    if (account.type === "Income") income += movement.credit - movement.debit;
    if (account.type === "Expense") expenses += movement.debit - movement.credit;
    if (account.type === "Asset") assets += movement.debit - movement.credit;
    if (account.type === "Liability") liabilities += movement.credit - movement.debit;
    if (account.type === "Equity") equity += movement.credit - movement.debit;
  });
  return {
    debit: round(expectedLedger.reduce((sum, line) => sum + Number(line.debit || 0), 0)),
    credit: round(expectedLedger.reduce((sum, line) => sum + Number(line.credit || 0), 0)),
    income: round(income),
    expenses: round(expenses),
    netProfit: round(income - expenses),
    assets: round(assets),
    liabilities: round(liabilities),
    equityBeforeProfit: round(equity),
    liabilitiesAndEquity: round(liabilities + equity + income - expenses),
    balances
  };
}

async function run() {
  const {
    accountingData,
    closeFinancialYear,
    createBalancedVoucher,
    createFinancialYear,
    createLedgerAccount,
    createManualVoucher,
    createOpeningBalance,
    drilldownData,
    initializeDatabase,
    inventoryData,
    postStockInward
  } = await import("../src/main/database/init.js");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-gem-fsr1-"));
  let db;
  try {
    db = initializeDatabase(root);
    const tables = tableNames(db);
    const requiredTables = ["accounts", "vouchers", "voucher_lines", "ledger_entries", "financial_years", "stock_ledger"];
    record(
      "1. Accounting source-of-truth tables exist",
      requiredTables.every((table) => tables.has(table)),
      `Required: ${requiredTables.join(", ")}`
    );

    const companyId = createCompany(db, "FSR-1 Isolated Fixture Company");
    const fy = createFinancialYear(db, {
      company_id: companyId,
      financial_year_name: "FY 2025-26",
      start_date: "2025-04-01",
      end_date: "2026-03-31",
      status: "Open"
    });

    const accountDefinitions = [
      { code: "A100", name: "Bank", type: "Asset", normal: "Debit" },
      { code: "A110", name: "Cash", type: "Asset", normal: "Debit" },
      { code: "A120", name: "Trade Receivables", type: "Asset", normal: "Debit" },
      { code: "A130", name: "Inventory", type: "Asset", normal: "Debit" },
      { code: "A140", name: "Input GST", type: "Asset", normal: "Debit" },
      { code: "A150", name: "Fixed Assets", type: "Asset", normal: "Debit" },
      { code: "A151", name: "Accumulated Depreciation", type: "Asset", normal: "Credit" },
      { code: "A160", name: "Prepaid Expense", type: "Asset", normal: "Debit" },
      { code: "A170", name: "Supplier Advance", type: "Asset", normal: "Debit" },
      { code: "L200", name: "Trade Payables", type: "Liability", normal: "Credit" },
      { code: "L210", name: "Output GST", type: "Liability", normal: "Credit" },
      { code: "L220", name: "Loan", type: "Liability", normal: "Credit" },
      { code: "L230", name: "Expense Payable", type: "Liability", normal: "Credit" },
      { code: "L240", name: "Provision", type: "Liability", normal: "Credit" },
      { code: "L250", name: "Customer Advance", type: "Liability", normal: "Credit" },
      { code: "L260", name: "Tax Payable", type: "Liability", normal: "Credit" },
      { code: "E300", name: "Capital", type: "Equity", normal: "Credit" },
      { code: "E310", name: "Drawings", type: "Equity", normal: "Debit" },
      { code: "I400", name: "Sales", type: "Income", normal: "Credit" },
      { code: "I410", name: "Sales Returns", type: "Income", normal: "Debit" },
      { code: "I420", name: "Interest Income", type: "Income", normal: "Credit" },
      { code: "I430", name: "Discount Received", type: "Income", normal: "Credit" },
      { code: "I440", name: "Other Income", type: "Income", normal: "Credit" },
      { code: "X500", name: "Purchase", type: "Expense", normal: "Debit" },
      { code: "X510", name: "Purchase Returns", type: "Expense", normal: "Credit" },
      { code: "X520", name: "Cost of Goods Sold", type: "Expense", normal: "Debit" },
      { code: "X530", name: "Direct Expense", type: "Expense", normal: "Debit" },
      { code: "X540", name: "Administrative Expense", type: "Expense", normal: "Debit" },
      { code: "X550", name: "Bank Charges", type: "Expense", normal: "Debit" },
      { code: "X560", name: "Interest Expense", type: "Expense", normal: "Debit" },
      { code: "X570", name: "Discount Allowed", type: "Expense", normal: "Debit" },
      { code: "X580", name: "Depreciation", type: "Expense", normal: "Debit" },
      { code: "X590", name: "Tax Expense", type: "Expense", normal: "Debit" },
      { code: "X595", name: "Round Off", type: "Expense", normal: "Debit" },
      { code: "X596", name: "Provision Expense", type: "Expense", normal: "Debit" }
    ];
    const accounts = new Map();
    for (const account of accountDefinitions) {
      const row = createLedgerAccount(db, {
        company_id: companyId,
        account_code: account.code,
        account_name: account.name,
        account_type: account.type,
        normal_balance: account.normal
      });
      accounts.set(account.code, row.id);
    }

    const expectedLedger = [];
    const posted = [];
    function addExpected(lines) {
      lines.forEach((line) => expectedLedger.push({
        code: line.code,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0)
      }));
    }
    function post(label, voucherType, date, lines) {
      const voucher = createManualVoucher(db, {
        company_id: companyId,
        voucher_type: voucherType,
        voucher_date: date,
        narration: `FSR-1 ${label}`,
        lines: lines.map((line) => ({
          account_id: accounts.get(line.code),
          debit: Number(line.debit || 0),
          credit: Number(line.credit || 0)
        }))
      });
      addExpected(lines);
      posted.push({ label, voucher });
      return voucher;
    }

    createOpeningBalance(db, {
      company_id: companyId,
      financial_year_id: fy.id,
      balance_type: "Cash",
      account_id: accounts.get("A110"),
      opening_debit: 5000,
      opening_credit: 0,
      remarks: "FSR-1 governed opening fixture"
    });
    addExpected([{ code: "A110", debit: 5000 }, { code: "E300", credit: 5000 }]);

    post("Sales", "Sales", "2025-04-20", [
      { code: "A120", debit: 35400 }, { code: "I400", credit: 30000 }, { code: "L210", credit: 5400 }
    ]);
    post("Purchase", "Purchase", "2025-04-05", [
      { code: "A130", debit: 20000 }, { code: "A140", debit: 3600 }, { code: "L200", credit: 23600 }
    ]);
    post("Receipt", "Receipt", "2025-05-03", [{ code: "A100", debit: 20000 }, { code: "A120", credit: 20000 }]);
    post("Payment", "Payment", "2025-05-04", [{ code: "L200", debit: 10000 }, { code: "A100", credit: 10000 }]);
    post("Contra", "Contra", "2025-05-05", [{ code: "A110", debit: 2000 }, { code: "A100", credit: 2000 }]);
    post("Journal", "Journal", "2025-04-03", [{ code: "A100", debit: 250 }, { code: "I440", credit: 250 }]);
    post("Debit note", "Debit Note", "2025-04-08", [
      { code: "L200", debit: 118 }, { code: "X510", credit: 100 }, { code: "A140", credit: 18 }
    ]);
    post("Credit note", "Credit Note", "2025-04-22", [
      { code: "I410", debit: 100 }, { code: "L210", debit: 18 }, { code: "A120", credit: 118 }
    ]);
    post("Stock inward with financial impact", "Journal", "2025-04-10", [{ code: "A130", debit: 1000 }, { code: "L200", credit: 1000 }]);
    post("Stock outward with financial impact", "Journal", "2025-04-25", [{ code: "X520", debit: 700 }, { code: "A130", credit: 700 }]);
    post("Sales return", "Credit Note", "2025-04-28", [
      { code: "I410", debit: 3000 }, { code: "L210", debit: 540 }, { code: "A120", credit: 3540 }
    ]);
    post("Purchase return", "Debit Note", "2025-04-12", [
      { code: "L200", debit: 2360 }, { code: "X510", credit: 2000 }, { code: "A140", credit: 360 }
    ]);
    post("Advance receipt", "Receipt", "2025-05-06", [{ code: "A100", debit: 5000 }, { code: "L250", credit: 5000 }]);
    post("Supplier advance", "Payment", "2025-05-07", [{ code: "A170", debit: 4000 }, { code: "A100", credit: 4000 }]);
    post("Customer adjustment", "Journal", "2025-05-08", [{ code: "X570", debit: 125 }, { code: "A120", credit: 125 }]);
    post("Supplier adjustment", "Journal", "2025-05-09", [{ code: "L200", debit: 75 }, { code: "I430", credit: 75 }]);
    post("Bank charges", "Payment", "2025-05-10", [{ code: "X550", debit: 200 }, { code: "A100", credit: 200 }]);
    post("Interest income", "Receipt", "2025-05-11", [{ code: "A100", debit: 400 }, { code: "I420", credit: 400 }]);
    post("Interest expense", "Payment", "2025-05-12", [{ code: "X560", debit: 300 }, { code: "A100", credit: 300 }]);
    post("Tax posting", "Journal", "2025-05-13", [{ code: "X590", debit: 1500 }, { code: "L260", credit: 1500 }]);
    post("Discount allowed", "Journal", "2025-05-14", [{ code: "X570", debit: 375 }, { code: "A120", credit: 375 }]);
    post("Discount received", "Journal", "2025-05-15", [{ code: "L200", debit: 225 }, { code: "I430", credit: 225 }]);
    post("Round off", "Journal", "2025-05-16", [{ code: "X595", debit: 20 }, { code: "A120", credit: 20 }]);
    post("Capital introduction", "Journal", "2025-04-02", [{ code: "A100", debit: 100000 }, { code: "E300", credit: 100000 }]);
    post("Drawings", "Payment", "2025-05-17", [{ code: "E310", debit: 2500 }, { code: "A100", credit: 2500 }]);
    post("Fixed-asset purchase", "Purchase", "2025-04-04", [
      { code: "A150", debit: 10000 }, { code: "A140", debit: 1800 }, { code: "A100", credit: 11800 }
    ]);
    post("Depreciation", "Journal", "2025-05-18", [{ code: "X580", debit: 1000 }, { code: "A151", credit: 1000 }]);
    post("Accrued expense", "Journal", "2025-05-19", [{ code: "X540", debit: 800 }, { code: "L230", credit: 800 }]);
    post("Prepaid expense", "Payment", "2025-05-20", [{ code: "A160", debit: 1000 }, { code: "A100", credit: 1000 }]);
    post("Provision entry", "Journal", "2025-05-21", [{ code: "X596", debit: 700 }, { code: "L240", credit: 700 }]);
    post("Loan receipt", "Receipt", "2025-04-02", [{ code: "A100", debit: 20000 }, { code: "L220", credit: 20000 }]);
    post("Direct expense", "Payment", "2025-05-22", [{ code: "X530", debit: 1200 }, { code: "A100", credit: 1200 }]);
    post("Other income", "Receipt", "2025-05-23", [{ code: "A100", debit: 350 }, { code: "I440", credit: 350 }]);

    let unbalancedRejected = false;
    try {
      createManualVoucher(db, {
        company_id: companyId,
        voucher_type: "Journal",
        voucher_date: "2025-05-24",
        narration: "FSR-1 unbalanced rejection probe",
        lines: [{ account_id: accounts.get("A100"), debit: 10 }, { account_id: accounts.get("E300"), credit: 9 }]
      });
    } catch {
      unbalancedRejected = true;
    }
    record("2. Debit-credit enforcement exists", unbalancedRejected, "An executable unbalanced-voucher probe must be rejected");

    const expected = expectedTotals(accountDefinitions, expectedLedger);
    const fullData = accountingData(db, { company_id: companyId, date_from: "2025-04-01", date_to: "2026-03-31" });
    const actualTbDebit = round(fullData.trialBalance.reduce((sum, row) => sum + Number(row.debit || 0), 0));
    const actualTbCredit = round(fullData.trialBalance.reduce((sum, row) => sum + Number(row.credit || 0), 0));
    record("3. Trial Balance totals reconcile", actualTbDebit === actualTbCredit && actualTbDebit === expected.debit, `Expected/actual Dr ${expected.debit}/${actualTbDebit}; Cr ${expected.credit}/${actualTbCredit}`);
    record("4. P&L income and expense mapping is deterministic", round(fullData.profitLoss.income) === expected.income && round(fullData.profitLoss.expenses) === expected.expenses, `Expected income/expense ${expected.income}/${expected.expenses}; ERP ${round(fullData.profitLoss.income)}/${round(fullData.profitLoss.expenses)}`);
    record("5. Balance Sheet mapping is deterministic", round(fullData.balanceSheet.assets) === expected.assets && round(fullData.balanceSheet.liabilitiesAndEquity) === expected.liabilitiesAndEquity, `Expected A/L+E ${expected.assets}/${expected.liabilitiesAndEquity}; ERP ${round(fullData.balanceSheet.assets)}/${round(fullData.balanceSheet.liabilitiesAndEquity)}`);
    record("6. Current profit links to equity", round(fullData.balanceSheet.currentProfit) === round(fullData.profitLoss.netProfit), `P&L ${round(fullData.profitLoss.netProfit)}; Balance Sheet current profit ${round(fullData.balanceSheet.currentProfit)}`);
    const inventoryRows = fullData.balanceSheet.rows.filter((row) => row.account_name === "Inventory");
    const cogsRows = fullData.profitLoss.rows.filter((row) => row.account_name === "Cost of Goods Sold");
    record("7. Closing stock is not double-counted", inventoryRows.length === 1 && cogsRows.length === 1, `Inventory rows ${inventoryRows.length}; COGS rows ${cogsRows.length}`);

    const warehouseColumns = columnNames(db, "warehouses");
    const warehouseResult = warehouseColumns.has("company_id")
      ? db.prepare("INSERT INTO warehouses (warehouse_name, location, status, company_id) VALUES (?, ?, 'active', ?)").run("FSR-1 Isolated Warehouse", "Fixture", companyId)
      : db.prepare("INSERT INTO warehouses (warehouse_name, location, status) VALUES (?, ?, 'active')").run("FSR-1 Isolated Warehouse", "Fixture");
    const warehouseId = Number(warehouseResult.lastInsertRowid);
    const itemId = Number(db.prepare("INSERT INTO items (item_name, gst_rate, unit, status) VALUES (?, 18, 'Nos', 'active')").run("FSR-1 Inventory Reconciliation Item").lastInsertRowid);
    const inwardId = Number(db.prepare(`
      INSERT INTO stock_inwards (company_id, item_id, warehouse_id, inward_date, purchase_invoice_number, quantity, rate, landed_cost, posting_status, approval_status)
      VALUES (?, ?, ?, '2025-05-25', 'FSR-INWARD-1', 10, 100, 1000, 'Draft', 'Draft')
    `).run(companyId, itemId, warehouseId).lastInsertRowid);
    const inventoryGlBefore = Number(inventoryRows[0]?.amount || 0);
    postStockInward(db, inwardId);
    const inventoryAfter = inventoryData(db, { company_id: companyId, date_from: "2025-04-01", date_to: "2026-03-31" });
    const stockItem = inventoryAfter.stockSummary.find((row) => Number(row.item_id) === itemId);
    const inventoryGlAfter = Number(accountingData(db, { company_id: companyId, date_from: "2025-04-01", date_to: "2026-03-31" }).balanceSheet.rows.find((row) => row.account_name === "Inventory")?.amount || 0);
    record("8. Inventory value reconciles", round(inventoryGlAfter - inventoryGlBefore) === round(stockItem?.stock_value || 0), `Stock subledger increased ${round(stockItem?.stock_value || 0)}; Inventory GL increased ${round(inventoryGlAfter - inventoryGlBefore)}`);

    const accountColumns = columnNames(db, "accounts");
    const hasGroupRegistry = tables.has("account_groups") || tables.has("financial_statement_mappings");
    record("9. Group totals equal ledger totals", hasGroupRegistry && accountColumns.has("financial_statement_section"), "No governed account-group/report-mapping registry exists; renderer grouping is heuristic");

    const postingVariance = db.prepare(`
      SELECT v.id, v.voucher_number,
        ROUND(COALESCE(SUM(vl.debit), 0) - COALESCE((SELECT SUM(le.debit) FROM ledger_entries le WHERE le.voucher_id = v.id), 0), 2) debit_difference,
        ROUND(COALESCE(SUM(vl.credit), 0) - COALESCE((SELECT SUM(le.credit) FROM ledger_entries le WHERE le.voucher_id = v.id), 0), 2) credit_difference
      FROM vouchers v
      LEFT JOIN voucher_lines vl ON vl.voucher_id = v.id
      WHERE v.company_id = ? AND v.is_deleted = 0
      GROUP BY v.id
      HAVING debit_difference <> 0 OR credit_difference <> 0
    `).all(companyId);
    record("10. Ledger totals equal posting totals", postingVariance.length === 0, `${postingVariance.length} voucher-to-ledger variance(s)`);

    const ytdData = accountingData(db, { company_id: companyId, date_from: "2025-06-01", date_to: "2025-12-31" });
    record("11. Report period handling is correct", round(ytdData.balanceSheet.currentProfit) === expected.netProfit, `As-on Balance Sheet should include FY-to-date profit ${expected.netProfit}; ERP used selected-range profit ${round(ytdData.balanceSheet.currentProfit)}`);

    const saleVoucher = posted.find((entry) => entry.label === "Sales")?.voucher;
    const salesDrill = drilldownData(db, { company_id: companyId, account_id: accounts.get("I400"), date_from: "2025-04-01", date_to: "2026-03-31" });
    const voucherDrill = drilldownData(db, { company_id: companyId, voucher_id: saleVoucher?.id });
    record("14. Existing drill-down routes exist", salesDrill.ledger.length > 0 && voucherDrill.voucher?.header?.id === saleVoucher?.id, `Ledger rows ${salesDrill.ledger.length}; voucher ${voucherDrill.voucher?.header?.voucher_number || "missing"}`);
    record("15. Report data can be traced to vouchers", salesDrill.ledger.every((row) => row.voucher_id && row.voucher_number), "Account drill-down rows retain voucher IDs and numbers");

    const backendRowsHaveGovernedGroup = fullData.trialBalance.every((row) => Object.hasOwn(row, "structure_group"));
    const rendererGroupingSource = fs.readFileSync(path.join(repoRoot, "src", "renderer", "features", "reports", "accountingIntelligence.jsx"), "utf8");
    const rendererClassifiesGroups = rendererGroupingSource.includes("function classifyAccountGroup") || rendererGroupingSource.includes("export function classifyAccountGroup");
    record("16. Renderer does not bypass trusted financial classification", backendRowsHaveGovernedGroup || !rendererClassifiesGroups, "Backend rows have no governed group; renderer assigns financial groups by account-name heuristics");

    record("17. Balance Sheet equation passes for fixture", round(fullData.balanceSheet.assets - fullData.balanceSheet.liabilitiesAndEquity) === 0, `ERP difference ${round(fullData.balanceSheet.assets - fullData.balanceSheet.liabilitiesAndEquity)}; independent difference ${round(expected.assets - expected.liabilitiesAndEquity)}`);
    record("18. Trial Balance equality passes for fixture", actualTbDebit === actualTbCredit, `Debit ${actualTbDebit}; credit ${actualTbCredit}`);
    record("19. P&L agrees with independent fixture result", round(fullData.profitLoss.netProfit) === expected.netProfit, `Expected ${expected.netProfit}; ERP ${round(fullData.profitLoss.netProfit)}`);

    const voucherLineTypes = db.prepare("PRAGMA table_info(voucher_lines)").all().filter((row) => ["debit", "credit"].includes(row.name)).map((row) => row.type);
    const ledgerMoneyTypes = db.prepare("PRAGMA table_info(ledger_entries)").all().filter((row) => ["debit", "credit", "running_balance"].includes(row.name)).map((row) => row.type);
    const governedMinorUnits = [...voucherLineTypes, ...ledgerMoneyTypes].every((type) => /INT/i.test(type));
    record("20. Governed money representation is consistent", governedMinorUnits, `Voucher/ledger money column types: ${[...voucherLineTypes, ...ledgerMoneyTypes].join(", ")}; no integer-minor-unit contract`);

    createManualVoucher(db, {
      company_id: companyId,
      voucher_type: "Journal",
      voucher_date: "2025-05-26",
      narration: "FSR-1 decimal rounding probe",
      lines: [
        { account_id: accounts.get("A100"), debit: 0.1, credit: 0 },
        { account_id: accounts.get("A110"), debit: 0.2, credit: 0 },
        { account_id: accounts.get("E300"), debit: 0, credit: 0.3 }
      ]
    });
    const roundedData = accountingData(db, { company_id: companyId, date_from: "2025-04-01", date_to: "2026-03-31" });
    const roundedTbDifference = round(
      roundedData.trialBalance.reduce((sum, row) => sum + Number(row.debit || 0), 0)
      - roundedData.trialBalance.reduce((sum, row) => sum + Number(row.credit || 0), 0)
    );
    record("21. Rounding does not cause statement imbalance", roundedTbDifference === 0, `Rounded Trial Balance difference ${roundedTbDifference}`);

    const continuityCompanyId = createCompany(db, "FSR-1 Continuity Probe Company");
    const continuityFrom = createFinancialYear(db, { company_id: continuityCompanyId, financial_year_name: "FY 2025-26", start_date: "2025-04-01", end_date: "2026-03-31", status: "Open" });
    const continuityTo = createFinancialYear(db, { company_id: continuityCompanyId, financial_year_name: "FY 2026-27", start_date: "2026-04-01", end_date: "2027-03-31", status: "Open" });
    const continuityBank = createLedgerAccount(db, { company_id: continuityCompanyId, account_code: "CBANK", account_name: "Bank", account_type: "Asset", normal_balance: "Debit" });
    const continuityCapital = createLedgerAccount(db, { company_id: continuityCompanyId, account_code: "CCAP", account_name: "Capital", account_type: "Equity", normal_balance: "Credit" });
    createManualVoucher(db, {
      company_id: continuityCompanyId,
      voucher_type: "Journal",
      voucher_date: "2025-04-01",
      narration: "FSR-1 continuity opening",
      lines: [{ account_id: continuityBank.id, debit: 100, credit: 0 }, { account_id: continuityCapital.id, debit: 0, credit: 100 }]
    });
    let closeError = "";
    try {
      closeFinancialYear(db, { company_id: continuityCompanyId, from_financial_year_id: continuityFrom.id, to_financial_year_id: continuityTo.id });
    } catch (error) {
      closeError = String(error?.message || error);
    }
    const continuityStatus = db.prepare("SELECT status FROM financial_years WHERE id = ?").get(continuityFrom.id)?.status;
    const continuityRows = db.prepare("SELECT COUNT(*) count FROM carry_forward_entries WHERE company_id = ? AND from_financial_year_id = ?").get(continuityCompanyId, continuityFrom.id).count;
    record("22. Opening-to-closing continuity passes across financial years", !closeError && continuityStatus === "Locked" && continuityRows > 0, `Close error: ${closeError || "none"}; status ${continuityStatus}; carry rows ${continuityRows}`);

    const perVoucherImbalances = db.prepare(`
      SELECT v.id, v.voucher_number, ROUND(SUM(vl.debit) - SUM(vl.credit), 2) difference
      FROM vouchers v JOIN voucher_lines vl ON vl.voucher_id = v.id
      WHERE v.company_id = ? AND v.is_deleted = 0
      GROUP BY v.id HAVING difference <> 0
    `).all(companyId);
    const periodImbalances = db.prepare(`
      SELECT entry_date period, ROUND(SUM(debit) - SUM(credit), 2) difference
      FROM ledger_entries WHERE company_id = ? GROUP BY entry_date HAVING difference <> 0
    `).all(companyId);
    record("23. Posted vouchers reconcile by voucher and day", perVoucherImbalances.length === 0 && periodImbalances.length === 0, `Voucher variances ${perVoucherImbalances.length}; daily variances ${periodImbalances.length}`);
    record("24. Required transaction-class fixture coverage exists", posted.length >= 30, `${posted.length} balanced transaction cases plus governed opening balance`);

    let emptyVoucherAccepted = false;
    try {
      createBalancedVoucher(db, {
        company_id: companyId,
        voucher_date: "2025-05-27",
        voucher_type: "Journal",
        narration: "FSR-1 empty voucher probe",
        source_module: "fsr_fixture",
        source_id: null,
        lines: []
      });
      emptyVoucherAccepted = true;
    } catch {
      emptyVoucherAccepted = false;
    }
    record("25. Posted vouchers require substantive posting lines", !emptyVoucherAccepted, "createBalancedVoucher must reject an empty posted voucher");

    const beforeDraft = accountingData(db, { company_id: companyId, date_from: "2025-04-01", date_to: "2026-03-31" }).profitLoss.income;
    function injectUnposted(status, amount) {
      const voucherId = Number(db.prepare(`
        INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, narration, source_module, status, financial_year_id, approval_status)
        VALUES (?, ?, '2025-05-28', 'Sales', 'FSR-1 status exclusion probe', 'fsr_fixture', ?, ?, 'Draft')
      `).run(companyId, `FSR-${status.toUpperCase()}-${amount}`, status, fy.id).lastInsertRowid);
      const debitLineId = Number(db.prepare("INSERT INTO voucher_lines (voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, 0, 'probe')").run(voucherId, accounts.get("A100"), amount).lastInsertRowid);
      const creditLineId = Number(db.prepare("INSERT INTO voucher_lines (voucher_id, account_id, debit, credit, narration) VALUES (?, ?, 0, ?, 'probe')").run(voucherId, accounts.get("I400"), amount).lastInsertRowid);
      db.prepare("INSERT INTO ledger_entries (company_id, voucher_id, voucher_line_id, account_id, entry_date, debit, credit, running_balance, source_module, source_id) VALUES (?, ?, ?, ?, '2025-05-28', ?, 0, 0, 'fsr_fixture', ?)").run(companyId, voucherId, debitLineId, accounts.get("A100"), amount, voucherId);
      db.prepare("INSERT INTO ledger_entries (company_id, voucher_id, voucher_line_id, account_id, entry_date, debit, credit, running_balance, source_module, source_id) VALUES (?, ?, ?, ?, '2025-05-28', 0, ?, 0, 'fsr_fixture', ?)").run(companyId, voucherId, creditLineId, accounts.get("I400"), amount, voucherId);
    }
    injectUnposted("Draft", 111);
    injectUnposted("Cancelled", 222);
    const afterDraft = accountingData(db, { company_id: companyId, date_from: "2025-04-01", date_to: "2026-03-31" }).profitLoss.income;
    record("13. Draft and cancelled vouchers are excluded", round(afterDraft) === round(beforeDraft), `P&L income changed by ${round(afterDraft - beforeDraft)} after synthetic Draft/Cancelled postings`);

    const companyB = createCompany(db, "FSR-1 Isolation Probe Company");
    createFinancialYear(db, { company_id: companyB, financial_year_name: "FY 2025-26", start_date: "2025-04-01", end_date: "2026-03-31", status: "Open" });
    const bankBeforeIsolationProbe = Number(accountingData(db, { company_id: companyId, date_from: "2025-04-01", date_to: "2026-03-31" }).trialBalance.find((row) => row.account_name === "Bank")?.debit || 0);
    createBalancedVoucher(db, {
      company_id: companyB,
      voucher_date: "2025-05-29",
      voucher_type: "Journal",
      narration: "FSR-1 cross-company account probe",
      source_module: "fsr_fixture",
      source_id: null,
      lines: [{ account_id: accounts.get("A100"), debit: 777, credit: 0 }, { account_id: accounts.get("E300"), debit: 0, credit: 777 }]
    });
    const bankAfterIsolationProbe = Number(accountingData(db, { company_id: companyId, date_from: "2025-04-01", date_to: "2026-03-31" }).trialBalance.find((row) => row.account_name === "Bank")?.debit || 0);
    record("12. Company isolation is enforced", round(bankAfterIsolationProbe) === round(bankBeforeIsolationProbe), `Company A Bank debit changed by ${round(bankAfterIsolationProbe - bankBeforeIsolationProbe)} after Company B used Company A account IDs`);

    console.log("FSR-1 Financial Reporting Structure Verification");
    console.log("=================================================");
    console.log(`Isolated fixture root: ${root}`);
    console.log(`Fixture transactions: ${posted.length} plus opening balance`);
    console.log(`Independent expected Trial Balance: Dr ${expected.debit} / Cr ${expected.credit}`);
    console.log(`Independent expected P&L: income ${expected.income}, expenses ${expected.expenses}, net profit ${expected.netProfit}`);
    console.log(`Independent expected Balance Sheet: assets ${expected.assets}, liabilities + equity ${expected.liabilitiesAndEquity}`);
    console.log(`Independent closing balances: Bank ${round((expected.balances.get("A100")?.debit || 0) - (expected.balances.get("A100")?.credit || 0))}, Cash ${round((expected.balances.get("A110")?.debit || 0) - (expected.balances.get("A110")?.credit || 0))}, Receivables ${round((expected.balances.get("A120")?.debit || 0) - (expected.balances.get("A120")?.credit || 0))}, Payables ${round((expected.balances.get("L200")?.credit || 0) - (expected.balances.get("L200")?.debit || 0))}, Inventory ${round((expected.balances.get("A130")?.debit || 0) - (expected.balances.get("A130")?.credit || 0))}`);
    console.log("");
    results.sort((a, b) => Number(a.name.split(".")[0]) - Number(b.name.split(".")[0]));
    results.forEach((result) => console.log(`${result.passed ? "PASS" : "FAIL"}: ${result.name} - ${result.detail}`));
    const passed = results.filter((result) => result.passed).length;
    const failed = results.length - passed;
    console.log("");
    console.log(`Summary: ${passed} passed, ${failed} failed, ${results.length} total`);
    process.exitCode = failed ? 1 : 0;
  } finally {
    if (db) db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

run()
  .then(() => process.exit(process.exitCode || 0))
  .catch((error) => {
    console.error(`FAIL: FSR-1 verifier crashed - ${error?.stack || error}`);
    process.exit(1);
  });
