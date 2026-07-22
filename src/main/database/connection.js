import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { databasePath, ensureDataFolders, dataRoot, setDataRoot } from "./databasePathResolver.js";

export const DB_NAME = "gii_gem_erp.db";
export const APP_FOLDERS = ["database", "documents", "backups", "exports", "reports", "logs"];

export function setRuntimeRoot(rootPath) {
  return setDataRoot(rootPath);
}

export function sourceProjectRoot() {
  return process.cwd();
}

export function projectRoot() {
  return dataRoot();
}

export function ensureAppFolders(root) {
  return ensureDataFolders(root);
}

export function dbPath(root) {
  return databasePath(root);
}

export function openDatabase(root) {
  const resolved = root || dataRoot();
  ensureDataFolders(resolved);
  const dbPathResolved = databasePath(resolved);
  const dir = path.dirname(dbPathResolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPathResolved);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}
