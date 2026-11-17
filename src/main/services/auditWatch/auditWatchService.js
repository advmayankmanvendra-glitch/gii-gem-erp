// Audit Watch runner (AW-1).
//
// Runs the catalogue's checks for one company and returns findings. It is read-only
// by construction: checks get a query helper that refuses any statement SQLite does
// not mark as read-only, so a check cannot write even by mistake, and the whole run
// reads one consistent snapshot inside a read transaction.
//
// Who may run which area is decided here from the caller's role (AREA_VISIBILITY),
// never from what the screen asks for.

import { AREAS, CHECKS, areasForRole } from "./catalogue.js";
import { CHECK_FUNCTIONS, addDays } from "./checks.js";
import { localBusinessDate } from "../../domain/businessDate.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FINDINGS_PER_CHECK = 500;
const MAX_RANGE_DAYS = 3 * 366;

function validDate(value) {
  return DATE.test(String(value || "")) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function readOnlyQuery(db) {
  return (sql, params = []) => {
    const statement = db.prepare(sql);
    if (!statement.readonly || !statement.reader) throw new Error("Audit Watch may only read");
    return statement.all(...params);
  };
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

export function createAuditWatchService({ stockBalance, bookIntegrityChecks, verifyAuditChain }) {
  function catalogueForRole(role) {
    const allowed = new Set(areasForRole(role));
    return {
      areas: AREAS.filter((area) => allowed.has(area.id)),
      checks: CHECKS.filter((check) => allowed.has(check.area)).map((check) => ({
        id: check.id, area: check.area, title: check.title, severity: check.severity, readiness: check.readiness,
        meaning: check.meaning, nextStep: check.nextStep,
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

    const q = readOnlyQuery(db);
    const deps = {
      stockBalance: (company, itemId, warehouseId) => stockBalance(db, company, itemId, warehouseId),
      bookIntegrityChecks: (company) => bookIntegrityChecks(db, company, { verifyAuditChain })
    };
    const started = Date.now();
    const run = () => selected.map((check) => {
      const base = { id: check.id, area: check.area, title: check.title, severity: check.severity, readiness: check.readiness, meaning: check.meaning, nextStep: check.nextStep };
      if (check.readiness !== "now") return { ...base, status: "waiting", findings: [], note: "Waits for the accounting programme to reach this build." };
      const limits = resolveLimits(check, options.limits?.[check.id]);
      const checkStarted = Date.now();
      try {
        const all = CHECK_FUNCTIONS[check.id](q, { companyId, from, to, today, limits, deps });
        all.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(a.key).localeCompare(String(b.key)));
        return {
          ...base,
          limits,
          status: all.length ? "findings" : "clear",
          findingCount: all.length,
          truncated: all.length > MAX_FINDINGS_PER_CHECK,
          findings: all.slice(0, MAX_FINDINGS_PER_CHECK),
          ms: Date.now() - checkStarted
        };
      } catch (error) {
        return { ...base, limits, status: "error", findings: [], findingCount: 0, error: String(error?.message || error), ms: Date.now() - checkStarted };
      }
    });
    // One read transaction: every check sees the same snapshot of the books.
    const results = db.inTransaction ? run() : db.transaction(run).deferred();

    const summary = AREAS.filter((area) => allowed.has(area.id)).map((area) => {
      const inArea = results.filter((result) => result.area === area.id);
      const count = (severity) => inArea.filter((result) => result.severity === severity).reduce((sum, result) => sum + (result.findingCount || 0), 0);
      return { area: area.id, label: area.label, high: count("high"), medium: count("medium"), low: count("low"), errors: inArea.filter((result) => result.status === "error").length };
    });
    return { generatedAt: new Date().toISOString(), companyId, from, to, today, ms: Date.now() - started, summary, results };
  }

  return { runAuditWatch, catalogueForRole };
}
