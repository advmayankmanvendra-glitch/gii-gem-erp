import React, { useEffect, useState } from "react";
import { ReportToolbar, ReportActionButtons } from "../../components/forms/index.jsx";
import { ClosureChecklist } from "../../components/crac/ClosureChecklist.jsx";
import { sortRecordsBy } from "../../utils/optionSorting.js";

export function OrderClosureScreen({ notify, companyContext, apiClient, onNavigate }) {
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [closure, setClosure] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadOrders();
  }, [companyContext.company_id]);

  async function loadOrders() {
    setLoading(true);
    try {
      const data = await apiClient.listRecords("supply_orders", { status: "active" });
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function computeClosure() {
    if (!selectedOrderId) return;
    setLoading(true);
    try {
      const data = await apiClient.computeOrderClosure(Number(selectedOrderId));
      setClosure(data);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedOrderId) computeClosure();
    else setClosure(null);
  }, [selectedOrderId]);

  async function handleMarkClosed() {
    try {
      await apiClient.markOrderOperationallyClosed(Number(selectedOrderId));
      notify("Order marked as operationally closed");
      computeClosure();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <section className="panel entry-form">
      <ReportToolbar title="Order Closure Tracking" note={closure ? `${closure.percentage}%` : "Select order"}>
        <ReportActionButtons onRefresh={computeClosure} />
      </ReportToolbar>
      <label className="field">Supply Order
        <select value={selectedOrderId} onChange={(e) => setSelectedOrderId(e.target.value)}>
          <option value="">Select order...</option>
          {sortRecordsBy(orders, (order) => `${order.order_number} ${order.institution_name || order.department_name || ""}`).map((o) => <option key={o.id} value={o.id}>{o.order_number} - {o.institution_name || o.department_name || ""}</option>)}
        </select>
      </label>
      {loading ? (
        <div className="empty-state compact"><strong>Loading...</strong><span>Computing closure checklist</span></div>
      ) : closure ? (
        <ClosureChecklist checks={closure.checks} percentage={closure.percentage} ready={closure.ready} onMarkClosed={handleMarkClosed} />
      ) : (
        <div className="empty-state compact"><strong>Select Order</strong><span>Choose a supply order to view its closure checklist and progress.</span></div>
      )}
    </section>
  );
}
