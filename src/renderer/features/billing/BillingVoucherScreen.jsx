import { useEffect, useState } from "react";
import { formatCurrency, formatNumber } from "../../utils/formatters.js";
import { formChanged, useUnsavedChanges } from "../../utils/formUtils.js";
import { scrollToSection } from "../../utils/navigationScroll.js";
import { roleAllowsAction } from "../../components/helpProductivity/index.jsx";
import { EmptyState } from "../../components/common.jsx";
import { Field, MetricLine, ReadOnlyBox, SelectBox, SearchableSelect } from "../../components/forms/index.jsx";
import { QuickCreateMasterDialog, quickCreateRecords } from "../../components/overlays/index.jsx";
import { SmartEntityPicker } from "../../components/entityPicker/SmartEntityPicker.jsx";
import {
  billingOrderValidation, calculateInvoiceLine, invoiceTimeline, lifecycleStage, maxLineGstRate,
  orderIssuedQuantity, orderLinesForBilling, orderProcuredQuantity, pendingQuantityForLine,
  profitabilityPreviewForOrder, suggestedInvoiceNumber, uniqueInstitutionOptions
} from "./billingHelpers.js";

function BillingVoucherScreen({ notify, role, companyContext, onNavigate, api, confirmAction, reversalConfirmOptions, postConfirmOptions, isRecordLocked, normalizeStatusClass }) {
  const blankHeader = {
    company_id: "",
    financial_year_id: "",
    order_id: "",
    department_id: "",
    institution_name: "",
    invoice_number: "",
    invoice_date: new Date().toISOString().slice(0, 10),
    gem_order_number: "",
    gem_contract_number: "",
    consignee: "",
    place_of_supply: "",
    gst_type: "CGST/SGST",
    invoice_type: "Tax Invoice",
    invoice_status: "Draft",
    remarks: ""
  };
  const blankLine = { item_id: "", description: "", hsn: "", quantity: 1, unit: "Nos", billing_rate: 0, gst_rate: 18 };
  const [data, setData] = useState(null);
  const [header, setHeader] = useState(blankHeader);
  const [lines, setLines] = useState([blankLine]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadForm, setUploadForm] = useState({ document_type: "Invoice Copy", remarks: "" });
  const [allowExcessBilling, setAllowExcessBilling] = useState(false);
  const [quickItem, setQuickItem] = useState(null);
  const [quickCreate, setQuickCreate] = useState(null);
  const [duplicateItemPrompt, setDuplicateItemPrompt] = useState(null);
  const [gridExpanded, setGridExpanded] = useState(false);
  const [rowEditor, setRowEditor] = useState(null);

  async function load() {
    setLoading(true);
    try {
      setData(await api.getBillingData(companyContext));
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [companyContext?.company_id, companyContext?.company_scope]);

  useEffect(() => {
    function newRecord() {
      resetForm();
    }
    window.addEventListener("gii-gem-new-record", newRecord);
    window.addEventListener("gii-gem-refresh-screen", load);
    return () => {
      window.removeEventListener("gii-gem-new-record", newRecord);
      window.removeEventListener("gii-gem-refresh-screen", load);
    };
  }, []);

  const refs = data?.references || {};
  const selectedCompany = refs.companies?.find((row) => String(row.id) === String(header.company_id || companyContext?.company_id));
  const selectedCompanyId = header.company_id || companyContext?.company_id || selectedCompany?.id || "";
  const selectedOrder = refs.orders?.find((row) => String(row.id) === String(header.order_id));
  const selectedYear = (data?.financialYears || []).find((row) => String(row.id) === String(header.financial_year_id));
  const selectedDepartmentId = header.department_id || selectedOrder?.department_id || "";
  const selectedDepartment = refs.departments?.find((row) => String(row.id) === String(selectedDepartmentId));
  const institutionOptions = uniqueInstitutionOptions(data?.institutionOptions || [], selectedDepartmentId);
  const orderOptions = (refs.orders || [])
    .filter((row) => !selectedDepartmentId || String(row.department_id) === String(selectedDepartmentId))
    .filter((row) => !header.institution_name || String(row.institution_name || "") === String(header.institution_name))
    .map((row) => [row.id, row.order_number, `${row.department_name || ""} ${row.institution_name || ""}`.trim()]);
  const invoiceNumberSuggestion = suggestedInvoiceNumber(data, selectedCompanyId, header.financial_year_id);
  const selectedInvoice = editing ? data?.invoices?.find((row) => Number(row.id) === Number(editing.id)) : null;
  const invoiceLocked = isRecordLocked(selectedInvoice || editing || {});
  const calculatedLines = lines.map((line) => calculateInvoiceLine(line, header.gst_type));
  const rowEditorCalculated = rowEditor ? calculateInvoiceLine(rowEditor.form, header.gst_type) : null;
  const totals = calculatedLines.reduce((acc, line) => ({
    quantity: acc.quantity + Number(line.quantity || 0),
    taxable: acc.taxable + Number(line.taxable_value || 0),
    cgst: acc.cgst + Number(line.cgst || 0),
    sgst: acc.sgst + Number(line.sgst || 0),
    igst: acc.igst + Number(line.igst || 0),
    gst: acc.gst + Number(line.gst_amount || 0),
    gross: acc.gross + Number(line.gross_value || 0)
  }), { quantity: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, gst: 0, gross: 0 });
  const orderValidation = billingOrderValidation(data, header, calculatedLines, editing?.id);
  const profitability = profitabilityPreviewForOrder(data?.profitability || [], header.order_id, totals.taxable);
  const documents = (data?.documents || []).filter((doc) => {
    if (doc.linked_module === "invoices") return Number(doc.linked_record_id || 0) === Number(editing?.id || 0);
    if (doc.linked_module === "supply_orders") return Number(doc.linked_record_id || 0) === Number(header.order_id || 0);
    if (doc.linked_module === "delivery_challans") return Number(doc.document_order_id || 0) === Number(header.order_id || 0);
    return false;
  });
  const requiredBillingDocuments = ["Supply Order", "Delivery Challan", "Installation Report", "CRAC", "OEM Authorization"];
  const billingDirty = formChanged(header, blankHeader) || formChanged(lines, [blankLine]) || formChanged(uploadForm, { document_type: "Invoice Copy", remarks: "" });
  useUnsavedChanges(billingDirty);

  useEffect(() => {
    if (!data || editing) return;
    setHeader((current) => {
      const companyId = current.company_id || companyContext?.company_id || "";
      const yearId = current.financial_year_id || data.financialYears?.find((row) => row.status === "Open")?.id || data.financialYears?.[0]?.id || "";
      const nextInvoice = current.invoice_number || suggestedInvoiceNumber(data, companyId, yearId);
      return { ...current, company_id: companyId, financial_year_id: yearId, invoice_number: nextInvoice };
    });
  }, [data, editing, companyContext?.company_id]);

  function setOrder(orderId) {
    const order = refs.orders?.find((row) => String(row.id) === String(orderId));
    const nextLines = orderLinesForBilling(data, orderId, editing?.id);
    setHeader((current) => ({
      ...current,
      order_id: orderId,
      company_id: current.company_id || companyContext?.company_id || "",
      department_id: order?.department_id || current.department_id || "",
      institution_name: order?.institution_name || current.institution_name || "",
      consignee: order?.institution_name || current.consignee || "",
      place_of_supply: order?.location || current.place_of_supply || ""
    }));
    if (nextLines.length) setLines(nextLines);
  }

  function setDepartment(departmentId) {
    setHeader((current) => ({
      ...current,
      department_id: departmentId,
      order_id: current.department_id === departmentId ? current.order_id : "",
      institution_name: current.department_id === departmentId ? current.institution_name : ""
    }));
  }

  function setInstitution(institutionName) {
    setHeader((current) => ({
      ...current,
      institution_name: institutionName,
      order_id: current.institution_name === institutionName ? current.order_id : ""
    }));
  }

  function updateLine(index, patch) {
    setLines((current) => current.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      const next = { ...line, ...patch };
      if (patch.item_id) {
        const item = refs.items?.find((row) => String(row.id) === String(patch.item_id));
        const orderItem = (data?.orderItems || []).find((row) => Number(row.order_id) === Number(header.order_id) && Number(row.item_id || 0) === Number(patch.item_id || 0));
        if (item) {
          next.order_item_id = orderItem?.id || next.order_item_id || "";
          next.description = item.item_name || next.description;
          next.hsn = item.hsn_code || "";
          next.unit = item.unit || next.unit;
          next.gst_rate = Number(item.gst_rate || 0);
          next.pending_quantity = pendingQuantityForLine(data, header.order_id, { order_item_id: orderItem?.id, item_id: patch.item_id }, editing?.id);
        }
      }
      return next;
    }));
  }

  function hydrateBillingLine(line, patch) {
    const next = { ...line, ...patch };
    if (patch.item_id) {
      const item = refs.items?.find((row) => String(row.id) === String(patch.item_id));
      const orderItem = (data?.orderItems || []).find((row) => Number(row.order_id) === Number(header.order_id) && Number(row.item_id || 0) === Number(patch.item_id || 0));
      if (item) {
        next.order_item_id = orderItem?.id || next.order_item_id || "";
        next.description = item.item_name || next.description;
        next.hsn = item.hsn_code || "";
        next.unit = item.unit || next.unit;
        next.gst_rate = Number(item.gst_rate || 0);
        next.pending_quantity = pendingQuantityForLine(data, header.order_id, { order_item_id: orderItem?.id, item_id: patch.item_id }, editing?.id);
      }
    }
    return next;
  }

  function openRowEditor(index) {
    setRowEditor({ index, form: { ...lines[index] } });
  }

  function updateRowEditorLine(patch) {
    setRowEditor((current) => current ? { ...current, form: hydrateBillingLine(current.form, patch) } : current);
  }

  function saveRowEditor() {
    if (!rowEditor) return;
    updateLine(rowEditor.index, rowEditor.form);
    setRowEditor(null);
  }

  function resetForm() {
    const companyId = companyContext?.company_id || "";
    const yearId = data?.financialYears?.find((row) => row.status === "Open")?.id || data?.financialYears?.[0]?.id || "";
    setHeader({ ...blankHeader, company_id: companyId, financial_year_id: yearId, invoice_number: suggestedInvoiceNumber(data, companyId, yearId) });
    setLines([blankLine]);
    setEditing(null);
    setUploadForm({ document_type: "Invoice Copy", remarks: "" });
    setAllowExcessBilling(false);
  }

  function editInvoice(invoice) {
    setEditing(invoice);
    setHeader({
      company_id: invoice.company_id || "",
      financial_year_id: invoice.financial_year_id || "",
      order_id: invoice.order_id || "",
      department_id: invoice.department_id || "",
      institution_name: invoice.institution_name || "",
      invoice_number: invoice.invoice_number || "",
      invoice_date: invoice.invoice_date || new Date().toISOString().slice(0, 10),
      gem_order_number: invoice.gem_order_number || "",
      gem_contract_number: invoice.gem_contract_number || "",
      consignee: invoice.consignee || invoice.institution_name || "",
      place_of_supply: invoice.place_of_supply || invoice.location || "",
      gst_type: invoice.gst_type || "CGST/SGST",
      invoice_type: invoice.invoice_type || "Tax Invoice",
      invoice_status: invoice.invoice_status || invoice.approval_status || "Draft",
      remarks: invoice.remarks || ""
    });
    const existingLines = (data?.invoiceItems || []).filter((line) => Number(line.billing_id) === Number(invoice.id));
    setLines(existingLines.length ? existingLines.map((line) => ({
      order_item_id: line.order_item_id || "",
      item_id: line.item_id || "",
      description: line.description || line.item_name || "",
      hsn: line.hsn || line.hsn_code || "",
      quantity: line.quantity || 0,
      unit: line.unit || line.item_unit || "",
      billing_rate: line.billing_rate || 0,
      gst_rate: line.gst_rate || 0
    })) : [{ ...blankLine, billing_rate: invoice.billing_value || 0, gst_rate: invoice.gst_rate || 18 }]);
    scrollToSection("#billing-voucher-form");
  }

  async function submit(event) {
    event.preventDefault();
    try {
      if (!header.order_id) {
        scrollToSection("#billing-voucher-form");
        throw new Error("Order is required");
      }
      if (!companyContext?.company_id) throw new Error("Select Current Company before saving an invoice.");
      if (header.company_id && String(header.company_id) !== String(companyContext.company_id)) throw new Error("Selected company and invoice company do not match.");
      if (!selectedDepartmentId) {
        scrollToSection("#billing-voucher-form");
        throw new Error("Department is required before billing");
      }
      if (!header.invoice_number.trim() && !invoiceNumberSuggestion) {
        scrollToSection("#billing-voucher-form");
        throw new Error("Invoice number is required");
      }
      if (totals.gross <= 0) {
        scrollToSection("#billing-items-section");
        throw new Error("Invoice amount must be positive");
      }
      if (orderValidation.duplicate) {
        scrollToSection("#billing-order-validation");
        throw new Error("Duplicate billing warning: this order already has this invoice number");
      }
      if ((orderValidation.overBilling || orderValidation.excessQuantity || orderValidation.excessLineQuantity) && !allowExcessBilling) {
        scrollToSection("#billing-order-validation");
        throw new Error("Excess billing is blocked. Tick explicit authorization to proceed.");
      }
      const saved = await api.saveBillingVoucher({
        header: { ...header, company_id: companyContext.company_id, invoice_number: header.invoice_number || invoiceNumberSuggestion, id: editing?.id, billing_value: totals.taxable, gst_rate: maxLineGstRate(calculatedLines), posting_status: editing?.posting_status || "Draft", approval_status: header.invoice_status === "Approved" ? "Approved" : "Draft" },
        items: calculatedLines.map((line) => ({ ...line, gst_type: header.gst_type }))
      });
      notify(`Invoice ${saved.invoice_number} saved`);
      resetForm();
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function postInvoice(action) {
    if (!editing) {
      notify("Select an invoice before posting", "error");
      scrollToSection("#billing-invoice-list");
      return;
    }
    try {
      if (action === "reverse") {
        if (!selectedInvoice?.voucher_id) throw new Error("No posted voucher is linked to this invoice");
        const confirmed = await confirmAction(reversalConfirmOptions("invoices", selectedInvoice.id));
        if (!confirmed.confirmed) return;
        await api.reverseVoucher(selectedInvoice.voucher_id, confirmed.reason);
        notify("Invoice voucher reversed");
      } else {
        const confirmed = await confirmAction({
          ...postConfirmOptions("invoices", editing.id),
          message: "Do you want to post this voucher to the books of accounts?",
          cancelLabel: "No, Review Again"
        });
        if (!confirmed.confirmed) return;
        await api.postTransaction("billing", editing.id);
        notify(action === "repost" ? "Repost completed" : "Invoice posted");
      }
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function uploadAttachment(event) {
    event.preventDefault();
    const file = event.currentTarget.elements.billing_document.files?.[0];
    if (!editing) {
      notify("Save or select an invoice before uploading documents", "error");
      return;
    }
    if (!file?.path) {
      notify("Document upload is available in the desktop app", "error");
      return;
    }
    try {
      await api.uploadDocument({
        source_path: file.path,
        linked_module: "invoices",
        linked_record_id: editing.id,
        company_id: header.company_id || selectedCompany?.id,
        document_type: uploadForm.document_type,
        remarks: uploadForm.remarks
      });
      notify("Invoice document attached");
      event.currentTarget.reset();
      setUploadForm({ document_type: "Invoice Copy", remarks: "" });
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  function openQuickItem(lineIndex) {
    if (!roleAllowsAction(role, "new")) {
      confirmAction({
        title: "Permission Required",
        message: "You do not have permission to create new items. Please contact administrator.",
        confirmLabel: "OK",
        hideCancel: true
      });
      return;
    }
    setQuickItem({
      lineIndex,
      form: {
        item_name: "",
        hsn_code: "",
        gst_rate: "",
        unit: "Nos",
        brand: "",
        model: "",
        category: "",
        description: "",
        inventory_enabled: 1,
        track_serial_number: 0,
        minimum_stock_level: "",
        default_warehouse_id: "",
        status: "active"
      }
    });
  }

  function openQuickCreate(type, request = {}) {
    if (!roleAllowsAction(role, "new")) {
      confirmAction({
        title: "Permission Required",
        message: "You do not have permission to create master records. Please contact administrator.",
        confirmLabel: "OK",
        hideCancel: true
      });
      return;
    }
    setQuickCreate({ type, ...request });
  }

  async function handleQuickCreated(type, saved) {
    if (type === "department") setDepartment(saved.id);
    if (type === "institution") {
      setInstitution(saved.institution_name);
      setHeader((current) => ({
        ...current,
        institution_name: saved.institution_name || current.institution_name,
        consignee: saved.consignee || current.consignee,
        place_of_supply: saved.place_of_supply || current.place_of_supply
      }));
    }
    await load();
  }

  function similarItemForQuickCreate(form) {
    const name = String(form.item_name || "").trim().toLowerCase();
    const brand = String(form.brand || "").trim().toLowerCase();
    const model = String(form.model || "").trim().toLowerCase();
    const hsn = String(form.hsn_code || "").trim().toLowerCase();
    return (refs.items || []).find((item) => (
      String(item.item_name || "").trim().toLowerCase() === name
      && String(item.brand || "").trim().toLowerCase() === brand
      && String(item.model || "").trim().toLowerCase() === model
      && String(item.hsn_code || "").trim().toLowerCase() === hsn
    ));
  }

  function useQuickExistingItem(item) {
    if (!quickItem) return;
    updateLine(quickItem.lineIndex, { item_id: item.id });
    setRowEditor((current) => current && current.index === quickItem.lineIndex ? {
      ...current,
      form: hydrateBillingLine(current.form, { item_id: item.id })
    } : current);
    setDuplicateItemPrompt(null);
    setQuickItem(null);
    notify("Existing item selected");
  }

  async function saveQuickItem(createAnyway = false) {
    if (!quickItem) return;
    const form = quickItem.form;
    try {
      ["item_name", "hsn_code", "gst_rate", "unit"].forEach((field) => {
        if (!String(form[field] || "").trim()) throw new Error(`${field.replaceAll("_", " ")} is required`);
      });
      const duplicate = similarItemForQuickCreate(form);
      if (duplicate && !createAnyway) {
        setDuplicateItemPrompt(duplicate);
        return;
      }
      const saved = await api.createRecord("items", {
        item_name: form.item_name,
        brand: form.brand,
        model: form.model,
        hsn_code: form.hsn_code,
        gst_rate: Number(form.gst_rate || 0),
        unit: form.unit,
        category: form.category || "Billing Quick Create",
        inventory_enabled: form.inventory_enabled ? 1 : 0,
        track_serial_number: form.track_serial_number ? 1 : 0,
        minimum_stock_level: Number(form.minimum_stock_level || 0),
        default_warehouse_id: form.default_warehouse_id || null,
        status: "active"
      });
      setLines((current) => current.map((line, index) => index === quickItem.lineIndex ? {
        ...line,
        item_id: saved.id,
        description: form.description || saved.item_name,
        hsn: saved.hsn_code || "",
        unit: saved.unit || "Nos",
        gst_rate: Number(saved.gst_rate || 0)
      } : line));
      setRowEditor((current) => current && current.index === quickItem.lineIndex ? {
        ...current,
        form: {
          ...current.form,
          item_id: saved.id,
          description: form.description || saved.item_name,
          hsn: saved.hsn_code || "",
          unit: saved.unit || "Nos",
          gst_rate: Number(saved.gst_rate || 0)
        }
      } : current);
      setQuickItem(null);
      setDuplicateItemPrompt(null);
      notify(`Item ${saved.item_name} created and selected`);
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <section className={`billing-workspace ${gridExpanded ? "grid-expanded" : ""}`}>
      <form id="billing-voucher-form" className={`panel billing-form ${gridExpanded ? "grid-mode" : ""}`} data-entry-form="true" onSubmit={submit}>
        <div className="panel-head">
          <div>
            <h2>Billing Voucher</h2>
            <p>Government supply invoice header, item tax grid and posting control.</p>
          </div>
          <div className="billing-head-actions">
            <button type="button" className="ghost-btn" onClick={() => setGridExpanded((current) => !current)}>
              {gridExpanded ? "Exit Grid Mode" : "Expand Grid"}
            </button>
            {editing ? <span className={`status ${normalizeStatusClass(lifecycleStage(editing))}`}>{lifecycleStage(editing)}</span> : <span className={`status ${normalizeStatusClass(header.invoice_status)}`}>{header.invoice_status}</span>}
          </div>
        </div>

        {!gridExpanded && (
          <>
            <div className="billing-section-title">Invoice Header</div>
            <div className="billing-header-grid">
              <SearchableSelect label="Company" value={header.company_id || selectedCompany?.id || ""} onChange={(value) => setHeader({ ...header, company_id: value, invoice_number: suggestedInvoiceNumber(data, value, header.financial_year_id) })} options={(refs.companies || []).map((row) => [row.id, row.company_name])} />
              <SearchableSelect label="Financial Year" value={header.financial_year_id} onChange={(value) => setHeader({ ...header, financial_year_id: value, invoice_number: suggestedInvoiceNumber(data, header.company_id || selectedCompany?.id, value) })} options={(data?.financialYears || []).map((row) => [row.id, `${row.financial_year_name} (${row.status})`])} />
              <Field name="invoice_number" label="Invoice Number" type="text" value={header.invoice_number || invoiceNumberSuggestion} onChange={(value) => setHeader({ ...header, invoice_number: value })} />
              <Field name="invoice_date" label="Invoice Date" type="date" value={header.invoice_date} onChange={(value) => setHeader({ ...header, invoice_date: value })} />
              <SmartEntityPicker entityType="supply_order" api={api} role={role} companyId={companyContext?.company_id} value={header.order_id} onChange={setOrder} onQuickCreate={(type, defaults) => openQuickCreate(type, { defaults })} />
              <Field name="gem_order_number" label="GeM Order Number" type="text" value={header.gem_order_number} onChange={(value) => setHeader({ ...header, gem_order_number: value })} />
              <Field name="gem_contract_number" label="Contract Number" type="text" value={header.gem_contract_number} onChange={(value) => setHeader({ ...header, gem_contract_number: value })} />
              <SmartEntityPicker entityType="department" api={api} role={role} companyId={companyContext?.company_id} value={selectedDepartmentId} onChange={setDepartment} onQuickCreate={(type, defaults) => openQuickCreate(type, { defaults })} />
              <SearchableSelect label="Institution" value={header.institution_name} onChange={setInstitution} options={institutionOptions} placeholder="Search institution" onQuickCreate={() => openQuickCreate("institution", { defaults: { place_of_supply: header.place_of_supply, consignee: header.consignee } })} />
              <Field name="consignee" label="Consignee" type="text" value={header.consignee} onChange={(value) => setHeader({ ...header, consignee: value })} />
              <Field name="place_of_supply" label="Place of Supply" type="text" value={header.place_of_supply} onChange={(value) => setHeader({ ...header, place_of_supply: value })} />
              <SelectBox label="GST Type" value={header.gst_type} onChange={(value) => setHeader({ ...header, gst_type: value })} options={[["CGST/SGST", "CGST + SGST"], ["CGST", "CGST only"], ["SGST", "SGST only"], ["IGST", "IGST"]]} />
              <SelectBox label="Invoice Status" value={header.invoice_status} onChange={(value) => setHeader({ ...header, invoice_status: value })} options={["Draft", "Pending Approval", "Approved", "Posted", "Reversed"].map((status) => [status, status])} />
            </div>
          </>
        )}

        <div className="billing-grid-toolbar">
          <div>
            <div className="billing-section-title">Invoice Item Grid</div>
            <small>Double-click a row or focus it and press Enter for the large row editor.</small>
          </div>
          <button type="button" className="ghost-btn" onClick={() => setGridExpanded((current) => !current)}>
            {gridExpanded ? "Exit Grid Mode" : "Expand Grid"}
          </button>
        </div>
        <div id="billing-items-section" className="invoice-grid-wrap">
          <table className="invoice-grid">
            <thead>
              <tr>
                <th>Item</th><th>Description</th><th>HSN</th><th>Pending</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Taxable</th><th>GST %</th><th>Tax Detail</th><th>Gross</th><th></th>
              </tr>
            </thead>
            <tbody>
              {calculatedLines.map((line, index) => (
                <tr key={index} tabIndex={0} onDoubleClick={() => openRowEditor(index)} onKeyDown={(event) => {
                  if (event.key === "Enter" && event.target === event.currentTarget) {
                    event.preventDefault();
                    openRowEditor(index);
                    return;
                  }
                  if (event.key === "F10") {
                    event.preventDefault();
                    openQuickItem(index);
                  }
                }}>
                  <td>
                    <div className="item-select-cell">
                      <SmartEntityPicker
                        entityType="item"
                        api={api}
                        role={role}
                        companyId={companyContext?.company_id}
                        value={line.item_id || ""}
                        onChange={(value) => updateLine(index, { item_id: value })}
                        onQuickCreate={() => openQuickItem(index)}
                      />
                    </div>
                  </td>
                  <td><input value={line.description || ""} onChange={(event) => updateLine(index, { description: event.target.value })} /></td>
                  <td><input value={line.hsn || ""} readOnly onChange={(event) => updateLine(index, { hsn: event.target.value })} /></td>
                  <td>{formatNumber(line.pending_quantity ?? pendingQuantityForLine(data, header.order_id, line, editing?.id))}</td>
                  <td><input type="number" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></td>
                  <td><input value={line.unit || ""} onChange={(event) => updateLine(index, { unit: event.target.value })} /></td>
                  <td><input type="number" value={line.billing_rate} onChange={(event) => updateLine(index, { billing_rate: event.target.value })} /></td>
                  <td>{formatCurrency(line.taxable_value)}</td>
                  <td><input type="number" value={line.gst_rate} onChange={(event) => updateLine(index, { gst_rate: event.target.value })} /></td>
                  <td className="tax-detail-cell">
                    <strong>{formatCurrency(line.gst_amount)}</strong>
                    <span>C {formatCurrency(line.cgst)}</span>
                    <span>S {formatCurrency(line.sgst)}</span>
                    <span>I {formatCurrency(line.igst)}</span>
                  </td>
                  <td>{formatCurrency(line.gross_value)}</td>
                  <td><button type="button" className="ghost-btn" onClick={() => setLines((current) => current.length > 1 ? current.filter((_, lineIndex) => lineIndex !== index) : [blankLine])}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="invoice-total-strip">
          <span>Qty <strong>{totals.quantity}</strong></span>
          <span>Taxable <strong>{formatCurrency(totals.taxable)}</strong></span>
          <span>CGST <strong>{formatCurrency(totals.cgst)}</strong></span>
          <span>SGST <strong>{formatCurrency(totals.sgst)}</strong></span>
          <span>IGST <strong>{formatCurrency(totals.igst)}</strong></span>
          <span>Gross <strong>{formatCurrency(totals.gross)}</strong></span>
        </div>
        <div className="billing-actions">
          <label className="checkbox-field billing-excess-check">
            <input type="checkbox" checked={allowExcessBilling} onChange={(event) => setAllowExcessBilling(event.target.checked)} />
            <span>Authorize excess billing for this invoice</span>
          </label>
          <button type="button" className="ghost-btn" onClick={() => setLines((current) => [...current, blankLine])}>Add Line</button>
          <button type="button" className="ghost-btn" onClick={resetForm}>New Invoice</button>
          <button className="primary-btn" disabled={invoiceLocked}>{invoiceLocked ? "Locked" : editing ? "Update Invoice" : "Save Invoice"}</button>
        </div>
      </form>

      {rowEditor && rowEditorCalculated && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="help-dialog billing-row-editor"
            role="dialog"
            aria-modal="true"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setRowEditor(null);
              }
              if (event.ctrlKey && event.key.toLowerCase() === "s") {
                event.preventDefault();
                saveRowEditor();
              }
            }}
          >
            <div className="panel-head">
              <div>
                <h2>Invoice Row Editor</h2>
                <p>Large entry view for the selected billing line.</p>
              </div>
              <button type="button" className="ghost-btn" onClick={() => setRowEditor(null)}>Close</button>
            </div>
            <div className="row-editor-grid">
              <SmartEntityPicker
                entityType="item"
                api={api}
                role={role}
                companyId={companyContext?.company_id}
                value={rowEditor.form.item_id || ""}
                onChange={(value) => updateRowEditorLine({ item_id: value })}
                onQuickCreate={() => openQuickItem(rowEditor.index)}
              />
              <Field name="description" label="Description" type="text" value={rowEditor.form.description || ""} onChange={(value) => updateRowEditorLine({ description: value })} />
              {rowEditor.form.item_id
                ? <ReadOnlyBox label="HSN" value={rowEditor.form.hsn || "-"} />
                : <Field name="hsn" label="HSN" type="text" value={rowEditor.form.hsn || ""} onChange={(value) => updateRowEditorLine({ hsn: value })} />}
              <Field name="quantity" label="Qty" type="number" value={rowEditor.form.quantity} onChange={(value) => updateRowEditorLine({ quantity: value })} />
              <Field name="unit" label="Unit" type="text" value={rowEditor.form.unit || ""} onChange={(value) => updateRowEditorLine({ unit: value })} />
              <Field name="billing_rate" label="Rate" type="number" value={rowEditor.form.billing_rate} onChange={(value) => updateRowEditorLine({ billing_rate: value })} />
              <Field name="gst_rate" label="GST %" type="number" value={rowEditor.form.gst_rate} onChange={(value) => updateRowEditorLine({ gst_rate: value })} />
              <ReadOnlyBox label="Taxable" value={formatCurrency(rowEditorCalculated.taxable_value)} />
              <ReadOnlyBox label="CGST" value={formatCurrency(rowEditorCalculated.cgst)} />
              <ReadOnlyBox label="SGST" value={formatCurrency(rowEditorCalculated.sgst)} />
              <ReadOnlyBox label="IGST" value={formatCurrency(rowEditorCalculated.igst)} />
              <ReadOnlyBox label="Gross" value={formatCurrency(rowEditorCalculated.gross_value)} />
            </div>
            <div className="button-row">
              <button type="button" className="ghost-btn" onClick={() => setRowEditor(null)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={saveRowEditor}>Save Row</button>
            </div>
          </section>
        </div>
      )}

      {quickItem && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="help-dialog quick-item-dialog"
            role="dialog"
            aria-modal="true"
            onKeyDown={async (event) => {
              if (event.ctrlKey && event.key.toLowerCase() === "s") {
                event.preventDefault();
                await saveQuickItem(false);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                const hasQuickChanges = formChanged(quickItem.form, {
                  item_name: "",
                  hsn_code: "",
                  gst_rate: "",
                  unit: "Nos",
                  brand: "",
                  model: "",
                  category: "",
                  description: "",
                  inventory_enabled: 1,
                  track_serial_number: 0,
                  minimum_stock_level: "",
                  default_warehouse_id: "",
                  status: "active"
                });
                if (!hasQuickChanges) {
                  setQuickItem(null);
                  return;
                }
                const confirmed = await confirmAction({
                  title: "Unsaved Item",
                  message: "You have unsaved item details. Do you want to exit without saving?",
                  confirmLabel: "Yes, Exit",
                  cancelLabel: "No, Stay",
                  mode: "warning"
                });
                if (confirmed.confirmed) setQuickItem(null);
              }
            }}
          >
            <div className="panel-head">
              <div>
                <h2>Quick Create Item</h2>
                <p>Create a missing billing item without leaving the invoice.</p>
              </div>
              <button type="button" className="ghost-btn" onClick={() => setQuickItem(null)}>Close</button>
            </div>
            <div className="quick-item-grid">
              <Field name="item_name" label="Item Name" type="text" value={quickItem.form.item_name} onChange={(value) => setQuickItem({ ...quickItem, form: { ...quickItem.form, item_name: value } })} />
              <Field name="hsn_code" label="HSN Code" type="text" value={quickItem.form.hsn_code} onChange={(value) => setQuickItem({ ...quickItem, form: { ...quickItem.form, hsn_code: value } })} />
              <Field name="gst_rate" label="GST Rate" type="number" value={quickItem.form.gst_rate} onChange={(value) => setQuickItem({ ...quickItem, form: { ...quickItem.form, gst_rate: value } })} />
              <Field name="unit" label="Unit" type="text" value={quickItem.form.unit} onChange={(value) => setQuickItem({ ...quickItem, form: { ...quickItem.form, unit: value } })} />
              <Field name="brand" label="Brand" type="select" value={quickItem.form.brand} onChange={(value) => setQuickItem({ ...quickItem, form: { ...quickItem.form, brand: value } })} options={[...new Set((refs.items || []).map((i) => i.brand).filter(Boolean))]} />
              <Field name="model" label="Model" type="text" value={quickItem.form.model} onChange={(value) => setQuickItem({ ...quickItem, form: { ...quickItem.form, model: value } })} />
              <Field name="category" label="Category" type="text" value={quickItem.form.category} onChange={(value) => setQuickItem({ ...quickItem, form: { ...quickItem.form, category: value } })} />
              <Field name="description" label="Description" type="textarea" value={quickItem.form.description} onChange={(value) => setQuickItem({ ...quickItem, form: { ...quickItem.form, description: value } })} />
              <label className="field checkbox-field">
                <input type="checkbox" checked={Boolean(quickItem.form.inventory_enabled)} onChange={(event) => setQuickItem({ ...quickItem, form: { ...quickItem.form, inventory_enabled: event.target.checked ? 1 : 0 } })} />
                <span>Inventory Enabled</span>
              </label>
              <label className="field checkbox-field">
                <input type="checkbox" checked={Boolean(quickItem.form.track_serial_number)} onChange={(event) => setQuickItem({ ...quickItem, form: { ...quickItem.form, track_serial_number: event.target.checked ? 1 : 0 } })} />
                <span>Track Serial Number</span>
              </label>
              <Field name="minimum_stock_level" label="Minimum Stock Level" type="number" value={quickItem.form.minimum_stock_level} onChange={(value) => setQuickItem({ ...quickItem, form: { ...quickItem.form, minimum_stock_level: value } })} />
              <SelectBox label="Default Warehouse" value={quickItem.form.default_warehouse_id} onChange={(value) => setQuickItem({ ...quickItem, form: { ...quickItem.form, default_warehouse_id: value } })} options={(refs.warehouses || []).map((row) => [row.id, row.warehouse_name])} />
            </div>
            {duplicateItemPrompt && (
              <div className="duplicate-item-warning">
                <strong>Similar item already exists.</strong>
                <span>{duplicateItemPrompt.item_name} {duplicateItemPrompt.brand || ""} {duplicateItemPrompt.model || ""} / HSN {duplicateItemPrompt.hsn_code || "-"}</span>
                <div className="button-row">
                  <button type="button" className="primary-btn" onClick={() => useQuickExistingItem(duplicateItemPrompt)}>Use Existing</button>
                  <button type="button" className="ghost-btn" onClick={() => saveQuickItem(true)}>Create Anyway</button>
                  <button type="button" className="ghost-btn" onClick={() => setDuplicateItemPrompt(null)}>Cancel</button>
                </div>
              </div>
            )}
            <div className="button-row">
              <button type="button" className="ghost-btn" onClick={() => setQuickItem(null)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={() => saveQuickItem(false)}>Save Item</button>
            </div>
          </section>
        </div>
      )}
      {quickCreate && (
        <QuickCreateMasterDialog
          request={quickCreate}
          records={quickCreateRecords(quickCreate.type, { references: refs, institutionOptions })}
          context={{ company_id: selectedCompanyId, source_module: "billing" }}
          role={role}
          notify={notify}
          onClose={() => setQuickCreate(null)}
          onCreated={handleQuickCreated}
        />
      )}

      {!gridExpanded && <aside className="billing-side">
        <section id="billing-posting-control" className="panel billing-control-panel">
          <h2>GST Invoice Finalization</h2>
          <div className="workflow-note" style={{ marginBottom: 10 }}>
            <strong>{lifecycleStage(selectedInvoice || editing || {})}</strong>
            <span>{
              selectedInvoice?.posting_status === "Posted" && lifecycleStage(selectedInvoice).includes("Paid") ? "Invoice is posted and fully paid. Ready for closure."
              : selectedInvoice?.posting_status === "Posted" ? "Invoice is posted to books. Ready for receivable tracking."
              : selectedInvoice?.posting_status === "Reversed" ? "Invoice has been reversed. No further actions apply."
              : selectedInvoice?.posting_status === "Error" ? "Posting encountered an error. Review and retry."
              : selectedInvoice?.invoice_status === "Approved" ? "Approved and awaiting posting."
              : selectedInvoice?.invoice_status === "Pending Approval" ? "Pending approval before posting."
              : "Invoice is in draft state. Complete item details and post."
            }</span>
            <small>{
              lifecycleStage(selectedInvoice || editing || {}).includes("Paid") ? "Next: Invoice is fully paid and ready for archival."
              : selectedInvoice?.posting_status === "Posted" ? "Next: Track receivable and receipt allocation."
              : selectedInvoice?.posting_status === "Reversed" ? "Next: Create a corrected invoice if needed."
              : selectedInvoice?.posting_status === "Error" ? "Next: Review error details and repost."
              : selectedInvoice?.invoice_status === "Approved" ? "Next: Post the invoice to create the sales voucher."
              : selectedInvoice?.invoice_status === "Pending Approval" ? "Next: Approve from the approval queue or update status."
              : "Next: Add invoice line items and save before posting."
            }</small>
          </div>
          <ReadOnlyBox label="Voucher Number" value={selectedInvoice?.voucher_number || "-"} />
          <ReadOnlyBox label="Lifecycle Stage" value={lifecycleStage(selectedInvoice || editing || {})} />
          <ReadOnlyBox label="Invoice Status" value={selectedInvoice?.invoice_status || editing?.invoice_status || "Draft"} />
          <ReadOnlyBox label="Posting Status" value={selectedInvoice?.posting_status || editing?.posting_status || "Draft"} />
          <ReadOnlyBox label="Posting Date" value={selectedInvoice?.posted_at || selectedInvoice?.voucher_date || "-"} />
          <ReadOnlyBox label="Posted By" value={selectedInvoice?.posted_by || "-"} />
          <div className="button-row">
            <button type="button" className="primary-btn" onClick={() => postInvoice("post")} disabled={!editing || selectedInvoice?.posting_status === "Posted"}>Post</button>
            <button type="button" className="ghost-btn" onClick={() => postInvoice("repost")} disabled={!editing || selectedInvoice?.posting_status !== "Posted"}>Repost</button>
            <button type="button" className="ghost-btn danger" onClick={() => postInvoice("reverse")} disabled={!editing || !selectedInvoice?.voucher_id}>Reverse</button>
          </div>
        </section>

        <section id="billing-order-validation" className="panel warning-panel">
          <h2>Billing vs Order</h2>
          <MetricLine label="Ordered Quantity" value={orderValidation.orderedQuantity || "-"} />
          <MetricLine label="Procured Quantity" value={formatNumber(orderProcuredQuantity(data, header.order_id)) || "-"} />
          <MetricLine label="Issued Quantity" value={formatNumber(orderIssuedQuantity(data, header.order_id)) || "-"} />
          <MetricLine label="Billed Quantity" value={orderValidation.billedQuantity} />
          <MetricLine label="Balance (Order - Billed)" value={orderValidation.balanceQuantity || "-"} />
          {orderValidation.messages.length ? orderValidation.messages.map((message) => <span className="warning-line" key={message}>{message}</span>) : <span className="ok-line">No duplicate or excess billing warning.</span>}
        </section>

        <section id="billing-readiness" className="panel compact-summary">
          <h2>Billing Readiness</h2>
          {editing || selectedInvoice ? <>
            <span className={`timeline-row ${orderProcuredQuantity(data, header.order_id) > 0 ? "done" : "pending"}`}>
              <span>Items Procured</span>
              <small>{orderProcuredQuantity(data, header.order_id) > 0 ? `${formatNumber(orderProcuredQuantity(data, header.order_id))} units` : "Not procured"}</small>
              {orderProcuredQuantity(data, header.order_id) > 0 ? <span className="timeline-check">&#10003;</span> : <span className="timeline-blocked">&#9888;</span>}
            </span>
            <span className={`timeline-row ${orderIssuedQuantity(data, header.order_id) > 0 ? "done" : "pending"}`}>
              <span>Items Issued (DC)</span>
              <small>{orderIssuedQuantity(data, header.order_id) > 0 ? `${formatNumber(orderIssuedQuantity(data, header.order_id))} units` : "Not issued"}</small>
              {orderIssuedQuantity(data, header.order_id) > 0 ? <span className="timeline-check">&#10003;</span> : <span className="timeline-blocked">&#9888;</span>}
            </span>
            <span className={`timeline-row ${documents.some((doc) => doc.document_type === "CRAC") ? "done" : "pending"}`}>
              <span>CRAC Completed</span>
              <small>{documents.some((doc) => doc.document_type === "CRAC") ? "Attached" : "Pending"}</small>
              {documents.some((doc) => doc.document_type === "CRAC") ? <span className="timeline-check">&#10003;</span> : <span className="timeline-blocked">&#9888;</span>}
            </span>
            <span className={`timeline-row ${documents.some((doc) => doc.document_type === "Supply Order") ? "done" : "pending"}`}>
              <span>Supply Order Attached</span>
              <small>{documents.some((doc) => doc.document_type === "Supply Order") ? "Attached" : "Pending"}</small>
              {documents.some((doc) => doc.document_type === "Supply Order") ? <span className="timeline-check">&#10003;</span> : <span className="timeline-blocked">&#9888;</span>}
            </span>
          </> : <small>Select or edit an invoice to see readiness status.</small>}
        </section>

        <section id="billing-receivable-summary" className="panel compact-summary">
          <h2>Receivable Summary</h2>
          <MetricLine label="Invoice Value" value={formatCurrency(selectedInvoice?.invoice_value || totals.gross)} />
          <MetricLine label="Amount Received" value={formatCurrency(selectedInvoice?.amount_received || 0)} />
          <MetricLine label="Advance Adjusted" value={formatCurrency(selectedInvoice?.advance_adjusted || 0)} />
          <MetricLine label="TDS Deducted" value={formatCurrency(selectedInvoice?.tds_deducted || 0)} />
          <MetricLine label="GST TDS Deducted" value={formatCurrency(selectedInvoice?.gst_tds_deducted || 0)} />
          <MetricLine label="Outstanding" value={formatCurrency(selectedInvoice?.balance_outstanding || totals.gross)} />
          {(editing?.id) ? <div className="document-checklist compact-allocations">
            {(data?.paymentAllocations || []).filter((pa) => Number(pa.billing_id) === Number(editing.id)).length > 0 ?
              (data?.paymentAllocations || []).filter((pa) => Number(pa.billing_id) === Number(editing.id)).map((pa) => (
                <span className={`timeline-row ${Number(pa.allocated_amount) > 0 ? "done" : "pending"}`} key={pa.id}>
                  <span>{pa.utr_number || `Allocation #${pa.id}`}</span>
                  <small>{formatCurrency(pa.allocated_amount)} {pa.tds_deducted > 0 ? `TDS ${formatCurrency(pa.tds_deducted)}` : ""} {pa.gst_tds_deducted > 0 ? `GST TDS ${formatCurrency(pa.gst_tds_deducted)}` : ""}</small>
                </span>
              )) : <small>No payment allocations yet.</small>}
          </div> : null}
        </section>

        <section id="billing-profitability-preview" className="panel compact-summary">
          <h2>Profitability Preview</h2>
          <MetricLine label="Purchase Cost" value={formatCurrency(profitability.purchaseValue)} />
          <MetricLine label="Billing Value" value={formatCurrency(totals.taxable || profitability.billingValue)} />
          <MetricLine label="Gross Margin" value={formatCurrency(profitability.grossMargin)} />
          <MetricLine label="Estimated GST Impact" value={formatCurrency(profitability.gstImpact)} />
          <MetricLine label="Estimated Expenses" value={formatCurrency(profitability.expenses)} />
          <MetricLine label="Expected Profit" value={formatCurrency(profitability.expectedProfit)} />
          <MetricLine label="ROI" value={`${formatNumber(profitability.roi)}%`} />
        </section>

        <section id="billing-gst-summary" className="panel compact-summary">
          <h2>GST Summary</h2>
          <MetricLine label="GST Type" value={header.gst_type || "-"} />
          <MetricLine label="Max GST Rate" value={`${maxLineGstRate(calculatedLines)}%`} />
          <MetricLine label="Total Taxable" value={formatCurrency(totals.taxable)} />
          <MetricLine label="CGST" value={formatCurrency(totals.cgst)} />
          <MetricLine label="SGST" value={formatCurrency(totals.sgst)} />
          <MetricLine label="IGST" value={formatCurrency(totals.igst)} />
          <MetricLine label="Total GST" value={formatCurrency(totals.gst)} />
          <MetricLine label="Gross Invoice Value" value={formatCurrency(totals.gross)} />
        </section>

        <section id="billing-documents" className="panel compact-summary">
          <h2>Documents</h2>
          <div className="document-checklist">
            {requiredBillingDocuments.map((type) => {
              const found = documents.some((doc) => doc.document_type === type);
              return <span className={found ? "done" : ""} key={type}>{type}<small>{found ? "Attached" : "Pending"}</small></span>;
            })}
            <div className="checklist-readiness">
              {requiredBillingDocuments.every((type) => documents.some((doc) => doc.document_type === type))
                ? <span className="ok-line">All required documents attached — ready for billing.</span>
                : <span className="warning-line">Complete missing documents before finalizing billing.</span>}
            </div>
          </div>
          <form className="mini-upload" onSubmit={uploadAttachment}>
            <select value={uploadForm.document_type} onChange={(event) => setUploadForm({ ...uploadForm, document_type: event.target.value })}>
              {["Supply Order", "Delivery Challan", "Installation Report", "OEM Authorization", "CRAC", "Invoice Copy"].map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <input name="billing_document" type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.csv" />
            <input placeholder="Remarks" value={uploadForm.remarks} onChange={(event) => setUploadForm({ ...uploadForm, remarks: event.target.value })} />
            <button className="ghost-btn">Attach</button>
          </form>
          {documents.length ? documents.map((doc) => (
            <span className="document-chip" key={doc.id}>
              {doc.document_type}: <button className="ghost-btn small-btn" type="button" onClick={() => api.viewDocument(doc.id).catch((e) => notify(e.message, "error"))}>{doc.original_file_name}</button>
            </span>
          )) : <small>No invoice attachments yet.</small>}
        </section>

        <section id="billing-lifecycle" className="panel compact-summary">
          <h2>Invoice Lifecycle</h2>
          {invoiceTimeline(selectedInvoice).map((item) => (
            <span className={`timeline-row ${item.done ? "done" : "pending"}`} key={item.label}>
              <span>{item.label}</span>
              <small>{item.value}</small>
              {item.done ? <span className="timeline-check">&#10003;</span> : item.blocked ? <span className="timeline-blocked">&#9888;</span> : null}
            </span>
          ))}
        </section>

        <section id="billing-corrections" className="panel compact-summary">
          <h2>Correction Workflow</h2>
          {editing ? <>
            {selectedInvoice?.invoice_type === "Credit Note" ? <span className="timeline-row done"><span>Credit Note</span><small>This invoice is a credit note</small></span> : null}
            {selectedInvoice?.invoice_type === "Debit Note" ? <span className="timeline-row done"><span>Debit Note</span><small>This invoice is a debit note</small></span> : null}
            {selectedInvoice?.posting_status === "Reversed" ? <span className="timeline-row done"><span>Reversed</span><small>This invoice has been reversed</small></span> : null}
            {selectedInvoice?.posting_status !== "Reversed" && selectedInvoice?.invoice_type !== "Credit Note" && selectedInvoice?.invoice_type !== "Debit Note" ? <>
              <span className="timeline-row pending"><span>Credit Note</span><small>Available for posted invoices</small></span>
              <span className="timeline-row pending"><span>Debit Note</span><small>Available for posted invoices</small></span>
            </> : null}
          </> : <small>Select an invoice to see correction options.</small>}
        </section>

        <section id="billing-einvoice" className="panel compact-summary">
          <h2>E-Invoice / E-Way Bill</h2>
          <span className="timeline-row pending">
            <span>E-Invoice</span>
            <small>Not configured</small>
            <span className="timeline-blocked">&#9888;</span>
          </span>
          <span className="timeline-row pending">
            <span>E-Way Bill</span>
            <small>Not configured</small>
            <span className="timeline-blocked">&#9888;</span>
          </span>
          <small style={{ display: "block", marginTop: 8, color: "#888" }}>E-invoice and e-way bill require separate portal integration and are not part of this phase.</small>
        </section>
      </aside>}

      <section id="billing-invoice-list" className="panel billing-list">
        <div className="panel-head">
          <div>
            <h2>Invoices</h2>
            <p>{data?.invoices?.length || 0} invoice(s)</p>
          </div>
        </div>
        {loading ? <EmptyState title="Loading billing records" /> : data?.invoices?.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Invoice</th><th>Order</th><th>Department</th><th>Taxable</th><th>Status</th><th>Voucher</th><th>Drill Down</th><th></th></tr></thead>
              <tbody>
                {data.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td><strong>{invoice.invoice_number}</strong><small>{invoice.invoice_date}</small></td>
                    <td>{invoice.order_number}</td>
                    <td>{invoice.department_name}</td>
                    <td>{formatCurrency(invoice.billing_value)}</td>
                    <td>
                      <span className={`status ${normalizeStatusClass(lifecycleStage(invoice))}`}>{lifecycleStage(invoice)}</span>
                      {lifecycleStage(invoice) !== (invoice.posting_status || invoice.invoice_status) && !lifecycleStage(invoice).includes("Paid") ? <small className="status-sub">{invoice.invoice_status}</small> : null}
                    </td>
                    <td>{invoice.voucher_number || "-"}</td>
                    <td><span className="drill-path"><button type="button" className="ghost-btn small-btn" title="View invoice" onClick={() => editInvoice(invoice)}>Invoice</button> / {invoice.voucher_id ? <button type="button" className="ghost-btn small-btn" title="View voucher" onClick={() => onNavigate?.("voucher_register", { recordId: invoice.voucher_id })}>Voucher</button> : <span>Voucher</span>} / {invoice.voucher_id ? <button type="button" className="ghost-btn small-btn" title="View ledger" onClick={() => onNavigate?.("ledger_view", { recordId: invoice.voucher_id })}>Ledger</button> : <span>Ledger</span>} / Receivable / Allocation / Payment</span></td>
                    <td><button type="button" className="ghost-btn" onClick={() => editInvoice(invoice)}>{isRecordLocked(invoice) ? "View" : "Open"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No invoices found" note="Create the first government supply invoice from the billing voucher form." />}
      </section>
    </section>
  );
}

export { BillingVoucherScreen };
