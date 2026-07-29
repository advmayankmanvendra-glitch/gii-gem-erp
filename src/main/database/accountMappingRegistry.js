export const FSR2B1_MIGRATION_NAME = "035_fsr2b1_account_mapping_registry";
export const DEFAULT_REPORTING_PROFILE = {
  code: "GII_STANDARD",
  version: "1.0.0",
  effectiveFrom: "1900-01-01"
};

const GROUPS = [
  ["ASSETS", "Assets", null, "Asset", "Debit", 0, 100],
  ["CURRENT_ASSETS", "Current Assets", "ASSETS", "Asset", "Debit", 0, 110],
  ["CASH_AND_CASH_EQUIVALENTS", "Cash and Cash Equivalents", "CURRENT_ASSETS", "Asset", "Debit", 1, 111],
  ["TRADE_RECEIVABLES", "Trade Receivables", "CURRENT_ASSETS", "Asset", "Debit", 1, 112],
  ["TAX_RECEIVABLES", "Tax Receivables", "CURRENT_ASSETS", "Asset", "Debit", 1, 113],
  ["INVENTORIES", "Inventories", "CURRENT_ASSETS", "Asset", "Debit", 1, 114],
  ["LIABILITIES", "Liabilities", null, "Liability", "Credit", 0, 200],
  ["CURRENT_LIABILITIES", "Current Liabilities", "LIABILITIES", "Liability", "Credit", 0, 210],
  ["TRADE_PAYABLES", "Trade Payables", "CURRENT_LIABILITIES", "Liability", "Credit", 1, 211],
  ["GOODS_RECEIVED_NOT_INVOICED", "Goods Received Not Invoiced", "CURRENT_LIABILITIES", "Liability", "Credit", 1, 212],
  ["TAX_LIABILITIES", "Tax Liabilities", "CURRENT_LIABILITIES", "Liability", "Credit", 1, 213],
  ["OTHER_CURRENT_PAYABLES", "Other Current Payables", "CURRENT_LIABILITIES", "Liability", "Credit", 1, 214],
  ["EQUITY", "Equity", null, "Equity", "Credit", 0, 300],
  ["OWNER_EQUITY", "Owner Equity", "EQUITY", "Equity", "Credit", 1, 311],
  ["OPENING_BALANCE_SUSPENSE", "Opening Balance Suspense", "EQUITY", "Equity", "Credit", 1, 312],
  ["RETAINED_EARNINGS", "Retained Earnings", "EQUITY", "Equity", "Credit", 1, 313],
  ["INCOME", "Income", null, "Income", "Credit", 0, 400],
  ["OPERATING_REVENUE", "Operating Revenue", "INCOME", "Income", "Credit", 1, 411],
  ["INVENTORY_ADJUSTMENT_GAIN", "Inventory Adjustment Gain", "INCOME", "Income", "Credit", 1, 412],
  ["EXPENSES", "Expenses", null, "Expense", "Debit", 0, 500],
  ["DIRECT_COSTS", "Direct Costs", "EXPENSES", "Expense", "Debit", 0, 510],
  ["PURCHASES", "Purchases", "DIRECT_COSTS", "Expense", "Debit", 1, 511],
  ["COST_OF_GOODS_SOLD", "Cost of Goods Sold", "DIRECT_COSTS", "Expense", "Debit", 1, 512],
  ["INVENTORY_ADJUSTMENT_LOSS", "Inventory Adjustment Loss", "DIRECT_COSTS", "Expense", "Debit", 1, 513],
  ["DIRECT_EXPENSES", "Direct Expenses", "DIRECT_COSTS", "Expense", "Debit", 1, 514],
  ["OPERATING_EXPENSES", "Operating Expenses", "EXPENSES", "Expense", "Debit", 0, 520],
  ["EMPLOYEE_COSTS", "Employee Costs", "OPERATING_EXPENSES", "Expense", "Debit", 1, 521],
  ["FINANCE_COSTS", "Finance Costs", "OPERATING_EXPENSES", "Expense", "Debit", 1, 522],
  ["OTHER_EXPENSES", "Other Expenses", "OPERATING_EXPENSES", "Expense", "Debit", 1, 523]
];

const STATEMENT_MAPPINGS = [
  ["CASH_AND_CASH_EQUIVALENTS", "BALANCE_SHEET", "ASSETS", "Assets", "CURRENT_ASSETS", "Current Assets", "CURRENT", 111],
  ["TRADE_RECEIVABLES", "BALANCE_SHEET", "ASSETS", "Assets", "CURRENT_ASSETS", "Current Assets", "CURRENT", 112],
  ["TAX_RECEIVABLES", "BALANCE_SHEET", "ASSETS", "Assets", "CURRENT_ASSETS", "Current Assets", "CURRENT", 113],
  ["INVENTORIES", "BALANCE_SHEET", "ASSETS", "Assets", "CURRENT_ASSETS", "Current Assets", "CURRENT", 114],
  ["TRADE_PAYABLES", "BALANCE_SHEET", "LIABILITIES", "Liabilities", "CURRENT_LIABILITIES", "Current Liabilities", "CURRENT", 211],
  ["GOODS_RECEIVED_NOT_INVOICED", "BALANCE_SHEET", "LIABILITIES", "Liabilities", "CURRENT_LIABILITIES", "Current Liabilities", "CURRENT", 212],
  ["TAX_LIABILITIES", "BALANCE_SHEET", "LIABILITIES", "Liabilities", "CURRENT_LIABILITIES", "Current Liabilities", "CURRENT", 213],
  ["OTHER_CURRENT_PAYABLES", "BALANCE_SHEET", "LIABILITIES", "Liabilities", "CURRENT_LIABILITIES", "Current Liabilities", "CURRENT", 214],
  ["OWNER_EQUITY", "BALANCE_SHEET", "EQUITY", "Equity", "EQUITY", "Equity", "NOT_APPLICABLE", 311],
  ["OPENING_BALANCE_SUSPENSE", "BALANCE_SHEET", "EQUITY", "Equity", "UNRESOLVED_OPENINGS", "Unresolved Opening Balances", "NOT_APPLICABLE", 312],
  ["RETAINED_EARNINGS", "BALANCE_SHEET", "EQUITY", "Equity", "RETAINED_EARNINGS", "Retained Earnings", "NOT_APPLICABLE", 313],
  ["OPERATING_REVENUE", "PROFIT_AND_LOSS", "REVENUE", "Revenue", "OPERATING_REVENUE", "Operating Revenue", "NOT_APPLICABLE", 411],
  ["INVENTORY_ADJUSTMENT_GAIN", "PROFIT_AND_LOSS", "OTHER_INCOME", "Other Income", "INVENTORY_ADJUSTMENTS", "Inventory Adjustments", "NOT_APPLICABLE", 412],
  ["PURCHASES", "PROFIT_AND_LOSS", "DIRECT_COSTS", "Direct Costs", "PURCHASES", "Purchases", "NOT_APPLICABLE", 511],
  ["COST_OF_GOODS_SOLD", "PROFIT_AND_LOSS", "DIRECT_COSTS", "Direct Costs", "COST_OF_GOODS_SOLD", "Cost of Goods Sold", "NOT_APPLICABLE", 512],
  ["INVENTORY_ADJUSTMENT_LOSS", "PROFIT_AND_LOSS", "DIRECT_COSTS", "Direct Costs", "INVENTORY_ADJUSTMENTS", "Inventory Adjustments", "NOT_APPLICABLE", 513],
  ["DIRECT_EXPENSES", "PROFIT_AND_LOSS", "DIRECT_COSTS", "Direct Costs", "DIRECT_EXPENSES", "Direct Expenses", "NOT_APPLICABLE", 514],
  ["EMPLOYEE_COSTS", "PROFIT_AND_LOSS", "OPERATING_EXPENSES", "Operating Expenses", "EMPLOYEE_COSTS", "Employee Costs", "NOT_APPLICABLE", 521],
  ["FINANCE_COSTS", "PROFIT_AND_LOSS", "FINANCE_COSTS", "Finance Costs", "FINANCE_COSTS", "Finance Costs", "NOT_APPLICABLE", 522],
  ["OTHER_EXPENSES", "PROFIT_AND_LOSS", "OTHER_EXPENSES", "Other Expenses", "OTHER_EXPENSES", "Other Expenses", "NOT_APPLICABLE", 523]
];

const DEFAULT_ACCOUNT_GROUPS = new Map([
  ["1000", "CASH_AND_CASH_EQUIVALENTS"],
  ["1010", "CASH_AND_CASH_EQUIVALENTS"],
  ["1100", "TRADE_RECEIVABLES"],
  ["1200", "TAX_RECEIVABLES"],
  ["1210", "TAX_RECEIVABLES"],
  ["1300", "TAX_RECEIVABLES"],
  ["1400", "INVENTORIES"],
  ["2000", "TRADE_PAYABLES"],
  ["2010", "GOODS_RECEIVED_NOT_INVOICED"],
  ["2100", "TAX_LIABILITIES"],
  ["2110", "TAX_LIABILITIES"],
  ["2200", "OTHER_CURRENT_PAYABLES"],
  ["2300", "OTHER_CURRENT_PAYABLES"],
  ["3000", "OWNER_EQUITY"],
  ["3010", "OPENING_BALANCE_SUSPENSE"],
  ["4000", "OPERATING_REVENUE"],
  ["4060", "INVENTORY_ADJUSTMENT_GAIN"],
  ["5000", "PURCHASES"],
  ["5050", "COST_OF_GOODS_SOLD"],
  ["5060", "INVENTORY_ADJUSTMENT_LOSS"],
  ["5100", "DIRECT_EXPENSES"],
  ["5110", "DIRECT_EXPENSES"],
  ["5120", "DIRECT_EXPENSES"],
  ["5130", "DIRECT_EXPENSES"],
  ["5140", "DIRECT_EXPENSES"],
  ["5150", "EMPLOYEE_COSTS"],
  ["5160", "FINANCE_COSTS"],
  ["5170", "OTHER_EXPENSES"],
  ["5990", "RETAINED_EARNINGS"]
]);

export function createAccountMappingRegistryTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_code TEXT NOT NULL UNIQUE,
      group_name TEXT NOT NULL,
      parent_group_id INTEGER,
      account_type TEXT NOT NULL CHECK(account_type IN ('Asset','Liability','Equity','Income','Expense')),
      normal_balance TEXT NOT NULL CHECK(normal_balance IN ('Debit','Credit')),
      contra_behavior TEXT NOT NULL DEFAULT 'normal' CHECK(contra_behavior IN ('normal','contra')),
      posting_allowed INTEGER NOT NULL DEFAULT 1 CHECK(posting_allowed IN (0,1)),
      system_protected INTEGER NOT NULL DEFAULT 1 CHECK(system_protected IN (0,1)),
      display_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_group_id) REFERENCES account_groups(id)
    );

    CREATE TABLE IF NOT EXISTS financial_statement_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporting_profile_code TEXT NOT NULL,
      reporting_profile_version TEXT NOT NULL,
      account_group_id INTEGER NOT NULL,
      statement_code TEXT NOT NULL CHECK(statement_code IN ('BALANCE_SHEET','PROFIT_AND_LOSS')),
      section_code TEXT NOT NULL,
      section_name TEXT NOT NULL,
      subsection_code TEXT NOT NULL,
      subsection_name TEXT NOT NULL,
      current_non_current TEXT NOT NULL DEFAULT 'NOT_APPLICABLE'
        CHECK(current_non_current IN ('CURRENT','NON_CURRENT','NOT_APPLICABLE')),
      presentation_sign TEXT NOT NULL DEFAULT 'NORMAL' CHECK(presentation_sign IN ('NORMAL','INVERT')),
      display_order INTEGER NOT NULL DEFAULT 0,
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','superseded','inactive')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK(effective_to IS NULL OR effective_to >= effective_from),
      UNIQUE(reporting_profile_code, reporting_profile_version, account_group_id, effective_from),
      FOREIGN KEY (account_group_id) REFERENCES account_groups(id)
    );

    CREATE TABLE IF NOT EXISTS account_group_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      account_group_id INTEGER NOT NULL,
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','superseded','inactive')),
      provenance TEXT NOT NULL CHECK(provenance IN ('SYSTEM_SEED','MANUAL','IMPORT_REVIEW')),
      assigned_by INTEGER,
      change_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK(effective_to IS NULL OR effective_to >= effective_from),
      UNIQUE(account_id, effective_from),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      FOREIGN KEY (account_group_id) REFERENCES account_groups(id),
      FOREIGN KEY (assigned_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_account_groups_parent ON account_groups(parent_group_id, display_order);
    CREATE INDEX IF NOT EXISTS idx_statement_mappings_profile
      ON financial_statement_mappings(reporting_profile_code, reporting_profile_version, statement_code, display_order);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_statement_mappings_current
      ON financial_statement_mappings(reporting_profile_code, reporting_profile_version, account_group_id)
      WHERE effective_to IS NULL AND status = 'active';
    CREATE INDEX IF NOT EXISTS idx_account_group_assignments_lookup
      ON account_group_assignments(company_id, account_id, effective_from, effective_to, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_account_group_assignments_current
      ON account_group_assignments(account_id)
      WHERE effective_to IS NULL AND status = 'active';

    DROP TRIGGER IF EXISTS trg_account_group_assignment_insert_guard;
    DROP TRIGGER IF EXISTS trg_account_group_assignment_update_guard;

    CREATE TRIGGER trg_account_group_assignment_insert_guard
    BEFORE INSERT ON account_group_assignments
    BEGIN
      SELECT CASE
        WHEN date(NEW.effective_from) IS NULL OR NEW.effective_from <> date(NEW.effective_from)
          OR (
            NEW.effective_to IS NOT NULL
            AND (date(NEW.effective_to) IS NULL OR NEW.effective_to <> date(NEW.effective_to))
          )
        THEN RAISE(ABORT, 'Account mapping dates must use YYYY-MM-DD')
      END;
      SELECT CASE
        WHEN (SELECT company_id FROM accounts WHERE id = NEW.account_id) <> NEW.company_id
        THEN RAISE(ABORT, 'Account mapping company does not match account company')
      END;
      SELECT CASE
        WHEN (SELECT account_type FROM accounts WHERE id = NEW.account_id)
          <> (SELECT account_type FROM account_groups WHERE id = NEW.account_group_id)
        THEN RAISE(ABORT, 'Account type is incompatible with account group')
      END;
      SELECT CASE
        WHEN (SELECT normal_balance FROM accounts WHERE id = NEW.account_id)
          <> (SELECT normal_balance FROM account_groups WHERE id = NEW.account_group_id)
        THEN RAISE(ABORT, 'Account normal balance is incompatible with account group')
      END;
      SELECT CASE
        WHEN NEW.status = 'active' AND EXISTS (
          SELECT 1
          FROM account_group_assignments existing
          WHERE existing.account_id = NEW.account_id
            AND existing.status = 'active'
            AND existing.effective_from <= COALESCE(NEW.effective_to, '9999-12-31')
            AND COALESCE(existing.effective_to, '9999-12-31') >= NEW.effective_from
        )
        THEN RAISE(ABORT, 'Account mapping effective dates overlap')
      END;
    END;

    CREATE TRIGGER trg_account_group_assignment_update_guard
    BEFORE UPDATE OF
      company_id, account_id, account_group_id, effective_from, effective_to, status
    ON account_group_assignments
    BEGIN
      SELECT CASE
        WHEN date(NEW.effective_from) IS NULL OR NEW.effective_from <> date(NEW.effective_from)
          OR (
            NEW.effective_to IS NOT NULL
            AND (date(NEW.effective_to) IS NULL OR NEW.effective_to <> date(NEW.effective_to))
          )
        THEN RAISE(ABORT, 'Account mapping dates must use YYYY-MM-DD')
      END;
      SELECT CASE
        WHEN (SELECT company_id FROM accounts WHERE id = NEW.account_id) <> NEW.company_id
        THEN RAISE(ABORT, 'Account mapping company does not match account company')
      END;
      SELECT CASE
        WHEN (SELECT account_type FROM accounts WHERE id = NEW.account_id)
          <> (SELECT account_type FROM account_groups WHERE id = NEW.account_group_id)
        THEN RAISE(ABORT, 'Account type is incompatible with account group')
      END;
      SELECT CASE
        WHEN (SELECT normal_balance FROM accounts WHERE id = NEW.account_id)
          <> (SELECT normal_balance FROM account_groups WHERE id = NEW.account_group_id)
        THEN RAISE(ABORT, 'Account normal balance is incompatible with account group')
      END;
      SELECT CASE
        WHEN NEW.status = 'active' AND EXISTS (
          SELECT 1
          FROM account_group_assignments existing
          WHERE existing.account_id = NEW.account_id
            AND existing.id <> NEW.id
            AND existing.status = 'active'
            AND existing.effective_from <= COALESCE(NEW.effective_to, '9999-12-31')
            AND COALESCE(existing.effective_to, '9999-12-31') >= NEW.effective_from
        )
        THEN RAISE(ABORT, 'Account mapping effective dates overlap')
      END;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_statement_mapping_insert_guard
    BEFORE INSERT ON financial_statement_mappings
    BEGIN
      SELECT CASE
        WHEN date(NEW.effective_from) IS NULL OR NEW.effective_from <> date(NEW.effective_from)
          OR (
            NEW.effective_to IS NOT NULL
            AND (date(NEW.effective_to) IS NULL OR NEW.effective_to <> date(NEW.effective_to))
          )
        THEN RAISE(ABORT, 'Statement mapping dates must use YYYY-MM-DD')
      END;
      SELECT CASE
        WHEN NEW.status = 'active' AND EXISTS (
          SELECT 1
          FROM financial_statement_mappings existing
          WHERE existing.reporting_profile_code = NEW.reporting_profile_code
            AND existing.reporting_profile_version = NEW.reporting_profile_version
            AND existing.account_group_id = NEW.account_group_id
            AND existing.effective_from <> NEW.effective_from
            AND existing.status = 'active'
            AND existing.effective_from <= COALESCE(NEW.effective_to, '9999-12-31')
            AND COALESCE(existing.effective_to, '9999-12-31') >= NEW.effective_from
        )
        THEN RAISE(ABORT, 'Statement mapping effective dates overlap')
      END;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_statement_mapping_update_guard
    BEFORE UPDATE OF
      reporting_profile_code, reporting_profile_version, account_group_id,
      effective_from, effective_to, status
    ON financial_statement_mappings
    BEGIN
      SELECT CASE
        WHEN date(NEW.effective_from) IS NULL OR NEW.effective_from <> date(NEW.effective_from)
          OR (
            NEW.effective_to IS NOT NULL
            AND (date(NEW.effective_to) IS NULL OR NEW.effective_to <> date(NEW.effective_to))
          )
        THEN RAISE(ABORT, 'Statement mapping dates must use YYYY-MM-DD')
      END;
      SELECT CASE
        WHEN NEW.status = 'active' AND EXISTS (
          SELECT 1
          FROM financial_statement_mappings existing
          WHERE existing.reporting_profile_code = NEW.reporting_profile_code
            AND existing.reporting_profile_version = NEW.reporting_profile_version
            AND existing.account_group_id = NEW.account_group_id
            AND existing.id <> NEW.id
            AND existing.status = 'active'
            AND existing.effective_from <= COALESCE(NEW.effective_to, '9999-12-31')
            AND COALESCE(existing.effective_to, '9999-12-31') >= NEW.effective_from
        )
        THEN RAISE(ABORT, 'Statement mapping effective dates overlap')
      END;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_accounts_mapping_compatibility_update_guard
    BEFORE UPDATE OF company_id, account_type, normal_balance ON accounts
    BEGIN
      SELECT CASE
        WHEN EXISTS (
          SELECT 1
          FROM account_group_assignments assignment
          JOIN account_groups group_row ON group_row.id = assignment.account_group_id
          WHERE assignment.account_id = OLD.id
            AND assignment.status = 'active'
            AND (
              NEW.company_id <> assignment.company_id
              OR NEW.account_type <> group_row.account_type
              OR NEW.normal_balance <> group_row.normal_balance
            )
        )
        THEN RAISE(ABORT, 'Account change is incompatible with its active account mapping')
      END;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_account_groups_assignment_compatibility_update_guard
    BEFORE UPDATE OF account_type, normal_balance ON account_groups
    BEGIN
      SELECT CASE
        WHEN EXISTS (
          SELECT 1
          FROM account_group_assignments assignment
          JOIN accounts account ON account.id = assignment.account_id
          WHERE assignment.account_group_id = OLD.id
            AND assignment.status = 'active'
            AND (
              NEW.account_type <> account.account_type
              OR NEW.normal_balance <> account.normal_balance
            )
        )
        THEN RAISE(ABORT, 'Account group change is incompatible with active account mappings')
      END;
    END;
  `);
}

export function seedAccountMappingRegistry(db) {
  const upsertGroup = db.prepare(`
    INSERT INTO account_groups (
      group_code, group_name, parent_group_id, account_type, normal_balance,
      posting_allowed, system_protected, display_order, status
    )
    VALUES (
      @group_code, @group_name,
      (SELECT id FROM account_groups WHERE group_code = @parent_code),
      @account_type, @normal_balance, @posting_allowed, 1, @display_order, 'active'
    )
    ON CONFLICT(group_code) DO UPDATE SET
      group_name = excluded.group_name,
      parent_group_id = excluded.parent_group_id,
      account_type = excluded.account_type,
      normal_balance = excluded.normal_balance,
      posting_allowed = excluded.posting_allowed,
      system_protected = 1,
      display_order = excluded.display_order,
      status = 'active',
      updated_at = CURRENT_TIMESTAMP
    WHERE account_groups.group_name IS NOT excluded.group_name
      OR account_groups.parent_group_id IS NOT excluded.parent_group_id
      OR account_groups.account_type IS NOT excluded.account_type
      OR account_groups.normal_balance IS NOT excluded.normal_balance
      OR account_groups.posting_allowed IS NOT excluded.posting_allowed
      OR account_groups.system_protected IS NOT 1
      OR account_groups.display_order IS NOT excluded.display_order
      OR account_groups.status IS NOT 'active'
  `);

  GROUPS.forEach(([groupCode, groupName, parentCode, accountType, normalBalance, postingAllowed, displayOrder]) => {
    upsertGroup.run({
      group_code: groupCode,
      group_name: groupName,
      parent_code: parentCode,
      account_type: accountType,
      normal_balance: normalBalance,
      posting_allowed: postingAllowed,
      display_order: displayOrder
    });
  });

  const upsertMapping = db.prepare(`
    INSERT INTO financial_statement_mappings (
      reporting_profile_code, reporting_profile_version, account_group_id,
      statement_code, section_code, section_name, subsection_code, subsection_name,
      current_non_current, presentation_sign, display_order, effective_from, status
    )
    VALUES (
      @profile_code, @profile_version,
      (SELECT id FROM account_groups WHERE group_code = @group_code),
      @statement_code, @section_code, @section_name, @subsection_code, @subsection_name,
      @current_non_current, 'NORMAL', @display_order, @effective_from, 'active'
    )
    ON CONFLICT(reporting_profile_code, reporting_profile_version, account_group_id, effective_from)
    DO UPDATE SET
      statement_code = excluded.statement_code,
      section_code = excluded.section_code,
      section_name = excluded.section_name,
      subsection_code = excluded.subsection_code,
      subsection_name = excluded.subsection_name,
      current_non_current = excluded.current_non_current,
      presentation_sign = excluded.presentation_sign,
      display_order = excluded.display_order,
      status = 'active',
      updated_at = CURRENT_TIMESTAMP
    WHERE financial_statement_mappings.statement_code IS NOT excluded.statement_code
      OR financial_statement_mappings.section_code IS NOT excluded.section_code
      OR financial_statement_mappings.section_name IS NOT excluded.section_name
      OR financial_statement_mappings.subsection_code IS NOT excluded.subsection_code
      OR financial_statement_mappings.subsection_name IS NOT excluded.subsection_name
      OR financial_statement_mappings.current_non_current IS NOT excluded.current_non_current
      OR financial_statement_mappings.presentation_sign IS NOT excluded.presentation_sign
      OR financial_statement_mappings.display_order IS NOT excluded.display_order
      OR financial_statement_mappings.status IS NOT 'active'
  `);

  STATEMENT_MAPPINGS.forEach(([
    groupCode, statementCode, sectionCode, sectionName, subsectionCode,
    subsectionName, currentNonCurrent, displayOrder
  ]) => {
    upsertMapping.run({
      profile_code: DEFAULT_REPORTING_PROFILE.code,
      profile_version: DEFAULT_REPORTING_PROFILE.version,
      group_code: groupCode,
      statement_code: statementCode,
      section_code: sectionCode,
      section_name: sectionName,
      subsection_code: subsectionCode,
      subsection_name: subsectionName,
      current_non_current: currentNonCurrent,
      display_order: displayOrder,
      effective_from: DEFAULT_REPORTING_PROFILE.effectiveFrom
    });
  });
}

export function backfillDefaultAccountMappings(db) {
  const insertAssignment = db.prepare(`
    INSERT INTO account_group_assignments (
      company_id, account_id, account_group_id, effective_from, status, provenance, change_reason
    )
    SELECT
      a.company_id, a.id, g.id, @effective_from, 'active', 'SYSTEM_SEED',
      'FSR-2B.1 deterministic built-in account-code mapping'
    FROM accounts a
    JOIN account_groups g ON g.group_code = @group_code
    WHERE a.account_code = @account_code
      AND COALESCE(a.is_deleted, 0) = 0
      AND a.account_type = g.account_type
      AND NOT EXISTS (
        SELECT 1 FROM account_group_assignments existing
        WHERE existing.account_id = a.id
      )
  `);

  let inserted = 0;
  DEFAULT_ACCOUNT_GROUPS.forEach((groupCode, accountCode) => {
    inserted += insertAssignment.run({
      account_code: accountCode,
      group_code: groupCode,
      effective_from: DEFAULT_REPORTING_PROFILE.effectiveFrom
    }).changes;
  });
  return inserted;
}

export function applyAccountMappingRegistryMigration(db) {
  createAccountMappingRegistryTables(db);
  seedAccountMappingRegistry(db);
  return backfillDefaultAccountMappings(db);
}

export function ensureAccountMappingRegistry(db) {
  createAccountMappingRegistryTables(db);
  seedAccountMappingRegistry(db);
  return backfillDefaultAccountMappings(db);
}

export function defaultAccountMappingEntries() {
  return Array.from(DEFAULT_ACCOUNT_GROUPS.entries()).map(([account_code, group_code]) => ({
    account_code,
    group_code
  }));
}
