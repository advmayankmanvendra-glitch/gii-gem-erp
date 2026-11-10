// Database-level protection for the books. The posting services already refuse
// unbalanced or edited vouchers; these triggers make SQLite refuse them too, so a
// bug in any code path cannot quietly change posted accounting.
//
// Rules:
// - A voucher is inserted as Draft and becomes Posted only through an UPDATE, which
//   is refused unless its lines and its ledger entries balance to the paisa.
// - A Posted or Reversed voucher cannot be deleted, and only its status may change
//   (Posted to Reversed, with the reversal details). Its lines cannot be added,
//   changed or removed.
// - Ledger entries cannot be changed or deleted, and can only be added to a voucher
//   that is not yet posted.
// - A rounding adjustment (source_module 'rounding_adjustment') is the one posted
//   voucher allowed to be one-sided: it must exactly cancel the paise difference of
//   the older, unbalanced voucher it names, and that difference must be at most
//   one rupee.
//
// - A reversal of an older, unbalanced voucher may mirror it exactly, so the pair nets
//   to zero.
// - Every line and ledger entry must carry rupee columns equal to its paise / 100, so
//   the paise columns the guards check are the amounts the books show.
//
// Operational reset runs inside a maintenance window: a ledger_maintenance row written
// and removed within the same transaction.
//
// The guards are dropped when the app opens a database and created again, from this
// file, once migrations have run. So migrations run unguarded on every database (as
// they do on a new one), and a changed rule here reaches every existing database on its
// next start. A migration that edits posted accounting needs nothing special; any other
// code that must do so uses withLedgerMaintenance inside a transaction.

export const LEDGER_GUARD_TRIGGERS = [
  "trg_ledger_guard_voucher_insert",
  "trg_ledger_guard_voucher_post",
  "trg_ledger_guard_voucher_posted_update",
  "trg_ledger_guard_voucher_replace",
  "trg_ledger_guard_voucher_delete",
  "trg_ledger_guard_line_insert",
  "trg_ledger_guard_line_update",
  "trg_ledger_guard_line_delete",
  "trg_ledger_guard_entry_insert",
  "trg_ledger_guard_entry_update",
  "trg_ledger_guard_entry_delete"
];

// Columns of a posted voucher that may still change: its status (Posted to Reversed only)
// and the reversal and approval details. Every other column is fixed once posted;
// scripts/audit/ledger-guards.test.mjs fails when a new vouchers column is not placed in
// one list or the other.
export const POSTED_VOUCHER_EDITABLE_COLUMNS = ["status", "reversal_reason", "reversal_date", "reversed_by", "approval_status", "updated_at"];
export const POSTED_VOUCHER_FIXED_COLUMNS = ["id", "company_id", "voucher_number", "voucher_date", "voucher_type", "narration", "source_module", "source_id", "created_at", "deleted_at", "deleted_by", "is_deleted", "financial_year_id"];

export const ROUNDING_ADJUSTMENT_SOURCE = "rounding_adjustment";
export const VOUCHER_REVERSAL_SOURCE = "voucher_reversal";
// Pass to withLedgerMaintenance to open the window for every company at once.
export const LEDGER_MAINTENANCE_ALL_COMPANIES = "all";
export const ROUNDING_ADJUSTMENT_LIMIT_MINOR = 100;

function maintenanceOpen(companyExpression) {
  return `EXISTS (SELECT 1 FROM ledger_maintenance WHERE company_id = 0 OR company_id = ${companyExpression})`;
}

function voucherImbalance(voucherExpression) {
  return `(SELECT COALESCE(SUM(debit_minor), 0) - COALESCE(SUM(credit_minor), 0) FROM voucher_lines WHERE voucher_id = ${voucherExpression})`;
}

function entryImbalance(voucherExpression) {
  return `(SELECT COALESCE(SUM(debit_minor), 0) - COALESCE(SUM(credit_minor), 0) FROM ledger_entries WHERE voucher_id = ${voucherExpression} AND COALESCE(is_deleted, 0) = 0)`;
}

function lineCompany(voucherExpression) {
  return `(SELECT company_id FROM vouchers WHERE id = ${voucherExpression})`;
}

function lockedVoucher(voucherExpression) {
  return `EXISTS (SELECT 1 FROM vouchers WHERE id = ${voucherExpression} AND status IN ('Posted', 'Reversed'))`;
}

// Older, unbalanced voucher the given one corrects (rounding adjustment) or mirrors
// (reversal): it must still be Posted (not yet reversed), of the same company, its lines
// must agree with its ledger entries, and no other correction may already have cancelled
// its difference, so one imbalance is never cancelled twice. The correction must fall in
// the original's financial year, so the two cancel inside one year's trial balance.
function correctableOriginal(newRow, extra) {
  return `EXISTS (
              SELECT 1 FROM vouchers original
              WHERE original.id = ${newRow}.source_id
                AND original.company_id = ${newRow}.company_id
                AND original.status = 'Posted'
                AND (
                  ${newRow}.voucher_date = original.voucher_date
                  OR EXISTS (
                    SELECT 1 FROM financial_years fy
                    WHERE fy.company_id = original.company_id
                      AND original.voucher_date BETWEEN fy.start_date AND fy.end_date
                      AND ${newRow}.voucher_date BETWEEN fy.start_date AND fy.end_date
                  )
                )
                AND NOT EXISTS (
                  SELECT 1 FROM vouchers other
                  WHERE other.id <> ${newRow}.id
                    AND other.source_id = original.id
                    AND other.source_module IN ('${ROUNDING_ADJUSTMENT_SOURCE}', '${VOUCHER_REVERSAL_SOURCE}')
                    AND other.status IN ('Posted', 'Reversed')
                    AND ${voucherImbalance("other.id")} <> 0
                )
                AND COALESCE(original.source_module, '') NOT IN ('${ROUNDING_ADJUSTMENT_SOURCE}', '${VOUCHER_REVERSAL_SOURCE}')
                AND ${voucherImbalance("original.id")} = ${entryImbalance("original.id")}
                AND ${voucherImbalance("original.id")} + ${voucherImbalance(`${newRow}.id`)} = 0
                ${extra}
            )`;
}

function triggerSql() {
  return [
    // The conflict checks stop INSERT OR REPLACE from silently deleting a posted row:
    // SQLite's replace deletion does not run the delete guards.
    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_voucher_insert
      BEFORE INSERT ON vouchers
      WHEN NOT ${maintenanceOpen("NEW.company_id")}
      BEGIN
        SELECT RAISE(ABORT, 'Ledger guard: a voucher must be saved as Draft and then posted, so the database can check that it balances.')
        WHERE NEW.status IN ('Posted', 'Reversed');
        SELECT RAISE(ABORT, 'Ledger guard: a posted voucher cannot be replaced. Reverse it instead.')
        WHERE EXISTS (SELECT 1 FROM vouchers WHERE id = NEW.id AND status IN ('Posted', 'Reversed'))
          OR EXISTS (SELECT 1 FROM vouchers WHERE company_id = NEW.company_id AND voucher_number = NEW.voucher_number AND status IN ('Posted', 'Reversed'));
      END`,

    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_voucher_post
      BEFORE UPDATE OF status ON vouchers
      WHEN NEW.status IN ('Posted', 'Reversed') AND OLD.status NOT IN ('Posted', 'Reversed') AND NOT ${maintenanceOpen("NEW.company_id")}
      BEGIN
        SELECT RAISE(ABORT, 'Ledger guard: a voucher needs at least one line before it can be posted.')
        WHERE NOT EXISTS (SELECT 1 FROM voucher_lines WHERE voucher_id = NEW.id);
        SELECT RAISE(ABORT, 'Ledger guard: the voucher lines and ledger entries do not agree. Posting was refused.')
        WHERE ${voucherImbalance("NEW.id")} <> ${entryImbalance("NEW.id")}
          OR (SELECT COALESCE(SUM(debit_minor), 0) FROM voucher_lines WHERE voucher_id = NEW.id)
             <> (SELECT COALESCE(SUM(debit_minor), 0) FROM ledger_entries WHERE voucher_id = NEW.id AND COALESCE(is_deleted, 0) = 0);
        SELECT RAISE(ABORT, 'Ledger guard: a line or ledger entry has rupee and paise amounts that differ. Posting was refused.')
        WHERE EXISTS (SELECT 1 FROM voucher_lines WHERE voucher_id = NEW.id AND (debit <> debit_minor / 100.0 OR credit <> credit_minor / 100.0))
          OR EXISTS (SELECT 1 FROM ledger_entries WHERE voucher_id = NEW.id AND (debit <> debit_minor / 100.0 OR credit <> credit_minor / 100.0));
        SELECT RAISE(ABORT, 'Ledger guard: debit and credit do not balance to the paisa. Posting was refused.')
        WHERE ${voucherImbalance("NEW.id")} <> 0
          AND NOT (
            COALESCE(NEW.source_module, '') = '${ROUNDING_ADJUSTMENT_SOURCE}'
            AND ${correctableOriginal("NEW", `AND ABS(${voucherImbalance("original.id")}) BETWEEN 1 AND ${ROUNDING_ADJUSTMENT_LIMIT_MINOR}`)}
          )
          AND NOT (
            COALESCE(NEW.source_module, '') = '${VOUCHER_REVERSAL_SOURCE}'
            AND ${correctableOriginal("NEW", "")}
          );
      END`,

    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_voucher_posted_update
      BEFORE UPDATE ON vouchers
      WHEN OLD.status IN ('Posted', 'Reversed') AND NOT ${maintenanceOpen("OLD.company_id")}
      BEGIN
        SELECT RAISE(ABORT, 'Ledger guard: a posted voucher cannot be edited. Reverse it and post a corrected voucher instead.')
        WHERE ${POSTED_VOUCHER_FIXED_COLUMNS.map((column) => `NEW.${column} IS NOT OLD.${column}`).join("\n          OR ")}
          OR (OLD.status = 'Reversed' AND NEW.status IS NOT 'Reversed')
          OR (OLD.status = 'Posted' AND NEW.status NOT IN ('Posted', 'Reversed'));
      END`,

    // UPDATE OR REPLACE that moves any voucher onto a posted voucher's id or number would
    // delete the posted one without running the delete guard.
    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_voucher_replace
      BEFORE UPDATE OF id, company_id, voucher_number ON vouchers
      WHEN NOT ${maintenanceOpen("NEW.company_id")}
      BEGIN
        SELECT RAISE(ABORT, 'Ledger guard: a posted voucher cannot be replaced. Reverse it instead.')
        WHERE EXISTS (SELECT 1 FROM vouchers WHERE id = NEW.id AND id <> OLD.id AND status IN ('Posted', 'Reversed'))
          OR EXISTS (SELECT 1 FROM vouchers WHERE company_id = NEW.company_id AND voucher_number = NEW.voucher_number AND id <> OLD.id AND status IN ('Posted', 'Reversed'));
      END`,

    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_voucher_delete
      BEFORE DELETE ON vouchers
      WHEN OLD.status IN ('Posted', 'Reversed') AND NOT ${maintenanceOpen("OLD.company_id")}
      BEGIN
        SELECT RAISE(ABORT, 'Ledger guard: a posted voucher cannot be deleted. Reverse it instead.');
      END`,

    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_line_insert
      BEFORE INSERT ON voucher_lines
      WHEN (${lockedVoucher("NEW.voucher_id")} OR EXISTS (SELECT 1 FROM voucher_lines old WHERE old.id = NEW.id AND ${lockedVoucher("old.voucher_id")}))
        AND NOT ${maintenanceOpen(lineCompany("NEW.voucher_id"))}
      BEGIN
        SELECT RAISE(ABORT, 'Ledger guard: lines cannot be added to or replaced on a posted voucher.');
      END`,

    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_line_update
      BEFORE UPDATE ON voucher_lines
      WHEN (${lockedVoucher("OLD.voucher_id")} OR ${lockedVoucher("NEW.voucher_id")}
          OR EXISTS (SELECT 1 FROM voucher_lines other WHERE other.id = NEW.id AND other.id <> OLD.id AND ${lockedVoucher("other.voucher_id")}))
        AND NOT (${maintenanceOpen(lineCompany("OLD.voucher_id"))} AND ${maintenanceOpen(lineCompany("NEW.voucher_id"))})
      BEGIN
        SELECT RAISE(ABORT, 'Ledger guard: lines of a posted voucher cannot be changed. Reverse the voucher instead.');
      END`,

    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_line_delete
      BEFORE DELETE ON voucher_lines
      WHEN ${lockedVoucher("OLD.voucher_id")} AND NOT ${maintenanceOpen(lineCompany("OLD.voucher_id"))}
      BEGIN
        SELECT RAISE(ABORT, 'Ledger guard: lines of a posted voucher cannot be deleted. Reverse the voucher instead.');
      END`,

    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_entry_insert
      BEFORE INSERT ON ledger_entries
      WHEN NOT ${maintenanceOpen("NEW.company_id")}
      BEGIN
        SELECT RAISE(ABORT, 'Ledger guard: ledger entries can only be written for an existing voucher of the same company that is not yet posted.')
        WHERE NOT EXISTS (SELECT 1 FROM vouchers WHERE id = NEW.voucher_id AND company_id = NEW.company_id)
          OR ${lockedVoucher("NEW.voucher_id")}
          OR EXISTS (SELECT 1 FROM ledger_entries old WHERE old.id = NEW.id);
      END`,

    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_entry_update
      BEFORE UPDATE ON ledger_entries
      WHEN NOT (${maintenanceOpen("OLD.company_id")} AND ${maintenanceOpen("NEW.company_id")})
      BEGIN
        SELECT RAISE(ABORT, 'Ledger guard: ledger entries cannot be changed. Post a reversal or correction voucher instead.');
      END`,

    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_entry_delete
      BEFORE DELETE ON ledger_entries
      WHEN NOT ${maintenanceOpen("OLD.company_id")}
      BEGIN
        SELECT RAISE(ABORT, 'Ledger guard: ledger entries cannot be deleted. Post a reversal or correction voucher instead.');
      END`
  ];
}

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function expectedTriggers() {
  return triggerSql().map((sql, index) => ({ name: LEDGER_GUARD_TRIGGERS[index], sql }));
}

function normalizedSql(sql) {
  return String(sql || "").replace(/IF NOT EXISTS\s+/i, "").replace(/\s+/g, " ").trim();
}

// Removes every ledger guard. initializeDatabase calls this before migrations run.
export function dropLedgerGuards(db) {
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_ledger_guard%'").all().map((row) => row.name);
  names.forEach((name) => db.exec(`DROP TRIGGER IF EXISTS "${name.replace(/"/g, '""')}"`));
  return names;
}

// Creates the maintenance table, the indexes the guards use, and every guard from the
// current rules (replacing older versions). Runs on every start.
export function ensureLedgerGuards(db) {
  if (!["vouchers", "voucher_lines", "ledger_entries"].every((name) => tableExists(db, name))) return [];
  return db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ledger_maintenance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL DEFAULT 0,
        reason TEXT NOT NULL,
        opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // The guards sum a voucher's lines and ledger entries on every posting; without these
    // indexes each posting would read the whole table. The last one serves the running
    // balance lookup made for every ledger entry; the source index finds a voucher's
    // corrections (rounding adjustments and reversals).
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_voucher_lines_voucher ON voucher_lines (voucher_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_entries_voucher ON ledger_entries (voucher_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_entries_company_account ON ledger_entries (company_id, account_id, id);
      CREATE INDEX IF NOT EXISTS idx_vouchers_source ON vouchers (source_id, source_module);
    `);
    // A maintenance row only lives inside its own transaction. One left behind would
    // switch the guards off, so clear it.
    db.prepare("DELETE FROM ledger_maintenance").run();
    dropLedgerGuards(db);
    expectedTriggers().forEach(({ sql }) => db.exec(sql));
    return LEDGER_GUARD_TRIGGERS.slice();
  })();
}

// Guards that are absent or differ from the current rules (for example after a backup
// from elsewhere was restored with altered triggers). Empty when all is in place.
export function missingLedgerGuards(db) {
  const existing = new Map(db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger'").all().map((row) => [row.name, row.sql]));
  return expectedTriggers()
    .filter(({ name, sql }) => !existing.has(name) || normalizedSql(existing.get(name)) !== normalizedSql(sql))
    .map(({ name }) => name);
}

// Runs fn with the guards opened for one company, or for every company when companyId is
// LEDGER_MAINTENANCE_ALL_COMPANIES. The caller must already be inside a transaction, so the
// window closes even if fn throws. A missing company id is refused rather than read as
// "every company".
export function withLedgerMaintenance(db, companyId, reason, fn) {
  if (!db.inTransaction) throw new Error("Ledger maintenance must run inside a database transaction.");
  const allCompanies = companyId === LEDGER_MAINTENANCE_ALL_COMPANIES;
  const scope = allCompanies ? 0 : Number(companyId);
  if (!allCompanies && !(Number.isInteger(scope) && scope > 0)) throw new Error("Ledger maintenance needs a company id, or LEDGER_MAINTENANCE_ALL_COMPANIES.");
  if (!tableExists(db, "ledger_maintenance")) return fn();
  const row = db.prepare("INSERT INTO ledger_maintenance (company_id, reason) VALUES (?, ?)").run(scope, String(reason || "maintenance"));
  try {
    return fn();
  } finally {
    db.prepare("DELETE FROM ledger_maintenance WHERE id = ?").run(row.lastInsertRowid);
  }
}

// Maintenance rows still open. Outside a running repair this must be empty: an open row
// switches the guards off for its company (or for all, with company 0).
export function openLedgerMaintenance(db) {
  if (!tableExists(db, "ledger_maintenance")) return [];
  return db.prepare("SELECT id, company_id, reason, opened_at FROM ledger_maintenance ORDER BY id").all();
}

// Counts posted vouchers whose lines do not balance, or whose lines and ledger entries
// disagree. Start-up runs migrations and seeding with the guards off, so the count is
// taken before and after and a rise is recorded. Returns null on a database that does not
// have the paise columns yet (an older copy before its upgrade).
export function ledgerDefectCount(db) {
  try {
    return Number(db.prepare(`
      SELECT COUNT(*) total FROM (
        SELECT v.id,
          (SELECT COALESCE(SUM(debit_minor), 0) - COALESCE(SUM(credit_minor), 0) FROM voucher_lines WHERE voucher_id = v.id) lines,
          (SELECT COALESCE(SUM(debit_minor), 0) - COALESCE(SUM(credit_minor), 0) FROM ledger_entries WHERE voucher_id = v.id AND COALESCE(is_deleted, 0) = 0) entries
        FROM vouchers v
        WHERE v.status IN ('Posted', 'Reversed') AND COALESCE(v.is_deleted, 0) = 0
          AND COALESCE(v.source_module, '') NOT IN ('${ROUNDING_ADJUSTMENT_SOURCE}', '${VOUCHER_REVERSAL_SOURCE}')
      ) WHERE lines <> 0 OR lines <> entries
    `).get().total);
  } catch {
    return null;
  }
}
