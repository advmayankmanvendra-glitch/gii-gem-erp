// Locks on the supplier return-receipts record (stock_return_receipts, migration 039):
// a trigger that refuses any update to a recorded row, and two indexes (one unique, so a
// return records each receipt once). One definition serves the migration, the check made
// on every start, and the money integrity check in Health Center.

export const RETURN_RECEIPTS_MIGRATION = "039_stock_return_receipts";
const TABLE = "stock_return_receipts";
const LOCK = "trg_stock_return_receipts_no_update";
const LOCK_SQL = `CREATE TRIGGER trg_stock_return_receipts_no_update BEFORE UPDATE ON stock_return_receipts
  BEGIN SELECT RAISE(ABORT, 'A supplier return''s recorded receipts cannot be changed.'); END`;
// Every trigger the app defines on or naming the table. Any other is removed at start-up.
export const RETURN_RECEIPTS_TRIGGERS = Object.freeze([LOCK]);
const TRIGGERS = Object.freeze([{ name: LOCK, sql: LOCK_SQL }]);
const INDEXES = Object.freeze([
  { name: "idx_stock_return_receipts_return", unique: false, sql: "CREATE INDEX idx_stock_return_receipts_return ON stock_return_receipts(stock_return_id)" },
  { name: "idx_stock_return_receipts_unique", unique: true, sql: "CREATE UNIQUE INDEX idx_stock_return_receipts_unique ON stock_return_receipts(stock_return_id, stock_ledger_id)" }
]);

const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;
const ifNotExists = (sql) => sql.replace(/^CREATE (UNIQUE )?(INDEX|TRIGGER) /, "CREATE $1$2 IF NOT EXISTS ");
const normalized = (sql) => String(sql || "").replace(/\s+/g, " ").replace(/\s*([(),;])\s*/g, "$1").trim().toLowerCase();
const mentionsTable = /\bstock_return_receipts\b/i;

function duplicateRows(db) {
  return db.prepare(`SELECT stock_return_id, stock_ledger_id, COUNT(*) copies FROM stock_return_receipts
    GROUP BY stock_return_id, stock_ledger_id HAVING COUNT(*) > 1 ORDER BY stock_return_id, stock_ledger_id`).all();
}

// Index, table and view names share one namespace (triggers have their own), so only those
// can stand in an index's way. The index of that name, if any, comes first.
function holderOf(db, name) {
  return db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('index', 'table', 'view') AND name = ? COLLATE NOCASE
    ORDER BY CASE type WHEN 'index' THEN 0 ELSE 1 END LIMIT 1`).get(name);
}

// Migration 039: make the locks if they are not there. The unique index is left to the
// start-up check when the file already holds duplicate rows, so the migration never fails.
export function createReturnReceiptLocks(db) {
  TRIGGERS.forEach((t) => db.exec(`${ifNotExists(t.sql)};`));
  const clean = !duplicateRows(db).length;
  INDEXES.filter((index) => !index.unique || clean).forEach((index) => {
    if (!holderOf(db, index.name)) db.exec(index.sql);
  });
}

// What is wrong with the locks now, without changing anything. Empty lists and
// table "table" mean all is in place (or 039 has not run yet: table null, nothing expected).
export function returnReceiptLockProblems(db) {
  const holder = db.prepare(`SELECT type FROM sqlite_master WHERE type IN ('table', 'view') AND name = ? COLLATE NOCASE`).get(TABLE);
  const applied = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get()
    && db.prepare("SELECT 1 FROM schema_migrations WHERE migration_name = ?").get(RETURN_RECEIPTS_MIGRATION));
  const problems = { table: holder ? holder.type : null, expected: applied, strayTriggers: [], locks: [], nameConflicts: [], duplicates: [] };
  if (!holder || holder.type !== "table") return problems;
  const allowed = new Set(RETURN_RECEIPTS_TRIGGERS.map((name) => name.toLowerCase()));
  for (const t of db.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger'").all()) {
    if (allowed.has(t.name.toLowerCase())) continue;
    if (String(t.tbl_name).toLowerCase() === TABLE || mentionsTable.test(String(t.sql || ""))) problems.strayTriggers.push(t.name);
  }
  for (const want of TRIGGERS) {
    const have = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name = ? COLLATE NOCASE").get(want.name);
    if (!have || normalized(have.sql) !== normalized(want.sql)) problems.locks.push({ name: want.name, kind: "trigger", state: have ? "altered" : "missing", holder: have ? have.name : null });
  }
  for (const want of INDEXES) {
    const have = holderOf(db, want.name);
    if (have && have.type === "index" && normalized(have.sql) === normalized(want.sql)) continue;
    if (have && have.type === "table") { problems.nameConflicts.push({ name: have.name, type: have.type }); continue; }
    problems.locks.push({ name: want.name, kind: "index", unique: want.unique, state: have ? "altered" : "missing", holder: have ? { name: have.name, type: have.type } : null });
  }
  if (problems.locks.some((lock) => lock.unique)) problems.duplicates = duplicateRows(db);
  return problems;
}

export function returnReceiptLocksOk(problems) {
  if (!problems.expected && !problems.table) return true;
  return problems.table === "table" && !problems.strayTriggers.length && !problems.locks.length && !problems.nameConflicts.length && !problems.duplicates.length;
}

// Writes an entry under `action` only when its value differs from the last entry of that
// action (no entry counts as `clear`), so a standing problem is logged once, its clearing is
// logged, and a problem that comes back is logged again.
function logStateChange(db, auditLog, action, value, clear) {
  const last = db.prepare("SELECT new_value FROM audit_log WHERE action = ? ORDER BY id DESC LIMIT 1").get(action);
  const text = JSON.stringify(value);
  if ((last ? last.new_value : JSON.stringify(clear)) !== text) auditLog(db, { action, table_name: TABLE, new_value: text });
}

// Called on every start, after migrations and the ledger guards. Puts back missing or altered
// locks, removes stray triggers, and logs each repair. Duplicate rows, or a table holding an
// index's name, leave that index off and are logged (once per change) instead of stopping
// the start; a missing table is logged the same way.
export function ensureReturnReceiptLocks(db, auditLog) {
  const before = returnReceiptLockProblems(db);
  if (before.expected || before.table) {
    const table = before.table === "table" ? "table" : before.table;
    logStateChange(db, auditLog, "stock_return_receipts_table_missing", { found: table }, { found: "table" });
    if (table !== "table") console.error("Return-receipts check: the record's table is missing from this file; supplier returns cannot be posted.");
  }
  if (before.table !== "table") return before;
  const repaired = db.transaction(() => {
    const done = { triggersRemoved: [], locksRestored: [] };
    before.strayTriggers.forEach((name) => { db.exec(`DROP TRIGGER ${quote(name)}`); done.triggersRemoved.push(name); });
    for (const lock of before.locks) {
      if (lock.kind === "trigger") {
        if (lock.holder) db.exec(`DROP TRIGGER ${quote(lock.holder)}`);
        db.exec(TRIGGERS.find((t) => t.name === lock.name).sql);
      } else {
        if (lock.unique && before.duplicates.length) continue;
        if (lock.holder) db.exec(`DROP ${lock.holder.type === "view" ? "VIEW" : "INDEX"} ${quote(lock.holder.name)}`);
        db.exec(INDEXES.find((index) => index.name === lock.name).sql);
      }
      done.locksRestored.push({ name: lock.name, was: lock.state, ...(lock.holder && lock.holder.type === "view" ? { replacedView: lock.holder.name } : {}) });
    }
    return done;
  })();
  if (repaired.triggersRemoved.length || repaired.locksRestored.length) {
    console.error("Return-receipts check: the record's locks were missing or altered in this file and have been put back.");
    auditLog(db, { action: "stock_return_receipts_locks_restored", table_name: TABLE, new_value: JSON.stringify(repaired) });
  }
  const blocked = { duplicates: before.duplicates, nameConflicts: before.nameConflicts };
  if (blocked.duplicates.length || blocked.nameConflicts.length) {
    console.error("Return-receipts check: this file holds duplicate recorded rows or a conflicting name; the unique lock is off until they are cleared.");
  }
  logStateChange(db, auditLog, "stock_return_receipts_lock_blocked", blocked, { duplicates: [], nameConflicts: [] });
  return returnReceiptLockProblems(db);
}
