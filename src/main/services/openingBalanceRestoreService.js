import { createRequire } from "node:module";
import { BackupValidationError, backupPathFromName, createBackup, validateBackupFile } from "./backup.js";
import * as init from "../database/init.js";

const require = createRequire(import.meta.url);

// Owner's rule (16 Nov 2026 IST): a company reset clears its opening balances. Where a
// backup exists they come back through the backup route (this service); where none
// exists they are entered by hand (Accounting > Opening Balance, Allocation > Party Opening).
// Each opening is re-posted through the same functions as hand entry, so it gets a new
// voucher and the same checks (open year, accounts, ledger guards).

export class OpeningBalanceRestoreError extends Error {
  constructor(message) { super(message); this.name = "OpeningBalanceRestoreError"; }
}

// Party masters (suppliers, departments, employees) are shared by all companies and kept on reset.
const PARTY_TABLES = { department: "government_departments", supplier: "suppliers", employee: "employees" };

function positiveId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new OpeningBalanceRestoreError(`${label} is required.`);
  return id;
}

function openBackup(root, backupName) {
  let resolved;
  try {
    ({ resolved } = backupPathFromName(backupName, root));
    validateBackupFile(resolved, String(backupName));
  } catch (error) {
    if (error instanceof BackupValidationError) {
      throw new OpeningBalanceRestoreError(error.message.replace(/^Restore refused:/, "Opening balances not restored:").replace("The live database was not changed.", "Nothing was changed."));
    }
    throw error;
  }
  const Database = require("better-sqlite3");
  return new Database(resolved, { readonly: true, fileMustExist: true });
}

function columns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map((row) => row.name));
}

function amount(row, minorCol, legacyCol, cols) {
  if (cols.has(minorCol) && row[minorCol] != null && Number(row[minorCol]) !== 0) return Number(row[minorCol]) / 100;
  return Number(row[legacyCol] || 0);
}

// Reads the backup's opening balances for the company and checks each against the live books.
export function previewOpeningBalanceRestore(db, root, { companyId, backup } = {}) {
  const id = positiveId(companyId, "Company");
  const name = String(backup || "").trim();
  if (!name) throw new OpeningBalanceRestoreError("Pick a backup to restore opening balances from.");
  const company = db.prepare("SELECT id, company_name FROM companies WHERE id = ?").get(id);
  if (!company) throw new OpeningBalanceRestoreError(`Company #${id} does not exist.`);

  const source = openBackup(root, name);
  try {
    const tables = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
    const blockers = [];
    const sourceCompany = source.prepare("SELECT id, company_name FROM companies WHERE id = ?").get(id);
    if (!sourceCompany || sourceCompany.company_name !== company.company_name) {
      blockers.push(`The backup does not hold "${company.company_name}" under the same company number, so its opening balances cannot be matched.`);
    }
    const existing = db.prepare("SELECT COUNT(*) AS n FROM opening_balances WHERE company_id = ?").get(id).n;
    if (existing > 0) {
      blockers.push(`"${company.company_name}" already has ${existing} opening balance(s). Restoring would enter them twice. Restore only works on a company with no opening balances, such as one just reset.`);
    }
    if (!tables.has("opening_balances") || !sourceCompany) {
      return { company: { id, name: company.company_name }, backup: name, rows: [], ready: 0, skipped: 0, totals: { debit: 0, credit: 0 }, blockers, canRestore: false };
    }

    const obCols = columns(source, "opening_balances");
    const vCols = columns(source, "vouchers");
    const rows = source.prepare("SELECT * FROM opening_balances WHERE company_id = ? ORDER BY id").all(id);
    const voucherOf = source.prepare(`SELECT id, voucher_date, narration, status${vCols.has("is_deleted") ? ", is_deleted" : ", 0 AS is_deleted"} FROM vouchers WHERE id = ? AND company_id = ?`);
    const partyLineOf = source.prepare("SELECT linked_party_type, linked_party_id FROM voucher_lines WHERE voucher_id = ? AND linked_party_type IS NOT NULL AND linked_party_id IS NOT NULL LIMIT 1");
    const sourceYear = source.prepare("SELECT id, financial_year_name FROM financial_years WHERE id = ?");
    const sourceAccount = source.prepare("SELECT id, account_name FROM accounts WHERE id = ?");
    const liveYear = db.prepare("SELECT id, financial_year_name, status, start_date, end_date FROM financial_years WHERE id = ? AND company_id = ?");
    const liveAccount = db.prepare("SELECT id, account_name FROM accounts WHERE id = ? AND company_id = ? AND COALESCE(is_deleted, 0) = 0");

    const plan = rows.map((row) => {
      const debit = amount(row, "opening_debit_minor", "opening_debit", obCols);
      const credit = amount(row, "opening_credit_minor", "opening_credit", obCols);
      const voucher = row.voucher_id ? voucherOf.get(row.voucher_id, id) : null;
      const partyLine = voucher ? partyLineOf.get(voucher.id) : null;
      const item = {
        sourceId: row.id,
        kind: partyLine ? "party" : "account",
        balanceType: row.balance_type,
        partyType: partyLine?.linked_party_type || null,
        partyId: partyLine?.linked_party_id || null,
        accountId: row.account_id,
        financialYearId: row.financial_year_id,
        date: voucher?.voucher_date || null,
        debit,
        credit,
        remarks: row.remarks || "",
        narration: voucher?.narration || "",
        problem: null
      };
      const yearInBackup = sourceYear.get(row.financial_year_id);
      const year = liveYear.get(row.financial_year_id, id);
      const account = row.account_id ? liveAccount.get(row.account_id, id) : null;
      const accountInBackup = row.account_id ? sourceAccount.get(row.account_id) : null;
      if (!voucher || voucher.status !== "Posted" || Number(voucher.is_deleted)) item.problem = "skip: its voucher was not posted in the backup (reversed, deleted or missing)";
      else if ((debit > 0) === (credit > 0)) item.problem = "skip: it has no single debit or credit amount";
      else if (!year || !yearInBackup || year.financial_year_name !== yearInBackup.financial_year_name) item.problem = "blocked: its financial year is not in the live books";
      else if (year.status !== "Open") item.problem = `blocked: financial year ${year.financial_year_name} is ${year.status}; reopen it from Financial Years first`;
      else if (!account || !accountInBackup || account.account_name !== accountInBackup.account_name) item.problem = "blocked: its ledger account is not in the live chart of accounts";
      else if (item.kind === "party") {
        const table = PARTY_TABLES[item.partyType];
        if (table && !db.prepare(`SELECT 1 FROM "${table}" WHERE id = ?`).get(item.partyId)) item.problem = `blocked: the ${item.partyType} it belongs to is not in the live masters`;
        else if (!item.date || item.date < year.start_date || item.date > year.end_date) item.problem = "blocked: its date is outside its financial year";
      }
      item.financialYear = year?.financial_year_name || yearInBackup?.financial_year_name || null;
      item.accountName = account?.account_name || accountInBackup?.account_name || null;
      return item;
    });

    plan.filter((item) => item.problem?.startsWith("blocked")).forEach((item) => {
      blockers.push(`Opening balance #${item.sourceId} (${item.accountName || "account"}): ${item.problem.replace(/^blocked: /, "")}.`);
    });
    const ready = plan.filter((item) => !item.problem);
    const toPaise = (value) => Math.round(value * 100);
    const totals = {
      debit: ready.reduce((sum, item) => sum + toPaise(item.debit), 0) / 100,
      credit: ready.reduce((sum, item) => sum + toPaise(item.credit), 0) / 100
    };
    return {
      company: { id, name: company.company_name },
      backup: name,
      rows: plan,
      ready: ready.length,
      skipped: plan.filter((item) => item.problem?.startsWith("skip")).length,
      totals,
      blockers,
      canRestore: blockers.length === 0 && ready.length > 0
    };
  } finally {
    source.close();
  }
}

// Re-posts the backup's opening balances in one transaction, after a safety backup.
export function restoreOpeningBalancesFromBackup(db, root, { companyId, backup, userId = null } = {}) {
  const preview = previewOpeningBalanceRestore(db, root, { companyId, backup });
  if (!preview.canRestore) {
    const reason = preview.blockers.length ? preview.blockers.join(" ") : "The backup holds no posted opening balances for this company.";
    throw new OpeningBalanceRestoreError(`Opening balances not restored: ${reason} Nothing was changed.`);
  }
  const safety = createBackup(root, db, "pre_opening_restore");
  const created = [];
  db.transaction(() => {
    preview.rows.filter((item) => !item.problem).forEach((item) => {
      const row = item.kind === "party"
        ? init.createPartyOpeningBalance(db, {
          company_id: preview.company.id,
          party_type: item.partyType,
          party_id: item.partyId,
          financial_year_id: item.financialYearId,
          opening_date: item.date,
          opening_debit: item.debit,
          opening_credit: item.credit,
          narration: item.remarks || item.narration,
          created_by: userId
        })
        : init.createOpeningBalance(db, {
          company_id: preview.company.id,
          financial_year_id: item.financialYearId,
          balance_type: item.balanceType,
          account_id: item.accountId,
          opening_debit: item.debit,
          opening_credit: item.credit,
          remarks: item.remarks,
          created_by: userId
        });
      created.push({ sourceId: item.sourceId, id: row.id, voucherId: row.voucher_id });
    });
    init.auditLog(db, {
      company_id: preview.company.id,
      user_id: userId,
      action: "opening_balances_restored",
      module: "opening_balances",
      table_name: "opening_balances",
      new_value: JSON.stringify({ backup: preview.backup, safetyBackup: safety.fileName, restored: created.length, skipped: preview.skipped, totals: preview.totals, created })
    });
  })();
  return { restored: created.length, skipped: preview.skipped, totals: preview.totals, backup: preview.backup, safetyBackup: safety.fileName, created };
}
