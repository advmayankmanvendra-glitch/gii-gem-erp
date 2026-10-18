import { bookIntegrityChecks } from "../errorConsoleService.js";

// Go-live verification runs inside the app against the live books of the company that
// was reset. (The repo's verify scripts are developer tools: they are not packaged and
// they create their own test data, so they must never run against a live database.)
function companyCount(db, table, companyId) {
  const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map((r) => r.name);
  const where = [];
  const params = [];
  if (cols.includes("is_deleted")) where.push("COALESCE(is_deleted, 0) = 0");
  if (companyId && cols.includes("company_id")) { where.push("company_id = ?"); params.push(companyId); }
  return db.prepare(`SELECT COUNT(*) count FROM "${table}"${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`).get(...params).count;
}

export function runProductionVerification(db, companyId = null) {
  const scriptResults = bookIntegrityChecks(db, companyId)
    .map((check) => ({ name: check.label, passed: check.status === "pass", output: check.detail, error: check.status === "pass" ? undefined : check.action }));
  const additionalChecks = [];
  const add = (key, label, fn) => {
    try { additionalChecks.push({ key, label, ...fn() }); } catch (error) { additionalChecks.push({ key, label, passed: false, detail: `check failed: ${error.message}` }); }
  };
  add("zeroVouchers", "No operational vouchers", () => { const n = companyCount(db, "vouchers", companyId); return { passed: n === 0, detail: `vouchers=${n}` }; });
  add("zeroStock", "No stock movements", () => { const n = companyCount(db, "stock_ledger", companyId); return { passed: n === 0, detail: `stock_ledger=${n}` }; });
  const scriptPassed = scriptResults.every((r) => r.passed);
  const additionalPassed = additionalChecks.every((c) => c.passed);
  return { scriptResults, additionalChecks, scriptPassed, additionalPassed, overallPassed: scriptPassed && additionalPassed };
}
