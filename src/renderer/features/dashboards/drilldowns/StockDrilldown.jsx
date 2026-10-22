import React, { useState, useEffect } from "react";
import { formatCurrency } from "../../../utils/formatters.js";
import { DrilldownBase } from "./DrilldownBase.jsx";
import { drilldownFilters } from "./drilldownFilters.js";

export function StockDrilldown({ apiClient, companyContext, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!apiClient) return;
    setLoading(true);
    setError(null);
    const filters = drilldownFilters(companyContext);
    apiClient.getDashboardCounts(filters).then((counts) => {
      return apiClient.getAccountingData(filters).then((accounting) => ({ counts, accounting }));
    }).then((result) => {
      setData(result);
      setLoading(false);
    }).catch((err) => {
      setError(err.message || "Could not load stock data. Check the selected company, then reopen this view from the Dashboard.");
      setLoading(false);
    });
  }, [apiClient, companyContext]);

  const totalValue = data?.counts?.totalStockValue || 0;
  const lowStock = data?.counts?.lowStockItems || 0;
  const itemsInStock = data?.counts?.itemsInStock || 0;

  return (
    <DrilldownBase companyContext={companyContext} title="Stock Value" onNavigate={onNavigate} loading={loading} error={error} empty={!data} emptyMessage="No stock data available.">
      <div className="drilldown-summary">
        <div className="metric-card"><strong>Stock Value</strong><span>{formatCurrency(totalValue)}</span></div>
        <div className="metric-card"><strong>Items In Stock</strong><span>{itemsInStock}</span></div>
        <div className="metric-card"><strong>Low Stock Items</strong><span>{lowStock}</span></div>
      </div>
      <div className="drilldown-actions">
        <button type="button" className="ghost-btn" onClick={() => onNavigate?.("stock_valuation")}>Stock Valuation</button>
        <button type="button" className="ghost-btn" onClick={() => onNavigate?.("stock_summary")}>Stock Summary</button>
        <button type="button" className="ghost-btn" onClick={() => onNavigate?.("low_stock")}>Low Stock Report</button>
        <button type="button" className="ghost-btn" onClick={() => onNavigate?.("inventory_dashboard")}>Inventory Dashboard</button>
      </div>
    </DrilldownBase>
  );
}
