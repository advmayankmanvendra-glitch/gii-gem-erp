import React from "react";

function VerificationHistoryPanel({ history = [] }) {
  return (
    <section className="verification-history-panel">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">stored results</p>
          <h3>Verification Snapshot History</h3>
        </div>
      </div>
      {history.length ? (
        <div className="verification-history-list">
          {history.slice(0, 5).map((entry) => (
            <article key={entry.id} className={`health-result-box health-status-${entry.status || "info"}`}>
              <strong>{new Date(entry.generatedAt).toLocaleString("en-IN")}</strong>
              <p>
                Passed {entry.summary?.passed || 0}, warnings {entry.summary?.warnings || 0}, failed {entry.summary?.failed || 0}
              </p>
              <small>{entry.company?.name || "Company context not recorded"} | {entry.note}</small>
            </article>
          ))}
        </div>
      ) : (
        <div className="health-result-box health-status-info">
          <strong>No snapshots recorded</strong>
          <p>Record a Health Center snapshot to store the current read-only diagnostic summary in runtime logs.</p>
        </div>
      )}
    </section>
  );
}

export { VerificationHistoryPanel };
