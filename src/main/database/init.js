import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
import { assertBulkDeleteSafe, assertDeleteSafe } from "../services/safeDeleteService.js";
import { createReportBuilders } from "./reportBuilders.js";
import { createCrudHelpers } from "./crudHelpers.js";
import { createSchemaFunctions } from "./schemaDefinitions.js";
import { createSeedData } from "./seedData.js";
import {
  FSR2B1_MIGRATION_NAME,
  DEFAULT_REPORTING_PROFILE,
  applyAccountMappingRegistryMigration,
  ensureAccountMappingRegistry
} from "./accountMappingRegistry.js";
import { parseMoneyToMinor } from "../domain/money.js";
import { backfillAll } from "./moneyMigration.js";
import { dropLedgerGuards, dropUnexpectedLedgerTriggers, ensureLedgerGuards, ledgerDefectIds } from "./ledgerGuards.js";
import { createAccountingService } from "../services/accountingService.js";
import { createAlertService } from "../services/alerts/alertService.js";
import { createBankReconciliationService } from "../services/bankReconciliationService.js";
import { createInventoryService } from "../services/inventoryService.js";
import { createTallyImportService } from "../services/tallyImportService.js";
import { createImportParserService } from "../services/importParserService.js";
import { createDocumentService } from "../services/documentService.js";
import { createAuthService } from "../services/authService.js";
import { createBillingService } from "../services/billingService.js";
import { expenseFormulaAmount } from "../domain/expenseFormula.js";
import { createDashboardService } from "../services/dashboardService.js";
import { createOperationsService } from "../services/operationsService.js";
import { createImportValidationService } from "../services/importValidationService.js";
import { createOperationalPlanningService } from "../services/operationalPlanningService.js";
import { createAccountMappingService } from "../services/accountMappingService.js";
import { createMoneyIntegrityService } from "../services/moneyIntegrityService.js";
import { localBusinessDate } from "../domain/businessDate.js";
import { roundMoney, paise, rupees } from "../domain/money.js";
import { BANK_DETAILS_PERMISSION, bankDetailChanges } from "../services/bankDetailsPolicy.js";

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
  leads: {
    label: "Lead / Tender",
    fields: ["company_id", "lead_number", "title", "description", "source", "tender_number", "issuing_authority", "department_id", "expected_value", "bid_submission_date", "status", "probability", "remarks"],
    required: ["lead_number", "title", "status"]
  },
  requirement_queries: {
    label: "Requirement Query",
    fields: ["company_id", "query_number", "title", "description", "department_id", "employee_id", "lead_id", "priority", "expected_quantity", "expected_value", "status", "remarks"],
    required: ["query_number", "title", "status"]
  },
  quotations: {
    label: "Quotation",
    fields: ["company_id", "quotation_number", "requirement_query_id", "supplier_id", "supply_order_id", "quotation_date", "valid_until", "item_description", "quantity", "unit_price", "total_amount", "tax_amount", "grand_total", "status", "remarks"],
    required: ["quotation_number", "supplier_id", "quotation_date", "status"]
  },
  negotiations: {
    label: "Negotiation",
    fields: ["company_id", "negotiation_number", "quotation_id", "supplier_id", "supply_order_id", "negotiation_date", "negotiator_name", "initial_amount", "negotiated_amount", "savings_amount", "status", "outcome_notes", "remarks"],
    required: ["negotiation_number", "supplier_id", "negotiation_date", "status"]
  },
  purchase_orders: {
    label: "Purchase Order / GeM Order",
    fields: ["company_id", "po_number", "po_date", "supply_type", "gem_order_number", "gem_contract_number", "negotiation_id", "department_id", "employee_id", "supplier_id", "title", "description", "total_value", "delivery_period", "payment_terms", "status", "converted_to_work_order", "work_order_id", "remarks"],
    required: ["po_number", "po_date", "department_id", "employee_id", "supplier_id", "status"]
  },
  procurement_plans: {
    label: "Procurement Plan",
    fields: ["company_id", "plan_number", "plan_date", "order_id", "item_id", "warehouse_id", "required_quantity", "available_stock", "short_quantity", "planned_quantity", "expected_rate", "estimated_value", "supplier_id", "priority", "status", "remarks"],
    required: ["plan_number", "plan_date", "order_id", "item_id", "warehouse_id", "status"]
  },
  installations: {
    label: "Installation",
    fields: ["company_id", "installation_number", "delivery_challan_id", "supply_order_id", "department_id", "supervisor_employee_id", "installation_date", "completion_date", "status", "remarks", "document_id"],
    required: ["installation_number", "supply_order_id", "status"]
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
  "account_groups",
  "financial_statement_mappings",
  "account_group_assignments",
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
  ["2010", "Goods Received Not Invoiced", "Liability", "Credit", 0],
  ["2100", "GST Payable", "Liability", "Credit", 0],
  ["2110", "Output GST", "Liability", "Credit", 0],
  ["2200", "Expense Payable", "Liability", "Credit", 0],
  ["2300", "Employee Incentive Payable", "Liability", "Credit", 0],
  ["3000", "Capital", "Equity", "Credit", 0],
  ["3010", "Opening Balance Suspense", "Equity", "Credit", 0],
  ["4000", "Sales", "Income", "Credit", 0],
  ["5000", "Purchase", "Expense", "Debit", 0],
  ["5050", "Cost of Goods Sold", "Expense", "Debit", 0],
  ["5060", "Inventory Adjustment Loss", "Expense", "Debit", 0],
  ["4060", "Inventory Adjustment Gain", "Income", "Credit", 0],
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
export const WRITE_POLICY = {
  master: new Set(Object.keys(MASTER_TABLES)),
  transaction: new Set(Object.keys(TRANSACTION_TABLES)),
  accountingReadOnly: new Set([
    "accounts",
    "account_groups",
    "financial_statement_mappings",
    "account_group_assignments",
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

export function initializeDatabase(root = projectRoot()) {
  const db = openDatabase(root);
  // Migrations run with the ledger guards off; they are put back, current, at the end.
  const existingBooks = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'vouchers'").get());
  const repairPending = existingBooks && !migrationApplied(db, UPGRADE_REPAIR_MIGRATION);
  const countedBefore = existingBooks ? ledgerDefectIds(db) : null;
  const plantedBefore = existingBooks ? dropUnexpectedLedgerTriggers(db) : [];
  if (existingBooks) dropLedgerGuards(db);
  backupBeforePendingMigration(db, root);
  migrate(db);
  ensureAuditChain(db);
  seed(db);
  ensureAccountMappingRegistry(db);
  addPhase5AccountingControls(db);
  const guards = ensureLedgerGuards(db);
  const removed = [...plantedBefore, ...(guards.droppedUnexpected || [])];
  if (removed.length) {
    console.error(`Ledger check: removed ${removed.length} trigger(s) touching the accounting tables that the app did not create.`);
    auditLog(db, { action: "ledger_unexpected_triggers_removed", table_name: "vouchers", new_value: JSON.stringify({ triggers: removed }) });
  }
  // Migration 036 fills paise columns that older rows left at 0, which can show defects
  // that were already there; that start sets the baseline instead of comparing.
  recordStartupLedgerCheck(db, repairPending ? null : countedBefore);
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

  runMigration(db, "028_entity_picker_search_indexes", () => {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(supplier_name);
      CREATE INDEX IF NOT EXISTS idx_suppliers_gstin ON suppliers(gstin);
      CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(supplier_code);
      CREATE INDEX IF NOT EXISTS idx_items_name ON items(item_name);
      CREATE INDEX IF NOT EXISTS idx_items_hsn ON items(hsn_code);
      CREATE INDEX IF NOT EXISTS idx_items_brand ON items(brand);
      CREATE INDEX IF NOT EXISTS idx_accounts_name ON accounts(account_name);
      CREATE INDEX IF NOT EXISTS idx_accounts_code ON accounts(account_code);
      CREATE INDEX IF NOT EXISTS idx_supply_orders_number ON supply_orders(order_number);
      CREATE INDEX IF NOT EXISTS idx_departments_name ON government_departments(department_name);
      CREATE INDEX IF NOT EXISTS idx_warehouses_name ON warehouses(warehouse_name);
      CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(employee_name);
      CREATE INDEX IF NOT EXISTS idx_banks_name ON banks(bank_account_name);
      CREATE INDEX IF NOT EXISTS idx_expense_heads_name ON expense_heads(expense_head_name);
    `);
  });

  runMigration(db, "029_lead_stage_tables", () => {
    addLeadStageTables(db);
  });

  runMigration(db, "030_purchase_order_tables", () => {
    addPurchaseOrderTables(db);
  });

  runMigration(db, "031_procurement_planning_tables", () => {
    addProcurementPlanningTables(db);
  });

  runMigration(db, "032_purchase_order_conversion_controls", () => {
    addPurchaseOrderConversionControls(db);
  });

  runMigration(db, "033_fsr2a3_carry_forward_openings", () => {
    addColumnIfMissing(db, "carry_forward_entries", "opening_debit", "REAL NOT NULL DEFAULT 0");
    addColumnIfMissing(db, "carry_forward_entries", "opening_credit", "REAL NOT NULL DEFAULT 0");
  });

  runMigration(db, "034_fsr2a5b_money_shadow_columns", () => {
    addMoneyShadowColumns(db);
  });

  runMigration(db, FSR2B1_MIGRATION_NAME, () => {
    applyAccountMappingRegistryMigration(db);
  });

  // Databases upgraded from older builds applied 022 and 034 before these columns existed:
  // add whatever is still missing and fill the paise columns from the stored rupee amounts.
  runMigration(db, UPGRADE_REPAIR_MIGRATION, () => {
    addRuntimeSoftDeleteColumns(db);
    addMoneyShadowColumns(db);
    backfillAll(db);
  });
}

const UPGRADE_REPAIR_MIGRATION = "036_upgrade_soft_delete_and_money_backfill";

// Start-up work above runs with the ledger guards off. If it left more unbalanced or
// mismatched posted vouchers than there were before, that is recorded in the audit log
// (the Money integrity check in Health Center lists the vouchers themselves). Start-up is
// not refused, so the owner can still open the books to correct them.
// defectsBefore: the voucher ids ledgerDefectIds listed before migrations and seeding (a
// count is also accepted). Any voucher listed now and not then is recorded, so fixing one
// voucher cannot hide breaking another.
export function recordStartupLedgerCheck(db, defectsBefore) {
  if (defectsBefore === null || defectsBefore === undefined) return;
  const after = ledgerDefectIds(db);
  if (after === null) return;
  let added;
  if (Array.isArray(defectsBefore)) {
    const before = new Set(defectsBefore);
    added = after.filter((id) => !before.has(id));
  } else {
    added = after.length > Number(defectsBefore) ? after.slice(Number(defectsBefore)) : [];
  }
  if (!added.length) return;
  const beforeCount = Array.isArray(defectsBefore) ? defectsBefore.length : Number(defectsBefore);
  console.error(`Ledger check: start-up left ${added.length} new unbalanced or mismatched posted voucher(s).`);
  auditLog(db, {
    action: "ledger_startup_check_failed",
    table_name: "vouchers",
    new_value: JSON.stringify({ unbalanced_before: beforeCount, unbalanced_after: after.length, new_voucher_ids: added.slice(0, 50) })
  });
}

function migrationApplied(db, name) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get()) return false;
  return Boolean(db.prepare("SELECT 1 FROM schema_migrations WHERE migration_name = ?").get(name));
}

// Copy an existing database aside before migrations that have not run on it yet.
function backupBeforePendingMigration(db, root) {
  const hasMigrations = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
  if (!hasMigrations) return null;
  const applied = db.prepare("SELECT id FROM schema_migrations WHERE migration_name = ?").get(UPGRADE_REPAIR_MIGRATION);
  if (applied) return null;
  const hasData = db.prepare("SELECT COUNT(*) total FROM schema_migrations").get().total > 0;
  if (!hasData) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const target = path.join(root, "backups", `pre-upgrade-${stamp}.db`);
  db.prepare("VACUUM INTO ?").run(target);
  return target;
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

// Gives documents saved before posting statuses existed a status from their vouchers.
// It runs on every start, so it only fills a blank or Draft status: a Reversed, Error or
// Posted document keeps its status (a reversed invoice still has its original voucher).
function backfillPostingStatuses(db) {
  const unset = "COALESCE(NULLIF(posting_status, ''), 'Draft') = 'Draft'";
  [
    ["invoices", "billing"],
    ["procurements", "procurement"],
    ["payments", "payment"]
  ].forEach(([table, sourceModule]) => {
    const posted = `EXISTS (SELECT 1 FROM vouchers v WHERE v.source_module = '${sourceModule}' AND v.source_id = ${table}.id AND v.is_deleted = 0 AND v.status = 'Posted')`;
    db.prepare(`
      UPDATE ${table}
      SET posting_status = 'Posted',
        approval_status = 'Approved',
        posted_at = COALESCE(posted_at, CURRENT_TIMESTAMP),
        locked_at = COALESCE(locked_at, CURRENT_TIMESTAMP)
      WHERE is_deleted = 0 AND ${unset} AND ${posted}
    `).run();
    db.prepare(`UPDATE ${table} SET posting_status = 'Draft' WHERE is_deleted = 0 AND COALESCE(posting_status, '') = ''`).run();
    db.prepare(`UPDATE ${table} SET approval_status = 'Draft' WHERE is_deleted = 0 AND COALESCE(approval_status, '') = ''`).run();
  });

  // Supplier payments (ACC-3 audit F4): a payment with a posted voucher and no status
  // could neither hold an advance nor be posted again.
  db.prepare(`
    UPDATE supplier_payments SET posting_status = 'Posted'
    WHERE COALESCE(is_deleted, 0) = 0 AND ${unset}
      AND EXISTS (SELECT 1 FROM vouchers v WHERE v.source_module = 'supplier_payment' AND v.source_id = supplier_payments.id AND v.is_deleted = 0 AND v.status = 'Posted')
  `).run();
  db.prepare("UPDATE supplier_payments SET posting_status = 'Draft' WHERE COALESCE(is_deleted, 0) = 0 AND COALESCE(posting_status, '') = ''").run();

  db.prepare(`
    UPDATE expense_entries
    SET posting_status = 'Posted', approval_status = 'Approved',
      posted_at = COALESCE(posted_at, CURRENT_TIMESTAMP), locked_at = COALESCE(locked_at, CURRENT_TIMESTAMP)
    WHERE is_deleted = 0 AND ${unset}
      AND EXISTS (SELECT 1 FROM vouchers v WHERE v.id = expense_entries.voucher_id AND v.is_deleted = 0 AND v.status = 'Posted')
  `).run();
  db.prepare("UPDATE expense_entries SET posting_status = 'Draft' WHERE is_deleted = 0 AND COALESCE(posting_status, '') = ''").run();
  db.prepare("UPDATE expense_entries SET approval_status = 'Draft' WHERE is_deleted = 0 AND COALESCE(approval_status, '') = ''").run();
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
    ensureRoundingOffAccount(db, company.id);
    // At start-up a same-name ledger of the wrong type must not stop the books opening; the
    // return that needs the variance ledger refuses with guidance instead.
    ensurePurchasePriceVarianceAccount(db, company.id, { refuseWrongType: false });
  });
}

// The Rounding Off ledger that rounding adjustments post to. Added after the defaults
// above, and only when the company has none: an existing ledger with that name is
// reused, and a code already in use (by a ledger the user created) is never taken over.
function ensureRoundingOffAccount(db, companyId) {
  const existing = db.prepare("SELECT id FROM accounts WHERE company_id = ? AND account_name = 'Rounding Off' AND is_deleted = 0").get(companyId);
  if (existing) return existing.id;
  let code = 5180;
  while (db.prepare("SELECT 1 FROM accounts WHERE company_id = ? AND account_code = ?").get(companyId, String(code))) code += 1;
  return db.prepare(`
    INSERT INTO accounts (company_id, account_code, account_name, account_type, normal_balance, opening_balance, status)
    VALUES (?, ?, 'Rounding Off', 'Expense', 'Debit', 0, 'active')
  `).run(companyId, String(code)).lastInsertRowid;
}

export const PURCHASE_PRICE_VARIANCE_ACCOUNT = "Purchase Price Variance";

// The ledger a supplier return's price gap posts to (owner decision CV, 10 Nov 2026 IST).
// Added only when the company has none: an existing ledger with this name is reused, and a
// code already in use by a ledger the user created is never taken over (first free code
// from 5065 upward). It is reported under Purchases.
export function ensurePurchasePriceVarianceAccount(db, companyId, { refuseWrongType = true } = {}) {
  const name = PURCHASE_PRICE_VARIANCE_ACCOUNT;
  const existing = db.prepare("SELECT id, account_type FROM accounts WHERE company_id = ? AND LOWER(TRIM(account_name)) = LOWER(?) AND is_deleted = 0 ORDER BY (account_type = 'Expense') DESC, id LIMIT 1").get(companyId, name);
  if (existing && existing.account_type !== "Expense") {
    if (!refuseWrongType) return null;
    throw new Error(`The ledger "${name}" exists as ${existing.account_type}, but a purchase price variance is an expense. Rename that ledger in Accounting > Books & Ledgers > Chart of Accounts, then post the return again.`);
  }
  let id = existing?.id;
  if (!id) {
    let code = 5065;
    while (db.prepare("SELECT 1 FROM accounts WHERE company_id = ? AND account_code = ?").get(companyId, String(code))) code += 1;
    id = Number(db.prepare(`
      INSERT INTO accounts (company_id, account_code, account_name, account_type, normal_balance, opening_balance, status)
      VALUES (?, ?, ?, 'Expense', 'Debit', 0, 'active')
    `).run(companyId, String(code), name).lastInsertRowid);
    auditLog(db, { company_id: companyId, action: "system_ledger_created", table_name: "accounts", record_id: id, new_value: JSON.stringify({ account_code: String(code), account_name: name, reason: "Owner decision CV: purchase price variance" }) });
  }
  const registryReady = db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'table' AND name IN ('account_groups', 'account_group_assignments')").get().n === 2;
  if (registryReady) {
    db.prepare(`
      INSERT INTO account_group_assignments (company_id, account_id, account_group_id, effective_from, status, provenance, change_reason)
      SELECT a.company_id, a.id, g.id, ?, 'active', 'SYSTEM_SEED', 'Owner decision CV: purchase price variance reported under Purchases'
      FROM accounts a JOIN account_groups g ON g.group_code = 'PURCHASES'
      WHERE a.id = ? AND a.account_type = g.account_type
        AND NOT EXISTS (SELECT 1 FROM account_group_assignments existing WHERE existing.account_id = a.id)
    `).run(DEFAULT_REPORTING_PROFILE.effectiveFrom, id);
  }
  return id;
}

function normalizeDuplicateKey(value) {
  return cleanTallyText(value).toLowerCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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


function accountId(db, companyId, accountName) {
  const account = db.prepare("SELECT id FROM accounts WHERE company_id = ? AND account_name = ? AND is_deleted = 0").get(companyId, accountName);
  if (!account) throw new Error(`Missing account: ${accountName}`);
  return account.id;
}

// Next number in a series: one above the highest number ever issued (deleted rows
// included), so a deleted or out-of-order number is never handed out twice.
function nextSeriesNumber(db, table, column, companyId, prefix) {
  const rows = db.prepare(`SELECT ${column} value FROM ${table} WHERE company_id = ? AND ${column} LIKE ?`).all(companyId, `${prefix}-%`);
  const taken = new Set(rows.map((row) => row.value));
  const highest = rows.reduce((max, row) => {
    const suffix = String(row.value).slice(prefix.length + 1);
    return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max;
  }, 0);
  let next = highest + 1;
  while (taken.has(`${prefix}-${String(next).padStart(5, "0")}`)) next += 1;
  return `${prefix}-${String(next).padStart(5, "0")}`;
}

function nextVoucherNumber(db, companyId, prefix) {
  return nextSeriesNumber(db, "vouchers", "voucher_number", companyId, prefix);
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
  // The prefix already carries the financial year, so the series restarts each year.
  return nextSeriesNumber(db, "invoices", "invoice_number", companyId, invoicePrefix(db, companyId, financialYearId));
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
  // An "Accounting Only" purchase is booked to Purchase, not GRNI, so it brings no stock in.
  if (payload.inventory_enabled === false || payload.inventory_enabled === "0") return null;
  // The receipt carries the same taxable value the voucher put into GRNI, so the two clear.
  const voucherTaxable = Number(payload.taxable_value || payload.purchase_value || 0);
  const itemId = Number(payload.item_id || 0);
  const warehouseId = Number(payload.warehouse_id || 0);
  const quantity = Number(payload.quantity || payload.quantity_received || 0);
  if (!itemId || !warehouseId || quantity <= 0) return null;
  const damaged = Number(payload.damaged_quantity || 0);
  const accepted = Math.max(0, Number(payload.accepted_quantity || (quantity - damaged)));
  if (accepted <= 0) throw new Error("Accepted GRN quantity must be positive");
  const receiptRate = Number(payload.rate || payload.purchase_rate || 0) || voucherTaxable / accepted;
  // Only what the voucher put into GRNI comes in, so the two clear; a landed cost the voucher
  // did not book is not added to stock. (A voucher with no taxable value posts nothing to GRNI.)
  const receiptValue = voucherTaxable || Number(payload.landed_cost || 0) || accepted * receiptRate;
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
    // "Receipt Rate" is per unit; without one, the voucher's taxable value is shared over the units.
    rate: receiptRate,
    gst_rate: Number(payload.gst_rate || 0),
    landed_cost: receiptValue,
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
    receiptRate,
    Number(payload.gst_rate || 0),
    receiptValue,
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
  return nextSeriesNumber(db, table, column, companyId, prefix);
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
    const inventoryAccount = payload.inventory_enabled === false || payload.inventory_enabled === "0" ? "Purchase" : "Goods Received Not Invoiced";
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

function postLedgerEntry(db, companyId, voucherId, voucherLineId, accountIdValue, entryDate, debit, credit, sourceModule, sourceId, debitMinor = null, creditMinor = null) {
  const ledgerActiveWhere = activeRowClause(db, "ledger_entries");
  const previous = db.prepare(`SELECT running_balance, running_balance_minor FROM ledger_entries WHERE company_id = ? AND account_id = ?${ledgerActiveWhere} ORDER BY id DESC LIMIT 1`).get(companyId, accountIdValue);
  const account = db.prepare("SELECT normal_balance FROM accounts WHERE id = ?").get(accountIdValue);
  if (debitMinor === null) debitMinor = parseMoneyToMinor(debit);
  if (creditMinor === null) creditMinor = parseMoneyToMinor(credit);
  const deltaMinor = account?.normal_balance === "Credit" ? creditMinor - debitMinor : debitMinor - creditMinor;
  const runningMinor = Number(previous?.running_balance_minor || 0) + deltaMinor;
  // The REAL columns mirror the paise columns exactly, so both always agree.
  db.prepare(`
    INSERT INTO ledger_entries (company_id, voucher_id, voucher_line_id, account_id, entry_date, debit, credit, running_balance, source_module, source_id, debit_minor, credit_minor, running_balance_minor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(companyId, voucherId, voucherLineId, accountIdValue, entryDate, rupees(debitMinor), rupees(creditMinor), rupees(runningMinor), sourceModule, sourceId, debitMinor, creditMinor, runningMinor);
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
  debit = rupees(paise(debit));
  credit = rupees(paise(credit));
  const balance = rupees(paise(previous?.balance) + paise(debit) - paise(credit));
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
  return localBusinessDate();
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

// A failed second attempt must never downgrade a document that is already posted or reversed.
function markPostingError(db, table, id, error) {
  // Tables without a posting_error column (e.g. supplier_payments) keep the message in the Error Console only.
  const hasErrorColumn = db.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === "posting_error");
  if (!hasErrorColumn) return;
  db.prepare(`UPDATE ${table} SET posting_status = 'Error', posting_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND COALESCE(posting_status, '') NOT IN ('Posted', 'Reversed')`).run(String(error?.message || error), id);
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
    SELECT COALESCE(SUM(advance_received), 0) value
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
    SELECT COALESCE(SUM(advance_paid), 0) value
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

// What is still to receive on one invoice, as the bill-wise receivables report shows it:
// allocations and advance adjustments, less posted guided credit notes linked to it. A
// credit note booked as its own invoice is a negative receivable and returns a negative figure.
export function receivableOutstandingForSettlement(db, billingId) {
  const receivable = db.prepare("SELECT company_id FROM receivables WHERE billing_id = ? AND COALESCE(is_deleted, 0) = 0").get(billingId);
  if (!receivable) return 0;
  const notes = postedGuidedNoteAdjustments(db, receivable.company_id, "credit_note", "linked_invoice_id").get(Number(billingId)) || { amount: 0 };
  return round2(receivableOutstandingBeforeAdjustment(db, billingId) - Number(notes.amount || 0));
}

export function receivableOutstandingBeforeAdjustment(db, billingId) {
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
  // Date-only arithmetic in UTC, so the result does not shift a day in IST or any other zone.
  const date = new Date(`${String(baseDate || localBusinessDate()).slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Posts one expense entry as an accrual, once. The amount is the entered amount,
// or the fixed/percentage amount the profitability engine calculates for it.
function postExpenseEntry(db, expenseId) {
  const expense = db.prepare(`
    SELECT ee.*, eh.expense_head_name
    FROM expense_entries ee
    JOIN expense_heads eh ON eh.id = ee.expense_head_id
    WHERE ee.id = ? AND ee.is_deleted = 0
  `).get(expenseId);
  if (!expense) throw new Error(`Expense entry ${expenseId} was not found or has no expense head. Open Operations > Expenses, check the entry, then post again.`);
  if (Number(expense.voucher_id || 0) || ["Posted", "Reversed"].includes(expense.posting_status)) {
    throw new Error(`Expense entry ${expenseId} is already posted. Open its voucher from the expense list instead of posting again.`);
  }
  const order = db.prepare("SELECT so.*, e.incentive_percentage FROM supply_orders so LEFT JOIN employees e ON e.id = so.employee_id WHERE so.id = ?").get(expense.order_id);
  // Same formula as the profitability engine (billingService calculateProfitability),
  // which only lists expenses already posted, so it is applied here directly.
  const profit = order ? calculateProfitability(db, order) : null;
  const calculated = expenseFormulaAmount(expense, {
    taxableValue: Number(profit?.billingValue || 0),
    grossValue: Number(profit?.invoiceGrossValue || 0)
  });
  const amount = roundMoney(Number(expense.expense_amount || 0) || calculated);
  if (amount <= 0) {
    throw new Error(`Expense ${expense.expense_head_name} (entry ${expense.id}) has no amount to post. ${String(expense.calculation_method || "").startsWith("percentage") ? "A percentage expense is calculated on the order's posted invoices; post the sales invoice first." : "Enter the expense amount on the entry, then post."}`);
  }
  const accountName = expense.expense_head_name.includes("Authorization") ? "Authorization Expense" :
    expense.expense_head_name.includes("L1") ? "L1 Expense" :
    /Commission|Work Incentive/i.test(expense.expense_head_name) ? "Work Incentive Expense" :
    expense.expense_head_name.includes("Transport") ? "Transport Expense" :
    expense.expense_head_name.includes("Installation") ? "Installation Expense" : "Work Incentive Expense";
  const today = localBusinessDate();
  return db.transaction(() => {
    const voucher = createBalancedVoucher(db, {
      company_id: expense.company_id,
      voucher_date: today,
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
    markPosted(db, "expense_entries", expense.id, voucher.id, today);
    return voucher;
  })();
}

function postExpenseAccrualsForOrder(db, orderId) {
  db.prepare("SELECT id FROM expense_entries WHERE order_id = ? AND COALESCE(voucher_id, 0) = 0 AND is_deleted = 0 ORDER BY id").all(orderId)
    .forEach((row) => {
      // Bulk accrual skips entries that have no amount yet; posting one directly explains why.
      try { postExpenseEntry(db, row.id); } catch (error) { if (!/has no amount/.test(error.message)) throw error; }
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
    days_outstanding: daysBetween(invoice.invoice_date, localBusinessDate())
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
  `).run(allocation.amount_received + advanceAdjusted, allocation.tds, allocation.gst_tds, allocation.other_deductions, balance, daysBetween(receivable.invoice_date, localBusinessDate()), Number(receivable.invoice_amount || 0) < 0 ? "Credit" : balance <= 0 ? "Closed" : "Open", allocationStatus(settled, receivable.invoice_amount), receivable.id);
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

// The signed-in user whose request is being handled. main.js sets it for the
// duration of each IPC call, so service code that writes audit rows without an
// explicit user still records who acted. AsyncLocalStorage keeps it across an
// await, so an async handler cannot drop it half-way and skip the bank-details rule.
// Code that runs outside any IPC call (seeding, migrations, startup) has no actor.
const actorStore = new AsyncLocalStorage();

export function runAsActor(user, fn) {
  const actor = user ? { id: Number(user.id || user.user_id || 0) || null, role: user.role || user.user_role || null } : null;
  return actorStore.run(actor, fn);
}

export function currentActor() {
  const actor = actorStore.getStore();
  return actor ? { ...actor } : null;
}

export function auditLog(db, payload) {
  const ambientActor = actorStore.getStore();
  if (!payload.user_id && ambientActor?.id) payload = { ...payload, user_id: ambientActor.id, user_role: payload.user_role || ambientActor.role };
  const moduleName = payload.module || payload.table_name || "system";
  const tableName = payload.table_name || payload.module || "system";
  // A user or company id that is not in this database (for example right after a
  // restore) must never make the audit write fail.
  const userId = payload.user_id && db.prepare("SELECT 1 FROM users WHERE id = ?").get(payload.user_id) ? payload.user_id : null;
  const companyId = payload.company_id && db.prepare("SELECT 1 FROM companies WHERE id = ?").get(payload.company_id) ? payload.company_id : null;
  payload = { ...payload, user_id: userId, company_id: companyId };
  // Each row's hash covers its own stored values and the previous row's hash, so
  // editing or deleting an older audit row breaks the chain (see verifyAuditChain).
  const previousHash = db.prepare("SELECT event_hash FROM audit_log ORDER BY id DESC LIMIT 1").get()?.event_hash || "";
  const info = db.prepare(`
    INSERT INTO audit_log (company_id, user_id, user_role, action, module, table_name, record_id, old_value, new_value, ip_address, created_at)
    VALUES (@company_id, @user_id, @user_role, @action, @module, @table_name, @record_id, @old_value, @new_value, @ip_address, @created_at)
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
    // Same "YYYY-MM-DD HH:MM:SS" (UTC) format as CURRENT_TIMESTAMP everywhere else.
    created_at: new Date().toISOString().replace("T", " ").slice(0, 19)
  });
  const stored = db.prepare("SELECT * FROM audit_log WHERE id = ?").get(info.lastInsertRowid);
  db.prepare("UPDATE audit_log SET event_hash = ? WHERE id = ?").run(auditEventHash(stored, previousHash), stored.id);
}

const AUDIT_CHAIN_MARKER = "audit_chain_started";

function auditEventHash(row, previousHash) {
  return crypto.createHash("sha256").update(JSON.stringify({
    previous_hash: previousHash || "",
    id: row.id,
    company_id: row.company_id ?? null,
    user_id: row.user_id ?? null,
    user_role: row.user_role ?? null,
    action: row.action,
    module: row.module ?? null,
    table_name: row.table_name,
    record_id: row.record_id ?? null,
    old_value: row.old_value ?? null,
    new_value: row.new_value ?? null,
    created_at: row.created_at
  })).digest("hex");
}

// The verifiable chain starts at an 'audit_chain_started' row written once per
// database; rows before it were written under older schemes and are only counted.
// The start row id is also kept in schema_migrations, so deleting the start row is detected.
function auditChainStartId(db) {
  const name = db.prepare("SELECT migration_name FROM schema_migrations WHERE migration_name LIKE ? ORDER BY id LIMIT 1").get(`${AUDIT_CHAIN_MARKER}:%`)?.migration_name;
  return name ? Number(name.split(":")[1] || 0) : 0;
}

function ensureAuditChain(db) {
  if (auditChainStartId(db)) return;
  auditLog(db, { action: AUDIT_CHAIN_MARKER, table_name: "audit_log", new_value: "Tamper-evident audit chain started" });
  const id = db.prepare("SELECT MAX(id) id FROM audit_log").get().id;
  db.prepare("INSERT INTO schema_migrations (migration_name) VALUES (?)").run(`${AUDIT_CHAIN_MARKER}:${id}`);
}

export function verifyAuditChain(db) {
  const startId = auditChainStartId(db);
  if (!startId) return { chained: false, verified: 0, broken: [], legacyRows: db.prepare("SELECT COUNT(*) c FROM audit_log").get().c };
  const rows = db.prepare("SELECT * FROM audit_log WHERE id >= ? ORDER BY id").all(startId);
  let previous = db.prepare("SELECT event_hash FROM audit_log WHERE id < ? ORDER BY id DESC LIMIT 1").get(startId)?.event_hash || "";
  const broken = [];
  let expectedId = startId;
  for (const row of rows) {
    // A gap in ids after the chain started means a row was deleted.
    if (row.id !== expectedId) broken.push(expectedId);
    if (auditEventHash(row, previous) !== row.event_hash) broken.push(row.id);
    previous = row.event_hash;
    expectedId = row.id + 1;
    if (broken.length >= 20) break;
  }
  // AUTOINCREMENT keeps the highest id ever issued, so rows deleted from the end
  // of the log leave a gap between it and the last row still present.
  const lastIssued = Number(db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'audit_log'").get()?.seq || 0);
  const lastPresent = Number(rows[rows.length - 1]?.id || 0);
  if (lastIssued > lastPresent) broken.push(lastPresent + 1);
  return {
    chained: true,
    startedAt: rows[0]?.created_at || null,
    missingNewestRows: Math.max(0, lastIssued - lastPresent),
    verified: rows.length - new Set(broken).size,
    broken: [...new Set(broken)],
    legacyRows: db.prepare("SELECT COUNT(*) c FROM audit_log WHERE id < ?").get(startId).c
  };
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
  listRecords,
  supplyOrderNeedsItems,
  hasSupplyOrderItemInput,
  assertRecordEditable
} = createCrudHelpers({
  ALL_TABLES,
  WRITE_POLICY,
  TRANSACTION_TABLES,
  COMPANY_SPECIFIC_MASTER_TABLES,
  MASTER_TABLES,
  ACCOUNTING_TABLES,
  auditLog,
  assertDeleteSafe,
  assertTransactionYearOpen,
  financialYearForDate,
  transactionDateFor,
  seedAccounts,
  autoReserveOrderStock: (...args) => autoReserveOrderStock(...args),
  createProcurementPlanRecord: (...args) => createProcurementPlanRecord(...args),
  updateProcurementPlanRecord: (...args) => updateProcurementPlanRecord(...args),
  guardSensitiveWrite: (...args) => guardBankDetailWrite(...args)
});

// Writes made for a signed-in user (every IPC call runs as one) need the settings
// permission to set or change bank details. Seeding, migrations and other internal
// writes run outside any IPC call, have no actor and are not gated.
// The row passed in is the one about to be written; cleanPayload has already normalized
// its bank values, so this only checks.
function guardBankDetailWrite(db, table, row, oldRecord) {
  const changes = bankDetailChanges(table, row, oldRecord);
  const actor = currentActor();
  if (changes.length && actor) {
    enforceBankDetailPermission(db, {
      company_id: row?.company_id || oldRecord?.company_id || null,
      table_name: table,
      record_id: oldRecord?.id || null,
      user_id: actor.id
    });
  }
  return changes;
}

// The plain "Permission denied: settings" does not tell a data-entry user that the
// bank fields are the reason, so the refusal names them and the way forward.
export function enforceBankDetailPermission(db, context = {}) {
  try {
    return enforcePermission(db, BANK_DETAILS_PERMISSION, { ...context, module: "bank_details" });
  } catch (error) {
    if (!/^Permission denied/.test(String(error?.message)) || /signed-in user/i.test(String(error?.message))) throw error;
    throw new Error("Permission denied: settings. Bank account number, bank name, IFSC, branch and UPI details decide where money is paid, so only an admin can add or change them. Save the record without changing the bank details, or ask an admin to enter them. Nothing was saved.");
  }
}

export {
  createRecord,
  updateRecord,
  deleteRecord,
  getRecord,
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
  createAutomaticStockIssueFromSalesVoucher,
  mirrorStockForSource: (...args) => mirrorStockForSource(...args)
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
  stockBalance, weightedAverageCost, outwardValue, insertStockLedger,
  inventoryStockSummary, inventoryLowStockReport, inventoryDashboard,
  procurementRequirementReport,
  postStockInward, postStockOutward, postStockAdjustment,
  approveStockAdjustment, postStockReturn, inventoryData,
  reverseStockInward, reverseStockOutward, reverseStockAdjustment, reverseStockReturn,
  mirrorStockForSource
} = createInventoryService({
    auditLog, activeRowClause, accountId, createBalancedVoucher, ensurePurchasePriceVarianceAccount,
    autoReserveOrderStock: (...args) => autoReserveOrderStock(...args), listRecords, referenceData,
    reverseVoucher
  });

const {
  createProcurementPlanRecord,
  updateProcurementPlanRecord,
  convertPurchaseOrderToWorkOrder
} = createOperationalPlanningService({
  cleanPayload,
  getRecord,
  createRecord,
  auditLog,
  inventoryStockSummary
});

export { convertPurchaseOrderToWorkOrder };

// Dues and stock alerts; main.js supplies OS secure storage for passwords and tokens.
export function alertServiceWith({ encryptSecret, decryptSecret }) {
  return createAlertService({ auditLog, inventoryStockSummary, inventoryLowStockReport, supplierPayableReport, encryptSecret, decryptSecret });
}

const {
  parseImportFile, parseImportBuffer,
  normalizeHeader
} = createImportParserService();

const {
  hashPassword, verifyPassword, normalizeRole, enforcePermission, roleCan,
  authenticate, changeUserPassword, markDefaultAdminPasswordForChange,
  userForPermission, setRecoverySecret, recoveryResetPassword, adminResetPassword
} = createAuthService({
  auditLog
});

const {
  getAccountMappingRegistry,
  getAccountClassifications,
  getAccountMappingCoverage,
  getAccountMappingReviewQueue,
  assignAccountGroup,
  createMappedLedgerAccount
} = createAccountMappingService({
  auditLog,
  createLedgerAccount
});

const {
  bulkImportRecords, listImportBatches, previewImportRollback,
  rollbackImportBatch, listItemImportBatches,
  deleteItemImportBatch, deleteUnusedImportedItems,
  findMasterImportDuplicate
} = createImportValidationService({
  assertBulkDeleteSafe, enforcePermission, auditLog, userForPermission,
  getRecord, createRecord, updateRecord, columnExists, tableExists,
  normalizeDuplicateKey, supplyOrderNeedsItems, hasSupplyOrderItemInput,
  assertWriteAllowed,
  MASTER_TABLES, IMPORT_ROLLBACK_BLOCKED_TABLES
});

const {
  cleanTallyText,
  previewTallyStockXml, previewTallyMasterMigration
} = createTallyImportService({
  enforcePermission, normalizeDuplicateKey, findMasterImportDuplicate,
  parseImportFile, columnExists
});

const {
  uploadDocument, listDocuments, deleteDocument, replaceDocument
} = createDocumentService({
  auditLog, projectRoot
});

const {
  billingVoucherData, saveBillingVoucher, orderProfitability, calculateProfitability
} = createBillingService({
  referenceData, suggestedInvoiceSequences, assertRecordEditable,
  getRecord, auditLog, financialYearForDate, nextInvoiceNumber
});

const { dashboardCounts } = createDashboardService({
  activeRowClause, orderProfitability, inventoryStockSummary, inventoryLowStockReport,
  inventoryDashboard, procurementRequirementReport,
  financialControlReport, supplierPayableReport, billWiseReceivableReport
});

const {
  autoReserveOrderStock, createDeliveryChallan, confirmDeliveryChallan,
  createWarehouseTransfer, postWarehouseTransfer,
  submitForApproval, approveTransaction, postBusinessTransaction
} = createOperationsService({
  auditLog, stockBalance, nextDocumentNumber, createRecord,
  postStockOutward, weightedAverageCost, outwardValue, insertStockLedger,
  getRecord, postSalesVoucher, postPurchaseVoucher,
  postReceiptVoucher, postSupplierPaymentVoucher, postExpenseAccrualsForOrder, postExpenseEntry
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
  addMoneyShadowColumns,
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
  addPhase15iCracTables,
  addLeadStageTables,
  addPurchaseOrderTables,
  addProcurementPlanningTables,
  addPurchaseOrderConversionControls
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
  createOpeningBalance, closeFinancialYear, accountingData,
  trialBalance, profitLossReport, balanceSheetReport,
  businessVoucherPayload
};

const { moneyIntegrityReport, postRoundingAdjustment } = createMoneyIntegrityService({
  auditLog, accountId, nextVoucherNumber, postLedgerEntry, financialYearForDate
});

export { moneyIntegrityReport, postRoundingAdjustment };

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
  approveStockAdjustment, postStockReturn, inventoryData,
  reverseStockInward, reverseStockOutward, reverseStockAdjustment, reverseStockReturn,
  stockBalance, nextVoucherNumber
};

export {
  previewTallyStockXml, previewTallyMasterMigration
};

export {
  parseImportFile, parseImportBuffer
};

export {
  uploadDocument, listDocuments, deleteDocument, replaceDocument
};

export {
  authenticate, changeUserPassword, enforcePermission, roleCan,
  setRecoverySecret, recoveryResetPassword, adminResetPassword
};

export {
  getAccountMappingRegistry, getAccountClassifications,
  getAccountMappingCoverage, getAccountMappingReviewQueue,
  assignAccountGroup, createMappedLedgerAccount
};

export {
  billingVoucherData, saveBillingVoucher, orderProfitability
};

export {
  dashboardCounts
};

export {
  autoReserveOrderStock, createDeliveryChallan, confirmDeliveryChallan,
  createWarehouseTransfer, postWarehouseTransfer,
  approveTransaction, postBusinessTransaction
};

export {
  bulkImportRecords, listImportBatches, previewImportRollback,
  rollbackImportBatch, listItemImportBatches,
  deleteItemImportBatch, deleteUnusedImportedItems
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const db = initializeDatabase();
  db.close();
  console.log(`Initialized ${dbPath()}`);
}
