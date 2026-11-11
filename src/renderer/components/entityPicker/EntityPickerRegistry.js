const ENTITY_PICKER_CONFIGS = {
  supplier: {
    entityType: "supplier",
    label: "Supplier",
    labelPlural: "Suppliers",
    searchPlaceholder: "Search supplier by name, code, GSTIN...",
    resultPrimary: (r) => r.supplier_name,
    resultSecondary: (r) => [r.gstin, r.supplier_code].filter(Boolean).join(" | "),
    resultNote: (r) => r.supplier_contact,
    noResultsMessage: "No matching supplier found.",
    quickCreateLabel: (term) => `Create "${term}" as a new supplier`,
    quickCreateType: "supplier",
    initialDefaults: (term) => ({ supplier_name: term })
  },
  item: {
    entityType: "item",
    label: "Item",
    labelPlural: "Items",
    searchPlaceholder: "Search item by name, HSN, brand, model...",
    resultPrimary: (r) => r.item_name,
    resultSecondary: (r) => [r.hsn_code, r.brand, r.model].filter(Boolean).join(" | "),
    resultNote: (r) => r.category ? `${r.category} | ${r.unit || "Nos"}` : r.unit,
    noResultsMessage: "No matching item found.",
    quickCreateLabel: (term) => `Create "${term}" as a new item`,
    quickCreateType: "item",
    initialDefaults: (term) => ({ item_name: term })
  },
  ledger: {
    entityType: "ledger",
    label: "Ledger Account",
    labelPlural: "Ledger Accounts",
    searchPlaceholder: "Search ledger by name or code...",
    resultPrimary: (r) => r.account_name,
    resultSecondary: (r) => r.account_code || "",
    resultNote: (r) => "",
    noResultsMessage: "No matching ledger account found.",
    quickCreateLabel: (term) => `Create "${term}" as a new ledger account`,
    quickCreateType: "ledger_account",
    initialDefaults: (term) => ({ account_name: term })
  },
  supply_order: {
    entityType: "supply_order",
    label: "Supply Order",
    labelPlural: "Supply Orders",
    searchPlaceholder: "Search supply order by number...",
    resultPrimary: (r) => r.order_number,
    resultSecondary: (r) => r.department_name || "",
    resultNote: (r) => `${r.order_date || ""} | ${r.order_status || ""}`,
    noResultsMessage: "No matching supply order found.",
    quickCreateLabel: null,
    quickCreateType: null,
    initialDefaults: null
  },
  department: {
    entityType: "department",
    label: "Department",
    labelPlural: "Departments",
    searchPlaceholder: "Search department by name...",
    resultPrimary: (r) => r.department_name,
    resultSecondary: (r) => r.contact_person || "",
    resultNote: (r) => r.contact_number || "",
    noResultsMessage: "No matching department found.",
    quickCreateLabel: (term) => `Create "${term}" as a new department`,
    quickCreateType: "department",
    initialDefaults: (term) => ({ department_name: term })
  },
  warehouse: {
    entityType: "warehouse",
    label: "Warehouse",
    labelPlural: "Warehouses",
    searchPlaceholder: "Search warehouse by name or location...",
    resultPrimary: (r) => r.warehouse_name,
    resultSecondary: (r) => r.location || "",
    resultNote: (r) => "",
    noResultsMessage: "No matching warehouse found.",
    quickCreateLabel: (term) => `Create "${term}" as a new warehouse`,
    quickCreateType: "warehouse",
    initialDefaults: (term) => ({ warehouse_name: term })
  },
  employee: {
    entityType: "employee",
    label: "Employee",
    labelPlural: "Employees",
    searchPlaceholder: "Search employee by name...",
    resultPrimary: (r) => r.employee_name,
    resultSecondary: (r) => r.designation || "",
    resultNote: (r) => r.mobile_number || "",
    noResultsMessage: "No matching employee found.",
    quickCreateLabel: (term) => `Create "${term}" as a new employee`,
    quickCreateType: "employee",
    initialDefaults: (term) => ({ employee_name: term })
  },
  bank: {
    entityType: "bank",
    label: "Bank Account",
    labelPlural: "Bank Accounts",
    searchPlaceholder: "Search bank by account name or number...",
    resultPrimary: (r) => r.bank_account_name,
    resultSecondary: (r) => r.bank_name || "",
    resultNote: (r) => r.account_number || "",
    noResultsMessage: "No matching bank account found.",
    quickCreateLabel: (term) => `Create "${term}" as a new bank account`,
    quickCreateType: "bank",
    initialDefaults: (term) => ({ bank_account_name: term })
  },
  expense_head: {
    entityType: "expense_head",
    label: "Expense Head",
    labelPlural: "Expense Heads",
    searchPlaceholder: "Search expense head by name...",
    resultPrimary: (r) => r.expense_head_name,
    resultSecondary: (r) => r.category || "",
    resultNote: (r) => "",
    noResultsMessage: "No matching expense head found.",
    quickCreateLabel: (term) => `Create "${term}" as a new expense head`,
    quickCreateType: "expense_head",
    initialDefaults: (term) => ({ expense_head_name: term })
  }
};

export function getEntityPickerConfig(type) {
  return ENTITY_PICKER_CONFIGS[type] || null;
}

export const SUPPORTED_PICKER_TYPES = Object.keys(ENTITY_PICKER_CONFIGS);
