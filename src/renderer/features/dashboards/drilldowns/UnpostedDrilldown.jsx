import React, { useState, useEffect } from "react";
import { formatCurrency } from "../../../utils/formatters.js";
import { DrilldownBase } from "./DrilldownBase.jsx";
import { drilldownFilters } from "./drilldownFilters.js";

export function UnpostedDrilldown({ apiClient, companyContext, onNavigate }) {
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
      setError(err.message || "Could not load unposted voucher data. Check the selected company, then reopen this view from the Dashboard.");
      setLoading(false);
    });
  }, [apiClient, companyContext]);

  // Same source and rule as the dashboard card (financialControlReport "unposted"):
  // every posting-queue record whose posting_status is not Posted or Reversed.
  const queue = data?.postingControl || [];
  const unposted = queue.filter((row) => !["Posted", "Reversed"].includes(row.posting_status));

  return (
    <DrilldownBase companyContext={companyContext} title="Unposted Vouchers" onNavigate={onNavigate} loading={loading} error={error} empty={!unposted.length} emptyMessage="No unposted vouchers.">
      <div className="drilldown-summary">
        <div className="metric-card"><strong>Unposted</strong><span>{unposted.length}</span></div>
        <div className="metric-card"><strong>Total Posting Queue Records</strong><span>{queue.length}</span></div>
      </div>
      <table className="drilldown-table">
        <thead>
          <tr>
            <th>Reference</th>
            <th>Date</th>
            <th>Module</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Required Action</th>
          </tr>
        </thead>
        <tbody>
          {unposted.slice(0, 200).map((row) => (
            <tr key={row.id}>
              <td>{row.reference || `${row.module} ${row.record_id}`}</td>
              <td>{row.record_date}</td>
              <td>{row.module}</td>
              <td className="num">{formatCurrency(row.amount || 0)}</td>
              <td>{row.posting_status}</td>
              <td>{row.recommended_action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="drilldown-note">Open the <button type="button" className="link-btn" onClick={() => onNavigate?.("posting_control")}>Posting Queue</button> for full posting status across all modules.</p>
    </DrilldownBase>
  );
}
