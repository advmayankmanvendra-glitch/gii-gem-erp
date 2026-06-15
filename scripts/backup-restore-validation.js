import Database from "better-sqlite3";
import { createBackup, restoreBackup } from "../src/main/services/backup.js";
import { dbPath, projectRoot } from "../src/main/database/init.js";

const root = projectRoot();
const marker = `BACKUP_RESTORE_VALIDATION_TEST_20260611_${Date.now()}`;
const backup = createBackup(root);

const db = new Database(dbPath(root));
const insert = db.prepare(`
  INSERT INTO companies (company_name, gstin, pan, address, bank_name, account_number, ifsc, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  marker,
  "27ABCDE1234F1Z5",
  "ABCDE1234F",
  "Temporary restore validation record",
  "Validation Bank",
  "999999999999",
  "HDFC0000001",
  "active"
);
const existsBeforeRestore = db.prepare("SELECT COUNT(*) AS count FROM companies WHERE company_name = ?").get(marker).count;
db.close();

restoreBackup(backup.fileName, root);

const verifyDb = new Database(dbPath(root), { readonly: true });
const existsAfterRestore = verifyDb.prepare("SELECT COUNT(*) AS count FROM companies WHERE company_name = ?").get(marker).count;
verifyDb.close();

const result = {
  backupFileName: backup.fileName,
  backupPath: backup.path,
  backupSize: backup.size,
  marker,
  insertedRecordId: insert.lastInsertRowid,
  existsBeforeRestore,
  existsAfterRestore,
  passed: existsBeforeRestore === 1 && existsAfterRestore === 0
};

console.log(JSON.stringify(result, null, 2));

if (!result.passed) {
  process.exit(1);
}
