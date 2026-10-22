import React, { useState, useEffect } from "react";
import { formatCurrency } from "../../../utils/formatters.js";
import { DrilldownBase } from "./DrilldownBase.jsx";
import { drilldownFilters } from "./drilldownFilters.js";

export function TrialBalanceDrilldown({ apiClient, companyContext, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!apiClient) return;
    setLoading(true);
    setError(null);
    apiClient.getAccountingData(drilldownFilters(companyContext)).then((result) => {
      setData(result);
      setLoading(false);
    }).catch((err) => {
      setError(err.message || "Could not load trial balance data. Check the selected company, then reopen this view from the Dashboard.");
      setLoading(false);
    });
  }, [apiClient, companyContext]);

  const tb = data?.trialBalance || [];
  const totalDebit = tb.reduce((s, r) => s + Number(r.debit || 0), 0);
  const totalCredit = tb.reduce((s, r) => s + Number(r.credit || 0), 0);
  const difference = Math.round((totalDebit - totalCredit) * 100) / 100;

  return (
    <DrilldownBase companyContext={companyContext} title="Trial Balance" onNavigate={onNavigate} loading={loading} error={error} empty={!tb.length} emptyMessage="No trial balance data available.">
      <div className="drilldown-summary">
        <div className="metric-card"><strong>Total Debit</strong><span>{formatCurrency(totalDebit)}</span></div>
        <div className="metric-card"><strong>Total Credit</strong><span>{formatCurrency(totalCredit)}</span></div>
        <div className={`metric-card highlight-${difference === 0 ? "ok" : "error"}`}><strong>Difference</strong><span>{difference === 0 ? "Balanced ✓" : formatCurrency(difference)}</span></div>
      </div>
      <table className="drilldown-table">
        <thead>
          <tr>
            <th>Account</th>
            <th>Debit</th>
            <th>Credit</th>
          </tr>
        </thead>
        <tbody>
          {tb.map((row, i) => (
            <tr key={row.id || i}>
              <td>{row.account_name}</td>
              <td className="num">{formatCurrency(row.debit || 0)}</td>
              <td className="num">{formatCurrency(row.credit || 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DrilldownBase>
  );
}
