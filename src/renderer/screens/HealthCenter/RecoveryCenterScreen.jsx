import React from "react";
import { folderActions } from "./healthCenterConfig.js";

function RecoveryCenterScreen({ apiClient, notify }) {
  const openFolder = async (kind) => {
    try {
      const result = await apiClient.openHealthFolder(kind);
      notify?.(result?.message || "Folder opened", "success");
    } catch (error) {
      notify?.(error.message || "Could not open folder", "error");
    }
  };

  return (
    <section className="panel health-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">recovery</p>
          <h2>Runtime Folder Access</h2>
        </div>
      </div>
      <p className="muted">Use these shortcuts to inspect the active installed-app runtime folders before making backup, restore or upload decisions.</p>
      <div className="health-action-grid">
        {folderActions.map((action) => (
          <button key={action.key} type="button" className="secondary-btn" onClick={() => openFolder(action.key)}>
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export { RecoveryCenterScreen };
