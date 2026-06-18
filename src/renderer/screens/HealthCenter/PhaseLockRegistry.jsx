import React from "react";
import { phaseLocks } from "./healthCenterConfig.js";

function PhaseLockRegistry() {
  return (
    <section className="panel health-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">locked baseline</p>
          <h2>Phase Lock Registry</h2>
        </div>
      </div>
      <div className="health-lock-list">
        {phaseLocks.map((phase) => (
          <div key={phase} className="health-lock-row">
            <span className="status-badge status-pass">Locked</span>
            <strong>{phase}</strong>
          </div>
        ))}
      </div>
      <p className="muted">This registry is informational. Actual lock enforcement remains through Git tags, reports and change-control discipline.</p>
    </section>
  );
}

export { PhaseLockRegistry };
