import React, { useEffect, useState } from "react";

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
  const [resetPreview, setResetPreview] = useState(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetResult, setResetResult] = useState(null);
  const [resetError, setResetError] = useState(null);
  const [certificate, setCertificate] = useState(null);
  const [certLoading, setCertLoading] = useState(false);

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

  const load = async () => {
    setLoading(true);
    try {
      const result = await apiClient.getEnvironmentInfo(context);
      setInfo(result);
    } catch (error) {
      notify?.(error.message || "Could not load environment info", "error");
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
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
    setResetLoading(true);
    setResetError(null);
    try {
      const result = await apiClient.executeReset(userId);
      setResetResult(result);
      setResetPreview(null);
      setResetConfirm("");
      load();
    } catch (error) {
      setResetError(error.message || "Reset execution failed");
    } finally {
      setResetLoading(false);
    }
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

  useEffect(() => { load(); }, [context.company_id, context.company_scope]);

  if (loading) return <div className="panel loading">Loading environment information...</div>;
  if (!info) return <div className="panel error">Failed to load environment information.</div>;

  const readinessClass = info.productionReadiness === "Production Ready" ? "ready" : "not-ready";
  const envClass = info.environment === "Production" ? "env-production" : "env-development";

  return (
    <div className="environment-manager">
      <section className="panel environment-hero">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Go-Live Preparation</p>
            <h2>Environment Manager</h2>
          </div>
          <span className={`readiness-badge ${readinessClass}`}>{info.productionReadiness}</span>
        </div>
        <p className="muted">View-only environment status. No data mutation occurs from this screen.</p>
      </section>

      <div className="environment-grid">
        <SectionCard title="Environment Status">
          <StatCard label="Environment Type" value={info.environment} />
          <span className={`env-badge ${envClass}`}>{info.environment}</span>
          <StatCard label="Current Company" value={info.company?.name || "All Companies"} />
          <StatCard label="Verification Profile" value={info.lastVerificationProfile} />
        </SectionCard>

        <SectionCard title="Database">
          <StatCard label="Database Path" value={info.database?.path || "N/A"} />
          <StatCard label="Database Size" value={formatSize(info.database?.size)} />
          <StatCard label="Database Exists" value={info.database?.exists ? "Yes" : "No"} />
        </SectionCard>

        <SectionCard title="Backup">
          <StatCard label="Last Backup" value={info.lastBackup ? info.lastBackup : "None"} />
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

      <section className="panel environment-section reset-section">
        <h3>Controlled Operational Reset</h3>
        <p className="muted">
          Preview and execute a controlled reset of operational data. Foundation data
          (companies, users, ledgers, masters) will be preserved. A backup is created automatically.
        </p>

        {!isAdmin && (
          <p className="reset-note">Only admin users can perform operational reset.</p>
        )}

        {isAdmin && !resetResult && (
          <div className="reset-actions">
            <button type="button" className="secondary-btn" onClick={handlePreview} disabled={resetLoading}>
              {resetLoading ? "Processing..." : "Preview Reset"}
            </button>
          </div>
        )}

        {resetError && <div className="reset-error">{resetError}</div>}

        {resetPreview && !resetResult && (
          <div className="reset-preview">
            <p><strong>Total operational rows: {resetPreview.totalOperational}</strong></p>
            <ResetPreviewTable title="Operational Tables" data={resetPreview.operational} />
            <ResetPreviewTable title="Preserved Tables" data={resetPreview.preserved} />

            <div className="reset-confirm-section">
              <p className="reset-warning">
                This will permanently remove all operational data. Type <strong>RESET</strong> to confirm.
              </p>
              <input
                type="text"
                className="reset-confirm-input"
                placeholder='Type RESET to confirm'
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
              />
              <button
                type="button"
                className="danger-btn"
                onClick={handleExecute}
                disabled={resetConfirm !== "RESET" || resetLoading}
              >
                {resetLoading ? "Executing..." : "Execute Reset"}
              </button>
            </div>
          </div>
        )}

        {resetResult && (
          <div className="reset-result">
            <p className="reset-success">Reset completed successfully.</p>
            <StatCard label="Backup File" value={resetResult.backup?.fileName || "N/A"} />
            <StatCard label="Backup Path" value={resetResult.backup?.path || "N/A"} />
            <StatCard label="Rows Before" value={resetResult.before?.totalOperational ?? "N/A"} />
            <StatCard label="Rows After" value={resetResult.after?.totalOperational ?? "N/A"} />
            <p className="muted">Run verification from the Health Center to confirm zero-state readiness.</p>
          </div>
        )}
      </section>

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
                {certificate.warnings.map((w, i) => <p key={i} className="cert-warn">⚠ {w}</p>)}
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
