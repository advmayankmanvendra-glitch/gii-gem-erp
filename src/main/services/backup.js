import fs from "node:fs";
import path from "node:path";
import { dbPath, ensureAppFolders, projectRoot } from "../database/init.js";

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
    throw new Error("Invalid backup path");
  }
  if (!fs.existsSync(resolved)) {
    throw new Error("Backup file not found");
  }
  return { backupFileName, resolved };
}

export function createBackup(root = projectRoot()) {
  ensureAppFolders(root);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const source = dbPath(root);
  if (!fs.existsSync(source)) {
    throw new Error(`Database file not found: ${source}`);
  }
  const target = path.join(root, "backups", `gii_gem_erp_${stamp}.db`);
  fs.copyFileSync(source, target);
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
  return fs.readdirSync(path.join(root, "backups"))
    .filter((file) => file.endsWith(".db"))
    .sort()
    .reverse();
}

export function restoreBackup(fileName, root = projectRoot()) {
  ensureAppFolders(root);
  const { resolved } = backupPathFromName(fileName, root);
  const target = dbPath(root);
  [`${target}-wal`, `${target}-shm`].forEach(removeIfExistsWithRetry);
  fs.copyFileSync(resolved, target);
  [`${target}-wal`, `${target}-shm`].forEach(removeIfExistsWithRetry);
  return true;
}

export function preparePendingRestore(fileName, root = projectRoot()) {
  ensureAppFolders(root);
  const { backupFileName, resolved } = backupPathFromName(fileName, root);
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
  if (!fs.existsSync(pendingDb) || !fs.existsSync(pendingJson)) return null;
  [`${target}-wal`, `${target}-shm`].forEach(removeIfExistsWithRetry);
  fs.copyFileSync(pendingDb, target);
  [`${target}-wal`, `${target}-shm`].forEach(removeIfExistsWithRetry);
  const metadata = JSON.parse(fs.readFileSync(pendingJson, "utf8"));
  fs.rmSync(pendingDb, { force: true });
  fs.rmSync(pendingJson, { force: true });
  return { restored: true, ...metadata };
}
