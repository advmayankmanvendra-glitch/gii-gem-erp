import React, { useEffect, useState } from "react";
import { ReportToolbar, ReportActionButtons, ReportSelectFilter, ReportDateFilters } from "../../components/forms/index.jsx";
import { PaymentReadinessTable } from "../../components/crac/PaymentReadinessTable.jsx";

export function PaymentReadinessScreen({ notify, companyContext, apiClient, onNavigate }) {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ crac_status: "", date_from: "", date_to: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadReport();
  }, [companyContext.company_id]);

  async function loadReport() {
    setLoading(true);
    try {
      const data = await apiClient.getPaymentReadinessReport({ ...companyContext, ...filters });
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel entry-form">
      <ReportToolbar title="Payment Readiness Report" note={`${rows.length} order(s)`}>
        <ReportSelectFilter label="CRAC Status" value={filters.crac_status} onChange={(v) => setFilters({ ...filters, crac_status: v })}>
          <option value="">All</option>
          <option value="Not Required">Not Required</option>
          <option value="Pending">Pending</option>
          <option value="Generated">Generated</option>
          <option value="Rejected">Rejected</option>
        </ReportSelectFilter>
        <ReportDateFilters dateFrom={filters.date_from} dateTo={filters.date_to} onDateFromChange={(v) => setFilters((prev) => ({ ...prev, date_from: v }))} onDateToChange={(v) => setFilters((prev) => ({ ...prev, date_to: v }))} onPresetChange={(date_from, date_to) => setFilters((prev) => ({ ...prev, date_from, date_to }))} />
        <ReportActionButtons onRefresh={loadReport} />
      </ReportToolbar>
      {loading ? (
        <div className="empty-state compact"><strong>Loading...</strong><span>Fetching payment readiness data</span></div>
      ) : (
        <PaymentReadinessTable rows={rows} onNavigate={onNavigate} />
      )}
    </section>
  );
}
