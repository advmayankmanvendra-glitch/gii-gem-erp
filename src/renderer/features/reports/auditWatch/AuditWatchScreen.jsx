import React, { useEffect, useMemo, useState } from "react";

// Audit Watch: read-only exception checks over the selected company's books.
// The screen only asks; the main process decides which areas the signed-in role may
// see and runs the checks without writing anything.

const SEVERITY_LABEL = { high: "High", medium: "Medium", low: "Low" };
const SEVERITY_CLASS = { high: "fail", medium: "warn", low: "" };
const STATUS_LABEL = { clear: "Clear", findings: "To look at", waiting: "Not yet available", error: "Could not run" };

const isoDate = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const today = () => isoDate(new Date());
const yearAgo = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return isoDate(d); };
const rupees = (minor) => (minor ? `Rs. ${(Number(minor) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "");
const label = (key) => String(key).replaceAll("_", " ");
const cell = (value) => (value === null || value === undefined || value === "" ? "" : typeof value === "object" ? JSON.stringify(value) : String(value));

function EvidenceTable({ rows }) {
  const list = (rows || []).slice(0, 20);
  const columns = [...new Set(list.flatMap((row) => Object.keys(row || {})))].slice(0, 12);
  if (!list.length) return <p className="muted">No supporting rows.</p>;
  return (
    <div className="table-wrap audit-watch-evidence">
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{label(column)}</th>)}</tr></thead>
        <tbody>
          {list.map((row, index) => (
            <tr key={index}>{columns.map((column) => <td key={column}>{cell(row?.[column])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CheckDetail({ result }) {
  const [openKey, setOpenKey] = useState(null);
  return (
    <div className="audit-watch-detail">
      <p><strong>What it means.</strong> {result.meaning}</p>
      <p><strong>What to do.</strong> {result.nextStep}</p>
      {result.status === "error" ? <p className="audit-watch-error">This check could not run: {result.error}</p> : null}
      {result.status === "waiting" ? <p className="muted">{result.note}</p> : null}
      {result.findings?.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Finding</th><th className="numeric">Amount</th><th aria-label="Details" /></tr></thead>
            <tbody>
              {result.findings.map((finding) => (
                <React.Fragment key={finding.key}>
                  <tr>
                    <td>{finding.date || ""}</td>
                    <td>{finding.summary}</td>
                    <td className="numeric">{rupees(finding.amountMinor)}</td>
                    <td>
                      <button type="button" className="ghost-btn" aria-expanded={openKey === finding.key}
                        onClick={() => setOpenKey(openKey === finding.key ? null : finding.key)}>
                        {openKey === finding.key ? "Hide rows" : "Show rows"}
                      </button>
                    </td>
                  </tr>
                  {openKey === finding.key ? (
                    <tr className="audit-watch-evidence-row"><td colSpan={4}><EvidenceTable rows={finding.evidence} /></td></tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {result.scope === "installation" ? <p className="muted">This check looks at the whole installation (users and the audit trail), not only this company.</p> : null}
      {result.truncated ? <p className="muted">Showing the first {result.findings.length} of {result.findingCount}. Narrow the period to see the rest.</p> : null}
    </div>
  );
}

function AuditWatchScreen({ apiClient, companyContext, notify }) {
  const companyId = companyContext?.company_id;
  const [catalogue, setCatalogue] = useState(null);
  const [from, setFrom] = useState(yearAgo);
  const [to, setTo] = useState(today);
  const [area, setArea] = useState("all");
  const [onlyFindings, setOnlyFindings] = useState(true);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [openCheck, setOpenCheck] = useState(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      if (typeof apiClient?.getAuditWatchCatalogue !== "function") { setProblem("Audit Watch runs in the Windows desktop app only."); return; }
      try {
        const result = await apiClient.getAuditWatchCatalogue({ company_id: companyId });
        if (live) { setCatalogue(result); setProblem(""); }
      } catch (error) {
        if (live) setProblem(error.message);
      }
    })();
    return () => { live = false; };
  }, [apiClient, companyId]);

  useEffect(() => { setReport(null); setOpenCheck(null); }, [companyId]);

  const run = async () => {
    if (!companyId) { notify?.("Choose a company first.", "error"); return; }
    setLoading(true);
    try {
      const result = await apiClient.runAuditWatch({ company_id: companyId, from, to });
      setReport(result);
      setOpenCheck(null);
      const total = result.summary.reduce((sum, row) => sum + row.high + row.medium + row.low, 0);
      notify?.(total ? `Audit Watch found ${total} item${total === 1 ? "" : "s"} to look at.` : "Audit Watch found nothing to look at for this period.");
    } catch (error) {
      notify?.(`Audit Watch could not run: ${error.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const visible = useMemo(() => (report?.results || []).filter((result) => (area === "all" || result.area === area)
    && (!onlyFindings || result.status === "findings" || result.status === "error")), [report, area, onlyFindings]);

  if (problem) {
    return (
      <section className="audit-watch" aria-label="Audit Watch">
        <p>{problem}</p>
      </section>
    );
  }

  return (
    <section className="audit-watch" aria-label="Audit Watch">
      <p className="audit-watch-intro">
        Looks through this company's books for exceptions an auditor or CA should check. It only reads: nothing is posted or changed,
        and nothing leaves this computer. A finding is something to look at, not proof that anything is wrong.
      </p>

      <form className="audit-watch-controls" onSubmit={(event) => { event.preventDefault(); run(); }}>
        <label>From<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} required /></label>
        <label>To<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} required /></label>
        <label>Area
          <select value={area} onChange={(event) => setArea(event.target.value)}>
            <option value="all">All areas</option>
            {(catalogue?.areas || []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="audit-watch-toggle">
          <input type="checkbox" checked={onlyFindings} onChange={(event) => setOnlyFindings(event.target.checked)} />
          Only checks with findings
        </label>
        <button type="submit" className="primary-btn" disabled={loading || !catalogue}>{loading ? "Checking..." : "Run checks"}</button>
      </form>

      {report ? (
        <>
          <div className="audit-watch-summary" role="list">
            {report.summary.map((row) => (
              <button type="button" role="listitem" key={row.area}
                className={`audit-watch-card${area === row.area ? " selected" : ""}`}
                onClick={() => setArea(area === row.area ? "all" : row.area)}>
                <span className="audit-watch-card-title">{row.label}</span>
                <span className="audit-watch-card-counts">
                  <span className="status-pill fail">{row.high} high</span>
                  <span className="status-pill warn">{row.medium} medium</span>
                  <span className="status-pill">{row.low} low</span>
                </span>
                {row.errors ? <span className="audit-watch-error">{row.errors} check{row.errors === 1 ? "" : "s"} could not run</span> : null}
              </button>
            ))}
          </div>
          <p className="muted">Period {report.from} to {report.to}, as of {report.today}. Ran {report.results.length} checks in {report.ms} ms.{report.engine === "in-process" ? " This run used the app's main process because the background runner could not start, so the window may have paused while it ran." : ""}</p>

          <div className="audit-watch-checks">
            {visible.map((result) => (
              <article key={result.id} className={`audit-watch-check status-${result.status}`}>
                <button type="button" className="audit-watch-check-head" aria-expanded={openCheck === result.id}
                  onClick={() => setOpenCheck(openCheck === result.id ? null : result.id)}>
                  <span className={`status-pill ${SEVERITY_CLASS[result.severity]}`}>{SEVERITY_LABEL[result.severity]}</span>
                  <span className="audit-watch-check-title">{result.id} {result.title}{result.scope === "installation" ? <span className="audit-watch-scope"> (all companies on this computer)</span> : null}</span>
                  <span className="audit-watch-check-status">
                    {result.status === "findings" ? `${result.findingCount} to look at` : STATUS_LABEL[result.status]}
                  </span>
                </button>
                {openCheck === result.id ? <CheckDetail result={result} /> : null}
              </article>
            ))}
            {!visible.length ? <p>{onlyFindings ? "No check found anything for this period and area." : "No checks in this area."}</p> : null}
          </div>
        </>
      ) : (
        <p className="muted">{catalogue ? `${catalogue.checks.length} checks are available for your role. Choose a period and run them.` : "Loading the check list..."}</p>
      )}
    </section>
  );
}

export { AuditWatchScreen };
