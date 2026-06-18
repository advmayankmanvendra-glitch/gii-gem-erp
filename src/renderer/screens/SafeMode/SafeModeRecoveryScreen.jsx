import React, { useEffect, useState } from "react";
import { clearRendererCrashRegistry, readRendererCrashRegistry } from "../../stability/rendererCrashRegistry.js";
import { safeFallbackActions, safeModeChecklist } from "../../stability/safeFallbackConfig.js";
import { safeArray } from "../../stability/rendererStabilityUtils.js";
import { RendererCrashReportPanel } from "./RendererCrashReportPanel.jsx";

export function SafeModeRecoveryScreen({ apiClient, notify, onNavigate, startupSelfTest }) {
  const [crashes, setCrashes] = useState(() => readRendererCrashRegistry());
  const [diagnostics, setDiagnostics] = useState(null);
  const [checks, setChecks] = useState(null);
  const [loading, setLoading] = useState(false);
  const startupChecks = safeArray(startupSelfTest?.checks);

  async function refreshDiagnostics() {
    setLoading(true);
    try {
      const [diagnosticResult, checkResult] = await Promise.all([
        typeof apiClient?.getHealthDiagnostics === "function" ? apiClient.getHealthDiagnostics({ source: "safe_mode" }) : Promise.resolve(null),
        typeof apiClient?.runHealthChecks === "function" ? apiClient.runHealthChecks({ source: "safe_mode" }) : Promise.resolve(null)
      ]);
      setDiagnostics(diagnosticResult);
      setChecks(checkResult);
    } catch (error) {
      notify?.(error.message || "Safe Mode diagnostics could not load", "error");
    } finally {
      setLoading(false);
    }
  }

  async function exportSupportBundle() {
    try {
      if (typeof apiClient?.exportSupportBundle !== "function") {
        throw new Error("Support bundle API is not available.");
      }
      const result = await apiClient.exportSupportBundle({
        source: "safe_mode",
        crashes,
        startupSelfTest,
        diagnostics,
        checks
      });
      notify?.(`Support bundle created${result?.path ? `: ${result.path}` : ""}`);
    } catch (error) {
      notify?.(error.message || "Support bundle could not be created", "error");
    }
  }

  function clearCrashes() {
    clearRendererCrashRegistry();
    setCrashes([]);
    notify?.("Renderer crash registry cleared.");
  }

  useEffect(() => {
    refreshDiagnostics();
  }, []);

  return (
    <section className="page safe-mode-page">
      <div className="panel safe-mode-hero">
        <div>
          <p className="eyebrow">renderer recovery</p>
          <h2>Safe Mode Recovery</h2>
          <p>Use this screen when a module fails to render. The ERP shell remains available so diagnostics, support bundle export and recovery navigation can continue.</p>
        </div>
        <div className="safe-mode-actions">
          {safeFallbackActions.map((action) => (
            <button type="button" className="secondary-btn" key={action.target} onClick={() => onNavigate?.(action.target)} title={action.description}>
              {action.label}
            </button>
          ))}
          <button type="button" className="primary-btn" onClick={exportSupportBundle}>Export Support Bundle</button>
        </div>
      </div>

      <section className="panel safe-mode-checks">
        <div className="panel-head">
          <div>
            <h2>Startup Self-Test</h2>
            <p>Renderer dependencies checked before normal recovery navigation.</p>
          </div>
          <span className={`status-pill ${startupSelfTest?.status || "warn"}`}>{startupSelfTest?.status || "not run"}</span>
        </div>
        <div className="safe-mode-check-grid">
          {startupChecks.map((item) => (
            <article className={`safe-mode-check ${item.status}`} key={item.id}>
              <strong>{item.label}</strong>
              <span>{item.status}</span>
              <p>{item.details}</p>
              <small>{item.recommendation}</small>
            </article>
          ))}
        </div>
      </section>

      <RendererCrashReportPanel crashes={crashes} onClear={clearCrashes} />

      <section className="panel safe-mode-guidance">
        <h2>Recovery Checklist</h2>
        <ul>
          {safeModeChecklist.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <div className="confirm-actions">
          <button type="button" className="secondary-btn" onClick={refreshDiagnostics} disabled={loading}>{loading ? "Refreshing..." : "Refresh Diagnostics"}</button>
          <button type="button" className="primary-btn" onClick={() => onNavigate?.("health_center")}>Open Health Center</button>
        </div>
      </section>
    </section>
  );
}
