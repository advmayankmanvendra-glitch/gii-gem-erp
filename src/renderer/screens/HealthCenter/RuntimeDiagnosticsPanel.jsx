import React from "react";
import { DiagnosticRow, RuntimePathStatus } from "../../components/health/index.jsx";

function RuntimeDiagnosticsPanel({ diagnostics }) {
  const folders = diagnostics?.paths?.folders || [];
  return (
    <section className="panel health-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">runtime readiness</p>
          <h2>Runtime Diagnostics</h2>
        </div>
      </div>
      <h3 className="health-section-subtitle">Runtime Summary</h3>
      <div className="health-diagnostic-grid">
        <DiagnosticRow label="App Version" value={diagnostics?.app?.version} />
        <DiagnosticRow label="Packaged Mode" value={diagnostics?.app?.packaged ? "Yes" : "No"} />
        <DiagnosticRow label="Electron" value={diagnostics?.runtime?.electron} />
        <DiagnosticRow label="Node" value={diagnostics?.runtime?.node} />
        <DiagnosticRow label="Runtime Root" value={diagnostics?.paths?.runtimeRoot} />
        <DiagnosticRow label="Database" value={diagnostics?.paths?.database?.path} hint={diagnostics?.paths?.database?.exists ? "File found" : "File missing"} />
      </div>
      <h3 className="health-section-subtitle">Runtime Folders</h3>
      <div className="health-path-grid">
        {folders.map((folder) => (
          <RuntimePathStatus key={folder.key} pathInfo={folder} />
        ))}
      </div>
    </section>
  );
}

export { RuntimeDiagnosticsPanel };
