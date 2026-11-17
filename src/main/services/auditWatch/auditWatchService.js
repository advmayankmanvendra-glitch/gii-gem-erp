// Audit Watch runner (AW-1).
//
// Runs the catalogue's checks for one company and returns findings. It is read-only
// by construction, twice over:
//   - the run opens its own read-only connection to the database file, and every
//     helper it calls (stockBalance, bookIntegrityChecks, verifyAuditChain) gets that
//     connection, so nothing it reaches can write;
//   - checks get a query helper that also refuses any statement SQLite does not mark
//     as read-only.
// The whole run reads one consistent snapshot inside a read transaction. The desktop
// app runs it off the main thread (auditWatchRunner.js); this function is the same
// in both places.
//
// Who may run which area is decided here from the caller's role (AREA_VISIBILITY),
// never from what the screen asks for.

import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { AREAS, AUDIT_WATCH_VERSION, CHECKS, areasForRole } from "./catalogue.js";
import { CHECK_FUNCTIONS, addDays } from "./checks.js";
import { stockBalances } from "./stockBalances.js";
import { localBusinessDate } from "../../domain/businessDate.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FINDINGS_PER_CHECK = 500;
const MAX_RANGE_DAYS = 3 * 366;
const MAX_REFS_PER_FINDING = 50;
const MAX_EVIDENCE_PER_FINDING = 20;
const MAX_FINGERPRINT_LENGTH = 64;
const MAX_KEY_LENGTH = 160;
const MAX_SUMMARY_LENGTH = 400;
const MAX_EVIDENCE_TEXT = 300;

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const clipRow = (row) => (row && typeof row === "object"
  ? Object.fromEntries(Object.entries(row).map(([field, value]) => [field, typeof value === "string" ? clip(value, MAX_EVIDENCE_TEXT) : value]))
  : row);

// Keeps every finding a bounded size: at most 50 record links (refCount gives the full
// number), 20 evidence rows with long text cut, a summary of at most 400 characters,
// and a long key or fingerprint replaced by its SHA-256 (so it is still stable, and
// still changes when what it describes changes).
export function boundFinding(finding) {
  const refs = Array.isArray(finding.refs) ? finding.refs : [];
  const evidence = Array.isArray(finding.evidence) ? finding.evidence : [];
  const key = String(finding.key ?? "");
  const fingerprint = String(finding.fingerprint ?? `${finding.amountMinor || 0}|${finding.date || ""}`);
  return {
    ...finding,
    key: key.length > MAX_KEY_LENGTH ? `${key.split(":")[0]}:sha256-${sha256(key)}` : key,
    fingerprint: fingerprint.length > MAX_FINGERPRINT_LENGTH ? `sha256:${sha256(fingerprint)}` : fingerprint,
    summary: clip(String(finding.summary ?? ""), MAX_SUMMARY_LENGTH),
    refs: refs.slice(0, MAX_REFS_PER_FINDING),
    refCount: refs.length,
    evidence: evidence.slice(0, MAX_EVIDENCE_PER_FINDING).map(clipRow)
  };
}

function validDate(value) {
  return DATE.test(String(value || "")) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function readOnlyQuery(db) {
  const prepare = (sql) => {
    const statement = db.prepare(sql);
    if (!statement.readonly || !statement.reader) throw new Error("Audit Watch may only read");
    return statement;
  };
  const query = (sql, params = []) => prepare(sql).all(...params);
  // Streams the rows to visit one at a time, for reads too large to hold at once. The
  // connection is busy until the last row, so visit must not query.
  query.each = (sql, params, visit) => { for (const row of prepare(sql).iterate(...(params || []))) visit(row); };
  return query;
}

// Limits come from the catalogue; a caller may override a known key with a number (or
// HH:MM for a time) inside a sane range. Unknown keys and bad values are ignored.
export function resolveLimits(check, overrides = {}) {
  const limits = {};
  for (const [key, limit] of Object.entries(check.limits)) {
    const wanted = overrides?.[key];
    if (limit.unit === "time") {
      limits[key] = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(wanted || "")) ? wanted : limit.default;
      continue;
    }
    const number = Number(wanted);
    const max = limit.unit === "percent" ? 1000 : limit.unit === "days" ? 3660 : 1e12;
    limits[key] = wanted !== undefined && wanted !== null && wanted !== "" && Number.isFinite(number) && number >= 0 && number <= max ? number : limit.default;
  }
  return limits;
}

// A read-only connection to the same file. A connection that is already read-only
// (the worker opens one) is used as it is; so is an in-memory database, which has no
// file to reopen.
function readOnlyConnection(db) {
  if (db.readonly) return { connection: db, close: () => {} };
  if (!db.name || db.memory || db.name === ":memory:") return { connection: db, close: () => {} };
  const connection = new Database(db.name, { readonly: true, fileMustExist: true });
  return { connection, close: () => connection.close() };
}

export function createAuditWatchService({ stockBalance, bookIntegrityChecks, verifyAuditChain }) {
  function catalogueForRole(role) {
    const allowed = new Set(areasForRole(role));
    return {
      areas: AREAS.filter((area) => allowed.has(area.id)),
      checks: CHECKS.filter((check) => allowed.has(check.area)).map((check) => ({
        id: check.id, area: check.area, title: check.title, severity: check.severity, readiness: check.readiness,
        scope: check.scope, version: check.version, meaning: check.meaning, nextStep: check.nextStep,
        limits: Object.entries(check.limits).map(([key, limit]) => ({ key, ...limit }))
      }))
    };
  }

  function runAuditWatch(db, options = {}) {
    const role = String(options.role || "").toLowerCase();
    const allowed = new Set(areasForRole(role));
    if (!allowed.size) throw new Error("Your role cannot open Audit Watch");
    const companyId = Number(options.companyId);
    if (!Number.isInteger(companyId) || companyId <= 0) throw new Error("Choose a company first");
    if (!db.prepare("SELECT 1 FROM companies WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(companyId)) throw new Error("Company not found");

    const today = validDate(options.today) ? options.today : localBusinessDate();
    const to = validDate(options.to) ? options.to : today;
    const from = validDate(options.from) ? options.from : addDays(to, -365);
    if (from > to) throw new Error("The start date is after the end date");
    if ((Date.parse(to) - Date.parse(from)) / 86400000 > MAX_RANGE_DAYS) throw new Error("Choose a period of three years or less");

    const areaFilter = Array.isArray(options.areas) && options.areas.length ? new Set(options.areas) : null;
    const idFilter = Array.isArray(options.checkIds) && options.checkIds.length ? new Set(options.checkIds) : null;
    const selected = CHECKS.filter((check) => allowed.has(check.area)
      && (!areaFilter || areaFilter.has(check.area))
      && (!idFilter || idFilter.has(check.id)));

    const { connection, close } = readOnlyConnection(db);
    const baseQuery = readOnlyQuery(connection);
    const balanceCache = new Map();
    const deps = {
      stockBalance: (company, itemId, warehouseId) => stockBalance(connection, company, itemId, warehouseId),
      bookIntegrityChecks: (company) => bookIntegrityChecks(connection, company, { verifyAuditChain })
    };
    const started = Date.now();
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    const run = () => selected.map((check) => {
      const base = {
        id: check.id, area: check.area, title: check.title, severity: check.severity, readiness: check.readiness,
        scope: check.scope, version: check.version, meaning: check.meaning, nextStep: check.nextStep
      };
      if (check.readiness !== "now") return { ...base, status: "waiting", findings: [], findingCount: 0, note: "Waits for the accounting programme to reach this build." };
      const limits = resolveLimits(check, options.limits?.[check.id]);
      // Tests may wrap the query helper to trace what a check reads; the app never does.
      const q = typeof options.wrapQuery === "function" ? options.wrapQuery(baseQuery, { checkId: check.id, db: connection }) : baseQuery;
      const checkStarted = Date.now();
      try {
        // Every pair's balance in one pass, read once per run and shared by I01 and I02,
        // through the check's own query helper (read-only, and traced in tests).
        // A check may name things it could not check (notChecked): they are shown under the
        // check, not counted as findings.
        const notChecked = [];
        const checkDeps = { ...deps, notChecked: (text) => notChecked.push(String(text).slice(0, 300)), stockBalances: (company) => (balanceCache.get(company) ?? balanceCache.set(company, stockBalances(q, company)).get(company)) };
        const all = CHECK_FUNCTIONS[check.id](q, { companyId, from, to, today, now, limits, deps: checkDeps })
          .map(boundFinding);
        all.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(a.key).localeCompare(String(b.key)));
        return {
          ...base,
          limits,
          status: all.length ? "findings" : "clear",
          findingCount: all.length,
          truncated: all.length > MAX_FINDINGS_PER_CHECK,
          findings: all.slice(0, MAX_FINDINGS_PER_CHECK),
          ...(notChecked.length ? { notChecked: notChecked.slice(0, 20), notCheckedCount: notChecked.length } : {}),
          ms: Date.now() - checkStarted
        };
      } catch (error) {
        return { ...base, limits, status: "error", findings: [], findingCount: 0, error: String(error?.message || error), ms: Date.now() - checkStarted };
      }
    });
    let results;
    try {
      // One read transaction: every check sees the same snapshot of the books.
      results = connection.inTransaction ? run() : connection.transaction(run).deferred();
    } finally {
      close();
    }

    const summary = AREAS.filter((area) => allowed.has(area.id)).map((area) => {
      const inArea = results.filter((result) => result.area === area.id);
      const count = (severity) => inArea.filter((result) => result.severity === severity).reduce((sum, result) => sum + (result.findingCount || 0), 0);
      return { area: area.id, label: area.label, high: count("high"), medium: count("medium"), low: count("low"), errors: inArea.filter((result) => result.status === "error").length };
    });
    return { generatedAt: new Date().toISOString(), version: AUDIT_WATCH_VERSION, companyId, from, to, today, ms: Date.now() - started, summary, results };
  }

  return { runAuditWatch, catalogueForRole };
}
