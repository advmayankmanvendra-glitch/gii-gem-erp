import React from "react";

const STATUS_LABELS = {
  pass: "Pass",
  warn: "Warning",
  fail: "Failed",
  info: "Info"
};

function HealthCheckCard({ check }) {
  const status = check?.status || "info";
  return (
    <article className={`health-card health-status-${status}`}>
      <div className="health-card-header">
        <div>
          <p className="eyebrow">{check?.severity || "normal"}</p>
          <h3>{check?.label || "Health Check"}</h3>
        </div>
        <span className={`status-badge status-${status}`}>{STATUS_LABELS[status] || status}</span>
      </div>
      <p>{check?.details || "No diagnostic detail available."}</p>
      {check?.recommendation ? <small>{check.recommendation}</small> : null}
    </article>
  );
}

export { HealthCheckCard };
