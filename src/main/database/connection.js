import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const APP_FOLDERS = ["database", "documents", "backups", "exports", "reports", "logs"];
export const DB_NAME = "gii_gem_erp.db";

let configuredRuntimeRoot = process.env.GII_GEM_ERP_DATA_ROOT
  ? path.resolve(process.env.GII_GEM_ERP_DATA_ROOT)
  : "";

export function setRuntimeRoot(rootPath) {
  configuredRuntimeRoot = rootPath ? path.resolve(rootPath) : "";
  if (configuredRuntimeRoot) {
    process.env.GII_GEM_ERP_DATA_ROOT = configuredRuntimeRoot;
  }
  return configuredRuntimeRoot;
}

export function sourceProjectRoot() {
  return process.cwd();
}

export function projectRoot() {
  return configuredRuntimeRoot || process.env.GII_GEM_ERP_DATA_ROOT || sourceProjectRoot();
}

export function ensureAppFolders(root = projectRoot()) {
  APP_FOLDERS.forEach((folder) => {
    fs.mkdirSync(path.join(root, folder), { recursive: true });
  });
}

export function dbPath(root = projectRoot()) {
  return path.join(root, "database", DB_NAME);
}

export function openDatabase(root = projectRoot()) {
  ensureAppFolders(root);
  const db = new Database(dbPath(root));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}
