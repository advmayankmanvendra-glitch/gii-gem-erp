import React, { useEffect, useMemo, useState } from "react";
import { downloadText, neutralizeFormula } from "../../utils/formatters.js";
import { sortRecordsBy } from "../../utils/optionSorting.js";

const EXPORT_TYPES = [
  ["template", "Blank Template"],
  ["update", "Existing Data For Update"],
  ["missing_indicators", "Existing Data With Missing Fields"],
  ["completeness", "Data Completeness Report"]
];

const IMPORT_MODES = [
  ["insert_only", "Insert Only"],
  ["update_existing", "Update Existing"],
  ["insert_update", "Insert + Update"]
];

const STATUS_FILTERS = [
  ["all", "All Records"],
  ["active", "Active Only"],
  ["inactive", "Inactive Only"]
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  const [headers = [], ...dataRows] = rows.filter((item) => item.some((value) => String(value || "").trim()));
  return dataRows.map((item) => Object.fromEntries(headers.map((header, index) => [header, item[index] ?? ""])));
}

function safeFileName(masterKey, suffix) {
  return `${masterKey || "master-data"}-${suffix}.csv`;
}

function contextPayload(companyContext, session) {
  return {
    company_id: companyContext?.company_id || null,
    company_name: companyContext?.company_name || "",
    company_scope: companyContext?.company_scope || "single",
    user_id: session?.id || session?.user_id || null
  };
}

function formatDate(value) {
  return value ? String(value).replace("T", " ").slice(0, 19) : "Not recorded";
}

function SummaryTile({ label, value, tone = "" }) {
  return (
    <div className={`master-data-tile ${tone}`}>
      <span>{label}</span>
      <strong>{value ?? 0}</strong>
    </div>
  );
}

function StatusPill({ value }) {
  const text = String(value || "ready").replace(/_/g, " ");
  const tone = ["rejected", "duplicate", "missing_code"].includes(value) ? "danger" : value === "updated" ? "warning" : "";
  return <span className={`status-pill ${tone}`}>{text}</span>;
}

function MasterDataToolsScreen({ notify, apiClient, session, companyContext }) {
  const [definitions, setDefinitions] = useState([]);
  const [selectedMasterKey, setSelectedMasterKey] = useState("");
  const [exportType, setExportType] = useState("template");
  const [status, setStatus] = useState("all");
  const [mode, setMode] = useState("insert_update");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState(null);
  const [completeness, setCompleteness] = useState([]);
  const [health, setHealth] = useState(null);
  const [backupAcknowledged, setBackupAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);

  const selectedMaster = useMemo(
    () => definitions.find((definition) => definition.key === selectedMasterKey) || definitions[0],
    [definitions, selectedMasterKey]
  );
  const selectedCompleteness = completeness.find((item) => item.key === selectedMaster?.key);
  const isAllCompaniesView = companyContext?.company_scope === "all";
  const writeBlocked = isAllCompaniesView || !companyContext?.company_id;

  async function loadData() {
    try {
      const [loadedDefinitions, loadedCompleteness, loadedHealth] = await Promise.all([
        apiClient.getMasterDataDefinitions?.() || [],
        apiClient.getMasterDataCompleteness?.(contextPayload(companyContext, session)) || [],
        apiClient.getMasterDataToolsHealth?.(contextPayload(companyContext, session)) || null
      ]);
      setDefinitions(loadedDefinitions);
      setSelectedMasterKey((current) => current || loadedDefinitions?.[0]?.key || "");
      setCompleteness(loadedCompleteness || []);
      setHealth(loadedHealth || null);
    } catch (error) {
      notify?.(error.message || "Unable to load master data tools", "error");
    }
  }

  useEffect(() => {
    loadData();
  }, [companyContext?.company_id, companyContext?.company_scope]);

  async function handleExport(customType = exportType, masterKey = selectedMaster?.key) {
    if (!masterKey) return;
    try {
      setBusy(true);
      const result = await apiClient.exportMasterData({
        masterKey,
        exportType: customType,
        status,
        ...contextPayload(companyContext, session)
      });
      downloadText(result.fileName || safeFileName(masterKey, customType), result.csv || "");
      notify?.("Master data CSV generated", "success");
      await loadData();
    } catch (error) {
      notify?.(error.message || "Export failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleFileUpload(event) {
    const [file] = event.target.files || [];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      setRows(parsed);
      setFileName(file.name);
      setPreview(null);
      setBackupAcknowledged(false);
      notify?.(`${parsed.length} row(s) loaded for preview`, "success");
    } catch (error) {
      notify?.(error.message || "CSV file could not be read", "error");
    }
  }

  async function handlePreview() {
    if (!selectedMaster?.key || !rows.length) {
      notify?.("Upload a CSV file before preview", "warning");
      return;
    }
    try {
      setBusy(true);
      const result = await apiClient.previewMasterDataUpdate({
        masterKey: selectedMaster.key,
        mode,
        rows,
        fileName,
        ...contextPayload(companyContext, session)
      });
      setPreview(result);
      setBackupAcknowledged(false);
      notify?.(result.canImport ? "Preview ready for controlled import" : "Preview found rows requiring correction", result.canImport ? "success" : "warning");
    } catch (error) {
      notify?.(error.message || "Preview failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateBackup() {
    try {
      setBusy(true);
      await apiClient.createBackup();
      setBackupAcknowledged(true);
      notify?.("Backup created before master data update", "success");
    } catch (error) {
      notify?.(error.message || "Backup could not be created", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!preview?.canImport) {
      notify?.("Resolve preview blockers before confirming import", "error");
      return;
    }
    if (!backupAcknowledged) {
      notify?.("Create backup or acknowledge backup safety before confirming", "warning");
      return;
    }
    try {
      setBusy(true);
      const result = await apiClient.confirmMasterDataUpdate({
        masterKey: selectedMaster.key,
        mode,
        rows,
        fileName,
        ...contextPayload(companyContext, session)
      });
      notify?.(`Master update complete: ${result.imported} row(s) written`, "success");
      setPreview(null);
      setRows([]);
      setFileName("");
      setBackupAcknowledged(false);
      await loadData();
    } catch (error) {
      notify?.(error.message || "Master update failed", "error");
    } finally {
      setBusy(false);
    }
  }

  function downloadErrorReport() {
    if (!preview?.rows?.length) return;
    const reportRows = preview.rows
      .filter((row) => row.errors?.length || ["rejected", "duplicate", "missing_code"].includes(row.action))
      .map((row) => ({
        row_number: row.rowNumber,
        code: row.code,
        name: row.name,
        action: row.action,
        errors: (row.errors || []).join("; ")
      }));
    const csv = [
      "row_number,code,name,action,errors",
      ...reportRows.map((row) => [row.row_number, row.code, row.name, row.action, row.errors].map((value) => `"${neutralizeFormula(String(value ?? "")).replaceAll("\"", "\"\"")}"`).join(","))
    ].join("\r\n") + "\r\n";
    downloadText(safeFileName(selectedMaster?.key, "error-report"), csv);
  }

  return (
    <div className="master-data-tools-screen">
      <section className="panel master-data-hero">
        <div>
          <p className="eyebrow">controlled master data maintenance</p>
          <h2>Master Data Export, Bulk Update and Re-Import</h2>
          <p>
            Export the ERP master template, clean or enrich records in Excel, preview row-wise validation,
            then write only safe rows through the controlled SQLite import path.
          </p>
        </div>
        <div className="master-data-health-summary">
          <SummaryTile label="Average completeness" value={`${health?.averageCompleteness ?? 0}%`} />
          <SummaryTile label="Last rejected rows" value={health?.lastRejectedImportRows ?? 0} tone={health?.lastRejectedImportRows ? "danger" : ""} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Template Download Center</h2>
            <p>Templates and exports use the same columns as the import validator.</p>
          </div>
          <button className="ghost-btn" type="button" onClick={loadData} disabled={busy}>Refresh</button>
        </div>
        <div className="master-data-template-grid">
          {definitions.map((definition) => (
            <div className="master-data-template-card" key={definition.key}>
              <strong>{definition.label}</strong>
              <small>{definition.companyScoped ? "Company-specific" : "Shared master"} · Code: {definition.codeField}</small>
              <div className="template-actions">
                <button type="button" onClick={() => handleExport("template", definition.key)} disabled={busy}>Blank CSV</button>
                <button type="button" onClick={() => handleExport("update", definition.key)} disabled={busy}>Export For Update</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="master-data-work-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Export Master Data</h2>
              <p>Use this for backup-friendly review, Excel cleanup and controlled re-import.</p>
            </div>
          </div>
          <div className="form-grid master-data-controls">
            <label className="field">
              Master
              <select value={selectedMaster?.key || ""} onChange={(event) => { setSelectedMasterKey(event.target.value); setPreview(null); }}>
                {sortRecordsBy(definitions, (definition) => definition.label).map((definition) => <option value={definition.key} key={definition.key}>{definition.label}</option>)}
              </select>
            </label>
            <label className="field">
              Export Type
              <select value={exportType} onChange={(event) => setExportType(event.target.value)}>
                {EXPORT_TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label className="field">
              Status
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {STATUS_FILTERS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <div className="master-data-format-note">
              <strong>Format</strong>
              <span>CSV / Excel-ready CSV. XLSX export can be added later without changing validation rules.</span>
            </div>
          </div>
          <div className="form-actions">
            <button className="primary-btn" type="button" onClick={() => handleExport()} disabled={busy || !selectedMaster}>Download Export</button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Data Quality Dashboard</h2>
              <p>Completeness is calculated from required and operationally useful fields.</p>
            </div>
          </div>
          <div className="master-data-quality-list">
            {completeness.map((item) => (
              <button type="button" key={item.key} onClick={() => setSelectedMasterKey(item.key)} className={item.key === selectedMaster?.key ? "active" : ""}>
                <span>{item.label}</span>
                <strong>{item.completenessPercent}%</strong>
                <small>{item.totalRecords} record(s)</small>
              </button>
            ))}
          </div>
          {selectedCompleteness && (
            <div className="master-data-missing-fields">
              <strong>{selectedCompleteness.label} missing-field summary</strong>
              <div>
                {Object.entries(selectedCompleteness.missingByField || {}).map(([field, count]) => (
                  <span key={field}>{field}: {count}</span>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Bulk Update / Re-Import Preview</h2>
            <p>Nothing is written until preview passes and backup safety is acknowledged.</p>
          </div>
          <button className="ghost-btn" type="button" onClick={downloadErrorReport} disabled={!preview?.rows?.some((row) => row.errors?.length)}>Download Error Report</button>
        </div>
        {writeBlocked && (
          <div className="warning-banner">
            Select a single current company before importing company-specific masters. All Companies View is read-only.
          </div>
        )}
        <div className="form-grid master-data-import-controls">
          <label className="field">
            Update Mode
            <select value={mode} onChange={(event) => { setMode(event.target.value); setPreview(null); }}>
              {IMPORT_MODES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <label className="field">
            Upload Filled CSV
            <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} />
          </label>
          <div className="master-data-file-note">
            <strong>{fileName || "No file selected"}</strong>
            <span>{rows.length} parsed row(s)</span>
          </div>
          <button type="button" onClick={handlePreview} disabled={busy || writeBlocked || !rows.length}>Preview Import</button>
        </div>

        {preview && (
          <>
            <div className="master-data-preview-summary">
              <SummaryTile label="Total" value={preview.summary.total} />
              <SummaryTile label="New" value={preview.summary.new} />
              <SummaryTile label="Updated" value={preview.summary.updated} tone="warning" />
              <SummaryTile label="Rejected" value={preview.summary.rejected} tone={preview.summary.rejected ? "danger" : ""} />
              <SummaryTile label="Duplicates" value={preview.summary.duplicate} tone={preview.summary.duplicate ? "danger" : ""} />
              <SummaryTile label="Missing Codes" value={preview.summary.missingCodes} tone={preview.summary.missingCodes ? "danger" : ""} />
            </div>

            {!!preview.blockingReasons?.length && (
              <div className="warning-banner danger">
                <strong>Import Locked</strong>
                <ul>
                  {preview.blockingReasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              </div>
            )}

            <div className="master-data-backup-panel">
              <div>
                <strong>Backup Safety</strong>
                <span>Bulk master updates should be backed up first. Cancel/No leaves the current database unchanged.</span>
              </div>
              <div className="template-actions">
                <button type="button" onClick={handleCreateBackup} disabled={busy}>Create Backup Now</button>
                <button type="button" onClick={() => setBackupAcknowledged(true)} disabled={busy}>Continue With Existing Backup</button>
              </div>
              {backupAcknowledged && <span className="status-pill active">Backup safety acknowledged</span>}
            </div>

            <div className="preview-table-wrap">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Action</th>
                    <th>Change Preview / Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 120).map((row) => (
                    <tr key={`${row.rowNumber}-${row.code}`}>
                      <td>{row.rowNumber}</td>
                      <td>{row.code || "Missing"}</td>
                      <td>{row.name || "Missing"}</td>
                      <td><StatusPill value={row.action} /></td>
                      <td>
                        {row.errors?.length ? (
                          <ul className="master-data-error-list">{row.errors.map((error) => <li key={error}>{error}</li>)}</ul>
                        ) : row.changes?.length ? (
                          <div className="master-data-change-list">
                            {row.changes.slice(0, 6).map((change) => (
                              <span key={change.field}>{change.label}: {String(change.oldValue || "-")} → {String(change.newValue || "-")}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="muted">No value changes</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-actions">
              <button className="primary-btn" type="button" onClick={handleConfirm} disabled={busy || !preview.canImport || !backupAcknowledged}>Confirm Controlled Import</button>
            </div>
          </>
        )}
      </section>

      <section className="panel master-data-history">
        <div className="panel-head">
          <div>
            <h2>Recent Tool Activity</h2>
            <p>Shown in ERP Health Center as well for operational visibility.</p>
          </div>
        </div>
        <div className="master-data-history-grid">
          <SummaryTile label="Last Template Download" value={formatDate(health?.lastTemplateDownload?.created_at)} />
          <SummaryTile label="Last Export" value={formatDate(health?.lastMasterExport?.created_at)} />
          <SummaryTile label="Last Update" value={formatDate(health?.lastMasterUpdate?.created_at)} />
        </div>
      </section>
    </div>
  );
}

export { MasterDataToolsScreen };
