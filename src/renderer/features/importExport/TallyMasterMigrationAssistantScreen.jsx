import { useEffect, useMemo, useState } from "react";
import { ViewTabs } from "../../components/forms/index.jsx";
import { EmptyState } from "../../components/common.jsx";
import { TemplateAuditNote } from "../../components/presentation/index.jsx";
import { confirmAction } from "../../config/confirmations.js";
import { csvCell } from "../../utils/spreadsheetExport.js";
import { downloadText } from "../../utils/formatters.js";
import { sortRecordsBy } from "../../utils/optionSorting.js";

const tallyMasterMigrationFileSlots = [
  { id: "stock_items_xml", label: "Stock Items XML", note: "Stock items, units, stock groups, godowns, HSN and GST." },
  { id: "ledgers_xml", label: "Ledgers XML", note: "Suppliers, departments, banks, expense heads and reference ledgers." },
  { id: "ledger_groups_xml", label: "Ledger Groups XML", note: "Classification support for ledger migration." },
  { id: "units_xml", label: "Units XML", note: "Tally unit names for ERP unit mapping." },
  { id: "stock_groups_xml", label: "Stock Groups XML", note: "Item category reference." },
  { id: "godowns_xml", label: "Godowns XML", note: "Warehouse/location reference." },
  { id: "trial_balance_reference", label: "Trial Balance Excel/CSV", note: "Reference only. No opening voucher is posted in Stage 1." },
  { id: "stock_summary_reference", label: "Stock Summary Excel/CSV", note: "Reference only. No stock ledger is posted in Stage 1." }
];

const tallyMigrationImportTables = [
  { key: "companies", table: "companies", label: "Companies" },
  { key: "suppliers", table: "suppliers", label: "Suppliers" },
  { key: "government_departments", table: "government_departments", label: "Departments / Customers" },
  { key: "banks", table: "banks", label: "Banks" },
  { key: "expense_heads", table: "expense_heads", label: "Expense Heads" },
  { key: "warehouses", table: "warehouses", label: "Warehouses" },
  { key: "items", table: "items", label: "Items" }
];

function emptyImportResult() {
  return { totalRows: 0, successfulRows: 0, failedRows: 0, skippedDuplicates: 0, updatedRows: 0, errors: [] };
}

function tallyLedgerReviewKey(row = {}) {
  return `${row.row_number || "row"}::${row.tally_ledger_name || ""}`;
}

function isTallyLedgerReviewRequired(row = {}) {
  return row.suggested_master === "manual_review" || (!row.suggested_master && row.validation_status === "Needs Review");
}

function tallyLedgerReviewReason(row = {}) {
  const reasons = [];
  if (!row.tally_ledger_name) reasons.push("Missing ledger name");
  if (!row.tally_group) reasons.push("Ledger group is unlinked");
  if (row.suggested_master === "manual_review" || !row.suggested_master) reasons.push("Ledger type cannot be safely mapped automatically");
  if (row.duplicate_match?.label) reasons.push(`Possible existing match: ${row.duplicate_match.label}`);
  if (row.opening_balance_reference) reasons.push("Opening balance is reference-only in Stage 1");
  (row.warnings || []).forEach((warning) => reasons.push(warning));
  return reasons.length ? reasons.join("; ") : "Ready for import";
}

function tallyLedgerReviewPayload(row = {}, target) {
  const ledgerName = String(row.tally_ledger_name || "").trim();
  if (target === "suppliers") {
    return {
      supplier_name: ledgerName,
      gstin: row.gstin || "",
      contact_details: row.contact_details || "",
      bank_details: [row.bank_name, row.account_number, row.ifsc].filter(Boolean).join(" | "),
      supplier_account_name: ledgerName,
      supplier_account_number: row.account_number || "",
      supplier_bank_name: row.bank_name || "",
      supplier_bank_ifsc_code: row.ifsc || "",
      remarks: "Mapped from Tally ledger review",
      status: "active"
    };
  }
  return {
    department_name: ledgerName,
    contact_person: row.contact_details || "",
    contact_number: "",
    address: row.address || "",
    remarks: "Mapped from Tally ledger review",
    status: "active"
  };
}

function buildTallyStage1ImportRows(preview, options = {}) {
  if (!preview) return Object.fromEntries(tallyMigrationImportTables.map((item) => [item.key, []]));
  const companyId = Number(options.companyId) || "";
  const mappedCompanyId = options.companyMode === "map_existing" ? companyId : "";
  const ledgerReviewActions = options.ledgerReviewActions || {};
  const companyPayload = preview.companies?.[0]?.import_payload;
  const hasCompanyName = Boolean(String(companyPayload?.company_name || "").trim());
  const rows = {
    companies: options.companyMode === "create_new" && hasCompanyName ? [companyPayload] : [],
    suppliers: [],
    government_departments: [],
    banks: [],
    expense_heads: [],
    warehouses: [],
    items: []
  };
  (preview.ledgers || []).forEach((ledger) => {
    const action = ledgerReviewActions[tallyLedgerReviewKey(ledger)] || "";
    if (action === "skip" || action === "reference_only" || action === "mark_reviewed") return;
    if (action === "map_supplier") {
      rows.suppliers.push(tallyLedgerReviewPayload(ledger, "suppliers"));
      return;
    }
    if (action === "map_department") {
      rows.government_departments.push(tallyLedgerReviewPayload(ledger, "government_departments"));
      return;
    }
    if (!ledger.import_payload || ledger.validation_status === "Failed") return;
    if (rows[ledger.suggested_master]) rows[ledger.suggested_master].push(ledger.import_payload);
  });
  rows.warehouses = (preview.godowns || [])
    .filter((godown) => godown.import_payload)
    .map((godown) => ({ ...godown.import_payload, company_id: mappedCompanyId || godown.import_payload.company_id || "" }));
  rows.items = (preview.stockItems || [])
    .filter((item) => item.import_payload && item.validation_status !== "Failed" && !item.duplicate_in_xml)
    .map((item) => ({
      ...item.import_payload,
      gst_rate: item.import_payload.gst_rate || String(options.defaultGstRate || "").trim(),
      opening_stock: "",
      opening_rate: "",
      opening_value: ""
    }));
  return rows;
}

function buildTallyMigrationGateIssues({
  preview,
  validation,
  validationSummary,
  partialImportReady,
  companyMappingReady,
  defaultGstReady,
  reviewChecks,
  ledgerReviewReady,
  importMode,
  requiredLedgerReviewRows,
  resolvedLedgerReviewRows
}) {
  const issues = [];
  if (!preview) issues.push("Run Preview Migration before import.");
  if (!validation || validation.mode !== "validation") issues.push("Run Validate Prepared Import before confirming import.");
  if (!companyMappingReady) issues.push("Approve company mapping before import.");
  if (!defaultGstReady) issues.push("Enter a valid default GST rate for blank or inherited GST rows.");
  if (!importMode) issues.push("Select duplicate action before import.");
  if (!reviewChecks?.company) issues.push("Confirm company mapping review.");
  if (!reviewChecks?.gstReview) issues.push("Confirm GST/HSN review.");
  if (!reviewChecks?.duplicateReview) issues.push("Confirm duplicate action review.");
  if (!ledgerReviewReady) issues.push(`Resolve ${Math.max(0, (requiredLedgerReviewRows?.length || 0) - (resolvedLedgerReviewRows?.length || 0))} ledger classification row(s).`);
  if (!reviewChecks?.ledgerReview) issues.push("Confirm ledger classification review.");
  if (!reviewChecks?.reference) issues.push("Confirm opening stock/reference review.");
  if (validation?.mode === "validation" && validationSummary.failedRows > 0 && !partialImportReady) {
    issues.push(`${validationSummary.failedRows} failed row(s) remain. Resolve them or allow controlled partial import.`);
  }
  if (validation?.mode === "validation" && validationSummary.successfulRows === 0) issues.push("No valid rows are available for import.");
  return issues;
}

function migrationStatusClass(status) {
  if (status === "Ready" || status === "Reviewed") return "active";
  if (status === "Failed") return "danger";
  return "warning";
}

function flattenTallyMigrationErrors(results = {}) {
  return Object.entries(results || {}).flatMap(([master, result]) => (result?.errors || []).map((error) => ({
    master,
    row: error.row || "",
    status: error.status || "Failed",
    reason: (error.errors || []).join("; ") || error.message || "Validation failed"
  })));
}

function summarizeTallyMigrationResults(results = {}) {
  return Object.values(results).reduce((summary, result) => ({
    totalRows: summary.totalRows + (result.totalRows || 0),
    successfulRows: summary.successfulRows + (result.successfulRows || 0),
    failedRows: summary.failedRows + (result.failedRows || 0),
    skippedDuplicates: summary.skippedDuplicates + (result.skippedDuplicates || 0),
    updatedRows: summary.updatedRows + (result.updatedRows || 0)
  }), { totalRows: 0, successfulRows: 0, failedRows: 0, skippedDuplicates: 0, updatedRows: 0 });
}

function previewTallyMigrationIssues(preview = null) {
  if (!preview) return [];
  const ledgerIssues = (preview.ledgers || [])
    .filter((row) => row.validation_status !== "Ready" || (row.warnings || []).length)
    .map((row) => ({
      master: "ledgers",
      row: row.row_number || "",
      status: row.validation_status || "Needs Review",
      reason: tallyLedgerReviewReason(row)
    }));
  const stockIssues = (preview.stockItems || [])
    .filter((row) => row.validation_status !== "Ready" || (row.warnings || []).length)
    .map((row) => ({
      master: "items",
      row: row.row_number || "",
      status: row.validation_status || "Needs Review",
      reason: (row.warnings || []).join("; ") || "Review item GST/HSN/import readiness"
    }));
  const parseIssues = (preview.errors || []).map((row) => ({
    master: "parse",
    row: row.file_name || "",
    status: "Failed",
    reason: row.error || "Parse failed"
  }));
  return [...parseIssues, ...ledgerIssues, ...stockIssues];
}

function tallyMigrationReportRows(preview, importRows, validation, importResult) {
  const rows = [
    ["Section", "Metric", "Value"],
    ["Summary", "Files", preview.totals?.files || 0],
    ["Summary", "Companies", preview.totals?.companies || 0],
    ["Summary", "Ledgers", preview.totals?.ledgers || 0],
    ["Summary", "Stock Items", preview.totals?.items || 0],
    ["Summary", "Missing GST", preview.totals?.itemMissingGst || 0],
    ["Summary", "Missing HSN", preview.totals?.itemMissingHsn || 0],
    ["Summary", "Opening Stock Reference Rows", preview.totals?.openingStockReferenceRows || 0],
    ["Safety", "Opening stock posting", "Reference only"],
    ["Safety", "Historical voucher posting", "Not allowed in Stage 1"]
  ];
  tallyMigrationImportTables.forEach((item) => {
    rows.push(["Prepared Rows", item.label, (importRows[item.key] || []).length]);
  });
  if (validation?.results) {
    const summary = summarizeTallyMigrationResults(validation.results);
    rows.push(["Validation", "Successful Rows", summary.successfulRows], ["Validation", "Failed Rows", summary.failedRows], ["Validation", "Duplicates", summary.skippedDuplicates]);
  }
  if (importResult?.results) {
    const summary = summarizeTallyMigrationResults(importResult.results);
    rows.push(["Import", "Successful Rows", summary.successfulRows], ["Import", "Updated Rows", summary.updatedRows], ["Import", "Duplicates", summary.skippedDuplicates]);
  }
  return rows;
}

async function runTallyStage1Import(api, commit, rowsByTable, importMode, userId, companyId) {
  const results = {};
  for (const item of tallyMigrationImportTables) {
    const rows = rowsByTable[item.key] || [];
    if (!rows.length) {
      results[item.key] = emptyImportResult();
      continue;
    }
    results[item.key] = await api.importRecords(item.table, rows, {
      file_name: "tally-stage-1-master-migration",
      module: "tally_migration_assistant",
      import_mode: importMode,
      dry_run: !commit,
      user_id: userId,
      company_id: companyId || undefined
    });
  }
  return results;
}

function TallyLedgerBulkReviewUtilityPanel({
  requiredCount,
  reviewedCount,
  selectedCount,
  unresolvedSelectedCount,
  pendingCount,
  bulkAction,
  onBulkActionChange,
  onApply,
  onSelectAll,
  onSelectUnresolved,
  onClear
}) {
  if (!requiredCount) return null;
  return (
    <section className="utility-extension ledger-bulk-review-panel" aria-label="Ledger classification bulk review">
      <div className="utility-extension-head">
        <strong>Ledger Bulk Review</strong>
        <span>{reviewedCount} of {requiredCount} resolved</span>
      </div>
      <div className="ledger-bulk-counts">
        <span><strong>{selectedCount}</strong> selected</span>
        <span><strong>{pendingCount}</strong> pending</span>
      </div>
      {unresolvedSelectedCount ? <p className="muted-note">{unresolvedSelectedCount} selected row(s) still require action.</p> : null}
      <label className="utility-field">
        <span>Bulk Action</span>
        <select value={bulkAction} onChange={(event) => onBulkActionChange(event.target.value)}>
          <option value="">Select action</option>
          <option value="map_supplier">Map to Supplier</option>
          <option value="map_department">Map to Department / Customer</option>
          <option value="reference_only">Create Ledger Reference Only</option>
          <option value="skip">Skip</option>
          <option value="mark_reviewed">Mark Reviewed</option>
        </select>
      </label>
      <button type="button" className="primary-btn compact-primary" onClick={onApply} disabled={!selectedCount || !bulkAction}>Apply To Selected</button>
      <div className="utility-mini-actions">
        <button type="button" onClick={onSelectUnresolved}>Select Pending</button>
        <button type="button" onClick={onSelectAll}>Select Visible</button>
        <button type="button" onClick={onClear}>Clear</button>
      </div>
      <p className="muted-note">Resolved rows leave the Pending Review queue. Validation must run again before import.</p>
    </section>
  );
}

function TallyMigrationResultPanel({ title, result, onRollback, allowRollback = false, preview = null, onDownloadErrors = null }) {
  const summary = summarizeTallyMigrationResults(result.results);
  const errors = flattenTallyMigrationErrors(result.results);
  const warningRows = preview?.totals?.warningRows || 0;
  const referenceOnlyRows = (preview?.ledgers || []).filter((row) => isTallyLedgerReviewRequired(row)).length + (preview?.totals?.openingStockReferenceRows || 0);
  return (
    <section className="template-section">
      <h3>{title}</h3>
      <div className="import-result template-result">
        <span>Total: <strong>{summary.totalRows}</strong></span>
        <span>Valid: <strong>{summary.successfulRows}</strong></span>
        <span>Failed: <strong>{summary.failedRows}</strong></span>
        <span>Warnings: <strong>{warningRows}</strong></span>
        <span>Reference-only: <strong>{referenceOnlyRows}</strong></span>
        <span>Duplicates: <strong>{summary.skippedDuplicates}</strong></span>
        <span>Updated: <strong>{summary.updatedRows}</strong></span>
      </div>
      <div className="table-wrap preview-table">
        <table>
          <thead>
            <tr><th>Master</th><th>Total</th><th>Valid</th><th>Failed</th><th>Duplicates</th><th>Batch</th><th></th></tr>
          </thead>
          <tbody>
            {tallyMigrationImportTables.map((item) => {
              const tableResult = result.results[item.key] || emptyImportResult();
              return (
                <tr key={item.key}>
                  <td>{item.label}</td>
                  <td>{tableResult.totalRows || 0}</td>
                  <td>{tableResult.successfulRows || 0}</td>
                  <td>{tableResult.failedRows || 0}</td>
                  <td>{tableResult.skippedDuplicates || 0}</td>
                  <td>{tableResult.importBatchId || "-"}</td>
                  <td>{allowRollback && tableResult.importBatchId ? <button type="button" className="ghost-btn danger" onClick={() => onRollback(item.label, tableResult.importBatchId)}>Rollback</button> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {errors.length ? (
        <div className="error-list">
          <strong>Failed / Skipped Row Reasons</strong>
          {errors.slice(0, 12).map((item) => <span key={`${item.master}-${item.row}-${item.reason}`}>{item.master} row {item.row}: {item.reason}</span>)}
          {onDownloadErrors ? <button type="button" className="ghost-btn" onClick={onDownloadErrors}>Download Error Report</button> : null}
        </div>
      ) : null}
    </section>
  );
}

export function TallyMasterMigrationAssistantScreen({ notify, session, companyContext, setUtilityExtension = () => {}, api }) {
  const [sourceFiles, setSourceFiles] = useState({});
  const [preview, setPreview] = useState(null);
  const [companyMode, setCompanyMode] = useState("map_existing");
  const [companyId, setCompanyId] = useState("");
  const [defaultGstRate, setDefaultGstRate] = useState("");
  const [importMode, setImportMode] = useState("skip_existing");
  const [reviewChecks, setReviewChecks] = useState({});
  const [ledgerReviewActions, setLedgerReviewActions] = useState({});
  const [selectedLedgerReviewKeys, setSelectedLedgerReviewKeys] = useState([]);
  const [bulkLedgerReviewAction, setBulkLedgerReviewAction] = useState("");
  const [ledgerReviewQueueMode, setLedgerReviewQueueMode] = useState("pending");
  const [allowPartialImport, setAllowPartialImport] = useState(false);
  const [validation, setValidation] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [companyOptions, setCompanyOptions] = useState([]);
  const companyCandidate = preview?.companies?.[0];
  const detectedCompanyName = String(companyCandidate?.tally_company_name || "").trim();
  const canCreateCompanyFromTally = Boolean(detectedCompanyName);
  const matchedCompanies = useMemo(() => companyCandidate?.existing_matches || [], [companyCandidate]);
  const existingCompanies = useMemo(() => {
    if (matchedCompanies.length) return matchedCompanies;
    return companyOptions.map((company) => ({
      id: company.id,
      company_name: company.company_name,
      gstin: company.gstin,
      pan: company.pan
    }));
  }, [matchedCompanies, companyOptions]);
  const missingGstCount = preview?.totals?.itemMissingGst || 0;
  const missingHsnCount = preview?.totals?.itemMissingHsn || 0;
  const duplicateRows = preview?.totals?.duplicateRows || 0;
  const openingStockRows = preview?.totals?.openingStockReferenceRows || 0;
  const manualReviewLedgers = (preview?.ledgers || []).filter((row) => row.suggested_master === "manual_review").length;
  const requiredLedgerReviewRows = useMemo(() => (preview?.ledgers || []).filter((row) => isTallyLedgerReviewRequired(row)), [preview]);
  const requiredLedgerReviewKeys = useMemo(() => requiredLedgerReviewRows.map((row) => tallyLedgerReviewKey(row)), [requiredLedgerReviewRows]);
  const resolvedLedgerReviewRows = requiredLedgerReviewRows.filter((row) => Boolean(ledgerReviewActions[tallyLedgerReviewKey(row)]));
  const pendingLedgerReviewRows = useMemo(
    () => requiredLedgerReviewRows.filter((row) => !ledgerReviewActions[tallyLedgerReviewKey(row)]),
    [requiredLedgerReviewRows, ledgerReviewActions]
  );
  const ledgerPreviewRows = useMemo(() => {
    const rows = preview?.ledgers || [];
    if (ledgerReviewQueueMode === "pending") {
      return rows.filter((row) => isTallyLedgerReviewRequired(row) && !ledgerReviewActions[tallyLedgerReviewKey(row)]);
    }
    if (ledgerReviewQueueMode === "resolved") {
      return rows.filter((row) => isTallyLedgerReviewRequired(row) && Boolean(ledgerReviewActions[tallyLedgerReviewKey(row)]));
    }
    return rows;
  }, [preview, ledgerReviewQueueMode, ledgerReviewActions]);
  const visibleLedgerReviewRows = useMemo(() => ledgerPreviewRows.filter((row) => isTallyLedgerReviewRequired(row)), [ledgerPreviewRows]);
  const ledgerReviewReady = requiredLedgerReviewRows.length === resolvedLedgerReviewRows.length;
  const selectedLedgerReviewRows = useMemo(
    () => requiredLedgerReviewRows.filter((row) => selectedLedgerReviewKeys.includes(tallyLedgerReviewKey(row))),
    [requiredLedgerReviewRows, selectedLedgerReviewKeys]
  );
  const selectedLedgerReviewUnresolved = selectedLedgerReviewRows.filter((row) => !ledgerReviewActions[tallyLedgerReviewKey(row)]).length;
  const allLedgerReviewSelected = visibleLedgerReviewRows.length > 0 && visibleLedgerReviewRows.every((row) => selectedLedgerReviewKeys.includes(tallyLedgerReviewKey(row)));
  const failedPreviewRows = preview?.totals?.failedRows || 0;
  const defaultGstNumber = Number(defaultGstRate);
  const defaultGstReady = !missingGstCount || (String(defaultGstRate).trim() !== "" && Number.isFinite(defaultGstNumber) && defaultGstNumber >= 0 && defaultGstNumber <= 28);
  const importRows = useMemo(() => buildTallyStage1ImportRows(preview, {
    companyMode,
    companyId,
    defaultGstRate,
    importMode,
    ledgerReviewActions
  }), [preview, companyMode, companyId, defaultGstRate, importMode, ledgerReviewActions]);
  const validationSummary = summarizeTallyMigrationResults(validation?.results || {});
  const validationResults = validation?.results || {};
  const validationErrorRows = flattenTallyMigrationErrors(validationResults);
  const validationReady = validation?.mode === "validation";
  const partialImportReady = validationReady && validationSummary.failedRows > 0 && allowPartialImport && validationSummary.successfulRows > 0;
  const stageItemsToCreate = validationResults.items ? Math.max(0, (validationResults.items.successfulRows || 0) - (validationResults.items.updatedRows || 0)) : (importRows.items || []).length;
  const stageItemsToUpdate = validationResults.items?.updatedRows || 0;
  const stageWarehousesToCreate = validationResults.warehouses?.successfulRows ?? (importRows.warehouses || []).length;
  const stageWarehousesToMap = validationResults.warehouses?.skippedDuplicates || 0;
  const stageLiveStockLedgerRows = 0;
  const companyMappingReady = companyMode === "create_new" ? canCreateCompanyFromTally : Boolean(companyId);
  const importCompanyMismatch = Boolean(companyContext?.company_id && companyMode === "map_existing" && companyId && String(companyId) !== String(companyContext.company_id));
  const importGateIssues = buildTallyMigrationGateIssues({
    preview,
    validation,
    validationSummary,
    partialImportReady,
    companyMappingReady,
    defaultGstReady,
    reviewChecks,
    ledgerReviewReady,
    importMode,
    requiredLedgerReviewRows,
    resolvedLedgerReviewRows
  });
  const canConfirmImport = importGateIssues.length === 0;

  useEffect(() => {
    let active = true;
    api.listRecords("companies", { status: "all" })
      .then((rows) => {
        if (active) setCompanyOptions(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (active) setCompanyOptions([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!preview || companyMode !== "map_existing" || companyId) return;
    const fallbackCompanyId = companyContext?.company_id || existingCompanies[0]?.id;
    if (fallbackCompanyId) setCompanyId(String(fallbackCompanyId));
  }, [preview, companyMode, companyId, existingCompanies, companyContext?.company_id]);

  async function selectMigrationFile(slot) {
    try {
      if (!api.selectTallyMigrationFile) throw new Error("Tally migration file selection requires the Windows desktop app");
      const selected = await api.selectTallyMigrationFile(slot.id);
      if (!selected?.path) return;
      setSourceFiles((current) => ({ ...current, [slot.id]: { type: slot.id, filePath: selected.path, name: selected.name } }));
      setPreview(null);
      setValidation(null);
      setImportResult(null);
      notify(`${slot.label} selected`);
    } catch (error) {
      notify(error.message || "File selection failed", "error");
    }
  }

  function removeMigrationFile(slotId) {
    setSourceFiles((current) => {
      const next = { ...current };
      delete next[slotId];
      return next;
    });
    setPreview(null);
    setValidation(null);
    setImportResult(null);
  }

  async function previewMigration() {
    const files = Object.values(sourceFiles);
    if (!files.length) {
      notify("Select at least one Tally XML, Excel or CSV file first", "error");
      return;
    }
    setBusy(true);
    try {
      const parsed = await api.previewTallyMasterMigration({ files, user_id: session?.id });
      setPreview(parsed);
      const matchedCompanyId = parsed.companies?.[0]?.existing_matches?.[0]?.id;
      const fallbackCompanyId = companyContext?.company_id || companyOptions[0]?.id;
      setCompanyId(matchedCompanyId ? String(matchedCompanyId) : fallbackCompanyId ? String(fallbackCompanyId) : "");
      setCompanyMode("map_existing");
      setDefaultGstRate("");
      setReviewChecks({});
      setLedgerReviewActions({});
      setSelectedLedgerReviewKeys([]);
      setBulkLedgerReviewAction("");
      setLedgerReviewQueueMode("pending");
      setAllowPartialImport(false);
      setValidation(null);
      setImportResult(null);
      notify(`Stage 1 preview ready: ${parsed.totals?.ledgers || 0} ledger(s), ${parsed.totals?.items || 0} item(s)`);
    } catch (error) {
      notify(error.message || "Tally migration preview failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function runMigrationValidation() {
    if (!preview) {
      notify("Preview migration files before validation", "error");
      return null;
    }
    if (!defaultGstReady) {
      notify("Enter a default GST rate between 0 and 28 for blank/inherited item GST rows", "error");
      return null;
    }
    if (!companyMappingReady) {
      notify("Map this import to an existing GII company before validation", "error");
      return null;
    }
    if (importCompanyMismatch) notify("This validation is mapped to a different company than the current company context.", "warning");
    setBusy(true);
    try {
      const results = await runTallyStage1Import(api, false, importRows, importMode, session?.id, companyId);
      const next = { mode: "validation", results, generated_at: new Date().toISOString() };
      setValidation(next);
      setImportResult(null);
      const summary = summarizeTallyMigrationResults(results);
      notify(summary.failedRows ? "Validation complete. Review failed rows before import." : "Validation complete. Import readiness can now be reviewed.");
      return next;
    } catch (error) {
      notify(error.message || "Stage 1 validation failed", "error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function confirmMigrationImport() {
    if (!canConfirmImport) {
      notify(importGateIssues[0] || "Complete preview, validation and all review checklist controls before confirming import", "error");
      return;
    }
    if (validationSummary.failedRows > 0 && allowPartialImport) {
      const partialConfirmed = await confirmAction({
        mode: "warning",
        title: "Controlled Partial Import",
        message: `${validationSummary.failedRows} failed row(s) will be skipped. Only ${validationSummary.successfulRows} valid row(s) will be imported. Continue?`,
        confirmLabel: "Yes, Import Valid Rows",
        cancelLabel: "No, Review Errors",
        moduleName: "tally_migration_assistant"
      });
      if (!partialConfirmed.confirmed) return;
    }
    if (importCompanyMismatch) {
      const confirmed = await confirmAction({
        mode: "warning",
        title: "Import Company Mismatch",
        message: "This import is mapped to a company different from the current company selector. Do you want to continue with this mapped company?",
        confirmLabel: "Yes, Continue",
        cancelLabel: "No, Review Mapping",
        moduleName: "tally_migration_assistant"
      });
      if (!confirmed.confirmed) return;
      await api.logContextAudit?.({
        company_id: Number(companyId),
        user_id: session?.id || null,
        user_role: session?.role || null,
        action: "import company mapping approval",
        module: "tally_migration_assistant",
        table_name: "imports",
        new_value: JSON.stringify({ current_company_id: companyContext?.company_id || null, mapped_company_id: companyId })
      });
    }
    setBusy(true);
    try {
      const results = await runTallyStage1Import(api, true, importRows, importMode, session?.id, companyId);
      const next = { mode: "import", results, generated_at: new Date().toISOString() };
      setImportResult(next);
      notify(`Stage 1 master migration completed: ${summarizeTallyMigrationResults(results).successfulRows} row(s) processed`);
    } catch (error) {
      notify(error.message || "Stage 1 migration import failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function rollbackBatch(label, batchId) {
    if (!batchId) return;
    const confirmed = await confirmAction({
      title: "Rollback imported batch?",
      message: `Rollback the ${label} import batch ${batchId}? Only unused imported records can be removed safely.`,
      confirmText: "Yes, Rollback",
      cancelText: "No, Keep",
      mode: "danger"
    });
    if (!confirmed.confirmed) return;
    try {
      const result = await api.rollbackImportBatch(batchId, { user_id: session?.id, module: "tally_migration_assistant" });
      notify(`Rollback completed: ${result.deleted || 0} record(s) removed`);
    } catch (error) {
      notify(error.message || "Rollback failed", "error");
    }
  }

  function downloadMigrationCsv() {
    if (!preview) return;
    const lines = tallyMigrationReportRows(preview, importRows, validation, importResult);
    downloadText("tally-stage-1-master-migration-report.csv", lines.map((row) => row.map(csvCell).join(",")).join("\n") + "\n");
  }

  function updateReviewCheck(key, checked) {
    setReviewChecks((current) => ({ ...current, [key]: checked }));
  }

  function updateLedgerReviewAction(row, action) {
    const key = tallyLedgerReviewKey(row);
    setLedgerReviewActions((current) => {
      const next = { ...current };
      if (action) next[key] = action;
      else delete next[key];
      return next;
    });
    if (action) {
      setSelectedLedgerReviewKeys((current) => current.filter((item) => item !== key));
    }
    setValidation(null);
    setImportResult(null);
  }

  useEffect(() => {
    return () => setUtilityExtension(null);
  }, [setUtilityExtension]);

  useEffect(() => {
    setSelectedLedgerReviewKeys((current) => current.filter((key) => requiredLedgerReviewKeys.includes(key)));
  }, [requiredLedgerReviewKeys]);

  function toggleLedgerReviewSelection(row, checked) {
    const key = tallyLedgerReviewKey(row);
    setSelectedLedgerReviewKeys((current) => {
      if (checked) return current.includes(key) ? current : [...current, key];
      return current.filter((item) => item !== key);
    });
  }

  function selectAllLedgerReviewRows() {
    setSelectedLedgerReviewKeys(visibleLedgerReviewRows.map((row) => tallyLedgerReviewKey(row)));
  }

  function selectUnresolvedLedgerReviewRows() {
    setSelectedLedgerReviewKeys(pendingLedgerReviewRows.map((row) => tallyLedgerReviewKey(row)));
  }

  function clearLedgerReviewSelection() {
    setSelectedLedgerReviewKeys([]);
  }

  function applyBulkLedgerReviewAction() {
    if (!selectedLedgerReviewRows.length) {
      notify("Select ledger rows before applying a bulk review action", "error");
      return;
    }
    if (!bulkLedgerReviewAction) {
      notify("Select a bulk ledger review action first", "error");
      return;
    }
    setLedgerReviewActions((current) => {
      const next = { ...current };
      selectedLedgerReviewRows.forEach((row) => {
        next[tallyLedgerReviewKey(row)] = bulkLedgerReviewAction;
      });
      return next;
    });
    setSelectedLedgerReviewKeys([]);
    setLedgerReviewQueueMode("pending");
    setValidation(null);
    setImportResult(null);
    notify(`Bulk review action applied to ${selectedLedgerReviewRows.length} ledger row(s)`);
  }

  useEffect(() => {
    if (!preview) {
      setUtilityExtension(null);
      return;
    }
    setUtilityExtension(
      <TallyLedgerBulkReviewUtilityPanel
        requiredCount={requiredLedgerReviewRows.length}
        reviewedCount={resolvedLedgerReviewRows.length}
        selectedCount={selectedLedgerReviewRows.length}
        unresolvedSelectedCount={selectedLedgerReviewUnresolved}
        pendingCount={pendingLedgerReviewRows.length}
        bulkAction={bulkLedgerReviewAction}
        onBulkActionChange={setBulkLedgerReviewAction}
        onApply={applyBulkLedgerReviewAction}
        onSelectAll={selectAllLedgerReviewRows}
        onSelectUnresolved={selectUnresolvedLedgerReviewRows}
        onClear={clearLedgerReviewSelection}
      />
    );
  }, [
    preview,
    requiredLedgerReviewRows.length,
    resolvedLedgerReviewRows.length,
    pendingLedgerReviewRows.length,
    visibleLedgerReviewRows.length,
    selectedLedgerReviewRows.length,
    selectedLedgerReviewUnresolved,
    bulkLedgerReviewAction,
    setUtilityExtension
  ]);

  function downloadMigrationErrors() {
    const rows = validationErrorRows.length ? validationErrorRows : previewTallyMigrationIssues(preview);
    const header = ["master", "row", "status", "reason"];
    const csv = [header, ...rows.map((row) => [row.master, row.row, row.status, row.reason])].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
    downloadText("tally-migration-validation-errors.csv", csv);
  }

  return (
    <section className="template-center-layout tally-migration-layout">
      <aside className="panel template-list-panel">
        <div className="panel-head">
          <div>
            <h2>Tally Master Migration Assistant</h2>
            <p>Stage 1 migration for master and reference data only.</p>
          </div>
        </div>
        <div className="template-flow vertical">
          {["Select Files", "Preview", "Map Company", "Review GST/HSN", "Validate", "Confirm Import", "Audit / Rollback"].map((step) => <span key={step}>{step}</span>)}
        </div>
        <TemplateAuditNote>This stage imports master data only. Historical vouchers, opening stock posting, stock ledger entries, GST posting, profitability and accounting vouchers are not created here.</TemplateAuditNote>
      </aside>

      <section className="panel template-workbench">
        <div className="template-workbench-head">
          <div>
            <span className="status-pill active">Stage 1 Master Migration</span>
            <h2>Tally Prime Master Migration</h2>
            <p>Preview Tally XML/Excel/CSV, map company and masters, dry-run validation, then import through controlled staging.</p>
          </div>
          <div className="button-row">
            <button type="button" className="ghost-btn" onClick={downloadMigrationCsv} disabled={!preview}>Download Migration Report</button>
            <button type="button" className="primary-btn" onClick={previewMigration} disabled={busy || !Object.keys(sourceFiles).length}>{busy ? "Working..." : "Preview Migration"}</button>
          </div>
        </div>

        <section className="template-section">
          <h3>Migration Files</h3>
          <div className="migration-file-grid">
            {tallyMasterMigrationFileSlots.map((slot) => {
              const selected = sourceFiles[slot.id];
              return (
                <div key={slot.id} className="migration-file-card">
                  <div>
                    <strong>{slot.label}</strong>
                    <p>{slot.note}</p>
                    {selected && <span className="muted-note">{selected.name}</span>}
                  </div>
                  <div className="button-row compact-buttons">
                    <button type="button" className="ghost-btn" onClick={() => selectMigrationFile(slot)}>Select</button>
                    {selected && <button type="button" className="ghost-btn" onClick={() => removeMigrationFile(slot.id)}>Clear</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {preview ? (
          <>
            <div className="template-meta-grid tally-summary-grid">
              <div><strong>Files Parsed</strong><p>{preview.totals.files}</p></div>
              <div><strong>Companies</strong><p>{preview.totals.companies}</p></div>
              <div><strong>Ledgers</strong><p>{preview.totals.ledgers}</p></div>
              <div><strong>Suppliers</strong><p>{preview.totals.suppliers}</p></div>
              <div><strong>Departments / Customers</strong><p>{preview.totals.departments}</p></div>
              <div><strong>Banks</strong><p>{preview.totals.banks}</p></div>
              <div><strong>Expense Heads</strong><p>{preview.totals.expenseHeads}</p></div>
              <div><strong>Items</strong><p>{preview.totals.items}</p></div>
              <div><strong>Warehouses</strong><p>{preview.totals.warehouses}</p></div>
              <div><strong>Missing GST</strong><p>{missingGstCount}</p></div>
              <div><strong>Opening Stock Reference</strong><p>{openingStockRows} row(s)</p></div>
              <div><strong>Preview Failures</strong><p>{failedPreviewRows}</p></div>
              <div><strong>Items To Create</strong><p>{stageItemsToCreate} row(s)</p></div>
              <div><strong>Items To Update</strong><p>{stageItemsToUpdate} row(s)</p></div>
              <div><strong>Warehouses To Create</strong><p>{stageWarehousesToCreate} row(s)</p></div>
              <div><strong>Warehouses To Map</strong><p>{stageWarehousesToMap} existing row(s)</p></div>
              <div><strong>Opening Stock Staging</strong><p>{openingStockRows} reference row(s)</p></div>
              <div><strong>Live Stock Ledger Rows</strong><p>{stageLiveStockLedgerRows} row(s)</p></div>
            </div>

            <section className="template-section">
              <h3>Company Mapping Approval</h3>
              <div className="migration-company-grid">
                <div>
                  <strong>Current ERP Company</strong>
                  <p>{companyContext?.company_name || "Not selected"}</p>
                  <p className="muted-note">Imports should normally target this company.</p>
                </div>
                <div>
                  <strong>Tally Company</strong>
                  <p>{companyCandidate?.tally_company_name || "Not detected"}</p>
                  <p className="muted-note">{[companyCandidate?.gstin, companyCandidate?.pan].filter(Boolean).join(" | ") || "GSTIN/PAN not detected"}</p>
                </div>
                <label>
                  <span>Mapping Action</span>
                  <select value={companyMode} onChange={(event) => {
                    const nextMode = event.target.value;
                    if (nextMode === "create_new" && !canCreateCompanyFromTally) {
                      notify("Tally company was not detected. Map this import to an existing GII company.", "error");
                      return;
                    }
                    setCompanyMode(nextMode);
                    setValidation(null);
                    setImportResult(null);
                  }}>
                    <option value="map_existing">Map to existing company</option>
                    <option value="create_new" disabled={!canCreateCompanyFromTally}>Create company master</option>
                  </select>
                </label>
                {companyMode === "map_existing" ? (
                  <label>
                    <span>Existing Company</span>
                    <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
                      <option value="">Select company</option>
                      {sortRecordsBy(existingCompanies, (company) => company.company_name).map((company) => <option key={company.id} value={company.id}>{company.company_name}</option>)}
                    </select>
                  </label>
                ) : (
                  <div className="template-audit-note">A new Company Master row will be staged through validation before import.</div>
                )}
              </div>
              {!canCreateCompanyFromTally ? (
                <div className="template-audit-note">
                  <strong>Company required:</strong> This file did not include a detectable Tally company name. Select an existing GII company before validation/import.
                </div>
              ) : null}
            </section>

            <section className="template-section import-control-gate">
              <div>
                <h3>Stage 1 Safety Checklist</h3>
                <p>Final import remains locked until mapping, GST/HSN, duplicates, opening-stock reference rows and ledger references are reviewed. Stage 1 creates master data only and posts 0 stock ledger rows.</p>
              </div>
              <div className="template-meta-grid tally-control-grid">
                <div>
                  <strong>Default GST for blank/inherited item GST</strong>
                  <input value={defaultGstRate} onChange={(event) => { setDefaultGstRate(event.target.value); setValidation(null); setImportResult(null); }} placeholder={missingGstCount ? "Required before import" : "Not required"} />
                  {missingGstCount ? (
                    <div className="quick-rate-row">
                      {[0, 5, 12, 18, 28].map((rate) => (
                        <button key={rate} type="button" className={Number(defaultGstRate) === rate ? "active" : ""} onClick={() => { setDefaultGstRate(String(rate)); setValidation(null); }}>
                          {rate}%
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div>
                  <strong>Duplicate Action</strong>
                  <select value={importMode} onChange={(event) => { setImportMode(event.target.value); setValidation(null); setImportResult(null); }}>
                    <option value="skip_existing">Skip existing records</option>
                    <option value="update_existing">Update existing records</option>
                  </select>
                </div>
                <div>
                  <strong>Readiness</strong>
                  <p>{canConfirmImport ? "Ready for controlled import" : importGateIssues[0] || "Review / validation required"}</p>
                </div>
                {importCompanyMismatch ? <div className="template-audit-note warning-note">Mapped company differs from the Current Company selector. Import confirmation will require approval.</div> : null}
              </div>
              <div className="review-checklist">
                <label><input type="checkbox" checked={Boolean(reviewChecks.company)} onChange={(event) => updateReviewCheck("company", event.target.checked)} /> <span>Company mapping reviewed and approved</span></label>
                <label><input type="checkbox" checked={Boolean(reviewChecks.gstReview)} onChange={(event) => updateReviewCheck("gstReview", event.target.checked)} disabled={!defaultGstReady} /> <span>Reviewed {missingGstCount} blank/inherited GST row(s) and {missingHsnCount} missing HSN/SAC row(s)</span></label>
                <label><input type="checkbox" checked={Boolean(reviewChecks.duplicateReview)} onChange={(event) => updateReviewCheck("duplicateReview", event.target.checked)} /> <span>Reviewed duplicate action for {duplicateRows} possible duplicate row(s)</span></label>
                <label><input type="checkbox" checked={Boolean(reviewChecks.ledgerReview)} onChange={(event) => updateReviewCheck("ledgerReview", event.target.checked)} disabled={!ledgerReviewReady} /> <span>Reviewed {resolvedLedgerReviewRows.length} of {manualReviewLedgers} reference/unmapped ledger row(s); row-level actions are selected</span></label>
                <label><input type="checkbox" checked={Boolean(reviewChecks.reference)} onChange={(event) => updateReviewCheck("reference", event.target.checked)} /> <span>Reviewed {openingStockRows} opening stock reference row(s); no stock ledger posting will be created</span></label>
                {validationSummary.failedRows > 0 ? (
                  <label><input type="checkbox" checked={allowPartialImport} onChange={(event) => setAllowPartialImport(event.target.checked)} /> <span>Allow controlled partial import of {validationSummary.successfulRows} valid row(s); skip {validationSummary.failedRows} failed row(s)</span></label>
                ) : null}
              </div>
              {importGateIssues.length ? (
                <div className="error-list compact-error-list">
                  <strong>Import Locked Reason</strong>
                  {importGateIssues.slice(0, 5).map((issue) => <span key={issue}>{issue}</span>)}
                </div>
              ) : (
                <div className="template-audit-note"><strong>Ready:</strong> Controlled Stage 1 import can proceed. It creates master data only and posts 0 stock ledger rows.</div>
              )}
              <div className="button-row">
                <button type="button" className="ghost-btn" onClick={runMigrationValidation} disabled={busy || !preview}>Validate Prepared Import</button>
                <button type="button" className="primary-btn" onClick={confirmMigrationImport} disabled={busy || !canConfirmImport} title={canConfirmImport ? "Ready for controlled import" : importGateIssues[0] || "Import locked"}>{canConfirmImport ? "Confirm Stage 1 Import" : "Import Locked"}</button>
              </div>
            </section>

            {validation && <TallyMigrationResultPanel title="Validation Summary" result={validation} onRollback={rollbackBatch} preview={preview} onDownloadErrors={downloadMigrationErrors} />}
            {importResult && <TallyMigrationResultPanel title="Import Summary and Rollback" result={importResult} onRollback={rollbackBatch} allowRollback />}

            <section className="template-section">
              <h3>Ledger Classification Preview</h3>
              <p className="muted-note">Pending rows are the active work queue. Mapped or reviewed rows move to Resolved automatically and remain available for audit.</p>
              <div className="ledger-review-toolbar" aria-label="Ledger review queue filter">
                <ViewTabs
                  className="ledger-review-tabs"
                  active={ledgerReviewQueueMode}
                  onChange={(mode) => { setLedgerReviewQueueMode(mode); clearLedgerReviewSelection(); }}
                  tabs={[
                    { key: "pending", label: `Pending Review (${pendingLedgerReviewRows.length})` },
                    { key: "resolved", label: `Resolved (${resolvedLedgerReviewRows.length})` },
                    { key: "all", label: `All Ledgers (${preview.ledgers?.length || 0})` }
                  ]}
                />
                <span className="muted-note">Bulk actions apply to selected rows in the current view.</span>
              </div>
              <div className="table-wrap preview-table tall-preview">
                <table>
                  <thead>
                    <tr>
                      <th className="select-col">
                        <input
                          type="checkbox"
                          checked={allLedgerReviewSelected}
                          disabled={!visibleLedgerReviewRows.length}
                          onChange={(event) => event.target.checked ? selectAllLedgerReviewRows() : clearLedgerReviewSelection()}
                          aria-label="Select all visible ledger rows requiring review"
                        />
                      </th>
                      <th>Tally Ledger</th>
                      <th>Group</th>
                      <th>Suggested GII Type</th>
                      <th>Review Reason</th>
                      <th>Action</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerPreviewRows.length ? ledgerPreviewRows.map((row) => {
                      const reviewKey = tallyLedgerReviewKey(row);
                      const selectedAction = ledgerReviewActions[reviewKey] || "";
                      const needsReview = isTallyLedgerReviewRequired(row);
                      const status = needsReview && selectedAction ? "Reviewed" : row.validation_status;
                      return (
                        <tr key={`${row.row_number}-${row.tally_ledger_name}`} className={selectedLedgerReviewKeys.includes(reviewKey) ? "selected-review-row" : ""}>
                          <td className="select-col">
                            {needsReview ? (
                              <input
                                type="checkbox"
                                checked={selectedLedgerReviewKeys.includes(reviewKey)}
                                onChange={(event) => toggleLedgerReviewSelection(row, event.target.checked)}
                                aria-label={`Select ${row.tally_ledger_name} for bulk review`}
                              />
                            ) : null}
                          </td>
                          <td>{row.tally_ledger_name}</td>
                          <td>{row.tally_group || "Unlinked"}</td>
                          <td>{row.suggested_gii_type}</td>
                          <td>{tallyLedgerReviewReason(row)}</td>
                          <td>
                            {needsReview ? (
                              <select value={selectedAction} onChange={(event) => updateLedgerReviewAction(row, event.target.value)} aria-label={`Review action for ${row.tally_ledger_name}`}>
                                <option value="">Select action</option>
                                <option value="map_supplier">Map to Supplier</option>
                                <option value="map_department">Map to Department / Customer</option>
                                <option value="reference_only">Create Ledger Reference Only</option>
                                <option value="skip">Skip</option>
                                <option value="mark_reviewed">Mark Reviewed</option>
                              </select>
                            ) : row.action}
                          </td>
                          <td><span className={`status-pill ${migrationStatusClass(status)}`}>{status}</span></td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={7}>
                          <EmptyState
                            title={ledgerReviewQueueMode === "pending" ? "No pending ledger rows" : "No ledger rows in this view"}
                            text={ledgerReviewQueueMode === "pending" ? "All required ledger classifications are mapped, skipped, or marked reviewed." : "Switch to another ledger review view to inspect migration rows."}
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="template-section">
              <h3>Stock Item Preview</h3>
              <div className="table-wrap preview-table tall-preview">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Unit</th>
                      <th>HSN</th>
                      <th>GST</th>
                      <th>Opening Qty</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.stockItems || []).slice(0, 80).map((item) => (
                      <tr key={`${item.row_number}-${item.item_name}`}>
                        <td>{item.item_name}</td>
                        <td>{item.unit || "Unlinked"}</td>
                        <td>{item.hsn_code || "Needs review"}</td>
                        <td>{item.gst_rate || "Needs default"}</td>
                        <td>{item.opening_stock_qty || "-"}</td>
                        <td><span className={`status-pill ${migrationStatusClass(item.validation_status)}`}>{item.validation_status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {preview.referenceFiles?.length ? (
              <section className="template-section">
                <h3>Reference Files</h3>
                <div className="table-wrap preview-table">
                  <table>
                    <thead>
                      <tr><th>File</th><th>Type</th><th>Rows</th><th>Stage Rule</th></tr>
                    </thead>
                    <tbody>
                      {preview.referenceFiles.map((file) => (
                        <tr key={file.file_name}><td>{file.file_name}</td><td>{file.file_type}</td><td>{file.row_count}</td><td>Reference only - no posting</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {preview.errors?.length ? (
              <div className="error-list">
                <strong>Parse Errors</strong>
                {preview.errors.map((error) => <span key={error.file_name}>{error.file_name}: {error.error}</span>)}
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState title="No migration preview yet" note="Select one or more Tally XML, Excel or CSV exports, then run Preview Migration. Nothing is imported until dry-run validation and confirmation pass." />
        )}
      </section>
    </section>
  );
}
