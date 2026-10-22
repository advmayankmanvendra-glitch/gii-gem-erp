import React, { useState, useEffect } from "react";
import { formatCurrency } from "../../../utils/formatters.js";
import { DrilldownBase } from "./DrilldownBase.jsx";

function ageingBucket(dueDate) {
  if (!dueDate) return "Unknown";
  const now = new Date();
  const due = new Date(dueDate);
  const diff = Math.floor((now - due) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "Current";
  if (diff <= 30) return "1–30 days";
  if (diff <= 60) return "31–60 days";
  if (diff <= 90) return "61–90 days";
  return "90+ days";
}

export function ReceivablesDrilldown({ apiClient, companyContext, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!apiClient) return;
    setLoading(true);
    setError(null);
    apiClient.getAccountingData(companyContext).then((result) => {
      setData(result);
      setLoading(false);
    }).catch((err) => {
      setError(err.message || "Could not load receivables data. Check the selected company, then reopen this view from the Dashboard.");
      setLoading(false);
    });
  }, [apiClient, companyContext]);

  const receivables = data?.billWiseReceivables || data?.receivables || [];
  const totalOutstanding = receivables.reduce((s, r) => s + Math.max(0, Number(r.outstanding || r.balance_due || 0)), 0);

  return (
    <DrilldownBase companyContext={companyContext} title="Outstanding Receivables" onNavigate={onNavigate} loading={loading} error={error} empty={!receivables.length} emptyMessage="No outstanding receivables.">
      <div className="drilldown-summary">
        <div className="metric-card"><strong>Total Outstanding Bills</strong><span>{receivables.length}</span></div>
        <div className="metric-card"><strong>Total Outstanding</strong><span>{formatCurrency(totalOutstanding)}</span></div>
      </div>
      <table className="drilldown-table">
        <thead>
          <tr>
            <th>Invoice #</th>
            <th>Department</th>
            <th>Invoice Date</th>
            <th>Due Date</th>
            <th>Invoice Amount</th>
            <th>Received</th>
            <th>Outstanding</th>
            <th>Ageing</th>
            <th>Days Overdue</th>
          </tr>
        </thead>
        <tbody>
          {receivables.map((r) => {
            const amount = Number(r.invoice_amount || r.billing_value || 0);
            const received = Number(r.received_amount || 0);
            const outstanding = Math.max(0, amount - received);
            const dueDate = r.due_date || r.invoice_date;
            const daysOverdue = dueDate ? Math.max(0, Math.floor((new Date() - new Date(dueDate)) / (1000 * 60 * 60 * 24))) : 0;
            return (
              <tr key={r.id}>
                <td>{r.invoice_number}</td>
                <td>{r.department_name || r.party_name || "-"}</td>
                <td>{r.invoice_date}</td>
                <td>{dueDate || "-"}</td>
                <td className="num">{formatCurrency(amount)}</td>
                <td className="num">{formatCurrency(received)}</td>
                <td className="num">{formatCurrency(outstanding)}</td>
                <td>{ageingBucket(dueDate)}</td>
                <td className="num">{daysOverdue}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </DrilldownBase>
  );
}
