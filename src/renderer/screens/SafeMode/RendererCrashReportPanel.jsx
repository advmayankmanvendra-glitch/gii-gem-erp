import React from "react";

export function RendererCrashReportPanel({ crashes, onClear }) {
  const rows = Array.isArray(crashes) ? crashes : [];
  return (
    <section className="panel crash-report-panel">
      <div className="panel-head">
        <div>
          <h2>Renderer Crash Registry</h2>
          <p>Recent renderer failures captured locally for troubleshooting.</p>
        </div>
        <button type="button" className="secondary-btn" onClick={onClear} disabled={!rows.length}>Clear Registry</button>
      </div>
      {!rows.length ? (
        <div className="empty-state">No renderer crashes recorded.</div>
      ) : (
        <div className="crash-report-list">
          {rows.map((item) => (
            <article className="crash-report-row" key={item.id}>
              <div>
                <strong>{item.section || "renderer"}</strong>
                <span>{new Date(item.timestamp).toLocaleString("en-IN")}</span>
              </div>
              <p>{item.message}</p>
              <small>View: {item.currentView || "unknown"} | Company: {item.company || "Unselected"} | User: {item.user || "Unknown"}</small>
              {item.componentStack ? <pre>{item.componentStack}</pre> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
