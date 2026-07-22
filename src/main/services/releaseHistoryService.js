import { getMetaValue, setMetaValue, getOrCreateDatabaseId } from "../database/databaseIdentity.js";

const RELEASE_TABLE = "application_release_history";
const RELEASE_TABLE_DDL = `CREATE TABLE IF NOT EXISTS ${RELEASE_TABLE} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  release_id TEXT NOT NULL UNIQUE,
  application_version TEXT NOT NULL,
  release_channel TEXT NOT NULL DEFAULT 'stable',
  git_commit TEXT NOT NULL DEFAULT '',
  changed_modules TEXT NOT NULL DEFAULT '[]',
  fixed_issues TEXT NOT NULL DEFAULT '[]',
  database_migrations TEXT NOT NULL DEFAULT '[]',
  minimum_previous_version TEXT NOT NULL DEFAULT '',
  minimum_schema INTEGER NOT NULL DEFAULT 0,
  target_schema INTEGER NOT NULL DEFAULT 0,
  backup_required INTEGER NOT NULL DEFAULT 1,
  rollback_instructions TEXT NOT NULL DEFAULT '',
  known_issues TEXT NOT NULL DEFAULT '[]',
  verification_results TEXT NOT NULL DEFAULT '[]',
  installed_at TEXT NOT NULL DEFAULT (datetime('now')),
  installed_by TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
)`;

function ensureTable(db) {
  db.exec(RELEASE_TABLE_DDL);
}

export function getReleaseHistory(db) {
  ensureTable(db);
  return db.prepare(`SELECT * FROM ${RELEASE_TABLE} ORDER BY installed_at DESC`).all();
}

export function getLatestRelease(db) {
  ensureTable(db);
  return db.prepare(`SELECT * FROM ${RELEASE_TABLE} ORDER BY installed_at DESC LIMIT 1`).get() || null;
}

export function recordRelease(db, entry) {
  ensureTable(db);
  const releaseId = entry.release_id || `release-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(`INSERT OR REPLACE INTO ${RELEASE_TABLE} (
    release_id, application_version, release_channel, git_commit,
    changed_modules, fixed_issues, database_migrations,
    minimum_previous_version, minimum_schema, target_schema,
    backup_required, rollback_instructions, known_issues,
    verification_results, installed_by, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    releaseId,
    entry.application_version || "",
    entry.release_channel || "stable",
    entry.git_commit || "",
    JSON.stringify(entry.changed_modules || []),
    JSON.stringify(entry.fixed_issues || []),
    JSON.stringify(entry.database_migrations || []),
    entry.minimum_previous_version || "",
    entry.minimum_schema || 0,
    entry.target_schema || 0,
    entry.backup_required !== false ? 1 : 0,
    entry.rollback_instructions || "",
    JSON.stringify(entry.known_issues || []),
    JSON.stringify(entry.verification_results || []),
    entry.installed_by || "",
    entry.notes || ""
  );
  return releaseId;
}

export function getSystemInformation(db) {
  ensureTable(db);
  const latest = getLatestRelease(db);
  return {
    applicationVersion: latest?.application_version || getMetaValue(db, "application_version") || "",
    schemaVersion: Number(getMetaValue(db, "schema_version") || 0),
    releaseChannel: latest?.release_channel || process.env.GII_GEM_ERP_RELEASE_CHANNEL || "stable",
    gitCommit: latest?.git_commit || "",
    databaseId: getOrCreateDatabaseId(db),
    environment: getMetaValue(db, "environment") || "development",
    lastUpdateDate: latest?.installed_at || "",
    lastSuccessfulBackup: "",
    pendingMigrationStatus: "none",
  };
}
