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
  createWarehouseTransfer,
  initializeDatabase,
  inventoryData,
  postGuidedVoucher,
  postWarehouseTransfer,
  updateGuidedVoucherStatus
} from "../src/main/database/init.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-gem-phase10-"));
const db = initializeDatabase(root);

function assertCheck(name, ok, details = {}) {
  if (!ok) {
    const error = new Error(`Phase 10 verification failed: ${name}`);
    error.details = details;
    throw error;
  }
}

function tbDiff() {
  const data = accountingData(db, {});
  const debit = data.trialBalance.reduce((sum, row) => sum + Number(row.debit || 0), 0);
  const credit = data.trialBalance.reduce((sum, row) => sum + Number(row.credit || 0), 0);
  return Math.round((debit - credit) * 100) / 100;
}

try {
  const company = db.prepare("SELECT * FROM companies ORDER BY id LIMIT 1").get();
  const department = db.prepare("SELECT * FROM government_departments ORDER BY id LIMIT 1").get();
  const employee = db.prepare("SELECT * FROM employees ORDER BY id LIMIT 1").get();
  const supplier = db.prepare("SELECT * FROM suppliers ORDER BY id LIMIT 1").get();
  const item = db.prepare("SELECT * FROM items WHERE item_name = 'Printer' LIMIT 1").get() || db.prepare("SELECT * FROM items ORDER BY id LIMIT 1").get();
  const warehouse = db.prepare("SELECT * FROM warehouses ORDER BY id LIMIT 1").get();
  const bank = db.prepare("SELECT * FROM banks ORDER BY id LIMIT 1").get();
  assertCheck("seed references", company && department && employee && supplier && item && warehouse && bank);

  const mirrorWarehouse = createRecord(db, "warehouses", {
    company_id: company.id,
    warehouse_name: `Phase 10 Mirror Store ${Date.now()}`,
    location: "Verification",
    warehouse_type: "Transit",
    responsible_person: "Verifier",
    status: "active"
  });

  const order = createRecord(db, "supply_orders", {
    company_id: company.id,
    order_number: `PH10-${Date.now()}`,
    order_date: "2026-06-11",
    department_id: department.id,
    institution_name: "Phase 10 Verification Institution",
    location: "Mumbai",
    employee_id: employee.id,
    supply_due_date: "2026-06-30",
    order_status: "Received",
    remarks: "Phase 10 verification order"
  });

  db.prepare(`
    INSERT INTO order_items (company_id, order_id, item_id, item_description, quantity, unit, quoted_rate, gst_rate, taxable_value, gst_amount, gross_value)
    VALUES (?, ?, ?, ?, 2, ?, 1500, 18, 3000, 540, 3540)
  `).run(company.id, order.id, item.id, item.item_name, item.unit || "Nos");
  const reservation = autoReserveOrderStock(db, order.id);
  assertCheck("automatic reservation created", reservation.reservations.length === 1, reservation);

  const voucherCountBefore = accountingData(db, {}).vouchers.length;
  const guided = createBusinessVoucher(db, {
    company_id: company.id,
    voucher_kind: "purchase",
    voucher_date: "2026-06-11",
    supplier_id: supplier.id,
    bank_account_id: bank.id,
    purchase_invoice_number: `PH10-PUR-${Date.now()}`,
    purchase_value: 2000,
    gst_rate: 18,
    item_id: item.id,
    warehouse_id: warehouse.id,
    quantity: 2,
    accepted_quantity: 2,
    rate: 1000,
    order_id: order.id,
    narration: "Phase 10 purchase guided voucher"
  });
  assertCheck("guided voucher starts as draft", guided.status === "Draft", guided);
  assertCheck("draft guided voucher has no accounting impact", accountingData(db, {}).vouchers.length === voucherCountBefore);

  updateGuidedVoucherStatus(db, guided.id, "submit", 1);
  updateGuidedVoucherStatus(db, guided.id, "review", 1);
  updateGuidedVoucherStatus(db, guided.id, "approve", 1);
  const postedPurchase = postGuidedVoucher(db, guided.id, 1);
  assertCheck("approved guided voucher posts", Boolean(postedPurchase.voucher_number), postedPurchase);
  assertCheck("automatic GRN created", db.prepare("SELECT COUNT(*) count FROM goods_receipts WHERE guided_voucher_id = ?").get(guided.id).count === 1);
  assertCheck("automatic stock receipt posted", db.prepare("SELECT COUNT(*) count FROM stock_inwards WHERE order_id = ? AND posting_status = 'Posted'").get(order.id).count >= 1);

  const delivery = createDeliveryChallan(db, {
    company_id: company.id,
    order_id: order.id,
    department_id: department.id,
    dispatch_date: "2026-06-12",
    vehicle_details: "MH-VERIFY",
    lines: [{ item_id: item.id, warehouse_id: warehouse.id, quantity: 1 }]
  });
  confirmDeliveryChallan(db, delivery.id, 1);
  assertCheck("delivery challan confirmed", db.prepare("SELECT status FROM delivery_challans WHERE id = ?").get(delivery.id).status === "Confirmed");
  assertCheck("COGS created on issue", db.prepare(`
    SELECT COUNT(*) count
    FROM vouchers
    WHERE source_module = 'stock_outwards' AND company_id = ?
  `).get(company.id).count > 0);

  const transfer = createWarehouseTransfer(db, {
    company_id: company.id,
    from_warehouse_id: warehouse.id,
    to_warehouse_id: mirrorWarehouse.id,
    item_id: item.id,
    transfer_date: "2026-06-13",
    quantity: 1,
    reason: "Phase 10 verification transfer"
  });
  postWarehouseTransfer(db, transfer.id, 1);
  assertCheck("warehouse transfer posted", db.prepare("SELECT status FROM warehouse_transfers WHERE id = ?").get(transfer.id).status === "Posted");

  const inventory = inventoryData(db, { company_id: company.id, date_from: "2026-06-01", date_to: "2026-06-30" });
  const difference = tbDiff();
  assertCheck("trial balance balanced", difference === 0, { difference });
  assertCheck("phase 10 reports populated", inventory.goodsReceipts.length && inventory.deliveryChallans.length && inventory.warehouseTransfers.length);
  assertCheck("inventory movement exists", inventory.movements.length > 0);

  console.log(JSON.stringify({
    root,
    reservationStatus: reservation.status,
    guidedVoucher: guided.id,
    purchaseVoucher: postedPurchase.voucher_number,
    goodsReceipts: inventory.goodsReceipts.length,
    deliveryChallans: inventory.deliveryChallans.length,
    warehouseTransfers: inventory.warehouseTransfers.length,
    cogsRows: inventory.cogsReport.length,
    trialBalanceDifference: difference,
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
