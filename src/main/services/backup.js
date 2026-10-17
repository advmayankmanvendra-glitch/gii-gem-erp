import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { dbPath, ensureAppFolders, projectRoot } from "../database/init.js";

const require = createRequire(import.meta.url);
const SQLITE_HEADER = "SQLite format 3\u0000";
// A file must contain these tables to be accepted as a GII GeM ERP database.
const REQUIRED_ERP_TABLES = ["companies", "users", "accounts", "vouchers", "ledger_entries", "suppliers", "schema_migrations"];

export class BackupValidationError extends Error {
  constructor(message) { super(message); this.name = "BackupValidationError"; }
}

// Checks a candidate backup before it is allowed anywhere near the live database:
// SQLite header, a clean integrity check, and the ERP's own tables.
export function validateBackupFile(file, label = path.basename(String(file || ""))) {
  const reject = (reason) => {
    throw new BackupValidationError(`Restore refused: backup "${label}" ${reason} The live database was not changed. Choose another backup from Settings > Backup & Restore.`);
  };
  if (!fs.existsSync(file)) reject("was not found.");
  const size = fs.statSync(file).size;
  if (!size) reject("is empty (0 bytes).");
  const fd = fs.openSync(file, "r");
  const header = Buffer.alloc(16);
  try { fs.readSync(fd, header, 0, 16, 0); } finally { fs.closeSync(fd); }
  if (header.toString("latin1") !== SQLITE_HEADER) reject("is not a valid SQLite database file.");
  let probe;
  try {
    const Database = require("better-sqlite3");
    probe = new Database(file, { readonly: true, fileMustExist: true });
    const integrity = probe.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") reject(`is damaged (integrity check: ${integrity}).`);
    const tables = new Set(probe.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
    const missing = REQUIRED_ERP_TABLES.filter((table) => !tables.has(table));
    if (missing.length) reject(`is not a GII GeM ERP database (missing tables: ${missing.join(", ")}).`);
  } catch (error) {
    if (error instanceof BackupValidationError) throw error;
    reject(`could not be opened (${error.message}); it may be corrupt or truncated.`);
  } finally {
    try { probe?.close(); } catch { /* already closed */ }
  }
  return { ok: true, size };
}

// Copies a validated file over the live database through a temp file, keeping a
// safety copy of the current database so a failed copy can be undone.
function replaceLiveDatabase(source, root) {
  const target = dbPath(root);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const temp = `${target}.restore-tmp`;
  const safety = path.join(root, "backups", `pre_restore_${stamp}.db`);
  fs.copyFileSync(source, temp);
  validateBackupFile(temp, path.basename(source));
  if (fs.existsSync(target)) fs.copyFileSync(target, safety);
  [`${target}-wal`, `${target}-shm`].forEach(removeIfExistsWithRetry);
  try {
    fs.renameSync(temp, target);
  } catch (error) {
    fs.copyFileSync(temp, target);
    fs.rmSync(temp, { force: true });
    if (error && !["EXDEV", "EPERM", "EBUSY"].includes(error.code)) throw error;
  }
  [`${target}-wal`, `${target}-shm`].forEach(removeIfExistsWithRetry);
  return { safetyBackup: fs.existsSync(safety) ? path.basename(safety) : null };
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeIfExistsWithRetry(file) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      if (fs.existsSync(file)) fs.rmSync(file, { force: true });
      return;
    } catch (error) {
      if (!["EBUSY", "EPERM"].includes(error.code) || attempt === 9) throw error;
      sleepSync(150);
    }
  }
}

function backupPathFromName(fileName, root) {
  const backupFileName = typeof fileName === "string" ? fileName : fileName?.fileName || fileName?.name;
  const resolved = path.resolve(path.join(root, "backups", backupFileName || ""));
  const backupRoot = path.resolve(path.join(root, "backups"));
  if (resolved !== backupRoot && !resolved.startsWith(`${backupRoot}${path.sep}`)) {
    throw new BackupValidationError("Restore refused: invalid backup path. Pick a backup from the list in Settings > Backup & Restore.");
  }
  if (!fs.existsSync(resolved)) {
    throw new BackupValidationError(`Restore refused: backup "${backupFileName}" was not found in the backups folder.`);
  }
  return { backupFileName, resolved };
}

// Synchronous backup. When the live connection is passed, the WAL is checkpointed
// and VACUUM INTO writes a consistent copy that includes every committed write.
export function createBackup(root = projectRoot(), db = null, prefix = "gii_gem_erp") {
  ensureAppFolders(root);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const source = dbPath(root);
  if (!fs.existsSync(source)) {
    throw new Error(`Database file not found: ${source}`);
  }
  const target = path.join(root, "backups", `${prefix}_${stamp}.db`);
  if (db && db.open) {
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.prepare("VACUUM INTO ?").run(target);
  } else {
    fs.copyFileSync(source, target);
  }
  if (!fs.existsSync(target)) {
    throw new Error("Backup file was not created");
  }
  const stats = fs.statSync(target);
  if (!stats.size) {
    throw new Error("Backup file is empty");
  }
  return {
    fileName: path.basename(target),
    path: target,
    size: stats.size,
    createdAt: stats.mtime.toISOString()
  };
}

export async function createLiveBackup(db, root = projectRoot()) {
  ensureAppFolders(root);
  if (!db || typeof db.backup !== "function") {
    return createBackup(root);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(root, "backups", `gii_gem_erp_${stamp}.db`);
  db.pragma("wal_checkpoint(FULL)");
  await db.backup(target);
  if (!fs.existsSync(target)) {
    throw new Error("Backup file was not created");
  }
  const stats = fs.statSync(target);
  if (!stats.size) {
    throw new Error("Backup file is empty");
  }
  return {
    fileName: path.basename(target),
    path: target,
    size: stats.size,
    createdAt: stats.mtime.toISOString()
  };
}

export function listBackups(root = projectRoot()) {
  ensureAppFolders(root);
  const folder = path.join(root, "backups");
  return fs.readdirSync(folder)
    .filter((file) => file.endsWith(".db"))
    .map((file) => ({ file, time: fs.statSync(path.join(folder, file)).mtimeMs }))
    .sort((a, b) => b.time - a.time || b.file.localeCompare(a.file))
    .map((row) => row.file);
}

// The caller must close its connection to the live database first.
export function restoreBackup(fileName, root = projectRoot()) {
  ensureAppFolders(root);
  const { backupFileName, resolved } = backupPathFromName(fileName, root);
  validateBackupFile(resolved, backupFileName);
  const result = replaceLiveDatabase(resolved, root);
  return { restored: true, backupFileName, ...result };
}

export function preparePendingRestore(fileName, root = projectRoot()) {
  ensureAppFolders(root);
  const { backupFileName, resolved } = backupPathFromName(fileName, root);
  validateBackupFile(resolved, backupFileName);
  const pendingDb = path.join(root, "database", "pending_restore.db");
  const pendingJson = path.join(root, "database", "pending_restore.json");
  fs.copyFileSync(resolved, pendingDb);
  fs.writeFileSync(pendingJson, JSON.stringify({
    backupFileName,
    preparedAt: new Date().toISOString()
  }, null, 2));
  return { pendingRestart: true, backupFileName };
}

export function applyPendingRestore(root = projectRoot()) {
  ensureAppFolders(root);
  const target = dbPath(root);
  const pendingDb = path.join(root, "database", "pending_restore.db");
  const pendingJson = path.join(root, "database", "pending_restore.json");
  if (!fs.existsSync(pendingDb) && !fs.existsSync(pendingJson)) return null;
  const clearPending = () => {
    fs.rmSync(pendingDb, { force: true });
    fs.rmSync(pendingJson, { force: true });
  };
  if (!fs.existsSync(pendingDb) || !fs.existsSync(pendingJson)) {
    clearPending();
    return null;
  }
  let metadata = {};
  try { metadata = JSON.parse(fs.readFileSync(pendingJson, "utf8")); } catch { metadata = {}; }
  try {
    validateBackupFile(pendingDb, metadata.backupFileName || "pending restore");
  } catch (error) {
    clearPending();
    throw error;
  }
  const result = replaceLiveDatabase(pendingDb, root);
  clearPending();
  return { restored: true, ...metadata, ...result };
}
