import fs from "node:fs";
import path from "node:path";

// ERP error console: every failed backend action is journaled with who, where and
// what to do next, and the console adds live integrity checks on the books.
// The journal is a capped JSON-lines file in the runtime logs folder, so it never
// touches accounting tables and survives a database restore.

const JOURNAL_FILE = "erp-errors.jsonl";
const MAX_ENTRIES = 500;

// Ordered rules: the first pattern that matches an error message decides the guidance.
// Keep in step with the GEM assistant topics in src/renderer/config/errorGuidanceTopics.js.
export const ERROR_GUIDANCE_RULES = [
  { id: "session", pattern: /sign in|signed in|session|change your password/i, area: "Login", screen: "Login screen", action: "Sign in again. If asked, change the first-login password, then retry the action." },
  { id: "permission", pattern: /permission|not allowed|only a super admin|access denied/i, area: "Users and roles", screen: "Settings > Users", action: "Ask an admin to grant your role the permission named in the message, or have an admin do the action." },
  { id: "already_posted", pattern: /already posted|already reversed|reversal already exists/i, area: "Posting", screen: "The document's voucher in Accounting > Vouchers", action: "Nothing to post again. Open the existing voucher; to correct it, reverse it and post a fresh entry." },
  { id: "not_posted", pattern: /only posted|is not posted|not posted/i, area: "Posting", screen: "The document list", action: "Post the document first, or edit or delete the draft instead of reversing it." },
  { id: "financial_year", pattern: /financial year|year is closed|closed year|locked period/i, area: "Financial years", screen: "Accounting > Financial Years", action: "Use a date inside an open financial year, or ask an admin to open or create the year." },
  { id: "negative_stock", pattern: /negative|below zero|insufficient stock|not enough stock/i, area: "Inventory", screen: "Inventory > Stock Summary", action: "Check the warehouse balance. Post the stock inward first, or reverse the later issue before reversing the inward." },
  { id: "allocation", pattern: /exceed|unallocated|allocation|advance/i, area: "Receivables and payables", screen: "Accounting > Allocations", action: "Reduce the amount to the unallocated balance shown, or release an earlier allocation first." },
  { id: "unbalanced", pattern: /not balanced|unbalanced|debit.*credit/i, area: "Vouchers", screen: "Accounting > Vouchers", action: "Make total debit equal total credit on the voucher lines, then save again." },
  { id: "company", pattern: /company/i, area: "Company context", screen: "Company selector in the top bar", action: "Select the right company (not All Companies) and retry; records of another company cannot be used." },
  { id: "restore", pattern: /restore|backup/i, area: "Backup and restore", screen: "Settings > Backup", action: "Pick a backup created by this ERP. The live database was not changed; a refused file is left untouched." },
  { id: "reset", pattern: /reset|confirm text|RESET/i, area: "Company reset", screen: "Environment Manager", action: "Select one company, type RESET exactly, and use an admin account. A safety backup is taken first." },
  { id: "import", pattern: /import|column|row \d+|template/i, area: "Import", screen: "Import / Export", action: "Open the import preview, fix the rows listed with errors, and import again. Nothing is posted from a rejected row." },
  { id: "not_found", pattern: /not found|missing|does not exist/i, area: "Records", screen: "The list you came from", action: "Refresh the list; the record may have been deleted or belong to another company." },
  { id: "database", pattern: /SQLITE|database is locked|disk/i, area: "Database", screen: "ERP Health Center", action: "Close other ERP windows, wait a moment and retry. If it repeats, run Health Checks and export a support bundle." }
];

export function guidanceFor(message = "", channel = "") {
  const text = `${message}`;
  const rule = ERROR_GUIDANCE_RULES.find((item) => item.pattern.test(text));
  if (rule) return { topic: rule.id, area: rule.area, screen: rule.screen, nextAction: rule.action };
  return {
    topic: "general",
    area: channel ? channel.split(":")[0] : "ERP",
    screen: "The screen where the action was taken",
    nextAction: "Read the message, correct the field it names and retry. If it repeats, export a support bundle from the ERP Health Center."
  };
}

function journalPath(runtimeRoot) {
  return path.join(runtimeRoot, "logs", JOURNAL_FILE);
}

function readJournal(runtimeRoot) {
  try {
    return fs.readFileSync(journalPath(runtimeRoot), "utf8").split("\n").filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

// Never throws: recording an error must not hide the original error.
export function recordError(runtimeRoot, entry = {}) {
  if (!runtimeRoot) return null;
  try {
    const message = String(entry.message || "Unknown error").slice(0, 2000);
    const row = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      source: entry.source || "backend",
      channel: entry.channel || null,
      user_id: entry.user_id || null,
      company_id: entry.company_id || null,
      message,
      ...guidanceFor(message, entry.channel)
    };
    fs.mkdirSync(path.dirname(journalPath(runtimeRoot)), { recursive: true });
    fs.appendFileSync(journalPath(runtimeRoot), `${JSON.stringify(row)}\n`);
    const rows = readJournal(runtimeRoot);
    if (rows.length > MAX_ENTRIES) {
      fs.writeFileSync(journalPath(runtimeRoot), `${rows.slice(-MAX_ENTRIES).map((item) => JSON.stringify(item)).join("\n")}\n`);
    }
    return row;
  } catch {
    return null;
  }
}

export function clearErrorJournal(runtimeRoot) {
  const count = readJournal(runtimeRoot).length;
  try { fs.rmSync(journalPath(runtimeRoot), { force: true }); } catch { /* nothing to clear */ }
  return { cleared: count };
}

const POSTING_TABLES = [
  ["invoices", "Sales invoice", "invoice_number"],
  ["procurements", "Purchase bill", "purchase_invoice_number"],
  ["payments", "Receipt", "utr_number"],
  ["supplier_payments", "Supplier payment", "utr_number"],
  ["expense_entries", "Expense", "id"],
  ["stock_inwards", "Stock inward", "purchase_invoice_number"],
  ["stock_outwards", "Stock issue", "delivery_challan_number"],
  ["stock_adjustments", "Stock adjustment", "id"],
  ["stock_returns", "Stock return", "id"]
];

function hasColumn(db, table, column) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column); } catch { return false; }
}

// Documents whose last posting attempt failed and are still not in the books.
function stuckPostings(db, companyId) {
  const rows = [];
  POSTING_TABLES.forEach(([table, label, refColumn]) => {
    if (!hasColumn(db, table, "posting_status") || !hasColumn(db, table, "posting_error")) return;
    const companyFilter = companyId && hasColumn(db, table, "company_id") ? " AND company_id = ?" : "";
    const params = companyFilter ? [companyId] : [];
    db.prepare(`SELECT id, ${refColumn} reference, posting_error, updated_at FROM ${table} WHERE posting_status = 'Error' AND COALESCE(is_deleted, 0) = 0${companyFilter} ORDER BY id DESC LIMIT 50`).all(...params)
      .forEach((row) => rows.push({
        table, label, id: row.id, reference: row.reference || `#${row.id}`, error: row.posting_error, at: row.updated_at,
        ...guidanceFor(row.posting_error || "")
      }));
  });
  return rows;
}

function integrityCheck(id, label, ok, detail, action) {
  return { id, label, status: ok ? "pass" : "fail", detail, action: ok ? "No action required." : action };
}

// Live checks a chartered accountant would run before trusting the books.
export function bookIntegrityChecks(db, companyId, { verifyAuditChain } = {}) {
  const checks = [];
  const companyClause = companyId ? " AND v.company_id = ?" : "";
  const params = companyId ? [companyId] : [];
  const tb = db.prepare(`
    SELECT COALESCE(SUM(COALESCE(le.debit_minor, CAST(ROUND(le.debit * 100) AS INTEGER))), 0) dr,
      COALESCE(SUM(COALESCE(le.credit_minor, CAST(ROUND(le.credit * 100) AS INTEGER))), 0) cr
    FROM ledger_entries le JOIN vouchers v ON v.id = le.voucher_id
    WHERE COALESCE(le.is_deleted, 0) = 0 AND v.is_deleted = 0 AND v.status IN ('Posted', 'Reversed')${companyClause}
  `).get(...params);
  const tbDiff = (Number(tb.dr) - Number(tb.cr)) / 100;
  checks.push(integrityCheck("trial_balance", "Trial balance ties", tbDiff === 0, `Total debit minus total credit: ${tbDiff.toFixed(2)}`, "Open Accounting > Trial Balance and drill into the vouchers posted around the time this check last passed."));

  const unbalanced = db.prepare(`
    SELECT v.voucher_number FROM vouchers v JOIN ledger_entries le ON le.voucher_id = v.id AND COALESCE(le.is_deleted, 0) = 0
    WHERE v.is_deleted = 0 AND v.status IN ('Posted', 'Reversed')${companyClause}
    GROUP BY v.id HAVING ROUND(SUM(le.debit) - SUM(le.credit), 2) != 0 LIMIT 10
  `).all(...params).map((row) => row.voucher_number);
  checks.push(integrityCheck("voucher_balance", "Every posted voucher balances", unbalanced.length === 0, unbalanced.length ? `Unbalanced: ${unbalanced.join(", ")}` : "All posted vouchers balance.", "Open each voucher listed, reverse it and post a corrected entry."));

  const stockCompany = companyId ? " AND company_id = ?" : "";
  const negative = db.prepare(`
    SELECT item_id, warehouse_id, SUM(inward_quantity - outward_quantity) qty FROM stock_ledger
    WHERE COALESCE(is_deleted, 0) = 0${stockCompany} GROUP BY company_id, item_id, warehouse_id HAVING qty < -0.0001 LIMIT 10
  `).all(...params);
  checks.push(integrityCheck("negative_stock", "No warehouse holds negative stock", negative.length === 0, negative.length ? `${negative.length} item/warehouse pair(s) below zero` : "No negative balances.", "Open Inventory > Stock Summary, find the item, and post the missing inward or reverse the excess issue."));

  if (hasColumn(db, "receivables", "balance_outstanding")) {
    const negativeReceivables = db.prepare(`SELECT COUNT(*) c FROM receivables WHERE balance_outstanding < -0.009${companyId ? " AND company_id = ?" : ""}`).get(...params).c;
    checks.push(integrityCheck("receivables_not_negative", "No invoice is over-collected", negativeReceivables === 0, `${negativeReceivables} invoice(s) with a negative balance`, "Open Accounting > Allocations and release the extra allocation against those invoices."));
  }

  const stuck = stuckPostings(db, companyId);
  checks.push(integrityCheck("stuck_postings", "No document stuck in a failed posting", stuck.length === 0, stuck.length ? `${stuck.length} document(s) failed to post` : "No failed postings.", "Open the Error Console list below, fix the cause named for each document and post it again."));

  if (verifyAuditChain) {
    const chain = verifyAuditChain(db);
    checks.push(integrityCheck("audit_chain", "Audit trail is untampered", chain.chained && chain.broken.length === 0,
      chain.chained ? `${chain.verified} chained row(s) verified${chain.broken.length ? `; broken at row(s) ${chain.broken.join(", ")}` : ""}${chain.legacyRows ? `; ${chain.legacyRows} older row(s) predate the chain` : ""}` : "The audit chain has not started on this database.",
      "Someone edited or deleted audit rows outside the ERP. Keep this database aside, restore the last good backup and review who had file access."));
  }
  return checks;
}

export function errorConsoleState(db, runtimeRoot, { companyId = null, limit = 100, verifyAuditChain } = {}) {
  const errors = readJournal(runtimeRoot).reverse()
    .filter((row) => !companyId || !row.company_id || Number(row.company_id) === Number(companyId))
    .slice(0, limit);
  const integrity = db ? bookIntegrityChecks(db, companyId, { verifyAuditChain }) : [];
  return {
    generatedAt: new Date().toISOString(),
    errors,
    stuckPostings: db ? stuckPostings(db, companyId) : [],
    integrity,
    summary: {
      errors: errors.length,
      failedChecks: integrity.filter((row) => row.status === "fail").length
    }
  };
}
