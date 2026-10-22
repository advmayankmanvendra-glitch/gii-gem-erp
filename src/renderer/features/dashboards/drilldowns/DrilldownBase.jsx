import React, { useState } from "react";
import { readDashboardNavContext } from "./drilldownFilters.js";

export function DrilldownBase({ title, companyContext, onNavigate, loading, error, empty, emptyMessage, children }) {
  // The snapshot only carries the originating period/navigation details. The
  // company heading follows the live company context used for fetching.
  const [navContext] = useState(readDashboardNavContext);
  const companyName = companyContext?.company_name || "Company";

  return (
    <section className="page drilldown-page">
      <div className="drilldown-header">
        <button type="button" className="ghost-btn" onClick={() => onNavigate?.("dashboard")}>
          ← Back to Dashboard
        </button>
      </div>

      <div className="context-strip">
        <strong>{companyName}</strong>
        {navContext?.financialYear && <span>FY: {navContext.financialYear.label}</span>}
        {navContext?.periodLabel && <span>Period: {navContext.periodLabel}</span>}
        {navContext?.comparisonLabel && <span>Comparison: {navContext.comparisonLabel}</span>}
      </div>

      <h2 className="drilldown-title">{title}</h2>

      {loading && (
        <section className="panel loading-state">
          <strong>Loading drill-down data...</strong>
        </section>
      )}

      {error && (
        <section className="panel error-state">
          <strong>Error</strong>
          <span>{error}</span>
          <button type="button" className="ghost-btn" onClick={() => onNavigate?.("dashboard")}>Back to Dashboard</button>
        </section>
      )}

      {!loading && !error && empty && (
        <section className="panel empty-state">
          <strong>{emptyMessage}</strong>
          <div className="empty-state-actions">
            <button type="button" className="ghost-btn" onClick={() => onNavigate?.("dashboard")}>Back to Dashboard</button>
            <button type="button" className="ghost-btn" onClick={() => onNavigate?.("dashboard")}>Change Period</button>
          </div>
        </section>
      )}

      {!loading && !error && !empty && children}
    </section>
  );
}
