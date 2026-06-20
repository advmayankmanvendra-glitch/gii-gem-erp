import React from "react";

export function CRACTimeline({ steps }) {
  if (!steps?.length) {
    return (
      <section className="panel">
        <div className="panel-head"><div><h3>CRAC Timeline</h3><span>No timeline available</span></div></div>
      </section>
    );
  }
  return (
    <section className="panel">
      <div className="panel-head"><div><h3>CRAC Timeline</h3><span>{steps.length} step(s)</span></div></div>
      <div className="operations-timeline">
        {steps.map((step, index) => (
          <div key={step.key || index} className={`operations-timeline-step ${step.status === "completed" ? "complete" : step.status === "active" ? "active" : step.status === "warning" ? "warning" : ""}`}>
            <span className="timeline-icon">{step.icon || "○"}</span>
            <strong>{step.label}</strong>
            <small>{step.note || step.status}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
