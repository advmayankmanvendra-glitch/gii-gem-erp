/**
 * Order Closure Service - Checklist-driven operational closure tracking.
 */

/**
 * Compute closure checklist for a supply order.
 * @param {object} db - SQLite database handle
 * @param {number} orderId - Supply order ID
 * @returns {object} { checks, percentage, ready }
 */
export function computeOrderClosure(db, orderId, { outstandingFor } = {}) {
  // One definition of "settled": the books' own outstanding calculation, passed in by the caller.
  if (typeof outstandingFor !== "function") throw new Error("Order closure check refused: no outstanding-amount calculation was passed, so settlement cannot be proved. Nothing was changed.");
  const order = db.prepare("SELECT * FROM supply_orders WHERE id = ? AND is_deleted = 0").get(orderId);
  if (!order) return { checks: [], percentage: 0, ready: false };

  const invoices = db.prepare("SELECT id, invoice_number, posting_status FROM invoices WHERE order_id = ? AND COALESCE(is_deleted, 0) = 0").all(orderId);
  const posted = invoices.filter((invoice) => invoice.posting_status === "Posted");
  // Settlement is proved from the books: every posted invoice of the order has nothing
  // left to receive. One receipt somewhere on the order is not proof of settlement.
  // A posted invoice with no receivable on record cannot be shown to be settled.
  const hasReceivable = db.prepare("SELECT 1 FROM receivables WHERE billing_id = ? AND COALESCE(is_deleted, 0) = 0");
  const unsettled = posted.filter((invoice) => !hasReceivable.get(invoice.id) || Number(outstandingFor(db, invoice.id) || 0) > 0.005);
  // Open work on the order: invoices or receipts saved but not posted (or failed).
  const openInvoices = invoices.filter((invoice) => !["Posted", "Reversed", "Cancelled"].includes(invoice.posting_status || "Draft"));
  const openReceipts = db.prepare("SELECT COUNT(*) c FROM payments WHERE order_id = ? AND COALESCE(is_deleted, 0) = 0 AND COALESCE(posting_status, 'Draft') NOT IN ('Posted', 'Reversed', 'Cancelled')").get(orderId).c;

  const checks = [
    { label: "Supply Completed", key: "supply_completed", ready: Boolean(order.is_supply_completed || order.supply_completed_at) },
    { label: "CRAC Generated", key: "crac_generated", ready: order.crac_status === "Generated" },
    { label: "Invoice Posted", key: "invoice_submitted", ready: posted.length > 0 },
    { label: "Payment Settled", key: "payment_received", ready: posted.length > 0 && unsettled.length === 0, detail: unsettled.length ? `Still to receive on ${unsettled.map((invoice) => invoice.invoice_number).join(", ")}` : "" },
    { label: "Documents Uploaded", key: "documents_uploaded", ready: db.prepare("SELECT id FROM documents WHERE linked_module = 'supply_orders' AND linked_record_id = ? AND status = 'active' AND deleted_at IS NULL LIMIT 1").get(orderId) ? true : false },
    { label: "No Outstanding Issues", key: "no_outstanding_issues", ready: openInvoices.length === 0 && openReceipts === 0, detail: openInvoices.length || openReceipts ? `${openInvoices.length} invoice(s) and ${openReceipts} receipt(s) are saved but not posted` : "" }
  ];

  const readyCount = checks.filter((c) => c.ready).length;
  const percentage = Math.round((readyCount / checks.length) * 100);
  const ready = percentage === 100;

  return { checks, percentage, ready };
}

/**
 * Mark supply order as operationally closed.
 * @param {object} db - SQLite database handle
 * @param {number} orderId - Supply order ID
 * @param {function} audit - audit writer, called inside the transaction
 */
export function markOrderOperationallyClosed(db, orderId, audit = () => { throw new Error("Order closure refused: no audit writer was passed, so this change could not be recorded. Nothing was changed."); }, closureOptions = {}) {
  db.transaction(() => {
    const closure = computeOrderClosure(db, orderId, closureOptions);
    if (!closure.ready) {
      const missing = closure.checks.filter((check) => !check.ready).map((check) => (check.detail ? `${check.label} (${check.detail})` : check.label));
      throw new Error(`Order cannot be closed yet. Still open: ${missing.join("; ")}. Finish these, then close the order again.`);
    }
    db.prepare("UPDATE supply_orders SET operationally_closed = 1, operationally_closed_at = CURRENT_TIMESTAMP, closure_percentage = 100, closure_checklist = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(JSON.stringify(closure.checks), orderId);
    // Audited in the same transaction; the go-live rollback guard relies on this row.
    const order = db.prepare("SELECT company_id FROM supply_orders WHERE id = ?").get(orderId);
    audit({ company_id: order?.company_id || null, action: "order_operationally_closed", module: "crac", table_name: "supply_orders", record_id: Number(orderId) || null, new_value: JSON.stringify({ checks: closure.checks }) });
  })();
}

/**
 * Get closure-pending orders.
 * @param {object} db - SQLite database handle
 * @param {number} companyId - Company ID
 * @returns {Array} Orders with partial closure
 */
export function getClosurePendingOrders(db, companyId = 0) {
  const where = companyId ? "WHERE so.company_id = @company_id AND so.is_deleted = 0 AND COALESCE(so.operationally_closed, 0) = 0" : "WHERE so.is_deleted = 0 AND COALESCE(so.operationally_closed, 0) = 0";
  const params = companyId ? { company_id: companyId } : {};
  return db.prepare(`
    SELECT so.id, so.order_number, so.crac_status, so.closure_percentage,
      so.operationally_closed, so.supply_completed_at
    FROM supply_orders so
    ${where}
    ORDER BY so.closure_percentage ASC, so.id DESC
  `).all(params);
}
