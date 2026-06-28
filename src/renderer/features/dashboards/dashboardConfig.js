export const DASHBOARD_MODE_LABELS = {
  executive: "Executive",
  operations: "Operations",
  accounts: "Accounts",
  business_development: "Business Development",
  inventory_procurement: "Inventory & Procurement",
  management_intelligence: "Management Intelligence",
  custom: "Custom"
};

const EXECUTIVE_CARDS = [
  { id: "orders_pending", label: "Orders Pending", icon: "clipboard", target: "supply_orders", dataSource: "Supply Orders Register", valueKey: "activeOrders", format: "number", nextAction: "Review active order ageing and stage." },
  { id: "billing_this_month", label: "Billing This Month", icon: "rupee", target: "invoices", dataSource: "Sales Register / Invoice Summary", valueKey: "totalOrderValue", format: "currency", nextAction: "Verify invoice list and GST impact." },
  { id: "collections_this_month", label: "Collections This Month", icon: "card", target: "cash_book", dataSource: "Cash / Bank Receipt Register", valueKey: "amountReceived", format: "currency", nextAction: "Match receipts with cash and bank books." },
  { id: "receivables", label: "Outstanding Receivables", icon: "wallet", target: "bill_wise_receivables", dataSource: "Bill-wise Receivables Report", valueKey: "outstanding", format: "currency", nextAction: "Review ageing and allocation gaps." },
  { id: "payables", label: "Supplier Payables", icon: "truck", target: "bill_wise_payables", dataSource: "Supplier Payables Report", valueKey: "supplierPayables", fallbackKey: "payables", format: "currency", nextAction: "Review supplier bill ageing." },
  { id: "net_profit", label: "Net Profit", icon: "trend", target: "profitability_reports", dataSource: "Profitability Report", valueKey: "totalProfit", format: "currency", nextAction: "Drill into order-wise profitability." },
  { id: "stock_value", label: "Stock Value", icon: "box", target: "stock_valuation", dataSource: "Stock Valuation Report", valueKey: "totalStockValue", format: "currency", nextAction: "Verify item and warehouse valuation." },
  { id: "critical_alerts", label: "Critical Alerts", icon: "shield", target: "low_stock", dataSource: "Low Stock / Exception Report", valueKey: "lowStockItems", format: "number", nextAction: "Review stock and exception rows." },
  { id: "companies", label: "Companies", icon: "building", target: "companies", dataSource: "Company Master", valueKey: "companies", format: "number" },
  { id: "suppliers", label: "Suppliers", icon: "truck", target: "suppliers", dataSource: "Supplier Master", valueKey: "suppliers", format: "number" },
  { id: "items", label: "Items", icon: "box", target: "items", dataSource: "Item Master", valueKey: "items", format: "number" }
];

const OPERATIONS_CARDS = [
  { id: "orders_received", label: "Orders Received", icon: "clipboard", target: "supply_orders", dataSource: "Supply Orders Register", valueKey: "totalOrders", format: "number" },
  { id: "pending_procurement", label: "Pending Procurement", icon: "cart", target: "pending_procurement", dataSource: "Procurement Queue", valueKey: "pendingProcurement", format: "number", nextAction: "Open procurement queue and complete pending order items." },
  { id: "pending_supply", label: "Pending Supply", icon: "truck", target: "order_lifecycle", dataSource: "Order Lifecycle Report", valueKey: "pendingSupply", fallbackKey: "activeOrders", format: "number", nextAction: "Review lifecycle stage and supply blockers." },
  { id: "pending_billing", label: "Pending Billing", icon: "receipt", target: "pending_billing", dataSource: "Pending Billing Report", valueKey: "pendingBilling", format: "number", nextAction: "Raise or review pending invoice records." },
  { id: "pending_documents", label: "Pending Documents", icon: "file", target: "missing_documents", dataSource: "Missing Documents Report", valueKey: "pendingDocuments", format: "number", nextAction: "Upload missing order, invoice or payment evidence." },
  { id: "ready_for_closure", label: "Ready For Closure", icon: "clipboard", target: "operations_dashboard", dataSource: "Operations Dashboard", valueKey: "readyForClosure", format: "number" },
  { id: "low_stock", label: "Low Stock", icon: "shield", target: "low_stock", dataSource: "Low Stock Report", valueKey: "lowStockItems", format: "number" },
  { id: "pending_delivery", label: "Pending Delivery", icon: "truck", target: "delivery_challans", dataSource: "Delivery Challan Register", valueKey: "pendingDeliveries", format: "number" },
  { id: "crac_pending", label: "CRAC Pending", icon: "file", target: "crac_tracker", dataSource: "CRAC Tracker", valueKey: "cracPending", format: "number" },
  { id: "crac_generated", label: "CRAC Generated", icon: "file", target: "crac_management", dataSource: "CRAC Management", valueKey: "cracGenerated", format: "number" },
  { id: "payment_ready", label: "Payment Ready Orders", icon: "card", target: "payment_readiness", dataSource: "Payment Readiness Report", valueKey: "paymentReadyOrders", format: "number" },
  { id: "items_in_stock", label: "Items In Stock", icon: "box", target: "stock_summary", dataSource: "Stock Summary Report", valueKey: "itemsInStock", format: "number" },
  { id: "items_issued", label: "Items Issued", icon: "truck", target: "stock_ledger", dataSource: "Stock Ledger", valueKey: "itemsIssued", format: "number" },
  { id: "returns", label: "Returns", icon: "undo", target: "stock_returns", dataSource: "Stock Returns Register", valueKey: "returnedItems", format: "number" }
];

const ACCOUNTS_CARDS = [
  { id: "cash_bank_balance", label: "Cash / Bank Balance", icon: "card", target: "cash_book", reconcileTarget: "bank_book", dataSource: "Cash Book / Bank Book", valueKey: "cashBankBalance", fallbackKey: "amountReceived", format: "currency", nextAction: "Use Treasury Overview for account-wise balances." },
  { id: "receivables", label: "Receivables", icon: "wallet", target: "bill_wise_receivables", dataSource: "Bill-wise Receivables Report", valueKey: "outstanding", format: "currency" },
  { id: "payables", label: "Payables", icon: "truck", target: "bill_wise_payables", dataSource: "Supplier Payables Report", valueKey: "supplierPayables", fallbackKey: "payables", format: "currency", nextAction: "Review bill-wise supplier dues." },
  { id: "unposted_vouchers", label: "Unposted Vouchers", icon: "receipt", target: "posting_control", dataSource: "Posting Control Queue", valueKey: "unpostedVouchers", fallbackKey: "draftVouchers", format: "number" },
  { id: "pending_approvals", label: "Pending Approvals", icon: "shield", target: "approval_queue", dataSource: "Approval Queue", valueKey: "pendingApprovals", format: "number" },
  { id: "gst_position", label: "GST Position", icon: "receipt", target: "gst", dataSource: "GST Summary Report", valueKey: "gstPayable", format: "currency" },
  { id: "tds_receivable", label: "TDS Receivable", icon: "receipt", target: "tds_register", dataSource: "TDS Register Report", valueKey: "tdsReceivable", format: "currency" },
  { id: "trial_balance_status", label: "Trial Balance", icon: "clipboard", target: "trial_balance", dataSource: "Trial Balance Report", valueKey: null, staticValue: "Balanced", format: "text" },
  { id: "day_book", label: "Day Book", icon: "book", target: "day_book", dataSource: "Day Book Report", valueKey: "postedVouchers", format: "number" },
  { id: "profit_loss", label: "Profit & Loss", icon: "trend", target: "profit_loss", dataSource: "Profit & Loss Report", valueKey: "totalProfit", format: "currency" },
  { id: "balance_sheet", label: "Balance Sheet", icon: "building", target: "balance_sheet", dataSource: "Balance Sheet Report", valueKey: null, staticValue: "Open", format: "text" }
];

const BUSINESS_DEVELOPMENT_CARDS = [
  { id: "total_orders", label: "Total Orders", icon: "clipboard", target: "supply_orders", dataSource: "Supply Orders Register", valueKey: "totalOrders", format: "number" },
  { id: "total_billing", label: "Total Billing", icon: "rupee", target: "invoices", dataSource: "Sales Register", valueKey: "totalOrderValue", format: "currency" },
  { id: "collections", label: "Collections", icon: "card", target: "cash_book", dataSource: "Receipt Register", valueKey: "amountReceived", format: "currency" },
  { id: "outstanding_receivables", label: "Outstanding Receivables", icon: "wallet", target: "bill_wise_receivables", dataSource: "Receivables Report", valueKey: "outstanding", format: "currency" },
  { id: "active_customers", label: "Active Customers", icon: "building", target: "companies", dataSource: "Company Master", valueKey: "companies", format: "number" },
  { id: "suppliers", label: "Suppliers", icon: "truck", target: "suppliers", dataSource: "Supplier Master", valueKey: "suppliers", format: "number" },
  { id: "items_catalog", label: "Items in Catalog", icon: "box", target: "items", dataSource: "Item Master", valueKey: "items", format: "number" }
];

const INVENTORY_PROCUREMENT_CARDS = [
  { id: "stock_value", label: "Stock Value", icon: "box", target: "stock_valuation", dataSource: "Stock Valuation Report", valueKey: "totalStockValue", format: "currency", nextAction: "Verify valuation by item and warehouse." },
  { id: "low_stock", label: "Low Stock Items", icon: "shield", target: "low_stock", dataSource: "Low Stock Report", valueKey: "lowStockItems", format: "number" },
  { id: "items_in_stock", label: "Items In Stock", icon: "box", target: "stock_summary", dataSource: "Stock Summary Report", valueKey: "itemsInStock", format: "number" },
  { id: "items_issued", label: "Items Issued", icon: "truck", target: "stock_ledger", dataSource: "Stock Ledger", valueKey: "itemsIssued", format: "number" },
  { id: "returns", label: "Returns", icon: "undo", target: "stock_returns", dataSource: "Stock Returns Register", valueKey: "returnedItems", format: "number" },
  { id: "pending_procurement", label: "Pending Procurement", icon: "cart", target: "pending_procurement", dataSource: "Procurement Queue", valueKey: "pendingProcurement", format: "number" },
  { id: "pending_delivery", label: "Pending Delivery", icon: "truck", target: "delivery_challans", dataSource: "Delivery Challan Register", valueKey: "pendingDeliveries", format: "number" },
  { id: "ready_for_closure", label: "Ready For Closure", icon: "clipboard", target: "operations_dashboard", dataSource: "Operations Dashboard", valueKey: "readyForClosure", format: "number" },
  { id: "orders_pending", label: "Orders Pending", icon: "clipboard", target: "supply_orders", dataSource: "Supply Orders Register", valueKey: "activeOrders", format: "number" }
];

const MANAGEMENT_INTELLIGENCE_CARDS = [
  { id: "total_billing", label: "Total Billing", icon: "rupee", target: "invoices", dataSource: "Sales Register", valueKey: "totalOrderValue", format: "currency" },
  { id: "collections", label: "Collections", icon: "card", target: "cash_book", dataSource: "Receipt Register", valueKey: "amountReceived", format: "currency" },
  { id: "net_profit", label: "Net Profit", icon: "trend", target: "profitability_reports", dataSource: "Profitability Report", valueKey: "totalProfit", format: "currency" },
  { id: "outstanding", label: "Outstanding Receivables", icon: "wallet", target: "bill_wise_receivables", dataSource: "Receivables Report", valueKey: "outstanding", format: "currency" },
  { id: "payables", label: "Supplier Payables", icon: "truck", target: "bill_wise_payables", dataSource: "Payables Report", valueKey: "supplierPayables", fallbackKey: "payables", format: "currency", nextAction: "Review bill-wise supplier dues." },
  { id: "stock_value", label: "Stock Value", icon: "box", target: "stock_valuation", dataSource: "Stock Valuation Report", valueKey: "totalStockValue", format: "currency", nextAction: "Verify valuation by item and warehouse." },
  { id: "cash_bank", label: "Cash / Bank Balance", icon: "card", target: "cash_book", reconcileTarget: "bank_book", dataSource: "Cash Book / Bank Book", valueKey: "cashBankBalance", fallbackKey: "amountReceived", format: "currency", nextAction: "Use Treasury Overview for account-wise balances." },
  { id: "gst_position", label: "GST Position", icon: "receipt", target: "gst", dataSource: "GST Summary Report", valueKey: "gstPayable", format: "currency" },
  { id: "trial_balance", label: "Trial Balance", icon: "clipboard", target: "trial_balance", dataSource: "Trial Balance Report", valueKey: null, staticValue: "Balanced", format: "text" },
  { id: "active_orders", label: "Active Orders", icon: "clipboard", target: "supply_orders", dataSource: "Supply Orders Register", valueKey: "activeOrders", format: "number" },
  { id: "unposted", label: "Unposted Vouchers", icon: "receipt", target: "posting_control", dataSource: "Posting Control", valueKey: "unpostedVouchers", fallbackKey: "draftVouchers", format: "number" }
];

const CUSTOM_CARDS = [];

export const MODE_CARDS = {
  executive: EXECUTIVE_CARDS,
  operations: OPERATIONS_CARDS,
  accounts: ACCOUNTS_CARDS,
  business_development: BUSINESS_DEVELOPMENT_CARDS,
  inventory_procurement: INVENTORY_PROCUREMENT_CARDS,
  management_intelligence: MANAGEMENT_INTELLIGENCE_CARDS,
  custom: CUSTOM_CARDS
};

export const MODE_DEFAULT_VISIBLE = {
  executive: EXECUTIVE_CARDS.map((c) => c.id).filter((id) => !["companies", "suppliers", "items"].includes(id)),
  operations: OPERATIONS_CARDS.map((c) => c.id),
  accounts: ACCOUNTS_CARDS.map((c) => c.id).filter((id) => !["profit_loss", "balance_sheet"].includes(id)),
  business_development: BUSINESS_DEVELOPMENT_CARDS.map((c) => c.id),
  inventory_procurement: INVENTORY_PROCUREMENT_CARDS.map((c) => c.id),
  management_intelligence: MANAGEMENT_INTELLIGENCE_CARDS.map((c) => c.id),
  custom: []
};

export const CARD_FORMATTERS = {
  currency: "formatCurrency",
  number: "identity",
  text: "identity"
};
