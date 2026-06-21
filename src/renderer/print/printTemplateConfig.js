const PRINT_TEMPLATE_OPTIONS = [
  { key: "screen_snapshot", label: "Screen Snapshot", views: ["*"], description: "Print the current loaded screen exactly as previewed." },
  { key: "sales_invoice", label: "Sales Invoice", views: ["invoices"], description: "Certified tax invoice template from loaded billing data." },
  { key: "credit_note", label: "Credit Note", views: ["business_credit_note", "invoices", "billing_pending"], description: "Credit note print from billing correction data." },
  { key: "debit_note", label: "Debit Note", views: ["business_debit_note", "procurements"], description: "Debit note print from procurement correction data." },
  { key: "delivery_challan", label: "Delivery Challan", views: ["delivery_challans", "invoices", "stock_outward"], description: "Delivery challan template from loaded dispatch/order data." },
  { key: "receipt_voucher", label: "Receipt Voucher", views: ["business_receipt_voucher", "voucher_dashboard", "payments", "receivables"], description: "Receipt voucher print layout." },
  { key: "payment_voucher", label: "Payment Voucher", views: ["business_supplier_payment_voucher", "voucher_dashboard", "payments", "payables"], description: "Payment voucher print layout." },
  { key: "purchase_voucher", label: "Purchase Voucher", views: ["business_purchase_voucher", "voucher_dashboard", "procurements"], description: "Purchase voucher print layout." },
  { key: "journal_voucher", label: "Journal Voucher", views: ["business_journal_voucher", "manual_voucher", "voucher_dashboard", "voucher_register"], description: "Journal voucher print layout." },
  { key: "stock_report", label: "Stock Report", views: ["stock_summary", "stock_ledger", "inventory_movements", "low_stock", "inventory_register"], description: "Inventory report print layout." },
  { key: "gst_report", label: "GST Report", views: ["gst", "gst_register", "gst_summary", "tds_register", "reports"], description: "GST report print layout." }
];

function getPrintTemplateOptionsForView(view) {
  const safeView = String(view || "");
  const matched = PRINT_TEMPLATE_OPTIONS.filter((template) => template.views.includes("*") || template.views.includes(safeView));
  return matched.length ? matched : PRINT_TEMPLATE_OPTIONS.filter((template) => template.key === "screen_snapshot");
}

function getPrintTemplateLabel(templateKey) {
  return PRINT_TEMPLATE_OPTIONS.find((template) => template.key === templateKey)?.label || "Screen Snapshot";
}

export { PRINT_TEMPLATE_OPTIONS, getPrintTemplateLabel, getPrintTemplateOptionsForView };
