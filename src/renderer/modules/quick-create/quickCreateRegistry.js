const QUICK_CREATE_ENTITIES = {
  supplier: {
    entityType: "supplier",
    label: "Supplier",
    enabled: true,
    permission: "new",
    dialogType: "supplier",
    minimumForm: "SupplierQuickCreate",
    duplicateGuard: "supplierIdentity",
    workflowGuard: null,
    resultMapper: (record) => ({ id: record.id, label: record.supplier_name || record.supplier_account_name }),
    companyScoped: false,
    auditEvent: "supplier.quick_created",
    allowNestedCreate: true
  },
  department: {
    entityType: "department",
    label: "Government Department",
    enabled: true,
    permission: "new",
    dialogType: "department",
    minimumForm: "DepartmentQuickCreate",
    duplicateGuard: "departmentIdentity",
    workflowGuard: null,
    resultMapper: (record) => ({ id: record.id, label: record.department_name }),
    companyScoped: false,
    auditEvent: "department.quick_created",
    allowNestedCreate: true
  },
  item: {
    entityType: "item",
    label: "Item",
    enabled: true,
    permission: "new",
    dialogType: "item",
    minimumForm: "ItemQuickCreate",
    duplicateGuard: "itemIdentity",
    workflowGuard: null,
    resultMapper: (record) => ({ id: record.id, label: record.item_name, gst_rate: record.gst_rate, hsn: record.hsn_code, unit: record.unit }),
    companyScoped: false,
    auditEvent: "item.quick_created",
    allowNestedCreate: true
  },
  warehouse: {
    entityType: "warehouse",
    label: "Warehouse",
    enabled: true,
    permission: "new",
    dialogType: "warehouse",
    minimumForm: "WarehouseQuickCreate",
    duplicateGuard: "warehouseIdentity",
    workflowGuard: null,
    resultMapper: (record) => ({ id: record.id, label: record.warehouse_name }),
    companyScoped: true,
    auditEvent: "warehouse.quick_created",
    allowNestedCreate: true
  },
  bank: {
    entityType: "bank",
    label: "Bank Account",
    enabled: true,
    permission: "new",
    dialogType: "bank",
    minimumForm: "BankQuickCreate",
    duplicateGuard: "bankIdentity",
    workflowGuard: null,
    resultMapper: (record) => ({ id: record.id, label: record.bank_account_name }),
    companyScoped: true,
    auditEvent: "bank.quick_created",
    allowNestedCreate: true
  },
  institution: {
    entityType: "institution",
    label: "Institution / Consignee",
    enabled: true,
    permission: "new",
    dialogType: "institution",
    minimumForm: "InstitutionQuickCreate",
    duplicateGuard: "institutionIdentity",
    workflowGuard: null,
    resultMapper: (record) => ({ id: record.institution_name, label: record.institution_name, consignee: record.consignee }),
    companyScoped: false,
    auditEvent: "institution.quick_created",
    allowNestedCreate: false
  },
  expense_head: {
    entityType: "expense_head",
    label: "Expense Head",
    enabled: true,
    permission: "new",
    dialogType: "expense_head",
    minimumForm: "ExpenseHeadQuickCreate",
    duplicateGuard: "expenseHeadIdentity",
    workflowGuard: null,
    resultMapper: (record) => ({ id: record.expense_head_name, label: record.expense_head_name }),
    companyScoped: false,
    auditEvent: "expense_head.quick_created",
    allowNestedCreate: true
  },
  employee: {
    entityType: "employee",
    label: "Employee",
    enabled: true,
    permission: "new",
    dialogType: "employee",
    minimumForm: "EmployeeQuickCreate",
    duplicateGuard: "employeeIdentity",
    workflowGuard: null,
    resultMapper: (record) => ({ id: record.id, label: record.employee_name }),
    companyScoped: false,
    auditEvent: "employee.quick_created",
    allowNestedCreate: true
  },
  ledger_account: {
    entityType: "ledger_account",
    label: "Ledger Account",
    enabled: true,
    permission: "account_mapping",
    dialogType: "ledger_account",
    minimumForm: "LedgerAccountQuickCreate",
    duplicateGuard: "ledgerAccountIdentity",
    workflowGuard: null,
    resultMapper: (record) => ({ id: record.id, label: record.account_name || `${record.account_code} - ${record.account_name}` }),
    companyScoped: true,
    auditEvent: "ledger_account.quick_created",
    allowNestedCreate: true
  }
};

const QUICK_CREATE_DENIED_TRANSACTIONS = {
  supply_order: {
    entityType: "supply_order",
    enabled: false,
    denialReason: "Governed transaction quick creation is not certified."
  },
  work_order: {
    entityType: "work_order",
    enabled: false,
    denialReason: "Governed transaction quick creation is not certified."
  },
  purchase_order: {
    entityType: "purchase_order",
    enabled: false,
    denialReason: "Governed transaction quick creation is not certified."
  },
  receipt: {
    entityType: "receipt",
    enabled: false,
    denialReason: "Governed transaction quick creation is not certified."
  },
  payment: {
    entityType: "payment",
    enabled: false,
    denialReason: "Governed transaction quick creation is not certified."
  },
  voucher: {
    entityType: "voucher",
    enabled: false,
    denialReason: "Governed transaction quick creation is not certified."
  },
  invoice: {
    entityType: "invoice",
    enabled: false,
    denialReason: "Governed transaction quick creation is not certified."
  },
  stock_inward: {
    entityType: "stock_inward",
    enabled: false,
    denialReason: "Governed transaction quick creation is not certified."
  },
  delivery: {
    entityType: "delivery",
    enabled: false,
    denialReason: "Governed transaction quick creation is not certified."
  },
  reservation: {
    entityType: "reservation",
    enabled: false,
    denialReason: "Governed transaction quick creation is not certified."
  },
  journal_entry: {
    entityType: "journal_entry",
    enabled: false,
    denialReason: "Governed transaction quick creation is not certified."
  }
};

const ALL_REGISTERED = { ...QUICK_CREATE_ENTITIES, ...QUICK_CREATE_DENIED_TRANSACTIONS };

export function getQuickCreateEntity(type) {
  return ALL_REGISTERED[type] || null;
}

export function isQuickCreateEnabled(type) {
  const entity = ALL_REGISTERED[type];
  return entity ? entity.enabled : false;
}

export function getQuickCreateDenialReason(type) {
  const entity = QUICK_CREATE_DENIED_TRANSACTIONS[type];
  return entity?.denialReason || null;
}

export function isApprovedMaster(type) {
  return Boolean(QUICK_CREATE_ENTITIES[type]?.enabled);
}

export function listApprovedMasters() {
  return Object.values(QUICK_CREATE_ENTITIES).filter((e) => e.enabled).map((e) => e.entityType);
}

export { QUICK_CREATE_ENTITIES, QUICK_CREATE_DENIED_TRANSACTIONS, ALL_REGISTERED };
