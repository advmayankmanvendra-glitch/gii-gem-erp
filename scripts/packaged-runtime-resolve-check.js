import fs from "node:fs";
import path from "node:path";
import { dbPath, initializeDatabase } from "../src/main/database/init.js";
import { listBackups } from "../src/main/services/backup.js";

async function main() {
  const root = path.resolve("runtime/packaged-smoke");
  const databasePath = dbPath(root);
  if (!fs.existsSync(databasePath)) {
    throw new Error(`Packaged runtime database missing: ${databasePath}`);
  }

  const db = initializeDatabase(root);
  const documents = db.prepare(`
    SELECT id, original_file_name, file_path, uploaded_at
    FROM documents
    WHERE linked_module = ?
    ORDER BY id DESC
  `).all("packaged_runtime_smoke");
  db.close();

  if (!documents.length) {
    throw new Error("No packaged runtime smoke document records found after restart");
  }

  const missingDocuments = documents.filter((document) => !fs.existsSync(document.file_path));
  if (missingDocuments.length) {
    throw new Error(`Missing uploaded document files after restart: ${missingDocuments.map((item) => item.id).join(", ")}`);
  }

  const backups = listBackups(root);
  if (!backups.length) {
    throw new Error("No packaged runtime backups found after restart");
  }

  console.log(JSON.stringify({
    runtimeRoot: root,
    databasePath,
    databaseExists: true,
    backupCount: backups.length,
    latestBackup: backups[0],
    documentCount: documents.length,
    latestDocument: documents[0],
    allDocumentPathsResolve: true
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
