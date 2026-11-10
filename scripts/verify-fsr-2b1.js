#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import {
  WRITE_POLICY,
  accountingData,
  createBalancedVoucher,
  initializeDatabase
} from "../src/main/database/init.js";
import {
  DEFAULT_REPORTING_PROFILE,
  FSR2B1_MIGRATION_NAME,
  applyAccountMappingRegistryMigration,
  backfillDefaultAccountMappings,
  defaultAccountMappingEntries,
  ensureAccountMappingRegistry
} from "../src/main/database/accountMappingRegistry.js";
import { createAccountMappingService } from "../src/main/services/accountMappingService.js";

const results = [];
let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  const status = condition ? "PASS" : "FAIL";
  results.push({ status, name, detail });
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

function tableNames(db) {
  return new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
}

function reportSnapshot(db, companyId, dateFrom, dateTo) {
  const data = accountingData(db, {
    company_id: companyId,
    date_from: dateFrom,
    date_to: dateTo
  });
  return JSON.stringify({
    trialBalance: data.trialBalance,
    profitLoss: data.profitLoss,
    balanceSheet: data.balanceSheet
  });
}

function createUpgradeFixture() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT
    );
    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      account_name TEXT NOT NULL,
      account_code TEXT NOT NULL,
      account_type TEXT NOT NULL,
      normal_balance TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      UNIQUE(company_id, account_code),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );
  `);
  const companyId = Number(db.prepare(
    "INSERT INTO companies (company_name, status) VALUES ('Upgrade Fixture', 'active')"
  ).run().lastInsertRowid);
  db.prepare(`
    INSERT INTO accounts (
      company_id, account_name, account_code, account_type, normal_balance, status
    ) VALUES (?, 'Cash', '1000', 'Asset', 'Debit', 'active')
  `).run(companyId);
  return { db, companyId };
}

const roots = [];
let db;

try {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-gem-fsr2b1-"));
  roots.push(root);
  db = initializeDatabase(root);

  const migrations = db.prepare(
    "SELECT migration_name FROM schema_migrations WHERE migration_name = ?"
  ).get(FSR2B1_MIGRATION_NAME);
  check("Migration 035 is registered", migrations?.migration_name === FSR2B1_MIGRATION_NAME, migrations?.migration_name);

  const tables = tableNames(db);
  const requiredTables = [
    "account_groups",
    "financial_statement_mappings",
    "account_group_assignments"
  ];
  check(
    "All registry tables exist",
    requiredTables.every((table) => tables.has(table)),
    requiredTables.filter((table) => tables.has(table)).join(", ")
  );

  const expectedColumns = {
    account_groups: ["group_code", "parent_group_id", "account_type", "posting_allowed", "system_protected"],
    financial_statement_mappings: [
      "reporting_profile_code", "reporting_profile_version", "statement_code",
      "section_code", "subsection_code", "current_non_current", "effective_from"
    ],
    account_group_assignments: [
      "company_id", "account_id", "account_group_id", "effective_from",
      "effective_to", "provenance"
    ]
  };
  Object.entries(expectedColumns).forEach(([table, columns]) => {
    const actual = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
    check(`${table} has required columns`, columns.every((column) => actual.has(column)));
  });

  const guardTriggers = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'trigger' AND name LIKE 'trg_account_group_assignment_%'
  `).all();
  check("Assignment integrity triggers exist", guardTriggers.length === 2, `triggers=${guardTriggers.length}`);
  const statementGuardTriggers = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'trigger' AND name LIKE 'trg_statement_mapping_%'
  `).all();
  check(
    "Statement-mapping effective-date triggers exist",
    statementGuardTriggers.length === 2,
    `triggers=${statementGuardTriggers.length}`
  );
  const compatibilityGuardTriggers = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'trigger'
      AND name IN (
        'trg_accounts_mapping_compatibility_update_guard',
        'trg_account_groups_assignment_compatibility_update_guard'
      )
  `).all();
  check(
    "Account and group compatibility update triggers exist",
    compatibilityGuardTriggers.length === 2,
    `triggers=${compatibilityGuardTriggers.length}`
  );

  const groupCount = db.prepare("SELECT COUNT(*) count FROM account_groups WHERE status = 'active'").get().count;
  const mappingCount = db.prepare(
    "SELECT COUNT(*) count FROM financial_statement_mappings WHERE status = 'active'"
  ).get().count;
  check("Canonical account groups are seeded", groupCount === 29, `groups=${groupCount}`);
  check("Canonical statement mappings are seeded", mappingCount === 20, `mappings=${mappingCount}`);

  // Plus one Purchase Price Variance ledger per company (owner decision CV, 10 Nov 2026 IST),
  // mapped by its id to Purchases because its code is the first free one.
  const companyCount = db.prepare("SELECT COUNT(*) count FROM companies").get().count;
  const varianceMapped = db.prepare(`
    SELECT COUNT(*) count FROM accounts a
    JOIN account_group_assignments x ON x.account_id = a.id AND x.provenance = 'SYSTEM_SEED'
    JOIN account_groups g ON g.id = x.account_group_id AND g.group_code = 'PURCHASES'
    WHERE a.account_name = 'Purchase Price Variance' AND a.account_type = 'Expense' AND COALESCE(a.is_deleted, 0) = 0
  `).get().count;
  check("Each company has one Purchase Price Variance ledger under Purchases", varianceMapped === companyCount, `mapped=${varianceMapped}, companies=${companyCount}`);
  const expectedDefaultMappings = defaultAccountMappingEntries().length + companyCount;
  const assignmentCount = db.prepare(
    "SELECT COUNT(*) count FROM account_group_assignments WHERE provenance = 'SYSTEM_SEED'"
  ).get().count;
  check(
    "Built-in accounts receive deterministic assignments",
    assignmentCount === expectedDefaultMappings,
    `assignments=${assignmentCount}, expected=${expectedDefaultMappings}`
  );

  const invalidAssignments = db.prepare(`
    SELECT COUNT(*) count
    FROM account_group_assignments assignment
    JOIN accounts account ON account.id = assignment.account_id
    JOIN account_groups group_row ON group_row.id = assignment.account_group_id
    WHERE assignment.company_id <> account.company_id
      OR account.account_type <> group_row.account_type
      OR account.normal_balance <> group_row.normal_balance
  `).get().count;
  check("Seed assignments preserve company, type, and normal-balance integrity", invalidAssignments === 0);

  const unmappedSeedAccounts = db.prepare(`
    SELECT COUNT(*) count
    FROM accounts account
    WHERE account.account_code IN (${defaultAccountMappingEntries().map(() => "?").join(",")})
      AND NOT EXISTS (
        SELECT 1 FROM account_group_assignments assignment
        WHERE assignment.account_id = account.id
      )
  `).get(...defaultAccountMappingEntries().map((entry) => entry.account_code)).count;
  check("Every built-in account code is assigned", unmappedSeedAccounts === 0);

  const service = createAccountMappingService();
  const companyId = Number(db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get().id);
  const registry = service.getAccountMappingRegistry(db);
  check("Read-only registry service returns all groups", registry.groups.length === groupCount);
  check("Read-only registry service returns all statement mappings", registry.statementMappings.length === mappingCount);

  const customAccountId = Number(db.prepare(`
    INSERT INTO accounts (
      company_id, account_code, account_name, account_type,
      normal_balance, opening_balance, opening_balance_minor, status
    ) VALUES (?, '9999', 'Cash', 'Asset', 'Debit', 0, 0, 'active')
  `).run(companyId).lastInsertRowid);

  const beforeManualMapping = service.getAccountClassifications(db, {
    company_id: companyId,
    as_of_date: "2025-12-31"
  }).find((row) => row.account_id === customAccountId);
  check(
    "Custom account names are not guessed",
    beforeManualMapping?.mapping_status === "UNMAPPED",
    beforeManualMapping?.mapping_status
  );

  const cashGroupId = Number(db.prepare(
    "SELECT id FROM account_groups WHERE group_code = 'CASH_AND_CASH_EQUIVALENTS'"
  ).get().id);
  db.prepare(`
    INSERT INTO account_group_assignments (
      company_id, account_id, account_group_id, effective_from,
      status, provenance, change_reason
    ) VALUES (?, ?, ?, '2026-01-01', 'active', 'MANUAL', 'FSR-2B.1 historical resolution fixture')
  `).run(companyId, customAccountId, cashGroupId);

  const historicalBefore = service.getAccountClassifications(db, {
    company_id: companyId,
    as_of_date: "2025-12-31"
  }).find((row) => row.account_id === customAccountId);
  const historicalAfter = service.getAccountClassifications(db, {
    company_id: companyId,
    as_of_date: "2026-01-01"
  }).find((row) => row.account_id === customAccountId);
  check("Historical assignment is not applied before its effective date", historicalBefore?.mapping_status === "UNMAPPED");
  check(
    "Historical assignment is applied on its effective date",
    historicalAfter?.mapping_status === "MAPPED"
      && historicalAfter?.group_code === "CASH_AND_CASH_EQUIVALENTS"
  );
  expectError(
    "Overlapping historical assignments are rejected",
    () => db.prepare(`
      INSERT INTO account_group_assignments (
        company_id, account_id, account_group_id, effective_from, status, provenance
      ) VALUES (?, ?, ?, '2027-01-01', 'active', 'MANUAL')
    `).run(companyId, customAccountId, cashGroupId),
    "effective dates overlap"
  );
  expectError(
    "Invalid assignment dates are rejected",
    () => db.prepare(`
      INSERT INTO account_group_assignments (
        company_id, account_id, account_group_id, effective_from, status, provenance
      ) VALUES (?, ?, ?, 'not-a-date', 'inactive', 'MANUAL')
    `).run(companyId, customAccountId, cashGroupId),
    "dates must use YYYY-MM-DD"
  );

  const datedAccountId = Number(db.prepare(`
    INSERT INTO accounts (
      company_id, account_code, account_name, account_type,
      normal_balance, opening_balance, opening_balance_minor, status
    ) VALUES (?, '9998', 'Historical Guard Fixture', 'Asset', 'Debit', 0, 0, 'active')
  `).run(companyId).lastInsertRowid);
  db.prepare(`
    INSERT INTO account_group_assignments (
      company_id, account_id, account_group_id, effective_from, effective_to,
      status, provenance
    ) VALUES (?, ?, ?, '2020-01-01', '2020-12-31', 'active', 'MANUAL')
  `).run(companyId, datedAccountId, cashGroupId);
  const laterAssignmentId = Number(db.prepare(`
    INSERT INTO account_group_assignments (
      company_id, account_id, account_group_id, effective_from, effective_to,
      status, provenance
    ) VALUES (?, ?, ?, '2021-01-01', '2021-12-31', 'active', 'MANUAL')
  `).run(companyId, datedAccountId, cashGroupId).lastInsertRowid);
  expectError(
    "Date-only updates cannot create assignment overlaps",
    () => db.prepare(`
      UPDATE account_group_assignments
      SET effective_from = '2020-06-01'
      WHERE id = ?
    `).run(laterAssignmentId),
    "effective dates overlap"
  );

  expectError(
    "Overlapping statement mappings are rejected",
    () => db.prepare(`
      INSERT INTO financial_statement_mappings (
        reporting_profile_code, reporting_profile_version, account_group_id,
        statement_code, section_code, section_name, subsection_code, subsection_name,
        current_non_current, presentation_sign, display_order, effective_from, status
      ) VALUES (?, ?, ?, 'BALANCE_SHEET', 'ASSETS', 'Assets', 'CURRENT_ASSETS',
        'Current Assets', 'CURRENT', 'NORMAL', 999, '2026-01-01', 'active')
    `).run(
      DEFAULT_REPORTING_PROFILE.code,
      DEFAULT_REPORTING_PROFILE.version,
      cashGroupId
    ),
    "effective dates overlap"
  );

  const expenseAccountId = Number(db.prepare(`
    INSERT INTO accounts (
      company_id, account_code, account_name, account_type,
      normal_balance, opening_balance, opening_balance_minor, status
    ) VALUES (?, '5999', 'Type Guard Fixture', 'Expense', 'Debit', 0, 0, 'active')
  `).run(companyId).lastInsertRowid);
  expectError(
    "Account-type mismatch is rejected",
    () => db.prepare(`
      INSERT INTO account_group_assignments (
        company_id, account_id, account_group_id, effective_from, status, provenance
      ) VALUES (?, ?, ?, '2026-01-01', 'active', 'MANUAL')
    `).run(companyId, expenseAccountId, cashGroupId),
    "Account type is incompatible"
  );
  const balanceMismatchAccountId = Number(db.prepare(`
    INSERT INTO accounts (
      company_id, account_code, account_name, account_type,
      normal_balance, opening_balance, opening_balance_minor, status
    ) VALUES (?, '5998', 'Balance Guard Fixture', 'Asset', 'Credit', 0, 0, 'active')
  `).run(companyId).lastInsertRowid);
  expectError(
    "Normal-balance mismatch is rejected",
    () => db.prepare(`
      INSERT INTO account_group_assignments (
        company_id, account_id, account_group_id, effective_from, status, provenance
      ) VALUES (?, ?, ?, '2026-01-01', 'active', 'MANUAL')
    `).run(companyId, balanceMismatchAccountId, cashGroupId),
    "normal balance is incompatible"
  );
  const mappedCashAccountId = Number(db.prepare(
    "SELECT id FROM accounts WHERE company_id = ? AND account_code = '1000'"
  ).get(companyId).id);
  expectError(
    "Mapped account compatibility cannot be invalidated by account update",
    () => db.prepare("UPDATE accounts SET normal_balance = 'Credit' WHERE id = ?")
      .run(mappedCashAccountId),
    "Account change is incompatible"
  );
  expectError(
    "Mapped account compatibility cannot be invalidated by group update",
    () => db.prepare("UPDATE account_groups SET normal_balance = 'Credit' WHERE id = ?")
      .run(cashGroupId),
    "Account group change is incompatible"
  );

  const companyB = Number(db.prepare(
    "INSERT INTO companies (company_name, status) VALUES ('FSR-2B.1 Company B', 'active')"
  ).run().lastInsertRowid);
  const companyBAccount = Number(db.prepare(`
    INSERT INTO accounts (
      company_id, account_code, account_name, account_type,
      normal_balance, opening_balance, opening_balance_minor, status
    ) VALUES (?, '1000', 'Cash B', 'Asset', 'Debit', 0, 0, 'active')
  `).run(companyB).lastInsertRowid);
  backfillDefaultAccountMappings(db);

  const companyBRows = service.getAccountClassifications(db, {
    company_id: companyB,
    as_of_date: "2026-01-01"
  });
  check(
    "Company B mapping is isolated",
    companyBRows.length === 1
      && companyBRows[0].account_id === companyBAccount
      && companyBRows[0].company_id === companyB
      && companyBRows[0].mapping_status === "MAPPED"
  );
  check(
    "Company A query excludes Company B accounts",
    !service.getAccountClassifications(db, {
      company_id: companyId,
      as_of_date: "2026-01-01"
    }).some((row) => row.company_id === companyB)
  );
  expectError(
    "Cross-company assignment is rejected",
    () => db.prepare(`
      INSERT INTO account_group_assignments (
        company_id, account_id, account_group_id, effective_from, status, provenance
      ) VALUES (?, ?, ?, '2027-01-01', 'active', 'MANUAL')
    `).run(companyB, expenseAccountId, cashGroupId),
    "company does not match"
  );
  expectError(
    "Read-only classification requires explicit company context",
    () => service.getAccountClassifications(db, { as_of_date: "2026-01-01" }),
    "Company is required"
  );

  const financialYear = db.prepare(
    "SELECT start_date, end_date FROM financial_years WHERE company_id = ? AND status = 'Open' ORDER BY id LIMIT 1"
  ).get(companyId);
  const cashAccountId = Number(db.prepare(
    "SELECT id FROM accounts WHERE company_id = ? AND account_code = '1000'"
  ).get(companyId).id);
  const salesAccountId = Number(db.prepare(
    "SELECT id FROM accounts WHERE company_id = ? AND account_code = '4000'"
  ).get(companyId).id);
  createBalancedVoucher(db, {
    company_id: companyId,
    voucher_date: financialYear.start_date,
    voucher_type: "Journal",
    narration: "FSR-2B.1 report parity fixture",
    source_module: "fsr_2b1_verifier",
    source_id: 1,
    lines: [
      { account_id: cashAccountId, debit: 100, credit: 0 },
      { account_id: salesAccountId, debit: 0, credit: 100 }
    ]
  });

  const reportsBefore = reportSnapshot(db, companyId, financialYear.start_date, financialYear.end_date);
  const voucherTotalsBefore = db.prepare(`
    SELECT
      SUM(debit_minor) debit_minor,
      SUM(credit_minor) credit_minor
    FROM ledger_entries
    WHERE company_id = ?
  `).get(companyId);
  const countsBefore = {
    groups: db.prepare("SELECT COUNT(*) count FROM account_groups").get().count,
    mappings: db.prepare("SELECT COUNT(*) count FROM financial_statement_mappings").get().count,
    assignments: db.prepare("SELECT COUNT(*) count FROM account_group_assignments").get().count
  };
  const registryRowsBefore = JSON.stringify({
    groups: db.prepare("SELECT * FROM account_groups ORDER BY id").all(),
    mappings: db.prepare("SELECT * FROM financial_statement_mappings ORDER BY id").all(),
    assignments: db.prepare("SELECT * FROM account_group_assignments ORDER BY id").all()
  });
  ensureAccountMappingRegistry(db);
  ensureAccountMappingRegistry(db);
  const countsAfter = {
    groups: db.prepare("SELECT COUNT(*) count FROM account_groups").get().count,
    mappings: db.prepare("SELECT COUNT(*) count FROM financial_statement_mappings").get().count,
    assignments: db.prepare("SELECT COUNT(*) count FROM account_group_assignments").get().count
  };
  const registryRowsAfter = JSON.stringify({
    groups: db.prepare("SELECT * FROM account_groups ORDER BY id").all(),
    mappings: db.prepare("SELECT * FROM financial_statement_mappings ORDER BY id").all(),
    assignments: db.prepare("SELECT * FROM account_group_assignments ORDER BY id").all()
  });
  const reportsAfter = reportSnapshot(db, companyId, financialYear.start_date, financialYear.end_date);
  const voucherTotalsAfter = db.prepare(`
    SELECT
      SUM(debit_minor) debit_minor,
      SUM(credit_minor) credit_minor
    FROM ledger_entries
    WHERE company_id = ?
  `).get(companyId);
  check("Registry seeding and backfill are idempotent", JSON.stringify(countsBefore) === JSON.stringify(countsAfter));
  check("Idempotent initialization does not rewrite registry rows", registryRowsBefore === registryRowsAfter);
  check("Existing financial report results remain unchanged", reportsBefore === reportsAfter);
  check(
    "Authoritative ledger minor-unit totals remain unchanged",
    JSON.stringify(voucherTotalsBefore) === JSON.stringify(voucherTotalsAfter)
      && voucherTotalsAfter.debit_minor === voucherTotalsAfter.credit_minor,
    JSON.stringify(voucherTotalsAfter)
  );

  const coverage = service.getAccountMappingCoverage(db, {
    company_id: companyId,
    as_of_date: "2025-12-31"
  });
  check(
    "Coverage reports unmapped custom accounts without false certification",
    coverage.UNMAPPED >= 2 && coverage.certification_ready === false,
    JSON.stringify(coverage)
  );

  check(
    "New mapping tables are accounting protected",
    ["account_groups", "financial_statement_mappings", "account_group_assignments"]
      .every((table) => WRITE_POLICY.accountingReadOnly.has(table))
  );
  const accountColumns = new Set(db.prepare("PRAGMA table_info(accounts)").all().map((column) => column.name));
  check(
    "Migration does not add duplicate mapping authority to accounts",
    !accountColumns.has("financial_statement_section") && !accountColumns.has("account_group_id")
  );
  check("Populated fixture database passes quick_check", db.pragma("quick_check", { simple: true }) === "ok");

  const upgrade = createUpgradeFixture();
  const upgradeAccountSnapshot = JSON.stringify(upgrade.db.prepare("SELECT * FROM accounts ORDER BY id").all());
  applyAccountMappingRegistryMigration(upgrade.db);
  applyAccountMappingRegistryMigration(upgrade.db);
  check(
    "Upgrade fixture receives the deterministic Cash assignment",
    upgrade.db.prepare("SELECT COUNT(*) count FROM account_group_assignments").get().count === 1
  );
  check(
    "Upgrade migration leaves existing account rows unchanged",
    JSON.stringify(upgrade.db.prepare("SELECT * FROM accounts ORDER BY id").all()) === upgradeAccountSnapshot
  );
  upgrade.db.exec(`
    DROP TABLE account_group_assignments;
    DROP TABLE financial_statement_mappings;
    DROP TABLE account_groups;
  `);
  check(
    "Additive rollback preserves pre-existing account data",
    JSON.stringify(upgrade.db.prepare("SELECT * FROM accounts ORDER BY id").all()) === upgradeAccountSnapshot
      && !tableNames(upgrade.db).has("account_groups")
  );
  upgrade.db.close();
} catch (error) {
  failed += 1;
  console.error("FAIL: Unhandled verifier error");
  console.error(error);
} finally {
  try {
    db?.close();
  } catch {
    // Cleanup continues even if the database was already closed.
  }
  roots.forEach((root) => {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch (error) {
      failed += 1;
      console.error(`FAIL: Fixture cleanup - ${error.message}`);
    }
  });
}

console.log("\nFSR-2B.1 Verification Summary");
console.log(`Passed: ${passed}, Failed: ${failed}, Total: ${passed + failed}`);
console.log(`Fixture cleanup: ${roots.every((root) => !fs.existsSync(root)) ? "PASS" : "FAIL"}`);

if (failed > 0) {
  process.exit(1);
}

console.log("FSR-2B.1 REGISTRY FOUNDATION VERIFIED");
process.exit(0);
