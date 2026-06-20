/**
 * Payment Readiness Service - Identify payment bottlenecks for supply orders.
 */

/**
 * Get payment readiness report data.
 * @param {object} db - SQLite database handle
 * @param {object} filters - { company_id, department_id, crac_status, payment_status, date_from, date_to }
 * @returns {Array} Payment readiness rows
 */
export function getPaymentReadinessReport(db, filters = {}) {
  const companyId = Number(filters.company_id || 0);
  const conditions = ["so.is_deleted = 0"];
  const params = {};
  if (companyId) { conditions.push("so.company_id = @company_id"); params.company_id = companyId; }
  if (filters.department_id) { conditions.push("so.department_id = @department_id"); params.department_id = Number(filters.department_id); }
  if (filters.crac_status) { conditions.push("so.crac_status = @crac_status"); params.crac_status = filters.crac_status; }
  if (filters.date_from) { conditions.push("i.invoice_date >= @date_from"); params.date_from = filters.date_from; }
  if (filters.date_to) { conditions.push("i.invoice_date <= @date_to"); params.date_to = filters.date_to; }

  return db.prepare(`
    SELECT
      so.id AS order_id,
      so.order_number,
      so.crac_status,
      so.crac_number,
      so.crac_date,
      so.crac_amount,
      gd.department_name,
      i.id AS invoice_id,
      i.invoice_number,
      i.invoice_date,
      i.billing_value AS invoice_amount,
      COALESCE(r.amount_received, 0) AS amount_received,
      COALESCE(r.balance_outstanding, i.billing_value + (i.billing_value * i.gst_rate / 100)) AS balance_outstanding,
      CASE WHEN COALESCE(r.amount_received, 0) >= (i.billing_value + (i.billing_value * i.gst_rate / 100)) THEN 'Paid' ELSE 'Pending' END AS payment_status,
      JULIANDAY('now') - JULIANDAY(so.crac_date) AS days_since_crac
    FROM supply_orders so
    LEFT JOIN government_departments gd ON gd.id = so.department_id
    LEFT JOIN invoices i ON i.order_id = so.id AND i.is_deleted = 0
    LEFT JOIN receivables r ON r.billing_id = i.id AND r.is_deleted = 0
    WHERE ${conditions.join(" AND ")}
    ORDER BY so.crac_date DESC, so.order_number
  `).all(params);
}

/**
 * Get orders billed without CRAC.
 * @param {object} db - SQLite database handle
 * @param {number} companyId - Company ID
 * @returns {Array} Orders with invoices but no CRAC
 */
export function getOrdersBilledWithoutCrac(db, companyId = 0) {
  const where = companyId ? "so.company_id = @company_id AND" : "";
  const params = companyId ? { company_id: companyId } : {};
  return db.prepare(`
    SELECT so.id, so.order_number, so.crac_status, i.invoice_number, i.billing_value
    FROM supply_orders so
    INNER JOIN invoices i ON i.order_id = so.id AND i.is_deleted = 0
    WHERE ${where} so.is_deleted = 0
      AND (so.crac_status IS NULL OR so.crac_status IN ('Not Required', 'Pending'))
    ORDER BY so.id
  `).all(params);
}

/**
 * Get payment pending orders beyond threshold.
 * @param {object} db - SQLite database handle
 * @param {number} companyId - Company ID
 * @param {number} thresholdDays - Days threshold (default 60)
 * @returns {Array} Payment delayed orders
 */
export function getPaymentDelayedOrders(db, companyId = 0, thresholdDays = 60) {
  const where = companyId ? "so.company_id = @company_id AND" : "";
  const params = companyId ? { company_id: companyId, threshold: thresholdDays } : { threshold: thresholdDays };
  return db.prepare(`
    SELECT so.id, so.order_number, so.crac_status, so.crac_date,
      i.invoice_number, i.billing_value,
      COALESCE(r.amount_received, 0) AS amount_received,
      COALESCE(r.balance_outstanding, i.billing_value + (i.billing_value * i.gst_rate / 100)) AS balance_outstanding,
      JULIANDAY('now') - JULIANDAY(i.invoice_date) AS days_since_invoice
    FROM supply_orders so
    INNER JOIN invoices i ON i.order_id = so.id AND i.is_deleted = 0
    LEFT JOIN receivables r ON r.billing_id = i.id AND r.is_deleted = 0
    WHERE ${where} so.is_deleted = 0
      AND so.crac_status = 'Generated'
      AND COALESCE(r.amount_received, 0) < (i.billing_value + (i.billing_value * i.gst_rate / 100))
      AND JULIANDAY('now') - JULIANDAY(i.invoice_date) > @threshold
    ORDER BY days_since_invoice DESC
  `).all(params);
}
