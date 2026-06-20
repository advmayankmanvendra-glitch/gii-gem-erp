import React from "react";

export function ClosureChecklist({ checks, percentage, ready, onMarkClosed }) {
  if (!checks?.length) {
    return (
      <section className="panel">
        <div className="panel-head"><div><h3>Order Closure</h3><span>No closure data available</span></div></div>
      </section>
    );
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <div><h3>Order Closure Checklist</h3><span>Closure {ready ? "Ready" : "In Progress"}</span></div>
        {ready && onMarkClosed && <button type="button" className="primary-btn" onClick={onMarkClosed}>Mark Operationally Closed</button>}
      </div>
      <div className="closure-progress" style={{ margin: "12px 0", background: "#e8edf1", borderRadius: 8, height: 20, overflow: "hidden" }}>
        <div style={{ width: `${percentage}%`, background: percentage === 100 ? "#087240" : "#f59a23", height: "100%", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>{percentage}%</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {checks.map((check) => (
          <div key={check.key} className="operations-closure-grid" style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: check.ready ? "#e8f4ee" : "#fff3e1", borderRadius: 6 }}>
            <strong>{check.label}</strong>
            <span style={{ color: check.ready ? "#087240" : "#b95120" }}>{check.ready ? "Yes" : "No"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
