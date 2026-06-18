import React from "react";

function DiagnosticRow({ label, value, hint }) {
  return (
    <div className="health-diagnostic-row">
      <span>{label}</span>
      <strong>{value || "Not available"}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

export { DiagnosticRow };
