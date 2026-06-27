import fs from "node:fs";
import path from "node:path";

function count(db, table, where = "") {
  const sql = `SELECT COUNT(*) count FROM "${table}" ${where}`;
  const row = db.prepare(sql).get();
  return Number(row?.count || 0);
}

function hasTable(db, name) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name) != null;
}

export function generateCertificate(db, runtimeRoot) {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));

  const companyCount = count(db, "companies", "WHERE COALESCE(is_deleted,0)=0");
  const userCount = count(db, "users");
  const ledgerCount = count(db, "accounts", "WHERE COALESCE(is_deleted,0)=0");
  const fyCount = count(db, "financial_years");
  const departmentCount = count(db, "government_departments", "WHERE COALESCE(is_deleted,0)=0 AND status='active'");
  const supplierCount = count(db, "suppliers", "WHERE COALESCE(is_deleted,0)=0 AND status='active'");
  const itemCount = count(db, "items", "WHERE COALESCE(is_deleted,0)=0 AND status='active'");
  const bankCount = count(db, "banks", "WHERE COALESCE(is_deleted,0)=0 AND status='active'");
  const employeeCount = count(db, "employees", "WHERE COALESCE(is_deleted,0)=0 AND status='active'");
  const warehouseCount = count(db, "warehouses", "WHERE COALESCE(is_deleted,0)=0 AND status='active'");

  const orderCount = hasTable(db, "supply_orders") ? count(db, "supply_orders", "WHERE COALESCE(is_deleted,0)=0") : 0;
  const invoiceCount = hasTable(db, "invoices") ? count(db, "invoices", "WHERE COALESCE(is_deleted,0)=0") : 0;
  const procurementCount = hasTable(db, "procurements") ? count(db, "procurements", "WHERE COALESCE(is_deleted,0)=0") : 0;
  const paymentCount = hasTable(db, "payments") ? count(db, "payments", "WHERE COALESCE(is_deleted,0)=0") : 0;
  const voucherCount = hasTable(db, "vouchers") ? count(db, "vouchers", "WHERE is_deleted=0") : 0;
  const receivableCount = hasTable(db, "receivables") ? count(db, "receivables", "WHERE is_deleted=0") : 0;
  const payableCount = hasTable(db, "procurements") ? count(db, "procurements", "WHERE is_deleted=0 AND posting_status='Posted'") : 0;

  const trialBalanceRows = hasTable(db, "accounts") && hasTable(db, "ledger_entries")
    ? db.prepare(`
      SELECT COALESCE(SUM(le.debit),0) debit, COALESCE(SUM(le.credit),0) credit
      FROM ledger_entries le
      JOIN accounts a ON a.id=le.account_id
      WHERE a.is_deleted=0
    `).get()
    : { debit: 0, credit: 0 };

  const tbDebit = Number(trialBalanceRows?.debit || 0);
  const tbCredit = Number(trialBalanceRows?.credit || 0);
  const tbDifference = Math.round((tbDebit - tbCredit) * 100) / 100;

  const gstInput = hasTable(db, "vouchers") && hasTable(db, "voucher_lines")
    ? db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN a.account_category='input_gst' THEN vl.debit ELSE 0 END),0) input,
        COALESCE(SUM(CASE WHEN a.account_category='output_gst' THEN vl.credit ELSE 0 END),0) output
      FROM voucher_lines vl
      JOIN accounts a ON a.id=vl.account_id
      JOIN vouchers v ON v.id=vl.voucher_id
      WHERE v.is_deleted=0
    `).get()
    : { input: 0, output: 0 };

  const netGst = Math.round((Number(gstInput.output || 0) - Number(gstInput.input || 0)) * 100) / 100;
  const gstOk = netGst === 0;

  const backupsDir = path.join(runtimeRoot, "backups");
  let lastBackup = null;
  if (fs.existsSync(backupsDir)) {
    const files = fs.readdirSync(backupsDir).filter(f => f.endsWith(".db")).sort().reverse();
    lastBackup = files.length > 0 ? files[0] : null;
  }

  const totalOperational = orderCount + invoiceCount + procurementCount + paymentCount + voucherCount;

  let status = "Production Ready";
  const warnings = [];
  if (totalOperational > 0) {
    status = "Not Ready";
    warnings.push(`${totalOperational} operational transaction(s) exist`);
  }
  if (tbDifference !== 0) {
    status = status === "Not Ready" ? "Not Ready" : "Ready With Warnings";
    warnings.push("Trial balance difference is not zero");
  }
  if (!gstOk) {
    status = status === "Not Ready" ? "Not Ready" : "Ready With Warnings";
    warnings.push("GST register and summary do not reconcile");
  }

  const certificate = {
    generatedAt: new Date().toISOString(),
    status,
    warnings,
    companies: companyCount,
    users: userCount,
    ledgers: ledgerCount,
    masters: {
      departments: departmentCount,
      suppliers: supplierCount,
      items: itemCount,
      banks: bankCount,
      employees: employeeCount,
      warehouses: warehouseCount,
      financialYears: fyCount
    },
    operational: {
      supplyOrders: orderCount,
      invoices: invoiceCount,
      procurements: procurementCount,
      payments: paymentCount,
      vouchers: voucherCount,
      receivables: receivableCount,
      payables: payableCount,
      total: totalOperational
    },
    accounting: {
      trialBalance: { debit: tbDebit, credit: tbCredit, difference: tbDifference },
      gst: { input: gstInput.input, output: gstInput.output, netGstPayable: netGst, reconciled: gstOk }
    },
    lastBackup,
    orphanStatus: "Not checked"
  };

  const reportsDir = path.join(runtimeRoot, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, "production-readiness-certificate.md");

  const reportContent = `# GII GeM ERP — Production Readiness Certificate

Generated: ${certificate.generatedAt}

## Readiness Status

**${certificate.status}**

${warnings.length > 0 ? warnings.map(w => `- ⚠ ${w}`).join("\n") : "- All checks passed"}

## Company & Users

- Companies: ${certificate.companies}
- Users: ${certificate.users}

## Masters

- Ledgers / Chart of Accounts: ${certificate.masters.financialYears}
- Financial Years: ${certificate.masters.financialYears}
- Departments: ${certificate.masters.departments}
- Suppliers: ${certificate.masters.suppliers}
- Items: ${certificate.masters.items}
- Banks: ${certificate.masters.banks}
- Employees: ${certificate.masters.employees}
- Warehouses: ${certificate.masters.warehouses}

## Operational Transactions

- Supply Orders: ${certificate.operational.supplyOrders}
- Invoices: ${certificate.operational.invoices}
- Procurements: ${certificate.operational.procurements}
- Payments: ${certificate.operational.payments}
- Vouchers: ${certificate.operational.vouchers}
- Receivables: ${certificate.operational.receivables}
- Payables: ${certificate.operational.payables}
- **Total Operational: ${certificate.operational.total}**

## Accounting

- Trial Balance Debit: ${certificate.accounting.trialBalance.debit}
- Trial Balance Credit: ${certificate.accounting.trialBalance.credit}
- Trial Balance Difference: ${certificate.accounting.trialBalance.difference}
- GST Input: ${certificate.accounting.gst.input}
- GST Output: ${certificate.accounting.gst.output}
- Net GST Payable: ${certificate.accounting.gst.netGstPayable}
- GST Reconciled: ${certificate.accounting.gst.reconciled ? "Yes" : "No"}

## Backup

- Last Backup: ${certificate.lastBackup || "None"}

## Certificate

This certificate was generated automatically by the GII GeM ERP Production Readiness service.
`;

  fs.writeFileSync(reportPath, reportContent);

  return { certificate, reportPath };
}
