import React, { useEffect, useState } from "react";
import { ReportToolbar, ReportActionButtons, ReportSelectFilter } from "../../components/forms/index.jsx";
import { CRACTimeline } from "../../components/crac/CRACTimeline.jsx";
import { CRACStatusCard } from "../../components/crac/CRACStatusCard.jsx";

export function CRACTrackerScreen({ notify, companyContext, apiClient, onNavigate }) {
  const [records, setRecords] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRecords();
  }, [companyContext.company_id, statusFilter]);

  async function loadRecords() {
    setLoading(true);
    try {
      const filters = { ...companyContext };
      if (statusFilter) filters.crac_status = statusFilter;
      const data = await apiClient.listCracRecords(filters);
      setRecords(Array.isArray(data) ? data : []);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  function getTimeline(record) {
    return [
      { key: "pending", label: "Pending", status: record.crac_status === "Pending" ? "active" : "completed", icon: "○", note: record.crac_status === "Pending" ? "Awaiting generation" : "Completed" },
      { key: "generated", label: "Generated", status: record.crac_status === "Generated" ? "active" : record.crac_status === "Rejected" ? "warning" : "completed", icon: "●", note: record.crac_number || "Not yet" },
      { key: "accepted", label: "Invoice & Payment", status: record.crac_status === "Generated" ? "active" : "warning", icon: "○", note: record.invoice_number || "Not yet billed" }
    ];
  }

  return (
    <section className="panel entry-form">
      <ReportToolbar title="CRAC Tracker" note={`${records.length} record(s)`}>
        <ReportSelectFilter label="Status" value={statusFilter} onChange={setStatusFilter}>
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Generated">Generated</option>
          <option value="Rejected">Rejected</option>
          <option value="Cancelled">Cancelled</option>
          <option value="Reissued">Reissued</option>
        </ReportSelectFilter>
        <ReportActionButtons onRefresh={loadRecords} />
      </ReportToolbar>
      {loading ? (
        <div className="empty-state compact"><strong>Loading...</strong><span>Fetching CRAC tracker data</span></div>
      ) : records.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {records.map((record) => (
            <div key={record.id} className="panel" style={{ padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <strong>{record.order_number}</strong>
                  <small style={{ display: "block", color: "#536477" }}>{record.department_name || record.department}</small>
                  <small>{record.crac_number && `CRAC: ${record.crac_number} (${record.crac_date})`}</small>
                </div>
                <span className={`status-pill ${record.crac_status === "Generated" ? "active" : record.crac_status === "Pending" ? "warning" : "muted"}`}>{record.crac_status}</span>
              </div>
              <CRACTimeline steps={getTimeline(record)} />
              {record.crac_status === "Generated" && onNavigate && (
                <div className="button-row">
                  <button type="button" className="ghost-btn" onClick={() => onNavigate("payment_readiness")}>View Payment Readiness</button>
                  <button type="button" className="ghost-btn" onClick={() => onNavigate("order_closure_tracking")}>View Closure</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state compact"><strong>No CRAC Records</strong><span>No CRAC records match the current filters.</span></div>
      )}
    </section>
  );
}
