import crypto from "node:crypto";
import { getMetaValue, setMetaValue, setSchemaVersion, setLastMigration } from "./databaseIdentity.js";

const SCHEMA_VERSION_KEY = "schema_version";
const CURRENT_SCHEMA_VERSION = 1;

const MIGRATIONS_TABLE = "schema_migrations";
const MIGRATIONS_TABLE_DDL = `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  migration_name TEXT NOT NULL UNIQUE,
  migration_checksum TEXT NOT NULL DEFAULT '',
  application_version TEXT NOT NULL DEFAULT '',
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  execution_duration INTEGER NOT NULL DEFAULT 0,
  successful INTEGER NOT NULL DEFAULT 1
)`;

function ensureTable(db) {
  db.exec(MIGRATIONS_TABLE_DDL);
}

function appliedMigrations(db) {
  ensureTable(db);
  return db.prepare(`SELECT migration_name, migration_checksum FROM ${MIGRATIONS_TABLE} WHERE successful = 1 ORDER BY id`).all();
}

function isApplied(db, name) {
  const row = db.prepare(`SELECT id FROM ${MIGRATIONS_TABLE} WHERE migration_name = ? AND successful = 1`).get(name);
  return !!row;
}

function recordMigration(db, name, checksum, duration, appVersion) {
  db.prepare(`INSERT OR REPLACE INTO ${MIGRATIONS_TABLE} (migration_name, migration_checksum, application_version, execution_duration, successful) VALUES (?, ?, ?, ?, 1)`).run(name, checksum, appVersion, duration);
}

function markFailed(db, name) {
  db.prepare(`UPDATE ${MIGRATIONS_TABLE} SET successful = 0 WHERE migration_name = ?`).run(name);
}

export function getCurrentSchemaVersion(db) {
  return Number(getMetaValue(db, SCHEMA_VERSION_KEY) || 0);
}

export function createMigration(options) {
  const { name, up, checksum } = options;
  return { name, up, checksum };
}

export function runMigrations(db, migrations, appVersion = "") {
  ensureTable(db);
  const applied = appliedMigrations(db);
  const pending = migrations.filter((m) => !applied.some((a) => a.migration_name === m.name));

  if (pending.length === 0) {
    return { ran: 0, names: [] };
  }

  const results = [];

  for (const migration of pending) {
    const checksum = migration.checksum || crypto.createHash("sha256").update(migration.up.toString()).digest("hex").slice(0, 16);
    const existing = applied.find((a) => a.migration_name === migration.name);

    if (existing && existing.migration_checksum && existing.migration_checksum !== checksum) {
      throw new Error(`Migration checksum mismatch for ${migration.name}: expected ${existing.migration_checksum}, got ${checksum}`);
    }

    const start = Date.now();
    try {
      migration.up(db);
      const duration = Date.now() - start;
      recordMigration(db, migration.name, checksum, duration, appVersion);
      results.push({ name: migration.name, success: true, duration });
    } catch (err) {
      markFailed(db, migration.name);
      results.push({ name: migration.name, success: false, error: err.message });
      throw err;
    }
  }

  setSchemaVersion(db, CURRENT_SCHEMA_VERSION);
  if (pending.length > 0) {
    setLastMigration(db, pending[pending.length - 1].name);
  }

  return { ran: results.filter((r) => r.success).length, names: results.map((r) => r.name) };
}

export function getPendingMigrations(db, migrations) {
  const applied = appliedMigrations(db);
  return migrations.filter((m) => !applied.some((a) => a.migration_name === m.name));
}
