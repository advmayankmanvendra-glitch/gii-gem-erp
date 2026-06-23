import React, { useEffect, useState } from "react";
import { CRACStatusCard } from "../../components/crac/CRACStatusCard.jsx";
import { CRACTimeline } from "../../components/crac/CRACTimeline.jsx";
import { CRACDocumentPanel } from "../../components/crac/CRACDocumentPanel.jsx";
import { ReportToolbar, ReportActionButtons } from "../../components/forms/index.jsx";

export function CRACManagementScreen({ notify, companyContext, apiClient, onNavigate }) {
  const [cracRecords, setCracRecords] = useState([]);
  const [selectedCrac, setSelectedCrac] = useState(null);
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    loadCracRecords();
  }, [companyContext.company_id]);

  async function loadCracRecords() {
    setLoading(true);
    try {
      const data = await apiClient.listCracRecords(companyContext);
      setCracRecords(Array.isArray(data) ? data : []);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function loadDocuments(cracRecord) {
    try {
      const data = await apiClient.listDocuments({ module: "crac", linked_record_id: cracRecord.id, company_id: cracRecord.company_id || companyContext.company_id });
      setDocuments(Array.isArray(data) ? data : []);
    } catch {
      setDocuments([]);
    }
  }

  function viewCracDetails(record) {
    setSelectedCrac(record);
    loadDocuments(record);
  }

  const timelineSteps = selectedCrac
    ? [
        { key: "pending", label: "CRAC Pending", status: selectedCrac.crac_status === "Pending" ? "active" : "completed", icon: "○" },
        { key: "generated", label: "CRAC Generated", status: selectedCrac.crac_status === "Generated" ? "active" : selectedCrac.crac_status === "Pending" ? "warning" : "completed", icon: "●" },
        { key: "accepted", label: "Invoice & Payment", status: selectedCrac.crac_status === "Generated" ? "active" : "warning", icon: "○" }
      ]
    : [];

  return (
    <section className="panel entry-form">
      <ReportToolbar title="CRAC Management" note={`${cracRecords.length} record(s)`}>
        <ReportActionButtons onRefresh={loadCracRecords} />
      </ReportToolbar>
      {loading ? (
        <div className="empty-state compact"><strong>Loading...</strong><span>Fetching CRAC records</span></div>
      ) : (
        <div className="billing-layout" style={{ gridTemplateColumns: "1fr 1fr", gap: 16, display: "grid" }}>
          <div>
            {cracRecords.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {cracRecords.map((record) => (
                  <div key={record.id} className="panel" style={{ cursor: "pointer", padding: 12 }} onClick={() => viewCracDetails(record)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <strong>{record.order_number}</strong>
                        <small style={{ display: "block", color: "#536477" }}>{record.department_name || record.department}</small>
                      </div>
                      <span className={`status-pill ${record.crac_status === "Generated" ? "active" : record.crac_status === "Pending" ? "warning" : "muted"}`}>{record.crac_status}</span>
                    </div>
                    {record.crac_number && <small>CRAC: {record.crac_number} - {record.crac_date}</small>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state compact"><strong>No CRAC Records</strong><span>CRAC records will appear here once created from supply orders.</span></div>
            )}
          </div>
          <div>
            {selectedCrac ? (
              <>
                <CRACStatusCard crac={selectedCrac} onView={() => onNavigate && onNavigate("crac_entry")} />
                <div style={{ marginTop: 12 }}><CRACTimeline steps={timelineSteps} /></div>
                <CRACDocumentPanel
                  documents={documents}
                  onView={(doc) => apiClient.viewDocument(doc.id).catch((e) => notify(e.message, "error"))}
                  onDownload={(doc) => apiClient.downloadDocument(doc.id).then((r) => { if (!r?.canceled) notify("Document downloaded"); }).catch((e) => notify(e.message, "error"))}
                />
              </>
            ) : (
              <div className="empty-state compact"><strong>Select a CRAC Record</strong><span>Click a record on the left to view its details and timeline.</span></div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
