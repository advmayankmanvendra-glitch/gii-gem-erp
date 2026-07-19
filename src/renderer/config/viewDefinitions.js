const masterViews = {
  companies: {
    title: "Company Master",
    description: "Manage company registrations, tax identity and bank details.",
    primary: "company_name",
    fields: [
      ["company_name", "Company Name", "text"],
      ["gstin", "GSTIN", "text"],
      ["pan", "PAN", "text"],
      ["address", "Address", "textarea"],
      ["bank_name", "Bank Name", "text"],
      ["account_number", "Account Number", "text"],
      ["ifsc", "IFSC", "text"],
      ["status", "Status", "status"]
    ]
  },
  employees: {
    title: "Employee Master",
    description: "Manage users responsible for orders and incentive calculation.",
    primary: "employee_name",
    fields: [
      ["employee_name", "Employee Name", "text"],
      ["mobile_number", "Mobile Number", "text"],
      ["designation", "Designation", "text"],
      ["incentive_percentage", "Incentive Percentage", "number"],
      ["status", "Status", "status"]
    ]
  },
  government_departments: {
    title: "Government Department Master",
    description: "Manage government departments, institutions and contact points.",
    primary: "department_name",
    fields: [
      ["department_name", "Department Name", "text"],
      ["contact_person", "Contact Person", "text"],
      ["contact_number", "Contact Number", "text"],
      ["address", "Address", "textarea"],
      ["status", "Status", "status"]
    ]
  },
  suppliers: {
    title: "Supplier Master",
    description: "Manage suppliers, GST details and payment information.",
    primary: "supplier_name",
    fields: [
      ["supplier_name", "Supplier Name", "text"],
      ["supplier_type", "Supplier Type", "text"],
      ["supplier_code", "Supplier Code", "text"],
      ["date_of_activation", "Date of Activation", "date"],
      ["supplier_account_name", "Supplier Account Name", "text"],
      ["supplier_account_number", "Supplier Account Number", "text"],
      ["supplier_bank_name", "Supplier Bank Name", "text"],
      ["supplier_bank_ifsc_code", "Supplier Bank IFSC Code", "text"],
      ["supplier_branch", "Supplier Branch", "text"],
      ["supplier_contact", "Supplier Contact", "text"],
      ["remarks", "Remarks", "textarea"],
      ["gstin", "GSTIN", "text"],
      ["contact_details", "Contact Details", "textarea"],
      ["bank_details", "Bank Details", "textarea"],
      ["status", "Status", "status"]
    ]
  },
  items: {
    title: "Item Master",
    description: "Manage supply items, HSN, GST and category references.",
    primary: "item_name",
    fields: [
      ["item_name", "Item Name", "text"],
      ["brand", "Brand", "select"],
      ["model", "Model", "text"],
      ["hsn_code", "HSN Code", "text"],
      ["gst_rate", "GST Rate", "number"],
      ["unit", "Unit", "text"],
      ["category", "Category", "text"],
      ["opening_stock", "Opening Stock", "number"],
      ["opening_rate", "Opening Rate", "number"],
      ["opening_value", "Opening Value", "number"],
      ["reorder_level", "Reorder Level", "number"],
      ["minimum_stock_level", "Minimum Stock Level", "number"],
      ["maximum_stock_level", "Maximum Stock Level", "number"],
      ["track_serial_number", "Track Serial Number", "checkbox"],
      ["track_batch_number", "Track Batch Number", "checkbox"],
      ["warranty_period", "Warranty Period (Months)", "number"],
      ["status", "Status", "status"]
    ]
  },
  warehouses: {
    title: "Warehouse Master",
    description: "Manage store locations for inward, outward and stock ledger posting.",
    primary: "warehouse_name",
    fields: [
      ["warehouse_name", "Warehouse Name", "text"],
      ["location", "Location", "text"],
      ["responsible_person", "Responsible Person", "text"],
      ["status", "Status", "status"]
    ]
  },
  expense_heads: {
    title: "Expense Head Master",
    description: "Define future order expense heads and default calculation behavior.",
    primary: "expense_head_name",
    fields: [
      ["expense_head_name", "Expense Head Name", "text"],
      ["default_calculation_method", "Default Calculation Method", "calculation"],
      ["default_percentage", "Default Percentage", "number"],
      ["category", "Category", "text"],
      ["status", "Status", "status"]
    ]
  },
  banks: {
    title: "Bank Master",
    description: "Manage cash and bank accounts for payment and cash-flow phases.",
    primary: "bank_account_name",
    fields: [
      ["bank_account_name", "Bank Account Name", "text"],
      ["bank_name", "Bank Name", "text"],
      ["account_number", "Account Number", "text"],
      ["ifsc", "IFSC", "text"],
      ["opening_balance", "Opening Balance", "number"],
      ["status", "Status", "status"]
    ]
  }
};

const transactionViews = {
  supply_orders: {
    title: "Supply Orders",
    description: "Capture government supply orders, GeM references, consignee details and lifecycle status.",
    primary: "order_number",
    fields: [
      ["order_number", "Order Number", "text"],
      ["gem_order_number", "GeM Order Number", "text"],
      ["gem_contract_number", "Contract Number", "text"],
      ["supply_type", "Supply Type", "supply_type"],
      ["order_date", "Order Date", "date"],
      ["department_id", "Department", "department"],
      ["institution_name", "Institution Name", "text"],
      ["buyer_name", "Buyer Name", "text"],
      ["buyer_designation", "Buyer Designation", "text"],
      ["buyer_mobile", "Buyer Mobile", "text"],
      ["buyer_email", "Buyer Email", "text"],
      ["consignee", "Consignee Name", "text"],
      ["consignee_address", "Consignee Address", "textarea"],
      ["delivery_location", "Delivery Location", "text"],
      ["place_of_supply", "Place of Supply", "text"],
      ["location", "Location", "text"],
      ["delivery_period", "Delivery Period", "text"],
      ["warranty_period", "Warranty Period", "text"],
      ["payment_terms", "Payment Terms", "text"],
      ["emd_amount", "EMD Amount", "number"],
      ["security_deposit_amount", "Security Deposit Amount", "number"],
      ["employee_id", "Employee Assigned", "employee"],
      ["supply_due_date", "Supply Due Date", "date"],
      ["order_status", "Order Status", "order_status"],
      ["remarks", "Remarks", "textarea"]
    ]
  },
  procurements: {
    title: "Procurement",
    description: "Record supplier invoices, purchase value, GST, freight and partial procurement payments.",
    primary: "purchase_invoice_number",
    fields: [
      ["order_id", "Supply Order", "order"],
      ["purchase_date", "Purchase Date", "date"],
      ["supplier_id", "Supplier", "supplier"],
      ["purchase_invoice_number", "Purchase Invoice Number", "text"],
      ["purchase_value", "Purchase Value", "number"],
      ["purchase_gst", "Purchase GST", "number"],
      ["freight", "Freight", "number"],
      ["loading_charges", "Loading Charges", "number"],
      ["amount_paid", "Amount Paid", "number"],
      ["procurement_status", "Procurement Status", "procurement_status"],
      ["remarks", "Remarks", "textarea"]
    ]
  },
  expense_entries: {
    title: "Order Expenses",
    description: "Create dynamic order expense ledger entries for authorization, L1, work incentive and fixed costs.",
    primary: "remarks",
    fields: [
      ["order_id", "Supply Order", "order"],
      ["expense_head_id", "Expense Head", "expense_head"],
      ["expense_category", "Expense Category", "text"],
      ["calculation_method", "Calculation Method", "calculation"],
      ["percentage", "Percentage", "number"],
      ["fixed_amount", "Fixed Amount", "number"],
      ["expense_amount", "Expense Amount", "number"],
      ["payable_to", "Vendor / Payable To", "text"],
      ["payment_status", "Payment Status", "payment_status"],
      ["remarks", "Remarks", "textarea"]
    ]
  },
  invoices: {
    title: "Billing",
    description: "Raise tax invoices, revised invoices, credit notes and debit notes against orders.",
    primary: "invoice_number",
    fields: [
      ["order_id", "Supply Order", "order"],
      ["invoice_number", "Invoice Number", "text"],
      ["invoice_date", "Invoice Date", "date"],
      ["billing_value", "Billing Value", "number"],
      ["gst_rate", "GST Rate", "number"],
      ["invoice_type", "Invoice Type", "invoice_type"],
      ["remarks", "Remarks", "textarea"]
    ]
  },
  payments: {
    title: "Payments",
    description: "Track advance, partial and final receipts with UTR and bank account details.",
    primary: "utr_number",
    fields: [
      ["order_id", "Supply Order", "order"],
      ["billing_id", "Linked Invoice ID", "number"],
      ["payment_date", "Payment Date", "date"],
      ["payment_amount", "Payment Amount", "number"],
      ["payment_mode", "Payment Mode", "payment_mode"],
      ["utr_number", "UTR Number", "text"],
      ["bank_id", "Bank Account", "bank"],
      ["invoice_outstanding", "Invoice Outstanding Before Receipt", "number"],
      ["tds_deducted", "TDS Deducted", "number"],
      ["gst_tds_deducted", "GST TDS Deducted", "number"],
      ["other_deductions", "Other Deductions", "number"],
      ["net_receipt", "Net Receipt", "number"],
      ["allocation_status", "Allocation Status", "allocation_status"],
      ["remarks", "Remarks", "textarea"]
    ]
  },
  stock_inwards: {
    title: "Stock Inward",
    description: "Record stock received from procurement. Stock increases only after posting.",
    primary: "purchase_invoice_number",
    fields: [
      ["procurement_id", "Procurement ID", "number"],
      ["order_id", "Supply Order", "order"],
      ["supplier_id", "Supplier", "supplier"],
      ["item_id", "Item", "item"],
      ["warehouse_id", "Warehouse", "warehouse"],
      ["inward_date", "Inward Date", "date"],
      ["purchase_invoice_number", "Purchase Invoice Number", "text"],
      ["quantity", "Quantity", "number"],
      ["rate", "Rate", "number"],
      ["gst_rate", "GST Rate", "number"],
      ["landed_cost", "Landed Cost", "number"],
      ["serial_number", "Serial Number", "text"],
      ["batch_number", "Batch Number", "text"],
      ["remarks", "Remarks", "textarea"]
    ]
  },
  stock_outwards: {
    title: "Stock Outward",
    description: "Issue stock against supply orders. Stock reduces only after posting.",
    primary: "delivery_challan_number",
    fields: [
      ["order_id", "Supply Order", "order"],
      ["department_id", "Department", "department"],
      ["item_id", "Item", "item"],
      ["warehouse_id", "Warehouse", "warehouse"],
      ["issue_date", "Issue Date", "date"],
      ["delivery_challan_number", "Delivery Challan Number", "text"],
      ["quantity_issued", "Quantity Issued", "number"],
      ["serial_number", "Serial Number", "text"],
      ["batch_number", "Batch Number", "text"],
      ["remarks", "Remarks", "textarea"]
    ]
  },
  stock_adjustments: {
    title: "Stock Adjustment",
    description: "Approve and post controlled stock increases/decreases with audit trail.",
    primary: "reason",
    fields: [
      ["item_id", "Item", "item"],
      ["warehouse_id", "Warehouse", "warehouse"],
      ["adjustment_date", "Adjustment Date", "date"],
      ["adjustment_type", "Adjustment Type", "adjustment_type"],
      ["quantity", "Quantity", "number"],
      ["rate", "Rate", "number"],
      ["reason", "Reason", "text"],
      ["remarks", "Remarks", "textarea"]
    ]
  },
  stock_returns: {
    title: "Stock Return",
    description: "Track department returns and supplier returns with stock impact on posting.",
    primary: "reason",
    fields: [
      ["return_type", "Return Type", "return_type"],
      ["order_id", "Supply Order", "order"],
      ["supplier_id", "Supplier", "supplier"],
      ["department_id", "Department", "department"],
      ["item_id", "Item", "item"],
      ["warehouse_id", "Warehouse", "warehouse"],
      ["return_date", "Return Date", "date"],
      ["quantity", "Quantity", "number"],
      ["condition_status", "Condition", "condition_status"],
      ["reason", "Reason", "text"],
      ["remarks", "Remarks", "textarea"]
    ]
  }
};

export { masterViews, transactionViews };
