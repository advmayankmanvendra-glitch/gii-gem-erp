// Bank details decide where money goes, so setting or changing them is limited to
// roles with the "settings" permission (admin, super admin). Other roles can still
// create and edit the rest of a supplier, company, employee or bank record.
//
// The check runs in crudHelpers on the row that is actually written (after field
// aliases are mapped and missing fields are filled), so it cannot be side-stepped
// by sending a field under another name or by leaving it out. The values are
// normalized (normalizeBankFields) at the start of crudHelpers.cleanPayload, before
// the combined bank text is built; the guard only checks.

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

const EDGE_SPACE = /^[\s\u200B-\u200D\uFEFF]+|[\s\u200B-\u200D\uFEFF]+$/g;

function text(value) {
  return String(value ?? "").replace(EDGE_SPACE, "");
}

// One rule for "the same bank value": surrounding spaces, line breaks and invisible
// characters do not make a value different.
export function sameBankValue(a, b) {
  return text(a) === text(b);
}

function fieldLabel(field) {
  return field.replace(/^supplier_|^beneficiary_/, "").replaceAll("_", " ");
}

// One bank value as it is stored: text without surrounding spaces or invisible characters.
// A whole number is turned into its digits (SQLite would otherwise store 1234 as "1234.0").
// A fraction, a number too large to hold every digit, true/false or an object is refused,
// because an account number or IFSC typed that way has already lost its exact digits.
export function normalizeBankValue(field, value) {
  if (value === undefined || value === null) return value;
  if (typeof value === "string") return value.replace(EDGE_SPACE, "");
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  throw new Error(`Bank ${fieldLabel(field)} must be entered as text, for example "012345678901". The value sent (${typeof value === "object" ? "a list or object" : String(value)}) cannot be saved exactly. Type the ${fieldLabel(field)} again in the form and save. Nothing was changed.`);
}

// Normalizes the bank fields of a payload before anything is built from them (for example
// the combined supplier bank text). extraKeys are other names the same values may arrive
// under. Returns a new object; the caller's payload is not changed.
export function normalizeBankFields(table, payload = {}, extraKeys = []) {
  const keys = [...(BANK_FIELDS[table] || []), ...extraKeys];
  if (!keys.length || !payload) return payload;
  const normalized = { ...payload };
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(normalized, key)) normalized[key] = normalizeBankValue(key, normalized[key]);
  }
  return normalized;
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
    .filter((field) => !sameBankValue(row[field], oldRecord?.[field]))
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
