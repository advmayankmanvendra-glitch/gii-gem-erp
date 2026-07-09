/** Quotes a trusted SQLite identifier after validating its shape. */
function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

/** Returns true when a table contains the requested column. */
function columnExists(db, table, column) {
  const rows = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all();
  return rows.some((row) => row.name === column);
}

/** Returns user-defined SQLite tables that may hold foreign keys. */
function getUserTables(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);
}

/** Returns active and soft-deleted child rows that still block a hard delete. */
export function getChildReferences(db, parentTable, id) {
  const parentId = Number(id);
  if (!Number.isFinite(parentId)) return [];
  const result = [];
  for (const childTable of getUserTables(db)) {
    const fkList = db
      .prepare('SELECT p."from" AS child_col FROM pragma_foreign_key_list(?) p WHERE p."table" = ?')
      .all(childTable, parentTable);
    for (const fk of fkList) {
      if (!columnExists(db, childTable, fk.child_col)) continue;
      const quotedChildTable = quoteIdentifier(childTable);
      const quotedChildColumn = quoteIdentifier(fk.child_col);
      const row = db.prepare(`SELECT COUNT(*) cnt FROM ${quotedChildTable} WHERE ${quotedChildColumn} = ?`).get(parentId);
      const count = Number(row?.cnt || 0);
      if (count > 0) {
        result.push({ childTable, childColumn: fk.child_col, count });
      }
    }
  }
  return result;
}

/** Throws a readable blocker when a record is still referenced by child rows. */
export function assertDeleteSafe(db, parentTable, id) {
  const refs = getChildReferences(db, parentTable, id);
  if (refs.length === 0) return true;
  const detail = refs.map((r) => `${r.count} row(s) in ${r.childTable}(${r.childColumn})`).join("; ");
  throw new Error(`Cannot delete: ${parentTable} #${id} is referenced by ${detail}`);
}

/** Returns active and soft-deleted child rows that still block a bulk hard delete. */
export function getBulkChildReferences(db, parentTable, ids) {
  const idArr = (Array.isArray(ids) ? ids : [ids]).map((id) => Number(id)).filter(Number.isFinite);
  if (idArr.length === 0) return [];
  const idSet = new Set(idArr);
  const placeholders = idArr.map(() => "?").join(",");
  const result = [];
  for (const childTable of getUserTables(db)) {
    const fkList = db
      .prepare('SELECT p."from" AS child_col FROM pragma_foreign_key_list(?) p WHERE p."table" = ?')
      .all(childTable, parentTable);
    for (const fk of fkList) {
      if (!columnExists(db, childTable, fk.child_col)) continue;
      const quotedChildTable = quoteIdentifier(childTable);
      const quotedChildColumn = quoteIdentifier(fk.child_col);
      const rows = db
        .prepare(
          `SELECT ${quotedChildColumn} as parent_id, COUNT(*) as cnt FROM ${quotedChildTable} WHERE ${quotedChildColumn} IN (${placeholders}) GROUP BY ${quotedChildColumn}`,
        )
        .all(...idArr);
      for (const row of rows) {
        const parentId = Number(row.parent_id);
        if (idSet.has(parentId)) {
          result.push({ childTable, childColumn: fk.child_col, parentId, count: Number(row.cnt) });
        }
      }
    }
  }
  return result;
}

/** Throws a readable blocker when any bulk-delete record is still referenced. */
export function assertBulkDeleteSafe(db, parentTable, ids) {
  const idArr = (Array.isArray(ids) ? ids : [ids]).map((id) => Number(id)).filter(Number.isFinite);
  if (idArr.length === 0) return true;
  const refs = getBulkChildReferences(db, parentTable, idArr);
  if (refs.length === 0) return true;
  const detail = refs.map((r) => `${r.count} row(s) in ${r.childTable} referencing #${r.parentId}`).join("; ");
  throw new Error(`Cannot delete: ${idArr.length} ${parentTable} record(s) are referenced - ${detail}`);
}
