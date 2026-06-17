import React from "react";
import { EmptyState, Icon } from "../components/common.jsx";
import { formatCurrency } from "../utils/formatters.js";

const readOnlyReportFamilyViews = new Set([
  "trial_balance",
  "profit_loss",
  "balance_sheet",
  "gst_register",
  "tds_register",
  "party_ledger",
  "department_ledger",
  "supplier_ledger",
  "bill_outstanding",
  "bill_wise_receivables",
  "bill_wise_payables",
  "receivable_ageing",
  "payable_ageing",
  "tds_reconciliation",
  "gst_tds_reconciliation",
  "party_ledger_summary",
  "party_reconciliation",
  "allocation_reconciliation"
]);

export function isReadOnlyReportFamilyView(view) {
  return readOnlyReportFamilyViews.has(view);
}

export function buildReadOnlyReportFamilyConfig(view, data = {}) {
  if (view === "party_ledger") {
    return {
      title: "Party Ledger",
      rows: data.partyLedger || [],
      columns: [
        { key: "party_type", label: "Party Type" },
        { key: "party_name", label: "Party" },
        { key: "opening_balance", label: "Opening", type: "money" },
        { key: "voucher_date", label: "Date" },
        { key: "voucher_number", label: "Voucher" },
        { key: "voucher_type", label: "Type" },
        { key: "invoice_number", label: "Invoice" },
        { key: "purchase_invoice", label: "Purchase" },
        { key: "payment_reference", label: "Payment Ref" },
        { key: "order_number", label: "Order" },
        { key: "account_name", label: "Account" },
        { key: "debit", label: "Debit", type: "money" },
        { key: "credit", label: "Credit", type: "money" },
        { key: "party_balance", label: "Party Balance", type: "money" },
        { key: "narration", label: "Narration" },
        { key: "voucher_drill", label: "Voucher", type: "drill_voucher" },
        { key: "source_drill", label: "Source", type: "drill_source" }
      ]
    };
  }
  if (view === "department_ledger") {
    return {
      title: "Department Ledger",
      rows: data.departmentLedger || [],
      columns: [
        { key: "department_name", label: "Department" },
        { key: "opening_balance", label: "Opening", type: "money" },
        { key: "debit", label: "Debit", type: "money" },
        { key: "credit", label: "Credit", type: "money" },
        { key: "running_balance", label: "Running Balance", type: "money" },
        { key: "voucher_number", label: "Voucher" },
        { key: "voucher_date", label: "Date" },
        { key: "voucher_type", label: "Type" },
        { key: "invoice_number", label: "Invoice" },
        { key: "payment_reference", label: "Payment Reference" },
        { key: "order_number", label: "Order" },
        { key: "narration", label: "Narration" },
        { key: "voucher_drill", label: "Voucher", type: "drill_voucher" },
        { key: "source_drill", label: "Source", type: "drill_source" }
      ]
    };
  }
  if (view === "supplier_ledger") {
    return {
      title: "Supplier Ledger",
      rows: data.supplierLedger || [],
      columns: [
        { key: "supplier_name", label: "Supplier" },
        { key: "opening_balance", label: "Opening", type: "money" },
        { key: "debit", label: "Debit", type: "money" },
        { key: "credit", label: "Credit", type: "money" },
        { key: "running_balance", label: "Running Balance", type: "money" },
        { key: "purchase_invoice", label: "Purchase Invoice" },
        { key: "supplier_payment_reference", label: "Payment Voucher" },
        { key: "voucher_number", label: "Voucher" },
        { key: "voucher_date", label: "Date" },
        { key: "order_number", label: "Order" },
        { key: "narration", label: "Narration" },
        { key: "voucher_drill", label: "Voucher", type: "drill_voucher" },
        { key: "source_drill", label: "Source", type: "drill_source" }
      ]
    };
  }
  if (view === "bill_wise_receivables") {
    return {
      title: "Bill-wise Receivable",
      rows: data.billWiseReceivables || [],
      columns: [
        { key: "department_name", label: "Department" },
        { key: "order_number", label: "Order" },
        { key: "invoice_number", label: "Invoice" },
        { key: "invoice_date", label: "Invoice Date" },
        { key: "invoice_amount", label: "Invoice Amount", type: "money" },
        { key: "amount_received", label: "Received", type: "money" },
        { key: "tds_deducted", label: "TDS", type: "money" },
        { key: "gst_tds_deducted", label: "GST TDS", type: "money" },
        { key: "other_deductions", label: "Other Deductions", type: "money" },
        { key: "balance_outstanding", label: "Outstanding", type: "money" },
        { key: "due_date", label: "Due Date" },
        { key: "days_outstanding", label: "Days" },
        { key: "allocation_status", label: "Allocation" },
        { key: "status", label: "Status" }
      ]
    };
  }
  if (view === "bill_wise_payables") {
    return {
      title: "Bill-wise Payable",
      rows: data.billWisePayables || [],
      columns: [
        { key: "supplier_name", label: "Supplier" },
        { key: "order_number", label: "Order" },
        { key: "purchase_invoice_number", label: "Purchase Invoice" },
        { key: "invoice_date", label: "Invoice Date" },
        { key: "invoice_amount", label: "Invoice Amount", type: "money" },
        { key: "amount_paid", label: "Paid", type: "money" },
        { key: "balance_due", label: "Balance Due", type: "money" },
        { key: "due_date", label: "Due Date" },
        { key: "days_outstanding", label: "Days" },
        { key: "allocation_status", label: "Allocation" },
        { key: "status", label: "Status" }
      ]
    };
  }
  if (view === "receivable_ageing") {
    return {
      title: "Receivable Ageing",
      rows: data.receivableAgeing || [],
      columns: [
        { key: "department_name", label: "Department" },
        { key: "invoice_number", label: "Invoice" },
        { key: "outstanding", label: "Outstanding", type: "money" },
        { key: "days_outstanding", label: "Days" },
        { key: "age_bucket", label: "Age Bucket" }
      ]
    };
  }
  if (view === "payable_ageing") {
    return {
      title: "Payable Ageing",
      rows: data.payableAgeing || [],
      columns: [
        { key: "supplier_name", label: "Supplier" },
        { key: "purchase_invoice_number", label: "Invoice" },
        { key: "outstanding", label: "Outstanding", type: "money" },
        { key: "days_outstanding", label: "Days" },
        { key: "age_bucket", label: "Age Bucket" }
      ]
    };
  }
  if (view === "tds_reconciliation") {
    return {
      title: "TDS Receivable Report",
      rows: data.tdsReconciliation || [],
      columns: [
        { key: "department_name", label: "Department" },
        { key: "invoice_number", label: "Invoice" },
        { key: "invoice_value", label: "Invoice Value", type: "money" },
        { key: "tds_deducted", label: "TDS Deducted", type: "money" },
        { key: "gst_tds_deducted", label: "GST TDS Deducted", type: "money" },
        { key: "net_payment_received", label: "Net Payment Received", type: "money" },
        { key: "outstanding", label: "Outstanding", type: "money" }
      ]
    };
  }
  if (view === "gst_tds_reconciliation") {
    return {
      title: "GST TDS Receivable Report",
      rows: data.gstTdsReconciliation || [],
      columns: [
        { key: "department_name", label: "Department" },
        { key: "invoice_number", label: "Invoice" },
        { key: "invoice_value", label: "Invoice Value", type: "money" },
        { key: "gst_tds_deducted", label: "GST TDS Deducted", type: "money" },
        { key: "net_payment_received", label: "Net Payment Received", type: "money" },
        { key: "outstanding", label: "Outstanding", type: "money" }
      ]
    };
  }
  if (view === "party_ledger_summary") {
    const summary = data.partyLedgerSummary || {};
    const topDepartments = summary.topOutstandingDepartments || [];
    const topSuppliers = summary.topOutstandingSuppliers || [];
    const rows = [
      { id: "total_receivable", metric: "Total Receivable", party: "Departments", amount: summary.totalReceivable || 0, reference: summary.oldestInvoice?.invoice_number || "-" },
      { id: "total_payable", metric: "Total Payable", party: "Suppliers", amount: summary.totalPayable || 0, reference: summary.oldestPurchaseBill?.purchase_invoice_number || "-" },
      ...topDepartments.map((row, index) => ({ id: `dept-${index}`, metric: "Top Outstanding Department", party: row.party_name, amount: row.outstanding, reference: "-" })),
      ...topSuppliers.map((row, index) => ({ id: `sup-${index}`, metric: "Top Outstanding Supplier", party: row.party_name, amount: row.outstanding, reference: "-" })),
      ...(summary.oldestInvoice ? [{ id: "oldest_invoice", metric: "Oldest Outstanding Invoice", party: summary.oldestInvoice.department_name, amount: summary.oldestInvoice.balance_outstanding, reference: summary.oldestInvoice.invoice_number }] : []),
      ...(summary.oldestPurchaseBill ? [{ id: "oldest_purchase", metric: "Oldest Outstanding Purchase Bill", party: summary.oldestPurchaseBill.supplier_name, amount: summary.oldestPurchaseBill.balance_due, reference: summary.oldestPurchaseBill.purchase_invoice_number }] : [])
    ];
    return {
      title: "Party Ledger Summary Dashboard",
      rows,
      columns: [
        { key: "metric", label: "Metric" },
        { key: "party", label: "Party" },
        { key: "amount", label: "Amount", type: "money" },
        { key: "reference", label: "Reference" }
      ]
    };
  }
  if (view === "party_reconciliation") {
    return {
      title: "Party Reconciliation Validation",
      rows: data.partyReconciliation || [],
      columns: [
        { key: "validation", label: "Validation" },
        { key: "party_type", label: "Party Type" },
        { key: "check_scope", label: "Check Scope" },
        { key: "ledger_balance", label: "Ledger Balance", type: "money" },
        { key: "subledger_balance", label: "Sub-ledger Balance", type: "money" },
        { key: "difference", label: "Difference", type: "money" },
        { key: "status", label: "Status" },
        { key: "recommended_action", label: "Recommended Action" },
        { key: "actions", label: "Drill", type: "party_reconciliation_actions" }
      ]
    };
  }
  if (view === "allocation_reconciliation") {
    return {
      title: "Allocation Reconciliation",
      rows: data.allocationReconciliation || [],
      columns: [
        { key: "type", label: "Type" },
        { key: "reference", label: "Reference" },
        { key: "party", label: "Party" },
        { key: "amount", label: "Amount", type: "money" },
        { key: "allocated", label: "Allocated", type: "money" },
        { key: "unallocated", label: "Unallocated", type: "money" },
        { key: "outstanding", label: "Outstanding", type: "money" },
        { key: "status", label: "Status" }
      ]
    };
  }
  if (view === "gst_register") {
    const output = (data.gstRegisters?.output || []).map((row, index) => ({ id: `out-${index}`, register: "Output GST", ...row }));
    const input = (data.gstRegisters?.input || []).map((row, index) => ({ id: `in-${index}`, register: "Input GST", ...row }));
    return {
      title: `GST Register - Net Payable ${formatCurrency(data.gstRegisters?.payable || 0)}`,
      rows: [...output, ...input],
      columns: [
        { key: "register", label: "Register" },
        { key: "date", label: "Date" },
        { key: "reference", label: "Reference" },
        { key: "order_number", label: "Order" },
        { key: "taxable", label: "Taxable", type: "money" },
        { key: "gst_rate", label: "GST %" },
        { key: "gst_amount", label: "GST", type: "money" },
        { key: "posting_status", label: "Posting" }
      ]
    };
  }
  if (view === "tds_register") {
    return {
      title: "TDS Register",
      rows: data.tdsRegisters || [],
      columns: [
        { key: "department_name", label: "Department" },
        { key: "invoice_number", label: "Invoice" },
        { key: "date", label: "Date" },
        { key: "allocated_amount", label: "Receipt", type: "money" },
        { key: "tds_deducted", label: "TDS", type: "money" },
        { key: "gst_tds_deducted", label: "GST TDS", type: "money" }
      ]
    };
  }
  if (view === "bill_outstanding") {
    const departmentRows = (data.billOutstanding?.departments || []).map((row, index) => ({ id: `dept-${index}`, party_type: "Department", ...row }));
    const supplierRows = (data.billOutstanding?.suppliers || []).map((row, index) => ({ id: `sup-${index}`, party_type: "Supplier", ...row }));
    return {
      title: "Bill-wise Outstanding",
      rows: [...departmentRows, ...supplierRows],
      columns: [
        { key: "party_type", label: "Type" },
        { key: "party_name", label: "Party" },
        { key: "reference", label: "Bill" },
        { key: "invoice_amount", label: "Bill Value", type: "money" },
        { key: "amount_received", label: "Received", type: "money" },
        { key: "amount_paid", label: "Paid", type: "money" },
        { key: "tds_deducted", label: "TDS", type: "money" },
        { key: "gst_tds_deducted", label: "GST TDS", type: "money" },
        { key: "balance_outstanding", label: "Balance", type: "money" }
      ]
    };
  }
  if (view === "profit_loss") {
    const summary = data.profitLoss || {};
    return {
      title: `Profit & Loss - Net ${formatCurrency(summary.netProfit || 0)}`,
      rows: summary.rows || [],
      columns: [
        { key: "account_code", label: "Code" },
        { key: "account_name", label: "Account" },
        { key: "account_type", label: "Type" },
        { key: "debit", label: "Debit", type: "money" },
        { key: "credit", label: "Credit", type: "money" },
        { key: "amount", label: "Amount", type: "money" },
        { key: "drill", label: "Drill", type: "drill_account" }
      ]
    };
  }
  if (view === "balance_sheet") {
    const summary = data.balanceSheet || {};
    return {
      title: `Balance Sheet - Assets ${formatCurrency(summary.assets || 0)} / Liabilities+Equity ${formatCurrency(summary.liabilitiesAndEquity || 0)}`,
      rows: summary.rows || [],
      columns: [
        { key: "account_code", label: "Code" },
        { key: "account_name", label: "Account" },
        { key: "account_type", label: "Type" },
        { key: "debit", label: "Debit", type: "money" },
        { key: "credit", label: "Credit", type: "money" },
        { key: "amount", label: "Amount", type: "money" },
        { key: "drill", label: "Drill", type: "drill_account" }
      ]
    };
  }
  return {
    title: "Trial Balance",
    rows: data.trialBalance || [],
    columns: [
      { key: "account_code", label: "Code" },
      { key: "account_name", label: "Account" },
      { key: "account_type", label: "Type" },
      { key: "debit", label: "Debit", type: "money" },
      { key: "credit", label: "Credit", type: "money" },
      { key: "balance", label: "Balance", type: "money" },
      { key: "drill", label: "Drill", type: "drill_account" }
    ]
  };
}

export function ReadOnlyReportFamilyTable({
  config,
  rows,
  onDrillAccount,
  onDrillVoucher,
  onDrillSource,
  onPartyReconciliationDrill
}) {
  if (!rows.length) {
    return <EmptyState title="No accounting data" note="Post vouchers or run seed data to populate this view." />;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{config.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || row.account_code || row.voucher_line_id || index}>
              {config.columns.map((column) => (
                <td key={column.key}>
                  {renderReadOnlyReportCell(row, column, { onDrillAccount, onDrillVoucher, onDrillSource, onPartyReconciliationDrill })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderReadOnlyReportCell(row, column, handlers) {
  if (column.type === "drill_account") {
    return (
      <button className="ghost-btn small-btn" type="button" onClick={() => handlers.onDrillAccount?.(row)}>
        Ledger
      </button>
    );
  }
  if (column.type === "drill_voucher") {
    return (
      <button className="ghost-btn small-btn" type="button" onClick={() => handlers.onDrillVoucher?.(row)}>
        Voucher
      </button>
    );
  }
  if (column.type === "drill_source") {
    return (
      <button className="ghost-btn small-btn" type="button" onClick={() => handlers.onDrillSource?.(row)} disabled={!row.source_module || !row.source_id}>
        Source
      </button>
    );
  }
  if (column.type === "party_reconciliation_actions") {
    return (
      <div className="row-actions">
        <button type="button" title="Open reconciliation drilldown" onClick={() => handlers.onPartyReconciliationDrill?.(row)}>
          <Icon name="file" />
        </button>
      </div>
    );
  }
  return formatReadOnlyReportCell(row[column.key], column.type);
}

function formatReadOnlyReportCell(value, type) {
  if (type === "money") return formatCurrency(Number(value || 0));
  return value ?? "-";
}
