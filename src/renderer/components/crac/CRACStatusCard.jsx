import React from "react";

export function CRACStatusCard({ crac, onView, onEdit }) {
  if (!crac) {
    return (
      <section className="panel">
        <div className="panel-head"><div><h3>CRAC Status</h3><span>No CRAC record</span></div></div>
        <div className="empty-state compact"><strong>Not Available</strong><span>No CRAC has been created for this order yet.</span></div>
      </section>
    );
  }
  const statusColors = { "Not Required": "muted", Pending: "warning", Generated: "active", Rejected: "danger", Cancelled: "muted", Reissued: "warning" };
  return (
    <section className="panel">
      <div className="panel-head">
        <div><h3>CRAC Status</h3><span className={`status-pill ${statusColors[crac.crac_status] || "muted"}`}>{crac.crac_status}</span></div>
        <div className="button-row">
          {onView && <button type="button" className="ghost-btn" onClick={onView}>View CRAC</button>}
          {onEdit && <button type="button" className="ghost-btn" onClick={onEdit}>Edit CRAC</button>}
        </div>
      </div>
      <div className="metric-rows">
        <div className="metric-line"><span>CRAC Number</span><strong>{crac.crac_number || "-"}</strong></div>
        <div className="metric-line"><span>CRAC Date</span><strong>{crac.crac_date || "-"}</strong></div>
        <div className="metric-line"><span>CRAC Amount</span><strong>{crac.crac_amount || 0}</strong></div>
        <div className="metric-line"><span>Issued By</span><strong>{crac.issued_by || "-"}</strong></div>
        <div className="metric-line"><span>Designation</span><strong>{crac.issuing_designation || "-"}</strong></div>
        <div className="metric-line"><span>Department</span><strong>{crac.department || "-"}</strong></div>
      </div>
    </section>
  );
}
