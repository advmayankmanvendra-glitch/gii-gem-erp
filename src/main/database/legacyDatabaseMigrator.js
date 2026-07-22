import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { databasePath, dataRoot, knownLegacyPaths } from "./databasePathResolver.js";

const MIGRATION_MARKER = ".legacy_migrated";

function createBackup(sourcePath) {
  const backupDir = path.join(dataRoot(), "backups", "legacy-migration");
  fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `pre-migration-backup-${timestamp}.db`);
  fs.copyFileSync(sourcePath, backupPath);
  return backupPath;
}

function verifyIntegrity(dbPath) {
  const verifier = new Database(dbPath, { readonly: true, fileMustExist: true });
  const row = verifier.pragma("integrity_check");
  verifier.close();
  return row && row[0] && row[0].integrity_check === "ok";
}

function verifyRowCounts(sourcePath, targetPath) {
  const sourceDb = new Database(sourcePath, { readonly: true, fileMustExist: true });
  const targetDb = new Database(targetPath, { readonly: true, fileMustExist: true });
  const sourceTables = sourceDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const results = [];
  sourceTables.forEach((t) => {
    const sc = sourceDb.prepare(`SELECT COUNT(*) c FROM \`${t.name}\``).get();
    const tc = targetDb.prepare(`SELECT COUNT(*) c FROM \`${t.name}\``).get();
    results.push({ table: t.name, sourceCount: sc.c, targetCount: tc.c, match: sc.c === tc.c });
  });
  sourceDb.close();
  targetDb.close();
  const allMatch = results.every((r) => r.match);
  return { results, allMatch };
}

function markMigrated(sourcePath) {
  const markerPath = sourcePath + MIGRATION_MARKER;
  fs.writeFileSync(markerPath, new Date().toISOString());
  return markerPath;
}

function isAlreadyMigrated(sourcePath) {
  return fs.existsSync(sourcePath + MIGRATION_MARKER);
}

export function detectLegacyDatabases() {
  const current = databasePath(dataRoot());
  const candidates = knownLegacyPaths().map((root) => databasePath(root));
  return candidates.filter((p) => p !== current && fs.existsSync(p) && !isAlreadyMigrated(p));
}

export function migrateLegacyDatabase(sourcePath) {
  const targetPath = databasePath(dataRoot());
  if (!fs.existsSync(sourcePath)) {
    return { success: true, reason: "source-not-found" };
  }
  if (isAlreadyMigrated(sourcePath)) {
    return { success: true, reason: "already-migrated" };
  }
  if (sourcePath === targetPath) {
    return { success: true, reason: "same-path" };
  }
  const backupPath = createBackup(sourcePath);
  if (!verifyIntegrity(sourcePath)) {
    return { success: false, reason: "integrity-failure", backupPath };
  }
  const targetDir = path.dirname(targetPath);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  if (!verifyIntegrity(targetPath)) {
    return { success: false, reason: "copy-integrity-failure", backupPath };
  }
  const counts = verifyRowCounts(sourcePath, targetPath);
  if (!counts.allMatch) {
    return { success: false, reason: "row-count-mismatch", details: counts.results.filter((r) => !r.match), backupPath };
  }
  const markerPath = markMigrated(sourcePath);
  return { success: true, reason: "migrated", backupPath, markerPath, rowVerification: counts };
}
