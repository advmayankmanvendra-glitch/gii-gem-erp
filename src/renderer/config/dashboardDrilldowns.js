export const WIDGET_DRILLDOWNS = {
  billing_this_month: {
    widgetId: "billing_this_month",
    label: "Billing This Month",
    drilldownView: "billing_drilldown",
    sourceTables: ["invoices", "vouchers"],
    contextFilters: ["company_id", "date_from", "date_to"],
    explanationText: "Shows all invoices raised during the selected period with GST, receipt status, and outstanding balance.",
    emptyStateMessage: "No invoices raised in the selected period.",
    allowedActions: []
  },
  collections_this_month: {
    widgetId: "collections_this_month",
    label: "Collections This Month",
    drilldownView: "collections_drilldown",
    sourceTables: ["payments", "cash_bank_ledger"],
    contextFilters: ["company_id", "date_from", "date_to"],
    explanationText: "Shows all receipts collected during the selected period with mode, allocation status, and linked invoices.",
    emptyStateMessage: "No receipts collected in the selected period.",
    allowedActions: []
  },
  receivables: {
    widgetId: "receivables",
    label: "Outstanding Receivables",
    drilldownView: "receivables_drilldown",
    sourceTables: ["receivables", "invoices", "bill_wise_receivables"],
    contextFilters: ["company_id"],
    explanationText: "Shows bill-wise outstanding invoices with ageing buckets and overdue days.",
    emptyStateMessage: "No outstanding receivables.",
    allowedActions: []
  },
  net_profit: {
    widgetId: "net_profit",
    label: "Net Profit",
    drilldownView: "profit_drilldown",
    sourceTables: ["supply_orders", "invoices", "procurements", "order_items", "expense_entries"],
    contextFilters: ["company_id"],
    explanationText: "Shows order-wise profitability including revenue, costs, GST impact, and net profit.",
    emptyStateMessage: "No profitability data available for the selected period.",
    allowedActions: []
  },
  orders_pending: {
    widgetId: "orders_pending",
    label: "Orders Pending",
    drilldownView: "orders_drilldown",
    sourceTables: ["supply_orders"],
    contextFilters: ["company_id"],
    explanationText: "Shows open supply orders with current lifecycle stage, pending reason, and days pending.",
    emptyStateMessage: "No pending orders.",
    allowedActions: []
  },
  cash_bank_balance: {
    widgetId: "cash_bank_balance",
    label: "Cash / Bank Balance",
    drilldownView: "treasury_drilldown",
    sourceTables: ["cash_bank_ledger", "banks"],
    contextFilters: ["company_id"],
    explanationText: "Shows cash and bank account balances with book balance, unreconciled difference, and recent transactions.",
    emptyStateMessage: "No cash or bank accounts configured.",
    allowedActions: []
  },
  gst_position: {
    widgetId: "gst_position",
    label: "GST Position",
    drilldownView: "gst_drilldown",
    sourceTables: ["gst_register", "invoices", "procurements"],
    contextFilters: ["company_id", "date_from", "date_to"],
    explanationText: "Shows output GST, input GST, net GST payable, and reconciliation status for the period.",
    emptyStateMessage: "No GST data available for the selected period.",
    allowedActions: []
  },
  stock_value: {
    widgetId: "stock_value",
    label: "Stock Value",
    drilldownView: "stock_drilldown",
    sourceTables: ["stock_ledger", "items", "warehouses"],
    contextFilters: ["company_id"],
    explanationText: "Shows item-wise stock quantity, rate, value, valuation method, and low/negative stock status.",
    emptyStateMessage: "No stock data available.",
    allowedActions: []
  },
  trial_balance_status: {
    widgetId: "trial_balance_status",
    label: "Trial Balance",
    drilldownView: "trial_balance_drilldown",
    sourceTables: ["accounts", "ledger_entries"],
    contextFilters: ["company_id", "date_from", "date_to"],
    explanationText: "Shows ledger-wise debit and credit balances with opening, closing, and difference status.",
    emptyStateMessage: "No trial balance data available.",
    allowedActions: []
  },
  unposted_vouchers: {
    widgetId: "unposted_vouchers",
    label: "Unposted Vouchers",
    drilldownView: "unposted_drilldown",
    sourceTables: ["guided_vouchers", "vouchers"],
    contextFilters: ["company_id"],
    explanationText: "Shows vouchers pending posting or review with type, amount, status, and required action.",
    emptyStateMessage: "No unposted vouchers.",
    allowedActions: []
  }
};

export function getDrilldownView(widgetId) {
  return WIDGET_DRILLDOWNS[widgetId] || null;
}
