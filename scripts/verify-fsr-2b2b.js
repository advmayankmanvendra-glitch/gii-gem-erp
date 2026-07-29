#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  accountingData,
  auditLog,
  createLedgerAccount,
  initializeDatabase
} from "../src/main/database/init.js";
import { createAccountMappingService } from "../src/main/services/accountMappingService.js";
import {
  accountGroupOptions,
  canManageAccountMappings,
  defaultNormalBalance
} from "../src/renderer/features/accounting/accountMappings/accountMappingOptions.js";

let passed = 0;
let failed = 0;
let db;
let fixtureRoot;

function check(name, condition, detail = "") {
  const status = condition ? "PASS" : "FAIL";
  if (condition) passed += 1;
  else failed += 1;
  console.log(`${status}: ${name}${detail ? ` - ${detail}` : ""}`);
}

function expectError(name, callback, expectedText) {
  try {
    callback();
    check(name, false, "No error was raised");
  } catch (error) {
    const message = String(error?.message || error);
    check(name, message.includes(expectedText), message);
  }
}

function financialAmountSnapshot(dbHandle, companyId, startDate, endDate) {
  const result = accountingData(dbHandle, {
    company_id: companyId,
    date_from: startDate,
    date_to: endDate
  });
  return JSON.stringify({
    trialDebit: (result.trialBalance || []).reduce(
      (sum, row) => sum + Number(row.debit || row.total_debit || 0),
      0
    ),
    trialCredit: (result.trialBalance || []).reduce(
      (sum, row) => sum + Number(row.credit || row.total_credit || 0),
      0
    ),
    profitLoss: {
      income: Number(result.profitLoss?.income || 0),
      expenses: Number(result.profitLoss?.expenses || 0),
      netProfit: Number(result.profitLoss?.netProfit || 0)
    },
    balanceSheet: {
      assets: Number(result.balanceSheet?.assets || 0),
      liabilities: Number(result.balanceSheet?.liabilities || 0),
      equity: Number(result.balanceSheet?.equity || 0),
      currentProfit: Number(result.balanceSheet?.currentProfit || 0),
      liabilitiesAndEquity: Number(result.balanceSheet?.liabilitiesAndEquity || 0)
    }
  });
}

function source(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

try {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gii-gem-fsr2b2b-"));
  db = initializeDatabase(fixtureRoot);

  const mappingService = createAccountMappingService({
    auditLog,
    createLedgerAccount
  });
  const companyId = Number(
    db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get().id
  );
  const admin = db.prepare(`
    SELECT id, role
    FROM users
    WHERE status = 'active' AND role IN ('super_admin', 'admin')
    ORDER BY id
    LIMIT 1
  `).get();
  const actor = {
    user_id: Number(admin.id),
    user_role: admin.role
  };
  const financialYear = db.prepare(`
    SELECT start_date, end_date
    FROM financial_years
    WHERE company_id = ?
    ORDER BY start_date
    LIMIT 1
  `).get(companyId);

  const registry = mappingService.getAccountMappingRegistry(db);
  const mappedGroupIds = new Set(
    registry.statementMappings.map((row) => Number(row.account_group_id))
  );
  const group = registry.groups.find((row) => (
    row.status === "active"
    && Number(row.posting_allowed) === 1
    && mappedGroupIds.has(Number(row.id))
  ));
  check("Fixture exposes a governed posting account group", Boolean(group));

  check("Administrator can manage account mappings", canManageAccountMappings("admin"));
  check("Accountant can manage account mappings", canManageAccountMappings("accountant"));
  check("Manager cannot manage account mappings", !canManageAccountMappings("manager"));
  check("Data Entry Operator cannot manage account mappings", !canManageAccountMappings("data_entry_operator"));
  check("Viewer cannot manage account mappings", !canManageAccountMappings("viewer"));
  check("Asset defaults to Debit", defaultNormalBalance("Asset") === "Debit");
  check("Income defaults to Credit", defaultNormalBalance("Income") === "Credit");

  const options = accountGroupOptions(
    registry,
    group.account_type,
    group.normal_balance,
    financialYear.start_date
  );
  check(
    "Group options contain only compatible governed posting groups",
    options.length > 0 && options.some(([id]) => Number(id) === Number(group.id))
  );
  const optionLabels = options.map(([, label]) => label);
  check(
    "Group options are universally alphabetized",
    JSON.stringify(optionLabels) === JSON.stringify(
      [...optionLabels].sort((left, right) => left.localeCompare(
        right,
        undefined,
        { sensitivity: "base", numeric: true }
      ))
    )
  );

  const amountsBefore = financialAmountSnapshot(
    db,
    companyId,
    financialYear.start_date,
    financialYear.end_date
  );
  const created = mappingService.createMappedLedgerAccount(db, {
    company_id: companyId,
    account_name: "FSR 2B2B Atomic Ledger",
    account_code: "18991",
    account_type: group.account_type,
    normal_balance: group.normal_balance,
    account_group_id: group.id,
    effective_from: financialYear.start_date,
    change_reason: "FSR-2B.2B atomic ledger verification",
    source_module: "fsr2b2b_verifier"
  }, actor);

  check("Atomic Quick Create returns the new account", Number(created.id) > 0);
  check("Atomic Quick Create returns mapped status", created.mapping_status === "MAPPED");
  check(
    "Atomic Quick Create persists the governed assignment",
    Boolean(db.prepare(`
      SELECT id
      FROM account_group_assignments
      WHERE company_id = ? AND account_id = ? AND account_group_id = ?
    `).get(companyId, created.id, group.id))
  );
  check(
    "Atomic Quick Create records account and mapping audit evidence",
    db.prepare(`
      SELECT COUNT(*) count
      FROM audit_log
      WHERE company_id = ?
        AND (
          (table_name = 'accounts' AND record_id = ?)
          OR (table_name = 'account_group_assignments' AND action = 'account_mapping_assignment_created')
        )
    `).get(companyId, created.id).count >= 2
  );

  const accountCountBeforeFailure = db.prepare(
    "SELECT COUNT(*) count FROM accounts WHERE company_id = ?"
  ).get(companyId).count;
  const auditCountBeforeFailure = db.prepare(
    "SELECT COUNT(*) count FROM audit_log WHERE company_id = ?"
  ).get(companyId).count;
  expectError(
    "Invalid mapping rejects mapped ledger creation",
    () => mappingService.createMappedLedgerAccount(db, {
      company_id: companyId,
      account_name: "FSR 2B2B Rolled Back Ledger",
      account_code: "18992",
      account_type: group.account_type,
      normal_balance: group.normal_balance,
      account_group_id: 99999999,
      effective_from: financialYear.start_date,
      change_reason: "This account and audit evidence must roll back",
      source_module: "fsr2b2b_verifier"
    }, actor),
    "active account group"
  );
  check(
    "Failed mapping leaves no account residue",
    db.prepare("SELECT COUNT(*) count FROM accounts WHERE company_id = ?")
      .get(companyId).count === accountCountBeforeFailure
      && !db.prepare("SELECT id FROM accounts WHERE account_code = '18992'").get()
  );
  check(
    "Failed mapping leaves no audit residue",
    db.prepare("SELECT COUNT(*) count FROM audit_log WHERE company_id = ?")
      .get(companyId).count === auditCountBeforeFailure
  );

  expectError(
    "Effective date remains mandatory for mapped Quick Create",
    () => mappingService.createMappedLedgerAccount(db, {
      company_id: companyId,
      account_name: "FSR 2B2B Missing Date",
      account_code: "18993",
      account_type: group.account_type,
      normal_balance: group.normal_balance,
      account_group_id: group.id,
      change_reason: "Missing date must fail"
    }, actor),
    "YYYY-MM-DD"
  );
  expectError(
    "Change reason remains mandatory for mapped Quick Create",
    () => mappingService.createMappedLedgerAccount(db, {
      company_id: companyId,
      account_name: "FSR 2B2B Missing Reason",
      account_code: "18994",
      account_type: group.account_type,
      normal_balance: group.normal_balance,
      account_group_id: group.id,
      effective_from: financialYear.start_date
    }, actor),
    "Change reason"
  );

  const amountsAfter = financialAmountSnapshot(
    db,
    companyId,
    financialYear.start_date,
    financialYear.end_date
  );
  check("Mapped Quick Create does not alter financial report amounts", amountsBefore === amountsAfter);

  const mainSource = source("src/main/main.js");
  const clientSource = source("src/renderer/api/client.js");
  const accountingSource = source("src/renderer/features/accounting/AccountingScreen.jsx");
  const panelSource = source(
    "src/renderer/features/accounting/accountMappings/AccountMappingReviewPanel.jsx"
  );
  const quickCreateSource = source(
    "src/renderer/components/overlays/QuickCreateMasterDialog.jsx"
  );
  const registrySource = source(
    "src/renderer/modules/quick-create/quickCreateRegistry.js"
  );
  const appSource = source("src/renderer/App.jsx");

  check(
    "Quick Create desktop channel uses session-bound account-mapping permission",
    /"accounts:create-quick"[\s\S]{0,180}sessionGuarded\("account_mapping"/.test(mainSource)
  );
  check(
    "Browser preview blocks ledger Quick Create mutation",
    clientSource.includes('"createLedgerAccount"')
  );
  check(
    "Chart of Accounts uses the modular mapping review panel",
    accountingSource.includes("<AccountMappingReviewPanel")
      && accountingSource.includes('view === "chart_accounts"')
  );
  check(
    "Mapping panel uses dedicated read and assignment APIs",
    [
      "getAccountMappingRegistry",
      "getAccountClassifications",
      "getAccountMappingCoverage",
      "assignAccountGroup"
    ].every((method) => panelSource.includes(method))
  );
  check(
    "Mapping dialog includes group, effective date, and reason controls",
    ["Account Group", "Effective Date", "Change Reason"]
      .every((label) => panelSource.includes(label))
  );
  check(
    "Ledger Quick Create includes governed mapping fields",
    ["account_group_id", "effective_from", "change_reason"]
      .every((field) => quickCreateSource.includes(field))
  );
  check(
    "Ledger Quick Create declares the dedicated mapping permission",
    registrySource.includes('permission: "account_mapping"')
  );
  check(
    "FSR-2B.2B adds no business logic to App.jsx",
    !appSource.includes("AccountMappingReviewPanel")
      && !appSource.includes("createMappedLedgerAccount")
  );
  check("Fixture database passes quick_check", db.pragma("quick_check", { simple: true }) === "ok");
} catch (error) {
  failed += 1;
  console.error("FAIL: Unhandled verifier error");
  console.error(error);
} finally {
  try {
    db?.close();
  } catch {
    // Fixture cleanup continues if the database is already closed.
  }
  if (fixtureRoot) {
    try {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    } catch (error) {
      failed += 1;
      console.error(`FAIL: Fixture cleanup - ${error.message}`);
    }
  }
}

console.log("\nFSR-2B.2B Verification Summary");
console.log(`Passed: ${passed}, Failed: ${failed}, Total: ${passed + failed}`);
console.log(`Fixture cleanup: ${fixtureRoot && !fs.existsSync(fixtureRoot) ? "PASS" : "FAIL"}`);

if (failed > 0) {
  process.exit(1);
}

console.log("FSR-2B.2B CHART OF ACCOUNTS AND QUICK CREATE UX VERIFIED");
process.exit(0);
