import { buildReadOnlyReportFamilyConfig } from "../../screens/ReadOnlyReportFamilyScreen.jsx";

export function accountingTableConfig(view, data = {}) {
  if (view === "day_book") {
    return {
      title: "Day Book",
      rows: data.dayBook || [],
      columns: [
        { key: "voucher_date", label: "Date" },
        { key: "voucher_number", label: "Voucher" },
        { key: "voucher_type", label: "Type" },
        { key: "status", label: "Status" },
        { key: "narration", label: "Narration" },
        { key: "debit", label: "Debit", type: "money" },
        { key: "credit", label: "Credit", type: "money" },
        { key: "actions", label: "Actions", type: "actions" }
      ]
    };
  }
  if (view === "chart_accounts") {
    return {
      title: "Chart of Accounts",
      rows: data.accounts || [],
      columns: [
        { key: "account_code", label: "Code" },
        { key: "account_name", label: "Account" },
        { key: "account_type", label: "Type" },
        { key: "normal_balance", label: "Normal Balance" },
        { key: "opening_balance", label: "Opening", type: "money" },
        { key: "drill", label: "Ledger", type: "drill_account" }
      ]
    };
  }
  if (view === "voucher_register") {
    return {
      title: "Voucher Register",
      rows: data.voucherLines || [],
      columns: [
        { key: "voucher_date", label: "Date" },
        { key: "voucher_number", label: "Voucher" },
        { key: "voucher_type", label: "Type" },
        { key: "account_name", label: "Account" },
        { key: "debit", label: "Debit", type: "money" },
        { key: "credit", label: "Credit", type: "money" },
        { key: "drill", label: "Drill", type: "drill_voucher" }
      ]
    };
  }
  if (view === "audit_log") {
    return {
      title: "Audit Log",
      rows: data.auditLog || [],
      columns: [
        { key: "created_at", label: "Time" },
        { key: "action", label: "Action" },
        { key: "module", label: "Module" },
        { key: "table_name", label: "Table" },
        { key: "record_id", label: "Record" },
        { key: "user_role", label: "Role" },
        { key: "event_hash", label: "Event Hash" },
        { key: "ip_address", label: "Source" },
        { key: "actions", label: "Drill", type: "control_drill" }
      ]
    };
  }
  if (view === "posting_control") {
    return {
      title: "Posting Control",
      rows: data.postingControl || [],
      columns: [
        { key: "module", label: "Module" },
        { key: "reference", label: "Reference" },
        { key: "record_date", label: "Date" },
        { key: "amount", label: "Amount", type: "money" },
        { key: "voucher_number", label: "Voucher" },
        { key: "approval_status", label: "Approval" },
        { key: "posting_status", label: "Posting" },
        { key: "status_reason", label: "Status Reason" },
        { key: "blocking_reason", label: "Blocking / Error Reason" },
        { key: "recommended_action", label: "Recommended Action" },
        { key: "retry_available", label: "Safe Retry" },
        { key: "actions", label: "Actions", type: "posting_actions" }
      ]
    };
  }
  if (view === "payment_allocations") {
    return {
      title: "Payment Allocation",
      rows: data.paymentAllocations || [],
      columns: [
        { key: "receipt_voucher", label: "Receipt Voucher" },
        { key: "payment_date", label: "Date" },
        { key: "department_name", label: "Department" },
        { key: "invoice_number", label: "Invoice" },
        { key: "invoice_amount", label: "Invoice Amount", type: "money" },
        { key: "allocated_amount", label: "Allocated", type: "money" },
        { key: "tds_deducted", label: "TDS", type: "money" },
        { key: "gst_tds_deducted", label: "GST TDS", type: "money" },
        { key: "balance_remaining", label: "Balance Remaining", type: "money" },
        { key: "order_number", label: "Order" },
        { key: "allocation_status", label: "Status" },
        { key: "change_reason", label: "Correction Reason" },
        { key: "reallocated_from_id", label: "Reallocated From" },
        { key: "actions", label: "Actions", type: "allocation_actions" }
      ]
    };
  }
  if (view === "supplier_payment_allocations") {
    return {
      title: "Supplier Payment Allocation",
      rows: data.supplierPaymentAllocations || [],
      columns: [
        { key: "payment_voucher", label: "Supplier Payment" },
        { key: "payment_date", label: "Date" },
        { key: "supplier_name", label: "Supplier" },
        { key: "purchase_invoice_number", label: "Purchase Invoice" },
        { key: "purchase_amount", label: "Purchase Amount", type: "money" },
        { key: "allocated_amount", label: "Allocated", type: "money" },
        { key: "balance_remaining", label: "Balance Remaining", type: "money" },
        { key: "order_number", label: "Order" },
        { key: "allocation_status", label: "Status" },
        { key: "change_reason", label: "Correction Reason" },
        { key: "reallocated_from_id", label: "Reallocated From" },
        { key: "actions", label: "Actions", type: "allocation_actions" }
      ]
    };
  }
  if (view === "unallocated_receipts") {
    return {
      title: "Unallocated Receipts Report",
      rows: data.unallocatedReceipts || [],
      columns: [
        { key: "receipt_reference", label: "Receipt" },
        { key: "payment_date", label: "Date" },
        { key: "department_name", label: "Department" },
        { key: "receipt_amount", label: "Receipt Amount", type: "money" },
        { key: "allocated_amount", label: "Allocated", type: "money" },
        { key: "advance_balance", label: "Advance", type: "money" },
        { key: "unallocated_amount", label: "Unallocated", type: "money" },
        { key: "allocation_status", label: "Status" }
      ]
    };
  }
  if (view === "unallocated_supplier_payments") {
    return {
      title: "Unallocated Supplier Payments Report",
      rows: data.unallocatedSupplierPayments || [],
      columns: [
        { key: "payment_reference", label: "Payment" },
        { key: "payment_date", label: "Date" },
        { key: "supplier_name", label: "Supplier" },
        { key: "payment_amount", label: "Payment Amount", type: "money" },
        { key: "allocated_amount", label: "Allocated", type: "money" },
        { key: "advance_balance", label: "Advance", type: "money" },
        { key: "unallocated_amount", label: "Unallocated", type: "money" },
        { key: "allocation_status", label: "Status" }
      ]
    };
  }
  if (view === "advance_receipts") {
    return {
      title: "Advance Receipt Report",
      rows: data.advanceReceipts || [],
      columns: [
        { key: "receipt_reference", label: "Receipt" },
        { key: "department_name", label: "Department" },
        { key: "order_number", label: "Order" },
        { key: "advance_received", label: "Advance Received", type: "money" },
        { key: "advance_adjusted", label: "Adjusted", type: "money" },
        { key: "balance_advance", label: "Balance", type: "money" },
        { key: "status", label: "Status" }
      ]
    };
  }
  if (view === "supplier_advances") {
    return {
      title: "Supplier Advance Report",
      rows: data.supplierAdvances || [],
      columns: [
        { key: "payment_reference", label: "Payment" },
        { key: "supplier_name", label: "Supplier" },
        { key: "advance_paid", label: "Advance Paid", type: "money" },
        { key: "advance_adjusted", label: "Adjusted", type: "money" },
        { key: "balance_advance", label: "Balance", type: "money" },
        { key: "status", label: "Status" }
      ]
    };
  }
  if (view === "advance_adjustments") {
    return {
      title: "Advance Adjustment Report",
      rows: data.advanceAdjustments || [],
      columns: [
        { key: "created_at", label: "Date" },
        { key: "adjustment_type", label: "Type" },
        { key: "party_name", label: "Party" },
        { key: "reference", label: "Invoice / Bill" },
        { key: "order_number", label: "Order" },
        { key: "adjusted_amount", label: "Adjusted", type: "money" },
        { key: "status", label: "Status" },
        { key: "reason", label: "Reason" },
        { key: "reversal_reason", label: "Reversal Reason" },
        { key: "actions", label: "Actions", type: "advance_adjustment_actions" }
      ]
    };
  }
  if (view === "allocation_audit") {
    return {
      title: "Allocation Audit Report",
      rows: data.allocationAudit || [],
      columns: [
        { key: "created_at", label: "Date" },
        { key: "allocation_type", label: "Type" },
        { key: "allocation_id", label: "Allocation" },
        { key: "action", label: "Action" },
        { key: "reason", label: "Reason" }
      ]
    };
  }
  if (view === "financial_control") {
    return {
      title: "Financial Control",
      rows: data.financialControl || [],
      columns: [
        { key: "control_area", label: "Area" },
        { key: "control", label: "Control" },
        { key: "value", label: "Value" },
        { key: "status", label: "Status" },
        { key: "status_reason", label: "Status Reason" },
        { key: "blocking_reason", label: "Blocking Reason" },
        { key: "recommended_action", label: "Recommended Action" },
        { key: "actions", label: "Drill", type: "control_drill" }
      ]
    };
  }
  if (view === "financial_years") {
    return {
      title: "Financial Years",
      rows: data.financialYears || [],
      columns: [
        { key: "financial_year_name", label: "Year" },
        { key: "start_date", label: "Start" },
        { key: "end_date", label: "End" },
        { key: "status", label: "Status" },
        { key: "closed_at", label: "Closed At" },
        { key: "locked_at", label: "Locked At" },
        { key: "updated_at", label: "Updated" },
        { key: "actions", label: "Actions", type: "fy_actions" }
      ]
    };
  }
  if (view === "opening_balances") {
    return {
      title: "Opening Balances",
      rows: data.openingBalances || [],
      columns: [
        { key: "financial_year_name", label: "Financial Year" },
        { key: "balance_type", label: "Type" },
        { key: "account_name", label: "Account" },
        { key: "opening_debit", label: "Debit", type: "money" },
        { key: "opening_credit", label: "Credit", type: "money" },
        { key: "voucher_number", label: "Opening Voucher" },
        { key: "remarks", label: "Remarks" },
        { key: "actions", label: "Drill", type: "control_drill" }
      ]
    };
  }
  if (view === "approval_queue") {
    return {
      title: "Approval Queue",
      rows: data.approvalQueue || [],
      columns: [
        { key: "module_name", label: "Module" },
        { key: "record_id", label: "Record" },
        { key: "approval_status", label: "Status" },
        { key: "status_reason", label: "Status Reason" },
        { key: "blocking_reason", label: "Blocking Reason" },
        { key: "recommended_action", label: "Recommended Action" },
        { key: "maker_name", label: "Maker" },
        { key: "checker_name", label: "Checker" },
        { key: "submitted_at", label: "Submitted" },
        { key: "approved_at", label: "Approved" },
        { key: "remarks", label: "Approval / Rejection Reason" },
        { key: "actions", label: "Drill", type: "control_drill" }
      ]
    };
  }
  if (view === "year_end_closing") {
    return {
      title: "Year-End Closing",
      rows: data.yearEndClosings || [],
      columns: [
        { key: "from_year", label: "From FY" },
        { key: "to_year", label: "To FY" },
        { key: "closing_date", label: "Closing Date" },
        { key: "trial_balance_difference", label: "TB Diff", type: "money" },
        { key: "balance_sheet_difference", label: "BS Diff", type: "money" },
        { key: "net_profit", label: "Net Profit", type: "money" },
        { key: "status", label: "Status" },
        { key: "actions", label: "Drill", type: "control_drill" }
      ]
    };
  }
  if (view === "carry_forward") {
    return {
      title: "Carry Forward Entries",
      rows: data.carryForwardEntries || [],
      columns: [
        { key: "from_year", label: "From FY" },
        { key: "to_year", label: "To FY" },
        { key: "account_name", label: "Account" },
        { key: "closing_balance", label: "Closing Balance", type: "money" },
        { key: "opening_balance_created", label: "Opening Created" },
        { key: "voucher_number", label: "Opening Voucher" },
        { key: "status", label: "Status" },
        { key: "actions", label: "Drill", type: "control_drill" }
      ]
    };
  }
  if (view === "ledger_view") {
    return {
      title: "General Ledger",
      rows: data.ledger || [],
      columns: [
        { key: "entry_date", label: "Date" },
        { key: "account_name", label: "Account" },
        { key: "voucher_number", label: "Voucher" },
        { key: "source_module", label: "Source" },
        { key: "debit", label: "Debit", type: "money" },
        { key: "credit", label: "Credit", type: "money" },
        { key: "running_balance", label: "Running", type: "money" },
        { key: "voucher_drill", label: "Voucher", type: "drill_voucher" },
        { key: "source_drill", label: "Source", type: "drill_source" }
      ]
    };
  }
  if (view === "cash_bank_ledger") {
    return {
      title: "Cash/Bank Ledger",
      rows: data.cashBank || [],
      columns: [
        { key: "transaction_date", label: "Date" },
        { key: "transaction_type", label: "Type" },
        { key: "payment_mode", label: "Mode" },
        { key: "utr_number", label: "UTR" },
        { key: "debit", label: "Receipt", type: "money" },
        { key: "credit", label: "Payment", type: "money" },
        { key: "balance", label: "Balance", type: "money" },
        { key: "voucher_drill", label: "Voucher", type: "drill_voucher" },
        { key: "source_drill", label: "Source", type: "drill_source" }
      ]
    };
  }
  if (view === "cash_book") {
    return {
      title: "Cash Book",
      rows: (data.cashBank || []).filter((row) => row.payment_mode === "Cash"),
      columns: [
        { key: "transaction_date", label: "Date" },
        { key: "transaction_type", label: "Type" },
        { key: "utr_number", label: "Reference" },
        { key: "debit", label: "Receipt", type: "money" },
        { key: "credit", label: "Payment", type: "money" },
        { key: "balance", label: "Balance", type: "money" },
        { key: "voucher_drill", label: "Voucher", type: "drill_voucher" }
      ]
    };
  }
  if (view === "bank_book") {
    return {
      title: "Bank Book",
      rows: (data.cashBank || []).filter((row) => row.payment_mode !== "Cash"),
      columns: [
        { key: "transaction_date", label: "Date" },
        { key: "transaction_type", label: "Type" },
        { key: "payment_mode", label: "Mode" },
        { key: "utr_number", label: "UTR" },
        { key: "debit", label: "Receipt", type: "money" },
        { key: "credit", label: "Payment", type: "money" },
        { key: "balance", label: "Balance", type: "money" },
        { key: "voucher_drill", label: "Voucher", type: "drill_voucher" }
      ]
    };
  }
  return buildReadOnlyReportFamilyConfig("trial_balance", data);
}
