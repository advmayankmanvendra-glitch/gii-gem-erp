import React, { useState, useEffect } from "react";
import { formatCurrency } from "../../../utils/formatters.js";
import { DrilldownBase } from "./DrilldownBase.jsx";
import { drilldownFilters } from "./drilldownFilters.js";

export function GstDrilldown({ apiClient, companyContext, onNavigate }) {
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
      setError(err.message || "Could not load GST data. Check the selected company, then reopen this view from the Dashboard.");
      setLoading(false);
    });
  }, [apiClient, companyContext]);

  const gst = data?.gstSummary || {};
  const outputGst = Number(gst.outputGst || 0);
  const inputGst = Number(gst.inputGst || 0);
  const netPayable = outputGst - inputGst;

  return (
    <DrilldownBase companyContext={companyContext} title="GST Position" onNavigate={onNavigate} loading={loading} error={error} empty={!data} emptyMessage="No GST data available for the selected period.">
      <div className="drilldown-summary">
        <div className="metric-card"><strong>Output GST</strong><span>{formatCurrency(outputGst)}</span></div>
        <div className="metric-card"><strong>Input GST</strong><span>{formatCurrency(inputGst)}</span></div>
        <div className="metric-card"><strong>Net GST Payable</strong><span>{formatCurrency(netPayable)}</span></div>
        <div className="metric-card"><strong>GST Impact on Profitability</strong><span>{formatCurrency(Number(gst.gstImpactOnProfitability || 0))}</span></div>
      </div>
      <div className="drilldown-actions">
        <button type="button" className="ghost-btn" onClick={() => onNavigate?.("gst_register")}>Open GST Register</button>
        <button type="button" className="ghost-btn" onClick={() => onNavigate?.("gst")}>GST Summary</button>
      </div>
    </DrilldownBase>
  );
}
