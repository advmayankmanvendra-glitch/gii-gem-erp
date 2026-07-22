import { randomUUID } from "node:crypto";

const META_TABLE = "_meta";
const META_TABLE_DDL = `CREATE TABLE IF NOT EXISTS ${META_TABLE} (key TEXT PRIMARY KEY, value TEXT)`;

function ensureMetaTable(db) {
  db.exec(META_TABLE_DDL);
}

export function getMetaValue(db, key) {
  ensureMetaTable(db);
  const row = db.prepare(`SELECT value FROM ${META_TABLE} WHERE key = ?`).get(key);
  return row ? row.value : null;
}

export function setMetaValue(db, key, value) {
  ensureMetaTable(db);
  db.prepare(`INSERT OR REPLACE INTO ${META_TABLE} (key, value) VALUES (?, ?)`).run(key, String(value));
}

export function getOrCreateDatabaseId(db) {
  let dbId = getMetaValue(db, "database_id");
  if (!dbId) {
    dbId = randomUUID();
    setMetaValue(db, "database_id", dbId);
    setMetaValue(db, "database_created_at", new Date().toISOString());
  }
  return dbId;
}

export function getDatabaseIdentity(db) {
  return {
    databaseId: getOrCreateDatabaseId(db),
    createdAt: getMetaValue(db, "database_created_at"),
    environment: getMetaValue(db, "environment") || "development",
    schemaVersion: Number(getMetaValue(db, "schema_version") || 0),
    applicationVersion: getMetaValue(db, "application_version") || "",
    lastMigrationRun: getMetaValue(db, "last_migration_name") || "",
  };
}

export function setEnvironment(db, environment) {
  setMetaValue(db, "environment", environment);
}

export function setSchemaVersion(db, version) {
  setMetaValue(db, "schema_version", String(version));
}

export function setLastMigration(db, migrationName) {
  setMetaValue(db, "last_migration_name", migrationName);
}

export function setApplicationVersion(db, version) {
  setMetaValue(db, "application_version", version);
}
