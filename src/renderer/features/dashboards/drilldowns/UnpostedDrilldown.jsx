import React, { useState, useEffect } from "react";
import { formatCurrency } from "../../../utils/formatters.js";
import { DrilldownBase } from "./DrilldownBase.jsx";

export function UnpostedDrilldown({ apiClient, companyContext, onNavigate }) {
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
      setError(err.message || "Failed to load unposted voucher data");
      setLoading(false);
    });
  }, [apiClient, companyContext]);

  const guided = data?.guidedVouchers || [];
  const unposted = guided.filter((v) => !v.posted || v.status === "draft");

  return (
    <DrilldownBase title="Unposted Vouchers" onNavigate={onNavigate} loading={loading} error={error} empty={!unposted.length} emptyMessage="No unposted vouchers.">
      <div className="drilldown-summary">
        <div className="metric-card"><strong>Unposted</strong><span>{unposted.length}</span></div>
        <div className="metric-card"><strong>Total Guided Vouchers</strong><span>{guided.length}</span></div>
      </div>
      <table className="drilldown-table">
        <thead>
          <tr>
            <th>Voucher #</th>
            <th>Date</th>
            <th>Type</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Required Action</th>
          </tr>
        </thead>
        <tbody>
          {unposted.slice(0, 200).map((v) => (
            <tr key={v.id}>
              <td>{v.voucher_number || `GV-${v.id}`}</td>
              <td>{v.voucher_date || v.created_at}</td>
              <td>{v.voucher_type || v.type || "General"}</td>
              <td className="num">{formatCurrency(v.total_amount || v.amount || 0)}</td>
              <td>{v.status || (v.posted ? "Posted" : "Draft")}</td>
              <td>{v.status === "draft" ? "Complete and post" : v.posted ? "Posted" : "Review and post"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="drilldown-note">Open the <button type="button" className="link-btn" onClick={() => onNavigate?.("posting_control")}>Posting Queue</button> for full posting status across all modules.</p>
    </DrilldownBase>
  );
}
