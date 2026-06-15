const importTemplates = {
  companies: ["company_name", "gstin", "pan", "address", "bank_name", "account_number", "ifsc", "status"],
  employees: ["employee_name", "mobile_number", "designation", "incentive_percentage", "status"],
  government_departments: ["department_name", "contact_person", "contact_number", "address", "status"],
  suppliers: ["supplier Name", "supplier Type", "supplier Code", "Date of Activation", "supplier Account Name", "supplier Account Number", "supplier Bank Name", "supplier bank IFSC code", "supplier Branch", "supplier contact", "remarks", "gstin", "contact_details", "bank_details", "status"],
  items: ["item_name", "brand", "model", "hsn_code", "gst_rate", "unit", "category", "opening_stock", "opening_rate", "opening_value", "reorder_level", "minimum_stock_level", "maximum_stock_level", "track_serial_number", "track_batch_number", "warranty_period", "status"],
  warehouses: ["warehouse_name", "location", "responsible_person", "status"],
  expense_heads: ["expense_head_name", "default_calculation_method", "default_percentage", "category", "status"],
  banks: ["bank_account_name", "bank_name", "account_number", "ifsc", "opening_balance", "status"],
  supply_orders: ["company", "order_number", "order_date", "department", "institution_name", "location", "employee_assigned", "supply_due_date", "order_status", "remarks"],
  procurements: ["order_number", "purchase_date", "supplier_name", "purchase_invoice_number", "item_name", "quantity", "purchase_value", "gst_rate", "gst_amount", "freight", "loading_charges", "remarks"],
  expense_entries: ["order_number", "expense_head", "calculation_method", "percentage", "fixed_amount", "expense_amount", "payable_to", "payment_status", "remarks"],
  invoices: ["order_number", "invoice_number", "invoice_date", "billing_value", "gst_rate", "gst_amount", "total_invoice_value", "invoice_type", "remarks"],
  payments: ["order_number", "payment_date", "payment_amount", "payment_mode", "utr_number", "bank_account", "payment_type", "remarks"],
  stock_inwards: ["order_number", "supplier_name", "item_name", "warehouse_name", "inward_date", "purchase_invoice_number", "quantity", "rate", "gst_rate", "landed_cost", "serial_number", "batch_number", "remarks"],
  stock_outwards: ["order_number", "department", "item_name", "warehouse_name", "issue_date", "delivery_challan_number", "quantity_issued", "serial_number", "batch_number", "remarks"],
  stock_adjustments: ["item_name", "warehouse_name", "adjustment_date", "adjustment_type", "quantity", "rate", "reason", "remarks"],
  stock_returns: ["return_type", "order_number", "supplier_name", "department", "item_name", "warehouse_name", "return_date", "quantity", "condition_status", "reason", "remarks"],
  receivables: ["invoice_number", "invoice_date", "invoice_amount", "amount_received", "tds_deducted", "gst_tds_deducted", "balance_outstanding", "status"],
  payables: ["supplier_name", "purchase_invoice_number", "purchase_value", "amount_paid", "balance_due"]
};

const importTemplateSampleRows = {
  suppliers: ["ABC Medical Suppliers", "Vendor", "SUP-001", "2026-06-10", "ABC Medical Suppliers", "123456789012", "HDFC Bank", "HDFC0001234", "Mumbai Main", "9876543210", "Preferred supplier", "27ABCDE1234F1Z5", "accounts@abcmedical.example", "HDFC Bank - 123456789012", "active"]
};

const masterImportTemplateDefinitions = [
  {
    id: "company_master",
    title: "Company Master Template",
    table: "companies",
    category: "Core Masters",
    columns: ["company_name", "gstin", "pan", "address", "bank_name", "account_number", "ifsc", "status"],
    required: ["company_name", "status"],
    duplicateKeys: ["company_name", "gstin", "pan"],
    sample: ["Gesture India Infrastructure Pvt. Ltd.", "27ABCDE1234F1Z5", "ABCDE1234F", "Mumbai", "SBI", "123456789012", "SBIN0001234", "active"],
    guidance: "Use for legal entities and GST/PAN identity. Duplicate company name, GSTIN or PAN is blocked or updated based on import mode."
  },
  {
    id: "department_master",
    title: "Department / Government Department Master Template",
    table: "government_departments",
    category: "Core Masters",
    columns: ["department_name", "contact_person", "contact_number", "address", "status"],
    required: ["department_name", "status"],
    duplicateKeys: ["department_name"],
    sample: ["Public Works Department", "Executive Engineer", "9876543210", "PWD Central Office", "active"],
    guidance: "Use for government buyers. Institution and consignee details can be mapped separately until a dedicated institution master is enabled."
  },
  {
    id: "institution_consignee_master",
    title: "Institution / Consignee Master Template",
    category: "Mapping / Staging",
    columns: ["department_name", "institution_name", "consignee_name", "location", "contact_person", "contact_number", "address", "status", "remarks"],
    required: ["department_name", "institution_name", "status"],
    duplicateKeys: ["department_name", "institution_name", "consignee_name"],
    sample: ["Public Works Department", "PWD Central Store", "PWD Central Store", "Mumbai", "Store Officer", "9876543210", "Mumbai", "active", "Use while preparing order data"],
    stagingOnly: true,
    guidance: "Staging template only. The current ERP stores institutions against orders, so this template helps clean and map data before order import."
  },
  {
    id: "supplier_master",
    title: "Supplier Master Template",
    table: "suppliers",
    category: "Core Masters",
    columns: ["supplier_name", "supplier_type", "supplier_code", "date_of_activation", "supplier_account_name", "supplier_account_number", "supplier_bank_name", "supplier_bank_ifsc_code", "supplier_branch", "supplier_contact", "remarks", "gstin", "contact_details", "bank_details", "status"],
    required: ["supplier_name", "status"],
    duplicateKeys: ["supplier_name", "gstin", "supplier_account_number"],
    sample: ["Prime Industries", "Vendor", "SUP-001", "2026-04-01", "Prime Industries", "50200012345678", "HDFC Bank", "HDFC0001234", "Mumbai", "9876543210", "Preferred", "27ABCDE1234F1Z5", "accounts@prime.example", "HDFC Bank - 50200012345678", "active"],
    guidance: "Use for vendors and beneficiary-style bank records. GSTIN and account details are validated before import."
  },
  {
    id: "customer_party_master",
    title: "Customer / Party Master Template",
    category: "Mapping / Staging",
    columns: ["party_name", "party_type", "department_name", "gstin", "pan", "state", "address", "opening_balance", "opening_balance_type", "status", "remarks"],
    required: ["party_name", "party_type", "status"],
    duplicateKeys: ["party_name", "gstin", "pan"],
    sample: ["PWD Central Store", "Government Department", "Public Works Department", "", "", "Maharashtra", "Mumbai", "0", "Debit", "active", "Map to Department Master or party ledger"],
    stagingOnly: true,
    guidance: "Staging template only. Use to clean Tally/customer party data before mapping it to departments, suppliers or ledger accounts."
  },
  {
    id: "item_master",
    title: "Item Master Template",
    table: "items",
    category: "Core Masters",
    columns: ["item_name", "brand", "model", "hsn_code", "gst_rate", "unit", "category", "opening_stock", "opening_rate", "opening_value", "reorder_level", "minimum_stock_level", "maximum_stock_level", "track_serial_number", "track_batch_number", "warranty_period", "status"],
    required: ["item_name", "gst_rate", "unit", "status"],
    duplicateKeys: ["item_name", "brand", "model", "hsn_code"],
    sample: ["Office Workstation", "HP", "EliteDesk", "8471", "18", "Nos", "IT Equipment", "0", "0", "0", "5", "2", "20", "No", "No", "36", "active"],
    guidance: "Use for item catalogue, HSN and GST mapping. Invalid GST rates and duplicate item identity are flagged."
  },
  {
    id: "expense_head_master",
    title: "Expense Head Master Template",
    table: "expense_heads",
    category: "Core Masters",
    columns: ["expense_head_name", "default_calculation_method", "default_percentage", "category", "status"],
    required: ["expense_head_name", "default_calculation_method", "status"],
    duplicateKeys: ["expense_head_name"],
    sample: ["Authorization", "percentage_gross", "5", "Order Expense", "active"],
    guidance: "Use for authorization, L1, commission, transport and similar dynamic expense heads."
  },
  {
    id: "bank_master",
    title: "Bank Master Template",
    table: "banks",
    category: "Core Masters",
    columns: ["bank_account_name", "bank_name", "account_number", "ifsc", "opening_balance", "status"],
    required: ["bank_account_name", "bank_name", "status"],
    duplicateKeys: ["bank_account_name", "account_number"],
    sample: ["SBI Current Account", "SBI", "123456789012", "SBIN0001234", "0", "active"],
    guidance: "Use for cash and bank accounts used in payment, receipt, bank book and reconciliation workflows."
  },
  {
    id: "employee_master",
    title: "Employee Master Template",
    table: "employees",
    category: "Core Masters",
    columns: ["employee_name", "mobile_number", "designation", "incentive_percentage", "status"],
    required: ["employee_name", "mobile_number", "status"],
    duplicateKeys: ["employee_name", "mobile_number"],
    sample: ["Amit Sharma", "9876543210", "Sales Executive", "15", "active"],
    guidance: "Use for order responsibility and incentive percentage setup."
  },
  {
    id: "chart_accounts_ledger_master",
    title: "Chart of Accounts / Ledger Master Template",
    category: "Accounting Mapping / Staging",
    columns: ["account_code", "account_name", "account_type", "normal_balance", "opening_balance", "gstin", "pan", "linked_party_type", "linked_party_name", "status", "remarks"],
    required: ["account_name", "account_type", "normal_balance", "status"],
    duplicateKeys: ["account_code", "account_name"],
    sample: ["1100", "Trade Receivables", "Asset", "Debit", "0", "", "", "Department", "Public Works Department", "active", "Review before controlled ledger import"],
    stagingOnly: true,
    guidance: "Validation and mapping only. Ledger accounts are accounting-controlled and must be created through controlled accounting workflows."
  },
  {
    id: "opening_balance",
    title: "Opening Balance Template",
    category: "Accounting Mapping / Staging",
    columns: ["company_name", "financial_year", "account_name", "party_type", "party_name", "opening_balance", "opening_balance_type", "reference_number", "remarks"],
    required: ["company_name", "financial_year", "account_name", "opening_balance", "opening_balance_type"],
    duplicateKeys: ["company_name", "financial_year", "account_name", "party_name"],
    sample: ["Gesture India Infrastructure Pvt. Ltd.", "FY 2026-27", "Trade Receivables", "Department", "Public Works Department", "100000", "Debit", "OB-001", "Opening receivable"],
    stagingOnly: true,
    guidance: "Validation and mapping only. Opening balances must be posted through the controlled Opening Balance workflow."
  },
  {
    id: "tally_ledger_mapping",
    title: "Tally Ledger Mapping Template",
    category: "Tally Cleanup",
    columns: ["tally_ledger_name", "erp_party_type", "erp_master_type", "erp_party_name", "erp_account_group", "gstin", "pan", "state", "opening_balance", "opening_balance_type", "mapped_erp_id", "action_create_or_map", "remarks"],
    required: ["tally_ledger_name", "erp_master_type", "erp_account_group", "action_create_or_map"],
    duplicateKeys: ["tally_ledger_name", "erp_party_name"],
    sample: ["MONAF STORES", "Supplier", "suppliers", "MONAF STORES", "Sundry Creditors", "27ABCDE1234F1Z5", "ABCDE1234F", "Maharashtra", "0", "Credit", "", "create", "Review GSTIN before import"],
    stagingOnly: true,
    guidance: "Use to clean and map Tally ledger names to ERP masters before any controlled migration."
  },
  {
    id: "tally_voucher_mapping",
    title: "Tally Voucher Mapping Template",
    category: "Tally Cleanup",
    columns: ["tally_voucher_type", "erp_voucher_type", "tally_number", "erp_reference_number", "party_ledger", "voucher_date", "amount", "gst_ledger", "bank_ledger", "narration", "import_action", "remarks"],
    required: ["tally_voucher_type", "erp_voucher_type", "voucher_date", "amount", "import_action"],
    duplicateKeys: ["tally_voucher_type", "tally_number", "voucher_date"],
    sample: ["Sales", "Sales Voucher", "115", "INV-001", "Public Works Department", "2026-01-02", "100000", "Output GST", "SBI Current Account", "Tax invoice", "map", "Check GST split"],
    stagingOnly: true,
    guidance: "Use to map Tally voucher types and references to ERP voucher types. Unknown voucher types are blocked until mapped."
  },
  {
    id: "gst_hsn_mapping",
    title: "GST Rate / HSN Mapping Template",
    category: "Tally Cleanup",
    columns: ["hsn_sac", "item_category", "description", "gst_rate", "effective_from", "effective_to", "remarks"],
    required: ["hsn_sac", "gst_rate"],
    duplicateKeys: ["hsn_sac", "gst_rate"],
    sample: ["8471", "IT Equipment", "Automatic data processing machines", "18", "2026-04-01", "", "Map to Item Master"],
    stagingOnly: true,
    guidance: "Use to clean GST rate and HSN mapping before item import. It does not alter GST calculation logic."
  },
  {
    id: "warehouse_location",
    title: "Warehouse / Location Template",
    table: "warehouses",
    category: "Core Masters",
    columns: ["warehouse_name", "location", "warehouse_type", "responsible_person", "status"],
    required: ["warehouse_name", "status"],
    duplicateKeys: ["warehouse_name"],
    sample: ["Main Store", "Mumbai", "Primary", "Store Manager", "active"],
    guidance: "Use for warehouses and storage locations used by GRN, stock receipt, issue, transfer and stock reports."
  },
  {
    id: "tally_item_mapping",
    title: "Item Mapping Template",
    category: "Tally Cleanup",
    columns: ["tally_item_name", "erp_item_name", "item_category", "hsn_sac", "unit", "gst_rate", "purchase_rate", "sales_rate", "opening_stock_qty", "opening_stock_value", "warehouse", "remarks"],
    required: ["tally_item_name", "erp_item_name", "unit", "gst_rate"],
    duplicateKeys: ["tally_item_name", "erp_item_name", "hsn_sac"],
    sample: ["10 NO PIN", "10 NO PIN", "Electrical", "8536", "PCS", "18", "5.39", "8.88", "1", "5.39", "Main Store", "Map before item import"],
    stagingOnly: true,
    guidance: "Use to clean Tally item names, HSN, GST, rates and opening stock before importing Item Master or opening stock."
  }
];

export { importTemplates, importTemplateSampleRows, masterImportTemplateDefinitions };
