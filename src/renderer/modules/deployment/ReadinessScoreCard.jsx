import React from "react";

function ReadinessScoreCard({ label, score, status, checks, weight }) {
  const scoreColor = score >= 95 ? "var(--color-success-text, #155724)" : score >= 80 ? "#856404" : score >= 60 ? "#856404" : "#721c24";
  const statusBadge = status === "Pass" ? "badge badge-pass" : status === "Warning" ? "badge" : "badge badge-fail";
  return (
    <section className="panel readiness-category-card" style={{ padding: "var(--spacing-md)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <h4 style={{ margin: 0, fontSize: "0.95rem" }}>{label}</h4>
          {weight && <span className="muted" style={{ fontSize: "0.75rem" }}>Weight: {weight}%</span>}
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ fontSize: "1.5rem", fontWeight: 700, color: scoreColor }}>{score}%</span>
          <br />
          <span className={statusBadge} style={{ fontSize: "0.7rem" }}>{status}</span>
        </div>
      </div>
      {checks && (
        <div style={{ fontSize: "0.8rem" }}>
          {checks.filter(c => c.passed).map(c => <p key={c.key} style={{ margin: "2px 0", color: "#155724" }}>✓ {c.label}</p>)}
          {checks.filter(c => !c.passed).map(c => <p key={c.key} style={{ margin: "2px 0", color: "#721c24" }}>✗ {c.label}{c.detail ? ` (${c.detail})` : ""}</p>)}
        </div>
      )}
    </section>
  );
}

function OverallScoreCard({ score, status }) {
  const scoreColor = score >= 95 ? "var(--color-success-text, #155724)" : score >= 80 ? "#856404" : score >= 60 ? "#856404" : "#721c24";
  const bgColor = score >= 80 ? "var(--color-success-bg, #d4edda)" : score >= 60 ? "#fff3cd" : "#f8d7da";
  return (
    <section className="panel" style={{ padding: "var(--spacing-lg)", textAlign: "center", background: bgColor, marginBottom: "var(--spacing-md)" }}>
      <h3 style={{ margin: 0, fontSize: "1rem", textTransform: "uppercase", letterSpacing: 1, color: scoreColor }}>Production Readiness</h3>
      <div style={{ fontSize: "3rem", fontWeight: 700, color: scoreColor, margin: "8px 0" }}>{score}%</div>
      <span className={`readiness-badge ${score >= 80 ? "ready" : "not-ready"}`} style={{ fontSize: "1rem", padding: "6px 20px" }}>{status}</span>
    </section>
  );
}

export { ReadinessScoreCard, OverallScoreCard };