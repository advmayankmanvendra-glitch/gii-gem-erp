import { formatCurrency, formatNumber } from "../../utils/formatters.js";

export function documentChecklistColumns() {
  return [
    ["order_number", "Order"],
    ["department_name", "Department"],
    ["document_type", "Document"],
    ["status", "Status"],
    ["warning", "Warning"]
  ];
}

export function operationDisplay(value) {
  if (value === null || value === undefined) return "Unlinked";
  const text = String(value).trim();
  if (!text || text === "-") return "Unlinked";
  return value;
}

export function buildOperationsAttentionRows(data) {
  const rows = [
    ...data.pendingProcurement.map((row) => normalizeOperationsQueueRow(row, "Pending Procurement", data)),
    ...data.pendingBilling.map((row) => normalizeOperationsQueueRow(row, "Pending Billing", data)),
    ...data.pendingPayment.map((row) => normalizeOperationsQueueRow(row, "Pending Payment", data)),
    ...data.missingDocuments.map((row) => normalizeOperationsQueueRow(row, "Missing Document", data)),
    ...data.postingErrors.map((row) => normalizeOperationsQueueRow(row, "Posting Error", data))
  ];
  const readyRows = (data.lifecycle || [])
    .map((row) => normalizeOperationsQueueRow(row, "Ready For Closure", data))
    .filter((row) => row.is_ready_for_closure);
  return [...rows, ...readyRows];
}

export function normalizeOperationsQueueRow(row, attention, data) {
  const links = resolveOperationsLinks(row, data);
  const amount = row.amount_text || row.outstanding_text || row.invoice_text || row.purchase_text || row.billing_text || row.gross_text || formatCurrency(row.amount || row.invoice_amount || row.purchase_value || row.balance_outstanding || 0);
  const status = row.status_text || row.status || row.posting_status || row.order_status || row.procurement_status || attention;
  const intelligence = buildOperationsIntelligence({ ...row, attention }, data);
  return {
    ...row,
    attention,
    order_number_display: links.order?.order_number || row.order_number || "Unlinked",
    department_name_display: row.department_name || links.invoice?.department_name || links.order?.department_name || "Unlinked",
    invoice_number_display: row.invoice_number || links.invoice?.invoice_number || "Unlinked",
    amount_display: amount,
    status_display: status,
    attention_reason: intelligence.attentionReason,
    recommended_action: intelligence.recommendedAction,
    health_score: intelligence.healthScore.score,
    has_critical_issue: intelligence.exceptions.some((item) => item.severity === "Critical"),
    has_missing_documents: intelligence.exceptions.some((item) => item.code?.startsWith("missing_document")),
    is_pending_billing: intelligence.timeline.some((step) => step.key === "billing_completed" && step.status !== "Completed"),
    is_pending_collection: intelligence.timeline.some((step) => step.key === "receipt_allocation_completed" && step.status !== "Completed"),
    is_ready_for_closure: intelligence.closure.ready
  };
}

export function filterOperationsAttentionRows(rows, filter) {
  if (!filter || filter === "all") return rows;
  const checks = {
    critical: (row) => row.has_critical_issue,
    missing_documents: (row) => row.has_missing_documents,
    pending_billing: (row) => row.is_pending_billing,
    pending_collection: (row) => row.is_pending_collection,
    ready_for_closure: (row) => row.is_ready_for_closure
  };
  return rows.filter(checks[filter] || (() => true));
}

export function buildOperationsDashboardInsights(rows) {
  return [
    {
      key: "critical",
      label: "Orders With Critical Issues",
      value: countUniqueOperationOrders(rows, (row) => row.has_critical_issue),
      note: "Blocking exceptions"
    },
    {
      key: "missing_documents",
      label: "Orders Missing Documents",
      value: countUniqueOperationOrders(rows, (row) => row.has_missing_documents),
      note: "Checklist incomplete"
    },
    {
      key: "pending_billing",
      label: "Orders Pending Billing",
      value: countUniqueOperationOrders(rows, (row) => row.is_pending_billing),
      note: "Invoice action needed"
    },
    {
      key: "pending_collection",
      label: "Orders Pending Collection",
      value: countUniqueOperationOrders(rows, (row) => row.is_pending_collection),
      note: "Receipt allocation pending"
    },
    {
      key: "ready_for_closure",
      label: "Orders Ready For Closure",
      value: countUniqueOperationOrders(rows, (row) => row.is_ready_for_closure),
      note: "No blocking gaps"
    }
  ];
}

export function countUniqueOperationOrders(rows, predicate) {
  const keys = new Set();
  rows.filter(predicate).forEach((row, index) => {
    keys.add(operationDisplay(row.order_number_display) === "Unlinked" ? `row-${row.id || row.key || index}` : row.order_number_display);
  });
  return keys.size;
}

export function resolveOperationsLinks(row, data) {
  const invoices = data.invoices || [];
  const orders = data.orders || [];
  const procurements = data.procurements || data.purchaseBills || [];
  const invoice = invoices.find((item) => (
    idsMatch(item.id, row.billing_id || row.invoice_id)
    || sameText(item.invoice_number, row.invoice_number)
    || (row.table_name === "invoices" && idsMatch(item.id, row.record_id))
  )) || null;
  const procurement = procurements.find((item) => (
    idsMatch(item.id, row.procurement_id)
    || sameText(item.purchase_invoice_number, row.purchase_invoice_number || row.purchase_bill)
    || (row.table_name === "procurements" && idsMatch(item.id, row.record_id))
  )) || null;
  const order = orders.find((item) => (
    idsMatch(item.id, row.order_id || invoice?.order_id || procurement?.order_id)
    || sameText(item.order_number, row.order_number)
  )) || null;
  return { order, invoice, procurement };
}

export function idsMatch(left, right) {
  return left !== null && left !== undefined && right !== null && right !== undefined && Number(left) === Number(right);
}

export function sameText(left, right) {
  return Boolean(left && right && String(left).trim().toLowerCase() === String(right).trim().toLowerCase());
}

export function buildOperationsIntelligence(row, data) {
  const context = buildOperationsContext(row, data);
  const timeline = buildOperationalStatusTimeline(context);
  const exceptions = buildOperationalExceptions(context, timeline, row);
  const closure = buildOrderClosureReadiness(context, exceptions, timeline);
  const healthScore = calculateOperationalHealthScore(exceptions, closure);
  const recommendedAction = recommendNextOperationalAction(timeline, exceptions, closure);
  const attentionReason = deriveOperationalAttentionReason(row, exceptions, timeline);
  const auditSignals = buildOperationalAuditSignals(exceptions, closure, healthScore);
  return { context, timeline, exceptions, closure, healthScore, recommendedAction, attentionReason, auditSignals };
}

export function buildOperationsContext(row, data) {
  const links = resolveOperationsLinks(row, data);
  const order = links.order;
  const invoice = links.invoice;
  const procurement = links.procurement;
  const orderId = order?.id || row.order_id || invoice?.order_id || procurement?.order_id;
  const invoiceId = invoice?.id || row.billing_id || row.invoice_id;
  const procurementId = procurement?.id || row.procurement_id;
  const orderNumber = order?.order_number || row.order_number || invoice?.order_number || procurement?.order_number;
  const voucherIds = new Set([
    row.voucher_id,
    invoice?.voucher_id,
    procurement?.voucher_id,
    ...((data.vouchers || []).filter((voucher) => (
      (invoiceId && voucher.source_module === "billing" && idsMatch(voucher.source_id, invoiceId))
      || (procurementId && voucher.source_module === "procurement" && idsMatch(voucher.source_id, procurementId))
      || (row.record_id && row.table_name && idsMatch(voucher.source_id, row.record_id))
    )).map((voucher) => voucher.id))
  ].filter(Boolean));

  const orderDetails = [
    ...((order ? [order] : [])),
    ...(data.orderItems || []).filter((item) => idsMatch(item.order_id, orderId))
  ];
  const procurementDetails = (data.purchaseBills || []).filter((item) => (
    idsMatch(item.order_id, orderId)
    || idsMatch(item.id, procurementId)
    || sameText(item.order_number, orderNumber)
  ));
  const billingDetails = (data.invoices || []).filter((item) => (
    idsMatch(item.order_id, orderId)
    || idsMatch(item.id, invoiceId)
    || sameText(item.order_number, orderNumber)
  ));
  const receiptAllocation = [
    ...(data.receivables || []).filter((item) => idsMatch(item.order_id, orderId) || idsMatch(item.billing_id, invoiceId) || sameText(item.invoice_number, invoice?.invoice_number || row.invoice_number)),
    ...(data.paymentAllocations || []).filter((item) => idsMatch(item.order_id, orderId) || idsMatch(item.billing_id, invoiceId))
  ];
  const supplierAllocation = (data.supplierPaymentAllocations || []).filter((item) => (
    idsMatch(item.order_id, orderId)
    || idsMatch(item.procurement_id, procurementId)
    || sameText(item.purchase_invoice_number, procurement?.purchase_invoice_number || row.purchase_invoice_number || row.purchase_bill)
  ));
  const ledgerEntries = (data.ledger || []).filter((item) => voucherIds.has(item.voucher_id));
  const auditTrail = (data.auditLog || []).filter((item) => (
    voucherIds.has(item.record_id) && item.table_name === "vouchers"
  ) || (
    orderId && item.table_name === "supply_orders" && idsMatch(item.record_id, orderId)
  ) || (
    invoiceId && item.table_name === "invoices" && idsMatch(item.record_id, invoiceId)
  ) || (
    procurementId && item.table_name === "procurements" && idsMatch(item.record_id, procurementId)
  ));
  const documentChecklist = (data.documentChecklist || []).filter((item) => sameText(item.order_number, orderNumber) || idsMatch(item.order_id, orderId));
  const stockReceipts = (data.stockLedger || []).filter((item) => idsMatch(item.order_id, orderId) && Number(item.inward_quantity || 0) > 0);
  const stockIssues = (data.stockLedger || []).filter((item) => idsMatch(item.order_id, orderId) && Number(item.outward_quantity || 0) > 0);
  const reservations = (data.reservations || []).filter((item) => idsMatch(item.order_id, orderId));
  const grnRows = (data.grnRows || []).filter((item) => (
    sameText(item.purchase_bill, procurement?.purchase_invoice_number || row.purchase_invoice_number || row.purchase_bill)
    || sameText(item.order_number, orderNumber)
  ));
  const profitabilityRows = (data.profitability || []).filter((item) => idsMatch(item.order_id, orderId) || sameText(item.order_number, orderNumber));
  const expenseRows = (data.expensePosting || []).filter((item) => idsMatch(item.order_id, orderId) || sameText(item.order_number, orderNumber));
  const receivableRows = (data.receivables || []).filter((item) => idsMatch(item.order_id, orderId) || idsMatch(item.billing_id, invoiceId) || sameText(item.invoice_number, invoice?.invoice_number || row.invoice_number));
  const payableRows = (data.payables || []).filter((item) => idsMatch(item.order_id, orderId) || idsMatch(item.procurement_id, procurementId) || sameText(item.purchase_invoice_number, procurement?.purchase_invoice_number || row.purchase_invoice_number || row.purchase_bill));

  return {
    row, data, order, invoice, procurement,
    orderId, invoiceId, procurementId, orderNumber, voucherIds,
    orderDetails, procurementDetails, billingDetails,
    receiptAllocation, supplierAllocation, ledgerEntries, auditTrail,
    documentChecklist, stockReceipts, stockIssues, reservations, grnRows,
    profitabilityRows, expenseRows, receivableRows, payableRows
  };
}

export function buildOperationalStatusTimeline(context) {
  const orderClosed = /closed/i.test(context.order?.order_status || "");
  const procurementDone = context.procurementDetails.some((item) => /completed|posted|received|closed/i.test(item.procurement_status || item.posting_status || ""));
  const grnDone = context.grnRows.some((item) => /posted|confirmed|fully received|completed/i.test(item.status || ""));
  const receiptDone = context.receivableRows.some((item) => Number(item.balance_outstanding || 0) <= 0) || context.receiptAllocation.some((item) => Number(item.allocated_amount || 0) > 0);
  const supplierPaymentDone = context.payableRows.some((item) => Number(item.balance_due || 0) <= 0) || context.supplierAllocation.some((item) => Number(item.allocated_amount || 0) > 0);

  return [
    timelineStep("order_created", "Order Created", context.order ? "Completed" : "Missing", context.order?.order_date || context.order?.created_at),
    timelineStep("procurement_completed", "Procurement Completed", procurementDone ? "Completed" : context.procurementDetails.length ? "In Progress" : "Pending", context.procurementDetails[0]?.purchase_invoice_number),
    timelineStep("grn_completed", "GRN Completed", grnDone ? "Completed" : context.grnRows.length ? "In Progress" : "Missing", context.grnRows[0]?.purchase_bill),
    timelineStep("stock_receipt_completed", "Stock Receipt Completed", context.stockReceipts.length ? "Completed" : context.procurementDetails.length ? "Pending" : "Missing", context.stockReceipts.length ? `${context.stockReceipts.length} receipt row(s)` : ""),
    timelineStep("stock_reserved", "Stock Reserved", context.reservations.length ? "Completed" : context.order ? "Pending" : "Missing", context.reservations.length ? `${context.reservations.length} reservation(s)` : ""),
    timelineStep("stock_issued", "Stock Issued", context.stockIssues.length ? "Completed" : context.billingDetails.length ? "Critical Pending" : "Pending", context.stockIssues.length ? `${context.stockIssues.length} issue row(s)` : ""),
    timelineStep("billing_completed", "Billing Completed", context.billingDetails.length ? "Completed" : context.order ? "Pending" : "Missing", context.billingDetails[0]?.invoice_number),
    timelineStep("receipt_allocation_completed", "Receipt Allocation Completed", receiptDone ? "Completed" : context.billingDetails.length ? "Pending" : "Missing", context.receiptAllocation[0]?.payment_reference),
    timelineStep("supplier_payment_completed", "Supplier Payment Completed", supplierPaymentDone ? "Completed" : context.procurementDetails.length ? "Pending" : "Missing", context.supplierAllocation[0]?.payment_reference),
    timelineStep("profitability_calculated", "Profitability Calculated", context.profitabilityRows.length ? "Completed" : context.billingDetails.length ? "Pending" : "Missing", context.profitabilityRows[0]?.netCompanyProfit !== undefined ? formatCurrency(context.profitabilityRows[0].netCompanyProfit) : ""),
    timelineStep("order_closed", "Order Closed", orderClosed ? "Completed" : "Pending", context.order?.order_status)
  ];
}

export function timelineStep(key, label, status, note = "") {
  const iconMap = {
    Completed: "\u2713",
    Pending: "!",
    Missing: "x",
    "In Progress": "...",
    "Critical Pending": "!"
  };
  return { key, label, status, note: operationDisplay(note), icon: iconMap[status] || "!" };
}

export function buildOperationalExceptions(context, timeline, row) {
  const exceptions = [];
  const add = (severity, code, title, details) => exceptions.push({ severity, code, title, details });

  if (!context.order) add("Critical", "missing_supply_order", "Missing Supply Order", "No linked supply order could be resolved for this queue row.");
  if (context.order && !context.procurementDetails.length) add("Warning", "missing_procurement", "Missing Procurement", "No procurement evidence is linked to this order yet.");
  if (context.procurementDetails.length && !context.grnRows.length) add("Warning", "missing_grn", "Missing GRN", "Procurement exists but no goods receipt evidence is linked.");
  if (context.procurementDetails.length && !context.stockReceipts.length) add("Warning", "missing_stock_receipt", "Missing Stock Receipt", "Procurement exists but no stock inward entry is visible in the stock ledger.");
  if (context.billingDetails.length && !context.stockIssues.length) add("Critical", "missing_stock_issue", "Missing Stock Issue", "Invoice exists but no stock issue evidence is linked to the order.");
  if (context.order && !context.billingDetails.length) add("Critical", "missing_invoice", "Missing Invoice", "Order exists but no billing record is linked.");
  if (context.billingDetails.length && !timeline.some((step) => step.key === "receipt_allocation_completed" && step.status === "Completed")) add("Critical", "missing_receipt_allocation", "Missing Receipt Allocation", "Invoice exists but receipt allocation or full collection is pending.");
  if (context.procurementDetails.length && !timeline.some((step) => step.key === "supplier_payment_completed" && step.status === "Completed")) add("Warning", "missing_supplier_allocation", "Missing Supplier Allocation", "Procurement exists but supplier payment allocation is not complete.");
  if (row.posting_error || row.posting_status === "Error") add("Critical", "posting_error", "Posting Error", row.posting_error || "Posting control has marked this record as errored.");

  const requiredDocs = ["Supply Order", "Delivery Challan", "Installation Report", "CRAC", "OEM Authorization", "Payment Proof"];
  requiredDocs.forEach((type) => {
    const doc = context.documentChecklist.find((item) => sameText(item.document_type, type));
    if (doc && doc.status === "Missing") {
      const severity = ["CRAC", "Delivery Challan", "Payment Proof"].includes(type) ? "Warning" : "Information";
      add(severity, `missing_document_${type.toLowerCase().replaceAll(" ", "_")}`, `Missing ${type}`, `${type} is not available in the document checklist.`);
    }
  });

  return exceptions;
}

export function calculateOperationalHealthScore(exceptions, closure) {
  const score = Math.max(0, exceptions.reduce((current, item) => {
    if (item.severity === "Critical") return current - 20;
    if (item.severity === "Warning") return current - 8;
    return current - 3;
  }, closure.ready ? 100 : 92));
  const note = score >= 95 ? "No issues" : score >= 80 ? "Minor document or allocation issues" : score >= 60 ? "Operational blockage detected" : "Critical operational blockage";
  return { score, note };
}

export function buildOrderClosureReadiness(context, exceptions, timeline) {
  const completed = (key) => timeline.some((step) => step.key === key && step.status === "Completed");
  const documentsComplete = !exceptions.some((item) => item.code?.startsWith("missing_document"));
  const checks = [
    { label: "Supply Completed", ready: completed("stock_issued") || /supplied|closed/i.test(context.order?.order_status || "") },
    { label: "Billing Completed", ready: completed("billing_completed") },
    { label: "Receipts Allocated", ready: completed("receipt_allocation_completed") },
    { label: "Supplier Payments Completed", ready: completed("supplier_payment_completed") || !context.procurementDetails.length },
    { label: "Expenses Booked", ready: !context.expenseRows.some((row) => row.posting_status === "Error" || row.posting_error) },
    { label: "GST Reviewed", ready: completed("billing_completed") && !exceptions.some((item) => item.code === "posting_error") },
    { label: "Documents Complete", ready: documentsComplete },
    { label: "Profitability Calculated", ready: completed("profitability_calculated") }
  ];
  return { ready: checks.every((check) => check.ready), checks };
}

export function recommendNextOperationalAction(timeline, exceptions, closure) {
  const critical = exceptions.find((item) => item.severity === "Critical");
  if (critical?.code === "missing_supply_order") return "Link or create supply order";
  if (critical?.code === "missing_stock_issue") return "Issue stock";
  if (critical?.code === "missing_invoice") return "Raise invoice";
  if (critical?.code === "missing_receipt_allocation") return "Allocate receipt";
  if (critical?.code === "posting_error") return "Review posting error";
  if (exceptions.some((item) => item.code === "missing_procurement")) return "Create procurement";
  if (exceptions.some((item) => item.code === "missing_grn")) return "Complete GRN";
  if (exceptions.some((item) => item.code === "missing_stock_receipt")) return "Complete stock receipt";
  if (exceptions.some((item) => item.code === "missing_supplier_allocation")) return "Allocate supplier payment";
  const missingDoc = exceptions.find((item) => item.code?.startsWith("missing_document"));
  if (missingDoc) return missingDoc.title.replace("Missing", "Upload");
  if (!closure.ready) return "Complete closure checklist";
  return "Close order";
}

export function deriveOperationalAttentionReason(row, exceptions, timeline) {
  const critical = exceptions.find((item) => item.severity === "Critical");
  if (critical) return critical.title;
  const warning = exceptions.find((item) => item.severity === "Warning");
  if (warning) return warning.title;
  const pending = timeline.find((step) => step.status !== "Completed");
  return row.attention || pending?.label || "Operational Review";
}

export function buildOperationalAuditSignals(exceptions, closure, healthScore) {
  const signals = exceptions.map((item) => ({
    event: "Exception Detected",
    severity: item.severity,
    details: item.title,
    status: "Open"
  }));
  signals.push({
    event: "Order Readiness Status",
    severity: closure.ready ? "Information" : "Warning",
    details: closure.ready ? "Ready for closure" : "Closure checklist is incomplete",
    status: closure.ready ? "Ready" : "Open"
  });
  signals.push({
    event: "Operational Health Score",
    severity: healthScore.score >= 80 ? "Information" : "Warning",
    details: `${healthScore.score}% - ${healthScore.note}`,
    status: healthScore.score >= 80 ? "Healthy" : "Review"
  });
  return signals;
}

export function buildOperationsDrilldown(row, data) {
  const intelligence = buildOperationsIntelligence(row, data);
  const context = intelligence.context;

  return {
    summary: normalizeOperationsQueueRow(row, row.attention || row.status_text || "Operational Review", data),
    timeline: intelligence.timeline,
    exceptions: intelligence.exceptions,
    closure: intelligence.closure,
    healthScore: intelligence.healthScore,
    recommendedAction: intelligence.recommendedAction,
    attentionReason: intelligence.attentionReason,
    sections: [
      { title: "Order Details", rows: context.orderDetails, columns: ["order_number", "item_name", "item_description", "quantity_text", "gross_text", "required_delivery_date", "order_status"] },
      { title: "Procurement Details", rows: context.procurementDetails, columns: ["purchase_invoice_number", "supplier_name", "purchase_date", "purchase_text", "procurement_status", "posting_status"] },
      { title: "Billing Details", rows: context.billingDetails, columns: ["invoice_number", "invoice_date", "billing_value", "gst_amount", "invoice_value", "posting_status"] },
      { title: "Receipt Allocation", rows: context.receiptAllocation, columns: ["invoice_number", "payment_reference", "invoice_amount", "allocated_amount", "amount_received", "balance_outstanding", "status"] },
      { title: "Supplier Payment Allocation", rows: context.supplierAllocation, columns: ["purchase_invoice_number", "payment_reference", "purchase_value", "allocated_amount", "amount_paid", "balance_due", "status"] },
      { title: "Document Checklist", rows: context.documentChecklist, columns: ["document_type", "status", "warning"] },
      { title: "Operational Audit Signals", rows: intelligence.auditSignals, columns: ["event", "severity", "details", "status"] },
      { title: "Ledger Entries", rows: context.ledgerEntries, columns: ["voucher_number", "account_name", "entry_date", "debit", "credit", "narration"] },
      { title: "Audit Trail", rows: context.auditTrail, columns: ["created_at", "action", "table_name", "record_id", "new_value"] }
    ]
  };
}

export function buildOperationsData(billing, inventory, accounting) {
  const orders = billing.references?.orders || [];
  const orderItemsRaw = billing.orderItems || [];
  const invoiceItems = billing.invoiceItems || [];
  const billingQuantities = billing.billingQuantities || [];
  const invoices = billing.invoices || [];
  const documents = billing.documents || [];
  const profitability = billing.profitability || [];
  const reservations = inventory.reservations || [];
  const procurementRequirements = inventory.procurementRequirements || [];
  const goodsReceipts = inventory.goodsReceipts || [];
  const stockLedger = inventory.stockLedger || [];
  const postingStatus = (accounting.postingControl || []).map((row) => ({
    ...row,
    amount_text: formatCurrency(row.amount || 0),
    order_number: findOrderByOperationalRecord(row, orders, invoices, accounting.procurements || [])?.order_number || "",
    target_view: operationalTarget(row.table_name),
    target_section: operationalTargetSection(row.table_name),
    target_label: row.module,
    drill_path: `${row.module} / Voucher / Ledger / Audit Trail`
  }));
  const procurements = accounting.procurements || [];
  const receivables = accounting.receivables || [];

  const orderTotals = new Map(orders.map((order) => [Number(order.id), {
    ordered: 0,
    procured: 0,
    received: 0,
    issued: 0,
    billed: 0,
    collected: 0,
    taxable: Number(order.order_taxable_value || 0),
    gross: Number(order.order_gross_value || 0)
  }]));

  orderItemsRaw.forEach((item) => {
    const totals = orderTotals.get(Number(item.order_id));
    if (totals) totals.ordered += Number(item.quantity || 0);
  });
  (inventory.inwards || []).forEach((row) => {
    const totals = orderTotals.get(Number(row.order_id));
    if (totals) totals.received += Number(row.quantity || 0);
  });
  (inventory.outwards || []).forEach((row) => {
    const totals = orderTotals.get(Number(row.order_id));
    if (totals) totals.issued += Number(row.quantity_issued || 0);
  });
  invoiceItems.forEach((item) => {
    const totals = orderTotals.get(Number(item.order_id));
    if (totals) totals.billed += Number(item.quantity || 0);
  });
  procurements.forEach((row) => {
    const totals = orderTotals.get(Number(row.order_id));
    if (totals) totals.procured += Number(row.purchase_value || 0);
  });
  receivables.forEach((row) => {
    const totals = orderTotals.get(Number(row.order_id));
    if (totals) totals.collected += Number(row.amount_received || 0);
  });

  const orderItems = orderItemsRaw.map((item) => {
    const billed = billingQuantities.find((row) => Number(row.order_item_id) === Number(item.id) || (!Number(row.order_item_id) && Number(row.item_id) === Number(item.item_id) && Number(row.order_id) === Number(item.order_id)));
    const order = orders.find((row) => Number(row.id) === Number(item.order_id));
    return {
      ...item,
      order_number: order?.order_number || "",
      department_name: order?.department_name || "",
      quantity_text: `${formatNumber(item.quantity)} ${item.unit || ""}`.trim(),
      taxable_text: formatCurrency(item.taxable_value || 0),
      gst_text: `${formatNumber(item.gst_rate)}% / ${formatCurrency(item.gst_amount || 0)}`,
      gross_text: formatCurrency(item.gross_value || 0),
      billed_text: `${formatNumber(billed?.billed_quantity || 0)} billed`,
      target_view: "supply_orders",
      target_section: "entry",
      target_label: "Order"
    };
  });

  const lifecycle = orders.map((order) => {
    const totals = orderTotals.get(Number(order.id)) || {};
    const reserved = reservations.filter((row) => Number(row.order_id) === Number(order.id)).reduce((sum, row) => sum + Number(row.reserved_quantity || 0), 0);
    return {
      ...order,
      ordered_qty: formatNumber(totals.ordered || order.order_quantity || 0),
      reserved_qty: formatNumber(reserved),
      procured_qty: formatCurrency(totals.procured || 0),
      received_qty: formatNumber(totals.received || 0),
      issued_qty: formatNumber(totals.issued || 0),
      billed_qty: formatNumber(totals.billed || 0),
      collected_text: formatCurrency(totals.collected || 0),
      target_view: "supply_orders",
      target_section: "entry",
      target_label: "Order"
    };
  });

  const purchaseBills = procurements.map((row) => ({
    ...row,
    purchase_text: formatCurrency(Number(row.purchase_value || 0) + Number(row.purchase_gst || 0)),
    target_view: "procurements",
    target_section: "entry",
    target_label: "Procurement",
    drill_path: "Purchase Bill / Voucher / Payable / Ledger"
  }));

  const grnRows = goodsReceipts.flatMap((grn) => {
    const relatedLedger = stockLedger.filter((row) => String(row.document_number || "") === String(grn.grn_number || ""));
    if (!relatedLedger.length) {
      return [{
        key: `grn-${grn.id}`,
        purchase_bill: grn.purchase_invoice_number || grn.grn_number || `GRN ${grn.id}`,
        supplier_name: grn.supplier_name,
        item_name: `${grn.line_count || 0} line(s)`,
        ordered_qty: "-",
        received_qty: formatNumber(grn.received_quantity || grn.accepted_quantity || 0),
        damaged_qty: formatNumber(grn.damaged_quantity || 0),
        accepted_qty: formatNumber(grn.accepted_quantity || 0),
        warehouse_name: grn.warehouse_name,
        status: grn.status || "Draft",
        target_view: "grn_report",
        target_section: "report",
        target_label: "GRN",
        drill_text: "GRN / Stock Receipt / Stock Ledger",
        drill_path: "GRN / Stock Receipt / Stock Ledger"
      }];
    }
    return relatedLedger.map((ledger) => ({
      key: `grn-ledger-${grn.id}-${ledger.id}`,
      purchase_bill: grn.purchase_invoice_number || grn.grn_number || `GRN ${grn.id}`,
      supplier_name: grn.supplier_name,
      item_name: ledger.item_name,
      ordered_qty: "-",
      received_qty: formatNumber(ledger.inward_quantity || 0),
      damaged_qty: formatNumber(grn.damaged_quantity || 0),
      accepted_qty: formatNumber(ledger.inward_quantity || 0),
      warehouse_name: ledger.warehouse_name || grn.warehouse_name,
      status: grn.status || "Posted",
      target_view: "stock_ledger",
      target_section: "ledger",
      target_label: "Stock Ledger",
      drill_text: "GRN / Stock Receipt / Stock Ledger",
      drill_path: "GRN / Stock Receipt / Stock Ledger"
    }));
  });

  const pendingProcurement = [
    ...procurementRequirements.map((row) => ({
      ...row,
      ordered_qty: formatNumber(row.reserved_quantity || 0),
      procured_qty: formatNumber(Number(row.reserved_quantity || 0) - Number(row.short_quantity || 0)),
      balance_qty: formatNumber(row.short_quantity || row.procurement_required_quantity || 0),
      status_text: "Procurement Required",
      target_view: "procurement_requirements",
      target_section: "report",
      target_label: "Requirement"
    })),
    ...orders.filter((order) => /procurement pending/i.test(order.order_status || "")).map((order) => ({
      ...order,
      item_name: "Order level",
      ordered_qty: formatNumber(order.order_quantity || 0),
      procured_qty: "0",
      balance_qty: formatNumber(order.order_quantity || 0),
      status_text: order.order_status,
      target_view: "supply_orders",
      target_section: "entry",
      target_label: "Order"
    }))
  ];

  const pendingSupply = lifecycle.filter((row) => Number(row.issued_qty || 0) < Number(row.ordered_qty || 0) && !/closed|fully received/i.test(row.order_status || ""));
  const pendingBilling = lifecycle
    .filter((row) => Number(row.billed_qty || 0) < Math.max(Number(row.ordered_qty || 0), Number(row.issued_qty || 0)) && !/closed/i.test(row.order_status || ""))
    .map((row) => ({ ...row, balance_qty: formatNumber(Math.max(Number(row.ordered_qty || 0), Number(row.issued_qty || 0)) - Number(row.billed_qty || 0)), status_text: "Billing Pending", amount_text: formatCurrency(row.order_gross_value || 0), target_view: "invoices", target_section: "entry", target_label: "Billing" }));

  const pendingPayment = receivables
    .filter((row) => Number(row.balance_outstanding || 0) > 0)
    .map((row) => ({
      ...row,
      invoice_text: formatCurrency(row.invoice_amount || 0),
      received_text: formatCurrency(row.amount_received || 0),
      outstanding_text: formatCurrency(row.balance_outstanding || 0),
      amount_text: formatCurrency(row.balance_outstanding || 0),
      status_text: row.status || "Open",
      target_view: "receipt_allocation_workflow",
      target_section: "entry",
      target_label: "Allocate"
    }));

  const checklistTypes = ["Supply Order", "Work Order", "OEM Authorization", "Delivery Challan", "Installation Report", "CRAC", "Invoice Copy", "Payment Proof"];
  const documentChecklist = orders.flatMap((order) => checklistTypes.map((type) => {
    const available = documents.some((doc) => documentMatchesOrder(doc, order, type, invoices));
    return {
      key: `${order.id}-${type}`,
      order_number: order.order_number,
      department_name: order.department_name,
      document_type: type,
      status: available ? "Available" : "Missing",
      warning: available ? "" : "Missing documents detected",
      target_view: "documents",
      target_section: "documents",
      target_label: "Documents"
    };
  }));
  const missingDocuments = documentChecklist.filter((row) => row.status === "Missing");

  const stockIssueVsBilling = orderItems.map((item) => {
    const issued = stockLedger.filter((row) => Number(row.order_id) === Number(item.order_id) && Number(row.item_id) === Number(item.item_id)).reduce((sum, row) => sum + Number(row.outward_quantity || 0), 0);
    const billed = billingQuantities.find((row) => Number(row.order_id) === Number(item.order_id) && Number(row.item_id) === Number(item.item_id))?.billed_quantity || 0;
    const difference = Number(issued) - Number(billed);
    return {
      ...item,
      issued_qty: formatNumber(issued),
      billed_qty: formatNumber(billed),
      difference_qty: formatNumber(difference),
      status_text: difference === 0 ? "Matched" : difference > 0 ? "Issued Not Billed" : "Billed More Than Issued",
      target_view: difference > 0 ? "invoices" : "stock_outwards",
      target_section: "entry",
      target_label: "Review"
    };
  }).filter((row) => Number(row.issued_qty || 0) || Number(row.billed_qty || 0));

  const profitabilityExceptions = profitability
    .filter((row) => Number(row.netCompanyProfit || 0) < 0 || !Number(row.billingValue || 0) || !Number(row.inventoryCostBasis ?? row.purchaseValue ?? 0))
    .map((row) => ({
      ...row,
      billing_text: formatCurrency(row.billingValue || 0),
      cost_text: formatCurrency(row.inventoryCostBasis ?? row.purchaseValue ?? 0),
      profit_text: formatCurrency(row.netCompanyProfit || 0),
      roi_text: `${Number(row.roiPercentage || 0).toFixed(2)}%`,
      status_text: Number(row.netCompanyProfit || 0) < 0 ? "Loss" : "Missing basis",
      target_view: "profitability",
      target_section: "report",
      target_label: "Profitability"
    }));

  const postingErrors = postingStatus.filter((row) => row.posting_status === "Error" || row.posting_error);
  const grnPending = grnRows.filter((row) => !["Posted", "Confirmed", "Fully Received"].includes(row.status));
  const expensePosting = postingStatus.filter((row) => row.module === "Expense");

  return {
    orders,
    procurements,
    invoices,
    receivables,
    vouchers: accounting.vouchers || [],
    ledger: accounting.ledger || [],
    auditLog: accounting.auditLog || [],
    paymentAllocations: accounting.paymentAllocations || [],
    supplierPaymentAllocations: accounting.supplierPaymentAllocations || [],
    documents,
    reservations,
    stockLedger,
    payables: accounting.payables || [],
    profitability,
    orderItems,
    lifecycle,
    purchaseBills,
    grnRows,
    grnPending,
    expensePosting,
    pendingProcurement,
    pendingSupply,
    pendingBilling,
    pendingPayment,
    documentChecklist,
    missingDocuments,
    stockIssueVsBilling,
    profitabilityExceptions,
    postingStatus,
    postingErrors
  };
}

export function findOrderByOperationalRecord(row, orders, invoices, procurements) {
  if (row.table_name === "invoices") {
    const invoice = invoices.find((item) => Number(item.id) === Number(row.record_id));
    return orders.find((order) => Number(order.id) === Number(invoice?.order_id));
  }
  if (row.table_name === "procurements") {
    const procurement = procurements.find((item) => Number(item.id) === Number(row.record_id));
    return orders.find((order) => Number(order.id) === Number(procurement?.order_id));
  }
  return null;
}

export function operationalTarget(tableName) {
  return {
    invoices: "invoices",
    procurements: "procurements",
    payments: "payments",
    expense_entries: "expense_entries"
  }[tableName] || "operations_dashboard";
}

export function operationalTargetSection(tableName) {
  return {
    invoices: "entry",
    procurements: "entry",
    payments: "entry",
    expense_entries: "entry"
  }[tableName] || "report";
}

export function documentMatchesOrder(document, order, type, invoices = []) {
  const documentType = String(document.document_type || "").toLowerCase();
  const fileName = String(document.original_file_name || "").toLowerCase();
  const typeToken = type.toLowerCase();
  const typeMatches = documentType.includes(typeToken) || fileName.includes(typeToken.replaceAll(" ", ""));
  if (Number(document.linked_record_id) === Number(order.id) && document.linked_module === "supply_orders") {
    return typeMatches || type === "Supply Order";
  }
  if (Number(document.document_order_id) === Number(order.id)) return true;
  if (document.linked_module === "invoices") {
    const invoice = invoices.find((row) => Number(row.id) === Number(document.linked_record_id));
    return Number(invoice?.order_id) === Number(order.id) && (typeMatches || ["Invoice Copy", "CRAC", "Installation Report", "Delivery Challan"].includes(type));
  }
  return false;
}
