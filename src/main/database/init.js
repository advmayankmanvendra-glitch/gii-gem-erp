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

const DOCUMENT_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png", ".xlsx", ".csv"]);
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

function addPhase15iCracTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS crac_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      supply_order_id INTEGER NOT NULL,
      department_id INTEGER,
      invoice_id INTEGER,
      crac_number TEXT,
      crac_date TEXT,
      crac_amount REAL NOT NULL DEFAULT 0,
      crac_status TEXT NOT NULL DEFAULT 'Pending',
      issued_by TEXT,
      issuing_designation TEXT,
      department TEXT,
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      deleted_by INTEGER,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (supply_order_id) REFERENCES supply_orders(id),
      FOREIGN KEY (department_id) REFERENCES government_departments(id),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    );
  `);

  [
    ["crac_status", "TEXT NOT NULL DEFAULT 'Not Required'"],
    ["crac_number", "TEXT"],
    ["crac_date", "TEXT"],
    ["crac_amount", "REAL NOT NULL DEFAULT 0"],
    ["crac_issued_by", "TEXT"],
    ["crac_issuing_designation", "TEXT"],
    ["crac_department", "TEXT"],
    ["crac_remarks", "TEXT"],
    ["supply_completed_at", "TEXT"],
    ["installation_completed_at", "TEXT"],
    ["is_supply_completed", "INTEGER NOT NULL DEFAULT 0"],
    ["is_installation_completed", "INTEGER NOT NULL DEFAULT 0"],
    ["closure_checklist", "TEXT"],
    ["closure_percentage", "REAL NOT NULL DEFAULT 0"],
    ["operationally_closed", "INTEGER NOT NULL DEFAULT 0"],
    ["operationally_closed_at", "TEXT"]
  ].forEach(([column, definition]) => addColumnIfMissing(db, "supply_orders", column, definition));
}

function addAuditAndPostingFixes(db) {
  ["employees", "government_departments", "suppliers", "expense_heads", "banks"].forEach((table) => {
    if (!tableExists(db, table)) return;
    addColumnIfMissing(db, table, "is_deleted", "INTEGER NOT NULL DEFAULT 0");
    addColumnIfMissing(db, table, "deleted_at", "TEXT");
    addColumnIfMissing(db, table, "deleted_by", "INTEGER REFERENCES users(id)");
  });
  addColumnIfMissing(db, "supply_orders", "posting_status", "TEXT NOT NULL DEFAULT 'Draft'");
  const linked = db.prepare(`
    SELECT DISTINCT so.id FROM supply_orders so
    WHERE COALESCE(so.is_deleted, 0) = 0 AND COALESCE(so.posting_status, 'Draft') = 'Draft'
    AND (
      EXISTS (SELECT 1 FROM procurements p WHERE p.order_id = so.id AND COALESCE(p.is_deleted, 0) = 0)
      OR EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = so.id AND COALESCE(i.is_deleted, 0) = 0)
      OR EXISTS (SELECT 1 FROM payments pm WHERE pm.order_id = so.id AND COALESCE(pm.is_deleted, 0) = 0)
      OR EXISTS (SELECT 1 FROM expense_entries ee WHERE ee.order_id = so.id AND COALESCE(ee.is_deleted, 0) = 0)
      OR EXISTS (SELECT 1 FROM stock_inwards si WHERE si.order_id = so.id AND COALESCE(si.is_deleted, 0) = 0)
      OR EXISTS (SELECT 1 FROM stock_outwards so2 WHERE so2.order_id = so.id AND COALESCE(so2.is_deleted, 0) = 0)
      OR EXISTS (SELECT 1 FROM stock_returns sr WHERE sr.order_id = so.id AND COALESCE(sr.is_deleted, 0) = 0)
    )
  `).all();
  for (const row of linked) {
    db.prepare("UPDATE supply_orders SET posting_status = 'Locked' WHERE id = ?").run(row.id);
  }
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

function addColumnIfMissing(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function applyWorkIncentiveTerminology(db) {
  if (tableExists(db, "accounts")) {
    db.prepare(`
      UPDATE accounts
      SET account_name = 'Work Incentive Expense', updated_at = CURRENT_TIMESTAMP
      WHERE account_name = 'Commission Expense'
    `).run();
  }
  if (tableExists(db, "expense_heads")) {
    db.prepare(`
      UPDATE expense_heads
      SET expense_head_name = 'Work Incentive', category = 'Work Incentive', updated_at = CURRENT_TIMESTAMP
      WHERE expense_head_name = 'Commission'
    `).run();
    db.prepare(`
      UPDATE expense_heads
      SET category = 'Work Incentive', updated_at = CURRENT_TIMESTAMP
      WHERE category = 'Commission'
    `).run();
  }
  if (tableExists(db, "expense_entries")) {
    db.prepare(`
      UPDATE expense_entries
      SET expense_category = 'Work Incentive', updated_at = CURRENT_TIMESTAMP
      WHERE expense_category = 'Commission'
    `).run();
  }
}

function addPhase15HMasterDataToolsColumns(db) {
  [
    ["companies", "company_code", "TEXT"],
    ["employees", "employee_code", "TEXT"],
    ["employees", "email", "TEXT"],
    ["employees", "pan", "TEXT"],
    ["employees", "aadhaar_last4", "TEXT"],
    ["employees", "bank_name", "TEXT"],
    ["employees", "account_number", "TEXT"],
    ["employees", "ifsc", "TEXT"],
    ["employees", "branch", "TEXT"],
    ["employees", "joining_date", "TEXT"],
    ["employees", "remarks", "TEXT"],
    ["government_departments", "department_code", "TEXT"],
    ["government_departments", "gstin", "TEXT"],
    ["government_departments", "billing_address", "TEXT"],
    ["government_departments", "consignee_address", "TEXT"],
    ["government_departments", "district", "TEXT"],
    ["government_departments", "state", "TEXT"],
    ["government_departments", "pincode", "TEXT"],
    ["government_departments", "mobile", "TEXT"],
    ["government_departments", "email", "TEXT"],
    ["government_departments", "payment_authority", "TEXT"],
    ["government_departments", "remarks", "TEXT"],
    ["suppliers", "pan", "TEXT"],
    ["suppliers", "address", "TEXT"],
    ["suppliers", "city", "TEXT"],
    ["suppliers", "state", "TEXT"],
    ["suppliers", "pincode", "TEXT"],
    ["suppliers", "contact_person", "TEXT"],
    ["suppliers", "mobile", "TEXT"],
    ["suppliers", "email", "TEXT"],
    ["suppliers", "upi_id", "TEXT"],
    ["suppliers", "msme_number", "TEXT"],
    ["suppliers", "payment_terms", "TEXT"],
    ["items", "oem_name", "TEXT"],
    ["items", "make_in_india_class", "TEXT"],
    ["items", "country_of_origin", "TEXT"],
    ["items", "remarks", "TEXT"],
    ["warehouses", "warehouse_code", "TEXT"],
    ["warehouses", "address", "TEXT"],
    ["warehouses", "incharge_name", "TEXT"],
    ["warehouses", "mobile", "TEXT"],
    ["warehouses", "remarks", "TEXT"],
    ["expense_heads", "expense_head_code", "TEXT"],
    ["expense_heads", "default_gst_rate", "REAL"],
    ["expense_heads", "remarks", "TEXT"],
    ["banks", "bank_code", "TEXT"],
    ["banks", "branch", "TEXT"],
    ["banks", "remarks", "TEXT"]
  ].forEach(([table, column, definition]) => addColumnIfMissing(db, table, column, definition));
}

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function columnExists(db, table, column) {
  if (!tableExists(db, table)) return false;
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function addSupplyOrderItemEntryEnhancement(db) {
  [
    ["supply_type", "TEXT NOT NULL DEFAULT 'GeM'"],
    ["buyer_name", "TEXT"],
    ["buyer_designation", "TEXT"],
    ["buyer_mobile", "TEXT"],
    ["buyer_email", "TEXT"],
    ["consignee_address", "TEXT"],
    ["delivery_location", "TEXT"],
    ["delivery_period", "TEXT"],
    ["warranty_period", "TEXT"],
    ["payment_terms", "TEXT"],
    ["emd_amount", "REAL NOT NULL DEFAULT 0"],
    ["security_deposit_amount", "REAL NOT NULL DEFAULT 0"],
    ["total_quantity", "REAL NOT NULL DEFAULT 0"],
    ["order_taxable_value", "REAL NOT NULL DEFAULT 0"],
    ["order_gst_amount", "REAL NOT NULL DEFAULT 0"],
    ["order_gross_value", "REAL NOT NULL DEFAULT 0"]
  ].forEach(([column, definition]) => addColumnIfMissing(db, "supply_orders", column, definition));

  [
    ["brand", "TEXT"],
    ["model", "TEXT"],
    ["hsn_sac", "TEXT"],
    ["required_delivery_date", "TEXT"]
  ].forEach(([column, definition]) => addColumnIfMissing(db, "order_items", column, definition));
}

function addCoreControlHardening(db) {
  addColumnIfMissing(db, "users", "failed_login_count", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "users", "locked_until", "TEXT");
  addColumnIfMissing(db, "users", "force_password_change", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "users", "last_login_at", "TEXT");
  addColumnIfMissing(db, "users", "password_changed_at", "TEXT");

  addColumnIfMissing(db, "audit_log", "user_role", "TEXT");
  addColumnIfMissing(db, "audit_log", "module", "TEXT");
  addColumnIfMissing(db, "audit_log", "event_hash", "TEXT");

  addColumnIfMissing(db, "import_batches", "module", "TEXT");
  addColumnIfMissing(db, "import_batches", "rows_imported", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "import_batches", "imported_by", "INTEGER");
  addColumnIfMissing(db, "import_batches", "imported_at", "TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS import_batch_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      rolled_back_at TEXT,
      FOREIGN KEY (batch_id) REFERENCES import_batches(id)
    );
  `);

  db.prepare("UPDATE users SET role = 'admin' WHERE LOWER(role) = 'administrator'").run();
  db.prepare("UPDATE users SET password_changed_at = COALESCE(password_changed_at, created_at)").run();
}

function addPhase13OperationsHardening(db) {
  [
    ["gem_order_number", "TEXT"],
    ["gem_contract_number", "TEXT"],
    ["consignee", "TEXT"],
    ["place_of_supply", "TEXT"]
  ].forEach(([column, definition]) => addColumnIfMissing(db, "supply_orders", column, definition));

  addColumnIfMissing(db, "procurements", "procurement_status", "TEXT NOT NULL DEFAULT 'Draft'");

  [
    ["billing_id", "INTEGER REFERENCES invoices(id)"],
    ["invoice_outstanding", "REAL NOT NULL DEFAULT 0"],
    ["tds_deducted", "REAL NOT NULL DEFAULT 0"],
    ["gst_tds_deducted", "REAL NOT NULL DEFAULT 0"],
    ["other_deductions", "REAL NOT NULL DEFAULT 0"],
    ["net_receipt", "REAL NOT NULL DEFAULT 0"],
    ["allocation_status", "TEXT NOT NULL DEFAULT 'Unallocated'"]
  ].forEach(([column, definition]) => addColumnIfMissing(db, "payments", column, definition));
}

function addCompanyContextLayer(db) {
  addColumnIfMissing(db, "banks", "company_id", "INTEGER REFERENCES companies(id)");
  const company = db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get();
  if (company) {
    db.prepare("UPDATE banks SET company_id = ? WHERE company_id IS NULL").run(company.id);
  }
}

function addAccountingColumns(db) {
  ["supply_orders", "procurements", "expense_entries", "invoices", "payments"].forEach((table) => {
    addColumnIfMissing(db, table, "company_id", "INTEGER REFERENCES companies(id)");
    addColumnIfMissing(db, table, "deleted_at", "TEXT");
    addColumnIfMissing(db, table, "deleted_by", "INTEGER REFERENCES users(id)");
    addColumnIfMissing(db, table, "is_deleted", "INTEGER NOT NULL DEFAULT 0");
  });

  [
    ["expense_entries", "expense_amount", "REAL NOT NULL DEFAULT 0"],
    ["expense_entries", "payable_to", "TEXT"],
    ["expense_entries", "payment_status", "TEXT NOT NULL DEFAULT 'Unpaid'"],
    ["expense_entries", "paid_amount", "REAL NOT NULL DEFAULT 0"],
    ["expense_entries", "balance_amount", "REAL NOT NULL DEFAULT 0"],
    ["expense_entries", "payment_date", "TEXT"],
    ["expense_entries", "bank_account_id", "INTEGER REFERENCES banks(id)"],
    ["expense_entries", "payment_mode", "TEXT"],
    ["expense_entries", "utr_number", "TEXT"],
    ["expense_entries", "voucher_id", "INTEGER"]
  ].forEach(([table, column, definition]) => addColumnIfMissing(db, table, column, definition));

  const company = db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get();
  if (company) {
    ["supply_orders", "procurements", "expense_entries", "invoices", "payments"].forEach((table) => {
      db.prepare(`UPDATE ${table} SET company_id = ? WHERE company_id IS NULL`).run(company.id);
    });
  }
}

function addRuntimeSoftDeleteColumns(db) {
  [
    ...ACCOUNTING_TABLES,
    "companies",
    "items",
    "warehouses",
    "documents",
    "goods_receipts",
    "delivery_challans",
    "warehouse_transfers",
    "guided_vouchers",
    "advance_receipts",
    "supplier_advances",
    "advance_adjustments",
    "credit_terms",
    "bank_statement_imports",
    "bank_statement_entries",
    "voucher_proposals"
  ].forEach((table) => {
    if (!tableExists(db, table)) return;
    addColumnIfMissing(db, table, "is_deleted", "INTEGER NOT NULL DEFAULT 0");
    addColumnIfMissing(db, table, "deleted_at", "TEXT");
    addColumnIfMissing(db, table, "deleted_by", "INTEGER REFERENCES users(id)");
  });
}

function addSupplierExtendedFields(db) {
  [
    ["supplier_type", "TEXT"],
    ["supplier_code", "TEXT"],
    ["date_of_activation", "TEXT"],
    ["supplier_account_name", "TEXT"],
    ["supplier_account_number", "TEXT"],
    ["supplier_bank_name", "TEXT"],
    ["supplier_bank_ifsc_code", "TEXT"],
    ["supplier_branch", "TEXT"],
    ["supplier_contact", "TEXT"],
    ["remarks", "TEXT"]
  ].forEach(([column, definition]) => addColumnIfMissing(db, "suppliers", column, definition));
}

function addBillingVoucherEnhancementFields(db) {
  [
    ["gem_order_number", "TEXT"],
    ["gem_contract_number", "TEXT"],
    ["consignee", "TEXT"],
    ["place_of_supply", "TEXT"],
    ["gst_type", "TEXT NOT NULL DEFAULT 'CGST/SGST'"],
    ["invoice_status", "TEXT NOT NULL DEFAULT 'Draft'"]
  ].forEach(([column, definition]) => addColumnIfMissing(db, "invoices", column, definition));

  [
    ["description", "TEXT"],
    ["hsn", "TEXT"],
    ["unit", "TEXT"]
  ].forEach(([column, definition]) => addColumnIfMissing(db, "invoice_items", column, definition));
}

function addPhase6DAdvanceAdjustmentTables(db) {
  addColumnIfMissing(db, "invoices", "gem_order_number", "TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS advance_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('receipt','supplier')),
      advance_id INTEGER NOT NULL,
      billing_id INTEGER,
      procurement_id INTEGER,
      order_id INTEGER,
      adjusted_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Active',
      reason TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reversed_by INTEGER,
      reversed_at TEXT,
      reversal_reason TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (order_id) REFERENCES supply_orders(id)
    );
  `);
}

function addPhase7InventoryTables(db) {
  [
    ["opening_stock", "REAL NOT NULL DEFAULT 0"],
    ["opening_rate", "REAL NOT NULL DEFAULT 0"],
    ["opening_value", "REAL NOT NULL DEFAULT 0"],
    ["reorder_level", "REAL NOT NULL DEFAULT 0"],
    ["minimum_stock_level", "REAL NOT NULL DEFAULT 0"],
    ["maximum_stock_level", "REAL NOT NULL DEFAULT 0"],
    ["track_serial_number", "INTEGER NOT NULL DEFAULT 0"],
    ["track_batch_number", "INTEGER NOT NULL DEFAULT 0"],
    ["warranty_period", "INTEGER NOT NULL DEFAULT 0"]
  ].forEach(([column, definition]) => addColumnIfMissing(db, "items", column, definition));

  db.exec(`
    CREATE TABLE IF NOT EXISTS warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse_name TEXT NOT NULL UNIQUE,
      location TEXT,
      responsible_person TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stock_inwards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      procurement_id INTEGER,
      order_id INTEGER,
      supplier_id INTEGER,
      item_id INTEGER NOT NULL,
      warehouse_id INTEGER NOT NULL,
      inward_date TEXT NOT NULL,
      purchase_invoice_number TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      rate REAL NOT NULL DEFAULT 0,
      gst_rate REAL NOT NULL DEFAULT 0,
      landed_cost REAL NOT NULL DEFAULT 0,
      serial_number TEXT,
      batch_number TEXT,
      remarks TEXT,
      posting_status TEXT NOT NULL DEFAULT 'Draft',
      approval_status TEXT NOT NULL DEFAULT 'Draft',
      posting_error TEXT,
      posted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      deleted_by INTEGER,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (procurement_id) REFERENCES procurements(id),
      FOREIGN KEY (order_id) REFERENCES supply_orders(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
    );

    CREATE TABLE IF NOT EXISTS stock_outwards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      department_id INTEGER,
      item_id INTEGER NOT NULL,
      warehouse_id INTEGER NOT NULL,
      issue_date TEXT NOT NULL,
      delivery_challan_number TEXT,
      quantity_issued REAL NOT NULL DEFAULT 0,
      serial_number TEXT,
      batch_number TEXT,
      remarks TEXT,
      posting_status TEXT NOT NULL DEFAULT 'Draft',
      approval_status TEXT NOT NULL DEFAULT 'Draft',
      posting_error TEXT,
      posted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      deleted_by INTEGER,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (order_id) REFERENCES supply_orders(id),
      FOREIGN KEY (department_id) REFERENCES government_departments(id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
    );

    CREATE TABLE IF NOT EXISTS stock_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      warehouse_id INTEGER NOT NULL,
      transaction_date TEXT NOT NULL,
      document_number TEXT,
      transaction_type TEXT NOT NULL,
      inward_quantity REAL NOT NULL DEFAULT 0,
      outward_quantity REAL NOT NULL DEFAULT 0,
      balance_quantity REAL NOT NULL DEFAULT 0,
      rate REAL NOT NULL DEFAULT 0,
      value REAL NOT NULL DEFAULT 0,
      order_id INTEGER,
      supplier_id INTEGER,
      department_id INTEGER,
      source_module TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
    );

    CREATE TABLE IF NOT EXISTS serial_numbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      supplier_id INTEGER,
      procurement_id INTEGER,
      purchase_invoice_number TEXT,
      serial_number TEXT NOT NULL,
      warehouse_id INTEGER,
      order_id INTEGER,
      department_id INTEGER,
      delivery_date TEXT,
      warranty_expiry TEXT,
      status TEXT NOT NULL DEFAULT 'In Stock',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      UNIQUE(company_id, item_id, serial_number),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (item_id) REFERENCES items(id)
    );

    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      supplier_id INTEGER,
      procurement_id INTEGER,
      batch_number TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      balance_quantity REAL NOT NULL DEFAULT 0,
      purchase_date TEXT,
      expiry_date TEXT,
      warehouse_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      UNIQUE(company_id, item_id, warehouse_id, batch_number),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (item_id) REFERENCES items(id)
    );

    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      warehouse_id INTEGER NOT NULL,
      adjustment_date TEXT NOT NULL,
      adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('Increase','Decrease')),
      quantity REAL NOT NULL DEFAULT 0,
      rate REAL NOT NULL DEFAULT 0,
      reason TEXT,
      remarks TEXT,
      posting_status TEXT NOT NULL DEFAULT 'Draft',
      approval_status TEXT NOT NULL DEFAULT 'Pending Approval',
      posting_error TEXT,
      posted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      deleted_by INTEGER,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
    );

    CREATE TABLE IF NOT EXISTS stock_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      return_type TEXT NOT NULL CHECK(return_type IN ('Department','Supplier')),
      order_id INTEGER,
      supplier_id INTEGER,
      department_id INTEGER,
      item_id INTEGER NOT NULL,
      warehouse_id INTEGER NOT NULL,
      return_date TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      condition_status TEXT NOT NULL DEFAULT 'Good',
      reason TEXT,
      remarks TEXT,
      posting_status TEXT NOT NULL DEFAULT 'Draft',
      approval_status TEXT NOT NULL DEFAULT 'Draft',
      posting_error TEXT,
      posted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      deleted_by INTEGER,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
    );
  `);
}

function addPhase8BankStatementTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bank_statement_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      bank_id INTEGER,
      bank_name TEXT NOT NULL DEFAULT 'Generic Format',
      source_file_name TEXT,
      file_hash TEXT,
      total_rows INTEGER NOT NULL DEFAULT 0,
      valid_rows INTEGER NOT NULL DEFAULT 0,
      duplicate_rows INTEGER NOT NULL DEFAULT 0,
      error_rows INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Draft',
      column_mapping TEXT,
      imported_by INTEGER,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_by INTEGER,
      reviewed_at TEXT,
      approved_by INTEGER,
      approved_at TEXT,
      rejected_by INTEGER,
      rejected_at TEXT,
      rejection_reason TEXT,
      posting_status TEXT NOT NULL DEFAULT 'Not Posted',
      posted_at TEXT,
      remarks TEXT,
      deleted_at TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (bank_id) REFERENCES banks(id)
    );

    CREATE TABLE IF NOT EXISTS bank_statement_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      import_id INTEGER NOT NULL,
      bank_id INTEGER,
      transaction_date TEXT,
      narration TEXT,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      utr TEXT,
      reference_number TEXT,
      cheque_number TEXT,
      amount REAL NOT NULL DEFAULT 0,
      entry_type TEXT NOT NULL DEFAULT 'Unknown',
      duplicate_key TEXT,
      validation_status TEXT NOT NULL DEFAULT 'Draft',
      validation_errors TEXT,
      review_status TEXT NOT NULL DEFAULT 'Draft',
      match_status TEXT NOT NULL DEFAULT 'Unmatched',
      matched_module TEXT,
      matched_record_id INTEGER,
      matched_reference TEXT,
      matched_score INTEGER NOT NULL DEFAULT 0,
      voucher_id INTEGER,
      billing_id INTEGER,
      payment_id INTEGER,
      supplier_payment_id INTEGER,
      order_id INTEGER,
      department_id INTEGER,
      supplier_id INTEGER,
      posted_bank_book_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (import_id) REFERENCES bank_statement_imports(id),
      FOREIGN KEY (bank_id) REFERENCES banks(id)
    );

    CREATE TABLE IF NOT EXISTS bank_reconciliation_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      bank_entry_id INTEGER NOT NULL,
      matched_module TEXT NOT NULL,
      matched_record_id INTEGER NOT NULL,
      matched_reference TEXT,
      confidence_score INTEGER NOT NULL DEFAULT 0,
      match_method TEXT NOT NULL DEFAULT 'Auto',
      status TEXT NOT NULL DEFAULT 'Suggested',
      matched_by INTEGER,
      matched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      remarks TEXT,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (bank_entry_id) REFERENCES bank_statement_entries(id)
    );
  `);
}

function addPhase8BVoucherProposalTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS voucher_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      bank_entry_id INTEGER NOT NULL,
      import_id INTEGER,
      bank_id INTEGER,
      bank_name TEXT,
      transaction_date TEXT NOT NULL,
      narration TEXT,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      utr TEXT,
      reference_number TEXT,
      suggested_voucher_type TEXT NOT NULL,
      suggested_party_type TEXT,
      suggested_party_id INTEGER,
      suggested_party_name TEXT,
      suggested_ledger_id INTEGER,
      suggested_ledger_name TEXT,
      linked_invoice_id INTEGER,
      linked_procurement_id INTEGER,
      linked_order_id INTEGER,
      linked_voucher_id INTEGER,
      confidence_score INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Suggested',
      draft_voucher_id INTEGER,
      posted_voucher_id INTEGER,
      reviewed_by INTEGER,
      reviewed_at TEXT,
      approved_by INTEGER,
      approved_at TEXT,
      rejected_by INTEGER,
      rejected_at TEXT,
      rejection_reason TEXT,
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      UNIQUE(bank_entry_id),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (bank_entry_id) REFERENCES bank_statement_entries(id),
      FOREIGN KEY (import_id) REFERENCES bank_statement_imports(id),
      FOREIGN KEY (bank_id) REFERENCES banks(id),
      FOREIGN KEY (draft_voucher_id) REFERENCES vouchers(id),
      FOREIGN KEY (posted_voucher_id) REFERENCES vouchers(id)
    );

    CREATE TABLE IF NOT EXISTS voucher_proposal_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      proposal_id INTEGER NOT NULL,
      bank_entry_id INTEGER,
      action TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      remarks TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (proposal_id) REFERENCES voucher_proposals(id)
    );
  `);
}

function addBusinessVoucherInventoryTables(db) {
  [
    ["item_code", "TEXT"],
    ["inventory_enabled", "INTEGER NOT NULL DEFAULT 1"],
    ["default_warehouse_id", "INTEGER"],
    ["valuation_method", "TEXT NOT NULL DEFAULT 'Weighted Average'"]
  ].forEach(([column, definition]) => addColumnIfMissing(db, "items", column, definition));

  [
    ["company_id", "INTEGER"],
    ["warehouse_type", "TEXT NOT NULL DEFAULT 'Main Warehouse'"]
  ].forEach(([column, definition]) => addColumnIfMissing(db, "warehouses", column, definition));

  [
    ["procurement_id", "INTEGER"],
    ["billing_id", "INTEGER"],
    ["quantity_in", "REAL NOT NULL DEFAULT 0"],
    ["quantity_out", "REAL NOT NULL DEFAULT 0"],
    ["running_quantity", "REAL NOT NULL DEFAULT 0"],
    ["running_value", "REAL NOT NULL DEFAULT 0"],
    ["valuation_method", "TEXT NOT NULL DEFAULT 'Weighted Average'"],
    ["remarks", "TEXT"],
    ["voucher_id", "INTEGER"]
  ].forEach(([column, definition]) => addColumnIfMissing(db, "stock_ledger", column, definition));

  ["stock_inwards", "stock_outwards", "stock_adjustments", "stock_returns"].forEach((table) => {
    addColumnIfMissing(db, table, "voucher_id", "INTEGER");
  });

  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      movement_date TEXT NOT NULL,
      movement_type TEXT NOT NULL,
      from_warehouse_id INTEGER,
      to_warehouse_id INTEGER,
      item_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      rate REAL NOT NULL DEFAULT 0,
      value REAL NOT NULL DEFAULT 0,
      source_module TEXT,
      source_id INTEGER,
      order_id INTEGER,
      remarks TEXT,
      voucher_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (voucher_id) REFERENCES vouchers(id)
    );

    CREATE TABLE IF NOT EXISTS stock_reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      order_item_id INTEGER,
      item_id INTEGER NOT NULL,
      warehouse_id INTEGER,
      reserved_quantity REAL NOT NULL DEFAULT 0,
      issued_quantity REAL NOT NULL DEFAULT 0,
      balance_reserved REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Reserved',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      cancelled_at TEXT,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (order_id) REFERENCES supply_orders(id),
      FOREIGN KEY (order_item_id) REFERENCES order_items(id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
    );
  `);

  db.prepare("UPDATE warehouses SET company_id = COALESCE(company_id, (SELECT id FROM companies ORDER BY id LIMIT 1)) WHERE company_id IS NULL").run();
}

function addPhase10InventoryAutomationTables(db) {
  addColumnIfMissing(db, "supply_orders", "reservation_status", "TEXT NOT NULL DEFAULT 'Procurement Required'");
  addColumnIfMissing(db, "supply_orders", "procurement_required", "INTEGER NOT NULL DEFAULT 0");

  [
    ["available_quantity", "REAL NOT NULL DEFAULT 0"],
    ["short_quantity", "REAL NOT NULL DEFAULT 0"],
    ["procurement_required", "INTEGER NOT NULL DEFAULT 0"],
    ["procurement_required_quantity", "REAL NOT NULL DEFAULT 0"]
  ].forEach(([column, definition]) => addColumnIfMissing(db, "stock_reservations", column, definition));

  db.exec(`
    CREATE TABLE IF NOT EXISTS guided_vouchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      voucher_kind TEXT NOT NULL,
      voucher_date TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      narration TEXT,
      status TEXT NOT NULL DEFAULT 'Draft',
      posted_voucher_id INTEGER,
      created_by INTEGER,
      submitted_by INTEGER,
      reviewed_by INTEGER,
      approved_by INTEGER,
      posted_by INTEGER,
      submitted_at TEXT,
      reviewed_at TEXT,
      approved_at TEXT,
      posted_at TEXT,
      reversed_at TEXT,
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (posted_voucher_id) REFERENCES vouchers(id)
    );

    CREATE TABLE IF NOT EXISTS goods_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      grn_number TEXT NOT NULL,
      purchase_voucher_id INTEGER,
      guided_voucher_id INTEGER,
      procurement_id INTEGER,
      supplier_id INTEGER,
      warehouse_id INTEGER NOT NULL,
      grn_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Draft',
      remarks TEXT,
      posted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      UNIQUE(company_id, grn_number),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (purchase_voucher_id) REFERENCES vouchers(id),
      FOREIGN KEY (guided_voucher_id) REFERENCES guided_vouchers(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
    );

    CREATE TABLE IF NOT EXISTS goods_receipt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      grn_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      order_id INTEGER,
      purchase_invoice_number TEXT,
      quantity_received REAL NOT NULL DEFAULT 0,
      damaged_quantity REAL NOT NULL DEFAULT 0,
      accepted_quantity REAL NOT NULL DEFAULT 0,
      rate REAL NOT NULL DEFAULT 0,
      gst_rate REAL NOT NULL DEFAULT 0,
      landed_cost REAL NOT NULL DEFAULT 0,
      stock_inward_id INTEGER,
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (grn_id) REFERENCES goods_receipts(id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (order_id) REFERENCES supply_orders(id),
      FOREIGN KEY (stock_inward_id) REFERENCES stock_inwards(id)
    );

    CREATE TABLE IF NOT EXISTS delivery_challans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      challan_number TEXT NOT NULL,
      order_id INTEGER NOT NULL,
      department_id INTEGER,
      dispatch_date TEXT NOT NULL,
      vehicle_details TEXT,
      status TEXT NOT NULL DEFAULT 'Draft',
      remarks TEXT,
      confirmed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      UNIQUE(company_id, challan_number),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (order_id) REFERENCES supply_orders(id),
      FOREIGN KEY (department_id) REFERENCES government_departments(id)
    );

    CREATE TABLE IF NOT EXISTS delivery_challan_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      delivery_challan_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      warehouse_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      stock_outward_id INTEGER,
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (delivery_challan_id) REFERENCES delivery_challans(id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (stock_outward_id) REFERENCES stock_outwards(id)
    );

    CREATE TABLE IF NOT EXISTS warehouse_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      transfer_number TEXT NOT NULL,
      from_warehouse_id INTEGER NOT NULL,
      to_warehouse_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      transfer_date TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      rate REAL NOT NULL DEFAULT 0,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'Draft',
      posted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      UNIQUE(company_id, transfer_number),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (item_id) REFERENCES items(id)
    );
  `);

  [
    ["submitted_by", "INTEGER"],
    ["submitted_at", "TEXT"]
  ].forEach(([column, definition]) => addColumnIfMissing(db, "guided_vouchers", column, definition));
}

function addAllocationWorkflowTables(db) {
  [
    ["allocation_status", "TEXT NOT NULL DEFAULT 'Partially Allocated'"],
    ["is_deleted", "INTEGER NOT NULL DEFAULT 0"],
    ["deleted_at", "TEXT"],
    ["reallocated_from_id", "INTEGER"],
    ["change_reason", "TEXT"],
    ["allow_excess", "INTEGER NOT NULL DEFAULT 0"]
  ].forEach(([column, definition]) => addColumnIfMissing(db, "payment_allocations", column, definition));

  [
    ["allocation_status", "TEXT NOT NULL DEFAULT 'Partially Allocated'"],
    ["is_deleted", "INTEGER NOT NULL DEFAULT 0"],
    ["deleted_at", "TEXT"],
    ["reallocated_from_id", "INTEGER"],
    ["change_reason", "TEXT"],
    ["allow_excess", "INTEGER NOT NULL DEFAULT 0"]
  ].forEach(([column, definition]) => addColumnIfMissing(db, "supplier_payment_allocations", column, definition));

  addColumnIfMissing(db, "procurements", "due_date", "TEXT");
  addColumnIfMissing(db, "receivables", "allocation_status", "TEXT NOT NULL DEFAULT 'Unallocated'");

  db.exec(`
    CREATE TABLE IF NOT EXISTS credit_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      party_type TEXT NOT NULL CHECK(party_type IN ('department','supplier')),
      party_id INTEGER NOT NULL,
      default_credit_days INTEGER NOT NULL DEFAULT 30,
      grace_period INTEGER NOT NULL DEFAULT 0,
      due_date_rule TEXT NOT NULL DEFAULT 'invoice_date',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      UNIQUE(company_id, party_type, party_id),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );

    CREATE TABLE IF NOT EXISTS advance_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      department_id INTEGER NOT NULL,
      payment_id INTEGER,
      order_id INTEGER,
      advance_received REAL NOT NULL DEFAULT 0,
      advance_adjusted REAL NOT NULL DEFAULT 0,
      balance_advance REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Open',
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (department_id) REFERENCES government_departments(id),
      FOREIGN KEY (payment_id) REFERENCES payments(id),
      FOREIGN KEY (order_id) REFERENCES supply_orders(id)
    );

    CREATE TABLE IF NOT EXISTS supplier_advances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      supplier_id INTEGER NOT NULL,
      supplier_payment_id INTEGER,
      advance_paid REAL NOT NULL DEFAULT 0,
      advance_adjusted REAL NOT NULL DEFAULT 0,
      balance_advance REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Open',
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (supplier_payment_id) REFERENCES supplier_payments(id)
    );

    CREATE TABLE IF NOT EXISTS allocation_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      allocation_type TEXT NOT NULL,
      allocation_id INTEGER,
      action TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      reason TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );
  `);
}

function addPhase5AccountingControls(db) {
  ["procurements", "expense_entries", "invoices", "payments"].forEach((table) => {
    addColumnIfMissing(db, table, "posting_status", "TEXT NOT NULL DEFAULT 'Draft'");
    addColumnIfMissing(db, table, "approval_status", "TEXT NOT NULL DEFAULT 'Draft'");
    addColumnIfMissing(db, table, "posting_error", "TEXT");
    addColumnIfMissing(db, table, "approved_by", "INTEGER REFERENCES users(id)");
    addColumnIfMissing(db, table, "approved_at", "TEXT");
    addColumnIfMissing(db, table, "posted_by", "INTEGER REFERENCES users(id)");
    addColumnIfMissing(db, table, "posted_at", "TEXT");
    addColumnIfMissing(db, table, "financial_year_id", "INTEGER");
    addColumnIfMissing(db, table, "locked_at", "TEXT");
  });
  addColumnIfMissing(db, "supplier_payments", "posting_status", "TEXT NOT NULL DEFAULT 'Draft'");

  addColumnIfMissing(db, "vouchers", "financial_year_id", "INTEGER");
  addColumnIfMissing(db, "vouchers", "reversal_reason", "TEXT");
  addColumnIfMissing(db, "vouchers", "reversal_date", "TEXT");
  addColumnIfMissing(db, "vouchers", "reversed_by", "INTEGER REFERENCES users(id)");
  addColumnIfMissing(db, "vouchers", "approval_status", "TEXT NOT NULL DEFAULT 'Approved'");

  db.exec(`
    CREATE TABLE IF NOT EXISTS financial_years (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      financial_year_name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open',
      closed_at TEXT,
      closed_by INTEGER,
      reopened_at TEXT,
      reopened_by INTEGER,
      locked_at TEXT,
      locked_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, financial_year_name),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (closed_by) REFERENCES users(id),
      FOREIGN KEY (reopened_by) REFERENCES users(id),
      FOREIGN KEY (locked_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS opening_balances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      financial_year_id INTEGER NOT NULL,
      balance_type TEXT NOT NULL,
      linked_id INTEGER,
      account_id INTEGER,
      opening_debit REAL NOT NULL DEFAULT 0,
      opening_credit REAL NOT NULL DEFAULT 0,
      voucher_id INTEGER,
      remarks TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (financial_year_id) REFERENCES financial_years(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      FOREIGN KEY (voucher_id) REFERENCES vouchers(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS approval_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      module_name TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      approval_status TEXT NOT NULL DEFAULT 'Draft',
      maker_id INTEGER,
      checker_id INTEGER,
      submitted_at TEXT,
      approved_at TEXT,
      rejected_at TEXT,
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(module_name, record_id),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (maker_id) REFERENCES users(id),
      FOREIGN KEY (checker_id) REFERENCES users(id)
    );
  `);

  seedFinancialYears(db);
  backfillPostingStatuses(db);
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

function addPhase6YearEndControls(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS year_end_closings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      from_financial_year_id INTEGER NOT NULL,
      to_financial_year_id INTEGER NOT NULL,
      closing_date TEXT NOT NULL,
      trial_balance_difference REAL NOT NULL DEFAULT 0,
      balance_sheet_difference REAL NOT NULL DEFAULT 0,
      net_profit REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Draft',
      approved_by INTEGER,
      approved_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, from_financial_year_id, to_financial_year_id),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (from_financial_year_id) REFERENCES financial_years(id),
      FOREIGN KEY (to_financial_year_id) REFERENCES financial_years(id),
      FOREIGN KEY (approved_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS carry_forward_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      from_financial_year_id INTEGER NOT NULL,
      to_financial_year_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      party_type TEXT,
      party_id INTEGER,
      closing_balance REAL NOT NULL DEFAULT 0,
      opening_balance_created INTEGER NOT NULL DEFAULT 0,
      opening_voucher_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      approved_by INTEGER,
      status TEXT NOT NULL DEFAULT 'Draft',
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (from_financial_year_id) REFERENCES financial_years(id),
      FOREIGN KEY (to_financial_year_id) REFERENCES financial_years(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      FOREIGN KEY (opening_voucher_id) REFERENCES vouchers(id),
      FOREIGN KEY (approved_by) REFERENCES users(id)
    );
  `);
}

function createAccountingTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      account_name TEXT NOT NULL,
      account_code TEXT NOT NULL,
      account_type TEXT NOT NULL CHECK(account_type IN ('Asset','Liability','Equity','Income','Expense')),
      parent_account_id INTEGER,
      opening_balance REAL NOT NULL DEFAULT 0,
      normal_balance TEXT NOT NULL CHECK(normal_balance IN ('Debit','Credit')),
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      deleted_by INTEGER,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      UNIQUE(company_id, account_code),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (parent_account_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS vouchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      voucher_number TEXT NOT NULL,
      voucher_date TEXT NOT NULL,
      voucher_type TEXT NOT NULL CHECK(voucher_type IN ('Sales','Purchase','Receipt','Payment','Journal','Credit Note','Debit Note','Contra')),
      narration TEXT,
      source_module TEXT,
      source_id INTEGER,
      status TEXT NOT NULL DEFAULT 'Posted',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      deleted_by INTEGER,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      UNIQUE(company_id, voucher_number),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );

    CREATE TABLE IF NOT EXISTS voucher_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      narration TEXT,
      linked_party_type TEXT,
      linked_party_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (voucher_id) REFERENCES vouchers(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      voucher_id INTEGER NOT NULL,
      voucher_line_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      entry_date TEXT NOT NULL,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      running_balance REAL NOT NULL DEFAULT 0,
      source_module TEXT,
      source_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (voucher_id) REFERENCES vouchers(id),
      FOREIGN KEY (voucher_line_id) REFERENCES voucher_lines(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS cash_bank_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      bank_account_id INTEGER,
      transaction_date TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      source_module TEXT,
      source_id INTEGER,
      voucher_id INTEGER,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      payment_mode TEXT,
      utr_number TEXT,
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (bank_account_id) REFERENCES banks(id),
      FOREIGN KEY (voucher_id) REFERENCES vouchers(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      item_id INTEGER,
      item_description TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT,
      quoted_rate REAL NOT NULL DEFAULT 0,
      gst_rate REAL NOT NULL DEFAULT 0,
      taxable_value REAL NOT NULL DEFAULT 0,
      gst_amount REAL NOT NULL DEFAULT 0,
      gross_value REAL NOT NULL DEFAULT 0,
      required_delivery_date TEXT,
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      deleted_by INTEGER,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (order_id) REFERENCES supply_orders(id),
      FOREIGN KEY (item_id) REFERENCES items(id)
    );

    CREATE TABLE IF NOT EXISTS procurement_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      procurement_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      order_item_id INTEGER,
      item_id INTEGER,
      description TEXT,
      hsn TEXT,
      unit TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      purchase_rate REAL NOT NULL DEFAULT 0,
      gst_rate REAL NOT NULL DEFAULT 0,
      taxable_value REAL NOT NULL DEFAULT 0,
      gst_amount REAL NOT NULL DEFAULT 0,
      gross_value REAL NOT NULL DEFAULT 0,
      freight REAL NOT NULL DEFAULT 0,
      loading_charges REAL NOT NULL DEFAULT 0,
      other_cost REAL NOT NULL DEFAULT 0,
      landed_cost REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      deleted_by INTEGER,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (procurement_id) REFERENCES procurements(id),
      FOREIGN KEY (order_id) REFERENCES supply_orders(id),
      FOREIGN KEY (order_item_id) REFERENCES order_items(id),
      FOREIGN KEY (item_id) REFERENCES items(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      billing_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      order_item_id INTEGER,
      item_id INTEGER,
      quantity REAL NOT NULL DEFAULT 0,
      billing_rate REAL NOT NULL DEFAULT 0,
      gst_rate REAL NOT NULL DEFAULT 0,
      taxable_value REAL NOT NULL DEFAULT 0,
      cgst REAL NOT NULL DEFAULT 0,
      sgst REAL NOT NULL DEFAULT 0,
      igst REAL NOT NULL DEFAULT 0,
      gst_amount REAL NOT NULL DEFAULT 0,
      gross_value REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      deleted_by INTEGER,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (billing_id) REFERENCES invoices(id),
      FOREIGN KEY (order_id) REFERENCES supply_orders(id),
      FOREIGN KEY (order_item_id) REFERENCES order_items(id),
      FOREIGN KEY (item_id) REFERENCES items(id)
    );

    CREATE TABLE IF NOT EXISTS receivables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      billing_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      department_id INTEGER,
      invoice_number TEXT NOT NULL,
      invoice_date TEXT NOT NULL,
      invoice_amount REAL NOT NULL DEFAULT 0,
      amount_received REAL NOT NULL DEFAULT 0,
      tds_deducted REAL NOT NULL DEFAULT 0,
      gst_tds_deducted REAL NOT NULL DEFAULT 0,
      other_deductions REAL NOT NULL DEFAULT 0,
      balance_outstanding REAL NOT NULL DEFAULT 0,
      due_date TEXT,
      days_outstanding INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Open',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      deleted_by INTEGER,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      UNIQUE(company_id, billing_id),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (billing_id) REFERENCES invoices(id),
      FOREIGN KEY (order_id) REFERENCES supply_orders(id),
      FOREIGN KEY (department_id) REFERENCES government_departments(id)
    );

    CREATE TABLE IF NOT EXISTS payment_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      payment_id INTEGER NOT NULL,
      billing_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      allocated_amount REAL NOT NULL DEFAULT 0,
      tds_deducted REAL NOT NULL DEFAULT 0,
      gst_tds_deducted REAL NOT NULL DEFAULT 0,
      other_deductions REAL NOT NULL DEFAULT 0,
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (payment_id) REFERENCES payments(id),
      FOREIGN KEY (billing_id) REFERENCES invoices(id),
      FOREIGN KEY (order_id) REFERENCES supply_orders(id)
    );

    CREATE TABLE IF NOT EXISTS supplier_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      supplier_id INTEGER NOT NULL,
      payment_date TEXT NOT NULL,
      bank_account_id INTEGER,
      payment_mode TEXT,
      utr_number TEXT UNIQUE,
      amount_paid REAL NOT NULL DEFAULT 0,
      remarks TEXT,
      voucher_id INTEGER,
      posting_status TEXT NOT NULL DEFAULT 'Draft',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      deleted_by INTEGER,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (bank_account_id) REFERENCES banks(id),
      FOREIGN KEY (voucher_id) REFERENCES vouchers(id)
    );

    CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      supplier_payment_id INTEGER NOT NULL,
      procurement_id INTEGER NOT NULL,
      allocated_amount REAL NOT NULL DEFAULT 0,
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (supplier_payment_id) REFERENCES supplier_payments(id),
      FOREIGN KEY (procurement_id) REFERENCES procurements(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER,
      user_id INTEGER,
      action TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id INTEGER,
      old_value TEXT,
      new_value TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

export function seed(db) {
  const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (!userCount) {
    db.prepare(`
      INSERT INTO users (username, password_hash, display_name, role, status)
      VALUES (@username, @password_hash, @display_name, @role, @status)
    `).run({
      username: "admin",
      password_hash: hashPassword("admin123"),
      display_name: "System Administrator",
      role: "admin",
      status: "active"
    });
  }
  markDefaultAdminPasswordForChange(db);

  insertIfEmpty(db, "companies", {
    company_name: "Gesture India Infrastructure",
    gstin: "27ABCDE1234F1Z5",
    pan: "ABCDE1234F",
    address: "Mumbai, Maharashtra",
    bank_name: "SBI",
    account_number: "000000000001",
    ifsc: "SBIN0000001",
    status: "active"
  });
  const defaultCompanyId = db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || null;

  insertIfEmpty(db, "employees", {
    employee_name: "Mira Sharma",
    mobile_number: "9876543210",
    designation: "Sales Coordinator",
    incentive_percentage: 15,
    status: "active"
  });

  insertIfEmpty(db, "government_departments", {
    department_name: "Public Works Department",
    contact_person: "Procurement Officer",
    contact_number: "02240000000",
    address: "Mumbai",
    status: "active"
  });

  insertIfEmpty(db, "suppliers", {
    supplier_name: "Prime Industrial Suppliers",
    supplier_type: "Vendor",
    supplier_code: "SUP-001",
    date_of_activation: "2026-06-09",
    supplier_account_name: "Prime Industrial Suppliers",
    supplier_account_number: "000000000002",
    supplier_bank_name: "HDFC",
    supplier_bank_ifsc_code: "HDFC0000001",
    supplier_branch: "Mumbai",
    supplier_contact: "purchase@primeindustrial.example",
    remarks: "Seed supplier",
    gstin: "27SUPPL1234F1Z8",
    contact_details: "purchase@primeindustrial.example",
    bank_details: "HDFC - 000000000002",
    status: "active"
  });

  insertIfEmpty(db, "items", {
    item_name: "Office Workstation",
    brand: "Generic",
    model: "GEM-WS-01",
    hsn_code: "9403",
    gst_rate: 18,
    unit: "Nos",
    category: "Furniture",
    opening_stock: 0,
    opening_rate: 0,
    opening_value: 0,
    reorder_level: 2,
    minimum_stock_level: 1,
    maximum_stock_level: 25,
    track_serial_number: 0,
    track_batch_number: 0,
    warranty_period: 12,
    status: "active"
  });

  insertIfEmpty(db, "warehouses", {
    company_id: defaultCompanyId,
    warehouse_name: "Main Store",
    location: "Head Office",
    responsible_person: "Store Keeper",
    status: "active"
  });

  const expenseCount = db.prepare("SELECT COUNT(*) AS count FROM expense_heads").get().count;
  if (!expenseCount) {
    [
      ["Authorization", "percentage_gross", 5, "Authorization"],
      ["L1 Expense", "percentage_gross", 2, "Tender"],
      ["Work Incentive", "percentage_gross", 10, "Work Incentive"],
      ["Transport", "fixed", 0, "Logistics"],
      ["Installation", "fixed", 0, "Execution"],
      ["Miscellaneous", "fixed", 0, "Other"]
    ].forEach(([expense_head_name, default_calculation_method, default_percentage, category]) => {
      createRecord(db, "expense_heads", {
        expense_head_name,
        default_calculation_method,
        default_percentage,
        category,
        status: "active"
      });
    });
  }

  insertIfEmpty(db, "banks", {
    company_id: defaultCompanyId,
    bank_account_name: "SBI Current Account",
    bank_name: "SBI",
    account_number: "000000000001",
    ifsc: "SBIN0000001",
    opening_balance: 0,
    status: "active"
  });

  repairSeedCompanyContext(db, defaultCompanyId);
  seedAccounts(db);
  seedPhaseTwo(db, defaultCompanyId);
  seedPhaseThreeAccountingFlow(db);
  seedPhase7Inventory(db);
}

function repairSeedCompanyContext(db, companyId) {
  if (!companyId) return;
  db.prepare(`
    UPDATE warehouses
    SET company_id = ?
    WHERE (company_id IS NULL OR company_id = '') AND warehouse_name = 'Main Store'
  `).run(companyId);
  db.prepare(`
    UPDATE banks
    SET company_id = ?
    WHERE (company_id IS NULL OR company_id = '')
      AND bank_account_name = 'SBI Current Account'
      AND account_number = '000000000001'
  `).run(companyId);
  db.prepare(`
    UPDATE supply_orders
    SET company_id = ?
    WHERE (company_id IS NULL OR company_id = '') AND order_number = 'GEM-2026-001'
  `).run(companyId);
  db.prepare(`
    UPDATE procurements
    SET company_id = ?
    WHERE (company_id IS NULL OR company_id = '') AND purchase_invoice_number = 'PIS-1001'
  `).run(companyId);
  db.prepare(`
    UPDATE invoices
    SET company_id = ?
    WHERE (company_id IS NULL OR company_id = '') AND invoice_number = 'GII-INV-001'
  `).run(companyId);
  db.prepare(`
    UPDATE payments
    SET company_id = ?
    WHERE (company_id IS NULL OR company_id = '') AND utr_number = 'UTR10001'
  `).run(companyId);
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

function seedPhaseTwo(db, companyId = null) {
  const orderCount = db.prepare("SELECT COUNT(*) AS count FROM supply_orders").get().count;
  if (orderCount) return;

  const effectiveCompanyId = companyId || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || null;
  if (!effectiveCompanyId) return;
  const department = db.prepare("SELECT id FROM government_departments LIMIT 1").get();
  const employee = db.prepare("SELECT id FROM employees LIMIT 1").get();
  const supplier = db.prepare("SELECT id FROM suppliers LIMIT 1").get();
  const bank = db.prepare("SELECT id FROM banks WHERE company_id = ? LIMIT 1").get(effectiveCompanyId);
  const seedItem = db.prepare("SELECT id, item_name, brand, model, hsn_code, unit, gst_rate FROM items ORDER BY id LIMIT 1").get();
  if (!department || !employee || !supplier || !seedItem) return;

  const order = createRecord(db, "supply_orders", {
    company_id: effectiveCompanyId,
    order_number: "GEM-2026-001",
    gem_order_number: "GEM-2026-001",
    gem_contract_number: "GEM-CONTRACT-001",
    supply_type: "GeM",
    order_date: "2026-06-09",
    department_id: department.id,
    institution_name: "PWD Central Store",
    buyer_name: "PWD Procurement Officer",
    buyer_designation: "Buyer",
    buyer_mobile: "",
    buyer_email: "",
    consignee: "PWD Central Store",
    consignee_address: "PWD Central Store, Mumbai",
    delivery_location: "Mumbai",
    place_of_supply: "Maharashtra",
    location: "Mumbai",
    delivery_period: "15 days",
    warranty_period: "12 months",
    payment_terms: "As per GeM order",
    emd_amount: 0,
    security_deposit_amount: 0,
    employee_id: employee.id,
    supply_due_date: "2026-06-25",
    order_status: "Payment Pending",
    order_items: [{
      item_id: seedItem.id,
      item_description: seedItem.item_name,
      brand: seedItem.brand || "",
      model: seedItem.model || "",
      hsn_sac: seedItem.hsn_code || "",
      quantity: 1,
      unit: seedItem.unit || "Nos",
      quoted_rate: 1000000,
      gst_rate: Number(seedItem.gst_rate || 18),
      required_delivery_date: "2026-06-25",
      remarks: "Seed order item for Phase 2 sample order."
    }],
    remarks: "Phase 2 sample order for profitability testing."
  });

  createRecord(db, "procurements", {
    company_id: effectiveCompanyId,
    order_id: order.id,
    purchase_date: "2026-06-10",
    supplier_id: supplier.id,
    purchase_invoice_number: "PIS-1001",
    purchase_value: 700000,
    purchase_gst: 126000,
    freight: 12000,
    loading_charges: 3000,
    amount_paid: 400000,
    remarks: "Partial procurement payment made."
  });

  const heads = db.prepare("SELECT id, expense_head_name, default_calculation_method, default_percentage, category FROM expense_heads").all();
  heads.filter((head) => ["Authorization", "L1 Expense", "Work Incentive", "Commission"].includes(head.expense_head_name)).forEach((head) => {
    createRecord(db, "expense_entries", {
      company_id: effectiveCompanyId,
      order_id: order.id,
      expense_head_id: head.id,
      expense_category: head.category,
      calculation_method: head.default_calculation_method,
      percentage: head.default_percentage,
      fixed_amount: 0,
      remarks: "Seeded default expense."
    });
  });

  createRecord(db, "invoices", {
    company_id: effectiveCompanyId,
    order_id: order.id,
    invoice_number: "GII-INV-001",
    invoice_date: "2026-06-15",
    billing_value: 1000000,
    gst_rate: 18,
    invoice_type: "Tax Invoice",
    remarks: "Main supply bill."
  });

  if (bank) {
    createRecord(db, "payments", {
      company_id: effectiveCompanyId,
      order_id: order.id,
      payment_date: "2026-06-20",
      payment_amount: 350000,
      payment_mode: "NEFT",
      utr_number: "UTR10001",
      bank_id: bank.id,
      remarks: "First partial receipt."
    });
  }
}

function seedPhaseThreeAccountingFlow(db) {
  const order = db.prepare("SELECT * FROM supply_orders ORDER BY id LIMIT 1").get();
  if (!order) return;
  const existing = db.prepare("SELECT id FROM vouchers WHERE source_module IN ('billing', 'procurement', 'payment', 'supplier_payment', 'expense') LIMIT 1").get();
  if (existing) return;
  const companyId = order.company_id || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id;
  if (!companyId) return;

  const invoice = db.prepare("SELECT * FROM invoices WHERE order_id = ? ORDER BY id LIMIT 1").get(order.id);
  const procurement = db.prepare("SELECT * FROM procurements WHERE order_id = ? ORDER BY id LIMIT 1").get(order.id);
  const payment = db.prepare("SELECT * FROM payments WHERE order_id = ? ORDER BY id LIMIT 1").get(order.id);
  const bank = db.prepare("SELECT id FROM banks ORDER BY id LIMIT 1").get();
  if (!invoice || !procurement || !payment) return;

  ensureNormalizedSeedLines(db, companyId, order, procurement, invoice);
  postPurchaseVoucher(db, procurement.id);
  postSalesVoucher(db, invoice.id);
  postReceiptVoucher(db, payment.id, invoice.id);
  postExpenseAccrualsForOrder(db, order.id);
  const supplierPayment = createSupplierPayment(db, {
    company_id: companyId,
    supplier_id: procurement.supplier_id,
    payment_date: "2026-06-21",
    bank_account_id: bank?.id || null,
    payment_mode: "NEFT",
    utr_number: "SUPP-UTR-1001",
    amount_paid: Number(procurement.amount_paid || 0),
    remarks: "Seed supplier payment"
  });
  allocateSupplierPayment(db, supplierPayment.id, procurement.id, Number(procurement.amount_paid || 0));
}

function ensureNormalizedSeedLines(db, companyId, order, procurement, invoice) {
  const item = db.prepare("SELECT id, item_name, unit, gst_rate FROM items ORDER BY id LIMIT 1").get();
  if (!item) return;
  const orderItem = db.prepare("SELECT id FROM order_items WHERE order_id = ? LIMIT 1").get(order.id);
  if (!orderItem) {
    const taxable = Number(invoice.billing_value || 0);
    const gstRate = Number(invoice.gst_rate || 0);
    db.prepare(`
      INSERT INTO order_items (company_id, order_id, item_id, item_description, quantity, unit, quoted_rate, gst_rate, taxable_value, gst_amount, gross_value, remarks)
      VALUES (@company_id, @order_id, @item_id, @item_description, @quantity, @unit, @quoted_rate, @gst_rate, @taxable_value, @gst_amount, @gross_value, @remarks)
    `).run({
      company_id: companyId,
      order_id: order.id,
      item_id: item.id,
      item_description: item.item_name,
      quantity: 1,
      unit: item.unit,
      quoted_rate: taxable,
      gst_rate: gstRate,
      taxable_value: taxable,
      gst_amount: taxable * gstRate / 100,
      gross_value: taxable + taxable * gstRate / 100,
      remarks: "Seed normalized order item"
    });
  }
  const orderItemId = db.prepare("SELECT id FROM order_items WHERE order_id = ? LIMIT 1").get(order.id).id;
  if (!db.prepare("SELECT id FROM procurement_items WHERE procurement_id = ? LIMIT 1").get(procurement.id)) {
    const taxable = Number(procurement.purchase_value || 0);
    const gstAmount = Number(procurement.purchase_gst || 0);
    const gstRate = taxable ? (gstAmount / taxable) * 100 : 0;
    db.prepare(`
      INSERT INTO procurement_items (company_id, procurement_id, order_id, order_item_id, item_id, quantity, purchase_rate, gst_rate, taxable_value, gst_amount, gross_value, freight, loading_charges, other_cost, landed_cost)
      VALUES (@company_id, @procurement_id, @order_id, @order_item_id, @item_id, @quantity, @purchase_rate, @gst_rate, @taxable_value, @gst_amount, @gross_value, @freight, @loading_charges, @other_cost, @landed_cost)
    `).run({
      company_id: companyId,
      procurement_id: procurement.id,
      order_id: order.id,
      order_item_id: orderItemId,
      item_id: item.id,
      quantity: 1,
      purchase_rate: taxable,
      gst_rate: gstRate,
      taxable_value: taxable,
      gst_amount: gstAmount,
      gross_value: taxable + gstAmount,
      freight: Number(procurement.freight || 0),
      loading_charges: Number(procurement.loading_charges || 0),
      other_cost: 0,
      landed_cost: taxable + Number(procurement.freight || 0) + Number(procurement.loading_charges || 0)
    });
  }
  if (!db.prepare("SELECT id FROM invoice_items WHERE billing_id = ? LIMIT 1").get(invoice.id)) {
    const taxable = Number(invoice.billing_value || 0);
    const gstRate = Number(invoice.gst_rate || 0);
    const gstAmount = taxable * gstRate / 100;
    db.prepare(`
      INSERT INTO invoice_items (company_id, billing_id, order_id, order_item_id, item_id, quantity, billing_rate, gst_rate, taxable_value, cgst, sgst, igst, gst_amount, gross_value)
      VALUES (@company_id, @billing_id, @order_id, @order_item_id, @item_id, @quantity, @billing_rate, @gst_rate, @taxable_value, @cgst, @sgst, @igst, @gst_amount, @gross_value)
    `).run({
      company_id: companyId,
      billing_id: invoice.id,
      order_id: order.id,
      order_item_id: orderItemId,
      item_id: item.id,
      quantity: 1,
      billing_rate: taxable,
      gst_rate: gstRate,
      taxable_value: taxable,
      cgst: gstAmount / 2,
      sgst: gstAmount / 2,
      igst: 0,
      gst_amount: gstAmount,
      gross_value: taxable + gstAmount
    });
  }
}

function seedPhase7Inventory(db) {
  const company = db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get();
  const supplier = db.prepare("SELECT id FROM suppliers ORDER BY id LIMIT 1").get();
  const order = db.prepare("SELECT id, department_id FROM supply_orders ORDER BY id LIMIT 1").get();
  const warehouse = db.prepare("SELECT id FROM warehouses WHERE warehouse_name = 'Main Store' ORDER BY id LIMIT 1").get();
  if (!company || !supplier || !warehouse) return;
  const stockCount = db.prepare("SELECT COUNT(*) AS count FROM stock_ledger").get().count;
  if (stockCount) return;

  const items = [
    { item_name: "Printer", brand: "HP", model: "LaserJet Pro", hsn_code: "8443", gst_rate: 18, unit: "Nos", category: "IT Hardware", reorder_level: 3, minimum_stock_level: 2, maximum_stock_level: 20, track_serial_number: 1, warranty_period: 12 },
    { item_name: "Laptop", brand: "Dell", model: "Latitude", hsn_code: "8471", gst_rate: 18, unit: "Nos", category: "IT Hardware", reorder_level: 2, minimum_stock_level: 1, maximum_stock_level: 15, track_serial_number: 1, warranty_period: 36 },
    { item_name: "UPS", brand: "APC", model: "Back-UPS", hsn_code: "8504", gst_rate: 18, unit: "Nos", category: "Power Backup", reorder_level: 5, minimum_stock_level: 3, maximum_stock_level: 30, track_batch_number: 1, warranty_period: 24 }
  ].map((payload) => {
    const existing = db.prepare("SELECT id FROM items WHERE item_name = ?").get(payload.item_name);
    if (existing) return existing;
    const result = createRecord(db, "items", { ...payload, opening_stock: 0, opening_rate: 0, opening_value: 0, status: "active" });
    return { id: result.id };
  });

  const inward = createRecord(db, "stock_inwards", {
    company_id: company.id,
    order_id: order?.id || null,
    supplier_id: supplier.id,
    item_id: items[0].id,
    warehouse_id: warehouse.id,
    inward_date: "2026-06-10",
    purchase_invoice_number: "INV-STOCK-001",
    quantity: 5,
    rate: 18000,
    gst_rate: 18,
    landed_cost: 90000,
    serial_number: "PRN-DEMO-001",
    remarks: "Seed stock inward"
  });
  postStockInward(db, inward.id);

  const upsInward = createRecord(db, "stock_inwards", {
    company_id: company.id,
    order_id: order?.id || null,
    supplier_id: supplier.id,
    item_id: items[2].id,
    warehouse_id: warehouse.id,
    inward_date: "2026-06-10",
    purchase_invoice_number: "INV-STOCK-002",
    quantity: 3,
    rate: 4500,
    gst_rate: 18,
    landed_cost: 13500,
    batch_number: "UPS-BATCH-0626",
    remarks: "Seed low-stock batch inward"
  });
  postStockInward(db, upsInward.id);

  if (order) {
    const outward = createRecord(db, "stock_outwards", {
      company_id: company.id,
      order_id: order.id,
      department_id: order.department_id,
      item_id: items[0].id,
      warehouse_id: warehouse.id,
      issue_date: "2026-06-11",
      delivery_challan_number: "DC-DEMO-001",
      quantity_issued: 1,
      serial_number: "PRN-DEMO-001",
      remarks: "Seed stock issue"
    });
    postStockOutward(db, outward.id);
  }
}

function insertIfEmpty(db, table, payload) {
  const count = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  if (!count) createRecord(db, table, payload);
}

export function assertTable(table) {
  if (!ALL_TABLES[table]) {
    throw new Error(`Unsupported table: ${table}`);
  }
}

export function assertWriteAllowed(table, action) {
  if (WRITE_POLICY.accountingReadOnly.has(table)) {
    throw new Error(`${table} is accounting-controlled and cannot be modified through generic ${action}`);
  }
  if (!WRITE_POLICY.master.has(table) && !WRITE_POLICY.transaction.has(table)) {
    throw new Error(`No generic ${action} permission for ${table}`);
  }
}

export function cleanPayload(table, payload) {
  assertTable(table);
  payload = normalizePayloadForTable(table, payload);
  const allowed = ALL_TABLES[table].fields;
  const cleaned = {};
  allowed.forEach((field) => {
    cleaned[field] = payload[field] ?? "";
  });
  [
    "company_id",
    "financial_year_id",
    "order_id",
    "billing_id",
    "bank_id",
    "department_id",
    "employee_id",
    "supplier_id",
    "expense_head_id",
    "procurement_id",
    "order_item_id",
    "item_id",
    "warehouse_id",
    "default_warehouse_id"
  ].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(cleaned, field) && cleaned[field] === "") cleaned[field] = null;
  });
  ALL_TABLES[table].required.forEach((field) => {
    if (!String(cleaned[field] ?? "").trim()) {
      throw new Error(`${field.replaceAll("_", " ")} is required`);
    }
  });
  return cleaned;
}

function normalizePayloadForTable(table, payload = {}) {
  if (["stock_inwards", "stock_outwards", "stock_adjustments", "stock_returns"].includes(table)) {
    const normalized = { ...payload };
    ["company_id", "procurement_id", "order_id", "supplier_id", "department_id", "item_id", "warehouse_id"].forEach((field) => {
      if (normalized[field] === "" || normalized[field] === undefined) normalized[field] = null;
    });
    normalized.posting_status ||= "Draft";
    normalized.approval_status ||= table === "stock_adjustments" ? "Pending Approval" : "Draft";
    return normalized;
  }
  if (table !== "suppliers") return payload;
  const normalized = { ...payload };
  normalized.supplier_name ||= normalized.supplier_account_name || normalized.beneficiary_account_name || normalized.account_name || "";
  normalized.supplier_type ||= normalized.beneficiary_type || "";
  normalized.supplier_code ||= normalized.beneficiary_code || "";
  normalized.supplier_account_name ||= normalized.beneficiary_account_name || normalized.supplier_name || "";
  normalized.supplier_account_number ||= normalized.beneficiary_account_number || normalized.account_number || "";
  normalized.supplier_bank_name ||= normalized.beneficiary_bank_name || normalized.bank_name || "";
  normalized.supplier_bank_ifsc_code ||= normalized.beneficiary_ifsc_code || normalized.ifsc || "";
  normalized.supplier_branch ||= normalized.beneficiary_branch || normalized.branch || "";
  normalized.supplier_contact ||= normalized.beneficiary_contact || normalized.contact || "";
  normalized.status ||= "active";
  if (!normalized.bank_details && (normalized.supplier_account_number || normalized.supplier_bank_name || normalized.supplier_bank_ifsc_code || normalized.supplier_branch)) {
    normalized.bank_details = [
      `Account Name: ${normalized.supplier_account_name || "-"}`,
      `Account Number: ${normalized.supplier_account_number || "-"}`,
      `Bank: ${normalized.supplier_bank_name || "-"}`,
      `IFSC: ${normalized.supplier_bank_ifsc_code || "-"}`,
      `Branch: ${normalized.supplier_branch || "-"}`
    ].join("; ");
  }
  if (!normalized.contact_details && normalized.supplier_contact) normalized.contact_details = normalized.supplier_contact;
  return normalized;
}

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function supplyOrderNeedsItems(status) {
  return !["", "Draft", "Received"].includes(String(status || "").trim());
}

function extractSupplyOrderItems(payload = {}) {
  if (Array.isArray(payload.order_items)) return payload.order_items;
  if (Array.isArray(payload.items)) return payload.items;
  return null;
}

function hasSupplyOrderItemInput(line = {}) {
  return [
    line.item_id,
    line.item_description,
    line.description,
    line.brand,
    line.model,
    line.hsn_sac,
    line.hsn,
    line.quantity,
    line.rate,
    line.quoted_rate,
    line.gst_rate,
    line.required_delivery_date,
    line.remarks
  ].some((value) => String(value ?? "").trim() !== "" && String(value ?? "").trim() !== "0");
}

function prepareSupplyOrderItems(db, companyId, orderId, lines, status) {
  const source = Array.isArray(lines) ? lines.filter(hasSupplyOrderItemInput) : [];
  if (supplyOrderNeedsItems(status) && !source.length) {
    throw new Error("At least one order item is required before moving this order beyond Received/Draft.");
  }
  const prepared = source.map((line, index) => {
    const itemId = line.item_id ? Number(line.item_id) : null;
    const item = itemId ? db.prepare("SELECT * FROM items WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(itemId) : null;
    const quantity = Number(line.quantity || 0);
    const quotedRate = Number(line.rate ?? line.quoted_rate ?? 0);
    const gstRate = Number(line.gst_rate ?? item?.gst_rate ?? 0);
    const remarks = String(line.remarks || "").trim();
    if (quantity <= 0) throw new Error(`Order item ${index + 1}: quantity must be greater than zero.`);
    if (quotedRate <= 0) throw new Error(`Order item ${index + 1}: rate must be greater than zero.`);
    if (!Number.isFinite(gstRate) || gstRate < 0) throw new Error(`Order item ${index + 1}: GST rate must be numeric and non-negative.`);
    if (item && String(item.gst_rate ?? "") !== "" && Number(item.gst_rate || 0) !== gstRate && !remarks) {
      throw new Error(`Order item ${index + 1}: GST override requires item remarks.`);
    }
    const taxableValue = money(quantity * quotedRate);
    const gstAmount = money(taxableValue * gstRate / 100);
    return {
      company_id: companyId,
      order_id: orderId || null,
      item_id: itemId,
      item_description: String(line.item_description || line.description || item?.item_name || "").trim(),
      brand: String(line.brand || item?.brand || "").trim(),
      model: String(line.model || item?.model || "").trim(),
      hsn_sac: String(line.hsn_sac || line.hsn || item?.hsn_code || "").trim(),
      quantity,
      unit: String(line.unit || item?.unit || "").trim(),
      quoted_rate: quotedRate,
      gst_rate: gstRate,
      taxable_value: taxableValue,
      gst_amount: gstAmount,
      gross_value: money(taxableValue + gstAmount),
      required_delivery_date: String(line.required_delivery_date || "").trim() || null,
      remarks
    };
  });
  const totals = prepared.reduce((sum, line) => ({
    total_quantity: money(sum.total_quantity + Number(line.quantity || 0)),
    order_taxable_value: money(sum.order_taxable_value + Number(line.taxable_value || 0)),
    order_gst_amount: money(sum.order_gst_amount + Number(line.gst_amount || 0)),
    order_gross_value: money(sum.order_gross_value + Number(line.gross_value || 0))
  }), { total_quantity: 0, order_taxable_value: 0, order_gst_amount: 0, order_gross_value: 0 });
  return { rows: prepared, totals };
}

function replaceSupplyOrderItems(db, orderId, companyId, rows) {
  db.prepare("UPDATE order_items SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE order_id = ? AND COALESCE(is_deleted, 0) = 0").run(orderId);
  const insert = db.prepare(`
    INSERT INTO order_items (
      company_id, order_id, item_id, item_description, brand, model, hsn_sac, quantity, unit,
      quoted_rate, gst_rate, taxable_value, gst_amount, gross_value, required_delivery_date, remarks
    )
    VALUES (
      @company_id, @order_id, @item_id, @item_description, @brand, @model, @hsn_sac, @quantity, @unit,
      @quoted_rate, @gst_rate, @taxable_value, @gst_amount, @gross_value, @required_delivery_date, @remarks
    )
  `);
  rows.forEach((line) => insert.run({ ...line, company_id: companyId, order_id: orderId }));
}

export function createRecord(db, table, payload) {
  assertWriteAllowed(table, "create");
  if (table === "supply_orders") return createSupplyOrderRecord(db, payload);
  const data = cleanPayload(table, payload);
  const requiresCompanyContext = TRANSACTION_TABLES[table] || COMPANY_SPECIFIC_MASTER_TABLES.has(table);
  if (requiresCompanyContext && !data.company_id) {
    throw new Error("Company context is required. Select Current Company before saving this record.");
  }
  if (["procurements", "expense_entries", "invoices", "payments", "stock_inwards", "stock_outwards", "stock_adjustments", "stock_returns"].includes(table)) {
    data.posting_status = data.posting_status || "Draft";
    data.approval_status = data.approval_status || "Draft";
    data.posting_error = data.posting_error || null;
    assertTransactionYearOpen(db, table, data);
    if (["procurements", "expense_entries", "invoices", "payments"].includes(table)) {
      data.financial_year_id = data.financial_year_id || financialYearForDate(db, data.company_id, transactionDateFor(table, data))?.id || null;
    }
  }
  if (table === "payments" && data.utr_number) {
    const existing = db.prepare("SELECT id FROM payments WHERE utr_number = ? AND is_deleted = 0").get(data.utr_number);
    if (existing) throw new Error("UTR number must be unique");
  }
  if (table === "invoices") {
    const existing = db.prepare(`
      SELECT id FROM invoices
      WHERE company_id = ? AND invoice_number = ? AND COALESCE(financial_year_id, 0) = COALESCE(?, 0) AND is_deleted = 0
    `).get(data.company_id, data.invoice_number, data.financial_year_id);
    if (existing) throw new Error("Invoice number must be unique per company and financial year");
  }
  const columns = Object.keys(data);
  const placeholders = columns.map((column) => `@${column}`).join(", ");
  const statement = db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`);
  const result = statement.run(data);
  const record = getRecord(db, table, result.lastInsertRowid);
  if (table === "companies") {
    seedAccounts(db, record.id);
  }
  if (table === "supply_orders") {
    autoReserveOrderStock(db, record.id);
  }
  auditLog(db, { company_id: data.company_id, action: "create", table_name: table, record_id: result.lastInsertRowid, new_value: JSON.stringify(record) });
  return record;
}

function createSupplyOrderRecord(db, payload = {}) {
  const transaction = db.transaction(() => {
    const itemLines = extractSupplyOrderItems(payload);
    const data = cleanPayload("supply_orders", payload);
    if (!data.company_id) throw new Error("Company context is required. Select Current Company before saving this record.");
    data.posting_status = data.posting_status || "Draft";
    const prepared = prepareSupplyOrderItems(db, data.company_id, null, itemLines || [], data.order_status);
    Object.assign(data, prepared.totals);
    const columns = Object.keys(data);
    const placeholders = columns.map((column) => `@${column}`).join(", ");
    const result = db.prepare(`INSERT INTO supply_orders (${columns.join(", ")}) VALUES (${placeholders})`).run(data);
    replaceSupplyOrderItems(db, result.lastInsertRowid, data.company_id, prepared.rows);
    autoReserveOrderStock(db, result.lastInsertRowid);
    const record = getRecord(db, "supply_orders", result.lastInsertRowid);
    auditLog(db, { company_id: data.company_id, action: "create", table_name: "supply_orders", record_id: result.lastInsertRowid, new_value: JSON.stringify({ ...record, order_items: prepared.rows.length }) });
    return record;
  });
  return transaction();
}

export function createLedgerAccount(db, payload = {}) {
  const companyId = Number(payload.company_id || 0);
  const accountName = String(payload.account_name || "").trim();
  const accountType = ["Asset", "Liability", "Equity", "Income", "Expense"].includes(payload.account_type) ? payload.account_type : "Expense";
  const normalBalance = ["Debit", "Credit"].includes(payload.normal_balance)
    ? payload.normal_balance
    : ["Liability", "Equity", "Income"].includes(accountType) ? "Credit" : "Debit";
  if (!companyId) throw new Error("Company is required for ledger account quick create");
  if (!accountName) throw new Error("Account name is required");
  const duplicate = db.prepare(`
    SELECT * FROM accounts
    WHERE company_id = ? AND is_deleted = 0
      AND (LOWER(account_name) = LOWER(?) OR (? <> '' AND account_code = ?))
    LIMIT 1
  `).get(companyId, accountName, String(payload.account_code || "").trim(), String(payload.account_code || "").trim());
  if (duplicate) throw new Error("Similar ledger account already exists");
  const accountCode = String(payload.account_code || "").trim() || nextQuickLedgerAccountCode(db, companyId, accountType);
  const result = db.prepare(`
    INSERT INTO accounts (company_id, account_code, account_name, account_type, normal_balance, opening_balance, status)
    VALUES (@company_id, @account_code, @account_name, @account_type, @normal_balance, @opening_balance, 'active')
  `).run({
    company_id: companyId,
    account_code: accountCode,
    account_name: accountName,
    account_type: accountType,
    normal_balance: normalBalance,
    opening_balance: Number(payload.opening_balance || 0)
  });
  const record = db.prepare("SELECT * FROM accounts WHERE id = ?").get(result.lastInsertRowid);
  auditLog(db, {
    company_id: companyId,
    user_id: payload.user_id || null,
    action: "quick_create",
    module: payload.source_module || "ledger_account",
    table_name: "accounts",
    record_id: result.lastInsertRowid,
    new_value: JSON.stringify(record)
  });
  return record;
}

function nextQuickLedgerAccountCode(db, companyId, accountType) {
  const prefix = { Asset: "18", Liability: "28", Equity: "38", Income: "48", Expense: "58" }[accountType] || "58";
  const last = db.prepare(`
    SELECT account_code FROM accounts
    WHERE company_id = ? AND account_code LIKE ?
    ORDER BY CAST(account_code AS INTEGER) DESC
    LIMIT 1
  `).get(companyId, `${prefix}%`)?.account_code;
  const next = last ? Number(last) + 10 : Number(`${prefix}00`);
  return String(next);
}

export function updateRecord(db, table, id, payload) {
  assertWriteAllowed(table, "update");
  if (table === "supply_orders") return updateSupplyOrderRecord(db, id, payload);
  const oldRecord = getRecord(db, table, id);
  assertRecordEditable(table, oldRecord);
  const data = cleanPayload(table, payload);
  const requiresCompanyContext = TRANSACTION_TABLES[table] || COMPANY_SPECIFIC_MASTER_TABLES.has(table);
  if (requiresCompanyContext && !data.company_id) {
    data.company_id = oldRecord?.company_id || null;
  }
  if (requiresCompanyContext && !data.company_id) {
    throw new Error("Company context is required. Select Current Company before updating this record.");
  }
  if (["procurements", "expense_entries", "invoices", "payments", "stock_inwards", "stock_outwards", "stock_adjustments", "stock_returns"].includes(table)) {
    data.posting_status = oldRecord?.posting_status || data.posting_status || "Draft";
    data.approval_status = oldRecord?.approval_status || data.approval_status || "Draft";
    data.posting_error = oldRecord?.posting_error || data.posting_error || null;
    assertTransactionYearOpen(db, table, { ...oldRecord, ...data });
    if (["procurements", "expense_entries", "invoices", "payments"].includes(table)) {
      data.financial_year_id = oldRecord?.financial_year_id || financialYearForDate(db, data.company_id, transactionDateFor(table, data))?.id || null;
    }
  }
  const assignments = Object.keys(data).map((field) => `${field} = @${field}`).join(", ");
  db.prepare(`UPDATE ${table} SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run({ ...data, id });
  const record = getRecord(db, table, id);
  auditLog(db, { company_id: data.company_id, action: "update", table_name: table, record_id: id, old_value: JSON.stringify(oldRecord), new_value: JSON.stringify(record) });
  return record;
}

function updateSupplyOrderRecord(db, id, payload = {}) {
  const transaction = db.transaction(() => {
    const oldRecord = getRecord(db, "supply_orders", id);
    assertRecordEditable("supply_orders", oldRecord);
    assertSupplyOrderNotLinked(db, id);
    const itemLines = extractSupplyOrderItems(payload);
    const data = cleanPayload("supply_orders", payload);
    data.company_id = data.company_id || oldRecord?.company_id || null;
    if (!data.company_id) throw new Error("Company context is required. Select Current Company before updating this record.");
    const prepared = prepareSupplyOrderItems(db, data.company_id, id, itemLines || [], data.order_status);
    Object.assign(data, prepared.totals);
    const assignments = Object.keys(data).map((field) => `${field} = @${field}`).join(", ");
    db.prepare(`UPDATE supply_orders SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run({ ...data, id });
    replaceSupplyOrderItems(db, id, data.company_id, prepared.rows);
    autoReserveOrderStock(db, id);
    const record = getRecord(db, "supply_orders", id);
    auditLog(db, { company_id: data.company_id, action: "update", table_name: "supply_orders", record_id: id, old_value: JSON.stringify(oldRecord), new_value: JSON.stringify({ ...record, order_items: prepared.rows.length }) });
    return record;
  });
  return transaction();
}

export function deleteRecord(db, table, id) {
  assertTable(table);
  assertWriteAllowed(table, "delete");
  const record = getRecord(db, table, id);
  assertRecordEditable(table, record);
  if (table === "supply_orders") {
    assertSupplyOrderNotLinked(db, id);
  }
  if (MASTER_TABLES[table] && masterRecordIsReferenced(db, table, id)) {
    const changes = db.prepare(`UPDATE ${table} SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id).changes;
    auditLog(db, { action: "deactivate", table_name: table, record_id: id, old_value: JSON.stringify(record), new_value: "inactive_linked_master" });
    return changes > 0;
  }
  if (columnExists(db, table, "is_deleted")) {
    const changes = db.prepare(`UPDATE ${table} SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id).changes;
    auditLog(db, { action: "delete", table_name: table, record_id: id, old_value: "", new_value: "soft_delete" });
    return changes > 0;
  }
  auditLog(db, { action: "hard_delete", table_name: table, record_id: id, old_value: JSON.stringify(record), new_value: "hard_delete" });
  return db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id).changes > 0;
}

function masterRecordIsReferenced(db, table, id) {
  const references = {
    companies: [
      ["supply_orders", "company_id"], ["procurements", "company_id"], ["expense_entries", "company_id"], ["invoices", "company_id"], ["payments", "company_id"],
      ["vouchers", "company_id"], ["ledger_entries", "company_id"], ["cash_bank_ledger", "company_id"], ["documents", "company_id"], ["bank_statement_imports", "company_id"]
    ],
    employees: [["supply_orders", "employee_id"]],
    government_departments: [["supply_orders", "department_id"], ["receivables", "department_id"], ["stock_outwards", "department_id"], ["stock_returns", "department_id"]],
    suppliers: [["procurements", "supplier_id"], ["supplier_payments", "supplier_id"], ["stock_inwards", "supplier_id"], ["stock_returns", "supplier_id"], ["batches", "supplier_id"]],
    items: [["order_items", "item_id"], ["procurement_items", "item_id"], ["invoice_items", "item_id"], ["stock_inwards", "item_id"], ["stock_outwards", "item_id"], ["stock_adjustments", "item_id"], ["stock_returns", "item_id"], ["stock_ledger", "item_id"], ["serial_numbers", "item_id"], ["batches", "item_id"]],
    warehouses: [["stock_inwards", "warehouse_id"], ["stock_outwards", "warehouse_id"], ["stock_adjustments", "warehouse_id"], ["stock_returns", "warehouse_id"], ["stock_ledger", "warehouse_id"], ["serial_numbers", "warehouse_id"], ["batches", "warehouse_id"]],
    expense_heads: [["expense_entries", "expense_head_id"]],
    banks: [["payments", "bank_id"], ["supplier_payments", "bank_account_id"], ["expense_entries", "bank_account_id"], ["cash_bank_ledger", "bank_account_id"], ["bank_statement_imports", "bank_id"], ["bank_statement_entries", "bank_id"]]
  };
  return (references[table] || []).some(([refTable, column]) => {
    if (!tableExists(db, refTable) || !columnExists(db, refTable, column)) return false;
    const deletedFilter = columnExists(db, refTable, "is_deleted") ? "AND COALESCE(is_deleted, 0) = 0" : "";
    return Boolean(db.prepare(`SELECT 1 FROM ${refTable} WHERE ${column} = ? ${deletedFilter} LIMIT 1`).get(id));
  });
}

function assertRecordEditable(table, record) {
  if (!record) return;
  if (["procurements", "expense_entries", "invoices", "payments", "stock_inwards", "stock_outwards", "stock_adjustments", "stock_returns"].includes(table) && ["Posted", "Reversed"].includes(record.posting_status)) {
    throw new Error("Posted transactions are locked. Use reversal or correction voucher.");
  }
  if (table === "supply_orders" && ["Locked", "Posted", "Reversed"].includes(record.posting_status)) {
    throw new Error("Supply order is locked and cannot be modified.");
  }
  if (table === "vouchers" && ["Posted", "Reversed"].includes(record.status)) {
    throw new Error("Posted vouchers cannot be edited or deleted. Use reversal.");
  }
}

function assertSupplyOrderNotLinked(db, id) {
  const linkedTables = [
    ["procurements", "order_id"],
    ["invoices", "order_id"],
    ["payments", "order_id"],
    ["expense_entries", "order_id"],
    ["stock_inwards", "order_id"],
    ["stock_outwards", "order_id"],
    ["stock_returns", "order_id"]
  ];
  for (const [refTable, column] of linkedTables) {
    if (!tableExists(db, refTable) || !columnExists(db, refTable, column)) continue;
    const deletedFilter = columnExists(db, refTable, "is_deleted") ? "AND COALESCE(is_deleted, 0) = 0" : "";
    const found = db.prepare(`SELECT 1 FROM ${refTable} WHERE ${column} = ? ${deletedFilter} LIMIT 1`).get(id);
    if (found) {
      throw new Error("Supply order has linked transactions and cannot be modified or deleted.");
    }
  }
}

export function getRecord(db, table, id) {
  assertTable(table);
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
}

export function listRecords(db, table, filters = {}) {
  assertTable(table);
  const search = String(filters.search || "").trim().toLowerCase();
  const status = filters.status || "all";
  const companyId = Number(filters.company_id || 0);
  const fields = ALL_TABLES[table].fields;
  const where = [];
  const params = {};

  if (status !== "all" && fields.includes("status")) {
    where.push("status = @status");
    params.status = status;
  }

  if (search) {
    where.push(`(${fields.map((field) => `LOWER(COALESCE(CAST(${field} AS TEXT), '')) LIKE @search`).join(" OR ")})`);
    params.search = `%${search}%`;
  }

  if (companyId && (fields.includes("company_id") || ACCOUNTING_TABLES.has(table))) {
    where.push("company_id = @company_id");
    params.company_id = companyId;
  }

  if (ACCOUNTING_TABLES.has(table) || MASTER_TABLES[table]) {
    where.push("COALESCE(is_deleted, 0) = 0");
  }
  const finalClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  if (table === "supply_orders") {
    return db.prepare(`
      SELECT supply_orders.*,
        CASE WHEN (
          EXISTS (SELECT 1 FROM procurements p WHERE p.order_id = supply_orders.id AND COALESCE(p.is_deleted, 0) = 0)
          OR EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = supply_orders.id AND COALESCE(i.is_deleted, 0) = 0)
          OR EXISTS (SELECT 1 FROM payments pm WHERE pm.order_id = supply_orders.id AND COALESCE(pm.is_deleted, 0) = 0)
          OR EXISTS (SELECT 1 FROM expense_entries ee WHERE ee.order_id = supply_orders.id AND COALESCE(ee.is_deleted, 0) = 0)
          OR EXISTS (SELECT 1 FROM stock_inwards si WHERE si.order_id = supply_orders.id AND COALESCE(si.is_deleted, 0) = 0)
          OR EXISTS (SELECT 1 FROM stock_outwards so2 WHERE so2.order_id = supply_orders.id AND COALESCE(so2.is_deleted, 0) = 0)
          OR EXISTS (SELECT 1 FROM stock_returns sr WHERE sr.order_id = supply_orders.id AND COALESCE(sr.is_deleted, 0) = 0)
        ) THEN 1 ELSE 0 END AS order_locked,
        COALESCE((SELECT SUM(oi.quantity) FROM order_items oi WHERE oi.order_id = supply_orders.id AND COALESCE(oi.is_deleted, 0) = 0), 0) computed_total_quantity,
        COALESCE((SELECT SUM(oi.taxable_value) FROM order_items oi WHERE oi.order_id = supply_orders.id AND COALESCE(oi.is_deleted, 0) = 0), 0) computed_order_taxable_value,
        COALESCE((SELECT SUM(oi.gst_amount) FROM order_items oi WHERE oi.order_id = supply_orders.id AND COALESCE(oi.is_deleted, 0) = 0), 0) computed_order_gst_amount,
        COALESCE((SELECT SUM(oi.gross_value) FROM order_items oi WHERE oi.order_id = supply_orders.id AND COALESCE(oi.is_deleted, 0) = 0), 0) computed_order_gross_value,
        COALESCE((SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = supply_orders.id AND COALESCE(oi.is_deleted, 0) = 0), 0) order_item_count,
        COALESCE((
          SELECT json_group_array(json_object(
            'id', oi.id,
            'item_id', oi.item_id,
            'item_description', oi.item_description,
            'brand', oi.brand,
            'model', oi.model,
            'hsn_sac', oi.hsn_sac,
            'quantity', oi.quantity,
            'unit', oi.unit,
            'quoted_rate', oi.quoted_rate,
            'gst_rate', oi.gst_rate,
            'taxable_value', oi.taxable_value,
            'gst_amount', oi.gst_amount,
            'gross_value', oi.gross_value,
            'required_delivery_date', oi.required_delivery_date,
            'remarks', oi.remarks,
            'item_name', it.item_name
          ))
          FROM order_items oi
          LEFT JOIN items it ON it.id = oi.item_id
          WHERE oi.order_id = supply_orders.id AND COALESCE(oi.is_deleted, 0) = 0
        ), '[]') order_items_json
      FROM supply_orders
      ${finalClause}
      ORDER BY supply_orders.id DESC
    `).all(params);
  }
  return db.prepare(`SELECT * FROM ${table} ${finalClause} ORDER BY id DESC`).all(params);
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

export function previewTallyStockXml(filePath) {
  const extension = path.extname(filePath || "").toLowerCase();
  if (extension !== ".xml") throw new Error("Only Tally XML files are supported in this assistant");
  if (!fs.existsSync(filePath)) throw new Error("Tally XML file was not found");
  const xmlText = readXmlText(filePath);
  return parseTallyStockItemsXml(xmlText, path.basename(filePath));
}

export function previewTallyMasterMigration(db, files = [], context = {}) {
  enforcePermission(db, "import", { ...context, module: "tally_migration_assistant", table_name: "imports" });
  const sourceFiles = Array.isArray(files) ? files.filter((file) => file?.filePath) : [];
  if (!sourceFiles.length) throw new Error("Select at least one Tally export file for migration preview");

  const aggregate = {
    companies: [],
    ledgers: [],
    ledgerGroups: [],
    units: [],
    stockGroups: [],
    godowns: [],
    stockItems: [],
    referenceFiles: [],
    errors: [],
    fileSummaries: []
  };

  sourceFiles.forEach((file) => {
    const filePath = file.filePath;
    const fileName = path.basename(filePath || "");
    const extension = path.extname(fileName).toLowerCase();
    try {
      if (!fs.existsSync(filePath)) throw new Error("File not found");
      if (extension === ".xml") {
        const xmlText = readXmlText(filePath);
        const sourceCompany = tallyTagValue(xmlText, "SVCURRENTCOMPANY") || tallyTagValue(xmlText, "COMPANYNAME") || "";
        if (sourceCompany) aggregate.companies.push(tallyCompanyCandidate(db, sourceCompany, fileName));
        namedTallyBlocks(xmlText, "COMPANY").forEach((block) => {
          const name = block.name || tallyTagValue(block.body, "NAME") || tallyTagValue(block.body, "COMPANYNAME");
          if (name) aggregate.companies.push(tallyCompanyCandidate(db, name, fileName, block.body));
        });
        uniqueNamedTallyBlocks(xmlText, "GROUP").forEach((block) => aggregate.ledgerGroups.push({ name: block.name, parent: tallyTagValue(block.body, "PARENT") || "", source_file: fileName }));
        uniqueNamedTallyBlocks(xmlText, "UNIT").forEach((block) => aggregate.units.push({
          name: block.name,
          formal_name: tallyTagValue(block.body, "ORIGINALNAME") || block.name,
          uqc: tallyTagValue(block.body, "GSTREPUQC") || "",
          source_file: fileName
        }));
        uniqueNamedTallyBlocks(xmlText, "GODOWN").forEach((block) => aggregate.godowns.push(tallyGodownCandidate(db, block, fileName)));
        uniqueNamedTallyBlocks(xmlText, "STOCKGROUP").forEach((block) => aggregate.stockGroups.push({ name: block.name, parent: tallyTagValue(block.body, "PARENT") || "", source_file: fileName }));
        namedTallyBlocks(xmlText, "LEDGER").forEach((block, index) => aggregate.ledgers.push(tallyLedgerCandidate(db, block, index, fileName)));
        const stockPreview = parseTallyStockItemsXml(xmlText, fileName);
        stockPreview.items.forEach((item) => aggregate.stockItems.push(tallyStockItemCandidate(db, item, fileName)));
        aggregate.fileSummaries.push({ file_name: fileName, file_type: file.type || "Tally XML", row_count: stockPreview.items.length + aggregate.ledgers.filter((row) => row.source_file === fileName).length, status: "Previewed" });
      } else if ([".csv", ".xlsx", ".xls"].includes(extension)) {
        const rows = parseImportFile(filePath);
        aggregate.referenceFiles.push({ file_name: fileName, file_type: file.type || extension.slice(1).toUpperCase(), rows: rows.slice(0, 50), row_count: rows.length, reference_only: true });
        aggregate.fileSummaries.push({ file_name: fileName, file_type: file.type || "Reference", row_count: rows.length, status: "Reference only" });
      } else {
        throw new Error("Unsupported file type");
      }
    } catch (error) {
      aggregate.errors.push({ file_name: fileName, error: error.message || "Unable to parse file" });
      aggregate.fileSummaries.push({ file_name: fileName, file_type: file.type || extension, row_count: 0, status: "Failed" });
    }
  });

  aggregate.companies = uniqueBy(aggregate.companies, (row) => normalizeDuplicateKey(row.tally_company_name));
  aggregate.ledgerGroups = uniqueBy(aggregate.ledgerGroups, (row) => normalizeDuplicateKey(row.name));
  aggregate.units = uniqueBy(aggregate.units, (row) => normalizeDuplicateKey(row.name));
  aggregate.stockGroups = uniqueBy(aggregate.stockGroups, (row) => normalizeDuplicateKey(row.name));
  aggregate.godowns = uniqueBy(aggregate.godowns, (row) => normalizeDuplicateKey(row.tally_godown_name));
  aggregate.ledgers = uniqueBy(aggregate.ledgers, (row) => normalizeDuplicateKey(row.tally_ledger_name));
  aggregate.stockItems = uniqueBy(aggregate.stockItems, (row) => normalizeDuplicateKey(row.item_name));

  const failedRows = aggregate.errors.length +
    aggregate.ledgers.filter((row) => row.validation_status === "Failed").length +
    aggregate.stockItems.filter((row) => row.validation_status === "Failed").length;
  const warningRows = aggregate.ledgers.filter((row) => row.validation_status === "Needs Review").length +
    aggregate.stockItems.filter((row) => row.validation_status === "Needs Review").length;
  const duplicateRows = aggregate.ledgers.filter((row) => row.duplicate_match).length +
    aggregate.stockItems.filter((row) => row.duplicate_match).length +
    aggregate.godowns.filter((row) => row.duplicate_match).length;

  return {
    source_system: "Tally Prime",
    stage: "Stage 1 - Master Migration",
    generated_at: new Date().toISOString(),
    ...aggregate,
    totals: {
      files: sourceFiles.length,
      companies: aggregate.companies.length,
      ledgerGroups: aggregate.ledgerGroups.length,
      ledgers: aggregate.ledgers.length,
      suppliers: aggregate.ledgers.filter((row) => row.suggested_master === "suppliers").length,
      departments: aggregate.ledgers.filter((row) => row.suggested_master === "government_departments").length,
      banks: aggregate.ledgers.filter((row) => row.suggested_master === "banks").length,
      expenseHeads: aggregate.ledgers.filter((row) => row.suggested_master === "expense_heads").length,
      units: aggregate.units.length,
      stockGroups: aggregate.stockGroups.length,
      warehouses: aggregate.godowns.length,
      items: aggregate.stockItems.length,
      itemMissingGst: aggregate.stockItems.filter((row) => !String(row.gst_rate || "").trim()).length,
      itemMissingHsn: aggregate.stockItems.filter((row) => !String(row.hsn_code || "").trim()).length,
      openingStockReferenceRows: aggregate.stockItems.filter((row) => row.opening_stock_qty || row.opening_stock_value).length,
      duplicateRows,
      warningRows,
      failedRows
    }
  };
}

function readXmlText(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString("utf16le").replace(/^\uFEFF/, "");
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.alloc(buffer.length - 2);
    for (let index = 2; index < buffer.length; index += 2) {
      swapped[index - 2] = buffer[index + 1] || 0;
      swapped[index - 1] = buffer[index];
    }
    return swapped.toString("utf16le").replace(/^\uFEFF/, "");
  }
  return buffer.toString("utf8").replace(/^\uFEFF/, "");
}

function parseTallyStockItemsXml(xmlText, fileName = "") {
  const sourceCompany = tallyTagValue(xmlText, "SVCURRENTCOMPANY") || tallyTagValue(xmlText, "COMPANYNAME") || "";
  const units = uniqueNamedTallyBlocks(xmlText, "UNIT").map((block) => ({
    name: block.name,
    formal_name: tallyTagValue(block.body, "ORIGINALNAME") || block.name,
    uqc: tallyTagValue(block.body, "GSTREPUQC") || ""
  }));
  const godowns = uniqueNamedTallyBlocks(xmlText, "GODOWN").map((block) => ({
    name: block.name,
    parent: tallyTagValue(block.body, "PARENT") || "",
    address: tallyTagValue(block.body, "ADDRESS") || ""
  }));
  const stockGroups = uniqueNamedTallyBlocks(xmlText, "STOCKGROUP").map((block) => ({ name: block.name }));
  const stockItemBlocks = namedTallyBlocks(xmlText, "STOCKITEM");
  const nameCounts = stockItemBlocks.reduce((counts, block) => {
    const key = normalizeDuplicateKey(block.name);
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
  const validationErrors = [];
  const items = stockItemBlocks.map((block, index) => {
    const itemName = block.name;
    const unit = tallyTagValue(block.body, "BASEUNITS") || tallyTagValue(block.body, "ADDITIONALUNITS") || "";
    const category = tallyTagValue(block.body, "PARENT") || "";
    const hsnCode = tallyNestedTagValue(block.body, "HSNDETAILS.LIST", "HSNCODE") || tallyTagValue(block.body, "HSNCODE") || "";
    const gstRate = tallyGstRate(block.body);
    const openingQuantity = tallyTagValue(block.body, "OPENINGBALANCE") || "";
    const openingValue = tallyTagValue(block.body, "OPENINGVALUE") || "";
    const warehouse = tallyNestedTagValue(block.body, "BATCHALLOCATIONS.LIST", "GODOWNNAME") || "";
    const deleted = /^yes$/i.test(tallyAttribute(block.attributes, "RESERVEDNAME")) || /ACTION="Delete"/i.test(block.attributes);
    const duplicateInXml = nameCounts.get(normalizeDuplicateKey(itemName)) > 1;
    const warnings = [];
    if (!unit) warnings.push("Missing base unit");
    if (!hsnCode) warnings.push("Missing HSN/SAC code");
    if (gstRate === "") warnings.push("GST rate is blank or inherited in Tally");
    if (openingQuantity || openingValue) warnings.push("Opening stock/value found and kept for review; it will not post stock ledger entries");
    if (duplicateInXml) warnings.push("Duplicate stock item name exists inside this XML");
    const status = deleted ? "skipped" : duplicateInXml ? "duplicate" : !itemName || !unit ? "failed" : "ready";
    if (status === "failed") {
      validationErrors.push({ row: index + 1, status: "Failed", errors: warnings.filter((warning) => /Missing base unit|Missing item/i.test(warning)).length ? warnings : ["Missing item name or unit"] });
    } else if (status === "duplicate") {
      validationErrors.push({ row: index + 1, status: "Duplicate", errors: ["Duplicate stock item name exists inside this XML"] });
    } else if (warnings.length) {
      validationErrors.push({ row: index + 1, status: "Warning", errors: warnings });
    }
    return {
      row_number: index + 1,
      tally_item_name: itemName,
      item_name: itemName,
      unit,
      category,
      hsn_code: hsnCode,
      gst_rate: gstRate,
      gst_source: gstRate === "" ? "blank_or_inherited" : "explicit",
      costing_method: tallyTagValue(block.body, "COSTINGMETHOD") || "",
      valuation_method: tallyTagValue(block.body, "VALUATIONMETHOD") || "",
      opening_stock_qty: openingQuantity,
      opening_stock_value: openingValue,
      warehouse,
      deleted,
      duplicate_in_xml: duplicateInXml,
      import_status: status,
      warnings
    };
  });
  const activeItems = items.filter((item) => !item.deleted);
  const readyItems = activeItems.filter((item) => item.import_status === "ready");
  const failedItems = activeItems.filter((item) => item.import_status === "failed");
  const duplicateItems = activeItems.filter((item) => item.import_status === "duplicate");
  return {
    fileName,
    sourceCompany,
    totals: {
      units: units.length,
      stockGroups: stockGroups.length,
      godowns: godowns.length,
      stockItems: items.length,
      activeStockItems: activeItems.length,
      withHsn: activeItems.filter((item) => item.hsn_code).length,
      missingHsn: activeItems.filter((item) => !item.hsn_code).length,
      explicitGst: activeItems.filter((item) => item.gst_rate !== "").length,
      inheritedGst: activeItems.filter((item) => item.gst_rate === "").length,
      openingQtyRows: activeItems.filter((item) => item.opening_stock_qty).length,
      openingValueRows: activeItems.filter((item) => item.opening_stock_value).length,
      deletedRows: items.filter((item) => item.deleted).length
    },
    units,
    godowns,
    stockGroups,
    items,
    validation: {
      totalRows: activeItems.length,
      successfulRows: readyItems.length,
      failedRows: failedItems.length,
      skippedDuplicates: duplicateItems.length,
      warningRows: validationErrors.filter((item) => item.status === "Warning").length,
      errors: validationErrors
    }
  };
}

function tallyCompanyCandidate(db, companyName, sourceFile, xmlBody = "") {
  const gstin = tallyTagValue(xmlBody, "GSTIN") || tallyTagValue(xmlBody, "PARTYGSTIN") || "";
  const pan = tallyTagValue(xmlBody, "INCOMETAXNUMBER") || tallyTagValue(xmlBody, "PANNO") || "";
  return {
    tally_company_name: cleanTallyText(companyName),
    gstin,
    pan,
    address: tallyAddress(xmlBody),
    source_file: sourceFile,
    existing_matches: companyMatches(db, companyName, gstin, pan),
    import_payload: {
      company_name: cleanTallyText(companyName),
      gstin,
      pan,
      address: tallyAddress(xmlBody),
      bank_name: "",
      account_number: "",
      ifsc: "",
      status: "active"
    }
  };
}

function tallyGodownCandidate(db, block, sourceFile) {
  const companyId = firstCompanyId(db);
  const payload = {
    company_id: companyId,
    warehouse_name: block.name,
    location: tallyTagValue(block.body, "ADDRESS") || block.name,
    warehouse_type: "Imported from Tally Godown",
    responsible_person: "",
    status: "active"
  };
  return {
    tally_godown_name: block.name,
    parent: tallyTagValue(block.body, "PARENT") || "",
    address: tallyAddress(block.body) || tallyTagValue(block.body, "ADDRESS") || "",
    suggested_master: "warehouses",
    source_file: sourceFile,
    duplicate_match: findMasterImportDuplicate(db, "warehouses", payload, companyId),
    import_payload: payload
  };
}

function tallyStockItemCandidate(db, item, sourceFile) {
  const payload = {
    item_name: item.item_name,
    brand: "",
    model: "",
    hsn_code: item.hsn_code || "",
    gst_rate: item.gst_rate || "",
    unit: item.unit || "",
    category: item.category || "Imported from Tally",
    inventory_enabled: "1",
    opening_stock: "",
    opening_rate: "",
    opening_value: "",
    valuation_method: item.valuation_method || "Weighted Average",
    status: "active"
  };
  const warnings = [...(item.warnings || [])];
  if (!payload.gst_rate) warnings.push("GST requires row-wise review before import");
  const failed = !payload.item_name || !payload.unit || item.import_status === "failed";
  const duplicate = findMasterImportDuplicate(db, "items", payload, firstCompanyId(db));
  return {
    ...item,
    source_file: sourceFile,
    suggested_master: "items",
    duplicate_match: duplicate,
    gst_review_status: payload.gst_rate ? "Ready" : "Needs Review",
    validation_status: failed ? "Failed" : duplicate || !payload.gst_rate || !payload.hsn_code ? "Needs Review" : "Ready",
    warnings,
    import_payload: payload
  };
}

function tallyLedgerCandidate(db, block, index, sourceFile) {
  const ledgerName = block.name;
  const group = tallyTagValue(block.body, "PARENT") || "";
  const classification = classifyTallyLedger(group, ledgerName);
  const gstin = tallyTagValue(block.body, "PARTYGSTIN") || tallyTagValue(block.body, "GSTIN") || "";
  const pan = tallyTagValue(block.body, "INCOMETAXNUMBER") || tallyTagValue(block.body, "PANNO") || "";
  const accountNumber = tallyTagValue(block.body, "BANKACCOUNTNUMBER") || tallyTagValue(block.body, "ACCOUNTNUMBER") || "";
  const ifsc = tallyTagValue(block.body, "IFSCODE") || tallyTagValue(block.body, "IFSCCODE") || "";
  const bankName = tallyTagValue(block.body, "BANKNAME") || tallyTagValue(block.body, "BANKDETAILS") || "";
  const contact = tallyTagValue(block.body, "LEDGERCONTACT") || tallyTagValue(block.body, "CONTACTPERSON") || tallyTagValue(block.body, "MOBILENO") || "";
  const openingBalance = tallyTagValue(block.body, "OPENINGBALANCE") || "";
  const address = tallyAddress(block.body);
  const payload = ledgerImportPayload(classification.master, {
    ledgerName,
    gstin,
    pan,
    address,
    contact,
    accountNumber,
    ifsc,
    bankName
  });
  const duplicate = payload ? findMasterImportDuplicate(db, classification.master, payload, firstCompanyId(db)) : null;
  const warnings = [];
  if (!ledgerName) warnings.push("Missing ledger name");
  if (!classification.master) warnings.push("Ledger group needs manual mapping");
  if (openingBalance) warnings.push("Opening balance is reference-only in Stage 1");
  if (duplicate) warnings.push("Possible existing master match found");
  return {
    row_number: index + 1,
    tally_ledger_name: ledgerName,
    tally_group: group,
    suggested_gii_type: classification.label,
    suggested_master: classification.master || "manual_review",
    gstin,
    pan,
    contact_details: contact,
    address,
    bank_name: bankName,
    account_number: accountNumber,
    ifsc,
    opening_balance_reference: openingBalance,
    source_file: sourceFile,
    duplicate_match: duplicate,
    action: duplicate ? "Map Existing" : classification.master ? "Import" : "Needs Review",
    validation_status: !ledgerName ? "Failed" : duplicate || !classification.master ? "Needs Review" : "Ready",
    warnings,
    import_payload: payload
  };
}

function classifyTallyLedger(group, ledgerName = "") {
  const text = `${group} ${ledgerName}`.toLowerCase();
  if (text.includes("sundry creditor")) return { label: "Supplier / Vendor", master: "suppliers" };
  if (text.includes("sundry debtor")) return { label: "Government Department / Customer", master: "government_departments" };
  if (text.includes("bank account") || text.includes("bank od") || text.includes("bank occ")) return { label: "Bank Account", master: "banks" };
  if (text.includes("cash-in-hand") || text === "cash") return { label: "Cash Account", master: null };
  if (text.includes("direct expense") || text.includes("indirect expense") || text.includes("expense")) return { label: "Expense Head", master: "expense_heads" };
  if (text.includes("duties") || text.includes("tax")) return { label: "GST/TDS Ledger Reference", master: null };
  if (text.includes("sales account")) return { label: "Sales Ledger Reference", master: null };
  if (text.includes("purchase account")) return { label: "Purchase Ledger Reference", master: null };
  return { label: "Ledger Account Reference", master: null };
}

function ledgerImportPayload(master, source) {
  if (master === "suppliers") {
    return {
      supplier_name: source.ledgerName,
      supplier_type: "Tally Creditor",
      supplier_code: "",
      date_of_activation: "",
      supplier_account_name: source.ledgerName,
      supplier_account_number: source.accountNumber,
      supplier_bank_name: source.bankName,
      supplier_bank_ifsc_code: source.ifsc,
      supplier_branch: "",
      supplier_contact: source.contact,
      remarks: "Imported from Tally master migration",
      gstin: source.gstin,
      contact_details: [source.contact, source.address].filter(Boolean).join("; "),
      bank_details: [
        source.accountNumber ? `Account Number: ${source.accountNumber}` : "",
        source.bankName ? `Bank: ${source.bankName}` : "",
        source.ifsc ? `IFSC: ${source.ifsc}` : ""
      ].filter(Boolean).join("; "),
      status: "active"
    };
  }
  if (master === "government_departments") {
    return {
      department_name: source.ledgerName,
      contact_person: source.contact,
      contact_number: "",
      address: source.address,
      status: "active"
    };
  }
  if (master === "banks") {
    return {
      bank_account_name: source.ledgerName,
      bank_name: source.bankName || source.ledgerName,
      account_number: source.accountNumber,
      ifsc: source.ifsc,
      opening_balance: 0,
      status: "active"
    };
  }
  if (master === "expense_heads") {
    return {
      expense_head_name: source.ledgerName,
      default_calculation_method: "fixed",
      default_percentage: 0,
      category: "Imported from Tally",
      status: "active"
    };
  }
  return null;
}

function companyMatches(db, companyName, gstin, pan) {
  const params = [];
  const clauses = [];
  const notDeleted = columnExists(db, "companies", "is_deleted") ? "COALESCE(is_deleted, 0) = 0 AND " : "";
  if (String(companyName || "").trim()) {
    clauses.push("LOWER(company_name) = LOWER(?)");
    params.push(String(companyName).trim());
  }
  if (String(gstin || "").trim()) {
    clauses.push("gstin = ?");
    params.push(String(gstin).trim());
  }
  if (String(pan || "").trim()) {
    clauses.push("pan = ?");
    params.push(String(pan).trim());
  }
  if (!clauses.length) return [];
  return db.prepare(`SELECT id, company_name, gstin, pan FROM companies WHERE ${notDeleted}(${clauses.join(" OR ")}) ORDER BY id LIMIT 5`).all(...params);
}

function tallyAddress(xmlText) {
  return tallyRepeatedTagValues(xmlText, "ADDRESS").join(", ");
}

function tallyRepeatedTagValues(xmlText, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  return [...String(xmlText || "").matchAll(pattern)].map((match) => cleanTallyText(match[1])).filter(Boolean);
}

function uniqueBy(rows, keyFn) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = keyFn(row);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function firstCompanyId(db) {
  return db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || 0;
}

function namedTallyBlocks(xmlText, tagName) {
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  const blocks = [];
  let match;
  while ((match = pattern.exec(xmlText)) !== null) {
    const attributes = match[1] || "";
    const body = match[2] || "";
    const name = cleanTallyText(tallyAttribute(attributes, "NAME"));
    blocks.push({ name, attributes, body });
  }
  return blocks;
}

function uniqueNamedTallyBlocks(xmlText, tagName) {
  const seen = new Set();
  return namedTallyBlocks(xmlText, tagName).filter((block) => {
    const key = normalizeDuplicateKey(block.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function tallyAttribute(attributeText, attributeName) {
  const match = new RegExp(`${attributeName}="([^"]*)"`, "i").exec(attributeText || "");
  return cleanTallyText(match?.[1] || "");
}

function tallyTagValue(xmlText, tagName) {
  const match = new RegExp(`<${escapeRegex(tagName)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegex(tagName)}>`, "i").exec(xmlText || "");
  return cleanTallyText(match?.[1] || "");
}

function tallyNestedTagValue(xmlText, listTag, childTag) {
  const match = new RegExp(`<${escapeRegex(listTag)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegex(listTag)}>`, "i").exec(xmlText || "");
  return match ? tallyTagValue(match[1], childTag) : "";
}

function tallyGstRate(xmlText) {
  const pattern = /<RATEDETAILS\.LIST\b[^>]*>([\s\S]*?)<\/RATEDETAILS\.LIST>/gi;
  let igst = null;
  let cgst = null;
  let sgst = null;
  let match;
  while ((match = pattern.exec(xmlText || "")) !== null) {
    const body = match[1] || "";
    const dutyHead = tallyTagValue(body, "GSTRATEDUTYHEAD").toLowerCase();
    const rateValue = parseTallyNumber(tallyTagValue(body, "GSTRATE"));
    if (!Number.isFinite(rateValue)) continue;
    if (dutyHead.includes("integrated") || dutyHead === "igst") igst = rateValue;
    if (dutyHead.includes("central") || dutyHead === "cgst") cgst = rateValue;
    if (dutyHead.includes("state") || dutyHead === "sgst") sgst = rateValue;
  }
  if (Number.isFinite(igst)) return formatTallyRate(igst);
  if (Number.isFinite(cgst) || Number.isFinite(sgst)) return formatTallyRate((cgst || 0) + (sgst || 0));
  return "";
}

function parseTallyNumber(value) {
  const cleaned = String(value || "").replace(/,/g, "").replace(/[^\d.-]/g, "");
  if (!cleaned) return NaN;
  return Number(cleaned);
}

function formatTallyRate(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function cleanTallyText(value) {
  return String(value || "")
    .replace(/&#4;/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
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
  db.prepare("UPDATE documents SET is_deleted = 1, status = 'deleted', deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE id = ?").run(context.user_id || null, id);
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
  const placeholders = ids.map(() => "?").join(",");
  const usage = {
    orderItems: db.prepare(`SELECT COUNT(*) count FROM order_items WHERE item_id IN (${placeholders}) AND COALESCE(is_deleted, 0) = 0`).get(...ids).count,
    procurementItems: db.prepare(`SELECT COUNT(*) count FROM procurement_items WHERE item_id IN (${placeholders}) AND COALESCE(is_deleted, 0) = 0`).get(...ids).count,
    invoiceItems: db.prepare(`SELECT COUNT(*) count FROM invoice_items WHERE item_id IN (${placeholders}) AND COALESCE(is_deleted, 0) = 0`).get(...ids).count
  };
  const used = usage.orderItems + usage.procurementItems + usage.invoiceItems;
  if (used) {
    throw new Error(`Cannot bulk delete: ${used} imported item reference(s) already exist in order/procurement/invoice lines`);
  }
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
    SELECT item_id FROM order_items WHERE item_id IS NOT NULL AND COALESCE(is_deleted, 0) = 0
    UNION
    SELECT item_id FROM procurement_items WHERE item_id IS NOT NULL AND COALESCE(is_deleted, 0) = 0
    UNION
    SELECT item_id FROM invoice_items WHERE item_id IS NOT NULL AND COALESCE(is_deleted, 0) = 0
  `).all();
  const protectedIds = new Set(referencedRows.map((row) => Number(row.item_id)));
  const seed = db.prepare("SELECT id FROM items WHERE item_name = 'Office Workstation' ORDER BY id LIMIT 1").get();
  if (seed) protectedIds.add(Number(seed.id));
  const items = db.prepare("SELECT id FROM items").all();
  const deleteIds = items.map((item) => Number(item.id)).filter((id) => !protectedIds.has(id));
  if (!deleteIds.length) return { deleted: 0, protected: protectedIds.size };
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
    itemsIssued: db.prepare(`SELECT COALESCE(SUM(outward_quantity), 0) AS value FROM stock_ledger WHERE ${companyWhere} AND transaction_type IN ('Outward','Supplier Return','Adjustment Decrease')`).get(params).value,
    returnedItems: db.prepare(`SELECT COALESCE(SUM(quantity), 0) AS value FROM stock_returns WHERE ${companyWhere} AND COALESCE(is_deleted, 0) = 0`).get(params).value,
    cracPending,
    cracGenerated,
    paymentReadyOrders: ordersWithInvoiceAndCrac,
    readyForClosure: count("supply_orders", `WHERE ${companyWhere} AND COALESCE(is_deleted, 0) = 0 AND COALESCE(operationally_closed, 0) = 1`)
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
    profitability: orderProfitability(db, { company_id: companyId })
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
    WHERE order_id = ? AND transaction_type = 'Outward'
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

function accountById(db, companyId, id) {
  return db.prepare("SELECT * FROM accounts WHERE company_id = ? AND id = ? AND is_deleted = 0").get(companyId, id);
}

export function createBalancedVoucher(db, payload) {
  const financialYear = assertOpenFinancialYear(db, payload.company_id, payload.voucher_date);
  const totalDebit = payload.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const totalCredit = payload.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
    throw new Error(`Unbalanced voucher: debit ${totalDebit}, credit ${totalCredit}`);
  }
  payload.lines.forEach((line) => {
    if (Number(line.debit || 0) < 0 || Number(line.credit || 0) < 0) throw new Error("Voucher amounts cannot be negative");
  });

  const transaction = db.transaction(() => {
    const voucherNumber = payload.voucher_number || nextVoucherNumber(db, payload.company_id, payload.voucher_type.toUpperCase().replaceAll(" ", ""));
    const voucherResult = db.prepare(`
      INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, narration, source_module, source_id, status, financial_year_id, approval_status)
      VALUES (@company_id, @voucher_number, @voucher_date, @voucher_type, @narration, @source_module, @source_id, 'Posted', @financial_year_id, 'Approved')
    `).run({ ...payload, voucher_number: voucherNumber, financial_year_id: financialYear.id });
    const voucherId = voucherResult.lastInsertRowid;
    payload.lines.forEach((line) => {
      const lineResult = db.prepare(`
        INSERT INTO voucher_lines (voucher_id, account_id, debit, credit, narration, linked_party_type, linked_party_id)
        VALUES (@voucher_id, @account_id, @debit, @credit, @narration, @linked_party_type, @linked_party_id)
      `).run({
        voucher_id: voucherId,
        account_id: line.account_id,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        narration: line.narration || payload.narration || "",
        linked_party_type: line.linked_party_type || null,
        linked_party_id: line.linked_party_id || null
      });
      postLedgerEntry(db, payload.company_id, voucherId, lineResult.lastInsertRowid, line.account_id, payload.voucher_date, Number(line.debit || 0), Number(line.credit || 0), payload.source_module, payload.source_id);
    });
    auditLog(db, { company_id: payload.company_id, action: "voucher posting", table_name: "vouchers", record_id: voucherId, new_value: JSON.stringify({ voucherNumber, totalDebit }) });
    const voucher = db.prepare("SELECT * FROM vouchers WHERE id = ?").get(voucherId);
    auditVoucherDependencySync(db, voucher, voucherTypeDependencyEffects(voucher.voucher_type));
    return voucher;
  });
  return transaction();
}

function voucherTypeDependencyEffects(voucherType = "") {
  const effects = {
    Purchase: ["general_ledger", "trial_balance", "payables", "input_gst", "purchase_register", "profitability"],
    Sales: ["general_ledger", "trial_balance", "receivables", "output_gst", "sales_register", "profitability"],
    Receipt: ["general_ledger", "trial_balance", "cash_bank", "receivables", "outstanding", "ageing", "cash_flow"],
    Payment: ["general_ledger", "trial_balance", "cash_bank", "payables", "outstanding", "ageing", "cash_flow"],
    Journal: ["general_ledger", "trial_balance", "profit_loss"],
    Contra: ["general_ledger", "trial_balance", "cash_book", "bank_book", "cash_flow"],
    "Credit Note": ["general_ledger", "trial_balance", "sales", "receivables", "output_gst", "profitability"],
    "Debit Note": ["general_ledger", "trial_balance", "purchase", "payables", "input_gst", "profitability"]
  };
  return effects[voucherType] || ["general_ledger", "trial_balance"];
}

export function createManualVoucher(db, payload) {
  const companyId = Number(payload.company_id || 0);
  const voucherType = String(payload.voucher_type || "").trim();
  const voucherDate = String(payload.voucher_date || "").trim();
  const lines = (payload.lines || [])
    .map((line) => ({
      account_id: Number(line.account_id || 0),
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
      narration: line.narration || payload.narration || "",
      linked_party_type: line.linked_party_type || null,
      linked_party_id: line.linked_party_id || null
    }))
    .filter((line) => line.account_id && (line.debit || line.credit));

  if (!companyId) throw new Error("Company is required");
  if (!voucherDate) throw new Error("Voucher date is required");
  if (!["Sales", "Purchase", "Receipt", "Payment", "Journal", "Credit Note", "Debit Note", "Contra"].includes(voucherType)) {
    throw new Error("Valid voucher type is required");
  }
  if (lines.length < 2) throw new Error("At least two voucher lines are required");

  lines.forEach((line) => {
    if (!accountById(db, companyId, line.account_id)) throw new Error("Invalid account selected");
    if (line.debit && line.credit) throw new Error("A voucher line cannot have both debit and credit");
  });

  const voucher = createBalancedVoucher(db, {
    company_id: companyId,
    voucher_number: payload.voucher_number || null,
    voucher_date: voucherDate,
    voucher_type: voucherType,
    narration: payload.narration || `Manual ${voucherType} voucher`,
    source_module: "manual_voucher",
    source_id: null,
    lines
  });

  lines.forEach((line) => {
    const account = accountById(db, companyId, line.account_id);
    if (!["Cash", "Bank"].includes(account?.account_name)) return;
    updateCashBankLedger(db, {
      company_id: companyId,
      bank_account_id: payload.bank_account_id || null,
      transaction_date: voucherDate,
      transaction_type: voucherType,
      source_module: "manual_voucher",
      source_id: voucher.id,
      voucher_id: voucher.id,
      debit: line.debit,
      credit: line.credit,
      payment_mode: account.account_name,
      utr_number: payload.reference_number || voucher.voucher_number,
      remarks: payload.narration || ""
    });
  });

  return db.prepare("SELECT * FROM vouchers WHERE id = ?").get(voucher.id);
}

export function createBusinessVoucher(db, payload = {}) {
  const companyId = Number(payload.company_id || 0);
  const voucherKind = String(payload.voucher_kind || payload.voucher_type || "").trim();
  const voucherDate = String(payload.voucher_date || payload.receipt_date || payload.payment_date || payload.invoice_date || payload.purchase_date || new Date().toISOString().slice(0, 10));
  if (!companyId) throw new Error("Company is required");
  if (!voucherKind) throw new Error("Voucher workflow is required");

  const result = db.prepare(`
    INSERT INTO guided_vouchers (company_id, voucher_kind, voucher_date, payload_json, narration, status, created_by, remarks)
    VALUES (?, ?, ?, ?, ?, 'Draft', ?, ?)
  `).run(
    companyId,
    voucherKind,
    voucherDate,
    JSON.stringify({ ...payload, company_id: companyId, voucher_kind: voucherKind, voucher_date: voucherDate }),
    payload.narration || `${voucherKind} ${payload.reference_number || ""}`.trim(),
    payload.created_by || null,
    payload.remarks || null
  );
  const row = db.prepare("SELECT * FROM guided_vouchers WHERE id = ?").get(result.lastInsertRowid);
  auditLog(db, { company_id: companyId, user_id: payload.created_by || null, action: "guided_voucher_draft_created", table_name: "guided_vouchers", record_id: row.id, new_value: JSON.stringify({ voucherKind, status: row.status }) });
  return row;
}

export function updateGuidedVoucherStatus(db, guidedVoucherId, action, userId = null, remarks = "") {
  const row = db.prepare("SELECT * FROM guided_vouchers WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(guidedVoucherId);
  if (!row) throw new Error("Guided voucher not found");
  const normalized = String(action || "").toLowerCase();
  const transitions = {
    submit: ["Draft", "Pending Review", "submitted_by", "guided_voucher_submitted"],
    review: ["Pending Review", "Pending Approval", "reviewed_by", "guided_voucher_reviewed"],
    approve: ["Pending Approval", "Approved", "approved_by", "guided_voucher_approved"]
  };
  const transition = transitions[normalized];
  if (!transition) throw new Error("Unsupported guided voucher action");
  const [fromStatus, toStatus, userColumn, auditAction] = transition;
  if (row.status !== fromStatus) throw new Error(`Guided voucher must be ${fromStatus} before ${normalized}`);
  const timestampColumn = normalized === "submit" ? "submitted_at" : normalized === "review" ? "reviewed_at" : "approved_at";
  db.prepare(`
    UPDATE guided_vouchers
    SET status = ?, ${userColumn} = ?, ${timestampColumn} = CURRENT_TIMESTAMP, remarks = COALESCE(NULLIF(?, ''), remarks), updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(toStatus, userId, remarks, guidedVoucherId);
  auditLog(db, { company_id: row.company_id, user_id: userId, action: auditAction, table_name: "guided_vouchers", record_id: guidedVoucherId, new_value: remarks || toStatus });
  return db.prepare("SELECT * FROM guided_vouchers WHERE id = ?").get(guidedVoucherId);
}

export function postGuidedVoucher(db, guidedVoucherId, userId = null) {
  const row = db.prepare("SELECT * FROM guided_vouchers WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(guidedVoucherId);
  if (!row) throw new Error("Guided voucher not found");
  if (row.status !== "Approved") throw new Error("Guided voucher must be Approved before posting");
  if (row.posted_voucher_id) throw new Error("Guided voucher already posted");
  const payload = JSON.parse(row.payload_json || "{}");
  const voucherPayload = businessVoucherPayload(db, row.company_id, row.voucher_kind, { ...payload, voucher_date: row.voucher_date });
  const tx = db.transaction(() => {
    const voucher = createBalancedVoucher(db, { ...voucherPayload, source_module: "guided_vouchers", source_id: row.id });
    if (voucherPayload.cashBankLine) {
      updateCashBankLedger(db, {
        company_id: row.company_id,
        bank_account_id: payload.bank_account_id || payload.bank_id || null,
        transaction_date: row.voucher_date,
        transaction_type: voucherPayload.voucher_type,
        source_module: "guided_vouchers",
        source_id: row.id,
        voucher_id: voucher.id,
        debit: voucherPayload.cashBankLine.debit || 0,
        credit: voucherPayload.cashBankLine.credit || 0,
        payment_mode: payload.payment_mode || "Bank",
        utr_number: payload.reference_number || payload.utr_number || voucher.voucher_number,
        remarks: voucherPayload.narration
      });
    }
    if (String(row.voucher_kind).toLowerCase().includes("purchase")) {
      createAutomaticGrnFromPurchaseVoucher(db, row, payload, voucher);
    }
    if (String(row.voucher_kind).toLowerCase().includes("sales")) {
      createAutomaticStockIssueFromSalesVoucher(db, row, payload, voucher);
    }
    db.prepare(`
      UPDATE guided_vouchers
      SET status = 'Posted', posted_voucher_id = ?, posted_by = ?, posted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(voucher.id, userId, row.id);
    auditLog(db, { company_id: row.company_id, user_id: userId, action: "guided_voucher_posted", table_name: "guided_vouchers", record_id: row.id, new_value: JSON.stringify({ voucher_number: voucher.voucher_number }) });
    if (["credit_note", "debit_note"].includes(String(row.voucher_kind || "").toLowerCase())) {
      auditLog(db, {
        company_id: row.company_id,
        user_id: userId,
        action: `${row.voucher_kind}_operational_correction_posted`,
        table_name: "guided_vouchers",
        record_id: row.id,
        new_value: JSON.stringify({
          voucher_number: voucher.voucher_number,
          linked_invoice_id: payload.linked_invoice_id || null,
          linked_purchase_id: payload.linked_purchase_id || null,
          reason_code: payload.reason_code || null,
          reference_number: payload.reference_number || null
        })
      });
    }
    return voucher;
  });
  return tx();
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
  const previous = db.prepare("SELECT running_balance FROM ledger_entries WHERE company_id = ? AND account_id = ? ORDER BY id DESC LIMIT 1").get(companyId, accountIdValue);
  const account = db.prepare("SELECT normal_balance FROM accounts WHERE id = ?").get(accountIdValue);
  const delta = account?.normal_balance === "Credit" ? credit - debit : debit - credit;
  const running = Number(previous?.running_balance || 0) + delta;
  db.prepare(`
    INSERT INTO ledger_entries (company_id, voucher_id, voucher_line_id, account_id, entry_date, debit, credit, running_balance, source_module, source_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(companyId, voucherId, voucherLineId, accountIdValue, entryDate, debit, credit, running, sourceModule, sourceId);
}

function updateCashBankLedger(db, { company_id, bank_account_id, transaction_date, transaction_type, source_module, source_id, voucher_id, debit = 0, credit = 0, payment_mode, utr_number, remarks }) {
  const existing = db.prepare(`
    SELECT id FROM cash_bank_ledger
    WHERE company_id = ?
      AND COALESCE(bank_account_id, 0) = COALESCE(?, 0)
      AND COALESCE(voucher_id, 0) = COALESCE(?, 0)
      AND COALESCE(source_module, '') = COALESCE(?, '')
      AND COALESCE(source_id, 0) = COALESCE(?, 0)
      AND ROUND(COALESCE(debit, 0), 2) = ROUND(?, 2)
      AND ROUND(COALESCE(credit, 0), 2) = ROUND(?, 2)
    LIMIT 1
  `).get(company_id, bank_account_id || null, voucher_id || null, source_module || "", source_id || null, Number(debit || 0), Number(credit || 0));
  if (existing) return existing.id;
  const previous = db.prepare("SELECT balance FROM cash_bank_ledger WHERE company_id = ? AND COALESCE(bank_account_id, 0) = COALESCE(?, 0) ORDER BY id DESC LIMIT 1").get(company_id, bank_account_id);
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

export function reverseVoucher(db, voucherId, reason = "") {
  const original = db.prepare("SELECT * FROM vouchers WHERE id = ? AND is_deleted = 0").get(Number(voucherId || 0));
  if (!original) throw new Error("Voucher not found");
  if (original.status === "Reversed") throw new Error("Voucher is already reversed");
  const existingReversal = db.prepare("SELECT id FROM vouchers WHERE source_module = 'voucher_reversal' AND source_id = ? AND is_deleted = 0").get(original.id);
  if (existingReversal) throw new Error("Voucher reversal already exists");

  const lines = db.prepare("SELECT * FROM voucher_lines WHERE voucher_id = ? ORDER BY id").all(original.id);
  if (!lines.length) throw new Error("Voucher has no lines to reverse");

  const reversal = db.transaction(() => {
    const reversalVoucher = createBalancedVoucher(db, {
      company_id: original.company_id,
      voucher_date: new Date().toISOString().slice(0, 10),
      voucher_type: "Journal",
      narration: `Reversal of ${original.voucher_number}${reason ? ` - ${reason}` : ""}`,
      source_module: "voucher_reversal",
      source_id: original.id,
      lines: lines.map((line) => ({
        account_id: line.account_id,
        debit: Number(line.credit || 0),
        credit: Number(line.debit || 0),
        narration: `Reverse ${original.voucher_number}`,
        linked_party_type: line.linked_party_type,
        linked_party_id: line.linked_party_id
      }))
    });

    db.prepare("UPDATE vouchers SET status = 'Reversed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(original.id);
    if (original.source_module === "billing") db.prepare("UPDATE invoices SET posting_status = 'Reversed', invoice_status = 'Reversed', locked_at = CURRENT_TIMESTAMP WHERE id = ?").run(original.source_id);
    if (original.source_module === "procurement") db.prepare("UPDATE procurements SET posting_status = 'Reversed', locked_at = CURRENT_TIMESTAMP WHERE id = ?").run(original.source_id);
    if (original.source_module === "payment") db.prepare("UPDATE payments SET posting_status = 'Reversed', locked_at = CURRENT_TIMESTAMP WHERE id = ?").run(original.source_id);
    if (original.source_module === "supplier_payment") db.prepare("UPDATE supplier_payments SET posting_status = 'Reversed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(original.source_id);
    if (original.source_module === "expense") db.prepare("UPDATE expense_entries SET posting_status = 'Reversed', locked_at = CURRENT_TIMESTAMP WHERE id = ?").run(original.source_id);

    if (original.source_module === "billing") {
      db.prepare(`
        UPDATE receivables
        SET balance_outstanding = 0, status = 'Reversed', allocation_status = 'Reversed', updated_at = CURRENT_TIMESTAMP
        WHERE billing_id = ?
      `).run(original.source_id);
      db.prepare(`
        UPDATE payment_allocations
        SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, allocation_status = 'Reversed', updated_at = CURRENT_TIMESTAMP
        WHERE billing_id = ?
      `).run(original.source_id);
    }
    if (original.source_module === "payment") {
      const affected = db.prepare("SELECT DISTINCT billing_id FROM payment_allocations WHERE payment_id = ? AND COALESCE(is_deleted, 0) = 0").all(original.source_id);
      db.prepare(`
        UPDATE payment_allocations
        SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, allocation_status = 'Reversed', updated_at = CURRENT_TIMESTAMP
        WHERE payment_id = ?
      `).run(original.source_id);
      affected.forEach((row) => refreshReceivable(db, row.billing_id));
    }
    if (original.source_module === "supplier_payment") {
      db.prepare(`
        UPDATE supplier_payment_allocations
        SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, allocation_status = 'Reversed', updated_at = CURRENT_TIMESTAMP
        WHERE supplier_payment_id = ?
      `).run(original.source_id);
    }
    if (original.source_module === "procurement") {
      db.prepare(`
        UPDATE supplier_payment_allocations
        SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, allocation_status = 'Reversed', updated_at = CURRENT_TIMESTAMP
        WHERE procurement_id = ?
      `).run(original.source_id);
    }

    const cashRows = db.prepare("SELECT * FROM cash_bank_ledger WHERE voucher_id = ? ORDER BY id").all(original.id);
    cashRows.forEach((row) => {
      updateCashBankLedger(db, {
        company_id: row.company_id,
        bank_account_id: row.bank_account_id,
        transaction_date: reversalVoucher.voucher_date,
        transaction_type: "Voucher Reversal",
        source_module: "voucher_reversal",
        source_id: original.id,
        voucher_id: reversalVoucher.id,
        debit: Number(row.credit || 0),
        credit: Number(row.debit || 0),
        payment_mode: row.payment_mode,
        utr_number: `REV-${row.utr_number || original.voucher_number}`,
        remarks: `Reverse ${original.voucher_number}`
      });
    });

    auditLog(db, {
      company_id: original.company_id,
      action: "voucher reversal",
      table_name: "vouchers",
      record_id: original.id,
      old_value: JSON.stringify({ voucher_number: original.voucher_number, status: original.status }),
      new_value: JSON.stringify({ reversal_voucher_id: reversalVoucher.id, reason })
    });
    auditVoucherDependencySync(db, reversalVoucher, ["general_ledger_reversal", "trial_balance", "subledger_reversal", "cash_bank_reversal", "reports_resync"]);
    return reversalVoucher;
  });

  return reversal();
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

export function createFinancialYear(db, payload) {
  const companyId = Number(payload.company_id || 0);
  if (!companyId) throw new Error("Company is required");
  if (!payload.financial_year_name || !payload.start_date || !payload.end_date) throw new Error("Financial year name, start date and end date are required");
  const result = db.prepare(`
    INSERT INTO financial_years (company_id, financial_year_name, start_date, end_date, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(companyId, payload.financial_year_name, payload.start_date, payload.end_date, payload.status || "Open");
  auditLog(db, { company_id: companyId, action: "financial year create", table_name: "financial_years", record_id: result.lastInsertRowid, new_value: JSON.stringify(payload) });
  return db.prepare("SELECT * FROM financial_years WHERE id = ?").get(result.lastInsertRowid);
}

export function updateFinancialYearStatus(db, id, status, userId = null) {
  const allowed = new Set(["Open", "Closed", "Locked"]);
  if (!allowed.has(status)) throw new Error("Invalid financial year status");
  const row = db.prepare("SELECT * FROM financial_years WHERE id = ?").get(id);
  if (!row) throw new Error("Financial year not found");
  const fields = ["status = ?", "updated_at = CURRENT_TIMESTAMP"];
  const params = [status];
  if (status === "Closed") {
    fields.push("closed_at = CURRENT_TIMESTAMP", "closed_by = ?");
    params.push(userId);
  }
  if (status === "Locked") {
    fields.push("locked_at = CURRENT_TIMESTAMP", "locked_by = ?");
    params.push(userId);
  }
  if (status === "Open") {
    fields.push("reopened_at = CURRENT_TIMESTAMP", "reopened_by = ?");
    params.push(userId);
  }
  params.push(id);
  db.prepare(`UPDATE financial_years SET ${fields.join(", ")} WHERE id = ?`).run(...params);
  auditLog(db, { company_id: row.company_id, user_id: userId, action: `financial year ${status.toLowerCase()}`, table_name: "financial_years", record_id: id });
  return db.prepare("SELECT * FROM financial_years WHERE id = ?").get(id);
}

export function createOpeningBalance(db, payload) {
  const companyId = Number(payload.company_id || 0);
  const financialYearId = Number(payload.financial_year_id || 0);
  const year = db.prepare("SELECT * FROM financial_years WHERE id = ? AND company_id = ?").get(financialYearId, companyId);
  if (!year) throw new Error("Valid financial year is required");
  if (year.status !== "Open") throw new Error("Opening balances can be entered only in an open financial year");
  const debit = Number(payload.opening_debit || 0);
  const credit = Number(payload.opening_credit || 0);
  if ((debit <= 0 && credit <= 0) || (debit > 0 && credit > 0)) throw new Error("Enter either opening debit or opening credit");
  const suspense = accountId(db, companyId, "Capital");
  const account = payload.account_id ? Number(payload.account_id) : accountId(db, companyId, payload.balance_type === "Bank" ? "Bank" : payload.balance_type === "Cash" ? "Cash" : "Trade Receivables");
  const voucher = createBalancedVoucher(db, {
    company_id: companyId,
    voucher_date: year.start_date,
    voucher_type: "Journal",
    narration: `Opening balance - ${payload.balance_type || "Account"}`,
    source_module: "opening_balance",
    source_id: null,
    lines: [
      { account_id: account, debit, credit },
      { account_id: suspense, debit: credit, credit: debit }
    ]
  });
  const result = db.prepare(`
    INSERT INTO opening_balances (company_id, financial_year_id, balance_type, linked_id, account_id, opening_debit, opening_credit, voucher_id, remarks, created_by)
    VALUES (@company_id, @financial_year_id, @balance_type, @linked_id, @account_id, @opening_debit, @opening_credit, @voucher_id, @remarks, @created_by)
  `).run({
    company_id: companyId,
    financial_year_id: financialYearId,
    balance_type: payload.balance_type || "Account",
    linked_id: payload.linked_id || null,
    account_id: account,
    opening_debit: debit,
    opening_credit: credit,
    voucher_id: voucher.id,
    remarks: payload.remarks || "",
    created_by: payload.created_by || null
  });
  auditLog(db, { company_id: companyId, action: "opening balance create", table_name: "opening_balances", record_id: result.lastInsertRowid, new_value: JSON.stringify({ voucher_id: voucher.id }) });
  return db.prepare("SELECT * FROM opening_balances WHERE id = ?").get(result.lastInsertRowid);
}

export function drilldownData(db, payload = {}) {
  const companyId = Number(payload.company_id || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || 0);
  const dateFrom = payload.date_from || "1900-01-01";
  const dateTo = payload.date_to || "2999-12-31";
  const accountIdValue = Number(payload.account_id || 0);
  const voucherId = Number(payload.voucher_id || 0);
  const sourceModule = payload.source_module || null;
  const sourceId = Number(payload.source_id || 0);

  const ledger = accountIdValue ? db.prepare(`
    SELECT le.*, a.account_name, a.account_code, v.voucher_number, v.voucher_type, v.narration, v.source_module, v.source_id
    FROM ledger_entries le
    JOIN accounts a ON a.id = le.account_id
    JOIN vouchers v ON v.id = le.voucher_id
    WHERE le.company_id = ? AND le.account_id = ? AND le.entry_date BETWEEN ? AND ? AND v.is_deleted = 0
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
    voucher_reversal: ["vouchers", "id"]
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

export function closeFinancialYear(db, payload = {}) {
  const companyId = Number(payload.company_id || 0);
  const fromId = Number(payload.from_financial_year_id || 0);
  const toId = Number(payload.to_financial_year_id || 0);
  const approvedBy = payload.approved_by || null;
  const fromYear = db.prepare("SELECT * FROM financial_years WHERE id = ? AND company_id = ?").get(fromId, companyId);
  const toYear = db.prepare("SELECT * FROM financial_years WHERE id = ? AND company_id = ?").get(toId, companyId);
  if (!fromYear || !toYear) throw new Error("Valid source and target financial years are required");
  const duplicate = db.prepare("SELECT id FROM year_end_closings WHERE company_id = ? AND from_financial_year_id = ? AND to_financial_year_id = ?").get(companyId, fromId, toId);
  if (duplicate) throw new Error("Carry forward already exists for this company/year");
  const postingIssues = postingControlReport(db, companyId).filter((row) => !["Posted", "Reversed"].includes(row.posting_status));
  if (postingIssues.length) throw new Error("Cannot close year while Draft/Error transactions exist");

  const tb = trialBalance(db, companyId, fromYear.start_date, fromYear.end_date);
  const debit = tb.reduce((sum, row) => sum + Number(row.debit || 0), 0);
  const credit = tb.reduce((sum, row) => sum + Number(row.credit || 0), 0);
  const tbDifference = Math.round((debit - credit) * 100) / 100;
  if (Math.round(debit * 100) !== Math.round(credit * 100)) throw new Error("Trial balance must balance before year close");

  const pl = profitLossReport(db, companyId, fromYear.start_date, fromYear.end_date);
  const bs = balanceSheetReport(db, companyId, fromYear.start_date, fromYear.end_date);
  const bsDifference = Math.round((Number(bs.assets || 0) - Number(bs.liabilitiesAndEquity || 0)) * 100) / 100;
  if (Math.abs(bsDifference) > 1) throw new Error("Balance sheet must balance before year close");

  const transaction = db.transaction(() => {
    const closing = db.prepare(`
      INSERT INTO year_end_closings (company_id, from_financial_year_id, to_financial_year_id, closing_date, trial_balance_difference, balance_sheet_difference, net_profit, status, approved_by, approved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Approved', ?, CURRENT_TIMESTAMP)
    `).run(companyId, fromId, toId, fromYear.end_date, tbDifference, bsDifference, pl.netProfit, approvedBy);

    const balanceRows = balanceSheetReport(db, companyId, fromYear.start_date, fromYear.end_date).rows.filter((row) => Math.abs(Number(row.amount || 0)) > 0);
    balanceRows.forEach((row) => {
      db.prepare(`
        INSERT INTO carry_forward_entries (company_id, from_financial_year_id, to_financial_year_id, account_id, closing_balance, opening_balance_created, approved_by, status)
        VALUES (?, ?, ?, ?, ?, 0, ?, 'Approved')
      `).run(companyId, fromId, toId, row.id || accountId(db, companyId, row.account_name), row.amount, approvedBy);
    });

    if (Math.abs(pl.netProfit || 0) > 0) {
      const retainedAccount = accountId(db, companyId, "Capital");
      db.prepare(`
        INSERT INTO carry_forward_entries (company_id, from_financial_year_id, to_financial_year_id, account_id, closing_balance, opening_balance_created, approved_by, status)
        VALUES (?, ?, ?, ?, ?, 0, ?, 'Approved')
      `).run(companyId, fromId, toId, retainedAccount, pl.netProfit, approvedBy);
    }

    updateFinancialYearStatus(db, fromId, "Locked", approvedBy);
    auditLog(db, { company_id: companyId, user_id: approvedBy, action: "year close and carry forward", table_name: "year_end_closings", record_id: closing.lastInsertRowid, new_value: JSON.stringify({ fromId, toId, netProfit: pl.netProfit }) });
    return db.prepare("SELECT * FROM year_end_closings WHERE id = ?").get(closing.lastInsertRowid);
  });
  return transaction();
}

export function postSalesVoucher(db, billingId) {
  try {
    const invoice = db.prepare("SELECT i.*, so.department_id FROM invoices i JOIN supply_orders so ON so.id = i.order_id WHERE i.id = ?").get(billingId);
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.posting_status === "Posted") throw new Error("Invoice is already posted");
    if (!invoice.order_id) throw new Error("Cannot post invoice without order");
    if (!invoice.department_id) throw new Error("Cannot post invoice without department");
    const companyId = invoice.company_id;
    const lines = db.prepare("SELECT * FROM invoice_items WHERE billing_id = ? AND is_deleted = 0").all(billingId);
    const taxable = lines.length ? lines.reduce((sum, row) => sum + Number(row.taxable_value || 0), 0) : Number(invoice.billing_value || 0);
    const outputGst = lines.length ? lines.reduce((sum, row) => sum + Number(row.gst_amount || 0), 0) : Number(invoice.billing_value || 0) * Number(invoice.gst_rate || 0) / 100;
    const gross = taxable + outputGst;
    assertPositive(gross, "Invoice amount");
    const voucher = createBalancedVoucher(db, {
      company_id: companyId,
      voucher_date: invoice.invoice_date,
      voucher_type: invoice.invoice_type === "Credit Note" ? "Credit Note" : "Sales",
      narration: `Sales invoice ${invoice.invoice_number}`,
      source_module: "billing",
      source_id: invoice.id,
      lines: [
        { account_id: accountId(db, companyId, "Trade Receivables"), debit: gross, credit: 0, linked_party_type: "department", linked_party_id: invoice.department_id },
        { account_id: accountId(db, companyId, "Sales"), debit: 0, credit: taxable },
        { account_id: accountId(db, companyId, "Output GST"), debit: 0, credit: outputGst }
      ]
    });
    upsertReceivable(db, invoice, gross);
    markPosted(db, "invoices", invoice.id, voucher.id, invoice.invoice_date);
    auditVoucherDependencySync(db, voucher, ["general_ledger", "trial_balance", "receivables", "output_gst", "sales_register", "profitability"]);
    return voucher;
  } catch (error) {
    markPostingError(db, "invoices", billingId, error);
    throw error;
  }
}

export function postPurchaseVoucher(db, procurementId) {
  try {
    const procurement = db.prepare("SELECT * FROM procurements WHERE id = ?").get(procurementId);
    if (!procurement) throw new Error("Procurement not found");
    if (procurement.posting_status === "Posted") throw new Error("Procurement is already posted");
    const companyId = procurement.company_id;
    const lines = db.prepare("SELECT * FROM procurement_items WHERE procurement_id = ? AND is_deleted = 0").all(procurementId);
    const taxable = lines.length ? lines.reduce((sum, row) => sum + Number(row.taxable_value || 0), 0) : Number(procurement.purchase_value || 0);
    const inputGst = lines.length ? lines.reduce((sum, row) => sum + Number(row.gst_amount || 0), 0) : Number(procurement.purchase_gst || 0);
    const gross = taxable + inputGst;
    assertPositive(gross, "Purchase amount");
    const voucher = createBalancedVoucher(db, {
      company_id: companyId,
      voucher_date: procurement.purchase_date,
      voucher_type: "Purchase",
      narration: `Purchase invoice ${procurement.purchase_invoice_number}`,
      source_module: "procurement",
      source_id: procurement.id,
      lines: [
        { account_id: accountId(db, companyId, "Purchase"), debit: taxable, credit: 0 },
        { account_id: accountId(db, companyId, "Input GST"), debit: inputGst, credit: 0 },
        { account_id: accountId(db, companyId, "Trade Payables"), debit: 0, credit: gross, linked_party_type: "supplier", linked_party_id: procurement.supplier_id }
      ]
    });
    markPosted(db, "procurements", procurement.id, voucher.id, procurement.purchase_date);
    auditVoucherDependencySync(db, voucher, ["general_ledger", "trial_balance", "payables", "input_gst", "purchase_register", "profitability"]);
    return voucher;
  } catch (error) {
    markPostingError(db, "procurements", procurementId, error);
    throw error;
  }
}

export function postReceiptVoucher(db, paymentId, billingId, deductions = {}) {
  try {
    const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId);
    const invoice = db.prepare("SELECT i.*, so.department_id FROM invoices i JOIN supply_orders so ON so.id = i.order_id WHERE i.id = ?").get(billingId);
    if (!payment || !invoice) throw new Error("Payment or invoice not found");
    if (payment.posting_status === "Posted") throw new Error("Payment is already posted");
    const amount = Number(payment.payment_amount || 0);
    const tds = Number(deductions.tds_deducted || 0);
    const gstTds = Number(deductions.gst_tds_deducted || 0);
    const other = Number(deductions.other_deductions || 0);
    assertPositive(amount + tds + gstTds + other, "Receipt allocation");
    const voucher = createBalancedVoucher(db, {
      company_id: payment.company_id,
      voucher_date: payment.payment_date,
      voucher_type: "Receipt",
      narration: `Receipt ${payment.utr_number || payment.id}`,
      source_module: "payment",
      source_id: payment.id,
      lines: [
        { account_id: accountId(db, payment.company_id, payment.payment_mode === "Cash" ? "Cash" : "Bank"), debit: amount, credit: 0 },
        { account_id: accountId(db, payment.company_id, "TDS Receivable"), debit: tds, credit: 0 },
        { account_id: accountId(db, payment.company_id, "GST TDS Receivable"), debit: gstTds, credit: 0 },
        { account_id: accountId(db, payment.company_id, "Trade Receivables"), debit: 0, credit: amount + tds + gstTds + other, linked_party_type: "department", linked_party_id: invoice.department_id }
      ].filter((line) => Number(line.debit || 0) || Number(line.credit || 0))
    });
    db.prepare(`
      INSERT INTO payment_allocations (company_id, payment_id, billing_id, order_id, allocated_amount, tds_deducted, gst_tds_deducted, other_deductions, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(payment.company_id, payment.id, invoice.id, invoice.order_id, amount, tds, gstTds, other, "Auto allocation");
    refreshReceivable(db, invoice.id);
    updateCashBankLedger(db, { company_id: payment.company_id, bank_account_id: payment.bank_id, transaction_date: payment.payment_date, transaction_type: "Receipt", source_module: "payment", source_id: payment.id, voucher_id: voucher.id, debit: amount, payment_mode: payment.payment_mode, utr_number: payment.utr_number, remarks: payment.remarks });
    markPosted(db, "payments", payment.id, voucher.id, payment.payment_date);
    auditVoucherDependencySync(db, voucher, ["general_ledger", "trial_balance", "cash_bank", "receivables", "outstanding", "ageing", "cash_flow"]);
    return voucher;
  } catch (error) {
    markPostingError(db, "payments", paymentId, error);
    throw error;
  }
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

export function createReceiptAllocation(db, payload) {
  const payment = getRecord(db, "payments", payload.payment_id);
  const invoice = getRecord(db, "invoices", payload.billing_id);
  if (!payment || !invoice) throw new Error("Receipt and invoice are required");
  if (Number(payment.order_id) !== Number(invoice.order_id) && !payload.allow_excess) throw new Error("Receipt and invoice must belong to the same order unless marked excess");
  const allocated = Number(payload.allocated_amount || 0);
  const tds = Number(payload.tds_deducted || 0);
  const gstTds = Number(payload.gst_tds_deducted || 0);
  const other = Number(payload.other_deductions || 0);
  assertPositive(allocated + tds + gstTds + other, "Allocation");
  const available = receiptUnallocatedAmount(db, payment.id);
  if (allocated > available && !payload.allow_excess) throw new Error("Allocation cannot exceed available receipt amount");
  const receivable = db.prepare("SELECT * FROM receivables WHERE billing_id = ?").get(invoice.id);
  const outstanding = Number(receivable?.balance_outstanding ?? (Number(invoice.billing_value || 0) + Number(invoice.billing_value || 0) * Number(invoice.gst_rate || 0) / 100));
  if (allocated + tds + gstTds + other > outstanding && !payload.allow_excess) throw new Error("Allocation cannot exceed invoice outstanding");
  const status = payload.allow_excess ? "Excess" : available === allocated ? "Fully Allocated" : "Partially Allocated";
  const result = db.prepare(`
    INSERT INTO payment_allocations (company_id, payment_id, billing_id, order_id, allocated_amount, tds_deducted, gst_tds_deducted, other_deductions, remarks, allocation_status, allow_excess, reallocated_from_id, change_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(payment.company_id, payment.id, invoice.id, invoice.order_id, allocated, tds, gstTds, other, payload.remarks || "", status, payload.allow_excess ? 1 : 0, payload.reallocated_from_id || null, payload.change_reason || payload.reason || null);
  refreshReceivable(db, invoice.id);
  allocationAudit(db, payment.company_id, "receipt", result.lastInsertRowid, "create", null, payload, payload.remarks || "");
  return db.prepare("SELECT * FROM payment_allocations WHERE id = ?").get(result.lastInsertRowid);
}

export function unallocateReceiptAllocation(db, allocationId, reason = "") {
  if (!reason) throw new Error("Reason is required for unallocation");
  const row = db.prepare("SELECT * FROM payment_allocations WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(allocationId);
  if (!row) throw new Error("Allocation not found");
  db.prepare("UPDATE payment_allocations SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, allocation_status = 'Reallocated', change_reason = ? WHERE id = ?").run(reason, allocationId);
  refreshReceivable(db, row.billing_id);
  allocationAudit(db, row.company_id, "receipt", allocationId, "unallocate", row, null, reason);
  return true;
}

export function reallocateReceiptAllocation(db, allocationId, payload) {
  const old = db.prepare("SELECT * FROM payment_allocations WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(allocationId);
  if (!old) throw new Error("Allocation not found");
  if (!payload.reason) throw new Error("Reason is required for reallocation");
  return db.transaction(() => {
    unallocateReceiptAllocation(db, allocationId, payload.reason);
    return createReceiptAllocation(db, { ...payload, payment_id: old.payment_id, reallocated_from_id: allocationId });
  })();
}

export function createSupplierPaymentAllocation(db, payload) {
  const payment = db.prepare("SELECT * FROM supplier_payments WHERE id = ?").get(payload.supplier_payment_id);
  const procurement = getRecord(db, "procurements", payload.procurement_id);
  if (!payment || !procurement) throw new Error("Supplier payment and purchase bill are required");
  if (Number(payment.supplier_id) !== Number(procurement.supplier_id) && !payload.allow_excess) throw new Error("Supplier payment and purchase bill must belong to the same supplier unless marked advance/excess");
  const amount = Number(payload.allocated_amount || 0);
  assertPositive(amount, "Supplier allocation");
  const available = supplierPaymentUnallocatedAmount(db, payment.id);
  if (amount > available && !payload.allow_excess) throw new Error("Allocation cannot exceed available supplier payment amount");
  const outstanding = purchaseOutstandingAmount(db, procurement.id);
  if (amount > outstanding && !payload.allow_excess) throw new Error("Allocation cannot exceed purchase bill outstanding");
  const status = payload.allow_excess ? "Excess" : amount === available ? "Fully Allocated" : "Partially Allocated";
  const result = db.prepare(`
    INSERT INTO supplier_payment_allocations (company_id, supplier_payment_id, procurement_id, allocated_amount, remarks, allocation_status, allow_excess, reallocated_from_id, change_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(payment.company_id, payment.id, procurement.id, amount, payload.remarks || "", status, payload.allow_excess ? 1 : 0, payload.reallocated_from_id || null, payload.change_reason || payload.reason || null);
  allocationAudit(db, payment.company_id, "supplier_payment", result.lastInsertRowid, "create", null, payload, payload.remarks || "");
  return db.prepare("SELECT * FROM supplier_payment_allocations WHERE id = ?").get(result.lastInsertRowid);
}

export function unallocateSupplierPaymentAllocation(db, allocationId, reason = "") {
  if (!reason) throw new Error("Reason is required for supplier unallocation");
  const row = db.prepare("SELECT * FROM supplier_payment_allocations WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(allocationId);
  if (!row) throw new Error("Supplier allocation not found");
  db.prepare("UPDATE supplier_payment_allocations SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, allocation_status = 'Reallocated', change_reason = ? WHERE id = ?").run(reason, allocationId);
  allocationAudit(db, row.company_id, "supplier_payment", allocationId, "unallocate", row, null, reason);
  return true;
}

export function reallocateSupplierPaymentAllocation(db, allocationId, payload) {
  const old = db.prepare("SELECT * FROM supplier_payment_allocations WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(allocationId);
  if (!old) throw new Error("Supplier allocation not found");
  if (!payload.reason) throw new Error("Reason is required for supplier reallocation");
  return db.transaction(() => {
    unallocateSupplierPaymentAllocation(db, allocationId, payload.reason);
    return createSupplierPaymentAllocation(db, { ...payload, supplier_payment_id: old.supplier_payment_id, reallocated_from_id: allocationId });
  })();
}

export function createAdvanceReceipt(db, payload) {
  const payment = getRecord(db, "payments", payload.payment_id);
  if (!payment) throw new Error("Payment receipt is required");
  const amount = Number(payload.advance_received || receiptUnallocatedAmount(db, payment.id));
  assertPositive(amount, "Advance receipt");
  const result = db.prepare(`
    INSERT INTO advance_receipts (company_id, department_id, payment_id, order_id, advance_received, balance_advance, remarks)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(payment.company_id, payload.department_id, payment.id, payload.order_id || payment.order_id || null, amount, amount, payload.remarks || "");
  allocationAudit(db, payment.company_id, "advance_receipt", result.lastInsertRowid, "create", null, payload, payload.remarks || "");
  return db.prepare("SELECT * FROM advance_receipts WHERE id = ?").get(result.lastInsertRowid);
}

export function createSupplierAdvance(db, payload) {
  const payment = db.prepare("SELECT * FROM supplier_payments WHERE id = ?").get(payload.supplier_payment_id);
  if (!payment) throw new Error("Supplier payment is required");
  const amount = Number(payload.advance_paid || supplierPaymentUnallocatedAmount(db, payment.id));
  assertPositive(amount, "Supplier advance");
  const result = db.prepare(`
    INSERT INTO supplier_advances (company_id, supplier_id, supplier_payment_id, advance_paid, balance_advance, remarks)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(payment.company_id, payment.supplier_id, payment.id, amount, amount, payload.remarks || "");
  allocationAudit(db, payment.company_id, "supplier_advance", result.lastInsertRowid, "create", null, payload, payload.remarks || "");
  return db.prepare("SELECT * FROM supplier_advances WHERE id = ?").get(result.lastInsertRowid);
}

export function adjustAdvanceReceipt(db, payload) {
  const advance = db.prepare("SELECT * FROM advance_receipts WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(payload.advance_id);
  if (!advance) throw new Error("Advance receipt is required");
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(payload.billing_id);
  if (!invoice) throw new Error("Open invoice is required");
  const receivable = db.prepare("SELECT * FROM receivables WHERE billing_id = ? AND COALESCE(is_deleted, 0) = 0").get(invoice.id);
  if (!receivable) throw new Error("Receivable is not available for this invoice");
  const amount = Number(payload.adjusted_amount || 0);
  assertPositive(amount, "Adjustment amount");
  if (amount > Number(advance.balance_advance || 0)) throw new Error("Adjustment exceeds available advance");
  const outstanding = receivableOutstandingBeforeAdjustment(db, invoice.id);
  if (amount > outstanding) throw new Error("Adjustment exceeds invoice outstanding");
  const result = db.prepare(`
    INSERT INTO advance_adjustments (company_id, adjustment_type, advance_id, billing_id, order_id, adjusted_amount, reason, created_by)
    VALUES (?, 'receipt', ?, ?, ?, ?, ?, ?)
  `).run(advance.company_id, advance.id, invoice.id, invoice.order_id, amount, payload.reason || "Advance adjustment", payload.created_by || null);
  const balance = Number(advance.balance_advance || 0) - amount;
  db.prepare(`
    UPDATE advance_receipts SET advance_adjusted = advance_adjusted + ?, balance_advance = ?,
      status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(amount, balance, balance <= 0 ? "Closed" : "Open", advance.id);
  refreshReceivable(db, invoice.id);
  allocationAudit(db, advance.company_id, "advance_adjustment", result.lastInsertRowid, "adjust", null, payload, payload.reason || "Advance adjustment", payload.created_by || null);
  return db.prepare("SELECT * FROM advance_adjustments WHERE id = ?").get(result.lastInsertRowid);
}

export function adjustSupplierAdvance(db, payload) {
  const advance = db.prepare("SELECT * FROM supplier_advances WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(payload.advance_id);
  if (!advance) throw new Error("Supplier advance is required");
  const procurement = db.prepare("SELECT * FROM procurements WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(payload.procurement_id);
  if (!procurement) throw new Error("Purchase bill is required");
  const amount = Number(payload.adjusted_amount || 0);
  assertPositive(amount, "Adjustment amount");
  if (amount > Number(advance.balance_advance || 0)) throw new Error("Adjustment exceeds available supplier advance");
  const outstanding = purchaseOutstandingAmount(db, procurement.id);
  if (amount > outstanding) throw new Error("Adjustment exceeds purchase bill outstanding");
  const result = db.prepare(`
    INSERT INTO advance_adjustments (company_id, adjustment_type, advance_id, procurement_id, order_id, adjusted_amount, reason, created_by)
    VALUES (?, 'supplier', ?, ?, ?, ?, ?, ?)
  `).run(advance.company_id, advance.id, procurement.id, procurement.order_id, amount, payload.reason || "Supplier advance adjustment", payload.created_by || null);
  const balance = Number(advance.balance_advance || 0) - amount;
  db.prepare(`
    UPDATE supplier_advances SET advance_adjusted = advance_adjusted + ?, balance_advance = ?,
      status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(amount, balance, balance <= 0 ? "Closed" : "Open", advance.id);
  allocationAudit(db, advance.company_id, "supplier_advance_adjustment", result.lastInsertRowid, "adjust", null, payload, payload.reason || "Supplier advance adjustment", payload.created_by || null);
  return db.prepare("SELECT * FROM advance_adjustments WHERE id = ?").get(result.lastInsertRowid);
}

export function reverseAdvanceAdjustment(db, adjustmentId, reason = "", userId = null) {
  if (!reason.trim()) throw new Error("Reversal reason is required");
  const adjustment = db.prepare("SELECT * FROM advance_adjustments WHERE id = ? AND COALESCE(is_deleted, 0) = 0 AND status = 'Active'").get(adjustmentId);
  if (!adjustment) throw new Error("Active advance adjustment is required");
  if (adjustment.adjustment_type === "receipt") {
    const advance = db.prepare("SELECT * FROM advance_receipts WHERE id = ?").get(adjustment.advance_id);
    db.prepare(`
      UPDATE advance_receipts SET advance_adjusted = MAX(0, advance_adjusted - ?), balance_advance = balance_advance + ?,
        status = 'Open', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(adjustment.adjusted_amount, adjustment.adjusted_amount, advance.id);
    refreshReceivable(db, adjustment.billing_id);
  } else {
    const advance = db.prepare("SELECT * FROM supplier_advances WHERE id = ?").get(adjustment.advance_id);
    db.prepare(`
      UPDATE supplier_advances SET advance_adjusted = MAX(0, advance_adjusted - ?), balance_advance = balance_advance + ?,
        status = 'Open', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(adjustment.adjusted_amount, adjustment.adjusted_amount, advance.id);
  }
  db.prepare(`
    UPDATE advance_adjustments SET status = 'Reversed', is_deleted = 1, reversed_by = ?, reversed_at = CURRENT_TIMESTAMP,
      reversal_reason = ? WHERE id = ?
  `).run(userId, reason, adjustment.id);
  allocationAudit(db, adjustment.company_id, "advance_adjustment", adjustment.id, "reverse", adjustment, null, reason, userId);
  return { ...adjustment, status: "Reversed", reversal_reason: reason };
}

export function saveCreditTerm(db, payload) {
  const companyId = Number(payload.company_id || 0);
  if (!companyId || !payload.party_type || !payload.party_id) throw new Error("Company, party type and party are required");
  const data = {
    company_id: companyId,
    party_type: payload.party_type,
    party_id: Number(payload.party_id),
    default_credit_days: Number(payload.default_credit_days || 30),
    grace_period: Number(payload.grace_period || 0),
    due_date_rule: payload.due_date_rule || "invoice_date",
    status: payload.status || "active"
  };
  const result = db.prepare(`
    INSERT INTO credit_terms (company_id, party_type, party_id, default_credit_days, grace_period, due_date_rule, status)
    VALUES (@company_id, @party_type, @party_id, @default_credit_days, @grace_period, @due_date_rule, @status)
    ON CONFLICT(company_id, party_type, party_id) DO UPDATE SET
      default_credit_days = excluded.default_credit_days,
      grace_period = excluded.grace_period,
      due_date_rule = excluded.due_date_rule,
      status = excluded.status,
      updated_at = CURRENT_TIMESTAMP
  `).run(data);
  allocationAudit(db, companyId, "credit_terms", result.lastInsertRowid || payload.party_id, "save", null, data, "Credit term change");
  auditLog(db, { company_id: companyId, action: "credit term save", table_name: "credit_terms", record_id: result.lastInsertRowid || payload.party_id, new_value: JSON.stringify(data) });
  return db.prepare("SELECT * FROM credit_terms WHERE company_id = ? AND party_type = ? AND party_id = ?").get(companyId, data.party_type, data.party_id);
}

export function createPartyOpeningBalance(db, payload) {
  const companyId = Number(payload.company_id || 0);
  const amountDebit = Number(payload.opening_debit || 0);
  const amountCredit = Number(payload.opening_credit || 0);
  if (!companyId || !payload.party_type || !payload.party_id || !payload.financial_year_id || !payload.opening_date) throw new Error("Party, financial year and opening date are required");
  if ((amountDebit <= 0 && amountCredit <= 0) || (amountDebit > 0 && amountCredit > 0)) throw new Error("Enter either opening debit or opening credit");
  const partyAccount = partyControlAccount(db, companyId, payload.party_type);
  const suspense = accountId(db, companyId, "Opening Balance Suspense");
  const voucher = createBalancedVoucher(db, {
    company_id: companyId,
    voucher_date: payload.opening_date,
    voucher_type: "Journal",
    narration: payload.narration || `${payload.party_type} opening balance`,
    source_module: "opening_balance",
    source_id: null,
    lines: [
      { account_id: partyAccount, debit: amountDebit, credit: amountCredit, linked_party_type: payload.party_type, linked_party_id: payload.party_id },
      { account_id: suspense, debit: amountCredit, credit: amountDebit }
    ]
  });
  const result = db.prepare(`
    INSERT INTO opening_balances (company_id, financial_year_id, balance_type, linked_id, account_id, opening_debit, opening_credit, voucher_id, remarks, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(companyId, payload.financial_year_id, payload.party_type, payload.party_id, partyAccount, amountDebit, amountCredit, voucher.id, payload.narration || "", payload.created_by || null);
  allocationAudit(db, companyId, "party_opening", result.lastInsertRowid, "create", null, payload, payload.narration || "");
  return db.prepare("SELECT * FROM opening_balances WHERE id = ?").get(result.lastInsertRowid);
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

export function postSupplierPaymentVoucher(db, supplierPaymentId) {
  const payment = db.prepare("SELECT * FROM supplier_payments WHERE id = ?").get(supplierPaymentId);
  if (!payment) throw new Error("Supplier payment not found");
  const amount = Number(payment.amount_paid || 0);
  assertPositive(amount, "Supplier payment");
  const voucher = createBalancedVoucher(db, {
    company_id: payment.company_id,
    voucher_date: payment.payment_date,
    voucher_type: "Payment",
    narration: `Supplier payment ${payment.utr_number || payment.id}`,
    source_module: "supplier_payment",
    source_id: payment.id,
    lines: [
      { account_id: accountId(db, payment.company_id, "Trade Payables"), debit: amount, credit: 0, linked_party_type: "supplier", linked_party_id: payment.supplier_id },
      { account_id: accountId(db, payment.company_id, payment.payment_mode === "Cash" ? "Cash" : "Bank"), debit: 0, credit: amount }
    ]
  });
  updateCashBankLedger(db, { company_id: payment.company_id, bank_account_id: payment.bank_account_id, transaction_date: payment.payment_date, transaction_type: "Supplier Payment", source_module: "supplier_payment", source_id: payment.id, voucher_id: voucher.id, credit: amount, payment_mode: payment.payment_mode, utr_number: payment.utr_number, remarks: payment.remarks });
  db.prepare("UPDATE supplier_payments SET posting_status = 'Posted', voucher_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(voucher.id, payment.id);
  auditVoucherDependencySync(db, voucher, ["general_ledger", "trial_balance", "cash_bank", "payables", "outstanding", "ageing", "cash_flow"]);
  return voucher;
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

function stockBalance(db, companyId, itemId, warehouseId) {
  const item = db.prepare("SELECT opening_stock, opening_rate, opening_value FROM items WHERE id = ?").get(itemId) || {};
  const openingQuantity = Number(item.opening_stock || 0);
  const openingValue = Number(item.opening_value || 0) || openingQuantity * Number(item.opening_rate || 0);
  const movement = db.prepare(`
    SELECT COALESCE(SUM(inward_quantity - outward_quantity), 0) quantity,
      COALESCE(SUM(CASE WHEN transaction_type IN ('Inward','Adjustment Increase','Department Return') THEN value ELSE -value END), 0) value
    FROM stock_ledger
    WHERE company_id = ? AND item_id = ? AND warehouse_id = ?
  `).get(companyId, itemId, warehouseId);
  const quantity = openingQuantity + Number(movement?.quantity || 0);
  const value = openingValue + Number(movement?.value || 0);
  return { quantity, value: Math.max(0, value), rate: quantity > 0 ? Math.max(0, value) / quantity : Number(item.opening_rate || 0) };
}

function weightedAverageCost(db, companyId, itemId, warehouseId) {
  return stockBalance(db, companyId, itemId, warehouseId).rate;
}

function insertStockLedger(db, payload) {
  const balanceBefore = stockBalance(db, payload.company_id, payload.item_id, payload.warehouse_id);
  const inwardQuantity = Number(payload.inward_quantity || 0);
  const outwardQuantity = Number(payload.outward_quantity || 0);
  const nextQuantity = balanceBefore.quantity + inwardQuantity - outwardQuantity;
  if (nextQuantity < -0.0001) throw new Error("Stock cannot go negative");
  const rate = Number(payload.rate || balanceBefore.rate || 0);
  const value = Number(payload.value || (inwardQuantity || outwardQuantity) * rate);
  const nextValue = Math.max(0, Number(balanceBefore.value || 0) + (inwardQuantity ? value : -value));
  db.prepare(`
    INSERT INTO stock_ledger (
      company_id, item_id, warehouse_id, transaction_date, document_number, transaction_type,
      inward_quantity, outward_quantity, balance_quantity, rate, value, order_id, supplier_id,
      department_id, source_module, source_id, procurement_id, billing_id, quantity_in, quantity_out,
      running_quantity, running_value, valuation_method, remarks, voucher_id
    ) VALUES (
      @company_id, @item_id, @warehouse_id, @transaction_date, @document_number, @transaction_type,
      @inward_quantity, @outward_quantity, @balance_quantity, @rate, @value, @order_id, @supplier_id,
      @department_id, @source_module, @source_id, @procurement_id, @billing_id, @quantity_in, @quantity_out,
      @running_quantity, @running_value, @valuation_method, @remarks, @voucher_id
    )
  `).run({
    ...payload,
    inward_quantity: inwardQuantity,
    outward_quantity: outwardQuantity,
    balance_quantity: nextQuantity,
    quantity_in: inwardQuantity,
    quantity_out: outwardQuantity,
    running_quantity: nextQuantity,
    running_value: nextValue,
    valuation_method: payload.valuation_method || "Weighted Average",
    rate,
    value,
    order_id: payload.order_id || null,
    procurement_id: payload.procurement_id || null,
    billing_id: payload.billing_id || null,
    supplier_id: payload.supplier_id || null,
    department_id: payload.department_id || null,
    remarks: payload.remarks || null,
    voucher_id: payload.voucher_id || null
  });
  const info = db.prepare("SELECT last_insert_rowid() id").get();
  db.prepare(`
    INSERT INTO inventory_movements (company_id, movement_date, movement_type, from_warehouse_id, to_warehouse_id, item_id, quantity, rate, value, source_module, source_id, order_id, remarks, voucher_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.company_id,
    payload.transaction_date,
    payload.transaction_type,
    outwardQuantity ? payload.warehouse_id : null,
    inwardQuantity ? payload.warehouse_id : null,
    payload.item_id,
    inwardQuantity || outwardQuantity,
    rate,
    value,
    payload.source_module,
    payload.source_id,
    payload.order_id || null,
    payload.remarks || null,
    payload.voucher_id || null
  );
  return info.id;
}

function ensureStockNotPosted(row) {
  if (!row) throw new Error("Stock record not found");
  if (row.posting_status === "Posted") throw new Error("Stock record is already posted");
}

function serialWarrantyExpiry(date, warrantyMonths) {
  if (!date || !warrantyMonths) return null;
  const expiry = new Date(`${date}T00:00:00`);
  expiry.setMonth(expiry.getMonth() + Number(warrantyMonths || 0));
  return expiry.toISOString().slice(0, 10);
}

function syncSerialInward(db, row) {
  if (!row.serial_number) return;
  const item = db.prepare("SELECT warranty_period FROM items WHERE id = ?").get(row.item_id) || {};
  const existing = db.prepare("SELECT * FROM serial_numbers WHERE company_id = ? AND item_id = ? AND serial_number = ? AND COALESCE(is_deleted, 0) = 0")
    .get(row.company_id, row.item_id, row.serial_number);
  if (existing && existing.status !== "Draft") throw new Error("Duplicate serial number is not allowed");
  db.prepare(`
    INSERT OR IGNORE INTO serial_numbers (
      company_id, item_id, supplier_id, procurement_id, purchase_invoice_number, serial_number,
      warehouse_id, warranty_expiry, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'In Stock')
  `).run(row.company_id, row.item_id, row.supplier_id || null, row.procurement_id || null, row.purchase_invoice_number || null, row.serial_number, row.warehouse_id, serialWarrantyExpiry(row.inward_date, item.warranty_period));
  db.prepare("UPDATE serial_numbers SET warehouse_id = ?, status = 'In Stock', updated_at = CURRENT_TIMESTAMP WHERE company_id = ? AND item_id = ? AND serial_number = ?")
    .run(row.warehouse_id, row.company_id, row.item_id, row.serial_number);
}

function syncBatchInward(db, row) {
  if (!row.batch_number) return;
  const existing = db.prepare("SELECT id, quantity, balance_quantity FROM batches WHERE company_id = ? AND item_id = ? AND warehouse_id = ? AND batch_number = ? AND COALESCE(is_deleted, 0) = 0")
    .get(row.company_id, row.item_id, row.warehouse_id, row.batch_number);
  if (existing) {
    db.prepare("UPDATE batches SET quantity = quantity + ?, balance_quantity = balance_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.quantity, row.quantity, existing.id);
  } else {
    db.prepare(`
      INSERT INTO batches (company_id, item_id, supplier_id, procurement_id, batch_number, quantity, balance_quantity, purchase_date, warehouse_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.company_id, row.item_id, row.supplier_id || null, row.procurement_id || null, row.batch_number, row.quantity, row.quantity, row.inward_date, row.warehouse_id);
  }
}

function syncSerialOutward(db, row) {
  if (!row.serial_number) return;
  const serial = db.prepare("SELECT * FROM serial_numbers WHERE company_id = ? AND item_id = ? AND serial_number = ? AND COALESCE(is_deleted, 0) = 0")
    .get(row.company_id, row.item_id, row.serial_number);
  if (!serial || serial.status !== "In Stock") throw new Error("Serial number is not available for issue");
  db.prepare("UPDATE serial_numbers SET status = 'Issued', order_id = ?, department_id = ?, delivery_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(row.order_id, row.department_id || null, row.issue_date, serial.id);
}

function syncBatchOutward(db, row) {
  if (!row.batch_number) return;
  const batch = db.prepare("SELECT * FROM batches WHERE company_id = ? AND item_id = ? AND warehouse_id = ? AND batch_number = ? AND COALESCE(is_deleted, 0) = 0")
    .get(row.company_id, row.item_id, row.warehouse_id, row.batch_number);
  if (!batch || Number(batch.balance_quantity || 0) < Number(row.quantity_issued || row.quantity || 0)) throw new Error("Batch quantity is not available");
  db.prepare("UPDATE batches SET balance_quantity = balance_quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(Number(row.quantity_issued || row.quantity || 0), batch.id);
}

export function postStockInward(db, id) {
  const row = db.prepare("SELECT * FROM stock_inwards WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(id);
  ensureStockNotPosted(row);
  if (Number(row.quantity || 0) <= 0) throw new Error("Inward quantity must be positive");
  const value = Number(row.landed_cost || 0) || Number(row.quantity || 0) * Number(row.rate || 0);
  const tx = db.transaction(() => {
    insertStockLedger(db, {
      company_id: row.company_id,
      item_id: row.item_id,
      warehouse_id: row.warehouse_id,
      transaction_date: row.inward_date,
      document_number: row.purchase_invoice_number,
      transaction_type: "Inward",
      inward_quantity: row.quantity,
      outward_quantity: 0,
      rate: Number(row.quantity || 0) ? value / Number(row.quantity || 1) : Number(row.rate || 0),
      value,
      order_id: row.order_id,
      supplier_id: row.supplier_id,
      department_id: null,
      source_module: "stock_inwards",
      source_id: row.id
    });
    syncSerialInward(db, row);
    syncBatchInward(db, row);
    db.prepare("UPDATE stock_inwards SET posting_status = 'Posted', approval_status = 'Approved', posting_error = NULL, posted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    if (row.order_id) autoReserveOrderStock(db, row.order_id);
    auditLog(db, { company_id: row.company_id, action: "stock_inward_posted", table_name: "stock_inwards", record_id: id, new_value: JSON.stringify(row) });
  });
  tx();
  return db.prepare("SELECT * FROM stock_inwards WHERE id = ?").get(id);
}

export function postStockOutward(db, id) {
  const row = db.prepare("SELECT * FROM stock_outwards WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(id);
  ensureStockNotPosted(row);
  if (Number(row.quantity_issued || 0) <= 0) throw new Error("Outward quantity must be positive");
  const available = stockBalance(db, row.company_id, row.item_id, row.warehouse_id).quantity;
  if (Number(row.quantity_issued || 0) > available) throw new Error("Outward quantity exceeds available stock");
  const rate = weightedAverageCost(db, row.company_id, row.item_id, row.warehouse_id);
  const tx = db.transaction(() => {
    syncSerialOutward(db, row);
    syncBatchOutward(db, row);
    const issueValue = Number(row.quantity_issued || 0) * rate;
    const voucher = issueValue > 0 ? createBalancedVoucher(db, {
      company_id: row.company_id,
      voucher_date: row.issue_date,
      voucher_type: "Journal",
      narration: `COGS stock issue ${row.delivery_challan_number || row.id}`,
      source_module: "stock_outwards",
      source_id: row.id,
      lines: [
        { account_id: accountId(db, row.company_id, "Cost of Goods Sold"), debit: issueValue, credit: 0 },
        { account_id: accountId(db, row.company_id, "Inventory"), debit: 0, credit: issueValue }
      ]
    }) : null;
    insertStockLedger(db, {
      company_id: row.company_id,
      item_id: row.item_id,
      warehouse_id: row.warehouse_id,
      transaction_date: row.issue_date,
      document_number: row.delivery_challan_number,
      transaction_type: "Outward",
      inward_quantity: 0,
      outward_quantity: row.quantity_issued,
      rate,
      value: Number(row.quantity_issued || 0) * rate,
      order_id: row.order_id,
      supplier_id: null,
      department_id: row.department_id,
      source_module: "stock_outwards",
      source_id: row.id,
      voucher_id: voucher?.id || null,
      remarks: "Issue for supply"
    });
    db.prepare("UPDATE stock_outwards SET posting_status = 'Posted', approval_status = 'Approved', posting_error = NULL, posted_at = CURRENT_TIMESTAMP, voucher_id = COALESCE(voucher_id, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(voucher?.id || null, id);
    db.prepare(`
      UPDATE stock_reservations
      SET issued_quantity = issued_quantity + ?,
        balance_reserved = MAX(0, balance_reserved - ?),
        status = CASE WHEN MAX(0, balance_reserved - ?) <= 0 THEN 'Fully Issued' ELSE 'Partially Issued' END,
        updated_at = CURRENT_TIMESTAMP
      WHERE order_id = ? AND item_id = ? AND COALESCE(warehouse_id, 0) = COALESCE(?, 0) AND status IN ('Reserved','Partially Issued')
    `).run(row.quantity_issued, row.quantity_issued, row.quantity_issued, row.order_id, row.item_id, row.warehouse_id);
    auditLog(db, { company_id: row.company_id, action: "stock_outward_posted", table_name: "stock_outwards", record_id: id, new_value: JSON.stringify(row) });
  });
  tx();
  return db.prepare("SELECT * FROM stock_outwards WHERE id = ?").get(id);
}

export function postStockAdjustment(db, id) {
  const row = db.prepare("SELECT * FROM stock_adjustments WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(id);
  ensureStockNotPosted(row);
  if (row.approval_status !== "Approved") throw new Error("Stock adjustment requires approval before posting");
  if (Number(row.quantity || 0) <= 0) throw new Error("Adjustment quantity must be positive");
  const isIncrease = row.adjustment_type === "Increase";
  if (!isIncrease && Number(row.quantity || 0) > stockBalance(db, row.company_id, row.item_id, row.warehouse_id).quantity) throw new Error("Adjustment decrease exceeds available stock");
  const rate = Number(row.rate || 0) || weightedAverageCost(db, row.company_id, row.item_id, row.warehouse_id);
  const tx = db.transaction(() => {
    insertStockLedger(db, {
      company_id: row.company_id,
      item_id: row.item_id,
      warehouse_id: row.warehouse_id,
      transaction_date: row.adjustment_date,
      document_number: `ADJ-${row.id}`,
      transaction_type: isIncrease ? "Adjustment Increase" : "Adjustment Decrease",
      inward_quantity: isIncrease ? row.quantity : 0,
      outward_quantity: isIncrease ? 0 : row.quantity,
      rate,
      value: Number(row.quantity || 0) * rate,
      source_module: "stock_adjustments",
      source_id: row.id
    });
    db.prepare("UPDATE stock_adjustments SET posting_status = 'Posted', posting_error = NULL, posted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    auditLog(db, { company_id: row.company_id, action: "stock_adjustment_posted", table_name: "stock_adjustments", record_id: id, new_value: JSON.stringify(row) });
  });
  tx();
  return db.prepare("SELECT * FROM stock_adjustments WHERE id = ?").get(id);
}

export function approveStockAdjustment(db, id, userId = null, remarks = "Approved") {
  const row = db.prepare("SELECT * FROM stock_adjustments WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(id);
  if (!row) throw new Error("Stock adjustment not found");
  if (row.posting_status === "Posted") throw new Error("Posted adjustment cannot be re-approved");
  db.prepare("UPDATE stock_adjustments SET approval_status = 'Approved', remarks = COALESCE(NULLIF(remarks, ''), ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(remarks, id);
  auditLog(db, { company_id: row.company_id, user_id: userId, action: "stock_adjustment_approved", table_name: "stock_adjustments", record_id: id, new_value: remarks });
  return db.prepare("SELECT * FROM stock_adjustments WHERE id = ?").get(id);
}

export function postStockReturn(db, id) {
  const row = db.prepare("SELECT * FROM stock_returns WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(id);
  ensureStockNotPosted(row);
  if (Number(row.quantity || 0) <= 0) throw new Error("Return quantity must be positive");
  const isDepartmentReturn = row.return_type === "Department";
  if (!isDepartmentReturn && Number(row.quantity || 0) > stockBalance(db, row.company_id, row.item_id, row.warehouse_id).quantity) throw new Error("Supplier return exceeds available stock");
  const rate = weightedAverageCost(db, row.company_id, row.item_id, row.warehouse_id);
  const tx = db.transaction(() => {
    insertStockLedger(db, {
      company_id: row.company_id,
      item_id: row.item_id,
      warehouse_id: row.warehouse_id,
      transaction_date: row.return_date,
      document_number: `RET-${row.id}`,
      transaction_type: isDepartmentReturn ? "Department Return" : "Supplier Return",
      inward_quantity: isDepartmentReturn ? row.quantity : 0,
      outward_quantity: isDepartmentReturn ? 0 : row.quantity,
      rate,
      value: Number(row.quantity || 0) * rate,
      order_id: row.order_id,
      supplier_id: row.supplier_id,
      department_id: row.department_id,
      source_module: "stock_returns",
      source_id: row.id
    });
    db.prepare("UPDATE stock_returns SET posting_status = 'Posted', approval_status = 'Approved', posting_error = NULL, posted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    auditLog(db, { company_id: row.company_id, action: "stock_return_posted", table_name: "stock_returns", record_id: id, new_value: JSON.stringify(row) });
  });
  tx();
  return db.prepare("SELECT * FROM stock_returns WHERE id = ?").get(id);
}

export function inventoryData(db, filters = {}) {
  const companyId = Number(filters.company_id || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || 0);
  const dateFrom = filters.date_from || "1900-01-01";
  const dateTo = filters.date_to || "2999-12-31";
  const lowStockMode = filters.low_stock_mode || "stocked";
  return {
    company_id: companyId,
    references: referenceData(db, { company_id: companyId }),
    stockSummary: inventoryStockSummary(db, companyId),
    stockLedger: inventoryStockLedger(db, companyId, dateFrom, dateTo),
    stockMovement: inventoryStockMovement(db, companyId, dateFrom, dateTo),
    lowStock: inventoryLowStockReport(db, companyId, lowStockMode),
    serialNumbers: db.prepare(`
      SELECT sn.*, it.item_name, w.warehouse_name, so.order_number, gd.department_name
      FROM serial_numbers sn
      LEFT JOIN items it ON it.id = sn.item_id
      LEFT JOIN warehouses w ON w.id = sn.warehouse_id
      LEFT JOIN supply_orders so ON so.id = sn.order_id
      LEFT JOIN government_departments gd ON gd.id = sn.department_id
      WHERE sn.company_id = ? AND COALESCE(sn.is_deleted, 0) = 0
      ORDER BY sn.updated_at DESC, sn.id DESC
    `).all(companyId),
    batches: db.prepare(`
      SELECT b.*, it.item_name, s.supplier_name, w.warehouse_name
      FROM batches b
      LEFT JOIN items it ON it.id = b.item_id
      LEFT JOIN suppliers s ON s.id = b.supplier_id
      LEFT JOIN warehouses w ON w.id = b.warehouse_id
      WHERE b.company_id = ? AND COALESCE(b.is_deleted, 0) = 0
      ORDER BY b.updated_at DESC, b.id DESC
    `).all(companyId),
    valuation: inventoryValuationReport(db, companyId),
    itemProfitability: inventoryItemProfitabilityReport(db, companyId),
    dashboard: inventoryDashboard(db, companyId),
    reservations: inventoryReservations(db, companyId),
    movements: inventoryMovements(db, companyId, dateFrom, dateTo),
    procurementRequirements: procurementRequirementReport(db, companyId),
    goodsReceipts: grnReport(db, companyId, dateFrom, dateTo),
    deliveryChallans: deliveryChallanReport(db, companyId, dateFrom, dateTo),
    warehouseTransfers: warehouseTransferReport(db, companyId, dateFrom, dateTo),
    cogsReport: cogsReport(db, companyId, dateFrom, dateTo),
    reservationAgeing: reservationAgeingReport(db, companyId),
    adjustments: listRecords(db, "stock_adjustments", { company_id: companyId }),
    returns: listRecords(db, "stock_returns", { company_id: companyId }),
    inwards: listRecords(db, "stock_inwards", { company_id: companyId }),
    outwards: listRecords(db, "stock_outwards", { company_id: companyId }),
    companies: db.prepare("SELECT id, company_name FROM companies WHERE status = 'active'").all()
  };
}

function inventoryDashboard(db, companyId) {
  const summary = inventoryStockSummary(db, companyId);
  const totalStockValue = summary.reduce((sum, row) => sum + Number(row.stock_value || 0), 0);
  const totalQuantity = summary.reduce((sum, row) => sum + Number(row.closing_quantity || 0), 0);
  const lowStockItems = inventoryLowStockReport(db, companyId).length;
  const reservations = inventoryReservations(db, companyId);
  const reservedQuantity = reservations.reduce((sum, row) => sum + Number(row.balance_reserved || 0), 0);
  const issuedQuantity = reservations.reduce((sum, row) => sum + Number(row.issued_quantity || 0), 0);
  const reservedStockValue = reservations.reduce((sum, row) => sum + Number(row.balance_reserved || 0) * weightedAverageCost(db, companyId, row.item_id, row.warehouse_id || 0), 0);
  const procurementRequiredValue = reservations.reduce((sum, row) => sum + Number(row.short_quantity || 0) * weightedAverageCost(db, companyId, row.item_id, row.warehouse_id || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const pendingGrns = db.prepare("SELECT COUNT(*) count FROM goods_receipts WHERE company_id = ? AND status != 'Posted' AND COALESCE(is_deleted, 0) = 0").get(companyId).count;
  const pendingDeliveries = db.prepare("SELECT COUNT(*) count FROM delivery_challans WHERE company_id = ? AND status != 'Confirmed' AND COALESCE(is_deleted, 0) = 0").get(companyId).count;
  const stockIssuedToday = db.prepare("SELECT COALESCE(SUM(outward_quantity), 0) qty FROM stock_ledger WHERE company_id = ? AND transaction_date = ? AND transaction_type = 'Outward'").get(companyId, today).qty;
  const transfersToday = db.prepare("SELECT COUNT(*) count FROM warehouse_transfers WHERE company_id = ? AND transfer_date = ? AND COALESCE(is_deleted, 0) = 0").get(companyId, today).count;
  return [
    { id: "stock_value", metric: "Total Stock Value", value: totalStockValue, note: "Weighted average", type: "money" },
    { id: "reserved_value", metric: "Reserved Stock Value", value: reservedStockValue, note: "Open reservations", type: "money" },
    { id: "procurement_value", metric: "Procurement Required Value", value: procurementRequiredValue, note: "Short quantity estimate", type: "money" },
    { id: "pending_grns", metric: "Pending GRNs", value: pendingGrns, note: "Not posted" },
    { id: "pending_deliveries", metric: "Pending Deliveries", value: pendingDeliveries, note: "Not confirmed" },
    { id: "issued_today", metric: "Stock Issued Today", value: stockIssuedToday, note: today },
    { id: "transfers_today", metric: "Warehouse Transfers Today", value: transfersToday, note: today },
    { id: "stock_quantity", metric: "Stock Quantity", value: totalQuantity, note: "Closing quantity" },
    { id: "reserved_quantity", metric: "Reserved Quantity", value: reservedQuantity, note: "Open supply commitments" },
    { id: "issued_quantity", metric: "Issued Quantity", value: issuedQuantity, note: "Against reserved orders" },
    { id: "low_stock", metric: "Low Stock Items", value: lowStockItems, note: "At or below reorder level" }
  ];
}

function inventoryReservations(db, companyId) {
  return db.prepare(`
    SELECT sr.*, it.item_name, w.warehouse_name, so.order_number
    FROM stock_reservations sr
    LEFT JOIN items it ON it.id = sr.item_id
    LEFT JOIN warehouses w ON w.id = sr.warehouse_id
    LEFT JOIN supply_orders so ON so.id = sr.order_id
    WHERE sr.company_id = ?
    ORDER BY sr.updated_at DESC, sr.id DESC
  `).all(companyId);
}

function inventoryMovements(db, companyId, dateFrom, dateTo) {
  return db.prepare(`
    SELECT im.*, it.item_name, fw.warehouse_name from_warehouse, tw.warehouse_name to_warehouse, so.order_number,
      v.voucher_number
    FROM inventory_movements im
    LEFT JOIN items it ON it.id = im.item_id
    LEFT JOIN warehouses fw ON fw.id = im.from_warehouse_id
    LEFT JOIN warehouses tw ON tw.id = im.to_warehouse_id
    LEFT JOIN supply_orders so ON so.id = im.order_id
    LEFT JOIN vouchers v ON v.id = im.voucher_id
    WHERE im.company_id = ? AND im.movement_date BETWEEN ? AND ?
    ORDER BY im.movement_date DESC, im.id DESC
  `).all(companyId, dateFrom, dateTo);
}

function procurementRequirementReport(db, companyId) {
  return db.prepare(`
    SELECT sr.*, so.order_number, it.item_name, w.warehouse_name,
      sr.short_quantity procurement_required_quantity
    FROM stock_reservations sr
    LEFT JOIN supply_orders so ON so.id = sr.order_id
    LEFT JOIN items it ON it.id = sr.item_id
    LEFT JOIN warehouses w ON w.id = sr.warehouse_id
    WHERE sr.company_id = ? AND sr.procurement_required = 1 AND sr.status != 'Cancelled'
    ORDER BY so.order_date, it.item_name
  `).all(companyId);
}

function grnReport(db, companyId, dateFrom, dateTo) {
  return db.prepare(`
    SELECT grn.*, s.supplier_name, w.warehouse_name,
      COUNT(gri.id) line_count,
      COALESCE(SUM(gri.accepted_quantity), 0) accepted_quantity,
      COALESCE(SUM(gri.landed_cost), 0) receipt_value
    FROM goods_receipts grn
    LEFT JOIN suppliers s ON s.id = grn.supplier_id
    LEFT JOIN warehouses w ON w.id = grn.warehouse_id
    LEFT JOIN goods_receipt_items gri ON gri.grn_id = grn.id
    WHERE grn.company_id = ? AND grn.grn_date BETWEEN ? AND ? AND COALESCE(grn.is_deleted, 0) = 0
    GROUP BY grn.id
    ORDER BY grn.grn_date DESC, grn.id DESC
  `).all(companyId, dateFrom, dateTo);
}

function deliveryChallanReport(db, companyId, dateFrom, dateTo) {
  return db.prepare(`
    SELECT dc.*, so.order_number, gd.department_name,
      COUNT(dci.id) line_count,
      COALESCE(SUM(dci.quantity), 0) issued_quantity
    FROM delivery_challans dc
    LEFT JOIN supply_orders so ON so.id = dc.order_id
    LEFT JOIN government_departments gd ON gd.id = dc.department_id
    LEFT JOIN delivery_challan_items dci ON dci.delivery_challan_id = dc.id
    WHERE dc.company_id = ? AND dc.dispatch_date BETWEEN ? AND ? AND COALESCE(dc.is_deleted, 0) = 0
    GROUP BY dc.id
    ORDER BY dc.dispatch_date DESC, dc.id DESC
  `).all(companyId, dateFrom, dateTo);
}

function warehouseTransferReport(db, companyId, dateFrom, dateTo) {
  return db.prepare(`
    SELECT wt.*, it.item_name, fw.warehouse_name from_warehouse, tw.warehouse_name to_warehouse,
      wt.quantity * wt.rate transfer_value
    FROM warehouse_transfers wt
    LEFT JOIN items it ON it.id = wt.item_id
    LEFT JOIN warehouses fw ON fw.id = wt.from_warehouse_id
    LEFT JOIN warehouses tw ON tw.id = wt.to_warehouse_id
    WHERE wt.company_id = ? AND wt.transfer_date BETWEEN ? AND ? AND COALESCE(wt.is_deleted, 0) = 0
    ORDER BY wt.transfer_date DESC, wt.id DESC
  `).all(companyId, dateFrom, dateTo);
}

function cogsReport(db, companyId, dateFrom, dateTo) {
  return db.prepare(`
    SELECT le.entry_date, v.voucher_number, v.source_module, v.source_id, a.account_name,
      le.debit cogs_value, le.credit, v.narration
    FROM ledger_entries le
    JOIN accounts a ON a.id = le.account_id
    JOIN vouchers v ON v.id = le.voucher_id
    WHERE le.company_id = ? AND le.entry_date BETWEEN ? AND ? AND a.account_name = 'Cost of Goods Sold'
    ORDER BY le.entry_date DESC, le.id DESC
  `).all(companyId, dateFrom, dateTo);
}

function reservationAgeingReport(db, companyId) {
  return db.prepare(`
    SELECT sr.*, so.order_number, it.item_name, w.warehouse_name,
      CAST(julianday('now') - julianday(sr.created_at) AS INTEGER) days_reserved
    FROM stock_reservations sr
    LEFT JOIN supply_orders so ON so.id = sr.order_id
    LEFT JOIN items it ON it.id = sr.item_id
    LEFT JOIN warehouses w ON w.id = sr.warehouse_id
    WHERE sr.company_id = ? AND sr.status NOT IN ('Cancelled','Fully Issued')
    ORDER BY days_reserved DESC, sr.created_at
  `).all(companyId);
}

function inventoryStockSummary(db, companyId) {
  return db.prepare(`
    WITH first_warehouse AS (
      SELECT id
      FROM warehouses
      WHERE status = 'active'
        AND (company_id = @company_id OR company_id IS NULL OR company_id = 0)
      ORDER BY id
      LIMIT 1
    ),
    movement AS (
      SELECT item_id, warehouse_id,
        SUM(inward_quantity) inward_quantity,
        SUM(outward_quantity) outward_quantity,
        SUM(CASE WHEN inward_quantity > 0 THEN value ELSE 0 END) inward_value,
        SUM(CASE WHEN outward_quantity > 0 THEN ABS(value) ELSE 0 END) outward_value,
        SUM(CASE WHEN transaction_type IN ('Inward','Adjustment Increase','Department Return') THEN value ELSE -value END) net_value,
        COUNT(*) movement_count
      FROM stock_ledger
      WHERE company_id = @company_id
      GROUP BY item_id, warehouse_id
    ),
    item_warehouses AS (
      SELECT item_id, warehouse_id FROM movement
      UNION
      SELECT it.id item_id, COALESCE(NULLIF(it.default_warehouse_id, 0), fw.id) warehouse_id
      FROM items it
      CROSS JOIN first_warehouse fw
      WHERE it.status = 'active'
        AND (
          COALESCE(it.opening_stock, 0) != 0
          OR COALESCE(it.opening_value, 0) != 0
          OR COALESCE(it.default_warehouse_id, 0) != 0
        )
    )
    SELECT it.id, it.id item_id, it.item_name, it.brand, it.model, it.unit, w.id warehouse_id, w.warehouse_name,
      CASE WHEN iw.warehouse_id = COALESCE(NULLIF(it.default_warehouse_id, 0), (SELECT id FROM first_warehouse)) THEN COALESCE(it.opening_stock, 0) ELSE 0 END opening_stock,
      CASE WHEN iw.warehouse_id = COALESCE(NULLIF(it.default_warehouse_id, 0), (SELECT id FROM first_warehouse)) THEN COALESCE(it.opening_stock, 0) ELSE 0 END opening_quantity,
      CASE WHEN iw.warehouse_id = COALESCE(NULLIF(it.default_warehouse_id, 0), (SELECT id FROM first_warehouse)) THEN COALESCE(it.opening_value, 0) ELSE 0 END opening_value,
      COALESCE(m.inward_quantity, 0) inward_quantity,
      COALESCE(m.inward_value, 0) inward_value,
      COALESCE(m.outward_quantity, 0) outward_quantity,
      COALESCE(m.outward_value, 0) outward_value,
      CASE WHEN iw.warehouse_id = COALESCE(NULLIF(it.default_warehouse_id, 0), (SELECT id FROM first_warehouse)) THEN COALESCE(it.opening_stock, 0) ELSE 0 END + COALESCE(m.inward_quantity, 0) - COALESCE(m.outward_quantity, 0) closing_quantity,
      CASE WHEN CASE WHEN iw.warehouse_id = COALESCE(NULLIF(it.default_warehouse_id, 0), (SELECT id FROM first_warehouse)) THEN COALESCE(it.opening_stock, 0) ELSE 0 END + COALESCE(m.inward_quantity, 0) - COALESCE(m.outward_quantity, 0) > 0
        THEN (CASE WHEN iw.warehouse_id = COALESCE(NULLIF(it.default_warehouse_id, 0), (SELECT id FROM first_warehouse)) THEN COALESCE(it.opening_value, 0) ELSE 0 END + COALESCE(m.net_value, 0)) /
          (CASE WHEN iw.warehouse_id = COALESCE(NULLIF(it.default_warehouse_id, 0), (SELECT id FROM first_warehouse)) THEN COALESCE(it.opening_stock, 0) ELSE 0 END + COALESCE(m.inward_quantity, 0) - COALESCE(m.outward_quantity, 0))
        ELSE COALESCE(it.opening_rate, 0)
      END weighted_rate,
      CASE WHEN iw.warehouse_id = COALESCE(NULLIF(it.default_warehouse_id, 0), (SELECT id FROM first_warehouse)) THEN COALESCE(it.opening_value, 0) ELSE 0 END + COALESCE(m.net_value, 0) stock_value,
      it.reorder_level, it.minimum_stock_level, it.maximum_stock_level,
      CASE WHEN COALESCE(m.movement_count, 0) > 0 THEN 1 ELSE 0 END has_stock_history,
      CASE WHEN iw.warehouse_id = COALESCE(NULLIF(it.default_warehouse_id, 0), (SELECT id FROM first_warehouse)) AND (COALESCE(it.opening_stock, 0) != 0 OR COALESCE(it.opening_value, 0) != 0) THEN 1 ELSE 0 END has_confirmed_opening_stock,
      CASE
        WHEN COALESCE(m.movement_count, 0) > 0 THEN 'Stock ledger history'
        WHEN iw.warehouse_id = COALESCE(NULLIF(it.default_warehouse_id, 0), (SELECT id FROM first_warehouse)) AND (COALESCE(it.opening_stock, 0) != 0 OR COALESCE(it.opening_value, 0) != 0) THEN 'Opening stock'
        ELSE 'Assigned warehouse'
      END stock_scope
    FROM items it
    JOIN item_warehouses iw ON iw.item_id = it.id
    JOIN warehouses w ON w.id = iw.warehouse_id
    LEFT JOIN movement m ON m.item_id = it.id AND m.warehouse_id = iw.warehouse_id
    WHERE it.status = 'active' AND w.status = 'active'
      AND (w.company_id = @company_id OR w.company_id IS NULL OR w.company_id = 0)
    ORDER BY it.item_name, w.warehouse_name
  `).all({ company_id: companyId });
}

function inventoryStockLedger(db, companyId, dateFrom, dateTo) {
  return db.prepare(`
    SELECT sl.*, it.item_name, w.warehouse_name, so.order_number, s.supplier_name, gd.department_name
    FROM stock_ledger sl
    LEFT JOIN items it ON it.id = sl.item_id
    LEFT JOIN warehouses w ON w.id = sl.warehouse_id
    LEFT JOIN supply_orders so ON so.id = sl.order_id
    LEFT JOIN suppliers s ON s.id = sl.supplier_id
    LEFT JOIN government_departments gd ON gd.id = sl.department_id
    WHERE sl.company_id = ? AND sl.transaction_date BETWEEN ? AND ?
    ORDER BY sl.transaction_date, sl.id
  `).all(companyId, dateFrom, dateTo);
}

function inventoryStockMovement(db, companyId, dateFrom, dateTo) {
  return db.prepare(`
    SELECT it.item_name, w.warehouse_name, sl.transaction_type, COUNT(*) documents,
      SUM(sl.inward_quantity) inward_quantity, SUM(sl.outward_quantity) outward_quantity, SUM(sl.value) movement_value
    FROM stock_ledger sl
    JOIN items it ON it.id = sl.item_id
    JOIN warehouses w ON w.id = sl.warehouse_id
    WHERE sl.company_id = ? AND sl.transaction_date BETWEEN ? AND ?
    GROUP BY it.item_name, w.warehouse_name, sl.transaction_type
    ORDER BY it.item_name, sl.transaction_type
  `).all(companyId, dateFrom, dateTo);
}

function inventoryLowStockReport(db, companyId = null, mode = "stocked") {
  const scopedCompanyId = companyId || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || 0;
  const stockedRows = inventoryStockSummary(db, scopedCompanyId)
    .filter((row) => Number(row.closing_quantity || 0) <= Number(row.reorder_level || 0))
    .map((row) => ({ ...row, stock_status: row.stock_scope || "Stocked item" }));
  const neverStockedRows = inventoryNeverStockedLowStockRows(db, scopedCompanyId);
  if (mode === "never_stocked") return neverStockedRows;
  if (mode === "all") return [...stockedRows, ...neverStockedRows];
  return stockedRows;
}

function inventoryNeverStockedLowStockRows(db, companyId) {
  return db.prepare(`
    SELECT it.id, it.id item_id, it.item_name, it.brand, it.model, it.unit,
      NULL warehouse_id,
      'Unassigned' warehouse_name,
      0 opening_stock,
      0 opening_quantity,
      0 opening_value,
      0 inward_quantity,
      0 inward_value,
      0 outward_quantity,
      0 outward_value,
      0 closing_quantity,
      COALESCE(it.opening_rate, 0) weighted_rate,
      0 stock_value,
      it.reorder_level,
      it.minimum_stock_level,
      it.maximum_stock_level,
      0 has_stock_history,
      0 has_confirmed_opening_stock,
      'Never stocked' stock_scope,
      'Never stocked' stock_status
    FROM items it
    WHERE it.status = 'active'
      AND COALESCE(it.opening_stock, 0) = 0
      AND COALESCE(it.opening_value, 0) = 0
      AND COALESCE(it.default_warehouse_id, 0) = 0
      AND NOT EXISTS (
        SELECT 1
        FROM stock_ledger sl
        WHERE sl.company_id = ? AND sl.item_id = it.id
      )
    ORDER BY it.item_name
  `).all(companyId);
}

function inventoryValuationReport(db, companyId) {
  return inventoryStockSummary(db, companyId)
    .filter((row) => Number(row.closing_quantity || 0) !== 0 || Number(row.stock_value || 0) !== 0)
    .map((row) => ({ ...row, valuation_method: "Weighted Average" }));
}

function inventoryItemProfitabilityReport(db, companyId) {
  return db.prepare(`
    SELECT it.item_name, so.order_number,
      SUM(ii.taxable_value) billing_value,
      COALESCE((SELECT SUM(sl.value) FROM stock_ledger sl WHERE sl.company_id = ii.company_id AND sl.item_id = ii.item_id AND sl.order_id = ii.order_id AND sl.transaction_type = 'Outward'), 0) issued_stock_cost,
      SUM(ii.taxable_value) - COALESCE((SELECT SUM(sl.value) FROM stock_ledger sl WHERE sl.company_id = ii.company_id AND sl.item_id = ii.item_id AND sl.order_id = ii.order_id AND sl.transaction_type = 'Outward'), 0) gross_margin
    FROM invoice_items ii
    JOIN items it ON it.id = ii.item_id
    LEFT JOIN supply_orders so ON so.id = ii.order_id
    WHERE ii.company_id = ? AND COALESCE(ii.is_deleted, 0) = 0
    GROUP BY ii.item_id, ii.order_id
    ORDER BY gross_margin DESC
  `).all(companyId);
}

export function previewBankStatementImport(db, payload = {}) {
  const rows = normalizeBankRows(db, payload);
  return bankImportSummary(db, payload, rows);
}

export function createBankStatementImport(db, payload = {}) {
  const companyId = Number(payload.company_id || 0);
  if (!companyId) throw new Error("Company is required for bank statement import");
  const bankId = payload.bank_id ? Number(payload.bank_id) : null;
  const bankName = payload.bank_name || payload.bank_format || "Generic Format";
  const rows = normalizeBankRows(db, { ...payload, company_id: companyId, bank_id: bankId });
  const summary = bankImportSummary(db, { ...payload, company_id: companyId, bank_id: bankId }, rows);
  const hash = crypto.createHash("sha256").update(JSON.stringify({ bankId, bankName, rows: rows.map((row) => row.duplicate_key) })).digest("hex");
  const existing = db.prepare("SELECT id FROM bank_statement_imports WHERE file_hash = ? AND COALESCE(is_deleted, 0) = 0").get(hash);
  if (existing) throw new Error(`Duplicate bank statement import blocked. Existing import #${existing.id}`);

  const tx = db.transaction(() => {
    const importInfo = db.prepare(`
      INSERT INTO bank_statement_imports (company_id, bank_id, bank_name, source_file_name, file_hash, total_rows, valid_rows, duplicate_rows, error_rows, status, column_mapping, imported_by, remarks)
      VALUES (@company_id, @bank_id, @bank_name, @source_file_name, @file_hash, @total_rows, @valid_rows, @duplicate_rows, @error_rows, 'Draft', @column_mapping, @imported_by, @remarks)
    `).run({
      company_id: companyId,
      bank_id: bankId,
      bank_name: bankName,
      source_file_name: payload.file_name || payload.source_file_name || "bank-statement",
      file_hash: hash,
      total_rows: summary.totalRows,
      valid_rows: summary.validRows,
      duplicate_rows: summary.duplicateRows,
      error_rows: summary.errorRows,
      column_mapping: JSON.stringify(summary.mapping || {}),
      imported_by: payload.imported_by || payload.user_id || null,
      remarks: payload.remarks || null
    });
    rows.forEach((row) => insertBankStatementEntry(db, importInfo.lastInsertRowid, row));
    auditLog(db, {
      company_id: companyId,
      user_id: payload.imported_by || payload.user_id || null,
      action: "bank_statement_import_created",
      table_name: "bank_statement_imports",
      record_id: importInfo.lastInsertRowid,
      new_value: JSON.stringify({ file: payload.file_name, totalRows: summary.totalRows, validRows: summary.validRows, duplicateRows: summary.duplicateRows, errorRows: summary.errorRows })
    });
    return importInfo.lastInsertRowid;
  });
  const id = tx();
  return bankStatementData(db, { company_id: companyId, import_id: id });
}

export function updateBankImportStatus(db, importId, status, userId = null, remarks = "") {
  const row = db.prepare("SELECT * FROM bank_statement_imports WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(importId);
  if (!row) throw new Error("Bank statement import not found");
  const next = String(status || "").trim();
  if (!["Ready for Review", "Approved", "Rejected"].includes(next)) throw new Error("Unsupported bank statement status");
  if (row.posting_status === "Posted") throw new Error("Posted bank statement import cannot be changed");
  if (next === "Approved" && (Number(row.error_rows || 0) > 0 || Number(row.duplicate_rows || 0) > 0)) {
    throw new Error("Resolve validation errors and duplicates before approval");
  }
  const fieldSql = next === "Approved"
    ? "status = 'Approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, remarks = COALESCE(NULLIF(?, ''), remarks)"
    : next === "Rejected"
      ? "status = 'Rejected', rejected_by = ?, rejected_at = CURRENT_TIMESTAMP, rejection_reason = ?"
      : "status = 'Ready for Review', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, remarks = COALESCE(NULLIF(?, ''), remarks)";
  db.prepare(`UPDATE bank_statement_imports SET ${fieldSql} WHERE id = ?`).run(userId, remarks, importId);
  db.prepare("UPDATE bank_statement_entries SET review_status = ? WHERE import_id = ? AND COALESCE(is_deleted, 0) = 0").run(next, importId);
  auditLog(db, { company_id: row.company_id, user_id: userId, action: `bank_statement_${next.toLowerCase().replaceAll(" ", "_")}`, table_name: "bank_statement_imports", record_id: importId, new_value: remarks || next });
  if (next === "Approved") generateVoucherProposalsForImport(db, importId, userId);
  return bankStatementData(db, { company_id: row.company_id, import_id: importId });
}

export function manualBankEntryMatch(db, entryId, payload = {}) {
  const entry = db.prepare("SELECT * FROM bank_statement_entries WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(entryId);
  if (!entry) throw new Error("Bank statement entry not found");
  const moduleName = payload.matched_module || payload.module;
  const recordId = Number(payload.matched_record_id || payload.record_id || 0);
  if (!moduleName || !recordId) throw new Error("Match module and record ID are required");
  const reference = payload.matched_reference || referenceModule(db, moduleName, recordId)?.reference || `${moduleName} #${recordId}`;
  const score = Math.min(100, Math.max(0, Number(payload.confidence_score || 100)));
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE bank_statement_entries
      SET match_status = 'Matched', matched_module = ?, matched_record_id = ?, matched_reference = ?, matched_score = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(moduleName, recordId, reference, score, entryId);
    db.prepare(`
      INSERT INTO bank_reconciliation_matches (company_id, bank_entry_id, matched_module, matched_record_id, matched_reference, confidence_score, match_method, status, matched_by, remarks)
      VALUES (?, ?, ?, ?, ?, ?, 'Manual', 'Accepted', ?, ?)
    `).run(entry.company_id, entryId, moduleName, recordId, reference, score, payload.user_id || null, payload.remarks || null);
    auditLog(db, { company_id: entry.company_id, user_id: payload.user_id || null, action: "bank_entry_manual_matched", table_name: "bank_statement_entries", record_id: entryId, new_value: JSON.stringify({ moduleName, recordId, reference, score }) });
  });
  tx();
  return db.prepare("SELECT * FROM bank_statement_entries WHERE id = ?").get(entryId);
}

export function postApprovedBankImport(db, importId, userId = null) {
  const statement = db.prepare("SELECT * FROM bank_statement_imports WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(importId);
  if (!statement) throw new Error("Bank statement import not found");
  auditLog(db, { company_id: statement.company_id, user_id: userId, action: "bank_statement_direct_post_blocked", table_name: "bank_statement_imports", record_id: importId, new_value: "Use Voucher Proposal Queue. Bank imports cannot post directly." });
  throw new Error("Direct Bank Book posting is disabled. Use Voucher Proposal Queue so every bank entry is reviewed, approved, drafted and posted through vouchers.");
}

export function generateVoucherProposalsForImport(db, importId, userId = null) {
  const statement = db.prepare("SELECT * FROM bank_statement_imports WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(importId);
  if (!statement) throw new Error("Bank statement import not found");
  if (statement.status !== "Approved") throw new Error("Bank statement import must be approved before proposal generation");
  const entries = db.prepare(`
    SELECT bse.*, bsi.bank_name, bsi.bank_id import_bank_id
    FROM bank_statement_entries bse
    JOIN bank_statement_imports bsi ON bsi.id = bse.import_id
    WHERE bse.import_id = ?
      AND bse.validation_status = 'Valid'
      AND bse.match_status != 'Duplicate'
      AND COALESCE(bse.is_deleted, 0) = 0
      AND NOT EXISTS (SELECT 1 FROM voucher_proposals vp WHERE vp.bank_entry_id = bse.id AND COALESCE(vp.is_deleted, 0) = 0)
    ORDER BY bse.transaction_date, bse.id
  `).all(importId);
  const tx = db.transaction(() => {
    entries.forEach((entry) => {
      const proposal = buildVoucherProposal(db, statement.company_id, entry);
      const info = db.prepare(`
        INSERT INTO voucher_proposals (
          company_id, bank_entry_id, import_id, bank_id, bank_name, transaction_date, narration, debit, credit, utr, reference_number,
          suggested_voucher_type, suggested_party_type, suggested_party_id, suggested_party_name, suggested_ledger_id, suggested_ledger_name,
          linked_invoice_id, linked_procurement_id, linked_order_id, linked_voucher_id, confidence_score, status, remarks
        ) VALUES (
          @company_id, @bank_entry_id, @import_id, @bank_id, @bank_name, @transaction_date, @narration, @debit, @credit, @utr, @reference_number,
          @suggested_voucher_type, @suggested_party_type, @suggested_party_id, @suggested_party_name, @suggested_ledger_id, @suggested_ledger_name,
          @linked_invoice_id, @linked_procurement_id, @linked_order_id, @linked_voucher_id, @confidence_score, @status, @remarks
        )
      `).run(proposal);
      proposalAudit(db, { company_id: statement.company_id, proposal_id: info.lastInsertRowid, bank_entry_id: entry.id, action: "Proposal Generated", created_by: userId, new_value: JSON.stringify({ status: proposal.status, confidence_score: proposal.confidence_score }) });
      db.prepare("UPDATE bank_statement_entries SET review_status = 'Ready for Voucher Proposal', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(entry.id);
    });
    auditLog(db, { company_id: statement.company_id, user_id: userId, action: "voucher_proposals_generated", table_name: "bank_statement_imports", record_id: importId, new_value: JSON.stringify({ proposals: entries.length }) });
  });
  tx();
  return voucherProposalData(db, { company_id: statement.company_id, import_id: importId });
}

function buildVoucherProposal(db, companyId, entry) {
  const amount = Number(entry.amount || Math.max(Number(entry.debit || 0), Number(entry.credit || 0)));
  const isReceipt = entry.entry_type === "Receipt" || Number(entry.credit || 0) > 0;
  const suggestedVoucherType = isReceipt ? "Receipt" : inferPaymentVoucherType(entry.narration);
  const linked = linkedPartyForBankEntry(db, companyId, entry, isReceipt);
  const ledgerName = isReceipt ? "Trade Receivables" : suggestedVoucherType === "Bank Charges" ? "Bank Charges" : "Trade Payables";
  const ledger = db.prepare("SELECT id, account_name FROM accounts WHERE company_id = ? AND account_name = ? AND is_deleted = 0").get(companyId, ledgerName)
    || db.prepare("SELECT id, account_name FROM accounts WHERE company_id = ? AND account_name = ? AND is_deleted = 0").get(companyId, isReceipt ? "Sales" : "Expense Payable");
  const score = proposalConfidence(entry, linked, suggestedVoucherType);
  return {
    company_id: companyId,
    bank_entry_id: entry.id,
    import_id: entry.import_id,
    bank_id: entry.bank_id || entry.import_bank_id || null,
    bank_name: entry.bank_name || "Generic Format",
    transaction_date: entry.transaction_date,
    narration: entry.narration,
    debit: Number(entry.debit || 0),
    credit: Number(entry.credit || 0),
    utr: entry.utr || null,
    reference_number: entry.reference_number || null,
    suggested_voucher_type: suggestedVoucherType,
    suggested_party_type: linked.party_type || null,
    suggested_party_id: linked.party_id || null,
    suggested_party_name: linked.party_name || null,
    suggested_ledger_id: ledger?.id || null,
    suggested_ledger_name: ledger?.account_name || ledgerName,
    linked_invoice_id: linked.invoice_id || null,
    linked_procurement_id: linked.procurement_id || null,
    linked_order_id: linked.order_id || null,
    linked_voucher_id: entry.matched_module === "vouchers" ? entry.matched_record_id : null,
    confidence_score: score,
    status: score >= 70 ? "Suggested" : "Needs Review",
    remarks: linked.reference || entry.matched_reference || null
  };
}

function inferPaymentVoucherType(narration = "") {
  return /charge|charges|fee|fees|sms|neft chg|rtgs chg|commission/i.test(narration) ? "Bank Charges" : "Payment";
}

function linkedPartyForBankEntry(db, companyId, entry, isReceipt) {
  const moduleName = entry.matched_module;
  const recordId = Number(entry.matched_record_id || 0);
  if (moduleName === "invoices" && recordId) {
    const row = db.prepare(`
      SELECT i.id invoice_id, i.order_id, i.invoice_number reference, so.department_id party_id, gd.department_name party_name
      FROM invoices i
      LEFT JOIN supply_orders so ON so.id = i.order_id
      LEFT JOIN government_departments gd ON gd.id = so.department_id
      WHERE i.id = ? AND i.company_id = ?
    `).get(recordId, companyId);
    if (row) return { party_type: "Department", ...row };
  }
  if (moduleName === "payments" && recordId) {
    const row = db.prepare(`
      SELECT p.id payment_id, p.order_id, p.utr_number reference, so.department_id party_id, gd.department_name party_name,
        (SELECT id FROM invoices WHERE order_id = p.order_id AND COALESCE(is_deleted, 0) = 0 ORDER BY invoice_date DESC LIMIT 1) invoice_id
      FROM payments p
      LEFT JOIN supply_orders so ON so.id = p.order_id
      LEFT JOIN government_departments gd ON gd.id = so.department_id
      WHERE p.id = ? AND COALESCE(p.company_id, ?) = ?
    `).get(recordId, companyId, companyId);
    if (row) return { party_type: "Department", ...row };
  }
  if (moduleName === "procurements" && recordId) {
    const row = db.prepare(`
      SELECT p.id procurement_id, p.order_id, p.purchase_invoice_number reference, p.supplier_id party_id, s.supplier_name party_name
      FROM procurements p
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.id = ? AND COALESCE(p.company_id, ?) = ?
    `).get(recordId, companyId, companyId);
    if (row) return { party_type: "Supplier", ...row };
  }
  if (moduleName === "supplier_payments" && recordId) {
    const row = db.prepare(`
      SELECT sp.id supplier_payment_id, sp.order_id, sp.utr_number reference, sp.supplier_id party_id, s.supplier_name party_name,
        (SELECT id FROM procurements WHERE order_id = sp.order_id AND supplier_id = sp.supplier_id AND COALESCE(is_deleted, 0) = 0 ORDER BY purchase_date DESC LIMIT 1) procurement_id
      FROM supplier_payments sp
      LEFT JOIN suppliers s ON s.id = sp.supplier_id
      WHERE sp.id = ? AND sp.company_id = ?
    `).get(recordId, companyId);
    if (row) return { party_type: "Supplier", ...row };
  }
  const narration = String(entry.narration || "").toLowerCase();
  if (isReceipt) {
    const department = db.prepare("SELECT id party_id, department_name party_name FROM government_departments WHERE status = 'active' AND instr(?, lower(department_name)) > 0 ORDER BY length(department_name) DESC LIMIT 1").get(narration);
    if (department) return { party_type: "Department", ...department };
  } else {
    const supplier = db.prepare("SELECT id party_id, supplier_name party_name FROM suppliers WHERE status = 'active' AND instr(?, lower(supplier_name)) > 0 ORDER BY length(supplier_name) DESC LIMIT 1").get(narration);
    if (supplier) return { party_type: "Supplier", ...supplier };
  }
  const orderNumber = String(entry.narration || "").match(/[A-Z]{1,5}[-/]?\d{3,}/i)?.[0];
  if (orderNumber) {
    const order = db.prepare("SELECT id order_id, order_number reference FROM supply_orders WHERE order_number LIKE ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1").get(`%${orderNumber}%`);
    if (order) return order;
  }
  return {};
}

function proposalConfidence(entry, linked, voucherType) {
  let score = 20;
  if (entry.utr) score += 20;
  if (entry.matched_reference) score += 20;
  if (entry.matched_score) score += Math.min(25, Number(entry.matched_score || 0) / 4);
  if (linked.party_id) score += 15;
  if (linked.invoice_id || linked.procurement_id) score += 15;
  if (linked.order_id) score += 10;
  if (voucherType === "Bank Charges") score = Math.max(score, 62);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function voucherProposalData(db, filters = {}) {
  const companyId = Number(filters.company_id || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || 0);
  const where = ["vp.company_id = ?", "COALESCE(vp.is_deleted, 0) = 0"];
  const params = [companyId];
  if (filters.status) {
    where.push("vp.status = ?");
    params.push(filters.status);
  }
  if (filters.import_id) {
    where.push("vp.import_id = ?");
    params.push(Number(filters.import_id));
  }
  const proposals = db.prepare(`
    SELECT vp.*, b.bank_account_name, bse.match_status bank_match_status, bse.validation_status bank_validation_status,
      dv.voucher_number draft_voucher_number, dv.status draft_voucher_status,
      pv.voucher_number posted_voucher_number
    FROM voucher_proposals vp
    LEFT JOIN banks b ON b.id = vp.bank_id
    LEFT JOIN bank_statement_entries bse ON bse.id = vp.bank_entry_id
    LEFT JOIN vouchers dv ON dv.id = vp.draft_voucher_id
    LEFT JOIN vouchers pv ON pv.id = vp.posted_voucher_id
    WHERE ${where.join(" AND ")}
    ORDER BY vp.updated_at DESC, vp.id DESC
  `).all(...params).map((row) => ({ ...row, ...voucherProposalControlMeta(row) }));
  return {
    proposals,
    dashboard: {
      pendingProposals: proposals.filter((row) => ["Suggested", "Needs Review"].includes(row.status)).length,
      approvedPendingPosting: proposals.filter((row) => ["Approved", "Draft Voucher Created"].includes(row.status)).length,
      rejectedProposals: proposals.filter((row) => row.status === "Rejected").length,
      postedProposals: proposals.filter((row) => row.status === "Posted").length,
      unmatchedEntries: db.prepare("SELECT COUNT(*) count FROM bank_statement_entries WHERE company_id = ? AND match_status = 'Unmatched' AND COALESCE(is_deleted, 0) = 0").get(companyId).count,
      duplicateBankEntries: db.prepare("SELECT COUNT(*) count FROM bank_statement_entries WHERE company_id = ? AND match_status = 'Duplicate' AND COALESCE(is_deleted, 0) = 0").get(companyId).count,
      bankEntriesAwaitingReview: db.prepare("SELECT COUNT(*) count FROM bank_statement_entries WHERE company_id = ? AND review_status IN ('Draft','Ready for Review','Approved','Ready for Voucher Proposal') AND COALESCE(is_deleted, 0) = 0").get(companyId).count
    },
    audit: db.prepare("SELECT * FROM voucher_proposal_audit WHERE company_id = ? ORDER BY created_at DESC, id DESC LIMIT 500").all(companyId),
    accounts: db.prepare("SELECT id, account_name, account_code, account_type FROM accounts WHERE company_id = ? AND is_deleted = 0 ORDER BY account_code").all(companyId),
    departments: db.prepare("SELECT id, department_name FROM government_departments WHERE status = 'active' ORDER BY department_name").all(),
    suppliers: db.prepare("SELECT id, supplier_name FROM suppliers WHERE status = 'active' ORDER BY supplier_name").all()
  };
}

function voucherProposalControlMeta(row) {
  const status = row.status || "Suggested";
  if (status === "Posted") {
    return {
      status_reason: "Posted voucher is linked and has ledger impact",
      blocking_reason: "Posted proposals cannot be edited directly",
      recommended_action: "Review posted voucher, ledger and audit trail"
    };
  }
  if (status === "Draft Voucher Created") {
    return {
      status_reason: "Draft voucher exists but is not posted",
      blocking_reason: row.draft_voucher_status === "Posted" ? "Draft voucher is already posted" : "Posting is pending final review",
      recommended_action: "Review draft voucher and post only if it is safe"
    };
  }
  if (status === "Approved") {
    return {
      status_reason: "Proposal approved by checker",
      blocking_reason: row.draft_voucher_id ? "Draft voucher already exists" : "Draft voucher creation is pending",
      recommended_action: "Create draft voucher, then review before posting"
    };
  }
  if (status === "Rejected") {
    return {
      status_reason: "Proposal rejected and stopped",
      blocking_reason: row.rejection_reason || row.remarks || "Rejection reason not recorded",
      recommended_action: "Review rejection reason and source bank entry"
    };
  }
  if (status === "Needs Review") {
    return {
      status_reason: "Maker review changed or confirmed proposal mapping",
      blocking_reason: "Checker approval is pending",
      recommended_action: "Approve, reject or correct the proposal mapping"
    };
  }
  return {
    status_reason: "Auto-suggested from approved bank statement",
    blocking_reason: row.confidence_score < 70 ? "Low confidence score requires manual review" : "Manual review is pending",
    recommended_action: "Review party, ledger, source links and narration"
  };
}

export function updateVoucherProposal(db, proposalId, payload = {}) {
  const proposal = getVoucherProposal(db, proposalId);
  if (["Draft Voucher Created", "Posted"].includes(proposal.status)) throw new Error("Proposal cannot be edited after draft voucher creation");
  const next = {
    suggested_voucher_type: payload.suggested_voucher_type || proposal.suggested_voucher_type,
    suggested_party_type: payload.suggested_party_type || proposal.suggested_party_type,
    suggested_party_id: payload.suggested_party_id ? Number(payload.suggested_party_id) : proposal.suggested_party_id,
    suggested_party_name: payload.suggested_party_name || proposal.suggested_party_name,
    suggested_ledger_id: payload.suggested_ledger_id ? Number(payload.suggested_ledger_id) : proposal.suggested_ledger_id,
    suggested_ledger_name: payload.suggested_ledger_name || proposal.suggested_ledger_name,
    linked_invoice_id: payload.linked_invoice_id ? Number(payload.linked_invoice_id) : proposal.linked_invoice_id,
    linked_procurement_id: payload.linked_procurement_id ? Number(payload.linked_procurement_id) : proposal.linked_procurement_id,
    linked_order_id: payload.linked_order_id ? Number(payload.linked_order_id) : proposal.linked_order_id,
    narration: payload.narration || proposal.narration,
    remarks: payload.remarks || proposal.remarks,
    status: payload.status || "Needs Review"
  };
  db.prepare(`
    UPDATE voucher_proposals SET
      suggested_voucher_type = @suggested_voucher_type,
      suggested_party_type = @suggested_party_type,
      suggested_party_id = @suggested_party_id,
      suggested_party_name = @suggested_party_name,
      suggested_ledger_id = @suggested_ledger_id,
      suggested_ledger_name = @suggested_ledger_name,
      linked_invoice_id = @linked_invoice_id,
      linked_procurement_id = @linked_procurement_id,
      linked_order_id = @linked_order_id,
      narration = @narration,
      remarks = @remarks,
      status = @status,
      reviewed_by = @reviewed_by,
      reviewed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({ ...next, reviewed_by: payload.user_id || null, id: proposal.id });
  proposalAudit(db, { company_id: proposal.company_id, proposal_id: proposal.id, bank_entry_id: proposal.bank_entry_id, action: "Proposal Edited", created_by: payload.user_id || null, old_value: JSON.stringify(proposal), new_value: JSON.stringify(next), remarks: payload.remarks || null });
  return voucherProposalData(db, { company_id: proposal.company_id });
}

export function approveVoucherProposal(db, proposalId, userId = null, remarks = "") {
  const proposal = getVoucherProposal(db, proposalId);
  if (!["Suggested", "Needs Review", "Approved"].includes(proposal.status)) throw new Error("Only suggested or reviewed proposals can be approved");
  db.prepare("UPDATE voucher_proposals SET status = 'Approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, remarks = COALESCE(NULLIF(?, ''), remarks), updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(userId, remarks, proposal.id);
  proposalAudit(db, { company_id: proposal.company_id, proposal_id: proposal.id, bank_entry_id: proposal.bank_entry_id, action: "Proposal Approved", created_by: userId, remarks });
  return voucherProposalData(db, { company_id: proposal.company_id });
}

export function rejectVoucherProposal(db, proposalId, userId = null, reason = "") {
  const proposal = getVoucherProposal(db, proposalId);
  if (proposal.status === "Posted") throw new Error("Posted proposal cannot be rejected");
  db.prepare("UPDATE voucher_proposals SET status = 'Rejected', rejected_by = ?, rejected_at = CURRENT_TIMESTAMP, rejection_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(userId, reason, proposal.id);
  proposalAudit(db, { company_id: proposal.company_id, proposal_id: proposal.id, bank_entry_id: proposal.bank_entry_id, action: "Proposal Rejected", created_by: userId, remarks: reason });
  return voucherProposalData(db, { company_id: proposal.company_id });
}

export function createDraftVoucherFromProposal(db, proposalId, userId = null) {
  const proposal = getVoucherProposal(db, proposalId);
  if (proposal.status !== "Approved") throw new Error("Proposal must be approved before draft voucher creation");
  if (proposal.draft_voucher_id) throw new Error("Draft voucher already exists for this proposal");
  const lines = voucherLinesFromProposal(db, proposal);
  const financialYear = assertOpenFinancialYear(db, proposal.company_id, proposal.transaction_date);
  const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) throw new Error("Draft voucher proposal is not balanced");
  const tx = db.transaction(() => {
    const voucherNumber = nextVoucherNumber(db, proposal.company_id, `DRAFT-${proposal.suggested_voucher_type.toUpperCase().replaceAll(" ", "")}`);
    const info = db.prepare(`
      INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, narration, source_module, source_id, status, financial_year_id, approval_status)
      VALUES (?, ?, ?, ?, ?, 'voucher_proposal', ?, 'Draft', ?, 'Pending Approval')
    `).run(proposal.company_id, voucherNumber, proposal.transaction_date, normalizeVoucherType(proposal.suggested_voucher_type), proposal.narration, proposal.id, financialYear.id);
    lines.forEach((line) => {
      db.prepare(`
        INSERT INTO voucher_lines (voucher_id, account_id, debit, credit, narration, linked_party_type, linked_party_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(info.lastInsertRowid, line.account_id, line.debit, line.credit, line.narration, line.linked_party_type || null, line.linked_party_id || null);
    });
    db.prepare("UPDATE voucher_proposals SET status = 'Draft Voucher Created', draft_voucher_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(info.lastInsertRowid, proposal.id);
    db.prepare("UPDATE bank_statement_entries SET voucher_id = ?, review_status = 'Draft Voucher Created', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(info.lastInsertRowid, proposal.bank_entry_id);
    proposalAudit(db, { company_id: proposal.company_id, proposal_id: proposal.id, bank_entry_id: proposal.bank_entry_id, action: "Draft Voucher Created", created_by: userId, new_value: JSON.stringify({ voucher_id: info.lastInsertRowid, voucher_number: voucherNumber }) });
    return info.lastInsertRowid;
  });
  tx();
  return voucherProposalData(db, { company_id: proposal.company_id });
}

export function postDraftVoucherFromProposal(db, proposalId, userId = null) {
  const proposal = getVoucherProposal(db, proposalId);
  if (proposal.status !== "Draft Voucher Created") throw new Error("Create a draft voucher before posting");
  if (!proposal.draft_voucher_id) throw new Error("Draft voucher is missing");
  if (proposal.posted_voucher_id) throw new Error("Proposal already has a posted voucher");
  const voucher = db.prepare("SELECT * FROM vouchers WHERE id = ? AND source_module = 'voucher_proposal' AND is_deleted = 0").get(proposal.draft_voucher_id);
  if (!voucher) throw new Error("Draft voucher not found");
  if (voucher.status === "Posted") throw new Error("Draft voucher is already posted");
  const lines = db.prepare("SELECT * FROM voucher_lines WHERE voucher_id = ? ORDER BY id").all(voucher.id);
  const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) throw new Error("Draft voucher is not balanced");
  assertOpenFinancialYear(db, voucher.company_id, voucher.voucher_date);
  const tx = db.transaction(() => {
    lines.forEach((line) => {
      postLedgerEntry(db, voucher.company_id, voucher.id, line.id, line.account_id, voucher.voucher_date, Number(line.debit || 0), Number(line.credit || 0), "voucher_proposal", proposal.id);
    });
    lines.forEach((line) => {
      const account = accountById(db, voucher.company_id, line.account_id);
      if (!["Cash", "Bank"].includes(account?.account_name)) return;
      updateCashBankLedger(db, {
        company_id: voucher.company_id,
        bank_account_id: proposal.bank_id || null,
        transaction_date: voucher.voucher_date,
        transaction_type: voucher.voucher_type,
        source_module: "voucher_proposal",
        source_id: proposal.id,
        voucher_id: voucher.id,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        payment_mode: "Bank Statement",
        utr_number: proposal.utr || proposal.reference_number || voucher.voucher_number,
        remarks: voucher.narration || proposal.narration
      });
    });
    db.prepare("UPDATE vouchers SET status = 'Posted', approval_status = 'Approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(voucher.id);
    db.prepare("UPDATE voucher_proposals SET status = 'Posted', posted_voucher_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(voucher.id, proposal.id);
    db.prepare("UPDATE bank_statement_entries SET review_status = 'Posted', posted_bank_book_id = (SELECT id FROM cash_bank_ledger WHERE voucher_id = ? ORDER BY id DESC LIMIT 1), updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(voucher.id, proposal.bank_entry_id);
    proposalAudit(db, { company_id: proposal.company_id, proposal_id: proposal.id, bank_entry_id: proposal.bank_entry_id, action: "Voucher Posted", created_by: userId, new_value: JSON.stringify({ voucher_id: voucher.id, voucher_number: voucher.voucher_number }) });
    auditLog(db, { company_id: proposal.company_id, user_id: userId, action: "voucher_proposal_posted", table_name: "voucher_proposals", record_id: proposal.id, new_value: JSON.stringify({ voucher_id: voucher.id }) });
  });
  tx();
  return voucherProposalData(db, { company_id: proposal.company_id });
}

function voucherLinesFromProposal(db, proposal) {
  const amount = Number(proposal.credit || proposal.debit || 0);
  if (amount <= 0) throw new Error("Proposal amount is required");
  const bankAccount = accountId(db, proposal.company_id, "Bank");
  const ledgerAccount = Number(proposal.suggested_ledger_id || 0) || accountId(db, proposal.company_id, proposal.suggested_voucher_type === "Bank Charges" ? "Bank Charges" : proposal.credit > 0 ? "Trade Receivables" : "Trade Payables");
  const partyType = proposal.suggested_party_type || null;
  const partyId = proposal.suggested_party_id || null;
  if (Number(proposal.credit || 0) > 0) {
    return [
      { account_id: bankAccount, debit: amount, credit: 0, narration: proposal.narration, linked_party_type: null, linked_party_id: null },
      { account_id: ledgerAccount, debit: 0, credit: amount, narration: proposal.narration, linked_party_type: partyType, linked_party_id: partyId }
    ];
  }
  return [
    { account_id: ledgerAccount, debit: amount, credit: 0, narration: proposal.narration, linked_party_type: partyType, linked_party_id: partyId },
    { account_id: bankAccount, debit: 0, credit: amount, narration: proposal.narration, linked_party_type: null, linked_party_id: null }
  ];
}

function normalizeVoucherType(type = "") {
  if (String(type).includes("Receipt")) return "Receipt";
  if (String(type).includes("Contra")) return "Contra";
  if (String(type).includes("Charges")) return "Payment";
  return ["Sales", "Purchase", "Receipt", "Payment", "Journal", "Credit Note", "Debit Note", "Contra"].includes(type) ? type : "Payment";
}

function getVoucherProposal(db, proposalId) {
  const proposal = db.prepare("SELECT * FROM voucher_proposals WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(Number(proposalId || 0));
  if (!proposal) throw new Error("Voucher proposal not found");
  return proposal;
}

function proposalAudit(db, payload) {
  db.prepare(`
    INSERT INTO voucher_proposal_audit (company_id, proposal_id, bank_entry_id, action, old_value, new_value, remarks, created_by)
    VALUES (@company_id, @proposal_id, @bank_entry_id, @action, @old_value, @new_value, @remarks, @created_by)
  `).run({
    company_id: payload.company_id,
    proposal_id: payload.proposal_id,
    bank_entry_id: payload.bank_entry_id || null,
    action: payload.action,
    old_value: payload.old_value || null,
    new_value: payload.new_value || null,
    remarks: payload.remarks || null,
    created_by: payload.created_by || null
  });
}

export function bankStatementData(db, filters = {}) {
  const companyId = Number(filters.company_id || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || 0);
  const imports = db.prepare(`
    SELECT bsi.*, b.bank_account_name
    FROM bank_statement_imports bsi
    LEFT JOIN banks b ON b.id = bsi.bank_id
    WHERE bsi.company_id = ? AND COALESCE(bsi.is_deleted, 0) = 0
    ORDER BY bsi.imported_at DESC, bsi.id DESC
  `).all(companyId);
  const importId = Number(filters.import_id || imports[0]?.id || 0);
  const entries = importId ? db.prepare(`
    SELECT * FROM bank_statement_entries
    WHERE company_id = ? AND import_id = ? AND COALESCE(is_deleted, 0) = 0
    ORDER BY transaction_date, id
  `).all(companyId, importId) : [];
  return {
    imports,
    entries,
    matches: importId ? db.prepare("SELECT * FROM bank_reconciliation_matches WHERE company_id = ? AND bank_entry_id IN (SELECT id FROM bank_statement_entries WHERE import_id = ?) ORDER BY matched_at DESC").all(companyId, importId) : [],
    unmatchedReceipts: db.prepare("SELECT * FROM bank_statement_entries WHERE company_id = ? AND entry_type = 'Receipt' AND match_status = 'Unmatched' AND COALESCE(is_deleted, 0) = 0 ORDER BY transaction_date DESC").all(companyId),
    unmatchedPayments: db.prepare("SELECT * FROM bank_statement_entries WHERE company_id = ? AND entry_type = 'Payment' AND match_status = 'Unmatched' AND COALESCE(is_deleted, 0) = 0 ORDER BY transaction_date DESC").all(companyId),
    duplicates: db.prepare("SELECT * FROM bank_statement_entries WHERE company_id = ? AND match_status = 'Duplicate' AND COALESCE(is_deleted, 0) = 0 ORDER BY transaction_date DESC").all(companyId),
    reviewRequired: db.prepare("SELECT * FROM bank_statement_entries WHERE company_id = ? AND (validation_status != 'Valid' OR match_status IN ('Review Required','Duplicate')) AND COALESCE(is_deleted, 0) = 0 ORDER BY transaction_date DESC").all(companyId),
    references: bankMatchLinks(db, companyId),
    banks: db.prepare("SELECT id, bank_account_name, bank_name, account_number FROM banks WHERE company_id = ? AND status = 'active' ORDER BY bank_account_name").all(companyId),
    companies: db.prepare("SELECT id, company_name FROM companies WHERE status = 'active' ORDER BY company_name").all()
  };
}

function normalizeBankRows(db, payload) {
  const sourceRows = Array.isArray(payload.rows) ? payload.rows : [];
  const mapping = payload.mapping && Object.keys(payload.mapping).length ? payload.mapping : detectBankStatementColumns(sourceRows);
  const companyId = Number(payload.company_id || 0);
  if (!companyId) throw new Error("Company context is required before importing a bank statement.");
  const bankId = payload.bank_id ? Number(payload.bank_id) : null;
  return sourceRows.map((row, index) => {
    const mapped = mapBankRow(row, mapping);
    const debit = parseMoney(mapped.debit);
    const credit = parseMoney(mapped.credit);
    const amount = Math.max(debit, credit);
    const transactionDate = parseBankDate(mapped.transaction_date);
    const narration = String(mapped.narration || "").trim();
    const utr = String(mapped.utr || extractUtr(narration) || "").trim();
    const referenceNumber = String(mapped.reference_number || "").trim();
    const chequeNumber = String(mapped.cheque_number || "").trim();
    const errors = [];
    if (!transactionDate) errors.push("Transaction date missing or invalid");
    if (!amount || amount <= 0) errors.push("Debit or credit amount is required");
    if (!narration) errors.push("Narration is required");
    const entryType = credit > 0 && debit <= 0 ? "Receipt" : debit > 0 && credit <= 0 ? "Payment" : "Unknown";
    if (entryType === "Unknown") errors.push("Either debit or credit must be present");
    const duplicateKey = crypto.createHash("sha1").update([transactionDate, amount.toFixed(2), utr, narration.toLowerCase()].join("|")).digest("hex");
    const duplicate = db.prepare("SELECT id FROM bank_statement_entries WHERE company_id = ? AND duplicate_key = ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1").get(companyId, duplicateKey);
    const match = errors.length || duplicate ? null : suggestBankMatch(db, companyId, { entryType, amount, utr, narration, transactionDate });
    return {
      company_id: companyId,
      bank_id: bankId,
      raw_row_number: index + 1,
      transaction_date: transactionDate,
      narration,
      debit,
      credit,
      balance: parseMoney(mapped.balance),
      utr,
      reference_number: referenceNumber,
      cheque_number: chequeNumber,
      amount,
      entry_type: entryType,
      duplicate_key: duplicateKey,
      validation_status: errors.length ? "Invalid" : duplicate ? "Duplicate" : "Valid",
      validation_errors: errors.join("; "),
      review_status: "Draft",
      match_status: duplicate ? "Duplicate" : match ? "Suggested" : errors.length ? "Review Required" : "Unmatched",
      matched_module: match?.module || null,
      matched_record_id: match?.recordId || null,
      matched_reference: match?.reference || null,
      matched_score: match?.score || 0
    };
  });
}

function bankImportSummary(db, payload, rows) {
  return {
    bankName: payload.bank_name || payload.bank_format || "Generic Format",
    mapping: payload.mapping && Object.keys(payload.mapping).length ? payload.mapping : detectBankStatementColumns(payload.rows || []),
    totalRows: rows.length,
    validRows: rows.filter((row) => row.validation_status === "Valid").length,
    duplicateRows: rows.filter((row) => row.validation_status === "Duplicate" || row.match_status === "Duplicate").length,
    errorRows: rows.filter((row) => row.validation_status === "Invalid").length,
    rows
  };
}

function insertBankStatementEntry(db, importId, row) {
  db.prepare(`
    INSERT INTO bank_statement_entries (
      company_id, import_id, bank_id, transaction_date, narration, debit, credit, balance, utr, reference_number, cheque_number, amount,
      entry_type, duplicate_key, validation_status, validation_errors, review_status, match_status, matched_module, matched_record_id, matched_reference, matched_score
    )
    VALUES (
      @company_id, @import_id, @bank_id, @transaction_date, @narration, @debit, @credit, @balance, @utr, @reference_number, @cheque_number, @amount,
      @entry_type, @duplicate_key, @validation_status, @validation_errors, @review_status, @match_status, @matched_module, @matched_record_id, @matched_reference, @matched_score
    )
  `).run({ ...row, import_id: importId });
}

function detectBankStatementColumns(rows = []) {
  const headers = Object.keys(rows[0] || {});
  const pick = (...needles) => headers.find((header) => needles.some((needle) => header.toLowerCase().includes(needle)));
  return {
    transaction_date: pick("transaction_date", "date", "txn_date", "value_date"),
    narration: pick("narration", "description", "particular", "details", "remarks"),
    debit: pick("debit", "withdrawal", "dr_amount", "paid"),
    credit: pick("credit", "deposit", "cr_amount", "received"),
    balance: pick("balance", "closing"),
    utr: pick("utr", "rrn", "transaction_id", "txn_id"),
    reference_number: pick("reference", "ref_no", "chq_ref", "instrument"),
    cheque_number: pick("cheque", "chq")
  };
}

function mapBankRow(row, mapping) {
  return Object.fromEntries(Object.entries(mapping).map(([target, source]) => [target, source ? row[source] : ""]));
}

function parseMoney(value) {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(/,/g, "").replace(/[^\d.-]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? Math.abs(number) : 0;
}

function parseBankDate(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function extractUtr(narration = "") {
  return narration.match(/\b(?:UTR|NEFT|IMPS|RTGS|UPI)[-/:\s]*([A-Z0-9]{6,})\b/i)?.[1] || narration.match(/\b[A-Z0-9]{12,22}\b/i)?.[0] || "";
}

function suggestBankMatch(db, companyId, entry) {
  const amount = Number(entry.amount || 0);
  if (entry.entryType === "Receipt") {
    if (entry.utr) {
      const payment = db.prepare("SELECT id, utr_number, order_id, payment_amount FROM payments WHERE COALESCE(company_id, ?) = ? AND utr_number = ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1").get(companyId, companyId, entry.utr);
      if (payment) return { module: "payments", recordId: payment.id, reference: payment.utr_number, score: 98 };
    }
    const invoice = db.prepare("SELECT id, invoice_number, billing_value, gst_rate FROM invoices WHERE company_id = ? AND ABS((billing_value * (1 + COALESCE(gst_rate, 0) / 100.0)) - ?) <= 1 AND COALESCE(is_deleted, 0) = 0 LIMIT 1").get(companyId, amount);
    if (invoice) return { module: "invoices", recordId: invoice.id, reference: invoice.invoice_number, score: 72 };
  }
  if (entry.entryType === "Payment") {
    const supplierPayment = db.prepare("SELECT id, utr_number, amount_paid FROM supplier_payments WHERE company_id = ? AND ABS(amount_paid - ?) <= 1 AND COALESCE(is_deleted, 0) = 0 LIMIT 1").get(companyId, amount);
    if (supplierPayment) return { module: "supplier_payments", recordId: supplierPayment.id, reference: supplierPayment.utr_number || `Supplier Payment #${supplierPayment.id}`, score: 82 };
    const procurement = db.prepare("SELECT id, purchase_invoice_number, purchase_value FROM procurements WHERE COALESCE(company_id, ?) = ? AND ABS((purchase_value + COALESCE(purchase_gst, 0) + COALESCE(freight, 0) + COALESCE(loading_charges, 0)) - ?) <= 1 AND COALESCE(is_deleted, 0) = 0 LIMIT 1").get(companyId, companyId, amount);
    if (procurement) return { module: "procurements", recordId: procurement.id, reference: procurement.purchase_invoice_number, score: 72 };
  }
  const orderNumber = entry.narration.match(/[A-Z]{1,5}[-/]?\d{3,}/i)?.[0];
  if (orderNumber) {
    const order = db.prepare("SELECT id, order_number FROM supply_orders WHERE order_number LIKE ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1").get(`%${orderNumber}%`);
    if (order) return { module: "supply_orders", recordId: order.id, reference: order.order_number, score: 60 };
  }
  return null;
}

function bankMatchLinks(db, companyId) {
  return {
    vouchers: db.prepare("SELECT v.id, v.voucher_number reference, v.voucher_type type, COALESCE((SELECT SUM(vl.debit) FROM voucher_lines vl WHERE vl.voucher_id = v.id), 0) amount FROM vouchers v WHERE v.company_id = ? AND v.is_deleted = 0 ORDER BY v.voucher_date DESC LIMIT 300").all(companyId),
    invoices: db.prepare("SELECT id, invoice_number reference, 'Invoice' type, billing_value * (1 + COALESCE(gst_rate, 0) / 100.0) amount FROM invoices WHERE company_id = ? AND COALESCE(is_deleted, 0) = 0 ORDER BY invoice_date DESC LIMIT 300").all(companyId),
    payments: db.prepare("SELECT id, utr_number reference, 'Receipt' type, payment_amount amount FROM payments WHERE COALESCE(company_id, ?) = ? AND COALESCE(is_deleted, 0) = 0 ORDER BY payment_date DESC LIMIT 300").all(companyId, companyId),
    supplier_payments: db.prepare("SELECT id, COALESCE(utr_number, 'Supplier Payment ' || id) reference, 'Supplier Payment' type, amount_paid amount FROM supplier_payments WHERE company_id = ? AND COALESCE(is_deleted, 0) = 0 ORDER BY payment_date DESC LIMIT 300").all(companyId),
    procurements: db.prepare("SELECT id, purchase_invoice_number reference, 'Purchase Bill' type, purchase_value amount FROM procurements WHERE COALESCE(company_id, ?) = ? AND COALESCE(is_deleted, 0) = 0 ORDER BY purchase_date DESC LIMIT 300").all(companyId, companyId),
    orders: db.prepare("SELECT id, order_number reference, 'Order' type, 0 amount FROM supply_orders WHERE COALESCE(is_deleted, 0) = 0 ORDER BY order_date DESC LIMIT 300").all()
  };
}

function referenceModule(db, moduleName, recordId) {
  const map = {
    vouchers: ["vouchers", "voucher_number"],
    invoices: ["invoices", "invoice_number"],
    payments: ["payments", "utr_number"],
    supplier_payments: ["supplier_payments", "utr_number"],
    procurements: ["procurements", "purchase_invoice_number"],
    supply_orders: ["supply_orders", "order_number"]
  };
  const target = map[moduleName];
  if (!target) return null;
  const row = db.prepare(`SELECT id, ${target[1]} reference FROM ${target[0]} WHERE id = ?`).get(recordId);
  return row || null;
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

export function accountingData(db, filters = {}) {
  const companyId = Number(filters.company_id || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || 0);
  const dateFrom = filters.date_from || "1900-01-01";
  const dateTo = filters.date_to || "2999-12-31";
  return {
    references: referenceData(db, { company_id: companyId }),
    accounts: db.prepare("SELECT * FROM accounts WHERE company_id = ? AND is_deleted = 0 ORDER BY account_code").all(companyId),
    vouchers: db.prepare("SELECT * FROM vouchers WHERE company_id = ? AND is_deleted = 0 AND voucher_date BETWEEN ? AND ? ORDER BY voucher_date DESC, id DESC").all(companyId, dateFrom, dateTo),
    guidedVouchers: db.prepare("SELECT * FROM guided_vouchers WHERE company_id = ? AND COALESCE(is_deleted, 0) = 0 ORDER BY updated_at DESC, id DESC").all(companyId),
    voucherLines: db.prepare(`
      SELECT vl.*, a.account_name, a.account_code, v.voucher_number, v.voucher_date, v.voucher_type
      FROM voucher_lines vl
      JOIN vouchers v ON v.id = vl.voucher_id
      JOIN accounts a ON a.id = vl.account_id
      WHERE v.company_id = ? AND v.is_deleted = 0 AND v.voucher_date BETWEEN ? AND ?
      ORDER BY v.voucher_date DESC, vl.id
    `).all(companyId, dateFrom, dateTo),
    ledger: db.prepare(`
      SELECT le.*, a.account_name, a.account_code, v.voucher_number, v.voucher_type
      FROM ledger_entries le
      JOIN accounts a ON a.id = le.account_id
      JOIN vouchers v ON v.id = le.voucher_id
      WHERE le.company_id = ? AND le.entry_date BETWEEN ? AND ?
      ORDER BY le.entry_date, le.id
    `).all(companyId, dateFrom, dateTo),
    cashBank: db.prepare("SELECT * FROM cash_bank_ledger WHERE company_id = ? AND transaction_date BETWEEN ? AND ? ORDER BY transaction_date, id").all(companyId, dateFrom, dateTo),
    receivables: db.prepare("SELECT * FROM receivables WHERE company_id = ? AND is_deleted = 0 ORDER BY invoice_date DESC").all(companyId),
    payables: supplierPayableReport(db, companyId),
    auditLog: db.prepare("SELECT * FROM audit_log WHERE COALESCE(company_id, ?) = ? ORDER BY id DESC LIMIT 300").all(companyId, companyId),
    dayBook: dayBook(db, companyId, dateFrom, dateTo),
    trialBalance: trialBalance(db, companyId, dateFrom, dateTo),
    profitLoss: profitLossReport(db, companyId, dateFrom, dateTo),
    balanceSheet: balanceSheetReport(db, companyId, dateFrom, dateTo),
    statementSummary: financialStatementSummary(db, companyId, dateFrom, dateTo),
    gstSummary: gstSummary(db, companyId, dateFrom, dateTo),
    postingControl: postingControlReport(db, companyId),
    partyLedger: partyLedgerReport(db, companyId, dateFrom, dateTo),
    departmentLedger: departmentLedgerReport(db, companyId, dateFrom, dateTo),
    supplierLedger: supplierLedgerReport(db, companyId, dateFrom, dateTo),
    billWiseReceivables: billWiseReceivableReport(db, companyId),
    billWisePayables: billWisePayableReport(db, companyId),
    paymentAllocations: paymentAllocationReport(db, companyId),
    supplierPaymentAllocations: supplierPaymentAllocationReport(db, companyId),
    receivableAgeing: receivableAgeingReport(db, companyId),
    payableAgeing: payableAgeingReport(db, companyId),
    tdsReconciliation: tdsReconciliationReport(db, companyId),
    gstTdsReconciliation: gstTdsReconciliationReport(db, companyId),
    partyLedgerSummary: partyLedgerSummaryReport(db, companyId),
    partyReconciliation: partyReconciliationReport(db, companyId, dateFrom, dateTo),
    allocationReconciliation: allocationReconciliationReport(db, companyId),
    unallocatedReceipts: unallocatedReceiptsReport(db, companyId),
    unallocatedSupplierPayments: unallocatedSupplierPaymentsReport(db, companyId),
    advanceReceipts: advanceReceiptReport(db, companyId),
    supplierAdvances: supplierAdvanceReport(db, companyId),
    advanceAdjustments: advanceAdjustmentReport(db, companyId, dateFrom, dateTo),
    allocationAudit: allocationAuditReport(db, companyId, dateFrom, dateTo),
    creditTerms: creditTermsReport(db, companyId),
    payments: db.prepare("SELECT * FROM payments WHERE company_id = ? AND COALESCE(is_deleted, 0) = 0 ORDER BY payment_date DESC").all(companyId),
    supplierPayments: db.prepare("SELECT sp.*, s.supplier_name FROM supplier_payments sp LEFT JOIN suppliers s ON s.id = sp.supplier_id WHERE sp.company_id = ? AND COALESCE(sp.is_deleted, 0) = 0 ORDER BY sp.payment_date DESC").all(companyId),
    invoices: db.prepare("SELECT i.*, so.order_number, gd.department_name FROM invoices i LEFT JOIN supply_orders so ON so.id = i.order_id LEFT JOIN government_departments gd ON gd.id = so.department_id WHERE i.company_id = ? AND COALESCE(i.is_deleted, 0) = 0 ORDER BY i.invoice_date DESC").all(companyId),
    procurements: db.prepare("SELECT p.*, s.supplier_name, so.order_number FROM procurements p LEFT JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN supply_orders so ON so.id = p.order_id WHERE p.company_id = ? AND COALESCE(p.is_deleted, 0) = 0 ORDER BY p.purchase_date DESC").all(companyId),
    financialControl: financialControlReport(db, companyId, dateFrom, dateTo),
    financialYears: db.prepare("SELECT * FROM financial_years WHERE company_id = ? ORDER BY start_date DESC").all(companyId),
    openingBalances: openingBalanceReport(db, companyId),
    approvalQueue: approvalQueueReport(db, companyId),
    gstRegisters: gstRegisters(db, companyId, dateFrom, dateTo),
    tdsRegisters: tdsRegisters(db, companyId, dateFrom, dateTo),
    accountingRegisters: accountingRegisters(db, companyId, dateFrom, dateTo),
    billOutstanding: billOutstandingReport(db, companyId),
    yearEndClosings: yearEndClosingReport(db, companyId),
    carryForwardEntries: carryForwardReport(db, companyId),
    companies: db.prepare("SELECT id, company_name FROM companies WHERE status = 'active'").all(),
    departments: db.prepare("SELECT id, department_name FROM government_departments WHERE status = 'active'").all(),
    suppliers: db.prepare("SELECT id, supplier_name FROM suppliers WHERE status = 'active'").all(),
    employees: db.prepare("SELECT id, employee_name FROM employees WHERE status = 'active'").all(),
    banks: db.prepare("SELECT id, bank_account_name, bank_name FROM banks WHERE company_id = ? AND status = 'active'").all(companyId)
  };
}

function dayBook(db, companyId, dateFrom, dateTo) {
  return db.prepare(`
    SELECT v.id, v.voucher_date, v.voucher_number, v.voucher_type, v.narration, v.source_module,
      v.status,
      COALESCE(SUM(vl.debit), 0) debit,
      COALESCE(SUM(vl.credit), 0) credit
    FROM vouchers v
    LEFT JOIN voucher_lines vl ON vl.voucher_id = v.id
    WHERE v.company_id = ? AND v.is_deleted = 0 AND v.voucher_date BETWEEN ? AND ?
    GROUP BY v.id
    ORDER BY v.voucher_date DESC, v.id DESC
  `).all(companyId, dateFrom, dateTo);
}

function postingControlReport(db, companyId) {
  const rows = [];
  const invoiceRows = db.prepare(`
    SELECT 'Billing' module, 'billing' source_module, 'invoices' table_name, i.id record_id, i.invoice_number reference, i.invoice_date record_date,
      i.billing_value amount, COALESCE(MAX(v.id), 0) voucher_id, COALESCE(MAX(v.voucher_number), '') voucher_number,
      COALESCE(NULLIF(i.posting_status, ''), CASE WHEN COUNT(v.id) > 0 THEN 'Posted' ELSE 'Draft' END) posting_status,
      i.approval_status, i.posting_error
    FROM invoices i
    LEFT JOIN vouchers v ON v.source_module = 'billing' AND v.source_id = i.id AND v.is_deleted = 0
    WHERE i.company_id = ? AND i.is_deleted = 0
    GROUP BY i.id
  `).all(companyId);
  const procurementRows = db.prepare(`
    SELECT 'Procurement' module, 'procurement' source_module, 'procurements' table_name, p.id record_id, p.purchase_invoice_number reference, p.purchase_date record_date,
      p.purchase_value + p.purchase_gst amount, COALESCE(MAX(v.id), 0) voucher_id, COALESCE(MAX(v.voucher_number), '') voucher_number,
      COALESCE(NULLIF(p.posting_status, ''), CASE WHEN COUNT(v.id) > 0 THEN 'Posted' ELSE 'Draft' END) posting_status,
      p.approval_status, p.posting_error
    FROM procurements p
    LEFT JOIN vouchers v ON v.source_module = 'procurement' AND v.source_id = p.id AND v.is_deleted = 0
    WHERE p.company_id = ? AND p.is_deleted = 0
    GROUP BY p.id
  `).all(companyId);
  const paymentRows = db.prepare(`
    SELECT 'Receipt' module, 'payment' source_module, 'payments' table_name, p.id record_id, COALESCE(p.utr_number, 'Payment ' || p.id) reference, p.payment_date record_date,
      p.payment_amount amount, COALESCE(MAX(v.id), 0) voucher_id, COALESCE(MAX(v.voucher_number), '') voucher_number,
      COALESCE(NULLIF(p.posting_status, ''), CASE WHEN COUNT(v.id) > 0 THEN 'Posted' ELSE 'Draft' END) posting_status,
      p.approval_status, p.posting_error
    FROM payments p
    LEFT JOIN vouchers v ON v.source_module = 'payment' AND v.source_id = p.id AND v.is_deleted = 0
    WHERE p.company_id = ? AND p.is_deleted = 0
    GROUP BY p.id
  `).all(companyId);
  const expenseRows = db.prepare(`
    SELECT 'Expense' module, 'expense' source_module, 'expense_entries' table_name, ee.id record_id, eh.expense_head_name reference, ee.created_at record_date,
      COALESCE(NULLIF(ee.expense_amount, 0), ee.fixed_amount) amount, COALESCE(v.id, 0) voucher_id, COALESCE(v.voucher_number, '') voucher_number,
      COALESCE(NULLIF(ee.posting_status, ''), CASE WHEN COALESCE(ee.voucher_id, 0) > 0 THEN 'Posted' ELSE 'Draft' END) posting_status,
      ee.approval_status, ee.posting_error
    FROM expense_entries ee
    JOIN expense_heads eh ON eh.id = ee.expense_head_id
    LEFT JOIN vouchers v ON v.id = ee.voucher_id AND v.is_deleted = 0
    WHERE ee.company_id = ? AND ee.is_deleted = 0
  `).all(companyId);
  rows.push(...invoiceRows, ...procurementRows, ...paymentRows, ...expenseRows);
  return rows.map((row, index) => {
    const posted = ["Posted", "Reversed"].includes(row.posting_status);
    const hasError = row.posting_status === "Error" || Boolean(row.posting_error);
    const approvalPending = row.approval_status === "Pending Approval";
    const statusReason = posted
      ? "Accounting voucher already linked"
      : hasError
        ? "Previous posting attempt failed"
        : approvalPending
          ? "Checker approval is pending"
          : "Saved but not posted to books";
    const blockingReason = hasError
      ? row.posting_error
      : approvalPending
        ? "Approve the record before posting"
        : posted
          ? ""
          : "Review source record and post when ready";
    return {
      id: `${row.module}-${row.record_id}-${index}`,
      ...row,
      status_reason: statusReason,
      blocking_reason: blockingReason || "None",
      recommended_action: hasError ? "Open error, review source, then retry posting if safe" : posted ? "Audit through voucher and ledger drilldown" : approvalPending ? "Approve from Approval Queue" : "Post from Posting Queue after review",
      retry_available: hasError && !posted ? "Yes" : "No"
    };
  }).sort((a, b) => a.posting_status.localeCompare(b.posting_status) || a.module.localeCompare(b.module));
}

function partyLedgerReport(db, companyId, dateFrom, dateTo) {
  const rows = db.prepare(`
    SELECT vl.id, vl.voucher_id, v.voucher_date, v.voucher_number, v.voucher_type, v.source_module, v.source_id, a.account_name,
      vl.linked_party_type party_type,
      CASE
        WHEN vl.linked_party_type = 'department' THEN gd.department_name
        WHEN vl.linked_party_type = 'supplier' THEN s.supplier_name
        ELSE 'Unlinked'
      END party_name,
      0 opening_balance,
      CASE WHEN v.source_module = 'billing' THEN i.invoice_number ELSE NULL END invoice_number,
      CASE WHEN v.source_module = 'payment' THEN p.utr_number ELSE NULL END payment_reference,
      CASE WHEN v.source_module = 'procurement' THEN pr.purchase_invoice_number ELSE NULL END purchase_invoice,
      CASE WHEN v.source_module = 'supplier_payment' THEN sp.utr_number ELSE NULL END supplier_payment_reference,
      COALESCE(
        so.order_number,
        (SELECT GROUP_CONCAT(DISTINCT sop.order_number)
         FROM payment_allocations pa
         JOIN supply_orders sop ON sop.id = pa.order_id
         WHERE pa.payment_id = p.id),
        soi.order_number,
        (SELECT GROUP_CONCAT(DISTINCT soip.order_number)
         FROM supplier_payment_allocations spa
         JOIN procurements prp ON prp.id = spa.procurement_id
         JOIN supply_orders soip ON soip.id = prp.order_id
         WHERE spa.supplier_payment_id = sp.id)
      ) order_number,
      vl.debit, vl.credit, vl.narration
    FROM voucher_lines vl
    JOIN vouchers v ON v.id = vl.voucher_id
    JOIN accounts a ON a.id = vl.account_id
    LEFT JOIN government_departments gd ON gd.id = vl.linked_party_id AND vl.linked_party_type = 'department'
    LEFT JOIN suppliers s ON s.id = vl.linked_party_id AND vl.linked_party_type = 'supplier'
    LEFT JOIN invoices i ON i.id = v.source_id AND v.source_module = 'billing'
    LEFT JOIN payments p ON p.id = v.source_id AND v.source_module = 'payment'
    LEFT JOIN procurements pr ON pr.id = v.source_id AND v.source_module = 'procurement'
    LEFT JOIN supplier_payments sp ON sp.id = v.source_id AND v.source_module = 'supplier_payment'
    LEFT JOIN supply_orders so ON so.id = i.order_id
    LEFT JOIN supply_orders soi ON soi.id = pr.order_id
    WHERE v.company_id = ? AND v.is_deleted = 0 AND vl.linked_party_type IN ('department', 'supplier')
      AND v.voucher_date BETWEEN ? AND ?
    ORDER BY party_type, party_name, v.voucher_date, vl.id
  `).all(companyId, dateFrom, dateTo);

  const balances = new Map();
  return rows.map((row) => {
    const key = `${row.party_type}-${row.party_name}`;
    const opening = Number(row.opening_balance || 0);
    const prior = balances.has(key) ? Number(balances.get(key) || 0) : opening;
    const movement = row.party_type === "supplier" ? Number(row.credit || 0) - Number(row.debit || 0) : Number(row.debit || 0) - Number(row.credit || 0);
    const running = prior + movement;
    balances.set(key, running);
    return { ...row, running_balance: running, party_balance: running };
  });
}

function departmentLedgerReport(db, companyId, dateFrom, dateTo) {
  return partyLedgerReport(db, companyId, dateFrom, dateTo)
    .filter((row) => row.party_type === "department")
    .map((row) => ({ ...row, department_name: row.party_name }));
}

function supplierLedgerReport(db, companyId, dateFrom, dateTo) {
  return partyLedgerReport(db, companyId, dateFrom, dateTo)
    .filter((row) => row.party_type === "supplier")
    .map((row) => ({ ...row, supplier_name: row.party_name }));
}

function billStatus(balance, received, invoiceAmount, daysOutstanding) {
  if (Number(balance || 0) <= 0) return "Fully Paid";
  if (Number(daysOutstanding || 0) > 0) return "Overdue";
  if (Number(received || 0) > 0 && Number(received || 0) < Number(invoiceAmount || 0)) return "Partially Paid";
  return "Open";
}

function ageBucket(days) {
  const value = Number(days || 0);
  if (value <= 30) return "0-30 Days";
  if (value <= 60) return "31-60 Days";
  if (value <= 90) return "61-90 Days";
  return "Above 90 Days";
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function parseGuidedVoucherPayload(payloadJson) {
  try {
    return JSON.parse(payloadJson || "{}");
  } catch {
    return {};
  }
}

function postedGuidedNoteAdjustments(db, companyId, noteKind, linkField) {
  const rows = db.prepare(`
    SELECT gv.id guided_voucher_id, gv.payload_json, gv.voucher_kind, gv.voucher_date,
      v.id voucher_id, v.voucher_number, v.voucher_date posted_voucher_date
    FROM guided_vouchers gv
    JOIN vouchers v ON v.source_module = 'guided_vouchers' AND v.source_id = gv.id AND COALESCE(v.is_deleted, 0) = 0
    WHERE gv.company_id = ?
      AND gv.voucher_kind = ?
      AND gv.status = 'Posted'
      AND COALESCE(gv.is_deleted, 0) = 0
  `).all(companyId, noteKind);
  return rows.reduce((map, row) => {
    const payload = parseGuidedVoucherPayload(row.payload_json);
    const linkedId = Number(payload[linkField] || 0);
    if (!linkedId) return map;
    const taxable = Number(payload.taxable_value || 0);
    const gst = Number(payload.gst_amount || (taxable * Number(payload.gst_rate || 0) / 100));
    const amount = round2(taxable + gst);
    if (amount <= 0) return map;
    const existing = map.get(linkedId) || { amount: 0, vouchers: [] };
    existing.amount = round2(existing.amount + amount);
    existing.vouchers.push({
      guided_voucher_id: row.guided_voucher_id,
      voucher_id: row.voucher_id,
      voucher_number: row.voucher_number,
      voucher_date: row.posted_voucher_date || row.voucher_date,
      reason_code: payload.reason_code || "",
      reference_number: payload.reference_number || ""
    });
    map.set(linkedId, existing);
    return map;
  }, new Map());
}

function billWiseReceivableReport(db, companyId) {
  const today = new Date().toISOString().slice(0, 10);
  const creditNotesByInvoice = postedGuidedNoteAdjustments(db, companyId, "credit_note", "linked_invoice_id");
  return db.prepare(`
    SELECT r.id, r.department_id, gd.department_name, so.order_number, r.billing_id, r.invoice_number, r.invoice_date,
      r.invoice_amount, r.amount_received, r.tds_deducted, r.gst_tds_deducted, r.other_deductions,
      COALESCE((SELECT SUM(aa.adjusted_amount) FROM advance_adjustments aa WHERE aa.adjustment_type = 'receipt' AND aa.billing_id = r.billing_id AND COALESCE(aa.is_deleted, 0) = 0 AND aa.status = 'Active'), 0) advance_adjusted,
      r.balance_outstanding, r.due_date explicit_due_date, r.allocation_status,
      CAST(julianday(?) - julianday(r.invoice_date) AS INTEGER) days_outstanding
    FROM receivables r
    LEFT JOIN government_departments gd ON gd.id = r.department_id
    LEFT JOIN supply_orders so ON so.id = r.order_id
    WHERE r.company_id = ? AND r.is_deleted = 0 AND COALESCE(r.status, '') != 'Reversed'
    ORDER BY r.invoice_date DESC, r.id DESC
  `).all(today, companyId).map((row) => {
    const settled = Number(row.amount_received || 0) + Number(row.tds_deducted || 0) + Number(row.gst_tds_deducted || 0) + Number(row.other_deductions || 0);
    const noteAdjustment = creditNotesByInvoice.get(Number(row.billing_id || 0)) || { amount: 0, vouchers: [] };
    const correctedBalance = round2(Number(row.balance_outstanding || 0) - Number(noteAdjustment.amount || 0));
    const correctedSettled = round2(settled + Number(noteAdjustment.amount || 0));
    const dueDate = creditDueDate(db, companyId, "department", row.department_id, row.invoice_date, row.explicit_due_date);
    const days = Math.max(0, daysBetween(dueDate, today));
    return {
      ...row,
      due_date: dueDate,
      net_payment_received: row.amount_received,
      settled_amount: correctedSettled,
      credit_note_adjusted: noteAdjustment.amount,
      credit_note_vouchers: noteAdjustment.vouchers,
      balance_outstanding: correctedBalance,
      days_outstanding: days,
      age_bucket: ageBucket(days),
      status: billStatus(correctedBalance, correctedSettled, row.invoice_amount, days),
      allocation_status: row.allocation_status || allocationStatus(correctedSettled, row.invoice_amount)
    };
  });
}

function billWisePayableReport(db, companyId) {
  const today = new Date().toISOString().slice(0, 10);
  const debitNotesByPurchase = postedGuidedNoteAdjustments(db, companyId, "debit_note", "linked_purchase_id");
  return db.prepare(`
    SELECT s.supplier_name, s.id supplier_id, p.id procurement_id, p.purchase_invoice_number, p.purchase_date invoice_date,
      so.order_number,
      COALESCE(SUM(pi.gross_value), p.purchase_value + p.purchase_gst) invoice_amount,
      COALESCE((SELECT SUM(spa.allocated_amount) FROM supplier_payment_allocations spa WHERE spa.procurement_id = p.id AND COALESCE(spa.is_deleted, 0) = 0), 0) amount_paid,
      COALESCE((SELECT SUM(aa.adjusted_amount) FROM advance_adjustments aa WHERE aa.adjustment_type = 'supplier' AND aa.procurement_id = p.id AND COALESCE(aa.is_deleted, 0) = 0 AND aa.status = 'Active'), 0) advance_adjusted,
      p.due_date explicit_due_date,
      CAST(julianday(?) - julianday(p.purchase_date) AS INTEGER) days_outstanding
    FROM procurements p
    JOIN suppliers s ON s.id = p.supplier_id
    JOIN supply_orders so ON so.id = p.order_id
    LEFT JOIN procurement_items pi ON pi.procurement_id = p.id AND pi.is_deleted = 0
    WHERE p.company_id = ? AND p.is_deleted = 0 AND p.posting_status = 'Posted'
    GROUP BY p.id
    ORDER BY p.purchase_date DESC, p.id DESC
  `).all(today, companyId).map((row) => {
    const paid = Number(row.amount_paid || 0) + Number(row.advance_adjusted || 0);
    const noteAdjustment = debitNotesByPurchase.get(Number(row.procurement_id || 0)) || { amount: 0, vouchers: [] };
    const adjustedPaid = round2(paid + Number(noteAdjustment.amount || 0));
    const balance = round2(Number(row.invoice_amount || 0) - adjustedPaid);
    const dueDate = creditDueDate(db, companyId, "supplier", row.supplier_id, row.invoice_date, row.explicit_due_date);
    const days = Math.max(0, daysBetween(dueDate, today));
    return {
      ...row,
      due_date: dueDate,
      debit_note_adjusted: noteAdjustment.amount,
      debit_note_vouchers: noteAdjustment.vouchers,
      settled_amount: adjustedPaid,
      balance_due: balance,
      days_outstanding: days,
      age_bucket: ageBucket(days),
      status: billStatus(balance, adjustedPaid, row.invoice_amount, days),
      allocation_status: allocationStatus(adjustedPaid, row.invoice_amount)
    };
  });
}

function paymentAllocationReport(db, companyId) {
  return db.prepare(`
    SELECT pa.id, p.id payment_id, pa.billing_id, COALESCE(p.utr_number, 'Receipt ' || p.id) receipt_voucher,
      p.payment_date, p.payment_amount, i.invoice_number, r.invoice_amount,
      pa.allocated_amount, pa.tds_deducted, pa.gst_tds_deducted, pa.other_deductions,
      r.balance_outstanding balance_remaining, gd.department_name, so.order_number, pa.remarks,
      pa.allocation_status, pa.allow_excess, pa.reallocated_from_id, pa.change_reason
    FROM payment_allocations pa
    JOIN payments p ON p.id = pa.payment_id
    JOIN invoices i ON i.id = pa.billing_id
    LEFT JOIN receivables r ON r.billing_id = i.id
    LEFT JOIN supply_orders so ON so.id = pa.order_id
    LEFT JOIN government_departments gd ON gd.id = so.department_id
    WHERE pa.company_id = ? AND COALESCE(pa.is_deleted, 0) = 0
    ORDER BY p.payment_date DESC, pa.id DESC
  `).all(companyId);
}

function supplierPaymentAllocationReport(db, companyId) {
  return db.prepare(`
    SELECT spa.id, sp.id supplier_payment_id, spa.procurement_id, COALESCE(sp.utr_number, 'Supplier Payment ' || sp.id) payment_voucher,
      sp.payment_date, sp.amount_paid payment_amount, s.supplier_name, p.purchase_invoice_number,
      COALESCE(SUM(pi.gross_value), p.purchase_value + p.purchase_gst) purchase_amount,
      spa.allocated_amount,
      COALESCE(SUM(pi.gross_value), p.purchase_value + p.purchase_gst)
        - COALESCE((SELECT SUM(spa2.allocated_amount) FROM supplier_payment_allocations spa2 WHERE spa2.procurement_id = p.id AND COALESCE(spa2.is_deleted, 0) = 0), 0)
        - COALESCE((SELECT SUM(aa.adjusted_amount) FROM advance_adjustments aa WHERE aa.adjustment_type = 'supplier' AND aa.procurement_id = p.id AND COALESCE(aa.is_deleted, 0) = 0 AND aa.status = 'Active'), 0) balance_remaining,
      so.order_number, spa.remarks, spa.allocation_status, spa.allow_excess, spa.reallocated_from_id, spa.change_reason
    FROM supplier_payment_allocations spa
    JOIN supplier_payments sp ON sp.id = spa.supplier_payment_id
    JOIN procurements p ON p.id = spa.procurement_id
    JOIN suppliers s ON s.id = p.supplier_id
    JOIN supply_orders so ON so.id = p.order_id
    LEFT JOIN procurement_items pi ON pi.procurement_id = p.id AND pi.is_deleted = 0
    WHERE spa.company_id = ? AND COALESCE(spa.is_deleted, 0) = 0
    GROUP BY spa.id
    ORDER BY sp.payment_date DESC, spa.id DESC
  `).all(companyId);
}

function receivableAgeingReport(db, companyId) {
  return billWiseReceivableReport(db, companyId)
    .filter((row) => Number(row.balance_outstanding || 0) > 0)
    .map((row) => ({
      id: row.id,
      department_name: row.department_name,
      invoice_number: row.invoice_number,
      outstanding: row.balance_outstanding,
      days_outstanding: row.days_outstanding,
      age_bucket: row.age_bucket
    }));
}

function payableAgeingReport(db, companyId) {
  return billWisePayableReport(db, companyId)
    .filter((row) => Number(row.balance_due || 0) > 0)
    .map((row) => ({
      id: row.procurement_id,
      supplier_name: row.supplier_name,
      purchase_invoice_number: row.purchase_invoice_number,
      outstanding: row.balance_due,
      days_outstanding: row.days_outstanding,
      age_bucket: row.age_bucket
    }));
}

function tdsReconciliationReport(db, companyId) {
  return billWiseReceivableReport(db, companyId).map((row) => ({
    id: row.id,
    department_name: row.department_name,
    invoice_number: row.invoice_number,
    invoice_value: row.invoice_amount,
    tds_deducted: row.tds_deducted,
    gst_tds_deducted: row.gst_tds_deducted,
    net_payment_received: row.amount_received,
    outstanding: row.balance_outstanding
  }));
}

function gstTdsReconciliationReport(db, companyId) {
  return tdsReconciliationReport(db, companyId).filter((row) => Number(row.gst_tds_deducted || 0) > 0 || Number(row.outstanding || 0) > 0);
}

function partyLedgerSummaryReport(db, companyId) {
  const receivables = billWiseReceivableReport(db, companyId);
  const payables = billWisePayableReport(db, companyId);
  const totalReceivable = receivables.reduce((sum, row) => sum + Number(row.balance_outstanding || 0), 0);
  const totalPayable = payables.reduce((sum, row) => sum + Number(row.balance_due || 0), 0);
  const topOutstandingDepartments = Object.values(receivables.reduce((groups, row) => {
    const key = row.department_name || "Unassigned";
    groups[key] = groups[key] || { id: key, party_name: key, outstanding: 0 };
    groups[key].outstanding += Number(row.balance_outstanding || 0);
    return groups;
  }, {})).sort((a, b) => b.outstanding - a.outstanding).slice(0, 5);
  const topOutstandingSuppliers = Object.values(payables.reduce((groups, row) => {
    const key = row.supplier_name || "Unassigned";
    groups[key] = groups[key] || { id: key, party_name: key, outstanding: 0 };
    groups[key].outstanding += Number(row.balance_due || 0);
    return groups;
  }, {})).sort((a, b) => b.outstanding - a.outstanding).slice(0, 5);
  const oldestInvoice = receivables.filter((row) => Number(row.balance_outstanding || 0) > 0).sort((a, b) => Number(b.days_outstanding || 0) - Number(a.days_outstanding || 0))[0] || null;
  const oldestPurchaseBill = payables.filter((row) => Number(row.balance_due || 0) > 0).sort((a, b) => Number(b.days_outstanding || 0) - Number(a.days_outstanding || 0))[0] || null;
  return { totalReceivable, totalPayable, topOutstandingDepartments, topOutstandingSuppliers, oldestInvoice, oldestPurchaseBill };
}

function partyReconciliationReport(db, companyId, dateFrom, dateTo) {
  const partyLedger = partyLedgerReport(db, companyId, dateFrom, dateTo);
  const receivableLedger = partyLedger.filter((row) => row.party_type === "department").reduce((sum, row) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0);
  const payableLedger = partyLedger.filter((row) => row.party_type === "supplier").reduce((sum, row) => sum + Number(row.credit || 0) - Number(row.debit || 0), 0);
  const receivables = billWiseReceivableReport(db, companyId).reduce((sum, row) => sum + Number(row.balance_outstanding || 0), 0);
  const payables = billWisePayableReport(db, companyId).reduce((sum, row) => sum + Number(row.balance_due || 0), 0);
  const receiptAllocations = paymentAllocationReport(db, companyId).reduce((sum, row) => sum + Number(row.allocated_amount || 0) + Number(row.tds_deducted || 0) + Number(row.gst_tds_deducted || 0) + Number(row.other_deductions || 0), 0);
  const supplierAllocations = supplierPaymentAllocationReport(db, companyId).reduce((sum, row) => sum + Number(row.allocated_amount || 0), 0);
  return [
    { id: "receivable", party_type: "Department", validation: "Department ledger agrees with receivables", check_scope: "Trade Receivables ledger vs bill-wise receivable balance", ledger_balance: receivableLedger, subledger_balance: receivables, difference: Math.round((receivableLedger - receivables) * 100) / 100, possible_issue: "Unposted invoice, unallocated receipt, wrong department link or manual journal posted to Trade Receivables", recommended_action: "Drill into Department Ledger and Bill-wise Receivable", status: Math.abs(receivableLedger - receivables) <= 1 ? "Matched" : "Mismatch" },
    { id: "payable", party_type: "Supplier", validation: "Supplier ledger agrees with payables", check_scope: "Trade Payables ledger vs bill-wise payable balance", ledger_balance: payableLedger, subledger_balance: payables, difference: Math.round((payableLedger - payables) * 100) / 100, possible_issue: "Unposted purchase, unallocated supplier payment, wrong supplier link or manual journal posted to Trade Payables", recommended_action: "Drill into Supplier Ledger and Bill-wise Payable", status: Math.abs(payableLedger - payables) <= 1 ? "Matched" : "Mismatch" },
    { id: "receipt_allocations", party_type: "Department", validation: "Receipt allocations captured", check_scope: "Receipt allocations, TDS, GST TDS and other deductions", ledger_balance: receiptAllocations, subledger_balance: receiptAllocations, difference: 0, possible_issue: "Receipt saved without allocation or statutory deductions entered on wrong invoice", recommended_action: "Drill into Receipt Allocation and Unallocated Receipts", status: "Captured" },
    { id: "supplier_allocations", party_type: "Supplier", validation: "Supplier payment allocations captured", check_scope: "Supplier payment allocation against purchase bills", ledger_balance: supplierAllocations, subledger_balance: supplierAllocations, difference: 0, possible_issue: "Supplier payment saved without bill allocation or advance incorrectly adjusted", recommended_action: "Drill into Supplier Allocation and Unallocated Supplier Payments", status: "Captured" }
  ];
}

function allocationReconciliationReport(db, companyId) {
  return [
    ...unallocatedReceiptsReport(db, companyId).map((row) => ({
      id: `receipt-${row.payment_id}`,
      type: "Receipt",
      reference: row.receipt_reference,
      party: row.department_name,
      amount: row.receipt_amount,
      allocated: row.allocated_amount,
      unallocated: row.unallocated_amount,
      outstanding: row.invoice_outstanding,
      status: Number(row.unallocated_amount || 0) >= 0 ? "OK" : "Over Allocated"
    })),
    ...unallocatedSupplierPaymentsReport(db, companyId).map((row) => ({
      id: `supplier-${row.supplier_payment_id}`,
      type: "Supplier Payment",
      reference: row.payment_reference,
      party: row.supplier_name,
      amount: row.payment_amount,
      allocated: row.allocated_amount,
      unallocated: row.unallocated_amount,
      outstanding: row.purchase_outstanding,
      status: Number(row.unallocated_amount || 0) >= 0 ? "OK" : "Over Allocated"
    })),
    ...advanceReceiptReport(db, companyId).map((row) => ({
      id: `advance-receipt-${row.id}`,
      type: "Advance Receipt",
      reference: row.receipt_reference,
      party: row.department_name,
      amount: row.advance_received,
      allocated: row.advance_adjusted,
      unallocated: row.balance_advance,
      outstanding: row.balance_advance,
      status: row.status
    })),
    ...supplierAdvanceReport(db, companyId).map((row) => ({
      id: `supplier-advance-${row.id}`,
      type: "Supplier Advance",
      reference: row.payment_reference,
      party: row.supplier_name,
      amount: row.advance_paid,
      allocated: row.advance_adjusted,
      unallocated: row.balance_advance,
      outstanding: row.balance_advance,
      status: row.status
    }))
  ];
}

function unallocatedReceiptsReport(db, companyId) {
  return db.prepare(`
    SELECT p.id payment_id, COALESCE(p.utr_number, 'Receipt ' || p.id) receipt_reference,
      p.payment_date, p.payment_amount receipt_amount, gd.id department_id, gd.department_name,
      COALESCE((SELECT SUM(pa.allocated_amount) FROM payment_allocations pa WHERE pa.payment_id = p.id AND COALESCE(pa.is_deleted, 0) = 0), 0) allocated_amount,
      COALESCE((SELECT SUM(ar.balance_advance) FROM advance_receipts ar WHERE ar.payment_id = p.id AND COALESCE(ar.is_deleted, 0) = 0), 0) advance_balance,
      COALESCE((SELECT SUM(r.balance_outstanding) FROM receivables r WHERE r.order_id = p.order_id AND COALESCE(r.is_deleted, 0) = 0), 0) invoice_outstanding
    FROM payments p
    LEFT JOIN supply_orders so ON so.id = p.order_id
    LEFT JOIN government_departments gd ON gd.id = so.department_id
    WHERE p.company_id = ? AND COALESCE(p.is_deleted, 0) = 0
    ORDER BY p.payment_date DESC, p.id DESC
  `).all(companyId).map((row) => ({
    ...row,
    unallocated_amount: Number(row.receipt_amount || 0) - Number(row.allocated_amount || 0) - Number(row.advance_balance || 0),
    allocation_status: allocationStatus(Number(row.allocated_amount || 0) + Number(row.advance_balance || 0), row.receipt_amount)
  }));
}

function unallocatedSupplierPaymentsReport(db, companyId) {
  return db.prepare(`
    SELECT sp.id supplier_payment_id, COALESCE(sp.utr_number, 'Supplier Payment ' || sp.id) payment_reference,
      sp.payment_date, sp.amount_paid payment_amount, s.supplier_name,
      COALESCE((SELECT SUM(spa.allocated_amount) FROM supplier_payment_allocations spa WHERE spa.supplier_payment_id = sp.id AND COALESCE(spa.is_deleted, 0) = 0), 0) allocated_amount,
      COALESCE((SELECT SUM(sa.balance_advance) FROM supplier_advances sa WHERE sa.supplier_payment_id = sp.id AND COALESCE(sa.is_deleted, 0) = 0), 0) advance_balance,
      COALESCE((SELECT SUM(p.purchase_value + p.purchase_gst) FROM procurements p WHERE p.supplier_id = sp.supplier_id AND COALESCE(p.is_deleted, 0) = 0), 0) purchase_outstanding
    FROM supplier_payments sp
    LEFT JOIN suppliers s ON s.id = sp.supplier_id
    WHERE sp.company_id = ? AND COALESCE(sp.is_deleted, 0) = 0
    ORDER BY sp.payment_date DESC, sp.id DESC
  `).all(companyId).map((row) => ({
    ...row,
    unallocated_amount: Number(row.payment_amount || 0) - Number(row.allocated_amount || 0) - Number(row.advance_balance || 0),
    allocation_status: allocationStatus(Number(row.allocated_amount || 0) + Number(row.advance_balance || 0), row.payment_amount)
  }));
}

function advanceReceiptReport(db, companyId) {
  return db.prepare(`
    SELECT ar.*, gd.department_name, so.order_number, COALESCE(p.utr_number, 'Receipt ' || p.id) receipt_reference
    FROM advance_receipts ar
    LEFT JOIN government_departments gd ON gd.id = ar.department_id
    LEFT JOIN supply_orders so ON so.id = ar.order_id
    LEFT JOIN payments p ON p.id = ar.payment_id
    WHERE ar.company_id = ? AND COALESCE(ar.is_deleted, 0) = 0
    ORDER BY ar.created_at DESC
  `).all(companyId);
}

function supplierAdvanceReport(db, companyId) {
  return db.prepare(`
    SELECT sa.*, s.supplier_name, COALESCE(sp.utr_number, 'Supplier Payment ' || sp.id) payment_reference
    FROM supplier_advances sa
    LEFT JOIN suppliers s ON s.id = sa.supplier_id
    LEFT JOIN supplier_payments sp ON sp.id = sa.supplier_payment_id
    WHERE sa.company_id = ? AND COALESCE(sa.is_deleted, 0) = 0
    ORDER BY sa.created_at DESC
  `).all(companyId);
}

function advanceAdjustmentReport(db, companyId, dateFrom = "1900-01-01", dateTo = "2999-12-31") {
  return db.prepare(`
    SELECT aa.*, i.invoice_number, p.purchase_invoice_number, so.order_number,
      gd.department_name, s.supplier_name,
      CASE WHEN aa.adjustment_type = 'receipt' THEN gd.department_name ELSE s.supplier_name END party_name,
      CASE WHEN aa.adjustment_type = 'receipt' THEN i.invoice_number ELSE p.purchase_invoice_number END reference
    FROM advance_adjustments aa
    LEFT JOIN invoices i ON i.id = aa.billing_id
    LEFT JOIN procurements p ON p.id = aa.procurement_id
    LEFT JOIN supply_orders so ON so.id = aa.order_id
    LEFT JOIN government_departments gd ON gd.id = so.department_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE aa.company_id = ? AND date(aa.created_at) BETWEEN ? AND ?
    ORDER BY aa.created_at DESC, aa.id DESC
  `).all(companyId, dateFrom, dateTo);
}

function allocationAuditReport(db, companyId, dateFrom, dateTo) {
  return db.prepare(`
    SELECT * FROM allocation_audit
    WHERE company_id = ? AND date(created_at) BETWEEN ? AND ?
    ORDER BY created_at DESC, id DESC
  `).all(companyId, dateFrom, dateTo);
}

function creditTermsReport(db, companyId) {
  return db.prepare(`
    SELECT ct.*,
      CASE WHEN ct.party_type = 'department' THEN gd.department_name ELSE s.supplier_name END party_name
    FROM credit_terms ct
    LEFT JOIN government_departments gd ON gd.id = ct.party_id AND ct.party_type = 'department'
    LEFT JOIN suppliers s ON s.id = ct.party_id AND ct.party_type = 'supplier'
    WHERE ct.company_id = ? AND COALESCE(ct.is_deleted, 0) = 0
    ORDER BY ct.party_type, party_name
  `).all(companyId);
}

function financialControlReport(db, companyId, dateFrom, dateTo) {
  const tb = trialBalance(db, companyId, dateFrom, dateTo);
  const debit = tb.reduce((sum, row) => sum + Number(row.debit || 0), 0);
  const credit = tb.reduce((sum, row) => sum + Number(row.credit || 0), 0);
  const postingRows = postingControlReport(db, companyId);
  const unposted = postingRows.filter((row) => !["Posted", "Reversed"].includes(row.posting_status)).length;
  const drafts = postingRows.filter((row) => row.posting_status === "Draft").length;
  const pendingApprovals = postingRows.filter((row) => row.approval_status === "Pending Approval").length;
  const reversed = db.prepare("SELECT COUNT(*) count FROM vouchers WHERE company_id = ? AND status = 'Reversed' AND is_deleted = 0").get(companyId).count;
  const closedYears = db.prepare("SELECT COUNT(*) count FROM financial_years WHERE company_id = ? AND status IN ('Closed', 'Locked')").get(companyId).count;
  const lockedYears = db.prepare("SELECT COUNT(*) count FROM financial_years WHERE company_id = ? AND status = 'Locked'").get(companyId).count;
  const currentYear = financialYearForDate(db, companyId, new Date().toISOString().slice(0, 10));
  const statement = financialStatementSummary(db, companyId, dateFrom, dateTo);
  const gst = gstSummary(db, companyId, dateFrom, dateTo);
  const tds = db.prepare("SELECT COALESCE(SUM(tds_deducted + gst_tds_deducted), 0) value FROM payment_allocations WHERE company_id = ? AND COALESCE(is_deleted, 0) = 0").get(companyId).value;
  const overdueReceivables = db.prepare("SELECT COUNT(*) count FROM receivables WHERE company_id = ? AND balance_outstanding > 0 AND days_outstanding > 90 AND is_deleted = 0").get(companyId).count;
  const overduePayables = supplierPayableReport(db, companyId).filter((row) => Number(row.balance_due || 0) > 0).length;
  const partyRecon = partyReconciliationReport(db, companyId, dateFrom, dateTo);
  const partyMismatches = partyRecon.filter((row) => row.status === "Mismatch").length;
  return [
    { id: "current_year", control_area: "Period", control: "Current Financial Year", value: currentYear?.financial_year_name || "Not configured", status: currentYear?.status || "Missing", status_reason: currentYear ? `Current date falls in ${currentYear.financial_year_name}` : "No financial year found for current date", blocking_reason: currentYear ? "None" : "Create an open financial year before posting", recommended_action: currentYear ? "Review financial year status before period close" : "Create financial year", drill_view: "financial_years" },
    { id: "period", control_area: "Period", control: "Report Period", value: `${dateFrom} to ${dateTo}`, status: "Open", status_reason: "Control checks calculated for selected period", blocking_reason: "None", recommended_action: "Change period filters for another review window", drill_view: "financial_control" },
    { id: "trial", control_area: "Accounting", control: "Trial Balance Difference", value: Math.round((debit - credit) * 100) / 100, status: Math.round(debit * 100) === Math.round(credit * 100) ? "Balanced" : "Mismatch", status_reason: "Debit and credit totals compared from ledger entries", blocking_reason: Math.round(debit * 100) === Math.round(credit * 100) ? "None" : "Trial balance mismatch blocks production confidence", recommended_action: "Drill into Trial Balance and General Ledger", drill_view: "trial_balance" },
    { id: "unposted", control_area: "Posting", control: "Unposted Business Records", value: unposted, status: unposted ? "Review Required" : "Clear", status_reason: "Operational records checked for accounting posting status", blocking_reason: unposted ? "Draft or error records exist in Posting Queue" : "None", recommended_action: "Open Posting Queue and post safe records", drill_view: "posting_control" },
    { id: "drafts", control_area: "Posting", control: "Draft Transactions", value: drafts, status: drafts ? "Review Required" : "Clear", status_reason: "Draft records do not affect final books", blocking_reason: drafts ? "Draft records need approval/posting or cancellation decision" : "None", recommended_action: "Review draft source records", drill_view: "posting_control" },
    { id: "approval", control_area: "Approval", control: "Pending Approvals", value: pendingApprovals, status: pendingApprovals ? "Checker Pending" : "Clear", status_reason: "Maker-checker queue reviewed", blocking_reason: pendingApprovals ? "Approval pending before posting" : "None", recommended_action: "Open Approval Queue", drill_view: "approval_queue" },
    { id: "reversed", control_area: "Audit", control: "Reversed Vouchers", value: reversed, status: reversed ? "Audit Review" : "Clear", status_reason: "Reversal count from posted voucher register", blocking_reason: "None", recommended_action: "Review Audit Log and reversal vouchers", drill_view: "audit_log" },
    { id: "closed", control_area: "Period", control: "Closed / Locked Financial Years", value: closedYears, status: closedYears ? "Controlled" : "None", status_reason: "Closed and locked periods restrict posting/editing", blocking_reason: "Posting inside closed/locked year should be blocked", recommended_action: "Review Financial Years before backdated entry", drill_view: "financial_years" },
    { id: "locked", control_area: "Period", control: "Locked Financial Years", value: lockedYears, status: lockedYears ? "Controlled" : "None", status_reason: "Locked periods need explicit reopen workflow", blocking_reason: lockedYears ? "Transactions dated inside locked years require reopening or correction workflow" : "None", recommended_action: "Open Financial Years", drill_view: "financial_years" },
    { id: "profit", control_area: "Statements", control: "Profit / Loss", value: statement.netProfit, status: statement.netProfit >= 0 ? "Profit" : "Loss", status_reason: "Derived from posted ledger entries", blocking_reason: "None", recommended_action: "Open Profit & Loss", drill_view: "profit_loss" },
    { id: "bs_diff", control_area: "Statements", control: "Balance Sheet Difference", value: statement.balanceSheetDifference, status: Math.abs(statement.balanceSheetDifference) <= 1 ? "Balanced" : "Mismatch", status_reason: "Assets compared against liabilities plus equity", blocking_reason: Math.abs(statement.balanceSheetDifference) <= 1 ? "None" : "Balance sheet mismatch needs ledger review", recommended_action: "Open Balance Sheet", drill_view: "balance_sheet" },
    { id: "gst", control_area: "Tax", control: "GST Payable / Receivable", value: gst.netGstPayable, status: gst.netGstPayable >= 0 ? "Payable" : "Receivable", status_reason: "Output GST less input GST from posted transactions", blocking_reason: "None", recommended_action: "Open GST Register and GST Summary", drill_view: "gst_register" },
    { id: "tds", control_area: "Tax", control: "TDS Receivable", value: tds, status: tds ? "Recoverable" : "Clear", status_reason: "TDS and GST TDS captured from receipt allocations", blocking_reason: "None", recommended_action: "Open TDS Register", drill_view: "tds_register" },
    { id: "party_recon", control_area: "Reconciliation", control: "Party Reconciliation Mismatches", value: partyMismatches, status: partyMismatches ? "Mismatch" : "Matched", status_reason: "Party ledger balances compared with bill-wise receivable/payable subledgers", blocking_reason: partyMismatches ? "Party ledger and subledger mismatch exists" : "None", recommended_action: "Open Party Reconciliation", drill_view: "party_reconciliation" },
    { id: "rec_overdue", control_area: "Collections", control: "Receivables 90+ Days", value: overdueReceivables, status: overdueReceivables ? "Follow Up" : "Clear", status_reason: "Open receivables older than 90 days", blocking_reason: "None", recommended_action: "Open Receivable Ageing", drill_view: "receivable_ageing" },
    { id: "pay_overdue", control_area: "Payments", control: "Open Payables", value: overduePayables, status: overduePayables ? "Review" : "Clear", status_reason: "Open supplier bills from payable report", blocking_reason: "None", recommended_action: "Open Payable Ageing", drill_view: "payable_ageing" }
  ];
}

function openingBalanceReport(db, companyId) {
  return db.prepare(`
    SELECT ob.*, fy.financial_year_name, a.account_name, v.voucher_number
    FROM opening_balances ob
    JOIN financial_years fy ON fy.id = ob.financial_year_id
    LEFT JOIN accounts a ON a.id = ob.account_id
    LEFT JOIN vouchers v ON v.id = ob.voucher_id
    WHERE ob.company_id = ?
    ORDER BY fy.start_date DESC, ob.id DESC
  `).all(companyId);
}

function approvalQueueReport(db, companyId) {
  return db.prepare(`
    SELECT aq.*, u.display_name maker_name, c.display_name checker_name
    FROM approval_queue aq
    LEFT JOIN users u ON u.id = aq.maker_id
    LEFT JOIN users c ON c.id = aq.checker_id
    WHERE aq.company_id = ?
    ORDER BY aq.updated_at DESC, aq.id DESC
  `).all(companyId).map((row) => {
    const pending = row.approval_status === "Pending Approval";
    const approved = row.approval_status === "Approved";
    const rejected = row.approval_status === "Rejected";
    return {
      ...row,
      status_reason: approved ? "Checker approved this transaction" : rejected ? "Checker rejected this transaction" : pending ? "Maker submitted this transaction for approval" : "Draft or unsubmitted approval record",
      blocking_reason: pending ? "Posting remains blocked until checker approval" : rejected ? (row.remarks || "Rejected without recorded reason") : approved ? "None" : "Submit for approval before posting",
      recommended_action: pending ? "Review source record and approve/reject with reason" : rejected ? "Review rejection reason and correct the source record" : approved ? "Proceed to posting queue if not posted" : "Submit source record for approval"
    };
  });
}

function gstRegisters(db, companyId, dateFrom, dateTo) {
  const registerRows = (accountName, direction) => db.prepare(`
    SELECT le.entry_date date,
      COALESCE(i.invoice_number, p.purchase_invoice_number, v.voucher_number) reference,
      COALESCE(so_i.order_number, so_p.order_number, '') order_number,
      CASE
        WHEN i.id IS NOT NULL THEN i.billing_value
        WHEN p.id IS NOT NULL THEN p.purchase_value
        ELSE 0
      END taxable,
      CASE
        WHEN @direction = 'output' THEN le.credit - le.debit
        ELSE le.debit - le.credit
      END gst_amount,
      CASE
        WHEN i.id IS NOT NULL THEN i.gst_rate
        WHEN p.id IS NOT NULL AND p.purchase_value > 0 THEN ROUND(p.purchase_gst * 100 / p.purchase_value, 2)
        ELSE 0
      END gst_rate,
      'Posted' posting_status,
      v.voucher_number,
      v.voucher_type,
      v.source_module
    FROM ledger_entries le
    JOIN accounts a ON a.id = le.account_id
    JOIN vouchers v ON v.id = le.voucher_id
    LEFT JOIN invoices i ON v.source_module = 'billing' AND i.id = v.source_id AND i.is_deleted = 0
    LEFT JOIN procurements p ON v.source_module = 'procurement' AND p.id = v.source_id AND p.is_deleted = 0
    LEFT JOIN supply_orders so_i ON so_i.id = i.order_id
    LEFT JOIN supply_orders so_p ON so_p.id = p.order_id
    WHERE le.company_id = @companyId
      AND a.account_name = @accountName
      AND v.is_deleted = 0
      AND le.entry_date BETWEEN @dateFrom AND @dateTo
    ORDER BY le.entry_date DESC, le.id DESC
  `).all({ companyId, accountName, dateFrom, dateTo, direction });
  const output = registerRows("Output GST", "output");
  const input = registerRows("Input GST", "input");
  return { output, input, payable: output.reduce((sum, row) => sum + Number(row.gst_amount || 0), 0) - input.reduce((sum, row) => sum + Number(row.gst_amount || 0), 0) };
}

function tdsRegisters(db, companyId, dateFrom, dateTo) {
  return db.prepare(`
    SELECT gd.department_name, i.invoice_number, pa.created_at date,
      pa.tds_deducted, pa.gst_tds_deducted, pa.allocated_amount
    FROM payment_allocations pa
    JOIN invoices i ON i.id = pa.billing_id
    JOIN supply_orders so ON so.id = i.order_id
    LEFT JOIN government_departments gd ON gd.id = so.department_id
    WHERE pa.company_id = ? AND pa.created_at BETWEEN ? AND ?
    ORDER BY pa.created_at DESC
  `).all(companyId, `${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
}

function accountingRegisters(db, companyId, dateFrom, dateTo) {
  const vouchers = db.prepare("SELECT * FROM vouchers WHERE company_id = ? AND is_deleted = 0 AND voucher_date BETWEEN ? AND ? ORDER BY voucher_date DESC, id DESC").all(companyId, dateFrom, dateTo);
  return {
    journal: vouchers.filter((row) => row.voucher_type === "Journal"),
    sales: vouchers.filter((row) => row.voucher_type === "Sales" || row.voucher_type === "Credit Note"),
    purchase: vouchers.filter((row) => row.voucher_type === "Purchase" || row.voucher_type === "Debit Note")
  };
}

function billOutstandingReport(db, companyId) {
  const departments = billWiseReceivableReport(db, companyId).map((row) => ({
    party_name: row.department_name,
    reference: row.invoice_number,
    date: row.invoice_date,
    invoice_amount: row.invoice_amount,
    amount_received: row.amount_received,
    tds_deducted: row.tds_deducted,
    gst_tds_deducted: row.gst_tds_deducted,
    other_deductions: row.other_deductions,
    balance_outstanding: row.balance_outstanding,
    due_date: row.due_date,
    days_outstanding: row.days_outstanding,
    age_bucket: row.age_bucket,
    status: row.status,
    excess_payment: row.balance_outstanding < 0 ? Math.abs(row.balance_outstanding) : 0,
    short_payment: row.balance_outstanding > 0 ? row.balance_outstanding : 0
  }));
  const suppliers = billWisePayableReport(db, companyId).map((row) => ({
    party_name: row.supplier_name,
    reference: row.purchase_invoice_number,
    invoice_amount: row.invoice_amount,
    amount_paid: row.amount_paid,
    balance_outstanding: row.balance_due,
    due_date: row.due_date,
    days_outstanding: row.days_outstanding,
    age_bucket: row.age_bucket,
    status: row.status
  }));
  return { departments, suppliers };
}

function yearEndClosingReport(db, companyId) {
  return db.prepare(`
    SELECT yec.*, fy1.financial_year_name from_year, fy2.financial_year_name to_year
    FROM year_end_closings yec
    JOIN financial_years fy1 ON fy1.id = yec.from_financial_year_id
    JOIN financial_years fy2 ON fy2.id = yec.to_financial_year_id
    WHERE yec.company_id = ?
    ORDER BY yec.created_at DESC
  `).all(companyId);
}

function carryForwardReport(db, companyId) {
  return db.prepare(`
    SELECT cfe.*, a.account_code, a.account_name, fy1.financial_year_name from_year, fy2.financial_year_name to_year, v.voucher_number
    FROM carry_forward_entries cfe
    JOIN accounts a ON a.id = cfe.account_id
    JOIN financial_years fy1 ON fy1.id = cfe.from_financial_year_id
    JOIN financial_years fy2 ON fy2.id = cfe.to_financial_year_id
    LEFT JOIN vouchers v ON v.id = cfe.opening_voucher_id
    WHERE cfe.company_id = ?
    ORDER BY cfe.created_at DESC, a.account_code
  `).all(companyId);
}

function trialBalance(db, companyId, dateFrom, dateTo) {
  return db.prepare(`
    SELECT a.id, a.account_code, a.account_name, a.account_type,
      COALESCE(SUM(le.debit), 0) + CASE WHEN a.normal_balance = 'Debit' THEN a.opening_balance ELSE 0 END debit,
      COALESCE(SUM(le.credit), 0) + CASE WHEN a.normal_balance = 'Credit' THEN a.opening_balance ELSE 0 END credit,
      CASE
        WHEN a.normal_balance = 'Credit' THEN COALESCE(SUM(le.credit - le.debit), 0) + a.opening_balance
        ELSE COALESCE(SUM(le.debit - le.credit), 0) + a.opening_balance
      END balance
    FROM accounts a
    LEFT JOIN ledger_entries le ON le.account_id = a.id AND le.entry_date BETWEEN ? AND ?
    WHERE a.company_id = ? AND a.is_deleted = 0
    GROUP BY a.id
    ORDER BY a.account_code
  `).all(dateFrom, dateTo, companyId);
}

function profitLossReport(db, companyId, dateFrom, dateTo) {
  const rows = db.prepare(`
    SELECT a.id, a.account_code, a.account_name, a.account_type,
      COALESCE(SUM(le.debit), 0) debit,
      COALESCE(SUM(le.credit), 0) credit
    FROM accounts a
    LEFT JOIN ledger_entries le ON le.account_id = a.id AND le.entry_date BETWEEN ? AND ?
    WHERE a.company_id = ? AND a.is_deleted = 0 AND a.account_type IN ('Income','Expense')
    GROUP BY a.id
    ORDER BY a.account_type, a.account_code
  `).all(dateFrom, dateTo, companyId).map((row) => ({
    ...row,
    amount: row.account_type === "Income" ? Number(row.credit || 0) - Number(row.debit || 0) : Number(row.debit || 0) - Number(row.credit || 0)
  }));
  const income = rows.filter((row) => row.account_type === "Income").reduce((sum, row) => sum + row.amount, 0);
  const expenses = rows.filter((row) => row.account_type === "Expense").reduce((sum, row) => sum + row.amount, 0);
  return { rows, income, expenses, netProfit: income - expenses };
}

function balanceSheetReport(db, companyId, dateFrom, dateTo) {
  const rows = db.prepare(`
    SELECT a.id, a.account_code, a.account_name, a.account_type, a.normal_balance,
      COALESCE(SUM(le.debit), 0) debit,
      COALESCE(SUM(le.credit), 0) credit,
      a.opening_balance
    FROM accounts a
    LEFT JOIN ledger_entries le ON le.account_id = a.id AND le.entry_date <= ?
    WHERE a.company_id = ? AND a.is_deleted = 0 AND a.account_type IN ('Asset','Liability','Equity')
    GROUP BY a.id
    ORDER BY a.account_type, a.account_code
  `).all(dateTo, companyId).map((row) => ({
    ...row,
    amount: row.normal_balance === "Credit"
      ? Number(row.credit || 0) - Number(row.debit || 0) + Number(row.opening_balance || 0)
      : Number(row.debit || 0) - Number(row.credit || 0) + Number(row.opening_balance || 0)
  }));
  const assets = rows.filter((row) => row.account_type === "Asset").reduce((sum, row) => sum + row.amount, 0);
  const liabilities = rows.filter((row) => row.account_type === "Liability").reduce((sum, row) => sum + row.amount, 0);
  const equity = rows.filter((row) => row.account_type === "Equity").reduce((sum, row) => sum + row.amount, 0);
  const pl = profitLossReport(db, companyId, dateFrom, dateTo).netProfit;
  return { rows, assets, liabilities, equity, currentProfit: pl, liabilitiesAndEquity: liabilities + equity + pl };
}

function financialStatementSummary(db, companyId, dateFrom, dateTo) {
  const pl = profitLossReport(db, companyId, dateFrom, dateTo);
  const bs = balanceSheetReport(db, companyId, dateFrom, dateTo);
  const sales = pl.rows.filter((row) => row.account_name === "Sales").reduce((sum, row) => sum + row.amount, 0);
  const purchase = pl.rows.filter((row) => row.account_name === "Purchase").reduce((sum, row) => sum + row.amount, 0);
  const expenses = pl.rows.filter((row) => row.account_type === "Expense" && row.account_name !== "Purchase").reduce((sum, row) => sum + row.amount, 0);
  return {
    grossRevenue: sales,
    purchaseCost: purchase,
    grossProfit: sales - purchase,
    totalExpenses: expenses,
    netProfit: pl.netProfit,
    assets: bs.assets,
    liabilitiesAndEquity: bs.liabilitiesAndEquity,
    balanceSheetDifference: Math.round((bs.assets - bs.liabilitiesAndEquity) * 100) / 100
  };
}


function gstSummary(db, companyId, dateFrom, dateTo) {
  const input = db.prepare(`
    SELECT COALESCE(SUM(le.debit - le.credit), 0) value
    FROM ledger_entries le
    JOIN accounts a ON a.id = le.account_id
    JOIN vouchers v ON v.id = le.voucher_id
    WHERE le.company_id = ? AND a.account_name = 'Input GST' AND v.is_deleted = 0 AND le.entry_date BETWEEN ? AND ?
  `).get(companyId, dateFrom, dateTo).value;
  const output = db.prepare(`
    SELECT COALESCE(SUM(le.credit - le.debit), 0) value
    FROM ledger_entries le
    JOIN accounts a ON a.id = le.account_id
    JOIN vouchers v ON v.id = le.voucher_id
    WHERE le.company_id = ? AND a.account_name = 'Output GST' AND v.is_deleted = 0 AND le.entry_date BETWEEN ? AND ?
  `).get(companyId, dateFrom, dateTo).value;
  return { inputGst: input, outputGst: output, netGstPayable: output - input, gstImpactOnProfitability: output - input };
}

function supplierPayableReport(db, companyId) {
  return db.prepare(`
    SELECT s.supplier_name, p.id procurement_id, p.purchase_invoice_number,
      COALESCE(SUM(pi.gross_value), p.purchase_value + p.purchase_gst) purchase_value,
      COALESCE((SELECT SUM(spa.allocated_amount) FROM supplier_payment_allocations spa WHERE spa.procurement_id = p.id AND COALESCE(spa.is_deleted, 0) = 0), 0)
        + COALESCE((SELECT SUM(aa.adjusted_amount) FROM advance_adjustments aa WHERE aa.adjustment_type = 'supplier' AND aa.procurement_id = p.id AND COALESCE(aa.is_deleted, 0) = 0 AND aa.status = 'Active'), 0) amount_paid,
      COALESCE(SUM(pi.gross_value), p.purchase_value + p.purchase_gst)
        - COALESCE((SELECT SUM(spa.allocated_amount) FROM supplier_payment_allocations spa WHERE spa.procurement_id = p.id AND COALESCE(spa.is_deleted, 0) = 0), 0)
        - COALESCE((SELECT SUM(aa.adjusted_amount) FROM advance_adjustments aa WHERE aa.adjustment_type = 'supplier' AND aa.procurement_id = p.id AND COALESCE(aa.is_deleted, 0) = 0 AND aa.status = 'Active'), 0) balance_due
    FROM procurements p
    JOIN suppliers s ON s.id = p.supplier_id
    LEFT JOIN procurement_items pi ON pi.procurement_id = p.id
    WHERE p.company_id = ? AND p.is_deleted = 0 AND p.posting_status = 'Posted'
    GROUP BY p.id
    ORDER BY s.supplier_name
  `).all(companyId);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const db = initializeDatabase();
  db.close();
  console.log(`Initialized ${dbPath()}`);
}
