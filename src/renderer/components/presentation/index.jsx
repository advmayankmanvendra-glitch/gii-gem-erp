import React from "react";

export function PanelHead({ title, description, children }) {
  return (
    <div className="panel-head">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function ImportResultSummary({ result }) {
  if (!result) return null;
  return (
    <div className="import-result">
      <span>Total: <strong>{result.totalRows || 0}</strong></span>
      <span>Valid: <strong>{result.successfulRows || 0}</strong></span>
      <span>Failed: <strong>{result.failedRows || 0}</strong></span>
      <span>Duplicates: <strong>{result.skippedDuplicates || 0}</strong></span>
    </div>
  );
}

export function TemplateFlowSteps({ steps }) {
  return (
    <div className="template-flow">
      {steps.map((step) => (
        <span key={step}>{step}</span>
      ))}
    </div>
  );
}

export function TemplateAuditNote({ children }) {
  return (
    <div className="template-audit-note">
      <strong>Safety:</strong> {children}
    </div>
  );
}

export function FileNameIndicator({ label, fileName }) {
  if (!fileName) return null;
  return (
    <p className="muted-note">{label}: <strong>{fileName}</strong></p>
  );
}
