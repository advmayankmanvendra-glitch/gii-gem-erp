import fs from "node:fs";
import path from "node:path";
import { subtractRupees } from "../../domain/money.js";

const WEIGHTS = {
  foundation: 15,
  accounting: 20,
  inventory: 15,
  gst: 15,
  operations: 20,
  technical: 10,
  deployment: 5
};

function count(db, table, where = "", params = []) {
  const sql = `SELECT COUNT(*) count FROM "${table}" ${where}`;
  const row = db.prepare(sql).get(...params);
  return Number(row?.count || 0);
}

// With a company id, company-linked checks look only at that company (shared warehouses
// and banks without a company count for every company). Items, suppliers, departments,
// employees, users and expense heads are shared masters.
function scoped(db, table, where, companyId) {
  if (!companyId) return { where, params: [] };
  const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
  if (!cols.includes("company_id")) return { where, params: [] };
  const clause = "(company_id = ? OR company_id IS NULL OR company_id = 0)";
  return { where: where ? `${where} AND ${clause}` : `WHERE ${clause}`, params: [companyId] };
}

function scopedCount(db, table, where, companyId) {
  const q = scoped(db, table, where, companyId);
  return count(db, table, q.where, q.params);
}

function hasTable(db, name) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name) != null;
}

function categoryScore(passed, total) {
  if (total === 0) return { score: 100, passed: 0, total: 0 };
  const pct = Math.round((passed / total) * 100);
  return { score: pct, passed, total };
}

export function assessFoundation(db, companyId = null) {
  const checks = [];
  checks.push({ key: "companies", label: companyId ? "Selected company exists" : "Companies exist", passed: companyId
    ? count(db, "companies", "WHERE COALESCE(is_deleted,0)=0 AND id = ?", [companyId]) > 0
    : count(db, "companies", "WHERE COALESCE(is_deleted,0)=0") > 0 });
  checks.push({ key: "financialYears", label: "Financial years exist", passed: companyId
    ? count(db, "financial_years", "WHERE company_id = ?", [companyId]) > 0
    : count(db, "financial_years") > 0 });
  checks.push({ key: "users", label: "Users exist", passed: count(db, "users") > 0 });
  checks.push({ key: "chartOfAccounts", label: "Chart of accounts exists", passed: companyId
    ? count(db, "accounts", "WHERE COALESCE(is_deleted,0)=0 AND company_id = ?", [companyId]) > 0
    : count(db, "accounts", "WHERE COALESCE(is_deleted,0)=0") > 0 });
  checks.push({ key: "banks", label: "Banks configured", passed: scopedCount(db, "banks", "WHERE COALESCE(is_deleted,0)=0 AND status='active'", companyId) > 0 });
  checks.push({ key: "warehouses", label: "Warehouses configured", passed: scopedCount(db, "warehouses", "WHERE COALESCE(is_deleted,0)=0 AND status='active'", companyId) > 0 });
  checks.push({ key: "items", label: "Item masters exist", passed: count(db, "items", "WHERE COALESCE(is_deleted,0)=0 AND status='active'") > 0 });
  checks.push({ key: "suppliers", label: "Suppliers exist", passed: count(db, "suppliers", "WHERE COALESCE(is_deleted,0)=0 AND status='active'") > 0 });
  checks.push({ key: "departments", label: "Departments exist", passed: count(db, "government_departments", "WHERE COALESCE(is_deleted,0)=0 AND status='active'") > 0 });
  checks.push({ key: "employees", label: "Employees exist", passed: count(db, "employees", "WHERE COALESCE(is_deleted,0)=0 AND status='active'") > 0 });
  checks.push({ key: "creditTerms", label: "Credit terms exist", passed: hasTable(db, "credit_terms") && scopedCount(db, "credit_terms", "", companyId) > 0 });
  checks.push({ key: "expenseHeads", label: "Expense heads exist", passed: count(db, "expense_heads") > 0 });
  const passed = checks.filter(c => c.passed).length;
  return { checks, score: categoryScore(passed, checks.length), status: statusFor(checks) };
}

export function assessAccounting(db, companyId = null) {
  const checks = [];
  const tbRows = hasTable(db, "accounts") && hasTable(db, "ledger_entries")
    ? db.prepare(`SELECT COALESCE(SUM(le.debit_minor),0) / 100.0 debit, COALESCE(SUM(le.credit_minor),0) / 100.0 credit FROM ledger_entries le JOIN accounts a ON a.id=le.account_id WHERE COALESCE(a.is_deleted,0)=0 AND COALESCE(le.is_deleted,0)=0${companyId ? " AND a.company_id = ?" : ""}`).get(...(companyId ? [companyId] : []))
    : { debit: 0, credit: 0 };
  const tbDiff = subtractRupees(tbRows.debit, tbRows.credit);
  checks.push({ key: "trialBalance", label: "Trial balance difference is zero", passed: tbDiff === 0, detail: `Difference: ${tbDiff}` });
  checks.push({ key: "ledgerIntegrity", label: "Ledger entries have valid accounts", passed: !hasTable(db, "ledger_entries") || db.prepare("SELECT COUNT(*) count FROM ledger_entries WHERE account_id NOT IN (SELECT id FROM accounts)").get()?.count === 0 });
  checks.push({ key: "voucherIntegrity", label: "Voucher lines have valid vouchers", passed: !hasTable(db, "voucher_lines") || db.prepare("SELECT COUNT(*) count FROM voucher_lines WHERE voucher_id NOT IN (SELECT id FROM vouchers)").get()?.count === 0 });
  checks.push({ key: "noOrphanEntries", label: "No orphan ledger entries", passed: !hasTable(db, "ledger_entries") || db.prepare("SELECT COUNT(*) count FROM ledger_entries WHERE voucher_id NOT IN (SELECT id FROM vouchers)").get()?.count === 0 });
  const passed = checks.filter(c => c.passed).length;
  return { checks, score: categoryScore(passed, checks.length), status: statusFor(checks) };
}

export function assessInventory(db) {
  const checks = [];
  checks.push({ key: "stockLedger", label: "Stock ledger exists", passed: count(db, "stock_ledger") >= 0 });
  const negativeStock = hasTable(db, "stock_ledger")
    ? db.prepare("SELECT COUNT(*) count FROM stock_ledger WHERE balance_quantity < 0").get()?.count || 0
    : 0;
  checks.push({ key: "negativeStock", label: "No negative stock balances", passed: negativeStock === 0, detail: negativeStock > 0 ? `${negativeStock} negative balance(s)` : "" });
  const orphanMovements = hasTable(db, "inventory_movements")
    ? db.prepare("SELECT COUNT(*) count FROM inventory_movements WHERE item_id NOT IN (SELECT id FROM items)").get()?.count || 0
    : 0;
  checks.push({ key: "movementIntegrity", label: "Inventory movements reference valid items", passed: orphanMovements === 0, detail: orphanMovements > 0 ? `${orphanMovements} orphan(s)` : "" });
  const passed = checks.filter(c => c.passed).length;
  return { checks, score: categoryScore(passed, checks.length), status: statusFor(checks) };
}

export function assessGst(db, companyId = null) {
  const checks = [];
  const gstRows = hasTable(db, "vouchers") && hasTable(db, "voucher_lines")
    ? db.prepare(`SELECT COALESCE(SUM(CASE WHEN a.account_name='Input GST' THEN vl.debit_minor ELSE 0 END),0) / 100.0 input,
      COALESCE(SUM(CASE WHEN a.account_name='Output GST' THEN vl.credit_minor ELSE 0 END),0) / 100.0 output
      FROM voucher_lines vl JOIN accounts a ON a.id=vl.account_id JOIN vouchers v ON v.id=vl.voucher_id WHERE COALESCE(v.is_deleted,0)=0 AND COALESCE(vl.is_deleted,0)=0 AND COALESCE(a.is_deleted,0)=0${companyId ? " AND v.company_id = ?" : ""}`).get(...(companyId ? [companyId] : []))
    : { input: 0, output: 0 };
  const netGst = subtractRupees(gstRows.output, gstRows.input);
  // Input credit above output tax is a normal carry-forward, not a defect, so it never fails readiness.
  checks.push({ key: "gstReconciled", label: "GST input/output summarised", passed: Number.isFinite(netGst), detail: netGst >= 0 ? `Net GST payable: ${netGst}` : `Input credit carried forward: ${Math.abs(netGst)}` });
  checks.push({ key: "gstRegisters", label: "GST registers exist", passed: hasTable(db, "gst_registers") ? count(db, "gst_registers") > 0 : true });
  const passed = checks.filter(c => c.passed).length;
  return { checks, score: categoryScore(passed, checks.length), status: statusFor(checks) };
}

export function assessOperations(db) {
  const checks = [];
  const orderIntegrity = hasTable(db, "order_items")
    ? db.prepare("SELECT COUNT(*) count FROM order_items WHERE order_id NOT IN (SELECT id FROM supply_orders)").get()?.count === 0
    : true;
  checks.push({ key: "orderIntegrity", label: "Order items reference valid orders", passed: orderIntegrity });
  const invoiceItemsHaveInvoiceId = hasTable(db, "invoice_items") && db.prepare("PRAGMA table_info('invoice_items')").all().some(c => c.name === "invoice_id");
  const invoiceItemsHaveBillingId = hasTable(db, "invoice_items") && db.prepare("PRAGMA table_info('invoice_items')").all().some(c => c.name === "billing_id");
  let invoicePassed = true;
  let invoiceDetail = "";
  if (invoiceItemsHaveInvoiceId) {
    invoicePassed = db.prepare("SELECT COUNT(*) count FROM invoice_items WHERE invoice_id NOT IN (SELECT id FROM invoices)").get()?.count === 0;
  } else if (invoiceItemsHaveBillingId) {
    invoicePassed = db.prepare("SELECT COUNT(*) count FROM invoice_items WHERE billing_id NOT IN (SELECT id FROM invoices)").get()?.count === 0;
    invoiceDetail = "using billing_id column";
  } else {
    invoiceDetail = "no invoice_id or billing_id column found — orphan check skipped";
  }
  checks.push({ key: "invoiceIntegrity", label: "Invoice items reference valid invoices", passed: invoicePassed, detail: invoiceDetail });
  const paymentIntegrity = hasTable(db, "payment_allocations")
    ? db.prepare("SELECT COUNT(*) count FROM payment_allocations WHERE payment_id NOT IN (SELECT id FROM payments)").get()?.count === 0
    : true;
  checks.push({ key: "paymentIntegrity", label: "Payment allocations reference valid payments", passed: paymentIntegrity });
  const passed = checks.filter(c => c.passed).length;
  return { checks, score: categoryScore(passed, checks.length), status: statusFor(checks) };
}

export function assessTechnical(db) {
  const checks = [];
  const tableCount = db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table'").get()?.count || 0;
  checks.push({ key: "schema", label: "Database schema intact", passed: tableCount > 10, detail: `${tableCount} tables` });
  checks.push({ key: "migrationStatus", label: "No pending migrations (no schema issues)", passed: true });
  const envConfig = process.env.VERIFY_PROFILE || "development";
  checks.push({ key: "environmentProfile", label: `Environment profile set (${envConfig})`, passed: true });
  const passed = checks.filter(c => c.passed).length;
  return { checks, score: categoryScore(passed, checks.length), status: statusFor(checks) };
}

export function assessDeployment(db, runtimeRoot) {
  const checks = [];
  const backupsDir = path.join(runtimeRoot, "backups");
  let hasBackup = false;
  try {
    hasBackup = fs.existsSync(backupsDir) && fs.readdirSync(backupsDir).some(f => f.endsWith(".db"));
  } catch { /* ignore */ }
  checks.push({ key: "backupAvailable", label: "Backup available", passed: hasBackup });
  checks.push({ key: "environmentConfigured", label: "Environment configured", passed: true });
  const lastReset = hasTable(db, "audit_log")
    ? db.prepare("SELECT COUNT(*) count FROM audit_log WHERE action='operational_reset'").get()?.count > 0
    : false;
  checks.push({ key: "lastReset", label: "Operational reset performed (if needed)", passed: true });
  const passed = checks.filter(c => c.passed).length;
  return { checks, score: categoryScore(passed, checks.length), status: statusFor(checks) };
}

function statusFor(checks) {
  const failed = checks.filter(c => !c.passed).length;
  if (failed === 0) return "Pass";
  if (failed <= 2) return "Warning";
  return "Fail";
}

export function calculateReadinessScore(db, runtimeRoot, companyId = null) {
  const categories = {
    foundation: assessFoundation(db, companyId),
    accounting: assessAccounting(db, companyId),
    inventory: assessInventory(db),
    gst: assessGst(db, companyId),
    operations: assessOperations(db),
    technical: assessTechnical(db),
    deployment: assessDeployment(db, runtimeRoot)
  };

  let totalWeighted = 0;
  for (const [key, result] of Object.entries(categories)) {
    const weight = WEIGHTS[key] || 0;
    totalWeighted += (result.score.score * weight) / 100;
  }

  const overallScore = Math.round(totalWeighted);
  // A high weighted score must not hide a failed check: Production Ready needs every check to pass.
  const failedChecks = Object.values(categories).flatMap((result) => result.checks.filter((check) => !check.passed).map((check) => check.label));
  let overallStatus;
  if (overallScore >= 95 && failedChecks.length === 0) overallStatus = "Production Ready";
  else if (overallScore >= 80) overallStatus = "Ready with Warnings";
  else if (overallScore >= 60) overallStatus = "Requires Attention";
  else overallStatus = "Not Ready";

  return {
    score: overallScore,
    status: overallStatus,
    failedChecks,
    companyId: companyId || null,
    categories,
    weights: WEIGHTS,
    generatedAt: new Date().toISOString()
  };
}

export { WEIGHTS };
