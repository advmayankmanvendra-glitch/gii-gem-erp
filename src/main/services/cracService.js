/**
 * CRAC Service - Consignee Receipt and Acceptance Certificate tracking.
 * Read-heavy operations for CRAC lifecycle management.
 */

/**
 * List CRAC records with optional filters.
 * @param {object} db - SQLite database handle
 * @param {object} filters - { company_id, supply_order_id, crac_status, department_id }
 * @returns {Array} CRAC records with linked order info
 */
export function listCracRecords(db, filters = {}) {
  const companyId = Number(filters.company_id || 0);
  const conditions = ["cr.is_deleted = 0"];
  const params = {};
  if (companyId) { conditions.push("cr.company_id = @company_id"); params.company_id = companyId; }
  if (filters.supply_order_id) { conditions.push("cr.supply_order_id = @supply_order_id"); params.supply_order_id = Number(filters.supply_order_id); }
  if (filters.crac_status) { conditions.push("cr.crac_status = @crac_status"); params.crac_status = filters.crac_status; }
  if (filters.department_id) { conditions.push("cr.department_id = @department_id"); params.department_id = Number(filters.department_id); }
  return db.prepare(`
    SELECT cr.*, so.order_number, so.institution_name, so.order_status,
      gd.department_name, i.invoice_number
    FROM crac_records cr
    LEFT JOIN supply_orders so ON so.id = cr.supply_order_id
    LEFT JOIN government_departments gd ON gd.id = cr.department_id
    LEFT JOIN invoices i ON i.id = cr.invoice_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY cr.created_at DESC
  `).all(params);
}

/**
 * Get a single CRAC record by ID.
 * @param {object} db - SQLite database handle
 * @param {number} id - CRAC record ID
 * @returns {object|null}
 */
export function getCracRecord(db, id) {
  return db.prepare(`
    SELECT cr.*, so.order_number, so.institution_name, so.order_status,
      gd.department_name, i.invoice_number
    FROM crac_records cr
    LEFT JOIN supply_orders so ON so.id = cr.supply_order_id
    LEFT JOIN government_departments gd ON gd.id = cr.department_id
    LEFT JOIN invoices i ON i.id = cr.invoice_id
    WHERE cr.id = ? AND cr.is_deleted = 0
  `).get(id);
}

/**
 * Create a new CRAC record.
 * @param {object} db - SQLite database handle
 * @param {object} payload - CRAC record fields
 * @returns {object} Created CRAC record
 */
export function createCracRecord(db, payload) {
  const companyId = Number(payload.company_id || 0);
  if (!companyId) throw new Error("Company context is required for CRAC creation");
  if (!payload.supply_order_id) throw new Error("Supply order is required for CRAC");
  const fields = ["company_id", "supply_order_id", "department_id", "invoice_id", "crac_number", "crac_date", "crac_amount", "crac_status", "issued_by", "issuing_designation", "department", "remarks", "created_by"];
  const data = { company_id: companyId, supply_order_id: payload.supply_order_id, department_id: payload.department_id || null, invoice_id: payload.invoice_id || null, crac_number: payload.crac_number || null, crac_date: payload.crac_date || null, crac_amount: Number(payload.crac_amount || 0), crac_status: payload.crac_status || "Pending", issued_by: payload.issued_by || null, issuing_designation: payload.issuing_designation || null, department: payload.department || null, remarks: payload.remarks || null, created_by: payload.created_by || null };
  const columns = fields.filter((f) => data[f] !== undefined);
  const placeholders = columns.map((c) => `@${c}`);
  const result = db.prepare(`INSERT INTO crac_records (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`).run(data);
  const record = db.prepare("SELECT * FROM crac_records WHERE id = ?").get(result.lastInsertRowid);
  if (record && data.crac_status === "Generated") {
    db.prepare("UPDATE supply_orders SET crac_status = 'Generated', crac_number = ?, crac_date = ?, crac_amount = ?, crac_issued_by = ?, crac_issuing_designation = ?, crac_department = ?, crac_remarks = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(data.crac_number, data.crac_date, data.crac_amount, data.issued_by, data.issuing_designation, data.department, data.remarks, data.supply_order_id);
  }
  return record;
}

/**
 * Update an existing CRAC record.
 * @param {object} db - SQLite database handle
 * @param {number} id - CRAC record ID
 * @param {object} payload - Fields to update
 * @returns {object} Updated CRAC record
 */
export function updateCracRecord(db, id, payload) {
  const existing = db.prepare("SELECT * FROM crac_records WHERE id = ? AND is_deleted = 0").get(id);
  if (!existing) throw new Error("CRAC record not found");
  const allowed = ["crac_number", "crac_date", "crac_amount", "crac_status", "issued_by", "issuing_designation", "department", "remarks", "invoice_id"];
  const updates = [];
  const params = { id };
  allowed.forEach((field) => {
    if (payload[field] !== undefined) {
      updates.push(`${field} = @${field}`);
      params[field] = payload[field];
    }
  });
  if (updates.length) {
    db.prepare(`UPDATE crac_records SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run(params);
  }
  const record = db.prepare("SELECT * FROM crac_records WHERE id = ?").get(id);
  if (record && record.crac_status === "Generated" && record.supply_order_id) {
    db.prepare("UPDATE supply_orders SET crac_status = 'Generated', crac_number = ?, crac_date = ?, crac_amount = ?, crac_issued_by = ?, crac_issuing_designation = ?, crac_department = ?, crac_remarks = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(record.crac_number, record.crac_date, record.crac_amount, record.issued_by, record.issuing_designation, record.department, record.remarks, record.supply_order_id);
  }
  return record;
}

/**
 * Soft-delete a CRAC record.
 * @param {object} db - SQLite database handle
 * @param {number} id - CRAC record ID
 * @param {number} deletedBy - User ID
 */
export function deleteCracRecord(db, id, deletedBy) {
  const existing = db.prepare("SELECT * FROM crac_records WHERE id = ? AND is_deleted = 0").get(id);
  if (!existing) throw new Error("CRAC record not found");
  db.prepare("UPDATE crac_records SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE id = ?").run(deletedBy || null, id);
  if (existing.supply_order_id) {
    db.prepare("UPDATE supply_orders SET crac_status = 'Not Required', crac_number = NULL, crac_date = NULL, crac_amount = 0, crac_issued_by = NULL, crac_issuing_designation = NULL, crac_department = NULL, crac_remarks = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(existing.supply_order_id);
  }
}

/**
 * Get CRAC statistics for dashboard.
 * @param {object} db - SQLite database handle
 * @param {number} companyId - Company ID (0 for all)
 * @returns {object} CRAC counts
 */
export function getCracStats(db, companyId = 0) {
  const where = companyId ? "WHERE cr.company_id = @company_id AND cr.is_deleted = 0" : "WHERE cr.is_deleted = 0";
  const params = companyId ? { company_id: companyId } : {};
  const pending = db.prepare(`SELECT COUNT(*) AS count FROM crac_records cr ${where} AND cr.crac_status = 'Pending'`).get(params).count;
  const generated = db.prepare(`SELECT COUNT(*) AS count FROM crac_records cr ${where} AND cr.crac_status = 'Generated'`).get(params).count;
  const rejected = db.prepare(`SELECT COUNT(*) AS count FROM crac_records cr ${where} AND cr.crac_status = 'Rejected'`).get(params).count;
  return { pending, generated, rejected, total: pending + generated + rejected };
}

/**
 * Check if CRAC exists for a supply order.
 * @param {object} db - SQLite database handle
 * @param {number} supplyOrderId - Supply order ID
 * @returns {boolean}
 */
export function hasCracForOrder(db, supplyOrderId) {
  const row = db.prepare("SELECT id FROM crac_records WHERE supply_order_id = ? AND is_deleted = 0 LIMIT 1").get(supplyOrderId);
  return Boolean(row);
}
