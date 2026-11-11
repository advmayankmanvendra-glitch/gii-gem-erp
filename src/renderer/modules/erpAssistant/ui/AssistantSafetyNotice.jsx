import React from "react";

const BOUNDARY_CONFIG = {
  "accounting-sensitive": { color: "#d97706", label: "Accounting-sensitive", icon: "!" },
  "database-sensitive": { color: "#7c3aed", label: "Database guidance only", icon: "i" },
  "inventory-sensitive": { color: "#0284c7", label: "Inventory guidance only", icon: "i" },
  "gst-sensitive": { color: "#ea580c", label: "GST guidance — not tax/filing advice", icon: "!" },
  "workflow-sensitive": { color: "#6b7280", label: "Workflow guidance — no bypass", icon: "i" },
  "import-sensitive": { color: "#6b7280", label: "Process guidance — no execution", icon: "i" },
  "action-refused": { color: "#dc2626", label: "Action refused", icon: "!" },
  "read-only guidance": { color: "#6b7280", label: "Read-only guidance", icon: "i" }
};

const NOTICE_TEXTS = {
  "accounting-sensitive": "Guidance only. I explain the ERP accounting process but cannot post, reverse, approve, or alter records.",
  "database-sensitive": "Guidance only. I explain database structure but cannot query live records or modify schema.",
  "inventory-sensitive": "Guidance only. I explain stock flow but cannot create inward, outward, or adjustment entries.",
  "gst-sensitive": "Guidance only. I explain GST report sources but cannot certify compliance or file returns.",
  "workflow-sensitive": "Guidance only. I explain workflow stages but cannot bypass governance or alter status.",
  "import-sensitive": "Guidance only. I explain import/export process but cannot trigger data transfer.",
  "action-refused": "I cannot perform this action. I am a read-only guidance assistant."
};

function AssistantSafetyNotice({ boundary }) {
  const config = BOUNDARY_CONFIG[boundary] || BOUNDARY_CONFIG["read-only guidance"];
  const notice = NOTICE_TEXTS[boundary];
  if (!boundary || boundary === "read-only guidance") return null;
  return (
    <div className="assistant-safety-notice" style={{ borderLeftColor: config.color }}>
      <span className="assistant-safety-icon" style={{ color: config.color }}>{config.icon}</span>
      <div className="assistant-safety-content">
        <strong>{config.label}</strong>
        {notice && <p>{notice}</p>}
      </div>
    </div>
  );
}

export { AssistantSafetyNotice };
