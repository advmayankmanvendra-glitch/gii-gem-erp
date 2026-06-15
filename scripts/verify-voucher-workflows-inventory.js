import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  accountingData,
  createBusinessVoucher,
  initializeDatabase,
  inventoryData,
  orderProfitability,
  postGuidedVoucher,
  updateGuidedVoucherStatus
} from "../src/main/database/init.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-gem-voucher-inventory-"));
const db = initializeDatabase(root);

function assertCheck(name, condition, details = {}) {
  if (!condition) {
    const error = new Error(`Verification failed: ${name}`);
    error.details = details;
    throw error;
  }
}

function trialBalanceDifference() {
  const data = accountingData(db, {});
  const debit = data.trialBalance.reduce((sum, row) => sum + Number(row.debit || 0), 0);
  const credit = data.trialBalance.reduce((sum, row) => sum + Number(row.credit || 0), 0);
  return Math.round((debit - credit) * 100) / 100;
}

try {
  const base = accountingData(db, {});
  const company = base.companies[0];
  const department = base.departments[0];
  const supplier = base.suppliers[0];
  const bank = base.banks[0];
  const employee = base.employees[0];

  assertCheck("seed references", company && department && supplier && bank && employee);

  const common = {
    company_id: company.id,
    voucher_date: "2026-06-15",
    bank_account_id: bank.id,
    payment_mode: "Bank"
  };

  function approveAndPost(payload) {
    const guided = createBusinessVoucher(db, payload);
    updateGuidedVoucherStatus(db, guided.id, "submit", 1);
    updateGuidedVoucherStatus(db, guided.id, "review", 1);
    updateGuidedVoucherStatus(db, guided.id, "approve", 1);
    return postGuidedVoucher(db, guided.id, 1);
  }

  const sales = approveAndPost({
    ...common,
    voucher_kind: "sales",
    department_id: department.id,
    invoice_number: "VERIFY-SALES-001",
    taxable_value: 10000,
    gst_rate: 18,
    narration: "Verification sales voucher"
  });

  const receipt = approveAndPost({
    ...common,
    voucher_kind: "receipt",
    department_id: department.id,
    amount: 9000,
    tds_deducted: 100,
    gst_tds_deducted: 200,
    other_deduction: 50,
    reference_number: "VERIFY-UTR-001",
    narration: "Verification receipt voucher"
  });

  const purchase = approveAndPost({
    ...common,
    voucher_kind: "purchase",
    supplier_id: supplier.id,
    purchase_invoice_number: "VERIFY-PUR-001",
    purchase_value: 5000,
    gst_rate: 18,
    inventory_enabled: true,
    narration: "Verification purchase voucher"
  });

  const supplierPayment = approveAndPost({
    ...common,
    voucher_kind: "supplier_payment",
    supplier_id: supplier.id,
    amount: 3000,
    reference_number: "VERIFY-SUP-UTR-001",
    narration: "Verification supplier payment"
  });

  const incentive = approveAndPost({
    ...common,
    voucher_kind: "employee_incentive",
    employee_id: employee.id,
    initial_profit: 1200,
    incentive_percentage: 15,
    paid_status: "unpaid",
    narration: "Verification employee incentive"
  });

  const diff = trialBalanceDifference();
  const inventory = inventoryData(db, { company_id: company.id, date_from: "2026-01-01", date_to: "2026-12-31" });
  const profitability = orderProfitability(db);

  assertCheck("guided voucher numbers", [sales, receipt, purchase, supplierPayment, incentive].every((row) => row?.voucher_number));
  assertCheck("trial balance remains balanced", diff === 0, { difference: diff });
  assertCheck("inventory dashboard available", Array.isArray(inventory.dashboard) && inventory.dashboard.length > 0);
  assertCheck("inventory movement audit available", Array.isArray(inventory.movements));
  assertCheck("stock reservations available", Array.isArray(inventory.reservations));
  assertCheck("profitability cost source present", profitability.every((row) => row.inventoryCostSource));

  console.log(JSON.stringify({
    root,
    postedVouchers: [sales.voucher_number, receipt.voucher_number, purchase.voucher_number, supplierPayment.voucher_number, incentive.voucher_number],
    trialBalanceDifference: diff,
    inventoryDashboardRows: inventory.dashboard.length,
    inventoryMovementRows: inventory.movements.length,
    reservationRows: inventory.reservations.length,
    profitabilityRows: profitability.length,
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
