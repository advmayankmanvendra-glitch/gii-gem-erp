import fs from "node:fs";
import path from "node:path";

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safeAll(db, sql, params = []) {
  try {
    return db.prepare(sql).all(params);
  } catch {
    return [];
  }
}

function safeTableNames(db) {
  return safeAll(db, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((row) => row.name);
}

function auditTail(db) {
  return safeAll(
    db,
    "SELECT id, module_name, action, record_id, user_id, created_at FROM audit_log ORDER BY id DESC LIMIT 50"
  );
}

const MAX_SUPPORT_BUNDLES = 20;

export function createSupportBundle(db, runtimeDataRoot, diagnostics, checks, context = {}) {
  const bundleFolder = path.join(runtimeDataRoot, "exports", "support-bundles");
  fs.mkdirSync(bundleFolder, { recursive: true });
  const fileName = `gii-gem-erp-support-bundle-${stamp()}.json`;
  const filePath = path.join(bundleFolder, fileName);
  const payload = {
    createdAt: new Date().toISOString(),
    context,
    diagnostics,
    checks,
    database: {
      tables: db ? safeTableNames(db) : [],
      recentAuditLog: db ? auditTail(db) : []
    },
    note: "Support bundle contains diagnostics and metadata only. It does not contain uploaded document contents."
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  const stat = fs.statSync(filePath);
  // Only the newest bundles are kept, so repeated exports cannot fill the disk that holds the books.
  try {
    fs.readdirSync(bundleFolder).filter((name) => /^gii-gem-erp-support-bundle-.*\.json$/.test(name)).sort().reverse()
      .slice(MAX_SUPPORT_BUNDLES).forEach((name) => fs.rmSync(path.join(bundleFolder, name), { force: true }));
  } catch { /* clean-up is best effort; the new bundle is already written */ }
  return {
    success: true,
    fileName,
    filePath,
    createdAt: payload.createdAt,
    size: stat.size
  };
}
