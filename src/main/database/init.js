import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import {
  APP_FOLDERS,
  DB_NAME,
  dbPath,
  ensureAppFolders,
  openDatabase,
  projectRoot,
  setRuntimeRoot,
  sourceProjectRoot
} from "./connection.js";
import { assertBulkDeleteSafe } from "../services/safeDeleteService.js";
import { createReportBuilders } from "./reportBuilders.js";
import { createCrudHelpers } from "./crudHelpers.js";
import { createSchemaFunctions } from "./schemaDefinitions.js";
import { createSeedData } from "./seedData.js";
import { createAccountingService } from "../services/accountingService.js";
import { createBankReconciliationService } from "../services/bankReconciliationService.js";
import { createInventoryService } from "../services/inventoryService.js";
import { createTallyImportService } from "../services/tallyImportService.js";

export {
  APP_FOLDERS,
  DB_NAME,
  dbPath,
  ensureAppFolders,
  openDatabase,
  projectRoot,
  setRuntimeRoot,
  sourceProjectRoot
};

export const MASTER_TABLES = {
  companies: {
    label: "Company",
    fields: ["company_code", "company_name", "gstin", "pan", "address", "bank_name", "account_number", "ifsc", "status"],
    required: ["company_name", "status"]
  },
  employees: {
    label: "Employee",
    fields: ["employee_code", "employee_name", "mobile_number", "email", "designation", "incentive_percentage", "pan", "aadhaar_last4", "bank_name", "account_number", "ifsc", "branch", "joining_date", "remarks", "status"],
    required: ["employee_name", "mobile_number", "status"]
  },
  government_departments: {
    label: "Government Department",
    fields: ["department_code", "department_name", "gstin", "billing_address", "consignee_address", "district", "state", "pincode", "contact_person", "contact_number", "mobile", "email", "payment_authority", "address", "status"],
    required: ["department_name", "status"]
  },
  suppliers: {
    label: "Supplier",
    fields: ["supplier_name", "supplier_type", "supplier_code", "date_of_activation", "supplier_account_name", "supplier_account_number", "supplier_bank_name", "supplier_bank_ifsc_code", "supplier_branch", "supplier_contact", "remarks", "gstin", "pan", "address", "city", "state", "pincode", "contact_person", "mobile", "email", "upi_id", "msme_number", "payment_terms", "contact_details", "bank_details", "status"],
    required: ["supplier_name", "status"]
  },
  items: {
    label: "Item",
    fields: ["item_code", "item_name", "brand", "model", "hsn_code", "gst_rate", "unit", "category", "oem_name", "make_in_india_class", "country_of_origin", "inventory_enabled", "opening_stock", "opening_rate", "opening_value", "reorder_level", "minimum_stock_level", "maximum_stock_level", "default_warehouse_id", "valuation_method", "track_serial_number", "track_batch_number", "warranty_period", "remarks", "status", "import_batch_id"],
    required: ["item_name", "gst_rate", "unit", "status"]
  },
  warehouses: {
    label: "Warehouse",
    fields: ["company_id", "warehouse_code", "warehouse_name", "location", "address", "warehouse_type", "responsible_person", "incharge_name", "mobile", "remarks", "status"],
    required: ["warehouse_name", "status"]
  },
  expense_heads: {
    label: "Expense Head",
    fields: ["expense_head_code", "expense_head_name", "default_calculation_method", "default_percentage", "category", "default_gst_rate", "remarks", "status"],
    required: ["expense_head_name", "default_calculation_method", "status"]
  },
  banks: {
    label: "Bank Account",
    fields: ["company_id", "bank_code", "bank_account_name", "bank_name", "account_number", "ifsc", "branch", "opening_balance", "remarks", "status"],
    required: ["bank_account_name", "bank_name", "status"]
  }
};

export const TRANSACTION_TABLES = {
  supply_orders: {
    label: "Supply Order",
    fields: [
      "company_id", "order_number", "gem_order_number", "gem_contract_number", "supply_type", "order_date",
      "department_id", "institution_name", "buyer_name", "buyer_designation", "buyer_mobile", "buyer_email",
      "consignee", "consignee_address", "delivery_location", "place_of_supply", "location", "delivery_period",
      "warranty_period", "payment_terms", "emd_amount", "security_deposit_amount", "employee_id", "supply_due_date",
      "order_status", "total_quantity", "order_taxable_value", "order_gst_amount", "order_gross_value", "remarks"
    ],
    required: ["order_number", "order_date", "department_id", "employee_id", "order_status"]
  },
  procurements: {
    label: "Procurement",
    fields: ["company_id", "order_id", "purchase_date", "supplier_id", "purchase_invoice_number", "purchase_value", "purchase_gst", "freight", "loading_charges", "amount_paid", "procurement_status", "remarks", "posting_status", "approval_status", "posting_error"],
    required: ["order_id", "purchase_date", "supplier_id", "purchase_invoice_number", "purchase_value"]
  },
  expense_entries: {
    label: "Expense",
    fields: ["company_id", "order_id", "expense_head_id", "expense_category", "calculation_method", "percentage", "fixed_amount", "expense_amount", "payable_to", "payment_status", "remarks", "posting_status", "approval_status", "posting_error"],
    required: ["order_id", "expense_head_id", "calculation_method"]
  },
  invoices: {
    label: "Invoice",
    fields: ["company_id", "financial_year_id", "order_id", "invoice_number", "invoice_date", "gem_order_number", "gem_contract_number", "consignee", "place_of_supply", "gst_type", "billing_value", "gst_rate", "invoice_type", "invoice_status", "remarks", "posting_status", "approval_status", "posting_error"],
    required: ["order_id", "invoice_number", "invoice_date", "billing_value", "gst_rate"]
  },
  payments: {
    label: "Payment",
    fields: ["company_id", "order_id", "billing_id", "payment_date", "payment_amount", "payment_mode", "utr_number", "bank_id", "invoice_outstanding", "tds_deducted", "gst_tds_deducted", "other_deductions", "net_receipt", "allocation_status", "remarks", "posting_status", "approval_status", "posting_error"],
    required: ["order_id", "payment_date", "payment_amount", "payment_mode"]
  },
  stock_inwards: {
    label: "Stock Inward",
    fields: ["company_id", "procurement_id", "order_id", "supplier_id", "item_id", "warehouse_id", "inward_date", "purchase_invoice_number", "quantity", "rate", "gst_rate", "landed_cost", "serial_number", "batch_number", "remarks", "posting_status", "approval_status"],
    required: ["item_id", "warehouse_id", "inward_date", "quantity", "rate"]
  },
  stock_outwards: {
    label: "Stock Outward",
    fields: ["company_id", "order_id", "department_id", "item_id", "warehouse_id", "issue_date", "delivery_challan_number", "quantity_issued", "serial_number", "batch_number", "remarks", "posting_status", "approval_status"],
    required: ["order_id", "item_id", "warehouse_id", "issue_date", "quantity_issued"]
  },
  stock_adjustments: {
    label: "Stock Adjustment",
    fields: ["company_id", "item_id", "warehouse_id", "adjustment_date", "adjustment_type", "quantity", "rate", "reason", "remarks", "posting_status", "approval_status"],
    required: ["item_id", "warehouse_id", "adjustment_date", "adjustment_type", "quantity"]
  },
  stock_returns: {
    label: "Stock Return",
    fields: ["company_id", "return_type", "order_id", "supplier_id", "department_id", "item_id", "warehouse_id", "return_date", "quantity", "condition_status", "reason", "remarks", "posting_status", "approval_status"],
    required: ["return_type", "item_id", "warehouse_id", "return_date", "quantity"]
  }
};

const ALL_TABLES = { ...MASTER_TABLES, ...TRANSACTION_TABLES };
const COMPANY_SPECIFIC_MASTER_TABLES = new Set(["warehouses", "banks"]);

const ACCOUNTING_TABLES = new Set([
  "supply_orders",
  "procurements",
  "expense_entries",
  "invoices",
  "payments",
  "accounts",
  "vouchers",
  "voucher_lines",
  "ledger_entries",
  "cash_bank_ledger",
  "order_items",
  "procurement_items",
  "invoice_items",
  "receivables",
  "payment_allocations",
  "supplier_payments",
  "supplier_payment_allocations",
  "stock_inwards",
  "stock_outwards",
  "stock_adjustments",
  "stock_returns",
  "stock_ledger",
  "serial_numbers",
  "batches"
]);

const DOCUMENT_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png", ".xlsx", ".xls", ".csv"]);
const IMPORT_ROLLBACK_BLOCKED_TABLES = new Set(["vouchers", "voucher_lines", "ledger_entries", "cash_bank_ledger", "receivables", "payment_allocations", "supplier_payment_allocations", "stock_ledger"]);
const DEFAULT_ACCOUNTS = [
  ["1000", "Cash", "Asset", "Debit", 0],
  ["1010", "Bank", "Asset", "Debit", 0],
  ["1100", "Trade Receivables", "Asset", "Debit", 0],
  ["1200", "TDS Receivable", "Asset", "Debit", 0],
  ["1210", "GST TDS Receivable", "Asset", "Debit", 0],
  ["1300", "Input GST", "Asset", "Debit", 0],
  ["1400", "Inventory", "Asset", "Debit", 0],
  ["2000", "Trade Payables", "Liability", "Credit", 0],
  ["2100", "GST Payable", "Liability", "Credit", 0],
  ["2110", "Output GST", "Liability", "Credit", 0],
  ["2200", "Expense Payable", "Liability", "Credit", 0],
  ["2300", "Employee Incentive Payable", "Liability", "Credit", 0],
  ["3000", "Capital", "Equity", "Credit", 0],
  ["3010", "Opening Balance Suspense", "Equity", "Credit", 0],
  ["4000", "Sales", "Income", "Credit", 0],
  ["5000", "Purchase", "Expense", "Debit", 0],
  ["5050", "Cost of Goods Sold", "Expense", "Debit", 0],
  ["5100", "Work Incentive Expense", "Expense", "Debit", 0],
  ["5110", "Authorization Expense", "Expense", "Debit", 0],
  ["5120", "L1 Expense", "Expense", "Debit", 0],
  ["5130", "Transport Expense", "Expense", "Debit", 0],
  ["5140", "Installation Expense", "Expense", "Debit", 0],
  ["5150", "Employee Incentive Expense", "Expense", "Debit", 0],
  ["5160", "Bank Charges", "Expense", "Debit", 0],
  ["5170", "Other Deduction Ledger", "Expense", "Debit", 0],
  ["5990", "Profit and Loss", "Equity", "Credit", 0]
];
const SECURITY = {
  maxFailedLogins: 5,
  sessionTimeoutMinutes: 30,
  minPasswordLength: 8
};

export const ROLE_HIERARCHY = ["super_admin", "admin", "accountant", "manager", "data_entry_operator", "viewer"];
const ROLE_PERMISSIONS = {
  super_admin: new Set(["*"]),
  admin: new Set(["create", "edit", "delete", "reverse", "approve", "post", "restore_backup", "backup", "financial_year_close", "financial_year_reopen", "opening_balance", "import", "export", "settings"]),
  accountant: new Set(["create", "edit", "post", "reverse", "opening_balance", "import", "export", "view_reports", "backup"]),
  manager: new Set(["create", "edit", "approve", "export", "view_reports", "backup"]),
  data_entry_operator: new Set(["create", "edit", "import", "export", "backup"]),
  viewer: new Set(["export", "view_reports"])
};

export const WRITE_POLICY = {
  master: new Set(Object.keys(MASTER_TABLES)),
  transaction: new Set(Object.keys(TRANSACTION_TABLES)),
  accountingReadOnly: new Set([
    "accounts",
    "vouchers",
    "voucher_lines",
    "ledger_entries",
    "cash_bank_ledger",
    "receivables",
    "payment_allocations",
    "supplier_payments",
    "supplier_payment_allocations",
    "audit_log",
    "schema_migrations"
  ])
};

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, expected] = stored.split(":");
  const actual = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), actual);
}

function passwordStrengthErrors(password = "") {
  const value = String(password || "");
  const errors = [];
  if (value.length < 8) errors.push("Password must be at least 8 characters.");
  if (!/[A-Z]/.test(value)) errors.push("Password must include an uppercase letter.");
  if (!/[a-z]/.test(value)) errors.push("Password must include a lowercase letter.");
  if (!/[0-9]/.test(value)) errors.push("Password must include a number.");
  return errors;
}

function markDefaultAdminPasswordForChange(db) {
  const admin = db.prepare("SELECT id, password_hash, force_password_change FROM users WHERE username = 'admin'").get();
  if (admin && verifyPassword("admin123", admin.password_hash) && !Number(admin.force_password_change || 0)) {
    db.prepare("UPDATE users SET force_password_change = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(admin.id);
  }
}

export function normalizeRole(role = "") {
  const normalized = String(role || "").trim().toLowerCase().replaceAll(" ", "_").replaceAll("-", "_");
  if (normalized === "data_entry") return "data_entry_operator";
  if (normalized === "superadmin") return "super_admin";
  return ROLE_HIERARCHY.includes(normalized) ? normalized : "viewer";
}

function roleCan(role, permission) {
  const allowed = ROLE_PERMISSIONS[normalizeRole(role)] || ROLE_PERMISSIONS.viewer;
  return allowed.has("*") || allowed.has(permission);
}

function userForPermission(db, userId) {
  if (userId) return db.prepare("SELECT id, username, display_name, role, status FROM users WHERE id = ?").get(userId);
  return db.prepare("SELECT id, username, display_name, role, status FROM users WHERE status = 'active' ORDER BY CASE WHEN role IN ('super_admin','admin') THEN 0 ELSE 1 END, id LIMIT 1").get();
}

export function enforcePermission(db, permission, context = {}) {
  const user = userForPermission(db, context.user_id || context.userId || context.created_by || context.uploaded_by || context.imported_by || null);
  if (!user || user.status !== "active" || !roleCan(user.role, permission)) {
    const role = user?.role || "anonymous";
    auditLog(db, {
      company_id: context.company_id || null,
      user_id: user?.id || null,
      user_role: role,
      action: "permission_denied",
      module: context.module || context.table_name || context.table || permission,
      table_name: "security",
      record_id: context.record_id || null,
      new_value: JSON.stringify({ permission, role, reason: "backend permission enforcement" })
    });
    throw new Error(`Permission denied: ${permission}`);
  }
  return user;
}

export function initializeDatabase(root = projectRoot()) {
  const db = openDatabase(root);
  migrate(db);
  seed(db);
  addPhase5AccountingControls(db);
  return db;
}

export function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      migration_name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      gstin TEXT,
      pan TEXT,
      address TEXT,
      bank_name TEXT,
      account_number TEXT,
      ifsc TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_name TEXT NOT NULL,
      mobile_number TEXT NOT NULL,
      designation TEXT,
      incentive_percentage REAL NOT NULL DEFAULT 15,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS government_departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_name TEXT NOT NULL,
      contact_person TEXT,
      contact_number TEXT,
      address TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_name TEXT NOT NULL,
      supplier_type TEXT,
      supplier_code TEXT,
      date_of_activation TEXT,
      supplier_account_name TEXT,
      supplier_account_number TEXT,
      supplier_bank_name TEXT,
      supplier_bank_ifsc_code TEXT,
      supplier_branch TEXT,
      supplier_contact TEXT,
      remarks TEXT,
      gstin TEXT,
      contact_details TEXT,
      bank_details TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_name TEXT NOT NULL,
      brand TEXT,
      model TEXT,
      hsn_code TEXT,
      gst_rate REAL NOT NULL DEFAULT 18,
      unit TEXT NOT NULL DEFAULT 'Nos',
      category TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expense_heads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_head_name TEXT NOT NULL,
      default_calculation_method TEXT NOT NULL DEFAULT 'percentage_gross',
      default_percentage REAL NOT NULL DEFAULT 0,
      category TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS banks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_account_name TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      account_number TEXT,
      ifsc TEXT,
      opening_balance REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS supply_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      order_date TEXT NOT NULL,
      department_id INTEGER NOT NULL,
      institution_name TEXT,
      location TEXT,
      employee_id INTEGER NOT NULL,
      supply_due_date TEXT,
      order_status TEXT NOT NULL DEFAULT 'Received',
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES government_departments(id),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS procurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      purchase_date TEXT NOT NULL,
      supplier_id INTEGER NOT NULL,
      purchase_invoice_number TEXT NOT NULL,
      purchase_value REAL NOT NULL DEFAULT 0,
      purchase_gst REAL NOT NULL DEFAULT 0,
      freight REAL NOT NULL DEFAULT 0,
      loading_charges REAL NOT NULL DEFAULT 0,
      amount_paid REAL NOT NULL DEFAULT 0,
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES supply_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );

    CREATE TABLE IF NOT EXISTS expense_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      expense_head_id INTEGER NOT NULL,
      expense_category TEXT,
      calculation_method TEXT NOT NULL DEFAULT 'percentage_gross',
      percentage REAL NOT NULL DEFAULT 0,
      fixed_amount REAL NOT NULL DEFAULT 0,
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES supply_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (expense_head_id) REFERENCES expense_heads(id)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      invoice_number TEXT NOT NULL,
      invoice_date TEXT NOT NULL,
      gem_order_number TEXT,
      gem_contract_number TEXT,
      consignee TEXT,
      place_of_supply TEXT,
      gst_type TEXT NOT NULL DEFAULT 'CGST/SGST',
      billing_value REAL NOT NULL DEFAULT 0,
      gst_rate REAL NOT NULL DEFAULT 18,
      invoice_type TEXT NOT NULL DEFAULT 'Tax Invoice',
      invoice_status TEXT NOT NULL DEFAULT 'Draft',
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES supply_orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      payment_date TEXT NOT NULL,
      payment_amount REAL NOT NULL DEFAULT 0,
      payment_mode TEXT NOT NULL DEFAULT 'Bank Transfer',
      utr_number TEXT,
      bank_id INTEGER,
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES supply_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (bank_id) REFERENCES banks(id)
    );
  `);

  runMigration(db, "003_accounting_ledger_foundation", () => {
    addAccountingColumns(db);
    createAccountingTables(db);
  });

  runMigration(db, "004_bulk_import_document_uploads", () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER,
        linked_module TEXT NOT NULL,
        linked_record_id INTEGER,
        document_type TEXT,
        original_file_name TEXT NOT NULL,
        stored_file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_extension TEXT NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0,
        file_hash TEXT NOT NULL,
        uploaded_by INTEGER,
        uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        remarks TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        deleted_at TEXT,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (uploaded_by) REFERENCES users(id)
      );
    `);
  });

  runMigration(db, "005_item_import_batches", () => {
    addColumnIfMissing(db, "items", "import_batch_id", "TEXT");
    db.exec(`
      CREATE TABLE IF NOT EXISTS import_batches (
        id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        file_name TEXT,
        total_rows INTEGER NOT NULL DEFAULT 0,
        successful_rows INTEGER NOT NULL DEFAULT 0,
        failed_rows INTEGER NOT NULL DEFAULT 0,
        skipped_duplicates INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        status TEXT NOT NULL DEFAULT 'active'
      );
    `);
  });

  runMigration(db, "006_phase5_accounting_controls", () => {
    addPhase5AccountingControls(db);
  });

  runMigration(db, "007_phase6_year_end_drilldown", () => {
    addPhase6YearEndControls(db);
  });

  runMigration(db, "008_supplier_extended_fields", () => {
    addSupplierExtendedFields(db);
  });

  runMigration(db, "009_billing_voucher_enhancement", () => {
    addBillingVoucherEnhancementFields(db);
  });

  runMigration(db, "010_allocation_workflow_credit_terms", () => {
    addAllocationWorkflowTables(db);
  });

  runMigration(db, "011_phase6d_billing_advance_adjustments", () => {
    addPhase6DAdvanceAdjustmentTables(db);
  });

  runMigration(db, "012_phase7_inventory_stock_ledger", () => {
    addPhase7InventoryTables(db);
  });

  runMigration(db, "013_phase8_bank_statement_reconciliation", () => {
    addPhase8BankStatementTables(db);
  });

  runMigration(db, "014_phase8b_voucher_proposal_queue", () => {
    addPhase8BVoucherProposalTables(db);
  });

  runMigration(db, "015_business_vouchers_integrated_inventory", () => {
    addBusinessVoucherInventoryTables(db);
  });

  runMigration(db, "016_phase10_inventory_automation_guided_vouchers", () => {
    addPhase10InventoryAutomationTables(db);
  });

  runMigration(db, "017_core_controls_hardening", () => {
    addCoreControlHardening(db);
  });

  runMigration(db, "018_phase13_operations_hardening", () => {
    addPhase13OperationsHardening(db);
  });

  runMigration(db, "019_company_context_layer", () => {
    addCompanyContextLayer(db);
  });

  runMigration(db, "020_supply_order_item_entry_enhancement", () => {
    addSupplyOrderItemEntryEnhancement(db);
  });

  runMigration(db, "021_transaction_soft_delete_column_repair", () => {
    addAccountingColumns(db);
  });

  runMigration(db, "022_soft_delete_runtime_schema_guard", () => {
    addRuntimeSoftDeleteColumns(db);
  });

  runMigration(db, "023_work_incentive_terminology", () => {
    applyWorkIncentiveTerminology(db);
  });

  runMigration(db, "024_phase15h_master_data_tools", () => {
    addPhase15HMasterDataToolsColumns(db);
  });

  runMigration(db, "025_phase15h_department_remarks_column", () => {
    addColumnIfMissing(db, "government_departments", "remarks", "TEXT");
  });

  runMigration(db, "026_phase15i_crac_management", () => {
    addPhase15iCracTables(db);
  });

  runMigration(db, "027_audit_and_posting_control_fixes", () => {
    addAuditAndPostingFixes(db);
  });
}

function runMigration(db, migrationName, callback) {
  const exists = db.prepare("SELECT id FROM schema_migrations WHERE migration_name = ?").get(migrationName);
  if (exists) return;
  const transaction = db.transaction(() => {
    callback();
    db.prepare("INSERT INTO schema_migrations (migration_name) VALUES (?)").run(migrationName);
  });
  transaction();
}

function assertSafeSqlIdentifier(identifier, label) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL ${label}: ${identifier}`);
  }
  return `"${identifier}"`;
}

function addColumnIfMissing(db, table, column, definition) {
  const safeTable = assertSafeSqlIdentifier(table, "table identifier");
  const safeColumn = assertSafeSqlIdentifier(column, "column identifier");
  const columns = db.prepare(`PRAGMA table_info(${safeTable})`).all().map((row) => row.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${safeTable} ADD COLUMN ${safeColumn} ${definition}`);
  }
}

function seedFinancialYears(db) {
  const companies = db.prepare("SELECT id FROM companies").all();
  companies.forEach((company) => {
    const years = [
      ["FY 2025-26", "2025-04-01", "2026-03-31"],
      ["FY 2026-27", "2026-04-01", "2027-03-31"]
    ];
    years.forEach(([financial_year_name, start_date, end_date]) => {
      db.prepare(`
        INSERT OR IGNORE INTO financial_years (company_id, financial_year_name, start_date, end_date, status)
        VALUES (?, ?, ?, ?, 'Open')
      `).run(company.id, financial_year_name, start_date, end_date);
    });
  });
}

function backfillPostingStatuses(db) {
  [
    ["invoices", "billing"],
    ["procurements", "procurement"],
    ["payments", "payment"]
  ].forEach(([table, sourceModule]) => {
    db.prepare(`
      UPDATE ${table}
      SET posting_status = CASE
        WHEN EXISTS (SELECT 1 FROM vouchers v WHERE v.source_module = ? AND v.source_id = ${table}.id AND v.is_deleted = 0) THEN 'Posted'
        ELSE COALESCE(NULLIF(posting_status, ''), 'Draft')
      END,
      approval_status = CASE
        WHEN EXISTS (SELECT 1 FROM vouchers v WHERE v.source_module = ? AND v.source_id = ${table}.id AND v.is_deleted = 0) THEN 'Approved'
        ELSE COALESCE(NULLIF(approval_status, ''), 'Draft')
      END,
      posted_at = CASE
        WHEN EXISTS (SELECT 1 FROM vouchers v WHERE v.source_module = ? AND v.source_id = ${table}.id AND v.is_deleted = 0) THEN COALESCE(posted_at, CURRENT_TIMESTAMP)
        ELSE posted_at
      END,
      locked_at = CASE
        WHEN EXISTS (SELECT 1 FROM vouchers v WHERE v.source_module = ? AND v.source_id = ${table}.id AND v.is_deleted = 0) THEN COALESCE(locked_at, CURRENT_TIMESTAMP)
        ELSE locked_at
      END
      WHERE is_deleted = 0
    `).run(sourceModule, sourceModule, sourceModule, sourceModule);
  });

  db.prepare(`
    UPDATE expense_entries
    SET posting_status = CASE WHEN COALESCE(voucher_id, 0) > 0 THEN 'Posted' ELSE COALESCE(NULLIF(posting_status, ''), 'Draft') END,
      approval_status = CASE WHEN COALESCE(voucher_id, 0) > 0 THEN 'Approved' ELSE COALESCE(NULLIF(approval_status, ''), 'Draft') END,
      posted_at = CASE WHEN COALESCE(voucher_id, 0) > 0 THEN COALESCE(posted_at, CURRENT_TIMESTAMP) ELSE posted_at END,
      locked_at = CASE WHEN COALESCE(voucher_id, 0) > 0 THEN COALESCE(locked_at, CURRENT_TIMESTAMP) ELSE locked_at END
    WHERE is_deleted = 0
  `).run();
}

function seedAccounts(db, companyId = null) {
  const companies = companyId
    ? [{ id: Number(companyId) }]
    : db.prepare("SELECT id FROM companies ORDER BY id").all();
  companies.forEach((company) => {
    DEFAULT_ACCOUNTS.forEach(([account_code, account_name, account_type, normal_balance, opening_balance]) => {
      db.prepare(`
        INSERT INTO accounts (company_id, account_code, account_name, account_type, normal_balance, opening_balance, status)
        VALUES (@company_id, @account_code, @account_name, @account_type, @normal_balance, @opening_balance, 'active')
        ON CONFLICT(company_id, account_code) DO UPDATE SET
          account_name = excluded.account_name,
          account_type = excluded.account_type,
          normal_balance = excluded.normal_balance,
          updated_at = CURRENT_TIMESTAMP
      `).run({ company_id: company.id, account_code, account_name, account_type, normal_balance, opening_balance });
    });
  });
}

export function parseImportFile(filePath) {
  const extension = path.extname(filePath || "").toLowerCase();
  if (extension === ".csv") return parseCsv(fs.readFileSync(filePath, "utf8"));
  if (extension === ".xlsx") return parseXlsx(fs.readFileSync(filePath));
  if (extension === ".xls") return parseLegacyXls(fs.readFileSync(filePath));
  throw new Error("Only CSV, XLS and XLSX files are supported for import");
}

export function parseImportBuffer(fileName, bytes) {
  const extension = path.extname(fileName || "").toLowerCase();
  const buffer = Buffer.from(bytes || []);
  if (extension === ".csv") return parseCsv(buffer.toString("utf8"));
  if (extension === ".xlsx") return parseXlsx(buffer);
  if (extension === ".xls") return parseLegacyXls(buffer);
  throw new Error("Only CSV, XLS and XLSX files are supported for import");
}

function normalizeDuplicateKey(value) {
  return cleanTallyText(value).toLowerCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function bulkImportRecords(db, table, rows = [], context = {}) {
  assertWriteAllowed(table, "create");
  enforcePermission(db, "import", { ...context, module: table, table_name: table });
  const result = { totalRows: rows.length, successfulRows: 0, failedRows: 0, skippedDuplicates: 0, updatedRows: 0, errors: [] };
  const validRows = [];
  rows.forEach((row, index) => {
    const validation = validateImportRow(db, table, row, context);
    if (validation.status === "duplicate") {
      result.skippedDuplicates += 1;
      result.errors.push({ row: index + 1, status: "Duplicate", errors: validation.errors });
      return;
    }
    if (validation.errors.length) {
      result.failedRows += 1;
      result.errors.push({ row: index + 1, status: "Failed", errors: validation.errors });
      return;
    }
    validRows.push(validation.payload);
  });

  if (context.dry_run) {
    result.successfulRows = validRows.length;
    result.updatedRows = validRows.filter((payload) => payload.__update_id).length;
    return result;
  }

  const transaction = db.transaction(() => {
    const createRows = validRows.filter((payload) => !payload.__update_id);
    const importBatchId = createRows.length ? `${table.toUpperCase().replaceAll("_", "-")}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}` : null;
    if (importBatchId) {
      db.prepare(`
        INSERT INTO import_batches (id, table_name, module, file_name, total_rows, successful_rows, rows_imported, failed_rows, skipped_duplicates, created_by, imported_by, imported_at, status)
        VALUES (@id, @table_name, @module, @file_name, @total_rows, @successful_rows, @rows_imported, @failed_rows, @skipped_duplicates, @created_by, @imported_by, CURRENT_TIMESTAMP, 'active')
      `).run({
        id: importBatchId,
        table_name: table,
        module: context.module || table,
        file_name: context.file_name || "",
        total_rows: result.totalRows,
        successful_rows: validRows.length,
        rows_imported: createRows.length,
        failed_rows: result.failedRows,
        skipped_duplicates: result.skippedDuplicates,
        created_by: context.user_id || null,
        imported_by: context.user_id || null
      });
    }
    validRows.forEach((payload) => {
      const updateId = payload.__update_id;
      const cleanImportPayload = { ...payload };
      delete cleanImportPayload.__update_id;
      if (updateId) {
        const existing = getRecord(db, table, updateId);
        const incoming = Object.fromEntries(Object.entries(cleanImportPayload).filter(([, value]) => String(value ?? "").trim() !== ""));
        updateRecord(db, table, updateId, { ...existing, ...incoming });
        result.updatedRows += 1;
        return;
      }
      const record = createRecord(db, table, cleanImportPayload);
      if (!importBatchId) return;
      db.prepare("INSERT INTO import_batch_records (batch_id, table_name, record_id) VALUES (?, ?, ?)").run(importBatchId, table, record.id);
      if (columnExists(db, table, "import_batch_id")) {
        db.prepare(`UPDATE ${table} SET import_batch_id = ? WHERE id = ?`).run(importBatchId, record.id);
      }
    });
    auditLog(db, {
      company_id: context.company_id || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || null,
      user_id: context.user_id || null,
      user_role: userForPermission(db, context.user_id || null)?.role || null,
      action: "bulk import",
      module: table,
      table_name: table,
      new_value: JSON.stringify({ fileName: context.file_name || "", importBatchId, totalRows: result.totalRows, successfulRows: validRows.length, updatedRows: result.updatedRows, failedRows: result.failedRows, skippedDuplicates: result.skippedDuplicates, importMode: context.import_mode || "skip_existing" })
    });
    result.importBatchId = importBatchId;
  });
  transaction();
  result.successfulRows = validRows.length;
  return result;
}

export function listImportBatches(db, filters = {}) {
  const params = {};
  const where = ["COALESCE(status, 'active') != 'deleted'"];
  if (filters.table_name || filters.table) {
    where.push("ib.table_name = @table");
    params.table = filters.table_name || filters.table;
  }
  return db.prepare(`
    SELECT ib.*, COUNT(ibr.id) record_count
    FROM import_batches ib
    LEFT JOIN import_batch_records ibr ON ibr.batch_id = ib.id AND ibr.rolled_back_at IS NULL
    WHERE ${where.join(" AND ")}
    GROUP BY ib.id
    ORDER BY COALESCE(ib.imported_at, ib.created_at) DESC
  `).all(params);
}

export function previewImportRollback(db, batchId) {
  const batch = db.prepare("SELECT * FROM import_batches WHERE id = ? AND COALESCE(status, 'active') = 'active'").get(batchId);
  if (!batch) throw new Error("Import batch not found or already rolled back");
  const rows = db.prepare("SELECT * FROM import_batch_records WHERE batch_id = ? AND rolled_back_at IS NULL ORDER BY id").all(batchId);
  return {
    batch,
    records: rows.map((row) => ({
      ...row,
      record: tableExists(db, row.table_name) ? db.prepare(`SELECT * FROM ${row.table_name} WHERE id = ?`).get(row.record_id) : null
    }))
  };
}

export function rollbackImportBatch(db, batchId, context = {}) {
  enforcePermission(db, "delete", { ...context, module: "imports", table_name: "import_batches", record_id: batchId });
  const preview = previewImportRollback(db, batchId);
  if (IMPORT_ROLLBACK_BLOCKED_TABLES.has(preview.batch.table_name)) throw new Error("Accounting import batches cannot be rolled back directly");
  const blocked = preview.records.filter((row) => row.table_name === "items" && masterRecordIsReferenced(db, "items", row.record_id));
  if (blocked.length) throw new Error("Cannot rollback import: one or more records are linked to posted or operational data");

  const transaction = db.transaction(() => {
    preview.records.forEach((row) => {
      if (!tableExists(db, row.table_name)) return;
      const hasDeleted = columnExists(db, row.table_name, "is_deleted");
      if (hasDeleted) {
        db.prepare(`UPDATE ${row.table_name} SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?`).run(row.record_id);
      } else if (columnExists(db, row.table_name, "status")) {
        db.prepare(`UPDATE ${row.table_name} SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(row.record_id);
      } else {
        db.prepare(`DELETE FROM ${row.table_name} WHERE id = ?`).run(row.record_id);
      }
      db.prepare("UPDATE import_batch_records SET rolled_back_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);
    });
    db.prepare("UPDATE import_batches SET status = 'rolled_back', deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(batchId);
    auditLog(db, {
      company_id: context.company_id || null,
      user_id: context.user_id || null,
      user_role: userForPermission(db, context.user_id || null)?.role || null,
      action: "rollback import",
      module: "imports",
      table_name: "import_batches",
      record_id: null,
      old_value: JSON.stringify({ batch: preview.batch, records: preview.records.length }),
      new_value: JSON.stringify({ status: "rolled_back" })
    });
  });
  transaction();
  return { batchId, rolledBackRecords: preview.records.length };
}

export function uploadDocument(db, payload, root = projectRoot()) {
  const sourcePath = payload.source_path;
  if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error("Selected file was not found");
  const extension = path.extname(sourcePath).toLowerCase();
  if (!DOCUMENT_EXTENSIONS.has(extension)) throw new Error("Unsupported file type");
  const stat = fs.statSync(sourcePath);
  const bytes = fs.readFileSync(sourcePath);
  assertSafeFileContent(extension, bytes);
  const fileHash = crypto.createHash("sha256").update(bytes).digest("hex");
  const originalFileName = path.basename(sourcePath);
  const moduleName = sanitizeFilePart(payload.linked_module || "documents");
  const year = new Date().getFullYear().toString();
  const companyId = Number(payload.company_id || 0) || null;
  if (!companyId) throw new Error("Company context is required before uploading documents.");
  const targetDir = path.join(root, "documents", String(companyId || "common"), moduleName, year);
  fs.mkdirSync(targetDir, { recursive: true });
  const storedFileName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${sanitizeFilePart(path.basename(originalFileName, extension))}${extension}`;
  const targetPath = path.join(targetDir, storedFileName);
  fs.copyFileSync(sourcePath, targetPath);
  const result = db.prepare(`
    INSERT INTO documents (company_id, linked_module, linked_record_id, document_type, original_file_name, stored_file_name, file_path, file_extension, file_size, file_hash, uploaded_by, remarks, status)
    VALUES (@company_id, @linked_module, @linked_record_id, @document_type, @original_file_name, @stored_file_name, @file_path, @file_extension, @file_size, @file_hash, @uploaded_by, @remarks, 'active')
  `).run({
    company_id: companyId,
    linked_module: payload.linked_module,
    linked_record_id: payload.linked_record_id || null,
    document_type: payload.document_type || "Supporting Document",
    original_file_name: originalFileName,
    stored_file_name: storedFileName,
    file_path: targetPath,
    file_extension: extension,
    file_size: stat.size,
    file_hash: fileHash,
    uploaded_by: payload.uploaded_by || null,
    remarks: payload.remarks || ""
  });
  auditLog(db, { company_id: companyId, user_id: payload.uploaded_by || null, action: "document upload", table_name: "documents", record_id: result.lastInsertRowid, new_value: JSON.stringify({ module: payload.linked_module, fileName: originalFileName, size: stat.size }) });
  return db.prepare("SELECT * FROM documents WHERE id = ?").get(result.lastInsertRowid);
}

export function listDocuments(db, filters = {}) {
  const companyId = Number(filters.company_id || 0);
  const recordId = Number(filters.linked_record_id || 0);
  const rows = db.prepare(`
    SELECT *
    FROM documents
    WHERE status = 'active' AND deleted_at IS NULL
      AND (@module = '' OR linked_module = @module)
      AND (@company_id = 0 OR company_id = @company_id)
      AND (@record_id = 0 OR linked_record_id = @record_id)
    ORDER BY uploaded_at DESC, id DESC
  `).all({ module: filters.module || "", company_id: companyId, record_id: recordId });
  return rows;
}

export function deleteDocument(db, id, context = {}) {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ? AND status = 'active' AND deleted_at IS NULL").get(id);
  if (!doc) throw new Error("Document not found or already deleted");
  db.prepare("UPDATE documents SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  auditLog(db, { company_id: doc.company_id, user_id: context.user_id || null, action: "document delete", table_name: "documents", record_id: id, old_value: JSON.stringify({ fileName: doc.original_file_name, filePath: doc.file_path }) });
  return { id, status: "deleted" };
}

export function replaceDocument(db, payload, root = projectRoot(), context = {}) {
  const oldId = payload.replace_document_id;
  if (!oldId) throw new Error("replace_document_id is required");
  const oldDoc = db.prepare("SELECT * FROM documents WHERE id = ? AND status = 'active' AND deleted_at IS NULL").get(oldId);
  if (!oldDoc) throw new Error("Original document not found");
  const newDoc = uploadDocument(db, { ...payload, company_id: oldDoc.company_id }, root);
  db.prepare("UPDATE documents SET status = 'replaced' WHERE id = ?").run(oldId);
  auditLog(db, { company_id: oldDoc.company_id, user_id: context.user_id || payload.uploaded_by || null, action: "document replace", table_name: "documents", record_id: oldId, old_value: JSON.stringify({ fileName: oldDoc.original_file_name }), new_value: JSON.stringify({ newId: newDoc.id, fileName: newDoc.original_file_name }) });
  return { old: { id: oldId, status: "replaced" }, new: newDoc };
}

function assertSafeFileContent(extension, bytes) {
  const header = bytes.subarray(0, 8);
  const ascii = bytes.subarray(0, 512).toString("utf8");
  const isZip = header[0] === 0x50 && header[1] === 0x4b;
  const isPdf = ascii.startsWith("%PDF");
  const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
  const isJpeg = header[0] === 0xff && header[1] === 0xd8;
  const isXls = header[0] === 0xd0 && header[1] === 0xcf && header[2] === 0x11 && header[3] === 0xe0;
  const isText = !bytes.subarray(0, Math.min(bytes.length, 2048)).includes(0);
  const allowed = {
    ".pdf": isPdf,
    ".png": isPng,
    ".jpg": isJpeg,
    ".jpeg": isJpeg,
    ".xlsx": isZip,
    ".csv": isText,
    ".xls": isXls
  };
  if (!allowed[extension]) throw new Error("Uploaded file content does not match the permitted file type");
}

export function listItemImportBatches(db) {
  return db.prepare(`
    SELECT ib.*,
      (SELECT COUNT(*) FROM items i WHERE i.import_batch_id = ib.id) item_count
    FROM import_batches ib
    WHERE ib.table_name = 'items' AND ib.status = 'active'
    ORDER BY ib.created_at DESC
  `).all();
}

export function deleteItemImportBatch(db, batchId) {
  if (!batchId) throw new Error("Import batch is required");
  const batch = db.prepare("SELECT * FROM import_batches WHERE id = ? AND table_name = 'items' AND status = 'active'").get(batchId);
  if (!batch) throw new Error("Item import batch not found");
  const items = db.prepare("SELECT id, item_name FROM items WHERE import_batch_id = ?").all(batchId);
  if (!items.length) throw new Error("No items found for this import batch");
  const ids = items.map((item) => item.id);
  assertBulkDeleteSafe(db, "items", ids);
  const transaction = db.transaction(() => {
    const deleted = db.prepare("DELETE FROM items WHERE import_batch_id = ?").run(batchId).changes;
    db.prepare("UPDATE import_batches SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(batchId);
    auditLog(db, {
      action: "bulk delete imported items",
      table_name: "items",
      new_value: JSON.stringify({ batchId, deleted })
    });
    return { batchId, deleted };
  });
  return transaction();
}

export function deleteUnusedImportedItems(db) {
  const referencedRows = db.prepare(`
    SELECT item_id FROM order_items WHERE item_id IS NOT NULL
    UNION
    SELECT item_id FROM procurement_items WHERE item_id IS NOT NULL
    UNION
    SELECT item_id FROM invoice_items WHERE item_id IS NOT NULL
    UNION
    SELECT item_id FROM stock_inwards WHERE item_id IS NOT NULL
    UNION
    SELECT item_id FROM stock_outwards WHERE item_id IS NOT NULL
    UNION
    SELECT item_id FROM stock_adjustments WHERE item_id IS NOT NULL
    UNION
    SELECT item_id FROM stock_returns WHERE item_id IS NOT NULL
    UNION
    SELECT item_id FROM stock_ledger WHERE item_id IS NOT NULL
    UNION
    SELECT item_id FROM serial_numbers WHERE item_id IS NOT NULL
    UNION
    SELECT item_id FROM batches WHERE item_id IS NOT NULL
    UNION
    SELECT item_id FROM inventory_movements WHERE item_id IS NOT NULL
    UNION
    SELECT item_id FROM stock_reservations WHERE item_id IS NOT NULL
    UNION
    SELECT item_id FROM goods_receipt_items WHERE item_id IS NOT NULL
    UNION
    SELECT item_id FROM delivery_challan_items WHERE item_id IS NOT NULL
    UNION
    SELECT item_id FROM warehouse_transfers WHERE item_id IS NOT NULL
  `).all();
  const protectedIds = new Set(referencedRows.map((row) => Number(row.item_id)));
  const seed = db.prepare("SELECT id FROM items WHERE item_name = 'Office Workstation' ORDER BY id LIMIT 1").get();
  if (seed) protectedIds.add(Number(seed.id));
  const items = db.prepare("SELECT id FROM items").all();
  const deleteIds = items.map((item) => Number(item.id)).filter((id) => !protectedIds.has(id));
  if (!deleteIds.length) return { deleted: 0, protected: protectedIds.size };
  assertBulkDeleteSafe(db, "items", deleteIds);
  const placeholders = deleteIds.map(() => "?").join(",");
  const transaction = db.transaction(() => {
    const deleted = db.prepare(`DELETE FROM items WHERE id IN (${placeholders})`).run(...deleteIds).changes;
    auditLog(db, {
      action: "bulk delete unused item masters",
      table_name: "items",
      new_value: JSON.stringify({ deleted, protected: protectedIds.size })
    });
    return { deleted, protected: protectedIds.size };
  });
  return transaction();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  const headers = (rows.shift() || []).map(normalizeHeader);
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

function parseLegacyXls(buffer) {
  const text = buffer.toString("utf8").replace(/\0/g, "");
  if (/<table|<tr|<td/i.test(text)) return parseHtmlTable(text);
  if (text.includes("\t")) return parseDelimited(text, "\t");
  return parseCsv(text);
}

function parseDelimited(text, delimiter) {
  const rows = text.split(/\r?\n/).map((line) => line.split(delimiter).map((cell) => cell.trim())).filter((row) => row.some(Boolean));
  const headers = (rows.shift() || []).map(normalizeHeader);
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

function parseHtmlTable(text) {
  const rows = [];
  for (const rowMatch of text.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
      cells.push(cellMatch[1].replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim());
    }
    if (cells.some(Boolean)) rows.push(cells);
  }
  const headers = (rows.shift() || []).map(normalizeHeader);
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

function parseXlsx(buffer) {
  const files = unzipXlsx(buffer);
  const sharedStrings = parseSharedStrings(files["xl/sharedStrings.xml"]?.toString("utf8") || "");
  const workbook = files["xl/workbook.xml"]?.toString("utf8") || "";
  const rels = files["xl/_rels/workbook.xml.rels"]?.toString("utf8") || "";
  const firstSheetId = /<sheet[^>]*r:id="([^"]+)"/.exec(workbook)?.[1];
  const target = firstSheetId ? new RegExp(`<Relationship[^>]*Id="${firstSheetId}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] : "worksheets/sheet1.xml";
  const sheetPath = `xl/${(target || "worksheets/sheet1.xml").replace(/^\/xl\//, "")}`;
  const sheetXml = files[sheetPath]?.toString("utf8") || files["xl/worksheets/sheet1.xml"]?.toString("utf8") || "";
  const matrix = [];
  for (const rowMatch of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = /r="([A-Z]+)(\d+)"/.exec(attrs)?.[1] || "";
      const colIndex = excelColumnIndex(ref);
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] || /<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] || "";
      const value = type === "s" ? sharedStrings[Number(raw)] || "" : decodeXml(raw);
      row[colIndex] = value;
    }
    if (row.some((cell) => String(cell || "").trim())) matrix.push(row.map((cell) => String(cell || "").trim()));
  }
  const headerIndex = matrix.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return normalized.includes("supplier_name") ||
      normalized.includes("beneficiary_account_name") ||
      normalized.includes("item_name") ||
      normalized.includes("order_number") ||
      normalized.includes("company_name");
  });
  const sourceRows = headerIndex >= 0 ? matrix.slice(headerIndex) : matrix;
  const headers = (sourceRows.shift() || []).map(normalizeHeader);
  const headerEntries = headers.map((header, index) => [header, index]).filter(([header]) => header);
  return sourceRows.map((cells) => Object.fromEntries(headerEntries.map(([header, index]) => [header, cells[index] ?? ""])));
}

function unzipXlsx(buffer) {
  const files = {};
  const eocd = findEndOfCentralDirectory(buffer);
  const centralDirectoryOffset = buffer.readUInt32LE(eocd + 16);
  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    files[name] = method === 0 ? compressed : zlib.inflateRawSync(compressed);
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return files;
}

function findEndOfCentralDirectory(buffer) {
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) return index;
  }
  throw new Error("Invalid XLSX file");
}

function parseSharedStrings(xml) {
  return [...xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((match) => decodeXml([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join("")));
}

function excelColumnIndex(column) {
  return column.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function decodeXml(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replaceAll(" ", "_");
}

function sanitizeFilePart(value) {
  return String(value || "file").replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "file";
}

function validateImportRow(db, table, row, context) {
  const errors = [];
  row = normalizeImportObject(row);
  const requiresCompanyContext = new Set(["warehouses", "banks", "supply_orders", "procurements", "expense_entries", "invoices", "payments"]);
  const companyId = Number(context.company_id || 0);
  if (requiresCompanyContext.has(table) && !companyId) {
    errors.push("Company context is required before importing company-specific data");
  }
  const payload = {};
  const value = (key) => String(row[key] ?? "").trim();
  const requireValue = (key, label = key.replaceAll("_", " ")) => {
    const item = value(key);
    if (!item) errors.push(`${label} is required`);
    return item;
  };
  const numberValue = (key, label, positive = false) => {
    const raw = value(key);
    if (!raw) return "";
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) errors.push(`${label} must be numeric`);
    if (positive && parsed <= 0) errors.push(`${label} must be positive`);
    return Number.isFinite(parsed) ? parsed : raw;
  };
  const dateValue = (key, label) => {
    const raw = value(key);
    if (!raw) return "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(new Date(`${raw}T00:00:00`).getTime())) errors.push(`${label} must be YYYY-MM-DD`);
    return raw;
  };
  const findOne = (lookupTable, field, raw, label) => {
    if (!raw) return "";
    const hasDeleteFlag = db.prepare(`PRAGMA table_info(${lookupTable})`).all().some((column) => column.name === "is_deleted");
    const found = db.prepare(`SELECT id FROM ${lookupTable} WHERE LOWER(${field}) = LOWER(?) ${hasDeleteFlag ? "AND COALESCE(is_deleted, 0) = 0" : ""} LIMIT 1`).get(raw);
    if (!found) errors.push(`${label} does not exist`);
    return found?.id || "";
  };

  if (table === "companies") {
    payload.company_name = requireValue("company_name");
    payload.gstin = value("gstin");
    payload.pan = value("pan");
    payload.address = value("address");
    payload.bank_name = value("bank_name");
    payload.account_number = value("account_number");
    payload.ifsc = value("ifsc");
    payload.status = value("status") || "active";
    if (payload.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(payload.gstin)) errors.push("GSTIN format is invalid");
    if (payload.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(payload.pan)) errors.push("PAN format is invalid");
  } else if (table === "government_departments") {
    Object.assign(payload, pickRow(row, ["department_name", "contact_person", "contact_number", "address", "status"]));
    if (!payload.department_name) errors.push("department_name is required");
    payload.status ||= "active";
  } else if (table === "suppliers") {
    Object.assign(payload, pickRow(row, ["supplier_name", "supplier_type", "supplier_code", "date_of_activation", "supplier_account_name", "supplier_account_number", "supplier_bank_name", "supplier_bank_ifsc_code", "supplier_branch", "supplier_contact", "remarks", "gstin", "contact_details", "bank_details", "status"]));
    if (!payload.supplier_name && value("beneficiary_account_name")) {
      payload.supplier_name = value("beneficiary_account_name");
      payload.supplier_type = value("beneficiary_type") || payload.supplier_type;
      payload.supplier_code = value("beneficiary_code") || payload.supplier_code;
      payload.date_of_activation = value("date_of_activation") || payload.date_of_activation;
      payload.supplier_account_name = value("beneficiary_account_name") || payload.supplier_account_name;
      payload.supplier_account_number = value("beneficiary_account_number") || payload.supplier_account_number;
      payload.supplier_bank_name = value("beneficiary_bank_name") || payload.supplier_bank_name;
      payload.supplier_bank_ifsc_code = value("beneficiary_ifsc_code") || payload.supplier_bank_ifsc_code;
      payload.supplier_branch = value("beneficiary_branch") || payload.supplier_branch;
      payload.supplier_contact = value("beneficiary_contact") || payload.supplier_contact;
      payload.remarks = value("remarks") || payload.remarks;
      payload.contact_details = `Beneficiary Code: ${value("beneficiary_code") || "-"}; Type: ${value("beneficiary_type") || "-"}`;
      payload.bank_details = [
        `Account Name: ${value("beneficiary_account_name")}`,
        `Account Number: ${value("beneficiary_account_number")}`,
        `Bank: ${value("beneficiary_bank_name")}`,
        `IFSC: ${value("beneficiary_ifsc_code")}`,
        `Branch: ${value("beneficiary_branch")}`
      ].join("; ");
      payload.status = String(value("beneficiary_status") || value("status")).toLowerCase().includes("enabled") ? "active" : "inactive";
    }
    if (!payload.supplier_name && payload.supplier_account_name) payload.supplier_name = payload.supplier_account_name;
    if (!payload.contact_details && payload.supplier_contact) payload.contact_details = payload.supplier_contact;
    if (!payload.bank_details && (payload.supplier_account_number || payload.supplier_bank_name || payload.supplier_bank_ifsc_code || payload.supplier_branch)) {
      payload.bank_details = [
        `Account Name: ${payload.supplier_account_name || "-"}`,
        `Account Number: ${payload.supplier_account_number || "-"}`,
        `Bank: ${payload.supplier_bank_name || "-"}`,
        `IFSC: ${payload.supplier_bank_ifsc_code || "-"}`,
        `Branch: ${payload.supplier_branch || "-"}`
      ].join("; ");
    }
    if (!payload.supplier_name) errors.push("supplier_name is required");
    if (payload.date_of_activation) {
      const normalizedDate = normalizeImportDate(payload.date_of_activation);
      if (!normalizedDate) errors.push("date_of_activation format is invalid");
      else payload.date_of_activation = normalizedDate;
    }
    if (payload.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(payload.gstin)) errors.push("GSTIN format is invalid");
    payload.status ||= "active";
  } else if (table === "employees") {
    Object.assign(payload, pickRow(row, ["employee_name", "mobile_number", "designation", "status"]));
    payload.incentive_percentage = numberValue("incentive_percentage", "incentive_percentage") || 15;
    if (!payload.employee_name) errors.push("employee_name is required");
    if (!payload.mobile_number) errors.push("mobile_number is required");
    payload.status ||= "active";
  } else if (table === "items") {
    Object.assign(payload, pickRow(row, ["item_name", "brand", "model", "hsn_code", "unit", "category", "status"]));
    payload.gst_rate = numberValue("gst_rate", "gst_rate");
    if (!payload.item_name) errors.push("item_name is required");
    if (payload.gst_rate === "") errors.push("gst_rate is required");
    if (!payload.unit) errors.push("unit is required");
    payload.status ||= "active";
  } else if (table === "warehouses") {
    Object.assign(payload, pickRow(row, ["warehouse_name", "location", "warehouse_type", "responsible_person", "status"]));
    payload.company_id = companyId;
    if (!payload.warehouse_name) errors.push("warehouse_name is required");
    payload.status ||= "active";
  } else if (table === "banks") {
    Object.assign(payload, pickRow(row, ["bank_account_name", "bank_name", "account_number", "ifsc", "status"]));
    payload.company_id = companyId;
    payload.opening_balance = numberValue("opening_balance", "opening_balance") || 0;
    if (!payload.bank_account_name) errors.push("bank_account_name is required");
    if (!payload.bank_name) errors.push("bank_name is required");
    payload.status ||= "active";
  } else if (table === "expense_heads") {
    Object.assign(payload, pickRow(row, ["expense_head_name", "default_calculation_method", "category", "status"]));
    payload.default_percentage = numberValue("default_percentage", "default_percentage") || 0;
    if (!payload.expense_head_name) errors.push("expense_head_name is required");
    payload.default_calculation_method ||= "fixed";
    payload.status ||= "active";
  } else if (table === "supply_orders") {
    payload.order_number = requireValue("order_number");
    payload.supply_type = value("supply_type") || "GeM";
    payload.gem_order_number = value("gem_order_number");
    payload.gem_contract_number = value("gem_contract_number");
    payload.order_date = dateValue("order_date", "order_date");
    payload.department_id = findOne("government_departments", "department_name", requireValue("department"), "department");
    payload.employee_id = findOne("employees", "employee_name", requireValue("employee_assigned"), "employee_assigned");
    payload.institution_name = value("institution_name");
    payload.buyer_name = value("buyer_name");
    payload.buyer_designation = value("buyer_designation");
    payload.buyer_mobile = value("buyer_mobile");
    payload.buyer_email = value("buyer_email");
    payload.consignee = value("consignee_name") || value("consignee");
    payload.consignee_address = value("consignee_address");
    payload.delivery_location = value("delivery_location");
    payload.place_of_supply = value("place_of_supply");
    payload.location = value("location");
    payload.delivery_period = value("delivery_period");
    payload.warranty_period = value("warranty_period");
    payload.payment_terms = value("payment_terms");
    payload.emd_amount = numberValue("emd_amount", "emd_amount") || 0;
    payload.security_deposit_amount = numberValue("security_deposit_amount", "security_deposit_amount") || 0;
    payload.supply_due_date = dateValue("supply_due_date", "supply_due_date");
    payload.order_status = value("order_status") || "Received";
    payload.remarks = value("remarks");
    payload.company_id = companyId;
    const itemName = value("item_name");
    const item = itemName ? db.prepare("SELECT * FROM items WHERE LOWER(item_name) = LOWER(?) AND COALESCE(is_deleted, 0) = 0 LIMIT 1").get(itemName) : null;
    const itemLine = {
      item_id: item?.id || null,
      item_description: value("item_description") || itemName,
      brand: value("brand") || item?.brand || "",
      model: value("model") || item?.model || "",
      hsn_sac: value("hsn_sac") || value("hsn") || item?.hsn_code || "",
      quantity: numberValue("quantity", "quantity", false),
      unit: value("unit") || item?.unit || "",
      quoted_rate: numberValue("rate", "rate", false) || numberValue("quoted_rate", "quoted_rate", false),
      gst_rate: value("gst_rate") === "" ? (item?.gst_rate ?? "") : numberValue("gst_rate", "gst_rate", false),
      required_delivery_date: dateValue("required_delivery_date", "required_delivery_date"),
      remarks: value("item_remarks")
    };
    const hasItemLine = hasSupplyOrderItemInput(itemLine);
    if (hasItemLine) payload.order_items = [itemLine];
    if (supplyOrderNeedsItems(payload.order_status) && !hasItemLine) errors.push("At least one order item is required before moving this order beyond Received/Draft");
    if (hasItemLine) {
      if (Number(itemLine.quantity || 0) <= 0) errors.push("quantity must be greater than zero");
      if (Number(itemLine.quoted_rate || 0) <= 0) errors.push("rate must be greater than zero");
      if (!String(itemLine.hsn_sac || "").trim()) errors.push("hsn_sac is required for order item");
      if (String(itemLine.gst_rate ?? "").trim() === "") errors.push("gst_rate is required for order item");
    }
    if (payload.order_number && db.prepare("SELECT id FROM supply_orders WHERE order_number = ? AND COALESCE(is_deleted, 0) = 0").get(payload.order_number)) return { status: "duplicate", errors: ["Duplicate order number"], payload };
  } else if (table === "procurements") {
    payload.order_id = findOne("supply_orders", "order_number", requireValue("order_number"), "order_number");
    payload.purchase_date = dateValue("purchase_date", "purchase_date");
    payload.supplier_id = findOne("suppliers", "supplier_name", requireValue("supplier_name"), "supplier_name");
    payload.purchase_invoice_number = requireValue("purchase_invoice_number");
    payload.purchase_value = numberValue("purchase_value", "purchase_value", true);
    payload.purchase_gst = numberValue("gst_amount", "gst_amount") || 0;
    payload.freight = numberValue("freight", "freight") || 0;
    payload.loading_charges = numberValue("loading_charges", "loading_charges") || 0;
    payload.amount_paid = 0;
    payload.remarks = value("remarks");
    payload.company_id = companyId;
  } else if (table === "expense_entries") {
    payload.order_id = findOne("supply_orders", "order_number", requireValue("order_number"), "order_number");
    payload.expense_head_id = findOne("expense_heads", "expense_head_name", requireValue("expense_head"), "expense_head");
    payload.expense_category = value("expense_category");
    payload.calculation_method = value("calculation_method") || "fixed";
    payload.percentage = numberValue("percentage", "percentage") || 0;
    payload.fixed_amount = numberValue("fixed_amount", "fixed_amount") || numberValue("expense_amount", "expense_amount") || 0;
    payload.remarks = value("remarks");
    payload.company_id = companyId;
  } else if (table === "invoices") {
    payload.order_id = findOne("supply_orders", "order_number", requireValue("order_number"), "order_number");
    payload.invoice_number = requireValue("invoice_number");
    payload.invoice_date = dateValue("invoice_date", "invoice_date");
    payload.billing_value = numberValue("billing_value", "billing_value", true);
    payload.gst_rate = numberValue("gst_rate", "gst_rate");
    payload.invoice_type = value("invoice_type") || "Tax Invoice";
    payload.remarks = value("remarks");
    payload.company_id = companyId;
    if (payload.invoice_number && db.prepare("SELECT id FROM invoices WHERE company_id = ? AND invoice_number = ? AND COALESCE(is_deleted, 0) = 0").get(companyId, payload.invoice_number)) return { status: "duplicate", errors: ["Duplicate invoice number per company"], payload };
  } else if (table === "payments") {
    payload.order_id = findOne("supply_orders", "order_number", requireValue("order_number"), "order_number");
    payload.payment_date = dateValue("payment_date", "payment_date");
    payload.payment_amount = numberValue("payment_amount", "payment_amount", true);
    payload.payment_mode = value("payment_mode") || "NEFT";
    payload.utr_number = value("utr_number");
    payload.bank_id = findOne("banks", "bank_account_name", value("bank_account"), "bank_account");
    payload.remarks = value("remarks");
    payload.company_id = companyId;
    if (payload.utr_number && db.prepare("SELECT id FROM payments WHERE utr_number = ? AND COALESCE(is_deleted, 0) = 0").get(payload.utr_number)) return { status: "duplicate", errors: ["Duplicate UTR number"], payload };
  }
  if (MASTER_TABLES[table] && !errors.length) {
    const duplicate = findMasterImportDuplicate(db, table, payload, companyId);
    if (duplicate) {
      if (String(context.import_mode || "skip_existing") === "update_existing") {
        payload.__update_id = duplicate.id;
      } else {
        const reason = duplicate.duplicate_reason ? ` (${duplicate.duplicate_reason})` : "";
        return { status: "duplicate", errors: [`Duplicate ${MASTER_TABLES[table].label}: ${duplicate.label}${reason}`], payload };
      }
    }
  }
  return { status: "valid", errors, payload };
}

function findMasterImportDuplicate(db, table, payload, companyId) {
  const notDeleted = columnExists(db, table, "is_deleted") ? "AND COALESCE(is_deleted, 0) = 0" : "";
  const byText = (field, value, labelField = field) => {
    if (!String(value || "").trim()) return null;
    const row = db.prepare(`SELECT id, ${labelField} label FROM ${table} WHERE LOWER(TRIM(COALESCE(${field}, ''))) = ? ${notDeleted} LIMIT 1`).get(normalizeDuplicateKey(value));
    return row || null;
  };
  const byCompanyText = (field, value, labelField = field) => {
    if (!String(value || "").trim()) return null;
    const row = db.prepare(`SELECT id, ${labelField} label FROM ${table} WHERE company_id = ? AND LOWER(TRIM(COALESCE(${field}, ''))) = ? ${notDeleted} LIMIT 1`).get(companyId, normalizeDuplicateKey(value));
    return row || null;
  };

  if (table === "companies") {
    return byText("gstin", payload.gstin, "company_name") || byText("pan", payload.pan, "company_name") || byText("company_name", payload.company_name, "company_name");
  }
  if (table === "employees") {
    return byText("mobile_number", payload.mobile_number, "employee_name") || byText("employee_name", payload.employee_name, "employee_name");
  }
  if (table === "government_departments") {
    return byText("department_name", payload.department_name, "department_name");
  }
  if (table === "suppliers") {
    return byText("gstin", payload.gstin, "supplier_name") ||
      byText("supplier_code", payload.supplier_code, "supplier_name") ||
      byText("supplier_account_number", payload.supplier_account_number, "supplier_name") ||
      byText("supplier_name", payload.supplier_name, "supplier_name");
  }
  if (table === "items" && String(payload.item_name || "").trim()) {
    return db.prepare(`
      SELECT id, item_name label,
        'Normalized item name, brand and model match' duplicate_reason
      FROM items
      WHERE LOWER(TRIM(COALESCE(item_name, ''))) = ?
        AND LOWER(TRIM(COALESCE(brand, ''))) = ?
        AND LOWER(TRIM(COALESCE(model, ''))) = ?
        ${notDeleted}
      LIMIT 1
    `).get(normalizeDuplicateKey(payload.item_name), normalizeDuplicateKey(payload.brand), normalizeDuplicateKey(payload.model)) || null;
  }
  if (table === "warehouses") {
    if (!String(payload.warehouse_name || "").trim()) return null;
    return db.prepare(`
      SELECT id, warehouse_name label,
        CASE
          WHEN company_id = @company_id THEN 'Mapped to existing warehouse in selected company'
          ELSE 'Mapped to existing warehouse name to avoid duplicate warehouse master'
        END duplicate_reason
      FROM warehouses
      WHERE LOWER(TRIM(COALESCE(warehouse_name, ''))) = @warehouse_name
        ${notDeleted}
      ORDER BY CASE WHEN company_id = @company_id THEN 0 ELSE 1 END, id
      LIMIT 1
    `).get({ company_id: companyId || null, warehouse_name: normalizeDuplicateKey(payload.warehouse_name) }) || null;
  }
  if (table === "expense_heads") {
    return byText("expense_head_name", payload.expense_head_name, "expense_head_name");
  }
  if (table === "banks") {
    return byText("account_number", payload.account_number, "bank_account_name") || byText("bank_account_name", payload.bank_account_name, "bank_account_name");
  }
  return null;
}

function normalizeImportObject(row) {
  return Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [normalizeHeader(key), value]));
}

function normalizeImportDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (slash) {
    const [, day, month, year] = slash;
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    return Number.isNaN(Date.parse(iso)) ? "" : iso;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function pickRow(row, keys) {
  return Object.fromEntries(keys.map((key) => [key, String(row[key] ?? "").trim()]));
}

export function dashboardCounts(db, filters = {}) {
  const companyId = Number(filters.company_id || 0);
  const activeCompanySubquery = "(SELECT id FROM companies WHERE COALESCE(is_deleted, 0) = 0)";
  const companyWhere = companyId ? "company_id = @company_id" : `company_id IN ${activeCompanySubquery}`;
  const cashBankActiveWhere = activeRowClause(db, "cash_bank_ledger");
  const params = companyId ? { company_id: companyId } : {};
  const count = (table, where = "", extraParams = {}) => db.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get(where.includes("@company_id") ? { ...params, ...extraParams } : extraParams).count;
  const totalOrderValue = db.prepare(`SELECT COALESCE(SUM(billing_value), 0) AS value FROM invoices WHERE ${companyWhere} AND COALESCE(is_deleted, 0) = 0`).get(params).value;
  const amountReceived = db.prepare(`SELECT COALESCE(SUM(payment_amount), 0) AS value FROM payments WHERE ${companyWhere} AND COALESCE(is_deleted, 0) = 0`).get(params).value;
  const totalProfit = orderProfitability(db, companyId ? { company_id: companyId } : {}).reduce((sum, order) => sum + order.netCompanyProfit, 0);
  const inventorySummary = dashboardInventorySummary(db, companyId);
  const cracWhere = companyId ? "WHERE cr.company_id = @company_id AND cr.is_deleted = 0" : `WHERE cr.company_id IN ${activeCompanySubquery} AND cr.is_deleted = 0`;
  const cracParams = companyId ? { company_id: companyId } : {};
  const cracPending = db.prepare(`SELECT COUNT(*) AS count FROM crac_records cr ${cracWhere} AND cr.crac_status = 'Pending'`).get(cracParams).count;
  const cracGenerated = db.prepare(`SELECT COUNT(*) AS count FROM crac_records cr ${cracWhere} AND cr.crac_status = 'Generated'`).get(cracParams).count;
  const ordersWithGeneratedCrac = db.prepare(`SELECT COUNT(*) AS count FROM crac_records cr ${cracWhere} AND cr.crac_status = 'Generated'`).get(cracParams).count;
  const ordersWithInvoiceAndCrac = db.prepare(`
    SELECT COUNT(*) AS count FROM supply_orders so
    WHERE so.company_id IN ${activeCompanySubquery} AND so.is_deleted = 0
      AND so.crac_status = 'Generated'
      AND EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = so.id AND i.is_deleted = 0)
      AND EXISTS (SELECT 1 FROM payments p WHERE p.order_id = so.id AND p.is_deleted = 0)
  `).get({}).count;
  return {
    totalOrders: count("supply_orders", `WHERE ${companyWhere} AND COALESCE(is_deleted, 0) = 0`),
    activeOrders: count("supply_orders", `WHERE ${companyWhere} AND COALESCE(is_deleted, 0) = 0 AND order_status NOT IN ('Closed', 'Fully Received')`),
    totalOrderValue,
    amountReceived,
    outstanding: totalOrderValue - amountReceived,
    totalProfit,
    suppliers: count("suppliers"),
    companies: count("companies"),
    employees: count("employees", "WHERE status = 'active'"),
    departments: count("government_departments"),
    items: count("items"),
    expenseHeads: count("expense_heads"),
    banks: count("banks", `WHERE ${companyWhere}`),
    totalStockValue: inventorySummary.totalStockValue,
    lowStockItems: inventorySummary.lowStockItems,
    itemsInStock: inventorySummary.itemsInStock,
    itemsIssued: db.prepare(`SELECT COALESCE(SUM(outward_quantity), 0) AS value FROM stock_ledger WHERE ${companyWhere} AND COALESCE(is_deleted, 0) = 0 AND transaction_type IN ('Outward','Supplier Return','Adjustment Decrease')`).get(params).value,
    returnedItems: db.prepare(`SELECT COALESCE(SUM(quantity), 0) AS value FROM stock_returns WHERE ${companyWhere} AND COALESCE(is_deleted, 0) = 0`).get(params).value,
    cracPending,
    cracGenerated,
    paymentReadyOrders: ordersWithInvoiceAndCrac,
    readyForClosure: count("supply_orders", `WHERE ${companyWhere} AND COALESCE(is_deleted, 0) = 0 AND COALESCE(operationally_closed, 0) = 1`),
    cashBankBalance: db.prepare(`SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) AS balance FROM cash_bank_ledger WHERE ${companyWhere}${cashBankActiveWhere}`).get(params).balance
  };
}

function dashboardInventorySummary(db, companyId = 0) {
  const companies = companyId
    ? [{ id: companyId }]
    : db.prepare("SELECT id FROM companies WHERE COALESCE(is_deleted, 0) = 0 AND status = 'active' ORDER BY id").all();
  const rows = companies.flatMap((company) => inventoryStockSummary(db, company.id));
  return {
    totalStockValue: rows.reduce((sum, row) => sum + Number(row.stock_value || 0), 0),
    lowStockItems: companies.reduce((sum, company) => sum + inventoryLowStockReport(db, company.id, "stocked").length, 0),
    itemsInStock: new Set(rows.filter((row) => Number(row.closing_quantity || 0) > 0).map((row) => row.id)).size
  };
}

export function referenceData(db, filters = {}) {
  const companyId = Number(filters.company_id || 0);
  const orderParams = companyId ? { company_id: companyId } : {};
  const orderCompanyWhere = companyId ? "WHERE so.company_id = @company_id AND COALESCE(so.is_deleted, 0) = 0" : "WHERE so.company_id IN (SELECT id FROM companies WHERE COALESCE(is_deleted, 0) = 0) AND COALESCE(so.is_deleted, 0) = 0";
  return {
    companies: listRecords(db, "companies", { status: "active" }),
    employees: listRecords(db, "employees", { status: "active" }),
    departments: listRecords(db, "government_departments", { status: "active" }),
    suppliers: listRecords(db, "suppliers", { status: "active" }),
    items: listRecords(db, "items", { status: "active" }),
    warehouses: listRecords(db, "warehouses", { status: "active", ...(companyId ? { company_id: companyId } : {}) }),
    expenseHeads: listRecords(db, "expense_heads", { status: "active" }),
    banks: listRecords(db, "banks", { status: "active", ...(companyId ? { company_id: companyId } : {}) }),
    orders: db.prepare(`
      SELECT so.*, gd.department_name, e.employee_name,
        COALESCE((SELECT SUM(oi.taxable_value) FROM order_items oi WHERE oi.order_id = so.id AND COALESCE(oi.is_deleted, 0) = 0), 0) order_taxable_value,
        COALESCE((SELECT SUM(oi.gross_value) FROM order_items oi WHERE oi.order_id = so.id AND COALESCE(oi.is_deleted, 0) = 0), 0) order_gross_value,
        COALESCE((SELECT SUM(oi.quantity) FROM order_items oi WHERE oi.order_id = so.id AND COALESCE(oi.is_deleted, 0) = 0), 0) order_quantity
      FROM supply_orders so
      LEFT JOIN government_departments gd ON gd.id = so.department_id
      LEFT JOIN employees e ON e.id = so.employee_id
      ${orderCompanyWhere}
      ORDER BY so.id DESC
    `).all(orderParams)
  };
}

export function billingVoucherData(db, filters = {}) {
  const references = referenceData(db, filters);
  const companyId = Number(filters.company_id || references.companies[0]?.id || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || 0);
  const financialYears = db.prepare("SELECT * FROM financial_years WHERE company_id = ? ORDER BY start_date DESC").all(companyId);
  const institutionOptions = db.prepare(`
    SELECT DISTINCT so.department_id, so.institution_name
    FROM supply_orders so
    WHERE so.company_id = ? AND COALESCE(so.institution_name, '') <> '' AND COALESCE(so.is_deleted, 0) = 0
    ORDER BY so.institution_name
  `).all(companyId);
  const invoices = db.prepare(`
    SELECT i.*, c.company_name, fy.financial_year_name, so.order_number, so.department_id,
      so.institution_name, so.location, so.order_status, gd.department_name,
      COALESCE(MAX(v.id), 0) voucher_id,
      COALESCE(MAX(v.voucher_number), '') voucher_number,
      COALESCE(MAX(v.status), '') voucher_status,
      COALESCE(MAX(v.voucher_date), '') voucher_date,
      COALESCE(r.invoice_amount, i.billing_value + (i.billing_value * i.gst_rate / 100)) invoice_value,
      COALESCE(r.amount_received, 0) amount_received,
      COALESCE(r.tds_deducted, 0) tds_deducted,
      COALESCE(r.gst_tds_deducted, 0) gst_tds_deducted,
      COALESCE((SELECT SUM(aa.adjusted_amount) FROM advance_adjustments aa WHERE aa.adjustment_type = 'receipt' AND aa.billing_id = i.id AND COALESCE(aa.is_deleted, 0) = 0 AND aa.status = 'Active'), 0) advance_adjusted,
      COALESCE(r.balance_outstanding, i.billing_value + (i.billing_value * i.gst_rate / 100)) balance_outstanding
    FROM invoices i
    LEFT JOIN companies c ON c.id = i.company_id
    LEFT JOIN financial_years fy ON fy.id = i.financial_year_id
    LEFT JOIN supply_orders so ON so.id = i.order_id
    LEFT JOIN government_departments gd ON gd.id = so.department_id
    LEFT JOIN vouchers v ON v.source_module = 'billing' AND v.source_id = i.id AND v.is_deleted = 0
    LEFT JOIN receivables r ON r.billing_id = i.id AND r.is_deleted = 0
    WHERE i.company_id = ? AND COALESCE(i.is_deleted, 0) = 0
    GROUP BY i.id
    ORDER BY i.invoice_date DESC, i.id DESC
  `).all(companyId);
  const invoiceItems = db.prepare(`
    SELECT ii.*, it.item_name, COALESCE(ii.hsn, it.hsn_code) hsn_code, COALESCE(ii.unit, it.unit) item_unit
    FROM invoice_items ii
    LEFT JOIN items it ON it.id = ii.item_id
    WHERE ii.company_id = ? AND COALESCE(ii.is_deleted, 0) = 0
    ORDER BY ii.id
  `).all(companyId);
  const orderItems = db.prepare(`
    SELECT oi.*, it.item_name, it.hsn_code, it.unit, it.gst_rate
    FROM order_items oi
    LEFT JOIN items it ON it.id = oi.item_id
    WHERE oi.company_id = ? AND COALESCE(oi.is_deleted, 0) = 0
    ORDER BY oi.id
  `).all(companyId);
  const billingQuantities = db.prepare(`
    SELECT order_id, COALESCE(order_item_id, 0) order_item_id, COALESCE(item_id, 0) item_id, SUM(quantity) billed_quantity
    FROM invoice_items
    WHERE company_id = ? AND COALESCE(is_deleted, 0) = 0
    GROUP BY order_id, COALESCE(order_item_id, 0), COALESCE(item_id, 0)
  `).all(companyId);
  const documents = db.prepare(`
    SELECT d.*, dc.order_id document_order_id
    FROM documents d
    LEFT JOIN delivery_challans dc ON d.linked_module = 'delivery_challans' AND dc.id = d.linked_record_id
    WHERE d.company_id = ? AND d.status = 'active' AND d.deleted_at IS NULL
      AND d.linked_module IN ('invoices', 'supply_orders', 'delivery_challans', 'stock_outwards')
    ORDER BY d.uploaded_at DESC, d.id DESC
  `).all(companyId);
  const receiptAdvances = db.prepare(`
    SELECT ar.*, gd.department_name, so.order_number, COALESCE(p.utr_number, 'Receipt ' || p.id) receipt_reference
    FROM advance_receipts ar
    LEFT JOIN government_departments gd ON gd.id = ar.department_id
    LEFT JOIN supply_orders so ON so.id = ar.order_id
    LEFT JOIN payments p ON p.id = ar.payment_id
    WHERE ar.company_id = ? AND COALESCE(ar.is_deleted, 0) = 0
    ORDER BY ar.created_at DESC
  `).all(companyId);
  const supplierAdvances = db.prepare(`
    SELECT sa.*, s.supplier_name, COALESCE(sp.utr_number, 'Supplier Payment ' || sp.id) payment_reference
    FROM supplier_advances sa
    LEFT JOIN suppliers s ON s.id = sa.supplier_id
    LEFT JOIN supplier_payments sp ON sp.id = sa.supplier_payment_id
    WHERE sa.company_id = ? AND COALESCE(sa.is_deleted, 0) = 0
    ORDER BY sa.created_at DESC
  `).all(companyId);
  const advanceAdjustments = db.prepare(`
    SELECT aa.*, i.invoice_number, p.purchase_invoice_number, ar.advance_received, ar.balance_advance receipt_balance,
      sa.advance_paid, sa.balance_advance supplier_balance
    FROM advance_adjustments aa
    LEFT JOIN invoices i ON i.id = aa.billing_id
    LEFT JOIN procurements p ON p.id = aa.procurement_id
    LEFT JOIN advance_receipts ar ON ar.id = aa.advance_id AND aa.adjustment_type = 'receipt'
    LEFT JOIN supplier_advances sa ON sa.id = aa.advance_id AND aa.adjustment_type = 'supplier'
    WHERE aa.company_id = ?
    ORDER BY aa.created_at DESC
  `).all(companyId);
  const procuredQuantities = db.prepare(`
    SELECT pi.order_id, pi.item_id, SUM(pi.quantity) procured_quantity
    FROM procurement_items pi
    JOIN procurements p ON p.id = pi.procurement_id
    WHERE pi.company_id = ? AND COALESCE(p.is_deleted, 0) = 0 AND COALESCE(pi.is_deleted, 0) = 0
    GROUP BY pi.order_id, pi.item_id
  `).all(companyId);
  const issuedQuantities = db.prepare(`
    SELECT dc.order_id, dci.item_id, SUM(dci.quantity) issued_quantity
    FROM delivery_challan_items dci
    JOIN delivery_challans dc ON dc.id = dci.delivery_challan_id
    WHERE dci.company_id = ? AND COALESCE(dc.is_deleted, 0) = 0 AND dc.status = 'Confirmed'
    GROUP BY dc.order_id, dci.item_id
  `).all(companyId);
  const paymentAllocations = db.prepare(`
    SELECT pa.*, p.utr_number, p.payment_date, p.payment_mode
    FROM payment_allocations pa
    LEFT JOIN payments p ON p.id = pa.payment_id
    WHERE pa.company_id = ? AND COALESCE(pa.is_deleted, 0) = 0
    ORDER BY pa.created_at DESC
  `).all(companyId);
  return {
    references,
    financialYears,
    institutionOptions,
    invoiceSequence: suggestedInvoiceSequences(db, references.companies, financialYears),
    invoices,
    invoiceItems,
    orderItems,
    billingQuantities,
    documents,
    receiptAdvances,
    supplierAdvances,
    advanceAdjustments,
    profitability: orderProfitability(db, { company_id: companyId }),
    procuredQuantities,
    issuedQuantities,
    paymentAllocations
  };
}

export function saveBillingVoucher(db, payload) {
  const header = payload.header || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!header.order_id) throw new Error("Order is required");
  if (!header.invoice_date) throw new Error("Invoice date is required");
  const order = db.prepare("SELECT * FROM supply_orders WHERE id = ?").get(header.order_id);
  if (!order) throw new Error("Linked order not found");
  if (!order.department_id) throw new Error("Department is required before billing");

  const companyId = Number(header.company_id || order.company_id || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || 0);
  if (!companyId) throw new Error("Company is required");
  const financialYear = header.financial_year_id
    ? db.prepare("SELECT * FROM financial_years WHERE id = ?").get(header.financial_year_id)
    : financialYearForDate(db, companyId, header.invoice_date);
  if (!financialYear) throw new Error("Financial year is not configured for this invoice date");
  const invoiceNumber = String(header.invoice_number || "").trim() || nextInvoiceNumber(db, companyId, financialYear.id);

  const duplicate = db.prepare(`
    SELECT id FROM invoices
    WHERE company_id = ? AND invoice_number = ? AND COALESCE(financial_year_id, 0) = COALESCE(?, 0)
      AND COALESCE(is_deleted, 0) = 0 AND id <> ?
  `).get(companyId, invoiceNumber, financialYear.id, Number(header.id || 0));
  if (duplicate) throw new Error("Invoice number must be unique per company and financial year");

  const normalizedItems = items
    .map((item) => normalizeInvoiceItem(item, companyId, Number(header.order_id)))
    .filter((item) => item.quantity || item.taxable_value || item.item_id || item.description);
  const taxableTotal = normalizedItems.reduce((sum, item) => sum + item.taxable_value, 0);
  const gstTotal = normalizedItems.reduce((sum, item) => sum + item.gst_amount, 0);
  const fallbackBilling = Number(header.billing_value || 0);
  const billingValue = taxableTotal || fallbackBilling;
  const gstRate = normalizedItems.length ? Math.max(...normalizedItems.map((item) => item.gst_rate)) : Number(header.gst_rate || 0);
  if (billingValue < 0 || gstTotal < 0) throw new Error("Invoice amount cannot be negative");

  const data = {
    company_id: companyId,
    financial_year_id: financialYear.id,
    order_id: Number(header.order_id),
    invoice_number: invoiceNumber,
    invoice_date: header.invoice_date,
    gem_order_number: header.gem_order_number || "",
    gem_contract_number: header.gem_contract_number || "",
    consignee: header.consignee || "",
    place_of_supply: header.place_of_supply || "",
    gst_type: header.gst_type || "CGST/SGST",
    billing_value: billingValue,
    gst_rate: gstRate,
    invoice_type: header.invoice_type || "Tax Invoice",
    invoice_status: header.invoice_status || header.approval_status || "Draft",
    remarks: header.remarks || "",
    posting_status: header.posting_status || "Draft",
    approval_status: header.approval_status || "Draft",
    posting_error: header.posting_error || null
  };

  const transaction = db.transaction(() => {
    let invoice;
    if (header.id) {
      assertRecordEditable("invoices", getRecord(db, "invoices", header.id));
      db.prepare(`
        UPDATE invoices SET company_id = @company_id, financial_year_id = @financial_year_id, order_id = @order_id,
          invoice_number = @invoice_number, invoice_date = @invoice_date, gem_order_number = @gem_order_number,
          gem_contract_number = @gem_contract_number,
          consignee = @consignee, place_of_supply = @place_of_supply, gst_type = @gst_type,
          billing_value = @billing_value, gst_rate = @gst_rate, invoice_type = @invoice_type,
          invoice_status = @invoice_status, remarks = @remarks, posting_status = @posting_status,
          approval_status = @approval_status, posting_error = @posting_error, updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
      `).run({ ...data, id: header.id });
      invoice = getRecord(db, "invoices", header.id);
      db.prepare("UPDATE invoice_items SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE billing_id = ?").run(header.id);
    } else {
      const result = db.prepare(`
        INSERT INTO invoices (company_id, financial_year_id, order_id, invoice_number, invoice_date, gem_order_number, gem_contract_number,
          consignee, place_of_supply, gst_type, billing_value, gst_rate, invoice_type, invoice_status, remarks,
          posting_status, approval_status, posting_error)
        VALUES (@company_id, @financial_year_id, @order_id, @invoice_number, @invoice_date, @gem_order_number, @gem_contract_number,
          @consignee, @place_of_supply, @gst_type, @billing_value, @gst_rate, @invoice_type, @invoice_status, @remarks,
          @posting_status, @approval_status, @posting_error)
      `).run(data);
      invoice = getRecord(db, "invoices", result.lastInsertRowid);
    }

    const insertLine = db.prepare(`
      INSERT INTO invoice_items (company_id, billing_id, order_id, order_item_id, item_id, description, hsn, unit,
        quantity, billing_rate, gst_rate, taxable_value, cgst, sgst, igst, gst_amount, gross_value)
      VALUES (@company_id, @billing_id, @order_id, @order_item_id, @item_id, @description, @hsn, @unit,
        @quantity, @billing_rate, @gst_rate, @taxable_value, @cgst, @sgst, @igst, @gst_amount, @gross_value)
    `);
    normalizedItems.forEach((item) => insertLine.run({ ...item, billing_id: invoice.id }));
    auditLog(db, { company_id: companyId, action: header.id ? "billing voucher update" : "billing voucher create", table_name: "invoices", record_id: invoice.id, new_value: JSON.stringify({ invoice: data, line_count: normalizedItems.length }) });
    return getRecord(db, "invoices", invoice.id);
  });
  return transaction();
}

function normalizeInvoiceItem(item, companyId, orderId) {
  const quantity = Number(item.quantity || 0);
  const billingRate = Number(item.billing_rate || 0);
  const taxableValue = Number(item.taxable_value || (quantity * billingRate) || 0);
  const gstRate = Number(item.gst_rate || 0);
  const gstType = item.gst_type || "CGST/SGST";
  const gstAmount = Number(item.gst_amount || (taxableValue * gstRate / 100) || 0);
  const cgst = gstType === "IGST" ? 0 : Number(item.cgst || gstAmount / 2 || 0);
  const sgst = gstType === "IGST" ? 0 : Number(item.sgst || gstAmount / 2 || 0);
  const igst = gstType === "IGST" ? Number(item.igst || gstAmount || 0) : 0;
  return {
    company_id: companyId,
    order_id: orderId,
    order_item_id: item.order_item_id || null,
    item_id: item.item_id || null,
    description: item.description || "",
    hsn: item.hsn || "",
    unit: item.unit || "",
    quantity,
    billing_rate: billingRate,
    gst_rate: gstRate,
    taxable_value: taxableValue,
    cgst,
    sgst,
    igst,
    gst_amount: gstAmount,
    gross_value: Number(item.gross_value || taxableValue + gstAmount || 0)
  };
}

export function orderProfitability(db, filters = {}) {
  const companyId = Number(filters.company_id || 0);
  const where = companyId ? "WHERE so.company_id = @company_id AND COALESCE(so.is_deleted, 0) = 0" : "WHERE so.company_id IN (SELECT id FROM companies WHERE COALESCE(is_deleted, 0) = 0) AND COALESCE(so.is_deleted, 0) = 0";
  const orders = db.prepare(`
    SELECT so.*, gd.department_name, e.employee_name, e.incentive_percentage
    FROM supply_orders so
    LEFT JOIN government_departments gd ON gd.id = so.department_id
    LEFT JOIN employees e ON e.id = so.employee_id
    ${where}
    ORDER BY so.id DESC
  `).all(companyId ? { company_id: companyId } : {});

  return orders.map((order) => calculateProfitability(db, order));
}

export function calculateProfitability(db, order) {
  const invoices = db.prepare("SELECT * FROM invoices WHERE order_id = ? AND COALESCE(is_deleted, 0) = 0 AND posting_status = 'Posted'").all(order.id);
  const procurements = db.prepare("SELECT * FROM procurements WHERE order_id = ? AND COALESCE(is_deleted, 0) = 0 AND posting_status = 'Posted'").all(order.id);
  const payments = db.prepare("SELECT * FROM payments WHERE order_id = ? AND COALESCE(is_deleted, 0) = 0 AND posting_status = 'Posted'").all(order.id);
  const expenses = db.prepare(`
    SELECT ee.*, eh.expense_head_name
    FROM expense_entries ee
    LEFT JOIN expense_heads eh ON eh.id = ee.expense_head_id
    WHERE ee.order_id = ? AND COALESCE(ee.is_deleted, 0) = 0 AND ee.posting_status = 'Posted'
  `).all(order.id);

  const billingValue = invoices.reduce((sum, row) => sum + Number(row.billing_value || 0), 0);
  const invoiceGrossValue = invoices.reduce((sum, row) => {
    const lineGross = Number(db.prepare(`
      SELECT COALESCE(SUM(gross_value), 0) total
      FROM invoice_items
      WHERE billing_id = ? AND COALESCE(is_deleted, 0) = 0
    `).get(row.id)?.total || 0);
    if (lineGross > 0) return sum + lineGross;
    return sum + Number(row.billing_value || 0) + (Number(row.billing_value || 0) * Number(row.gst_rate || 0) / 100);
  }, 0);
  const gstRate = invoices.length ? Number(invoices[0].gst_rate || 0) / 100 : 0;
  const purchaseValue = procurements.reduce((sum, row) => sum + Number(row.purchase_value || 0), 0);
  const purchaseCost = procurements.reduce((sum, row) => sum + Number(row.purchase_value || 0) + Number(row.freight || 0) + Number(row.loading_charges || 0), 0);
  const issuedStockCost = Number(db.prepare(`
    SELECT COALESCE(SUM(value), 0) total
    FROM stock_ledger
    WHERE order_id = ? AND COALESCE(is_deleted, 0) = 0 AND transaction_type = 'Outward'
  `).get(order.id)?.total || 0);
  const inventoryCostBasis = issuedStockCost > 0 ? issuedStockCost : purchaseValue;
  const supplierPaid = procurements.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0);
  const amountReceived = payments.reduce((sum, row) => sum + Number(row.payment_amount || 0), 0);
  const grossMargin = billingValue - inventoryCostBasis;
  const gstInputLoss = grossMargin * gstRate;
  const taxableValue = gstRate ? billingValue / (1 + gstRate) : billingValue;
  const dynamicExpenses = expenses.map((expense) => {
    let amount = Number(expense.fixed_amount || 0);
    if (expense.calculation_method === "percentage_gross") {
      amount = billingValue * (Number(expense.percentage || 0) / 100);
    }
    if (expense.calculation_method === "percentage_taxable") {
      amount = taxableValue * (Number(expense.percentage || 0) / 100);
    }
    return { ...expense, amount };
  });
  const totalExpenses = dynamicExpenses.reduce((sum, row) => sum + row.amount, 0);
  const initialProfit = grossMargin - gstInputLoss - totalExpenses;
  const incentivePercentage = Number(order.incentive_percentage || 0) / 100;
  const employeeIncentive = initialProfit * incentivePercentage;
  const netCompanyProfit = initialProfit - employeeIncentive;

  return {
    ...order,
    billingValue,
    invoiceGrossValue,
    gstRate: gstRate * 100,
    purchaseValue,
    purchaseCost,
    issuedStockCost,
    inventoryCostBasis,
    inventoryCostSource: issuedStockCost > 0 ? "Issued Stock Cost" : "Procurement Value",
    supplierPaid,
    supplierDue: purchaseCost - supplierPaid,
    amountReceived,
    outstanding: invoiceGrossValue - amountReceived,
    grossMargin,
    gstInputLoss,
    totalExpenses,
    initialProfit,
    employeeIncentive,
    netCompanyProfit,
    roiPercentage: inventoryCostBasis ? (netCompanyProfit / inventoryCostBasis) * 100 : 0,
    dynamicExpenses
  };
}

export function authenticate(db, username, password) {
  const user = db.prepare("SELECT * FROM users WHERE username = ? AND status = 'active'").get(username);
  const now = new Date().toISOString();
  if (user?.locked_until && user.locked_until > now) {
    auditLog(db, { user_id: user.id, user_role: user.role, action: "login_blocked_locked_user", module: "security", table_name: "users", record_id: user.id });
    return null;
  }
  if (!user || !verifyPassword(password, user.password_hash)) {
    if (user) {
      const failedCount = Number(user.failed_login_count || 0) + 1;
      const lockedUntil = failedCount >= SECURITY.maxFailedLogins ? new Date(Date.now() + SECURITY.sessionTimeoutMinutes * 60 * 1000).toISOString() : null;
      db.prepare("UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(failedCount, lockedUntil, user.id);
      auditLog(db, { user_id: user.id, user_role: user.role, action: "login_failed", module: "security", table_name: "users", record_id: user.id, new_value: JSON.stringify({ failedCount, lockedUntil }) });
    }
    return null;
  }
  const forcePasswordChange = user.username === "admin" && verifyPassword("admin123", user.password_hash)
    ? 1
    : Number(user.force_password_change || 0);
  if (forcePasswordChange !== Number(user.force_password_change || 0)) {
    db.prepare("UPDATE users SET force_password_change = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
  }
  db.prepare("UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
  auditLog(db, { user_id: user.id, user_role: user.role, action: "login_success", module: "security", table_name: "users", record_id: user.id });
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    forcePasswordChange: Boolean(forcePasswordChange)
  };
}

export function changeUserPassword(db, payload = {}) {
  const userId = Number(payload.user_id || payload.userId || 0);
  const username = String(payload.username || "").trim();
  const currentPassword = String(payload.current_password || payload.currentPassword || "");
  const newPassword = String(payload.new_password || payload.newPassword || "");
  const user = userId
    ? db.prepare("SELECT * FROM users WHERE id = ? AND status = 'active'").get(userId)
    : db.prepare("SELECT * FROM users WHERE username = ? AND status = 'active'").get(username);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    if (user) {
      auditLog(db, { user_id: user.id, user_role: user.role, action: "password_change_failed", module: "security", table_name: "users", record_id: user.id });
    }
    throw new Error("Current password is incorrect.");
  }
  const errors = passwordStrengthErrors(newPassword);
  if (errors.length) {
    throw new Error(errors.join(" "));
  }
  if (verifyPassword(newPassword, user.password_hash)) {
    throw new Error("New password must be different from the current password.");
  }
  db.prepare(`
    UPDATE users
    SET password_hash = ?,
        force_password_change = 0,
        failed_login_count = 0,
        locked_until = NULL,
        password_changed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(hashPassword(newPassword), user.id);
  auditLog(db, {
    user_id: user.id,
    user_role: user.role,
    action: "password_changed",
    module: "security",
    table_name: "users",
    record_id: user.id,
    new_value: JSON.stringify({ first_run_hardening: true })
  });
  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
  return {
    id: updated.id,
    username: updated.username,
    displayName: updated.display_name,
    role: updated.role,
    forcePasswordChange: Boolean(updated.force_password_change)
  };
}

function accountId(db, companyId, accountName) {
  const account = db.prepare("SELECT id FROM accounts WHERE company_id = ? AND account_name = ? AND is_deleted = 0").get(companyId, accountName);
  if (!account) throw new Error(`Missing account: ${accountName}`);
  return account.id;
}

function nextVoucherNumber(db, companyId, prefix) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM vouchers WHERE company_id = ? AND voucher_number LIKE ?").get(companyId, `${prefix}-%`).count;
  return `${prefix}-${String(count + 1).padStart(5, "0")}`;
}

function companyInvoiceCode(company = {}) {
  const source = String(company.company_name || "GII").replace(/[^a-zA-Z0-9 ]/g, " ").trim();
  const initials = source.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 4).toUpperCase();
  return initials || "GII";
}

function financialYearCode(financialYear = {}) {
  const label = String(financialYear.financial_year_name || "");
  const match = label.match(/(\d{4})\D+(\d{2,4})/);
  if (match) return `${match[1]}-${match[2].slice(-2)}`;
  const startYear = String(financialYear.start_date || "").slice(0, 4);
  const endYear = String(financialYear.end_date || "").slice(2, 4);
  return startYear ? `${startYear}-${endYear || String(Number(startYear) + 1).slice(-2)}` : "FY";
}

function invoicePrefix(db, companyId, financialYearId) {
  const company = db.prepare("SELECT * FROM companies WHERE id = ?").get(companyId) || {};
  const financialYear = db.prepare("SELECT * FROM financial_years WHERE id = ?").get(financialYearId) || {};
  return `${companyInvoiceCode(company)}-${financialYearCode(financialYear)}-INV`;
}

function nextInvoiceNumber(db, companyId, financialYearId) {
  const prefix = invoicePrefix(db, companyId, financialYearId);
  const count = db.prepare(`
    SELECT COUNT(*) count
    FROM invoices
    WHERE company_id = ? AND COALESCE(financial_year_id, 0) = COALESCE(?, 0)
      AND invoice_number LIKE ? AND COALESCE(is_deleted, 0) = 0
  `).get(companyId, financialYearId, `${prefix}-%`).count;
  return `${prefix}-${String(count + 1).padStart(5, "0")}`;
}

function suggestedInvoiceSequences(db, companies = [], financialYears = []) {
  const rows = [];
  companies.forEach((company) => {
    financialYears.forEach((financialYear) => {
      rows.push({
        company_id: company.id,
        financial_year_id: financialYear.id,
        invoice_number: nextInvoiceNumber(db, company.id, financialYear.id)
      });
    });
  });
  return rows;
}

function assertPositive(value, label) {
  if (Number(value || 0) <= 0) throw new Error(`${label} must be positive`);
}

function createAutomaticGrnFromPurchaseVoucher(db, guidedVoucher, payload, voucher) {
  const itemId = Number(payload.item_id || 0);
  const warehouseId = Number(payload.warehouse_id || 0);
  const quantity = Number(payload.quantity || payload.quantity_received || 0);
  if (!itemId || !warehouseId || quantity <= 0) return null;
  const damaged = Number(payload.damaged_quantity || 0);
  const accepted = Math.max(0, Number(payload.accepted_quantity || (quantity - damaged)));
  if (accepted <= 0) throw new Error("Accepted GRN quantity must be positive");
  const grnNumber = nextDocumentNumber(db, guidedVoucher.company_id, "goods_receipts", "grn_number", "GRN");
  const grn = db.prepare(`
    INSERT INTO goods_receipts (company_id, grn_number, purchase_voucher_id, guided_voucher_id, procurement_id, supplier_id, warehouse_id, grn_date, status, remarks, posted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Posted', ?, CURRENT_TIMESTAMP)
  `).run(
    guidedVoucher.company_id,
    grnNumber,
    voucher.id,
    guidedVoucher.id,
    payload.procurement_id || null,
    payload.supplier_id || null,
    warehouseId,
    guidedVoucher.voucher_date,
    payload.remarks || "Automatic stock receipt from purchase voucher"
  );
  const inward = createRecord(db, "stock_inwards", {
    company_id: guidedVoucher.company_id,
    procurement_id: payload.procurement_id || null,
    order_id: payload.order_id || null,
    supplier_id: payload.supplier_id || null,
    item_id: itemId,
    warehouse_id: warehouseId,
    inward_date: guidedVoucher.voucher_date,
    purchase_invoice_number: payload.purchase_invoice_number || voucher.voucher_number,
    quantity: accepted,
    rate: Number(payload.rate || payload.purchase_rate || payload.purchase_value || 0) / (accepted || 1),
    gst_rate: Number(payload.gst_rate || 0),
    landed_cost: Number(payload.landed_cost || payload.purchase_value || 0),
    serial_number: payload.serial_number || "",
    batch_number: payload.batch_number || "",
    remarks: `Auto GRN ${grnNumber}`
  });
  postStockInward(db, inward.id);
  db.prepare(`
    INSERT INTO goods_receipt_items (company_id, grn_id, item_id, order_id, purchase_invoice_number, quantity_received, damaged_quantity, accepted_quantity, rate, gst_rate, landed_cost, stock_inward_id, remarks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    guidedVoucher.company_id,
    grn.lastInsertRowid,
    itemId,
    payload.order_id || null,
    payload.purchase_invoice_number || voucher.voucher_number,
    quantity,
    damaged,
    accepted,
    Number(payload.rate || payload.purchase_rate || payload.purchase_value || 0) / (accepted || 1),
    Number(payload.gst_rate || 0),
    Number(payload.landed_cost || payload.purchase_value || 0),
    inward.id,
    payload.remarks || ""
  );
  auditLog(db, { company_id: guidedVoucher.company_id, action: "automatic_grn_stock_receipt", table_name: "goods_receipts", record_id: grn.lastInsertRowid, new_value: JSON.stringify({ grnNumber, stock_inward_id: inward.id }) });
  return db.prepare("SELECT * FROM goods_receipts WHERE id = ?").get(grn.lastInsertRowid);
}

function createAutomaticStockIssueFromSalesVoucher(db, guidedVoucher, payload, voucher) {
  if (payload.inventory_enabled === false || payload.inventory_enabled === "0") return null;
  const itemId = Number(payload.item_id || 0);
  const warehouseId = Number(payload.warehouse_id || 0);
  const quantity = Number(payload.quantity || payload.quantity_issued || 0);
  if (!itemId && !warehouseId && quantity <= 0) return null;
  if (!payload.order_id) throw new Error("Sales voucher stock issue requires a linked supply order");
  if (!itemId || !warehouseId || quantity <= 0) throw new Error("Sales voucher stock issue requires item, warehouse and positive quantity");
  const outward = createRecord(db, "stock_outwards", {
    company_id: guidedVoucher.company_id,
    order_id: payload.order_id,
    department_id: payload.department_id || null,
    item_id: itemId,
    warehouse_id: warehouseId,
    issue_date: guidedVoucher.voucher_date,
    delivery_challan_number: payload.delivery_challan_number || payload.invoice_number || voucher.voucher_number,
    quantity_issued: quantity,
    serial_number: payload.serial_number || "",
    batch_number: payload.batch_number || "",
    remarks: payload.narration || `Auto stock issue from sales voucher ${voucher.voucher_number}`
  });
  const posted = postStockOutward(db, outward.id);
  auditLog(db, { company_id: guidedVoucher.company_id, action: "automatic_sales_stock_issue", table_name: "stock_outwards", record_id: posted.id, new_value: JSON.stringify({ voucher_number: voucher.voucher_number, quantity }) });
  return posted;
}

function nextDocumentNumber(db, companyId, table, column, prefix) {
  const count = db.prepare(`SELECT COUNT(*) count FROM ${table} WHERE company_id = ? AND ${column} LIKE ?`).get(companyId, `${prefix}-%`).count;
  return `${prefix}-${String(count + 1).padStart(5, "0")}`;
}

export function autoReserveOrderStock(db, orderId) {
  const order = db.prepare("SELECT * FROM supply_orders WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(orderId);
  if (!order) throw new Error("Supply order not found");
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? AND COALESCE(is_deleted, 0) = 0 AND item_id IS NOT NULL").all(orderId);
  db.prepare("UPDATE stock_reservations SET status = 'Cancelled', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE order_id = ? AND status NOT IN ('Fully Issued','Cancelled')").run(orderId);
  if (!items.length) {
    db.prepare("UPDATE supply_orders SET reservation_status = 'Procurement Required', procurement_required = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(orderId);
    return { order_id: orderId, status: "Procurement Required", reservations: [], message: "No order item lines available for automatic reservation" };
  }
  const reservations = items.map((item) => {
    const warehouseId = item.warehouse_id || db.prepare("SELECT default_warehouse_id FROM items WHERE id = ?").get(item.item_id)?.default_warehouse_id || db.prepare("SELECT id FROM warehouses WHERE status = 'active' ORDER BY id LIMIT 1").get()?.id || null;
    const available = warehouseId ? stockBalance(db, order.company_id, item.item_id, warehouseId).quantity : 0;
    const required = Number(item.quantity || 0);
    const reserved = Math.min(required, Math.max(0, available));
    const short = Math.max(0, required - reserved);
    const status = short <= 0 ? "Fully Available" : reserved > 0 ? "Partially Reserved" : "Procurement Required";
    const info = db.prepare(`
      INSERT INTO stock_reservations (company_id, order_id, order_item_id, item_id, warehouse_id, available_quantity, reserved_quantity, issued_quantity, balance_reserved, short_quantity, procurement_required, procurement_required_quantity, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `).run(order.company_id, orderId, item.id, item.item_id, warehouseId, available, reserved, reserved, short, short > 0 ? 1 : 0, short, status);
    return { id: info.lastInsertRowid, item_id: item.item_id, required_quantity: required, available_quantity: available, reserved_quantity: reserved, short_quantity: short, status };
  });
  const hasShort = reservations.some((row) => row.short_quantity > 0);
  const hasReserved = reservations.some((row) => row.reserved_quantity > 0);
  const status = hasShort ? (hasReserved ? "Partially Reserved" : "Procurement Required") : "Reserved";
  db.prepare("UPDATE supply_orders SET reservation_status = ?, procurement_required = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, hasShort ? 1 : 0, orderId);
  auditLog(db, { company_id: order.company_id, action: "stock_reservation", table_name: "supply_orders", record_id: orderId, new_value: JSON.stringify({ status, reservations }) });
  return { order_id: orderId, status, reservations };
}

export function createDeliveryChallan(db, payload = {}) {
  const companyId = Number(payload.company_id || 0);
  const orderId = Number(payload.order_id || 0);
  if (!companyId || !orderId) throw new Error("Company and order are required");
  const order = db.prepare("SELECT * FROM supply_orders WHERE id = ?").get(orderId);
  if (!order) throw new Error("Supply order not found");
  const lines = Array.isArray(payload.lines) ? payload.lines : [{
    item_id: payload.item_id,
    warehouse_id: payload.warehouse_id,
    quantity: payload.quantity,
    remarks: payload.remarks
  }];
  const validLines = lines.filter((line) => Number(line.item_id || 0) && Number(line.warehouse_id || 0) && Number(line.quantity || 0) > 0);
  if (!validLines.length) throw new Error("At least one delivery item line is required");
  const challanNumber = payload.challan_number || nextDocumentNumber(db, companyId, "delivery_challans", "challan_number", "DC");
  const tx = db.transaction(() => {
    const dc = db.prepare(`
      INSERT INTO delivery_challans (company_id, challan_number, order_id, department_id, dispatch_date, vehicle_details, status, remarks)
      VALUES (?, ?, ?, ?, ?, ?, 'Draft', ?)
    `).run(companyId, challanNumber, orderId, payload.department_id || order.department_id || null, payload.dispatch_date || new Date().toISOString().slice(0, 10), payload.vehicle_details || "", payload.remarks || "");
    validLines.forEach((line) => db.prepare(`
      INSERT INTO delivery_challan_items (company_id, delivery_challan_id, item_id, warehouse_id, quantity, remarks)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(companyId, dc.lastInsertRowid, line.item_id, line.warehouse_id, line.quantity, line.remarks || ""));
    auditLog(db, { company_id: companyId, action: "delivery_challan_created", table_name: "delivery_challans", record_id: dc.lastInsertRowid, new_value: JSON.stringify({ challanNumber, lines: validLines.length }) });
    return db.prepare("SELECT * FROM delivery_challans WHERE id = ?").get(dc.lastInsertRowid);
  });
  return tx();
}

export function confirmDeliveryChallan(db, deliveryChallanId, userId = null) {
  const challan = db.prepare("SELECT * FROM delivery_challans WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(deliveryChallanId);
  if (!challan) throw new Error("Delivery challan not found");
  if (challan.status === "Confirmed") throw new Error("Delivery challan is already confirmed");
  const lines = db.prepare("SELECT * FROM delivery_challan_items WHERE delivery_challan_id = ?").all(deliveryChallanId);
  const tx = db.transaction(() => {
    lines.forEach((line) => {
      const available = stockBalance(db, challan.company_id, line.item_id, line.warehouse_id).quantity;
      if (Number(line.quantity || 0) > available) throw new Error("Delivery quantity exceeds available stock");
      const outward = createRecord(db, "stock_outwards", {
        company_id: challan.company_id,
        order_id: challan.order_id,
        department_id: challan.department_id,
        item_id: line.item_id,
        warehouse_id: line.warehouse_id,
        issue_date: challan.dispatch_date,
        delivery_challan_number: challan.challan_number,
        quantity_issued: line.quantity,
        remarks: line.remarks || `Delivery challan ${challan.challan_number}`
      });
      const posted = postStockOutward(db, outward.id);
      db.prepare("UPDATE delivery_challan_items SET stock_outward_id = ? WHERE id = ?").run(posted.id, line.id);
    });
    db.prepare("UPDATE delivery_challans SET status = 'Confirmed', confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(deliveryChallanId);
    auditLog(db, { company_id: challan.company_id, user_id: userId, action: "delivery_challan_confirmation", table_name: "delivery_challans", record_id: deliveryChallanId, new_value: JSON.stringify({ challan_number: challan.challan_number }) });
  });
  tx();
  return db.prepare("SELECT * FROM delivery_challans WHERE id = ?").get(deliveryChallanId);
}

export function createWarehouseTransfer(db, payload = {}) {
  const companyId = Number(payload.company_id || 0);
  const fromWarehouseId = Number(payload.from_warehouse_id || 0);
  const toWarehouseId = Number(payload.to_warehouse_id || 0);
  const itemId = Number(payload.item_id || 0);
  const quantity = Number(payload.quantity || 0);
  if (!companyId || !fromWarehouseId || !toWarehouseId || !itemId || quantity <= 0) throw new Error("Company, warehouses, item and positive quantity are required");
  if (fromWarehouseId === toWarehouseId) throw new Error("From and To warehouse must be different");
  const available = stockBalance(db, companyId, itemId, fromWarehouseId).quantity;
  if (quantity > available) throw new Error("Transfer quantity exceeds available stock");
  const transferNumber = payload.transfer_number || nextDocumentNumber(db, companyId, "warehouse_transfers", "transfer_number", "WT");
  const result = db.prepare(`
    INSERT INTO warehouse_transfers (company_id, transfer_number, from_warehouse_id, to_warehouse_id, item_id, transfer_date, quantity, rate, reason, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft')
  `).run(companyId, transferNumber, fromWarehouseId, toWarehouseId, itemId, payload.transfer_date || new Date().toISOString().slice(0, 10), quantity, Number(payload.rate || 0), payload.reason || "");
  auditLog(db, { company_id: companyId, action: "warehouse_transfer_created", table_name: "warehouse_transfers", record_id: result.lastInsertRowid, new_value: JSON.stringify({ transferNumber }) });
  return db.prepare("SELECT * FROM warehouse_transfers WHERE id = ?").get(result.lastInsertRowid);
}

export function postWarehouseTransfer(db, transferId, userId = null) {
  const transfer = db.prepare("SELECT * FROM warehouse_transfers WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(transferId);
  if (!transfer) throw new Error("Warehouse transfer not found");
  if (transfer.status === "Posted") throw new Error("Warehouse transfer already posted");
  const available = stockBalance(db, transfer.company_id, transfer.item_id, transfer.from_warehouse_id).quantity;
  if (Number(transfer.quantity || 0) > available) throw new Error("Transfer quantity exceeds available stock");
  const rate = Number(transfer.rate || 0) || weightedAverageCost(db, transfer.company_id, transfer.item_id, transfer.from_warehouse_id);
  const value = Number(transfer.quantity || 0) * rate;
  const tx = db.transaction(() => {
    insertStockLedger(db, {
      company_id: transfer.company_id,
      item_id: transfer.item_id,
      warehouse_id: transfer.from_warehouse_id,
      transaction_date: transfer.transfer_date,
      document_number: transfer.transfer_number,
      transaction_type: "Transfer Out",
      inward_quantity: 0,
      outward_quantity: transfer.quantity,
      rate,
      value,
      source_module: "warehouse_transfers",
      source_id: transfer.id,
      remarks: transfer.reason || "Warehouse transfer"
    });
    insertStockLedger(db, {
      company_id: transfer.company_id,
      item_id: transfer.item_id,
      warehouse_id: transfer.to_warehouse_id,
      transaction_date: transfer.transfer_date,
      document_number: transfer.transfer_number,
      transaction_type: "Transfer In",
      inward_quantity: transfer.quantity,
      outward_quantity: 0,
      rate,
      value,
      source_module: "warehouse_transfers",
      source_id: transfer.id,
      remarks: transfer.reason || "Warehouse transfer"
    });
    db.prepare("UPDATE warehouse_transfers SET status = 'Posted', posted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(transfer.id);
    auditLog(db, { company_id: transfer.company_id, user_id: userId, action: "warehouse_transfer_posted", table_name: "warehouse_transfers", record_id: transfer.id, new_value: JSON.stringify({ transfer_number: transfer.transfer_number, quantity: transfer.quantity }) });
  });
  tx();
  return db.prepare("SELECT * FROM warehouse_transfers WHERE id = ?").get(transfer.id);
}

function businessVoucherPayload(db, companyId, voucherKind, payload) {
  const kind = voucherKind.toLowerCase().replaceAll(" ", "_");
  const date = payload.voucher_date;
  const bankAccount = accountId(db, companyId, payload.payment_mode === "Cash" ? "Cash" : "Bank");
  const referenceText = payload.reference_number || payload.manual_order_number || "";
  const narration = payload.narration || `${voucherKind} ${referenceText}`.trim();
  const amount = Number(payload.amount || payload.amount_received || payload.amount_paid || payload.expense_amount || payload.total_invoice_value || payload.taxable_value || 0);
  const tds = Number(payload.tds_deducted || 0);
  const gstTds = Number(payload.gst_tds_deducted || 0);
  const otherDeduction = Number(payload.other_deduction || payload.other_deductions || 0);

  if (["receipt", "receipt_voucher", "customer_receipt", "advance_receipt"].includes(kind)) {
    const grossCredit = amount + tds + gstTds + otherDeduction;
    assertPositive(grossCredit, "Receipt amount");
    const lines = [
      { account_id: bankAccount, debit: amount, credit: 0 },
      { account_id: accountId(db, companyId, "TDS Receivable"), debit: tds, credit: 0 },
      { account_id: accountId(db, companyId, "GST TDS Receivable"), debit: gstTds, credit: 0 },
      { account_id: accountId(db, companyId, "Other Deduction Ledger"), debit: otherDeduction, credit: 0 },
      { account_id: accountId(db, companyId, "Trade Receivables"), debit: 0, credit: grossCredit, linked_party_type: "department", linked_party_id: payload.department_id || null }
    ].filter((line) => Number(line.debit || 0) || Number(line.credit || 0));
    return { company_id: companyId, voucher_date: date, voucher_type: "Receipt", narration, source_module: "business_voucher", source_id: null, lines, cashBankLine: lines[0] };
  }

  if (["supplier_payment", "payment", "payment_voucher"].includes(kind)) {
    assertPositive(amount, "Payment amount");
    const lines = [
      { account_id: accountId(db, companyId, "Trade Payables"), debit: amount, credit: 0, linked_party_type: "supplier", linked_party_id: payload.supplier_id || null },
      { account_id: bankAccount, debit: 0, credit: amount }
    ];
    return { company_id: companyId, voucher_date: date, voucher_type: "Payment", narration, source_module: "business_voucher", source_id: null, lines, cashBankLine: lines[1] };
  }

  if (["sales", "sales_voucher"].includes(kind)) {
    const taxable = Number(payload.taxable_value || payload.billing_value || 0);
    const outputGst = Number(payload.output_gst || payload.gst_amount || taxable * Number(payload.gst_rate || 0) / 100);
    const gross = Number(payload.total_invoice_value || taxable + outputGst);
    assertPositive(gross, "Sales voucher amount");
    return {
      company_id: companyId,
      voucher_date: date,
      voucher_type: "Sales",
      narration: payload.narration || `Sales invoice ${payload.invoice_number || payload.manual_order_number || ""}`.trim(),
      source_module: "business_voucher",
      source_id: null,
      lines: [
        { account_id: accountId(db, companyId, "Trade Receivables"), debit: gross, credit: 0, linked_party_type: "department", linked_party_id: payload.department_id || null },
        { account_id: accountId(db, companyId, "Sales"), debit: 0, credit: taxable },
        { account_id: accountId(db, companyId, "Output GST"), debit: 0, credit: outputGst }
      ].filter((line) => Number(line.debit || 0) || Number(line.credit || 0))
    };
  }

  if (["purchase", "purchase_voucher"].includes(kind)) {
    const taxable = Number(payload.taxable_value || payload.purchase_value || 0);
    const inputGst = Number(payload.input_gst || payload.gst_amount || payload.purchase_gst || 0);
    const gross = taxable + inputGst;
    assertPositive(gross, "Purchase voucher amount");
    const inventoryAccount = payload.inventory_enabled === false || payload.inventory_enabled === "0" ? "Purchase" : "Inventory";
    return {
      company_id: companyId,
      voucher_date: date,
      voucher_type: "Purchase",
      narration: payload.narration || `Purchase invoice ${payload.purchase_invoice_number || payload.manual_order_number || ""}`.trim(),
      source_module: "business_voucher",
      source_id: null,
      lines: [
        { account_id: accountId(db, companyId, inventoryAccount), debit: taxable, credit: 0 },
        { account_id: accountId(db, companyId, "Input GST"), debit: inputGst, credit: 0 },
        { account_id: accountId(db, companyId, "Trade Payables"), debit: 0, credit: gross, linked_party_type: "supplier", linked_party_id: payload.supplier_id || null }
      ].filter((line) => Number(line.debit || 0) || Number(line.credit || 0))
    };
  }

  if (["expense", "expense_voucher", "commission", "commission_voucher"].includes(kind)) {
    const billingValue = Number(payload.billing_value || 0);
    const calculated = kind.includes("commission") ? billingValue * Number(payload.commission_percentage || payload.percentage || 0) / 100 : amount || Number(payload.fixed_amount || 0);
    const expenseAmount = Number(payload.commission_amount || payload.expense_amount || calculated || 0);
    assertPositive(expenseAmount, "Expense amount");
    const accountName = kind.includes("commission") ? "Work Incentive Expense" : expenseLedgerForName(payload.expense_head_name || payload.expense_type || "Miscellaneous");
    const paid = ["paid", "yes", "true", true].includes(payload.paid_status || payload.paid);
    const creditAccount = paid ? bankAccount : accountId(db, companyId, "Expense Payable");
    const lines = [
      { account_id: accountId(db, companyId, accountName), debit: expenseAmount, credit: 0 },
      { account_id: creditAccount, debit: 0, credit: expenseAmount }
    ];
    return { company_id: companyId, voucher_date: date, voucher_type: paid ? "Payment" : "Journal", narration, source_module: "business_voucher", source_id: null, lines, cashBankLine: paid ? lines[1] : null };
  }

  if (["employee_incentive", "employee_incentive_voucher"].includes(kind)) {
    const incentiveAmount = Number(payload.incentive_amount || (Number(payload.initial_profit || 0) * Number(payload.incentive_percentage || 0) / 100));
    assertPositive(incentiveAmount, "Employee incentive amount");
    const paid = ["paid", "yes", "true", true].includes(payload.paid_status || payload.paid);
    const creditAccount = paid ? bankAccount : accountId(db, companyId, "Employee Incentive Payable");
    const lines = [
      { account_id: accountId(db, companyId, "Employee Incentive Expense"), debit: incentiveAmount, credit: 0, linked_party_type: "employee", linked_party_id: payload.employee_id || null },
      { account_id: creditAccount, debit: 0, credit: incentiveAmount, linked_party_type: paid ? null : "employee", linked_party_id: paid ? null : payload.employee_id || null }
    ];
    return { company_id: companyId, voucher_date: date, voucher_type: paid ? "Payment" : "Journal", narration, source_module: "business_voucher", source_id: null, lines, cashBankLine: paid ? lines[1] : null };
  }

  if (["contra", "contra_voucher"].includes(kind)) {
    const fromAccount = Number(payload.from_account_id || 0);
    const toAccount = Number(payload.to_account_id || 0);
    assertPositive(amount, "Contra amount");
    if (!fromAccount || !toAccount || fromAccount === toAccount) throw new Error("Select different cash/bank accounts for contra");
    return {
      company_id: companyId,
      voucher_date: date,
      voucher_type: "Contra",
      narration,
      source_module: "business_voucher",
      source_id: null,
      lines: [
        { account_id: toAccount, debit: amount, credit: 0 },
        { account_id: fromAccount, debit: 0, credit: amount }
      ]
    };
  }

  if (["credit_note", "debit_note"].includes(kind)) {
    const taxable = Number(payload.taxable_value || 0);
    const gst = Number(payload.gst_amount || taxable * Number(payload.gst_rate || 0) / 100);
    const gross = taxable + gst;
    assertPositive(gross, "Note amount");
    const isCredit = kind === "credit_note";
    return {
      company_id: companyId,
      voucher_date: date,
      voucher_type: isCredit ? "Credit Note" : "Debit Note",
      narration: payload.narration || `${isCredit ? "Credit" : "Debit"} note ${payload.reason || ""}`.trim(),
      source_module: "business_voucher",
      source_id: null,
      lines: isCredit ? [
        { account_id: accountId(db, companyId, "Sales"), debit: taxable, credit: 0 },
        { account_id: accountId(db, companyId, "Output GST"), debit: gst, credit: 0 },
        { account_id: accountId(db, companyId, "Trade Receivables"), debit: 0, credit: gross, linked_party_type: "department", linked_party_id: payload.department_id || null }
      ] : [
        { account_id: accountId(db, companyId, "Trade Payables"), debit: gross, credit: 0, linked_party_type: "supplier", linked_party_id: payload.supplier_id || null },
        { account_id: accountId(db, companyId, "Purchase"), debit: 0, credit: taxable },
        { account_id: accountId(db, companyId, "Input GST"), debit: 0, credit: gst }
      ]
    };
  }

  if (["journal", "journal_voucher"].includes(kind)) {
    return {
      company_id: companyId,
      voucher_number: payload.voucher_number || null,
      voucher_date: date,
      voucher_type: "Journal",
      narration,
      source_module: "business_voucher",
      source_id: null,
      lines: (payload.lines || []).map((line) => ({ ...line, account_id: Number(line.account_id), debit: Number(line.debit || 0), credit: Number(line.credit || 0) }))
    };
  }

  throw new Error(`Unsupported business voucher workflow: ${voucherKind}`);
}

function expenseLedgerForName(name = "") {
  if (/authorization/i.test(name)) return "Authorization Expense";
  if (/\bl1\b|l1 expense/i.test(name)) return "L1 Expense";
  if (/transport|freight/i.test(name)) return "Transport Expense";
  if (/install/i.test(name)) return "Installation Expense";
  if (/commission|work incentive/i.test(name)) return "Work Incentive Expense";
  if (/bank/i.test(name)) return "Bank Charges";
  return "Work Incentive Expense";
}

function postLedgerEntry(db, companyId, voucherId, voucherLineId, accountIdValue, entryDate, debit, credit, sourceModule, sourceId) {
  const ledgerActiveWhere = activeRowClause(db, "ledger_entries");
  const previous = db.prepare(`SELECT running_balance FROM ledger_entries WHERE company_id = ? AND account_id = ?${ledgerActiveWhere} ORDER BY id DESC LIMIT 1`).get(companyId, accountIdValue);
  const account = db.prepare("SELECT normal_balance FROM accounts WHERE id = ?").get(accountIdValue);
  const delta = account?.normal_balance === "Credit" ? credit - debit : debit - credit;
  const running = Number(previous?.running_balance || 0) + delta;
  db.prepare(`
    INSERT INTO ledger_entries (company_id, voucher_id, voucher_line_id, account_id, entry_date, debit, credit, running_balance, source_module, source_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(companyId, voucherId, voucherLineId, accountIdValue, entryDate, debit, credit, running, sourceModule, sourceId);
}

function updateCashBankLedger(db, { company_id, bank_account_id, transaction_date, transaction_type, source_module, source_id, voucher_id, debit = 0, credit = 0, payment_mode, utr_number, remarks }) {
  const cashBankActiveWhere = activeRowClause(db, "cash_bank_ledger");
  const existing = db.prepare(`
    SELECT id FROM cash_bank_ledger
    WHERE company_id = ?
      AND COALESCE(bank_account_id, 0) = COALESCE(?, 0)
      AND COALESCE(voucher_id, 0) = COALESCE(?, 0)
      AND COALESCE(source_module, '') = COALESCE(?, '')
      AND COALESCE(source_id, 0) = COALESCE(?, 0)
      AND ROUND(COALESCE(debit, 0), 2) = ROUND(?, 2)
      AND ROUND(COALESCE(credit, 0), 2) = ROUND(?, 2)
      ${cashBankActiveWhere}
    LIMIT 1
  `).get(company_id, bank_account_id || null, voucher_id || null, source_module || "", source_id || null, Number(debit || 0), Number(credit || 0));
  if (existing) return existing.id;
  const previous = db.prepare(`SELECT balance FROM cash_bank_ledger WHERE company_id = ? AND COALESCE(bank_account_id, 0) = COALESCE(?, 0)${cashBankActiveWhere} ORDER BY id DESC LIMIT 1`).get(company_id, bank_account_id);
  const balance = Number(previous?.balance || 0) + Number(debit || 0) - Number(credit || 0);
  const result = db.prepare(`
    INSERT INTO cash_bank_ledger (company_id, bank_account_id, transaction_date, transaction_type, source_module, source_id, voucher_id, debit, credit, balance, payment_mode, utr_number, remarks)
    VALUES (@company_id, @bank_account_id, @transaction_date, @transaction_type, @source_module, @source_id, @voucher_id, @debit, @credit, @balance, @payment_mode, @utr_number, @remarks)
  `).run({ company_id, bank_account_id, transaction_date, transaction_type, source_module, source_id, voucher_id, debit, credit, balance, payment_mode, utr_number, remarks });
  return result.lastInsertRowid;
}

function auditVoucherDependencySync(db, voucher, effects = []) {
  auditLog(db, {
    company_id: voucher.company_id,
    action: "voucher dependency sync",
    module: "accounting",
    table_name: "vouchers",
    record_id: voucher.id,
    new_value: JSON.stringify({
      voucher_number: voucher.voucher_number,
      voucher_type: voucher.voucher_type,
      source_module: voucher.source_module,
      source_id: voucher.source_id,
      effects
    })
  });
}

function transactionDateFor(table, data) {
  if (table === "invoices") return data.invoice_date;
  if (table === "procurements") return data.purchase_date;
  if (table === "payments") return data.payment_date;
  if (table === "stock_inwards") return data.inward_date;
  if (table === "stock_outwards") return data.issue_date;
  if (table === "stock_adjustments") return data.adjustment_date;
  if (table === "stock_returns") return data.return_date;
  return new Date().toISOString().slice(0, 10);
}

function financialYearForDate(db, companyId, date) {
  if (!companyId || !date) return null;
  return db.prepare(`
    SELECT * FROM financial_years
    WHERE company_id = ? AND start_date <= ? AND end_date >= ?
    ORDER BY start_date DESC LIMIT 1
  `).get(companyId, date, date);
}

function assertOpenFinancialYear(db, companyId, date) {
  let year = financialYearForDate(db, companyId, date);
  if (!year) {
    seedFinancialYears(db);
    year = financialYearForDate(db, companyId, date);
  }
  if (!year) throw new Error("Financial year is not configured for this date");
  if (year.status === "Closed" || year.status === "Locked") {
    throw new Error(`Cannot post to ${year.status.toLowerCase()} financial year ${year.financial_year_name}`);
  }
  return year;
}

function assertTransactionYearOpen(db, table, data) {
  const companyId = Number(data.company_id || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || 0);
  const date = transactionDateFor(table, data);
  if (!companyId || !date) return null;
  return assertOpenFinancialYear(db, companyId, date);
}

function markPosted(db, table, id, voucherId, postingDate) {
  const year = db.prepare("SELECT financial_year_id FROM vouchers WHERE id = ?").get(voucherId);
  const fields = ["posting_status = 'Posted'", "approval_status = 'Approved'", "posting_error = NULL", "posted_at = CURRENT_TIMESTAMP", "locked_at = CURRENT_TIMESTAMP"];
  if (year?.financial_year_id) fields.push(`financial_year_id = ${Number(year.financial_year_id)}`);
  if (table === "expense_entries") fields.push(`voucher_id = ${Number(voucherId)}`);
  if (table === "invoices") fields.push("invoice_status = 'Posted'");
  db.prepare(`UPDATE ${table} SET ${fields.join(", ")} WHERE id = ?`).run(id);
  auditLog(db, { action: "posting status update", table_name: table, record_id: id, new_value: JSON.stringify({ posting_status: "Posted", voucher_id: voucherId, postingDate }) });
}

function markPostingError(db, table, id, error) {
  db.prepare(`UPDATE ${table} SET posting_status = 'Error', posting_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(String(error?.message || error), id);
}

export function submitForApproval(db, moduleName, recordId, makerId = null) {
  const table = moduleTable(moduleName);
  const record = getRecord(db, table, recordId);
  if (!record) throw new Error("Record not found");
  if (["Posted", "Reversed"].includes(record.posting_status)) throw new Error("Posted records do not need approval");
  db.prepare(`UPDATE ${table} SET approval_status = 'Pending Approval', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(recordId);
  db.prepare(`
    INSERT INTO approval_queue (company_id, module_name, record_id, approval_status, maker_id, submitted_at)
    VALUES (?, ?, ?, 'Pending Approval', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(module_name, record_id) DO UPDATE SET
      approval_status = 'Pending Approval',
      maker_id = excluded.maker_id,
      submitted_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `).run(record.company_id, table, recordId, makerId);
  auditLog(db, { company_id: record.company_id, user_id: makerId, action: "approval submit", table_name: table, record_id: recordId });
  return getRecord(db, table, recordId);
}

export function approveTransaction(db, moduleName, recordId, checkerId = null, remarks = "") {
  const table = moduleTable(moduleName);
  const record = getRecord(db, table, recordId);
  if (!record) throw new Error("Record not found");
  db.prepare(`UPDATE ${table} SET approval_status = 'Approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(checkerId, recordId);
  db.prepare(`
    INSERT INTO approval_queue (company_id, module_name, record_id, approval_status, checker_id, approved_at, remarks)
    VALUES (?, ?, ?, 'Approved', ?, CURRENT_TIMESTAMP, ?)
    ON CONFLICT(module_name, record_id) DO UPDATE SET
      approval_status = 'Approved',
      checker_id = excluded.checker_id,
      approved_at = CURRENT_TIMESTAMP,
      remarks = excluded.remarks,
      updated_at = CURRENT_TIMESTAMP
  `).run(record.company_id, table, recordId, checkerId, remarks);
  auditLog(db, { company_id: record.company_id, user_id: checkerId, action: "approval approved", table_name: table, record_id: recordId, new_value: remarks });
  return getRecord(db, table, recordId);
}

export function postBusinessTransaction(db, moduleName, recordId) {
  const table = moduleTable(moduleName);
  if (table === "invoices") return postSalesVoucher(db, recordId);
  if (table === "procurements") return postPurchaseVoucher(db, recordId);
  if (table === "payments") {
    const payment = getRecord(db, "payments", recordId);
    const invoice = db.prepare("SELECT id FROM invoices WHERE order_id = ? AND is_deleted = 0 ORDER BY invoice_date, id LIMIT 1").get(payment?.order_id);
    if (!invoice) throw new Error("No invoice available for payment allocation");
    return postReceiptVoucher(db, recordId, invoice.id);
  }
  if (table === "expense_entries") {
    const expense = getRecord(db, "expense_entries", recordId);
    postExpenseAccrualsForOrder(db, expense.order_id);
    return db.prepare("SELECT * FROM vouchers WHERE id = (SELECT voucher_id FROM expense_entries WHERE id = ?)").get(recordId);
  }
  throw new Error("Posting is not available for this module yet");
}

function moduleTable(moduleName) {
  const normalized = String(moduleName || "").toLowerCase();
  const aliases = {
    billing: "invoices",
    sales: "invoices",
    invoice: "invoices",
    invoices: "invoices",
    procurement: "procurements",
    purchase: "procurements",
    procurements: "procurements",
    receipt: "payments",
    payment: "payments",
    payments: "payments",
    expense: "expense_entries",
    expenses: "expense_entries",
    expense_entries: "expense_entries"
  };
  const table = aliases[normalized];
  if (!table) throw new Error("Unsupported module");
  return table;
}

export function drilldownData(db, payload = {}) {
  const companyId = Number(payload.company_id || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || 0);
  const dateFrom = payload.date_from || "1900-01-01";
  const dateTo = payload.date_to || "2999-12-31";
  const accountIdValue = Number(payload.account_id || 0);
  const voucherId = Number(payload.voucher_id || 0);
  const sourceModule = payload.source_module || null;
  const sourceId = Number(payload.source_id || 0);
  const ledgerActiveWhere = activeRowClause(db, "ledger_entries", "le");

  const ledger = accountIdValue ? db.prepare(`
    SELECT le.*, a.account_name, a.account_code, v.voucher_number, v.voucher_type, v.narration, v.source_module, v.source_id
    FROM ledger_entries le
    JOIN accounts a ON a.id = le.account_id
    JOIN vouchers v ON v.id = le.voucher_id
    WHERE le.company_id = ? AND le.account_id = ? AND le.entry_date BETWEEN ? AND ? AND v.is_deleted = 0${ledgerActiveWhere}
    ORDER BY le.entry_date, le.id
  `).all(companyId, accountIdValue, dateFrom, dateTo) : [];

  const voucher = voucherId ? voucherDetail(db, voucherId) : null;
  const source = sourceModule && sourceId ? sourceTransactionDetail(db, sourceModule, sourceId) : voucher?.header?.source_module && voucher?.header?.source_id ? sourceTransactionDetail(db, voucher.header.source_module, voucher.header.source_id) : null;
  if (voucherId) auditLog(db, { company_id: companyId, action: "voucher drilldown access", table_name: "vouchers", record_id: voucherId });
  return { ledger, voucher, source };
}

function voucherDetail(db, voucherId) {
  const header = db.prepare(`
    SELECT v.*, c.company_name, fy.financial_year_name
    FROM vouchers v
    JOIN companies c ON c.id = v.company_id
    LEFT JOIN financial_years fy ON fy.id = v.financial_year_id
    WHERE v.id = ? AND v.is_deleted = 0
  `).get(voucherId);
  if (!header) return null;
  const lines = db.prepare(`
    SELECT vl.*, a.account_code, a.account_name, a.account_type
    FROM voucher_lines vl
    JOIN accounts a ON a.id = vl.account_id
    WHERE vl.voucher_id = ?
    ORDER BY vl.id
  `).all(voucherId);
  const audit = db.prepare("SELECT * FROM audit_log WHERE table_name = 'vouchers' AND record_id = ? ORDER BY id DESC").all(voucherId);
  return { header, lines, audit };
}

function sourceTransactionDetail(db, sourceModule, sourceId) {
  const moduleName = String(sourceModule || "");
  const sourceMap = {
    billing: ["invoices", "id"],
    procurement: ["procurements", "id"],
    payment: ["payments", "id"],
    supplier_payment: ["supplier_payments", "id"],
    expense: ["expense_entries", "id"],
    manual_voucher: ["vouchers", "id"],
    opening_balance: ["opening_balances", "voucher_id"],
    voucher_reversal: ["vouchers", "id"],
    stock_inwards: ["stock_inwards", "id"],
    stock_outwards: ["stock_outwards", "id"],
    stock_adjustments: ["stock_adjustments", "id"],
    stock_returns: ["stock_returns", "id"],
    warehouse_transfers: ["warehouse_transfers", "id"],
    guided_vouchers: ["guided_vouchers", "id"],
    delivery_challan: ["delivery_challans", "id"],
    goods_receipt: ["goods_receipts", "id"],
    procurement_items: ["procurement_items", "id"],
    invoice_items: ["invoice_items", "id"]
  };
  const map = sourceMap[moduleName];
  if (!map) return { source_module: moduleName, source_id: sourceId, message: "Source viewer not configured for this module" };
  const [table, key] = map;
  const record = db.prepare(`SELECT * FROM ${table} WHERE ${key} = ?`).get(sourceId);
  if (!record) return { source_module: moduleName, source_id: sourceId, message: "Source transaction not found" };
  const order = record.order_id ? db.prepare("SELECT * FROM supply_orders WHERE id = ?").get(record.order_id) : null;
  const documents = db.prepare("SELECT * FROM documents WHERE linked_module = ? AND linked_record_id = ? AND status = 'active' ORDER BY uploaded_at DESC").all(table, record.id || sourceId);
  const linkedVoucher = db.prepare("SELECT * FROM vouchers WHERE source_module = ? AND source_id = ? AND is_deleted = 0 ORDER BY id DESC LIMIT 1").get(moduleName, sourceId);
  return { source_module: moduleName, table, record, order, documents, linkedVoucher };
}

function createSupplierPayment(db, payload) {
  const existing = payload.utr_number ? db.prepare("SELECT * FROM supplier_payments WHERE utr_number = ?").get(payload.utr_number) : null;
  if (existing) return existing;
  assertPositive(payload.amount_paid, "Supplier payment");
  const result = db.prepare(`
    INSERT INTO supplier_payments (company_id, supplier_id, payment_date, bank_account_id, payment_mode, utr_number, amount_paid, remarks)
    VALUES (@company_id, @supplier_id, @payment_date, @bank_account_id, @payment_mode, @utr_number, @amount_paid, @remarks)
  `).run(payload);
  const payment = db.prepare("SELECT * FROM supplier_payments WHERE id = ?").get(result.lastInsertRowid);
  const voucher = postSupplierPaymentVoucher(db, payment.id);
  db.prepare("UPDATE supplier_payments SET voucher_id = ? WHERE id = ?").run(voucher.id, payment.id);
  return db.prepare("SELECT * FROM supplier_payments WHERE id = ?").get(payment.id);
}

function allocateSupplierPayment(db, supplierPaymentId, procurementId, amount) {
  const payment = db.prepare("SELECT * FROM supplier_payments WHERE id = ?").get(supplierPaymentId);
  const exists = db.prepare("SELECT id FROM supplier_payment_allocations WHERE supplier_payment_id = ? AND procurement_id = ?").get(supplierPaymentId, procurementId);
  if (exists) return exists;
  return db.prepare(`
    INSERT INTO supplier_payment_allocations (company_id, supplier_payment_id, procurement_id, allocated_amount, remarks)
    VALUES (?, ?, ?, ?, ?)
  `).run(payment.company_id, supplierPaymentId, procurementId, amount, "Auto allocation");
}



function receiptUnallocatedAmount(db, paymentId) {
  const payment = getRecord(db, "payments", paymentId);
  if (!payment) return 0;
  const allocated = db.prepare(`
    SELECT COALESCE(SUM(allocated_amount), 0) value
    FROM payment_allocations
    WHERE payment_id = ? AND COALESCE(is_deleted, 0) = 0
  `).get(paymentId).value;
  const advances = db.prepare(`
    SELECT COALESCE(SUM(balance_advance), 0) value
    FROM advance_receipts
    WHERE payment_id = ? AND COALESCE(is_deleted, 0) = 0
  `).get(paymentId).value;
  return Number(payment.payment_amount || 0) - Number(allocated || 0) - Number(advances || 0);
}

function supplierPaymentUnallocatedAmount(db, supplierPaymentId) {
  const payment = db.prepare("SELECT * FROM supplier_payments WHERE id = ?").get(supplierPaymentId);
  if (!payment) return 0;
  const allocated = db.prepare(`
    SELECT COALESCE(SUM(allocated_amount), 0) value
    FROM supplier_payment_allocations
    WHERE supplier_payment_id = ? AND COALESCE(is_deleted, 0) = 0
  `).get(supplierPaymentId).value;
  const advances = db.prepare(`
    SELECT COALESCE(SUM(balance_advance), 0) value
    FROM supplier_advances
    WHERE supplier_payment_id = ? AND COALESCE(is_deleted, 0) = 0
  `).get(supplierPaymentId).value;
  return Number(payment.amount_paid || 0) - Number(allocated || 0) - Number(advances || 0);
}

function purchaseOutstandingAmount(db, procurementId) {
  const row = db.prepare(`
    SELECT p.id, COALESCE(SUM(pi.gross_value), p.purchase_value + p.purchase_gst) invoice_amount,
      COALESCE((SELECT SUM(spa.allocated_amount) FROM supplier_payment_allocations spa WHERE spa.procurement_id = p.id AND COALESCE(spa.is_deleted, 0) = 0), 0) amount_paid
    FROM procurements p
    LEFT JOIN procurement_items pi ON pi.procurement_id = p.id AND pi.is_deleted = 0
    WHERE p.id = ?
    GROUP BY p.id
  `).get(procurementId);
  return Number(row?.invoice_amount || 0) - Number(row?.amount_paid || 0) - supplierAdvanceAdjustedForProcurement(db, procurementId);
}

function receiptAdvanceAdjustedForBilling(db, billingId) {
  return Number(db.prepare(`
    SELECT COALESCE(SUM(adjusted_amount), 0) value
    FROM advance_adjustments
    WHERE adjustment_type = 'receipt' AND billing_id = ? AND COALESCE(is_deleted, 0) = 0 AND status = 'Active'
  `).get(billingId).value || 0);
}

function supplierAdvanceAdjustedForProcurement(db, procurementId) {
  return Number(db.prepare(`
    SELECT COALESCE(SUM(adjusted_amount), 0) value
    FROM advance_adjustments
    WHERE adjustment_type = 'supplier' AND procurement_id = ? AND COALESCE(is_deleted, 0) = 0 AND status = 'Active'
  `).get(procurementId).value || 0);
}

function receivableOutstandingBeforeAdjustment(db, billingId) {
  const receivable = db.prepare("SELECT * FROM receivables WHERE billing_id = ? AND COALESCE(is_deleted, 0) = 0").get(billingId);
  if (!receivable) return 0;
  const allocation = db.prepare(`
    SELECT COALESCE(SUM(allocated_amount + tds_deducted + gst_tds_deducted + other_deductions), 0) value
    FROM payment_allocations WHERE billing_id = ? AND COALESCE(is_deleted, 0) = 0
  `).get(billingId).value;
  return Number(receivable.invoice_amount || 0) - Number(allocation || 0) - receiptAdvanceAdjustedForBilling(db, billingId);
}

function partyControlAccount(db, companyId, partyType) {
  if (partyType === "department") return accountId(db, companyId, "Trade Receivables");
  if (partyType === "supplier") return accountId(db, companyId, "Trade Payables");
  if (partyType === "employee") return accountId(db, companyId, "Employee Incentive Payable");
  return accountId(db, companyId, "Expense Payable");
}

function allocationAudit(db, companyId, allocationType, allocationId, action, oldValue, newValue, reason, userId = null) {
  db.prepare(`
    INSERT INTO allocation_audit (company_id, allocation_type, allocation_id, action, old_value, new_value, reason, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(companyId, allocationType, allocationId || null, action, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null, reason || "", userId);
  auditLog(db, { company_id: companyId, user_id: userId, action: `allocation ${action}`, table_name: "allocation_audit", record_id: allocationId || null, old_value: oldValue ? JSON.stringify(oldValue) : null, new_value: newValue ? JSON.stringify(newValue) : null });
}

function creditDueDate(db, companyId, partyType, partyId, baseDate, explicitDueDate = null) {
  if (explicitDueDate) return explicitDueDate;
  const term = db.prepare(`
    SELECT * FROM credit_terms
    WHERE company_id = ? AND party_type = ? AND party_id = ? AND status = 'active' AND COALESCE(is_deleted, 0) = 0
  `).get(companyId, partyType, partyId);
  const days = Number(term?.default_credit_days ?? 30) + Number(term?.grace_period ?? 0);
  const date = new Date(`${baseDate || new Date().toISOString().slice(0, 10)}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function postExpenseAccrualsForOrder(db, orderId) {
  const expenses = db.prepare(`
    SELECT ee.*, eh.expense_head_name
    FROM expense_entries ee
    JOIN expense_heads eh ON eh.id = ee.expense_head_id
    WHERE ee.order_id = ? AND COALESCE(ee.voucher_id, 0) = 0 AND ee.is_deleted = 0
  `).all(orderId);
  expenses.forEach((expense) => {
    const orderProfit = calculateProfitability(db, db.prepare("SELECT so.*, e.incentive_percentage FROM supply_orders so LEFT JOIN employees e ON e.id = so.employee_id WHERE so.id = ?").get(orderId));
    const calculated = orderProfit.dynamicExpenses.find((row) => row.id === expense.id);
    const amount = Number(expense.expense_amount || 0) || Number(calculated?.amount || 0);
    if (amount <= 0) return;
    const accountName = expense.expense_head_name.includes("Authorization") ? "Authorization Expense" :
      expense.expense_head_name.includes("L1") ? "L1 Expense" :
      /Commission|Work Incentive/i.test(expense.expense_head_name) ? "Work Incentive Expense" :
      expense.expense_head_name.includes("Transport") ? "Transport Expense" :
      expense.expense_head_name.includes("Installation") ? "Installation Expense" : "Work Incentive Expense";
    const voucher = createBalancedVoucher(db, {
      company_id: expense.company_id,
      voucher_date: new Date().toISOString().slice(0, 10),
      voucher_type: "Journal",
      narration: `Expense accrual ${expense.expense_head_name}`,
      source_module: "expense",
      source_id: expense.id,
      lines: [
        { account_id: accountId(db, expense.company_id, accountName), debit: amount, credit: 0 },
        { account_id: accountId(db, expense.company_id, "Expense Payable"), debit: 0, credit: amount }
      ]
    });
    db.prepare("UPDATE expense_entries SET expense_amount = ?, balance_amount = ? WHERE id = ?").run(amount, amount, expense.id);
    markPosted(db, "expense_entries", expense.id, voucher.id, new Date().toISOString().slice(0, 10));
  });
}

function upsertReceivable(db, invoice, invoiceAmount) {
  const order = db.prepare("SELECT department_id FROM supply_orders WHERE id = ?").get(invoice.order_id);
  const dueDate = creditDueDate(db, invoice.company_id, "department", order?.department_id, invoice.invoice_date, invoice.due_date);
  db.prepare(`
    INSERT INTO receivables (company_id, billing_id, order_id, department_id, invoice_number, invoice_date, invoice_amount, balance_outstanding, due_date, days_outstanding, status)
    VALUES (@company_id, @billing_id, @order_id, @department_id, @invoice_number, @invoice_date, @invoice_amount, @balance_outstanding, @due_date, @days_outstanding, 'Open')
    ON CONFLICT(company_id, billing_id) DO UPDATE SET
      invoice_amount = excluded.invoice_amount,
      balance_outstanding = excluded.balance_outstanding,
      updated_at = CURRENT_TIMESTAMP
  `).run({
    company_id: invoice.company_id,
    billing_id: invoice.id,
    order_id: invoice.order_id,
    department_id: order?.department_id || null,
    invoice_number: invoice.invoice_number,
    invoice_date: invoice.invoice_date,
    invoice_amount: invoiceAmount,
    balance_outstanding: invoiceAmount,
    due_date: dueDate,
    days_outstanding: daysBetween(invoice.invoice_date, new Date().toISOString().slice(0, 10))
  });
  refreshReceivable(db, invoice.id);
}

function refreshReceivable(db, billingId) {
  const receivable = db.prepare("SELECT * FROM receivables WHERE billing_id = ?").get(billingId);
  if (!receivable) return;
  const allocation = db.prepare(`
    SELECT COALESCE(SUM(allocated_amount), 0) amount_received,
           COALESCE(SUM(tds_deducted), 0) tds,
           COALESCE(SUM(gst_tds_deducted), 0) gst_tds,
           COALESCE(SUM(other_deductions), 0) other_deductions
    FROM payment_allocations WHERE billing_id = ? AND COALESCE(is_deleted, 0) = 0
  `).get(billingId);
  const advanceAdjusted = receiptAdvanceAdjustedForBilling(db, billingId);
  const settled = allocation.amount_received + allocation.tds + allocation.gst_tds + allocation.other_deductions + advanceAdjusted;
  const balance = Number(receivable.invoice_amount || 0) - settled;
  db.prepare(`
    UPDATE receivables SET amount_received = ?, tds_deducted = ?, gst_tds_deducted = ?, other_deductions = ?,
      balance_outstanding = ?, days_outstanding = ?, status = ?, allocation_status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(allocation.amount_received + advanceAdjusted, allocation.tds, allocation.gst_tds, allocation.other_deductions, balance, daysBetween(receivable.invoice_date, new Date().toISOString().slice(0, 10)), balance <= 0 ? "Closed" : "Open", allocationStatus(settled, receivable.invoice_amount), receivable.id);
}

function allocationStatus(settled, total) {
  const amount = Number(settled || 0);
  const value = Number(total || 0);
  if (amount <= 0) return "Unallocated";
  if (amount < value) return "Partially Allocated";
  if (amount === value) return "Fully Allocated";
  return "Excess";
}

function daysBetween(start, end) {
  return Math.max(0, Math.floor((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000));
}

export function auditLog(db, payload) {
  const moduleName = payload.module || payload.table_name || "system";
  const tableName = payload.table_name || payload.module || "system";
  const eventBody = JSON.stringify({
    company_id: payload.company_id || null,
    user_id: payload.user_id || null,
    user_role: payload.user_role || null,
    action: payload.action,
    module: moduleName,
    table_name: tableName,
    record_id: payload.record_id || null,
    old_value: payload.old_value || null,
    new_value: payload.new_value || null,
    created_at: new Date().toISOString()
  });
  const eventHash = crypto.createHash("sha256").update(eventBody).digest("hex");
  db.prepare(`
    INSERT INTO audit_log (company_id, user_id, user_role, action, module, table_name, record_id, old_value, new_value, ip_address, event_hash)
    VALUES (@company_id, @user_id, @user_role, @action, @module, @table_name, @record_id, @old_value, @new_value, @ip_address, @event_hash)
  `).run({
    company_id: payload.company_id || null,
    user_id: payload.user_id || null,
    user_role: payload.user_role || null,
    action: payload.action,
    module: moduleName,
    table_name: tableName,
    record_id: payload.record_id || null,
    old_value: payload.old_value || null,
    new_value: payload.new_value || null,
    ip_address: payload.ip_address || "local",
    event_hash: eventHash
  });
}

const {
  tableExists,
  columnExists,
  activeRowClause,
  assertTable,
  assertWriteAllowed,
  cleanPayload,
  createRecord,
  updateRecord,
  deleteRecord,
  getRecord,
  listRecords
} = createCrudHelpers({
  ALL_TABLES,
  WRITE_POLICY,
  TRANSACTION_TABLES,
  COMPANY_SPECIFIC_MASTER_TABLES,
  MASTER_TABLES,
  ACCOUNTING_TABLES,
  auditLog,
  assertTransactionYearOpen,
  financialYearForDate,
  transactionDateFor,
  seedAccounts,
  autoReserveOrderStock
});

export {
  createRecord,
  updateRecord,
  deleteRecord,
  listRecords
};

const {
  dayBook,
  postingControlReport,
  partyLedgerReport,
  departmentLedgerReport,
  supplierLedgerReport,
  billStatus,
  ageBucket,
  round2,
  parseGuidedVoucherPayload,
  postedGuidedNoteAdjustments,
  billWiseReceivableReport,
  billWisePayableReport,
  paymentAllocationReport,
  supplierPaymentAllocationReport,
  receivableAgeingReport,
  payableAgeingReport,
  tdsReconciliationReport,
  gstTdsReconciliationReport,
  partyLedgerSummaryReport,
  partyReconciliationReport,
  allocationReconciliationReport,
  unallocatedReceiptsReport,
  unallocatedSupplierPaymentsReport,
  advanceReceiptReport,
  supplierAdvanceReport,
  advanceAdjustmentReport,
  allocationAuditReport,
  creditTermsReport,
  financialControlReport,
  openingBalanceReport,
  approvalQueueReport,
  gstRegisters,
  tdsRegisters,
  accountingRegisters,
  billOutstandingReport,
  yearEndClosingReport,
  carryForwardReport,
  trialBalance,
  profitLossReport,
  balanceSheetReport,
  financialStatementSummary,
  gstSummary,
  supplierPayableReport,
} = createReportBuilders({ activeRowClause, creditDueDate, allocationStatus, daysBetween, financialYearForDate });

const {
  createLedgerAccount, createBalancedVoucher, createManualVoucher,
  createBusinessVoucher, updateGuidedVoucherStatus, postGuidedVoucher,
  reverseVoucher, postSalesVoucher, postPurchaseVoucher, postReceiptVoucher,
  postSupplierPaymentVoucher, createReceiptAllocation, unallocateReceiptAllocation,
  reallocateReceiptAllocation, createSupplierPaymentAllocation,
  unallocateSupplierPaymentAllocation, reallocateSupplierPaymentAllocation,
  createAdvanceReceipt, createSupplierAdvance, adjustAdvanceReceipt,
  adjustSupplierAdvance, reverseAdvanceAdjustment, saveCreditTerm,
  createPartyOpeningBalance, createFinancialYear, updateFinancialYearStatus,
  createOpeningBalance, closeFinancialYear, accountingData
} = createAccountingService({
  auditLog, cleanPayload, createRecord, updateRecord, deleteRecord,
  getRecord, listRecords, tableExists, assertTable, assertWriteAllowed,
  activeRowClause, accountId, nextVoucherNumber, postLedgerEntry,
  businessVoucherPayload, allocationAudit, markPosted, markPostingError,
  upsertReceivable, refreshReceivable, updateCashBankLedger,
  auditVoucherDependencySync, receiptUnallocatedAmount,
  supplierPaymentUnallocatedAmount, partyControlAccount,
  purchaseOutstandingAmount, receivableOutstandingBeforeAdjustment,
  referenceData, postingControlReport, assertOpenFinancialYear,
  seedFinancialYears, financialYearForDate,
  parseGuidedVoucherPayload, postedGuidedNoteAdjustments,
  creditDueDate, daysBetween, allocationStatus,
  receiptAdvanceAdjustedForBilling, supplierAdvanceAdjustedForProcurement,
  dayBook, trialBalance, balanceSheetReport, profitLossReport,
  gstSummary, supplierPayableReport, financialStatementSummary,
  partyLedgerReport, departmentLedgerReport, supplierLedgerReport,
  billWiseReceivableReport, billWisePayableReport,
  paymentAllocationReport, supplierPaymentAllocationReport,
  receivableAgeingReport, payableAgeingReport,
  tdsReconciliationReport, gstTdsReconciliationReport,
  partyLedgerSummaryReport, partyReconciliationReport,
  allocationReconciliationReport,
  unallocatedReceiptsReport, unallocatedSupplierPaymentsReport,
  advanceReceiptReport, supplierAdvanceReport, advanceAdjustmentReport,
  allocationAuditReport, creditTermsReport,
  financialControlReport, openingBalanceReport,
  approvalQueueReport,
  gstRegisters, tdsRegisters, accountingRegisters,
  billOutstandingReport, yearEndClosingReport, carryForwardReport,
  createAutomaticGrnFromPurchaseVoucher,
  createAutomaticStockIssueFromSalesVoucher
});

const {
  previewBankStatementImport, createBankStatementImport,
  updateBankImportStatus, manualBankEntryMatch,
  postApprovedBankImport, generateVoucherProposalsForImport,
  voucherProposalData, updateVoucherProposal,
  approveVoucherProposal, rejectVoucherProposal,
  createDraftVoucherFromProposal, postDraftVoucherFromProposal,
  bankStatementData
} = createBankReconciliationService({
  auditLog, activeRowClause, postLedgerEntry, updateCashBankLedger,
  assertOpenFinancialYear, accountId, nextVoucherNumber
});

const {
  stockBalance, weightedAverageCost, insertStockLedger,
  inventoryStockSummary, inventoryLowStockReport,
  postStockInward, postStockOutward, postStockAdjustment,
  approveStockAdjustment, postStockReturn, inventoryData
} = createInventoryService({
  auditLog, activeRowClause, accountId, createBalancedVoucher,
  autoReserveOrderStock, listRecords, referenceData
});

const {
  cleanTallyText,
  previewTallyStockXml, previewTallyMasterMigration
} = createTallyImportService({
  enforcePermission, normalizeDuplicateKey, findMasterImportDuplicate,
  parseImportFile, columnExists
});

const { seed } = createSeedData({
  hashPassword,
  markDefaultAdminPasswordForChange,
  createRecord,
  seedAccounts,
  postStockInward,
  postStockOutward,
  postPurchaseVoucher,
  postSalesVoucher,
  postReceiptVoucher,
  postExpenseAccrualsForOrder,
  createSupplierPayment,
  allocateSupplierPayment
});

const {
  addAccountingColumns,
  addBillingVoucherEnhancementFields,
  addPhase6DAdvanceAdjustmentTables,
  addAllocationWorkflowTables,
  addPhase5AccountingControls,
  addPhase6YearEndControls,
  createAccountingTables,
  addPhase7InventoryTables,
  addPhase8BankStatementTables,
  addPhase8BVoucherProposalTables,
  addBusinessVoucherInventoryTables,
  addPhase10InventoryAutomationTables,
  addAuditAndPostingFixes,
  applyWorkIncentiveTerminology,
  addPhase15HMasterDataToolsColumns,
  addSupplyOrderItemEntryEnhancement,
  addCoreControlHardening,
  addPhase13OperationsHardening,
  addCompanyContextLayer,
  addRuntimeSoftDeleteColumns,
  addSupplierExtendedFields,
  addPhase15iCracTables
} = createSchemaFunctions({ addColumnIfMissing, seedFinancialYears, backfillPostingStatuses, tableExists, ACCOUNTING_TABLES });

export {
  createLedgerAccount, createBalancedVoucher, createManualVoucher,
  createBusinessVoucher, updateGuidedVoucherStatus, postGuidedVoucher,
  reverseVoucher, postSalesVoucher, postPurchaseVoucher, postReceiptVoucher,
  postSupplierPaymentVoucher, createReceiptAllocation, unallocateReceiptAllocation,
  reallocateReceiptAllocation, createSupplierPaymentAllocation,
  unallocateSupplierPaymentAllocation, reallocateSupplierPaymentAllocation,
  createAdvanceReceipt, createSupplierAdvance, adjustAdvanceReceipt,
  adjustSupplierAdvance, reverseAdvanceAdjustment, saveCreditTerm,
  createPartyOpeningBalance, createFinancialYear, updateFinancialYearStatus,
  createOpeningBalance, closeFinancialYear, accountingData
};

export {
  previewBankStatementImport, createBankStatementImport,
  updateBankImportStatus, manualBankEntryMatch,
  postApprovedBankImport, generateVoucherProposalsForImport,
  voucherProposalData, updateVoucherProposal,
  approveVoucherProposal, rejectVoucherProposal,
  createDraftVoucherFromProposal, postDraftVoucherFromProposal,
  bankStatementData
};

export {
  postStockInward, postStockOutward, postStockAdjustment,
  approveStockAdjustment, postStockReturn, inventoryData
};

export {
  previewTallyStockXml, previewTallyMasterMigration
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const db = initializeDatabase();
  db.close();
  console.log(`Initialized ${dbPath()}`);
}
