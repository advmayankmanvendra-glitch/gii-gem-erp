// Bank details decide where money goes, so changing them is limited to roles with
// the "settings" permission (admin, super admin). Data-entry roles can still edit
// the rest of a supplier or company record.

const ADMIN_ONLY_TABLES = new Set(["banks"]);

const BANK_FIELDS = {
  companies: ["bank_name", "account_number", "ifsc"],
  suppliers: ["supplier_account_name", "supplier_account_number", "supplier_bank_name", "supplier_bank_ifsc_code", "supplier_branch", "bank_details", "upi_id"]
};

// Master-data import uses its own field keys for the same supplier columns.
const MASTER_IMPORT_BANK_KEYS = new Set(["bank_name", "account_number", "ifsc", "branch", "upi_id"]);

export const BANK_DETAILS_PERMISSION = "settings";

function text(value) {
  return String(value ?? "").trim();
}

// Returns [{ field, oldValue, newValue }] for every bank field this write would change.
// An admin-only table reports a single "*" change for any write.
export function bankDetailChanges(table, payload = {}, oldRecord = null) {
  if (ADMIN_ONLY_TABLES.has(table)) return [{ field: "*", oldValue: oldRecord ? "existing" : "", newValue: "changed" }];
  const fields = BANK_FIELDS[table];
  if (!fields || !oldRecord) return [];
  return fields
    .filter((field) => Object.prototype.hasOwnProperty.call(payload || {}, field))
    .filter((field) => text(payload[field]) !== text(oldRecord[field]))
    .map((field) => ({ field, oldValue: oldRecord[field] ?? null, newValue: payload[field] ?? null }));
}

export function bankDetailDeleteNeedsAdmin(table) {
  return ADMIN_ONLY_TABLES.has(table) || table === "companies";
}

export function masterImportTouchesBankDetails(masterKey, preview = {}) {
  const rows = (preview.rows || []).filter((row) => ["new", "updated"].includes(row.action));
  if (ADMIN_ONLY_TABLES.has(masterKey)) return rows.length > 0;
  if (!BANK_FIELDS[masterKey]) return false;
  return rows.some((row) => row.action === "updated" && (row.changes || []).some((change) => MASTER_IMPORT_BANK_KEYS.has(change.field)));
}
