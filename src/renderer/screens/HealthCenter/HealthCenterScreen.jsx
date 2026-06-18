import React, { useEffect, useMemo, useState } from "react";
import { HealthCheckCard } from "../../components/health/index.jsx";
import { ErrorGuidancePanel } from "./ErrorGuidancePanel.jsx";
import { PhaseLockRegistry } from "./PhaseLockRegistry.jsx";
import { RecoveryCenterScreen } from "./RecoveryCenterScreen.jsx";
import { RuntimeDiagnosticsPanel } from "./RuntimeDiagnosticsPanel.jsx";
import { SafeModeScreen } from "./SafeModeScreen.jsx";
import { SupportBundlePanel } from "./SupportBundlePanel.jsx";
import { VerificationConsole } from "./VerificationConsole.jsx";

const TABS = [
  ["overview", "Overview"],
  ["checks", "Health Checks"],
  ["recovery", "Recovery"],
  ["support", "Support Bundle"],
  ["phases", "Phase Locks"]
];

function HealthCenterScreen({ apiClient, notify, session, companyContext, onNavigate }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [diagnostics, setDiagnostics] = useState(null);
  const [checks, setChecks] = useState(null);
  const [loading, setLoading] = useState(false);

  const context = useMemo(() => ({
    company_id: companyContext?.company_id,
    company_name: companyContext?.company_name,
    company_scope: companyContext?.company_scope,
    user_id: session?.user?.id || session?.id,
    user_name: session?.user?.name || session?.user?.username || session?.name || session?.username,
    role: session?.user?.role || session?.role
  }), [companyContext, session]);

  const refresh = async () => {
    setLoading(true);
    try {
      const [diagnosticResult, checkResult] = await Promise.all([
        apiClient.getHealthDiagnostics(context),
        apiClient.runHealthChecks(context)
      ]);
      setDiagnostics(diagnosticResult);
      setChecks(checkResult);
    } catch (error) {
      notify?.(error.message || "Health diagnostics could not load", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [context.company_id, context.company_scope]);

  const failedCount = checks?.summary?.fail || 0;
  const warningCount = checks?.summary?.warn || 0;
  const passCount = checks?.summary?.pass || 0;
  const apiContract = ["getHealthDiagnostics", "runHealthChecks", "exportSupportBundle", "openHealthFolder"].map((name) => ({
    id: name,
    label: `Preload API: ${name}`,
    status: typeof apiClient?.[name] === "function" ? "pass" : "fail",
    severity: typeof apiClient?.[name] === "function" ? "normal" : "critical",
    details: typeof apiClient?.[name] === "function" ? "Available in renderer API." : "Missing from renderer API.",
    recommendation: typeof apiClient?.[name] === "function" ? "No action required." : "Review preload and API fallback wiring."
  }));

  return (
    <div className="health-center">
      <section className="panel health-hero">
        <div>
          <p className="eyebrow">diagnostics and recovery</p>
          <h2>ERP Health Center</h2>
          <p>Review runtime paths, database readiness, accounting balance health, logs, support bundles and safe recovery guidance.</p>
        </div>
        <div className="health-score-strip">
          <div><strong>{passCount}</strong><span>Passed</span></div>
          <div><strong>{warningCount}</strong><span>Warnings</span></div>
          <div><strong>{failedCount}</strong><span>Failed</span></div>
          <button type="button" className="secondary-btn" onClick={refresh} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
        </div>
      </section>

      <div className="health-tab-bar" role="tablist" aria-label="Health Center sections">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={activeTab === key ? "active" : ""}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <>
          <RuntimeDiagnosticsPanel diagnostics={diagnostics} />
          <section className="health-card-grid">
            {(checks?.checks || []).slice(0, 6).map((item) => <HealthCheckCard key={item.id} check={item} />)}
            {apiContract.map((item) => <HealthCheckCard key={item.id} check={item} />)}
          </section>
          <VerificationConsole checks={checks} />
        </>
      ) : null}

      {activeTab === "checks" ? (
        <section className="health-card-grid">
          {[...(checks?.checks || []), ...apiContract].map((item) => <HealthCheckCard key={item.id} check={item} />)}
        </section>
      ) : null}

      {activeTab === "recovery" ? (
        <>
          <SafeModeScreen onNavigate={onNavigate} />
          <RecoveryCenterScreen apiClient={apiClient} notify={notify} />
          <ErrorGuidancePanel diagnostics={diagnostics} />
        </>
      ) : null}

      {activeTab === "support" ? (
        <SupportBundlePanel apiClient={apiClient} diagnostics={diagnostics} checks={checks} context={context} notify={notify} />
      ) : null}

      {activeTab === "phases" ? <PhaseLockRegistry /> : null}
    </div>
  );
}

export { HealthCenterScreen };
