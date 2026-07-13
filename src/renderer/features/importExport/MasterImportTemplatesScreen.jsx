import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../../components/common.jsx";
import { masterImportTemplateDefinitions } from "../../config/importTemplates.js";
import { downloadText } from "../../utils/formatters.js";
import { createInitialTemplateFieldMap, csvCell, downloadErrorReport, downloadXlsx, mapTemplateRows, normalizeImportHeader, parseUploadFile, validateStagedTemplateRows } from "../../utils/fileParsers.js";

export function MasterImportTemplatesScreen({ notify, api }) {
  const [selectedId, setSelectedId] = useState(masterImportTemplateDefinitions[0]?.id || "");
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [fieldMap, setFieldMap] = useState({});
  const [result, setResult] = useState(null);
  const [importMode, setImportMode] = useState("skip_existing");
  const selectedTemplate = useMemo(() => masterImportTemplateDefinitions.find((template) => template.id === selectedId) || masterImportTemplateDefinitions[0], [selectedId]);
  const detectedColumns = useMemo(() => Object.keys(rows[0] || {}), [rows]);
  const mappedRows = useMemo(() => mapTemplateRows(rows, selectedTemplate, fieldMap), [rows, selectedTemplate, fieldMap]);
  const previewColumns = selectedTemplate?.columns?.slice(0, 10) || [];

  useEffect(() => {
    setRows([]);
    setFileName("");
    setFieldMap({});
    setResult(null);
  }, [selectedId]);

  function downloadCsvTemplate(template = selectedTemplate) {
    const csv = [template.columns, template.sample].filter(Boolean).map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
    downloadText(`${template.id}.csv`, csv);
  }

  function downloadXlsxTemplate(template = selectedTemplate) {
    downloadXlsx(`${template.id}.xlsx`, [template.columns, template.sample].filter(Boolean));
  }

  async function chooseUploadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await loadTemplateRows(file.name, await parseUploadFile(file));
    } catch (error) {
      notify(error.message || "Template upload failed", "error");
    } finally {
      event.target.value = "";
    }
  }

  async function chooseDesktopImportFile() {
    try {
      if (!api.selectImportFile) throw new Error("Desktop file picker is available only inside the Windows app");
      const selected = await api.selectImportFile();
      if (!selected?.path) return;
      await loadTemplateRows(selected.name, await api.parseImportFile(selected.path));
    } catch (error) {
      notify(error.message || "Desktop file selection failed", "error");
    }
  }

  async function loadTemplateRows(uploadedFileName, parsedRows) {
    const normalizedRows = parsedRows.map((row) => Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [normalizeImportHeader(key), value])));
    setRows(normalizedRows);
    setFileName(uploadedFileName);
    setFieldMap(createInitialTemplateFieldMap(selectedTemplate, normalizedRows));
    setResult(null);
    notify(`${normalizedRows.length} row(s) loaded for template preview`);
  }

  async function validateRows() {
    if (!rows.length) {
      notify("Upload a filled template before validation", "error");
      return;
    }
    try {
      const validation = selectedTemplate.table
        ? await api.importRecords(selectedTemplate.table, mappedRows, { file_name: fileName, dry_run: true, module: "master_import_templates", import_mode: importMode })
        : validateStagedTemplateRows(selectedTemplate, mappedRows);
      setResult(validation);
      notify(`Validation complete: ${validation.successfulRows || 0} valid row(s)`);
    } catch (error) {
      notify(error.message || "Template validation failed", "error");
    }
  }

  async function confirmImport() {
    if (!selectedTemplate.table) {
      notify("This template is staging/mapping only and cannot write directly to live tables", "warning");
      return;
    }
    if (!rows.length) {
      notify("Upload and validate a filled template before import", "error");
      return;
    }
    try {
      const importResult = await api.importRecords(selectedTemplate.table, mappedRows, {
        file_name: fileName || `${selectedTemplate.id}.csv`,
        module: "master_import_templates",
        import_mode: importMode
      });
      setResult(importResult);
      notify(`Import completed: ${importResult.successfulRows || 0} valid row(s), ${importResult.updatedRows || 0} updated`);
    } catch (error) {
      notify(error.message || "Import failed", "error");
    }
  }

  function downloadCurrentErrorReport() {
    if (!result?.errors?.length) return;
    downloadErrorReport(selectedTemplate.id, result.errors);
  }

  return (
    <section className="template-center-layout">
      <aside className="panel template-list-panel">
        <div className="panel-head">
          <div>
            <h2>Master Import Templates</h2>
            <p>Prepare clean master data before controlled import.</p>
          </div>
        </div>
        <div className="template-list">
          {masterImportTemplateDefinitions.map((template) => (
            <button key={template.id} type="button" className={selectedId === template.id ? "active" : ""} onClick={() => setSelectedId(template.id)}>
              <span>{template.title}</span>
              <small>{template.category}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="panel template-workbench">
        <div className="template-workbench-head">
          <div>
            <span className={`status-pill ${selectedTemplate.table ? "active" : "warning"}`}>{selectedTemplate.table ? "Controlled Master Import" : "Staging / Mapping Only"}</span>
            <h2>{selectedTemplate.title}</h2>
            <p>{selectedTemplate.guidance}</p>
          </div>
          <div className="button-row">
            <button type="button" className="ghost-btn" onClick={() => downloadCsvTemplate()}>Download CSV</button>
            <button type="button" className="ghost-btn" onClick={() => downloadXlsxTemplate()}>Download XLSX</button>
          </div>
        </div>

        <div className="template-meta-grid">
          <div>
            <strong>Required Fields</strong>
            <div className="chip-row">{selectedTemplate.required.map((field) => <span key={field}>{field}</span>)}</div>
          </div>
          <div>
            <strong>Duplicate Detection</strong>
            <div className="chip-row">{selectedTemplate.duplicateKeys.map((field) => <span key={field}>{field}</span>)}</div>
          </div>
          <div>
            <strong>Import Mode</strong>
            <select value={importMode} onChange={(event) => setImportMode(event.target.value)} disabled={!selectedTemplate.table}>
              <option value="skip_existing">Skip existing records</option>
              <option value="update_existing">Update existing records</option>
            </select>
          </div>
        </div>

        <div className="template-flow">
          {["Upload Template", "Preview", "Validate", "Map Fields", "Confirm Import", "Audit Log"].map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>

        <div className="button-row">
          <input type="file" accept=".csv,.xlsx,.xls" onChange={chooseUploadFile} />
          <button type="button" className="ghost-btn" onClick={chooseDesktopImportFile}>Browse Desktop File</button>
          <button type="button" className="ghost-btn" onClick={validateRows} disabled={!rows.length}>Validate Before Import</button>
          <button type="button" className="primary-btn" onClick={confirmImport} disabled={!rows.length || !selectedTemplate.table}>Confirm Import</button>
        </div>

        <div className="template-audit-note">
          <strong>Safety:</strong> Confirmed imports use the existing import validation service and create an import audit log. Staging-only templates do not write to live accounting or master tables.
        </div>

        {fileName && <p className="muted-note">Uploaded file: <strong>{fileName}</strong></p>}

        {result && (
          <div className="import-result template-result">
            <span>Total: <strong>{result.totalRows || 0}</strong></span>
            <span>Valid: <strong>{result.successfulRows || 0}</strong></span>
            <span>Failed: <strong>{result.failedRows || 0}</strong></span>
            <span>Duplicates: <strong>{result.skippedDuplicates || 0}</strong></span>
            <span>Updated: <strong>{result.updatedRows || 0}</strong></span>
          </div>
        )}

        {rows.length ? (
          <>
            <section className="template-section">
              <h3>Field Mapping</h3>
              <p>Map uploaded columns to the standard ERP template before validation.</p>
              <div className="field-map-grid">
                {selectedTemplate.columns.map((column) => (
                  <label key={column} className={selectedTemplate.required.includes(column) ? "required" : ""}>
                    <span>{column}</span>
                    <select value={fieldMap[column] || ""} onChange={(event) => setFieldMap((current) => ({ ...current, [column]: event.target.value }))}>
                      <option value="">Not mapped</option>
                      {detectedColumns.map((detected) => <option key={detected} value={detected}>{detected}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </section>

            <section className="template-section">
              <h3>Preview</h3>
              <div className="table-wrap preview-table">
                <table>
                  <thead>
                    <tr>{previewColumns.map((column) => <th key={column}>{column}</th>)}</tr>
                  </thead>
                  <tbody>
                    {mappedRows.slice(0, 10).map((row, index) => (
                      <tr key={index}>{previewColumns.map((column) => <td key={column}>{row[normalizeImportHeader(column)] || ""}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {result?.errors?.length ? (
              <div className="error-list">
                <strong>Row-wise Validation Errors</strong>
                {result.errors.slice(0, 10).map((item) => <span key={`${item.row}-${item.status}`}>Row {item.row}: {item.errors.join("; ")}</span>)}
                <button type="button" className="ghost-btn" onClick={downloadCurrentErrorReport}>Download Error Report</button>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState title="No template uploaded yet" note="Download CSV/XLSX, fill records, then upload the file for preview and validation." />
        )}
      </section>
    </section>
  );
}
