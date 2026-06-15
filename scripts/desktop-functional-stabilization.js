import fs from "node:fs";
import path from "node:path";
import {
  accountingData,
  billingVoucherData,
  createBusinessVoucher,
  createRecord,
  dashboardCounts,
  initializeDatabase,
  inventoryData,
  listDocuments,
  listRecords,
  orderProfitability,
  postBusinessTransaction,
  postGuidedVoucher,
  referenceData,
  saveBillingVoucher,
  updateGuidedVoucherStatus,
  updateRecord,
  uploadDocument
} from "../src/main/database/init.js";
import { createLiveBackup, preparePendingRestore, restoreBackup } from "../src/main/services/backup.js";

const root = process.cwd();
const suffix = Date.now();
const reportPath = path.join(root, "reports", "desktop-functional-stabilization-results.json");
const results = [];
let db = initializeDatabase(root);
let restoreFileName = null;
let uploadedDocumentPath = null;

function pass(name, detail = "") {
  results.push({ name, status: "pass", detail });
}

function fail(name, error) {
  results.push({ name, status: "fail", detail: error?.message || String(error), stack: error?.stack || "" });
}

async function step(name, fn) {
  try {
    const detail = await fn();
    pass(name, detail);
  } catch (error) {
    fail(name, error);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function total(rows, field) {
  return round(rows.reduce((sum, row) => sum + Number(row[field] || 0), 0));
}

function firstActive(table) {
  return db.prepare(`SELECT * FROM ${table} WHERE COALESCE(status, 'active') = 'active' AND COALESCE(is_deleted, 0) = 0 ORDER BY id LIMIT 1`).get();
}

function createAndUpdate(table, payload, field, editedValue) {
  const created = createRecord(db, table, payload);
  const updated = updateRecord(db, table, created.id, { ...created, [field]: editedValue });
  const persisted = listRecords(db, table, { status: "all", search: String(editedValue) }).find((row) => Number(row.id) === Number(created.id));
  assert(persisted, `${table} edited value was not visible after save`);
  assert(String(persisted[field]) === String(editedValue), `${table} edited field did not persist`);
  return persisted;
}

function reopenDatabase() {
  db.close();
  db = initializeDatabase(root);
}

function approveAndPostGuided(guidedId) {
  updateGuidedVoucherStatus(db, guidedId, "submit", 1, "Desktop stabilization submit");
  updateGuidedVoucherStatus(db, guidedId, "review", 1, "Desktop stabilization review");
  updateGuidedVoucherStatus(db, guidedId, "approve", 1, "Desktop stabilization approve");
  return postGuidedVoucher(db, guidedId, 1);
}

const context = {};

try {
  await step("Create live SQLite backup before destructive stabilization checks", async () => {
    const backup = await createLiveBackup(db, root);
    restoreFileName = backup.fileName;
    assert(fs.existsSync(backup.path), "Backup file does not exist on disk");
    assert(Number(backup.size || 0) > 0, "Backup file is empty");
    return `${backup.fileName} (${backup.size} bytes)`;
  });

  await step("Master saves persist after database reopen", () => {
    context.company = createAndUpdate("companies", {
      company_name: `Desktop Stabilization Company ${suffix}`,
      gstin: "",
      pan: "",
      address: "Initial address",
      bank_name: "SBI",
      account_number: `AC${suffix}`,
      ifsc: "SBIN0000001",
      status: "active"
    }, "address", "Edited desktop address");
    context.employee = createAndUpdate("employees", {
      employee_name: `Desktop Stabilization Employee ${suffix}`,
      mobile_number: `9${String(suffix).slice(-9)}`,
      designation: "Verifier",
      incentive_percentage: 15,
      status: "active"
    }, "designation", "Senior Verifier");
    context.department = createAndUpdate("government_departments", {
      department_name: `Desktop Stabilization Department ${suffix}`,
      contact_person: "Officer",
      contact_number: "1234567890",
      address: "Initial department",
      status: "active"
    }, "address", "Edited department");
    context.supplier = createAndUpdate("suppliers", {
      supplier_name: `Desktop Stabilization Supplier ${suffix}`,
      supplier_type: "Vendor",
      supplier_code: `DSS-${suffix}`,
      supplier_account_name: `Desktop Stabilization Supplier ${suffix}`,
      supplier_account_number: `5020${suffix}`,
      supplier_bank_name: "HDFC",
      supplier_bank_ifsc_code: "HDFC0001234",
      supplier_branch: "Main",
      supplier_contact: "9876543210",
      gstin: "",
      contact_details: "",
      bank_details: "",
      remarks: "Initial supplier",
      status: "active"
    }, "remarks", "Edited supplier");
    context.item = createAndUpdate("items", {
      item_name: `Desktop Stabilization Item ${suffix}`,
      brand: "Stabilization",
      model: "DS-1",
      hsn_code: "9403",
      gst_rate: 18,
      unit: "Nos",
      category: "Verification",
      opening_stock: 0,
      opening_rate: 0,
      opening_value: 0,
      reorder_level: 0,
      minimum_stock_level: 0,
      maximum_stock_level: 100,
      track_serial_number: 0,
      track_batch_number: 0,
      warranty_period: 0,
      status: "active"
    }, "category", "Desktop Verification");
    context.bank = createAndUpdate("banks", {
      bank_account_name: `Desktop Stabilization Bank ${suffix}`,
      bank_name: "Axis",
      account_number: `10${suffix}`,
      ifsc: "UTIB0000001",
      opening_balance: 0,
      status: "active"
    }, "opening_balance", 100);
    context.warehouse = createAndUpdate("warehouses", {
      warehouse_name: `Desktop Stabilization Warehouse ${suffix}`,
      location: "Initial warehouse",
      responsible_person: "Keeper",
      status: "active"
    }, "location", "Edited warehouse");
    reopenDatabase();
    ["companies", "employees", "government_departments", "suppliers", "items", "banks", "warehouses"].forEach((table) => {
      const count = db.prepare(`SELECT COUNT(*) count FROM ${table} WHERE id = ?`).get(context[{
        companies: "company",
        employees: "employee",
        government_departments: "department",
        suppliers: "supplier",
        items: "item",
        banks: "bank",
        warehouses: "warehouse"
      }[table]].id).count;
      assert(count === 1, `${table} record was not found after reopen`);
    });
    return "Company, employee, department, supplier, item, bank and warehouse saved, edited and survived reopen.";
  });

  await step("Operations save and reload: order, procurement, expense, billing and payment", () => {
    context.order = createRecord(db, "supply_orders", {
      company_id: context.company.id,
      order_number: `DSS-ORDER-${suffix}`,
      order_date: "2026-06-12",
      department_id: context.department.id,
      institution_name: "Desktop Verification Institution",
      location: "Verification City",
      employee_id: context.employee.id,
      supply_due_date: "2026-06-30",
      order_status: "Received",
      remarks: "Desktop stabilization order"
    });
    context.procurement = createRecord(db, "procurements", {
      company_id: context.company.id,
      order_id: context.order.id,
      purchase_date: "2026-06-12",
      supplier_id: context.supplier.id,
      purchase_invoice_number: `DSS-PINV-${suffix}`,
      purchase_value: 1000,
      purchase_gst: 180,
      freight: 25,
      loading_charges: 10,
      amount_paid: 0,
      remarks: "Desktop procurement"
    });
    context.expenseHead = createRecord(db, "expense_heads", {
      company_id: context.company.id,
      expense_head_name: `Desktop Stabilization Expense ${suffix}`,
      default_calculation_method: "fixed",
      default_percentage: 0,
      category: "Verification",
      status: "active"
    });
    context.expense = createRecord(db, "expense_entries", {
      company_id: context.company.id,
      order_id: context.order.id,
      expense_head_id: context.expenseHead.id,
      expense_category: "Verification",
      calculation_method: "fixed",
      percentage: 0,
      fixed_amount: 50,
      expense_amount: 50,
      payable_to: "Verification",
      payment_status: "Unpaid",
      remarks: "Desktop expense"
    });
    context.invoice = saveBillingVoucher(db, {
      header: {
        company_id: context.company.id,
        order_id: context.order.id,
        invoice_number: `DSS-INV-${suffix}`,
        invoice_date: "2026-06-12",
        billing_value: 2000,
        gst_rate: 18,
        invoice_status: "Draft",
        remarks: "Desktop invoice"
      },
      items: [{
        item_id: context.item.id,
        description: context.item.item_name,
        hsn: context.item.hsn_code,
        quantity: 1,
        unit: context.item.unit,
        billing_rate: 2000,
        gst_rate: 18
      }]
    });
    context.payment = createRecord(db, "payments", {
      company_id: context.company.id,
      order_id: context.order.id,
      payment_date: "2026-06-12",
      payment_amount: 1000,
      payment_mode: "Bank",
      utr_number: `DSS-UTR-${suffix}`,
      bank_id: context.bank.id,
      remarks: "Desktop payment"
    });
    reopenDatabase();
    assert(db.prepare("SELECT COUNT(*) count FROM supply_orders WHERE order_number = ?").get(context.order.order_number).count === 1, "Supply order did not persist");
    assert(db.prepare("SELECT COUNT(*) count FROM procurements WHERE purchase_invoice_number = ?").get(context.procurement.purchase_invoice_number).count === 1, "Procurement did not persist");
    assert(db.prepare("SELECT COUNT(*) count FROM invoices WHERE invoice_number = ?").get(context.invoice.invoice_number).count === 1, "Invoice did not persist");
    assert(db.prepare("SELECT COUNT(*) count FROM payments WHERE utr_number = ?").get(context.payment.utr_number).count === 1, "Payment did not persist");
    return "Operations records saved and survived database reopen.";
  });

  await step("Inventory entry saves and appears in inventory data", () => {
    context.stockInward = createRecord(db, "stock_inwards", {
      company_id: context.company.id,
      procurement_id: context.procurement.id,
      order_id: context.order.id,
      supplier_id: context.supplier.id,
      item_id: context.item.id,
      warehouse_id: context.warehouse.id,
      inward_date: "2026-06-12",
      purchase_invoice_number: `DSS-STIN-${suffix}`,
      quantity: 2,
      rate: 500,
      gst_rate: 18,
      landed_cost: 1000,
      remarks: "Desktop stock inward"
    });
    const inventory = inventoryData(db, { company_id: context.company.id });
    assert(Array.isArray(inventory.inwards), "Inventory inward report missing");
    assert(inventory.inwards.some((row) => Number(row.id) === Number(context.stockInward.id)), "Stock inward not visible in inventory data");
    return "Stock inward saved and visible.";
  });

  await step("Voucher Dashboard draft stays out of final books until posted", () => {
    const before = accountingData(db, { company_id: context.company.id });
    const beforeVoucherCount = before.vouchers.length;
    context.guidedDraft = createBusinessVoucher(db, {
      company_id: context.company.id,
      voucher_kind: "receipt",
      voucher_date: "2026-06-12",
      department_id: context.department.id,
      bank_account_id: context.bank.id,
      payment_mode: "Bank",
      amount: 250,
      reference_number: `DSS-GUIDED-UTR-${suffix}`,
      narration: "Desktop guided receipt draft"
    });
    const afterDraft = accountingData(db, { company_id: context.company.id });
    assert(afterDraft.guidedVouchers.some((row) => Number(row.id) === Number(context.guidedDraft.id)), "Guided draft not visible in approval queue data");
    assert(afterDraft.vouchers.length === beforeVoucherCount, "Draft guided voucher affected final voucher register before posting");
    return "Draft guided voucher visible only in guided queue.";
  });

  await step("Posted guided voucher reflects in Voucher Register, Ledger, Day Book and Cash/Bank Book", () => {
    context.guidedPostedVoucher = approveAndPostGuided(context.guidedDraft.id);
    const data = accountingData(db, { company_id: context.company.id, date_from: "2026-06-01", date_to: "2026-06-30" });
    const voucher = data.vouchers.find((row) => Number(row.id) === Number(context.guidedPostedVoucher.id));
    assert(voucher, "Posted guided voucher missing from Voucher Register");
    assert(voucher.status === "Posted", "Posted guided voucher status is not Posted");
    assert(voucher.voucher_number, "Posted guided voucher number missing");
    assert(data.ledger.some((row) => Number(row.voucher_id) === Number(voucher.id)), "Posted guided voucher missing from Ledger View");
    assert(data.dayBook.some((row) => Number(row.id) === Number(voucher.id)), "Posted guided voucher missing from Day Book");
    assert(data.cashBank.some((row) => Number(row.voucher_id) === Number(voucher.id)), "Posted guided voucher missing from Cash/Bank Book");
    const source = db.prepare("SELECT * FROM guided_vouchers WHERE id = ?").get(context.guidedDraft.id);
    assert(source.posted_at && source.posted_by !== undefined && source.posted_voucher_id, "Guided voucher posting metadata missing");
    return voucher.voucher_number;
  });

  await step("Business posting visibility: procurement, billing, payment and expense", () => {
    const purchaseVoucher = postBusinessTransaction(db, "procurement", context.procurement.id);
    const salesVoucher = postBusinessTransaction(db, "billing", context.invoice.id);
    const receiptVoucher = postBusinessTransaction(db, "payment", context.payment.id);
    const expenseVoucher = postBusinessTransaction(db, "expense", context.expense.id);
    const data = accountingData(db, { company_id: context.company.id, date_from: "2026-06-01", date_to: "2026-06-30" });
    [purchaseVoucher, salesVoucher, receiptVoucher, expenseVoucher].forEach((voucher) => {
      assert(voucher?.voucher_number, "A posted business voucher is missing voucher number");
      assert(data.vouchers.some((row) => Number(row.id) === Number(voucher.id)), `Voucher ${voucher?.voucher_number} missing from register`);
      assert(data.dayBook.some((row) => Number(row.id) === Number(voucher.id)), `Voucher ${voucher?.voucher_number} missing from day book`);
      assert(data.ledger.some((row) => Number(row.voucher_id) === Number(voucher.id)), `Voucher ${voucher?.voucher_number} missing from ledger`);
    });
    assert(data.receivables.some((row) => Number(row.billing_id) === Number(context.invoice.id)), "Billing did not create receivable");
    assert(data.payables.some((row) => Number(row.procurement_id) === Number(context.procurement.id)), "Procurement did not create payable");
    return [purchaseVoucher.voucher_number, salesVoucher.voucher_number, receiptVoucher.voucher_number, expenseVoucher.voucher_number].join(", ");
  });

  await step("Accounting reports load and balance", () => {
    const data = accountingData(db, { company_id: context.company.id, date_from: "2026-06-01", date_to: "2026-06-30" });
    const debit = total(data.trialBalance, "debit");
    const credit = total(data.trialBalance, "credit");
    assert(round(debit - credit) === 0, "Trial Balance is not balanced");
    assert(data.ledger.length > 0, "General Ledger did not load");
    assert(data.dayBook.length > 0, "Day Book did not load");
    assert(data.profitLoss, "P&L did not load");
    assert(data.balanceSheet, "Balance Sheet did not load");
    assert(data.cashBank.length > 0, "Cash/Bank Book did not load");
    assert(data.gstSummary, "GST Summary did not load");
    assert(Array.isArray(data.receivables), "Receivables did not load");
    assert(Array.isArray(data.payables), "Payables did not load");
    assert(Array.isArray(data.partyLedger), "Party Ledger did not load");
    return `debit=${debit}; credit=${credit}; difference=${round(debit - credit)}`;
  });

  await step("Document upload stores file and appears in document register", () => {
    const sourcePath = path.join(root, "logs", `desktop-stabilization-upload-${suffix}.pdf`);
    fs.writeFileSync(sourcePath, "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");
    const document = uploadDocument(db, {
      source_path: sourcePath,
      company_id: context.company.id,
      linked_module: "invoices",
      linked_record_id: context.invoice.id,
      document_type: "Invoice Copy",
      uploaded_by: 1,
      remarks: "Desktop stabilization upload"
    });
    uploadedDocumentPath = document.file_path;
    assert(fs.existsSync(document.file_path), "Uploaded document file missing from documents folder");
    assert(listDocuments(db, { module: "invoices" }).some((row) => Number(row.id) === Number(document.id)), "Uploaded document missing from document register");
    fs.rmSync(sourcePath, { force: true });
    return path.relative(root, document.file_path);
  });

  await step("Dashboard, references, profitability and billing data load", () => {
    dashboardCounts(db);
    referenceData(db);
    billingVoucherData(db);
    orderProfitability(db);
    return "Dashboard/reference/profitability data loaded.";
  });
} finally {
  const restoreStartedAt = new Date().toISOString();
  try {
    if (db?.open) {
      db.pragma("wal_checkpoint(TRUNCATE)");
      db.close();
    }
  } catch {
    // Ignore close failures during cleanup.
  }
  await sleep(500);
  if (restoreFileName) {
    try {
      try {
        restoreBackup(restoreFileName, root);
        db = initializeDatabase(root);
        const markerCount = db.prepare("SELECT COUNT(*) count FROM companies WHERE company_name = ?").get(`Desktop Stabilization Company ${suffix}`).count;
        if (markerCount === 0) {
          pass("Backup restore cleanup removed stabilization test records", restoreFileName);
        } else {
          fail("Backup restore cleanup removed stabilization test records", new Error("Marker company still exists after restore"));
        }
        const data = accountingData(db, {});
        const debit = total(data.trialBalance, "debit");
        const credit = total(data.trialBalance, "credit");
        if (round(debit - credit) === 0) pass("Accounting verification after restore", `debit=${debit}; credit=${credit}; difference=0`);
        else fail("Accounting verification after restore", new Error(`difference=${round(debit - credit)}`));
        db.close();
      } catch (error) {
        if (["EBUSY", "EPERM"].includes(error.code)) {
          const pending = preparePendingRestore(restoreFileName, root);
          pass("Backup restore cleanup scheduled for next desktop startup", pending.backupFileName);
        } else {
          throw error;
        }
      }
    } catch (error) {
      fail("Backup restore cleanup", error);
    }
  }
  if (uploadedDocumentPath && fs.existsSync(uploadedDocumentPath)) {
    fs.rmSync(uploadedDocumentPath, { force: true });
  }
  const failed = results.filter((row) => row.status === "fail");
  const payload = {
    generatedAt: new Date().toISOString(),
    restoreStartedAt,
    backupFileName: restoreFileName,
    passed: results.length - failed.length,
    failed: failed.length,
    results
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
  if (failed.length) process.exit(1);
  process.exit(0);
}
