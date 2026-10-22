import React, { useState, useEffect } from "react";
import { formatCurrency } from "../../../utils/formatters.js";
import { DrilldownBase } from "./DrilldownBase.jsx";
import { drilldownFilters, inFilterRange } from "./drilldownFilters.js";

export function BillingDrilldown({ apiClient, companyContext, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!apiClient) return;
    setLoading(true);
    setError(null);
    const filters = drilldownFilters(companyContext);
    apiClient.getAccountingData(filters).then((result) => {
      setData({ ...result, filters });
      setLoading(false);
    }).catch((err) => {
      setError(err.message || "Could not load billing data. Check the selected company, then reopen this view from the Dashboard.");
      setLoading(false);
    });
  }, [apiClient, companyContext]);

  const invoices = (data?.invoices || []).filter((i) => inFilterRange(i.invoice_date, data?.filters));

  const totalTaxable = invoices.reduce((s, i) => s + Number(i.taxable_value || 0), 0);
  const totalGst = invoices.reduce((s, i) => s + Number(i.gst_amount || 0), 0);
  const totalGross = invoices.reduce((s, i) => s + Number(i.billing_value || 0), 0);
  const reconciled = invoices.filter((i) => Number(i.received_amount || 0) >= Number(i.billing_value || 0)).length;

  return (
    <DrilldownBase companyContext={companyContext} title="Billing This Month" onNavigate={onNavigate} loading={loading} error={error} empty={!invoices.length} emptyMessage="No invoices raised in the selected period.">
      <div className="drilldown-summary">
        <div className="metric-card"><strong>Total Invoices</strong><span>{invoices.length}</span></div>
        <div className="metric-card"><strong>Total Taxable Value</strong><span>{formatCurrency(totalTaxable)}</span></div>
        <div className="metric-card"><strong>Total GST</strong><span>{formatCurrency(totalGst)}</span></div>
        <div className="metric-card"><strong>Gross Invoice Value</strong><span>{formatCurrency(totalGross)}</span></div>
        <div className="metric-card"><strong>Reconciled</strong><span>{reconciled}/{invoices.length}</span></div>
      </div>
      <table className="drilldown-table">
        <thead>
          <tr>
            <th>Invoice #</th>
            <th>Date</th>
            <th>Department</th>
            <th>Taxable Value</th>
            <th>GST</th>
            <th>Gross Value</th>
            <th>Received</th>
            <th>Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const received = Number(inv.received_amount || 0);
            const gross = Number(inv.billing_value || 0);
            const outstanding = Math.max(0, gross - received);
            return (
              <tr key={inv.id}>
                <td>{inv.invoice_number}</td>
                <td>{inv.invoice_date}</td>
                <td>{inv.department_name || "-"}</td>
                <td className="num">{formatCurrency(inv.taxable_value || 0)}</td>
                <td className="num">{formatCurrency(inv.gst_amount || 0)}</td>
                <td className="num">{formatCurrency(gross)}</td>
                <td className="num">{formatCurrency(received)}</td>
                <td className="num">{formatCurrency(outstanding)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </DrilldownBase>
  );
}
