const WORKFLOW_STAGE_MAP = {
  supply_orders: { stage: "WORK_ORDER", label: "Work Order / Supply Order", before: "Lead/Tender", after: "Procurement Planning" },
  procurements: { stage: "PROCUREMENT_PLANNING", label: "Procurement Planning", before: "WORK_ORDER", after: "SUPPLIER_PURCHASE_ORDER" },
  supplier_purchase_orders: { stage: "SUPPLIER_PURCHASE_ORDER", label: "Supplier Purchase Order", before: "PROCUREMENT_PLANNING", after: "GOODS_RECEIPT_GRN" },
  goods_receipt: { stage: "GOODS_RECEIPT_GRN", label: "Goods Receipt / GRN", before: "SUPPLIER_PURCHASE_ORDER", after: "INVENTORY_RESERVATION" },
  stock_inwards: { stage: "INVENTORY_RESERVATION", label: "Inventory Reservation", before: "GOODS_RECEIPT_GRN", after: "DELIVERY_CHALLAN" },
  stock_outwards: { stage: "DELIVERY_CHALLAN", label: "Delivery Challan", before: "INVENTORY_RESERVATION", after: "INSTALLATION" },
  crac: { stage: "CRAC", label: "CRAC", before: "INSTALLATION", after: "SALES_INVOICE_GST_INVOICE" },
  sales_invoices: { stage: "SALES_INVOICE_GST_INVOICE", label: "Sales Invoice / GST Invoice", before: "CRAC", after: "DEPARTMENT_RECEIVABLE" },
  receivables: { stage: "DEPARTMENT_RECEIVABLE", label: "Department Receivable", before: "SALES_INVOICE_GST_INVOICE", after: "RECEIPT" },
  payments_received: { stage: "RECEIPT", label: "Receipt", before: "DEPARTMENT_RECEIVABLE", after: "ORDER_CLOSURE" },
  supplier_payments: { stage: "RECEIPT", label: "Supplier Payment", before: "SUPPLIER_PURCHASE_ORDER", after: "ORDER_CLOSURE" },
  expenses: { stage: "ORDER_CLOSURE", label: "Expense / Order Closure", before: "RECEIPT", after: "Profitability Analysis" },
  voucher_dashboard: { stage: null, label: "Voucher Management", before: null, after: null },
  trial_balance: { stage: null, label: "Trial Balance", before: null, after: null },
  profit_loss: { stage: null, label: "Profit & Loss", before: null, after: null },
  balance_sheet: { stage: null, label: "Balance Sheet", before: null, after: null },
  bank_reconciliation: { stage: null, label: "Bank Reconciliation", before: null, after: null }
};

const SCREEN_IMPACT_MAP = {
  supply_orders: { accounting: false, inventory: false, gst: false },
  procurements: { accounting: false, inventory: false, gst: false },
  goods_receipt: { accounting: false, inventory: true, gst: false },
  stock_inwards: { accounting: false, inventory: true, gst: false },
  stock_outwards: { accounting: false, inventory: true, gst: false },
  crac: { accounting: false, inventory: false, gst: false },
  sales_invoices: { accounting: true, inventory: false, gst: true },
  receivables: { accounting: true, inventory: false, gst: false },
  payments_received: { accounting: true, inventory: false, gst: false },
  supplier_payments: { accounting: true, inventory: false, gst: false },
  expenses: { accounting: true, inventory: false, gst: false },
  voucher_dashboard: { accounting: true, inventory: false, gst: false },
  trial_balance: { accounting: true, inventory: false, gst: false },
  profit_loss: { accounting: true, inventory: false, gst: false },
  balance_sheet: { accounting: true, inventory: false, gst: false },
  bank_reconciliation: { accounting: true, inventory: false, gst: false },
  ledger_view: { accounting: true, inventory: false, gst: false },
  gst_register: { accounting: true, inventory: false, gst: true },
  chart_accounts: { accounting: true, inventory: false, gst: false },
  dashboard: { accounting: false, inventory: false, gst: false },
  import_export: { accounting: false, inventory: false, gst: false }
};

const VIEW_KEY_TO_SCREEN = {
  supply_orders: "Supply Order / Work Order",
  procurements: "Procurement",
  supplier_purchase_orders: "Supplier Purchase Orders",
  goods_receipt: "Goods Receipt / GRN",
  stock_inwards: "Stock Inward",
  stock_outwards: "Stock Outward / Delivery Challan",
  stock_adjustments: "Stock Adjustments",
  stock_summary: "Stock Summary",
  crac_management: "CRAC Management",
  sales_invoices: "Billing / GST Invoice",
  credit_notes: "Credit Notes",
  receivables: "Receivables",
  payments_received: "Receipts",
  supplier_payments: "Supplier Payments",
  expenses: "Expenses",
  voucher_dashboard: "Business Vouchers",
  manual_voucher: "Accounting Vouchers / Journal",
  trial_balance: "Trial Balance",
  profit_loss: "Profit & Loss",
  balance_sheet: "Balance Sheet",
  bank_reconciliation: "Bank Reconciliation",
  gst_register: "GST Register",
  chart_accounts: "Chart of Accounts",
  ledger_view: "General Ledger",
  posting_control: "Posting Control",
  approval_queue: "Approval Queue",
  dashboard: "Dashboard",
  help_assistant: "Help / Manuals",
  help_training: "Help & Training",
  health_center: "ERP Health Center",
  production_readiness: "Production Readiness",
  go_live_wizard: "Go-Live Wizard",
  tally_migration: "Tally Migration",
  import_export: "Import / Export"
};

function resolveContext(viewKey) {
  const screenName = VIEW_KEY_TO_SCREEN[viewKey] || null;
  const workflowInfo = WORKFLOW_STAGE_MAP[viewKey] || null;
  const impact = SCREEN_IMPACT_MAP[viewKey] || { accounting: false, inventory: false, gst: false };
  return { screenName, workflowInfo, impact };
}

function getAccountingSafetyBoundary() {
  return {
    note: "This is accounting-sensitive guidance. The assistant explains the process but does not post or reverse vouchers.",
    rules: [
      "Accounting impact must flow through controlled posting functions (createBalancedVoucher).",
      "Work Order / Supply Order has no direct accounting impact.",
      "Trial Balance, Profit & Loss, and Balance Sheet derive from ledger_entries.",
      "Generic CRUD is blocked for accounting-protected tables.",
      "Financial year lock blocks posting in locked years."
    ]
  };
}

function getWorkOrderBoundary() {
  return {
    note: "Work Order / Supply Order is the operational root stage. It has no direct accounting, inventory, or GST impact.",
    source: "WG-1 Workflow Intelligence Graph"
  };
}

function resolveWorkflowGuidance(stageId) {
  const stages = {
    WORK_ORDER: "Work Order / Supply Order is the operational root. Downstream: Procurement Planning.",
    PROCUREMENT_PLANNING: "Procurement Planning is downstream of Work Order. Downstream: Supplier Purchase Order.",
    SUPPLIER_PURCHASE_ORDER: "Supplier Purchase Order is downstream of Procurement Planning. Downstream: Goods Receipt / GRN.",
    GOODS_RECEIPT_GRN: "GRN is downstream of procurement. Creates inventory impact. Downstream: Inventory Reservation.",
    INVENTORY_RESERVATION: "Inventory Reservation is downstream of GRN. Downstream: Delivery Challan.",
    DELIVERY_CHALLAN: "Delivery Challan is downstream of inventory readiness. Downstream: Installation / CRAC.",
    INSTALLATION: "Installation is downstream of Delivery Challan. Downstream: CRAC.",
    CRAC: "CRAC is billing readiness evidence. Downstream: Sales Invoice / GST Invoice.",
    SALES_INVOICE_GST_INVOICE: "Sales Invoice creates accounting, GST, and receivable impact. Downstream: Department Receivable.",
    DEPARTMENT_RECEIVABLE: "Department Receivable is downstream of invoicing. Downstream: Receipt.",
    RECEIPT: "Receipt settles receivable and affects cash/bank. Downstream: Order Closure.",
    ORDER_CLOSURE: "Order Closure is the final stage. Downstream: Profitability Analysis."
  };
  return stages[stageId] || `Stage "${stageId}" — see WG-1 workflow graph for details.`;
}

export { resolveContext, getAccountingSafetyBoundary, getWorkOrderBoundary, resolveWorkflowGuidance, VIEW_KEY_TO_SCREEN, WORKFLOW_STAGE_MAP, SCREEN_IMPACT_MAP };
