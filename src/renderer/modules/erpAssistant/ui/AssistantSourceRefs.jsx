import React from "react";

const SOURCE_BADGE_LABELS = {
  "workflow-graph": "Workflow",
  "database-graph": "ERP data model",
  "voucher-accounting-graph": "Accounting guidance",
  "renderer-graph": "Screen guidance",
  "repository": "ERP knowledge",
  "manual": "Manual"
};

const SOURCE_BADGE_COLORS = {
  "workflow-graph": "#2563eb",
  "database-graph": "#7c3aed",
  "voucher-accounting-graph": "#dc2626",
  "renderer-graph": "#059669",
  "repository": "#d97706",
  "manual": "#6b7280"
};

function AssistantSourceRefs({ references }) {
  if (!references || references.length === 0) return null;
  return (
    <div className="assistant-source-refs">
      <h3>Sources</h3>
      <div className="assistant-source-list">
        {references.map((ref, i) => (
          <div className="assistant-source-item" key={`src-${i}`}>
            <span
              className="assistant-source-badge"
              style={{ backgroundColor: SOURCE_BADGE_COLORS[ref.sourceKind] || "#6b7280" }}
            >
              {SOURCE_BADGE_LABELS[ref.sourceKind] || ref.sourceKind}
            </span>
            <div className="assistant-source-info">
              <strong>{ref.title}</strong>
              {ref.summary && <small>{ref.summary}</small>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { AssistantSourceRefs };
