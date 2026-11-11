// Identity rules per master type. Each rule is a list of fields that must ALL
// match for two records to be the same master:
// - a one-field rule is a unique identifier (GSTIN, account number, code);
// - a multi-field rule compares descriptive fields as a composite, so items
//   that only share a brand/model/HSN, or warehouses that only share a
//   location, are not treated as duplicates.
// Inside a composite, a field left blank on both records counts as equal.
const IDENTITY_RULES = {
  supplier: [["gstin"], ["supplier_account_number"], ["supplier_name"]],
  department: [["department_name"]],
  item: [["item_name", "brand", "model"]],
  warehouse: [["warehouse_name", "location"]],
  bank: [["account_number"], ["bank_account_name"]],
  institution: [["institution_name"]],
  expense_head: [["expense_head_name"]],
  employee: [["mobile_number"], ["employee_name", "mobile_number"]],
  ledger_account: [["account_code"], ["account_name"]]
};

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function ruleMatches(rule, form, record) {
  // The rule's leading field identifies the master; without it there is nothing to compare.
  if (!normalize(form[rule[0]])) return false;
  return rule.every((field) => normalize(form[field]) === normalize(record[field]));
}

export function findDuplicate(type, form, records) {
  const rules = IDENTITY_RULES[type];
  if (!rules || !records?.length) return null;
  return records.find((record) => rules.some((rule) => ruleMatches(rule, form, record))) || null;
}

export function getDuplicateFields(type) {
  return [...new Set((IDENTITY_RULES[type] || []).flat())];
}
