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
let bundleSequence = 0;

// What the screen sends for a support bundle (Safe Mode's crash list, the checks it saw),
// kept for support as one compact JSON text, without the top-level user fields and within
// 1 MB, so a call cannot fill the disk (a text value is written as is, never expanded).
const MAX_SCREEN_CONTEXT_BYTES = 1024 * 1024;
export function boundedScreenContext(context) {
  if (!context || typeof context !== "object") return null;
  const { user_id, userId, user_name, userName, role, userRole, ...rest } = context;
  let text;
  try { text = JSON.stringify(rest); } catch { return JSON.stringify({ omitted: "The screen's details could not be read." }); }
  if (text && Buffer.byteLength(text, "utf8") <= MAX_SCREEN_CONTEXT_BYTES) return text;
  // Too large: keep Safe Mode's crash list if it fits on its own, drop the rest.
  const omitted = { omitted: "The screen's details were larger than 1 MB and were left out." };
  try {
    const crashes = JSON.stringify(rest.crashes ?? null);
    if (rest.crashes && Buffer.byteLength(crashes, "utf8") <= MAX_SCREEN_CONTEXT_BYTES / 2) return JSON.stringify({ ...omitted, crashes: rest.crashes });
  } catch { /* the crash list could not be read either */ }
  return JSON.stringify(omitted);
}

export function createSupportBundle(db, runtimeDataRoot, diagnostics, checks, context = {}) {
  const bundleFolder = path.join(runtimeDataRoot, "exports", "support-bundles");
  fs.mkdirSync(bundleFolder, { recursive: true });
  // A sequence number keeps two bundles made in the same millisecond apart.
  bundleSequence += 1;
  const fileName = `gii-gem-erp-support-bundle-${stamp()}-${String(bundleSequence).padStart(6, "0")}.json`;
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
    fs.readdirSync(bundleFolder).filter((name) => /^gii-gem-erp-support-bundle-.*\.json$/.test(name)).filter((name) => name !== fileName).sort().reverse()
      .slice(MAX_SUPPORT_BUNDLES - 1).forEach((name) => fs.rmSync(path.join(bundleFolder, name), { force: true }));
  } catch { /* clean-up is best effort; the new bundle is already written */ }
  return {
    success: true,
    fileName,
    filePath,
    createdAt: payload.createdAt,
    size: stat.size
  };
}
