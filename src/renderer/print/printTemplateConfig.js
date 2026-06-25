const SCREEN_SNAPSHOT_TEMPLATE = { key: "screen_snapshot", label: "Screen Snapshot (Internal Fallback)", views: ["*"], description: "Print the current loaded screen exactly as previewed." };

const PRINT_TEMPLATE_OPTIONS = [
  SCREEN_SNAPSHOT_TEMPLATE,
  { key: "sales_invoice", label: "GST Invoice", views: ["invoices", "business_sales_voucher", "billing_pending"], description: "Certified tax invoice template from loaded billing data." },
  { key: "invoice_working_sheet", label: "Invoice Working Sheet", views: ["invoices", "business_sales_voucher", "billing_pending"], description: "Internal invoice calculation and receivable working sheet." },
  { key: "document_checklist", label: "Document Checklist", views: ["invoices", "billing_pending", "order_documents", "invoice_documents", "payment_documents", "missing_documents"], description: "Document readiness and missing evidence checklist." },
  { key: "profitability_sheet", label: "Profitability Sheet", views: ["invoices", "billing_pending", "order_profitability", "profitability_reports"], description: "Internal profitability review sheet from loaded order data." },
  { key: "credit_note", label: "Credit Note", views: ["business_credit_note", "invoices", "billing_pending"], description: "Credit note print from billing correction data." },
  { key: "debit_note", label: "Debit Note", views: ["business_debit_note", "procurements"], description: "Debit note print from procurement correction data." },
  { key: "delivery_challan", label: "Delivery Challan", views: ["delivery_challans", "invoices", "stock_outwards", "stock_outward"], description: "Delivery challan template from loaded dispatch/order data." },
  { key: "grn", label: "Goods Receipt Note", views: ["grn_report", "grn_status", "stock_inwards", "stock_inward", "procurements", "purchase_bills"], description: "GRN template from loaded stock receipt or procurement data." },
  { key: "outstanding_receivable", label: "Outstanding Receivable", views: ["receivables", "bill_wise_receivables", "receivable_ageing", "bill_outstanding", "outstanding_reports"], description: "Bill-wise receivable outstanding print layout." },
  { key: "outstanding_payable", label: "Outstanding Payable", views: ["payables", "bill_wise_payables", "payable_ageing", "bill_outstanding", "outstanding_reports"], description: "Bill-wise payable outstanding print layout." },
  { key: "receipt_voucher", label: "Receipt Voucher", views: ["business_receipt_voucher", "voucher_dashboard", "payments", "payment_allocations", "receipt_allocation_workflow"], description: "Receipt voucher print layout." },
  { key: "payment_voucher", label: "Payment Voucher", views: ["business_supplier_payment_voucher", "voucher_dashboard", "payments", "supplier_payment_allocations", "supplier_allocation_workflow"], description: "Payment voucher print layout." },
  { key: "purchase_voucher", label: "Purchase Voucher", views: ["business_purchase_voucher", "voucher_dashboard", "procurements", "purchase_bills"], description: "Purchase voucher print layout." },
  { key: "journal_voucher", label: "Journal Voucher", views: ["business_journal_voucher", "manual_voucher", "voucher_dashboard", "voucher_register", "day_book"], description: "Journal voucher print layout." },
  { key: "ledger", label: "Ledger Statement", views: ["ledger_view", "party_ledger", "department_ledger", "supplier_ledger", "cash_bank_ledger", "cash_book", "bank_book", "day_book"], description: "Ledger statement print layout." },
  { key: "trial_balance", label: "Trial Balance", views: ["trial_balance", "reports"], description: "Trial balance financial statement print layout." },
  { key: "profit_loss", label: "Profit & Loss", views: ["profit_loss", "reports"], description: "Profit and loss financial statement print layout." },
  { key: "balance_sheet", label: "Balance Sheet", views: ["balance_sheet", "reports"], description: "Balance sheet financial statement print layout." },
  { key: "stock_report", label: "Stock Summary / Inventory Report", views: ["stock_summary", "stock_ledger", "stock_movement", "inventory_movements", "low_stock", "inventory_register", "stock_valuation"], description: "Inventory report print layout." },
  { key: "gst_report", label: "GST / TDS Report", views: ["gst", "gst_register", "gst_summary", "gst_reports", "tds_register", "reports"], description: "GST and TDS report print layout." }
];

function getPrintTemplateOptionsForView(view) {
  const safeView = String(view || "");
  const matched = PRINT_TEMPLATE_OPTIONS.filter((template) => template.key !== "screen_snapshot" && template.views.includes(safeView));
  return matched.length ? [...matched, SCREEN_SNAPSHOT_TEMPLATE] : [SCREEN_SNAPSHOT_TEMPLATE];
}

function getPrintTemplateLabel(templateKey) {
  return PRINT_TEMPLATE_OPTIONS.find((template) => template.key === templateKey)?.label || "Screen Snapshot";
}

export { PRINT_TEMPLATE_OPTIONS, getPrintTemplateLabel, getPrintTemplateOptionsForView };
