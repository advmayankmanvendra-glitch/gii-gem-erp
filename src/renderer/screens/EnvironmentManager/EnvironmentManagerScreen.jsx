import React, { useEffect, useState, useCallback } from "react";
import { sortOptions, sortRecordsBy } from "../../utils/optionSorting.js";

const ENVIRONMENT_TYPES = ["Development", "Testing", "Training", "Production", "Migration"];

function formatSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
}

function StatCard({ label, value, warn }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className={`stat-value${warn ? " warn" : ""}`}>{value}</span>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <section className="panel environment-section">
      <h3>{title}</h3>
      <div className="environment-section-body">{children}</div>
    </section>
  );
}

function VerificationBadge({ passed }) {
  const cls = passed ? "badge badge-pass" : "badge badge-fail";
  return <span className={cls}>{passed ? "PASS" : "FAIL"}</span>;
}

function ResetPreviewTable({ title, data }) {
  if (!data || data.length === 0) return null;
  return (
    <div className="reset-preview-section">
      <h4>{title}</h4>
      <table className="reset-preview-table">
        <thead>
          <tr>
            <th>Table</th>
            <th>Module</th>
            <th>Rows</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.table}>
              <td>{row.table}</td>
              <td>{row.module || "-"}</td>
              <td>{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EnvironmentManagerScreen({ apiClient, notify, session, companyContext }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [resetPreview, setResetPreview] = useState(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetResult, setResetResult] = useState(null);
  const [resetError, setResetError] = useState(null);
  const [certificate, setCertificate] = useState(null);
  const [certLoading, setCertLoading] = useState(false);
  const [backupCreating, setBackupCreating] = useState(false);
  const [envSwitchTarget, setEnvSwitchTarget] = useState("");
  const [envSwitchConfirm, setEnvSwitchConfirm] = useState(false);
  const [foundationCheck, setFoundationCheck] = useState(null);
  const [foundationLoading, setFoundationLoading] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [initPreview, setInitPreview] = useState(null);
  const [initPreviewLoading, setInitPreviewLoading] = useState(false);
  const [resetStep, setResetStep] = useState("idle");
  const [resetWarningAck, setResetWarningAck] = useState(false);
  const [resetBackupInfo, setResetBackupInfo] = useState(null);
  const [resetDependencies, setResetDependencies] = useState(null);
  const [resetDependencyLoading, setResetDependencyLoading] = useState(false);
  const [resetZeroState, setResetZeroState] = useState(null);
  const [resetRollbackResult, setResetRollbackResult] = useState(null);
  const [resetRollbackLoading, setResetRollbackLoading] = useState(false);

  const isAdmin = session?.user?.role === "admin" || session?.role === "admin";
  const userId = session?.user?.id || session?.id;

  const context = {
    company_id: companyContext?.company_id,
    company_name: companyContext?.company_name,
    company_scope: companyContext?.company_scope,
    user_id: userId,
    user_name: session?.user?.name || session?.username,
    role: session?.user?.role || session?.role
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (!apiClient.getEnvironmentInfo) throw new Error("Environment Manager requires the Windows desktop app. Open GII GeM ERP on the desktop to manage environments.");
      const result = await apiClient.getEnvironmentInfo(context);
      setInfo(result);
    } catch (error) {
      notify?.(error.message || "Could not load environment info", "error");
    } finally {
      setLoading(false);
    }
  }, [context.company_id, context.company_scope]);

  const loadProfiles = useCallback(async () => {
    if (!apiClient.getVerificationProfiles) return;
    setProfileLoading(true);
    try {
      const result = await apiClient.getVerificationProfiles();
      setProfiles(result || []);
    } catch { /* ignore */ } finally {
      setProfileLoading(false);
    }
  }, []);

  const loadFoundationCheck = useCallback(async () => {
    setFoundationLoading(true);
    try {
      const data = await apiClient.getMasterDataCompleteness?.(context);
      setFoundationCheck(data);
    } catch { /* ignore */ } finally {
      setFoundationLoading(false);
    }
  }, [context]);

  const loadVerificationStatus = useCallback(async () => {
    if (!apiClient.getVerificationConsoleState) return;
    setVerificationLoading(true);
    try {
      const state = await apiClient.getVerificationConsoleState();
      setVerificationStatus(state);
    } catch { /* ignore */ } finally {
      setVerificationLoading(false);
    }
  }, []);

  const handleProfileChange = async (profile) => {
    try {
      await apiClient.setVerificationProfile(profile);
      notify?.(`Verification profile set to ${profile}`, "success");
      load();
    } catch (error) {
      notify?.(error.message || "Failed to set verification profile", "error");
    }
  };

  const handleEnvironmentSwitch = async () => {
    if (!envSwitchTarget) return;
    try {
      await apiClient.switchEnvironment(envSwitchTarget);
      notify?.(`Environment switched to ${envSwitchTarget}`, "success");
      setEnvSwitchTarget("");
      setEnvSwitchConfirm(false);
      load();
    } catch (error) {
      notify?.(error.message || "Failed to switch environment", "error");
    }
  };

  const handleCreateBackup = async () => {
    setBackupCreating(true);
    try {
      const result = await apiClient.createBackup();
      notify?.(`Backup created: ${result.fileName}`, "success");
      load();
    } catch (error) {
      notify?.(error.message || "Backup failed", "error");
    } finally {
      setBackupCreating(false);
    }
  };

  const handleOpenBackupFolder = async () => {
    try {
      await apiClient.openBackupFolder();
    } catch { /* ignore */ }
  };

  const handlePreview = async () => {
    setResetStep("preview");
    setResetLoading(true);
    setResetResult(null);
    setResetError(null);
    try {
      const result = await apiClient.previewReset();
      setResetPreview(result);
    } catch (error) {
      setResetError(error.message || "Preview failed");
    } finally {
      setResetLoading(false);
    }
  };

  const handleExecute = async () => {
    if (resetConfirm !== "RESET") return;
    setResetStep("executing");
    setResetLoading(true);
    setResetError(null);
    try {
      const result = await apiClient.executeReset({ company_id: companyContext?.company_id, confirm_text: resetConfirm });
      setResetResult(result);
      setResetPreview(null);
      setResetConfirm("");
      setResetStep("completed");
      load();
    } catch (error) {
      setResetError(error.message || "Reset execution failed");
      setResetStep("error");
    } finally {
      setResetLoading(false);
    }
  };

  const handleEnhancedResetStart = () => {
    setResetStep("warning");
    setResetWarningAck(false);
    setResetBackupInfo(null);
    setResetDependencies(null);
    setResetPreview(null);
    setResetResult(null);
    setResetError(null);
    setResetZeroState(null);
    setResetRollbackResult(null);
  };

  const handleEnhancedBackup = async () => {
    setResetStep("backup");
    setBackupCreating(true);
    try {
      const result = await apiClient.createBackup();
      setResetBackupInfo(result);
      notify?.(`Backup created: ${result.fileName}`, "success");
      setResetStep("dependencies");
    } catch (error) {
      setResetError(error.message || "Backup failed");
      setResetStep("error");
    } finally {
      setBackupCreating(false);
    }
  };

  const handleEnhancedDependencies = async () => {
    setResetStep("dependencies");
    setResetDependencyLoading(true);
    try {
      const result = await apiClient.analyzeResetDependencies?.();
      setResetDependencies(result);
      if (result?.total?.blocked > 0) {
        setResetError("Dependency analysis found blocked tables. Reset cannot proceed.");
        setResetStep("blocked");
      } else {
        setResetStep("preview");
        const preview = await apiClient.previewReset();
        setResetPreview(preview);
      }
    } catch (error) {
      setResetError(error.message || "Dependency analysis failed");
      setResetStep("error");
    } finally {
      setResetDependencyLoading(false);
    }
  };

  const handleEnhancedExecute = async () => {
    if (resetConfirm !== "RESET") return;
    setResetStep("executing");
    setResetLoading(true);
    setResetError(null);
    try {
      const resetPayload = { company_id: companyContext?.company_id, confirm_text: resetConfirm };
      const result = await apiClient.executeEnhancedReset?.(resetPayload) || await apiClient.executeReset(resetPayload);
      setResetResult(result);
      setResetZeroState(result.zeroState);
      setResetConfirm("");
      setResetStep("verification");
      load();
    } catch (error) {
      setResetError(error.message || "Enhanced reset execution failed");
      setResetStep("error");
    } finally {
      setResetLoading(false);
    }
  };

  const handleEnhancedVerification = async () => {
    setResetStep("verification");
    try {
      const cert = await apiClient.generateCertificate();
      setCertificate(cert.certificate);
      setResetStep("certificate");
    } catch (error) {
      setResetError(error.message || "Verification or certificate generation failed");
      setResetStep("error");
    }
  };

  const handleRollback = async () => {
    setResetRollbackLoading(true);
    try {
      const result = await apiClient.rollbackReset?.(resetResult?.backup?.fileName || resetBackupInfo?.fileName || "");
      setResetRollbackResult(result);
      if (result.success) {
        notify?.("Rollback initiated. Restart the app to complete restore.", "success");
      } else {
        notify?.(result.reason || "Rollback failed", "error");
      }
    } catch (error) {
      setResetError(error.message || "Rollback failed");
    } finally {
      setResetRollbackLoading(false);
    }
  };

  const handleResetComplete = () => {
    setResetStep("idle");
    setResetWarningAck(false);
    setResetBackupInfo(null);
    setResetDependencies(null);
    setResetPreview(null);
    setResetResult(null);
    setResetError(null);
    setResetZeroState(null);
    setResetRollbackResult(null);
    setCertificate(null);
  };

  const handleGenerateCertificate = async () => {
    setCertLoading(true);
    setCertificate(null);
    try {
      const result = await apiClient.generateCertificate();
      setCertificate(result.certificate);
      notify?.("Production readiness certificate generated", "success");
    } catch (error) {
      notify?.(error.message || "Certificate generation failed", "error");
    } finally {
      setCertLoading(false);
    }
  };

  const loadInitPreview = async () => {
    if (!apiClient.getDashboardCounts) return;
    setInitPreviewLoading(true);
    try {
      const counts = await apiClient.getDashboardCounts(context);
      setInitPreview(counts);
    } catch { /* ignore */ } finally {
      setInitPreviewLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadProfiles();
    loadFoundationCheck();
    loadVerificationStatus();
  }, [context.company_id, context.company_scope]);

  if (loading) return <div className="panel loading">Loading environment information...</div>;
  if (!info) return <div className="panel error">Failed to load environment information.</div>;

  const readinessClass = info.productionReadiness === "Production Ready" ? "ready" : "not-ready";
  const envClass = info.environment === "Production" ? "env-production" : "env-development";
  const hasOpData = info.operationalCounts?.vouchers > 0 || info.operationalCounts?.totalOrders > 0;

  return (
    <div className="environment-manager">
      <section className="panel environment-hero">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Go-Live Preparation</p>
            <h2>Deployment Manager</h2>
          </div>
          <span className={`readiness-badge ${readinessClass}`}>{info.productionReadiness}</span>
        </div>
        <p className="muted">Administrative deployment and environment management. No operational data is modified from this screen.</p>
      </section>

      {/* --- Environment Status & Database --- */}
      <div className="environment-grid">
        <SectionCard title="Environment Status">
          <StatCard label="Environment Type" value={info.environment} />
          <span className={`env-badge ${envClass}`}>{info.environment}</span>
          <StatCard label="Current Company" value={info.company?.name || "All Companies"} />
          <StatCard label="Verification Profile" value={info.lastVerificationProfile} />
          <StatCard label="Last Reset" value={info.lastReset?.at ? new Date(info.lastReset.at).toLocaleString() : "Never"} />
        </SectionCard>

        <SectionCard title="Database">
          <StatCard label="Database Path" value={info.database?.path || "N/A"} />
          <StatCard label="Database Size" value={formatSize(info.database?.size)} />
          <StatCard label="Database Exists" value={info.database?.exists ? "Yes" : "No"} />
        </SectionCard>

        <SectionCard title="Backup">
          <StatCard label="Last Backup" value={info.lastBackup ? info.lastBackup : "None"} />
          <div className="backup-actions" style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button type="button" className="secondary-btn" onClick={handleCreateBackup} disabled={backupCreating}>
              {backupCreating ? "Creating..." : "Create Backup"}
            </button>
            <button type="button" className="secondary-btn" onClick={handleOpenBackupFolder}>
              Open Backup Folder
            </button>
          </div>
        </SectionCard>

        <SectionCard title="Operational Data Counts">
          <StatCard label="Supply Orders" value={info.operationalCounts?.totalOrders ?? "N/A"} />
          <StatCard label="Invoices" value={info.operationalCounts?.invoices ?? "N/A"} />
          <StatCard label="Procurements" value={info.operationalCounts?.procurements ?? "N/A"} />
          <StatCard label="Payments" value={info.operationalCounts?.payments ?? "N/A"} />
          <StatCard label="Vouchers" value={info.operationalCounts?.vouchers ?? "N/A"} />
          <StatCard label="Receivables" value={info.operationalCounts?.receivables ?? "N/A"} />
          <StatCard label="Payables" value={info.operationalCounts?.payables ?? "N/A"} />
        </SectionCard>

        <SectionCard title="Application">
          <StatCard label="App Name" value={info.app?.name || "N/A"} />
          <StatCard label="Version" value={info.app?.version || "N/A"} />
          <StatCard label="Packaged" value={info.app?.packaged ? "Yes" : "No"} />
          <StatCard label="User Data" value={info.app?.userData || "N/A"} />
        </SectionCard>

        <SectionCard title="Runtime Paths">
          <StatCard label="Runtime Root" value={info.paths?.runtimeRoot || "N/A"} />
        </SectionCard>
      </div>

      {/* --- Verification Status --- */}
      <section className="panel environment-section">
        <h3>Verification Status</h3>
        <p className="muted">Results from the most recent verification runs.</p>
        {verificationLoading ? (
          <p className="muted">Loading verification status...</p>
        ) : verificationStatus ? (
          <div className="verification-status-grid" style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
            {(verificationStatus.checks || []).map((check, i) => (
              <div key={i} className="stat-card" style={{ minWidth: 180 }}>
                <span className="stat-label">{check.title || check.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <VerificationBadge passed={check.passed} />
                  <span className="stat-value">{check.lastRun ? new Date(check.lastRun).toLocaleString() : "Never"}</span>
                </div>
              </div>
            ))}
            {(!verificationStatus.checks || verificationStatus.checks.length === 0) && (
              <p className="muted">No verification runs recorded yet. Run verification from Health Center.</p>
            )}
          </div>
        ) : (
          <div className="verification-actions" style={{ marginTop: 8 }}>
            <button type="button" className="secondary-btn" onClick={loadVerificationStatus}>
              Load Verification Status
            </button>
          </div>
        )}
      </section>

      {/* --- Verification Profile & Environment Switching --- */}
      {isAdmin && (
        <section className="panel environment-section">
          <h3>Deployment Administration</h3>

          <div style={{ marginTop: 12 }}>
            <label style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>Verification Profile</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                className="form-select"
                value={info.lastVerificationProfile}
                onChange={(e) => handleProfileChange(e.target.value)}
                disabled={profileLoading}
                style={{ minWidth: 200 }}
              >
                {profiles.length === 0 && <option value={info.lastVerificationProfile}>{info.lastVerificationProfile}</option>}
                {sortRecordsBy(profiles, (profile) => profile.name).map((p) => (
                  <option key={p.key} value={p.name}>{p.name}</option>
                ))}
              </select>
              {profileLoading && <span className="muted">Loading...</span>}
            </div>
            <p className="muted" style={{ marginTop: 4, fontSize: "0.85em" }}>
              Changes the verification profile used by verify:accounting and verify:financials.
            </p>
          </div>

          <div style={{ marginTop: 20 }}>
            <label style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>Environment Type</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                className="form-select"
                value={envSwitchTarget}
                onChange={(e) => { setEnvSwitchTarget(e.target.value); setEnvSwitchConfirm(false); }}
                style={{ minWidth: 200 }}
              >
                <option value="">Select environment...</option>
                {sortOptions(ENVIRONMENT_TYPES).map((env) => (
                  <option key={env} value={env} disabled={env === info.environment}>{env} {env === info.environment ? "(current)" : ""}</option>
                ))}
              </select>
              {envSwitchTarget && !envSwitchConfirm && (
                <button type="button" className="secondary-btn" onClick={() => setEnvSwitchConfirm(true)}>
                  Switch to {envSwitchTarget}
                </button>
              )}
            </div>
            {envSwitchTarget && envSwitchConfirm && (
              <div style={{ marginTop: 8, padding: 12, border: "1px solid var(--color-warning)", borderRadius: 6, background: "var(--color-warning-bg, #fff8e1)" }}>
                <p><strong>Confirm environment switch to {envSwitchTarget}.</strong> This is an administrative action. No operational data will be modified.</p>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button type="button" className="danger-btn" onClick={handleEnvironmentSwitch}>
                    Confirm Switch to {envSwitchTarget}
                  </button>
                  <button type="button" className="secondary-btn" onClick={() => { setEnvSwitchConfirm(false); setEnvSwitchTarget(""); }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <p className="muted" style={{ marginTop: 4, fontSize: "0.85em" }}>
              Changes the deployment environment label. Verification adapts to environment-specific expectations.
            </p>
          </div>
        </section>
      )}

      {/* --- Foundation Check (Go-Live Preparation) --- */}
      <section className="panel environment-section">
        <h3>Foundation Check</h3>
        <p className="muted">Verifies that foundational records (companies, masters, users) exist and are complete.</p>
        {foundationLoading ? (
          <p className="muted">Loading foundation data...</p>
        ) : foundationCheck ? (
          <div className="foundation-grid" style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
            {Object.entries(foundationCheck).map(([key, val]) => {
              if (typeof val === "object") return null;
              return (
                <div key={key} className="stat-card" style={{ minWidth: 140 }}>
                  <span className="stat-label">{key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                  <span className="stat-value">{val == null ? "N/A" : String(val)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <button type="button" className="secondary-btn" onClick={loadFoundationCheck}>
              Run Foundation Check
            </button>
          </div>
        )}
      </section>

      {/* --- Production Initialization Preview --- */}
      <section className="panel environment-section">
        <h3>Production Initialization Preview</h3>
        <p className="muted">Preview what the database would look like after production initialization. This does not modify any data.</p>
        {initPreviewLoading ? (
          <p className="muted">Loading preview...</p>
        ) : initPreview ? (
          <div style={{ marginTop: 8 }}>
            <table className="reset-preview-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Current</th>
                  <th>Target (Production)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Vouchers</td>
                  <td>{initPreview.vouchers ?? initPreview.totalOrders ?? "N/A"}</td>
                  <td>0</td>
                </tr>
                <tr>
                  <td>Supply Orders</td>
                  <td>{initPreview.totalOrders ?? "N/A"}</td>
                  <td>0</td>
                </tr>
                <tr>
                  <td>Invoices / Receivables</td>
                  <td>{initPreview.receivables ?? "N/A"}</td>
                  <td>0</td>
                </tr>
                <tr>
                  <td>Payments / Payables</td>
                  <td>{initPreview.payables ?? "N/A"}</td>
                  <td>0</td>
                </tr>
                <tr>
                  <td>Companies</td>
                  <td>{initPreview.companies ?? "N/A"}</td>
                  <td>{initPreview.companies ?? "N/A"}</td>
                </tr>
                <tr>
                  <td>Ledgers</td>
                  <td>{info.operationalCounts?.totalOrders != null ? "-" : "N/A"}</td>
                  <td>Preserved</td>
                </tr>
                <tr>
                  <td>Masters</td>
                  <td>Preserved</td>
                  <td>Preserved</td>
                </tr>
              </tbody>
            </table>
            <p className="muted" style={{ marginTop: 8 }}>
              Production initialization (available in a future phase) would reset operational data while preserving foundation data.
            </p>
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <button type="button" className="secondary-btn" onClick={loadInitPreview}>
              Load Preview
            </button>
          </div>
        )}
      </section>

      {/* --- Operational Data Status (Go-Live Panel) --- */}
      {hasOpData && (
        <section className="panel environment-section">
          <h3>Operational Data Status</h3>
          <p className="muted">Current operational transaction counts. Read-only.</p>
          <div className="environment-grid" style={{ marginTop: 8 }}>
            <SectionCard title="Supply & Procurement">
              <StatCard label="Supply Orders" value={info.operationalCounts?.totalOrders ?? 0} />
              <StatCard label="Procurements" value={info.operationalCounts?.procurements ?? 0} />
            </SectionCard>
            <SectionCard title="Billing & Payments">
              <StatCard label="Invoices" value={info.operationalCounts?.invoices ?? 0} />
              <StatCard label="Payments" value={info.operationalCounts?.payments ?? 0} />
            </SectionCard>
            <SectionCard title="Accounting">
              <StatCard label="Vouchers" value={info.operationalCounts?.vouchers ?? 0} />
              <StatCard label="Receivables" value={info.operationalCounts?.receivables ?? 0} warn={info.operationalCounts?.receivables > 0} />
              <StatCard label="Payables" value={info.operationalCounts?.payables ?? 0} warn={info.operationalCounts?.payables > 0} />
            </SectionCard>
          </div>
        </section>
      )}

      {/* --- Controlled Operational Reset (GL-3 Enhanced 10-Step Workflow) --- */}
      <section className="panel environment-section reset-section">
        <h3>Controlled Operational Reset</h3>
        <p className="muted">
          Preview and execute a controlled reset of operational data. Foundation data
          (companies, users, ledgers, masters) will be preserved. A backup is created automatically.
        </p>

        {!isAdmin && (
          <p className="reset-note">Only admin users can perform operational reset.</p>
        )}

        {isAdmin && resetStep === "idle" && (
          <div className="reset-actions" style={{ display: "flex", gap: 8 }}>
            <button type="button" className="secondary-btn" onClick={handlePreview} disabled={resetLoading}>
              {resetLoading ? "Processing..." : "Quick Preview"}
            </button>
            <button type="button" className="danger-btn" onClick={handleEnhancedResetStart}>
              Start 10-Step Reset Workflow
            </button>
          </div>
        )}

        {resetError && !["blocked", "error"].includes(resetStep) && <div className="reset-error">{resetError}</div>}

        {/* --- Step 1: Warning --- */}
        {resetStep === "warning" && (
          <div className="reset-preview" style={{ marginTop: 12 }}>
            <h4 style={{ color: "#856404", marginBottom: 8 }}>Production Warning</h4>
            <p>This process removes operational business transactions.</p>
            <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
              <li>Companies, Ledgers, Masters and Configuration will be preserved.</li>
              <li>A backup will be created before execution.</li>
              <li>This action is auditable and reversible via backup restore.</li>
            </ul>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
              <input type="checkbox" checked={resetWarningAck} onChange={(e) => setResetWarningAck(e.target.checked)} />
              I understand that operational transactions will be removed.
            </label>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button type="button" className="danger-btn" onClick={handleEnhancedBackup} disabled={!resetWarningAck}>
                Continue to Backup
              </button>
              <button type="button" className="secondary-btn" onClick={() => setResetStep("idle")}>Cancel</button>
            </div>
          </div>
        )}

        {/* --- Step 2: Backup --- */}
        {resetStep === "backup" && (
          <div className="reset-preview" style={{ marginTop: 12 }}>
            <h4>Creating Backup...</h4>
            {backupCreating && <p className="muted">Please wait while the backup is created...</p>}
            {resetBackupInfo && (
              <div>
                <p className="reset-success">Backup created successfully.</p>
                <StatCard label="File Name" value={resetBackupInfo.fileName} />
                <StatCard label="Size" value={formatSize(resetBackupInfo.size)} />
                <StatCard label="Path" value={resetBackupInfo.path} />
              </div>
            )}
          </div>
        )}

        {/* --- Step 3: Dependency Analysis --- */}
        {resetStep === "dependencies" && (
          <div className="reset-preview" style={{ marginTop: 12 }}>
            <h4>Dependency Analysis</h4>
            {resetDependencyLoading ? (
              <p className="muted">Analyzing table dependencies and orphan risks...</p>
            ) : resetDependencies ? (
              <div>
                <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                  <span><strong>Safe:</strong> {resetDependencies.total.safe}</span>
                  <span><strong>Warnings:</strong> {resetDependencies.total.warnings}</span>
                  <span><strong>Blocked:</strong> {resetDependencies.total.blocked}</span>
                </div>
                {resetDependencies.warnings?.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <p style={{ color: "#856404", fontWeight: 600 }}>Warnings</p>
                    {resetDependencies.warnings.map((w, i) => (
                      <p key={i} className="muted" style={{ fontSize: "0.85em" }}>{w.table} ({w.module}): {w.orphans?.length} orphan risk(s)</p>
                    ))}
                  </div>
                )}
                {resetDependencies.blocked?.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <p style={{ color: "#721c24", fontWeight: 600 }}>Blocked</p>
                    {resetDependencies.blocked.map((b, i) => (
                      <p key={i} style={{ color: "#721c24", fontSize: "0.85em" }}>{b.table} ({b.module}): {b.orphans?.length} orphan(s) prevent reset</p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button type="button" className="secondary-btn" onClick={handleEnhancedDependencies} disabled={resetDependencyLoading}>
                {resetDependencyLoading ? "Analyzing..." : "Run Dependency Analysis"}
              </button>
            )}
          </div>
        )}

        {/* --- Step 4: Preview --- */}
        {resetStep === "preview" && resetPreview && !resetResult && (
          <div className="reset-preview" style={{ marginTop: 12 }}>
            <h4>Reset Preview</h4>
            <p><strong>Total operational rows: {resetPreview.totalOperational}</strong></p>
            <ResetPreviewTable title="Tables to Clear" data={resetPreview.operational} />
            <ResetPreviewTable title="Preserved Tables" data={resetPreview.preserved} />

            <div className="reset-confirm-section" style={{ marginTop: 12 }}>
              <p className="reset-warning">
                This removes every transaction of <strong>{companyContext?.company_name || "the selected company"}</strong> only (masters, users and chart of accounts are kept). A backup is taken first and the reset can be rolled back. Type <strong>RESET</strong> to confirm.
              </p>
              <input
                type="text"
                className="reset-confirm-input"
                placeholder="Type RESET to confirm"
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="danger-btn"
                  onClick={handleEnhancedExecute}
                  disabled={resetConfirm !== "RESET" || resetLoading}
                >
                  {resetLoading ? "Executing..." : "Execute Reset"}
                </button>
                <button type="button" className="secondary-btn" onClick={() => setResetStep("idle")}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* --- Step 6-7: Execution + Zero-State --- */}
        {resetStep === "executing" && resetLoading && (
          <div className="reset-preview" style={{ marginTop: 12 }}>
            <h4>Executing Reset...</h4>
            <p className="muted">Removing operational records and rebuilding zero state...</p>
          </div>
        )}

        {/* --- Step 8: Verification --- */}
        {resetStep === "verification" && resetResult && (
          <div className="reset-result" style={{ marginTop: 12 }}>
            <p className="reset-success">Reset completed. Operational data removed.</p>
            <StatCard label="Backup" value={resetResult.backup?.fileName || "N/A"} />
            <StatCard label="Rows Before" value={resetResult.before?.totalOperational ?? "N/A"} />
            <StatCard label="Rows After" value={resetResult.after?.totalOperational ?? "0"} />
            {resetZeroState && (
              <div style={{ marginTop: 8 }}>
                <p><strong>Zero-State Rebuild:</strong></p>
                {resetZeroState.rebuilt?.map((msg, i) => <p key={i} className="muted" style={{ fontSize: "0.85em" }}>{msg}</p>)}
                {resetZeroState.warnings?.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    {resetZeroState.warnings.map((w, i) => <p key={i} style={{ color: "#856404", fontSize: "0.85em" }}>{w}</p>)}
                  </div>
                )}
              </div>
            )}
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button type="button" className="secondary-btn" onClick={handleEnhancedVerification}>
                Run Production Verification & Generate Certificate
              </button>
              <button type="button" className="secondary-btn" onClick={handleRollback} disabled={resetRollbackLoading}>
                {resetRollbackLoading ? "Restoring..." : "Rollback from Backup"}
              </button>
            </div>
            {resetRollbackResult && (
              <div style={{ marginTop: 8 }}>
                {resetRollbackResult.success
                  ? <p className="reset-success">Rollback restore queued. Restart the app to complete.</p>
                  : <p className="reset-error">{resetRollbackResult.reason}</p>}
              </div>
            )}
          </div>
        )}

        {/* --- Step 9: Certificate --- */}
        {resetStep === "certificate" && certificate && (
          <div className="certificate-result" style={{ marginTop: 12 }}>
            <h4>Production Readiness Verification</h4>
            <div className="certificate-status" style={{ marginBottom: 8 }}>
              <span className={`readiness-badge ${certificate.status === "Production Ready" ? "ready" : "not-ready"}`}>
                {certificate.status}
              </span>
            </div>
            {certificate.warnings?.length > 0 && (
              <div className="certificate-warnings" style={{ marginBottom: 8 }}>
                {certificate.warnings.map((w, i) => <p key={i} className="cert-warn">{w}</p>)}
              </div>
            )}
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button type="button" className="secondary-btn" onClick={handleResetComplete}>
                Complete & Return to Dashboard
              </button>
            </div>
          </div>
        )}

        {/* --- Error / Blocked --- */}
        {(resetStep === "error" || resetStep === "blocked") && (
          <div className="reset-error" style={{ marginTop: 12 }}>
            <p><strong>{resetStep === "blocked" ? "Reset Blocked" : "Reset Failed"}</strong></p>
            <p>{resetError}</p>
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              {resetStep === "error" && (
                <button type="button" className="secondary-btn" onClick={handleRollback} disabled={resetRollbackLoading}>
                  {resetRollbackLoading ? "Restoring..." : "Rollback from Backup"}
                </button>
              )}
              <button type="button" className="secondary-btn" onClick={handleResetComplete}>
                Dismiss
              </button>
            </div>
            {resetRollbackResult && (
              <div style={{ marginTop: 8 }}>
                {resetRollbackResult.success
                  ? <p className="reset-success">Rollback restore queued. Restart the app to complete.</p>
                  : <p className="muted">{resetRollbackResult.reason}</p>}
              </div>
            )}
          </div>
        )}

        {/* --- Legacy direct result display (from Quick Preview) --- */}
        {resetResult && resetStep === "completed" && (
          <div className="reset-result" style={{ marginTop: 12 }}>
            <p className="reset-success">Reset completed successfully.</p>
            <StatCard label="Backup File" value={resetResult.backup?.fileName || "N/A"} />
            <StatCard label="Backup Path" value={resetResult.backup?.path || "N/A"} />
            <StatCard label="Rows Before" value={resetResult.before?.totalOperational ?? "N/A"} />
            <StatCard label="Rows After" value={resetResult.after?.totalOperational ?? "N/A"} />
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button type="button" className="secondary-btn" onClick={handleResetComplete}>Dismiss</button>
            </div>
          </div>
        )}
      </section>

      {/* --- Production Readiness Certificate --- */}
      <section className="panel environment-section certificate-section">
        <h3>Production Readiness Certificate</h3>
        <p className="muted">
          Generate a formal go-live certificate showing company, master, operational and accounting status.
        </p>

        <div className="certificate-actions">
          <button type="button" className="secondary-btn" onClick={handleGenerateCertificate} disabled={certLoading}>
            {certLoading ? "Generating..." : "Generate Certificate"}
          </button>
        </div>

        {certificate && (
          <div className="certificate-result">
            <div className="certificate-status">
              <span className={`readiness-badge ${certificate.status === "Production Ready" ? "ready" : "not-ready"}`}>
                {certificate.status}
              </span>
            </div>
            {certificate.warnings?.length > 0 && (
              <div className="certificate-warnings">
                {certificate.warnings.map((w, i) => <p key={i} className="cert-warn">{w}</p>)}
              </div>
            )}
            <div className="certificate-grid">
              <SectionCard title="Companies & Users">
                <StatCard label="Companies" value={certificate.companies} />
                <StatCard label="Users" value={certificate.users} />
              </SectionCard>
              <SectionCard title="Masters">
                <StatCard label="Ledgers" value={certificate.ledgers} />
                <StatCard label="Financial Years" value={certificate.masters?.financialYears} />
                <StatCard label="Departments" value={certificate.masters?.departments} />
                <StatCard label="Suppliers" value={certificate.masters?.suppliers} />
                <StatCard label="Items" value={certificate.masters?.items} />
                <StatCard label="Banks" value={certificate.masters?.banks} />
                <StatCard label="Employees" value={certificate.masters?.employees} />
                <StatCard label="Warehouses" value={certificate.masters?.warehouses} />
              </SectionCard>
              <SectionCard title="Operational Transactions">
                <StatCard label="Supply Orders" value={certificate.operational?.supplyOrders} />
                <StatCard label="Invoices" value={certificate.operational?.invoices} />
                <StatCard label="Procurements" value={certificate.operational?.procurements} />
                <StatCard label="Payments" value={certificate.operational?.payments} />
                <StatCard label="Vouchers" value={certificate.operational?.vouchers} />
                <StatCard label="Receivables" value={certificate.operational?.receivables} />
                <StatCard label="Payables" value={certificate.operational?.payables} />
                <StatCard label="Total Operational" value={certificate.operational?.total} warn={certificate.operational?.total > 0} />
              </SectionCard>
              <SectionCard title="Accounting">
                <StatCard label="TB Difference" value={certificate.accounting?.trialBalance?.difference} warn={certificate.accounting?.trialBalance?.difference !== 0} />
                <StatCard label="Net GST Payable" value={certificate.accounting?.gst?.netGstPayable} warn={!certificate.accounting?.gst?.reconciled} />
                <StatCard label="GST Reconciled" value={certificate.accounting?.gst?.reconciled ? "Yes" : "No"} />
              </SectionCard>
              <SectionCard title="Backup">
                <StatCard label="Last Backup" value={certificate.lastBackup || "None"} />
              </SectionCard>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export { EnvironmentManagerScreen };
