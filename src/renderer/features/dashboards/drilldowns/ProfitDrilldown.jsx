import React, { useState, useEffect } from "react";
import { formatCurrency } from "../../../utils/formatters.js";
import { DrilldownBase } from "./DrilldownBase.jsx";
import { drilldownFilters, inFilterRange } from "./drilldownFilters.js";

export function ProfitDrilldown({ apiClient, companyContext, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!apiClient) return;
    setLoading(true);
    setError(null);
    const filters = drilldownFilters(companyContext);
    Promise.all([
      apiClient.getDashboardCounts(filters),
      apiClient.getAccountingData ? apiClient.getAccountingData(filters) : Promise.resolve(null)
    ]).then(([counts, accounting]) => {
      setData({ counts, accounting, filters });
      setLoading(false);
    }).catch((err) => {
      setError(err.message || "Could not load profitability data. Check the selected company, then reopen this view from the Dashboard.");
      setLoading(false);
    });
  }, [apiClient, companyContext]);

  const counts = data?.counts || {};
  const accounting = data?.accounting || {};
  const totalProfit = counts.totalProfit || 0;

  const invoices = (accounting.invoices || []).filter((i) => inFilterRange(i.invoice_date, data?.filters));
  const procurements = (accounting.procurements || []).filter((p) => inFilterRange(p.purchase_date, data?.filters));
  const totalRevenue = invoices.reduce((s, i) => s + Number(i.billing_value || 0), 0);
  const totalPurchase = procurements.reduce((s, p) => s + Number(p.purchase_value || 0), 0);
  const totalGst = invoices.reduce((s, i) => s + Number(i.gst_amount || 0), 0);
  const margin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : "0.00";

  return (
    <DrilldownBase companyContext={companyContext} title="Net Profit" onNavigate={onNavigate} loading={loading} error={error} empty={!invoices.length && !procurements.length} emptyMessage="No profitability data available for the selected period.">
      <div className="drilldown-summary">
        <div className="metric-card"><strong>Total Revenue</strong><span>{formatCurrency(totalRevenue)}</span></div>
        <div className="metric-card"><strong>Total Purchase Cost</strong><span>{formatCurrency(totalPurchase)}</span></div>
        <div className="metric-card"><strong>GST Impact</strong><span>{formatCurrency(totalGst)}</span></div>
        <div className="metric-card"><strong>Net Profit</strong><span>{formatCurrency(totalProfit)}</span></div>
        <div className="metric-card"><strong>Margin %</strong><span>{margin}%</span></div>
      </div>
      <h4 className="drilldown-section-title">Order-wise Profitability</h4>
      <table className="drilldown-table">
        <thead>
          <tr>
            <th>Order #</th>
            <th>Revenue</th>
            <th>Purchase Cost</th>
            <th>Net Profit</th>
            <th>Margin %</th>
          </tr>
        </thead>
        <tbody>
          {invoices.slice(0, 100).map((inv) => {
            const rev = Number(inv.billing_value || 0);
            const relatedProc = procurements.filter((p) => p.order_id === inv.order_id);
            const cost = relatedProc.reduce((s, p) => s + Number(p.purchase_value || 0), 0);
            const profit = rev - cost;
            const m = rev > 0 ? ((profit / rev) * 100).toFixed(2) : "0.00";
            const loss = profit < 0;
            return (
              <tr key={inv.id} className={loss ? "drilldown-row-loss" : ""}>
                <td>{inv.order_number || "-"}</td>
                <td className="num">{formatCurrency(rev)}</td>
                <td className="num">{formatCurrency(cost)}</td>
                <td className="num">{formatCurrency(profit)}</td>
                <td className="num">{m}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </DrilldownBase>
  );
}
