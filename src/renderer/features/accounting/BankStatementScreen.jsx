import { useEffect, useState } from "react";
import { exportRows } from "../../utils/formatters.js";
import { BankRowsTable } from "../../screens/BankRowsTable.jsx";
import { Metric, SummaryTable } from "../../components/common.jsx";
import { ReportActionButtons } from "../../components/forms/index.jsx";
import { PhasePanel } from "../../components/panels/SmallComponents.jsx";
import { confirmAction } from "../../utils/actionUtils.js";
import { sortOptions, sortRecordsBy } from "../../utils/optionSorting.js";

function normalizeImportHeader(header) {
  return header.trim().toLowerCase().replaceAll(/\s+/g, "_").replaceAll(/[^a-z0-9_]/g, "").replace(/^_|_$/g, "");
}

function decodeXmlBrowser(text) {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
}

function splitCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  cells.push(value);
  return cells;
}

function matrixToRows(matrix) {
  const headerIndex = matrix.findIndex((row) => row.some((cell) => /date|narration|debit|credit|balance|utr|reference|cheque/i.test(cell)));
  const sourceRows = headerIndex >= 0 ? matrix.slice(headerIndex) : matrix;
  const headers = (sourceRows.shift() || []).map(normalizeImportHeader);
  const entries = headers.map((header, index) => [header, index]).filter(([header]) => header);
  return sourceRows.map((cells) => Object.fromEntries(entries.map(([header, index]) => [header, cells[index] ?? ""])));
}

function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const headers = splitCsvLine(lines.shift() || "").map((header) => header.trim().toLowerCase().replaceAll(" ", "_"));
  return lines.map((line) => Object.fromEntries(splitCsvLine(line).map((cell, index) => [headers[index], cell.trim()])));
}

function parseLegacyXlsText(text) {
  const clean = text.replace(/\0/g, "");
  if (/<table|<tr|<td/i.test(clean)) {
    const rows = [];
    for (const rowMatch of clean.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [];
      for (const cellMatch of rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
        cells.push(decodeXmlBrowser(cellMatch[1].replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ")).trim());
      }
      if (cells.some(Boolean)) rows.push(cells);
    }
    return matrixToRows(rows);
  }
  if (clean.includes("\t")) return matrixToRows(clean.split(/\r?\n/).map((line) => line.split("\t").map((cell) => cell.trim())).filter((row) => row.some(Boolean)));
  return parseCsvText(clean);
}

async function parseUploadFile(file, api) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (file.path) return api.parseImportFile(file.path);
  if (extension === "xlsx") {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    return api.parseImportBuffer(file.name, bytes);
  }
  if (extension === "csv") return parseCsvText(await file.text());
  if (extension === "xls") return parseLegacyXlsText(await file.text());
  throw new Error("Only CSV, XLS and XLSX files are supported for import");
}

export function BankStatementScreen({ view, notify, companyContext, api }) {
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ company_id: companyContext?.company_id || "", bank_id: "", bank_name: "Generic Format", file_name: "", remarks: "" });
  const [mapping, setMapping] = useState({});
  const [selectedImportId, setSelectedImportId] = useState("");

  async function load(filters = {}) {
    setLoading(true);
    try {
      const effectiveFilters = { ...filters, company_id: companyContext?.company_id || form.company_id || filters.company_id };
      const result = await api.getBankStatementData(effectiveFilters);
      setData(result);
      const activeImport = filters.import_id || result.imports?.[0]?.id || "";
      setSelectedImportId(activeImport ? String(activeImport) : "");
      setForm((current) => ({
        ...current,
        company_id: companyContext?.company_id || current.company_id || "",
        bank_id: current.bank_id || result.banks?.[0]?.id || ""
      }));
    } catch (error) {
      notify(error.message || "Bank reconciliation data failed to load", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load({ company_id: companyContext?.company_id });
  }, [companyContext?.company_id, companyContext?.company_scope]);

  async function handleFile(file) {
    if (!file) return;
    try {
      const parsed = await parseUploadFile(file, api);
      setRows(parsed);
      setPreview(null);
      setMapping({});
      setForm((current) => ({ ...current, file_name: file.name }));
      notify(`${parsed.length} bank rows loaded for preview`);
    } catch (error) {
      notify(error.message || "Bank statement file could not be read", "error");
    }
  }

  async function handleDesktopFile() {
    try {
      const selected = await api.selectImportFile();
      if (!selected) return;
      const parsed = await api.parseImportFile(selected.path);
      setRows(parsed);
      setPreview(null);
      setMapping({});
      setForm((current) => ({ ...current, file_name: selected.name }));
      notify(`${parsed.length} bank rows loaded from desktop file`);
    } catch (error) {
      notify(error.message || "Desktop bank statement file could not be read", "error");
    }
  }

  async function runPreview() {
    if (!rows.length) {
      notify("Upload a bank statement first", "error");
      return;
    }
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before previewing a bank import.");
      const result = await api.previewBankImport({ ...form, company_id: companyContext.company_id, rows, mapping });
      setPreview(result);
      setMapping(result.mapping || {});
      notify("Bank statement preview ready");
    } catch (error) {
      notify(error.message || "Preview failed", "error");
    }
  }

  async function saveDraft() {
    if (!preview?.rows?.length) await runPreview();
    const sourceRows = preview?.rows?.length ? rows : rows;
    if (!sourceRows.length) return;
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before saving a bank import.");
      const result = await api.createBankImport({ ...form, company_id: companyContext.company_id, rows: sourceRows, mapping });
      setData(result);
      setPreview(null);
      setRows([]);
      setSelectedImportId(result.imports?.[0]?.id ? String(result.imports[0].id) : "");
      notify("Bank statement saved as Draft. It has not affected accounting.");
    } catch (error) {
      notify(error.message || "Bank import failed", "error");
    }
  }

  async function changeStatus(status) {
    if (!selectedImportId) {
      notify("Select an import batch first", "error");
      return;
    }
    if (status === "Approved") {
      const confirmed = await confirmAction({
        mode: "warning",
        title: "Approve Bank Statement Import",
        message: "Approving this statement will allow reconciliation and bank book creation. Do you want to continue?",
        confirmLabel: "Yes, Approve",
        cancelLabel: "No, Cancel",
        moduleName: "bank_imports",
        recordId: selectedImportId
      });
      if (!confirmed.confirmed) return;
    }
    try {
      const result = await api.updateBankImportStatus(Number(selectedImportId), status, null, form.remarks);
      setData(result);
      notify(`Bank statement marked ${status}`);
    } catch (error) {
      notify(error.message || "Status update failed", "error");
    }
  }

  async function generateProposals() {
    if (!selectedImportId) {
      notify("Select an approved import first", "error");
      return;
    }
    const confirmed = await confirmAction({
      mode: "warning",
      title: "Generate Voucher Proposals",
      message: "Generate voucher proposals for this approved statement? No vouchers will be posted.",
      confirmLabel: "Yes, Proceed",
      cancelLabel: "No, Cancel",
      moduleName: "bank_imports",
      recordId: selectedImportId
    });
    if (!confirmed.confirmed) return;
    try {
      await api.generateVoucherProposals(Number(selectedImportId), null);
      await load({ import_id: selectedImportId });
      notify("Voucher proposals generated. Review them in Voucher Proposal Queue.");
    } catch (error) {
      notify(error.message || "Proposal generation failed", "error");
    }
  }

  async function manualMatch(entry) {
    const moduleName = window.prompt("Match module: vouchers, invoices, payments, supplier_payments, procurements, supply_orders", entry.matched_module || "payments");
    if (!moduleName) return;
    const recordId = Number(window.prompt("Record ID to link", entry.matched_record_id || ""));
    if (!recordId) return;
    const confirmed = await confirmAction({
      mode: "warning",
      title: "Manual Bank Match",
      message: "Do you want to manually match this bank entry? Reconciliation reports may be affected.",
      confirmLabel: "Yes, Proceed",
      cancelLabel: "No, Cancel",
      moduleName: "bank_entries",
      recordId: entry.id
    });
    if (!confirmed.confirmed) return;
    try {
      await api.manualBankEntryMatch(entry.id, { matched_module: moduleName, matched_record_id: recordId, confidence_score: 100 });
      await load({ import_id: selectedImportId });
      notify("Bank entry manually matched");
    } catch (error) {
      notify(error.message || "Manual match failed", "error");
    }
  }

  if (loading) return <PhasePanel title="Loading bank reconciliation" note="Reading imported statement rows and matching queues." />;
  if (view === "unmatched_bank_entries") {
    return (
      <>
        <SummaryTable title="Unmatched Receipts" rows={data?.unmatchedReceipts || []} columns={["transaction_date", "amount", "utr", "narration", "match_status"]} />
        <SummaryTable title="Unmatched Payments" rows={data?.unmatchedPayments || []} columns={["transaction_date", "amount", "utr", "narration", "match_status"]} />
      </>
    );
  }
  if (view === "duplicate_bank_entries") return <SummaryTable title="Duplicate Bank Entries" rows={data?.duplicates || []} columns={["transaction_date", "amount", "utr", "narration", "validation_errors"]} />;
  if (view === "imported_statement_report") return <SummaryTable title="Imported Statement Report" rows={(data?.imports || []).map((row) => ({ ...row, name: `${row.bank_name} / ${row.source_file_name || `Import #${row.id}`}` }))} columns={["status", "posting_status", "total_rows", "valid_rows", "duplicate_rows", "error_rows", "imported_at"]} />;

  const previewRows = preview?.rows || [];
  const entries = data?.entries || [];
  const selectedImport = (data?.imports || []).find((item) => String(item.id) === String(selectedImportId));
  const headers = Object.keys(rows[0] || {});

  return (
    <div className="grid-two">
      <section className="panel settings-panel">
        <h2>Bank Statement Upload</h2>
        <p className="muted">Imported rows remain operational review data until approved. They do not create vouchers automatically.</p>
        <label>
          Company
          <select value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value })}>
            {sortRecordsBy(data?.companies || [], (company) => company.company_name).map((company) => <option key={company.id} value={company.id}>{company.company_name}</option>)}
          </select>
        </label>
        <label>
          Bank Account
          <select value={form.bank_id} onChange={(event) => setForm({ ...form, bank_id: event.target.value })}>
            <option value="">No bank selected</option>
            {sortRecordsBy(data?.banks || [], (bank) => `${bank.bank_account_name} ${bank.bank_name}`).map((bank) => <option key={bank.id} value={bank.id}>{bank.bank_account_name} - {bank.bank_name}</option>)}
          </select>
        </label>
        <label>
          Bank Format
          <select value={form.bank_name} onChange={(event) => setForm({ ...form, bank_name: event.target.value })}>
            {sortOptions(["SBI", "HDFC", "ICICI", "Axis", "Generic Format"]).map((bank) => <option key={bank}>{bank}</option>)}
          </select>
        </label>
        <label>
          Upload XLSX / XLS / CSV
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => handleFile(event.target.files?.[0])} />
        </label>
        <button className="ghost-btn" type="button" onClick={handleDesktopFile}>Browse Desktop File</button>
        <label>
          Remarks
          <textarea value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} />
        </label>
        <div className="button-row">
          <button className="ghost-btn" type="button" onClick={runPreview}>Preview</button>
          <button className="primary-btn" type="button" onClick={saveDraft}>Save Draft Import</button>
        </div>
        {headers.length > 0 && (
          <div className="mini-panel">
            <h3>Column Mapping</h3>
            {["transaction_date", "narration", "debit", "credit", "balance", "utr", "reference_number", "cheque_number"].map((target) => (
              <label key={target}>
                {target.replaceAll("_", " ")}
                <select value={mapping[target] || ""} onChange={(event) => setMapping({ ...mapping, [target]: event.target.value })}>
                  <option value="">Auto / Not mapped</option>
                  {sortOptions(headers).map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="panel settings-panel">
        <div className="records-toolbar">
          <div>
            <h2>Import Review</h2>
            <span>{selectedImport ? `${selectedImport.status} / ${selectedImport.posting_status}` : "No import selected"}</span>
          </div>
          <select value={selectedImportId} onChange={(event) => { setSelectedImportId(event.target.value); load({ import_id: event.target.value }); }}>
            {sortRecordsBy(data?.imports || [], (item) => `${item.source_file_name || ""} ${item.bank_name || ""}`).map((item) => <option key={item.id} value={item.id}>#{item.id} {item.bank_name} - {item.source_file_name}</option>)}
          </select>
        </div>
        <div className="metric-grid compact-metrics">
          <Metric label="Rows" value={preview?.totalRows ?? selectedImport?.total_rows ?? 0} note="Imported" icon="file" />
          <Metric label="Valid" value={preview?.validRows ?? selectedImport?.valid_rows ?? 0} note="Ready" icon="shield" />
          <Metric label="Duplicates" value={preview?.duplicateRows ?? selectedImport?.duplicate_rows ?? 0} note="Blocked" icon="undo" />
          <Metric label="Errors" value={preview?.errorRows ?? selectedImport?.error_rows ?? 0} note="Fix before approval" icon="receipt" />
        </div>
        <div className="button-row">
          <button className="ghost-btn" type="button" onClick={() => changeStatus("Ready for Review")}>Ready for Review</button>
          <button className="ghost-btn" type="button" onClick={() => changeStatus("Approved")}>Approve</button>
          <button className="ghost-btn danger" type="button" onClick={() => changeStatus("Rejected")}>Reject</button>
          <button className="primary-btn" type="button" onClick={generateProposals}>Generate Proposals</button>
        </div>
        <BankRowsTable rows={previewRows.length ? previewRows : entries} onMatch={manualMatch} />
      </section>

      {view === "bank_reconciliation" && (
        <section className="panel settings-panel wide-panel">
          <div className="records-toolbar">
            <div>
              <h2>Reconciliation Matches</h2>
              <span>{data?.matches?.length || 0} match row(s)</span>
            </div>
            <ReportActionButtons onExport={() => exportRows("bank-reconciliation", data?.matches || [])} />
          </div>
          <BankRowsTable rows={data?.matches || []} matchReport />
        </section>
      )}
    </div>
  );
}
