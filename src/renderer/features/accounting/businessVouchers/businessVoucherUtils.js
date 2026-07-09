export function voucherPlainLanguage(kind) {
  const notes = {
    receipt: "Match department receipts against open invoices and statutory deductions.",
    supplier_payment: "Match supplier payments against open purchase bills.",
    sales: "Create a sales receivable with output GST from an order context.",
    purchase: "Book purchase/inventory payable with input GST from order requirements.",
    expense: "Book order-linked operating expenses as payable or paid.",
    commission: "Calculate and book work incentive expense from billing value.",
    employee_incentive: "Calculate and book employee incentive from initial profit.",
    contra: "Move money between cash and bank ledgers.",
    credit_note: "Reduce a department invoice and related GST/sales values.",
    debit_note: "Reduce or adjust supplier payable and related GST/purchase values."
  };
  return notes[kind] || "Guided business voucher entry.";
}

export function voucherTooltips(kind) {
  const common = [
    { label: "Outstanding", text: "Unpaid balance still pending against an invoice or bill." },
    { label: "Receivable", text: "Money recoverable from a department/customer." },
    { label: "Payable", text: "Money payable to a supplier or party." }
  ];
  const byKind = {
    receipt: [
      { label: "TDS", text: "Income tax deducted by the department from your bill." },
      { label: "GST TDS", text: "GST tax deducted by a government buyer before releasing payment." },
      { label: "Advance Adjusted", text: "Earlier receipt applied against this invoice." }
    ],
    commission: [{ label: "Work Incentive %", text: "Percentage of billing value used to calculate work incentive expense." }],
    employee_incentive: [{ label: "Incentive %", text: "Percentage of initial profit payable to the assigned employee." }],
    credit_note: [{ label: "Credit Note", text: "Use to reduce an already raised sales invoice." }],
    debit_note: [{ label: "Debit Note", text: "Use to reduce or adjust an already booked supplier bill." }],
    contra: [{ label: "Contra", text: "Cash/bank transfer only, not a sale receipt or supplier payment." }],
    expense: [{ label: "Expense Payable", text: "Expense booked now but paid later through a payment voucher." }],
    sales: [{ label: "GST Impact", text: "Output GST created on taxable billing value." }],
    purchase: [{ label: "GST Impact", text: "Input GST booked from a supplier purchase bill." }]
  };
  return [...(byKind[kind] || []), ...common].slice(0, 5);
}

export function businessVoucherValidationMessages({ form, selectedInvoice, selectedPurchaseBill, selectedOrder, previewLines }) {
  const messages = [];
  const kind = form.voucher_kind;
  const amount = Number(form.amount || 0);
  const tds = Number(form.tds_deducted || 0);
  const gstTds = Number(form.gst_tds_deducted || 0);
  const other = Number(form.other_deduction || 0);
  const taxable = Number(form.taxable_value || 0);
  const gst = Number(form.gst_amount || (taxable * Number(form.gst_rate || 0) / 100));
  const invoiceBalance = Number(selectedInvoice?.balance_outstanding || 0);
  const purchaseBalance = Number(selectedPurchaseBill?.balance_due || selectedPurchaseBill?.balance_outstanding || 0);
  const orderQuantity = Number(selectedOrder?.order_quantity || selectedOrder?.quantity || 0);
  if (kind === "receipt" && selectedInvoice && amount + tds + gstTds + other > invoiceBalance && !form.authorize_excess) {
    messages.push({ severity: "error", message: "Receipt allocation cannot exceed invoice outstanding unless excess is authorized." });
  }
  if (kind === "supplier_payment" && selectedPurchaseBill && amount > purchaseBalance && !form.authorize_excess) {
    messages.push({ severity: "error", message: "Supplier payment allocation cannot exceed payable unless excess is authorized." });
  }
  if (kind === "credit_note" && selectedInvoice && taxable + gst > invoiceBalance && !form.authorize_excess) {
    messages.push({ severity: "error", message: "Credit note cannot exceed original invoice outstanding." });
  }
  if (kind === "credit_note" && !form.linked_invoice_id) {
    messages.push({ severity: "error", message: "Credit note must be linked to the original invoice being corrected." });
  }
  if (kind === "credit_note" && taxable <= 0) {
    messages.push({ severity: "error", message: "Credit note taxable value must be greater than zero." });
  }
  if (kind === "debit_note" && selectedPurchaseBill && taxable + gst > purchaseBalance && !form.authorize_excess) {
    messages.push({ severity: "error", message: "Debit note cannot exceed original purchase bill balance." });
  }
  if (kind === "debit_note" && !form.linked_purchase_id) {
    messages.push({ severity: "error", message: "Debit note must be linked to the original supplier purchase bill being corrected." });
  }
  if (kind === "debit_note" && taxable <= 0) {
    messages.push({ severity: "error", message: "Debit note taxable value must be greater than zero." });
  }
  if (["credit_note", "debit_note"].includes(kind) && !form.reason_code) {
    messages.push({ severity: "error", message: "Select a correction reason before saving the note." });
  }
  if (["credit_note", "debit_note"].includes(kind) && (form.reason_code === "Other" || form.authorize_excess) && !String(form.narration || "").trim()) {
    messages.push({ severity: "error", message: "Enter narration explaining the correction reason." });
  }
  if (kind === "expense" && form.paid_status === "paid" && !form.bank_account_id) {
    messages.push({ severity: "error", message: "Paid expense requires a bank or cash account." });
  }
  if (kind === "expense" && form.paid_status === "unpaid" && form.bank_account_id) {
    messages.push({ severity: "info", message: "Unpaid expense will book an expense payable; bank account is not required." });
  }
  if (["sales", "purchase"].includes(kind) && selectedOrder && orderQuantity > 0 && Number(form.quantity || 0) > orderQuantity && !form.authorize_excess) {
    messages.push({ severity: "error", message: kind === "sales" ? "Sales quantity cannot exceed order balance unless excess billing is authorized." : "Purchase quantity cannot exceed required quantity unless authorized." });
  }
  if (kind === "sales" && form.inventory_enabled === "1" && Number(form.quantity || 0) > 0) {
    if (!form.order_id) messages.push({ severity: "error", message: "Sales stock issue requires a linked supply order. Use accounting-only posting if no order exists yet." });
    if (!form.item_id) messages.push({ severity: "error", message: "Sales stock issue requires an item." });
    if (!form.warehouse_id) messages.push({ severity: "error", message: "Sales stock issue requires a warehouse." });
  }
  const debit = previewLines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credit = previewLines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  if (previewLines.length && Math.round(debit * 100) !== Math.round(credit * 100)) {
    messages.push({ severity: "error", message: "Accounting preview is not balanced. Review voucher values before saving." });
  }
  return messages;
}

export function businessVoucherPreview(form) {
  const kind = form.voucher_kind;
  const amount = Number(form.amount || 0);
  const taxable = Number(form.taxable_value || form.billing_value || form.purchase_value || 0);
  const gst = Number(form.gst_amount || (taxable * Number(form.gst_rate || 0) / 100));
  const tds = Number(form.tds_deducted || 0);
  const gstTds = Number(form.gst_tds_deducted || 0);
  const other = Number(form.other_deduction || 0);
  const paid = form.paid_status === "paid";
  if (kind === "receipt" && (amount || tds || gstTds || other)) return [
    { account: form.payment_mode === "Cash" ? "Cash" : "Bank", debit: amount, credit: 0 },
    { account: "TDS Receivable", debit: tds, credit: 0 },
    { account: "GST TDS Receivable", debit: gstTds, credit: 0 },
    { account: "Other Deduction Ledger", debit: other, credit: 0 },
    { account: "Trade Receivables", debit: 0, credit: amount + tds + gstTds + other }
  ].filter((line) => line.debit || line.credit);
  if (kind === "supplier_payment" && amount) return [
    { account: "Trade Payables", debit: amount, credit: 0 },
    { account: form.payment_mode === "Cash" ? "Cash" : "Bank", debit: 0, credit: amount }
  ];
  if (kind === "sales" && taxable) return [
    { account: "Trade Receivables", debit: taxable + gst, credit: 0 },
    { account: "Sales", debit: 0, credit: taxable },
    { account: "Output GST", debit: 0, credit: gst }
  ];
  if (kind === "purchase" && taxable) return [
    { account: form.inventory_enabled === "1" ? "Inventory" : "Purchase", debit: taxable, credit: 0 },
    { account: "Input GST", debit: gst, credit: 0 },
    { account: "Trade Payables", debit: 0, credit: taxable + gst }
  ];
  if (kind === "expense" && amount) return [
    { account: `${form.expense_head_name} Expense`, debit: amount, credit: 0 },
    { account: paid ? (form.payment_mode === "Cash" ? "Cash" : "Bank") : "Expense Payable", debit: 0, credit: amount }
  ];
  if (kind === "commission" && Number(form.billing_value || 0)) {
    const commission = Number(form.billing_value || 0) * Number(form.commission_percentage || 0) / 100;
    return [
      { account: "Work Incentive Expense", debit: commission, credit: 0 },
      { account: paid ? (form.payment_mode === "Cash" ? "Cash" : "Bank") : "Expense Payable", debit: 0, credit: commission }
    ];
  }
  if (kind === "employee_incentive" && Number(form.initial_profit || 0)) {
    const incentive = Number(form.initial_profit || 0) * Number(form.incentive_percentage || 0) / 100;
    return [
      { account: "Employee Incentive Expense", debit: incentive, credit: 0 },
      { account: paid ? (form.payment_mode === "Cash" ? "Cash" : "Bank") : "Employee Incentive Payable", debit: 0, credit: incentive }
    ];
  }
  if (kind === "contra" && amount) return [
    { account: "Receiving Cash/Bank Account", debit: amount, credit: 0 },
    { account: "Paying Cash/Bank Account", debit: 0, credit: amount }
  ];
  if (kind === "credit_note" && taxable) return [
    { account: "Sales", debit: taxable, credit: 0 },
    { account: "Output GST", debit: gst, credit: 0 },
    { account: "Trade Receivables", debit: 0, credit: taxable + gst }
  ];
  if (kind === "debit_note" && taxable) return [
    { account: "Trade Payables", debit: taxable + gst, credit: 0 },
    { account: "Purchase", debit: 0, credit: taxable },
    { account: "Input GST", debit: 0, credit: gst }
  ];
  return [];
}
