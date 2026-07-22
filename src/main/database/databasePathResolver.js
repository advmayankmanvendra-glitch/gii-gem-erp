import path from "node:path";
import fs from "node:fs";
import { app } from "electron";

const DB_NAME = "gii_gem_erp.db";
const ENV_VAR = "GII_GEM_ERP_DATA_ROOT";

let runtimeRoot = "";

export function setDataRoot(rootPath) {
  runtimeRoot = rootPath ? path.resolve(rootPath) : "";
  if (runtimeRoot) {
    process.env[ENV_VAR] = runtimeRoot;
  }
  return runtimeRoot;
}

function sourceProjectRoot() {
  return process.cwd();
}

function resolvedRoot() {
  if (runtimeRoot) return runtimeRoot;
  const envRoot = process.env[ENV_VAR];
  if (envRoot) return path.resolve(envRoot);
  return sourceProjectRoot();
}

export function dataRoot() {
  return resolvedRoot();
}

export function resolveDataRootForPackaged() {
  if (process.env[ENV_VAR]) {
    return path.resolve(process.env[ENV_VAR]);
  }
  return app.isPackaged ? app.getPath("userData") : sourceProjectRoot();
}

export function databasePath(root) {
  return path.join(root || resolvedRoot(), "database", DB_NAME);
}

export function databaseDir(root) {
  return path.dirname(databasePath(root));
}

export function dbName() {
  return DB_NAME;
}

export function appDataFolders() {
  return ["database", "documents", "backups", "exports", "reports", "logs"];
}

export function ensureDataFolders(root) {
  const base = root || resolvedRoot();
  appDataFolders().forEach((folder) => {
    fs.mkdirSync(path.join(base, folder), { recursive: true });
  });
  return base;
}

export function bundledDatabaseSource() {
  const candidates = [
    path.join(process.resourcesPath || "", "database", DB_NAME),
    path.join(app.getAppPath(), "database", DB_NAME),
    path.join(path.dirname(app.getPath("exe")), "database", DB_NAME),
  ];
  return candidates.find((c) => c && fs.existsSync(c)) || null;
}

export function copyBundledDatabaseIfMissing(targetRoot) {
  const targetDb = databasePath(targetRoot);
  if (!app.isPackaged || fs.existsSync(targetDb)) {
    return null;
  }
  const sourceDb = bundledDatabaseSource();
  if (!sourceDb) return null;
  fs.mkdirSync(path.dirname(targetDb), { recursive: true });
  fs.copyFileSync(sourceDb, targetDb);
  return { source: sourceDb, target: targetDb };
}

export function knownLegacyPaths() {
  return [];
}
