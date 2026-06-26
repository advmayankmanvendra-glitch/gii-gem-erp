import React, { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, Icon, MetricRows } from "../components/common.jsx";
import { ReportActionButtons, ReportSelectFilter, ReportToolbar } from "../components/forms/index.jsx";
import { exportRows } from "../utils/formatters.js";
import { requestPrintPreview } from "../utils/uiHelpers.js";

const DOCUMENT_MODULES = [
  { key: "supply_orders", label: "Supply Orders", view: "supply_orders", docs: ["Supply Order", "Work Order", "OEM Authorization", "EMD", "Security Deposit"] },
  { key: "invoices", label: "Invoices", view: "invoices", docs: ["Invoice Copy", "Delivery Challan", "Installation Report", "CRAC", "E-Invoice", "E-Way Bill"] },
  { key: "payments", label: "Payments", view: "payments", docs: ["Payment Proof", "Bank Statement", "TDS Certificate", "GST TDS Certificate"] },
  { key: "procurements", label: "Procurement", view: "procurements", docs: ["Supplier Invoice", "Purchase Order", "Delivery Challan", "GRN"] },
  { key: "delivery_challans", label: "Delivery Challans", view: "delivery_challans", docs: ["Delivery Challan", "Transport Proof", "Receiver Acknowledgement"] },
  { key: "stock_inwards", label: "Stock Inwards", view: "stock_inwards", docs: ["Stock Receipt Note", "Supplier Invoice", "Inspection Report"] },
  { key: "stock_outwards", label: "Stock Outwards", view: "stock_outwards", docs: ["Delivery Challan", "Gate Pass", "Issue Note"] }
];

const MODULE_MAP = Object.fromEntries(DOCUMENT_MODULES.map((module) => [module.key, module]));

/** Returns a stable display label for a linked source record. */
function recordLabel(moduleKey, record) {
  if (!record) return "Unlinked";
  if (moduleKey === "supply_orders") return record.order_number || `Order #${record.id}`;
  if (moduleKey === "invoices") return record.invoice_number || `Invoice #${record.id}`;
  if (moduleKey === "payments") return record.utr_number || `Payment #${record.id}`;
  if (moduleKey === "procurements") return record.purchase_invoice_number || `Procurement #${record.id}`;
  if (moduleKey === "delivery_challans") return record.challan_number || `Delivery Challan #${record.id}`;
  if (moduleKey === "stock_inwards") return record.receipt_number || record.purchase_invoice_number || `Stock Inward #${record.id}`;
  if (moduleKey === "stock_outwards") return record.issue_number || record.delivery_challan_number || `Stock Outward #${record.id}`;
  return record.name || record.title || `Record #${record.id}`;
}

/** Builds record dropdown options for the selected document module. */
function recordOptions(moduleKey, recordsByModule) {
  return (recordsByModule[moduleKey] || []).map((record) => [record.id, recordLabel(moduleKey, record)]);
}

/** Finds the source record for a document row. */
function findLinkedRecord(document, recordsByModule) {
  return (recordsByModule[document.linked_module] || []).find((record) => String(record.id) === String(document.linked_record_id));
}

/** Computes uploaded and missing document checklist rows for the current selection. */
function buildChecklist(moduleKey, documents) {
  const expected = MODULE_MAP[moduleKey]?.docs || [];
  const uploadedTypes = new Set(documents.map((document) => document.document_type));
  return expected.map((type) => ({
    type,
    status: uploadedTypes.has(type) ? "Available" : "Missing"
  }));
}

/** Builds readiness guidance without changing accounting or posting data. */
function buildReadiness(moduleKey, checklist) {
  const missing = checklist.filter((item) => item.status === "Missing");
  const complete = checklist.length > 0 && missing.length === 0;
  if (!moduleKey) return [["Audit Readiness", "Select a module"], ["Payment Readiness", "Select invoice/payment"], ["Closure Readiness", "Select order/invoice"]];
  if (complete) return [["Audit Readiness", "Ready"], ["Payment Readiness", "Evidence complete"], ["Closure Readiness", "Document checklist complete"]];
  return [["Audit Readiness", `${missing.length} missing`], ["Payment Readiness", moduleKey === "invoices" || moduleKey === "payments" ? "Review missing proof" : "Not applicable"], ["Closure Readiness", "Document gaps remain"]];
}

/** Converts a document row into export-safe flat fields. */
function exportDocumentRow(document, linkedRecord) {
  return {
    module: MODULE_MAP[document.linked_module]?.label || document.linked_module,
    linked_record: linkedRecord ? recordLabel(document.linked_module, linkedRecord) : document.linked_record_id || "Unlinked",
    document_type: document.document_type,
    file_name: document.original_file_name,
    size_kb: Math.round(Number(document.file_size || 0) / 1024),
    uploaded_at: document.uploaded_at,
    remarks: document.remarks || ""
  };
}

export function DocumentsScreen({ notify, companyContext, apiClient, onNavigate, confirmAction }) {
  const [documents, setDocuments] = useState([]);
  const [recordsByModule, setRecordsByModule] = useState({});
  const [filters, setFilters] = useState({ module: "", recordId: "", type: "", search: "" });
  const [uploadForm, setUploadForm] = useState({ linked_module: "supply_orders", linked_record_id: "", document_type: "Supply Order", remarks: "" });
  const [selectedFile, setSelectedFile] = useState(null);
  const uploadFormRef = useRef(null);
  const linkedRecordSelectRef = useRef(null);
  const browseFileButtonRef = useRef(null);
  const companyId = companyContext?.company_id || "";
  const api = apiClient;
  const selectedModule = filters.module || uploadForm.linked_module;
  const checklist = useMemo(() => buildChecklist(filters.module || uploadForm.linked_module, documents), [documents, filters.module, uploadForm.linked_module]);
  const visibleDocuments = useMemo(() => documents.filter((document) => {
    if (filters.type && document.document_type !== filters.type) return false;
    const linkedRecord = findLinkedRecord(document, recordsByModule);
    const text = `${document.linked_module} ${document.document_type} ${document.original_file_name} ${document.remarks || ""} ${linkedRecord ? recordLabel(document.linked_module, linkedRecord) : ""}`.toLowerCase();
    return !filters.search || text.includes(filters.search.toLowerCase());
  }), [documents, filters.type, filters.search, recordsByModule]);

  async function loadDocuments() {
    try {
      const rows = await api.listDocuments({
        module: filters.module,
        linked_record_id: filters.recordId,
        company_id: companyId
      });
      setDocuments(Array.isArray(rows) ? rows : []);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function loadRecords(moduleKey) {
    if (!moduleKey || recordsByModule[moduleKey]) return;
    try {
      const rows = await api.listRecords(moduleKey, { status: "all", company_id: companyId });
      setRecordsByModule((current) => ({ ...current, [moduleKey]: Array.isArray(rows) ? rows : [] }));
    } catch {
      setRecordsByModule((current) => ({ ...current, [moduleKey]: [] }));
    }
  }

  useEffect(() => {
    loadDocuments();
  }, [filters.module, filters.recordId, companyId, companyContext?.company_scope]);

  useEffect(() => {
    loadRecords(filters.module);
    loadRecords(uploadForm.linked_module);
  }, [filters.module, uploadForm.linked_module, companyId]);

  /** Opens the trusted Electron file picker so uploads receive a real desktop file path. */
  async function chooseDesktopDocumentFile() {
    try {
      if (!api.selectDocumentFile) {
        notify("Desktop document picker is not available in this runtime.", "error");
        return;
      }
      const file = await api.selectDocumentFile();
      if (file?.path) setSelectedFile(file);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  /** Clears the selected desktop file without changing document link fields. */
  function clearSelectedDocumentFile() {
    setSelectedFile(null);
  }

  async function handleUpload(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.elements.document_file.files?.[0];
    const sourcePath = selectedFile?.path || file?.path;
    if (!uploadForm.linked_module) {
      notify("Select the module before uploading a document.", "error");
      return;
    }
    if (!uploadForm.linked_record_id) {
      notify("Select the order, invoice, payment or source record to link this document.", "error");
      return;
    }
    if (!sourcePath) {
      notify("Use Browse Desktop File to select the PDF, image or supporting document inside the Windows desktop app.", "error");
      return;
    }
    try {
      await api.uploadDocument({
        source_path: sourcePath,
        company_id: companyId,
        linked_module: uploadForm.linked_module,
        linked_record_id: uploadForm.linked_record_id,
        document_type: uploadForm.document_type,
        remarks: uploadForm.remarks
      });
      notify("Document uploaded and linked");
      form.reset();
      setSelectedFile(null);
      setUploadForm((current) => ({ ...current, remarks: "" }));
      await loadDocuments();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function handleView(document) {
    try {
      const result = await api.viewDocument(document.id);
      if (result?.opened) notify("Document opened");
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function handleDownload(document) {
    try {
      const result = await api.downloadDocument(document.id);
      if (!result?.canceled) notify(result?.savedPath ? `Document downloaded to ${result.savedPath}` : "Document downloaded");
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function handleDelete(document) {
    const confirmation = confirmAction
      ? await confirmAction({
        mode: "danger",
        title: "Delete Document",
        message: "Delete this document record? The linked source record will remain unchanged.",
        confirmLabel: "Yes, Delete",
        cancelLabel: "No, Cancel",
        moduleName: "documents",
        recordId: document.id
      })
      : { confirmed: window.confirm("Delete this document record? The linked source record will remain unchanged.") };
    if (!confirmation?.confirmed) {
      notify("Document deletion cancelled");
      return;
    }
    try {
      await api.deleteDocument({ id: document.id });
      notify("Document deleted");
      await loadDocuments();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  function openSource(document) {
    const moduleInfo = MODULE_MAP[document.linked_module];
    if (!moduleInfo?.view || !document.linked_record_id) {
      notify("This document is not linked to an openable ERP record.", "warning");
      return;
    }
    onNavigate?.(moduleInfo.view, { recordId: document.linked_record_id, section: "documents" });
  }

  /** Starts upload from checklist by selecting type and moving focus to the next required step. */
  async function applyMissingDocument(type) {
    const nextModule = filters.module || uploadForm.linked_module;
    const nextRecordId = filters.recordId || uploadForm.linked_record_id;
    setUploadForm((current) => ({
      ...current,
      linked_module: nextModule,
      linked_record_id: nextRecordId,
      document_type: type
    }));
    setTimeout(() => {
      uploadFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (nextRecordId) {
        browseFileButtonRef.current?.focus();
      } else {
        linkedRecordSelectRef.current?.focus();
      }
    }, 50);
    if (!nextRecordId) {
      notify(`${type} selected. Choose the linked source record, then browse the file.`, "warning");
      return;
    }
    await chooseDesktopDocumentFile();
  }

  return (
    <section className="panel settings-panel report-panel document-center">
      <ReportToolbar title="Document Center" note={`${companyContext?.company_name || "No company selected"} - ${visibleDocuments.length} visible / ${documents.length} uploaded document(s)`}>
        <ReportSelectFilter
          value={filters.module}
          onChange={(module) => setFilters({ module, recordId: "", type: "", search: filters.search })}
          placeholderLabel="All Modules"
          options={DOCUMENT_MODULES.map((module) => [module.key, module.label])}
        />
        <ReportSelectFilter
          value={filters.recordId}
          onChange={(recordId) => setFilters((current) => ({ ...current, recordId }))}
          placeholderLabel="All Records"
          options={recordOptions(filters.module, recordsByModule)}
        />
        <ReportSelectFilter
          value={filters.type}
          onChange={(type) => setFilters((current) => ({ ...current, type }))}
          placeholderLabel="All Document Types"
          options={(filters.module ? MODULE_MAP[filters.module]?.docs || [] : Array.from(new Set(documents.map((document) => document.document_type))).sort()).map((type) => [type, type])}
        />
        <input placeholder="Search documents" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
        <ReportActionButtons
          onExport={() => exportRows("document-center", visibleDocuments.map((document) => exportDocumentRow(document, findLinkedRecord(document, recordsByModule))))}
          onPrint={requestPrintPreview}
        />
      </ReportToolbar>

      <div className="workflow-note" style={{ margin: "0 16px 12px" }}>
        <strong>Document Lifecycle</strong>
        <span>Documents support audit trail, billing readiness, payment readiness and order closure. They do not post accounting entries by themselves.</span>
        <small>Upload a document, link it to the correct source record, then use Preview/Open Source to verify the business evidence path.</small>
      </div>

      <div className="dashboard-grid compact-grid" style={{ margin: "0 16px 12px" }}>
        <section className="intelligence-card">
          <h3>Readiness Connection</h3>
          <MetricRows rows={buildReadiness(selectedModule, checklist)} />
        </section>
        <section className="intelligence-card">
          <h3>Document Checklist</h3>
          {checklist.length ? (
            <div className="metric-rows">
              {checklist.map((item) => (
                <span key={item.type} className={item.status === "Available" ? "ok-line" : "warning-line"}>
                  <small>{item.type}</small>
                  <strong>{item.status}</strong>
                  {item.status === "Missing" ? <button type="button" className="ghost-btn small-btn" onClick={() => applyMissingDocument(item.type)}>Upload</button> : null}
                </span>
              ))}
            </div>
          ) : <small>Select a document module to view its checklist.</small>}
        </section>
      </div>

      <form ref={uploadFormRef} className="panel entry-form" style={{ margin: "0 16px 12px" }} onSubmit={handleUpload}>
        <div className="panel-head">
          <div>
            <h2>Upload And Link Document</h2>
            <p>Attach supporting evidence to an order, invoice, payment, procurement or stock movement.</p>
          </div>
        </div>
        <div className="form-grid">
          <label className="field">
            Module
            <select value={uploadForm.linked_module} onChange={(event) => {
              const moduleKey = event.target.value;
              setSelectedFile(null);
              setUploadForm({ linked_module: moduleKey, linked_record_id: "", document_type: MODULE_MAP[moduleKey]?.docs?.[0] || "Supporting Document", remarks: "" });
            }}>
              {DOCUMENT_MODULES.map((module) => <option key={module.key} value={module.key}>{module.label}</option>)}
            </select>
          </label>
          <label className="field">
            Linked Record
            <select ref={linkedRecordSelectRef} value={uploadForm.linked_record_id} onChange={(event) => setUploadForm((current) => ({ ...current, linked_record_id: event.target.value }))}>
              <option value="">Select source record</option>
              {recordOptions(uploadForm.linked_module, recordsByModule).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label className="field">
            Document Type
            <select value={uploadForm.document_type} onChange={(event) => setUploadForm((current) => ({ ...current, document_type: event.target.value }))}>
              {(MODULE_MAP[uploadForm.linked_module]?.docs || ["Supporting Document"]).map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label className="field">
            File
            <div className="inline-actions">
              <button ref={browseFileButtonRef} type="button" className="ghost-btn" onClick={chooseDesktopDocumentFile}>Browse Desktop File</button>
              {selectedFile ? <button type="button" className="ghost-btn" onClick={clearSelectedDocumentFile}>Clear</button> : null}
            </div>
            <input name="document_file" type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.csv,.xls" />
            <small>{selectedFile?.name || "Use Browse Desktop File in the Windows app for reliable PDF/image uploads."}</small>
          </label>
          <label className="field wide">
            Remarks
            <input value={uploadForm.remarks} onChange={(event) => setUploadForm((current) => ({ ...current, remarks: event.target.value }))} placeholder="Optional document note" />
          </label>
        </div>
        <button className="primary-btn" type="submit">Upload And Link</button>
      </form>

      {visibleDocuments.length ? (
        <div className="table-wrap" style={{ margin: "0 16px" }}>
          <table>
            <thead>
              <tr>
                <th>Module</th>
                <th>Linked Record</th>
                <th>Document</th>
                <th>File</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th>Readiness</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleDocuments.map((document) => {
                const linkedRecord = findLinkedRecord(document, recordsByModule);
                return (
                  <tr key={document.id}>
                    <td>{MODULE_MAP[document.linked_module]?.label || document.linked_module}</td>
                    <td>{linkedRecord ? recordLabel(document.linked_module, linkedRecord) : document.linked_record_id || "Unlinked"}</td>
                    <td>{document.document_type}</td>
                    <td><button className="ghost-btn small-btn" type="button" onClick={() => handleView(document)}>{document.original_file_name}</button></td>
                    <td>{Math.round(Number(document.file_size || 0) / 1024)} KB</td>
                    <td>{document.uploaded_at ? new Date(document.uploaded_at).toLocaleString("en-IN") : "-"}</td>
                    <td><span className="status active">Evidence Linked</span></td>
                    <td>
                      <div className="row-actions">
                        <button className="ghost-btn small-btn" type="button" onClick={() => handleView(document)}>Preview</button>
                        <button className="ghost-btn small-btn" type="button" onClick={() => openSource(document)}>Source</button>
                        <button className="ghost-btn small-btn" type="button" onClick={() => handleDownload(document)}>Download</button>
                        <button className="ghost-btn small-btn danger" type="button" onClick={() => handleDelete(document)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="No documents found" note="Upload and link supporting documents, or adjust the module/record filters." />}
    </section>
  );
}
