import { useMemo, useState } from "react";
import { EmptyState } from "../../components/common.jsx";
import { isDesktopRuntime } from "../../api/client.js";
import { csvCell, downloadErrorReport } from "../../utils/spreadsheetExport.js";
import { downloadText } from "../../utils/formatters.js";

function emptyImportResult() {
  return { totalRows: 0, successfulRows: 0, failedRows: 0, skippedDuplicates: 0, updatedRows: 0, errors: [] };
}

function tallyImportableItems(preview) {
  const seen = new Set();
  return (preview?.items || []).filter((item) => {
    const key = String(item.item_name || "").trim().toLowerCase();
    if (!key || item.deleted || item.import_status === "failed" || item.duplicate_in_xml || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildTallyItemRows(preview, unitMap, defaultGstRate) {
  return tallyImportableItems(preview).map((item) => ({
    item_name: item.item_name,
    brand: "",
    model: "",
    hsn_code: item.hsn_code || "",
    gst_rate: item.gst_rate || String(defaultGstRate || "").trim(),
    unit: unitMap[item.unit] || item.unit || "",
    category: item.category || "Imported from Tally XML",
    inventory_enabled: "1",
    opening_stock: "",
    opening_rate: "",
    opening_value: "",
    valuation_method: item.valuation_method || "Weighted Average",
    status: "active"
  }));
}

function buildTallyWarehouseRows(preview, warehouseMap, companyId) {
  const seen = new Set();
  return (preview?.godowns || []).map((godown) => ({
    company_id: companyId || "",
    warehouse_name: warehouseMap[godown.name] || godown.name,
    location: godown.address || godown.name,
    warehouse_type: "Imported from Tally XML",
    responsible_person: "",
    status: "active"
  })).filter((row) => {
    const key = String(row.warehouse_name || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function TallyXmlImportScreen({ notify, session, companyContext, api }) {
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [unitMap, setUnitMap] = useState({});
  const [warehouseMap, setWarehouseMap] = useState({});
  const [defaultGstRate, setDefaultGstRate] = useState("");
  const [importMode, setImportMode] = useState("skip_existing");
  const [reviewChecks, setReviewChecks] = useState({});
  const [result, setResult] = useState(null);
  const importableItems = useMemo(() => tallyImportableItems(preview), [preview]);
  const missingGstCount = preview?.totals?.inheritedGst || 0;
  const missingHsnCount = preview?.totals?.missingHsn || 0;
  const openingStockRows = preview?.totals?.openingQtyRows || 0;
  const duplicateRows = preview?.validation?.skippedDuplicates || 0;
  const warningRows = preview?.validation?.warningRows || 0;
  const parsedDefaultGst = Number(defaultGstRate);
  const defaultGstReady = !missingGstCount || (String(defaultGstRate).trim() !== "" && Number.isFinite(parsedDefaultGst) && parsedDefaultGst >= 0 && parsedDefaultGst <= 28);
  const validationReady = result?.mode === "validation" &&
    (result.items?.failedRows || 0) === 0 &&
    (result.warehouses?.failedRows || 0) === 0;
  const reviewRequirements = [
    { key: "gst", required: missingGstCount > 0, label: `Reviewed ${missingGstCount} blank/inherited GST row(s) and default GST treatment` },
    { key: "hsn", required: missingHsnCount > 0, label: `Reviewed ${missingHsnCount} item(s) with missing HSN/SAC` },
    { key: "opening", required: openingStockRows > 0, label: `Reviewed ${openingStockRows} opening stock row(s); no stock ledger posting will be created` },
    { key: "duplicates", required: duplicateRows > 0, label: `Reviewed ${duplicateRows} duplicate XML row(s); duplicates will be skipped` },
    { key: "updateMode", required: importMode === "update_existing", label: "Reviewed Update Existing mode and accept that matching Item/Warehouse masters may be updated" }
  ].filter((item) => item.required);
  const reviewReady = reviewRequirements.every((item) => reviewChecks[item.key]);
  const readinessIssues = [
    !defaultGstReady ? "Enter a valid default GST rate between 0 and 28 for blank/inherited GST rows." : "",
    !validationReady ? "Run Validate Prepared Import and resolve failed rows before import." : "",
    !reviewReady ? "Complete the import review checklist before confirming import." : ""
  ].filter(Boolean);
  const canConfirmImport = Boolean(preview && validationReady && reviewReady && defaultGstReady);
  const canReviewWarnings = Boolean(validationReady && defaultGstReady);

  function resetPreparedValidation() {
    setResult(null);
    setReviewChecks({});
  }

  function updateReviewCheck(key, checked) {
    setReviewChecks((current) => ({ ...current, [key]: checked }));
  }

  async function chooseDesktopXmlFile() {
    try {
      if (!api.selectTallyXmlFile || !api.previewTallyStockXml) throw new Error("Tally XML import requires the Windows desktop app");
      const selected = await api.selectTallyXmlFile();
      if (!selected?.path) return;
      await loadPreview(selected.name, selected.path);
    } catch (error) {
      notify(error.message || "Tally XML selection failed", "error");
    }
  }

  async function chooseXmlInput(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (!file.path) throw new Error("Use Browse Desktop XML File inside the Windows app for Tally XML imports");
      await loadPreview(file.name, file.path);
    } catch (error) {
      notify(error.message || "Tally XML upload failed", "error");
    } finally {
      event.target.value = "";
    }
  }

  async function loadPreview(uploadedFileName, filePath) {
    if (!companyContext?.company_id) throw new Error("Select Current Company before previewing Tally XML imports");
    const parsed = await api.previewTallyStockXml({ filePath, user_id: session?.id });
    setFileName(uploadedFileName || parsed.fileName || "tally-stock-items.xml");
    setPreview(parsed);
    setUnitMap(Object.fromEntries((parsed.units || []).map((unit) => [unit.name, unit.name])));
    setWarehouseMap(Object.fromEntries((parsed.godowns || []).map((godown) => [godown.name, godown.name])));
    setDefaultGstRate("");
    setReviewChecks({});
    setResult(null);
    notify(`Tally XML preview loaded: ${parsed.totals?.stockItems || 0} stock item(s) found`);
  }

  function preparedRows() {
    return {
      warehouses: buildTallyWarehouseRows(preview, warehouseMap, companyContext?.company_id),
      items: buildTallyItemRows(preview, unitMap, defaultGstRate)
    };
  }

  const preparedRowsSnapshot = preview ? preparedRows() : { warehouses: [], items: [] };
  const itemRowsToCreate = result?.items ? Math.max(0, (result.items.successfulRows || 0) - (result.items.updatedRows || 0)) : preparedRowsSnapshot.items.length;
  const itemRowsToUpdate = result?.items?.updatedRows || 0;
  const warehouseRowsToCreate = result?.warehouses?.successfulRows ?? preparedRowsSnapshot.warehouses.length;
  const warehouseRowsToMap = result?.warehouses?.skippedDuplicates || 0;
  const openingStockRowsStaged = openingStockRows;
  const liveStockLedgerRowsToCreate = 0;

  async function validatePreparedImport() {
    if (!preview) {
      notify("Load a Tally XML file before validation", "error");
      return null;
    }
    if (!companyContext?.company_id) {
      notify("Select Current Company before validating Tally XML import", "error");
      return null;
    }
    if (missingGstCount && String(defaultGstRate).trim() === "") {
      notify("Enter a default GST rate for Tally rows where GST is blank or inherited", "error");
      return null;
    }
    if (!defaultGstReady) {
      notify("Default GST must be a valid rate between 0 and 28", "error");
      return null;
    }
    const rows = preparedRows();
    if (!rows.items.length) {
      notify("No safe stock item rows are available for import", "error");
      return null;
    }
    try {
      const warehouseResult = rows.warehouses.length
        ? await api.importRecords("warehouses", rows.warehouses, { file_name: fileName, dry_run: true, module: "tally_xml_import", import_mode: importMode, user_id: session?.id, company_id: companyContext.company_id })
        : emptyImportResult();
      const itemResult = await api.importRecords("items", rows.items, { file_name: fileName, dry_run: true, module: "tally_xml_import", import_mode: importMode, user_id: session?.id, company_id: companyContext.company_id });
      const validation = { mode: "validation", warehouses: warehouseResult, items: itemResult };
      setResult(validation);
      setReviewChecks({});
      notify(`Validation complete: ${itemResult.successfulRows || 0} item row(s) ready`);
      return validation;
    } catch (error) {
      notify(error.message || "Tally XML validation failed", "error");
      return null;
    }
  }

  async function confirmImport() {
    if (!preview) {
      notify("Load a Tally XML file before import", "error");
      return;
    }
    if (!companyContext?.company_id) {
      notify("Select Current Company before confirming Tally XML import", "error");
      return;
    }
    if (!canConfirmImport) {
      notify(readinessIssues[0] || "Complete validation and review checks before confirming import", "error");
      return;
    }
    const validation = result;
    if ((validation.items.failedRows || 0) > 0 || (validation.warehouses.failedRows || 0) > 0) {
      notify("Resolve failed rows before confirming import", "error");
      return;
    }
    try {
      const rows = preparedRows();
      await api.logContextAudit?.({
        company_id: Number(companyContext.company_id),
        user_id: session?.id || null,
        user_role: session?.role || null,
        action: "import company mapping approval",
        module: "tally_xml_import",
        table_name: "imports",
        new_value: JSON.stringify({ target_company_id: companyContext.company_id, file_name: fileName })
      });
      const warehouseResult = rows.warehouses.length
        ? await api.importRecords("warehouses", rows.warehouses, { file_name: fileName, module: "tally_xml_import", import_mode: importMode, user_id: session?.id, company_id: companyContext.company_id })
        : emptyImportResult();
      const itemResult = await api.importRecords("items", rows.items, { file_name: fileName, module: "tally_xml_import", import_mode: importMode, user_id: session?.id, company_id: companyContext.company_id });
      setResult({ mode: "import", warehouses: warehouseResult, items: itemResult });
      notify(`Tally XML import completed: ${itemResult.successfulRows || 0} item row(s), ${warehouseResult.successfulRows || 0} warehouse row(s)`);
    } catch (error) {
      notify(error.message || "Tally XML import failed", "error");
    }
  }

  function downloadPreviewErrors() {
    if (!preview?.validation?.errors?.length) return;
    downloadErrorReport("tally-stock-xml", preview.validation.errors);
  }

  function downloadCleanMappingCsv() {
    if (!preview?.items?.length) return;
    const headers = ["tally_item_name", "erp_item_name", "unit", "mapped_unit", "hsn_code", "gst_rate", "gst_source", "category", "warehouse", "opening_stock_qty", "opening_stock_value", "import_status", "warnings"];
    const rows = preview.items.map((item) => [
      item.tally_item_name,
      item.item_name,
      item.unit,
      unitMap[item.unit] || item.unit,
      item.hsn_code,
      item.gst_rate || defaultGstRate,
      item.gst_source,
      item.category,
      warehouseMap[item.warehouse] || item.warehouse,
      item.opening_stock_qty,
      item.opening_stock_value,
      item.import_status,
      (item.warnings || []).join("; ")
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
    downloadText("tally-stock-item-clean-mapping.csv", csv);
  }

  return (
    <section className="template-center-layout tally-xml-layout">
      <aside className="panel template-list-panel">
        <div className="panel-head">
          <div>
            <h2>Tally XML Import Assistant</h2>
            <p>Stock items, units, godowns and GST/HSN mapping for controlled onboarding.</p>
          </div>
        </div>
        <div className="template-flow vertical">
          {["Select XML", "Preview", "Map Units", "Default GST", "Validate", "Confirm Import", "Audit Log"].map((step) => <span key={step}>{step}</span>)}
        </div>
        <div className="template-audit-note">
          <strong>Safety:</strong> This assistant imports only master data. Opening stock from Tally is displayed for review and does not post stock ledger, GST, vouchers or profitability.
        </div>
      </aside>

      <section className="panel template-workbench">
        <div className="template-workbench-head">
          <div>
            <span className="status-pill active">Controlled Tally Master Import</span>
            <h2>Tally Prime Stock Item XML</h2>
            <p>Preview Tally exported masters, clean mapping, validate rows, then import to Item Master and warehouse mapping controls.</p>
          </div>
          <div className="button-row">
          <button type="button" className="ghost-btn" onClick={downloadCleanMappingCsv} disabled={!preview}>Download Clean Mapping CSV</button>
          <button type="button" className="ghost-btn" onClick={downloadPreviewErrors} disabled={!preview?.validation?.errors?.length}>Download Validation Report</button>
          </div>
        </div>

        <div className="button-row">
          {isDesktopRuntime ? (
          <button type="button" className="ghost-btn" onClick={chooseDesktopXmlFile}>Select Tally XML File</button>
          ) : (
            <input type="file" accept=".xml" onChange={chooseXmlInput} />
          )}
          <button type="button" className="ghost-btn" onClick={validatePreparedImport} disabled={!preview}>Validate Prepared Import</button>
          <button type="button" className="primary-btn" onClick={confirmImport} disabled={!canConfirmImport}>{canConfirmImport ? "Confirm Import" : "Import Locked"}</button>
        </div>

        {fileName && <p className="muted-note">Selected XML: <strong>{fileName}</strong>{preview?.sourceCompany ? ` | Tally Company: ${preview.sourceCompany}` : ""} | Target ERP Company: <strong>{companyContext?.company_name || "Not selected"}</strong></p>}

        {preview ? (
          <>
            <div className="template-meta-grid tally-summary-grid">
              <div><strong>Stock Items</strong><p>{preview.totals.activeStockItems} active / {preview.totals.stockItems} total</p></div>
              <div><strong>HSN Coverage</strong><p>{preview.totals.withHsn} with HSN, {preview.totals.missingHsn} missing</p></div>
              <div><strong>GST Coverage</strong><p>{preview.totals.explicitGst} explicit, {preview.totals.inheritedGst} inherited or blank</p></div>
              <div><strong>Units / Warehouses</strong><p>{preview.totals.units} unit(s), {preview.totals.godowns} godown(s)</p></div>
              <div><strong>Opening Stock Rows</strong><p>{openingStockRows} row(s) held for review only</p></div>
              <div><strong>Safe Import Rows</strong><p>{importableItems.length} item row(s)</p></div>
              <div><strong>Warning Rows</strong><p>{warningRows} row(s) require review</p></div>
              <div><strong>Duplicate XML Rows</strong><p>{duplicateRows} row(s) skipped from import</p></div>
              <div><strong>Readiness</strong><p>{canConfirmImport ? "Ready for controlled import" : "Review required"}</p></div>
              <div><strong>Items To Create</strong><p>{itemRowsToCreate} row(s)</p></div>
              <div><strong>Items To Update</strong><p>{itemRowsToUpdate} row(s)</p></div>
              <div><strong>Warehouses To Create</strong><p>{warehouseRowsToCreate} row(s)</p></div>
              <div><strong>Warehouses To Map</strong><p>{warehouseRowsToMap} existing row(s)</p></div>
              <div><strong>Opening Stock Staging</strong><p>{openingStockRowsStaged} reference row(s)</p></div>
              <div><strong>Live Stock Ledger Rows</strong><p>{liveStockLedgerRowsToCreate} row(s)</p></div>
            </div>

            <div className="template-meta-grid tally-control-grid">
              <div>
                <strong>Default GST For Blank/Inherited Rows</strong>
                <input value={defaultGstRate} onChange={(event) => { setDefaultGstRate(event.target.value); resetPreparedValidation(); }} placeholder={missingGstCount ? "Required before import" : "Not required"} />
                {missingGstCount ? (
                  <div className="quick-rate-row">
                    {[0, 5, 12, 18, 28].map((rate) => (
                      <button key={rate} type="button" className={Number(defaultGstRate) === rate ? "active" : ""} onClick={() => { setDefaultGstRate(String(rate)); resetPreparedValidation(); }}>
                        {rate}%
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div>
                <strong>Import Mode</strong>
                <select value={importMode} onChange={(event) => { setImportMode(event.target.value); setReviewChecks({}); resetPreparedValidation(); }}>
                  <option value="skip_existing">Skip existing records</option>
                  <option value="update_existing">Update existing records</option>
                </select>
              </div>
              <div>
                <strong>Staging Rule</strong>
                <p>Confirm Import writes master data only. Opening stock remains reference/staging data and creates 0 live stock ledger rows.</p>
              </div>
            </div>

            <section className="template-section import-control-gate">
              <div>
                <h3>Import Check and Balance</h3>
                <p>Confirm import remains locked until validation passes and the risky rows are reviewed. This prevents accidental GST, HSN or opening-stock mistakes entering master data.</p>
              </div>
              <div className="readiness-list">
                {readinessIssues.length ? readinessIssues.map((issue) => <span key={issue} className="status-pill warning">{issue}</span>) : <span className="status-pill active">All import controls are satisfied</span>}
              </div>
              {reviewRequirements.length ? (
                <div className="review-checklist">
                  {reviewRequirements.map((item) => (
                    <label key={item.key} className={!canReviewWarnings ? "disabled" : ""}>
                      <input type="checkbox" disabled={!canReviewWarnings} checked={Boolean(reviewChecks[item.key])} onChange={(event) => updateReviewCheck(item.key, event.target.checked)} />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="muted-note">No special warning review is required for this XML after validation.</p>
              )}
            </section>

            <section className="template-section">
              <h3>Unit and Warehouse Mapping</h3>
              <p>Keep Tally names or adjust them before import. Warehouse names are mapped or created as masters only; they do not assign stock to items.</p>
              <div className="field-map-grid compact">
                {(preview.units || []).map((unit) => (
                  <label key={unit.name}>
                    <span>Unit: {unit.name}</span>
                    <input value={unitMap[unit.name] || ""} onChange={(event) => { setUnitMap((current) => ({ ...current, [unit.name]: event.target.value })); resetPreparedValidation(); }} />
                  </label>
                ))}
                {(preview.godowns || []).map((godown) => (
                  <label key={godown.name}>
                    <span>Warehouse: {godown.name}</span>
                    <input value={warehouseMap[godown.name] || ""} onChange={(event) => { setWarehouseMap((current) => ({ ...current, [godown.name]: event.target.value })); resetPreparedValidation(); }} />
                  </label>
                ))}
              </div>
            </section>

            {result && (
              <section className="template-section">
                <h3>{result.mode === "import" ? "Import Result" : "Validation Result"}</h3>
                <div className="import-result template-result">
                  <span>Items Valid: <strong>{result.items?.successfulRows || 0}</strong></span>
                  <span>Items Failed: <strong>{result.items?.failedRows || 0}</strong></span>
                  <span>Items Duplicate: <strong>{result.items?.skippedDuplicates || 0}</strong></span>
                  <span>Warehouses Valid: <strong>{result.warehouses?.successfulRows || 0}</strong></span>
                  <span>Warehouses Mapped: <strong>{result.warehouses?.skippedDuplicates || 0}</strong></span>
                  <span>Opening Stock Staged: <strong>{openingStockRowsStaged}</strong></span>
                  <span>Live Stock Ledger Rows: <strong>{liveStockLedgerRowsToCreate}</strong></span>
                  <span>Updated: <strong>{(result.items?.updatedRows || 0) + (result.warehouses?.updatedRows || 0)}</strong></span>
                </div>
              </section>
            )}

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
                      <th>Category</th>
                      <th>Opening Qty</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.items.slice(0, 80).map((item) => (
                      <tr key={`${item.row_number}-${item.item_name}`}>
                        <td>{item.item_name}</td>
                        <td>{item.unit || "Unmapped"}</td>
                        <td>{item.hsn_code || "Missing"}</td>
                        <td>{item.gst_rate || "Needs default"}</td>
                        <td>{item.category || "Unmapped"}</td>
                        <td>{item.opening_stock_qty || "-"}</td>
                        <td><span className={`status-pill ${item.import_status === "ready" ? "active" : item.import_status === "failed" ? "danger" : "warning"}`}>{item.import_status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.items.length > 80 && <p className="muted-note">Showing first 80 item rows. Download the clean mapping CSV for full review.</p>}
            </section>

            {preview.validation?.errors?.length ? (
              <div className="error-list">
                <strong>Validation Notes</strong>
                {preview.validation.errors.slice(0, 12).map((item) => <span key={`${item.row}-${item.status}`}>Row {item.row}: {item.status} - {item.errors.join("; ")}</span>)}
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState title="No Tally XML loaded yet" note="Select the exported Tally Prime STOCK ITEMS XML file to preview units, godowns, HSN/GST and stock item rows before import." />
        )}
      </section>
    </section>
  );
}
