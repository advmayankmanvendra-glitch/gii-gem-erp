// Planted-exception test data for Audit Watch.
//
// Each helper writes the smallest rows a check reads, straight into a fresh test
// database. Vouchers go through the same Draft -> lines -> ledger entries -> Posted
// path the ledger guards enforce, so the books stay valid and only the planted
// exception differs. Never point these helpers at a real company database.

let counter = 0;
const next = (prefix) => `${prefix}-${++counter}`;

export const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
export const shift = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

export function fixtures(db, companyId = 1) {
  const insert = (table, row) => {
    const keys = Object.keys(row);
    return Number(db.prepare(`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map((key) => `@${key}`).join(", ")})`).run(row).lastInsertRowid);
  };
  const accountId = (name) => db.prepare("SELECT id FROM accounts WHERE company_id = ? AND account_name = ?").get(companyId, name).id;
  const yearFor = (date) => db.prepare("SELECT id FROM financial_years WHERE company_id = ? AND ? BETWEEN start_date AND end_date").get(companyId, date)?.id || null;
  let employeeId = null;
  const employee = () => employeeId || (employeeId = insert("employees", { employee_name: next("Employee"), mobile_number: "9000000000" }));

  const api = {
    insert,
    accountId,
    supplier(extra = {}) {
      return insert("suppliers", { supplier_name: next("Supplier"), gstin: "09AAAAA0000A1Z5", status: "active", ...extra });
    },
    item(extra = {}) {
      return insert("items", { item_name: next("Item"), unit: "Nos", ...extra });
    },
    warehouse() {
      return insert("warehouses", { company_id: companyId, warehouse_code: next("WH"), warehouse_name: next("Store") });
    },
    order(extra = {}) {
      return insert("supply_orders", { company_id: companyId, order_number: next("SO"), order_date: "2026-05-01", department_id: 1, employee_id: employee(), ...extra });
    },
    orderItem(orderId, extra = {}) {
      return insert("order_items", { company_id: companyId, order_id: orderId, item_description: next("Line"), quantity: 10, quoted_rate: 1000, ...extra });
    },
    bill(supplierId, extra = {}) {
      return insert("procurements", {
        company_id: companyId, order_id: extra.order_id || api.order(), supplier_id: supplierId, purchase_date: "2026-06-10",
        purchase_invoice_number: next("PB"), purchase_value: 10000, purchase_gst: 1800, posting_status: "Posted", ...extra
      });
    },
    billLine(procurementId, extra = {}) {
      const orderId = db.prepare("SELECT order_id FROM procurements WHERE id = ?").get(procurementId).order_id;
      return insert("procurement_items", { company_id: companyId, procurement_id: procurementId, order_id: orderId, quantity: 1, purchase_rate: 100, gross_value: 118, ...extra });
    },
    supplierPayment(supplierId, extra = {}) {
      return insert("supplier_payments", { company_id: companyId, supplier_id: supplierId, payment_date: "2026-06-12", payment_mode: "NEFT", utr_number: next("UTR"), amount_paid: 5000, posting_status: "Posted", ...extra });
    },
    allocate(paymentId, procurementId, amount) {
      return insert("supplier_payment_allocations", { company_id: companyId, supplier_payment_id: paymentId, procurement_id: procurementId, allocated_amount: amount });
    },
    invoice(orderId, extra = {}) {
      return insert("invoices", { company_id: companyId, order_id: orderId, invoice_number: next("INV"), invoice_date: "2026-06-15", billing_value: 10000, posting_status: "Posted", ...extra });
    },
    invoiceLine(invoiceId, extra = {}) {
      const orderId = db.prepare("SELECT order_id FROM invoices WHERE id = ?").get(invoiceId).order_id;
      return insert("invoice_items", { company_id: companyId, billing_id: invoiceId, order_id: orderId, quantity: 1, billing_rate: 1000, ...extra });
    },
    receivable(invoiceId, extra = {}) {
      const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId);
      return insert("receivables", {
        company_id: companyId, billing_id: invoiceId, order_id: invoice.order_id, department_id: 1, invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date, invoice_amount: 10000, amount_received: 0, balance_outstanding: 10000, ...extra
      });
    },
    challan(orderId, extra = {}) {
      return insert("delivery_challans", { company_id: companyId, challan_number: next("DC"), order_id: orderId, dispatch_date: "2026-06-10", status: "Confirmed", ...extra });
    },
    challanLine(challanId, itemId, warehouseId, quantity) {
      return insert("delivery_challan_items", { company_id: companyId, delivery_challan_id: challanId, item_id: itemId, warehouse_id: warehouseId, quantity });
    },
    stockMove(itemId, warehouseId, date, quantity) {
      return insert("stock_ledger", {
        company_id: companyId, item_id: itemId, warehouse_id: warehouseId, transaction_date: date, transaction_type: quantity >= 0 ? "Inward" : "Outward",
        source_module: "audit_watch_fixture", source_id: ++counter, inward_quantity: Math.max(quantity, 0), outward_quantity: Math.max(-quantity, 0), rate: 100
      });
    },
    // A posted voucher with full control over its dates. lines: [accountName, debitRupees, creditRupees]
    voucher({ date, createdAt = `${date} 06:00:00`, type = "Journal", source = "manual_voucher", lines, status = "Posted" }) {
      const voucherId = insert("vouchers", {
        company_id: companyId, voucher_number: next("JV"), voucher_date: date, voucher_type: type, narration: "fixture",
        source_module: source, status: "Draft", created_at: createdAt, financial_year_id: yearFor(date)
      });
      for (const [account, debit, credit] of lines) {
        const lineId = insert("voucher_lines", { voucher_id: voucherId, account_id: accountId(account), debit, credit, debit_minor: Math.round(debit * 100), credit_minor: Math.round(credit * 100) });
        insert("ledger_entries", {
          company_id: companyId, voucher_id: voucherId, voucher_line_id: lineId, account_id: accountId(account), entry_date: date,
          debit, credit, debit_minor: Math.round(debit * 100), credit_minor: Math.round(credit * 100), source_module: source
        });
      }
      if (status !== "Draft") db.prepare("UPDATE vouchers SET status = 'Posted' WHERE id = ?").run(voucherId);
      return voucherId;
    },
    user(extra = {}) {
      return insert("users", { username: next("user"), password_hash: "x", display_name: next("User"), role: "accountant", status: "active", ...extra });
    }
  };
  return api;
}

// ---- Read tracing: every query a check sends through findings() is EXPLAINed, and
// the tables and columns SQLite opens are recorded per check. The suite's last test
// compares them with the catalogue's `reads`, so the AG-1 dependency map cannot drift
// from the SQL.
const traced = new Map();
const schemaCache = new WeakMap();
function schemaOf(db) {
  if (!schemaCache.has(db)) {
    const byRoot = new Map(db.prepare("SELECT name, tbl_name, rootpage, type FROM sqlite_master WHERE rootpage > 0").all().map((row) => [row.rootpage, row]));
    const columns = new Map();
    const columnsOf = (row) => {
      if (!columns.has(row.name)) {
        columns.set(row.name, row.type === "table"
          ? db.prepare(`PRAGMA table_info("${row.name}")`).all().map((col) => col.name)
          : db.prepare(`PRAGMA index_xinfo("${row.name}")`).all().map((col) => (col.cid === -1 ? "id" : col.name)));
      }
      return columns.get(row.name);
    };
    schemaCache.set(db, { byRoot, columnsOf });
  }
  return schemaCache.get(db);
}
export function tracingQuery(q, { checkId, db }) {
  const { byRoot, columnsOf } = schemaOf(db);
  const trace = (sql, params = []) => {
    const reads = traced.get(checkId) || new Map();
    traced.set(checkId, reads);
    const cursors = new Map();
    const note = (table, column) => { if (!reads.has(table)) reads.set(table, new Set()); if (column) reads.get(table).add(column); };
    for (const op of db.prepare(`EXPLAIN ${sql}`).all(...params)) {
      if (op.opcode === "OpenRead") {
        const object = byRoot.get(op.p2);
        if (object) { cursors.set(op.p1, object); note(object.tbl_name); }
      } else if (op.opcode === "Column" && cursors.has(op.p1)) {
        const object = cursors.get(op.p1);
        note(object.tbl_name, columnsOf(object)[op.p2]);
      } else if ((op.opcode === "Rowid" || op.opcode === "IdxRowid") && cursors.has(op.p1)) {
        note(cursors.get(op.p1).tbl_name, "id");
      }
    }
  };
  const wrapped = (sql, params = []) => { trace(sql, params); return q(sql, params); };
  wrapped.each = (sql, params, visit) => { trace(sql, params); return q.each(sql, params, visit); };
  return wrapped;
}
// { checkId: { table: [columns] } } for every check run through findings() so far.
export function tracedReads() {
  return Object.fromEntries([...traced].map(([checkId, reads]) => [checkId, Object.fromEntries([...reads].map(([table, columns]) => [table, [...columns].sort()]))]));
}

// Runs one check on the database and returns its findings.
export function findings(m, db, checkId, options = {}) {
  const result = m.runAuditWatch(db, { companyId: 1, role: "admin", from: "2025-04-01", to: "2026-12-31", today: "2026-11-17", checkIds: [checkId], wrapQuery: tracingQuery, ...options });
  const check = result.results.find((row) => row.id === checkId);
  if (check.status === "error") throw new Error(`${checkId} failed: ${check.error}`);
  return check.findings;
}

// True when a finding names every one of the given records.
export const names = (list, ...refs) => list.some((finding) => refs.every(([table, id]) => finding.refs.some((ref) => ref.table === table && Number(ref.id) === Number(id))));
