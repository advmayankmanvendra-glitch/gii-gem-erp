import { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatNumber } from "../../utils/formatters.js";
import { formChanged, useUnsavedChanges } from "../../utils/formUtils.js";
import { scrollToSection } from "../../utils/navigationScroll.js";
import { buildActionErrorGuidance } from "../../utils/errorGuidance.js";
import { blankSupplyOrderItem, buildSupplyOrderValidationErrors, focusValidationTarget, nextSupplyOrderNumber, normalizedSupplyOrderItems, supplyOrderItemsFromRecord, validateSupplyOrderItems } from "../../features/operations/supplyOrders/index.jsx";
import { SupplyOrderEntryForm, SupplyOrderItemsGrid } from "../../features/operations/supplyOrders/index.jsx";
import { SupplyOrderFieldSection, SupplyOrderSummaryCard } from "../../components/panels/SmallComponents.jsx";
import { SupplyOrderRecordsPanel } from "../../features/operations/supplyOrders/SupplyOrderRecordsPanel.jsx";
import { validateStockAdjustmentDraft } from "../../features/inventory/StockAdjustmentControlPanel.jsx";
import { StockAdjustmentControlPanel } from "../../features/inventory/StockAdjustmentControlPanel.jsx";
import { AddRecordPanel } from "../../components/panels/AddRecordPanel.jsx";
import { PhasePanel } from "../../components/panels/SmallComponents.jsx";
import { EmptyState, Icon } from "../../components/common.jsx";
import { confirmAction, postedProtectionOptions, deleteConfirmOptions, postConfirmOptions, approveConfirmOptions, isRecordLocked } from "../../utils/actionUtils.js";

import { SmartEntityPicker } from "../../components/entityPicker/SmartEntityPicker.jsx";

function defaultValueFor(type) {
  if (type === "date") return new Date().toISOString().slice(0, 10);
  if (type === "number") return 0;
  if (type === "supply_type") return "GeM";
  if (type === "calculation") return "percentage_gross";
  if (type === "order_status") return "Received";
  if (type === "invoice_type") return "Tax Invoice";
  if (type === "payment_mode") return "NEFT";
  if (type === "procurement_status") return "Draft";
  if (type === "payment_status") return "Unpaid";
  if (type === "allocation_status") return "Unallocated";
  if (type === "adjustment_type") return "Increase";
  if (type === "return_type") return "Department";
  if (type === "condition_status") return "Good";
  if (type === "checkbox") return 0;
  if (type === "lead_source") return "new";
  if (type === "lead_status") return "new";
  if (type === "query_priority") return "medium";
  if (type === "query_status") return "open";
  if (type === "quotation_status") return "draft";
  if (type === "negotiation_status") return "open";
  if (type === "installation_status") return "pending";
  if (type === "purchase_order_status") return "draft";
  if (type === "plan_priority") return "medium";
  if (type === "procurement_plan_status") return "draft";
  if (type === "computed_number") return 0;
  return "";
}

function validateTransaction(config, form) {
  const requiredNames = config.required || config.fields.filter(([, , type]) => !["textarea"].includes(type)).slice(0, 4).map(([name]) => name);
  requiredNames.forEach((name) => {
    const label = config.fields.find(([fieldName]) => fieldName === name)?.[1] || name.replaceAll("_", " ");
    if (!String(form[name] ?? "").trim()) throw new Error(`${label} is required`);
  });
  Object.entries(form).forEach(([key, value]) => {
    if ((key.includes("value") || key.includes("amount") || key.includes("gst") || key.includes("freight") || key.includes("charges") || key.includes("percentage")) && Number(value || 0) < 0) {
      throw new Error("Amount and percentage fields cannot be negative");
    }
  });
}

function orderLabel(id, refs) {
  const order = refs?.orders?.find((row) => String(row.id) === String(id));
  return order ? order.order_number : "";
}

function transactionPrimary(record, config) {
  if (config.primary === "remarks") return record.remarks || `Entry #${record.id}`;
  return record[config.primary] || record.order_number || `Entry #${record.id}`;
}

function transactionAmount(record) {
  const value = record.computed_order_gross_value ?? record.order_gross_value ?? record.billing_value ?? record.payment_amount ?? record.purchase_value ?? record.expense_amount ?? record.fixed_amount ?? record.grand_total ?? record.negotiated_amount ?? record.total_value ?? record.estimated_value ?? record.expected_value ?? "";
  return value === "" ? "-" : formatCurrency(Number(value || 0));
}

function transactionDate(record) {
  return record.order_date || record.purchase_date || record.invoice_date || record.payment_date || record.lead_date || record.bid_submission_date || record.quotation_date || record.negotiation_date || record.po_date || record.plan_date || record.installation_date || "-";
}

function transactionStatus(record) {
  return record.posting_status || record.status || record.order_status || "Draft";
}

function TransactionField({ name, label, type, value, references, onChange, error, api, companyId, role }) {
  const fieldClass = `field ${error ? "field-error" : ""}`;
  const errorNote = error ? <small className="field-error-note">{error}</small> : null;
  const selectField = (options, fallback = "") => (
    <label className={fieldClass} data-field-name={name}>
      {label}
      <select value={value || fallback} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => {
          const valueLabel = Array.isArray(option) ? option : [option, option];
          return <option key={valueLabel[0]} value={valueLabel[0]}>{valueLabel[1]}</option>;
        })}
      </select>
      {errorNote}
    </label>
  );
  const entityTypeMap = { order: "supply_order", department: "department", employee: "employee", supplier: "supplier", bank: "bank", expense_head: "expense_head", item: "item", warehouse: "warehouse" };
  if (entityTypeMap[type]) {
    return (
      <SmartEntityPicker
        entityType={entityTypeMap[type]}
        api={api}
        role={role}
        companyId={companyId}
        value={value || ""}
        onChange={onChange}
      />
    );
  }
  if (type === "order_status") {
    return selectField(["Draft", "Received", "Procurement Pending", "Procurement Completed", "Supply Pending", "Supplied", "Bill Raised", "Payment Pending", "Partially Received", "Fully Received", "Closed"], "Received");
  }
  if (type === "supply_type") {
    return selectField(["GeM", "eProc", "Manual", "Other"], "GeM");
  }
  if (type === "invoice_type") {
    return selectField(["Tax Invoice", "Revised Invoice", "Credit Note", "Debit Note"], "Tax Invoice");
  }
  if (type === "payment_mode") {
    return selectField(["Cash", "NEFT", "RTGS", "IMPS", "UPI", "Cheque", "Other"], "NEFT");
  }
  if (type === "procurement_status") {
    return selectField(["Draft", "Pending Receipt", "GRN Pending", "Partially Received", "Fully Received", "Posted"], "Draft");
  }
  if (type === "payment_status") {
    return selectField(["Paid", "Unpaid", "Partially Paid"], "Unpaid");
  }
  if (type === "allocation_status") {
    return selectField(["Unallocated", "Partially Allocated", "Allocated", "Advance"], "Unallocated");
  }
  if (type === "adjustment_type") {
    return selectField(["Increase", "Decrease"], "Increase");
  }
  if (type === "return_type") {
    return selectField(["Department", "Supplier"], "Department");
  }
  if (type === "condition_status") {
    return selectField(["Good", "Defective", "Damaged", "Warranty Claim"], "Good");
  }
  if (type === "lead_source") {
    return selectField(["new", "tender", "direct", "reference", "website"], "new");
  }
  if (type === "lead_status") {
    return selectField(["new", "submitted", "won", "lost", "closed"], "new");
  }
  if (type === "query_priority") {
    return selectField(["high", "medium", "low"], "medium");
  }
  if (type === "query_status") {
    return selectField(["open", "in_progress", "quoted", "resolved", "closed"], "open");
  }
  if (type === "quotation_status") {
    return selectField(["draft", "sent", "accepted", "rejected", "expired"], "draft");
  }
  if (type === "negotiation_status") {
    return selectField(["open", "completed", "failed"], "open");
  }
  if (type === "installation_status") {
    return selectField(["pending", "in_progress", "completed", "delayed", "cancelled"], "pending");
  }
  if (type === "purchase_order_status") {
    return selectField(["draft", "issued", "accepted", "converted", "cancelled"], "draft");
  }
  if (type === "plan_priority") {
    return selectField(["high", "medium", "low"], "medium");
  }
  if (type === "procurement_plan_status") {
    return selectField(["draft", "planned", "approved", "completed", "cancelled"], "draft");
  }
  if (type === "computed_number") {
    return (
      <label className={fieldClass} data-field-name={name}>
        {label}
        <input type="number" value={value || 0} readOnly aria-readonly="true" />
        {errorNote}
      </label>
    );
  }
  if (type === "textarea") {
    return (
      <label className={`${fieldClass} wide`} data-field-name={name}>
        {label}
        <textarea value={value || ""} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)} />
        {errorNote}
      </label>
    );
  }
  return (
    <label className={fieldClass} data-field-name={name}>
      {label}
      <input type={type} value={value || ""} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)} />
      {errorNote}
    </label>
  );
}

function TransactionScreen({ table, config, notify, companyContext, onNavigate, api, role }) {
  const blank = useMemo(() => Object.fromEntries(config.fields.map(([name,, type]) => [name, defaultValueFor(type)])), [config]);
  const [records, setRecords] = useState([]);
  const [references, setReferences] = useState(null);
  const [inventorySnapshot, setInventorySnapshot] = useState(null);
  const [filters, setFilters] = useState({ search: "", status: "all" });
  const [form, setForm] = useState(blank);
  const [orderItems, setOrderItems] = useState(() => [blankSupplyOrderItem()]);
  const [showSupplyOrderEntry, setShowSupplyOrderEntry] = useState(table === "supply_orders");
  const [validationErrors, setValidationErrors] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const isSupplyOrder = table === "supply_orders";
  const isStockTable = ["stock_inwards", "stock_outwards", "stock_adjustments", "stock_returns"].includes(table);
  const orderItemBaseline = editing ? supplyOrderItemsFromRecord(editing) : [blankSupplyOrderItem()];
  const formDirty = editing
    ? formChanged(form, Object.fromEntries(config.fields.map(([name,, type]) => [name, editing[name] ?? defaultValueFor(type)]))) || (isSupplyOrder && formChanged(orderItems, orderItemBaseline))
    : formChanged(form, blank) || (isSupplyOrder && formChanged(orderItems, [blankSupplyOrderItem()]));
  useUnsavedChanges(formDirty);

  async function load() {
    setLoading(true);
    try {
      const shouldLoadInventorySnapshot = ["stock_adjustments", "procurement_plans"].includes(table) && api.getInventoryData;
      const [rows, refs, inventory] = await Promise.all([
        api.listRecords(table, { ...filters, company_id: companyContext?.company_id }),
        api.getReferences(companyContext),
        shouldLoadInventorySnapshot ? api.getInventoryData(companyContext) : Promise.resolve(null)
      ]);
      setRecords(rows);
      setReferences(refs);
      setInventorySnapshot(inventory);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [table, filters.search, companyContext?.company_id]);

  useEffect(() => {
    setShowSupplyOrderEntry(table === "supply_orders");
    setInventorySnapshot(null);
    setValidationErrors([]);
  }, [table]);

  useEffect(() => {
    if (table !== "procurement_plans" || !inventorySnapshot) return;
    const stock = (inventorySnapshot.stockSummary || []).find((row) =>
      Number(row.item_id || row.id) === Number(form.item_id) && Number(row.warehouse_id) === Number(form.warehouse_id)
    );
    const availableStock = Math.max(0, Number(stock?.closing_quantity || 0));
    const shortQuantity = Math.max(0, Number(form.required_quantity || 0) - availableStock);
    const estimatedValue = Number(form.planned_quantity || 0) * Number(form.expected_rate || 0);
    if (Number(form.available_stock || 0) === availableStock
      && Number(form.short_quantity || 0) === shortQuantity
      && Number(form.estimated_value || 0) === estimatedValue) return;
    setForm((current) => ({
      ...current,
      available_stock: availableStock,
      short_quantity: shortQuantity,
      estimated_value: estimatedValue
    }));
  }, [table, inventorySnapshot, form.item_id, form.warehouse_id, form.required_quantity, form.planned_quantity, form.expected_rate]);

  useEffect(() => {
    const prefillId = window.__giiGemPrefillRecordId;
    if (prefillId && records.length && !editing) {
      const record = records.find((r) => String(r.id) === String(prefillId));
      if (record) {
        setEditing(record);
        setForm(record);
        if (table === "supply_orders") {
          setOrderItems(supplyOrderItemsFromRecord(record));
          setShowSupplyOrderEntry(true);
        }
        window.__giiGemPrefillRecordId = null;
      }
    }
  }, [records, editing, table]);

  useEffect(() => {
    if (!isSupplyOrder || !references || editing) return;
    setForm((current) => {
      if (String(current.order_number || "").trim()) return current;
      return { ...current, order_number: nextSupplyOrderNumber(references.orders || records || []) };
    });
  }, [isSupplyOrder, references, editing, records]);

  useEffect(() => {
    function newRecord() {
      setEditing(null);
      setForm(blank);
      setOrderItems([blankSupplyOrderItem()]);
      setValidationErrors([]);
      if (table === "supply_orders") setShowSupplyOrderEntry(true);
    }
    window.addEventListener("gii-gem-new-record", newRecord);
    window.addEventListener("gii-gem-refresh-screen", load);
    return () => {
      window.removeEventListener("gii-gem-new-record", newRecord);
      window.removeEventListener("gii-gem-refresh-screen", load);
    };
  }, [blank, table, filters.search, companyContext?.company_id]);

  async function submit(event) {
    event.preventDefault();
    try {
      setValidationErrors([]);
      const uiErrors = isSupplyOrder ? buildSupplyOrderValidationErrors(config, form, orderItems, references, companyContext) : [];
      if (uiErrors.length) {
        setValidationErrors(uiErrors);
        window.setTimeout(() => focusValidationTarget(uiErrors[0]), 40);
        notify(`${uiErrors.length} validation issue${uiErrors.length === 1 ? "" : "s"} found. Start with ${uiErrors[0].section}: ${uiErrors[0].message}`, "error");
        return;
      }
      if (isSupplyOrder) {
        validateSupplyOrderItems(form, orderItems, references);
      } else {
        if (table === "stock_adjustments") validateStockAdjustmentDraft(form, inventorySnapshot);
        validateTransaction(config, form);
      }
      if (!companyContext?.company_id) throw new Error("Select Current Company before saving this transaction.");
      const payload = {
        ...form,
        company_id: companyContext.company_id,
        ...(isSupplyOrder ? { order_items: normalizedSupplyOrderItems(orderItems, references) } : {})
      };
      if (editing) {
        if (editing.company_id && String(editing.company_id) !== String(companyContext.company_id)) throw new Error("Selected company does not match this record. Switch company before editing.");
        await api.updateRecord(table, editing.id, payload);
        notify(`${config.title} updated`);
      } else {
        await api.createRecord(table, payload);
        notify(`${config.title} saved`);
      }
      setForm(blank);
      setOrderItems([blankSupplyOrderItem()]);
      setEditing(null);
      setValidationErrors([]);
      await load();
      if (isSupplyOrder) setShowSupplyOrderEntry(false);
    } catch (error) {
      const guidance = buildActionErrorGuidance(error, { table, config });
      if (isSupplyOrder && guidance.errors?.length) {
        setValidationErrors(guidance.errors);
        window.setTimeout(() => focusValidationTarget(guidance.errors[0]), 40);
      }
      notify(guidance.toast, "error");
    }
  }

  async function remove(record) {
    if (isRecordLocked(record)) {
      await confirmAction(postedProtectionOptions(table, record.id));
      return;
    }
    const confirmed = await confirmAction(deleteConfirmOptions(table, record.id));
    if (!confirmed.confirmed) return;
    try {
      await api.deleteRecord(table, record.id);
      notify("Record deleted");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  function edit(record) {
    setEditing(record);
    setForm(Object.fromEntries(config.fields.map(([name,, type]) => [name, record[name] ?? defaultValueFor(type)])));
    setOrderItems(isSupplyOrder ? supplyOrderItemsFromRecord(record) : [blankSupplyOrderItem()]);
    setValidationErrors([]);
    if (isSupplyOrder) setShowSupplyOrderEntry(true);
    scrollToSection(isSupplyOrder ? "#supply-order-entry-form" : "#transaction-entry-form");
  }

  async function postStockRecord(record) {
    const confirmed = await confirmAction({
      ...postConfirmOptions(table, record.id),
      message: "Do you want to proceed with this inventory action? Stock balances may be affected.",
      confirmLabel: "Yes, Proceed"
    });
    if (!confirmed.confirmed) return;
    try {
      if (table === "stock_inwards") await api.postStockInward(record.id);
      if (table === "stock_outwards") await api.postStockOutward(record.id);
      if (table === "stock_adjustments") await api.postStockAdjustment(record.id);
      if (table === "stock_returns") await api.postStockReturn(record.id);
      notify(`${config.title} posted`);
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function approveStockAdjustment(record) {
    const confirmed = await confirmAction({
      ...approveConfirmOptions("stock_adjustments", record.id),
      requireReason: true,
      reasonLabel: "Approval remarks",
      reasonPlaceholder: "Approved for stock correction"
    });
    if (!confirmed.confirmed) return;
    try {
      await api.approveStockAdjustment(record.id, null, confirmed.reason || "Approved for stock correction");
      notify("Stock adjustment approved");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function convertPurchaseOrder(record) {
    if (record.converted_to_work_order && record.work_order_id) {
      window.__giiGemPrefillRecordId = record.work_order_id;
      onNavigate?.("supply_orders");
      return;
    }
    const confirmed = await confirmAction({
      title: "Convert to Work Order",
      message: `Create a draft Work Order from Purchase Order ${record.po_number}? The Purchase Order will be locked after conversion.`,
      confirmLabel: "Convert",
      cancelLabel: "Cancel"
    });
    if (!confirmed.confirmed) return;
    try {
      const result = await api.convertPurchaseOrderToWorkOrder(record.id, { company_id: companyContext?.company_id });
      notify(`Work Order ${result.workOrder.order_number} created`);
      await load();
      window.__giiGemPrefillRecordId = result.workOrder.id;
      onNavigate?.("supply_orders");
    } catch (error) {
      notify(error.message, "error");
    }
  }

  if (isSupplyOrder) {
    return (
      <section className="supply-order-screen">
        <div className="panel supply-order-viewbar">
          <div>
            <h2>{showSupplyOrderEntry ? (editing ? "Edit Supply Order" : "New Supply Order") : "Supply Order List"}</h2>
            <span>{showSupplyOrderEntry ? "Capture order identity, item grid, buyer, delivery and commercial controls." : `${records.length} order record(s)`}</span>
          </div>
          <div className="button-row">
            {showSupplyOrderEntry ? (
              <button type="button" className="ghost-btn" onClick={() => { setEditing(null); setForm(blank); setOrderItems([blankSupplyOrderItem()]); setShowSupplyOrderEntry(false); scrollToSection("#supply-order-list-panel", false); }}>Back to List</button>
            ) : (
              <button type="button" className="primary-btn" onClick={() => { setEditing(null); setForm(blank); setOrderItems([blankSupplyOrderItem()]); setShowSupplyOrderEntry(true); scrollToSection("#supply-order-entry-form"); }}>New Supply Order</button>
            )}
          </div>
        </div>

        {showSupplyOrderEntry ? (
          <AddRecordPanel api={api} table={table} title={config.title} notify={notify} onImported={load} records={records}>
            <SupplyOrderEntryForm
              config={config}
              form={form}
              setForm={setForm}
              orderItems={orderItems}
              setOrderItems={setOrderItems}
              references={references}
              validationErrors={validationErrors}
              onFieldChange={(name, value) => {
                setForm({ ...form, [name]: value });
                setValidationErrors((current) => current.filter((error) => error.name !== name));
              }}
              editing={editing}
              onSubmit={submit}
              onClear={() => { setEditing(null); setForm(blank); setOrderItems([blankSupplyOrderItem()]); setValidationErrors([]); }}
              TransactionField={TransactionField}
              formatCurrency={formatCurrency}
              formatNumber={formatNumber}
              SupplyOrderFieldSection={SupplyOrderFieldSection}
              SupplyOrderSummaryCard={SupplyOrderSummaryCard}
            />
            <PhasePanel title="Order item lifecycle visibility" note="Saved order item rows feed procurement planning, reservation, billing and order lifecycle reports. Incomplete received/draft orders stay usable for follow-up." />
          </AddRecordPanel>
        ) : (
          <SupplyOrderRecordsPanel
            config={config}
            records={records}
            references={references}
            filters={filters}
            setFilters={setFilters}
            loading={loading}
            edit={edit}
            remove={remove}
            isRecordLocked={isRecordLocked}
            transactionPrimary={transactionPrimary}
            transactionAmount={transactionAmount}
          />
        )}
      </section>
    );
  }

  return (
    <section className="transaction-layout">
      <AddRecordPanel api={api} table={table} title={config.title} notify={notify} onImported={load} records={records}>
        <form id="transaction-entry-form" className="entry-form-inner" data-entry-form="true" onSubmit={submit}>
          <div className="panel-head">
            <h2>{editing ? "Edit Entry" : "Add Entry"}</h2>
            {editing && <button type="button" className="ghost-btn" onClick={() => { setEditing(null); setForm(blank); setOrderItems([blankSupplyOrderItem()]); }}>Clear</button>}
          </div>
          <div className="form-grid">
            {config.fields.map(([name, label, type]) => (
              <TransactionField
                key={name}
                name={name}
                label={label}
                type={type}
                value={form[name] ?? ""}
                references={references}
                onChange={(value) => setForm({ ...form, [name]: value })}
                api={api}
                companyId={companyContext?.company_id}
                role={role}
              />
            ))}
          </div>
          {table === "supply_orders" && (
            <SupplyOrderItemsGrid
              items={orderItems}
              setItems={setOrderItems}
              references={references}
              orderStatus={form.order_status}
              formatCurrency={formatCurrency}
              formatNumber={formatNumber}
            />
          )}
          {table === "stock_adjustments" && (
            <StockAdjustmentControlPanel
              form={form}
              references={references}
              inventoryData={inventorySnapshot}
              onReasonSelect={(reason) => setForm((current) => ({ ...current, reason }))}
              onOpenStockLedger={() => onNavigate?.("stock_ledger")}
            />
          )}
          <button className="primary-btn">{editing ? "Update" : "Save"}</button>
        </form>
        {table === "supply_orders" && <PhasePanel title="Order item lifecycle visibility" note="Saved order item rows feed procurement planning, reservation, billing and order lifecycle reports. Incomplete received/draft orders stay usable for follow-up." />}
        {table === "procurements" && <PhasePanel title="Procurement item grid visibility" note="Use Operations > Purchase Bills and GRN Status to review item-wise procurement, warehouse receipt and posting status." />}
        {table === "payments" && <PhasePanel title="Receipt allocation controls" note="Use Receipt Allocation for invoice-wise allocation, TDS, GST TDS and before/after outstanding reconciliation." />}
      </AddRecordPanel>

      <section className="panel records-panel">
        <div className="records-toolbar">
          <div>
            <h2>{config.title}</h2>
            <span>{records.length} record(s)</span>
          </div>
          <div className="toolbar-controls">
            <input data-search-input="true" placeholder="Search records" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
          </div>
        </div>
        {loading ? <EmptyState title="Loading records" /> : records.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Primary</th>
                  <th>Order</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Posting</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    {(() => {
                      const convertedPurchaseOrder = table === "purchase_orders" && Number(record.converted_to_work_order || 0) === 1;
                      const locked = isRecordLocked(record) || convertedPurchaseOrder;
                      return (
                        <>
                    <td><strong>{transactionPrimary(record, config)}</strong></td>
                    <td>{table === "supply_orders" ? `${record.order_item_count || 0} item(s)` : (orderLabel(record.order_id, references) || "-")}</td>
                    <td>{transactionAmount(record)}</td>
                    <td>{transactionDate(record)}</td>
                    <td><span className={`status ${transactionStatus(record).toLowerCase().replaceAll(" ", "-")}`}>{transactionStatus(record)}</span></td>
                    <td>
                      <div className="row-actions">
                        <button type="button" onClick={() => edit(record)} title={locked ? "Locked record" : "Edit"} disabled={locked}><Icon name="edit" /></button>
                        {table === "stock_adjustments" && <button type="button" onClick={() => approveStockAdjustment(record)} title="Approve adjustment" disabled={record.approval_status === "Approved" || record.posting_status === "Posted"}><Icon name="shield" /></button>}
                        {isStockTable && <button type="button" onClick={() => postStockRecord(record)} title="Post stock" disabled={record.posting_status === "Posted"}><Icon name="receipt" /></button>}
                        {table === "purchase_orders" && <button type="button" onClick={() => convertPurchaseOrder(record)} title={convertedPurchaseOrder ? "Open linked Work Order" : "Convert to Work Order"}><Icon name="clipboard" /></button>}
                        <button type="button" onClick={() => remove(record)} title={locked ? "Locked record" : "Delete"} disabled={locked}><Icon name="trash" /></button>
                      </div>
                    </td>
                        </>
                      );
                    })()}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No records found" note="Add the first Phase 2 entry from the form on the left." />}
      </section>
    </section>
  );
}

export { TransactionScreen };
