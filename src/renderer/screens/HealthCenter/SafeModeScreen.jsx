import React from "react";

function SafeModeScreen({ onNavigate }) {
  return (
    <section className="panel health-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">safe mode</p>
          <h2>Safe Recovery Navigation</h2>
        </div>
      </div>
      <div className="health-two-column">
        <div>
          <h3>Recommended safe actions</h3>
          <ul className="health-list">
            <li>Open Dashboard to confirm the shell is usable.</li>
            <li>Open Settings to create or inspect backups.</li>
            <li>Open Audit Log to review the last sensitive actions.</li>
            <li>Run terminal verification before further posting.</li>
          </ul>
        </div>
        <div className="health-action-stack">
          <button type="button" className="primary-btn" onClick={() => onNavigate?.("dashboard")}>Go To Dashboard</button>
          <button type="button" className="secondary-btn" onClick={() => onNavigate?.("settings")}>Open Settings</button>
          <button type="button" className="secondary-btn" onClick={() => onNavigate?.("audit_log")}>Open Audit Log</button>
        </div>
      </div>
    </section>
  );
}

export { SafeModeScreen };
