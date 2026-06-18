import React from "react";
import { recoveryGuidance } from "./healthCenterConfig.js";

function ErrorGuidancePanel({ diagnostics }) {
  const rendererTail = diagnostics?.logs?.rendererTail || "";
  const bootTail = diagnostics?.logs?.bootErrorTail || "";
  return (
    <section className="panel health-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">guidance</p>
          <h2>Error Guidance</h2>
        </div>
      </div>
      <div className="health-guidance-grid">
        {recoveryGuidance.map((item) => (
          <article key={item.title} className="health-guidance-card">
            <h3>{item.title}</h3>
            <p><strong>Likely cause:</strong> {item.cause}</p>
            <p><strong>Next action:</strong> {item.action}</p>
          </article>
        ))}
      </div>
      <details className="health-log-details">
        <summary>Latest renderer log tail</summary>
        <pre>{rendererTail || "No renderer log available."}</pre>
      </details>
      <details className="health-log-details">
        <summary>Latest boot error log tail</summary>
        <pre>{bootTail || "No boot error log available."}</pre>
      </details>
    </section>
  );
}

export { ErrorGuidancePanel };
