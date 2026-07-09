import { useEffect, useState } from "react";
import { EmptyState } from "../common.jsx";
import { ImportResultSummary } from "../presentation/index.jsx";
import { confirmAction, deleteConfirmOptions } from "../../config/confirmations.js";
import { importTemplates, importTemplateSampleRows } from "../../config/importTemplates.js";
import { downloadText } from "../../utils/formatters.js";
import { csvCell, downloadErrorReport } from "../../utils/spreadsheetExport.js";
import { parseUploadFile } from "../../utils/importParsers.js";

export function AddRecordPanel({ table, title, notify, onImported, records = [], api, children }) {
  const [mode, setMode] = useState("manual");
  const [rows, setRows] = useState([]);
  const [result, setResult] = useState(null);
  const [itemBatches, setItemBatches] = useState([]);
  const [documentForm, setDocumentForm] = useState({ linked_record_id: "", document_type: "Supporting Document", remarks: "" });
  const template = importTemplates[table] || [];

  async function loadItemBatches() {
    if (table !== "items") return;
    try {
      setItemBatches(await api.listItemImportBatches());
    } catch (error) {
      notify(error.message, "error");
    }
  }

  useEffect(() => {
    loadItemBatches();
  }, [table]);

  function downloadTemplate() {
    const sample = importTemplateSampleRows[table];
    const csv = [template, sample].filter(Boolean).map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
    downloadText(`${table}-import-template.csv`, csv);
  }

  async function chooseImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await loadImportRows(file.name, await parseUploadFile(file, api));
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function chooseDesktopImportFile() {
    try {
      if (!api.selectImportFile) throw new Error("Desktop file picker is available only inside the Windows app");
      const selected = await api.selectImportFile();
      if (!selected?.path) return;
      await loadImportRows(selected.name, await api.parseImportFile(selected.path));
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function loadImportRows(fileName, parsed) {
    setRows(parsed);
    const validation = await api.importRecords(table, parsed, { file_name: fileName, dry_run: true });
    setResult(validation);
    notify(`${parsed.length} row(s) ready for preview`);
  }

  async function confirmImport() {
    try {
      const importResult = await api.importRecords(table, rows, { file_name: `${table}-import` });
      setResult(importResult);
      notify(`Imported ${importResult.successfulRows} row(s)`);
      await loadItemBatches();
      await onImported?.();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function deleteItemBatch(batch) {
    const confirmed = await confirmAction({
      ...deleteConfirmOptions("items", batch.id),
      message: `Bulk delete ${batch.item_count} item(s) from import ${batch.file_name || batch.id}? Items used in transactions will be protected.`
    });
    if (!confirmed.confirmed) return;
    try {
      const deleted = await api.deleteItemImportBatch(batch.id);
      notify(`Deleted ${deleted.deleted} imported item(s)`);
      await loadItemBatches();
      await onImported?.();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function uploadDocument(event) {
    event.preventDefault();
    const file = event.currentTarget.elements.document_file.files?.[0];
    if (!file) {
      notify("Select a document to upload", "error");
      return;
    }
    if (!file.path) {
      notify("Document upload is available in the desktop app", "error");
      return;
    }
    try {
      await api.uploadDocument({
        source_path: file.path,
        linked_module: table,
        linked_record_id: documentForm.linked_record_id || null,
        document_type: documentForm.document_type,
        remarks: documentForm.remarks
      });
      notify("Document uploaded");
      event.currentTarget.reset();
      setDocumentForm({ linked_record_id: "", document_type: "Supporting Document", remarks: "" });
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <section className="panel entry-form">
      <div className="entry-tabs">
        {["manual", "import", "upload"].map((key) => (
          <button key={key} type="button" className={mode === key ? "active" : ""} onClick={() => setMode(key)}>
            {key === "manual" ? "Manual Entry" : key === "import" ? "Import from Excel/CSV" : "Upload PDF/Document"}
          </button>
        ))}
      </div>
      {mode === "manual" && children}
      {mode === "import" && (
        <div className="import-panel">
          <div className="panel-head">
            <div>
              <h2>Import {title}</h2>
              <p>Supports CSV and XLSX. Preview and validation run before saving.</p>
            </div>
            <button type="button" className="ghost-btn" onClick={downloadTemplate}>Download Template</button>
          </div>
          <div className="button-row">
            <input type="file" accept=".csv,.xlsx" onChange={chooseImportFile} />
            <button type="button" className="ghost-btn" onClick={chooseDesktopImportFile}>Browse Desktop File</button>
          </div>
          <ImportResultSummary result={result} />
          {rows.length ? (
            <>
              <div className="table-wrap preview-table">
                <table>
                  <thead>
                    <tr>{Object.keys(rows[0]).slice(0, 8).map((key) => <th key={key}>{key}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 8).map((row, index) => (
                      <tr key={index}>{Object.keys(rows[0]).slice(0, 8).map((key) => <td key={key}>{row[key]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result?.errors?.length ? (
                <div className="error-list">
                  <strong>Row-wise errors</strong>
                  {result.errors.slice(0, 8).map((item) => <span key={item.row}>Row {item.row}: {item.errors.join("; ")}</span>)}
                  <button type="button" className="ghost-btn" onClick={() => downloadErrorReport(table, result.errors)}>Download Error Report</button>
                </div>
              ) : null}
              <button type="button" className="primary-btn" onClick={confirmImport}>Confirm Import Valid Rows</button>
            </>
          ) : <EmptyState title="No import file selected" note="Download the sample template, fill records, then upload CSV or XLSX." />}
          {table === "items" && (
            <div className="bulk-delete-panel">
              <div>
                <strong>Bulk Delete Imported Item Batches</strong>
                <span>Use this only when a wrong Item Master file was imported. Items already used in transactions will be protected.</span>
              </div>
              {itemBatches.length ? itemBatches.map((batch) => (
                <div className="bulk-delete-row" key={batch.id}>
                  <span>{batch.file_name || batch.id}<small>{batch.item_count} item(s) - {new Date(batch.created_at).toLocaleString("en-IN")}</small></span>
                  <button type="button" className="ghost-btn danger" onClick={() => deleteItemBatch(batch)}>Bulk Delete</button>
                </div>
              )) : <small>No imported item batches found.</small>}
            </div>
          )}
        </div>
      )}
      {mode === "upload" && (
        <form className="import-panel" onSubmit={uploadDocument}>
          <div className="panel-head">
            <div>
              <h2>Upload Supporting Document</h2>
              <p>PDF, JPG, PNG, XLSX and CSV files are stored locally and linked to this module.</p>
            </div>
          </div>
          <label className="field">Link To Record
            <select value={documentForm.linked_record_id} onChange={(event) => setDocumentForm({ ...documentForm, linked_record_id: event.target.value })}>
              <option value="">Module level document</option>
              {records.map((record) => <option key={record.id} value={record.id}>{record.order_number || record.invoice_number || record.purchase_invoice_number || record.company_name || record.employee_name || record.department_name || record.supplier_name || record.item_name || record.bank_account_name || record.expense_head_name || `Record ${record.id}`}</option>)}
            </select>
          </label>
          <label className="field">Document Type
            <input value={documentForm.document_type} onChange={(event) => setDocumentForm({ ...documentForm, document_type: event.target.value })} />
          </label>
          <label className="field">File
            <input name="document_file" type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.csv" />
          </label>
          <label className="field">Remarks
            <textarea value={documentForm.remarks} onChange={(event) => setDocumentForm({ ...documentForm, remarks: event.target.value })} />
          </label>
          <button className="primary-btn">Upload Document</button>
        </form>
      )}
    </section>
  );
}
