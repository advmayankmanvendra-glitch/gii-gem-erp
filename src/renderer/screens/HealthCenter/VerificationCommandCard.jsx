import React from "react";

function VerificationCommandCard({ command, notify }) {
  const copyCommand = async () => {
    try {
      await navigator.clipboard?.writeText(command.command);
      notify?.("Verification command copied", "success");
    } catch {
      notify?.("Copy command is not available in this runtime.", "warning");
    }
  };

  return (
    <article className="verification-command-card">
      <div>
        <div className="verification-command-head">
          <h3>{command.title}</h3>
          <span className="status-badge status-info">Manual</span>
        </div>
        <code>{command.command}</code>
        <p>{command.note}</p>
        {command.lastKnown ? <small>Last Health Center snapshot: {new Date(command.lastKnown).toLocaleString("en-IN")}</small> : <small>No Health Center snapshot recorded yet.</small>}
      </div>
      <button type="button" className="ghost-btn" onClick={copyCommand}>Copy</button>
    </article>
  );
}

export { VerificationCommandCard };
