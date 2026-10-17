import React, { useEffect, useState } from "react";
import { HealthCheckCard } from "../../components/health/index.jsx";
import { readRendererCrashRegistry } from "../../stability/rendererCrashRegistry.js";

const formatTime = (value) => (value ? new Date(value).toLocaleString("en-IN") : "");

// Error Console: book integrity checks, documents stuck in a failed posting, and
// every recent failed action with where it failed and what to do next.
function ErrorConsolePanel({ apiClient, context, notify, onNavigate, isAdmin }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (typeof apiClient?.getErrorConsole !== "function") return;
    setLoading(true);
    try {
      setState(await apiClient.getErrorConsole({ company_id: context?.company_id }));
    } catch (error) {
      notify?.(`Error Console could not load: ${error.message}. Refresh the Health Center; if it repeats, export a support bundle.`, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [context?.company_id]);

  const clear = async () => {
    try {
      const result = await apiClient.clearErrorConsole({ company_id: context?.company_id });
      notify?.(`Cleared ${result?.cleared || 0} error entr${result?.cleared === 1 ? "y" : "ies"}. The clear is recorded in the audit log.`);
      load();
    } catch (error) {
      notify?.(error.message, "error");
    }
  };

  const screenCrashes = readRendererCrashRegistry().slice(0, 10);
  const integrity = state?.integrity || [];
  const stuck = state?.stuckPostings || [];
  const errors = state?.errors || [];

  return (
    <section className="panel health-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">what failed, where, and what to do next</p>
          <h2>Error Console</h2>
        </div>
        <div className="renderer-error-actions">
          <button type="button" className="secondary-btn" onClick={load} disabled={loading}>{loading ? "Checking..." : "Re-check"}</button>
          {isAdmin ? <button type="button" className="ghost-btn" onClick={clear} disabled={!errors.length}>Clear error log</button> : null}
        </div>
      </div>

      <h3 className="health-section-subtitle">Book integrity</h3>
      <section className="health-card-grid">
        {integrity.map((item) => (
          <HealthCheckCard key={item.id} check={{ id: item.id, label: item.label, status: item.status, severity: item.status === "pass" ? "normal" : "critical", details: item.detail, recommendation: item.action }} />
        ))}
        {!integrity.length ? <p>{state?.preview ? "Integrity checks run in the Windows desktop app only." : "No integrity results yet."}</p> : null}
      </section>

      <h3 className="health-section-subtitle">Documents that failed to post ({stuck.length})</h3>
      {stuck.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Document</th><th>Reference</th><th>What failed</th><th>Where to fix</th><th>Next step</th></tr></thead>
            <tbody>
              {stuck.map((row) => (
                <tr key={`${row.table}-${row.id}`}>
                  <td>{row.label}</td>
                  <td>{row.reference}</td>
                  <td>{row.error}</td>
                  <td>{row.screen}</td>
                  <td>{row.nextAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p>No document is stuck in a failed posting.</p>}

      <h3 className="health-section-subtitle">Recent errors ({errors.length})</h3>
      {errors.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Area</th><th>Action</th><th>Message</th><th>Where to fix</th><th>Next step</th></tr></thead>
            <tbody>
              {errors.map((row) => (
                <tr key={row.id}>
                  <td>{formatTime(row.at)}</td>
                  <td>{row.area}</td>
                  <td>{row.channel}</td>
                  <td>{row.message}</td>
                  <td>{row.screen}</td>
                  <td>{row.nextAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p>No failed actions recorded.</p>}

      {screenCrashes.length ? (
        <details className="health-log-details">
          <summary>Screen crashes on this computer ({screenCrashes.length})</summary>
          <ul>
            {screenCrashes.map((row) => <li key={row.id}>{formatTime(row.timestamp)}: {row.currentView}: {row.message}</li>)}
          </ul>
          {onNavigate ? <button type="button" className="secondary-btn" onClick={() => onNavigate("safe_mode")}>Open Safe Mode</button> : null}
        </details>
      ) : null}
    </section>
  );
}

export { ErrorConsolePanel };
