import React, { useState } from "react";
import { ReadinessScoreCard, OverallScoreCard } from "./ReadinessScoreCard.jsx";
import { GoLiveChecklist } from "./GoLiveChecklist.jsx";
import { CertificationHistory } from "./CertificationHistory.jsx";

function ProductionReadinessScreen() {
  const [readiness, setReadiness] = useState(null);
  const [certificate, setCertificate] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAssess = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.getDeploymentReadiness();
      setReadiness(result);
    } catch (err) {
      setError(err.message || "Failed to assess readiness");
    } finally {
      setLoading(false);
    }
  };

  const handleCertify = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.generateGoLiveCertificate("system");
      setCertificate(result);
      const hist = await window.api.getCertificateHistory();
      setHistory(hist);
    } catch (err) {
      setError(err.message || "Failed to generate certificate");
    } finally {
      setLoading(false);
    }
  };

  const refreshHistory = async () => {
    try {
      const hist = await window.api.getCertificateHistory();
      setHistory(hist);
    } catch { /* ignore */ }
  };

  return (
    <div className="screen" style={{ padding: "var(--spacing-md)" }}>
      <div className="screen-header" style={{ marginBottom: "var(--spacing-md)" }}>
        <h2>Production Readiness Certification</h2>
        <p className="muted">Assess, validate, and certify your ERP for Go-Live</p>
      </div>

      {error && <div className="error-banner" style={{ padding: 8, marginBottom: "var(--spacing-sm)", backgroundColor: "#f8d7da", color: "#721c24" }}>{error}</div>}

      <div style={{ display: "flex", gap: "var(--spacing-sm)", marginBottom: "var(--spacing-md)" }}>
        <button type="button" className="primary-btn" onClick={handleAssess} disabled={loading}>
          {loading ? "Working..." : "Run Readiness Assessment"}
        </button>
        <button type="button" className="secondary-btn" onClick={handleCertify} disabled={loading || !readiness}>
          {loading ? "Working..." : "Generate Go-Live Certificate"}
        </button>
        <button type="button" className="secondary-btn" onClick={refreshHistory}>Refresh History</button>
      </div>

      {readiness && (
        <>
          <OverallScoreCard score={readiness.score} status={readiness.status} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "var(--spacing-sm)", marginBottom: "var(--spacing-md)" }}>
            {Object.entries(readiness.categories || {}).map(([key, cat]) => (
              <ReadinessScoreCard key={key} label={cat.label || key} score={cat.score?.score || 0} status={cat.score?.status || "N/A"} checks={cat.checks} weight={cat.weight} />
            ))}
          </div>

          <GoLiveChecklist readiness={readiness} />
        </>
      )}

      {certificate && (
        <section className="panel" style={{ padding: "var(--spacing-md)", marginTop: "var(--spacing-md)", border: "2px solid #155724", backgroundColor: "#d4edda" }}>
          <h3 style={{ margin: "0 0 var(--spacing-sm)", color: "#155724" }}>✓ Certificate Generated</h3>
          <p style={{ margin: "4px 0" }}><strong>Number:</strong> {certificate.certificate.certificateNumber}</p>
          <p style={{ margin: "4px 0" }}><strong>Date:</strong> {certificate.certificate.generatedDate} {certificate.certificate.generatedTime}</p>
          <p style={{ margin: "4px 0" }}><strong>Status:</strong> {certificate.certificate.readiness.status}</p>
          <p style={{ margin: "4px 0" }}><strong>Score:</strong> {certificate.certificate.readiness.score}%</p>
          <p style={{ margin: "8px 0 0" }}><strong>Report:</strong> <code>{certificate.reportPath}</code></p>
        </section>
      )}

      <div style={{ marginTop: "var(--spacing-md)" }}>
        <CertificationHistory history={history} onRefresh={refreshHistory} />
      </div>
    </div>
  );
}

export { ProductionReadinessScreen };