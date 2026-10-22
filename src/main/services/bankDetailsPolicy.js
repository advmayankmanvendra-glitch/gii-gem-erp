// Bank details decide where money goes, so setting or changing them is limited to
// roles with the "settings" permission (admin, super admin). Other roles can still
// create and edit the rest of a supplier, company, employee or bank record.
//
// The check runs in crudHelpers on the row that is actually written (after field
// aliases are mapped and missing fields are filled), so it cannot be side-stepped
// by sending a field under another name or by leaving it out.

const BANK_FIELDS = {
  companies: ["bank_name", "account_number", "ifsc"],
  suppliers: ["supplier_account_number", "supplier_bank_name", "supplier_bank_ifsc_code", "supplier_branch", "bank_details", "upi_id"],
  employees: ["bank_name", "account_number", "ifsc", "branch"],
  banks: ["bank_name", "account_number", "ifsc", "branch"]
};

// The company's own bank masters can be created by accountants (a new account has no
// history yet); changing the account number or IFSC of an existing one is what is gated.
const GATED_ON_CREATE = new Set(["companies", "suppliers", "employees"]);

// Master-data import uses its own field keys for the same columns.
const MASTER_IMPORT_BANK_KEYS = new Set(["bank_name", "account_number", "ifsc", "branch", "upi_id"]);

export const BANK_DETAILS_PERMISSION = "settings";

function text(value) {
  return String(value ?? "").trim();
}

// Returns [{ field, oldValue, newValue }] for every bank field this write sets or changes.
// `row` is the row about to be written (null for a delete); `oldRecord` is null on create.
export function bankDetailChanges(table, row, oldRecord = null) {
  const fields = BANK_FIELDS[table];
  if (!fields) return [];
  if (!row) {
    // Deleting a company takes its bank account with it.
    return table === "companies" ? [{ field: "*", oldValue: "existing", newValue: "deleted" }] : [];
  }
  if (!oldRecord && !GATED_ON_CREATE.has(table)) return [];
  return fields
    .filter((field) => Object.prototype.hasOwnProperty.call(row, field))
    .filter((field) => text(row[field]) !== text(oldRecord?.[field]))
    .map((field) => ({ field, oldValue: oldRecord?.[field] ?? null, newValue: row[field] ?? null }));
}

// True when a master-data import would set or change bank details.
export function masterImportTouchesBankDetails(masterKey, preview = {}) {
  if (!BANK_FIELDS[masterKey]) return false;
  return (preview.rows || []).some((row) => {
    if (row.action === "updated") return (row.changes || []).some((change) => MASTER_IMPORT_BANK_KEYS.has(change.field));
    if (row.action !== "new" || !GATED_ON_CREATE.has(masterKey)) return false;
    return BANK_FIELDS[masterKey].some((field) => text(row.payload?.[field]));
  });
}
