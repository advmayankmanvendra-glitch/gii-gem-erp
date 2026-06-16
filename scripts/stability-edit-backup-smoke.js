import fs from "node:fs";
import path from "node:path";
import {
  accountingData,
  approveStockAdjustment,
  approveTransaction,
  billingVoucherData,
  createFinancialYear,
  createManualVoucher,
  createOpeningBalance,
  createPartyOpeningBalance,
  createRecord,
  createReceiptAllocation,
  createSupplierPaymentAllocation,
  dashboardCounts,
  deleteRecord,
  drilldownData,
  initializeDatabase,
  inventoryData,
  listDocuments,
  listRecords,
  orderProfitability,
  postBusinessTransaction,
  postStockAdjustment,
  postStockInward,
  postStockOutward,
  postStockReturn,
  referenceData,
  reverseVoucher,
  saveBillingVoucher,
  saveCreditTerm,
  updateFinancialYearStatus,
  updateRecord,
  uploadDocument
} from "../src/main/database/init.js";
import { createBackup, listBackups, restoreBackup } from "../src/main/services/backup.js";

const root = path.join(process.cwd(), `stability-smoke-${Date.now()}`);
fs.mkdirSync(root, { recursive: true });

const results = [];
let db = initializeDatabase(root);
const suffix = Date.now().toString().slice(-6);

function ok(name, detail = "") {
  results.push({ name, status: "pass", detail });
}

function fail(name, error) {
  results.push({ name, status: "fail", detail: error?.message || String(error) });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectError(name, fn, includes) {
  try {
    fn();
    throw new Error("Expected error was not thrown");
  } catch (error) {
    if (includes && !String(error.message).includes(includes)) throw error;
    ok(name, error.message);
  }
}

function test(name, fn) {
  try {
    const detail = fn();
    ok(name, detail);
  } catch (error) {
    fail(name, error);
  }
}

function createUpdateDelete(table, createPayload, patchField, patchValue, options = {}) {
  const created = createRecord(db, table, createPayload);
  const updated = updateRecord(db, table, created.id, { ...created, [patchField]: patchValue });
  assert(String(updated[patchField]) === String(patchValue), `${table} edit did not persist`);
  const listed = listRecords(db, table, { search: String(patchValue), status: "all" });
  assert(listed.some((row) => row.id === created.id), `${table} updated value not visible in list`);
  assert(updated.updated_at, `${table} updated_at missing`);
  if (options.deleteAfter !== false) {
    deleteRecord(db, table, created.id);
  }
  return created;
}

let company;
let employee;
let department;
let supplier;
let item;
let expenseHead;
let bank;
let warehouse;
let order;
let procurement;
let invoice;
let payment;
let supplierPayment;

test("Master edit: Company", () => {
  company = createUpdateDelete("companies", { company_name: `Smoke Company ${suffix}`, gstin: "", pan: "", address: "A", bank_name: "SBI", account_number: "1", ifsc: "SBIN0000001", status: "active" }, "address", "Edited Address", { deleteAfter: false });
});

test("Master edit: Employee", () => {
  employee = createUpdateDelete("employees", { employee_name: `Smoke Employee ${suffix}`, mobile_number: `90000${suffix}`, designation: "Tester", incentive_percentage: 15, status: "active" }, "designation", "Edited");
});

test("Master edit: Government Department", () => {
  department = createUpdateDelete("government_departments", { department_name: `Smoke Department ${suffix}`, contact_person: "Officer", contact_number: "123", address: "Old", status: "active" }, "address", "New");
});

test("Master edit: Supplier", () => {
  supplier = createUpdateDelete("suppliers", { supplier_name: `Smoke Supplier ${suffix}`, supplier_type: "Vendor", supplier_code: `SUP-${suffix}`, supplier_account_name: `Smoke Supplier ${suffix}`, supplier_account_number: "123456", supplier_bank_name: "HDFC", supplier_bank_ifsc_code: "HDFC0001234", supplier_branch: "Main", supplier_contact: "999", gstin: "", contact_details: "", bank_details: "", remarks: "", status: "active" }, "remarks", "Edited supplier");
});

test("Master edit: Item", () => {
  item = createUpdateDelete("items", { item_name: `Smoke Item ${suffix}`, brand: "Brand", model: "M1", hsn_code: "9403", gst_rate: 18, unit: "Nos", category: "Test", opening_stock: 0, opening_rate: 0, opening_value: 0, reorder_level: 0, minimum_stock_level: 0, maximum_stock_level: 0, track_serial_number: 0, track_batch_number: 0, warranty_period: 0, status: "active" }, "category", "Edited");
});

test("Master edit: Expense Head", () => {
  expenseHead = createUpdateDelete("expense_heads", { expense_head_name: `Smoke Expense ${suffix}`, default_calculation_method: "fixed", default_percentage: 0, category: "Old", status: "active" }, "category", "New");
});

test("Master edit: Bank", () => {
  bank = createUpdateDelete("banks", { company_id: 1, bank_account_name: `Smoke Bank ${suffix}`, bank_name: "Axis", account_number: `10${suffix}`, ifsc: "UTIB0000001", opening_balance: 0, status: "active" }, "opening_balance", 100);
});

test("Master edit: Warehouse", () => {
  warehouse = createUpdateDelete("warehouses", { company_id: 1, warehouse_name: `Smoke Store ${suffix}`, location: "Old", responsible_person: "Keeper", status: "active" }, "location", "New");
});

test("Linked master delete becomes inactive, not hard-delete", () => {
  const before = listRecords(db, "suppliers", { status: "all" }).find((row) => row.id === 1);
  assert(before, "Seed supplier missing");
  deleteRecord(db, "suppliers", 1);
  const after = listRecords(db, "suppliers", { status: "all" }).find((row) => row.id === 1);
  assert(after?.status === "inactive", "Referenced supplier was not marked inactive");
});

test("Operations edit: Supply Order", () => {
  const dept = createRecord(db, "government_departments", { department_name: `Ops Dept ${suffix}`, contact_person: "A", contact_number: "1", address: "Addr", status: "active" });
  const emp = createRecord(db, "employees", { employee_name: `Ops Emp ${suffix}`, mobile_number: `91${suffix}`, designation: "Ops", incentive_percentage: 15, status: "active" });
  order = createRecord(db, "supply_orders", { company_id: 1, order_number: `SO-${suffix}`, order_date: "2026-06-10", department_id: dept.id, institution_name: "Institution", location: "Old", employee_id: emp.id, supply_due_date: "2026-06-30", order_status: "Received", remarks: "" });
  const updated = updateRecord(db, "supply_orders", order.id, { ...order, location: "Edited" });
  assert(updated.location === "Edited", "Supply order edit failed");
});

test("Operations edit: Procurement", () => {
  const sup = createRecord(db, "suppliers", { supplier_name: `Ops Supplier ${suffix}`, status: "active" });
  supplier = sup;
  procurement = createRecord(db, "procurements", { company_id: 1, order_id: order.id, purchase_date: "2026-06-11", supplier_id: sup.id, purchase_invoice_number: `PINV-${suffix}`, purchase_value: 1000, purchase_gst: 180, freight: 0, loading_charges: 0, amount_paid: 0, remarks: "" });
  const updated = updateRecord(db, "procurements", procurement.id, { ...procurement, remarks: "Edited" });
  assert(updated.remarks === "Edited", "Procurement edit failed");
});

test("Operations edit: Expenses", () => {
  const head = createRecord(db, "expense_heads", { expense_head_name: `Ops Expense ${suffix}`, default_calculation_method: "fixed", default_percentage: 0, category: "Ops", status: "active" });
  expenseHead = head;
  const expense = createRecord(db, "expense_entries", { company_id: 1, order_id: order.id, expense_head_id: head.id, expense_category: "Ops", calculation_method: "fixed", percentage: 0, fixed_amount: 50, remarks: "" });
  const updated = updateRecord(db, "expense_entries", expense.id, { ...expense, fixed_amount: 75 });
  assert(Number(updated.fixed_amount) === 75, "Expense edit failed");
});

test("Operations edit: Billing/Invoices", () => {
  const data = billingVoucherData(db);
  const firstItem = data.references.items[0];
  invoice = saveBillingVoucher(db, {
    header: { order_id: order.id, invoice_number: `BILL-${suffix}`, invoice_date: "2026-06-12", billing_value: 1000, gst_rate: 18, invoice_status: "Draft" },
    items: [{ item_id: firstItem.id, description: firstItem.item_name, hsn: firstItem.hsn_code || "", quantity: 1, unit: firstItem.unit || "Nos", billing_rate: 1000, gst_rate: 18 }]
  });
  const updated = saveBillingVoucher(db, {
    header: { ...invoice, remarks: "Edited invoice" },
    items: [{ item_id: firstItem.id, description: firstItem.item_name, hsn: firstItem.hsn_code || "", quantity: 1, unit: firstItem.unit || "Nos", billing_rate: 1100, gst_rate: 18 }]
  });
  assert(Number(updated.billing_value) === 1100, "Billing voucher edit failed");
});

test("Operations edit: Payments", () => {
  payment = createRecord(db, "payments", { company_id: 1, order_id: order.id, payment_date: "2026-06-13", payment_amount: 300, payment_mode: "NEFT", utr_number: `UTR${suffix}`, bank_id: 1, remarks: "" });
  const updated = updateRecord(db, "payments", payment.id, { ...payment, remarks: "Edited payment" });
  assert(updated.remarks === "Edited payment", "Payment edit failed");
});

test("Operations edit: Documents", () => {
  const source = path.join(root, "smoke-document.pdf");
  fs.writeFileSync(source, "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");
  const document = uploadDocument(db, { source_path: source, linked_module: "invoices", linked_record_id: invoice.id, company_id: invoice.company_id, document_type: "Invoice Copy", uploaded_by: null, remarks: "Smoke" });
  assert(listDocuments(db, { module: "invoices" }).some((row) => row.id === document.id), "Uploaded document not listed");
});

test("Inventory edit and lock: Stock Inward", () => {
  const store = createRecord(db, "warehouses", { company_id: 1, warehouse_name: `Ops Store ${suffix}`, location: "WH", responsible_person: "K", status: "active" });
  warehouse = store;
  const stockItem = createRecord(db, "items", { item_name: `Ops Stock ${suffix}`, brand: "", model: "", hsn_code: "9403", gst_rate: 18, unit: "Nos", category: "Stock", opening_stock: 0, opening_rate: 0, opening_value: 0, reorder_level: 0, minimum_stock_level: 0, maximum_stock_level: 0, track_serial_number: 0, track_batch_number: 0, warranty_period: 0, status: "active" });
  item = stockItem;
  const inward = createRecord(db, "stock_inwards", { company_id: 1, order_id: order.id, supplier_id: supplier.id, item_id: stockItem.id, warehouse_id: store.id, inward_date: "2026-06-14", purchase_invoice_number: `STIN-${suffix}`, quantity: 5, rate: 100, gst_rate: 18, landed_cost: 500, remarks: "" });
  const updated = updateRecord(db, "stock_inwards", inward.id, { ...inward, quantity: 6 });
  assert(Number(updated.quantity) === 6, "Stock inward edit failed");
  postStockInward(db, inward.id);
  expectError("Posted Stock Inward locked", () => updateRecord(db, "stock_inwards", inward.id, { ...updated, quantity: 7 }), "Posted transactions are locked");
});

test("Inventory edit and lock: Stock Outward", () => {
  const outward = createRecord(db, "stock_outwards", { company_id: 1, order_id: order.id, department_id: order.department_id, item_id: item.id, warehouse_id: warehouse.id, issue_date: "2026-06-15", delivery_challan_number: `DC-${suffix}`, quantity_issued: 1, remarks: "" });
  const updated = updateRecord(db, "stock_outwards", outward.id, { ...outward, quantity_issued: 2 });
  assert(Number(updated.quantity_issued) === 2, "Stock outward edit failed");
  postStockOutward(db, outward.id);
  expectError("Posted Stock Outward locked", () => deleteRecord(db, "stock_outwards", outward.id), "Posted transactions are locked");
});

test("Inventory edit and lock: Stock Adjustment", () => {
  const adjustment = createRecord(db, "stock_adjustments", { company_id: 1, item_id: item.id, warehouse_id: warehouse.id, adjustment_date: "2026-06-16", adjustment_type: "Increase", quantity: 1, rate: 100, reason: "Smoke", remarks: "" });
  const updated = updateRecord(db, "stock_adjustments", adjustment.id, { ...adjustment, reason: "Edited adjustment" });
  assert(updated.reason === "Edited adjustment", "Stock adjustment edit failed");
  approveStockAdjustment(db, adjustment.id, null, "Smoke approve");
  postStockAdjustment(db, adjustment.id);
  expectError("Posted Stock Adjustment locked", () => updateRecord(db, "stock_adjustments", adjustment.id, { ...updated, quantity: 2 }), "Posted transactions are locked");
});

test("Inventory edit and lock: Stock Return", () => {
  const ret = createRecord(db, "stock_returns", { company_id: 1, return_type: "Department", order_id: order.id, department_id: order.department_id, item_id: item.id, warehouse_id: warehouse.id, return_date: "2026-06-17", quantity: 1, condition_status: "Good", reason: "Smoke", remarks: "" });
  const updated = updateRecord(db, "stock_returns", ret.id, { ...ret, reason: "Edited return" });
  assert(updated.reason === "Edited return", "Stock return edit failed");
  postStockReturn(db, ret.id);
  expectError("Posted Stock Return locked", () => deleteRecord(db, "stock_returns", ret.id), "Posted transactions are locked");
});

test("Accounting controls: manual voucher and lock", () => {
  const accounts = accountingData(db, {}).accounts;
  const cash = accounts.find((row) => row.account_name === "Cash");
  const capital = accounts.find((row) => row.account_name === "Capital");
  const voucher = createManualVoucher(db, { company_id: 1, voucher_date: "2026-06-18", voucher_type: "Journal", narration: "Smoke voucher", lines: [{ account_id: cash.id, debit: 10, credit: 0 }, { account_id: capital.id, debit: 0, credit: 10 }] });
  const reversal = reverseVoucher(db, voucher.id, "Smoke reversal");
  assert(reversal.id, "Voucher reversal was not created");
  expectError("Reversed Voucher locked", () => reverseVoucher(db, voucher.id, "Duplicate reversal"), "already");
});

test("Accounting workflows: allocations, credit terms, opening balances", () => {
  const fy = createFinancialYear(db, { company_id: 1, financial_year_name: `FY Smoke ${suffix}`, start_date: "2028-04-01", end_date: "2029-03-31", status: "Open" });
  const account = accountingData(db, {}).accounts.find((row) => row.account_name === "Cash");
  const ob = createOpeningBalance(db, { company_id: 1, financial_year_id: fy.id, balance_type: "Cash", account_id: account.id, opening_debit: 25, opening_credit: 0, remarks: "Smoke" });
  assert(ob.voucher_id, "Opening balance voucher missing");
  updateFinancialYearStatus(db, fy.id, "Closed", null);
  updateFinancialYearStatus(db, fy.id, "Open", null);
  const credit = saveCreditTerm(db, { company_id: 1, party_type: "department", party_id: order.department_id, default_credit_days: 21, grace_period: 2, due_date_rule: "invoice_date", status: "active" });
  assert(Number(credit.default_credit_days) === 21, "Credit term save failed");
  createPartyOpeningBalance(db, { company_id: 1, party_type: "department", party_id: order.department_id, financial_year_id: fy.id, opening_date: "2028-04-01", opening_debit: 1, opening_credit: 0, remarks: "Smoke party opening" });
  approveTransaction(db, "payment", payment.id, null, "Smoke approval");
});

test("Reports and data views load", () => {
  dashboardCounts(db);
  referenceData(db);
  orderProfitability(db);
  inventoryData(db, {});
  billingVoucherData(db);
  const accounting = accountingData(db, {});
  drilldownData(db, { company_id: 1, voucher_id: accounting.vouchers[0]?.id });
  assert(accounting.trialBalance.length, "Trial Balance did not load");
  assert(accounting.profitLoss, "Profit & Loss did not load");
  assert(accounting.balanceSheet, "Balance Sheet did not load");
  assert(accounting.gstSummary, "GST summary did not load");
});

test("Backup create/list/restore", () => {
  const beforeBackups = listBackups(root).length;
  const backupMeta = createBackup(root);
  const backupPath = typeof backupMeta === "string" ? backupMeta : backupMeta.path;
  const backupFileName = typeof backupMeta === "string" ? path.basename(backupMeta) : backupMeta.fileName;
  assert(fs.existsSync(backupPath), "Backup file missing");
  assert(path.basename(backupPath).includes("gii_gem_erp_"), "Backup filename does not include expected prefix");
  assert(listBackups(root).length === beforeBackups + 1, "Backup list did not refresh");
  const marker = createRecord(db, "expense_heads", { expense_head_name: `Restore Marker ${suffix}`, default_calculation_method: "fixed", default_percentage: 0, category: "Restore", status: "active" });
  assert(listRecords(db, "expense_heads", { search: marker.expense_head_name, status: "all" }).length === 1, "Restore marker not created");
  db.close();
  restoreBackup(backupFileName, root);
  db = initializeDatabase(root);
  assert(listRecords(db, "expense_heads", { search: marker.expense_head_name, status: "all" }).length === 0, "Restore did not return database to backup state");
});

test("Accounting verification after restore", () => {
  const data = accountingData(db, {});
  const debit = data.trialBalance.reduce((sum, row) => sum + Number(row.debit || 0), 0);
  const credit = data.trialBalance.reduce((sum, row) => sum + Number(row.credit || 0), 0);
  assert(Math.round(debit * 100) === Math.round(credit * 100), "Trial balance not balanced after restore");
  return `debit=${debit}; credit=${credit}`;
});

const failed = results.filter((row) => row.status === "fail");
const summary = {
  root,
  passed: results.length - failed.length,
  failed: failed.length,
  results
};

console.log(JSON.stringify(summary, null, 2));

db.close();
fs.rmSync(root, { recursive: true, force: true });

if (failed.length) process.exit(1);
process.exit(0);
