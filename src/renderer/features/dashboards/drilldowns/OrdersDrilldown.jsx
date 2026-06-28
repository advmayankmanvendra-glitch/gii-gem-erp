import React, { useState, useEffect } from "react";
import { formatCurrency } from "../../../utils/formatters.js";
import { DrilldownBase } from "./DrilldownBase.jsx";

function pendingReason(order) {
  const status = (order.order_status || "").toLowerCase();
  const lifecycle = (order.current_lifecycle_stage || "").toLowerCase();
  if (status === "closed" || status === "fully received") return "None";
  if (!lifecycle || lifecycle === "order_received") return "Procurement Pending";
  if (lifecycle === "procured") return "Stock Not Available";
  if (lifecycle === "stock_issued") return "Delivery Pending";
  if (lifecycle === "delivered") return "Billing Pending";
  if (lifecycle === "billed") return "Collection Pending";
  if (!order.crac_status || order.crac_status === "Pending") return "CRAC Pending";
  if (order.crac_status === "Generated" && !order.operationally_closed) return "Closure Pending";
  return status || "Unknown";
}

export function OrdersDrilldown({ apiClient, companyContext, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!apiClient) return;
    setLoading(true);
    apiClient.getDashboardCounts(companyContext).then((counts) => {
      setData({ counts });
      setLoading(false);
    }).catch((err) => {
      setError(err.message || "Failed to load orders data");
      setLoading(false);
    });
  }, [apiClient, companyContext]);

  return (
    <DrilldownBase title="Orders Pending" onNavigate={onNavigate} loading={loading} error={error} empty={!data} emptyMessage="No pending orders.">
      <div className="drilldown-summary">
        <div className="metric-card"><strong>Active Orders</strong><span>{data?.counts?.activeOrders || 0}</span></div>
        <div className="metric-card"><strong>Total Orders</strong><span>{data?.counts?.totalOrders || 0}</span></div>
      </div>
      <p className="drilldown-note">Detailed order-level lifecycle tracking is available in the <strong>Order Lifecycle</strong> report. Pending reason is inferred from the current lifecycle stage.</p>
      <p className="drilldown-note">To view specific pending orders with full lifecycle details, open <button type="button" className="link-btn" onClick={() => onNavigate?.("order_lifecycle")}>Order Lifecycle</button>.</p>
    </DrilldownBase>
  );
}
