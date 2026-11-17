// Audit Watch checks (AW-1): one read-only function per catalogue entry.
//
// Every function receives (q, ctx):
//   q    — a read-only query helper (see runner.js); it refuses any statement that
//          could write, so a check cannot change the books even by mistake.
//   ctx  — { companyId, from, to, today, limits, deps }
//          from/to/today are YYYY-MM-DD business dates (IST); limits are this run's
//          limit values for the check (catalogue defaults unless the caller overrides).
// and returns a list of findings:
//   { key, summary, date, amountMinor, refs: [{ table, id }], evidence: [rows] }
// `key` is stable across runs (check id + the record ids involved) so a later phase
// can remember that a finding was reviewed.
//
// Money is compared in whole paise. Stored timestamps (created_at, last_login_at) are
// UTC; office hours and "keyed on" dates are converted to IST (+05:30).

const IST = "'+330 minutes'";
const live = (alias) => `COALESCE(${alias}.is_deleted, 0) = 0`;
const paise = (expr) => `CAST(ROUND(COALESCE(${expr}, 0) * 100) AS INTEGER)`;
const keyedOn = (alias) => `date(${alias}.created_at, ${IST})`;

export const rupeesText = (minor) => `Rs. ${(Number(minor || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const norm = (value) => String(value ?? "").toUpperCase().replace(/[\s\-/\\.]/g, "");
const dayNumber = (date) => Math.floor(Date.parse(`${String(date).slice(0, 10)}T00:00:00Z`) / 86400000);
const daysBetween = (a, b) => dayNumber(b) - dayNumber(a);
export const addDays = (date, days) => new Date((dayNumber(date) + days) * 86400000).toISOString().slice(0, 10);
const tail4 = (value) => `xx${String(value ?? "").slice(-4)}`;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Groups rows (sorted by date) into runs where every row lies within `windowDays` of
// the run's first row; returns the runs that satisfy `keep`. Runs do not overlap.
function dateRuns(rows, windowDays, keep) {
  const runs = [];
  let start = 0;
  while (start < rows.length) {
    let end = start;
    while (end + 1 < rows.length && daysBetween(rows[start].date, rows[end + 1].date) <= windowDays) end += 1;
    const run = rows.slice(start, end + 1);
    if (keep(run)) { runs.push(run); start = end + 1; } else start += 1;
  }
  return runs;
}

const groupBy = (rows, keyOf) => rows.reduce((map, row) => {
  const key = keyOf(row);
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(row);
  return map;
}, new Map());

// Accounts whose balances should not move by hand, and suspense/clearing ledgers.
const SENSITIVE_ACCOUNT_SQL = `(a.account_name IN ('Cash', 'Bank', 'Capital', 'GST Payable', 'Output GST', 'Input GST', 'Opening Balance Suspense')
  OR a.account_name LIKE '%Suspense%' OR a.account_name LIKE '%GST%')`;
const CLEARING_ACCOUNT_SQL = `(a.account_name IN ('Opening Balance Suspense', 'Goods Received Not Invoiced')
  OR a.account_name LIKE '%Suspense%' OR a.account_name LIKE '%Clearing%')`;
const POSTED = "v.status IN ('Posted', 'Reversed')";
const SYSTEM_DATED_SOURCES = "('opening_balance', 'voucher_reversal', 'rounding_adjustment')";

const SUPPLIER_BANK_FIELDS = ["supplier_account_number", "supplier_bank_name", "supplier_bank_ifsc_code", "supplier_branch", "bank_details", "upi_id"];
const BANK_FIELDS_BY_TABLE = {
  suppliers: SUPPLIER_BANK_FIELDS,
  employees: ["bank_name", "account_number", "ifsc", "branch"],
  banks: ["bank_name", "account_number", "ifsc", "branch"],
  companies: ["bank_name", "account_number", "ifsc"]
};

// SQL that is true when an audited update changed any of `fields` (and the new value
// was actually written: a field missing from new_value is not a change).
function changedFieldsSql(fields) {
  return `(${fields.map((field) => `(json_type(al.new_value, '$.${field}') IS NOT NULL
    AND TRIM(COALESCE(json_extract(al.old_value, '$.${field}'), '')) <> TRIM(COALESCE(json_extract(al.new_value, '$.${field}'), '')))`).join(" OR ")})`;
}
const auditJsonOk = "json_valid(al.old_value) AND json_valid(al.new_value)";

function changedFields(row, fields) {
  try {
    const before = JSON.parse(row.old_value || "{}");
    const after = JSON.parse(row.new_value || "{}");
    return fields.filter((field) => field in after && String(before[field] ?? "").trim() !== String(after[field] ?? "").trim());
  } catch {
    return [];
  }
}

export const CHECK_FUNCTIONS = {
  // ------------------------------------------------------------ Purchases
  "AW-P01"(q, { companyId, from, to, limits }) {
    const bills = q(`
      SELECT p.id, p.supplier_id, s.supplier_name, p.purchase_invoice_number bill_number, p.purchase_date,
        ${paise("p.purchase_value")} + ${paise("p.purchase_gst")} amount_minor
      FROM procurements p LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.company_id = ? AND ${live("p")} AND p.supplier_id IS NOT NULL AND p.purchase_date <= ?
      ORDER BY p.supplier_id, p.purchase_date, p.id
    `, [companyId, to]);
    const findings = [];
    for (const rows of groupBy(bills, (row) => row.supplier_id).values()) {
      for (let i = 0; i < rows.length; i += 1) {
        for (let j = i + 1; j < rows.length; j += 1) {
          const [a, b] = [rows[i], rows[j]];
          if (b.purchase_date < from) continue;
          const sameNumber = norm(a.bill_number) && norm(a.bill_number) === norm(b.bill_number);
          const sameAmount = !sameNumber && a.amount_minor > 0 && a.amount_minor === b.amount_minor
            && daysBetween(a.purchase_date, b.purchase_date) <= limits.windowDays;
          if (!sameNumber && !sameAmount) continue;
          findings.push({
            key: `AW-P01:${a.id}-${b.id}`,
            summary: sameNumber
              ? `${b.supplier_name || "Supplier"}: bill ${b.bill_number} appears twice`
              : `${b.supplier_name || "Supplier"}: two bills of ${rupeesText(b.amount_minor)} within ${daysBetween(a.purchase_date, b.purchase_date)} days`,
            date: b.purchase_date,
            amountMinor: b.amount_minor,
            refs: [{ table: "procurements", id: a.id }, { table: "procurements", id: b.id }],
            evidence: [a, b]
          });
        }
      }
    }
    return findings;
  },

  "AW-P02"(q, { companyId, from, to, limits }) {
    const payments = q(`
      SELECT sp.id, sp.supplier_id, s.supplier_name, sp.payment_date, sp.utr_number, ${paise("sp.amount_paid")} amount_minor
      FROM supplier_payments sp LEFT JOIN suppliers s ON s.id = sp.supplier_id
      WHERE sp.company_id = ? AND ${live("sp")} AND sp.payment_date <= ?
      ORDER BY sp.payment_date, sp.id
    `, [companyId, to]);
    const findings = [];
    const seen = new Set();
    const pair = (a, b, reason) => {
      const key = `AW-P02:${a.id}-${b.id}`;
      if (seen.has(key) || b.payment_date < from) return;
      seen.add(key);
      findings.push({ key, summary: reason, date: b.payment_date, amountMinor: b.amount_minor, refs: [{ table: "supplier_payments", id: a.id }, { table: "supplier_payments", id: b.id }], evidence: [a, b] });
    };
    for (const rows of groupBy(payments.filter((row) => norm(row.utr_number)), (row) => norm(row.utr_number)).values()) {
      for (let i = 1; i < rows.length; i += 1) pair(rows[0], rows[i], `UTR ${rows[i].utr_number} used on two supplier payments`);
    }
    for (const rows of groupBy(payments, (row) => `${row.supplier_id}|${row.amount_minor}`).values()) {
      for (let i = 0; i < rows.length; i += 1) {
        for (let j = i + 1; j < rows.length; j += 1) {
          const [a, b] = [rows[i], rows[j]];
          if (a.amount_minor <= 0 || daysBetween(a.payment_date, b.payment_date) > limits.windowDays) continue;
          pair(a, b, `${b.supplier_name || "Supplier"} paid ${rupeesText(b.amount_minor)} twice within ${daysBetween(a.payment_date, b.payment_date)} days`);
        }
      }
    }
    return findings;
  },

  "AW-P03"(q, { companyId, from, to, limits }) {
    const changes = q(`
      SELECT al.id audit_id, al.record_id supplier_id, al.user_id, al.created_at changed_at, date(al.created_at, ${IST}) changed_on,
        al.old_value, al.new_value
      FROM audit_log al
      WHERE al.table_name = 'suppliers' AND al.action = 'update' AND ${auditJsonOk} AND ${changedFieldsSql(SUPPLIER_BANK_FIELDS)}
        AND date(al.created_at, ${IST}) <= ?
    `, [to]);
    const findings = [];
    for (const change of changes) {
      const fields = changedFields(change, SUPPLIER_BANK_FIELDS);
      const payments = q(`
        SELECT sp.id, sp.payment_date, ${paise("sp.amount_paid")} amount_minor, s.supplier_name
        FROM supplier_payments sp LEFT JOIN suppliers s ON s.id = sp.supplier_id
        WHERE sp.company_id = ? AND ${live("sp")} AND sp.supplier_id = ?
          AND sp.payment_date >= ? AND sp.payment_date <= ? AND sp.payment_date BETWEEN ? AND ?
      `, [companyId, change.supplier_id, change.changed_on, addDays(change.changed_on, limits.windowDays), from, to]);
      for (const payment of payments) {
        findings.push({
          key: `AW-P03:${change.audit_id}-${payment.id}`,
          summary: `${payment.supplier_name || "Supplier"} paid ${rupeesText(payment.amount_minor)} ${daysBetween(change.changed_on, payment.payment_date)} days after its bank details changed`,
          date: payment.payment_date,
          amountMinor: payment.amount_minor,
          refs: [{ table: "suppliers", id: change.supplier_id }, { table: "supplier_payments", id: payment.id }, { table: "audit_log", id: change.audit_id }],
          // The evidence names the fields that changed, never the account numbers themselves.
          evidence: [{ audit_id: change.audit_id, changed_on: change.changed_on, changed_by_user_id: change.user_id, fields_changed: fields.join(", ") }, payment]
        });
      }
    }
    return findings;
  },

  "AW-P04"(q, { companyId, from, to, limits }) {
    const rows = q(`
      WITH bills AS (
        SELECT p.id, p.supplier_id, p.purchase_invoice_number, p.purchase_date,
          COALESCE((SELECT SUM(${paise("pi.gross_value")}) FROM procurement_items pi WHERE pi.procurement_id = p.id AND ${live("pi")}),
            ${paise("p.purchase_value")} + ${paise("p.purchase_gst")}) bill_minor,
          COALESCE((SELECT SUM(${paise("spa.allocated_amount")}) FROM supplier_payment_allocations spa
            WHERE spa.procurement_id = p.id AND ${live("spa")}), 0)
          + COALESCE((SELECT SUM(${paise("aa.adjusted_amount")}) FROM advance_adjustments aa
            WHERE aa.adjustment_type = 'supplier' AND aa.procurement_id = p.id AND ${live("aa")} AND aa.status = 'Active'), 0) paid_minor
        FROM procurements p
        WHERE p.company_id = ? AND ${live("p")} AND p.purchase_date BETWEEN ? AND ?
      )
      SELECT b.*, s.supplier_name FROM bills b LEFT JOIN suppliers s ON s.id = b.supplier_id
      WHERE b.paid_minor - b.bill_minor > ?
    `, [companyId, from, to, Math.round(limits.toleranceRupees * 100)]);
    return rows.map((row) => ({
      key: `AW-P04:${row.id}`,
      summary: `${row.supplier_name || "Supplier"} bill ${row.purchase_invoice_number || row.id}: paid ${rupeesText(row.paid_minor - row.bill_minor)} more than the bill`,
      date: row.purchase_date,
      amountMinor: row.paid_minor - row.bill_minor,
      refs: [{ table: "procurements", id: row.id }],
      evidence: [row]
    }));
  },

  "AW-P05"(q, { companyId, from, to, limits }) {
    const limitMinor = Math.round(limits.approvalLimitRupees * 100);
    const nearMinor = Math.round(limitMinor * limits.nearLimitPercent / 100);
    const bills = q(`
      SELECT p.id, p.supplier_id, s.supplier_name, p.purchase_invoice_number, p.purchase_date date, ${paise("p.purchase_value")} amount_minor
      FROM procurements p LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.company_id = ? AND ${live("p")} AND p.purchase_date BETWEEN ? AND ?
        AND ${paise("p.purchase_value")} >= ? AND ${paise("p.purchase_value")} < ?
      ORDER BY p.supplier_id, p.purchase_date, p.id
    `, [companyId, from, to, nearMinor, limitMinor]);
    const findings = [];
    for (const rows of groupBy(bills, (row) => row.supplier_id).values()) {
      const runs = dateRuns(rows, limits.windowDays, (run) => run.length >= limits.minimumBills
        && run.reduce((sum, row) => sum + row.amount_minor, 0) > limitMinor);
      for (const run of runs) {
        const total = run.reduce((sum, row) => sum + row.amount_minor, 0);
        findings.push({
          key: `AW-P05:${run.map((row) => row.id).join("-")}`,
          summary: `${run[0].supplier_name || "Supplier"}: ${run.length} bills just under ${rupeesText(limitMinor)} add up to ${rupeesText(total)}`,
          date: run[run.length - 1].date,
          amountMinor: total,
          refs: run.map((row) => ({ table: "procurements", id: row.id })),
          evidence: run
        });
      }
    }
    return findings;
  },

  "AW-P06"(q, { companyId, from, to, limits }) {
    const rows = q(`
      SELECT pi.id, pi.procurement_id, pi.item_id, i.item_name, pi.purchase_rate, p.purchase_date, p.supplier_id, s.supplier_name
      FROM procurement_items pi
      JOIN procurements p ON p.id = pi.procurement_id AND ${live("p")}
      LEFT JOIN items i ON i.id = pi.item_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE pi.company_id = ? AND ${live("pi")} AND pi.item_id IS NOT NULL AND pi.purchase_rate > 0
        AND p.purchase_date BETWEEN ? AND ?
      ORDER BY pi.item_id, p.purchase_date, pi.id
    `, [companyId, addDays(from, -limits.lookbackDays), to]);
    const findings = [];
    for (const itemRows of groupBy(rows, (row) => row.item_id).values()) {
      itemRows.forEach((row, index) => {
        if (row.purchase_date < from) return;
        const earlier = itemRows.slice(0, index).filter((prior) => prior.purchase_date < row.purchase_date
          && daysBetween(prior.purchase_date, row.purchase_date) <= limits.lookbackDays);
        if (earlier.length < limits.minimumPurchases) return;
        const typical = median(earlier.map((prior) => Number(prior.purchase_rate)));
        if (!(typical > 0) || Number(row.purchase_rate) <= typical * (1 + limits.abovePercent / 100)) return;
        const above = Math.round(((Number(row.purchase_rate) / typical) - 1) * 100);
        findings.push({
          key: `AW-P06:${row.id}`,
          summary: `${row.item_name || "Item"} bought at ${rupeesText(Math.round(row.purchase_rate * 100))}, ${above}% above its usual ${rupeesText(Math.round(typical * 100))}`,
          date: row.purchase_date,
          amountMinor: Math.round(row.purchase_rate * 100),
          refs: [{ table: "procurement_items", id: row.id }, { table: "procurements", id: row.procurement_id }],
          evidence: [{ ...row, median_rate: typical, earlier_purchases: earlier.length }]
        });
      });
    }
    return findings;
  },

  "AW-P07"(q, { companyId }) {
    const suppliers = q(`
      SELECT s.id, s.supplier_name name, s.supplier_account_number account_number, s.supplier_bank_ifsc_code ifsc,
        EXISTS (SELECT 1 FROM procurements p WHERE p.supplier_id = s.id AND p.company_id = ? AND ${live("p")})
          OR EXISTS (SELECT 1 FROM supplier_payments sp WHERE sp.supplier_id = s.id AND sp.company_id = ? AND ${live("sp")}) traded
      FROM suppliers s WHERE ${live("s")} AND TRIM(COALESCE(s.supplier_account_number, '')) <> ''
    `, [companyId, companyId]).map((row) => ({ ...row, party: "supplier" }));
    const employees = q(`
      SELECT e.id, e.employee_name name, e.account_number, e.ifsc, 0 traded
      FROM employees e WHERE ${live("e")} AND TRIM(COALESCE(e.account_number, '')) <> ''
    `).map((row) => ({ ...row, party: "employee" }));
    const findings = [];
    for (const parties of groupBy([...suppliers, ...employees], (row) => `${norm(row.account_number)}|${norm(row.ifsc)}`).values()) {
      if (parties.length < 2 || !parties.some((row) => row.party === "supplier" && row.traded)) continue;
      const ids = parties.map((row) => `${row.party === "supplier" ? "S" : "E"}${row.id}`).sort();
      findings.push({
        key: `AW-P07:${ids.join("-")}`,
        summary: `${parties.map((row) => `${row.name} (${row.party})`).join(", ")} share bank account ${tail4(parties[0].account_number)}`,
        date: null,
        amountMinor: 0,
        refs: parties.map((row) => ({ table: row.party === "supplier" ? "suppliers" : "employees", id: row.id })),
        evidence: parties.map((row) => ({ party: row.party, id: row.id, name: row.name, account: tail4(row.account_number), ifsc: row.ifsc }))
      });
    }
    return findings;
  },

  "AW-P08"(q, { companyId, from, to, limits }) {
    const rows = q(`
      SELECT sp.id, sp.payment_date, ${paise("sp.amount_paid")} amount_minor, s.id supplier_id, s.supplier_name, s.gstin, s.status
      FROM supplier_payments sp JOIN suppliers s ON s.id = sp.supplier_id
      WHERE sp.company_id = ? AND ${live("sp")} AND sp.payment_date BETWEEN ? AND ? AND ${paise("sp.amount_paid")} >= ?
        AND (TRIM(COALESCE(s.gstin, '')) = '' OR LOWER(COALESCE(s.status, 'active')) <> 'active' OR COALESCE(s.is_deleted, 0) = 1)
    `, [companyId, from, to, Math.round(limits.minimumRupees * 100)]);
    return rows.map((row) => {
      const reasons = [!String(row.gstin || "").trim() && "no GSTIN", String(row.status || "active").toLowerCase() !== "active" && `status ${row.status}`].filter(Boolean);
      return {
        key: `AW-P08:${row.id}`,
        summary: `${row.supplier_name} paid ${rupeesText(row.amount_minor)} (${reasons.join(", ") || "supplier removed"})`,
        date: row.payment_date,
        amountMinor: row.amount_minor,
        refs: [{ table: "supplier_payments", id: row.id }, { table: "suppliers", id: row.supplier_id }],
        evidence: [row]
      };
    });
  },

  // ------------------------------------------------------------ Sales
  "AW-S01"(q, { companyId, from, to, limits }) {
    const rows = q(`
      SELECT ii.id, ii.billing_id, inv.invoice_number, inv.invoice_date, ii.order_item_id, ii.quantity, ii.billing_rate,
        oi.quoted_rate, oi.item_description,
        (SELECT CASE WHEN SUM(pi.quantity) > 0 THEN
            SUM(CASE WHEN pi.landed_cost > 0 THEN pi.landed_cost ELSE pi.quantity * pi.purchase_rate END) / SUM(pi.quantity) END
          FROM procurement_items pi WHERE pi.order_item_id = ii.order_item_id AND ${live("pi")}) unit_cost
      FROM invoice_items ii
      JOIN invoices inv ON inv.id = ii.billing_id AND ${live("inv")}
      LEFT JOIN order_items oi ON oi.id = ii.order_item_id AND ${live("oi")}
      WHERE ii.company_id = ? AND ${live("ii")} AND inv.invoice_date BETWEEN ? AND ? AND ii.billing_rate > 0
    `, [companyId, from, to]);
    const findings = [];
    for (const row of rows) {
      const rate = Number(row.billing_rate);
      const belowCost = row.unit_cost > 0 && Math.round(rate * 100) < Math.round(Number(row.unit_cost) * 100);
      const belowQuote = row.quoted_rate > 0 && rate < Number(row.quoted_rate) * (1 - limits.belowQuotePercent / 100);
      if (!belowCost && !belowQuote) continue;
      findings.push({
        key: `AW-S01:${row.id}`,
        summary: `Bill ${row.invoice_number}: ${row.item_description || "item"} billed at ${rupeesText(Math.round(rate * 100))}${belowCost ? `, below its cost of ${rupeesText(Math.round(row.unit_cost * 100))}` : ""}${belowQuote ? `, below the quoted ${rupeesText(Math.round(row.quoted_rate * 100))}` : ""}`,
        date: row.invoice_date,
        amountMinor: Math.round(rate * 100),
        refs: [{ table: "invoices", id: row.billing_id }, { table: "invoice_items", id: row.id }],
        evidence: [row]
      });
    }
    return findings;
  },

  "AW-S02"(q, { companyId, from, to }) {
    const rows = q(`
      SELECT gv.id, gv.voucher_date note_date, CAST(json_extract(gv.payload_json, '$.linked_invoice_id') AS INTEGER) invoice_id,
        inv.invoice_number, inv.invoice_date
      FROM guided_vouchers gv
      JOIN invoices inv ON inv.id = CAST(json_extract(gv.payload_json, '$.linked_invoice_id') AS INTEGER) AND ${live("inv")}
      WHERE gv.company_id = ? AND ${live("gv")} AND gv.voucher_kind = 'credit_note' AND gv.status = 'Posted'
        AND json_valid(gv.payload_json) AND gv.voucher_date BETWEEN ? AND ?
        AND substr(gv.voucher_date, 1, 7) > substr(inv.invoice_date, 1, 7)
    `, [companyId, from, to]);
    const fyOf = (date) => { const [y, m] = String(date).split("-").map(Number); return m >= 4 ? y : y - 1; };
    return rows.map((row) => ({
      key: `AW-S02:${row.id}`,
      summary: `Credit note of ${row.note_date} reduces bill ${row.invoice_number} of ${row.invoice_date}${fyOf(row.note_date) !== fyOf(row.invoice_date) ? " (an earlier financial year)" : ""}`,
      date: row.note_date,
      amountMinor: 0,
      refs: [{ table: "guided_vouchers", id: row.id }, { table: "invoices", id: row.invoice_id }],
      evidence: [row]
    }));
  },

  "AW-S03"(q, { companyId, from, to, limits }) {
    const rows = q(`
      SELECT inv.id, inv.invoice_number, inv.invoice_date, ${keyedOn("inv")} keyed_on,
        (SELECT MIN(dc.dispatch_date) FROM delivery_challans dc WHERE dc.order_id = inv.order_id AND ${live("dc")}) first_dispatch
      FROM invoices inv
      WHERE inv.company_id = ? AND ${live("inv")} AND inv.invoice_date BETWEEN ? AND ?
    `, [companyId, from, to]);
    const findings = [];
    for (const row of rows) {
      const late = daysBetween(row.invoice_date, row.keyed_on);
      const beforeDispatch = row.first_dispatch && row.invoice_date < row.first_dispatch;
      if (late <= limits.lateDays && !beforeDispatch) continue;
      findings.push({
        key: `AW-S03:${row.id}`,
        summary: `Bill ${row.invoice_number} dated ${row.invoice_date}${late > limits.lateDays ? `, keyed ${late} days later` : ""}${beforeDispatch ? `, before the first dispatch on ${row.first_dispatch}` : ""}`,
        date: row.invoice_date,
        amountMinor: 0,
        refs: [{ table: "invoices", id: row.id }],
        evidence: [row]
      });
    }
    return findings;
  },

  "AW-S04"(q, { companyId, today, limits }) {
    const rows = q(`
      SELECT r.id, r.billing_id, r.invoice_number, r.invoice_date, r.due_date, ${paise("r.balance_outstanding")} balance_minor,
        gd.department_name, ct.default_credit_days, ct.grace_period
      FROM receivables r
      LEFT JOIN government_departments gd ON gd.id = r.department_id
      LEFT JOIN credit_terms ct ON ct.company_id = r.company_id AND ct.party_type = 'department' AND ct.party_id = r.department_id
        AND ${live("ct")} AND LOWER(COALESCE(ct.status, 'active')) = 'active'
      WHERE r.company_id = ? AND ${live("r")} AND ${paise("r.balance_outstanding")} > 0
    `, [companyId]);
    const findings = [];
    for (const row of rows) {
      const due = row.due_date || addDays(row.invoice_date, Number(row.default_credit_days ?? limits.defaultCreditDays));
      const grace = Number(row.grace_period ?? limits.graceDays);
      const overdue = daysBetween(due, today) - grace;
      if (overdue <= 0) continue;
      findings.push({
        key: `AW-S04:${row.id}`,
        summary: `${row.department_name || "Buyer"}: bill ${row.invoice_number} has ${rupeesText(row.balance_minor)} unpaid, ${daysBetween(due, today)} days past due`,
        date: due,
        amountMinor: row.balance_minor,
        refs: [{ table: "receivables", id: row.id }, { table: "invoices", id: row.billing_id }],
        evidence: [{ ...row, due_used: due }]
      });
    }
    return findings;
  },

  "AW-S05"(q, { companyId, from, to }) {
    const findings = [];
    const contracts = q(`
      SELECT UPPER(TRIM(inv.gem_contract_number)) contract, GROUP_CONCAT(inv.id) invoice_ids,
        GROUP_CONCAT(inv.invoice_number, ', ') invoice_numbers, COUNT(DISTINCT inv.order_id) orders, MAX(inv.invoice_date) last_date
      FROM invoices inv
      WHERE inv.company_id = ? AND ${live("inv")} AND TRIM(COALESCE(inv.gem_contract_number, '')) <> ''
      GROUP BY UPPER(TRIM(inv.gem_contract_number))
      HAVING COUNT(DISTINCT inv.order_id) > 1 AND MAX(inv.invoice_date) BETWEEN ? AND ?
    `, [companyId, from, to]);
    for (const row of contracts) {
      const ids = String(row.invoice_ids).split(",").map(Number).sort((a, b) => a - b);
      findings.push({
        key: `AW-S05:contract-${ids.join("-")}`,
        summary: `GeM contract ${row.contract} is on bills for ${row.orders} different orders (${row.invoice_numbers})`,
        date: row.last_date,
        amountMinor: 0,
        refs: ids.map((id) => ({ table: "invoices", id })),
        evidence: [row]
      });
    }
    const over = q(`
      SELECT oi.id order_item_id, oi.order_id, so.order_number, oi.item_description, oi.quantity ordered,
        SUM(ii.quantity) billed, MAX(inv.invoice_date) last_date
      FROM order_items oi
      JOIN supply_orders so ON so.id = oi.order_id
      JOIN invoice_items ii ON ii.order_item_id = oi.id AND ${live("ii")}
      JOIN invoices inv ON inv.id = ii.billing_id AND ${live("inv")}
      WHERE oi.company_id = ? AND ${live("oi")}
      GROUP BY oi.id
      HAVING SUM(ii.quantity) > oi.quantity + 0.0001 AND MAX(inv.invoice_date) BETWEEN ? AND ?
    `, [companyId, from, to]);
    for (const row of over) {
      findings.push({
        key: `AW-S05:line-${row.order_item_id}`,
        summary: `Order ${row.order_number}: ${row.item_description || "item"} billed ${row.billed} against ${row.ordered} ordered`,
        date: row.last_date,
        amountMinor: 0,
        refs: [{ table: "supply_orders", id: row.order_id }, { table: "order_items", id: row.order_item_id }],
        evidence: [row]
      });
    }
    return findings;
  },

  "AW-S06"(q, { companyId, from, to, limits }) {
    const rows = q(`
      SELECT r.id, r.billing_id, r.invoice_number, r.invoice_date, ${paise("r.invoice_amount")} bill_minor,
        ${paise("r.amount_received")} + ${paise("r.tds_deducted")} + ${paise("r.gst_tds_deducted")} + ${paise("r.other_deductions")} settled_minor
      FROM receivables r
      WHERE r.company_id = ? AND ${live("r")} AND r.invoice_date BETWEEN ? AND ?
        AND ${paise("r.amount_received")} + ${paise("r.tds_deducted")} + ${paise("r.gst_tds_deducted")} + ${paise("r.other_deductions")} - ${paise("r.invoice_amount")} > ?
    `, [companyId, from, to, Math.round(limits.toleranceRupees * 100)]);
    return rows.map((row) => ({
      key: `AW-S06:${row.id}`,
      summary: `Bill ${row.invoice_number}: ${rupeesText(row.settled_minor - row.bill_minor)} more received than billed`,
      date: row.invoice_date,
      amountMinor: row.settled_minor - row.bill_minor,
      refs: [{ table: "receivables", id: row.id }, { table: "invoices", id: row.billing_id }],
      evidence: [row]
    }));
  },

  "AW-S07"(q, { companyId, from, to, limits }) {
    const rows = q(`
      SELECT r.id, r.billing_id, r.invoice_number, r.invoice_date, ${paise("r.invoice_amount")} bill_minor, ${paise("r.other_deductions")} deduction_minor
      FROM receivables r
      WHERE r.company_id = ? AND ${live("r")} AND r.invoice_date BETWEEN ? AND ? AND ${paise("r.invoice_amount")} > 0
        AND ${paise("r.other_deductions")} * 100 > ${paise("r.invoice_amount")} * ?
    `, [companyId, from, to, limits.abovePercent]);
    return rows.map((row) => ({
      key: `AW-S07:${row.id}`,
      summary: `Bill ${row.invoice_number}: buyer deducted ${rupeesText(row.deduction_minor)} (${Math.round(row.deduction_minor * 100 / row.bill_minor)}% of the bill)`,
      date: row.invoice_date,
      amountMinor: row.deduction_minor,
      refs: [{ table: "receivables", id: row.id }, { table: "invoices", id: row.billing_id }],
      evidence: [row]
    }));
  },

  // ------------------------------------------------------------ Stock
  "AW-I01"(q, { companyId, from, to, deps }) {
    const moves = q(`
      SELECT sl.id, sl.item_id, sl.warehouse_id, sl.transaction_date, sl.document_number,
        COALESCE(sl.inward_quantity, 0) - COALESCE(sl.outward_quantity, 0) change, i.item_name, w.warehouse_name
      FROM stock_ledger sl LEFT JOIN items i ON i.id = sl.item_id LEFT JOIN warehouses w ON w.id = sl.warehouse_id
      WHERE sl.company_id = ? AND ${live("sl")} AND sl.transaction_date <= ?
      ORDER BY sl.item_id, sl.warehouse_id, sl.transaction_date, sl.id
    `, [companyId, to]);
    const findings = [];
    for (const rows of groupBy(moves, (row) => `${row.item_id}|${row.warehouse_id}`).values()) {
      const { item_id: itemId, warehouse_id: warehouseId } = rows[0];
      const allMovement = q(`SELECT COALESCE(SUM(COALESCE(inward_quantity, 0) - COALESCE(outward_quantity, 0)), 0) qty FROM stock_ledger
        WHERE company_id = ? AND item_id = ? AND warehouse_id = ? AND COALESCE(is_deleted, 0) = 0`, [companyId, itemId, warehouseId])[0].qty;
      const opening = Number(deps.stockBalance(companyId, itemId, warehouseId).quantity || 0) - Number(allMovement || 0);
      let balance = opening;
      // Movements on one day are netted: stock received later the same day is not a gap.
      for (const [date, dayRows] of groupBy(rows, (row) => row.transaction_date)) {
        balance += dayRows.reduce((sum, row) => sum + Number(row.change), 0);
        if (balance < -0.0001 && date >= from) {
          findings.push({
            key: `AW-I01:${itemId}-${warehouseId}`,
            summary: `${rows[0].item_name || "Item"} in ${rows[0].warehouse_name || "warehouse"} fell to ${Math.round(balance * 1000) / 1000} on ${date}`,
            date,
            amountMinor: 0,
            refs: [{ table: "items", id: itemId }, ...dayRows.map((row) => ({ table: "stock_ledger", id: row.id }))],
            evidence: dayRows.map((row) => ({ ...row, balance_after_day: balance }))
          });
          break;
        }
      }
    }
    return findings;
  },

  "AW-I02"(q, { companyId, today, limits, deps }) {
    const rows = q(`
      SELECT sl.item_id, sl.warehouse_id, MAX(sl.transaction_date) last_movement, i.item_name, w.warehouse_name
      FROM stock_ledger sl LEFT JOIN items i ON i.id = sl.item_id LEFT JOIN warehouses w ON w.id = sl.warehouse_id
      WHERE sl.company_id = ? AND ${live("sl")}
      GROUP BY sl.item_id, sl.warehouse_id
      HAVING MAX(sl.transaction_date) < ?
    `, [companyId, addDays(today, -limits.idleDays)]);
    const findings = [];
    for (const row of rows) {
      const balance = deps.stockBalance(companyId, row.item_id, row.warehouse_id);
      if (!(Number(balance.quantity) > 0.0001)) continue;
      const valueMinor = Math.round(Number(balance.value || 0) * 100);
      findings.push({
        key: `AW-I02:${row.item_id}-${row.warehouse_id}`,
        summary: `${row.item_name || "Item"} in ${row.warehouse_name || "warehouse"}: ${balance.quantity} on hand, no movement for ${daysBetween(row.last_movement, today)} days`,
        date: row.last_movement,
        amountMinor: valueMinor,
        refs: [{ table: "items", id: row.item_id }],
        evidence: [{ ...row, quantity: balance.quantity, value: balance.value }]
      });
    }
    return findings;
  },

  "AW-I03"(q, { companyId, from, to, limits }) {
    const rows = q(`
      SELECT sa.id, sa.item_id, i.item_name, sa.adjustment_date date, sa.adjustment_type, sa.quantity, sa.rate, sa.reason,
        CAST(ROUND(ABS(COALESCE(sa.quantity, 0) * COALESCE(sa.rate, 0)) * 100) AS INTEGER) value_minor
      FROM stock_adjustments sa LEFT JOIN items i ON i.id = sa.item_id
      WHERE sa.company_id = ? AND ${live("sa")} AND sa.adjustment_date BETWEEN ? AND ?
      ORDER BY sa.item_id, sa.adjustment_date, sa.id
    `, [companyId, from, to]);
    const findings = [];
    const minimum = Math.round(limits.minimumRupees * 100);
    for (const row of rows.filter((item) => item.value_minor >= minimum)) {
      findings.push({
        key: `AW-I03:${row.id}`,
        summary: `${row.item_name || "Item"}: ${row.adjustment_type || "adjustment"} of ${row.quantity} worth ${rupeesText(row.value_minor)}`,
        date: row.date,
        amountMinor: row.value_minor,
        refs: [{ table: "stock_adjustments", id: row.id }],
        evidence: [row]
      });
    }
    for (const itemRows of groupBy(rows, (row) => row.item_id).values()) {
      for (const run of dateRuns(itemRows, limits.windowDays, (candidate) => candidate.length >= limits.repeatCount)) {
        findings.push({
          key: `AW-I03:repeat-${run.map((row) => row.id).join("-")}`,
          summary: `${run[0].item_name || "Item"} adjusted ${run.length} times between ${run[0].date} and ${run[run.length - 1].date}`,
          date: run[run.length - 1].date,
          amountMinor: run.reduce((sum, row) => sum + row.value_minor, 0),
          refs: run.map((row) => ({ table: "stock_adjustments", id: row.id })),
          evidence: run
        });
      }
    }
    return findings;
  },

  "AW-I04"(q, { companyId, to, limits }) {
    const rows = q(`
      SELECT sr.supplier_id, s.supplier_name, COUNT(*) returns, SUM(sr.quantity) quantity, GROUP_CONCAT(sr.id) return_ids, MAX(sr.return_date) last_date
      FROM stock_returns sr LEFT JOIN suppliers s ON s.id = sr.supplier_id
      WHERE sr.company_id = ? AND ${live("sr")} AND sr.supplier_id IS NOT NULL
        AND LOWER(COALESCE(sr.condition_status, 'good')) <> 'good' AND sr.return_date BETWEEN ? AND ?
      GROUP BY sr.supplier_id HAVING COUNT(*) >= ?
    `, [companyId, addDays(to, -limits.lookbackDays), to, limits.minimumReturns]);
    return rows.map((row) => ({
      key: `AW-I04:${row.supplier_id}-${row.last_date}`,
      summary: `${row.supplier_name || "Supplier"}: ${row.returns} damaged or defective returns in ${limits.lookbackDays} days`,
      date: row.last_date,
      amountMinor: 0,
      refs: [{ table: "suppliers", id: row.supplier_id }, ...String(row.return_ids).split(",").map((id) => ({ table: "stock_returns", id: Number(id) }))],
      evidence: [row]
    }));
  },

  "AW-I05"(q, { companyId }) {
    const rows = q(`
      SELECT sn.item_id, i.item_name, UPPER(TRIM(sn.serial_number)) serial, COUNT(*) times, GROUP_CONCAT(sn.id) ids, GROUP_CONCAT(COALESCE(sn.status, ''), ', ') statuses
      FROM serial_numbers sn LEFT JOIN items i ON i.id = sn.item_id
      WHERE sn.company_id = ? AND ${live("sn")} AND TRIM(COALESCE(sn.serial_number, '')) <> ''
      GROUP BY sn.item_id, UPPER(TRIM(sn.serial_number)) HAVING COUNT(*) > 1
    `, [companyId]);
    return rows.map((row) => {
      const ids = String(row.ids).split(",").map(Number).sort((a, b) => a - b);
      return {
        key: `AW-I05:${ids.join("-")}`,
        summary: `${row.item_name || "Item"}: serial ${row.serial} recorded ${row.times} times`,
        date: null,
        amountMinor: 0,
        refs: ids.map((id) => ({ table: "serial_numbers", id })),
        evidence: [row]
      };
    });
  },

  "AW-I06"(q, { companyId, today }) {
    const rows = q(`
      SELECT b.id, b.item_id, i.item_name, b.batch_number, b.balance_quantity, b.expiry_date
      FROM batches b LEFT JOIN items i ON i.id = b.item_id
      WHERE b.company_id = ? AND ${live("b")} AND b.balance_quantity > 0 AND TRIM(COALESCE(b.expiry_date, '')) <> '' AND b.expiry_date < ?
    `, [companyId, today]);
    return rows.map((row) => ({
      key: `AW-I06:${row.id}`,
      summary: `${row.item_name || "Item"} batch ${row.batch_number}: ${row.balance_quantity} in stock, expired ${row.expiry_date}`,
      date: row.expiry_date,
      amountMinor: 0,
      refs: [{ table: "batches", id: row.id }],
      evidence: [row]
    }));
  },

  "AW-I07"(q, { companyId, from, to, limits }) {
    const findings = [];
    const bought = q(`
      SELECT oi.id order_item_id, oi.order_id, so.order_number, oi.item_description, oi.quantity ordered,
        SUM(pi.quantity) bought, MAX(p.purchase_date) last_date
      FROM order_items oi
      JOIN supply_orders so ON so.id = oi.order_id
      JOIN procurement_items pi ON pi.order_item_id = oi.id AND ${live("pi")}
      JOIN procurements p ON p.id = pi.procurement_id AND ${live("p")}
      WHERE oi.company_id = ? AND ${live("oi")}
      GROUP BY oi.id
      HAVING SUM(pi.quantity) > oi.quantity * (1 + ? / 100.0) + 0.0001 AND MAX(p.purchase_date) BETWEEN ? AND ?
    `, [companyId, limits.tolerancePercent, from, to]);
    for (const row of bought) {
      findings.push({
        key: `AW-I07:bought-${row.order_item_id}`,
        summary: `Order ${row.order_number}: ${row.item_description || "item"} bought ${row.bought} against ${row.ordered} ordered`,
        date: row.last_date,
        amountMinor: 0,
        refs: [{ table: "supply_orders", id: row.order_id }, { table: "order_items", id: row.order_item_id }],
        evidence: [row]
      });
    }
    const billed = q(`
      WITH billed AS (
        SELECT inv.order_id, ii.item_id, SUM(ii.quantity) qty, MAX(inv.invoice_date) last_date
        FROM invoice_items ii JOIN invoices inv ON inv.id = ii.billing_id AND ${live("inv")}
        WHERE ii.company_id = ? AND ${live("ii")} AND ii.item_id IS NOT NULL
        GROUP BY inv.order_id, ii.item_id
      ), delivered AS (
        SELECT dc.order_id, dci.item_id, SUM(dci.quantity) qty
        FROM delivery_challan_items dci JOIN delivery_challans dc ON dc.id = dci.delivery_challan_id AND ${live("dc")}
        WHERE dc.company_id = ?
        GROUP BY dc.order_id, dci.item_id
      )
      SELECT b.order_id, so.order_number, b.item_id, i.item_name, b.qty billed, COALESCE(d.qty, 0) delivered, b.last_date
      FROM billed b
      JOIN supply_orders so ON so.id = b.order_id
      LEFT JOIN items i ON i.id = b.item_id
      LEFT JOIN delivered d ON d.order_id = b.order_id AND d.item_id = b.item_id
      WHERE EXISTS (SELECT 1 FROM delivery_challans dc WHERE dc.order_id = b.order_id AND ${live("dc")})
        AND b.qty > COALESCE(d.qty, 0) + 0.0001 AND b.last_date BETWEEN ? AND ?
    `, [companyId, companyId, from, to]);
    for (const row of billed) {
      findings.push({
        key: `AW-I07:billed-${row.order_id}-${row.item_id}`,
        summary: `Order ${row.order_number}: ${row.item_name || "item"} billed ${row.billed} but ${row.delivered} delivered`,
        date: row.last_date,
        amountMinor: 0,
        refs: [{ table: "supply_orders", id: row.order_id }, { table: "items", id: row.item_id }],
        evidence: [row]
      });
    }
    return findings;
  },

  // ------------------------------------------------------------ Ledger
  "AW-G01"(q, { companyId, from, to, limits }) {
    const rows = q(`
      SELECT v.id, v.voucher_number, v.voucher_date, v.voucher_type, v.narration,
        SUM(vl.debit_minor) amount_minor,
        GROUP_CONCAT(DISTINCT CASE WHEN ${SENSITIVE_ACCOUNT_SQL} THEN a.account_name END) sensitive_accounts
      FROM vouchers v
      JOIN voucher_lines vl ON vl.voucher_id = v.id AND ${live("vl")}
      JOIN accounts a ON a.id = vl.account_id
      WHERE v.company_id = ? AND ${live("v")} AND ${POSTED} AND v.source_module = 'manual_voucher'
        AND v.voucher_date BETWEEN ? AND ?
      GROUP BY v.id
      HAVING sensitive_accounts IS NOT NULL AND SUM(vl.debit_minor) >= ?
    `, [companyId, from, to, Math.round(limits.minimumRupees * 100)]);
    return rows.map((row) => ({
      key: `AW-G01:${row.id}`,
      summary: `${row.voucher_type} ${row.voucher_number} keyed by hand: ${rupeesText(row.amount_minor)} through ${row.sensitive_accounts}`,
      date: row.voucher_date,
      amountMinor: row.amount_minor,
      refs: [{ table: "vouchers", id: row.id }],
      evidence: [row]
    }));
  },

  "AW-G02"(q, { companyId, from, to, limits }) {
    const rows = q(`
      SELECT v.id, v.voucher_number, v.voucher_type, v.voucher_date, v.source_module,
        strftime('%w', v.voucher_date) weekday, datetime(v.created_at, ${IST}) keyed_at_ist, time(v.created_at, ${IST}) keyed_time,
        (SELECT SUM(vl.debit_minor) FROM voucher_lines vl WHERE vl.voucher_id = v.id AND ${live("vl")}) amount_minor
      FROM vouchers v
      WHERE v.company_id = ? AND ${live("v")} AND ${POSTED} AND v.voucher_date BETWEEN ? AND ?
        AND v.source_module NOT IN ${SYSTEM_DATED_SOURCES}
        AND (strftime('%w', v.voucher_date) = '0' OR time(v.created_at, ${IST}) < ? OR time(v.created_at, ${IST}) >= ?)
    `, [companyId, from, to, `${limits.officeStart}:00`, `${limits.officeEnd}:00`]);
    return rows.map((row) => ({
      key: `AW-G02:${row.id}`,
      summary: `${row.voucher_type} ${row.voucher_number}${row.weekday === "0" ? ` dated Sunday ${row.voucher_date}` : ""}${row.keyed_time < `${limits.officeStart}:00` || row.keyed_time >= `${limits.officeEnd}:00` ? `, keyed at ${String(row.keyed_time).slice(0, 5)} IST` : ""}`,
      date: row.voucher_date,
      amountMinor: row.amount_minor || 0,
      refs: [{ table: "vouchers", id: row.id }],
      evidence: [row]
    }));
  },

  "AW-G03"(q, { companyId, from, to, limits }) {
    const rows = q(`
      SELECT v.id, v.voucher_number, v.voucher_type, v.voucher_date, v.narration, SUM(vl.debit_minor) amount_minor
      FROM vouchers v JOIN voucher_lines vl ON vl.voucher_id = v.id AND ${live("vl")}
      WHERE v.company_id = ? AND ${live("v")} AND ${POSTED} AND v.source_module = 'manual_voucher' AND v.voucher_date BETWEEN ? AND ?
      GROUP BY v.id
      HAVING SUM(vl.debit_minor) >= ? AND SUM(vl.debit_minor) % ? = 0
    `, [companyId, from, to, Math.round(limits.minimumRupees * 100), Math.max(1, Math.round(limits.roundTo * 100))]);
    return rows.map((row) => ({
      key: `AW-G03:${row.id}`,
      summary: `${row.voucher_type} ${row.voucher_number}: round sum of ${rupeesText(row.amount_minor)}`,
      date: row.voucher_date,
      amountMinor: row.amount_minor,
      refs: [{ table: "vouchers", id: row.id }],
      evidence: [row]
    }));
  },

  "AW-G04"(q, { companyId, today, limits }) {
    const cutoff = addDays(today, -limits.openDays);
    const rows = q(`
      SELECT a.id account_id, a.account_name,
        COALESCE(SUM(CASE WHEN le.entry_date <= ? THEN le.debit_minor - le.credit_minor END), 0) balance_at_cutoff,
        COALESCE(SUM(CASE WHEN le.entry_date > ? THEN le.debit_minor END), 0) later_debits,
        COALESCE(SUM(CASE WHEN le.entry_date > ? THEN le.credit_minor END), 0) later_credits,
        COALESCE(SUM(le.debit_minor - le.credit_minor), 0) balance_now
      FROM accounts a
      JOIN ledger_entries le ON le.account_id = a.id AND ${live("le")}
      JOIN vouchers v ON v.id = le.voucher_id AND ${live("v")} AND ${POSTED}
      WHERE a.company_id = ? AND ${CLEARING_ACCOUNT_SQL}
      GROUP BY a.id
    `, [cutoff, cutoff, cutoff, companyId]);
    const findings = [];
    for (const row of rows) {
      // First in, first out: later movements the other way clear the oldest balance first.
      const old = row.balance_at_cutoff > 0
        ? Math.max(0, row.balance_at_cutoff - row.later_credits)
        : Math.max(0, -row.balance_at_cutoff - row.later_debits);
      if (old <= 0 || row.balance_now === 0) continue;
      findings.push({
        key: `AW-G04:${row.account_id}`,
        summary: `${row.account_name}: ${rupeesText(old)} open since before ${cutoff}`,
        date: cutoff,
        amountMinor: old,
        refs: [{ table: "accounts", id: row.account_id }],
        evidence: [row]
      });
    }
    return findings;
  },

  "AW-G05"(q, { companyId, from, to, limits }) {
    const rows = q(`
      SELECT v.id, v.voucher_number, v.voucher_type, v.voucher_date, v.source_module, ${keyedOn("v")} keyed_on,
        fy.financial_year_name, fy.status year_status, date(fy.closed_at, ${IST}) year_closed_on
      FROM vouchers v LEFT JOIN financial_years fy ON fy.id = v.financial_year_id
      WHERE v.company_id = ? AND ${live("v")} AND ${POSTED} AND v.voucher_date BETWEEN ? AND ?
        AND v.source_module NOT IN ${SYSTEM_DATED_SOURCES}
        AND (julianday(${keyedOn("v")}) - julianday(v.voucher_date) > ?
          OR (fy.closed_at IS NOT NULL AND v.created_at > fy.closed_at))
    `, [companyId, from, to, limits.lateDays]);
    return rows.map((row) => ({
      key: `AW-G05:${row.id}`,
      summary: `${row.voucher_type} ${row.voucher_number} dated ${row.voucher_date}, keyed ${row.keyed_on}${row.year_closed_on && row.keyed_on >= row.year_closed_on ? ` after ${row.financial_year_name} was closed` : ""}`,
      date: row.voucher_date,
      amountMinor: 0,
      refs: [{ table: "vouchers", id: row.id }],
      evidence: [row]
    }));
  },

  "AW-G06"(q, { companyId, from, to, limits }) {
    const rows = q(`
      SELECT v.id, v.voucher_number, v.voucher_type, v.voucher_date, v.reversal_date date, v.reversed_by, u.username reversed_by_name
      FROM vouchers v LEFT JOIN users u ON u.id = v.reversed_by
      WHERE v.company_id = ? AND ${live("v")} AND v.status = 'Reversed' AND v.reversal_date BETWEEN ? AND ?
      ORDER BY v.reversed_by, v.reversal_date, v.id
    `, [companyId, from, to]);
    const findings = [];
    for (const row of rows) {
      if (daysBetween(row.voucher_date, row.date) <= limits.oldDays) continue;
      findings.push({
        key: `AW-G06:${row.id}`,
        summary: `${row.voucher_type} ${row.voucher_number} of ${row.voucher_date} reversed ${daysBetween(row.voucher_date, row.date)} days later`,
        date: row.date,
        amountMinor: 0,
        refs: [{ table: "vouchers", id: row.id }],
        evidence: [row]
      });
    }
    for (const userRows of groupBy(rows.filter((row) => row.reversed_by), (row) => row.reversed_by).values()) {
      for (const run of dateRuns(userRows, limits.windowDays, (candidate) => candidate.length >= limits.repeatCount)) {
        findings.push({
          key: `AW-G06:user-${run.map((row) => row.id).join("-")}`,
          summary: `${run[0].reversed_by_name || "One user"} reversed ${run.length} vouchers between ${run[0].date} and ${run[run.length - 1].date}`,
          date: run[run.length - 1].date,
          amountMinor: 0,
          refs: [{ table: "users", id: run[0].reversed_by }, ...run.map((row) => ({ table: "vouchers", id: row.id }))],
          evidence: run
        });
      }
    }
    return findings;
  },

  "AW-G07"(q, { companyId, from, today, limits }) {
    const rows = q(`
      SELECT bse.id, bse.bank_id, b.bank_name, bse.transaction_date, bse.narration, bse.match_status,
        ${paise("COALESCE(NULLIF(bse.amount, 0), bse.credit - bse.debit)")} amount_minor
      FROM bank_statement_entries bse LEFT JOIN banks b ON b.id = bse.bank_id
      WHERE bse.company_id = ? AND ${live("bse")} AND COALESCE(bse.match_status, 'Unmatched') IN ('Unmatched', 'Review Required')
        AND bse.transaction_date BETWEEN ? AND ?
    `, [companyId, from, addDays(today, -limits.openDays)]);
    return rows.map((row) => ({
      key: `AW-G07:${row.id}`,
      summary: `${row.bank_name || "Bank"} line of ${row.transaction_date} (${rupeesText(Math.abs(row.amount_minor))}) still unmatched`,
      date: row.transaction_date,
      amountMinor: Math.abs(row.amount_minor),
      refs: [{ table: "bank_statement_entries", id: row.id }],
      evidence: [row]
    }));
  },

  "AW-G08"(q, { companyId, from, to, limits }) {
    const rows = q(`
      SELECT a.id account_id, a.account_name, CASE WHEN vl.debit_minor > 0 THEN vl.debit_minor ELSE vl.credit_minor END amount_minor
      FROM voucher_lines vl
      JOIN vouchers v ON v.id = vl.voucher_id AND ${live("v")} AND ${POSTED}
      JOIN accounts a ON a.id = vl.account_id
      WHERE v.company_id = ? AND ${live("vl")} AND v.voucher_date BETWEEN ? AND ?
        AND (vl.debit_minor >= 1000 OR vl.credit_minor >= 1000)
        AND v.source_module NOT IN ('voucher_reversal', 'rounding_adjustment')
    `, [companyId, from, to]);
    const findings = [];
    for (const lines of groupBy(rows, (row) => row.account_id).values()) {
      if (lines.length < limits.minimumRows) continue;
      const counts = Array(10).fill(0);
      lines.forEach((line) => { counts[Number(String(line.amount_minor)[0])] += 1; });
      let deviation = 0;
      const spread = [];
      for (let digit = 1; digit <= 9; digit += 1) {
        const expected = Math.log10(1 + 1 / digit);
        const observed = counts[digit] / lines.length;
        deviation += Math.abs(observed - expected);
        spread.push({ digit, expected_percent: Math.round(expected * 1000) / 10, observed_percent: Math.round(observed * 1000) / 10 });
      }
      const mad = deviation / 9;
      if (mad * 1000 <= limits.tolerance) continue;
      const worst = [...spread].sort((a, b) => (b.observed_percent - b.expected_percent) - (a.observed_percent - a.expected_percent))[0];
      findings.push({
        key: `AW-G08:${lines[0].account_id}-${from}-${to}`,
        summary: `${lines[0].account_name}: amounts starting with ${worst.digit} are ${worst.observed_percent}% of ${lines.length} entries (about ${worst.expected_percent}% expected)`,
        date: to,
        amountMinor: 0,
        refs: [{ table: "accounts", id: lines[0].account_id }],
        evidence: spread.map((row) => ({ ...row, mean_absolute_deviation: Math.round(mad * 10000) / 10000 }))
      });
    }
    return findings;
  },

  "AW-G09"(q, { companyId, from, to }) {
    const days = q(`
      SELECT a.id account_id, le.entry_date, SUM(le.debit_minor - le.credit_minor) net_minor,
        COALESCE(a.opening_balance_minor, ${paise("a.opening_balance")}) opening_minor
      FROM accounts a
      JOIN ledger_entries le ON le.account_id = a.id AND ${live("le")}
      JOIN vouchers v ON v.id = le.voucher_id AND ${live("v")} AND ${POSTED}
      WHERE a.company_id = ? AND a.account_name = 'Cash' AND le.entry_date <= ?
      GROUP BY a.id, le.entry_date
      ORDER BY le.entry_date
    `, [companyId, to]);
    const findings = [];
    let balance = days.length ? Number(days[0].opening_minor || 0) : 0;
    let negative = false;
    for (const day of days) {
      balance += Number(day.net_minor);
      if (balance < 0 && !negative && day.entry_date >= from) {
        findings.push({
          key: `AW-G09:${day.account_id}-${day.entry_date}`,
          summary: `Cash in hand fell to ${rupeesText(balance)} on ${day.entry_date}`,
          date: day.entry_date,
          amountMinor: -balance,
          refs: [{ table: "accounts", id: day.account_id }],
          evidence: [{ entry_date: day.entry_date, day_movement_minor: day.net_minor, closing_balance_minor: balance }]
        });
      }
      negative = balance < 0;
    }
    return findings;
  },

  "AW-G10"(q, { companyId, deps }) {
    const results = deps.bookIntegrityChecks(companyId) || [];
    return results.filter((row) => row.status === "fail").map((row) => ({
      key: `AW-G10:${row.id || row.key || row.label}`,
      summary: `${row.label || row.name || "Book check"} failed: ${row.detail || ""}`.trim(),
      date: null,
      amountMinor: 0,
      refs: [],
      evidence: [row]
    }));
  },

  // ------------------------------------------------------------ Users and access
  "AW-T01"(q, { today, limits }) {
    const cutoff = addDays(today, -limits.idleDays);
    const rows = q(`
      SELECT u.id, u.username, u.display_name, u.role, date(u.last_login_at, ${IST}) last_login_on, date(u.created_at, ${IST}) created_on
      FROM users u
      WHERE LOWER(COALESCE(u.status, 'active')) = 'active' AND u.role IN ('admin', 'super_admin')
        AND COALESCE(date(u.last_login_at, ${IST}), date(u.created_at, ${IST})) < ?
    `, [cutoff]);
    return rows.map((row) => ({
      key: `AW-T01:${row.id}`,
      summary: `${row.role.replace("_", " ")} ${row.username}: ${row.last_login_on ? `last login ${row.last_login_on}` : "never logged in"}`,
      date: row.last_login_on || row.created_on,
      amountMinor: 0,
      refs: [{ table: "users", id: row.id }],
      evidence: [row]
    }));
  },

  "AW-T02"(q, { limits }) {
    const rows = q(`
      SELECT u.id, u.username, u.role, u.failed_login_count, u.locked_until,
        CASE WHEN u.locked_until IS NOT NULL AND julianday(u.locked_until) > julianday('now') THEN 1 ELSE 0 END locked
      FROM users u
      WHERE u.failed_login_count >= ? OR (u.locked_until IS NOT NULL AND julianday(u.locked_until) > julianday('now'))
    `, [limits.failedLogins]);
    return rows.map((row) => ({
      key: `AW-T02:${row.id}-${row.failed_login_count}-${row.locked}`,
      summary: `${row.username}: ${row.failed_login_count} failed logins${row.locked ? ", account locked" : ""}`,
      date: null,
      amountMinor: 0,
      refs: [{ table: "users", id: row.id }],
      evidence: [{ id: row.id, username: row.username, role: row.role, failed_login_count: row.failed_login_count, locked: Boolean(row.locked) }]
    }));
  },

  "AW-T03"(q, { companyId, from, to }) {
    const guided = q(`
      SELECT gv.id, gv.voucher_kind, gv.voucher_date date, gv.status, gv.created_by user_id, u.username
      FROM guided_vouchers gv LEFT JOIN users u ON u.id = gv.created_by
      WHERE gv.company_id = ? AND ${live("gv")} AND gv.created_by IS NOT NULL AND gv.created_by = gv.approved_by
        AND gv.voucher_date BETWEEN ? AND ?
    `, [companyId, from, to]);
    const queue = q(`
      SELECT aq.id, aq.module_name, aq.record_id, date(COALESCE(aq.approved_at, aq.created_at), ${IST}) date, aq.approval_status status, aq.maker_id user_id, u.username
      FROM approval_queue aq LEFT JOIN users u ON u.id = aq.maker_id
      WHERE aq.company_id = ? AND ${live("aq")} AND aq.maker_id IS NOT NULL AND aq.maker_id = aq.checker_id
        AND date(COALESCE(aq.approved_at, aq.created_at), ${IST}) BETWEEN ? AND ?
    `, [companyId, from, to]);
    return [
      ...guided.map((row) => ({
        key: `AW-T03:gv-${row.id}`,
        summary: `${row.username || "One user"} prepared and approved ${String(row.voucher_kind).replaceAll("_", " ")} #${row.id}`,
        date: row.date,
        amountMinor: 0,
        refs: [{ table: "guided_vouchers", id: row.id }, { table: "users", id: row.user_id }],
        evidence: [row]
      })),
      ...queue.map((row) => ({
        key: `AW-T03:aq-${row.id}`,
        summary: `${row.username || "One user"} submitted and approved ${row.module_name} #${row.record_id}`,
        date: row.date,
        amountMinor: 0,
        refs: [{ table: "approval_queue", id: row.id }, { table: "users", id: row.user_id }],
        evidence: [row]
      }))
    ];
  },

  "AW-T04"(q, { companyId, today, limits }) {
    const since = addDays(today, -limits.lookbackDays);
    const rows = q(`
      SELECT al.id, al.table_name, al.record_id, al.user_id, u.username, date(al.created_at, ${IST}) changed_on, al.old_value, al.new_value
      FROM audit_log al LEFT JOIN users u ON u.id = al.user_id
      WHERE al.action = 'update' AND ${auditJsonOk} AND date(al.created_at, ${IST}) >= ?
        AND (al.company_id = ? OR al.company_id IS NULL)
        AND (
          (al.table_name = 'users' AND json_extract(al.new_value, '$.role') IN ('admin', 'super_admin')
            AND COALESCE(json_extract(al.old_value, '$.role'), '') <> json_extract(al.new_value, '$.role'))
          OR (al.table_name = 'employees' AND ${changedFieldsSql(["incentive_percentage", ...BANK_FIELDS_BY_TABLE.employees])})
          OR (al.table_name = 'suppliers' AND ${changedFieldsSql(BANK_FIELDS_BY_TABLE.suppliers)})
          OR (al.table_name = 'banks' AND ${changedFieldsSql(BANK_FIELDS_BY_TABLE.banks)})
          OR (al.table_name = 'companies' AND ${changedFieldsSql(BANK_FIELDS_BY_TABLE.companies)})
        )
    `, [since, companyId]);
    return rows.map((row) => {
      const watched = row.table_name === "users" ? ["role"] : row.table_name === "employees" ? ["incentive_percentage", ...BANK_FIELDS_BY_TABLE.employees] : BANK_FIELDS_BY_TABLE[row.table_name];
      const fields = changedFields(row, watched);
      return {
        key: `AW-T04:${row.id}`,
        summary: `${row.username || "Unknown user"} changed ${fields.join(", ").replaceAll("_", " ")} on ${row.table_name.replace(/s$/, "")} #${row.record_id}`,
        date: row.changed_on,
        amountMinor: 0,
        refs: [{ table: row.table_name, id: row.record_id }, { table: "audit_log", id: row.id }],
        // Field names only: old and new bank values stay out of the finding.
        evidence: [{ audit_id: row.id, table: row.table_name, record_id: row.record_id, changed_by: row.username, changed_on: row.changed_on, fields_changed: fields.join(", ") }]
      };
    });
  },

  "AW-T05"(q, { companyId, today, limits }) {
    const rows = q(`
      SELECT al.table_name, al.action, COUNT(*) times, MIN(al.id) first_id, MAX(al.id) last_id, MAX(date(al.created_at, ${IST})) last_on
      FROM audit_log al
      WHERE al.user_id IS NULL AND al.action IN ('create', 'update', 'delete', 'hard_delete', 'deactivate', 'restore')
        AND (al.company_id = ? OR al.company_id IS NULL) AND date(al.created_at, ${IST}) >= ?
      GROUP BY al.table_name, al.action
    `, [companyId, addDays(today, -limits.lookbackDays)]);
    return rows.map((row) => ({
      key: `AW-T05:${row.table_name}-${row.action}-${row.last_id}`,
      summary: `${row.times} ${row.action.replace("_", " ")} action(s) on ${row.table_name} recorded without a user`,
      date: row.last_on,
      amountMinor: 0,
      refs: [{ table: "audit_log", id: row.first_id }, { table: "audit_log", id: row.last_id }],
      evidence: [row]
    }));
  }
};
