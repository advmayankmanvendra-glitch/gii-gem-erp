import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  accountingData,
  autoReserveOrderStock,
  confirmDeliveryChallan,
  createBusinessVoucher,
  createDeliveryChallan,
  createRecord,
  initializeDatabase,
  inventoryData,
  orderProfitability,
  postBusinessTransaction,
  postGuidedVoucher,
  saveBillingVoucher,
  updateGuidedVoucherStatus
} from "../src/main/database/init.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-gem-operational-flow-"));
const db = initializeDatabase(root);
const unique = Date.now();

function assertFlow(name, ok, details = {}) {
  if (!ok) {
    const error = new Error(`Operational flow verification failed: ${name}`);
    error.details = details;
    throw error;
  }
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function trialBalanceDifference() {
  const data = accountingData(db, {});
  const debit = data.trialBalance.reduce((sum, row) => sum + Number(row.debit || 0), 0);
  const credit = data.trialBalance.reduce((sum, row) => sum + Number(row.credit || 0), 0);
  return round(debit - credit);
}

try {
  const company = db.prepare("SELECT * FROM companies ORDER BY id LIMIT 1").get();
  const department = db.prepare("SELECT * FROM government_departments ORDER BY id LIMIT 1").get();
  const employee = db.prepare("SELECT * FROM employees ORDER BY id LIMIT 1").get();
  const supplier = db.prepare("SELECT * FROM suppliers ORDER BY id LIMIT 1").get();
  const warehouse = db.prepare("SELECT * FROM warehouses WHERE status = 'active' ORDER BY id LIMIT 1").get();
  const bank = db.prepare("SELECT * FROM banks ORDER BY id LIMIT 1").get();
  assertFlow("seed references available", company && department && employee && supplier && warehouse && bank);

  const item = createRecord(db, "items", {
    item_code: `FLOW-${unique}`,
    item_name: `Operational Flow Test Item ${unique}`,
    brand: "Verification",
    model: "FLOW",
    hsn_code: "9988",
    gst_rate: 18,
    unit: "Nos",
    category: "Verification",
    inventory_enabled: 1,
    opening_stock: 0,
    opening_rate: 0,
    opening_value: 0,
    default_warehouse_id: warehouse.id,
    valuation_method: "Weighted Average",
    status: "active"
  });

  const order = createRecord(db, "supply_orders", {
    company_id: company.id,
    order_number: `FLOW-ORD-${unique}`,
    order_date: "2026-06-11",
    department_id: department.id,
    institution_name: "Operational Flow Verification Institution",
    location: "Mumbai",
    employee_id: employee.id,
    supply_due_date: "2026-06-30",
    order_status: "Received",
    remarks: "End-to-end operational flow verification"
  });

  db.prepare(`
    INSERT INTO order_items (company_id, order_id, item_id, item_description, quantity, unit, quoted_rate, gst_rate, taxable_value, gst_amount, gross_value)
    VALUES (?, ?, ?, ?, 3, 'Nos', 2000, 18, 6000, 1080, 7080)
  `).run(company.id, order.id, item.id, item.item_name);

  const initialReservation = autoReserveOrderStock(db, order.id);
  assertFlow("order triggers procurement requirement when stock is unavailable", initialReservation.status === "Procurement Required", initialReservation);

  const voucherCountBefore = accountingData(db, {}).vouchers.length;
  const purchaseDraft = createBusinessVoucher(db, {
    company_id: company.id,
    voucher_kind: "purchase",
    voucher_date: "2026-06-11",
    supplier_id: supplier.id,
    bank_account_id: bank.id,
    purchase_invoice_number: `FLOW-PUR-${unique}`,
    purchase_value: 3000,
    purchase_gst: 540,
    gst_rate: 18,
    item_id: item.id,
    warehouse_id: warehouse.id,
    quantity: 3,
    accepted_quantity: 3,
    rate: 1000,
    order_id: order.id,
    narration: "Operational flow purchase voucher"
  });
  assertFlow("purchase voucher is draft before approval", purchaseDraft.status === "Draft", purchaseDraft);
  assertFlow("draft purchase voucher does not post accounting", accountingData(db, {}).vouchers.length === voucherCountBefore);

  updateGuidedVoucherStatus(db, purchaseDraft.id, "submit", 1);
  updateGuidedVoucherStatus(db, purchaseDraft.id, "review", 1);
  updateGuidedVoucherStatus(db, purchaseDraft.id, "approve", 1);
  const purchaseVoucher = postGuidedVoucher(db, purchaseDraft.id, 1);
  assertFlow("approved purchase voucher posts", Boolean(purchaseVoucher.voucher_number), purchaseVoucher);
  assertFlow("automatic stock receipt exists", db.prepare("SELECT COUNT(*) count FROM goods_receipts WHERE guided_voucher_id = ?").get(purchaseDraft.id).count === 1);
  assertFlow("automatic stock inward posted", db.prepare("SELECT COUNT(*) count FROM stock_inwards WHERE order_id = ? AND posting_status = 'Posted'").get(order.id).count === 1);

  const replenishedReservation = autoReserveOrderStock(db, order.id);
  assertFlow("stock is reserved after procurement receipt", replenishedReservation.status === "Reserved", replenishedReservation);

  const challan = createDeliveryChallan(db, {
    company_id: company.id,
    order_id: order.id,
    department_id: department.id,
    dispatch_date: "2026-06-12",
    vehicle_details: "FLOW-VEHICLE",
    lines: [{ item_id: item.id, warehouse_id: warehouse.id, quantity: 3 }]
  });
  const confirmedChallan = confirmDeliveryChallan(db, challan.id, 1);
  assertFlow("delivery challan confirms", confirmedChallan.status === "Confirmed", confirmedChallan);
  const cogsVoucher = db.prepare("SELECT * FROM vouchers WHERE source_module = 'stock_outwards' AND company_id = ? ORDER BY id DESC LIMIT 1").get(company.id);
  assertFlow("auto COGS voucher created on stock issue", Boolean(cogsVoucher), cogsVoucher);

  const invoice = saveBillingVoucher(db, {
    header: {
      company_id: company.id,
      order_id: order.id,
      invoice_number: `FLOW-INV-${unique}`,
      invoice_date: "2026-06-13",
      gem_order_number: `GEM-FLOW-${unique}`,
      gem_contract_number: `CONTRACT-FLOW-${unique}`,
      consignee: "Verification Consignee",
      place_of_supply: "Maharashtra",
      gst_type: "CGST/SGST",
      invoice_type: "Tax Invoice",
      invoice_status: "Draft",
      remarks: "Operational flow invoice"
    },
    items: [{
      item_id: item.id,
      description: item.item_name,
      hsn: "9988",
      unit: "Nos",
      quantity: 3,
      billing_rate: 2000,
      gst_rate: 18,
      gst_type: "CGST/SGST"
    }]
  });
  const salesVoucher = postBusinessTransaction(db, "invoices", invoice.id);
  assertFlow("billing posts sales voucher", Boolean(salesVoucher.voucher_number), salesVoucher);

  const receivableBeforePayment = db.prepare("SELECT * FROM receivables WHERE billing_id = ?").get(invoice.id);
  assertFlow("receivable created for gross invoice value", round(receivableBeforePayment?.invoice_amount) === 7080, receivableBeforePayment);
  assertFlow("receivable starts open", round(receivableBeforePayment?.balance_outstanding) === 7080, receivableBeforePayment);

  const payment = createRecord(db, "payments", {
    company_id: company.id,
    order_id: order.id,
    payment_date: "2026-06-14",
    payment_amount: 7080,
    payment_mode: "Bank",
    utr_number: `FLOW-UTR-${unique}`,
    bank_id: bank.id,
    remarks: "Full operational flow receipt"
  });
  const receiptVoucher = postBusinessTransaction(db, "payments", payment.id);
  assertFlow("payment posts receipt voucher", Boolean(receiptVoucher.voucher_number), receiptVoucher);

  const receivableAfterPayment = db.prepare("SELECT * FROM receivables WHERE billing_id = ?").get(invoice.id);
  assertFlow("payment allocation closes receivable", round(receivableAfterPayment?.balance_outstanding) === 0 && receivableAfterPayment.status === "Closed", receivableAfterPayment);

  const profit = orderProfitability(db).find((row) => Number(row.id) === Number(order.id));
  assertFlow("profitability row exists", Boolean(profit), { order_id: order.id });
  assertFlow("profitability uses issued stock cost after delivery", profit.inventoryCostSource === "Issued Stock Cost" && round(profit.inventoryCostBasis) === 3000, profit);
  assertFlow("profitability collection outstanding is not negative after full gross receipt", round(profit.outstanding) === 0, profit);

  const inventory = inventoryData(db, { company_id: company.id, date_from: "2026-06-01", date_to: "2026-06-30" });
  assertFlow("inventory reports include the automated flow", inventory.procurementRequirements.length >= 0 && inventory.deliveryChallans.length > 0 && inventory.cogsReport.length > 0);

  const tbDiff = trialBalanceDifference();
  assertFlow("trial balance remains balanced", tbDiff === 0, { trialBalanceDifference: tbDiff });

  console.log(JSON.stringify({
    root,
    orderNumber: order.order_number,
    initialReservationStatus: initialReservation.status,
    replenishedReservationStatus: replenishedReservation.status,
    purchaseVoucher: purchaseVoucher.voucher_number,
    deliveryChallan: confirmedChallan.challan_number,
    cogsVoucher: cogsVoucher.voucher_number,
    salesVoucher: salesVoucher.voucher_number,
    receiptVoucher: receiptVoucher.voucher_number,
    receivableBalance: round(receivableAfterPayment.balance_outstanding),
    inventoryCostSource: profit.inventoryCostSource,
    inventoryCostBasis: round(profit.inventoryCostBasis),
    billingValue: round(profit.billingValue),
    invoiceGrossValue: round(profit.invoiceGrossValue),
    grossMargin: round(profit.grossMargin),
    netCompanyProfit: round(profit.netCompanyProfit),
    trialBalanceDifference: tbDiff,
    status: "passed"
  }, null, 2));
} catch (error) {
  console.error(error.message);
  if (error.details) console.error(JSON.stringify(error.details, null, 2));
  process.exitCode = 1;
} finally {
  db.close();
  process.exit(process.exitCode || 0);
}
