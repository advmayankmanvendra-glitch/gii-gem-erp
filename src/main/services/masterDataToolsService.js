const STATUS_VALUES = new Map([
  ["active", "active"],
  ["inactive", "inactive"],
  ["yes", "active"],
  ["no", "inactive"],
  ["true", "active"],
  ["false", "inactive"],
  ["1", "active"],
  ["0", "inactive"]
]);

const MASTER_DEFINITIONS = {
  companies: {
    key: "companies",
    label: "Companies",
    table: "companies",
    codeField: "company_code",
    nameField: "company_name",
    companyScoped: false,
    fields: [
      field("company_code", "Company Code", "company_code", { required: true, completeness: true }),
      field("company_name", "Company Name", "company_name", { required: true, completeness: true }),
      field("gstin", "GSTIN", "gstin", { validate: "gstin" }),
      field("pan", "PAN", "pan", { validate: "pan" }),
      field("address", "Address", "address", { completeness: true }),
      field("bank_name", "Bank Name", "bank_name"),
      field("account_number", "Account Number", "account_number"),
      field("ifsc", "IFSC", "ifsc", { validate: "ifsc" }),
      statusField()
    ]
  },
  suppliers: {
    key: "suppliers",
    label: "Suppliers",
    table: "suppliers",
    codeField: "supplier_code",
    nameField: "supplier_name",
    companyScoped: false,
    fields: [
      field("supplier_code", "Supplier Code", "supplier_code", { required: true, completeness: true }),
      field("supplier_name", "Supplier Name", "supplier_name", { required: true, completeness: true }),
      field("gstin", "GSTIN", "gstin", { validate: "gstin" }),
      field("pan", "PAN", "pan", { validate: "pan" }),
      field("address", "Address", "address"),
      field("city", "City", "city"),
      field("state", "State", "state"),
      field("pincode", "Pincode", "pincode"),
      field("contact_person", "Contact Person", "contact_person", { completeness: true }),
      field("mobile", "Mobile", "mobile"),
      field("email", "Email", "email"),
      field("bank_name", "Bank Name", "supplier_bank_name", { completeness: true }),
      field("account_number", "Account Number", "supplier_account_number", { completeness: true }),
      field("ifsc", "IFSC", "supplier_bank_ifsc_code", { validate: "ifsc", completeness: true }),
      field("branch", "Branch", "supplier_branch"),
      field("upi_id", "UPI ID", "upi_id"),
      field("msme_number", "MSME Number", "msme_number"),
      field("payment_terms", "Payment Terms", "payment_terms"),
      field("remarks", "Remarks", "remarks"),
      statusField()
    ]
  },
  items: {
    key: "items",
    label: "Items",
    table: "items",
    codeField: "item_code",
    nameField: "item_name",
    companyScoped: false,
    fields: [
      field("item_code", "Item Code", "item_code", { required: true, completeness: true }),
      field("item_name", "Item Name", "item_name", { required: true, completeness: true }),
      field("brand", "Brand", "brand"),
      field("model", "Model", "model"),
      field("hsn_code", "HSN/SAC", "hsn_code", { completeness: true }),
      field("gst_rate", "GST Rate", "gst_rate", { validate: "gst_rate", completeness: true }),
      field("unit", "Unit", "unit", { required: true, completeness: true }),
      field("oem_name", "OEM Name", "oem_name", { completeness: true }),
      field("make_in_india_class", "Make In India Classification", "make_in_india_class"),
      field("country_of_origin", "Country Of Origin", "country_of_origin"),
      field("warranty_period", "Warranty Period", "warranty_period"),
      field("remarks", "Remarks", "remarks"),
      statusField()
    ]
  },
  government_departments: {
    key: "government_departments",
    label: "Government Departments",
    table: "government_departments",
    codeField: "department_code",
    nameField: "department_name",
    companyScoped: false,
    fields: [
      field("department_code", "Department Code", "department_code", { required: true, completeness: true }),
      field("department_name", "Department Name", "department_name", { required: true, completeness: true }),
      field("gstin", "GSTIN", "gstin", { validate: "gstin" }),
      field("billing_address", "Billing Address", "billing_address", { completeness: true }),
      field("consignee_address", "Consignee Address", "consignee_address", { completeness: true }),
      field("district", "District", "district"),
      field("state", "State", "state"),
      field("pincode", "Pincode", "pincode"),
      field("contact_person", "Contact Person", "contact_person"),
      field("mobile", "Mobile", "mobile"),
      field("email", "Email", "email"),
      field("payment_authority", "Payment Authority", "payment_authority"),
      field("remarks", "Remarks", "remarks"),
      statusField()
    ]
  },
  employees: {
    key: "employees",
    label: "Employees",
    table: "employees",
    codeField: "employee_code",
    nameField: "employee_name",
    companyScoped: false,
    fields: [
      field("employee_code", "Employee Code", "employee_code", { required: true, completeness: true }),
      field("employee_name", "Employee Name", "employee_name", { required: true, completeness: true }),
      field("designation", "Designation", "designation"),
      field("mobile", "Mobile", "mobile_number", { required: true, completeness: true }),
      field("email", "Email", "email"),
      field("pan", "PAN", "pan", { validate: "pan" }),
      field("aadhaar_last4", "Aadhaar Last 4", "aadhaar_last4"),
      field("bank_name", "Bank Name", "bank_name", { completeness: true }),
      field("account_number", "Account Number", "account_number", { completeness: true }),
      field("ifsc", "IFSC", "ifsc", { validate: "ifsc", completeness: true }),
      field("branch", "Branch", "branch"),
      field("joining_date", "Joining Date", "joining_date"),
      field("remarks", "Remarks", "remarks"),
      statusField()
    ]
  },
  banks: {
    key: "banks",
    label: "Banks",
    table: "banks",
    codeField: "bank_code",
    nameField: "bank_account_name",
    companyScoped: true,
    fields: [
      field("bank_code", "Bank Code", "bank_code", { required: true, completeness: true }),
      field("bank_name", "Bank Name", "bank_name", { required: true, completeness: true }),
      field("account_name", "Account Name", "bank_account_name", { required: true, completeness: true }),
      field("account_number", "Account Number", "account_number", { completeness: true }),
      field("ifsc", "IFSC", "ifsc", { validate: "ifsc", completeness: true }),
      field("branch", "Branch", "branch"),
      field("opening_balance", "Opening Balance", "opening_balance", { validate: "amount" }),
      field("remarks", "Remarks", "remarks"),
      statusField()
    ]
  },
  warehouses: {
    key: "warehouses",
    label: "Warehouses",
    table: "warehouses",
    codeField: "warehouse_code",
    nameField: "warehouse_name",
    companyScoped: true,
    fields: [
      field("warehouse_code", "Warehouse Code", "warehouse_code", { required: true, completeness: true }),
      field("warehouse_name", "Warehouse Name", "warehouse_name", { required: true, completeness: true }),
      field("location", "Location", "location"),
      field("address", "Address", "address"),
      field("incharge_name", "Incharge Name", "incharge_name"),
      field("mobile", "Mobile", "mobile"),
      field("remarks", "Remarks", "remarks"),
      statusField()
    ]
  },
  expense_heads: {
    key: "expense_heads",
    label: "Expense Heads",
    table: "expense_heads",
    codeField: "expense_head_code",
    nameField: "expense_head_name",
    companyScoped: false,
    fields: [
      field("expense_head_code", "Expense Head Code", "expense_head_code", { required: true, completeness: true }),
      field("expense_head_name", "Expense Head Name", "expense_head_name", { required: true, completeness: true }),
      field("expense_category", "Expense Category", "category"),
      field("default_calculation_method", "Default Calculation Method", "default_calculation_method"),
      field("default_percentage", "Default Percentage", "default_percentage", { validate: "amount" }),
      field("default_gst_rate", "Default GST Rate", "default_gst_rate", { validate: "gst_rate" }),
      field("remarks", "Remarks", "remarks"),
      statusField()
    ]
  }
};

function field(key, label, dbField, options = {}) {
  return { key, label, dbField, ...options };
}

function statusField() {
  return field("is_active", "Active", "status", { required: true, validate: "status", completeness: true });
}

function quoteIdentifier(value) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// A cell starting with = + - @ is run as a formula by Excel; prefix it so it opens as text.
// Plain numbers such as -500 are left alone.
function neutralizeFormula(text) {
  return /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
}

function csvCell(value) {
  const text = neutralizeFormula(value === null || value === undefined ? "" : String(value));
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function toCsv(headers, rows) {
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(","))
  ].join("\r\n") + "\r\n";
}

function tableColumns(db, table) {
  return db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all().map((row) => row.name);
}

function tableHasColumn(db, table, column) {
  return tableColumns(db, table).includes(column);
}

function statusToExport(value) {
  return String(value || "active").toLowerCase() === "inactive" ? "No" : "Yes";
}

function normalizeStatus(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return STATUS_VALUES.get(normalized) || "";
}

function fieldValue(row, field) {
  const normalizedRow = Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [normalizeKey(key), value]));
  return normalizedRow[normalizeKey(field.key)] ?? normalizedRow[normalizeKey(field.label)] ?? "";
}

function exportValue(row, field) {
  const value = row?.[field.dbField];
  if (field.key === "is_active") return statusToExport(value);
  return value ?? "";
}

function importValue(rawValue, field) {
  // Undo the export's formula guard so a round-tripped value comes back unchanged.
  const value = normalizeText(rawValue).replace(/^'(?=[=+\-@])/, "");
  if (field.key === "is_active") return normalizeStatus(value) || "active";
  if (["amount", "gst_rate"].includes(field.validate) && value !== "") return Number(value);
  return value;
}

function validationError(value, field) {
  const text = normalizeText(value);
  if (field.required && !text) return `${field.label} is required`;
  if (!text) return "";
  if (field.validate === "gstin" && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(text)) return `${field.label} format is invalid`;
  if (field.validate === "pan" && !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(text)) return `${field.label} format is invalid`;
  if (field.validate === "ifsc" && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(text)) return `${field.label} format is invalid`;
  if (field.validate === "gst_rate" && (Number.isNaN(Number(text)) || Number(text) < 0 || Number(text) > 28)) return `${field.label} must be between 0 and 28`;
  if (field.validate === "amount" && Number.isNaN(Number(text))) return `${field.label} must be numeric`;
  if (field.validate === "status" && !normalizeStatus(text)) return `${field.label} must be Yes/No or Active/Inactive`;
  return "";
}

function definitionFor(key) {
  const definition = MASTER_DEFINITIONS[key];
  if (!definition) throw new Error(`Unsupported master data tool key: ${key}`);
  return definition;
}

function companyFilter(definition, companyId) {
  return definition.companyScoped ? { clause: " AND company_id = ?", params: [Number(companyId || 0)] } : { clause: "", params: [] };
}

function safeStatusFilter(status) {
  const value = String(status || "all").toLowerCase();
  if (value === "active") return "active";
  if (value === "inactive") return "inactive";
  return "all";
}

function selectRows(db, definition, filters = {}) {
  const columns = tableColumns(db, definition.table);
  const selectable = ["id", ...definition.fields.map((item) => item.dbField), "company_id", "updated_at"]
    .filter((column, index, list) => columns.includes(column) && list.indexOf(column) === index);
  const where = columns.includes("is_deleted") ? ["COALESCE(is_deleted, 0) = 0"] : ["1 = 1"];
  const params = [];
  const statusFilter = safeStatusFilter(filters.status);
  if (statusFilter !== "all" && columns.includes("status")) {
    where.push("LOWER(COALESCE(status, 'active')) = ?");
    params.push(statusFilter);
  }
  if (definition.companyScoped) {
    where.push("company_id = ?");
    params.push(Number(filters.company_id || 0));
  }
  return db.prepare(`
    SELECT ${selectable.map(quoteIdentifier).join(", ")}
    FROM ${quoteIdentifier(definition.table)}
    WHERE ${where.join(" AND ")}
    ORDER BY ${quoteIdentifier(definition.nameField)} COLLATE NOCASE
  `).all(...params);
}

function findByCode(db, definition, code, companyId) {
  const columns = tableColumns(db, definition.table);
  if (!columns.includes(definition.codeField)) return null;
  const company = companyFilter(definition, companyId);
  const softDeleteFilter = columns.includes("is_deleted") ? "COALESCE(is_deleted, 0) = 0 AND" : "";
  return db.prepare(`
    SELECT *
    FROM ${quoteIdentifier(definition.table)}
    WHERE ${softDeleteFilter}
      LOWER(TRIM(${quoteIdentifier(definition.codeField)})) = LOWER(TRIM(?))
      ${company.clause}
    ORDER BY id
    LIMIT 1
  `).get(code, ...company.params) || null;
}

function rowPayload(db, definition, row, context = {}) {
  const columns = tableColumns(db, definition.table);
  const payload = {};
  const errors = [];
  definition.fields.forEach((field) => {
    if (!columns.includes(field.dbField)) return;
    const rawValue = fieldValue(row, field);
    const error = validationError(rawValue, field);
    if (error) errors.push(error);
    payload[field.dbField] = importValue(rawValue, field);
  });
  if (definition.companyScoped && columns.includes("company_id")) {
    const companyId = Number(context.company_id || 0);
    if (!companyId) errors.push("Selected company is required for this master");
    payload.company_id = companyId || null;
  }
  return { payload, errors };
}

function rowChanges(definition, existing, payload) {
  return definition.fields
    .filter((field) => Object.prototype.hasOwnProperty.call(payload, field.dbField))
    .map((field) => {
      const oldValue = field.key === "is_active" ? statusToExport(existing?.[field.dbField]) : existing?.[field.dbField] ?? "";
      const newValue = field.key === "is_active" ? statusToExport(payload[field.dbField]) : payload[field.dbField] ?? "";
      return { field: field.key, label: field.label, oldValue, newValue };
    })
    .filter((change) => String(change.oldValue ?? "") !== String(change.newValue ?? ""));
}

function missingFieldsForRow(definition, row) {
  return definition.fields
    .filter((field) => field.completeness)
    .filter((field) => !normalizeText(exportValue(row, field)))
    .map((field) => field.key);
}

export function getMasterDataToolDefinitions() {
  return Object.values(MASTER_DEFINITIONS).map((definition) => ({
    key: definition.key,
    label: definition.label,
    table: definition.table,
    codeField: definition.codeField,
    nameField: definition.nameField,
    companyScoped: definition.companyScoped,
    headers: definition.fields.map((field) => field.key),
    fields: definition.fields.map(({ key, label, required, validate, completeness }) => ({ key, label, required: Boolean(required), validate: validate || "", completeness: Boolean(completeness) }))
  }));
}

export function exportMasterData(db, payload = {}, context = {}, auditLogFn) {
  const definition = definitionFor(payload.masterKey);
  const exportType = payload.exportType || "template";
  const rows = exportType === "template" ? [] : selectRows(db, definition, { ...payload, company_id: context.company_id });
  const headers = definition.fields.map((field) => field.key);
  let csvRows = rows.map((row) => Object.fromEntries(definition.fields.map((field) => [field.key, exportValue(row, field)])));

  if (exportType === "missing_indicators") {
    csvRows = csvRows.map((row, index) => ({ ...row, missing_fields: missingFieldsForRow(definition, rows[index]).join("; ") }));
  }

  if (exportType === "completeness") {
    const reportRows = rows.map((row) => {
      const missing = missingFieldsForRow(definition, row);
      const tracked = definition.fields.filter((field) => field.completeness).length || 1;
      return {
        master: definition.label,
        code: row[definition.codeField] || "",
        name: row[definition.nameField] || "",
        missing_fields: missing.join("; "),
        completeness_percent: Math.round(((tracked - missing.length) / tracked) * 100)
      };
    });
    const csv = toCsv(["master", "code", "name", "missing_fields", "completeness_percent"], reportRows);
    auditLogFn?.({ company_id: context.company_id || null, user_id: context.user_id || null, action: "master_data_export", module: "master_data_tools", table_name: definition.table, new_value: JSON.stringify({ master: definition.key, exportType, rows: reportRows.length }) });
    return { fileName: `${definition.key}-completeness.csv`, csv, rows: reportRows.length, headers: ["master", "code", "name", "missing_fields", "completeness_percent"] };
  }

  const finalHeaders = exportType === "missing_indicators" ? [...headers, "missing_fields"] : headers;
  const csv = toCsv(finalHeaders, csvRows);
  auditLogFn?.({ company_id: context.company_id || null, user_id: context.user_id || null, action: exportType === "template" ? "master_data_template_download" : "master_data_export", module: "master_data_tools", table_name: definition.table, new_value: JSON.stringify({ master: definition.key, exportType, rows: csvRows.length }) });
  return { fileName: `${definition.key}-${exportType}.csv`, csv, rows: csvRows.length, headers: finalHeaders };
}

export function previewMasterDataUpdate(db, payload = {}, context = {}) {
  const definition = definitionFor(payload.masterKey);
  const mode = payload.mode || "insert_update";
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const seenCodes = new Set();
  const previewRows = rows.map((row, index) => {
    const { payload: prepared, errors } = rowPayload(db, definition, row, context);
    const code = normalizeText(prepared[definition.codeField]);
    const name = normalizeText(prepared[definition.nameField]);
    const rowNumber = index + 2;
    const rowErrors = [...errors];

    if (!code) rowErrors.push("This row cannot be safely updated because no stable master code exists.");
    if (!name) rowErrors.push(`${definition.fields.find((field) => field.dbField === definition.nameField)?.label || "Name"} is required`);
    const duplicateUpload = code && seenCodes.has(code.toLowerCase());
    if (duplicateUpload) rowErrors.push("Duplicate code in uploaded file");
    if (code) seenCodes.add(code.toLowerCase());

    const existing = code ? findByCode(db, definition, code, context.company_id) : null;
    let action = "new";
    if (rowErrors.length) action = code ? "rejected" : "missing_code";
    else if (duplicateUpload) action = "duplicate";
    else if (mode === "insert_only" && existing) action = "duplicate";
    else if (mode === "update_existing" && !existing) action = "rejected";
    else if (existing) action = "updated";

    const changes = existing ? rowChanges(definition, existing, prepared) : [];
    return {
      rowNumber,
      code,
      name,
      action,
      existingId: existing?.id || null,
      errors: rowErrors,
      changes,
      payload: prepared
    };
  });

  const summary = {
    total: previewRows.length,
    new: previewRows.filter((row) => row.action === "new").length,
    updated: previewRows.filter((row) => row.action === "updated").length,
    rejected: previewRows.filter((row) => row.action === "rejected").length,
    duplicate: previewRows.filter((row) => row.action === "duplicate").length,
    missingCodes: previewRows.filter((row) => row.action === "missing_code").length,
    validationErrors: previewRows.reduce((total, row) => total + row.errors.length, 0),
    unchanged: previewRows.filter((row) => row.action === "updated" && row.changes.length === 0).length
  };

  const blockingReasons = [];
  if (!rows.length) blockingReasons.push("Upload contains no data rows.");
  if (summary.rejected || summary.duplicate || summary.missingCodes || summary.validationErrors) blockingReasons.push("Resolve rejected, duplicate, missing-code or validation-error rows before import.");
  if (mode === "update_existing" && summary.new) blockingReasons.push("Update Existing mode cannot create rows that do not already exist.");

  return {
    masterKey: definition.key,
    masterLabel: definition.label,
    mode,
    summary,
    rows: previewRows,
    canImport: blockingReasons.length === 0 && (summary.new + summary.updated) > 0,
    blockingReasons
  };
}

export function confirmMasterDataUpdate(db, payload = {}, context = {}, auditLogFn) {
  const preview = previewMasterDataUpdate(db, payload, context);
  if (!preview.canImport && !payload.allowPartial) {
    throw new Error(`Master import is locked: ${preview.blockingReasons.join(" ")}`);
  }
  const definition = definitionFor(payload.masterKey);
  const columns = tableColumns(db, definition.table);
  const importable = preview.rows.filter((row) => ["new", "updated"].includes(row.action));
  const batchId = `MDT-${Date.now()}`;

  const transaction = db.transaction(() => {
    importable.forEach((row) => {
      const payloadKeys = Object.keys(row.payload).filter((key) => columns.includes(key));
      if (row.action === "new") {
        const insertKeys = payloadKeys.filter((key) => row.payload[key] !== undefined);
        const placeholders = insertKeys.map((key) => `@${key}`);
        db.prepare(`
          INSERT INTO ${quoteIdentifier(definition.table)} (${insertKeys.map(quoteIdentifier).join(", ")})
          VALUES (${placeholders.join(", ")})
        `).run(row.payload);
      } else if (row.changes.length) {
        const updateKeys = payloadKeys.filter((key) => key !== "company_id");
        const assignments = updateKeys.map((key) => `${quoteIdentifier(key)} = @${key}`);
        if (columns.includes("updated_at")) assignments.push("updated_at = CURRENT_TIMESTAMP");
        db.prepare(`
          UPDATE ${quoteIdentifier(definition.table)}
          SET ${assignments.join(", ")}
          WHERE id = @id
        `).run({ ...row.payload, id: row.existingId });
      }
    });
    if (tableHasColumn(db, "import_batches", "module")) {
      db.prepare(`
        INSERT INTO import_batches (id, table_name, file_name, total_rows, successful_rows, failed_rows, skipped_duplicates, created_by, status, module, rows_imported, imported_by, imported_at)
        VALUES (@id, @table_name, @file_name, @total_rows, @successful_rows, @failed_rows, @skipped_duplicates, @created_by, @status, @module, @rows_imported, @imported_by, CURRENT_TIMESTAMP)
      `).run({
        id: batchId,
        table_name: definition.table,
        file_name: payload.fileName || "master-data-tools.csv",
        total_rows: preview.summary.total,
        successful_rows: importable.length,
        failed_rows: preview.summary.rejected + preview.summary.missingCodes,
        skipped_duplicates: preview.summary.duplicate,
        created_by: context.user_id || null,
        status: "active",
        module: "master_data_tools",
        rows_imported: importable.length,
        imported_by: context.user_id || null
      });
    }
  });

  transaction();
  auditLogFn?.({
    company_id: context.company_id || null,
    user_id: context.user_id || null,
    action: "master_data_update",
    module: "master_data_tools",
    table_name: definition.table,
    record_id: null,
    new_value: JSON.stringify({ batchId, master: definition.key, summary: preview.summary })
  });
  return { batchId, imported: importable.length, summary: preview.summary };
}

export function getMasterDataCompleteness(db, context = {}) {
  return Object.values(MASTER_DEFINITIONS).map((definition) => {
    const rows = selectRows(db, definition, { company_id: context.company_id, status: "all" });
    const trackedFields = definition.fields.filter((field) => field.completeness);
    const missingByField = Object.fromEntries(trackedFields.map((field) => [field.key, 0]));
    rows.forEach((row) => {
      trackedFields.forEach((field) => {
        if (!normalizeText(exportValue(row, field))) missingByField[field.key] += 1;
      });
    });
    const totalChecks = Math.max(rows.length * trackedFields.length, 1);
    const missingTotal = Object.values(missingByField).reduce((total, count) => total + count, 0);
    return {
      key: definition.key,
      label: definition.label,
      totalRecords: rows.length,
      completenessPercent: Math.round(((totalChecks - missingTotal) / totalChecks) * 100),
      missingByField
    };
  });
}

export function getMasterDataToolsHealth(db, context = {}) {
  const completeness = getMasterDataCompleteness(db, context);
  const averageCompleteness = completeness.length
    ? Math.round(completeness.reduce((total, item) => total + item.completenessPercent, 0) / completeness.length)
    : 0;
  const actions = ["master_data_template_download", "master_data_export", "master_data_update"];
  const placeholders = actions.map(() => "?").join(", ");
  const rows = db.prepare(`
    SELECT action, table_name, new_value, created_at
    FROM audit_log
    WHERE action IN (${placeholders})
    ORDER BY id DESC
    LIMIT 20
  `).all(...actions);
  const byAction = Object.fromEntries(actions.map((action) => [action, rows.find((row) => row.action === action) || null]));
  return {
    averageCompleteness,
    completeness,
    lastTemplateDownload: byAction.master_data_template_download,
    lastMasterExport: byAction.master_data_export,
    lastMasterUpdate: byAction.master_data_update,
    lastRejectedImportRows: rows
      .map((row) => {
        try {
          return JSON.parse(row.new_value || "{}")?.summary?.rejected || 0;
        } catch {
          return 0;
        }
      })
      .find((count) => count > 0) || 0
  };
}
