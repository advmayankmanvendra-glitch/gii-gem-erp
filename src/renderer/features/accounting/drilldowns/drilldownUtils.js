export function buildDrilldownActions(drilldown) {
  const voucher = drilldown.voucher?.header || drilldown.source?.linkedVoucher || {};
  const source = drilldown.source || {};
  const record = source.record || drilldown.sourceRow || {};
  const sourceModule = source.source_module || record.source_module || record.module || record.module_name || "";
  const sourceView = viewForSourceModule(sourceModule);
  const statusInfo = drilldownStatusInfo(voucher, record);
  const voucherExists = Boolean(voucher?.voucher_number || voucher?.id || record?.voucher_number || record?.voucher_id);
  const isPosted = (String(voucher?.status || record?.posting_status || "").toLowerCase().includes("posted"));
  const isReversed = (String(voucher?.status || record?.status || "").toLowerCase().includes("reversed"));
  const voucherId = voucher?.id || record?.voucher_id;
  const actions = [];

  if (sourceView) {
    actions.push({
      group: "Source Record",
      label: "Open Source Record",
      view: sourceView,
      description: "Review the original transaction screen."
    });
    actions.push({
      group: "Source Record",
      label: "Edit Source Record",
      view: sourceView,
      tone: statusInfo.locked ? "blocked" : "warning",
      disabled: statusInfo.locked,
      description: statusInfo.locked ? "Locked after posting" : "Open source screen and use permitted edit controls.",
      reason: statusInfo.locked ? statusInfo.reason : ""
    });
  }

  if (voucherExists) {
    actions.push({
      group: "Voucher Correction",
      label: "Open Voucher Register",
      view: "voucher_register",
      description: "Trace posted voucher and line entries."
    });
    actions.push({
      group: "Voucher Correction",
      label: "Open Reversal Workflow",
      view: "reversal_voucher",
      tone: "danger",
      description: "Use reversal for posted vouchers; reason is required inside the workflow."
    });
    if (isPosted && !isReversed && voucherId) {
      actions.push({
        group: "Voucher Correction",
        label: "Reverse Voucher (Inline)",
        view: "",
        inlineAction: true,
        actionType: "reverse",
        voucherId,
        tone: "danger",
        description: "Reverse this posted voucher directly. A reason is required."
      });
    }
  } else {
    actions.push({
      group: "Voucher Correction",
      label: "Create Correction Voucher",
      view: "manual_voucher",
      tone: "warning",
      description: "Create a controlled journal only after source review."
    });
  }

  const moduleText = String(sourceModule || voucher.source_module || voucher.voucher_type || drilldown.title || "").toLowerCase();
  const isSalesContext = moduleText.includes("sale") || moduleText.includes("billing") || moduleText.includes("invoice") || moduleText.includes("receivable");
  const isPurchaseContext = moduleText.includes("purchase") || moduleText.includes("supplier") || moduleText.includes("payable") || moduleText.includes("procurement");

  if (isSalesContext) {
    actions.push({
      group: "Commercial Correction",
      label: "Open Credit Note",
      view: "business_credit_note",
      tone: "warning",
      description: "Use for sales/invoice reduction correction."
    });
    actions.push({
      group: "Allocation",
      label: "Review Receipt Allocation",
      view: "receipt_allocation_workflow",
      description: "Check receipt application against invoices."
    });
  }
  if (isPurchaseContext) {
    actions.push({
      group: "Commercial Correction",
      label: "Open Debit Note",
      view: "business_debit_note",
      tone: "warning",
      description: "Use for purchase/supplier correction."
    });
    actions.push({
      group: "Allocation",
      label: "Review Supplier Allocation",
      view: "supplier_allocation_workflow",
      description: "Check supplier payment application."
    });
  }

  if (drilldown.mode === "party_reconciliation") {
    actions.push(
      { group: "Allocation", label: "Receipt Allocation", view: "receipt_allocation_workflow", description: "Review customer/dept receipt allocation." },
      { group: "Allocation", label: "Supplier Allocation", view: "supplier_allocation_workflow", description: "Review supplier bill allocation." },
      { group: "Allocation", label: "Party Ledger", view: "party_ledger", description: "Compare party ledger movement." }
    );
  }

  if (drilldown.mode === "control_evidence") {
    actions.push(
      { group: "Financial Control", label: "Posting Queue", view: "posting_control", description: "Review blocking and retry status." },
      { group: "Financial Control", label: "Approval Queue", view: "approval_queue", description: "Review approval state and reasons." },
      { group: "Financial Control", label: "Controls Dashboard", view: "financial_control", description: "Review control health." }
    );
  }

  actions.push(
    { group: "Evidence", label: "General Ledger", view: "ledger_view", description: "Trace account movement." },
    { group: "Evidence", label: "Documents", view: "documents", description: "Attach or review supporting documents." },
    { group: "Evidence", label: "Audit Log", view: "audit_log", description: "Review historical actions and reasons." }
  );

  return dedupeDrilldownActions(actions);
}

export function drilldownStatusInfo(voucher, record) {
  const statusText = [voucher?.status, voucher?.posting_status, record?.status, record?.posting_status, record?.status_display]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (statusText.includes("reversed")) {
    return { locked: true, reason: "Reversed records cannot be edited directly. Use correction workflow.", nextAction: "Open Reversal Workflow or create a correction voucher to adjust balances." };
  }
  if (statusText.includes("posted")) {
    return { locked: true, reason: "Posted records cannot be edited directly. Use reversal or correction workflow.", nextAction: "Reverse the posted voucher, or create a credit/debit note for commercial corrections." };
  }
  if (statusText.includes("closed") || statusText.includes("locked")) {
    return { locked: true, reason: "Financial year is closed or locked. Posting and editing are restricted.", nextAction: "Open a new financial year or unlock current year from Financial Control if permitted." };
  }
  if (statusText.includes("draft")) {
    return { locked: false, reason: "Record is in draft state. Review and post when ready.", nextAction: "Review entries and post the transaction when complete." };
  }
  if (statusText.includes("approved")) {
    return { locked: true, reason: "Approved records are locked from direct editing pending posting.", nextAction: "Post the approved transaction, or use approval queue to reverse if needed." };
  }
  return { locked: false, reason: "", nextAction: "" };
}

export function viewForSourceModule(sourceModule) {
  const key = String(sourceModule || "").toLowerCase().replaceAll(" ", "_");
  const map = {
    billing: "invoices",
    invoice: "invoices",
    invoices: "invoices",
    sales: "invoices",
    procurement: "procurements",
    procurements: "procurements",
    purchase: "procurements",
    payment: "payments",
    payments: "payments",
    receipt: "payments",
    expense: "expenses",
    expenses: "expenses",
    expense_entries: "expenses",
    supplier_payment: "supplier_allocation_workflow",
    supplier_payments: "supplier_allocation_workflow",
    bank_statement_import: "bank_reconciliation",
    bank_statement_entries: "bank_reconciliation",
    voucher_proposals: "voucher_proposal_queue",
    stock_inward: "stock_inwards",
    stock_inwards: "stock_inwards",
    stock_outward: "stock_outwards",
    stock_outwards: "stock_outwards",
    stock_adjustment: "stock_adjustments",
    stock_adjustments: "stock_adjustments",
    warehouse_transfer: "warehouse_transfers",
    warehouse_transfers: "warehouse_transfers",
    supply_order: "supply_orders",
    supply_orders: "supply_orders"
  };
  return map[key] || "";
}

export function dedupeDrilldownActions(actions) {
  const seen = new Set();
  return actions.filter((action) => {
    const key = `${action.group}-${action.label}-${action.view || ""}-${action.disabled ? "disabled" : "active"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
