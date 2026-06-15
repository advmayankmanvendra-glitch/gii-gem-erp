import fs from "node:fs";
import path from "node:path";
import {
  createRecord,
  initializeDatabase,
  listRecords,
  uploadDocument
} from "../src/main/database/init.js";
import { createLiveBackup, listBackups, restoreBackup } from "../src/main/services/backup.js";

async function main() {
  const root = path.resolve("runtime/packaged-smoke");
  const sourceDir = path.join(root, "smoke-source");
  fs.mkdirSync(sourceDir, { recursive: true });

  const sourcePath = path.join(sourceDir, "packaged-smoke-upload.pdf");
  fs.writeFileSync(
    sourcePath,
    "%PDF-1.4\n% GII GeM ERP packaged runtime smoke document\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"
  );

  let db = initializeDatabase(root);
  const company = db.prepare("SELECT id, company_name FROM companies ORDER BY id LIMIT 1").get();
  if (!company?.id) throw new Error("No company available in packaged runtime database");

  const document = uploadDocument(db, {
    source_path: sourcePath,
    company_id: company.id,
    linked_module: "packaged_runtime_smoke",
    linked_record_id: 1,
    document_type: "Smoke Test Document",
    uploaded_by: null,
    remarks: "Packaged runtime smoke upload"
  }, root);
  if (!fs.existsSync(document.file_path)) {
    throw new Error("Uploaded document file was not copied to runtime documents folder");
  }

  const beforeBackups = listBackups(root).length;
  const backup = await createLiveBackup(db, root);
  const backupsAfter = listBackups(root);
  if (!backupsAfter.some((name) => name === backup.fileName)) {
    throw new Error("Created backup is missing from runtime backup list");
  }
  if (backupsAfter.length < beforeBackups + 1) {
    throw new Error("Backup count did not increase");
  }

  const markerName = `PACKAGED_SMOKE_${Date.now()}`;
  createRecord(db, "expense_heads", {
    expense_head_name: markerName,
    default_calculation_method: "fixed",
    default_percentage: 0,
    category: "Smoke",
    status: "Active"
  });
  const markerBeforeRestore = listRecords(db, "expense_heads", { search: markerName, status: "all" }).length;
  if (markerBeforeRestore !== 1) {
    throw new Error("Post-backup marker record was not created");
  }

  db.close();
  restoreBackup(backup.fileName, root);

  db = initializeDatabase(root);
  const markerAfterRestore = listRecords(db, "expense_heads", { search: markerName, status: "all" }).length;
  if (markerAfterRestore !== 0) {
    throw new Error("Restore did not remove post-backup marker record");
  }
  const restoredDocument = db.prepare("SELECT * FROM documents WHERE id = ?").get(document.id);
  if (!restoredDocument) throw new Error("Document record missing after restore");
  if (!fs.existsSync(restoredDocument.file_path)) throw new Error("Document file path missing after restore");
  db.close();

  console.log(JSON.stringify({
    runtimeRoot: root,
    company,
    documentId: document.id,
    documentPath: document.file_path,
    backupFileName: backup.fileName,
    backupPath: backup.path,
    backupSize: backup.size,
    backupCountBefore: beforeBackups,
    backupCountAfter: backupsAfter.length,
    markerName,
    markerBeforeRestore,
    markerAfterRestore,
    restoredDocumentPathExists: fs.existsSync(document.file_path)
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
