export const dashboardModeLabels = {
  executive: "Executive",
  operations: "Operations",
  accounts: "Accounts"
};

export const dashboardDefaultVisible = {
  executive: ["orders_pending", "billing_this_month", "collections_this_month", "receivables", "payables", "net_profit", "stock_value", "critical_alerts"],
  operations: ["orders_received", "pending_procurement", "pending_supply", "pending_billing", "pending_documents", "ready_for_closure", "low_stock", "pending_delivery"],
  accounts: ["cash_bank_balance", "receivables", "payables", "unposted_vouchers", "pending_approvals", "gst_position", "tds_receivable", "trial_balance_status"]
};
