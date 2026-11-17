// verify-audit-watch.js — Audit Watch catalogue verifier (AW-0).
//
// Fails when:
//   1. the check catalogue is malformed (ids, areas, severities, limits, wording);
//   2. AG-1 detectiveControls or the KG-5 Audit Watch guide are out of step with the
//      catalogue (rebuild with: node scripts/build-audit-watch-graph.js);
//   3. a runnable check reads a table or column the database does not have
//      (checked against a freshly initialised database, not a hand-kept list);
//   4. the KG-5 section index does not match the guide's headings;
//   5. the visibility roles drift from the app's role list.
// A table missing from DG-1 is reported as a warning (DG-1 is curated separately).
//
// Usage: node scripts/verify-audit-watch.js   (needs the Node build of better-sqlite3)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const catalogue = await load("src/main/services/auditWatch/catalogue.js");
const { detectiveControlsFromCatalogue, manualFromCatalogue } = await load("scripts/build-audit-watch-graph.js");
const { CHECKS, AREAS, SEVERITIES, READINESS, AREA_VISIBILITY } = catalogue;

let passed = 0;
let failed = 0;
let warnings = 0;
function check(name, ok, detail = "") {
  if (ok) passed += 1; else failed += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}
function warn(name, detail = "") {
  warnings += 1;
  console.log(`  WARN: ${name}${detail ? ` — ${detail}` : ""}`);
}

console.log("============================================================");
console.log("Audit Watch catalogue verification (AW-0)");
console.log("============================================================");

// ---- 1. Catalogue shape ----
const AREA_LETTER = { procurement: "P", sales: "S", inventory: "I", ledger: "G", it: "T" };
const areaIds = AREAS.map((area) => area.id);
check("Areas match the five buildable audit areas", isDeepStrictEqual([...areaIds].sort(), Object.keys(AREA_LETTER).sort()), areaIds.join(", "));
const ids = CHECKS.map((item) => item.id);
check("Check ids unique", new Set(ids).size === ids.length, `${ids.length} checks`);
const badId = CHECKS.filter((item) => !new RegExp(`^AW-${AREA_LETTER[item.area]}\\d{2}$`).test(item.id));
check("Check ids carry their area letter", badId.length === 0, badId.map((item) => item.id).join(", "));
const badEnum = CHECKS.filter((item) => !areaIds.includes(item.area) || !SEVERITIES.includes(item.severity) || !READINESS.includes(item.readiness));
check("Every check has a known area, severity and readiness", badEnum.length === 0, badEnum.map((item) => item.id).join(", "));
const badText = CHECKS.filter((item) => !item.title?.trim() || !item.meaning?.trim() || !item.nextStep?.trim());
check("Every check has a title, meaning and next step", badText.length === 0, badText.map((item) => item.id).join(", "));
const accusing = CHECKS.filter((item) => /\bfraud/i.test(`${item.title} ${item.meaning} ${item.nextStep}`));
check("No check wording accuses anyone of fraud", accusing.length === 0, accusing.map((item) => item.id).join(", "));
const UNITS = new Set(["days", "percent", "rupees", "count", "time"]);
const badLimits = CHECKS.flatMap((item) => Object.entries(item.limits).filter(([, limit]) => (
  !UNITS.has(limit.unit) || !limit.label?.trim()
  || (limit.unit === "time" ? !/^\d{2}:\d{2}$/.test(limit.default) : !(Number.isFinite(limit.default) && limit.default >= 0))
)).map(([key]) => `${item.id}.${key}`));
check("Every limit has a unit, a label and a valid default", badLimits.length === 0, badLimits.join(", "));
const noReads = CHECKS.filter((item) => !Object.keys(item.reads).length);
check("Every check names the tables it reads", noReads.length === 0, noReads.map((item) => item.id).join(", "));
const runnable = CHECKS.filter((item) => item.readiness === "now");
console.log(`  INFO: ${runnable.length} checks runnable now, ${CHECKS.length - runnable.length} waiting for the ACC programme`);

// ---- 2. AG-1 and KG-5 in step with the catalogue ----
const ag1 = JSON.parse(read("src/renderer/knowledge/audit-graph.json"));
check("AG-1 has a detectiveControls section", Boolean(ag1.detectiveControls));
check("AG-1 detectiveControls matches the catalogue", isDeepStrictEqual(ag1.detectiveControls, detectiveControlsFromCatalogue(catalogue)), "rebuild: node scripts/build-audit-watch-graph.js");
const manualPath = "docs/manuals/GII-GeM-ERP-Audit-Watch-Guide.md";
const manualText = fs.existsSync(path.join(ROOT, manualPath)) ? read(manualPath) : "";
check("KG-5 Audit Watch guide matches the catalogue", manualText === manualFromCatalogue(catalogue), manualPath);
const missingSections = CHECKS.filter((item) => !manualText.includes(`### ${item.id} ${item.title}`));
check("Every check has a section in the guide", missingSections.length === 0, missingSections.map((item) => item.id).join(", "));
const kg5 = JSON.parse(read("src/renderer/knowledge/manual-graph.json"));
const kg5Manual = (kg5.manuals || []).find((item) => item.manualId === "audit-watch-guide");
check("KG-5 lists the Audit Watch guide", Boolean(kg5Manual), kg5Manual ? `${kg5Manual.sectionCount} sections` : "run node scripts/build-manual-graph.js");
const guideHeadings = [...manualText.matchAll(/^## (.+)$/gm)].map((match) => match[1].trim());
const indexHeadings = (kg5Manual?.sections || []).map((section) => section.heading);
check("KG-5 section index matches the guide's headings", isDeepStrictEqual(indexHeadings, guideHeadings), `${guideHeadings.length} headings`);

// ---- 3. Every column a runnable check reads exists in a fresh database ----
const { initializeDatabase } = await load("src/main/database/init.js");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gii-audit-watch-verify-"));
let db;
try {
  db = initializeDatabase(tmp);
  const columnsOf = new Map();
  const columns = (table) => {
    if (!columnsOf.has(table)) columnsOf.set(table, new Set(db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all().map((row) => row.name)));
    return columnsOf.get(table);
  };
  const missing = [];
  for (const item of runnable) {
    for (const [table, cols] of Object.entries(item.reads)) {
      const have = columns(table);
      if (!have.size) { missing.push(`${item.id}: table ${table}`); continue; }
      cols.filter((col) => !have.has(col)).forEach((col) => missing.push(`${item.id}: ${table}.${col}`));
    }
  }
  check("Every runnable check reads real tables and columns", missing.length === 0, missing.length ? missing.join("; ") : `${runnable.length} checks`);
  CHECKS.filter((item) => item.readiness !== "now").forEach((item) => {
    const absent = Object.keys(item.reads).filter((table) => !columns(table).size);
    if (absent.length) warn(`${item.id} waits for tables not in this build`, absent.join(", "));
  });
} finally {
  db?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
const dg1Tables = new Set(JSON.parse(read("src/renderer/knowledge/database-graph.json")).tables.map((table) => table.tableName));
const notInDg1 = [...new Set(runnable.flatMap((item) => Object.keys(item.reads)))].filter((table) => !dg1Tables.has(table));
if (notInDg1.length) warn("Tables read by Audit Watch but not described in DG-1", notInDg1.join(", "));
else check("Every table Audit Watch reads is described in DG-1", true);

// ---- 3b. Every runnable check is implemented and has a planted-exception test ----
const { CHECK_FUNCTIONS } = await load("src/main/services/auditWatch/checks.js");
const unimplemented = runnable.filter((item) => typeof CHECK_FUNCTIONS[item.id] !== "function");
check("Every runnable check has a check function", unimplemented.length === 0, unimplemented.map((item) => item.id).join(", "));
const extra = Object.keys(CHECK_FUNCTIONS).filter((id) => !runnable.some((item) => item.id === id));
check("No check function runs outside the catalogue", extra.length === 0, extra.join(", "));
const testText = read("scripts/audit/audit-watch.test.mjs");
const untested = runnable.filter((item) => !new RegExp(`test\\("${item.id} `).test(testText));
check("Every runnable check has a planted-exception test", untested.length === 0, untested.map((item) => item.id).join(", "));

// ---- 4. Visibility roles follow the app's roles ----
const roleMatch = read("src/main/services/authService.js").match(/const ROLE_HIERARCHY = \[([^\]]+)\]/);
const appRoles = roleMatch ? [...roleMatch[1].matchAll(/"([a-z_]+)"/g)].map((match) => match[1]) : [];
check("Visibility covers exactly the app's roles", isDeepStrictEqual(Object.keys(AREA_VISIBILITY).sort(), [...appRoles].sort()), appRoles.join(", "));
const badVisibility = Object.entries(AREA_VISIBILITY).flatMap(([role, areas]) => areas.filter((area) => !areaIds.includes(area)).map((area) => `${role}:${area}`));
check("Visibility names only known areas", badVisibility.length === 0, badVisibility.join(", "));
check("Data entry operators and viewers see no area", AREA_VISIBILITY.data_entry_operator.length === 0 && AREA_VISIBILITY.viewer.length === 0);

console.log("------------------------------------------------------------");
console.log(`Audit Watch: ${passed} passed, ${warnings} warnings, ${failed} failed`);
console.log("============================================================");
process.exitCode = failed ? 1 : 0;
