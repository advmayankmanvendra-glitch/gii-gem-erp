import { useEffect, useState } from "react";
import { Field, SelectBox, SelectField } from "../forms/index.jsx";
import { confirmAction } from "../../config/confirmations.js";
import { formChanged } from "../../utils/formUtils.js";
import { assertQuickCreateAllowed } from "../../modules/quick-create/quickCreatePermissions.js";
import { findDuplicate } from "../../modules/quick-create/quickCreateDuplicateGuard.js";
import { rememberEntityPickerRecord } from "../entityPicker/EntityPickerSelectionStore.js";
import {
  accountGroupOptions,
  defaultNormalBalance
} from "../../features/accounting/accountMappings/accountMappingOptions.js";

const quickCreateConfigs = {
  item: {
    title: "Quick Create Item",
    table: "items",
    primary: "item_name",
    duplicateFields: ["item_name", "brand", "model", "hsn_code"],
    defaults: { item_name: "", hsn_code: "", gst_rate: "", unit: "Nos", brand: "", model: "", category: "", inventory_enabled: 1, track_serial_number: 0, minimum_stock_level: "", status: "active" },
    fields: [
      ["item_name", "Item Name", "text", true],
      ["hsn_code", "HSN Code", "text", true],
      ["gst_rate", "GST Rate", "number", true],
      ["unit", "Unit", "text", true],
      ["brand", "Brand", "select"],
      ["model", "Model", "text"],
      ["category", "Category", "text"],
      ["inventory_enabled", "Inventory Enabled", "checkbox"],
      ["track_serial_number", "Track Serial Number", "checkbox"],
      ["minimum_stock_level", "Minimum Stock Level", "number"]
    ],
    payload: (form) => ({ ...form, gst_rate: Number(form.gst_rate || 0), minimum_stock_level: Number(form.minimum_stock_level || 0), status: "active" }),
    label: (row) => row.item_name
  },
  supplier: {
    title: "Quick Create Supplier",
    table: "suppliers",
    primary: "supplier_name",
    duplicateFields: ["supplier_name", "gstin", "supplier_account_number"],
    defaults: { supplier_name: "", supplier_type: "Vendor", gstin: "", supplier_contact: "", supplier_account_name: "", supplier_account_number: "", supplier_bank_name: "", supplier_bank_ifsc_code: "", remarks: "", status: "active" },
    fields: [
      ["supplier_name", "Supplier Name", "text", true],
      ["supplier_type", "Supplier Type", "text"],
      ["gstin", "GSTIN", "text"],
      ["supplier_contact", "Contact", "text"],
      ["supplier_account_name", "Account Name", "text"],
      ["supplier_account_number", "Account Number", "text"],
      ["supplier_bank_name", "Bank Name", "text"],
      ["supplier_bank_ifsc_code", "IFSC", "text"],
      ["remarks", "Remarks", "textarea"]
    ],
    label: (row) => row.supplier_name || row.supplier_account_name
  },
  department: {
    title: "Quick Create Department",
    table: "government_departments",
    primary: "department_name",
    duplicateFields: ["department_name", "contact_number"],
    defaults: { department_name: "", contact_person: "", contact_number: "", address: "", status: "active" },
    fields: [
      ["department_name", "Department Name", "text", true],
      ["contact_person", "Contact Person", "text"],
      ["contact_number", "Contact Number", "text"],
      ["address", "Address", "textarea"]
    ],
    label: (row) => row.department_name
  },
  institution: {
    title: "Quick Create Institution / Consignee",
    localOnly: true,
    primary: "institution_name",
    duplicateFields: ["institution_name"],
    defaults: { institution_name: "", consignee: "", place_of_supply: "" },
    fields: [
      ["institution_name", "Institution Name", "text", true],
      ["consignee", "Consignee", "text"],
      ["place_of_supply", "Place of Supply", "text"]
    ],
    label: (row) => row.institution_name
  },
  expense_head: {
    title: "Quick Create Expense Head",
    table: "expense_heads",
    primary: "expense_head_name",
    duplicateFields: ["expense_head_name"],
    defaults: { expense_head_name: "", default_calculation_method: "fixed", default_percentage: 0, category: "Miscellaneous", status: "active" },
    fields: [
      ["expense_head_name", "Expense Head Name", "text", true],
      ["default_calculation_method", "Calculation Method", "select", true, ["percentage_gross", "percentage_taxable", "fixed"]],
      ["default_percentage", "Default Percentage", "number"],
      ["category", "Category", "text"]
    ],
    payload: (form) => ({ ...form, default_percentage: Number(form.default_percentage || 0), status: "active" }),
    label: (row) => row.expense_head_name
  },
  bank: {
    title: "Quick Create Bank Account",
    table: "banks",
    primary: "bank_account_name",
    duplicateFields: ["bank_account_name", "account_number"],
    defaults: { bank_account_name: "", bank_name: "", account_number: "", ifsc: "", opening_balance: 0, status: "active" },
    fields: [
      ["bank_account_name", "Bank Account Name", "text", true],
      ["bank_name", "Bank Name", "text", true],
      ["account_number", "Account Number", "text"],
      ["ifsc", "IFSC", "text"],
      ["opening_balance", "Opening Balance", "number"]
    ],
    payload: (form) => ({ ...form, opening_balance: Number(form.opening_balance || 0), status: "active" }),
    label: (row) => row.bank_account_name
  },
  warehouse: {
    title: "Quick Create Warehouse",
    table: "warehouses",
    primary: "warehouse_name",
    duplicateFields: ["warehouse_name", "location"],
    defaults: { warehouse_name: "", location: "", warehouse_type: "Main", responsible_person: "", status: "active" },
    fields: [
      ["warehouse_name", "Warehouse Name", "text", true],
      ["location", "Location", "text"],
      ["warehouse_type", "Warehouse Type", "text"],
      ["responsible_person", "Responsible Person", "text"]
    ],
    label: (row) => row.warehouse_name
  },
  employee: {
    title: "Quick Create Employee",
    table: "employees",
    primary: "employee_name",
    duplicateFields: ["employee_name", "mobile_number"],
    defaults: { employee_name: "", mobile_number: "", designation: "", incentive_percentage: 0, status: "active" },
    fields: [
      ["employee_name", "Employee Name", "text", true],
      ["mobile_number", "Mobile Number", "text", true],
      ["designation", "Designation", "text"],
      ["incentive_percentage", "Incentive Percentage", "number"]
    ],
    payload: (form) => ({ ...form, incentive_percentage: Number(form.incentive_percentage || 0), status: "active" }),
    label: (row) => row.employee_name
  },
  ledger_account: {
    title: "Quick Create Ledger Account",
    accountApi: true,
    primary: "account_name",
    duplicateFields: ["account_name", "account_code"],
    defaults: {
      account_name: "",
      account_code: "",
      account_type: "Expense",
      normal_balance: "Debit",
      account_group_id: "",
      effective_from: "",
      change_reason: "New ledger account created through Quick Create"
    },
    fields: [
      ["account_name", "Account Name", "text", true],
      ["account_code", "Account Code", "text"],
      ["account_type", "Account Type", "select", true, ["Asset", "Liability", "Equity", "Income", "Expense"]],
      ["normal_balance", "Normal Balance", "select", true, ["Debit", "Credit"]],
      ["account_group_id", "Account Group", "mapping_group", true],
      ["effective_from", "Effective Date", "date", true],
      ["change_reason", "Change Reason", "textarea", true]
    ],
    payload: (form, context) => ({
      ...form,
      account_group_id: Number(form.account_group_id),
      company_id: context.company_id,
      source_module: context.source_module || "quick_create"
    }),
    label: (row) => `${row.account_code} - ${row.account_name}`
  }
};

export function quickCreateRecords(type, sources = {}) {
  const refs = sources.references || sources.refs || {};
  const map = {
    item: refs.items || sources.items || [],
    supplier: refs.suppliers || sources.suppliers || [],
    department: refs.departments || sources.departments || [],
    institution: sources.institutionOptions || [],
    expense_head: refs.expenseHeads || sources.expenseHeads || [],
    bank: refs.banks || sources.banks || [],
    warehouse: refs.warehouses || sources.warehouses || [],
    employee: refs.employees || sources.employees || [],
    ledger_account: sources.accounts || []
  };
  return map[type] || [];
}

export function QuickCreateMasterDialog({ request, records, context = {}, role, notify, onClose, onCreated, api }) {
  const config = quickCreateConfigs[request?.type];
  const baseline = {
    ...(config?.defaults || {}),
    ...(request?.type === "ledger_account" ? { effective_from: new Date().toISOString().slice(0, 10) } : {}),
    ...(request?.defaults || {})
  };
  const [form, setForm] = useState(baseline);
  const [duplicate, setDuplicate] = useState(null);
  const [mappingRegistry, setMappingRegistry] = useState(null);
  const [mappingLoadError, setMappingLoadError] = useState("");

  useEffect(() => {
    if (request?.type !== "ledger_account") return;
    let active = true;
    setMappingLoadError("");
    Promise.resolve(api.getAccountMappingRegistry({
      company_id: context.company_id,
      as_of_date: form.effective_from
    }))
      .then((result) => {
        if (active) setMappingRegistry(result);
      })
      .catch((error) => {
        if (active) setMappingLoadError(error.message || "Account groups could not be loaded");
      });
    return () => {
      active = false;
    };
  }, [request?.type, api, context.company_id]);

  if (!config) return null;
  const changed = formChanged(form, baseline);
  const mappingOptions = request?.type === "ledger_account"
    ? accountGroupOptions(
      mappingRegistry,
      form.account_type,
      form.normal_balance,
      form.effective_from
    )
    : [];

  function updateFormField(name, value) {
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === "account_type") {
        next.normal_balance = defaultNormalBalance(value);
        next.account_group_id = "";
      }
      if (name === "normal_balance" || name === "effective_from") {
        next.account_group_id = "";
      }
      return next;
    });
  }

  async function closeSafely() {
    if (!changed) {
      onClose();
      return;
    }
    const confirmed = await confirmAction({
      title: "Unsaved Quick Create",
      message: "You have unsaved master details. Do you want to exit without saving?",
      confirmLabel: "Yes, Exit",
      cancelLabel: "No, Stay",
      mode: "warning"
    });
    if (confirmed.confirmed) onClose();
  }

  async function save(createAnyway = false) {
    try {
      assertQuickCreateAllowed(request.type, role);
      if (request.type === "ledger_account" && mappingLoadError) {
        throw new Error(`${mappingLoadError}. Close and reopen Quick Create after checking the desktop session.`);
      }
      config.fields.filter(([, , , required]) => required).forEach(([name, label]) => {
        if (!String(form[name] || "").trim()) throw new Error(`${label} is required`);
      });
      const existing = findDuplicate(request.type, form, records);
      if (existing && !createAnyway) {
        setDuplicate(existing);
        return;
      }
      const payload = config.payload ? config.payload(form, context) : { ...form, status: "active" };
      const saved = config.localOnly
        ? { id: form[config.primary], ...payload }
        : config.accountApi
          ? await api.createLedgerAccount(payload)
          : await api.createRecord(config.table, payload);
      rememberEntityPickerRecord(request.type, saved);
      notify(`${config.title.replace("Quick Create ", "")} created and selected`);
      await onCreated(request.type, saved, request);
      onClose();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  function useExisting() {
    rememberEntityPickerRecord(request.type, duplicate);
    Promise.resolve(onCreated(request.type, duplicate, request)).then(onClose);
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="help-dialog quick-item-dialog"
        role="dialog"
        aria-modal="true"
        onKeyDown={(event) => {
          if (event.ctrlKey && event.key.toLowerCase() === "s") {
            event.preventDefault();
            save(false);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            closeSafely();
          }
        }}
      >
        <div className="panel-head">
          <div>
            <h2>{config.title}</h2>
            <p>Create the missing master without leaving the transaction screen.</p>
          </div>
          <button type="button" className="ghost-btn" onClick={closeSafely}>Close</button>
        </div>
        <div className="quick-item-grid">
          {config.fields.map(([name, label, type, , optionsArg]) => {
            const dynamicOptions = (type === "select" || type === "datalist") && !optionsArg ? [...new Set(records.map((r) => r[name]).filter(Boolean))] : null;
            if (type === "mapping_group") {
              return (
                <SelectBox
                  key={name}
                  label={label}
                  value={form[name]}
                  onChange={(value) => updateFormField(name, value)}
                  options={mappingOptions}
                />
              );
            }
            if (type === "select" && optionsArg && !dynamicOptions) {
              return <SelectField key={name} label={label} value={form[name]} onChange={(value) => updateFormField(name, value)} options={optionsArg} />;
            }
            return <Field key={name} name={name} label={label} type={type} value={form[name]} onChange={(value) => updateFormField(name, value)} options={dynamicOptions || optionsArg} />;
          })}
        </div>
        {request.type === "ledger_account" && (
          <div className={mappingLoadError ? "account-mapping-inline-note error" : "account-mapping-inline-note"}>
            {mappingLoadError
              ? mappingLoadError
              : mappingRegistry
                ? `${mappingOptions.length} compatible governed account group(s) available.`
                : "Loading governed account groups..."}
          </div>
        )}
        {duplicate && (
          <div className="duplicate-item-warning">
            <strong>Similar master already exists.</strong>
            <span>{config.label?.(duplicate) || duplicate[config.primary]}</span>
            <div className="button-row">
              <button type="button" className="primary-btn" onClick={useExisting}>Use Existing</button>
              {!config.localOnly && <button type="button" className="ghost-btn" onClick={() => save(true)}>Create Anyway</button>}
              <button type="button" className="ghost-btn" onClick={() => setDuplicate(null)}>Cancel</button>
            </div>
          </div>
        )}
        <div className="button-row">
          <button type="button" className="ghost-btn" onClick={closeSafely}>Cancel</button>
          <button type="button" className="primary-btn" onClick={() => save(false)}>Save</button>
        </div>
      </section>
    </div>
  );
}
