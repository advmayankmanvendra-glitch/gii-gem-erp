import * as m from "../domain/money.js";

const SHADOW_COLUMNS = [
  { table: "voucher_lines",        legacy: "debit",           shadow: "debit_minor",           type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "voucher_lines",        legacy: "credit",          shadow: "credit_minor",          type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "ledger_entries",       legacy: "debit",           shadow: "debit_minor",           type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "ledger_entries",       legacy: "credit",          shadow: "credit_minor",          type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "ledger_entries",       legacy: "running_balance", shadow: "running_balance_minor", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "opening_balances",     legacy: "opening_debit",   shadow: "opening_debit_minor",   type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "opening_balances",     legacy: "opening_credit",  shadow: "opening_credit_minor",  type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "carry_forward_entries", legacy: "closing_balance", shadow: "closing_balance_minor", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "carry_forward_entries", legacy: "opening_debit",   shadow: "opening_debit_minor",   type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "carry_forward_entries", legacy: "opening_credit",  shadow: "opening_credit_minor",  type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "accounts",             legacy: "opening_balance", shadow: "opening_balance_minor", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "stock_ledger",         legacy: "value",           shadow: "value_minor",           type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "stock_ledger",         legacy: "running_value",   shadow: "running_value_minor",   type: "INTEGER NOT NULL DEFAULT 0" },
];

function hasColumn(db, tableName, columnName) {
  const row = db.prepare("SELECT COUNT(*) AS cnt FROM pragma_table_info(?) WHERE name = ?").get(tableName, columnName);
  return row.cnt > 0;
}

export function addShadowColumns(db) {
  const applied = [];
  for (const col of SHADOW_COLUMNS) {
    if (hasColumn(db, col.table, col.shadow)) continue;
    try {
      db.exec(`ALTER TABLE ${col.table} ADD COLUMN ${col.shadow} ${col.type}`);
      applied.push(col);
    } catch (e) {
      if (e.message && e.message.includes("no such table")) continue;
      throw e;
    }
  }
  return applied;
}

export function hasAllShadowColumns(db) {
  const existingTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  return SHADOW_COLUMNS
    .filter(col => existingTables.includes(col.table))
    .every(col => hasColumn(db, col.table, col.shadow));
}

export function backfillAll(db) {
  const results = [];
  for (const col of SHADOW_COLUMNS) {
    if (!hasColumn(db, col.table, col.shadow)) continue;
    try {
      const affected = db.prepare(`UPDATE ${col.table} SET ${col.shadow} = CAST(ROUND(${col.legacy} * ${m.MINOR_UNITS}) AS INTEGER) WHERE ${col.shadow} = 0 AND ${col.legacy} != 0`).run();
      results.push({ table: col.table, shadow: col.shadow, rowsUpdated: affected.changes });
    } catch (e) {
      if (e.message && e.message.includes("no such table")) continue;
      throw e;
    }
  }
  return results;
}

export function reconcile(db, tableName, legacyCol, shadowCol) {
  return db.prepare(`
    SELECT id, ${legacyCol} AS legacy, ${shadowCol} AS minor,
           CAST(ROUND(${legacyCol} * ${m.MINOR_UNITS}) AS INTEGER) - ${shadowCol} AS diff
    FROM ${tableName}
    WHERE ${shadowCol} != CAST(ROUND(${legacyCol} * ${m.MINOR_UNITS}) AS INTEGER)
  `).all();
}

export function reconcileAll(db) {
  const all = [];
  const existingTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  for (const col of SHADOW_COLUMNS) {
    if (!existingTables.includes(col.table)) continue;
    if (!hasColumn(db, col.table, col.shadow)) continue;
    try {
      const disagreements = reconcile(db, col.table, col.legacy, col.shadow);
      if (disagreements.length > 0) all.push({ ...col, disagreements });
    } catch (e) {
      if (e.message && e.message.includes("no such table")) continue;
      throw e;
    }
  }
  return all;
}

export function backfillSingleValue(db, tableName, id, shadowCol) {
  const colDef = SHADOW_COLUMNS.find(c => c.table === tableName && c.shadow === shadowCol);
  if (!colDef) throw new Error(`Unknown shadow column: ${tableName}.${shadowCol}`);
  const row = db.prepare(`SELECT ${colDef.legacy} AS legacy_val FROM ${tableName} WHERE id = ?`).get(id);
  if (!row) throw new Error(`Row not found: ${tableName}.id = ${id}`);
  const minorVal = m.parseMoneyToMinor(Number(row.legacy_val));
  db.prepare(`UPDATE ${tableName} SET ${shadowCol} = ? WHERE id = ?`).run(minorVal, id);
  return minorVal;
}

export { SHADOW_COLUMNS, hasColumn };
