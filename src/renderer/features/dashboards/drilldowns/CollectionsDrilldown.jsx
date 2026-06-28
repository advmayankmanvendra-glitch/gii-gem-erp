import React, { useState, useEffect } from "react";
import { formatCurrency } from "../../../utils/formatters.js";
import { DrilldownBase } from "./DrilldownBase.jsx";

export function CollectionsDrilldown({ apiClient, companyContext, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!apiClient) return;
    setLoading(true);
    apiClient.getAccountingData(companyContext).then((result) => {
      setData(result);
      setLoading(false);
    }).catch((err) => {
      setError(err.message || "Failed to load collection data");
      setLoading(false);
    });
  }, [apiClient, companyContext]);

  const payments = data?.payments || [];
  const totalCollected = payments.reduce((s, p) => s + Number(p.payment_amount || 0), 0);
  const allocated = payments.filter((p) => Number(p.allocated_amount || 0) > 0).length;

  return (
    <DrilldownBase title="Collections This Month" onNavigate={onNavigate} loading={loading} error={error} empty={!payments.length} emptyMessage="No receipts collected in the selected period.">
      <div className="drilldown-summary">
        <div className="metric-card"><strong>Total Receipts</strong><span>{payments.length}</span></div>
        <div className="metric-card"><strong>Total Collected</strong><span>{formatCurrency(totalCollected)}</span></div>
        <div className="metric-card"><strong>Allocated</strong><span>{allocated}/{payments.length}</span></div>
        <div className="metric-card"><strong>Unallocated</strong><span>{formatCurrency(payments.reduce((s, p) => s + Math.max(0, Number(p.payment_amount || 0) - Number(p.allocated_amount || 0)), 0))}</span></div>
      </div>
      <table className="drilldown-table">
        <thead>
          <tr>
            <th>Receipt #</th>
            <th>Date</th>
            <th>Department</th>
            <th>Mode</th>
            <th>Bank/Cash</th>
            <th>Amount</th>
            <th>Allocated</th>
            <th>Unallocated</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => {
            const amount = Number(p.payment_amount || 0);
            const alloc = Number(p.allocated_amount || 0);
            return (
              <tr key={p.id}>
                <td>{p.utr_number || `RCP-${p.id}`}</td>
                <td>{p.payment_date}</td>
                <td>{p.department_name || "-"}</td>
                <td>{p.payment_mode || p.mode || "Bank"}</td>
                <td>{p.bank_name || "-"}</td>
                <td className="num">{formatCurrency(amount)}</td>
                <td className="num">{formatCurrency(alloc)}</td>
                <td className="num">{formatCurrency(Math.max(0, amount - alloc))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </DrilldownBase>
  );
}
