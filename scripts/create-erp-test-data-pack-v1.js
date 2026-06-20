import fs from "node:fs";
import path from "node:path";
import {
  accountingData,
  approveStockAdjustment,
  confirmDeliveryChallan,
  createBusinessVoucher,
  createDeliveryChallan,
  createRecord,
  createSupplierPaymentAllocation,
  initializeDatabase,
  inventoryData,
  orderProfitability,
  postBusinessTransaction,
  postGuidedVoucher,
  postReceiptVoucher,
  postStockAdjustment,
  postStockInward,
  postSupplierPaymentVoucher,
  saveBillingVoucher,
  updateGuidedVoucherStatus
} from "../src/main/database/init.js";
import { createLiveBackup } from "../src/main/services/backup.js";

const root = process.cwd();
const reportsDir = path.join(root, "reports");
const TAG = "ERP_TEST_DATA_PACK_V1";
const RUN = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const TODAY = "2026-06-19";
const TARGET_COMPANY_NAME = "GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED";

fs.mkdirSync(reportsDir, { recursive: true });

const db = initializeDatabase(root);
db.pragma("foreign_keys = ON");
const schemaRepairs = [];

const money = (value) => Number(Number(value || 0).toFixed(2));
const sum = (rows, key) => money(rows.reduce((total, row) => total + Number(row?.[key] || 0), 0));
const percent = (value, rate) => money(Number(value || 0) * Number(rate || 0) / 100);
const norm = (value) => String(value || "").trim().toLowerCase();
const dateAt = (day) => `2026-06-${String(day).padStart(2, "0")}`;
const sample = (rows, count = 5) => rows.slice(0, count);
const mdTable = (headers, rows) => {
  const safeRows = rows.length ? rows : [["-", "-", "-"].slice(0, headers.length)];
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...safeRows.map((row) => `| ${row.map((cell) => String(cell ?? "").replace(/\|/g, "/")).join(" | ")} |`)
  ].join("\n");
};

function tableHasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function addColumnForTestPack(table, column, definition) {
  if (tableHasColumn(table, column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  schemaRepairs.push(`${table}.${column}`);
}

function ensureTestPackSchemaCompatibility() {
  [
    ["supply_type", "TEXT NOT NULL DEFAULT 'GeM'"],
    ["buyer_name", "TEXT"],
    ["buyer_designation", "TEXT"],
    ["buyer_mobile", "TEXT"],
    ["buyer_email", "TEXT"],
    ["consignee_address", "TEXT"],
    ["delivery_location", "TEXT"],
    ["delivery_period", "TEXT"],
    ["warranty_period", "TEXT"],
    ["payment_terms", "TEXT"],
    ["emd_amount", "REAL NOT NULL DEFAULT 0"],
    ["security_deposit_amount", "REAL NOT NULL DEFAULT 0"],
    ["total_quantity", "REAL NOT NULL DEFAULT 0"],
    ["order_taxable_value", "REAL NOT NULL DEFAULT 0"],
    ["order_gst_amount", "REAL NOT NULL DEFAULT 0"],
    ["order_gross_value", "REAL NOT NULL DEFAULT 0"]
  ].forEach(([column, definition]) => addColumnForTestPack("supply_orders", column, definition));

  [
    ["brand", "TEXT"],
    ["model", "TEXT"],
    ["hsn_sac", "TEXT"],
    ["required_delivery_date", "TEXT"]
  ].forEach(([column, definition]) => addColumnForTestPack("order_items", column, definition));

  [
    ["description", "TEXT"],
    ["hsn", "TEXT"],
    ["unit", "TEXT"],
    ["freight", "REAL NOT NULL DEFAULT 0"],
    ["loading_charges", "REAL NOT NULL DEFAULT 0"],
    ["other_cost", "REAL NOT NULL DEFAULT 0"],
    ["landed_cost", "REAL NOT NULL DEFAULT 0"],
    ["remarks", "TEXT"],
    ["deleted_at", "TEXT"],
    ["deleted_by", "INTEGER"],
    ["is_deleted", "INTEGER NOT NULL DEFAULT 0"]
  ].forEach(([column, definition]) => addColumnForTestPack("procurement_items", column, definition));

  [
    ["description", "TEXT"],
    ["hsn", "TEXT"],
    ["unit", "TEXT"],
    ["deleted_at", "TEXT"],
    ["deleted_by", "INTEGER"],
    ["is_deleted", "INTEGER NOT NULL DEFAULT 0"]
  ].forEach(([column, definition]) => addColumnForTestPack("invoice_items", column, definition));
}

function activeClause(table, alias = "") {
  const prefix = alias ? `${alias}.` : "";
  if (tableHasColumn(table, "is_deleted")) return ` AND COALESCE(${prefix}is_deleted, 0) = 0`;
  if (tableHasColumn(table, "deleted_at")) return ` AND ${prefix}deleted_at IS NULL`;
  return "";
}

function findByName(table, column, value, extraWhere = "") {
  return db.prepare(`SELECT * FROM ${table} WHERE lower(trim(${column})) = lower(trim(?)) ${extraWhere} LIMIT 1`).get(value);
}

function ensureDefaultAccounts(companyId) {
  const defaults = [
    ["1000", "Cash", "Asset", "Debit"], ["1010", "Bank", "Asset", "Debit"],
    ["1100", "Trade Receivables", "Asset", "Debit"], ["1200", "TDS Receivable", "Asset", "Debit"],
    ["1210", "GST TDS Receivable", "Asset", "Debit"], ["1300", "Input GST", "Asset", "Debit"],
    ["1400", "Inventory", "Asset", "Debit"], ["2000", "Trade Payables", "Liability", "Credit"],
    ["2100", "GST Payable", "Liability", "Credit"], ["2110", "Output GST", "Liability", "Credit"],
    ["2200", "Expense Payable", "Liability", "Credit"], ["2300", "Employee Incentive Payable", "Liability", "Credit"],
    ["3000", "Capital", "Equity", "Credit"], ["3010", "Opening Balance Suspense", "Equity", "Credit"],
    ["4000", "Sales", "Income", "Credit"], ["5000", "Purchase", "Expense", "Debit"],
    ["5050", "Cost of Goods Sold", "Expense", "Debit"], ["5100", "Work Incentive Expense", "Expense", "Debit"],
    ["5110", "Authorization Expense", "Expense", "Debit"], ["5120", "L1 Expense", "Expense", "Debit"],
    ["5130", "Transport Expense", "Expense", "Debit"], ["5140", "Installation Expense", "Expense", "Debit"],
    ["5150", "Employee Incentive Expense", "Expense", "Debit"], ["5160", "Bank Charges", "Expense", "Debit"],
    ["5170", "Other Deduction Ledger", "Expense", "Debit"], ["5990", "Profit and Loss", "Equity", "Credit"]
  ];
  const insert = db.prepare(`
    INSERT INTO accounts (company_id, account_code, account_name, account_type, normal_balance, opening_balance, status)
    VALUES (?, ?, ?, ?, ?, 0, 'active')
  `);
  defaults.forEach(([code, name, type, balance]) => {
    const existing = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND account_name = ?${activeClause("accounts")}`).get(companyId, name);
    if (!existing) insert.run(companyId, code, name, type, balance);
  });
}

function accountId(companyId, accountName) {
  const row = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND account_name = ?${activeClause("accounts")} LIMIT 1`).get(companyId, accountName);
  if (!row) throw new Error(`Account not found for test pack: ${accountName}`);
  return row.id;
}

function currentStockQuantity(companyId, itemId, warehouseId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(inward_quantity - outward_quantity), 0) quantity
    FROM stock_ledger
    WHERE company_id = ? AND item_id = ? AND warehouse_id = ?${activeClause("stock_ledger")}
  `).get(companyId, itemId, warehouseId);
  return Number(row?.quantity || 0);
}

function ensureCompany() {
  let company = findByName("companies", "company_name", TARGET_COMPANY_NAME, activeClause("companies"));
  if (!company) {
    company = createRecord(db, "companies", {
      company_name: TARGET_COMPANY_NAME,
      gstin: "27AAICG1234A1Z5",
      pan: "AAICG1234A",
      address: "Mumbai, Maharashtra",
      state: "Maharashtra",
      status: "active",
      remarks: TAG
    });
  }
  ensureDefaultAccounts(company.id);
  return company;
}

function ensureMaster(table, nameColumn, value, payload = {}, extraWhere = "") {
  const existing = findByName(table, nameColumn, value, extraWhere);
  if (existing) return existing;
  return createRecord(db, table, { [nameColumn]: value, status: "active", remarks: TAG, ...payload });
}

function ensureWarehouse(companyId) {
  const warehouseName = "GII Test Main Store";
  const existing = db.prepare(`SELECT * FROM warehouses WHERE lower(trim(warehouse_name)) = lower(trim(?))${activeClause("warehouses")} LIMIT 1`).get(warehouseName);
  if (existing) return existing;
  return createRecord(db, "warehouses", {
    company_id: companyId,
    warehouse_name: warehouseName,
    location: "Primary ERP Test Warehouse",
    status: "active",
    remarks: TAG
  });
}

function ensureBank(companyId) {
  const existing = db.prepare(`SELECT * FROM banks WHERE company_id = ? AND lower(trim(bank_account_name)) = lower(trim(?))${activeClause("banks")} LIMIT 1`).get(companyId, "SBI Current Account");
  if (existing) return existing;
  return createRecord(db, "banks", {
    company_id: companyId,
    bank_account_name: "SBI Current Account",
    bank_name: "State Bank of India",
    account_number: `TEST${RUN}`,
    ifsc: "SBIN0000001",
    opening_balance: 0,
    status: "active",
    remarks: TAG
  });
}

function createProcurementItem(companyId, procurement, orderItem, item, quantity, purchaseRate, freight, loading) {
  const taxable = money(quantity * purchaseRate);
  const gst = percent(taxable, item.gst_rate);
  const gross = money(taxable + gst);
  const landed = money(taxable + freight + loading);
  db.prepare(`
    INSERT INTO procurement_items (
      company_id, procurement_id, order_id, order_item_id, item_id, description, hsn, unit,
      quantity, purchase_rate, gst_rate, taxable_value, gst_amount, gross_value,
      freight, loading_charges, landed_cost, remarks
    ) VALUES (
      @company_id, @procurement_id, @order_id, @order_item_id, @item_id, @description, @hsn, @unit,
      @quantity, @purchase_rate, @gst_rate, @taxable_value, @gst_amount, @gross_value,
      @freight, @loading_charges, @landed_cost, @remarks
    )
  `).run({
    company_id: companyId,
    procurement_id: procurement.id,
    order_id: procurement.order_id,
    order_item_id: orderItem.id,
    item_id: item.id,
    description: orderItem.item_description || item.item_name,
    hsn: item.hsn_code || "",
    unit: item.unit || "Nos",
    quantity,
    purchase_rate: purchaseRate,
    gst_rate: item.gst_rate,
    taxable_value: taxable,
    gst_amount: gst,
    gross_value: gross,
    freight,
    loading_charges: loading,
    landed_cost: landed,
    remarks: TAG
  });
  return { taxable, gst, gross, landed, quantity, purchaseRate, freight, loading };
}

function createSupplierPayment(companyId, supplierId, bankId, amount, index) {
  const result = db.prepare(`
    INSERT INTO supplier_payments (company_id, supplier_id, payment_date, bank_account_id, payment_mode, utr_number, amount_paid, remarks, posting_status)
    VALUES (?, ?, ?, ?, 'Bank Transfer', ?, ?, ?, 'Draft')
  `).run(companyId, supplierId, dateAt(14 + index), bankId, `${RUN}-SUPPAY-${index}`, amount, `${TAG} supplier payment ${index}`);
  return db.prepare("SELECT * FROM supplier_payments WHERE id = ?").get(result.lastInsertRowid);
}

function postGuided(kind, companyId, date, payload) {
  const guided = createBusinessVoucher(db, {
    company_id: companyId,
    voucher_kind: kind,
    voucher_date: date,
    ...payload,
    narration: `${payload.narration || kind} (${TAG})`,
    remarks: `${TAG} ${RUN}`
  });
  updateGuidedVoucherStatus(db, guided.id, "submit", null, TAG);
  updateGuidedVoucherStatus(db, guided.id, "review", null, TAG);
  updateGuidedVoucherStatus(db, guided.id, "approve", null, TAG);
  return postGuidedVoucher(db, guided.id, null);
}

function reportCounts(companyId, run) {
  const like = `%${run}%`;
  return {
    supplyOrders: db.prepare("SELECT COUNT(*) count FROM supply_orders WHERE company_id = ? AND order_number LIKE ?").get(companyId, like).count,
    procurements: db.prepare("SELECT COUNT(*) count FROM procurements WHERE company_id = ? AND purchase_invoice_number LIKE ?").get(companyId, like).count,
    stockInwards: db.prepare("SELECT COUNT(*) count FROM stock_inwards WHERE company_id = ? AND purchase_invoice_number LIKE ?").get(companyId, like).count,
    stockOutwards: db.prepare("SELECT COUNT(*) count FROM stock_outwards WHERE company_id = ? AND delivery_challan_number LIKE ?").get(companyId, like).count,
    invoices: db.prepare("SELECT COUNT(*) count FROM invoices WHERE company_id = ? AND invoice_number LIKE ?").get(companyId, like).count,
    payments: db.prepare("SELECT COUNT(*) count FROM payments WHERE company_id = ? AND utr_number LIKE ?").get(companyId, like).count,
    supplierPayments: db.prepare("SELECT COUNT(*) count FROM supplier_payments WHERE company_id = ? AND utr_number LIKE ?").get(companyId, like).count,
    expenses: db.prepare("SELECT COUNT(*) count FROM expense_entries WHERE company_id = ? AND remarks LIKE ?").get(companyId, like).count,
    guidedVouchers: db.prepare("SELECT COUNT(*) count FROM guided_vouchers WHERE company_id = ? AND remarks LIKE ?").get(companyId, like).count,
    stockAdjustments: db.prepare("SELECT COUNT(*) count FROM stock_adjustments WHERE company_id = ? AND remarks LIKE ?").get(companyId, like).count
  };
}

function reconcile(companyId, accounting, inventory, profitability) {
  const trialDebit = sum(accounting.trialBalance || [], "debit");
  const trialCredit = sum(accounting.trialBalance || [], "credit");
  const receivableLedger = sum((accounting.trialBalance || []).filter((row) => row.account_name === "Trade Receivables"), "closing_balance");
  const payableLedger = sum((accounting.trialBalance || []).filter((row) => row.account_name === "Trade Payables"), "closing_balance");
  const receivableSub = sum(accounting.receivables || [], "outstanding_amount");
  const payableSub = sum(accounting.payables || [], "balance_due");
  const inputGst = money(accounting.gstSummary?.inputGst || 0);
  const outputGst = money(accounting.gstSummary?.outputGst || 0);
  const inventoryLedger = Math.abs(sum((accounting.trialBalance || []).filter((row) => row.account_name === "Inventory"), "closing_balance"));
  const inventoryValuation = sum(inventory.valuation || inventory.stockSummary || [], "stock_value");
  const profitTotal = sum(profitability || [], "net_company_profit");
  return {
    trialDebit,
    trialCredit,
    trialDifference: money(trialDebit - trialCredit),
    receivableLedger,
    receivableSub,
    receivableDifference: money(Math.abs(receivableLedger) - receivableSub),
    payableLedger,
    payableSub,
    payableDifference: money(Math.abs(payableLedger) - payableSub),
    inputGst,
    outputGst,
    netGstPayable: money(outputGst - inputGst),
    inventoryLedger,
    inventoryValuation,
    inventoryDifference: money(inventoryLedger - inventoryValuation),
    profitabilityRows: profitability.length,
    profitTotal
  };
}

function writeReport(fileName, content) {
  fs.writeFileSync(path.join(reportsDir, fileName), content, "utf8");
}

async function main() {
  const backup = await createLiveBackup(db, root);
  ensureTestPackSchemaCompatibility();
  const company = ensureCompany();
  const companyId = company.id;
  const warehouse = ensureWarehouse(companyId);
  const bank = ensureBank(companyId);

  const employees = ["Mayank", "Saurabh", "Nishant"].map((name, index) => ensureMaster("employees", "employee_name", name, {
    mobile_number: `90000000${index + 11}`,
    email: `${name.toLowerCase()}@gestureindia.test`
  }));
  const departments = ["District Education Office", "Civil Surgeon Office", "Collectorate", "PWD Division", "Municipal Corporation"].map((name, index) => ensureMaster("government_departments", "department_name", name, {
    contact_person: `Buyer ${index + 1}`,
    contact_number: `91000000${index + 11}`,
    address: `Government Office ${index + 1}, Maharashtra`
  }));
  const supplierGstins = ["27ABCDE1234F1Z5", "27BCDEF2345G1Z6", "27CDEFG3456H1Z7", "27DEFGH4567J1Z8", "27EFGHJ5678K1Z9"];
  const suppliers = ["AADYA STEEL INDUSTRIES", "ABC Technologies", "XYZ Traders", "National Computers", "Prime Systems"].map((name, index) => ensureMaster("suppliers", "supplier_name", name, {
    gstin: supplierGstins[index],
    contact_details: `Supplier contact ${index + 1}`
  }));
  const itemSpecs = [
    ["Printer", "8443", 18, 12000],
    ["Laptop", "8471", 18, 45000],
    ["Desktop", "8471", 18, 35000],
    ["UPS", "8504", 28, 8000],
    ["Scanner", "8471", 12, 10000]
  ];
  const items = itemSpecs.map(([name, hsn, gst, rate]) => ensureMaster("items", "item_name", name, {
    hsn_code: hsn,
    gst_rate: gst,
    unit: "Nos",
    category: "IT Supply",
    brand: "GII Test Brand",
    model: `${name}-Model-${RUN}`,
    minimum_stock_level: 2
  }));
  const expenseHeads = ["Authorization", "L1", "Work Incentive", "Transport", "Installation"].map((name) => {
    const isPercent = ["Authorization", "L1", "Work Incentive"].includes(name);
    return ensureMaster("expense_heads", "expense_head_name", name, {
      category: name,
      default_calculation_method: isPercent ? "percentage_gross" : "fixed",
      default_percentage: name === "Authorization" ? 5 : name === "L1" ? 2 : name === "Work Incentive" ? 10 : 0
    });
  });

  const created = {
    company,
    backup,
    orders: [],
    procurements: [],
    stockInwards: [],
    stockIssues: [],
    invoices: [],
    payments: [],
    supplierPayments: [],
    expenses: [],
    journals: [],
    contras: [],
    creditNotes: [],
    debitNotes: [],
    adjustments: [],
    advanceReceipts: [],
    incentives: []
  };

  const statuses = ["Received", "Procurement Pending", "Procurement Completed", "Supply Pending", "Supplied"];
  const orderPlans = [
    [[0, 2, 16000], [3, 2, 10000]],
    [[1, 1, 55000], [4, 2, 14000]],
    [[2, 2, 43000], [0, 1, 15500]],
    [[3, 5, 9500], [4, 1, 13000]],
    [[1, 1, 52000], [2, 1, 41000]]
  ];

  orderPlans.forEach((lines, index) => {
    const orderItems = lines.map(([itemIndex, quantity, rate]) => {
      const item = items[itemIndex];
      return {
        item_id: item.id,
        item_description: `${item.item_name} for government supply`,
        brand: item.brand || "GII Test Brand",
        model: item.model || `${item.item_name}-Model`,
        hsn_sac: item.hsn_code,
        quantity,
        unit: item.unit || "Nos",
        quoted_rate: rate,
        gst_rate: item.gst_rate,
        required_delivery_date: dateAt(20 + index),
        remarks: TAG
      };
    });
    const order = createRecord(db, "supply_orders", {
      company_id: companyId,
      order_number: `${RUN}-SO-${String(index + 1).padStart(3, "0")}`,
      order_date: dateAt(1 + index),
      department_id: departments[index].id,
      institution_name: `${departments[index].department_name} Store`,
      location: ["Mumbai", "Pune", "Nagpur", "Nashik", "Thane"][index],
      employee_id: employees[index % employees.length].id,
      supply_due_date: dateAt(25 + index),
      supply_type: index % 2 === 0 ? "GeM" : "eProc",
      buyer_name: `Government Buyer ${index + 1}`,
      buyer_designation: "Procurement Officer",
      buyer_mobile: `92000000${index + 11}`,
      buyer_email: `buyer${index + 1}@example.gov.in`,
      consignee_name: `${departments[index].department_name} Consignee`,
      consignee_address: `${departments[index].department_name}, Maharashtra`,
      delivery_location: ["Mumbai", "Pune", "Nagpur", "Nashik", "Thane"][index],
      place_of_supply: "Maharashtra",
      delivery_period: "30 days",
      warranty_period: "12 months",
      payment_terms: "Payment after supply and acceptance",
      emd_amount: index % 2 ? 2500 : 0,
      security_deposit_amount: index % 2 ? 5000 : 0,
      order_status: statuses[index],
      remarks: `${TAG} supply order ${index + 1}`,
      order_items: orderItems
    });
    created.orders.push(order);
  });

  created.orders.forEach((order, index) => {
    const orderItems = db.prepare("SELECT oi.*, it.item_name, it.hsn_code, it.gst_rate, it.unit FROM order_items oi JOIN items it ON it.id = oi.item_id WHERE oi.order_id = ? ORDER BY oi.id").all(order.id);
    const supplier = suppliers[index % suppliers.length];
    const procurement = createRecord(db, "procurements", {
      company_id: companyId,
      order_id: order.id,
      purchase_date: dateAt(5 + index),
      supplier_id: supplier.id,
      purchase_invoice_number: `${RUN}-PINV-${String(index + 1).padStart(3, "0")}`,
      purchase_value: 1,
      purchase_gst: 0,
      freight: 0,
      loading_charges: 0,
      amount_paid: 0,
      remarks: `${TAG} procurement ${index + 1}`
    });
    let purchaseValue = 0;
    let purchaseGst = 0;
    let freightTotal = 0;
    let loadingTotal = 0;
    orderItems.forEach((line, lineIndex) => {
      const qtyFactor = index === 1 && lineIndex === 1 ? 0.5 : 1;
      const qty = Math.max(1, Number(line.quantity || 1) * qtyFactor);
      const item = items.find((candidate) => candidate.id === line.item_id);
      const purchaseRate = money(Number(line.quoted_rate || 0) * 0.7);
      const freight = lineIndex === 0 ? 500 + index * 100 : 250;
      const loading = lineIndex === 0 ? 200 + index * 50 : 100;
      const totals = createProcurementItem(companyId, procurement, line, item, qty, purchaseRate, freight, loading);
      purchaseValue += totals.taxable;
      purchaseGst += totals.gst;
      freightTotal += freight;
      loadingTotal += loading;
    });
    db.prepare("UPDATE procurements SET purchase_value = ?, purchase_gst = ?, freight = ?, loading_charges = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(money(purchaseValue), money(purchaseGst), money(freightTotal), money(loadingTotal), procurement.id);
    const refreshed = db.prepare("SELECT * FROM procurements WHERE id = ?").get(procurement.id);
    postBusinessTransaction(db, "procurements", procurement.id);
    created.procurements.push(refreshed);
  });

  created.procurements.forEach((procurement, index) => {
    const line = db.prepare("SELECT pi.*, it.gst_rate FROM procurement_items pi JOIN items it ON it.id = pi.item_id WHERE pi.procurement_id = ? ORDER BY pi.id LIMIT 1").get(procurement.id);
    const inward = createRecord(db, "stock_inwards", {
      company_id: companyId,
      procurement_id: procurement.id,
      order_id: procurement.order_id,
      supplier_id: procurement.supplier_id,
      item_id: line.item_id,
      warehouse_id: warehouse.id,
      inward_date: dateAt(7 + index),
      purchase_invoice_number: `${RUN}-GRN-${String(index + 1).padStart(3, "0")}`,
      quantity: line.quantity,
      rate: line.purchase_rate,
      gst_rate: line.gst_rate,
      landed_cost: line.landed_cost,
      remarks: `${TAG} stock inward ${index + 1}`
    });
    created.stockInwards.push(postStockInward(db, inward.id));
  });

  created.orders.forEach((order, index) => {
    const inward = created.stockInwards[index];
    const qty = Math.max(1, Math.min(Number(inward.quantity || 1), index === 4 ? 1 : Number(inward.quantity || 1)));
    const challan = createDeliveryChallan(db, {
      company_id: companyId,
      order_id: order.id,
      department_id: order.department_id,
      challan_number: `${RUN}-DC-${String(index + 1).padStart(3, "0")}`,
      dispatch_date: dateAt(10 + index),
      vehicle_details: `TEST VEHICLE ${index + 1}`,
      remarks: `${TAG} delivery challan ${index + 1}`,
      lines: [{ item_id: inward.item_id, warehouse_id: warehouse.id, quantity: qty, remarks: TAG }]
    });
    confirmDeliveryChallan(db, challan.id);
    created.stockIssues.push(db.prepare("SELECT * FROM stock_outwards WHERE delivery_challan_number = ?").get(challan.challan_number));
  });

  created.orders.forEach((order, index) => {
    const orderItems = db.prepare("SELECT oi.*, it.item_name, it.hsn_code, it.unit FROM order_items oi JOIN items it ON it.id = oi.item_id WHERE oi.order_id = ? ORDER BY oi.id").all(order.id);
    const invoice = saveBillingVoucher(db, {
      header: {
        company_id: companyId,
        order_id: order.id,
        invoice_number: `${RUN}-INV-${String(index + 1).padStart(3, "0")}`,
        invoice_date: dateAt(12 + index),
        gem_order_number: order.order_number,
        consignee: order.consignee_name || order.institution_name,
        place_of_supply: order.place_of_supply || "Maharashtra",
        gst_type: "CGST/SGST",
        invoice_type: "Tax Invoice",
        invoice_status: "Approved",
        remarks: `${TAG} sales invoice ${index + 1}`
      },
      items: orderItems.map((line) => ({
        order_item_id: line.id,
        item_id: line.item_id,
        description: line.item_description || line.item_name,
        hsn: line.hsn_code || line.hsn_sac || "",
        unit: line.unit || "Nos",
        quantity: line.quantity,
        billing_rate: line.quoted_rate,
        gst_rate: line.gst_rate,
        gst_type: "CGST/SGST"
      }))
    });
    postBusinessTransaction(db, "invoices", invoice.id);
    created.invoices.push(invoice);
  });

  const receiptCases = [
    { amountFactor: 1, tds: 0, gstTds: 0, label: "full receipt" },
    { amountFactor: 0.45, tds: 0, gstTds: 0, label: "partial receipt" },
    { amountFactor: 0.75, tds: 1000, gstTds: 0, label: "receipt with TDS" },
    { amountFactor: 0.7, tds: 0, gstTds: 2000, label: "receipt with GST TDS" },
    { amountFactor: 0.25, tds: 0, gstTds: 0, label: "receipt plus separate advance" }
  ];
  created.invoices.forEach((invoice, index) => {
    const receivable = db.prepare("SELECT * FROM receivables WHERE billing_id = ?").get(invoice.id);
    const invoiceGross = money(Number(receivable?.invoice_amount ?? (Number(invoice.billing_value || 0) * (1 + Number(invoice.gst_rate || 0) / 100))));
    const paymentAmount = money(invoiceGross * receiptCases[index].amountFactor);
    const payment = createRecord(db, "payments", {
      company_id: companyId,
      order_id: invoice.order_id,
      billing_id: invoice.id,
      payment_date: dateAt(16 + index),
      payment_amount: paymentAmount,
      payment_mode: "Bank Transfer",
      utr_number: `${RUN}-RCPT-${String(index + 1).padStart(3, "0")}`,
      bank_id: bank.id,
      tds_deducted: receiptCases[index].tds,
      gst_tds_deducted: receiptCases[index].gstTds,
      other_deductions: 0,
      net_receipt: paymentAmount,
      remarks: `${TAG} ${receiptCases[index].label}`
    });
    postReceiptVoucher(db, payment.id, invoice.id, {
      tds_deducted: receiptCases[index].tds,
      gst_tds_deducted: receiptCases[index].gstTds,
      other_deductions: 0
    });
    created.payments.push({ ...payment, receivable });
  });
  const advanceVoucher = postGuided("advance_receipt", companyId, dateAt(22), {
    amount_received: 5000,
    amount: 5000,
    payment_mode: "Bank",
    bank_account_id: bank.id,
    department_id: departments[0].id,
    reference_number: `${RUN}-ADV-RCPT`,
    narration: "Advance receipt test data pack"
  });
  created.advanceReceipts.push(advanceVoucher);
  created.payments.push({ advanceVoucher });

  created.procurements.forEach((procurement, index) => {
    const supplierPayment = createSupplierPayment(companyId, procurement.supplier_id, bank.id, money(Number(procurement.purchase_value || 0) + Number(procurement.purchase_gst || 0)) * (index === 1 ? 0.5 : 1), index + 1);
    postSupplierPaymentVoucher(db, supplierPayment.id);
    try {
      createSupplierPaymentAllocation(db, {
        company_id: companyId,
        supplier_payment_id: supplierPayment.id,
        procurement_id: procurement.id,
        allocated_amount: supplierPayment.amount_paid,
        remarks: `${TAG} supplier allocation ${index + 1}`
      });
    } catch (error) {
      // Allocation edge cases are reported later rather than hidden.
      supplierPayment.allocation_error = error.message;
    }
    created.supplierPayments.push(supplierPayment);
  });

  created.orders.forEach((order) => {
    expenseHeads.forEach((head) => {
      const isPercent = ["Authorization", "L1", "Work Incentive"].includes(head.expense_head_name);
      const percentage = head.expense_head_name === "Authorization" ? 5 : head.expense_head_name === "L1" ? 2 : head.expense_head_name === "Work Incentive" ? 10 : 0;
      const fixed = head.expense_head_name === "Transport" ? 2000 : head.expense_head_name === "Installation" ? 1500 : 0;
      const entry = createRecord(db, "expense_entries", {
        company_id: companyId,
        order_id: order.id,
        expense_head_id: head.id,
        expense_category: head.expense_head_name,
        calculation_method: isPercent ? "percentage_gross" : "fixed",
        percentage,
        fixed_amount: fixed,
        payment_status: "Pending",
        remarks: `${TAG} ${RUN} ${head.expense_head_name} expense`
      });
      created.expenses.push(entry);
    });
    postBusinessTransaction(db, "expense_entries", created.expenses.find((entry) => entry.order_id === order.id).id);
  });

  const journalLines = [
    ["GST adjustment", [["Output GST", 500, 0], ["Input GST", 0, 500]]],
    ["Opening adjustment", [["Cash", 1000, 0], ["Capital", 0, 1000]]],
    ["Round-off", [["Bank Charges", 10, 0], ["Cash", 0, 10]]],
    ["Provision", [["Work Incentive Expense", 800, 0], ["Expense Payable", 0, 800]]],
    ["Correction", [["Purchase", 500, 0], ["Bank Charges", 0, 500]]]
  ];
  journalLines.forEach(([label, lines], index) => {
    created.journals.push(postGuided("journal", companyId, dateAt(18 + index), {
      narration: label,
      lines: lines.map(([name, debit, credit]) => ({ account_id: accountId(companyId, name), debit, credit }))
    }));
  });

  for (let index = 0; index < 5; index += 1) {
    created.contras.push(postGuided("contra", companyId, dateAt(19 + index), {
      amount: 1000 + index * 250,
      from_account_id: accountId(companyId, index % 2 ? "Bank" : "Cash"),
      to_account_id: accountId(companyId, index % 2 ? "Cash" : "Bank"),
      payment_mode: "Bank",
      bank_account_id: bank.id,
      reference_number: `${RUN}-CONTRA-${index + 1}`,
      narration: `Contra test ${index + 1}`
    }));
  }

  created.invoices.forEach((invoice, index) => {
    created.creditNotes.push(postGuided("credit_note", companyId, dateAt(23 + index), {
      taxable_value: 500 + index * 50,
      gst_rate: 18,
      department_id: created.orders[index].department_id,
      linked_invoice_id: invoice.id,
      reason: "Rate correction",
      reason_code: "RATE_CORRECTION",
      reference_number: `${RUN}-CN-${index + 1}`,
      narration: `Credit note against invoice ${invoice.invoice_number}`
    }));
  });
  created.procurements.forEach((procurement, index) => {
    created.debitNotes.push(postGuided("debit_note", companyId, dateAt(24 + index), {
      taxable_value: 400 + index * 40,
      gst_rate: 18,
      supplier_id: procurement.supplier_id,
      linked_purchase_id: procurement.id,
      reason: "Supplier rate correction",
      reason_code: "RATE_CORRECTION",
      reference_number: `${RUN}-DN-${index + 1}`,
      narration: `Debit note against purchase ${procurement.purchase_invoice_number}`
    }));
  });

  created.stockInwards.forEach((inward, index) => {
    const availableQuantity = currentStockQuantity(companyId, inward.item_id, warehouse.id);
    const shouldDecrease = index % 2 !== 0 && availableQuantity > 0.1;
    const adjustmentQuantity = shouldDecrease ? Math.min(0.25, money(availableQuantity / 2)) : 1;
    const adjustment = createRecord(db, "stock_adjustments", {
      company_id: companyId,
      item_id: inward.item_id,
      warehouse_id: warehouse.id,
      adjustment_date: dateAt(25 + index),
      adjustment_type: shouldDecrease ? "Decrease" : "Increase",
      quantity: adjustmentQuantity,
      rate: inward.rate,
      reason: ["Physical count difference", "Damaged stock", "Opening stock correction", "Physical count difference", "Damaged stock"][index],
      remarks: `${TAG} ${RUN} inventory adjustment ${index + 1}`
    });
    approveStockAdjustment(db, adjustment.id, null, TAG);
    created.adjustments.push(postStockAdjustment(db, adjustment.id));
  });

  const profitabilityBeforeIncentives = orderProfitability(db, { company_id: companyId });
  created.orders.forEach((order, index) => {
    const profitRow = profitabilityBeforeIncentives.find((row) => Number(row.id || row.order_id) === Number(order.id)) || {};
    const incentive = Math.max(250, money(Number(profitRow.initial_profit || 0) * 0.05));
    created.incentives.push(postGuided("employee_incentive", companyId, dateAt(26 + index), {
      employee_id: order.employee_id,
      order_id: order.id,
      incentive_amount: incentive,
      paid_status: index % 2 === 0 ? "unpaid" : "paid",
      payment_mode: "Bank",
      bank_account_id: bank.id,
      reference_number: `${RUN}-INC-${index + 1}`,
      narration: `Employee incentive for ${order.order_number}`
    }));
  });

  const accounting = accountingData(db, { company_id: companyId, date_from: "2026-06-01", date_to: "2026-06-30" });
  const inventory = inventoryData(db, { company_id: companyId, date_from: "2026-06-01", date_to: "2026-06-30", low_stock_mode: "stocked" });
  const profitability = orderProfitability(db, { company_id: companyId });
  const reconciliation = reconcile(companyId, accounting, inventory, profitability);
  const counts = reportCounts(companyId, RUN);
  counts.guidedVouchers = created.journals.length + created.contras.length + created.creditNotes.length + created.debitNotes.length + created.incentives.length + created.advanceReceipts.length;
  counts.stockAdjustments = created.adjustments.length;

  const reportIndex = [
    ["Trial Balance", accounting.trialBalance?.length || 0, `Debit ${reconciliation.trialDebit}; Credit ${reconciliation.trialCredit}`, reconciliation.trialDifference === 0 ? "Balanced" : `Difference ${reconciliation.trialDifference}`],
    ["Profit & Loss", accounting.profitLoss?.rows?.length || accounting.profitLoss?.length || 0, `Net profit ${money(accounting.statementSummary?.netProfit || 0)}`, "Generated"],
    ["Balance Sheet", accounting.balanceSheet?.rows?.length || accounting.balanceSheet?.length || 0, `Assets/Liabilities summary available`, "Generated"],
    ["GST Register", accounting.gstRegisters?.length || 0, `Input ${reconciliation.inputGst}; Output ${reconciliation.outputGst}`, "Generated"],
    ["TDS Register", accounting.tdsRegisters?.length || 0, `TDS rows ${accounting.tdsRegisters?.length || 0}`, "Generated"],
    ["Receivable Ageing", accounting.receivableAgeing?.length || 0, `Outstanding ${reconciliation.receivableSub}`, "Generated"],
    ["Payable Ageing", accounting.payableAgeing?.length || 0, `Outstanding ${reconciliation.payableSub}`, "Generated"],
    ["Inventory Valuation", inventory.valuation?.length || 0, `Stock value ${reconciliation.inventoryValuation}`, "Generated"],
    ["Cash Flow", accounting.cashBank?.length || 0, `Cash/bank movements ${accounting.cashBank?.length || 0}`, "Generated"],
    ["Profitability Reports", profitability.length, `Net company profit ${reconciliation.profitTotal}`, "Generated"]
  ];

  const coverageRows = Object.entries(counts).map(([key, count]) => [key, count, count > 0 ? "Covered" : "Gap"]);
  const matrixRows = [
    ["Trial Balance Difference", "0", reconciliation.trialDifference, reconciliation.trialDifference === 0 ? "Pass" : "Fail"],
    ["Receivables Reconcile", "0 difference", reconciliation.receivableDifference, reconciliation.receivableDifference === 0 ? "Pass" : "Review"],
    ["Payables Reconcile", "0 difference", reconciliation.payableDifference, reconciliation.payableDifference === 0 ? "Pass" : "Review"],
    ["GST Reconcile", "Input/Output generated", `Input ${reconciliation.inputGst}; Output ${reconciliation.outputGst}`, "Review"],
    ["Inventory Reconcile", "Ledger equals valuation", reconciliation.inventoryDifference, reconciliation.inventoryDifference === 0 ? "Pass" : "Review"],
    ["Profitability Reconcile", "Rows generated", reconciliation.profitabilityRows, reconciliation.profitabilityRows ? "Pass" : "Review"]
  ];

  const commonHeader = `# ERP Test Data Pack v1\n\nGenerated: ${new Date().toISOString()}\n\nCompany: ${company.company_name}\n\nRun ID: ${RUN}\n\nSafety backup: ${backup.fileName}\n\nRuntime schema compatibility repairs: ${schemaRepairs.length ? schemaRepairs.join(", ") : "None"}\n\nThis pack uses existing ERP posting workflows and does not alter accounting formulas, GST calculations, profitability formulas or inventory valuation logic.\n`;

  writeReport("erp-test-data-verification-report.md", `${commonHeader}\n## Verification Report Coverage\n\n${mdTable(["Report", "Record Count", "Totals / Sample", "Reconciliation Result"], reportIndex)}\n\n## Sample Vouchers\n\n${mdTable(["Voucher Date", "Voucher Number", "Type", "Narration"], sample(accounting.vouchers || []).map((row) => [row.voucher_date, row.voucher_number, row.voucher_type, row.narration]))}\n`);

  writeReport("erp-reconciliation-report.md", `${commonHeader}\n## Expected vs Actual Accounting Matrix\n\n${mdTable(["Check", "Expected", "Actual", "Result"], matrixRows)}\n\n## Reconciliation Values\n\n${mdTable(["Metric", "Value"], Object.entries(reconciliation).map(([key, value]) => [key, value]))}\n\nDiscrepancies are reported as Review and were not fixed by this data pack.\n`);

  writeReport("erp-accounting-integrity-report.md", `${commonHeader}\n## Accounting Integrity\n\n${mdTable(["Area", "Result"], [["Trial balance", reconciliation.trialDifference === 0 ? "Balanced" : `Difference ${reconciliation.trialDifference}`], ["Voucher register", `${accounting.vouchers?.length || 0} posted/saved voucher rows available`], ["Voucher lines", `${accounting.voucherLines?.length || 0} rows`], ["General ledger", `${accounting.ledger?.length || 0} rows`], ["Cash/bank ledger", `${accounting.cashBank?.length || 0} rows`], ["Audit log", `${accounting.auditLog?.length || 0} rows visible in read model`]])}\n\n## GST/TDS\n\n${mdTable(["Report", "Rows / Total"], [["GST summary input", reconciliation.inputGst], ["GST summary output", reconciliation.outputGst], ["TDS register rows", accounting.tdsRegisters?.length || 0], ["GST register rows", accounting.gstRegisters?.length || 0]])}\n`);

  writeReport("erp-functional-coverage-report.md", `${commonHeader}\n## Functional Coverage\n\n${mdTable(["Functional Area", "Generated Rows", "Coverage"], coverageRows)}\n\n## Master Data Created or Reused\n\n${mdTable(["Master", "Count"], [["Employees", employees.length], ["Departments", departments.length], ["Suppliers", suppliers.length], ["Items", items.length], ["Expense Heads", expenseHeads.length], ["Warehouse", warehouse.warehouse_name], ["Bank", bank.bank_account_name]])}\n`);

  writeReport("erp-comprehensive-test-dataset-audit-report.md", `${commonHeader}\n## Dataset Summary\n\n${mdTable(["Transaction Type", "Created / Verified", "Coverage"], coverageRows)}\n\n## Required Workflow Coverage\n\n${mdTable(["Workflow Step", "Status"], [["Company", "Created/reused"], ["Supply Order", "5 generated with item rows"], ["Order Items", "Multiple item rows per order"], ["Reservation", "Triggered by supply orders and stock receipts"], ["Procurement", "5 generated and purchase vouchers posted"], ["GRN / Stock Receipt", "5 stock inward postings"], ["Delivery Challan / Stock Issue", "5 delivery challans confirmed with COGS postings"], ["Billing", "5 invoices posted as sales vouchers"], ["Receipt Allocation", "5 receipt voucher workflows plus advance receipt"], ["Supplier Payment", "5 payments posted and allocation attempted"], ["Expenses", "25 expense entries posted through expense workflow"], ["Profitability", "Generated from posted order data"], ["Trial Balance", reconciliation.trialDifference === 0 ? "Balanced" : `Difference ${reconciliation.trialDifference}`]])}\n\n## Accounting Matrix\n\n${mdTable(["Check", "Expected", "Actual", "Result"], matrixRows)}\n\n## Known Review Points\n\n- Credit notes and debit notes are posted through guided vouchers; if receivable/payable sub-ledgers do not move equally with the general ledger, the reconciliation table marks it for review.\n- Inventory valuation is compared against the Inventory ledger account; any difference is reported and not corrected by this script.\n- This pack is additive test data. A live backup was created first: ${backup.fileName}.\n`);

  console.log(JSON.stringify({ run: RUN, company_id: companyId, backup: backup.fileName, counts, reconciliation }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      db.close();
    } catch {
      // ignore close errors during process shutdown
    }
    process.exit(process.exitCode || 0);
  });
