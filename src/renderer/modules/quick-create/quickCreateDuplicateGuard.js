const DUPLICATE_FIELDS = {
  supplier: ["supplier_name", "gstin", "supplier_account_number"],
  department: ["department_name", "contact_number"],
  item: ["item_name", "brand", "model", "hsn_code"],
  warehouse: ["warehouse_name", "location"],
  bank: ["bank_account_name", "account_number"],
  institution: ["institution_name"],
  expense_head: ["expense_head_name"],
  employee: ["employee_name", "mobile_number"],
  ledger_account: ["account_name", "account_code"]
};

export function findDuplicate(type, form, records) {
  const fields = DUPLICATE_FIELDS[type];
  if (!fields || !records?.length) return null;
  return records.find((record) => fields.some((field) => {
    const value = String(form[field] || "").trim().toLowerCase();
    if (!value) return false;
    return String(record[field] || "").trim().toLowerCase() === value;
  }));
}

export function getDuplicateFields(type) {
  return DUPLICATE_FIELDS[type] || [];
}
