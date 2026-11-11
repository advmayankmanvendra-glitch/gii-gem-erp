// Database-level protection for the books. The posting services already refuse
// unbalanced or edited vouchers; these triggers make SQLite refuse them too, so a
// bug in any code path cannot quietly change posted accounting.
//
// Rules:
// - A voucher is inserted as Draft and becomes Posted only through an UPDATE, which is
//   refused unless: it has lines; its lines balance to the paisa; every line has exactly
//   one active ledger entry with the line's account and paise amounts, and no entry names
//   anything else; every line account, entry account and entry belongs to the voucher's
//   company; every entry carries the voucher's date; the voucher is not deleted and has
//   no deleted entries; paise amounts are whole numbers; and rupee columns equal
//   paise / 100.
// - A posted voucher becomes Reversed only once its reversal voucher is posted.
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
//     each non-zero original line used once with debit and credit swapped and no zero
//     lines, so the pair nets to zero.
// - INSERT OR REPLACE and UPDATE OR REPLACE cannot overwrite a posted row unless a window
//   is open for that row's own company, and a voucher cannot move to another company
//   away from its lines' accounts or its entries.
// - Any other trigger on these tables, or whose SQL names them (TEMP triggers included),
//   is dropped at start-up and logged.
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
            AND NOT EXISTS (SELECT 1 FROM voucher_lines z WHERE z.voucher_id = ${newRow}.id AND z.debit_minor = 0 AND z.credit_minor = 0)
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
      BEGIN
        SELECT RAISE(ABORT, 'Ledger guard: a voucher must be saved as Draft and then posted, so the database can check that it balances.')
        WHERE NEW.status IN ('Posted', 'Reversed') AND NOT ${maintenanceOpen("NEW.company_id")};
        -- The window that matters is the one for the posted row being replaced.
        SELECT RAISE(ABORT, 'Ledger guard: a posted voucher cannot be replaced. Reverse it instead.')
        WHERE EXISTS (
          SELECT 1 FROM vouchers x
          WHERE (x.id = NEW.id OR (x.company_id = NEW.company_id AND x.voucher_number = NEW.voucher_number))
            AND x.status IN ('Posted', 'Reversed') AND NOT ${maintenanceOpen("x.company_id")}
        );
      END`,

    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_voucher_post
      BEFORE UPDATE OF status ON vouchers
      WHEN NEW.status IN ('Posted', 'Reversed') AND OLD.status NOT IN ('Posted', 'Reversed') AND NOT ${maintenanceOpen("NEW.company_id")}
      BEGIN
        SELECT RAISE(ABORT, 'Ledger guard: a voucher needs at least one line before it can be posted.')
        WHERE NOT EXISTS (SELECT 1 FROM voucher_lines WHERE voucher_id = NEW.id);
        SELECT RAISE(ABORT, 'Ledger guard: a deleted voucher cannot be posted.')
        WHERE COALESCE(NEW.is_deleted, 0) <> 0;
        SELECT RAISE(ABORT, 'Ledger guard: a voucher with deleted lines or ledger entries cannot be posted. Remove them first.')
        WHERE EXISTS (SELECT 1 FROM ledger_entries WHERE voucher_id = NEW.id AND COALESCE(is_deleted, 0) <> 0)
          OR EXISTS (SELECT 1 FROM voucher_lines WHERE voucher_id = NEW.id AND COALESCE(is_deleted, 0) <> 0);
        SELECT RAISE(ABORT, 'Ledger guard: every ledger entry must carry the voucher''s date. Posting was refused.')
        WHERE EXISTS (SELECT 1 FROM ledger_entries WHERE voucher_id = NEW.id AND entry_date IS NOT NEW.voucher_date);
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
            SELECT 1 FROM voucher_lines l LEFT JOIN accounts a ON a.id = l.account_id
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
        -- A voucher is marked Reversed only once its reversal is posted (for a rounding
        -- adjustment, the reversal of the voucher it corrects).
        SELECT RAISE(ABORT, 'Ledger guard: a voucher can be marked Reversed only after its reversal voucher is posted.')
        WHERE OLD.status = 'Posted' AND NEW.status = 'Reversed'
          AND NOT EXISTS (
            SELECT 1 FROM vouchers r
            WHERE r.source_module = '${VOUCHER_REVERSAL_SOURCE}' AND r.status = 'Posted' AND COALESCE(r.is_deleted, 0) = 0
              AND r.company_id = OLD.company_id
              AND (r.source_id = OLD.id OR (COALESCE(OLD.source_module, '') = '${ROUNDING_ADJUSTMENT_SOURCE}' AND r.source_id = OLD.source_id))
          );
      END`,

    // UPDATE OR REPLACE that moves any voucher onto a posted voucher's id or number would
    // delete the posted one without running the delete guard.
    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_voucher_replace
      BEFORE UPDATE OF id, company_id, voucher_number ON vouchers
      BEGIN
        SELECT RAISE(ABORT, 'Ledger guard: a posted voucher cannot be replaced. Reverse it instead.')
        WHERE EXISTS (
          SELECT 1 FROM vouchers x
          WHERE (x.id = NEW.id OR (x.company_id = NEW.company_id AND x.voucher_number = NEW.voucher_number))
            AND x.id <> OLD.id AND x.status IN ('Posted', 'Reversed') AND NOT ${maintenanceOpen("x.company_id")}
        );
        -- Even inside a window, a voucher cannot leave its lines' accounts or its entries
        -- in another company.
        SELECT RAISE(ABORT, 'Ledger guard: a voucher cannot move to another company while its lines or ledger entries belong to this one.')
        WHERE NEW.company_id IS NOT OLD.company_id
          AND (EXISTS (SELECT 1 FROM voucher_lines l JOIN accounts a ON a.id = l.account_id WHERE l.voucher_id = OLD.id AND a.company_id IS NOT NEW.company_id)
            OR EXISTS (SELECT 1 FROM ledger_entries e WHERE e.voucher_id = OLD.id AND e.company_id IS NOT NEW.company_id));
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
        WHERE (${lockedVoucher("NEW.voucher_id")} AND NOT ${maintenanceOpen(lineCompany("NEW.voucher_id"))})
          OR EXISTS (SELECT 1 FROM voucher_lines old WHERE old.id = NEW.id AND ${lockedVoucher("old.voucher_id")} AND NOT ${maintenanceOpen(lineCompany("old.voucher_id"))});
      END`,

    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_line_update
      BEFORE UPDATE ON voucher_lines
      BEGIN
        ${accountOfCompanyCheck("NEW.account_id", lineCompany("NEW.voucher_id"))}
        SELECT RAISE(ABORT, 'Ledger guard: lines of a posted voucher cannot be changed. Reverse the voucher instead.')
        WHERE ((${lockedVoucher("OLD.voucher_id")} OR ${lockedVoucher("NEW.voucher_id")})
            AND NOT (${maintenanceOpen(lineCompany("OLD.voucher_id"))} AND ${maintenanceOpen(lineCompany("NEW.voucher_id"))}))
          OR EXISTS (SELECT 1 FROM voucher_lines other WHERE other.id = NEW.id AND other.id <> OLD.id AND ${lockedVoucher("other.voucher_id")} AND NOT ${maintenanceOpen(lineCompany("other.voucher_id"))});
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
          OR (NOT ${maintenanceOpen("NEW.company_id")} AND ${lockedVoucher("NEW.voucher_id")})
          OR EXISTS (SELECT 1 FROM ledger_entries old WHERE old.id = NEW.id AND NOT ${maintenanceOpen("old.company_id")});
        SELECT RAISE(ABORT, 'Ledger guard: a ledger entry cannot be written already deleted.')
        WHERE COALESCE(NEW.is_deleted, 0) <> 0 AND NOT ${maintenanceOpen("NEW.company_id")};
      END`,

    `CREATE TRIGGER IF NOT EXISTS trg_ledger_guard_entry_update
      BEFORE UPDATE ON ledger_entries
      BEGIN
        SELECT RAISE(ABORT, 'Ledger guard: ledger entries cannot be changed. Post a reversal or correction voucher instead.')
        WHERE NOT (${maintenanceOpen("OLD.company_id")} AND ${maintenanceOpen("NEW.company_id")})
          OR EXISTS (SELECT 1 FROM ledger_entries other WHERE other.id = NEW.id AND other.id <> OLD.id AND NOT ${maintenanceOpen("other.company_id")});
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
  "INSERT INTO vouchers (id) SELECT id FROM vouchers WHERE 0",
  "UPDATE vouchers SET status = status, id = id, company_id = company_id, voucher_number = voucher_number WHERE 0",
  "DELETE FROM vouchers WHERE 0",
  "INSERT INTO voucher_lines (id) SELECT id FROM voucher_lines WHERE 0",
  "UPDATE voucher_lines SET id = id WHERE 0",
  "DELETE FROM voucher_lines WHERE 0",
  "INSERT INTO ledger_entries (id) SELECT id FROM ledger_entries WHERE 0",
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
// appear once; duplicate ids are ignored). Only the whole-book scope ("SELECT id FROM
// vouchers") runs fast without the guard indexes; a company or single-voucher scope needs
// them, which start-up creates before anything but ledgerDefectCount runs. The result is a WITH clause ending in a "checked" table with one row per
// scoped Posted or Reversed voucher:
//   line_debit_minor, line_credit_minor     totals of its lines
//   entry_debit_minor, entry_credit_minor   totals of its active ledger entries
//   bad_lines     lines without exactly one active entry with the line's account and
//                 amounts, whose account belongs to another company or is deleted, that
//                 is itself marked deleted, or whose paise (or its entry's) are not
//                 whole numbers
//   stray_entries active entries that name no line of this voucher, whose account or
//                 company is not the voucher's company, whose account is deleted, or
//                 whose date is not the voucher's date
//   mismatch      1 when any of the above disagree, or the voucher has no lines
// Every part is a grouped pass, so a whole-book report reads each table once.
export function voucherLedgerCheckSql(scopeSql) {
  return `
    WITH scope(id) AS (SELECT DISTINCT * FROM (${scopeSql})),
    sv AS (
      SELECT v.id, v.company_id, v.voucher_number, v.voucher_date, v.voucher_type, v.status, v.source_module, v.source_id
      FROM vouchers v JOIN scope ON scope.id = v.id
      WHERE COALESCE(v.is_deleted, 0) = 0 AND v.status IN ('Posted', 'Reversed')
    ),
    line_check AS (
      SELECT l.voucher_id, l.id, l.debit_minor, l.credit_minor,
        COUNT(e.id) entries,
        SUM(CASE WHEN e.account_id = l.account_id AND e.debit_minor = l.debit_minor AND e.credit_minor = l.credit_minor THEN 1 ELSE 0 END) matching,
        MAX(CASE WHEN a.company_id IS sv.company_id AND COALESCE(a.is_deleted, 0) = 0 THEN 0 ELSE 1 END) foreign_account,
        MAX(CASE WHEN COALESCE(l.is_deleted, 0) <> 0 OR typeof(l.debit_minor) <> 'integer' OR typeof(l.credit_minor) <> 'integer'
          OR typeof(e.debit_minor) NOT IN ('integer', 'null') OR typeof(e.credit_minor) NOT IN ('integer', 'null') THEN 1 ELSE 0 END) odd_line
      FROM voucher_lines l
      JOIN sv ON sv.id = l.voucher_id
      LEFT JOIN accounts a ON a.id = l.account_id
      LEFT JOIN ledger_entries e ON e.voucher_line_id = l.id AND COALESCE(e.is_deleted, 0) = 0
      GROUP BY l.id
    ),
    -- One row per voucher, line and entry, grouped once by voucher. No join of grouped
    -- results, which SQLite would read by scanning (minutes on a large company).
    parts AS (
      SELECT id voucher_id, 1 present, company_id, voucher_number, voucher_date, voucher_type, status, source_module, source_id,
        0 line_debit, 0 line_credit, 0 entry_debit, 0 entry_credit, 0 lines, 0 bad_line, 0 stray_entry
      FROM sv
      UNION ALL
      SELECT voucher_id, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        debit_minor, credit_minor, 0, 0, 1,
        CASE WHEN entries <> 1 OR matching <> 1 OR foreign_account = 1 OR odd_line = 1 THEN 1 ELSE 0 END, 0
      FROM line_check
      UNION ALL
      SELECT e.voucher_id, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        0, 0, e.debit_minor, e.credit_minor, 0, 0,
        CASE WHEN l.id IS NULL OR e.company_id IS NOT sv.company_id OR a.company_id IS NOT sv.company_id
          OR COALESCE(a.is_deleted, 0) <> 0 OR e.entry_date IS NOT sv.voucher_date THEN 1 ELSE 0 END
      FROM ledger_entries e
      JOIN sv ON sv.id = e.voucher_id
      LEFT JOIN voucher_lines l ON l.id = e.voucher_line_id AND l.voucher_id = e.voucher_id
      LEFT JOIN accounts a ON a.id = e.account_id
      WHERE COALESCE(e.is_deleted, 0) = 0
    ),
    grouped AS (
      SELECT voucher_id id, MAX(company_id) company_id, MAX(voucher_number) voucher_number, MAX(voucher_date) voucher_date,
        MAX(voucher_type) voucher_type, MAX(status) status, MAX(source_module) source_module, MAX(source_id) source_id,
        SUM(line_debit) line_debit_minor, SUM(line_credit) line_credit_minor,
        SUM(entry_debit) entry_debit_minor, SUM(entry_credit) entry_credit_minor,
        SUM(lines) lines, SUM(bad_line) bad_lines, SUM(stray_entry) stray_entries
      FROM parts GROUP BY voucher_id HAVING MAX(present) = 1
    ),
    checked AS (
      SELECT *,
        CASE WHEN line_debit_minor <> entry_debit_minor OR line_credit_minor <> entry_credit_minor
          OR bad_lines > 0 OR stray_entries > 0 OR lines = 0 THEN 1 ELSE 0 END mismatch
      FROM grouped
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
  // TEMP triggers live only on this connection but still fire on the main tables.
  const rows = [
    ...db.prepare("SELECT 'main' schema, name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger'").all(),
    ...db.prepare("SELECT 'temp' schema, name, tbl_name, sql FROM sqlite_temp_master WHERE type = 'trigger'").all()
  ];
  return rows
    .filter((row) => row.schema === "temp" || !LEDGER_GUARD_TRIGGERS.includes(row.name))
    .filter((row) => tables.has(String(row.tbl_name || "").toLowerCase()) || mentions.test(String(row.sql || "")))
    .map((row) => (row.schema === "temp" ? `temp.${row.name}` : row.name));
}

// Drops the triggers unexpectedLedgerTriggers lists. Start-up calls it before migrations,
// so a planted trigger never runs while the guards are off, and again with the guards.
export function dropUnexpectedLedgerTriggers(db) {
  const names = unexpectedLedgerTriggers(db);
  names.forEach((name) => {
    const temp = name.startsWith("temp.");
    const bare = temp ? name.slice(5) : name;
    db.exec(`DROP TRIGGER IF EXISTS ${temp ? "temp" : "main"}."${bare.replace(/"/g, '""')}"`);
  });
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

// Posted vouchers whose lines do not balance, or whose lines and ledger entries disagree
// (by voucherLedgerCheckSql). A rounding adjustment or one-sided reversal is left out only
// when it nets to zero with the original it names. Start-up runs migrations and seeding
// with the guards off, so the ids are taken before and after, and any new one is recorded.
// Returns null on a database that does not have the paise columns yet (an older copy
// before its upgrade). Grouped passes only, so it needs no index: it also runs before
// start-up has created the guard indexes on an older database. Originals already settled
// by a correction are still listed; only a new id matters.
export function ledgerDefectIds(db) {
  try {
    return db.prepare(`
      ${voucherLedgerCheckSql("SELECT id FROM vouchers")}
      SELECT c.id FROM checked c
      WHERE c.mismatch = 1
        OR (c.line_debit_minor <> c.line_credit_minor
          AND NOT (COALESCE(c.source_module, '') IN ('${ROUNDING_ADJUSTMENT_SOURCE}', '${VOUCHER_REVERSAL_SOURCE}')
            AND EXISTS (SELECT 1 FROM checked o WHERE o.id = c.source_id AND o.company_id = c.company_id
              AND (o.line_debit_minor - o.line_credit_minor) + (c.line_debit_minor - c.line_credit_minor) = 0)))
      ORDER BY c.id
    `).all().map((row) => row.id);
  } catch (error) {
    // An older database without the paise or line-link columns cannot be checked until
    // migrations add them; any other error is real.
    if (/no such column/i.test(String(error?.message))) return null;
    throw error;
  }
}

export function ledgerDefectCount(db) {
  const ids = ledgerDefectIds(db);
  return ids === null ? null : ids.length;
}
