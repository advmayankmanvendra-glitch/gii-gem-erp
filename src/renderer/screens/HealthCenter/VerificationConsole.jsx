import React from "react";
import { VerificationResultBox } from "../../components/health/index.jsx";
import { verificationCommands } from "./healthCenterConfig.js";

function VerificationConsole({ checks }) {
  const hasFailure = (checks?.checks || []).some((item) => item.status === "fail");
  return (
    <section className="panel health-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">manual verification</p>
          <h2>Verification Console</h2>
        </div>
      </div>
      <p className="muted">
        These commands remain terminal-controlled. The Health Center shows the checklist but does not execute shell commands from the UI.
      </p>
      <div className="verification-grid">
        {verificationCommands.map((item) => (
          <VerificationResultBox
            key={item.command}
            title={item.title}
            command={item.command}
            result={hasFailure ? "warn" : "info"}
            note={item.note}
          />
        ))}
      </div>
    </section>
  );
}

export { VerificationConsole };
