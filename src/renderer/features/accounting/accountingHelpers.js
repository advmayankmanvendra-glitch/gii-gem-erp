import { formatCurrency } from "../../utils/formatters.js";

export function buildAllocationCorrectionForm(kind, row = {}) {
  return {
    action: "unallocate",
    target_id: kind === "receipt" ? row.billing_id || "" : row.procurement_id || "",
    allocated_amount: row.allocated_amount || "",
    tds_deducted: row.tds_deducted || 0,
    gst_tds_deducted: row.gst_tds_deducted || 0,
    other_deductions: row.other_deductions || 0,
    allow_excess: Number(row.allow_excess || 0) === 1,
    reason: ""
  };
}

export function allocationTargetOptions(kind, data = {}) {
  if (kind === "receipt") {
    return (data.billWiseReceivables || [])
      .filter((row) => row.billing_id)
      .map((row) => [
        row.billing_id,
        `${row.invoice_number || `Invoice ${row.billing_id}`} | ${row.department_name || "Department"} | Balance ${formatCurrency(Number(row.balance_outstanding || 0))}`
      ]);
  }
  return (data.billWisePayables || [])
    .filter((row) => row.procurement_id)
    .map((row) => [
      row.procurement_id,
      `${row.purchase_invoice_number || `Purchase ${row.procurement_id}`} | ${row.supplier_name || "Supplier"} | Balance ${formatCurrency(Number(row.balance_due || 0))}`
    ]);
}

export function formatCell(value, type) {
  if (type === "money") return formatCurrency(Number(value || 0));
  return value ?? "-";
}
