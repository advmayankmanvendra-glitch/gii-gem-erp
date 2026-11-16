import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { BackupValidationError, backupPathFromName, createBackup, validateBackupFile } from "./backup.js";
import * as init from "../database/init.js";
import { paise, rupees } from "../domain/money.js";

const require = createRequire(import.meta.url);

// Owner's rule (16 Nov 2026 IST): a company reset clears its opening balances. Where a
// backup exists they come back through the backup route (this service); where none
// exists they are entered by hand (Accounting > Opening Balances, Party Opening Balances).
// Each opening is re-posted through the same functions as hand entry, so it gets a new
// voucher and the same checks (open year, active accounts, ledger guards).

export class OpeningBalanceRestoreError extends Error {
  constructor(message) { super(message); this.name = "OpeningBalanceRestoreError"; }
}

// Party masters are shared by all companies and kept on reset. Only these party types
// can be restored; anything else in a backup blocks the restore.
const PARTY_TABLES = {
  department: { table: "government_departments", name: "department_name" },
  supplier: { table: "suppliers", name: "supplier_name" },
  employee: { table: "employees", name: "employee_name" }
};
// The backup tables read here must be real tables with plain columns: a view or a
// generated column in a crafted file could hang the app or exhaust memory.
const SOURCE_TABLES = ["companies", "opening_balances", "vouchers", "voucher_lines", "financial_years", "accounts", ...Object.values(PARTY_TABLES).map((p) => p.table)];
const MAX_OPENINGS = 5000;
const MAX_LINES_PER_VOUCHER = 10;

class DryRunRollback extends Error {}

function positiveId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new OpeningBalanceRestoreError(`${label} is required.`);
  return id;
}

function refuse(reason) {
  throw new OpeningBalanceRestoreError(`Opening balances not restored: ${reason} Nothing was changed.`);
}

// Resolves the name to a regular .db file that really sits in the backups folder
// (symbolic links that lead elsewhere are refused) and returns its path and fingerprint.
function resolveBackup(root, backupName) {
  const name = String(backupName || "").trim();
  if (!name) throw new OpeningBalanceRestoreError("Pick a backup to restore opening balances from.");
  let resolved;
  try {
    ({ resolved } = backupPathFromName(name, root));
  } catch (error) {
    if (error instanceof BackupValidationError) refuse(error.message.replace(/^Restore refused:\s*/, "").replace(/\s*Pick a backup.*$/, "").trim() + " Pick a backup from the list.");
    throw error;
  }
  const folder = fs.realpathSync(path.join(root, "backups"));
  let real;
  try { real = fs.realpathSync(resolved); } catch { refuse(`backup "${name}" was not found.`); }
  if (path.dirname(real) !== folder || !name.toLowerCase().endsWith(".db") || !fs.statSync(real).isFile()) {
    refuse(`"${name}" is not a backup file in the backups folder. Pick a backup from the list.`);
  }
  try {
    validateBackupFile(real, name);
  } catch (error) {
    if (error instanceof BackupValidationError) refuse(error.message.replace(/^Restore refused:\s*/, "").replace(/\s*The live database was not changed\..*$/, ""));
    throw error;
  }
  const fingerprint = crypto.createHash("sha256").update(fs.readFileSync(real)).digest("hex");
  return { name, real, fingerprint };
}

function openSource(real, name) {
  const Database = require("better-sqlite3");
  const source = new Database(real, { readonly: true, fileMustExist: true });
  try {
    source.pragma("trusted_schema = OFF");
    const kinds = new Map(source.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view')").all().map((row) => [row.name, row.type]));
    const missing = SOURCE_TABLES.filter((table) => kinds.get(table) !== "table");
    if (missing.length) refuse(`backup "${name}" is from an older or different version (missing tables: ${missing.join(", ")}).`);
    const generated = SOURCE_TABLES.filter((table) => source.prepare(`PRAGMA table_xinfo("${table}")`).all().some((col) => Number(col.hidden) !== 0));
    if (generated.length) refuse(`backup "${name}" has computed columns in ${generated.join(", ")}, which a real ERP backup never has.`);
    return source;
  } catch (error) {
    source.close();
    throw error;
  }
}

function columns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map((row) => row.name));
}

// Paise columns are the source of truth; rupee columns are read only from backups taken
// before the paise columns existed (or rows the paise backfill had not reached).
function openingAmounts(row, hasMinor) {
  const debitMinor = hasMinor ? Number(row.opening_debit_minor || 0) : 0;
  const creditMinor = hasMinor ? Number(row.opening_credit_minor || 0) : 0;
  if (hasMinor && (debitMinor || creditMinor)) return { debitMinor, creditMinor };
  return { debitMinor: paise(row.opening_debit), creditMinor: paise(row.opening_credit) };
}

function buildPlan(db, source, company, name) {
  const id = company.id;
  const blockers = [];
  const sourceCompany = source.prepare("SELECT id, company_name FROM companies WHERE id = ?").get(id);
  if (!sourceCompany || sourceCompany.company_name !== company.company_name) {
    blockers.push(`The backup does not hold "${company.company_name}" under the same company number and name, so its opening balances cannot be matched.`);
  }
  const existing = db.prepare("SELECT COUNT(*) AS n FROM opening_balances WHERE company_id = ?").get(id).n;
  if (existing > 0) {
    blockers.push(`"${company.company_name}" already has ${existing} opening balance(s). Restoring would enter them twice. Restore only works on a company with no opening balances, such as one just reset.`);
  }
  if (!sourceCompany) return { blockers, plan: [] };

  const count = source.prepare("SELECT COUNT(*) AS n FROM opening_balances WHERE company_id = ?").get(id).n;
  if (count > MAX_OPENINGS) refuse(`the backup holds ${count} opening balances for this company, more than the ${MAX_OPENINGS} this screen restores at once.`);

  const hasMinor = columns(source, "opening_balances").has("opening_debit_minor") && columns(source, "opening_balances").has("opening_credit_minor");
  const vCols = columns(source, "vouchers");
  const rows = source.prepare(`SELECT id, financial_year_id, balance_type, account_id, opening_debit, opening_credit, voucher_id, remarks${hasMinor ? ", opening_debit_minor, opening_credit_minor" : ""} FROM opening_balances WHERE company_id = ? ORDER BY id`).all(id);
  const voucherOf = source.prepare(`SELECT id, voucher_date, narration, status, ${vCols.has("is_deleted") ? "is_deleted" : "0 AS is_deleted"} FROM vouchers WHERE id = ? AND company_id = ?`);
  const linesOf = source.prepare(`SELECT account_id, debit, credit, linked_party_type, linked_party_id FROM voucher_lines WHERE voucher_id = ? ORDER BY id LIMIT ${MAX_LINES_PER_VOUCHER + 1}`);
  const sourceYear = source.prepare("SELECT id, financial_year_name FROM financial_years WHERE id = ? AND company_id = ?");
  const sourceAccount = source.prepare("SELECT id, account_name FROM accounts WHERE id = ? AND company_id = ?");
  const liveYear = db.prepare("SELECT id, financial_year_name, status, start_date, end_date FROM financial_years WHERE id = ? AND company_id = ?");
  const liveAccount = db.prepare("SELECT id, account_name FROM accounts WHERE id = ? AND company_id = ? AND COALESCE(is_deleted, 0) = 0");

  const plan = rows.map((row) => {
    const { debitMinor, creditMinor } = openingAmounts(row, hasMinor);
    const voucher = row.voucher_id ? voucherOf.get(row.voucher_id, id) : null;
    const lines = voucher ? linesOf.all(voucher.id) : [];
    const partyLine = lines.find((line) => line.linked_party_type != null && line.linked_party_id != null) || null;
    const accountLine = lines.find((line) => line.account_id === row.account_id) || null;
    const item = {
      sourceId: row.id,
      kind: partyLine ? "party" : "account",
      balanceType: row.balance_type,
      partyType: partyLine?.linked_party_type || null,
      partyId: partyLine?.linked_party_id || null,
      partyName: null,
      accountId: row.account_id,
      financialYearId: row.financial_year_id,
      date: voucher?.voucher_date || null,
      debitMinor,
      creditMinor,
      debit: rupees(debitMinor),
      credit: rupees(creditMinor),
      remarks: row.remarks || "",
      problem: null
    };
    const yearInBackup = sourceYear.get(row.financial_year_id, id);
    const year = liveYear.get(row.financial_year_id, id);
    const account = row.account_id ? liveAccount.get(row.account_id, id) : null;
    const accountInBackup = row.account_id ? sourceAccount.get(row.account_id, id) : null;
    item.financialYear = year?.financial_year_name || yearInBackup?.financial_year_name || null;
    item.accountName = account?.account_name || accountInBackup?.account_name || null;

    // Only an opening that was taken out of the books before the backup is skipped;
    // anything else that cannot be restored exactly blocks the whole restore.
    if (!voucher || voucher.status !== "Posted" || Number(voucher.is_deleted)) { item.problem = "skip: its voucher was not posted in the backup (reversed, deleted or missing)"; return item; }
    if ((debitMinor > 0) === (creditMinor > 0) || debitMinor < 0 || creditMinor < 0) { item.problem = "blocked: it has no single positive debit or credit amount"; return item; }
    if (lines.length !== 2 || !accountLine || paise(accountLine.debit) !== debitMinor || paise(accountLine.credit) !== creditMinor) { item.problem = "blocked: its amount does not match its voucher in the backup"; return item; }
    if (!year || !yearInBackup || year.financial_year_name !== yearInBackup.financial_year_name) { item.problem = "blocked: its financial year is not in the live books"; return item; }
    if (year.status !== "Open") { item.problem = `blocked: financial year ${year.financial_year_name} is ${year.status}; reopen it from Financial Years first`; return item; }
    if (!account || !accountInBackup || account.account_name !== accountInBackup.account_name) { item.problem = "blocked: its ledger account is not in the live chart of accounts"; return item; }
    if (item.kind === "party") {
      const party = PARTY_TABLES[item.partyType];
      if (!party) { item.problem = `blocked: party type "${item.partyType}" cannot be restored; enter it by hand`; return item; }
      const live = db.prepare(`SELECT ${party.name} AS name FROM "${party.table}" WHERE id = ?`).get(item.partyId);
      const inBackup = source.prepare(`SELECT ${party.name} AS name FROM "${party.table}" WHERE id = ?`).get(item.partyId);
      item.partyName = live?.name || inBackup?.name || null;
      if (!live || !inBackup || live.name !== inBackup.name) { item.problem = `blocked: the ${item.partyType} it belongs to is not the same in the live masters`; return item; }
      if (!item.date || item.date < year.start_date || item.date > year.end_date) { item.problem = "blocked: its date is outside its financial year"; return item; }
    }
    return item;
  });
  plan.filter((item) => item.problem?.startsWith("blocked")).forEach((item) => {
    blockers.push(`Opening balance #${item.sourceId} (${item.accountName || "account"}): ${item.problem.replace(/^blocked: /, "")}.`);
  });
  return { blockers, plan };
}

function postOne(db, companyId, item, userId) {
  if (item.kind === "party") {
    return init.createPartyOpeningBalance(db, {
      company_id: companyId,
      party_type: item.partyType,
      party_id: item.partyId,
      financial_year_id: item.financialYearId,
      opening_date: item.date,
      opening_debit: item.debit,
      opening_credit: item.credit,
      // An empty remark stays empty; the voucher then gets the standard narration.
      narration: item.remarks || undefined,
      created_by: userId
    });
  }
  return init.createOpeningBalance(db, {
    company_id: companyId,
    financial_year_id: item.financialYearId,
    balance_type: item.balanceType,
    account_id: item.accountId,
    opening_debit: item.debit,
    opening_credit: item.credit,
    remarks: item.remarks,
    created_by: userId
  });
}

function summarize(company, backup, plan, blockers) {
  const ready = plan.filter((item) => !item.problem);
  return {
    company: { id: company.id, name: company.company_name },
    backup: backup.name,
    fingerprint: backup.fingerprint,
    rows: plan,
    ready: ready.length,
    skipped: plan.filter((item) => item.problem?.startsWith("skip")).length,
    totals: {
      debit: rupees(ready.reduce((sum, item) => sum + item.debitMinor, 0)),
      credit: rupees(ready.reduce((sum, item) => sum + item.creditMinor, 0))
    },
    blockers,
    canRestore: blockers.length === 0 && ready.length > 0
  };
}

function loadCompany(db, companyId) {
  const id = positiveId(companyId, "Company");
  const company = db.prepare("SELECT id, company_name FROM companies WHERE id = ?").get(id);
  if (!company) throw new OpeningBalanceRestoreError(`Company #${id} does not exist.`);
  return company;
}

// Reads the backup's opening balances for the company, checks each against the live
// books, then posts them inside a transaction that is rolled back, so "ready" means the
// restore will go through.
export function previewOpeningBalanceRestore(db, root, { companyId, backup } = {}) {
  const company = loadCompany(db, companyId);
  const file = resolveBackup(root, backup);
  const source = openSource(file.real, file.name);
  let built;
  try { built = buildPlan(db, source, company, file.name); } finally { source.close(); }
  const { plan, blockers } = built;
  if (!blockers.length) {
    try {
      db.transaction(() => {
        plan.filter((item) => !item.problem).forEach((item) => {
          try { postOne(db, company.id, item, null); } catch (error) {
            blockers.push(`Opening balance #${item.sourceId} (${item.accountName || "account"}) cannot be posted: ${error.message}`);
            item.problem = "blocked: it cannot be posted (see above)";
          }
        });
        throw new DryRunRollback();
      })();
    } catch (error) {
      if (!(error instanceof DryRunRollback)) throw error;
    }
  }
  return summarize(company, file, plan, blockers);
}

// Re-posts the backup's opening balances in one transaction, after a safety backup.
// expected (from the preview the user saw) must still match: same file, count and totals.
export function restoreOpeningBalancesFromBackup(db, root, { companyId, backup, expected = null, userId = null } = {}) {
  const company = loadCompany(db, companyId);
  const file = resolveBackup(root, backup);
  const source = openSource(file.real, file.name);
  let built;
  try { built = buildPlan(db, source, company, file.name); } finally { source.close(); }
  const preview = summarize(company, file, built.plan, built.blockers);
  if (!preview.canRestore) refuse(preview.blockers.length ? preview.blockers.join(" ") : "the backup holds no posted opening balances for this company.");
  if (expected && (expected.fingerprint !== file.fingerprint || Number(expected.ready) !== preview.ready
    || paise(expected.totals?.debit) !== paise(preview.totals.debit) || paise(expected.totals?.credit) !== paise(preview.totals.credit))) {
    refuse("the backup or the books changed since you checked it. Check the backup again.");
  }
  const safety = createBackup(root, db, "pre_opening_restore");
  const created = [];
  try {
    db.transaction(() => {
      built.plan.filter((item) => !item.problem).forEach((item) => {
        const row = postOne(db, company.id, item, userId);
        created.push({ sourceId: item.sourceId, id: row.id, voucherId: row.voucher_id });
      });
      init.auditLog(db, {
        company_id: company.id,
        user_id: userId,
        action: "opening_balances_restored",
        module: "opening_balances",
        table_name: "opening_balances",
        new_value: JSON.stringify({ backup: file.name, backupSha256: file.fingerprint, safetyBackup: safety.fileName, restored: created.length, skipped: preview.skipped, totals: preview.totals, created })
      });
    })();
  } catch (error) {
    refuse(`posting failed (${error.message}). A safety backup ${safety.fileName} was taken before the attempt.`);
  }
  return { restored: created.length, skipped: preview.skipped, totals: preview.totals, backup: file.name, safetyBackup: safety.fileName, created };
}
