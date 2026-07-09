import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "../database/init.js";

export function submitFeedback(db, payload) {
  const { company_id, user_id, user_name, category, message } = payload;
  const result = db.prepare(`
    INSERT INTO feedback_log (company_id, user_id, user_name, category, message)
    VALUES (@company_id, @user_id, @user_name, @category, @message)
  `).run({ company_id: company_id || null, user_id: user_id || null, user_name: user_name || "", category: category || "suggestion", message });
  return { id: result.lastInsertRowid, success: true };
}

export function listFeedback(db, filters) {
  const category = filters?.category || null;
  const status = filters?.status || null;
  let sql = "SELECT * FROM feedback_log";
  const conditions = [];
  const params = {};
  if (category) { conditions.push("category = @category"); params.category = category; }
  if (status) { conditions.push("status = @status"); params.status = status; }
  if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
  sql += " ORDER BY created_at DESC LIMIT 200";
  return db.prepare(sql).all(params);
}

export function exportFeedback(db, format) {
  const rows = db.prepare("SELECT * FROM feedback_log ORDER BY created_at DESC").all();
  if (!rows.length) return { success: false, error: "No feedback entries to export." };

  const root = projectRoot();
  const exportsDir = path.join(root, "exports");
  if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  let filePath;
  const headers = ["id", "company_id", "user_id", "user_name", "category", "message", "status", "created_at", "updated_at", "resolved_at", "resolution_notes"];

  if (format === "csv") {
    filePath = path.join(exportsDir, `feedback-export-${timestamp}.csv`);
    const csvLines = [headers.join(",")];
    for (const row of rows) {
      const values = headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return "";
        const str = String(val);
        return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
      });
      csvLines.push(values.join(","));
    }
    fs.writeFileSync(filePath, csvLines.join("\n"), "utf-8");
  } else {
    filePath = path.join(exportsDir, `feedback-export-${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(rows, null, 2), "utf-8");
  }

  return { success: true, filePath };
}
