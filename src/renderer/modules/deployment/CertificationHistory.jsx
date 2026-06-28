import React from "react";

function CertificationHistory({ history, onRefresh }) {
  return (
    <section className="panel" style={{ padding: "var(--spacing-md)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--spacing-sm)" }}>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Go-Live Certificate History</h3>
        {onRefresh && <button type="button" className="secondary-btn" onClick={onRefresh}>Refresh</button>}
      </div>
      {!history || history.length === 0 ? (
        <p className="muted">No certificates have been generated yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="reset-preview-table">
            <thead>
              <tr>
                <th>Certificate</th>
                <th>Date</th>
                <th>Status</th>
                <th>Score</th>
                <th>Issued By</th>
              </tr>
            </thead>
            <tbody>
              {history.map((cert, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{cert.certificateNumber}</td>
                  <td>{cert.generatedDate || new Date(cert.generatedAt).toLocaleDateString()}</td>
                  <td><span className={`badge ${cert.status === "Production Ready" ? "badge-pass" : "badge-fail"}`} style={{ fontSize: "0.7rem" }}>{cert.status}</span></td>
                  <td>{cert.readinessScore}%</td>
                  <td>{cert.issuedBy || "system"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export { CertificationHistory };