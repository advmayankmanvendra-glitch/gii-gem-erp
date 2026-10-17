import fs from "node:fs";
import path from "node:path";
import { createBackup, restoreBackup, listBackups, validateBackupFile } from "../backup.js";

export function createGoLiveBackup(runtimeRoot, db = null) {
  const backup = createBackup(runtimeRoot, db, "pre_golive");
  const backupDir = path.join(runtimeRoot, "backups");
  const markerPath = path.join(backupDir, `${path.basename(backup.fileName, ".db")}.golive`);
  fs.writeFileSync(markerPath, JSON.stringify({
    type: "go-live-backup",
    createdAt: new Date().toISOString(),
    originalName: backup.fileName
  }));
  return {
    ...backup,
    markerPath,
    validated: false
  };
}

export function validateBackup(backupInfo) {
  const filePath = backupInfo.path || backupInfo.fileName;
  if (!filePath) return { valid: false, reason: "No file path provided" };
  if (!fs.existsSync(filePath)) return { valid: false, reason: `Backup file not found: ${filePath}` };
  const stats = fs.statSync(filePath);
  if (stats.size === 0) return { valid: false, reason: "Backup file is empty" };
  try {
    validateBackupFile(filePath);
  } catch (error) {
    return { valid: false, reason: error.message };
  }
  return {
    valid: true,
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    checksum: stats.size.toString()
  };
}

export function executeAutoRollback(runtimeRoot, goLiveEntry, reason) {
  try {
    const backupId = goLiveEntry?.backup?.fileName || goLiveEntry?.backup?.path;
    const backups = listBackups(runtimeRoot);
    let targetBackup = backupId;
    if (!targetBackup || !backups.includes(targetBackup)) {
      targetBackup = backups[0];
    }
    if (!targetBackup) {
      return { success: false, reason: "No backup available for rollback", goLiveEntry };
    }
    const pendingFile = path.join(runtimeRoot, "database", "pending_restore.json");
    if (fs.existsSync(pendingFile)) {
      return { success: false, reason: "Pending restore already queued", goLiveEntry };
    }
    restoreBackup(targetBackup, runtimeRoot);
    return {
      success: true,
      restoredFrom: targetBackup,
      reason,
      rolledBackAt: new Date().toISOString(),
      goLiveEntry
    };
  } catch (error) {
    return { success: false, reason: `Rollback failed: ${error.message}`, goLiveEntry };
  }
}