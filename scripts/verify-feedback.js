import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initializeDatabase } from "../src/main/database/init.js";
import { exportFeedback, listFeedback, submitFeedback } from "../src/main/services/feedbackService.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-gem-feedback-"));
const db = initializeDatabase(root);

try {
  const company = db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get();
  const admin = db.prepare("SELECT id, display_name FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();
  const submitted = submitFeedback(db, {
    company_id: company?.id || null,
    user_id: admin?.id || null,
    user_name: admin?.display_name || "Admin",
    category: "other",
    message: "ADD OPENING TAB NOT WORKING"
  });

  assert(submitted.success, "Feedback submit did not return success");
  assert(submitted.id, "Feedback submit did not return an id");

  const rows = listFeedback(db, {});
  assert(rows.length === 1, `Expected 1 feedback row, found ${rows.length}`);
  assert(rows[0].message === "ADD OPENING TAB NOT WORKING", "Feedback message was not preserved");
  assert(rows[0].category === "other", "Feedback category was not preserved");

  const csvExport = exportFeedback(db, "csv");
  assert(csvExport.success, "CSV feedback export failed");
  assert(fs.existsSync(csvExport.filePath), "CSV feedback export file was not created");

  console.log(JSON.stringify({
    root,
    feedbackId: submitted.id,
    exported: csvExport.filePath,
    status: "passed"
  }, null, 2));
} finally {
  db.close();
}

process.exit(0);
