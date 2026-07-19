import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../components/common.jsx";
import { FileNameIndicator, ImportResultSummary, TemplateAuditNote, TemplateFlowSteps } from "../components/presentation/index.jsx";
import { masterImportTemplateDefinitions } from "../config/importTemplates.js";
import { csvCell, downloadErrorReport, downloadXlsx } from "../utils/spreadsheetExport.js";
import { downloadText } from "../utils/formatters.js";
import { normalizeImportHeader, parseUploadFile } from "../utils/importParsers.js";
import { sortOptions } from "../utils/optionSorting.js";

function createInitialTemplateFieldMap(template, rows) {
  const detected = Object.keys(rows[0] || {});
  return Object.fromEntries((template.columns || []).map((column) => {
    const normalizedColumn = normalizeImportHeader(column);
    const match = detected.find((field) => normalizeImportHeader(field) === normalizedColumn);
    return [column, match || ""];
  }));
}

function mapTemplateRows(rows, template, fieldMap) {
  return rows.map((row) => Object.fromEntries((template.columns || []).map((column) => {
    const key = normalizeImportHeader(column);
    const mappedField = fieldMap[column];
    return [key, mappedField ? row[mappedField] ?? "" : row[key] ?? ""];
  })));
}

function validateStagedTemplateRows(template, rows) {
  const result = { totalRows: rows.length, successfulRows: 0, failedRows: 0, skippedDuplicates: 0, updatedRows: 0, errors: [] };
  const seen = new Set();
  rows.forEach((row, index) => {
    const errors = [];
    const rowNumber = index + 1;
    const value = (field) => String(row[normalizeImportHeader(field)] ?? "").trim();

    template.required.forEach((field) => {
      if (!value(field)) errors.push(`${field} is required`);
    });

    if (value("gstin") && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value("gstin"))) {
      errors.push("GSTIN format is invalid");
    }
    if (value("pan") && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value("pan"))) {
      errors.push("PAN format is invalid");
    }
    ["gst_rate", "purchase_rate", "sales_rate", "opening_balance", "opening_stock_qty", "opening_stock_value", "amount"].forEach((field) => {
      if (value(field) && !Number.isFinite(Number(value(field)))) errors.push(`${field} must be numeric`);
    });
    if (value("opening_balance") && !["debit", "credit"].includes(value("opening_balance_type").toLowerCase())) {
      errors.push("opening_balance_type must be Debit or Credit when opening balance is present");
    }
    if (template.id === "tally_ledger_mapping" && !value("erp_account_group")) {
      errors.push("erp_account_group is required for ledger mapping");
    }
    if (template.id === "tally_voucher_mapping") {
      const knownTypes = new Set(["sales", "purchase", "receipt", "payment", "journal", "contra", "credit note", "debit note"]);
      if (value("tally_voucher_type") && !knownTypes.has(value("tally_voucher_type").toLowerCase()) && !value("erp_voucher_type")) {
        errors.push("Unknown Tally voucher type requires erp_voucher_type mapping");
      }
    }

    const duplicateKey = template.duplicateKeys.map((field) => value(field).toLowerCase()).filter(Boolean).join("|");
    if (duplicateKey) {
      if (seen.has(duplicateKey)) {
        result.skippedDuplicates += 1;
        result.errors.push({ row: rowNumber, status: "Duplicate", errors: ["Duplicate key in uploaded template"] });
        return;
      }
      seen.add(duplicateKey);
    }

    if (errors.length) {
      result.failedRows += 1;
      result.errors.push({ row: rowNumber, status: "Failed", errors });
      return;
    }
    result.successfulRows += 1;
  });
  return result;
}

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
      await loadTemplateRows(file.name, await parseUploadFile(file, api));
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

        <TemplateFlowSteps steps={["Upload Template", "Preview", "Validate", "Map Fields", "Confirm Import", "Audit Log"]} />

        <div className="button-row">
          <input type="file" accept=".csv,.xlsx,.xls" onChange={chooseUploadFile} />
          <button type="button" className="ghost-btn" onClick={chooseDesktopImportFile}>Browse Desktop File</button>
          <button type="button" className="ghost-btn" onClick={validateRows} disabled={!rows.length}>Validate Before Import</button>
          <button type="button" className="primary-btn" onClick={confirmImport} disabled={!rows.length || !selectedTemplate.table}>Confirm Import</button>
        </div>

        <TemplateAuditNote>Confirmed imports use the existing import validation service and create an import audit log. Staging-only templates do not write to live accounting or master tables.</TemplateAuditNote>

        <FileNameIndicator label="Uploaded file" fileName={fileName} />

        <ImportResultSummary result={result} />

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
                      {sortOptions(detectedColumns).map((detected) => <option key={detected} value={detected}>{detected}</option>)}
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
