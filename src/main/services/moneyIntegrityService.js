import { reconcileAll } from "../database/moneyMigration.js";
import { missingLedgerGuards, ROUNDING_ADJUSTMENT_LIMIT_MINOR, ROUNDING_ADJUSTMENT_SOURCE } from "../database/ledgerGuards.js";
import { rupees } from "../domain/money.js";

export const ROUNDING_OFF_ACCOUNT = "Rounding Off";

// The money integrity check looks for amounts that are off by paise in books written
// before amounts were kept exact: unbalanced posted vouchers, vouchers whose ledger
// entries disagree with their lines, and old rupee columns that disagree with their
// paise twins. It changes nothing. An old voucher that is off by up to one rupee can
// be corrected by a separate, clearly labelled rounding adjustment journal; the old
// voucher itself is never rewritten.
export function createMoneyIntegrityService({ auditLog, accountId, nextVoucherNumber, postLedgerEntry, financialYearForDate }) {
  function hasWholePaise(value) {
    const scaled = Number(value || 0) * 100;
    return Math.abs(scaled - Math.round(scaled)) < 1e-6;
  }

  function companyFilter(companyId, alias = "v") {
    return companyId ? { sql: ` AND ${alias}.company_id = ?`, params: [Number(companyId)] } : { sql: "", params: [] };
  }

  function adjustmentFor(db, voucherId) {
    return db.prepare(`
      SELECT id, voucher_number, voucher_date FROM vouchers
      WHERE source_module = ? AND source_id = ? AND status IN ('Posted', 'Reversed') AND is_deleted = 0
      ORDER BY id LIMIT 1
    `).get(ROUNDING_ADJUSTMENT_SOURCE, voucherId) || null;
  }

  function unbalancedVouchers(db, companyId) {
    const filter = companyFilter(companyId);
    return db.prepare(`
      SELECT v.id, v.company_id, v.voucher_number, v.voucher_date, v.voucher_type, v.status,
        COALESCE(SUM(vl.debit_minor), 0) total_debit_minor, COALESCE(SUM(vl.credit_minor), 0) total_credit_minor
      FROM vouchers v
      JOIN voucher_lines vl ON vl.voucher_id = v.id
      WHERE v.is_deleted = 0 AND v.status IN ('Posted', 'Reversed')
        AND COALESCE(v.source_module, '') <> '${ROUNDING_ADJUSTMENT_SOURCE}'${filter.sql}
      GROUP BY v.id
      HAVING total_debit_minor <> total_credit_minor
      ORDER BY v.voucher_date, v.id
    `).all(...filter.params).map((row) => {
      const differenceMinor = Number(row.total_debit_minor) - Number(row.total_credit_minor);
      const adjustment = adjustmentFor(db, row.id);
      const year = financialYearForDate(db, row.company_id, row.voucher_date);
      let reason = "";
      if (adjustment) reason = `Already corrected by rounding adjustment ${adjustment.voucher_number}.`;
      else if (Math.abs(differenceMinor) > ROUNDING_ADJUSTMENT_LIMIT_MINOR) reason = "The difference is more than one rupee, so it is not rounding. Reverse the voucher and post a corrected one.";
      else if (!year) reason = "No financial year covers this voucher's date.";
      else if (year.status === "Closed" || year.status === "Locked") reason = `Financial year ${year.financial_year_name} is ${year.status.toLowerCase()}. Reopen it to post the adjustment in the same period.`;
      return {
        id: row.id,
        company_id: row.company_id,
        voucher_number: row.voucher_number,
        voucher_date: row.voucher_date,
        voucher_type: row.voucher_type,
        status: row.status,
        debit: rupees(row.total_debit_minor),
        credit: rupees(row.total_credit_minor),
        difference: rupees(differenceMinor),
        difference_minor: differenceMinor,
        adjusted_by: adjustment?.voucher_number || null,
        adjustable: !reason,
        reason
      };
    });
  }

  function lineLedgerMismatches(db, companyId) {
    const filter = companyFilter(companyId);
    return db.prepare(`
      SELECT v.id, v.voucher_number, v.voucher_date,
        (SELECT COALESCE(SUM(debit_minor), 0) FROM voucher_lines WHERE voucher_id = v.id) line_debit_minor,
        (SELECT COALESCE(SUM(credit_minor), 0) FROM voucher_lines WHERE voucher_id = v.id) line_credit_minor,
        (SELECT COALESCE(SUM(debit_minor), 0) FROM ledger_entries WHERE voucher_id = v.id AND COALESCE(is_deleted, 0) = 0) ledger_debit_minor,
        (SELECT COALESCE(SUM(credit_minor), 0) FROM ledger_entries WHERE voucher_id = v.id AND COALESCE(is_deleted, 0) = 0) ledger_credit_minor
      FROM vouchers v
      WHERE v.is_deleted = 0 AND v.status IN ('Posted', 'Reversed')${filter.sql}
    `).all(...filter.params)
      .filter((row) => row.line_debit_minor !== row.ledger_debit_minor || row.line_credit_minor !== row.ledger_credit_minor)
      .map((row) => ({
        id: row.id,
        voucher_number: row.voucher_number,
        voucher_date: row.voucher_date,
        lines_debit: rupees(row.line_debit_minor),
        lines_credit: rupees(row.line_credit_minor),
        ledger_debit: rupees(row.ledger_debit_minor),
        ledger_credit: rupees(row.ledger_credit_minor)
      }));
  }

  function trialBalanceTotals(db, companyId) {
    const filter = companyFilter(companyId);
    const row = db.prepare(`
      SELECT COALESCE(SUM(le.debit_minor), 0) debit_minor, COALESCE(SUM(le.credit_minor), 0) credit_minor
      FROM ledger_entries le JOIN vouchers v ON v.id = le.voucher_id
      WHERE COALESCE(le.is_deleted, 0) = 0 AND v.is_deleted = 0 AND v.status IN ('Posted', 'Reversed')${filter.sql}
    `).get(...filter.params);
    return {
      debit: rupees(row.debit_minor),
      credit: rupees(row.credit_minor),
      difference: rupees(Number(row.debit_minor) - Number(row.credit_minor)),
      difference_minor: Number(row.debit_minor) - Number(row.credit_minor)
    };
  }

  function moneyIntegrityReport(db, companyId = null) {
    const trialBalance = trialBalanceTotals(db, companyId);
    const unbalanced = unbalancedVouchers(db, companyId);
    const mismatches = lineLedgerMismatches(db, companyId);
    // The paise twins hold every company's rows, so this part is checked database-wide.
    // An older rupee amount saved with a fraction of a paisa (1181.475) is listed apart:
    // the books use its paise value, and the old row is left as it is.
    const mirrors = [];
    const subPaisa = [];
    for (const col of reconcileAll(db)) {
      const fractional = col.disagreements.filter((row) => !hasWholePaise(row.legacy));
      const real = col.disagreements.filter((row) => hasWholePaise(row.legacy));
      const entry = (rows) => ({
        table: col.table,
        column: col.legacy,
        paise_column: col.shadow,
        count: rows.length,
        sample: rows.slice(0, 5).map((row) => ({ id: row.id, stored: row.legacy, paise: row.minor }))
      });
      if (real.length) mirrors.push(entry(real));
      if (fractional.length) subPaisa.push(entry(fractional));
    }
    const missingGuards = missingLedgerGuards(db);
    const openVouchers = unbalanced.filter((row) => !row.adjusted_by);
    return {
      generated_at: new Date().toISOString(),
      company_id: companyId ? Number(companyId) : null,
      ok: trialBalance.difference_minor === 0 && !openVouchers.length && !mismatches.length && !mirrors.length && !missingGuards.length,
      trial_balance: trialBalance,
      unbalanced_vouchers: unbalanced,
      line_ledger_mismatches: mismatches,
      mirror_mismatches: mirrors,
      sub_paisa_legacy: subPaisa,
      missing_guards: missingGuards
    };
  }

  // Posts the labelled one-line journal that cancels an old voucher's paise
  // difference into the Rounding Off account. The database guard allows this one-sided
  // voucher only when it exactly cancels the difference of the voucher it names.
  function postRoundingAdjustment(db, payload = {}) {
    const voucherId = Number(payload.voucher_id || 0);
    const original = db.prepare("SELECT * FROM vouchers WHERE id = ? AND is_deleted = 0").get(voucherId);
    if (!original) throw new Error("Voucher not found");
    if (payload.company_id && Number(payload.company_id) !== Number(original.company_id)) {
      throw new Error("This voucher belongs to a different company.");
    }
    const row = unbalancedVouchers(db, original.company_id).find((item) => item.id === original.id);
    if (!row) throw new Error(`${original.voucher_number} balances to the paisa and needs no rounding adjustment.`);
    if (!row.adjustable) throw new Error(`${original.voucher_number} cannot take a rounding adjustment. ${row.reason}`);
    const year = financialYearForDate(db, original.company_id, original.voucher_date);
    const roundingAccount = accountId(db, original.company_id, ROUNDING_OFF_ACCOUNT);
    const debitMinor = row.difference_minor < 0 ? -row.difference_minor : 0;
    const creditMinor = row.difference_minor > 0 ? row.difference_minor : 0;
    const narration = `Rounding adjustment for ${original.voucher_number}: corrects a difference of ${rupees(Math.abs(row.difference_minor)).toFixed(2)} in an older entry`;

    return db.transaction(() => {
      const voucherNumber = nextVoucherNumber(db, original.company_id, "RNDADJ");
      const voucherResult = db.prepare(`
        INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, narration, source_module, source_id, status, financial_year_id, approval_status)
        VALUES (?, ?, ?, 'Journal', ?, ?, ?, 'Draft', ?, 'Approved')
      `).run(original.company_id, voucherNumber, original.voucher_date, narration, ROUNDING_ADJUSTMENT_SOURCE, original.id, year.id);
      const adjustmentId = voucherResult.lastInsertRowid;
      const lineResult = db.prepare(`
        INSERT INTO voucher_lines (voucher_id, account_id, debit, credit, narration, debit_minor, credit_minor)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(adjustmentId, roundingAccount, rupees(debitMinor), rupees(creditMinor), narration, debitMinor, creditMinor);
      postLedgerEntry(db, original.company_id, adjustmentId, lineResult.lastInsertRowid, roundingAccount, original.voucher_date, rupees(debitMinor), rupees(creditMinor), ROUNDING_ADJUSTMENT_SOURCE, original.id, debitMinor, creditMinor);
      db.prepare("UPDATE vouchers SET status = 'Posted' WHERE id = ?").run(adjustmentId);
      auditLog(db, {
        company_id: original.company_id,
        user_id: payload.userId || null,
        action: "rounding adjustment posted",
        table_name: "vouchers",
        record_id: adjustmentId,
        new_value: JSON.stringify({ voucherNumber, correctsVoucher: original.voucher_number, difference: row.difference, account: ROUNDING_OFF_ACCOUNT })
      });
      return db.prepare("SELECT * FROM vouchers WHERE id = ?").get(adjustmentId);
    })();
  }

  return { moneyIntegrityReport, postRoundingAdjustment };
}
