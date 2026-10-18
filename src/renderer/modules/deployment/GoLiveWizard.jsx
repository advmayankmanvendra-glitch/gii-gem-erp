import React, { useState } from "react";

const STEPS = [
  "Production Ready",
  "Final Confirmation",
  "Mandatory Backup",
  "Backup Validation",
  "Dependency Verification",
  "Controlled Operational Reset",
  "Zero-State Rebuild",
  "Production Verification",
  "Production Certificate",
  "Go-Live Completion"
];

function StepIndicator({ currentStep, failedStep }) {
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "var(--spacing-sm) 0", marginBottom: "var(--spacing-md)" }}>
      {STEPS.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === currentStep;
        const isComplete = stepNum < currentStep;
        const isFailed = stepNum === failedStep;
        let bg = "var(--color-line, #ddd)";
        let fg = "var(--color-text, #333)";
        if (isComplete) { bg = "#155724"; fg = "#fff"; }
        if (isActive) { bg = "#004085"; fg = "#fff"; }
        if (isFailed) { bg = "#721c24"; fg = "#fff"; }
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: bg, color: fg, fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}>
              {isComplete ? "✓" : isFailed ? "✗" : stepNum}
            </div>
            <span style={{ fontSize: "0.7rem", whiteSpace: "nowrap", color: isActive ? "var(--color-text, #333)" : "#888" }}>{label}</span>
            {i < STEPS.length - 1 && <div style={{ width: 16, height: 2, background: isComplete ? "#155724" : "var(--color-line, #ddd)" }} />}
          </div>
        );
      })}
    </div>
  );
}

function GoLiveWizard({ apiClient, companyContext }) {
  const [step, setStep] = useState(0);
  const [failedStep, setFailedStep] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [preconditions, setPreconditions] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [backupInfo, setBackupInfo] = useState(null);
  const [backupValidation, setBackupValidation] = useState(null);
  const [depsResult, setDepsResult] = useState(null);
  const [resetResult, setResetResult] = useState(null);
  const [zeroState, setZeroState] = useState(null);
  const [verification, setVerification] = useState(null);
  const [certificate, setCertificate] = useState(null);
  const [goLiveEntry, setGoLiveEntry] = useState(null);
  const [confirmText, setConfirmText] = useState("");
  const [history, setHistory] = useState([]);

  const enterStep = (s) => {
    setStep(s);
    setFailedStep(null);
    setError(null);
  };

  const handleError = (err, failAtStep) => {
    const msg = err?.message || err || "Unknown error";
    setError(msg);
    setFailedStep(failAtStep);
  };

  const step1CheckPreconditions = async () => {
    setLoading(true);
    try {
      const result = await apiClient.checkGoLivePreconditions({ company_id: companyContext?.company_id });
      setPreconditions(result);
      if (!result.allPassed) {
        const failedPreconditions = result.issues.filter(i => !i.passed).map(i => `${i.label}${i.detail ? ` (${i.detail})` : ""}`);
        handleError(`Precondition check failed: ${failedPreconditions.join("; ")}`, 1);
      } else {
        enterStep(2);
      }
    } catch (err) {
      handleError(err, 1);
    } finally {
      setLoading(false);
    }
  };

  const step2Confirm = () => {
    if (confirmText !== "GO-LIVE") {
      setError("Type GO-LIVE to confirm");
      return;
    }
    setError(null);
    enterStep(3);
  };

  const step3CreateBackup = async () => {
    setLoading(true);
    try {
      const preview = await apiClient.previewGoLive();
      setPreviewData(preview);
      const result = await apiClient.executeGoLive({ company_id: companyContext?.company_id, confirm_text: "RESET" });
      setBackupInfo(result.backup);
      setBackupValidation(result.backupValidation);
      setResetResult(result.resetResult);
      setZeroState(result.zeroState);
      setGoLiveEntry(result.goLiveEntry);
      if (!result.backupValidation?.valid) {
        handleError("Backup creation failed validation", 3);
      } else {
        enterStep(4);
      }
    } catch (err) {
      handleError(err, 3);
    } finally {
      setLoading(false);
    }
  };

  const step4ValidateBackup = () => {
    if (backupValidation?.valid) {
      enterStep(5);
    } else {
      handleError("Backup validation failed", 4);
    }
  };

  const step5CheckDependencies = async () => {
    setLoading(true);
    try {
      const deps = previewData?.dependencies;
      setDepsResult(deps);
      if (deps?.blocked?.length > 0) {
        handleError(`Dependency check failed: ${deps.blocked.length} blocked tables`, 5);
      } else {
        enterStep(6);
      }
    } catch (err) {
      handleError(err, 5);
    } finally {
      setLoading(false);
    }
  };

  const step6ExecuteReset = () => {
    if (!resetResult) {
      handleError("Reset result not available", 6);
      return;
    }
    enterStep(7);
  };

  const step7VerifyZeroState = () => {
    if (zeroState?.warnings?.length > 0) {
      handleError("Zero-state verification found remaining data", 7);
    } else {
      enterStep(8);
    }
  };

  const step8VerifyProduction = async () => {
    setLoading(true);
    try {
      const result = await apiClient.verifyGoLive(goLiveEntry?.id);
      setVerification(result.verification);
      if (!result.verification.overallPassed) {
        handleError("Production verification failed — auto-rollback triggered", 8);
        const rollback = await apiClient.rollbackGoLive(goLiveEntry?.id, "Production verification failed");
        setError(`Rollback ${rollback.rollbackResult.success ? "succeeded" : "failed"}: ${rollback.reason}`);
      } else {
        enterStep(9);
      }
    } catch (err) {
      handleError(err, 8);
    } finally {
      setLoading(false);
    }
  };

  const step9GenerateCertificate = async () => {
    setLoading(true);
    try {
      const result = await apiClient.completeGoLive(goLiveEntry?.id, verification);
      setCertificate(result.certificate);
      if (result.success) {
        enterStep(10);
      } else {
        handleError("Certificate generation failed", 9);
      }
    } catch (err) {
      handleError(err, 9);
    } finally {
      setLoading(false);
    }
  };

  const step10Finish = async () => {
    try {
      const hist = await apiClient.getGoLiveHistory();
      setHistory(hist);
    } catch { /* ignore */ }
  };

  const handleReset = () => {
    setStep(0);
    setFailedStep(null);
    setLoading(false);
    setError(null);
    setPreconditions(null);
    setPreviewData(null);
    setBackupInfo(null);
    setBackupValidation(null);
    setDepsResult(null);
    setResetResult(null);
    setZeroState(null);
    setVerification(null);
    setCertificate(null);
    setGoLiveEntry(null);
    setConfirmText("");
  };

  return (
    <div className="screen" style={{ padding: "var(--spacing-md)" }}>
      <div className="screen-header" style={{ marginBottom: "var(--spacing-md)" }}>
        <h2>First Controlled Go-Live Initialization</h2>
        <p className="muted">Execute the first certified transition from development ERP to production-ready Government Supply ERP</p>
      </div>

      <StepIndicator currentStep={step} failedStep={failedStep} />

      {error && (
        <div className="error-banner" style={{ padding: "8px 12px", marginBottom: "var(--spacing-sm)", backgroundColor: step === 8 && failedStep === 8 ? "#fff3cd" : "#f8d7da", color: step === 8 && failedStep === 8 ? "#856404" : "#721c24" }}>
          {error}
        </div>
      )}

      {step === 0 && (
        <section className="panel" style={{ padding: "var(--spacing-lg)", textAlign: "center" }}>
          <h3 style={{ marginBottom: 8 }}>Go-Live Production Initialization</h3>
          <p style={{ maxWidth: 560, margin: "0 auto var(--spacing-md)" }}>
            This will execute the first controlled production initialization of GII GeM ERP.
            All prerequisites (GL-1 through GL-4) must be completed and locked.
          </p>
          <div style={{ display: "flex", gap: "var(--spacing-sm)", justifyContent: "center" }}>
            <button type="button" className="primary-btn" onClick={step1CheckPreconditions} disabled={loading}>Start Go-Live Workflow</button>
          </div>
        </section>
      )}

      {step >= 1 && preconditions && (
        <section className="panel" style={{ padding: "var(--spacing-md)", marginBottom: "var(--spacing-sm)" }}>
          <h3 style={{ margin: "0 0 var(--spacing-sm)", fontSize: "0.9rem" }}>Step 1: Precondition Check</h3>
          <div style={{ display: "grid", gap: 6 }}>
            {preconditions.issues.map((issue, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, color: issue.passed ? "#155724" : "#721c24" }}>
                <span style={{ fontWeight: 700 }}>{issue.passed ? "✓" : "✗"}</span>
                <span style={{ fontSize: "0.85rem" }}>{issue.label}</span>
                {issue.detail && <span className="muted" style={{ fontSize: "0.75rem" }}>({issue.detail})</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="panel" style={{ padding: "var(--spacing-md)", marginBottom: "var(--spacing-sm)" }}>
          <h3 style={{ margin: "0 0 var(--spacing-sm)", fontSize: "0.9rem" }}>Step 2: Final Confirmation</h3>
          <p style={{ fontSize: "0.85rem", marginBottom: "var(--spacing-sm)" }}>
            You are about to initialize GII GeM ERP for production. The following will be removed: operational transactions, demo vouchers, demo invoices, demo payments, demo stock movements, demo allocations, demo imports. The following will be preserved: companies, ledgers, chart of accounts, suppliers, departments, items, banks, users, financial years, configuration.
          </p>
          <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>Type <code>GO-LIVE</code> to confirm:</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="Type GO-LIVE" style={{ padding: "6px 10px", fontSize: "0.9rem", width: 200 }} />
            <button type="button" className="primary-btn" onClick={step2Confirm} disabled={confirmText !== "GO-LIVE"}>Confirm & Continue</button>
          </div>
        </section>
      )}

      {step >= 3 && backupInfo && (
        <section className="panel" style={{ padding: "var(--spacing-md)", marginBottom: "var(--spacing-sm)" }}>
          <h3 style={{ margin: "0 0 var(--spacing-sm)", fontSize: "0.9rem" }}>Step 3: Mandatory Backup</h3>
          <p style={{ fontSize: "0.85rem", margin: "2px 0" }}>File: <code>{backupInfo.fileName}</code></p>
          <p style={{ fontSize: "0.85rem", margin: "2px 0" }}>Path: <code>{backupInfo.path}</code></p>
          <p style={{ fontSize: "0.85rem", margin: "2px 0" }}>Size: {(backupInfo.size / 1024).toFixed(1)} KB</p>
          <p style={{ fontSize: "0.85rem", margin: "2px 0" }}>Created: {backupInfo.createdAt}</p>
          {backupValidation && <p style={{ fontSize: "0.85rem", margin: "2px 0", color: backupValidation.valid ? "#155724" : "#721c24" }}>Validation: {backupValidation.valid ? "Passed" : `Failed — ${backupValidation.reason}`}</p>}
          <button type="button" className="primary-btn" onClick={step4ValidateBackup} disabled={!backupValidation?.valid} style={{ marginTop: 8 }}>Continue</button>
        </section>
      )}

      {step >= 5 && depsResult && (
        <section className="panel" style={{ padding: "var(--spacing-md)", marginBottom: "var(--spacing-sm)" }}>
          <h3 style={{ margin: "0 0 var(--spacing-sm)", fontSize: "0.9rem" }}>Step 5: Dependency Verification</h3>
          <p style={{ fontSize: "0.85rem" }}>{depsResult.blocked?.length || 0} blocked, {depsResult.warnings?.length || 0} warnings, {depsResult.safe?.length || 0} safe</p>
          {depsResult.blocked?.length > 0 && (
            <div style={{ color: "#721c24", fontSize: "0.8rem" }}>
              {depsResult.blocked.map((b, i) => <p key={i} style={{ margin: "2px 0" }}>✗ {b.table} ({b.module}) — {b.orphans?.length || 0} orphans</p>)}
            </div>
          )}
        </section>
      )}

      {step >= 6 && resetResult && (
        <section className="panel" style={{ padding: "var(--spacing-md)", marginBottom: "var(--spacing-sm)" }}>
          <h3 style={{ margin: "0 0 var(--spacing-sm)", fontSize: "0.9rem" }}>Step 6: Controlled Operational Reset</h3>
          <p style={{ fontSize: "0.85rem", margin: "2px 0" }}>Audit ID: {resetResult.auditId || "N/A"}</p>
          <p style={{ fontSize: "0.85rem", margin: "2px 0" }}>Tables cleared: {resetResult.after?.operational?.filter(t => t.count === 0).length || 0} / {resetResult.after?.operational?.length || 0}</p>
          <button type="button" className="primary-btn" onClick={step6ExecuteReset} style={{ marginTop: 8 }}>Continue</button>
        </section>
      )}

      {step >= 7 && zeroState && (
        <section className="panel" style={{ padding: "var(--spacing-md)", marginBottom: "var(--spacing-sm)" }}>
          <h3 style={{ margin: "0 0 var(--spacing-sm)", fontSize: "0.9rem" }}>Step 7: Zero-State Rebuild</h3>
          {zeroState.rebuilt.map((r, i) => <p key={i} style={{ fontSize: "0.8rem", margin: "2px 0", color: "#155724" }}>✓ {r}</p>)}
          {zeroState.warnings.map((w, i) => <p key={i} style={{ fontSize: "0.8rem", margin: "2px 0", color: "#856404" }}>⚠ {w}</p>)}
          {zeroState.warnings.length === 0 && <button type="button" className="primary-btn" onClick={step7VerifyZeroState} style={{ marginTop: 8 }}>Continue</button>}
        </section>
      )}

      {step >= 8 && verification && (
        <section className="panel" style={{ padding: "var(--spacing-md)", marginBottom: "var(--spacing-sm)" }}>
          <h3 style={{ margin: "0 0 var(--spacing-sm)", fontSize: "0.9rem" }}>Step 8: Production Verification</h3>
          {verification.scriptResults?.map((r, i) => (
            <p key={i} style={{ fontSize: "0.8rem", margin: "2px 0", color: r.passed ? "#155724" : "#721c24" }}>
              {r.passed ? "✓" : "✗"} {r.name} {r.passed ? "" : `— ${r.error}`}
            </p>
          ))}
          {verification.additionalChecks?.map((c, i) => (
            <p key={i} style={{ fontSize: "0.8rem", margin: "2px 0", color: c.passed ? "#155724" : "#721c24" }}>
              {c.passed ? "✓" : "✗"} {c.label} {c.detail ? `(${c.detail})` : ""}
            </p>
          ))}
          <p style={{ fontWeight: 600, marginTop: 8, color: verification.overallPassed ? "#155724" : "#721c24" }}>
            Overall: {verification.overallPassed ? "PASSED" : "FAILED"}
          </p>
        </section>
      )}

      {step === 9 && (
        <section className="panel" style={{ padding: "var(--spacing-md)", marginBottom: "var(--spacing-sm)", border: "2px solid #155724", backgroundColor: "#d4edda" }}>
          <h3 style={{ margin: "0 0 var(--spacing-sm)", color: "#155724", fontSize: "0.9rem" }}>Step 9: Production Certificate</h3>
          {certificate ? (
            <>
              <p style={{ margin: "4px 0", fontSize: "0.85rem" }}>Certificate: <strong>{certificate.certificateNumber}</strong></p>
              <p style={{ margin: "4px 0", fontSize: "0.85rem" }}>Status: <strong>{certificate.readiness?.status || certificate.status}</strong></p>
              <p style={{ margin: "4px 0", fontSize: "0.85rem" }}>Score: <strong>{certificate.readiness?.score}%</strong></p>
              <p style={{ margin: "4px 0", fontSize: "0.85rem" }}>Version: {certificate.erpVersion} | DB: {certificate.dbVersion}</p>
            </>
          ) : (
            <p style={{ margin: "4px 0", fontSize: "0.85rem" }}>Verification passed. Complete go-live to re-check the books and issue the production certificate.</p>
          )}
          <button type="button" className="primary-btn" onClick={step9GenerateCertificate} disabled={loading} style={{ marginTop: 8 }}>Complete Go-Live</button>
        </section>
      )}

      {step === 10 && (
        <section className="panel" style={{ padding: "var(--spacing-lg)", textAlign: "center", border: "2px solid #155724" }}>
          <h3 style={{ color: "#155724", fontSize: "1.2rem" }}>✓ Go-Live Completed</h3>
          <p style={{ fontSize: "0.9rem" }}>GII GeM ERP is now certified as a production-ready Government Supply ERP.</p>
          {certificate && (
            <div style={{ margin: "var(--spacing-sm) 0" }}>
              <p style={{ margin: "4px 0", fontSize: "0.85rem" }}>Certificate: <strong>{certificate.certificateNumber}</strong></p>
              <p style={{ margin: "4px 0", fontSize: "0.85rem" }}>Issued: {certificate.generatedDate} {certificate.generatedTime}</p>
            </div>
          )}
          <div style={{ display: "flex", gap: "var(--spacing-sm)", justifyContent: "center", marginTop: "var(--spacing-sm)" }}>
            <button type="button" className="secondary-btn" onClick={step10Finish}>View History</button>
            <button type="button" className="secondary-btn" onClick={handleReset}>Start New Go-Live</button>
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section className="panel" style={{ padding: "var(--spacing-md)", marginTop: "var(--spacing-md)" }}>
          <h3 style={{ margin: "0 0 var(--spacing-sm)", fontSize: "1rem" }}>Go-Live History</h3>
          <div style={{ overflowX: "auto" }}>
            <table className="reset-preview-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Certificate</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Backup</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry, i) => (
                  <tr key={i}>
                    <td>{entry.goliveNumber || entry.id}</td>
                    <td>{entry.certificate?.certificateNumber || "-"}</td>
                    <td>{entry.generatedDate || new Date(entry.generatedAt).toLocaleDateString()}</td>
                    <td><span className={`badge ${entry.status === "completed" ? "badge-pass" : entry.status === "rolled_back" ? "badge-fail" : ""}`} style={{ fontSize: "0.7rem" }}>{entry.status}</span></td>
                    <td style={{ fontSize: "0.8rem" }}>{entry.backup?.fileName || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div style={{ display: "flex", gap: "var(--spacing-sm)", marginTop: "var(--spacing-md)" }}>
        <button type="button" className="secondary-btn" onClick={handleReset} disabled={step === 0}>Reset Wizard</button>
      </div>

      {previewData && previewData.preview && (
        <section className="panel" style={{ padding: "var(--spacing-md)", marginTop: "var(--spacing-sm)" }}>
          <h3 style={{ margin: "0 0 var(--spacing-sm)", fontSize: "0.85rem" }}>Operational Data Preview</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 4, fontSize: "0.75rem" }}>
            {previewData.preview.operational?.filter(t => t.count > 0).map((t, i) => (
              <div key={i} style={{ padding: "2px 4px" }}>{t.table}: {t.count}</div>
            ))}
            {(!previewData.preview.operational || previewData.preview.operational.filter(t => t.count > 0).length === 0) && <div className="muted">No operational data</div>}
          </div>
        </section>
      )}

      {step > 0 && goLiveEntry && (
        <section className="panel" style={{ padding: "var(--spacing-md)", marginTop: "var(--spacing-sm)" }}>
          <h3 style={{ margin: "0 0 var(--spacing-sm)", fontSize: "0.85rem" }}>Go-Live Entry #{goLiveEntry.id}</h3>
          <p style={{ fontSize: "0.75rem", margin: "2px 0" }}>ID: {goLiveEntry.id} | Number: {goLiveEntry.goliveNumber}</p>
        </section>
      )}
    </div>
  );
}

export { GoLiveWizard };