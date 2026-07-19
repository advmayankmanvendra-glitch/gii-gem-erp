import { useEffect, useMemo, useState } from "react";
import { Field } from "../components/forms/index.jsx";
import { MasterRecordsPanel } from "../components/tables/MasterRecordsPanel.jsx";
import { AddRecordPanel } from "../components/panels/AddRecordPanel.jsx";
import { confirmAction, deleteConfirmOptions } from "../config/confirmations.js";
import { formChanged, useUnsavedChanges } from "../utils/formUtils.js";

function displayPrimary(record, primary) {
  if (primary === "supplier_name") {
    return record.supplier_name || record.supplier_account_name || record.beneficiary_account_name || record.account_name || "Unnamed Supplier";
  }
  return record[primary] || "-";
}

function validateForm(config, form) {
  const primary = config.primary;
  if (!String(form[primary] || "").trim()) {
    throw new Error(`${config.fields.find(([name]) => name === primary)[1]} is required`);
  }
  if ("mobile_number" in form && form.mobile_number && !/^[0-9+\-\s]{8,15}$/.test(form.mobile_number)) {
    throw new Error("Enter a valid mobile number");
  }
  if ("gstin" in form && form.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(form.gstin).toUpperCase())) {
    throw new Error("Enter a valid GSTIN");
  }
  if ("supplier_bank_ifsc_code" in form && form.supplier_bank_ifsc_code && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(form.supplier_bank_ifsc_code).toUpperCase())) {
    throw new Error("Enter a valid supplier bank IFSC code");
  }
  if ("gst_rate" in form && Number(form.gst_rate) < 0) {
    throw new Error("GST rate cannot be negative");
  }
  if ("incentive_percentage" in form && Number(form.incentive_percentage) < 0) {
    throw new Error("Incentive percentage cannot be negative");
  }
}

export function MasterScreen({ table, config, notify, companyContext, selectTableRow, api }) {
  const blank = useMemo(() => Object.fromEntries(config.fields.map(([name,, type]) => [name, type === "status" ? "active" : ""])), [config]);
  const companyScopedMaster = ["warehouses", "banks"].includes(table);
  const scopedBlank = useMemo(() => companyScopedMaster ? { ...blank, company_id: companyContext?.company_id || "" } : blank, [blank, companyScopedMaster, companyContext?.company_id]);
  const [records, setRecords] = useState([]);
  const [filters, setFilters] = useState({ search: "", status: "all" });
  const [form, setForm] = useState(scopedBlank);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const formDirty = editing ? formChanged(form, Object.fromEntries(config.fields.map(([name]) => [name, editing[name] ?? ""]))) : formChanged(form, scopedBlank);
  useUnsavedChanges(formDirty);

  async function load() {
    setLoading(true);
    try {
      const rows = await api.listRecords(table, companyScopedMaster ? { ...filters, company_id: companyContext?.company_id } : filters);
      const sorted = [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
        const pa = (a[config.primary] || "").toString().toLowerCase();
        const pb = (b[config.primary] || "").toString().toLowerCase();
        return pa.localeCompare(pb, undefined, { numeric: true });
      });
      setRecords(sorted);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [table, filters.search, filters.status, companyContext?.company_id]);

  useEffect(() => {
    function newRecord() {
      setEditing(null);
      setForm(scopedBlank);
    }
    window.addEventListener("gii-gem-new-record", newRecord);
    window.addEventListener("gii-gem-refresh-screen", load);
    return () => {
      window.removeEventListener("gii-gem-new-record", newRecord);
      window.removeEventListener("gii-gem-refresh-screen", load);
    };
  }, [scopedBlank, table, filters.search, filters.status, companyContext?.company_id]);

  async function submit(event) {
    event.preventDefault();
    try {
      if (companyScopedMaster && !companyContext?.company_id) throw new Error("Select Current Company before saving this company-specific master.");
      validateForm(config, form);
      if (editing) {
        await api.updateRecord(table, editing.id, companyScopedMaster ? { ...form, company_id: form.company_id || companyContext?.company_id } : form);
        notify(`${config.title} updated`);
      } else {
        await api.createRecord(table, companyScopedMaster ? { ...form, company_id: form.company_id || companyContext?.company_id } : form);
        notify(`${config.title} saved`);
      }
      if (table === "companies") window.dispatchEvent(new CustomEvent("gii-gem-companies-updated"));
      setForm(scopedBlank);
      setEditing(null);
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function remove(record) {
    const confirmed = await confirmAction({
      ...deleteConfirmOptions(table, record.id),
      message: `Are you sure you want to delete ${record[config.primary] || "this record"}? Linked master records will be marked inactive instead of hard-deleted.`
    });
    if (!confirmed.confirmed) return;
    try {
      await api.deleteRecord(table, record.id);
      notify("Record deleted or marked inactive");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  function edit(record) {
    setEditing(record);
    setForm(Object.fromEntries(config.fields.map(([name]) => [name, record[name] ?? ""])));
  }

  async function deleteUnusedItems() {
    const confirmed = await confirmAction({
      ...deleteConfirmOptions("items"),
      message: "Delete all unused/imported Item Master records? The protected seed/used item will be kept."
    });
    if (!confirmed.confirmed) return;
    try {
      const result = await api.deleteUnusedImportedItems();
      notify(`Deleted ${result.deleted} Item Master record(s)`);
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <section className="master-layout">
      <AddRecordPanel table={table} title={config.title} notify={notify} onImported={load} records={records} api={api}>
        <form className="entry-form-inner" data-entry-form="true" onSubmit={submit}>
          <div className="panel-head">
            <h2>{editing ? "Edit Record" : "Add Record"}</h2>
            {editing && <button type="button" className="ghost-btn" onClick={() => { setEditing(null); setForm(scopedBlank); }}>Clear</button>}
          </div>
          <div className="form-grid">
            {config.fields.map(([name, label, type]) => {
              const fieldOptions = ["select", "datalist"].includes(type) ? [...new Set(records.map((r) => r[name]).filter(Boolean))] : undefined;
              return (
                <Field
                  key={name}
                  name={name}
                  label={label}
                  type={type}
                  value={form[name] ?? ""}
                  onChange={(value) => setForm({ ...form, [name]: value })}
                  options={fieldOptions}
                />
              );
            })}
          </div>
          <button className="primary-btn">{editing ? "Update" : "Save"}</button>
        </form>
      </AddRecordPanel>

      <MasterRecordsPanel
        config={config}
        table={table}
        records={records}
        filters={filters}
        onFiltersChange={setFilters}
        loading={loading}
        onBulkDeleteImportedItems={deleteUnusedItems}
        onEditRecord={edit}
        onDeleteRecord={remove}
        onSelectRow={selectTableRow}
        displayPrimaryValue={displayPrimary}
      />
    </section>
  );
}
