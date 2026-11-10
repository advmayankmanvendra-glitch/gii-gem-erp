/**
 * Order Closure Service - Checklist-driven operational closure tracking.
 */

/**
 * Compute closure checklist for a supply order.
 * @param {object} db - SQLite database handle
 * @param {number} orderId - Supply order ID
 * @returns {object} { checks, percentage, ready }
 */
export function computeOrderClosure(db, orderId) {
  const order = db.prepare("SELECT * FROM supply_orders WHERE id = ? AND is_deleted = 0").get(orderId);
  if (!order) return { checks: [], percentage: 0, ready: false };

  const checks = [
    { label: "Supply Completed", key: "supply_completed", ready: Boolean(order.is_supply_completed || order.supply_completed_at) },
    { label: "CRAC Generated", key: "crac_generated", ready: order.crac_status === "Generated" },
    { label: "Invoice Submitted", key: "invoice_submitted", ready: db.prepare("SELECT id FROM invoices WHERE order_id = ? AND is_deleted = 0 LIMIT 1").get(orderId) ? true : false },
    { label: "Payment Received", key: "payment_received", ready: db.prepare("SELECT id FROM payments WHERE order_id = ? AND is_deleted = 0 LIMIT 1").get(orderId) ? true : false },
    { label: "Documents Uploaded", key: "documents_uploaded", ready: db.prepare("SELECT id FROM documents WHERE linked_module = 'supply_orders' AND linked_record_id = ? AND status = 'active' AND deleted_at IS NULL LIMIT 1").get(orderId) ? true : false },
    { label: "No Outstanding Issues", key: "no_outstanding_issues", ready: true }
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
export function markOrderOperationallyClosed(db, orderId, audit = () => {}) {
  db.transaction(() => {
    const closure = computeOrderClosure(db, orderId);
    if (!closure.ready) throw new Error("Order closure checklist is not complete");
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
