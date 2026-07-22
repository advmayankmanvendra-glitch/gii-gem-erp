import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "../database/init.js";
import { getMetaValue, getOrCreateDatabaseId } from "../database/databaseIdentity.js";
import { app } from "electron";

function ensureFeedbackLogTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER,
      user_id INTEGER,
      user_name TEXT,
      category TEXT NOT NULL DEFAULT 'suggestion' CHECK(category IN ('suggestion','bug','question','improvement','other')),
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved','closed')),
      application_version TEXT NOT NULL DEFAULT '',
      schema_version INTEGER NOT NULL DEFAULT 0,
      release_channel TEXT NOT NULL DEFAULT '',
      git_commit TEXT NOT NULL DEFAULT '',
      database_id TEXT NOT NULL DEFAULT '',
      screen_id TEXT NOT NULL DEFAULT '',
      record_id INTEGER,
      machine_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT,
      resolution_notes TEXT,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

function addVersionColumns(db) {
  const existing = db.prepare("PRAGMA table_info('feedback_log')").all().map((c) => c.name);
  const additions = [
    ["application_version", "TEXT NOT NULL DEFAULT ''"],
    ["schema_version", "INTEGER NOT NULL DEFAULT 0"],
    ["release_channel", "TEXT NOT NULL DEFAULT ''"],
    ["git_commit", "TEXT NOT NULL DEFAULT ''"],
    ["database_id", "TEXT NOT NULL DEFAULT ''"],
    ["screen_id", "TEXT NOT NULL DEFAULT ''"],
    ["record_id", "INTEGER"],
    ["machine_id", "TEXT NOT NULL DEFAULT ''"],
  ];
  additions.forEach(([col, def]) => {
    if (!existing.includes(col)) {
      db.exec(`ALTER TABLE feedback_log ADD COLUMN ${col} ${def}`);
    }
  });
}

export function submitFeedback(db, payload) {
  ensureFeedbackLogTable(db);
  addVersionColumns(db);
  const { company_id, user_id, user_name, category, message, screen_id, record_id } = payload;
  const result = db.prepare(`
    INSERT INTO feedback_log (company_id, user_id, user_name, category, message,
      application_version, schema_version, release_channel, git_commit,
      database_id, screen_id, record_id, machine_id)
    VALUES (@company_id, @user_id, @user_name, @category, @message,
      @application_version, @schema_version, @release_channel, @git_commit,
      @database_id, @screen_id, @record_id, @machine_id)
  `).run({
    company_id: company_id || null,
    user_id: user_id || null,
    user_name: user_name || "",
    category: category || "suggestion",
    message,
    application_version: payload.application_version || (app ? app.getVersion() : "") || "",
    schema_version: Number(getMetaValue(db, "schema_version") || 0),
    release_channel: payload.release_channel || process.env.GII_GEM_ERP_RELEASE_CHANNEL || "",
    git_commit: payload.git_commit || process.env.GII_GEM_ERP_GIT_COMMIT || "",
    database_id: getOrCreateDatabaseId(db),
    screen_id: screen_id || "",
    record_id: record_id || null,
    machine_id: payload.machine_id || "",
  });
  return { id: result.lastInsertRowid, success: true };
}

export function listFeedback(db, filters) {
  ensureFeedbackLogTable(db);
  addVersionColumns(db);
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
  ensureFeedbackLogTable(db);
  addVersionColumns(db);
  const rows = db.prepare("SELECT * FROM feedback_log ORDER BY created_at DESC").all();
  if (!rows.length) return { success: false, error: "No feedback entries to export." };

  const root = projectRoot();
  const exportsDir = path.join(root, "exports");
  if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  let filePath;
  const headers = ["id", "company_id", "user_id", "user_name", "category", "message", "status",
    "application_version", "schema_version", "release_channel", "git_commit",
    "database_id", "screen_id", "record_id", "machine_id",
    "created_at", "updated_at", "resolved_at", "resolution_notes"];

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
