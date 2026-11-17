// verify-audit-watch.js — Audit Watch catalogue verifier (AW-0).
//
// Fails when:
//   1. the check catalogue is malformed (ids, areas, severities, limits, wording);
//   2. AG-1 detectiveControls or the KG-5 Audit Watch guide are out of step with the
//      catalogue (rebuild with: node scripts/build-audit-watch-graph.js);
//   3. a runnable check reads a table or column the database does not have
//      (checked against a freshly initialised database, not a hand-kept list);
//   4. the KG-5 section index does not match the guide's headings;
//   5. the visibility roles drift from the app's role list;
//   6. posting code uses a source_module the posting-source registry does not classify,
//      or a ledger group / guided-voucher kind the checks name no longer exists (a new
//      posting path must never make a check go quiet unseen);
//   7. a check waiting for the ACC programme could already run (its tables or code
//      markers exist), or something a check says it does not cover yet has arrived;
//   8. a guided voucher kind is not classified as hand-keyed or document-style;
//   9. the graph registry's schema version for AG-1 or KG-5 differs from the schema file;
//  10. main-process code calls runAuditWatch directly (or under another name) instead of
//      through the runner;
//  11. AG-1 does not validate against its schema file;
//  12. verify:erp or the lock gate stops treating the Audit Watch steps as blocking;
//  13. inventoryService.js changed since auditWatch/stockBalances.js last restated
//      stockBalance's rules.
// The tables and columns each check actually reads are traced by the test suite
// (scripts/audit/audit-watch.test.mjs, last test) and compared with `reads` there.
// A table missing from DG-1 is reported as a warning (DG-1 is curated separately).
//
// Usage: node scripts/verify-audit-watch.js   (with the Node build of better-sqlite3), or
//        npm run verify:audit-watch:electron     (with the Electron build, as verify:erp does)

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
function listSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) listSourceFiles(rel, out); else if (/\.(js|cjs|mjs)$/.test(entry.name)) out.push(rel);
  }
  return out;
}
// Main-process code, without Audit Watch's own catalogue (which names what it waits for).
const sourceFilesText = () => listSourceFiles("src/main").filter((rel) => !rel.includes("auditWatch")).map(read).join("\n");

const catalogue = await load("src/main/services/auditWatch/catalogue.js");
const { detectiveControlsFromCatalogue, manualFromCatalogue } = await load("scripts/build-audit-watch-graph.js");
const { CHECKS, AREAS, SEVERITIES, READINESS, AREA_VISIBILITY } = catalogue;

let passed = 0;
let failed = 0;
// Fail closed: only the summary at the end can set a passing exit code, so a verifier
// that stops part-way never reads as a pass.
process.exitCode = 1;
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
const badMeta = CHECKS.filter((item) => !Number.isInteger(item.version) || item.version < 1 || !["company", "installation"].includes(item.scope)
  || (item.helpers && !item.helpers.every((helper) => ["stockBalances", "bookIntegrityChecks"].includes(helper))));
check("Every check has a version, a scope and known helpers", badMeta.length === 0, badMeta.map((item) => item.id).join(", "));
const installationOutsideIt = CHECKS.filter((item) => item.scope === "installation" && item.area !== "it");
check("Installation-wide checks sit in the admin-only users and access area", installationOutsideIt.length === 0, installationOutsideIt.map((item) => item.id).join(", "));
const noReads = CHECKS.filter((item) => !Object.keys(item.reads).length);
check("Every check names the tables it reads", noReads.length === 0, noReads.map((item) => item.id).join(", "));
const runnable = CHECKS.filter((item) => item.readiness === "now");
console.log(`  INFO: ${runnable.length} checks runnable now, ${CHECKS.length - runnable.length} waiting for the ACC programme`);

// ---- 2. AG-1 and KG-5 in step with the catalogue ----
const ag1 = JSON.parse(read("src/renderer/knowledge/audit-graph.json"));
check("AG-1 has a detectiveControls section", Boolean(ag1.detectiveControls));
{
  const { default: Ajv } = await import("ajv");
  const validate = new Ajv({ allErrors: true, strict: false, validateFormats: false }).compile(JSON.parse(read("repository/schema/audit-graph.schema.json")));
  const valid = validate(ag1);
  check("AG-1 validates against its schema", valid, valid ? "repository/schema/audit-graph.schema.json" : (validate.errors || []).slice(0, 5).map((error) => `${error.instancePath || "/"} ${error.message}`).join("; "));
}
{
  // Every field a catalogue entry carries reaches AG-1 (the builder copies named fields,
  // so a new one would otherwise be left out silently).
  const emitted = new Map((ag1.detectiveControls?.checks || []).map((entry) => [entry.checkId, entry]));
  const dropped = catalogue.CHECKS.flatMap((item) => Object.keys(item).filter((field) => field !== "id" && !(field in (emitted.get(item.id) || {}))).map((field) => `${item.id}.${field}`));
  check("Every catalogue field reaches AG-1", dropped.length === 0, dropped.length ? `add to scripts/build-audit-watch-graph.js and the AG-1 schema: ${dropped.join(", ")}` : `${emitted.size} checks`);
}
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
const { default: manualIndex } = await load("src/renderer/modules/erpBrain/data/manualIndex.js");
const indexed = (manualIndex["audit-watch-guide"] || []).map((section) => section.heading);
check("ERP Brain manual index lists the guide's sections", isDeepStrictEqual(indexed, guideHeadings), "src/renderer/modules/erpBrain/data/manualIndex.js");
const indexHeadings = (kg5Manual?.sections || []).map((section) => section.heading);
check("KG-5 section index matches the guide's headings", isDeepStrictEqual(indexHeadings, guideHeadings), `${guideHeadings.length} headings`);

// ---- 3. Every column a runnable check reads exists in a fresh database ----
const { initializeDatabase } = await load("src/main/database/init.js");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gii-audit-watch-verify-"));
let db;
const liveTables = new Set();
try {
  db = initializeDatabase(tmp);
  db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().forEach((row) => liveTables.add(row.name));
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
  // Once what a waiting check needs arrives, it must be switched on, not left "waiting".
  const mainCode = () => (mainCode.text ??= sourceFilesText());
  CHECKS.filter((item) => item.readiness !== "now").forEach((item) => {
    const waits = item.waitsFor || {};
    const missingTables = (waits.tables || []).filter((table) => !columns(table).size);
    const markers = waits.codeMarkers || [];
    const arrivedMarkers = markers.filter((marker) => mainCode().toLowerCase().includes(marker.toLowerCase()));
    const named = (waits.tables?.length || 0) + markers.length;
    check(`${item.id} names what it waits for, and it has not arrived`, named > 0 && (waits.tables?.length ? missingTables.length > 0 : true) && arrivedMarkers.length === 0,
      !named ? "add waitsFor to the catalogue entry" : `${missingTables.length ? `missing: ${missingTables.join(", ")}` : ""}${markers.length ? ` markers ${arrivedMarkers.length ? `now in src/main (${arrivedMarkers.join(", ")}): implement the check` : "not in src/main"}` : ""}`.trim());
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

// ---- 3c. Posting sources, ledger groups and guided kinds the checks rely on ----
const { POSTING_SOURCES, SOURCE_CLASSES, HAND_KEYED_GUIDED_KINDS, DOCUMENT_STYLE_GUIDED_KINDS } = await load("src/main/database/postingSources.js");
check("Every posting source has a known class", Object.values(POSTING_SOURCES).every((value) => SOURCE_CLASSES.includes(value)), `${Object.keys(POSTING_SOURCES).length} sources`);
const sourceFiles = listSourceFiles("src/main");
const initText = Object.assign(() => (initText.text ??= read("src/main/database/init.js")), { text: undefined });
const usedSources = new Set();
for (const rel of sourceFiles) {
  for (const match of read(rel).matchAll(/source_?[mM]odule(?:\s*[:=]|\s+IN\s*\(?)\s*["']([a-z_]+)["']/g)) usedSources.add(match[1]);
}
// Source names held in exported constants (for example ROUNDING_ADJUSTMENT_SOURCE in
// ledgerGuards.js) count as used too, so a new constant cannot slip past the scan.
for (const rel of sourceFiles) {
  for (const match of read(rel).matchAll(/export const [A-Z_]*SOURCE[A-Z_]*\s*=\s*["']([a-z_]+)["']/g)) usedSources.add(match[1]);
}
const unclassified = [...usedSources].filter((source) => !(source in POSTING_SOURCES));
check("Posting code uses only classified source modules", unclassified.length === 0, unclassified.length ? `classify in src/main/database/postingSources.js: ${unclassified.join(", ")}` : `${usedSources.size} used`);
// The graph registry gives the same schema version as the schema files of the graphs
// Audit Watch writes to (AI tools read the registry first).
const graphRegistry = JSON.parse(read("repository/graph-registry.json"));
const registryDrift = (graphRegistry.graphs || []).filter((entry) => ["AG-1", "KG-5"].includes(entry.graphId))
  .filter((entry) => JSON.parse(read(entry.schema)).schemaVersion !== entry.schemaVersion)
  .map((entry) => `${entry.graphId}: registry ${entry.schemaVersion}, schema ${JSON.parse(read(entry.schema)).schemaVersion}`);
check("Graph registry schema versions match the AG-1 and KG-5 schema files", registryDrift.length === 0, registryDrift.join("; "));

// Source read through a real parser (@babel/parser), so comments and strings are told
// apart from code: `codeOf` blanks out comments and the text of every string except
// import paths, `nameCount` counts identifiers, and `stringCount` counts import paths
// that contain a word. A file the parser cannot read fails the wiring check by name.
const { parse: babelParse } = await import("@babel/parser");
const parsed = new Map();
const unparsable = [];
function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach((child) => walk(child, visit)); return; }
  if (typeof node.type === "string") visit(node);
  for (const key of Object.keys(node)) if (!["loc", "start", "end", "leadingComments", "trailingComments", "innerComments", "tokens", "comments", "extra"].includes(key)) walk(node[key], visit);
}
function parsedFile(rel) {
  if (!parsed.has(rel)) {
    const text = read(rel);
    let ast;
    try {
      ast = babelParse(text, { sourceType: rel.endsWith(".cjs") ? "script" : "module", plugins: ["jsx", "topLevelAwait"], tokens: true, allowReturnOutsideFunction: true });
    } catch (error) {
      unparsable.push(`${rel}: ${error.message}`);
      ast = { program: { body: [] }, tokens: [], comments: [] };
    }
    // Import paths: static imports, re-exports and import().
    const importPaths = [];
    const memberNames = [];
    // Names bound to createRequire(...) (const load = createRequire(import.meta.url)).
    const requireNames = new Set(["require"]);
    // createRequire itself may be imported under another name.
    const createRequireNames = new Set(["createRequire"]);
    walk(ast.program, (node) => { if (node.type === "ImportSpecifier" && node.imported?.name === "createRequire") createRequireNames.add(node.local.name); });
    walk(ast.program, (node) => {
      const init = node.type === "VariableDeclarator" ? node.init : node.type === "AssignmentExpression" ? node.right : null;
      const target = node.type === "VariableDeclarator" ? node.id : node.type === "AssignmentExpression" ? node.left : null;
      const callee = init?.type === "CallExpression" ? init.callee : null;
      if (target?.type === "Identifier" && (createRequireNames.has(callee?.name) || (callee?.type === "MemberExpression" && callee.property?.name === "createRequire"))) requireNames.add(target.name);
    });
    walk(ast.program, (node) => {
      if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type) && node.source) importPaths.push(node.source);
      if (node.type === "ImportExpression" && node.source) importPaths.push(node.source);
      if (node.type === "CallExpression" && node.callee?.type === "Import" && node.arguments?.[0]) importPaths.push(node.arguments[0]);
      // require("...") and calls through a name bound to createRequire(...).
      if (node.type === "CallExpression" && node.callee?.type === "Identifier" && requireNames.has(node.callee.name) && node.arguments?.[0]?.type === "StringLiteral") importPaths.push(node.arguments[0]);
      // obj["name"] is a use of name, like obj.name.
      if ((node.type === "MemberExpression" || node.type === "OptionalMemberExpression") && node.computed && node.property?.type === "StringLiteral") memberNames.push(node.property.value);
    });
    const keep = new Set(importPaths.map((node) => node.start));
    const blanks = [
      ...(ast.comments || []).map((comment) => [comment.start, comment.end]),
      ...(ast.tokens || []).filter((token) => ["string", "template"].includes(token.type?.label) && !keep.has(token.start) && token.end - token.start > 0)
        .map((token) => (token.type.label === "string" ? [token.start + 1, token.end - 1] : [token.start, token.end]))
    ];
    const blank = (from, ranges) => {
      let out = from;
      for (const [start, end] of ranges) out = out.slice(0, start) + out.slice(start, end).replace(/[^\n]/g, " ") + out.slice(end);
      return out;
    };
    const commentRanges = (ast.comments || []).map((comment) => [comment.start, comment.end]);
    // `code`: comments and non-import strings blanked (for counting uses);
    // `commentFree`: only comments blanked (strings such as SQL are kept, for hashing).
    const code = blank(text, blanks);
    const commentFree = blank(text, commentRanges);
    const importText = importPaths.map((node) => String(node.value ?? ""));
    parsed.set(rel, { ast, code, commentFree, importText, memberNames });
  }
  return parsed.get(rel);
}
const codeOf = (rel) => parsedFile(rel).code;
const commentFreeOf = (rel) => parsedFile(rel).commentFree;
const nameCount = (rel, word) => parsedFile(rel).ast.tokens.filter((token) => token.type?.label === "name" && token.value === word).length
  + parsedFile(rel).memberNames.filter((name) => name === word).length;
const stringCount = (rel, word) => parsedFile(rel).importText.filter((value) => value.includes(word)).length;

// One way in: main-process code runs Audit Watch through the runner (worker thread),
// never by calling runAuditWatch directly, so a later caller cannot block the app.
const allowedCallers = new Set(["src/main/main.js", "src/main/database/init.js", "src/main/services/auditWatch/auditWatchWorker.js", "src/main/services/auditWatch/auditWatchService.js"]);
// Worker URLs are strings, so this one reads strings too.
const workerNamers = sourceFiles.filter((rel) => rel !== "src/main/services/auditWatch/auditWatchRunner.js" && rel !== "src/main/services/auditWatch/auditWatchWorker.js" && /auditWatchWorker/.test(commentFreeOf(rel)));
const directCallers = sourceFiles.filter((rel) => (!allowedCallers.has(rel) && /\brunAuditWatch\b/.test(codeOf(rel)))
  // The check functions are run only by the service; the worker file only by the runner;
  // and the runner is never imported under another name.
  || (!["src/main/services/auditWatch/checks.js", "src/main/services/auditWatch/auditWatchService.js"].includes(rel) && /\bCHECK_FUNCTIONS\b/.test(codeOf(rel)))
  || /\bcreateAuditWatchRunner\s*(?:as\b|:)/.test(codeOf(rel))
  // No renamed import or destructuring of runAuditWatch anywhere, main.js included.
  || /\brunAuditWatch\s*(?:as\b|:)/.test(codeOf(rel)));
const mainCalls = [...codeOf("src/main/main.js").matchAll(/\brunAuditWatch\s*\(/g)].length;
// One runner, so its lock (which restore and reset also wait on) sees every run.
const runnerMakers = sourceFiles.flatMap((rel) => [...codeOf(rel).matchAll(/\bcreateAuditWatchRunner\s*\(/g)].map(() => rel))
  .filter((rel) => rel !== "src/main/services/auditWatch/auditWatchRunner.js");
check("Only the runner calls runAuditWatch in the main process", directCallers.length === 0 && workerNamers.length === 0 && mainCalls === 1 && runnerMakers.length === 1 && runnerMakers[0] === "src/main/main.js",
  directCallers.length ? `use the runner in: ${directCallers.join(", ")}` : workerNamers.length ? `names auditWatchWorker (only the runner may, even in a string): ${workerNamers.join(", ")}` : runnerMakers.length !== 1 ? `one runner only, in main.js; found in: ${runnerMakers.join(", ") || "nowhere"}` : `main.js calls it ${mainCalls} time(s), as the runner's in-process fallback`);
const registryText = read("src/main/database/accountMappingRegistry.js");
const knownGroups = new Set([...registryText.matchAll(/^\s*\["([A-Z_]+)", "[^"]+", (?:"[A-Z_]+"|null)/gm)].map((match) => match[1]));
const checksModule = await load("src/main/services/auditWatch/checks.js");
const namedGroups = [...checksModule.SENSITIVE_GROUPS, ...checksModule.CLEARING_GROUPS, ...checksModule.CASH_GROUPS];
const unknownGroups = namedGroups.filter((code) => !knownGroups.has(code));
check("Ledger groups named by the checks exist in the account-group registry", unknownGroups.length === 0, unknownGroups.length ? unknownGroups.join(", ") : `${new Set(namedGroups).size} groups`);
// Every guided voucher kind the posting code handles must be classified as hand-keyed
// (a free journal, looked at by G01 and G03) or document-style; a new kind (for example
// a document credit note from the ACC programme) fails here until someone decides which
// checks should cover it.
const codeKinds = new Set();
for (const match of initText().matchAll(/\[((?:\s*"[a-z_]+"\s*,?)+)\]\.includes\(kind\)/g)) {
  for (const kind of match[1].matchAll(/"([a-z_]+)"/g)) codeKinds.add(kind[1]);
}
for (const match of initText().matchAll(/\bkind === "([a-z_]+)"/g)) codeKinds.add(match[1]);
for (const match of initText().matchAll(/\bcase "([a-z_]+)"\s*:/g)) codeKinds.add(match[1]);
const classifiedKinds = new Set([...HAND_KEYED_GUIDED_KINDS, ...DOCUMENT_STYLE_GUIDED_KINDS]);
const unclassifiedKinds = [...codeKinds].filter((kind) => !classifiedKinds.has(kind));
const goneKinds = [...classifiedKinds].filter((kind) => !codeKinds.has(kind));
check("Every guided voucher kind is classified as hand-keyed or document-style", codeKinds.size > 0 && unclassifiedKinds.length === 0 && goneKinds.length === 0,
  unclassifiedKinds.length ? `classify in src/main/database/postingSources.js: ${unclassifiedKinds.join(", ")}` : goneKinds.length ? `no longer in init.js: ${goneKinds.join(", ")}` : `${codeKinds.size} kinds`);
const overlap = HAND_KEYED_GUIDED_KINDS.filter((kind) => DOCUMENT_STYLE_GUIDED_KINDS.includes(kind));
check("No guided kind is both hand-keyed and document-style", overlap.length === 0, overlap.join(", "));
// A check that names what it does not cover yet (a posting source, table or guided
// voucher kind whose name matches) fails here once that arrives.
const allSourceNames = new Set([...usedSources, ...Object.keys(POSTING_SOURCES)]);
for (const item of CHECKS.filter((entry) => entry.uncovered)) {
  const pattern = new RegExp(item.uncovered.namePattern, "i");
  // Kinds the check reads excuse guided kinds only, so a posting source or table named
  // like one still fails until the check really reads it. Anything else needs a reason.
  const coveredKinds = new Set(item.readsGuidedKinds || []);
  const notInScope = item.uncovered.notSalesCredit || {};
  const badReasons = Object.entries(notInScope).filter(([, reason]) => typeof reason !== "string" || reason.trim().length < 10).map(([name]) => name);
  const arrived = [
    ...[...new Set([...allSourceNames, ...liveTables])].filter((name) => pattern.test(name) && !(name in notInScope)),
    ...[...codeKinds].filter((kind) => pattern.test(kind) && !coveredKinds.has(kind) && !(kind in notInScope))
  ];
  // A kind the check says it reads must be a real guided kind.
  const unknownRead = [...coveredKinds].filter((kind) => !codeKinds.has(kind));
  if (unknownRead.length) arrived.push(...unknownRead.map((kind) => `${kind} (readsGuidedKinds names a kind the posting code does not handle)`));
  if (badReasons.length) arrived.push(...badReasons.map((name) => `${name} (no reason given)`));
  check(`${item.id}: nothing it does not cover has arrived`, arrived.length === 0,
    arrived.length ? `now present: ${arrived.join(", ")}; extend ${item.id} to cover it (or list it as not relevant), then update its coverage` : `covers ${(item.coverage || []).join(", ")}`);
}

// ---- Exact wiring: who may name the service, the runner and runAuditWatch, and how often ----
{
  // Identifiers for the functions, string literals (import paths) for the modules;
  // comments never count.
  const tokens = (rel, word) => (/^create|^run/.test(word) ? nameCount(rel, word) : nameCount(rel, word) + stringCount(rel, word));
  const expected = {
    // file: { token: exact count } — anything else in src/main naming these fails.
    "src/main/main.js": { runAuditWatch: 2, createAuditWatchRunner: 2, auditWatchRunner: null, createAuditWatchService: 0, auditWatchService: 0 },
    "src/main/database/init.js": { runAuditWatch: 2, createAuditWatchService: 2, auditWatchService: 1, createAuditWatchRunner: 0, auditWatchRunner: 0 },
    "src/main/services/auditWatch/auditWatchWorker.js": { runAuditWatch: 2, createAuditWatchService: 0, createAuditWatchRunner: 0 }
  };
  const owned = new Set(["src/main/services/auditWatch/auditWatchService.js", "src/main/services/auditWatch/auditWatchRunner.js", "src/main/services/auditWatch/checks.js", "src/main/services/auditWatch/catalogue.js", "src/main/services/auditWatch/stockBalances.js"]);
  const words = ["runAuditWatch", "createAuditWatchService", "createAuditWatchRunner", "auditWatchService", "auditWatchRunner"];
  const wrong = sourceFiles.filter((rel) => !owned.has(rel)).flatMap((rel) => words.flatMap((word) => {
    const want = expected[rel] ? (word in expected[rel] ? expected[rel][word] : null) : 0;
    if (want === null) return [];
    const have = tokens(rel, word);
    return have === want ? [] : [`${rel}: ${word} ${have} (expected ${want})`];
  }));
  wrong.push(...unparsable.map((problem) => `cannot parse ${problem}`));
  check("Audit Watch is wired in exactly one way (service in init.js, runner in main.js)", wrong.length === 0, wrong.length ? wrong.join("; ") : "init.js, main.js, worker");
}

// ---- stockBalances.js restates stockBalance's rules: pin the original's source ----
// The whole of inventoryService.js is pinned, not just stockBalance, because the rules
// can move into helpers or constants that stockBalance calls. Only whitespace is ignored.
// The message says whether stockBalance itself changed and how to see the change.
{
  const rel = "src/main/services/inventoryService.js";
  const text = read(rel);
  const hash = crypto.createHash("sha256").update(text.replace(/\s+/g, " ").trim()).digest("hex");
  const functionSource = (name) => {
    const node = [];
    const visit = (value) => {
      if (!value || typeof value !== "object") return;
      if (value.type === "FunctionDeclaration" && value.id?.name === name) node.push(value);
      for (const key of Object.keys(value)) if (!["loc", "start", "end", "leadingComments", "trailingComments", "innerComments"].includes(key)) visit(value[key]);
    };
    visit(parsedFile(rel).ast.program);
    // Comments are left out; strings (the SQL that holds the rules) are kept.
    return node[0] ? commentFreeOf(rel).slice(node[0].start, node[0].end).replace(/\s+/g, " ").trim() : "missing";
  };
  const functionTexts = ["openingWarehouseId", "stockBalance"].map(functionSource);
  // Self-check: the hashed text must hold the SQL, or rule changes inside it would read
  // as "unchanged".
  check("The stockBalance pin hashes the functions with their SQL", functionTexts.every((textOf) => /SELECT .*FROM/i.test(textOf)),
    functionTexts.every((textOf) => /SELECT .*FROM/i.test(textOf)) ? "openingWarehouseId and stockBalance include their queries"
      : `${["openingWarehouseId", "stockBalance"].filter((name, i) => functionTexts[i] === "missing").map((name) => `${name} is not a function declaration in ${rel}`).join("; ") || "a function's text has no query"}: the pin cannot see its rules`);
  const functionsHash = crypto.createHash("sha256").update(functionTexts.join("\n")).digest("hex");
  const pin = await load("src/main/services/auditWatch/stockBalances.js");
  const functionsSame = functionsHash === pin.STOCK_BALANCE_FUNCTIONS_SHA256;
  const same = hash === pin.STOCK_BALANCE_SOURCE_SHA256 && functionsSame;
  // The recorded commit must be a full commit id whose inventoryService.js has the pinned
  // whole-file hash (checked when git and that commit are available).
  let pinWarning = "";
  let commitProblem = /^[0-9a-f]{40}$/.test(String(pin.STOCK_BALANCE_CHECKED_AT)) ? "" : "STOCK_BALANCE_CHECKED_AT must be a full 40-character commit id";
  if (!commitProblem) {
    const { execFileSync } = await import("node:child_process");
    const { realpathSync } = await import("node:fs");
    const git = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
    // Only ROOT's own repository counts: a copy without .git inside another repository
    // (vendored or unpacked) must not be checked against that other repository.
    let ownRepo = false;
    try { ownRepo = realpathSync(git(["rev-parse", "--show-toplevel"]).trim()) === realpathSync(ROOT); } catch { ownRepo = false; }
    if (!ownRepo) pinWarning = "no git repository of its own (git missing, or a copy without .git): the pinned commit could not be checked; the hashes were";
    else {
      let hasCommit = false;
      try { git(["cat-file", "-e", `${pin.STOCK_BALANCE_CHECKED_AT}^{commit}`]); hasCommit = true; } catch { hasCommit = false; }
      if (hasCommit) {
        let atCommit = null;
        try { atCommit = git(["show", `${pin.STOCK_BALANCE_CHECKED_AT}:${rel}`]); } catch { atCommit = null; }
        if (atCommit === null) commitProblem = `commit ${pin.STOCK_BALANCE_CHECKED_AT} has no ${rel}`;
        else if (crypto.createHash("sha256").update(atCommit.replace(/\s+/g, " ").trim()).digest("hex") !== pin.STOCK_BALANCE_SOURCE_SHA256) commitProblem = `STOCK_BALANCE_SOURCE_SHA256 is not the hash of ${rel} at ${pin.STOCK_BALANCE_CHECKED_AT}`;
      } else {
        // A shallow clone may simply not have fetched it; a full clone without it has a
        // wrong id, or one lost to a squash.
        let shallow = null;
        try { shallow = git(["rev-parse", "--is-shallow-repository"]).trim() === "true"; } catch { shallow = null; }
        if (shallow === false) commitProblem = `commit ${pin.STOCK_BALANCE_CHECKED_AT} is not in this repository (record a commit that is on main)`;
        else pinWarning = "shallow clone: the pinned commit could not be checked; the hashes were";
      }
    }
  }
  if (pinWarning) warn("stockBalances.js pin commit not checked", pinWarning);
  check("stockBalances.js pin names a real commit and agrees with it", !commitProblem, commitProblem || (pinWarning ? "hashes only (see warning)" : `${rel} at ${pin.STOCK_BALANCE_CHECKED_AT.slice(0, 7)}`));
  check("stockBalances.js matches the current inventoryService.js", same, same ? `${rel} as checked at ${pin.STOCK_BALANCE_CHECKED_AT.slice(0, 7)}` : [
    hash === pin.STOCK_BALANCE_SOURCE_SHA256 ? `${rel} is unchanged, but STOCK_BALANCE_FUNCTIONS_SHA256 is stale.` : `${rel} changed since ${pin.STOCK_BALANCE_CHECKED_AT}.`,
    functionsSame ? "stockBalance and openingWarehouseId themselves are unchanged; check that no helper or constant they use changed."
      : "stockBalance or openingWarehouseId itself changed: restate its rules in src/main/services/auditWatch/stockBalances.js and extend the parity test.",
    `See: git diff ${pin.STOCK_BALANCE_CHECKED_AT} -- ${rel}.`,
    `Then set STOCK_BALANCE_SOURCE_SHA256 = "${hash}", STOCK_BALANCE_FUNCTIONS_SHA256 = "${functionsHash}" and STOCK_BALANCE_CHECKED_AT to the commit you checked.`
  ].join(" "));
}

// ---- The Audit Watch steps stay blocking in verify:erp and the lock gate ----
{
  const { LOCK_BLOCKING_STEPS, STRICT_STEPS, strictExitCode } = await load("scripts/lib/masterVerificationPolicy.js");
  // Read verify-erp.js's PIPELINE from its syntax tree (nothing is run) and look at the
  // step objects themselves, so layout, comments and extra fields do not matter.
  // Strictness is keyed on the step name (STRICT_STEPS), so what the runner does with its
  // step objects cannot loosen it; the checks below only make sure the steps are there as
  // written and that the run loop applies strictExitCode to every step of PIPELINE.
  let pipeline = [];
  let pipelineProblem = "";
  try {
    const { readVerifyErpPipeline } = await load("scripts/lib/verifyErpRules.mjs");
    pipeline = readVerifyErpPipeline(read("scripts/verify-erp.js"));
  } catch (error) {
    pipelineProblem = `could not read PIPELINE in scripts/verify-erp.js: ${error.message}`;
  }
  const missing = ["verify:audit-watch", "test:audit-watch"].filter((name) => {
    const steps = pipeline.filter((step) => step?.name === name);
    const step = steps[0];
    return !LOCK_BLOCKING_STEPS.has(name) || !STRICT_STEPS.has(name) || steps.length !== 1 || step.unreadable || step.frozenStep !== true
      || JSON.stringify(step.continueOn) !== "[0]" || step.cmd !== `npm run ${name}:electron` || step.warningValidator !== undefined;
  });
  // And the npm scripts those steps run do exactly what they say: the whole suite and the
  // whole verifier on Electron's Node, with nothing that filters tests or hides a failure.
  const scripts = JSON.parse(read("package.json")).scripts || {};
  const wantScripts = {
    "verify:audit-watch": "node scripts/verify-audit-watch.js",
    "verify:audit-watch:electron": "node scripts/lib/run-as-electron-node.mjs scripts/verify-audit-watch.js",
    "test:audit-watch": "node --test scripts/audit/audit-watch.test.mjs",
    "test:audit-watch:electron": "node scripts/lib/run-as-electron-node.mjs --test scripts/audit/audit-watch.test.mjs"
  };
  Object.entries(wantScripts).filter(([name, cmd]) => scripts[name] !== cmd).forEach(([name]) => missing.push(`${name} (package.json script changed)`));
  check("verify:erp runs both Audit Watch steps as strict, lock-blocking steps", !pipelineProblem && missing.length === 0,
    pipelineProblem || (missing.length ? `each must be one step Object.freeze({ name, cmd: \`\${NPM} run <name>:electron\`, continueOn: [0] }) in scripts/verify-erp.js, and in LOCK_BLOCKING_STEPS and STRICT_STEPS: ${missing.join(", ")}` : "verify:audit-watch, test:audit-watch"));
  // strictExitCode turns every non-zero exit of a strict step into at least a FAIL.
  const strictCases = [[0, 0], [1, 2], [2, 2], [3, 3], [-1, 3], [null, 3]];
  const strictWrong = ["verify:audit-watch", "test:audit-watch"].flatMap((name) => strictCases.filter(([given, want]) => strictExitCode(name, given) !== want).map(([given]) => `${name}:${given}`));
  if (strictExitCode("verify:knowledge", 1) !== 1) strictWrong.push("a non-strict step's warning was changed");
  check("strictExitCode turns any non-zero exit of an Audit Watch step into a FAIL", strictWrong.length === 0, strictWrong.join(", ") || "1 becomes 2; 2 and 3 stay");
}

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
