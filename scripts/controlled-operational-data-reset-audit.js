import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const projectRoot = process.cwd();
const databasePath = path.join(projectRoot, "database", "gii_gem_erp.db");
const reportsDir = path.join(projectRoot, "reports");
const reportPath = path.join(reportsDir, "controlled-operational-data-reset-report.md");

const preservedTables = [
  "companies",
  "users",
  "accounts",
  "financial_years",
  "government_departments",
  "suppliers",
  "items",
  "banks",
  "employees",
  "expense_heads",
  "warehouses",
  "credit_terms",
  "documents",
  "audit_log"
];

const operationalTables = [
  ["Orders", "supply_orders"],
  ["Orders", "order_items"],
  ["Procurement", "procurements"],
  ["Procurement", "procurement_items"],
  ["Expenses", "expense_entries"],
  ["Billing", "invoices"],
  ["Billing", "invoice_items"],
  ["Payments", "payments"],
  ["Payments", "payment_allocations"],
  ["Payments", "supplier_payments"],
  ["Payments", "supplier_payment_allocations"],
  ["Accounting", "guided_vouchers"],
  ["Accounting", "vouchers"],
  ["Accounting", "voucher_lines"],
  ["Accounting", "ledger_entries"],
  ["Accounting", "cash_bank_ledger"],
  ["Receivables", "receivables"],
  ["Inventory", "goods_receipts"],
  ["Inventory", "delivery_challans"],
  ["Inventory", "delivery_challan_lines"],
  ["Inventory", "stock_inwards"],
  ["Inventory", "stock_outwards"],
  ["Inventory", "stock_adjustments"],
  ["Inventory", "stock_returns"],
  ["Inventory", "stock_ledger"],
  ["Inventory", "inventory_movements"],
  ["Inventory", "stock_reservations"],
  ["Inventory", "warehouse_transfers"],
  ["Inventory", "warehouse_transfer_lines"],
  ["Bank Reconciliation", "bank_statement_imports"],
  ["Bank Reconciliation", "bank_statement_entries"],
  ["Bank Reconciliation", "bank_statement_matches"],
  ["Bank Reconciliation", "voucher_proposals"],
  ["Bank Reconciliation", "voucher_proposal_audit"]
];

const sensitiveTables = new Set([
  "vouchers",
  "voucher_lines",
  "ledger_entries",
  "cash_bank_ledger",
  "receivables",
  "payment_allocations",
  "supplier_payment_allocations",
  "stock_ledger",
  "inventory_movements"
]);

/** Quote a SQLite identifier for safe read-only inspection. */
function q(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

/** Return all user-created tables from the database. */
function getTables(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);
}

/** Return true when the table exists in the database. */
function hasTable(tableSet, tableName) {
  return tableSet.has(tableName);
}

/** Return table column names, or an empty array if the table does not exist. */
function getColumns(db, tableSet, tableName) {
  if (!hasTable(tableSet, tableName)) return [];
  return db.prepare(`PRAGMA table_info(${q(tableName)})`).all().map((row) => row.name);
}

/** Return true when a table has a specific column. */
function hasColumn(db, tableSet, tableName, columnName) {
  return getColumns(db, tableSet, tableName).includes(columnName);
}

/** Count rows in a table without mutating database state. */
function countRows(db, tableSet, tableName) {
  if (!hasTable(tableSet, tableName)) return null;
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${q(tableName)}`).get().count || 0);
}

/** Count rows with active soft-delete semantics where the column exists. */
function countActiveRows(db, tableSet, tableName) {
  if (!hasTable(tableSet, tableName)) return null;
  if (hasColumn(db, tableSet, tableName, "is_deleted")) {
    return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${q(tableName)} WHERE COALESCE(is_deleted, 0) = 0`).get().count || 0);
  }
  if (hasColumn(db, tableSet, tableName, "deleted_at")) {
    return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${q(tableName)} WHERE deleted_at IS NULL`).get().count || 0);
  }
  return countRows(db, tableSet, tableName);
}

/** Run an orphan check only if all required tables and columns exist. */
function orphanCheck(db, tableSet, check) {
  const requiredTables = new Set([check.child.table, check.parent.table]);
  const tablesExist = [...requiredTables].every((table) => hasTable(tableSet, table));
  if (!tablesExist) return { ...check, status: "Skipped", count: null, reason: "Required table missing" };
  const childColumns = getColumns(db, tableSet, check.child.table);
  const parentColumns = getColumns(db, tableSet, check.parent.table);
  if (!childColumns.includes(check.child.column) || !parentColumns.includes(check.parent.column)) {
    return { ...check, status: "Skipped", count: null, reason: "Required column missing" };
  }
  const softDeleteClause = childColumns.includes("is_deleted") ? `AND COALESCE(c.is_deleted, 0) = 0` : "";
  const sql = `
    SELECT COUNT(*) AS count
    FROM ${q(check.child.table)} c
    LEFT JOIN ${q(check.parent.table)} p ON p.${q(check.parent.column)} = c.${q(check.child.column)}
    WHERE c.${q(check.child.column)} IS NOT NULL
      AND p.${q(check.parent.column)} IS NULL
      ${softDeleteClause}
  `;
  const count = Number(db.prepare(sql).get().count || 0);
  return { ...check, status: count === 0 ? "Pass" : "Review", count, reason: count === 0 ? "No orphan rows found" : "Orphan rows found" };
}

/** Render a markdown table from rows. */
function renderTable(headers, rows) {
  const header = `| ${headers.join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map((cell) => String(cell ?? "-").replace(/\n/g, " ")).join(" | ")} |`);
  return [header, divider, ...body].join("\n");
}

/** Build the full read-only reset audit report. */
function buildReport({ tableCounts, preservedCounts, orphanChecks, resetCandidates, missingOperationalTables }) {
  const generatedAt = new Date().toISOString();
  const operationalTotal = resetCandidates.reduce((sum, row) => sum + Number(row.activeRows || 0), 0);
  const sensitiveWithRows = resetCandidates.filter((row) => row.sensitive === "Yes" && Number(row.activeRows || 0) > 0);
  const orphanReviewCount = orphanChecks.filter((row) => row.status === "Review").length;

  return `# Controlled Operational Data Reset Report

Generated: ${generatedAt}

## Executive Summary

This phase performed a **read-only controlled operational reset audit**. No SQLite rows were deleted, updated, archived or purged.

The requested production target is valid: preserve foundation data and remove demo/smoke/dummy operational data. However, the current live accounting verifier still expects operational records to exist. A direct purge would therefore conflict with the present verification gate.

**Reset executed:** No  
**Database modified:** No  
**Operational active row candidates found:** ${operationalTotal}  
**Sensitive accounting/inventory tables with rows:** ${sensitiveWithRows.length}  
**Relationship checks needing review:** ${orphanReviewCount}

## Safety Decision

The reset should remain locked until one of these safe paths is approved:

1. Create or preserve a separate Verification Company dataset hidden from production screens, then reset production-company operational data.
2. Update verification scripts so a clean production database with zero operational transactions is accepted as valid.
3. Implement an explicit execute reset service that creates a backup, archives audit logs if required, clears operational records in dependency order, then runs the full verification suite.

## Preserved Foundation Tables

These tables are intended to remain intact during a controlled reset.

${renderTable(["Table", "Rows", "Reset Treatment"], preservedCounts.map((row) => [row.table, row.rows, row.treatment]))}

## Operational Reset Candidate Tables

These tables contain transactional, queue, allocation, reconciliation or movement data. Sensitive tables must not be cleared through ad hoc direct deletes in the application UI. A controlled reset service must handle dependency order, backup, audit, and verification.

${renderTable(["Area", "Table", "Rows", "Active Rows", "Sensitive", "Reset Treatment"], resetCandidates.map((row) => [row.area, row.table, row.rows, row.activeRows, row.sensitive, row.treatment]))}

## Missing Optional Operational Tables

The following reset-candidate tables are not present in the current database. This is acceptable when the feature has not created that table in this build.

${missingOperationalTables.length ? missingOperationalTables.map((table) => `- ${table}`).join("\n") : "- None"}

## Relationship And Orphan Checks

${renderTable(["Check", "Status", "Count", "Reason"], orphanChecks.map((row) => [row.name, row.status, row.count, row.reason]))}

## Verification Compatibility Blocker

The current 'scripts/verify-accounting.js' asserts that the live database has:

- vouchers
- ledger entries
- cash/bank ledger rows
- receivables
- payables
- input GST
- output GST

That is correct for a seeded development/test database, but not correct for a production-ready clean database with preserved masters and zero operational transactions. Therefore, executing the requested reset before resolving this verifier rule would make the reset appear failed even if the accounting state is clean and balanced.

## Controlled Reset Execution Design

Recommended future execute flow:

1. Require explicit user confirmation: **Create backup and reset operational data**.
2. Create backup and record the backup file path.
3. Record pre-reset counts for every operational table.
4. Archive or preserve audit log according to the selected policy.
5. Use a controlled backend service, not generic UI deletes.
6. Clear operational child tables before parent tables.
7. Reset queues, imports and staged operational data.
8. Preserve companies, masters, accounts, financial years, users, settings, help and templates.
9. Recalculate zero-state accounting, inventory, receivable and payable positions.
10. Run the full verification suite.
11. Generate a post-reset certificate.

## Zero-State Acceptance Target

After a future approved reset:

- Supply orders: 0
- Procurement entries: 0
- Billing/invoices: 0
- Payments/receipts: 0
- Business/manual vouchers: 0, except preserved verification company if approved
- Ledger entries: 0, except opening balances or preserved verification company if approved
- Receivables/payables: 0 outstanding rows
- Stock ledger and inventory movements: 0 live movement rows
- Low stock should not show never-stocked imported items unless the report filter allows it
- Trial balance difference: 0
- GST register and summary: 0 or reconciled
- Health Center: no dummy operational transactions

## Generated Table Count Snapshot

${renderTable(["Table", "Rows"], tableCounts.map((row) => [row.table, row.rows]))}

## Recommendation

Do not execute operational deletion in this phase. First approve a **Controlled Operational Reset Execution Phase** that includes either a verification-company strategy or verifier zero-state compatibility update.
`;
}

fs.mkdirSync(reportsDir, { recursive: true });

const db = new Database(databasePath, { readonly: true, fileMustExist: true });
try {
  const tables = getTables(db);
  const tableSet = new Set(tables);
  const tableCounts = tables.map((table) => ({ table, rows: countRows(db, tableSet, table) }));
  const preservedCounts = preservedTables.map((table) => ({
    table,
    rows: countRows(db, tableSet, table),
    treatment: hasTable(tableSet, table) ? "Preserve" : "Table not present"
  }));
  const resetCandidates = operationalTables
    .filter(([, table]) => hasTable(tableSet, table))
    .map(([area, table]) => ({
      area,
      table,
      rows: countRows(db, tableSet, table),
      activeRows: countActiveRows(db, tableSet, table),
      sensitive: sensitiveTables.has(table) ? "Yes" : "No",
      treatment: sensitiveTables.has(table) ? "Controlled service only" : "Reset candidate"
    }));
  const missingOperationalTables = operationalTables.filter(([, table]) => !hasTable(tableSet, table)).map(([, table]) => table);
  const orphanChecks = [
    { name: "Order items linked to supply orders", child: { table: "order_items", column: "order_id" }, parent: { table: "supply_orders", column: "id" } },
    { name: "Procurement items linked to procurements", child: { table: "procurement_items", column: "procurement_id" }, parent: { table: "procurements", column: "id" } },
    { name: "Invoice items linked to invoices", child: { table: "invoice_items", column: "billing_id" }, parent: { table: "invoices", column: "id" } },
    { name: "Voucher lines linked to vouchers", child: { table: "voucher_lines", column: "voucher_id" }, parent: { table: "vouchers", column: "id" } },
    { name: "Ledger entries linked to vouchers", child: { table: "ledger_entries", column: "voucher_id" }, parent: { table: "vouchers", column: "id" } },
    { name: "Receivables linked to invoices", child: { table: "receivables", column: "billing_id" }, parent: { table: "invoices", column: "id" } },
    { name: "Receipt allocations linked to payments", child: { table: "payment_allocations", column: "payment_id" }, parent: { table: "payments", column: "id" } },
    { name: "Supplier allocations linked to supplier payments", child: { table: "supplier_payment_allocations", column: "supplier_payment_id" }, parent: { table: "supplier_payments", column: "id" } },
    { name: "Stock reservations linked to supply orders", child: { table: "stock_reservations", column: "order_id" }, parent: { table: "supply_orders", column: "id" } }
  ].map((check) => orphanCheck(db, tableSet, check));

  const report = buildReport({ tableCounts, preservedCounts, orphanChecks, resetCandidates, missingOperationalTables });
  fs.writeFileSync(reportPath, report);
  console.log(JSON.stringify({
    status: "completed",
    mode: "read-only",
    databaseModified: false,
    reportPath,
    operationalCandidateTables: resetCandidates.length,
    operationalCandidateRows: resetCandidates.reduce((sum, row) => sum + Number(row.activeRows || 0), 0),
    orphanChecksNeedingReview: orphanChecks.filter((row) => row.status === "Review").length
  }, null, 2));
} finally {
  db.close();
}

process.exit(0);
