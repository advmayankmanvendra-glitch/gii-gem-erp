import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { dataRoot, databasePath, dbName, appDataFolders } from "../database/databasePathResolver.js";
import { getMetaValue } from "../database/databaseIdentity.js";

const BACKUP_DIR = "backups";
const PRE_MIGRATION_DIR = "pre-migration";

function ensureBackupDir(subDir) {
  const dir = path.join(dataRoot(), BACKUP_DIR, subDir || "");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function createBackup(options = {}) {
  const { label = "", appVersion = "", schemaVersion = "", db: sourceDb } = options;
  const backupDir = ensureBackupDir(label || "manual");
  const backupName = `${dbName()}.backup-${timestamp()}${label ? `-${label}` : ""}`;
  const backupPath = path.join(backupDir, backupName);

  if (sourceDb) {
    sourceDb.exec("PRAGMA wal_checkpoint(FULL)");
    const backupMeta = sourceDb.backup(backupPath);
    backupMeta.step(-1);
    backupMeta.close();
  } else {
    fs.copyFileSync(databasePath(), backupPath);
  }

  const meta = {
    backupPath,
    createdAt: new Date().toISOString(),
    label: label || "manual",
    applicationVersion: appVersion || "",
    schemaVersion: schemaVersion || String(schemaVersion || ""),
    databaseId: sourceDb ? (getMetaValue(sourceDb, "database_id") || "") : "",
    fileSize: fs.statSync(backupPath).size,
  };

  const metaPath = backupPath + ".meta.json";
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  return meta;
}

export function createPreMigrationBackup(db, appVersion) {
  const schemaVersion = getMetaValue(db, "schema_version") || "0";
  return createBackup({ label: PRE_MIGRATION_DIR, appVersion, schemaVersion, db });
}

export function listBackups(options = {}) {
  const { label } = options;
  const backupDir = ensureBackupDir(label || "");
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir)
    .filter((f) => f.endsWith(".db"))
    .map((f) => {
      const fullPath = path.join(backupDir, f);
      const metaPath = fullPath + ".meta.json";
      let meta = {};
      if (fs.existsSync(metaPath)) {
        try { meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")); } catch {}
      }
      return {
        name: f,
        path: fullPath,
        size: fs.statSync(fullPath).size,
        createdAt: meta.createdAt || fs.statSync(fullPath).mtime.toISOString(),
        label: meta.label || "",
        applicationVersion: meta.applicationVersion || "",
        schemaVersion: meta.schemaVersion || "",
        databaseId: meta.databaseId || "",
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function verifyBackupIntegrity(backupPath) {
  try {
    const verifier = new Database(backupPath, { readonly: true, fileMustExist: true });
    const result = verifier.pragma("integrity_check");
    verifier.close();
    const ok = result && result[0] && result[0].integrity_check === "ok";
    return { valid: ok, message: ok ? "ok" : result[0]?.integrity_check || "unknown" };
  } catch (err) {
    return { valid: false, message: err.message };
  }
}

export function restoreBackup(backupPath, targetPath) {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }
  const integrity = verifyBackupIntegrity(backupPath);
  if (!integrity.valid) {
    throw new Error(`Backup integrity check failed: ${integrity.message}`);
  }
  const targetDir = path.dirname(targetPath);
  fs.mkdirSync(targetDir, { recursive: true });
  const walPath = targetPath + "-wal";
  const shmPath = targetPath + "-shm";
  [targetPath, walPath, shmPath].forEach((p) => { try { fs.unlinkSync(p); } catch {} });
  fs.copyFileSync(backupPath, targetPath);
  return { restored: targetPath, fromBackup: backupPath };
}

export function enforceBackupRetention(maxBackups) {
  const allBackups = listBackups();
  if (allBackups.length <= maxBackups) return { removed: 0 };
  const toRemove = allBackups.slice(maxBackups);
  toRemove.forEach((b) => {
    try { fs.unlinkSync(b.path); } catch {}
    try { fs.unlinkSync(b.path + ".meta.json"); } catch {}
  });
  return { removed: toRemove.length };
}
