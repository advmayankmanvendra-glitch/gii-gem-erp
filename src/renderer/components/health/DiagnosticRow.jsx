import React from "react";

function DiagnosticRow({ label, value, hint }) {
  const displayValue = value || "Not available";
  return (
    <div className="health-diagnostic-row">
      <span className="health-diagnostic-label">{label}</span>
      <strong className="health-diagnostic-value" title={String(displayValue)}>{displayValue}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

export { DiagnosticRow };
