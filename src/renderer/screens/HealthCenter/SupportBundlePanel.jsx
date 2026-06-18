import React, { useState } from "react";

function SupportBundlePanel({ apiClient, diagnostics, checks, context, notify }) {
  const [bundle, setBundle] = useState(null);
  const [busy, setBusy] = useState(false);

  const createBundle = async () => {
    setBusy(true);
    try {
      const result = await apiClient.exportSupportBundle({ ...context, diagnosticsGeneratedAt: diagnostics?.generatedAt, checksGeneratedAt: checks?.generatedAt });
      setBundle(result);
      notify?.(`Support bundle created: ${result.fileName || "bundle"}`, "success");
    } catch (error) {
      notify?.(error.message || "Support bundle could not be created", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel health-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">support</p>
          <h2>Support Bundle</h2>
        </div>
        <button type="button" className="primary-btn" onClick={createBundle} disabled={busy}>
          {busy ? "Creating..." : "Create Support Bundle"}
        </button>
      </div>
      <p className="muted">
        The support bundle collects diagnostic metadata, health checks and recent audit log rows. It does not copy uploaded document files.
      </p>
      {bundle ? (
        <div className="health-result-box">
          <strong>{bundle.fileName}</strong>
          <p>{bundle.filePath}</p>
          <small>{bundle.size || 0} bytes</small>
        </div>
      ) : null}
    </section>
  );
}

export { SupportBundlePanel };
