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
// 1 MB, so a call cannot fill the disk or hold up the program (a text value is written as is,
// never expanded). The copy walks the value with a running byte count and stops at the limit,
// so a huge or sparse list, a typed array or deep nesting costs no more than the limit itself.
const MAX_SCREEN_CONTEXT_BYTES = 1024 * 1024;
const MAX_LIST_ITEMS = 200;
const MAX_KEYS = 200;
const MAX_DEPTH = 8;
const MAX_TEXT_LENGTH = 20000;

function boundedCopy(value, budget, depth) {
  if (budget.left <= 0) return undefined;
  if (value === null || typeof value === "boolean") { budget.left -= 5; return value; }
  if (typeof value === "number") { budget.left -= 24; return Number.isFinite(value) ? value : null; }
  if (typeof value === "string") {
    const text = value.length > MAX_TEXT_LENGTH ? `${value.slice(0, MAX_TEXT_LENGTH)}... (cut)` : value;
    budget.left -= text.length * 2 + 2;
    return budget.left >= 0 ? text : undefined;
  }
  if (typeof value !== "object" || depth >= MAX_DEPTH) return undefined;
  if (Array.isArray(value)) {
    const out = [];
    const count = Math.min(value.length, MAX_LIST_ITEMS);
    for (let index = 0; index < count && budget.left > 0; index += 1) {
      const item = boundedCopy(value[index], budget, depth + 1);
      if (item !== undefined) out.push(item);
    }
    budget.left -= 2;
    return out;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return undefined; // typed arrays, dates, buffers
  const out = {};
  let keys = 0;
  for (const key of Object.keys(value)) {
    if (keys >= MAX_KEYS || budget.left <= 0) break;
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    keys += 1;
    budget.left -= Math.min(key.length, 200) * 2 + 4;
    const item = boundedCopy(value[key], budget, depth + 1);
    if (item !== undefined) out[key.slice(0, 200)] = item;
  }
  budget.left -= 2;
  return out;
}

export function boundedScreenContext(context) {
  if (!context || typeof context !== "object" || Array.isArray(context)) return null;
  const proto = Object.getPrototypeOf(context);
  if (proto !== Object.prototype && proto !== null) return null;
  const { user_id, userId, user_name, userName, role, userRole, ...rest } = context;
  const budget = { left: MAX_SCREEN_CONTEXT_BYTES / 2 };
  const copy = boundedCopy(rest, budget, 0) || {};
  if (budget.left <= 0) copy.omitted = "Some of the screen's details were larger than 1 MB and were left out.";
  let text;
  try { text = JSON.stringify(copy); } catch { return JSON.stringify({ omitted: "The screen's details could not be read." }); }
  return Buffer.byteLength(text, "utf8") <= MAX_SCREEN_CONTEXT_BYTES ? text : JSON.stringify({ omitted: "The screen's details were larger than 1 MB and were left out." });
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
