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
    accountingData, createBalancedVoucher, createFinancialYear, createLedgerAccount,
    createManualVoucher, initializeDatabase, trialBalance, profitLossReport, balanceSheetReport
  } = await import("../src/main/database/init.js");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-gem-fsr2a1-"));
  let db;
  let passedCount = 0;
  let failedCount = 0;

  try {
    db = initializeDatabase(root);
    const companyId = createCompany(db, "FSR-2A.1 Isolated Fixture");
    const fy = createFinancialYear(db, {
      company_id: companyId, financial_year_name: "FY 2025-26",
      start_date: "2025-04-01", end_date: "2026-03-31", status: "Open"
    });
    const bankAc = createLedgerAccount(db, { company_id: companyId, account_code: "A100", account_name: "Bank", account_type: "Asset", normal_balance: "Debit" });
    const capitalAc = createLedgerAccount(db, { company_id: companyId, account_code: "E300", account_name: "Capital", account_type: "Equity", normal_balance: "Credit" });
    const salesAc = createLedgerAccount(db, { company_id: companyId, account_code: "I400", account_name: "Sales", account_type: "Income", normal_balance: "Credit" });
    const purchaseAc = createLedgerAccount(db, { company_id: companyId, account_code: "X500", account_name: "Purchase", account_type: "Expense", normal_balance: "Debit" });

    /* 1. Empty Posted voucher is rejected */
    try {
      createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "Empty probe", source_module: "test", source_id: null, lines: [] });
      record("1. Empty voucher rejected", false, "Empty voucher was accepted");
    } catch (e) {
      record("1. Empty voucher rejected", true, `Rejected: ${e.message}`);
    }

    /* 2. One-line voucher is rejected */
    try {
      createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "One-line probe", source_module: "test", source_id: null, lines: [{ account_id: bankAc.id, debit: 100, credit: 0 }] });
      record("2. One-line voucher rejected", false, "One-line voucher was accepted");
    } catch (e) {
      record("2. One-line voucher rejected", true, `Rejected: ${e.message}`);
    }

    /* 3. Zero-value voucher is rejected */
    try {
      createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "Zero probe", source_module: "test", source_id: null, lines: [{ account_id: bankAc.id, debit: 0, credit: 0 }, { account_id: capitalAc.id, debit: 0, credit: 0 }] });
      record("3. Zero-value voucher rejected", false, "Zero-value voucher was accepted");
    } catch (e) {
      record("3. Zero-value voucher rejected", true, `Rejected: ${e.message}`);
    }

    /* 4. Both-side line is rejected */
    try {
      createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "Both-side probe", source_module: "test", source_id: null, lines: [{ account_id: bankAc.id, debit: 100, credit: 0 }, { account_id: capitalAc.id, debit: 50, credit: 50 }] });
      record("4. Both-side line rejected", false, "Both-side line was accepted");
    } catch (e) {
      record("4. Both-side line rejected", true, `Rejected: ${e.message}`);
    }

    /* 5. Negative debit or credit is rejected */
    try {
      createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "Negative probe", source_module: "test", source_id: null, lines: [{ account_id: bankAc.id, debit: -100, credit: 0 }, { account_id: capitalAc.id, debit: 0, credit: 100 }] });
      record("5. Negative debit rejected", false, "Negative debit was accepted");
    } catch (e) {
      record("5. Negative debit rejected", true, `Rejected: ${e.message}`);
    }
    try {
      createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "Negative probe", source_module: "test", source_id: null, lines: [{ account_id: bankAc.id, debit: 100, credit: 0 }, { account_id: capitalAc.id, debit: 0, credit: -100 }] });
      record("5b. Negative credit rejected", false, "Negative credit was accepted");
    } catch (e) {
      record("5b. Negative credit rejected", true, `Rejected: ${e.message}`);
    }

    /* 6. Valid two-line voucher succeeds */
    try {
      const v = createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "Valid two-line", source_module: "test", source_id: null, lines: [{ account_id: bankAc.id, debit: 100, credit: 0 }, { account_id: capitalAc.id, debit: 0, credit: 100 }] });
      record("6. Valid two-line voucher succeeds", Boolean(v && v.id), `Voucher ${v?.id || "missing"}`);
    } catch (e) {
      record("6. Valid two-line voucher succeeds", false, `Failed: ${e.message}`);
    }

    /* 7. Valid multi-line voucher succeeds */
    try {
      const expAc = createLedgerAccount(db, { company_id: companyId, account_code: "X530", account_name: "Admin Expense", account_type: "Expense", normal_balance: "Debit" });
      const v = createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-04-02", voucher_type: "Journal", narration: "Valid multi-line", source_module: "test", source_id: null, lines: [
        { account_id: expAc.id, debit: 500, credit: 0 },
        { account_id: bankAc.id, debit: 300, credit: 0 },
        { account_id: capitalAc.id, debit: 0, credit: 800 }
      ]});
      record("7. Valid multi-line voucher succeeds", Boolean(v && v.id), `Voucher ${v?.id || "missing"}`);
    } catch (e) {
      record("7. Valid multi-line voucher succeeds", false, `Failed: ${e.message}`);
    }

    /* 8. Unbalanced voucher is rejected */
    try {
      createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "Unbalanced probe", source_module: "test", source_id: null, lines: [{ account_id: bankAc.id, debit: 100, credit: 0 }, { account_id: capitalAc.id, debit: 0, credit: 90 }] });
      record("8. Unbalanced voucher rejected", false, "Unbalanced voucher was accepted");
    } catch (e) {
      record("8. Unbalanced voucher rejected", true, `Rejected: ${e.message}`);
    }

    /* 9. Company B cannot post using Company A account IDs */
    const companyB = createCompany(db, "FSR-2A.1 Isolation Probe B");
    createFinancialYear(db, { company_id: companyB, financial_year_name: "FY 2025-26", start_date: "2025-04-01", end_date: "2026-03-31", status: "Open" });
    const bankBefore = Number(db.prepare("SELECT COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0) FROM ledger_entries le JOIN accounts a ON a.id = le.account_id WHERE a.company_id = ? AND a.account_code = 'A100'").get(companyId)?.le_debit || 0) - Number(db.prepare("SELECT COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0) FROM ledger_entries le JOIN accounts a ON a.id = le.account_id WHERE a.company_id = ? AND a.account_code = 'A100'").get(companyId)?.le_credit || 0);
    /* Use simple independent check */
    const bankBeforeSimple = Number(db.prepare("SELECT COALESCE(SUM(le.debit),0) - COALESCE(SUM(le.credit),0) diff FROM ledger_entries le JOIN accounts a ON a.id = le.account_id WHERE a.id = ?").get(bankAc.id)?.diff || 0);
    let crossCompanyError = "";
    try {
      createBalancedVoucher(db, { company_id: companyB, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "Isolation probe", source_module: "test", source_id: null, lines: [{ account_id: bankAc.id, debit: 777, credit: 0 }, { account_id: capitalAc.id, debit: 0, credit: 777 }] });
      crossCompanyError = "Cross-company posting was accepted";
    } catch (e) {
      crossCompanyError = "";
    }
    const bankAfterSimple = Number(db.prepare("SELECT COALESCE(SUM(le.debit),0) - COALESCE(SUM(le.credit),0) diff FROM ledger_entries le JOIN accounts a ON a.id = le.account_id WHERE a.id = ?").get(bankAc.id)?.diff || 0);
    const companyIsolated = round(bankAfterSimple) === round(bankBeforeSimple);
    record("9. Company isolation enforced", companyIsolated && !crossCompanyError, `Bank changed by ${round(bankAfterSimple - bankBeforeSimple)}; cross-company error: ${crossCompanyError || "none"}`);

    /* 10. Cross-company rejection leaves no partial records */
    const companyBVouchers = db.prepare("SELECT COUNT(*) count FROM vouchers WHERE company_id = ?").get(companyB)?.count || 0;
    const companyBLedger = db.prepare("SELECT COUNT(*) count FROM ledger_entries WHERE company_id = ?").get(companyB)?.count || 0;
    record("10. Cross-company atomic failure", companyBVouchers === 0 && companyBLedger === 0, `Company B vouchers: ${companyBVouchers}, ledger entries: ${companyBLedger}`);

    /* 11. Account company, voucher company and ledger company remain equal */
    /* Post a valid voucher and verify all three match */
    const bAcB = createLedgerAccount(db, { company_id: companyB, account_code: "B-BNK", account_name: "B Bank", account_type: "Asset", normal_balance: "Debit" });
    const cAcB = createLedgerAccount(db, { company_id: companyB, account_code: "B-CAP", account_name: "B Capital", account_type: "Equity", normal_balance: "Credit" });
    const vB = createBalancedVoucher(db, { company_id: companyB, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "Valid B voucher", source_module: "test", source_id: null, lines: [{ account_id: bAcB.id, debit: 500, credit: 0 }, { account_id: cAcB.id, debit: 0, credit: 500 }] });
    const voucherCheck = db.prepare("SELECT company_id FROM vouchers WHERE id = ?").get(vB.id);
    const ledgerCheck = db.prepare("SELECT company_id FROM ledger_entries WHERE voucher_id = ? LIMIT 1").get(vB.id);
    const accountCheck = db.prepare("SELECT company_id FROM accounts WHERE id = ?").get(bAcB.id);
    const allMatch = Number(voucherCheck?.company_id) === Number(companyB) && Number(ledgerCheck?.company_id) === Number(companyB) && Number(accountCheck?.company_id) === Number(companyB);
    record("11. Company consistency enforced", allMatch, `Voucher: ${voucherCheck?.company_id}, ledger: ${ledgerCheck?.company_id}, account: ${accountCheck?.company_id}`);

    /* Setup baseline for draft/cancelled/posted/reversal tests */
    const baseBank = createLedgerAccount(db, { company_id: companyId, account_code: "A101", account_name: "Bank2", account_type: "Asset", normal_balance: "Debit" });
    const baseCapital = createLedgerAccount(db, { company_id: companyId, account_code: "E301", account_name: "Capital2", account_type: "Equity", normal_balance: "Credit" });
    createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-04-03", voucher_type: "Journal", narration: "Base entry", source_module: "test", source_id: null, lines: [{ account_id: baseBank.id, debit: 1000, credit: 0 }, { account_id: baseCapital.id, debit: 0, credit: 1000 }] });

    function reportedIncome() {
      return round(accountingData(db, { company_id: companyId, date_from: "2025-04-01", date_to: "2026-03-31" }).profitLoss.income);
    }
    function reportedExpenses() {
      return round(accountingData(db, { company_id: companyId, date_from: "2025-04-01", date_to: "2026-03-31" }).profitLoss.expenses);
    }
    function reportedAssets() {
      return round(accountingData(db, { company_id: companyId, date_from: "2025-04-01", date_to: "2026-03-31" }).balanceSheet.assets);
    }

    const baselineIncome = reportedIncome();
    const baselineExpenses = reportedExpenses();
    const baselineAssets = reportedAssets();

    /* Inject Draft voucher directly via SQL (simulating FSR-1 check 13 style) */
    function injectVoucherDirect(status, amount, accountDebitId, accountCreditId, suffix) {
      const vId = Number(db.prepare(`INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, narration, source_module, status, financial_year_id, approval_status) VALUES (?, ?, '2025-04-10', 'Journal', ?, 'test', ?, ?, 'Approved')`).run(companyId, `DIRECT-${status.toUpperCase()}-${suffix}`, `Direct ${status} probe`, status, fy.id).lastInsertRowid);
      const dlId = Number(db.prepare(`INSERT INTO voucher_lines (voucher_id, account_id, debit, credit) VALUES (?, ?, ?, 0)`).run(vId, accountDebitId, amount).lastInsertRowid);
      const clId = Number(db.prepare(`INSERT INTO voucher_lines (voucher_id, account_id, debit, credit) VALUES (?, ?, 0, ?)`).run(vId, accountCreditId, amount).lastInsertRowid);
      db.prepare(`INSERT INTO ledger_entries (company_id, voucher_id, voucher_line_id, account_id, entry_date, debit, credit, running_balance, source_module, source_id) VALUES (?, ?, ?, ?, '2025-04-10', ?, 0, 0, 'test', ?)`).run(companyId, vId, dlId, accountDebitId, amount, vId);
      db.prepare(`INSERT INTO ledger_entries (company_id, voucher_id, voucher_line_id, account_id, entry_date, debit, credit, running_balance, source_module, source_id) VALUES (?, ?, ?, ?, '2025-04-10', 0, ?, 0, 'test', ?)`).run(companyId, vId, clId, accountCreditId, amount, vId);
    }

    const salesAccount = createLedgerAccount(db, { company_id: companyId, account_code: "I401", account_name: "Test Sales", account_type: "Income", normal_balance: "Credit" });
    const expenseAccount = createLedgerAccount(db, { company_id: companyId, account_code: "X501", account_name: "Test Expense", account_type: "Expense", normal_balance: "Debit" });

    /* 12. Draft voucher effects excluded from Trial Balance */
    injectVoucherDirect("Draft", 200, baseBank.id, salesAccount.id, "12");
    const draftIncome = reportedIncome();
    record("12. Draft excluded from P&L", round(draftIncome) === round(baselineIncome), `Income changed by ${round(draftIncome - baselineIncome)} after Draft posting`);

    /* 13. Cancelled voucher effects excluded from Balance Sheet */
    injectVoucherDirect("Cancelled", 300, baseBank.id, salesAccount.id, "13");
    const cancelledIncome = reportedIncome();
    record("13. Cancelled excluded from P&L", round(cancelledIncome) === round(baselineIncome), `Income changed by ${round(cancelledIncome - baselineIncome)} after Cancelled posting`);

    /* 14. Draft+Cancelled excluded from Balance Sheet */
    const draftCancelAssets = reportedAssets();
    record("14. Draft+Cancelled excluded from BS", round(draftCancelAssets) === round(baselineAssets), `Assets changed by ${round(draftCancelAssets - baselineAssets)} after Draft+Cancelled posting`);

    /* 15. Valid Posted voucher effects remain included */
    const postedIncomeBefore = reportedIncome();
    createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-04-15", voucher_type: "Journal", narration: "Posted income", source_module: "test", source_id: null, lines: [{ account_id: baseBank.id, debit: 150, credit: 0 }, { account_id: salesAccount.id, debit: 0, credit: 150 }] });
    const postedIncomeAfter = reportedIncome();
    record("15. Posted voucher included", round(postedIncomeAfter - postedIncomeBefore) === 150, `Income changed by ${round(postedIncomeAfter - postedIncomeBefore)} (expected 150)`);

    /* 16. Existing manual voucher posting continues to work */
    try {
      const mv = createManualVoucher(db, { company_id: companyId, voucher_type: "Journal", voucher_date: "2025-04-16", narration: "Manual test", lines: [{ account_id: baseBank.id, debit: 250, credit: 0 }, { account_id: baseCapital.id, debit: 0, credit: 250 }] });
      record("16. Manual voucher posting works", Boolean(mv && mv.id), `Manual voucher ${mv?.id || "missing"}`);
    } catch (e) {
      record("16. Manual voucher posting works", false, `Failed: ${e.message}`);
    }

    /* 17. NaN/Infinity validation */
    try {
      createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "NaN probe", source_module: "test", source_id: null, lines: [{ account_id: baseBank.id, debit: NaN, credit: 0 }, { account_id: baseCapital.id, debit: 0, credit: 100 }] });
      record("17. NaN rejected", false, "NaN was accepted");
    } catch (e) {
      record("17. NaN rejected", true, `Rejected: ${e.message}`);
    }
    try {
      createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "Infinity probe", source_module: "test", source_id: null, lines: [{ account_id: baseBank.id, debit: Infinity, credit: 0 }, { account_id: baseCapital.id, debit: 0, credit: 100 }] });
      record("17b. Infinity rejected", false, "Infinity was accepted");
    } catch (e) {
      record("17b. Infinity rejected", true, `Rejected: ${e.message}`);
    }

    /* 18. Deleted account rejected */
    db.prepare("UPDATE accounts SET is_deleted = 1 WHERE id = ?").run(expenseAccount.id);
    try {
      createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "Deleted account probe", source_module: "test", source_id: null, lines: [{ account_id: expenseAccount.id, debit: 100, credit: 0 }, { account_id: baseCapital.id, debit: 0, credit: 100 }] });
      record("18. Deleted account rejected", false, "Deleted account was accepted");
    } catch (e) {
      record("18. Deleted account rejected", true, `Rejected: ${e.message}`);
    }
    /* Restore account */
    db.prepare("UPDATE accounts SET is_deleted = 0 WHERE id = ?").run(expenseAccount.id);

    /* 19. Inactive account rejected */
    db.prepare("UPDATE accounts SET status = 'inactive' WHERE id = ?").run(expenseAccount.id);
    try {
      createBalancedVoucher(db, { company_id: companyId, voucher_date: "2025-04-01", voucher_type: "Journal", narration: "Inactive account probe", source_module: "test", source_id: null, lines: [{ account_id: expenseAccount.id, debit: 100, credit: 0 }, { account_id: baseCapital.id, debit: 0, credit: 100 }] });
      record("19. Inactive account rejected", false, "Inactive account was accepted");
    } catch (e) {
      record("19. Inactive account rejected", true, `Rejected: ${e.message}`);
    }
    db.prepare("UPDATE accounts SET status = 'active' WHERE id = ?").run(expenseAccount.id);

    /* 20. Audit evidence remains intact */
    const auditRows = db.prepare("SELECT COUNT(*) count FROM audit_log").get()?.count || 0;
    record("20. Audit evidence intact", auditRows > 0, `${auditRows} audit log entries`);

    /* Summary */
    console.log("FSR-2A.1 Posting Boundary, Company Isolation and Voucher-State Verification");
    console.log("============================================================================");
    console.log(`Isolated fixture root: ${root}`);
    console.log("");
    results.sort((a, b) => {
      const na = Number(a.name.split(".")[0]);
      const nb = Number(b.name.split(".")[0]);
      return na - nb;
    });
    results.forEach((result) => {
      console.log(`${result.passed ? "PASS" : "FAIL"}: ${result.name} - ${result.detail}`);
      if (result.passed) passedCount++; else failedCount++;
    });
    console.log("");
    console.log(`Passed: ${passedCount}, Failed: ${failedCount}, Total: ${results.length}`);

    const allPassed = results.every((r) => r.passed);
    if (!allPassed) {
      console.log("\nFSR-2A.1 NOT CERTIFIED — SOURCE-BOUNDARY CORRECTIONS REMAIN");
    } else {
      console.log("\nFSR-2A.1 CERTIFIED — READY FOR BALANCE SHEET TRUTH CORRECTIONS");
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
    console.error(`FAIL: FSR-2A.1 verifier crashed - ${error?.stack || error}`);
    process.exit(1);
  });
