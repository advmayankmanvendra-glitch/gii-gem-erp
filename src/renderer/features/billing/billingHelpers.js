import { formatCurrency } from "../../utils/formatters.js";

export function calculateInvoiceLine(line, gstType = "CGST/SGST") {
  const quantity = Number(line.quantity || 0);
  const billingRate = Number(line.billing_rate || 0);
  const taxableValue = quantity * billingRate;
  const gstRate = Number(line.gst_rate || 0);
  const gstAmount = taxableValue * gstRate / 100;
  const isIgst = gstType === "IGST";
  const isCgstOnly = gstType === "CGST";
  const isSgstOnly = gstType === "SGST";
  return {
    ...line,
    quantity,
    billing_rate: billingRate,
    gst_rate: gstRate,
    taxable_value: taxableValue,
    cgst: isIgst || isSgstOnly ? 0 : isCgstOnly ? gstAmount : gstAmount / 2,
    sgst: isIgst || isCgstOnly ? 0 : isSgstOnly ? gstAmount : gstAmount / 2,
    igst: isIgst ? gstAmount : 0,
    gst_amount: gstAmount,
    gross_value: taxableValue + gstAmount
  };
}

export function uniqueInstitutionOptions(rows, departmentId) {
  const seen = new Set();
  return rows
    .filter((row) => !departmentId || String(row.department_id) === String(departmentId))
    .filter((row) => String(row.institution_name || "").trim())
    .filter((row) => {
      const key = String(row.institution_name || "").trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((row) => [row.institution_name, row.institution_name]);
}

export function suggestedInvoiceNumber(data, companyId, financialYearId) {
  return (data?.invoiceSequence || []).find((row) => String(row.company_id) === String(companyId) && String(row.financial_year_id) === String(financialYearId))?.invoice_number || "";
}

export function orderLinesForBilling(data, orderId, editingId) {
  return (data?.orderItems || [])
    .filter((row) => String(row.order_id) === String(orderId))
    .map((row) => {
      const pending = pendingQuantityForLine(data, orderId, { order_item_id: row.id, item_id: row.item_id }, editingId);
      const quantity = Math.max(0, pending || Number(row.quantity || 0));
      const rate = Number(row.quoted_rate || 0) || (Number(row.taxable_value || 0) && Number(row.quantity || 0) ? Number(row.taxable_value || 0) / Number(row.quantity || 1) : 0);
      return {
        order_item_id: row.id,
        item_id: row.item_id || "",
        description: row.item_description || row.item_name || "",
        hsn: row.hsn_code || "",
        quantity,
        pending_quantity: pending,
        unit: row.unit || "Nos",
        billing_rate: rate,
        gst_rate: Number(row.gst_rate || 0)
      };
    });
}

export function pendingQuantityForLine(data, orderId, line, editingId) {
  const orderItems = (data?.orderItems || []).filter((row) => Number(row.order_id) === Number(orderId));
  const matchedOrderItem = line.order_item_id
    ? orderItems.find((row) => Number(row.id) === Number(line.order_item_id))
    : orderItems.find((row) => Number(row.item_id || 0) === Number(line.item_id || 0));
  if (!matchedOrderItem) return 0;
  const billed = (data?.invoiceItems || [])
    .filter((row) => Number(row.order_id) === Number(orderId) && Number(row.billing_id) !== Number(editingId || 0))
    .filter((row) => {
      if (line.order_item_id) return Number(row.order_item_id || 0) === Number(line.order_item_id);
      return Number(row.item_id || 0) === Number(line.item_id || 0);
    })
    .reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  return Number(matchedOrderItem.quantity || 0) - billed;
}

export function maxLineGstRate(lines) {
  return lines.reduce((max, line) => Math.max(max, Number(line.gst_rate || 0)), 0);
}

export function orderProcuredQuantity(data, orderId) {
  return (data?.procuredQuantities || [])
    .filter((row) => Number(row.order_id) === Number(orderId))
    .reduce((sum, row) => sum + Number(row.procured_quantity || 0), 0);
}

export function orderIssuedQuantity(data, orderId) {
  return (data?.issuedQuantities || [])
    .filter((row) => Number(row.order_id) === Number(orderId))
    .reduce((sum, row) => sum + Number(row.issued_quantity || 0), 0);
}

export function billingOrderValidation(data, header, lines, editingId) {
  const orderId = Number(header.order_id || 0);
  const orderItems = (data?.orderItems || []).filter((row) => Number(row.order_id) === orderId);
  const orderedQuantity = orderItems.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const otherBilledQuantity = (data?.invoiceItems || [])
    .filter((row) => Number(row.order_id) === orderId && Number(row.billing_id) !== Number(editingId || 0))
    .reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const currentQuantity = lines.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const billedQuantity = otherBilledQuantity + currentQuantity;
  const balanceQuantity = orderedQuantity ? orderedQuantity - billedQuantity : 0;
  const duplicate = (data?.invoices || []).some((row) => Number(row.id) !== Number(editingId || 0) && Number(row.order_id) === orderId && String(row.invoice_number || "").trim().toLowerCase() === String(header.invoice_number || "").trim().toLowerCase());
  const messages = [];
  if (duplicate) messages.push("Duplicate Billing: same invoice number already exists for this order.");
  if (orderedQuantity && balanceQuantity < 0) messages.push("Excess Quantity: billed quantity is above ordered quantity.");
  const excessLines = lines.filter((line) => {
    const pending = pendingQuantityForLine(data, orderId, line, editingId);
    return pending > 0 && Number(line.quantity || 0) > pending;
  });
  if (excessLines.length) messages.push("Excess Quantity: one or more item lines exceed pending order quantity.");
  const existingBilling = (data?.invoices || [])
    .filter((row) => Number(row.order_id) === orderId && Number(row.id) !== Number(editingId || 0))
    .reduce((sum, row) => sum + Number(row.billing_value || 0), 0);
  const currentBilling = lines.reduce((sum, row) => sum + Number(row.taxable_value || 0), 0);
  const order = (data?.references?.orders || []).find((row) => Number(row.id) === orderId);
  const orderValue = Number(order?.order_taxable_value || order?.order_value || 0);
  const overBilling = orderValue > 0 && existingBilling + currentBilling > orderValue;
  if (overBilling) messages.push("Over Billing: invoice value exceeds the recorded order value.");
  return { orderedQuantity, billedQuantity, balanceQuantity, duplicate, overBilling, excessQuantity: orderedQuantity && balanceQuantity < 0, excessLineQuantity: excessLines.length > 0, messages };
}

export function profitabilityPreviewForOrder(rows, orderId, currentBilling) {
  const row = rows.find((item) => Number(item.id) === Number(orderId)) || {};
  const billingValue = Number(currentBilling || row.billingValue || 0);
  const purchaseValue = Number(row.purchaseValue || 0);
  const grossMargin = billingValue - purchaseValue;
  const gstImpact = grossMargin * (Number(row.gstRate || 0) / 100);
  const expenses = Number(row.totalExpenses || 0);
  return {
    purchaseValue,
    billingValue,
    grossMargin,
    gstImpact,
    expenses,
    expectedProfit: grossMargin - gstImpact - expenses,
    roi: purchaseValue ? ((grossMargin - gstImpact - expenses) / purchaseValue) * 100 : 0
  };
}

export function invoiceTimeline(invoice) {
  const isPosted = invoice?.posting_status === "Posted";
  const amountReceived = Number(invoice?.amount_received || 0);
  const balanceOutstanding = Number(invoice?.balance_outstanding || 0);
  const isPaid = isPosted && amountReceived > 0 && balanceOutstanding <= 0;
  const isClosed = isPaid;
  return [
    { label: "Created", value: invoice?.created_at || "-", done: Boolean(invoice?.id) },
    { label: "Approved", value: invoice?.approval_status === "Approved" ? "Approved" : invoice?.approval_status || "-", done: invoice?.approval_status === "Approved" || isPosted },
    { label: "Posted", value: isPosted ? (invoice?.voucher_date || invoice?.posted_at || "Posted") : "-", done: isPosted },
    { label: "Paid", value: isPaid ? formatCurrency(amountReceived) : isPosted ? `${formatCurrency(amountReceived)} / ${formatCurrency(invoice?.invoice_value || 0)}` : "-", done: isPaid },
    { label: "Closed", value: isClosed ? "Closed" : invoice?.id ? "Open" : "-", done: isClosed }
  ];
}

export function lifecycleStage(invoice) {
  if (!invoice?.id) return "New";
  if (invoice?.posting_status === "Reversed") return "Reversed";
  if (Number(invoice?.balance_outstanding || 0) <= 0 && Number(invoice?.amount_received || 0) > 0 && invoice?.posting_status === "Posted") return "Paid / Closed";
  if (invoice?.posting_status === "Posted") return "Posted";
  if (invoice?.approval_status === "Approved") return "Approved";
  if (invoice?.invoice_status === "Pending Approval") return "Pending Approval";
  return "Draft";
}
