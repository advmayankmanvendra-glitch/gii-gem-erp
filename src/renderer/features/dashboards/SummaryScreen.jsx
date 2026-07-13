import { useEffect, useState } from "react";
import { SummaryTable } from "../../components/common.jsx";
import { AddRecordPanel } from "../../components/panels/AddRecordPanel.jsx";
import { PhasePanel } from "../../components/panels/SmallComponents.jsx";
import {
  AccountingReportsIndex, CashFlowSummary, EmployeePerformanceSummary, GstSummary
} from "../../screens/ReadOnlySummaryReports.jsx";

export function SummaryScreen({ view, notify, companyContext, onNavigate, api }) {
  const [rows, setRows] = useState([]);
  const [accounting, setAccounting] = useState(null);

  useEffect(() => {
    Promise.all([api.getProfitability(companyContext), api.getAccountingData(companyContext)])
      .then(([profitRows, accountingRows]) => {
        setRows(profitRows);
        setAccounting(accountingRows);
      })
      .catch((error) => notify(error.message, "error"));
  }, [view, companyContext?.company_id, companyContext?.company_scope]);

  if (view === "employee_performance") {
    return <EmployeePerformanceSummary rows={rows} />;
  }

  if (view === "receivables") {
    return (
      <section className="page">
        <AddRecordPanel api={api} table="receivables" title="Receivables" notify={notify} records={accounting?.receivables || []}>
          <PhasePanel title="Receivables are generated from billing and payment allocation" note="Use Billing and Payments for accounting postings. Upload supporting documents here." />
        </AddRecordPanel>
        <SummaryTable title="Receivable Ledger" rows={(accounting?.receivables || []).map((row) => ({ name: row.invoice_number, invoice: row.invoice_amount, received: row.amount_received, tds: row.tds_deducted + row.gst_tds_deducted, outstanding: row.balance_outstanding, days: row.days_outstanding }))} columns={["invoice", "received", "tds", "outstanding", "days"]} />
        <div className="workflow-note" style={{ marginTop: 8 }}><button className="ghost-btn" type="button" onClick={() => onNavigate && onNavigate("bill_wise_receivables")}>View Full Receivables Report</button></div>
      </section>
    );
  }

  if (view === "payables") {
    return (
      <section className="page">
        <AddRecordPanel api={api} table="payables" title="Payables" notify={notify} records={accounting?.payables || []}>
          <PhasePanel title="Payables are generated from procurement and supplier payments" note="Use Procurement and supplier payment workflows for accounting postings. Upload supporting documents here." />
        </AddRecordPanel>
        <SummaryTable title="Supplier Payable Ledger" rows={(accounting?.payables || []).map((row) => ({ name: `${row.supplier_name} / ${row.purchase_invoice_number}`, purchase: row.purchase_value, paid: row.amount_paid, due: row.balance_due }))} columns={["purchase", "paid", "due"]} />
        <div className="workflow-note" style={{ marginTop: 8 }}><button className="ghost-btn" type="button" onClick={() => onNavigate && onNavigate("bill_wise_payables")}>View Full Payables Report</button></div>
      </section>
    );
  }

  if (view === "cash_flow") {
    return <CashFlowSummary accounting={accounting} onNavigate={onNavigate} />;
  }

  if (view === "gst") {
    return <GstSummary accounting={accounting} onNavigate={onNavigate} />;
  }

  return <AccountingReportsIndex accounting={accounting} onNavigate={onNavigate} />;
}
