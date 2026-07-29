#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  WRITE_POLICY,
  accountingData,
  auditLog,
  createRecord,
  enforcePermission,
  initializeDatabase
} from "../src/main/database/init.js";
import { createAccountMappingService } from "../src/main/services/accountMappingService.js";
import { createDesktopSessionService } from "../src/main/services/desktopSessionService.js";

const results = [];
let passed = 0;
let failed = 0;
let db;
let fixtureRoot;

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

function insertUser(dbHandle, username, role) {
  return Number(dbHandle.prepare(`
    INSERT INTO users (username, password_hash, display_name, role, status)
    VALUES (?, 'fixture:fixture', ?, ?, 'active')
  `).run(username, `FSR-2B.2A ${role}`, role).lastInsertRowid);
}

function insertAccount(dbHandle, companyId, code, name, overrides = {}) {
  return Number(dbHandle.prepare(`
    INSERT INTO accounts (
      company_id, account_code, account_name, account_type,
      normal_balance, opening_balance, opening_balance_minor, status
    ) VALUES (
      @company_id, @account_code, @account_name, @account_type,
      @normal_balance, 0, 0, @status
    )
  `).run({
    company_id: companyId,
    account_code: code,
    account_name: name,
    account_type: overrides.account_type || "Asset",
    normal_balance: overrides.normal_balance || "Debit",
    status: overrides.status || "active"
  }).lastInsertRowid);
}

function reportSnapshot(dbHandle, companyId, dateFrom, dateTo) {
  const data = accountingData(dbHandle, {
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

function accountingTruthSnapshot(dbHandle, companyId) {
  const tableQueries = {
    vouchers: "SELECT * FROM vouchers WHERE company_id = ? ORDER BY id",
    voucher_lines: `
      SELECT line.*
      FROM voucher_lines line
      JOIN vouchers voucher ON voucher.id = line.voucher_id
      WHERE voucher.company_id = ?
      ORDER BY line.id
    `,
    ledger_entries: "SELECT * FROM ledger_entries WHERE company_id = ? ORDER BY id",
    stock_ledger: "SELECT * FROM stock_ledger WHERE company_id = ? ORDER BY id"
  };
  return JSON.stringify(Object.fromEntries(
    Object.entries(tableQueries).map(([table, query]) => [
      table,
      dbHandle.prepare(query).all(companyId)
    ])
  ));
}

try {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gii-gem-fsr2b2a-"));
  db = initializeDatabase(fixtureRoot);

  const mappingService = createAccountMappingService({ auditLog });
  const desktopSessions = createDesktopSessionService({
    auditLog,
    enforcePermission
  });

  const companyId = Number(
    db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get().id
  );
  const secondCompanyId = Number(db.prepare(`
    INSERT INTO companies (company_name, status)
    VALUES ('FSR-2B.2A Isolation Company', 'active')
  `).run().lastInsertRowid);
  const financialYear = db.prepare(`
    SELECT start_date, end_date
    FROM financial_years
    WHERE company_id = ?
    ORDER BY start_date
    LIMIT 1
  `).get(companyId);

  const adminId = insertUser(db, "fsr2b2a_admin", "admin");
  const accountantId = insertUser(db, "fsr2b2a_accountant", "accountant");
  const managerId = insertUser(db, "fsr2b2a_manager", "manager");
  const dataEntryId = insertUser(db, "fsr2b2a_data_entry", "data_entry_operator");
  const viewerId = insertUser(db, "fsr2b2a_viewer", "viewer");

  desktopSessions.bindSession(101, {
    id: adminId,
    username: "fsr2b2a_admin",
    role: "admin"
  });
  desktopSessions.bindSession(102, {
    id: accountantId,
    username: "fsr2b2a_accountant",
    role: "accountant"
  });
  desktopSessions.bindSession(103, {
    id: managerId,
    username: "fsr2b2a_manager",
    role: "manager"
  });
  desktopSessions.bindSession(104, {
    id: dataEntryId,
    username: "fsr2b2a_data_entry",
    role: "data_entry_operator"
  });
  desktopSessions.bindSession(105, {
    id: viewerId,
    username: "fsr2b2a_viewer",
    role: "viewer"
  });

  const adminActor = desktopSessions.requirePermission(
    db,
    101,
    "account_mapping",
    { company_id: companyId, module: "account_mapping" }
  );
  const accountantActor = desktopSessions.requirePermission(
    db,
    102,
    "account_mapping",
    { company_id: companyId, module: "account_mapping" }
  );
  check("Administrator has dedicated account-mapping permission", adminActor.id === adminId);
  check("Accountant has dedicated account-mapping permission", accountantActor.id === accountantId);

  expectError(
    "Manager is denied account-mapping permission",
    () => desktopSessions.requirePermission(
      db,
      103,
      "account_mapping",
      { company_id: companyId, module: "account_mapping" }
    ),
    "Permission denied"
  );
  expectError(
    "Data Entry Operator is denied account-mapping permission",
    () => desktopSessions.requirePermission(
      db,
      104,
      "account_mapping",
      { company_id: companyId, module: "account_mapping" }
    ),
    "Permission denied"
  );
  expectError(
    "Viewer is denied account-mapping permission",
    () => desktopSessions.requirePermission(
      db,
      105,
      "account_mapping",
      { company_id: companyId, module: "account_mapping" }
    ),
    "Permission denied"
  );
  expectError(
    "Unsigned Electron window is denied",
    () => desktopSessions.requirePermission(
      db,
      999,
      "account_mapping",
      { company_id: companyId, module: "account_mapping" }
    ),
    "not signed in"
  );
  expectError(
    "Renderer payload cannot impersonate an administrator",
    () => desktopSessions.requirePermission(
      db,
      103,
      "account_mapping",
      {
        company_id: companyId,
        module: "account_mapping",
        user_id: adminId
      }
    ),
    "Permission denied"
  );

  desktopSessions.clearSession(101);
  expectError(
    "Logout clears the Electron window authorization",
    () => desktopSessions.requirePermission(
      db,
      101,
      "account_mapping",
      { company_id: companyId, module: "account_mapping" }
    ),
    "not signed in"
  );

  const cashGroup = db.prepare(`
    SELECT * FROM account_groups
    WHERE group_code = 'CASH_AND_CASH_EQUIVALENTS'
  `).get();
  const receivableGroup = db.prepare(`
    SELECT * FROM account_groups
    WHERE group_code = 'TRADE_RECEIVABLES'
  `).get();
  const headingGroup = db.prepare(`
    SELECT * FROM account_groups
    WHERE group_code = 'ASSETS'
  `).get();
  const payableGroup = db.prepare(`
    SELECT * FROM account_groups
    WHERE group_code = 'TRADE_PAYABLES'
  `).get();
  check(
    "Verifier resolved required governed account groups",
    [cashGroup, receivableGroup, headingGroup, payableGroup].every(Boolean)
  );

  const accountId = insertAccount(
    db,
    companyId,
    "FSR2B2A-001",
    "FSR-2B.2A Controlled Mapping Fixture"
  );
  const sameDateAccountId = insertAccount(
    db,
    companyId,
    "FSR2B2A-002",
    "FSR-2B.2A Same-Date Fixture"
  );
  const inactiveAccountId = insertAccount(
    db,
    companyId,
    "FSR2B2A-003",
    "FSR-2B.2A Inactive Fixture",
    { status: "inactive" }
  );

  const accountBefore = JSON.stringify(
    db.prepare("SELECT * FROM accounts WHERE id = ?").get(accountId)
  );
  const truthBefore = accountingTruthSnapshot(db, companyId);
  const reportsBefore = reportSnapshot(
    db,
    companyId,
    financialYear.start_date,
    financialYear.end_date
  );

  expectError(
    "Company is mandatory",
    () => mappingService.assignAccountGroup(db, {
      account_id: accountId,
      account_group_id: cashGroup.id,
      effective_from: "2026-01-01",
      change_reason: "Missing company fixture"
    }, {
      user_id: accountantActor.id,
      user_role: accountantActor.role
    }),
    "Company is required"
  );
  expectError(
    "Wrong-company assignment is rejected",
    () => mappingService.assignAccountGroup(db, {
      company_id: secondCompanyId,
      account_id: accountId,
      account_group_id: cashGroup.id,
      effective_from: "2026-01-01",
      change_reason: "Wrong company fixture"
    }, {
      user_id: accountantActor.id,
      user_role: accountantActor.role
    }),
    "does not belong"
  );
  expectError(
    "Statement heading cannot be assigned to an account",
    () => mappingService.assignAccountGroup(db, {
      company_id: companyId,
      account_id: accountId,
      account_group_id: headingGroup.id,
      effective_from: "2026-01-01",
      change_reason: "Heading rejection fixture"
    }, {
      user_id: accountantActor.id,
      user_role: accountantActor.role
    }),
    "posting account group"
  );
  expectError(
    "Incompatible account type is rejected",
    () => mappingService.assignAccountGroup(db, {
      company_id: companyId,
      account_id: accountId,
      account_group_id: payableGroup.id,
      effective_from: "2026-01-01",
      change_reason: "Type rejection fixture"
    }, {
      user_id: accountantActor.id,
      user_role: accountantActor.role
    }),
    "incompatible"
  );

  const incompatibleBalanceGroupId = Number(db.prepare(`
    INSERT INTO account_groups (
      group_code, group_name, account_type, normal_balance,
      posting_allowed, system_protected, display_order, status
    ) VALUES (
      'FSR2B2A_ASSET_CREDIT', 'FSR-2B.2A Asset Credit Fixture',
      'Asset', 'Credit', 1, 1, 9999, 'active'
    )
  `).run().lastInsertRowid);
  expectError(
    "Incompatible normal balance is rejected",
    () => mappingService.assignAccountGroup(db, {
      company_id: companyId,
      account_id: accountId,
      account_group_id: incompatibleBalanceGroupId,
      effective_from: "2026-01-01",
      change_reason: "Balance rejection fixture"
    }, {
      user_id: accountantActor.id,
      user_role: accountantActor.role
    }),
    "normal balance"
  );
  const incompleteGroupId = Number(db.prepare(`
    INSERT INTO account_groups (
      group_code, group_name, account_type, normal_balance,
      posting_allowed, system_protected, display_order, status
    ) VALUES (
      'FSR2B2A_UNMAPPED_GROUP', 'FSR-2B.2A Unmapped Group Fixture',
      'Asset', 'Debit', 1, 1, 9998, 'active'
    )
  `).run().lastInsertRowid);
  expectError(
    "Account group without governed statement placement is rejected",
    () => mappingService.assignAccountGroup(db, {
      company_id: companyId,
      account_id: accountId,
      account_group_id: incompleteGroupId,
      effective_from: "2026-01-01",
      change_reason: "Incomplete group rejection fixture"
    }, {
      user_id: accountantActor.id,
      user_role: accountantActor.role
    }),
    "no active governed financial-statement mapping"
  );
  expectError(
    "Inactive account is rejected",
    () => mappingService.assignAccountGroup(db, {
      company_id: companyId,
      account_id: inactiveAccountId,
      account_group_id: cashGroup.id,
      effective_from: "2026-01-01",
      change_reason: "Inactive account fixture"
    }, {
      user_id: accountantActor.id,
      user_role: accountantActor.role
    }),
    "active account"
  );
  expectError(
    "Invalid calendar date is rejected",
    () => mappingService.assignAccountGroup(db, {
      company_id: companyId,
      account_id: accountId,
      account_group_id: cashGroup.id,
      effective_from: "2026-02-30",
      change_reason: "Invalid date fixture"
    }, {
      user_id: accountantActor.id,
      user_role: accountantActor.role
    }),
    "YYYY-MM-DD"
  );
  expectError(
    "Change reason is mandatory",
    () => mappingService.assignAccountGroup(db, {
      company_id: companyId,
      account_id: accountId,
      account_group_id: cashGroup.id,
      effective_from: "2026-01-01"
    }, {
      user_id: accountantActor.id,
      user_role: accountantActor.role
    }),
    "Change reason"
  );

  const created = mappingService.assignAccountGroup(db, {
    company_id: companyId,
    account_id: accountId,
    account_group_id: cashGroup.id,
    effective_from: "2026-01-01",
    change_reason: "Initial controlled classification"
  }, {
    user_id: accountantActor.id,
    user_role: accountantActor.role
  });
  check(
    "Controlled assignment creates a manual mapping",
    created.changed === true
      && created.assignment.provenance === "MANUAL"
      && Number(created.assignment.assigned_by) === accountantId
  );

  const changed = mappingService.assignAccountGroup(db, {
    company_id: companyId,
    account_id: accountId,
    account_group_id: receivableGroup.id,
    effective_from: "2026-07-01",
    change_reason: "Reclassified after accounting review"
  }, {
    user_id: accountantActor.id,
    user_role: accountantActor.role
  });
  const history = db.prepare(`
    SELECT assignment.*, group_row.group_code
    FROM account_group_assignments assignment
    JOIN account_groups group_row ON group_row.id = assignment.account_group_id
    WHERE assignment.account_id = ?
    ORDER BY assignment.effective_from
  `).all(accountId);
  check(
    "Changed assignment preserves exact history",
    changed.changed === true
      && history.length === 2
      && history[0].group_code === "CASH_AND_CASH_EQUIVALENTS"
      && history[0].effective_to === "2026-06-30"
      && history[0].status === "active"
      && history[1].group_code === "TRADE_RECEIVABLES"
      && history[1].effective_to === null
  );

  const historicalClassification = mappingService.getAccountClassifications(db, {
    company_id: companyId,
    as_of_date: "2026-06-30"
  }).find((row) => row.account_id === accountId);
  const currentClassification = mappingService.getAccountClassifications(db, {
    company_id: companyId,
    as_of_date: "2026-07-01"
  }).find((row) => row.account_id === accountId);
  check(
    "Historical classification resolves by effective date",
    historicalClassification?.group_code === "CASH_AND_CASH_EQUIVALENTS"
      && currentClassification?.group_code === "TRADE_RECEIVABLES"
  );

  const countBeforeNoop = db.prepare(`
    SELECT COUNT(*) count
    FROM account_group_assignments
    WHERE account_id = ?
  `).get(accountId).count;
  const noop = mappingService.assignAccountGroup(db, {
    company_id: companyId,
    account_id: accountId,
    account_group_id: receivableGroup.id,
    effective_from: "2026-08-01",
    change_reason: "Confirm current reviewed classification"
  }, {
    user_id: accountantActor.id,
    user_role: accountantActor.role
  });
  const countAfterNoop = db.prepare(`
    SELECT COUNT(*) count
    FROM account_group_assignments
    WHERE account_id = ?
  `).get(accountId).count;
  check(
    "Identical effective assignment is idempotent",
    noop.changed === false && countBeforeNoop === countAfterNoop
  );

  mappingService.assignAccountGroup(db, {
    company_id: companyId,
    account_id: sameDateAccountId,
    account_group_id: cashGroup.id,
    effective_from: "2026-01-01",
    change_reason: "Initial same-date fixture"
  }, {
    user_id: adminActor.id,
    user_role: adminActor.role
  });
  const corrected = mappingService.assignAccountGroup(db, {
    company_id: companyId,
    account_id: sameDateAccountId,
    account_group_id: receivableGroup.id,
    effective_from: "2026-01-01",
    change_reason: "Corrected on the original effective date"
  }, {
    user_id: adminActor.id,
    user_role: adminActor.role
  });
  check(
    "Same-date correction updates one governed row",
    corrected.changed === true
      && corrected.assignment.group_code === "TRADE_RECEIVABLES"
      && db.prepare(`
        SELECT COUNT(*) count FROM account_group_assignments WHERE account_id = ?
      `).get(sameDateAccountId).count === 1
  );

  mappingService.assignAccountGroup(db, {
    company_id: companyId,
    account_id: sameDateAccountId,
    account_group_id: cashGroup.id,
    effective_from: "2027-01-01",
    change_reason: "Approved future classification"
  }, {
    user_id: adminActor.id,
    user_role: adminActor.role
  });
  expectError(
    "Uncontrolled backdated change before a later mapping is rejected",
    () => mappingService.assignAccountGroup(db, {
      company_id: companyId,
      account_id: sameDateAccountId,
      account_group_id: receivableGroup.id,
      effective_from: "2026-06-01",
      change_reason: "Backdated conflict fixture"
    }, {
      user_id: adminActor.id,
      user_role: adminActor.role
    }),
    "later account mapping"
  );

  const auditRows = db.prepare(`
    SELECT action, company_id, user_id, old_value, new_value
    FROM audit_log
    WHERE module = 'account_mapping'
    ORDER BY id
  `).all();
  check(
    "Mapping changes write company and user audit evidence",
    auditRows.some((row) => (
      row.action === "account_mapping_assignment_created"
      && Number(row.company_id) === companyId
      && Number(row.user_id) === accountantId
      && row.new_value
    ))
  );
  check(
    "Mapping reclassification audit contains old and new evidence",
    auditRows.some((row) => (
      row.action === "account_mapping_assignment_changed"
      && row.old_value
      && row.new_value
    ))
  );
  check(
    "Permission denials are auditable",
    auditRows.some((row) => row.action === "permission_denied")
  );

  const reviewQueue = mappingService.getAccountMappingReviewQueue(db, {
    company_id: companyId,
    as_of_date: "2026-07-01"
  });
  check(
    "Review queue exposes only unresolved mappings",
    reviewQueue.length > 0
      && reviewQueue.every((row) => row.mapping_status !== "MAPPED")
  );

  expectError(
    "Generic CRUD cannot bypass account-mapping governance",
    () => createRecord(db, "account_group_assignments", {
      company_id: companyId,
      account_id: accountId,
      account_group_id: cashGroup.id,
      effective_from: "2028-01-01",
      status: "active",
      provenance: "MANUAL"
    }),
    "accounting-controlled"
  );
  check(
    "Mapping tables remain accounting protected",
    ["account_groups", "financial_statement_mappings", "account_group_assignments"]
      .every((table) => WRITE_POLICY.accountingReadOnly.has(table))
  );

  const accountAfter = JSON.stringify(
    db.prepare("SELECT * FROM accounts WHERE id = ?").get(accountId)
  );
  const truthAfter = accountingTruthSnapshot(db, companyId);
  const reportsAfter = reportSnapshot(
    db,
    companyId,
    financialYear.start_date,
    financialYear.end_date
  );
  check("Assignment does not alter the account master", accountBefore === accountAfter);
  check("Assignment does not alter vouchers, ledgers, or inventory", truthBefore === truthAfter);
  check("Assignment does not alter financial report amounts", reportsBefore === reportsAfter);

  const mainSource = fs.readFileSync(
    path.join(process.cwd(), "src", "main", "main.js"),
    "utf8"
  );
  const preloadSource = fs.readFileSync(
    path.join(process.cwd(), "src", "preload", "preload.cjs"),
    "utf8"
  );
  const clientSource = fs.readFileSync(
    path.join(process.cwd(), "src", "renderer", "api", "client.js"),
    "utf8"
  );
  check(
    "Desktop API exposes dedicated mapping read and assignment channels",
    [
      "account-mapping:registry",
      "account-mapping:classifications",
      "account-mapping:coverage",
      "account-mapping:review-queue",
      "account-mapping:assign"
    ].every((channel) => mainSource.includes(channel) && preloadSource.includes(channel))
  );
  check(
    "Mapping channels use session-bound permission enforcement",
    mainSource.includes('sessionGuarded("account_mapping"')
      && mainSource.includes("desktopSessions.requirePermission")
  );
  check(
    "Browser preview blocks mapping mutation",
    clientSource.includes('"assignAccountGroup"')
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
    // Cleanup continues if the fixture database is already closed.
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

console.log("\nFSR-2B.2A Verification Summary");
console.log(`Passed: ${passed}, Failed: ${failed}, Total: ${passed + failed}`);
console.log(`Fixture cleanup: ${fixtureRoot && !fs.existsSync(fixtureRoot) ? "PASS" : "FAIL"}`);

if (failed > 0) {
  process.exit(1);
}

console.log("FSR-2B.2A CONTROLLED ACCOUNT ASSIGNMENT VERIFIED");
process.exit(0);
