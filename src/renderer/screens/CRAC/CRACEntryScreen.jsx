import React, { useEffect, useState } from "react";
import { CRACStatusCard } from "../../components/crac/CRACStatusCard.jsx";

export function CRACEntryScreen({ notify, companyContext, apiClient, onNavigate }) {
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [form, setForm] = useState({ crac_number: "", crac_date: "", crac_amount: "", issued_by: "", issuing_designation: "", department: "", remarks: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadOrders();
  }, [companyContext.company_id]);

  async function loadOrders() {
    try {
      const data = await apiClient.listRecords("supply_orders", { status: "active" });
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedOrderId) {
      notify("Please select a supply order", "error");
      return;
    }
    setSaving(true);
    try {
      await apiClient.createCracRecord({ ...form, company_id: companyContext.company_id, supply_order_id: Number(selectedOrderId), crac_status: "Generated" });
      notify("CRAC record created successfully");
      setForm({ crac_number: "", crac_date: "", crac_amount: "", issued_by: "", issuing_designation: "", department: "", remarks: "" });
      setSelectedOrderId("");
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel entry-form">
      <form onSubmit={handleSubmit}>
        <div className="panel-head"><div><h2>CRAC Entry</h2><span>Create a Consignee Receipt and Acceptance Certificate</span></div></div>
        <label className="field">Supply Order
          <select value={selectedOrderId} onChange={(e) => setSelectedOrderId(e.target.value)} required>
            <option value="">Select order...</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.order_number} - {o.institution_name || o.department_name || ""}</option>)}
          </select>
        </label>
        <div className="billing-grid-scroll" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label className="field">CRAC Number<input value={form.crac_number} onChange={(e) => setForm({ ...form, crac_number: e.target.value })} required /></label>
          <label className="field">CRAC Date<input type="date" value={form.crac_date} onChange={(e) => setForm({ ...form, crac_date: e.target.value })} required /></label>
          <label className="field">CRAC Amount<input type="number" step="0.01" value={form.crac_amount} onChange={(e) => setForm({ ...form, crac_amount: e.target.value })} /></label>
          <label className="field">Issued By<input value={form.issued_by} onChange={(e) => setForm({ ...form, issued_by: e.target.value })} /></label>
          <label className="field">Issuing Designation<input value={form.issuing_designation} onChange={(e) => setForm({ ...form, issuing_designation: e.target.value })} /></label>
          <label className="field">Department<input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></label>
        </div>
        <label className="field">Remarks<textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></label>
        <div className="button-row"><button className="primary-btn" disabled={saving}>{saving ? "Saving..." : "Create CRAC"}</button></div>
      </form>
    </section>
  );
}
