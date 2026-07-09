import { downloadText } from "../utils/formatters.js";
import { normalizeFallbackImportRow, parseCsvText, parseLegacyXlsText, parseXlsxBufferBrowser } from "../utils/importParsers.js";

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function calculatePreviewProfit(db) {
  return db.supply_orders.map((order) => {
    const employee = db.employees.find((row) => row.id === Number(order.employee_id)) || {};
    const department = db.government_departments.find((row) => row.id === Number(order.department_id)) || {};
    const invoices = db.invoices.filter((row) => Number(row.order_id) === Number(order.id));
    const procurements = db.procurements.filter((row) => Number(row.order_id) === Number(order.id));
    const expenses = db.expense_entries.filter((row) => Number(row.order_id) === Number(order.id));
    const payments = db.payments.filter((row) => Number(row.order_id) === Number(order.id));
    const billingValue = sum(invoices.map((row) => ({ value: row.billing_value })), "value");
    const gstRate = invoices.length ? Number(invoices[0].gst_rate || 0) : 0;
    const purchaseValue = sum(procurements.map((row) => ({ value: row.purchase_value })), "value");
    const purchaseCost = procurements.reduce((total, row) => total + Number(row.purchase_value || 0) + Number(row.freight || 0) + Number(row.loading_charges || 0), 0);
    const supplierPaid = procurements.reduce((total, row) => total + Number(row.amount_paid || 0), 0);
    const amountReceived = sum(payments.map((row) => ({ value: row.payment_amount })), "value");
    const grossMargin = billingValue - purchaseValue;
    const gstInputLoss = grossMargin * (gstRate / 100);
    const taxableValue = billingValue / (1 + gstRate / 100);
    const totalExpenses = expenses.reduce((total, row) => {
      if (row.calculation_method === "percentage_gross") return total + billingValue * (Number(row.percentage || 0) / 100);
      if (row.calculation_method === "percentage_taxable") return total + taxableValue * (Number(row.percentage || 0) / 100);
      return total + Number(row.fixed_amount || 0);
    }, 0);
    const initialProfit = grossMargin - gstInputLoss - totalExpenses;
    const employeeIncentive = initialProfit * (Number(employee.incentive_percentage || 0) / 100);
    return {
      ...order,
      department_name: department.department_name,
      employee_name: employee.employee_name,
      billingValue,
      gstRate,
      purchaseValue,
      purchaseCost,
      supplierPaid,
      supplierDue: purchaseCost - supplierPaid,
      amountReceived,
      outstanding: billingValue - amountReceived,
      grossMargin,
      gstInputLoss,
      totalExpenses,
      initialProfit,
      employeeIncentive,
      netCompanyProfit: initialProfit - employeeIncentive
    };
  });
}

function previewFallbackBankImport(db, payload = {}) {
  const rows = (payload.rows || []).map((row, index) => {
    const mapping = payload.mapping && Object.keys(payload.mapping).length ? payload.mapping : detectFallbackBankColumns(payload.rows || []);
    const value = (key) => mapping[key] ? row[mapping[key]] : row[key];
    const debit = Number(String(value("debit") || "0").replace(/,/g, "").replace(/[^\d.-]/g, "")) || 0;
    const credit = Number(String(value("credit") || "0").replace(/,/g, "").replace(/[^\d.-]/g, "")) || 0;
    const amount = Math.max(Math.abs(debit), Math.abs(credit));
    const narration = String(value("narration") || "").trim();
    const transactionDate = String(value("transaction_date") || value("date") || "").trim();
    const utr = String(value("utr") || narration.match(/\b[A-Z0-9]{8,22}\b/i)?.[0] || "").trim();
    const errors = [];
    if (!transactionDate) errors.push("Transaction date missing");
    if (!amount) errors.push("Amount missing");
    if (!narration) errors.push("Narration missing");
    const entryType = credit > 0 && debit <= 0 ? "Receipt" : debit > 0 && credit <= 0 ? "Payment" : "Unknown";
    const duplicateKey = [transactionDate, amount.toFixed(2), utr, narration.toLowerCase()].join("|");
    const duplicate = (db.bank_statement_entries || []).some((entry) => entry.duplicate_key === duplicateKey);
    const payment = db.payments.find((item) => item.utr_number && item.utr_number === utr);
    return {
      raw_row_number: index + 1,
      transaction_date: transactionDate,
      narration,
      debit: Math.abs(debit),
      credit: Math.abs(credit),
      balance: Number(String(value("balance") || "0").replace(/,/g, "").replace(/[^\d.-]/g, "")) || 0,
      utr,
      reference_number: value("reference_number") || "",
      cheque_number: value("cheque_number") || "",
      amount,
      entry_type: entryType,
      duplicate_key: duplicateKey,
      validation_status: errors.length ? "Invalid" : duplicate ? "Duplicate" : "Valid",
      validation_errors: errors.join("; "),
      review_status: "Draft",
      match_status: duplicate ? "Duplicate" : payment ? "Suggested" : errors.length ? "Review Required" : "Unmatched",
      matched_module: payment ? "payments" : "",
      matched_record_id: payment?.id || "",
      matched_reference: payment?.utr_number || "",
      matched_score: payment ? 98 : 0
    };
  });
  return {
    mapping: payload.mapping && Object.keys(payload.mapping).length ? payload.mapping : detectFallbackBankColumns(payload.rows || []),
    totalRows: rows.length,
    validRows: rows.filter((row) => row.validation_status === "Valid").length,
    duplicateRows: rows.filter((row) => row.validation_status === "Duplicate").length,
    errorRows: rows.filter((row) => row.validation_status === "Invalid").length,
    fileHash: rows.map((row) => row.duplicate_key).join("::"),
    rows
  };
}

function detectFallbackBankColumns(rows = []) {
  const headers = Object.keys(rows[0] || {});
  const pick = (...needles) => headers.find((header) => needles.some((needle) => header.toLowerCase().includes(needle)));
  return {
    transaction_date: pick("transaction_date", "date", "txn_date", "value_date"),
    narration: pick("narration", "description", "particular", "details", "remarks"),
    debit: pick("debit", "withdrawal", "paid"),
    credit: pick("credit", "deposit", "received"),
    balance: pick("balance", "closing"),
    utr: pick("utr", "transaction_id", "txn_id", "rrn"),
    reference_number: pick("reference", "ref_no", "instrument"),
    cheque_number: pick("cheque", "chq")
  };
}

export function createBrowserFallbackApi(businessVoucherPreview) {
  const key = "gii-gem-erp-preview";
  const seed = {
    companies: [{ id: 1, company_name: "Gesture India Infrastructure", gstin: "27ABCDE1234F1Z5", pan: "ABCDE1234F", address: "Mumbai", bank_name: "SBI", account_number: "000000000001", ifsc: "SBIN0000001", status: "active", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
    employees: [{ id: 1, employee_name: "Mira Sharma", mobile_number: "9876543210", designation: "Sales Coordinator", incentive_percentage: 15, status: "active", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
    government_departments: [{ id: 1, department_name: "Public Works Department", contact_person: "Procurement Officer", contact_number: "02240000000", address: "Mumbai", status: "active" }],
    suppliers: [{ id: 1, supplier_name: "Prime Industrial Suppliers", supplier_type: "Vendor", supplier_code: "SUP-001", date_of_activation: "2026-06-09", supplier_account_name: "Prime Industrial Suppliers", supplier_account_number: "000000000002", supplier_bank_name: "HDFC", supplier_bank_ifsc_code: "HDFC0000001", supplier_branch: "Mumbai", supplier_contact: "purchase@primeindustrial.example", remarks: "", gstin: "27SUPPL1234F1Z8", contact_details: "purchase@primeindustrial.example", bank_details: "HDFC", status: "active" }],
    items: [{ id: 1, item_name: "Office Workstation", brand: "Generic", model: "GEM-WS-01", hsn_code: "9403", gst_rate: 18, unit: "Nos", category: "Furniture", opening_stock: 0, opening_rate: 0, opening_value: 0, reorder_level: 2, minimum_stock_level: 1, maximum_stock_level: 25, track_serial_number: 0, track_batch_number: 0, warranty_period: 12, status: "active" }, { id: 2, item_name: "Printer", brand: "HP", model: "LaserJet Pro", hsn_code: "8443", gst_rate: 18, unit: "Nos", category: "IT Hardware", opening_stock: 0, opening_rate: 0, opening_value: 0, reorder_level: 3, minimum_stock_level: 2, maximum_stock_level: 20, track_serial_number: 1, track_batch_number: 0, warranty_period: 12, status: "active" }],
    warehouses: [{ id: 1, warehouse_name: "Main Store", location: "Head Office", responsible_person: "Store Keeper", status: "active", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
    expense_heads: [{ id: 1, expense_head_name: "Authorization", default_calculation_method: "percentage_gross", default_percentage: 5, category: "Authorization", status: "active" }, { id: 2, expense_head_name: "L1 Expense", default_calculation_method: "percentage_gross", default_percentage: 2, category: "Tender", status: "active" }, { id: 3, expense_head_name: "Work Incentive", default_calculation_method: "percentage_gross", default_percentage: 10, category: "Work Incentive", status: "active" }],
    banks: [{ id: 1, bank_account_name: "SBI Current Account", bank_name: "SBI", account_number: "000000000001", ifsc: "SBIN0000001", opening_balance: 0, status: "active" }],
    supply_orders: [{ id: 1, order_number: "GEM-2026-001", order_date: "2026-06-09", department_id: 1, institution_name: "PWD Central Store", location: "Mumbai", employee_id: 1, supply_due_date: "2026-06-25", order_status: "Payment Pending", remarks: "Preview order" }],
    procurements: [{ id: 1, order_id: 1, purchase_date: "2026-06-10", supplier_id: 1, purchase_invoice_number: "PIS-1001", purchase_value: 700000, purchase_gst: 126000, freight: 12000, loading_charges: 3000, amount_paid: 400000, remarks: "" }],
    expense_entries: [{ id: 1, order_id: 1, expense_head_id: 1, expense_category: "Authorization", calculation_method: "percentage_gross", percentage: 5, fixed_amount: 0, remarks: "" }, { id: 2, order_id: 1, expense_head_id: 2, expense_category: "Tender", calculation_method: "percentage_gross", percentage: 2, fixed_amount: 0, remarks: "" }, { id: 3, order_id: 1, expense_head_id: 3, expense_category: "Work Incentive", calculation_method: "percentage_gross", percentage: 10, fixed_amount: 0, remarks: "" }],
    invoices: [{ id: 1, order_id: 1, invoice_number: "GII-INV-001", invoice_date: "2026-06-15", billing_value: 1000000, gst_rate: 18, invoice_type: "Tax Invoice", remarks: "" }],
    payments: [{ id: 1, order_id: 1, payment_date: "2026-06-20", payment_amount: 350000, payment_mode: "NEFT", utr_number: "UTR10001", bank_id: 1, remarks: "" }],
    stock_inwards: [{ id: 1, company_id: 1, order_id: 1, supplier_id: 1, item_id: 2, warehouse_id: 1, inward_date: "2026-06-10", purchase_invoice_number: "INV-STOCK-001", quantity: 5, rate: 18000, gst_rate: 18, landed_cost: 90000, serial_number: "PRN-DEMO-001", batch_number: "", posting_status: "Posted", approval_status: "Approved", remarks: "" }],
    stock_outwards: [{ id: 1, company_id: 1, order_id: 1, department_id: 1, item_id: 2, warehouse_id: 1, issue_date: "2026-06-11", delivery_challan_number: "DC-DEMO-001", quantity_issued: 1, serial_number: "PRN-DEMO-001", batch_number: "", posting_status: "Posted", approval_status: "Approved", remarks: "" }],
    stock_adjustments: [],
    stock_returns: [],
    stock_ledger: [
      { id: 1, company_id: 1, item_id: 2, warehouse_id: 1, transaction_date: "2026-06-10", document_number: "INV-STOCK-001", transaction_type: "Inward", inward_quantity: 5, outward_quantity: 0, balance_quantity: 5, rate: 18000, value: 90000, order_id: 1, supplier_id: 1, department_id: "", source_module: "stock_inwards", source_id: 1 },
      { id: 2, company_id: 1, item_id: 2, warehouse_id: 1, transaction_date: "2026-06-11", document_number: "DC-DEMO-001", transaction_type: "Outward", inward_quantity: 0, outward_quantity: 1, balance_quantity: 4, rate: 18000, value: 18000, order_id: 1, supplier_id: "", department_id: 1, source_module: "stock_outwards", source_id: 1 }
    ],
    serial_numbers: [{ id: 1, company_id: 1, item_id: 2, serial_number: "PRN-DEMO-001", warehouse_id: 1, order_id: 1, department_id: 1, delivery_date: "2026-06-11", warranty_expiry: "2027-06-10", status: "Issued" }],
    batches: [],
    bank_statement_imports: [],
    bank_statement_entries: [],
    bank_reconciliation_matches: [],
    voucher_proposals: [],
    voucher_proposal_audit: [],
    guided_vouchers: [],
    vouchers: [],
    voucher_lines: [],
    cash_bank_ledger: [],
    goods_receipts: [],
    goods_receipt_items: [],
    delivery_challans: [],
    delivery_challan_items: [],
    warehouse_transfers: []
  };
  const read = () => {
    const stored = JSON.parse(localStorage.getItem(key) || "{}");
    const merged = { ...seed, ...stored };
    Object.keys(seed).forEach((table) => {
      if (Array.isArray(seed[table]) && !Array.isArray(merged[table])) merged[table] = seed[table];
    });
    if (JSON.stringify(stored) !== JSON.stringify(merged)) localStorage.setItem(key, JSON.stringify(merged));
    return merged;
  };
  const write = (data) => localStorage.setItem(key, JSON.stringify(data));
  const fallbackAccounts = [
    ["1000", "Cash", "Asset", "Debit"],
    ["1010", "Bank", "Asset", "Debit"],
    ["1100", "Trade Receivables", "Asset", "Debit"],
    ["1120", "TDS Receivable", "Asset", "Debit"],
    ["1130", "GST TDS Receivable", "Asset", "Debit"],
    ["1140", "Other Deduction Ledger", "Asset", "Debit"],
    ["1200", "Inventory", "Asset", "Debit"],
    ["1300", "Input GST", "Asset", "Debit"],
    ["2000", "Trade Payables", "Liability", "Credit"],
    ["2050", "Expense Payable", "Liability", "Credit"],
    ["2060", "Employee Incentive Payable", "Liability", "Credit"],
    ["2110", "Output GST", "Liability", "Credit"],
    ["4000", "Sales", "Income", "Credit"],
    ["5000", "Purchase", "Expense", "Debit"],
    ["5100", "Work Incentive Expense", "Expense", "Debit"],
    ["5110", "Authorization Expense", "Expense", "Debit"],
    ["5120", "L1 Expense", "Expense", "Debit"],
    ["5130", "Transport Expense", "Expense", "Debit"],
    ["5140", "Installation Expense", "Expense", "Debit"],
    ["5150", "Miscellaneous Expense", "Expense", "Debit"],
    ["5160", "Bank Charges", "Expense", "Debit"],
    ["5170", "Employee Incentive Expense", "Expense", "Debit"]
  ].map(([account_code, account_name, account_type, normal_balance], index) => ({ id: index + 1, account_code, account_name, account_type, normal_balance, opening_balance: 0 }));
  const fallbackAccountByName = (name) => fallbackAccounts.find((account) => account.account_name === name)
    || fallbackAccounts.find((account) => `${name}`.includes(account.account_name))
    || fallbackAccounts.find((account) => account.account_name === "Miscellaneous Expense");
  const fallbackVoucherType = (kind) => ({
    receipt: "Receipt",
    supplier_payment: "Payment",
    payment: "Payment",
    sales: "Sales",
    purchase: "Purchase",
    expense: "Journal",
    commission: "Journal",
    employee_incentive: "Journal",
    contra: "Contra",
    credit_note: "Credit Note",
    debit_note: "Debit Note"
  }[kind] || "Journal");
  const fallbackVoucherPrefix = (type) => ({
    Receipt: "RECEIPT",
    Payment: "PAYMENT",
    Sales: "SALES",
    Purchase: "PURCHASE",
    Contra: "CONTRA",
    "Credit Note": "CN",
    "Debit Note": "DN"
  }[type] || "JOURNAL");
  const nextFallbackVoucherNumber = (db, type) => {
    const prefix = fallbackVoucherPrefix(type);
    const count = (db.vouchers || []).filter((row) => `${row.voucher_number || ""}`.startsWith(`${prefix}-`)).length + 1;
    return `${prefix}-${String(count).padStart(5, "0")}`;
  };
  const applyFallbackPurchaseInventory = (db, guided, voucher) => {
    if (!["purchase", "purchase_voucher"].includes(String(guided.voucher_kind || "").toLowerCase())) return false;
    const payload = JSON.parse(guided.payload_json || "{}");
    if (payload.inventory_enabled === false || payload.inventory_enabled === "0") return false;
    const itemId = Number(payload.item_id || 0);
    const warehouseId = Number(payload.warehouse_id || 0);
    const quantity = Number(payload.quantity || payload.quantity_received || 0);
    const damaged = Number(payload.damaged_quantity || 0);
    const accepted = Math.max(0, Number(payload.accepted_quantity || (quantity - damaged)));
    if (!itemId || !warehouseId || accepted <= 0) return false;
    const alreadyPosted = (db.stock_ledger || []).some((row) => row.source_module === "guided_vouchers" && Number(row.source_id) === Number(guided.id));
    if (alreadyPosted) return false;
    const rate = Number(payload.rate || payload.purchase_rate || 0) || (Number(payload.purchase_value || 0) / accepted);
    const value = accepted * rate;
    const existingBalance = (db.stock_ledger || [])
      .filter((row) => Number(row.item_id) === itemId && Number(row.warehouse_id) === warehouseId)
      .reduce((sum, row) => sum + Number(row.inward_quantity || 0) - Number(row.outward_quantity || 0), 0);
    const stockInwardId = Date.now() + 100;
    const grnId = Date.now() + 200;
    db.goods_receipts = [{
      id: grnId,
      company_id: Number(guided.company_id || 1),
      grn_number: `GRN-${String((db.goods_receipts || []).length + 1).padStart(5, "0")}`,
      purchase_voucher_id: voucher?.id || guided.posted_voucher_id || null,
      guided_voucher_id: guided.id,
      supplier_id: payload.supplier_id || null,
      warehouse_id: warehouseId,
      grn_date: guided.voucher_date,
      status: "Posted",
      remarks: payload.remarks || "Automatic stock receipt from guided purchase voucher",
      posted_at: new Date().toISOString()
    }, ...(db.goods_receipts || [])];
    db.stock_inwards = [{
      id: stockInwardId,
      company_id: Number(guided.company_id || 1),
      order_id: payload.order_id || null,
      supplier_id: payload.supplier_id || null,
      item_id: itemId,
      warehouse_id: warehouseId,
      inward_date: guided.voucher_date,
      purchase_invoice_number: payload.purchase_invoice_number || voucher?.voucher_number || guided.posted_voucher_number || "",
      quantity: accepted,
      rate,
      gst_rate: Number(payload.gst_rate || 0),
      landed_cost: value,
      posting_status: "Posted",
      approval_status: "Approved",
      remarks: payload.remarks || "Automatic stock receipt from guided purchase voucher"
    }, ...(db.stock_inwards || [])];
    db.stock_ledger = [...(db.stock_ledger || []), {
      id: Date.now() + 300,
      company_id: Number(guided.company_id || 1),
      item_id: itemId,
      warehouse_id: warehouseId,
      transaction_date: guided.voucher_date,
      document_number: payload.purchase_invoice_number || voucher?.voucher_number || guided.posted_voucher_number || "",
      transaction_type: "Inward",
      inward_quantity: accepted,
      outward_quantity: 0,
      balance_quantity: existingBalance + accepted,
      rate,
      value,
      order_id: payload.order_id || null,
      supplier_id: payload.supplier_id || null,
      source_module: "guided_vouchers",
      source_id: guided.id,
      remarks: payload.remarks || "Automatic stock receipt from guided purchase voucher"
    }];
    return true;
  };
  const reconcileFallbackGuidedSideEffects = (db) => {
    let changed = false;
    (db.guided_vouchers || []).filter((row) => row.status === "Posted").forEach((guided) => {
      const voucher = (db.vouchers || []).find((row) => Number(row.id) === Number(guided.posted_voucher_id));
      if (applyFallbackPurchaseInventory(db, guided, voucher)) changed = true;
    });
    return changed;
  };
  const postFallbackGuidedVoucher = (db, id) => {
    const guided = (db.guided_vouchers || []).find((row) => Number(row.id) === Number(id));
    if (!guided) throw new Error("Guided voucher not found");
    if (guided.posted_voucher_id) return (db.vouchers || []).find((row) => Number(row.id) === Number(guided.posted_voucher_id)) || { id: guided.posted_voucher_id, voucher_number: guided.posted_voucher_number, status: "Posted" };
    const payload = JSON.parse(guided.payload_json || "{}");
    const previewLines = businessVoucherPreview({ ...payload, voucher_kind: guided.voucher_kind });
    if (previewLines.length < 2) throw new Error("Enter a valid debit and credit voucher before posting");
    const debit = previewLines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const credit = previewLines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
    if (Math.round(debit * 100) !== Math.round(credit * 100)) throw new Error("Voucher debit and credit totals must match before posting");
    const voucherType = fallbackVoucherType(guided.voucher_kind);
    const voucherId = Date.now();
    const voucherNumber = nextFallbackVoucherNumber(db, voucherType);
    const voucher = {
      id: voucherId,
      company_id: Number(guided.company_id || 1),
      voucher_number: voucherNumber,
      voucher_date: guided.voucher_date,
      voucher_type: voucherType,
      narration: guided.narration || payload.narration || `${voucherType} voucher`,
      status: "Posted",
      source_module: "guided_vouchers",
      source_id: guided.id,
      is_deleted: 0,
      created_at: new Date().toISOString(),
      posted_at: new Date().toISOString()
    };
    const lines = previewLines.map((line, index) => {
      const account = fallbackAccountByName(line.account);
      return {
        id: voucherId + index + 1,
        voucher_id: voucherId,
        company_id: voucher.company_id,
        account_id: account.id,
        account_code: account.account_code,
        account_name: account.account_name,
        voucher_date: voucher.voucher_date,
        voucher_number: voucher.voucher_number,
        voucher_type: voucher.voucher_type,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        narration: voucher.narration
      };
    });
    db.vouchers = [voucher, ...(db.vouchers || [])];
    db.voucher_lines = [...lines, ...(db.voucher_lines || [])];
    db.guided_vouchers = (db.guided_vouchers || []).map((row) => Number(row.id) === Number(id) ? { ...row, status: "Posted", posted_voucher_id: voucherId, posted_voucher_number: voucherNumber, posted_at: new Date().toISOString(), updated_at: new Date().toISOString() } : row);
    applyFallbackPurchaseInventory(db, { ...guided, status: "Posted", posted_voucher_id: voucherId, posted_voucher_number: voucherNumber }, voucher);
    return voucher;
  };
  return {
    login: async ({ username, password }) => username === "admin" && password === "admin123" ? { displayName: "System Administrator", username } : null,
    getDashboardCounts: async () => {
      const db = read();
      if (reconcileFallbackGuidedSideEffects(db)) write(db);
      const profit = calculatePreviewProfit(db);
      const voucherLines = db.voucher_lines || [];
      const totalOrderValue = db.invoices.reduce((sum, row) => sum + Number(row.billing_value || 0), 0)
        + voucherLines.filter((row) => row.account_name === "Sales").reduce((sum, row) => sum + Number(row.credit || 0) - Number(row.debit || 0), 0);
      const amountReceived = db.payments.reduce((sum, row) => sum + Number(row.payment_amount || 0), 0)
        + voucherLines.filter((row) => ["Cash", "Bank"].includes(row.account_name) && row.voucher_type === "Receipt").reduce((sum, row) => sum + Number(row.debit || 0), 0);
      const stockBalances = new Map();
      (db.stock_ledger || []).forEach((row) => {
        const key = `${row.item_id || ""}:${row.warehouse_id || ""}`;
        stockBalances.set(key, (stockBalances.get(key) || 0) + Number(row.inward_quantity || 0) - Number(row.outward_quantity || 0));
      });
      return {
        totalOrders: db.supply_orders.length,
        activeOrders: db.supply_orders.filter((row) => !["Closed", "Fully Received"].includes(row.order_status)).length,
        totalOrderValue,
        amountReceived,
        outstanding: totalOrderValue - amountReceived,
        totalProfit: profit.reduce((sum, row) => sum + row.netCompanyProfit, 0),
        suppliers: db.suppliers.length,
        companies: db.companies.length,
        employees: db.employees.filter((row) => row.status === "active").length,
        departments: db.government_departments.length,
        items: db.items.length,
        expenseHeads: db.expense_heads.length,
        banks: db.banks.length,
        totalStockValue: db.stock_ledger.reduce((sum, row) => sum + (row.transaction_type === "Outward" ? -Number(row.value || 0) : Number(row.value || 0)), 0),
        lowStockItems: 1,
        itemsInStock: [...stockBalances.values()].filter((quantity) => quantity > 0).length,
        itemsIssued: db.stock_ledger.reduce((sum, row) => sum + Number(row.outward_quantity || 0), 0),
        returnedItems: db.stock_returns.reduce((sum, row) => sum + Number(row.quantity || 0), 0)
      };
    },
    getReferences: async () => {
      const db = read();
      return {
        companies: db.companies,
        employees: db.employees,
        departments: db.government_departments,
        suppliers: db.suppliers,
        items: db.items,
        warehouses: db.warehouses,
        expenseHeads: db.expense_heads,
        banks: db.banks,
        orders: db.supply_orders
      };
    },
    getBillingData: async () => {
      const db = read();
      const profitability = calculatePreviewProfit(db);
      return {
        references: {
          companies: db.companies,
          employees: db.employees,
          departments: db.government_departments,
          suppliers: db.suppliers,
          items: db.items,
          expenseHeads: db.expense_heads,
          banks: db.banks,
          orders: db.supply_orders
        },
        financialYears: [{ id: 1, financial_year_name: "FY 2026-27", start_date: "2026-04-01", end_date: "2027-03-31", status: "Open" }],
        invoices: db.invoices.map((invoice) => {
          const order = db.supply_orders.find((row) => Number(row.id) === Number(invoice.order_id)) || {};
          const department = db.government_departments.find((row) => Number(row.id) === Number(order.department_id)) || {};
          const received = db.payments.filter((row) => Number(row.order_id) === Number(invoice.order_id)).reduce((sum, row) => sum + Number(row.payment_amount || 0), 0);
          const invoiceValue = Number(invoice.billing_value || 0) + (Number(invoice.billing_value || 0) * Number(invoice.gst_rate || 0) / 100);
          return { ...invoice, company_name: db.companies[0]?.company_name, financial_year_name: "FY 2026-27", order_number: order.order_number, department_id: order.department_id, department_name: department.department_name, institution_name: order.institution_name, location: order.location, invoice_value: invoiceValue, amount_received: received, balance_outstanding: invoiceValue - received, posting_status: invoice.posting_status || "Draft" };
        }),
        invoiceItems: [],
        orderItems: [],
        billingQuantities: [],
        documents: [],
        receiptAdvances: [{ id: 1, receipt_reference: "UTR10001", department_name: "Public Works Department", order_number: "GEM-2026-001", advance_received: 100000, advance_adjusted: 0, balance_advance: 100000, status: "Open" }],
        supplierAdvances: [{ id: 1, payment_reference: "SUPPAY-PREVIEW", supplier_name: "Prime Industrial Suppliers", advance_paid: 50000, advance_adjusted: 0, balance_advance: 50000, status: "Open" }],
        advanceAdjustments: [],
        profitability
      };
    },
    saveBillingVoucher: async ({ header, items }) => {
      const db = read();
      const record = {
        id: header.id || Date.now(),
        ...header,
        billing_value: header.billing_value,
        gst_rate: header.gst_rate,
        posting_status: header.posting_status || "Draft",
        approval_status: header.approval_status || "Draft",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      db.invoices = header.id ? db.invoices.map((row) => Number(row.id) === Number(header.id) ? { ...row, ...record } : row) : [...db.invoices, record];
      write(db);
      return { ...record, items };
    },
    getInventoryData: async () => {
      const db = read();
      const itemById = (id) => db.items.find((row) => Number(row.id) === Number(id)) || {};
      const warehouseById = (id) => db.warehouses.find((row) => Number(row.id) === Number(id)) || {};
      const orderById = (id) => db.supply_orders.find((row) => Number(row.id) === Number(id)) || {};
      const supplierById = (id) => db.suppliers.find((row) => Number(row.id) === Number(id)) || {};
      const departmentById = (id) => db.government_departments.find((row) => Number(row.id) === Number(id)) || {};
      const stockLedger = db.stock_ledger.map((row) => ({
        ...row,
        item_name: itemById(row.item_id).item_name,
        warehouse_name: warehouseById(row.warehouse_id).warehouse_name,
        order_number: orderById(row.order_id).order_number,
        supplier_name: supplierById(row.supplier_id).supplier_name,
        department_name: departmentById(row.department_id).department_name
      }));
      const summary = db.items.flatMap((item) => db.warehouses.map((warehouse) => {
        const rows = db.stock_ledger.filter((row) => Number(row.item_id) === Number(item.id) && Number(row.warehouse_id) === Number(warehouse.id));
        const closing_quantity = rows.reduce((sum, row) => sum + Number(row.inward_quantity || 0) - Number(row.outward_quantity || 0), Number(item.opening_stock || 0));
        const stock_value = rows.reduce((sum, row) => sum + (row.transaction_type === "Outward" ? -Number(row.value || 0) : Number(row.value || 0)), Number(item.opening_value || 0));
        return { ...item, warehouse_name: warehouse.warehouse_name, closing_quantity, weighted_rate: closing_quantity > 0 ? stock_value / closing_quantity : Number(item.opening_rate || 0), stock_value, valuation_method: "Weighted Average" };
      }));
      return {
        references: { companies: db.companies, employees: db.employees, departments: db.government_departments, suppliers: db.suppliers, items: db.items, warehouses: db.warehouses, banks: db.banks, orders: db.supply_orders },
        companies: db.companies,
        stockSummary: summary,
        dashboard: [
          { id: "stock_value", metric: "Total Stock Value", value: summary.reduce((sum, row) => sum + Number(row.stock_value || 0), 0), note: "Weighted average" },
          { id: "reserved_value", metric: "Reserved Stock Value", value: 0, note: "Open reservations" },
          { id: "pending_grns", metric: "Pending GRNs", value: db.goods_receipts.filter((row) => row.status !== "Posted").length, note: "Not posted" },
          { id: "pending_deliveries", metric: "Pending Deliveries", value: db.delivery_challans.filter((row) => row.status !== "Confirmed").length, note: "Not confirmed" }
        ],
        stockLedger,
        stockMovement: stockLedger,
        movements: [],
        reservations: [],
        procurementRequirements: [],
        goodsReceipts: db.goods_receipts,
        deliveryChallans: db.delivery_challans,
        warehouseTransfers: db.warehouse_transfers,
        cogsReport: [],
        reservationAgeing: [],
        lowStock: summary.filter((row) => Number(row.closing_quantity || 0) <= Number(row.reorder_level || 0)),
        serialNumbers: db.serial_numbers.map((row) => ({ ...row, item_name: itemById(row.item_id).item_name, warehouse_name: warehouseById(row.warehouse_id).warehouse_name, order_number: orderById(row.order_id).order_number, department_name: departmentById(row.department_id).department_name })),
        batches: db.batches.map((row) => ({ ...row, item_name: itemById(row.item_id).item_name, supplier_name: supplierById(row.supplier_id).supplier_name, warehouse_name: warehouseById(row.warehouse_id).warehouse_name })),
        valuation: summary.filter((row) => row.closing_quantity || row.stock_value),
        itemProfitability: [{ id: 1, item_name: "Printer", order_number: "GEM-2026-001", billing_value: 100000, issued_stock_cost: 18000, gross_margin: 82000 }],
        adjustments: db.stock_adjustments,
        returns: db.stock_returns,
        inwards: db.stock_inwards,
        outwards: db.stock_outwards
      };
    },
    postStockInward: async (id) => ({ id, posting_status: "Posted" }),
    postStockOutward: async (id) => ({ id, posting_status: "Posted" }),
    autoReserveOrderStock: async (orderId) => ({ order_id: orderId, status: "Reserved", reservations: [] }),
    createDeliveryChallan: async (payload) => ({ id: Date.now(), status: "Draft", ...payload }),
    confirmDeliveryChallan: async (id) => ({ id, status: "Confirmed" }),
    createWarehouseTransfer: async (payload) => ({ id: Date.now(), status: "Draft", ...payload }),
    postWarehouseTransfer: async (id) => ({ id, status: "Posted" }),
    approveStockAdjustment: async (id, userId, remarks) => ({ id, userId, remarks, approval_status: "Approved" }),
    postStockAdjustment: async (id) => ({ id, posting_status: "Posted" }),
    postStockReturn: async (id) => ({ id, posting_status: "Posted" }),
    getProfitability: async () => calculatePreviewProfit(read()),
    getAccountingData: async () => {
      const db = read();
      const profit = calculatePreviewProfit(db)[0];
      const accounts = fallbackAccounts;
      const persistedVouchers = db.vouchers || [];
      const persistedVoucherLines = (db.voucher_lines || []).map((line) => {
        const voucher = persistedVouchers.find((row) => Number(row.id) === Number(line.voucher_id)) || {};
        const account = accounts.find((row) => Number(row.id) === Number(line.account_id)) || {};
        return {
          ...line,
          voucher_date: line.voucher_date || voucher.voucher_date,
          voucher_number: line.voucher_number || voucher.voucher_number,
          voucher_type: line.voucher_type || voucher.voucher_type,
          account_code: line.account_code || account.account_code,
          account_name: line.account_name || account.account_name
        };
      });
      const previewVoucherLines = profit ? [
        { id: 1, voucher_id: 1, voucher_date: "2026-06-15", voucher_number: "SALES-00001", voucher_type: "Sales", account_code: "1100", account_name: "Trade Receivables", debit: profit.billingValue * 1.18, credit: 0, narration: "Preview sales invoice" },
        { id: 2, voucher_id: 1, voucher_date: "2026-06-15", voucher_number: "SALES-00001", voucher_type: "Sales", account_code: "4000", account_name: "Sales", debit: 0, credit: profit.billingValue, narration: "Preview sales invoice" },
        { id: 3, voucher_id: 1, voucher_date: "2026-06-15", voucher_number: "SALES-00001", voucher_type: "Sales", account_code: "2110", account_name: "Output GST", debit: 0, credit: profit.billingValue * .18, narration: "Preview sales invoice" }
      ] : [];
      const voucherLines = persistedVoucherLines.length ? persistedVoucherLines : previewVoucherLines;
      const profitLossRows = accounts.filter((row) => ["Income", "Expense"].includes(row.account_type)).map((account) => ({
        ...account,
        debit: voucherLines.filter((line) => line.account_name === account.account_name).reduce((sum, line) => sum + Number(line.debit || 0), 0) || (account.account_name === "Purchase" ? profit?.purchaseValue || 0 : 0),
        credit: voucherLines.filter((line) => line.account_name === account.account_name).reduce((sum, line) => sum + Number(line.credit || 0), 0) || (account.account_name === "Sales" ? profit?.billingValue || 0 : 0),
        amount: account.account_name === "Sales" ? profit?.billingValue || 0 : account.account_name === "Purchase" ? profit?.purchaseValue || 0 : 0
      }));
      const profitLoss = { rows: profitLossRows, income: profit?.billingValue || 0, expenses: profit?.purchaseValue || 0, netProfit: (profit?.billingValue || 0) - (profit?.purchaseValue || 0) };
      const balanceRows = accounts.filter((row) => ["Asset", "Liability", "Equity"].includes(row.account_type)).map((account) => ({ ...account, debit: 0, credit: 0, amount: 0 }));
      const invoiceValue = (db.invoices[0]?.billing_value || 0) * 1.18;
      const receiptAmount = db.payments[0]?.payment_amount || 0;
      const purchaseValue = (db.procurements[0]?.purchase_value || 0) + (db.procurements[0]?.purchase_gst || 0);
      const supplierPaid = db.procurements[0]?.amount_paid || 0;
      return {
        references: { companies: db.companies, employees: db.employees, departments: db.government_departments, suppliers: db.suppliers, items: db.items, warehouses: db.warehouses, banks: db.banks, orders: db.supply_orders },
        companies: db.companies,
        departments: db.government_departments,
        suppliers: db.suppliers,
        employees: db.employees,
        banks: db.banks,
        guidedVouchers: db.guided_vouchers,
        payments: db.payments,
        supplierPayments: [],
        invoices: db.invoices,
        procurements: db.procurements,
        accounts,
        vouchers: persistedVouchers,
        voucherLines,
        dayBook: persistedVouchers.length ? persistedVouchers.map((voucher) => {
          const lines = voucherLines.filter((line) => Number(line.voucher_id) === Number(voucher.id));
          return {
            ...voucher,
            debit: lines.reduce((sum, line) => sum + Number(line.debit || 0), 0),
            credit: lines.reduce((sum, line) => sum + Number(line.credit || 0), 0)
          };
        }) : [{ id: 1, voucher_date: "2026-06-15", voucher_number: "SALES-00001", voucher_type: "Sales", status: "Posted", source_module: "billing", narration: "Preview sales invoice", debit: profit?.billingValue * 1.18 || 0, credit: profit?.billingValue * 1.18 || 0 }],
        ledger: voucherLines.map((row) => ({ ...row, entry_date: row.voucher_date, running_balance: row.debit - row.credit })),
        cashBank: db.payments.map((row) => ({ ...row, transaction_date: row.payment_date, transaction_type: "Receipt", debit: row.payment_amount, credit: 0, balance: row.payment_amount })),
        receivables: db.invoices.map((row) => ({ invoice_number: row.invoice_number, invoice_amount: row.billing_value * 1.18, amount_received: profit?.amountReceived || 0, tds_deducted: 0, gst_tds_deducted: 0, balance_outstanding: row.billing_value * 1.18 - (profit?.amountReceived || 0), days_outstanding: 0 })),
        payables: db.procurements.map((row) => ({ supplier_name: "Prime Industrial Suppliers", purchase_invoice_number: row.purchase_invoice_number, purchase_value: row.purchase_value + row.purchase_gst, amount_paid: row.amount_paid, balance_due: row.purchase_value + row.purchase_gst - row.amount_paid })),
        trialBalance: accounts.map((account) => ({ ...account, debit: 0, credit: 0, balance: 0 })),
        profitLoss,
        balanceSheet: { rows: balanceRows, assets: 0, liabilities: 0, equity: 0, currentProfit: profitLoss.netProfit, liabilitiesAndEquity: profitLoss.netProfit },
        gstSummary: { inputGst: 126000, outputGst: 180000, netGstPayable: 54000, gstImpactOnProfitability: 54000 },
        postingControl: [
          { id: "billing-1", module: "Billing", record_id: 1, reference: "GII-INV-001", record_date: "2026-06-15", amount: profit?.billingValue || 0, voucher_number: "SALES-00001", approval_status: "Approved", posting_status: "Posted" },
          { id: "procurement-1", module: "Procurement", record_id: 1, reference: "PIS-1001", record_date: "2026-06-10", amount: 826000, voucher_number: "", approval_status: "Draft", posting_status: "Draft", posting_error: "" }
        ],
        partyLedger: [
          { id: 1, party_type: "department", party_name: "Public Works Department", voucher_date: "2026-06-15", voucher_number: "SALES-00001", account_name: "Trade Receivables", debit: profit?.billingValue * 1.18 || 0, credit: 0, party_balance: profit?.billingValue * 1.18 || 0 }
        ],
        financialControl: [
          { id: "period", control: "Report Period", value: "Preview", status: "Open" },
          { id: "trial", control: "Trial Balance Difference", value: 0, status: "Balanced" },
          { id: "unposted", control: "Unposted Business Records", value: 1, status: "Review Required" },
          { id: "reversed", control: "Reversed Vouchers", value: 0, status: "Clear" }
        ],
        financialYears: [
          { id: 1, financial_year_name: "FY 2026-27", start_date: "2026-04-01", end_date: "2027-03-31", status: "Open", closed_at: "", locked_at: "" }
        ],
        openingBalances: [],
        approvalQueue: [
          { id: 1, module_name: "procurements", record_id: 1, approval_status: "Draft", maker_name: "System Administrator", checker_name: "", submitted_at: "", approved_at: "", remarks: "" }
        ],
        gstRegisters: {
          output: [{ date: "2026-06-15", reference: "GII-INV-001", order_number: "GEM-2026-001", taxable: 1000000, gst_rate: 18, gst_amount: 180000, posting_status: "Posted" }],
          input: [{ date: "2026-06-10", reference: "PIS-1001", order_number: "GEM-2026-001", taxable: 700000, gst_rate: 18, gst_amount: 126000, posting_status: "Draft" }],
          payable: 54000
        },
        tdsRegisters: [],
        accountingRegisters: { journal: [], sales: [], purchase: [] },
        billOutstanding: {
          departments: [{ party_name: "Public Works Department", reference: "GII-INV-001", invoice_amount: 1180000, amount_received: 350000, tds_deducted: 0, gst_tds_deducted: 0, balance_outstanding: 830000 }],
          suppliers: [{ party_name: "Prime Industrial Suppliers", reference: "PIS-1001", invoice_amount: 826000, amount_paid: 400000, balance_outstanding: 426000 }]
        },
        billWiseReceivables: [{ id: 1, billing_id: 1, department_id: 1, department_name: "Public Works Department", order_number: "GEM-2026-001", invoice_number: "GII-INV-001", invoice_date: "2026-06-15", invoice_amount: invoiceValue, amount_received: receiptAmount, advance_adjusted: 0, tds_deducted: 0, gst_tds_deducted: 0, other_deductions: 0, balance_outstanding: invoiceValue - receiptAmount, due_date: "2026-07-15", days_outstanding: 0, allocation_status: receiptAmount ? "Partially Allocated" : "Unallocated", status: "Partially Paid" }],
        billWisePayables: [{ id: 1, procurement_id: 1, supplier_id: 1, supplier_name: "Prime Industrial Suppliers", order_number: "GEM-2026-001", purchase_invoice_number: "PIS-1001", invoice_date: "2026-06-10", invoice_amount: purchaseValue, amount_paid: supplierPaid, advance_adjusted: 0, balance_due: purchaseValue - supplierPaid, due_date: "2026-07-10", days_outstanding: 0, allocation_status: supplierPaid ? "Partially Allocated" : "Unallocated", status: "Partially Paid" }],
        paymentAllocations: [],
        supplierPaymentAllocations: [],
        allocationReconciliation: [],
        unallocatedReceipts: [{ payment_id: 1, receipt_reference: "UTR10001", payment_date: "2026-06-20", receipt_amount: receiptAmount, department_id: 1, department_name: "Public Works Department", allocated_amount: 0, advance_balance: 0, invoice_outstanding: invoiceValue - receiptAmount, unallocated_amount: receiptAmount, allocation_status: "Unallocated" }],
        unallocatedSupplierPayments: [],
        advanceReceipts: [{ id: 1, receipt_reference: "UTR10001", department_name: "Public Works Department", order_number: "GEM-2026-001", advance_received: 100000, advance_adjusted: 0, balance_advance: 100000, status: "Open" }],
        supplierAdvances: [{ id: 1, payment_reference: "SUPPAY-PREVIEW", supplier_name: "Prime Industrial Suppliers", advance_paid: 50000, advance_adjusted: 0, balance_advance: 50000, status: "Open" }],
        advanceAdjustments: [],
        allocationAudit: [],
        creditTerms: [{ id: 1, party_type: "department", party_id: 1, party_name: "Public Works Department", default_credit_days: 30, grace_period: 0, due_date_rule: "invoice_date", status: "active" }],
        yearEndClosings: [],
        carryForwardEntries: [],
        statementSummary: { grossRevenue: 1000000, purchaseCost: 700000, grossProfit: 300000, totalExpenses: 0, netProfit: 300000, assets: 0, liabilitiesAndEquity: 300000, balanceSheetDifference: -300000 }
      };
    },
    getBankStatementData: async (filters = {}) => {
      const db = read();
      const imports = db.bank_statement_imports || [];
      const importId = Number(filters.import_id || imports[0]?.id || 0);
      const entries = (db.bank_statement_entries || []).filter((row) => !importId || Number(row.import_id) === importId);
      return {
        imports,
        entries,
        matches: (db.bank_reconciliation_matches || []).filter((row) => entries.some((entry) => entry.id === row.bank_entry_id)),
        unmatchedReceipts: (db.bank_statement_entries || []).filter((row) => row.entry_type === "Receipt" && row.match_status === "Unmatched"),
        unmatchedPayments: (db.bank_statement_entries || []).filter((row) => row.entry_type === "Payment" && row.match_status === "Unmatched"),
        duplicates: (db.bank_statement_entries || []).filter((row) => row.match_status === "Duplicate" || row.validation_status === "Duplicate"),
        reviewRequired: (db.bank_statement_entries || []).filter((row) => row.validation_status !== "Valid"),
        references: { vouchers: [], invoices: db.invoices.map((row) => ({ id: row.id, reference: row.invoice_number, type: "Invoice", amount: row.billing_value })), payments: db.payments.map((row) => ({ id: row.id, reference: row.utr_number, type: "Receipt", amount: row.payment_amount })), supplier_payments: [], procurements: db.procurements.map((row) => ({ id: row.id, reference: row.purchase_invoice_number, type: "Purchase Bill", amount: row.purchase_value })), orders: db.supply_orders.map((row) => ({ id: row.id, reference: row.order_number, type: "Order", amount: 0 })) },
        banks: db.banks,
        companies: db.companies
      };
    },
    previewBankImport: async (payload) => previewFallbackBankImport(read(), payload),
    createBankImport: async (payload) => {
      const db = read();
      const preview = previewFallbackBankImport(db, payload);
      const duplicateImport = (db.bank_statement_imports || []).find((item) => item.file_hash === preview.fileHash);
      if (duplicateImport) throw new Error(`Duplicate bank statement import blocked. Existing import #${duplicateImport.id}`);
      const importId = Date.now();
      const importRow = {
        id: importId,
        company_id: Number(payload.company_id || db.companies[0]?.id || 1),
        bank_id: payload.bank_id || "",
        bank_name: payload.bank_name || "Generic Format",
        source_file_name: payload.file_name || "bank-statement",
        file_hash: preview.fileHash,
        total_rows: preview.totalRows,
        valid_rows: preview.validRows,
        duplicate_rows: preview.duplicateRows,
        error_rows: preview.errorRows,
        status: "Draft",
        posting_status: "Not Posted",
        imported_at: new Date().toISOString(),
        remarks: payload.remarks || ""
      };
      db.bank_statement_imports = [importRow, ...(db.bank_statement_imports || [])];
      db.bank_statement_entries = [...(db.bank_statement_entries || []), ...preview.rows.map((row, index) => ({ id: importId + index + 1, import_id: importId, ...row }))];
      write(db);
      return fallbackApi.getBankStatementData({ import_id: importId });
    },
    updateBankImportStatus: async (importId, status, userId, remarks) => {
      const db = read();
      const importRow = db.bank_statement_imports.find((row) => Number(row.id) === Number(importId));
      if (!importRow) throw new Error("Bank statement import not found");
      if (status === "Approved" && (Number(importRow.error_rows || 0) > 0 || Number(importRow.duplicate_rows || 0) > 0)) throw new Error("Resolve validation errors and duplicates before approval");
      importRow.status = status;
      importRow.remarks = remarks || importRow.remarks;
      if (status === "Approved") importRow.approved_at = new Date().toISOString();
      if (status === "Rejected") importRow.rejected_at = new Date().toISOString();
      db.bank_statement_entries = db.bank_statement_entries.map((row) => Number(row.import_id) === Number(importId) ? { ...row, review_status: status } : row);
      write(db);
      return fallbackApi.getBankStatementData({ import_id: importId });
    },
    manualBankEntryMatch: async (entryId, payload) => {
      const db = read();
      db.bank_statement_entries = db.bank_statement_entries.map((row) => Number(row.id) === Number(entryId) ? { ...row, match_status: "Matched", matched_module: payload.matched_module, matched_record_id: payload.matched_record_id, matched_reference: `${payload.matched_module} #${payload.matched_record_id}`, matched_score: 100 } : row);
      db.bank_reconciliation_matches = [...(db.bank_reconciliation_matches || []), { id: Date.now(), bank_entry_id: entryId, matched_module: payload.matched_module, matched_record_id: payload.matched_record_id, matched_reference: `${payload.matched_module} #${payload.matched_record_id}`, confidence_score: 100, status: "Accepted", matched_at: new Date().toISOString() }];
      write(db);
      return db.bank_statement_entries.find((row) => Number(row.id) === Number(entryId));
    },
    postApprovedBankImport: async () => {
      throw new Error("Direct Bank Book posting is disabled. Use Voucher Proposal Queue.");
    },
    getVoucherProposals: async () => {
      const db = read();
      const proposals = db.voucher_proposals || [];
      return {
        proposals,
        dashboard: {
          pendingProposals: proposals.filter((row) => ["Suggested", "Needs Review"].includes(row.status)).length,
          approvedPendingPosting: proposals.filter((row) => ["Approved", "Draft Voucher Created"].includes(row.status)).length,
          rejectedProposals: proposals.filter((row) => row.status === "Rejected").length,
          postedProposals: proposals.filter((row) => row.status === "Posted").length,
          unmatchedEntries: (db.bank_statement_entries || []).filter((row) => row.match_status === "Unmatched").length,
          duplicateBankEntries: (db.bank_statement_entries || []).filter((row) => row.match_status === "Duplicate").length,
          bankEntriesAwaitingReview: (db.bank_statement_entries || []).filter((row) => ["Draft", "Ready for Review", "Approved", "Ready for Voucher Proposal"].includes(row.review_status)).length
        },
        audit: db.voucher_proposal_audit || [],
        accounts: [
          { id: 1, account_code: "1010", account_name: "Bank", account_type: "Asset" },
          { id: 2, account_code: "1100", account_name: "Trade Receivables", account_type: "Asset" },
          { id: 3, account_code: "2000", account_name: "Trade Payables", account_type: "Liability" },
          { id: 4, account_code: "5160", account_name: "Bank Charges", account_type: "Expense" }
        ].concat(db.accounts || []),
        departments: db.government_departments,
        suppliers: db.suppliers
      };
    },
    generateVoucherProposals: async (importId) => {
      const db = read();
      const importRow = db.bank_statement_imports.find((row) => Number(row.id) === Number(importId));
      if (!importRow || importRow.status !== "Approved") throw new Error("Bank import must be approved before proposal generation");
      const existingIds = new Set((db.voucher_proposals || []).map((row) => Number(row.bank_entry_id)));
      const entries = (db.bank_statement_entries || []).filter((row) => Number(row.import_id) === Number(importId) && row.validation_status === "Valid" && row.match_status !== "Duplicate" && !existingIds.has(Number(row.id)));
      const proposals = entries.map((entry, index) => {
        const receipt = Number(entry.credit || 0) > 0;
        const party = receipt ? db.government_departments[0] : db.suppliers[0];
        return {
          id: Date.now() + index,
          company_id: importRow.company_id,
          bank_entry_id: entry.id,
          import_id: importId,
          bank_id: importRow.bank_id,
          bank_name: importRow.bank_name,
          transaction_date: entry.transaction_date,
          narration: entry.narration,
          debit: entry.debit,
          credit: entry.credit,
          utr: entry.utr,
          reference_number: entry.reference_number,
          suggested_voucher_type: receipt ? "Receipt" : "Payment",
          suggested_party_type: receipt ? "Department" : "Supplier",
          suggested_party_id: party?.id || "",
          suggested_party_name: party?.department_name || party?.supplier_name || "",
          suggested_ledger_id: receipt ? 2 : 3,
          suggested_ledger_name: receipt ? "Trade Receivables" : "Trade Payables",
          confidence_score: entry.matched_score || 65,
          status: (entry.matched_score || 0) >= 70 ? "Suggested" : "Needs Review",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      });
      db.voucher_proposals = [...proposals, ...(db.voucher_proposals || [])];
      db.voucher_proposal_audit = [...proposals.map((row) => ({ id: row.id, proposal_id: row.id, bank_entry_id: row.bank_entry_id, action: "Proposal Generated", created_at: new Date().toISOString(), status: "Generated" })), ...(db.voucher_proposal_audit || [])];
      write(db);
      return fallbackApi.getVoucherProposals({});
    },
    updateVoucherProposal: async (proposalId, payload) => {
      const db = read();
      db.voucher_proposals = (db.voucher_proposals || []).map((row) => Number(row.id) === Number(proposalId) ? { ...row, ...payload, status: payload.status || "Needs Review", updated_at: new Date().toISOString() } : row);
      db.voucher_proposal_audit = [{ id: Date.now(), proposal_id: proposalId, action: "Proposal Edited", created_at: new Date().toISOString(), status: "Edited" }, ...(db.voucher_proposal_audit || [])];
      write(db);
      return fallbackApi.getVoucherProposals({});
    },
    approveVoucherProposal: async (proposalId) => {
      const db = read();
      db.voucher_proposals = (db.voucher_proposals || []).map((row) => Number(row.id) === Number(proposalId) ? { ...row, status: "Approved", approved_at: new Date().toISOString() } : row);
      db.voucher_proposal_audit = [{ id: Date.now(), proposal_id: proposalId, action: "Proposal Approved", created_at: new Date().toISOString(), status: "Approved" }, ...(db.voucher_proposal_audit || [])];
      write(db);
      return fallbackApi.getVoucherProposals({});
    },
    rejectVoucherProposal: async (proposalId, userId, reason) => {
      const db = read();
      db.voucher_proposals = (db.voucher_proposals || []).map((row) => Number(row.id) === Number(proposalId) ? { ...row, status: "Rejected", rejection_reason: reason, rejected_at: new Date().toISOString() } : row);
      db.voucher_proposal_audit = [{ id: Date.now(), proposal_id: proposalId, action: "Proposal Rejected", remarks: reason, created_at: new Date().toISOString(), status: "Rejected" }, ...(db.voucher_proposal_audit || [])];
      write(db);
      return fallbackApi.getVoucherProposals({});
    },
    createDraftVoucherFromProposal: async (proposalId) => {
      const db = read();
      const voucherId = Date.now();
      db.voucher_proposals = (db.voucher_proposals || []).map((row) => Number(row.id) === Number(proposalId) ? { ...row, status: "Draft Voucher Created", draft_voucher_id: voucherId, draft_voucher_number: `DRAFT-${voucherId}` } : row);
      db.voucher_proposal_audit = [{ id: Date.now() + 1, proposal_id: proposalId, action: "Draft Voucher Created", created_at: new Date().toISOString(), status: "Draft" }, ...(db.voucher_proposal_audit || [])];
      write(db);
      return fallbackApi.getVoucherProposals({});
    },
    postDraftVoucherFromProposal: async (proposalId) => {
      const db = read();
      db.voucher_proposals = (db.voucher_proposals || []).map((row) => Number(row.id) === Number(proposalId) ? { ...row, status: "Posted", posted_voucher_id: row.draft_voucher_id, posted_voucher_number: row.draft_voucher_number, updated_at: new Date().toISOString() } : row);
      db.voucher_proposal_audit = [{ id: Date.now(), proposal_id: proposalId, action: "Voucher Posted", created_at: new Date().toISOString(), status: "Posted" }, ...(db.voucher_proposal_audit || [])];
      write(db);
      return fallbackApi.getVoucherProposals({});
    },
    listRecords: async (table, filters = {}) => {
      const search = (filters.search || "").toLowerCase();
      const db = read();
      let changed = false;
      if (table === "suppliers") {
        db.suppliers = db.suppliers.map((row) => {
          const fixed = normalizeFallbackImportRow("suppliers", row);
          if (fixed.supplier_name !== row.supplier_name) changed = true;
          return fixed;
        });
        if (changed) write(db);
      }
      return db[table].filter((row) => {
        const status = filters.status === "all" || !filters.status || row.status === filters.status;
        const match = !search || Object.values(row).join(" ").toLowerCase().includes(search);
        return status && match;
      }).sort((a, b) => b.id - a.id);
    },
    createRecord: async (table, payload) => {
      const db = read();
      const record = { id: Date.now(), ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      db[table].push(record);
      write(db);
      return record;
    },
    createLedgerAccount: async (payload) => {
      const db = read();
      db.accounts = db.accounts || [];
      const record = {
        id: Date.now(),
        company_id: payload.company_id || 1,
        account_code: payload.account_code || `58${db.accounts.length + 1}0`,
        account_name: payload.account_name,
        account_type: payload.account_type || "Expense",
        normal_balance: payload.normal_balance || "Debit",
        opening_balance: Number(payload.opening_balance || 0),
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      db.accounts.push(record);
      write(db);
      return record;
    },
    updateRecord: async (table, id, payload) => {
      const db = read();
      db[table] = db[table].map((row) => row.id === id ? { ...row, ...payload, updated_at: new Date().toISOString() } : row);
      write(db);
      return db[table].find((row) => row.id === id);
    },
    deleteRecord: async (table, id) => {
      const db = read();
      db[table] = db[table].filter((row) => row.id !== id);
      write(db);
      return true;
    },
    parseImportFile: async () => {
      throw new Error("Use Browse Desktop File inside the Windows app, or choose the file directly in browser preview");
    },
    selectImportFile: async () => {
      throw new Error("Desktop file picker is available only inside the Windows app");
    },
    parseImportBuffer: async (fileName, bytes) => {
      const extension = fileName.split(".").pop()?.toLowerCase();
      const buffer = bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes || []).buffer;
      if (extension === "csv") return parseCsvText(new TextDecoder().decode(buffer));
      if (extension === "xlsx") return parseXlsxBufferBrowser(buffer);
      if (extension === "xls") return parseLegacyXlsText(new TextDecoder().decode(buffer));
      throw new Error("Only CSV, XLS and XLSX files are supported for import");
    },
    importRecords: async (table, rows, context = {}) => {
      const result = { totalRows: rows.length, successfulRows: 0, failedRows: 0, skippedDuplicates: 0, errors: [] };
      if (context.dry_run) {
        result.successfulRows = rows.length;
        return result;
      }
      const db = read();
      if (!db[table]) throw new Error("This module cannot be imported directly");
      rows.forEach((row) => db[table].push({ id: Date.now() + Math.random(), ...normalizeFallbackImportRow(table, row), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));
      write(db);
      result.successfulRows = rows.length;
      return result;
    },
    listItemImportBatches: async () => [],
    deleteItemImportBatch: async () => ({ deleted: 0 }),
    deleteUnusedImportedItems: async () => {
      const db = read();
      const before = db.items.length;
      const seedIndex = db.items.findIndex((item) => item.item_name === "Office Workstation");
      const keepIndex = seedIndex >= 0 ? seedIndex : 0;
      db.items = db.items.filter((_, index) => index === keepIndex);
      write(db);
      return { deleted: before - db.items.length, protected: db.items.length };
    },
    uploadDocument: async () => {
      throw new Error("Document upload is available in the desktop app");
    },
    listDocuments: async () => [],
    createVoucher: async (payload) => ({ id: Date.now(), voucher_number: payload.voucher_number || `${payload.voucher_type.toUpperCase().replaceAll(" ", "")}-PREVIEW`, ...payload }),
    createBusinessVoucher: async (payload) => {
      const db = read();
      const row = { id: Date.now(), company_id: Number(payload.company_id || 1), status: "Draft", voucher_kind: payload.voucher_kind, voucher_date: payload.voucher_date, narration: payload.narration || "", payload_json: JSON.stringify(payload), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      db.guided_vouchers = [row, ...(db.guided_vouchers || [])];
      write(db);
      return row;
    },
    updateGuidedVoucherStatus: async (id, action) => {
      const db = read();
      const status = action === "submit" ? "Pending Review" : action === "review" ? "Pending Approval" : "Approved";
      db.guided_vouchers = (db.guided_vouchers || []).map((row) => Number(row.id) === Number(id) ? { ...row, status, updated_at: new Date().toISOString() } : row);
      write(db);
      return db.guided_vouchers.find((row) => Number(row.id) === Number(id)) || { id, status };
    },
    postGuidedVoucher: async (id) => {
      const db = read();
      const voucher = postFallbackGuidedVoucher(db, id);
      write(db);
      return voucher;
    },
    reverseVoucher: async () => ({ id: Date.now(), voucher_number: "JOURNAL-PREVIEW", status: "Posted" }),
    postTransaction: async () => ({ id: Date.now(), voucher_number: "POST-PREVIEW" }),
    approveTransaction: async () => true,
    createFinancialYear: async (payload) => {
      const startMMDD = String(payload.start_date).slice(5);
      const endMMDD = String(payload.end_date).slice(5);
      if (startMMDD !== "04-01") throw new Error("Financial year must start on April 1");
      if (endMMDD !== "03-31") throw new Error("Financial year must end on March 31");
      const startYear = parseInt(String(payload.start_date).slice(0, 4), 10);
      const endYear = parseInt(String(payload.end_date).slice(0, 4), 10);
      if (endYear !== startYear + 1) throw new Error("Financial year must span exactly 12 months");
      return { id: Date.now(), ...payload };
    },
    updateFinancialYearStatus: async (id, status) => ({ id, status }),
    createOpeningBalance: async (payload) => ({ id: Date.now(), ...payload }),
    createReceiptAllocation: async (payload) => ({ id: Date.now(), ...payload, allocation_status: "Partially Allocated" }),
    unallocateReceiptAllocation: async (id, reason) => ({ id, reason, allocation_status: "Reallocated" }),
    reallocateReceiptAllocation: async (id, payload) => ({ id: Date.now(), ...payload, reallocated_from_id: id, allocation_status: "Partially Allocated" }),
    createSupplierPaymentAllocation: async (payload) => ({ id: Date.now(), ...payload, allocation_status: "Partially Allocated" }),
    unallocateSupplierPaymentAllocation: async (id, reason) => ({ id, reason, allocation_status: "Reallocated" }),
    reallocateSupplierPaymentAllocation: async (id, payload) => ({ id: Date.now(), ...payload, reallocated_from_id: id, allocation_status: "Partially Allocated" }),
    createAdvanceReceipt: async (payload) => ({ id: Date.now(), ...payload, status: "Open" }),
    createSupplierAdvance: async (payload) => ({ id: Date.now(), ...payload, status: "Open" }),
    adjustAdvanceReceipt: async (payload) => ({ id: Date.now(), ...payload, adjustment_type: "receipt", status: "Active" }),
    adjustSupplierAdvance: async (payload) => ({ id: Date.now(), ...payload, adjustment_type: "supplier", status: "Active" }),
    reverseAdvanceAdjustment: async (id, reason) => ({ id, reason, status: "Reversed" }),
    saveCreditTerm: async (payload) => ({ id: Date.now(), ...payload }),
    createPartyOpeningBalance: async (payload) => ({ id: Date.now(), ...payload, voucher_number: "OPEN-PREVIEW" }),
    getDrilldownData: async () => ({
      ledger: [],
      voucher: {
        header: { voucher_number: "SALES-00001", voucher_date: "2026-06-15", voucher_type: "Sales", status: "Posted", company_name: "Gesture India Infrastructure", financial_year_name: "FY 2026-27", narration: "Preview sales invoice" },
        lines: [
          { id: 1, account_code: "1100", account_name: "Trade Receivables", debit: 1180000, credit: 0, narration: "Preview sales invoice" },
          { id: 2, account_code: "4000", account_name: "Sales", debit: 0, credit: 1000000, narration: "Preview sales invoice" }
        ],
        audit: []
      },
      source: { source_module: "billing", record: { invoice_number: "GII-INV-001", posting_status: "Posted" }, order: { order_number: "GEM-2026-001" }, documents: [] }
    }),
    closeFinancialYear: async () => ({ id: Date.now(), status: "Approved" }),
    createBackup: async () => {
      const db = read();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const name = `gii_gem_erp_browser_preview_${stamp}.json`;
      const content = JSON.stringify({ created_at: new Date().toISOString(), database: db }, null, 2);
      const backups = JSON.parse(localStorage.getItem("gii-gem-erp-browser-backups") || "[]");
      const row = { name, size: content.length, createdAt: new Date().toISOString(), content };
      localStorage.setItem("gii-gem-erp-browser-backups", JSON.stringify([row, ...backups].slice(0, 20)));
      downloadText(name, content);
      return { fileName: name, size: content.length, createdAt: row.createdAt };
    },
    listBackups: async () => JSON.parse(localStorage.getItem("gii-gem-erp-browser-backups") || "[]").map(({ content, ...row }) => row),
    restoreBackup: async (fileName) => {
      const backups = JSON.parse(localStorage.getItem("gii-gem-erp-browser-backups") || "[]");
      const backup = backups.find((row) => row.name === fileName || row.fileName === fileName);
      if (!backup?.content) throw new Error("Preview backup not found in this browser session");
      const parsed = JSON.parse(backup.content);
      write(parsed.database || {});
      return true;
    },
    getHealthDiagnostics: async (context = {}) => ({
      generatedAt: new Date().toISOString(),
      app: { name: "GII GeM ERP", version: "browser-preview", packaged: false, userData: "Browser preview only" },
      runtime: { platform: "browser", arch: "n/a", node: "n/a", electron: "n/a", chrome: navigator.userAgent },
      context,
      paths: {
        runtimeRoot: "Browser preview only",
        database: { path: "Browser localStorage preview", exists: true },
        folders: ["database", "backups", "documents", "exports", "logs"].map((key) => ({
          key,
          label: key,
          path: "Available in Windows desktop app only",
          exists: false,
          writable: false
        }))
      },
      logs: { rendererTail: "", bootErrorTail: "", mainTail: "" },
      database: { connected: true, tables: Object.keys(read()) }
    }),
    runHealthChecks: async (context = {}) => ({
      generatedAt: new Date().toISOString(),
      summary: { pass: 2, warn: 2, fail: 0 },
      checks: [
        { id: "browser_preview", label: "Browser Preview", status: "warn", severity: "warning", details: "This is the browser fallback runtime, not the SQLite desktop runtime.", recommendation: "Open the Windows Electron app for final diagnostics.", meta: context },
        { id: "database_preview", label: "Preview Store", status: "pass", severity: "normal", details: "Browser preview localStorage responded.", recommendation: "No action for preview mode." },
        { id: "accounting_preview", label: "Accounting Verification", status: "warn", severity: "warning", details: "Accounting verification is terminal-controlled and desktop-backed.", recommendation: "Run npm.cmd run verify:accounting in the project folder." },
        { id: "preload_contract_preview", label: "Health API Contract", status: "pass", severity: "normal", details: "Health fallback API methods are available.", recommendation: "No action required." }
      ]
    }),
    exportSupportBundle: async (context = {}) => {
      const payload = { createdAt: new Date().toISOString(), context, mode: "browser-preview" };
      const content = JSON.stringify(payload, null, 2);
      const fileName = `gii-gem-erp-browser-support-bundle-${Date.now()}.json`;
      downloadText(fileName, content);
      return { success: true, fileName, filePath: "Downloaded from browser preview", createdAt: payload.createdAt, size: content.length };
    },
    openHealthFolder: async () => ({ success: false, message: "Runtime folders are available in the Windows desktop app only." }),
    printHtml: async () => ({ success: false, failureReason: "Open the Windows desktop app for controlled ERP printing." }),
    savePrintPdf: async () => ({ success: false, failureReason: "Open the Windows desktop app for PDF export." }),
    submitFeedback: async (payload) => {
      const key = "gii_gem_browser_feedback";
      const entries = JSON.parse(localStorage.getItem(key) || "[]");
      entries.push({ id: Date.now(), ...payload, status: "open", created_at: new Date().toISOString(), resolution_notes: null });
      localStorage.setItem(key, JSON.stringify(entries));
      return { id: Date.now(), success: true };
    },
    listFeedback: async () => {
      const key = "gii_gem_browser_feedback";
      return JSON.parse(localStorage.getItem(key) || "[]");
    },
    exportFeedback: async (format) => {
      const key = "gii_gem_browser_feedback";
      const entries = JSON.parse(localStorage.getItem(key) || "[]");
      const fileName = `gii-gem-feedback-${Date.now()}.${format}`;
      const content = format === "json" ? JSON.stringify(entries, null, 2) : entries.map((e) => `${e.id},${e.category},${e.status},${e.message}`).join("\n");
      downloadText(fileName, content);
      return { success: true, filePath: fileName, fileName };
    }
  };
}
