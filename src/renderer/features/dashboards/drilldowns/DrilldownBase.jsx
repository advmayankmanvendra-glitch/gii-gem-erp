import React, { useEffect, useState } from "react";

export function DrilldownBase({ title, onNavigate, loading, error, empty, emptyMessage, children }) {
  const [navContext, setNavContext] = useState(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("gii-gem-dashboard-nav-context");
      if (raw) setNavContext(JSON.parse(raw));
    } catch {}
  }, []);

  return (
    <section className="page drilldown-page">
      <div className="drilldown-header">
        <button type="button" className="ghost-btn" onClick={() => onNavigate?.("dashboard")}>
          ← Back to Dashboard
        </button>
      </div>

      {navContext && (
        <div className="context-strip">
          <strong>{navContext.company?.company_name || "Company"}</strong>
          {navContext.financialYear && <span>FY: {navContext.financialYear.label}</span>}
          {navContext.periodLabel && <span>Period: {navContext.periodLabel}</span>}
          {navContext.comparisonLabel && <span>Comparison: {navContext.comparisonLabel}</span>}
        </div>
      )}

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
