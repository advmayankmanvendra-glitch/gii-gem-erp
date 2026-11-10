// Database-level protection for the books. The posting services already refuse
// unbalanced or edited vouchers; these triggers make SQLite refuse them too, so a
// bug in any code path cannot quietly change posted accounting.
//
// Rules:
// - A voucher is inserted as Draft and becomes Posted only through an UPDATE, which is
//   refused unless: it has lines; its lines balance to the paisa; every line has exactly
//   one active ledger entry with the line's account and paise amounts, and no entry names
//   anything else; every line account, entry account and entry belongs to the voucher's
//   company; paise amounts are whole numbers; and rupee columns equal paise / 100.
// - A Posted or Reversed voucher cannot be deleted, and only its status may change
//   (Posted to Reversed, with the reversal details). Its lines cannot be added,
//   changed or removed.
// - Ledger entries cannot be changed or deleted, and can only be added to a voucher that
//   is not yet posted. A line or entry must always use an account of the voucher's
//   company, even inside a maintenance window.
// - Two corrections may post one-sided, each naming an older unbalanced voucher that is
//   still Posted, has no correction yet, agrees with its ledger and lies in the same
//   financial year:
//   - a rounding adjustment (source_module 'rounding_adjustment'): one line on the
//     company's active Expense ledger "Rounding Off" that exactly cancels a difference
//     of at most one rupee;
//   - a reversal (source_module 'voucher_reversal') that mirrors the original exactly,
//     each non-zero original line used once with debit and credit swapped, so the pair
//     nets to zero.
// - Any other trigger on these tables, or whose SQL names them, is dropped at start-up
//   and logged.
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
export const ROUNDING_OFF_ACCOUNT_NAME = "Rounding Off";
// Tables whose triggers must be exactly the guards below. Any other trigger on them, or
// anywhere whose SQL names one of them (a trigger on another table or a view can write
// to the books), is dropped at start-up, so a restored file cannot carry a trigger that
// edits the books; SQLite has no dynamic SQL, so such a trigger must name the table.
export const LEDGER_TABLES = ["vouchers", "voucher_lines", "ledger_entries", "ledger_maintenance"];

function maintenanceOpen(companyExpression) {
  return `EXISTS (SELECT 1 FROM ledger_maintenance WHERE company_id = 0 OR company_id = ${companyExpression})`;
}

function voucherImbalance(voucherExpression) {
  return `(SELECT COALESCE(SUM(debit_minor), 0) - COALESCE(SUM(credit_minor), 0) FROM voucher_lines WHERE voucher_id = ${voucherExpression})`;
}

function entryImbalance(voucherExpression) {
  return `(SELECT COALESCE(SUM(debit_minor), 0) - COALESCE(SUM(credit_minor), 0) FROM ledger_entries WHERE voucher_id = ${voucherExpression} AND COALESCE(is_deleted, 0) = 0)`;
}

// The voucher's lines and its ledger entries carry the same debit and the same credit
// totals (not only the same net difference).
function linesMatchEntries(voucherExpression) {
  return `(SELECT COALESCE(SUM(debit_minor), 0) FROM voucher_lines WHERE voucher_id = ${voucherExpression})
                  = (SELECT COALESCE(SUM(debit_minor), 0) FROM ledger_entries WHERE voucher_id = ${voucherExpression} AND COALESCE(is_deleted, 0) = 0)
                AND (SELECT COALESCE(SUM(credit_minor), 0) FROM voucher_lines WHERE voucher_id = ${voucherExpression})
                  = (SELECT COALESCE(SUM(credit_minor), 0) FROM ledger_entries WHERE voucher_id = ${voucherExpression} AND COALESCE(is_deleted, 0) = 0)`;
}

function accountOfCompanyCheck(accountExpression, companyExpression) {
  return `SELECT RAISE(ABORT, 'Ledger guard: a voucher line must use an account of the voucher''s company.')
        WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE id = ${accountExpression} AND company_id = ${companyExpression});`;
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
                AND ${linesMatchEntries("original.id")}
                AND ${voucherImbalance("original.id")} + ${voucherImbalance(`${newRow}.id`)} = 0
                ${extra}
            )`;
}

// A reversal that is allowed to be one-sided must be an exact mirror of its original:
// the same number of non-zero lines, each with the same account and the debit and
// credit swapped, and each original line used exactly as often as it appears.
function mirrorsOriginal(newRow) {
  return `(SELECT COUNT(*) FROM voucher_lines WHERE voucher_id = ${newRow}.id)
              = (SELECT COUNT(*) FROM voucher_lines WHERE voucher_id = ${newRow}.source_id AND (debit_minor <> 0 OR credit_minor <> 0))
            AND NOT EXISTS (
              SELECT 1 FROM voucher_lines r
              WHERE r.voucher_id = ${newRow}.id
                AND (SELECT COUNT(*) FROM voucher_lines same
                     WHERE same.voucher_id = ${newRow}.id AND same.account_id = r.account_id
                       AND same.debit_minor = r.debit_minor AND same.credit_minor = r.credit_minor)
                  <> (SELECT COUNT(*) FROM voucher_lines o
                     WHERE o.voucher_id = ${newRow}.source_id AND o.account_id = r.account_id
                       AND o.debit_minor = r.credit_minor AND o.credit_minor = r.debit_minor)
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
          OR EXISTS (SELECT 1 FROM ledger_entries WHERE voucher_id = NEW.id AND COALESCE(is_deleted, 0) = 0 AND (debit <> debit_minor / 100.0 OR credit <> credit_minor / 100.0));
        SELECT RAISE(ABORT, 'Ledger guard: debit and credit do not balance to the paisa. Posting was refused.')
        WHERE ${voucherImbalance("NEW.id")} <> 0
          AND NOT (
            COALESCE(NEW.source_module, '') = '${ROUNDING_ADJUSTMENT_SOURCE}'
            AND ${correctableOriginal("NEW", `AND ABS(${voucherImbalance("original.id")}) BETWEEN 1 AND ${ROUNDING_ADJUSTMENT_LIMIT_MINOR}`)}
            AND (SELECT COUNT(*) FROM voucher_lines WHERE voucher_id = NEW.id) = 1
            AND NOT EXISTS (
              SELECT 1 FROM voucher_lines l JOIN accounts a ON a.id = l.account_id
              WHERE l.voucher_id = NEW.id
                AND NOT (a.company_id = NEW.company_id AND a.account_name = '${ROUNDING_OFF_ACCOUNT_NAME}'
                  AND a.account_type = 'Expense' AND a.status = 'active' AND COALESCE(a.is_deleted, 0) = 0)
            )
          )
          AND NOT (
            COALESCE(NEW.source_module, '') = '${VOUCHER_REVERSAL_SOURCE}'
            AND ${correctableOriginal("NEW", "")}
            AND ${mirrorsOriginal("NEW")}
          );
        SELECT RAISE(ABORT, 'Ledger guard: paise amounts must be whole numbers. Posting was refused.')
        WHERE EXISTS (SELECT 1 FROM voucher_lines WHERE voucher_id = NEW.id AND (typeof(debit_minor) <> 'integer' OR typeof(credit_minor) <> 'integer'))
          OR EXISTS (SELECT 1 FROM ledger_entries WHERE voucher_id = NEW.id AND COALESCE(is_deleted, 0) = 0 AND (typeof(debit_minor) <> 'integer' OR typeof(credit_minor) <> 'integer'));
        SELECT RAISE(ABORT, 'Ledger guard: a ledger entry does not match its voucher line, or names another company. Posting was refused.')
        WHERE EXISTS (
            SELECT 1 FROM voucher_lines l
            WHERE l.voucher_id = NEW.id
              AND (SELECT COUNT(*) FROM ledger_entries e WHERE e.voucher_line_id = l.id AND COALESCE(e.is_deleted, 0) = 0) <> 1
          )
          OR EXISTS (
            SELECT 1 FROM ledger_entries e
            WHERE e.voucher_id = NEW.id AND COALESCE(e.is_deleted, 0) = 0
              AND (e.company_id IS NOT NEW.company_id
                OR NOT EXISTS (
                  SELECT 1 FROM voucher_lines l
                  WHERE l.id = e.voucher_line_id AND l.voucher_id = NEW.id AND l.account_id = e.account_id
                    AND l.debit_minor = e.debit_minor AND l.credit_minor = e.credit_minor
                ))
          )
          OR EXISTS (
            SELECT 1 FROM voucher_lines l JOIN accounts a ON a.id = l.account_id
            WHERE l.voucher_id = NEW.id AND a.company_id IS NOT NEW.company_id
          );
      END`,

    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_voucher_posted_update
      BEFORE UPDATE ON vouchers
      WHEN OLD.status IN ('Posted', 'Reversed') AND NOT (${maintenanceOpen("OLD.company_id")} AND ${maintenanceOpen("NEW.company_id")})
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

    // A line's account must belong to the voucher's company, even inside a maintenance window.
    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_line_insert
      BEFORE INSERT ON voucher_lines
      BEGIN
        ${accountOfCompanyCheck("NEW.account_id", lineCompany("NEW.voucher_id"))}
        SELECT RAISE(ABORT, 'Ledger guard: lines cannot be added to or replaced on a posted voucher.')
        WHERE (${lockedVoucher("NEW.voucher_id")} OR EXISTS (SELECT 1 FROM voucher_lines old WHERE old.id = NEW.id AND ${lockedVoucher("old.voucher_id")}))
          AND NOT ${maintenanceOpen(lineCompany("NEW.voucher_id"))};
      END`,

    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_line_update
      BEFORE UPDATE ON voucher_lines
      BEGIN
        ${accountOfCompanyCheck("NEW.account_id", lineCompany("NEW.voucher_id"))}
        SELECT RAISE(ABORT, 'Ledger guard: lines of a posted voucher cannot be changed. Reverse the voucher instead.')
        WHERE (${lockedVoucher("OLD.voucher_id")} OR ${lockedVoucher("NEW.voucher_id")}
            OR EXISTS (SELECT 1 FROM voucher_lines other WHERE other.id = NEW.id AND other.id <> OLD.id AND ${lockedVoucher("other.voucher_id")}))
          AND NOT (${maintenanceOpen(lineCompany("OLD.voucher_id"))} AND ${maintenanceOpen(lineCompany("NEW.voucher_id"))});
      END`,

    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_line_delete
      BEFORE DELETE ON voucher_lines
      WHEN ${lockedVoucher("OLD.voucher_id")} AND NOT ${maintenanceOpen(lineCompany("OLD.voucher_id"))}
      BEGIN
        SELECT RAISE(ABORT, 'Ledger guard: lines of a posted voucher cannot be deleted. Reverse the voucher instead.');
      END`,

    // The same-company rule holds even inside a maintenance window.
    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_entry_insert
      BEFORE INSERT ON ledger_entries
      BEGIN
        SELECT RAISE(ABORT, 'Ledger guard: ledger entries can only be written for an existing voucher of the same company that is not yet posted.')
        WHERE NOT EXISTS (SELECT 1 FROM vouchers WHERE id = NEW.voucher_id AND company_id = NEW.company_id)
          OR NOT EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND company_id = NEW.company_id)
          OR (NOT ${maintenanceOpen("NEW.company_id")}
            AND (${lockedVoucher("NEW.voucher_id")} OR EXISTS (SELECT 1 FROM ledger_entries old WHERE old.id = NEW.id)));
      END`,

    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_entry_update
      BEFORE UPDATE ON ledger_entries
      BEGIN
        SELECT RAISE(ABORT, 'Ledger guard: ledger entries cannot be changed. Post a reversal or correction voucher instead.')
        WHERE NOT (${maintenanceOpen("OLD.company_id")} AND ${maintenanceOpen("NEW.company_id")});
        SELECT RAISE(ABORT, 'Ledger guard: ledger entries can only belong to a voucher and an account of the same company.')
        WHERE NOT EXISTS (SELECT 1 FROM vouchers WHERE id = NEW.voucher_id AND company_id = NEW.company_id)
          OR NOT EXISTS (SELECT 1 FROM accounts WHERE id = NEW.account_id AND company_id = NEW.company_id);
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
    // corrections (rounding adjustments and reversals); the line index matches each entry
    // to its voucher line.
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_voucher_lines_voucher ON voucher_lines (voucher_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_entries_voucher ON ledger_entries (voucher_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_entries_company_account ON ledger_entries (company_id, account_id, id);
      CREATE INDEX IF NOT EXISTS idx_vouchers_source ON vouchers (source_id, source_module);
      CREATE INDEX IF NOT EXISTS idx_ledger_entries_line ON ledger_entries (voucher_line_id);
    `);
    // A maintenance row only lives inside its own transaction. One left behind would
    // switch the guards off, so clear it.
    db.prepare("DELETE FROM ledger_maintenance").run();
    dropLedgerGuards(db);
    const unexpected = dropUnexpectedLedgerTriggers(db);
    expectedTriggers().forEach(({ sql }) => db.exec(sql));
    compileLedgerGuards(db);
    return Object.assign(LEDGER_GUARD_TRIGGERS.slice(), { droppedUnexpected: unexpected });
  })();
}

// SQLite checks a trigger's column names only when the trigger runs. Preparing one
// statement per guarded action (none of which touches a row) compiles every guard now,
// so a migration that renames or drops a column the guards use fails at start-up instead
// of on the next posting.
export const LEDGER_GUARD_COMPILE_STATEMENTS = [
  "INSERT INTO vouchers SELECT * FROM vouchers WHERE 0",
  "UPDATE vouchers SET status = status, id = id, company_id = company_id, voucher_number = voucher_number WHERE 0",
  "DELETE FROM vouchers WHERE 0",
  "INSERT INTO voucher_lines SELECT * FROM voucher_lines WHERE 0",
  "UPDATE voucher_lines SET id = id WHERE 0",
  "DELETE FROM voucher_lines WHERE 0",
  "INSERT INTO ledger_entries SELECT * FROM ledger_entries WHERE 0",
  "UPDATE ledger_entries SET id = id WHERE 0",
  "DELETE FROM ledger_entries WHERE 0"
];

export function compileLedgerGuards(db) {
  LEDGER_GUARD_COMPILE_STATEMENTS.forEach((sql) => {
    try {
      db.prepare(sql);
    } catch (error) {
      throw new Error(`Ledger guard does not fit the current schema (${error.message}). Fix ledgerGuards.js before releasing.`);
    }
  });
}

// One definition of "a posted voucher's lines and ledger entries agree", shared by the
// money integrity report, the Error Console and the start-up defect count, so they cannot
// drift apart. scopeSql is a SELECT of voucher ids (it may use positional parameters, which
// appear once). The result is a WITH clause ending in a "checked" table with one row per
// scoped Posted or Reversed voucher:
//   line_debit_minor, line_credit_minor     totals of its lines
//   entry_debit_minor, entry_credit_minor   totals of its active ledger entries
//   bad_lines     lines without exactly one active entry with the line's account and
//                 amounts, or whose account belongs to another company
//   stray_entries active entries that name no line of this voucher, or whose account or
//                 company is not the voucher's company
//   mismatch      1 when any of the above disagree
// Every part is a grouped pass, so a whole-book report reads each table once.
export function voucherLedgerCheckSql(scopeSql) {
  return `
    WITH scope(id) AS (${scopeSql}),
    sv AS (
      SELECT v.id, v.company_id, v.voucher_number, v.voucher_date, v.voucher_type, v.status, v.source_module, v.source_id
      FROM vouchers v JOIN scope ON scope.id = v.id
      WHERE COALESCE(v.is_deleted, 0) = 0 AND v.status IN ('Posted', 'Reversed')
    ),
    line_check AS (
      SELECT l.voucher_id, l.id, l.debit_minor, l.credit_minor,
        COUNT(e.id) entries,
        SUM(CASE WHEN e.account_id = l.account_id AND e.debit_minor = l.debit_minor AND e.credit_minor = l.credit_minor THEN 1 ELSE 0 END) matching,
        MAX(CASE WHEN a.company_id IS sv.company_id THEN 0 ELSE 1 END) foreign_account
      FROM voucher_lines l
      JOIN sv ON sv.id = l.voucher_id
      LEFT JOIN accounts a ON a.id = l.account_id
      LEFT JOIN ledger_entries e ON e.voucher_line_id = l.id AND COALESCE(e.is_deleted, 0) = 0
      GROUP BY l.id
    ),
    line_sums AS (
      SELECT voucher_id, SUM(debit_minor) debit_minor, SUM(credit_minor) credit_minor,
        SUM(CASE WHEN entries <> 1 OR matching <> 1 OR foreign_account = 1 THEN 1 ELSE 0 END) bad_lines
      FROM line_check GROUP BY voucher_id
    ),
    entry_sums AS (
      SELECT e.voucher_id, SUM(e.debit_minor) debit_minor, SUM(e.credit_minor) credit_minor,
        SUM(CASE WHEN l.id IS NULL OR e.company_id IS NOT sv.company_id OR a.company_id IS NOT sv.company_id THEN 1 ELSE 0 END) stray_entries
      FROM ledger_entries e
      JOIN sv ON sv.id = e.voucher_id
      LEFT JOIN voucher_lines l ON l.id = e.voucher_line_id AND l.voucher_id = e.voucher_id
      LEFT JOIN accounts a ON a.id = e.account_id
      WHERE COALESCE(e.is_deleted, 0) = 0
      GROUP BY e.voucher_id
    ),
    checked AS (
      SELECT sv.*,
        COALESCE(ls.debit_minor, 0) line_debit_minor, COALESCE(ls.credit_minor, 0) line_credit_minor,
        COALESCE(es.debit_minor, 0) entry_debit_minor, COALESCE(es.credit_minor, 0) entry_credit_minor,
        COALESCE(ls.bad_lines, 0) bad_lines, COALESCE(es.stray_entries, 0) stray_entries,
        CASE WHEN COALESCE(ls.debit_minor, 0) <> COALESCE(es.debit_minor, 0)
          OR COALESCE(ls.credit_minor, 0) <> COALESCE(es.credit_minor, 0)
          OR COALESCE(ls.bad_lines, 0) > 0 OR COALESCE(es.stray_entries, 0) > 0 THEN 1 ELSE 0 END mismatch
      FROM sv
      LEFT JOIN line_sums ls ON ls.voucher_id = sv.id
      LEFT JOIN entry_sums es ON es.voucher_id = sv.id
    )`;
}

// Guards that are absent or differ from the current rules (for example after a backup
// from elsewhere was restored with altered triggers). Empty when all is in place.
export function missingLedgerGuards(db) {
  const existing = new Map(db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger'").all().map((row) => [row.name, row.sql]));
  return expectedTriggers()
    .filter(({ name, sql }) => !existing.has(name) || normalizedSql(existing.get(name)) !== normalizedSql(sql))
    .map(({ name }) => name);
}

// Triggers on the ledger tables that are not the guards above. Start-up drops them; the
// money integrity check reports any that appear while the app is running.
export function unexpectedLedgerTriggers(db) {
  const tables = new Set(LEDGER_TABLES);
  const mentions = new RegExp(`\\b(${LEDGER_TABLES.join("|")})\\b`, "i");
  return db.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger'").all()
    .filter((row) => !LEDGER_GUARD_TRIGGERS.includes(row.name))
    .filter((row) => tables.has(String(row.tbl_name || "").toLowerCase()) || mentions.test(String(row.sql || "")))
    .map((row) => row.name);
}

// Drops the triggers unexpectedLedgerTriggers lists. Start-up calls it before migrations,
// so a planted trigger never runs while the guards are off, and again with the guards.
export function dropUnexpectedLedgerTriggers(db) {
  const names = unexpectedLedgerTriggers(db);
  names.forEach((name) => db.exec(`DROP TRIGGER IF EXISTS "${name.replace(/"/g, '""')}"`));
  return names;
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
// disagree (by voucherLedgerCheckSql). Start-up runs migrations and seeding with the guards off, so the count is
// taken before and after and a rise is recorded. Returns null on a database that does not
// have the paise columns yet (an older copy before its upgrade).
export function ledgerDefectCount(db) {
  // Unbalanced vouchers (other than the one-sided corrections) plus vouchers whose lines and
  // ledger entries disagree, by the shared check above. Originals already settled by a
  // correction are still counted; only a rise matters. Grouped passes only, so it needs no
  // index: it also runs before start-up has created the guard indexes on an older database.
  try {
    return Number(db.prepare(`
      ${voucherLedgerCheckSql("SELECT id FROM vouchers")}
      SELECT COUNT(*) total FROM checked
      WHERE mismatch = 1
        OR (line_debit_minor <> line_credit_minor
          AND COALESCE(source_module, '') NOT IN ('${ROUNDING_ADJUSTMENT_SOURCE}', '${VOUCHER_REVERSAL_SOURCE}'))
    `).get().total);
  } catch (error) {
    // An older database without the paise or line-link columns cannot be counted until
    // migrations add them; any other error is real.
    if (/no such column/i.test(String(error?.message))) return null;
    throw error;
  }
}
