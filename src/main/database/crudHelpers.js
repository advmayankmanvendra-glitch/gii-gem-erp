export function createCrudHelpers({
  ALL_TABLES,
  WRITE_POLICY,
  TRANSACTION_TABLES,
  COMPANY_SPECIFIC_MASTER_TABLES,
  MASTER_TABLES,
  ACCOUNTING_TABLES,
  auditLog,
  assertTransactionYearOpen,
  financialYearForDate,
  transactionDateFor,
  seedAccounts,
  autoReserveOrderStock
}) {
  function tableExists(db, table) {
    return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
  }

  function columnExists(db, table, column) {
    if (!tableExists(db, table)) return false;
    return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
  }

  function activeRowClause(db, table, alias = "") {
    if (!columnExists(db, table, "is_deleted")) return "";
    const prefix = alias ? `${alias}.` : "";
    return ` AND COALESCE(${prefix}is_deleted, 0) = 0`;
  }

  function assertTable(table) {
    if (!ALL_TABLES[table]) {
      throw new Error(`Unsupported table: ${table}`);
    }
  }

  function assertWriteAllowed(table, action) {
    if (WRITE_POLICY.accountingReadOnly.has(table)) {
      throw new Error(`${table} is accounting-controlled and cannot be modified through generic ${action}`);
    }
    if (!WRITE_POLICY.master.has(table) && !WRITE_POLICY.transaction.has(table)) {
      throw new Error(`No generic ${action} permission for ${table}`);
    }
  }

  function normalizePayloadForTable(table, payload = {}) {
    if (["stock_inwards", "stock_outwards", "stock_adjustments", "stock_returns"].includes(table)) {
      const normalized = { ...payload };
      ["company_id", "procurement_id", "order_id", "supplier_id", "department_id", "item_id", "warehouse_id"].forEach((field) => {
        if (normalized[field] === "" || normalized[field] === undefined) normalized[field] = null;
      });
      normalized.posting_status ||= "Draft";
      normalized.approval_status ||= table === "stock_adjustments" ? "Pending Approval" : "Draft";
      return normalized;
    }
    if (table !== "suppliers") return payload;
    const normalized = { ...payload };
    normalized.supplier_name ||= normalized.supplier_account_name || normalized.beneficiary_account_name || normalized.account_name || "";
    normalized.supplier_type ||= normalized.beneficiary_type || "";
    normalized.supplier_code ||= normalized.beneficiary_code || "";
    normalized.supplier_account_name ||= normalized.beneficiary_account_name || normalized.supplier_name || "";
    normalized.supplier_account_number ||= normalized.beneficiary_account_number || normalized.account_number || "";
    normalized.supplier_bank_name ||= normalized.beneficiary_bank_name || normalized.bank_name || "";
    normalized.supplier_bank_ifsc_code ||= normalized.beneficiary_ifsc_code || normalized.ifsc || "";
    normalized.supplier_branch ||= normalized.beneficiary_branch || normalized.branch || "";
    normalized.supplier_contact ||= normalized.beneficiary_contact || normalized.contact || "";
    normalized.status ||= "active";
    if (!normalized.bank_details && (normalized.supplier_account_number || normalized.supplier_bank_name || normalized.supplier_bank_ifsc_code || normalized.supplier_branch)) {
      normalized.bank_details = [
        `Account Name: ${normalized.supplier_account_name || "-"}`,
        `Account Number: ${normalized.supplier_account_number || "-"}`,
        `Bank: ${normalized.supplier_bank_name || "-"}`,
        `IFSC: ${normalized.supplier_bank_ifsc_code || "-"}`,
        `Branch: ${normalized.supplier_branch || "-"}`
      ].join("; ");
    }
    if (!normalized.contact_details && normalized.supplier_contact) normalized.contact_details = normalized.supplier_contact;
    return normalized;
  }

  function cleanPayload(table, payload) {
    assertTable(table);
    payload = normalizePayloadForTable(table, payload);
    const allowed = ALL_TABLES[table].fields;
    const cleaned = {};
    allowed.forEach((field) => {
      cleaned[field] = payload[field] ?? "";
    });
    [
      "company_id",
      "financial_year_id",
      "order_id",
      "billing_id",
      "bank_id",
      "department_id",
      "employee_id",
      "supplier_id",
      "expense_head_id",
      "procurement_id",
      "order_item_id",
      "item_id",
      "warehouse_id",
      "default_warehouse_id"
    ].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(cleaned, field) && cleaned[field] === "") cleaned[field] = null;
    });
    ALL_TABLES[table].required.forEach((field) => {
      if (!String(cleaned[field] ?? "").trim()) {
        throw new Error(`${field.replaceAll("_", " ")} is required`);
      }
    });
    return cleaned;
  }

  function money(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
  }

  function supplyOrderNeedsItems(status) {
    return !["", "Draft", "Received"].includes(String(status || "").trim());
  }

  function extractSupplyOrderItems(payload = {}) {
    if (Array.isArray(payload.order_items)) return payload.order_items;
    if (Array.isArray(payload.items)) return payload.items;
    return null;
  }

  function hasSupplyOrderItemInput(line = {}) {
    return [
      line.item_id,
      line.item_description,
      line.description,
      line.brand,
      line.model,
      line.hsn_sac,
      line.hsn,
      line.quantity,
      line.rate,
      line.quoted_rate,
      line.gst_rate,
      line.required_delivery_date,
      line.remarks
    ].some((value) => String(value ?? "").trim() !== "" && String(value ?? "").trim() !== "0");
  }

  function prepareSupplyOrderItems(db, companyId, orderId, lines, status) {
    const source = Array.isArray(lines) ? lines.filter(hasSupplyOrderItemInput) : [];
    if (supplyOrderNeedsItems(status) && !source.length) {
      throw new Error("At least one order item is required before moving this order beyond Received/Draft.");
    }
    const prepared = source.map((line, index) => {
      const itemId = line.item_id ? Number(line.item_id) : null;
      const item = itemId ? db.prepare("SELECT * FROM items WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(itemId) : null;
      const quantity = Number(line.quantity || 0);
      const quotedRate = Number(line.rate ?? line.quoted_rate ?? 0);
      const gstRate = Number(line.gst_rate ?? item?.gst_rate ?? 0);
      const remarks = String(line.remarks || "").trim();
      if (quantity <= 0) throw new Error(`Order item ${index + 1}: quantity must be greater than zero.`);
      if (quotedRate <= 0) throw new Error(`Order item ${index + 1}: rate must be greater than zero.`);
      if (!Number.isFinite(gstRate) || gstRate < 0) throw new Error(`Order item ${index + 1}: GST rate must be numeric and non-negative.`);
      if (item && String(item.gst_rate ?? "") !== "" && Number(item.gst_rate || 0) !== gstRate && !remarks) {
        throw new Error(`Order item ${index + 1}: GST override requires item remarks.`);
      }
      const taxableValue = money(quantity * quotedRate);
      const gstAmount = money(taxableValue * gstRate / 100);
      return {
        company_id: companyId,
        order_id: orderId || null,
        item_id: itemId,
        item_description: String(line.item_description || line.description || item?.item_name || "").trim(),
        brand: String(line.brand || item?.brand || "").trim(),
        model: String(line.model || item?.model || "").trim(),
        hsn_sac: String(line.hsn_sac || line.hsn || item?.hsn_code || "").trim(),
        quantity,
        unit: String(line.unit || item?.unit || "").trim(),
        quoted_rate: quotedRate,
        gst_rate: gstRate,
        taxable_value: taxableValue,
        gst_amount: gstAmount,
        gross_value: money(taxableValue + gstAmount),
        required_delivery_date: String(line.required_delivery_date || "").trim() || null,
        remarks
      };
    });
    const totals = prepared.reduce((sum, line) => ({
      total_quantity: money(sum.total_quantity + Number(line.quantity || 0)),
      order_taxable_value: money(sum.order_taxable_value + Number(line.taxable_value || 0)),
      order_gst_amount: money(sum.order_gst_amount + Number(line.gst_amount || 0)),
      order_gross_value: money(sum.order_gross_value + Number(line.gross_value || 0))
    }), { total_quantity: 0, order_taxable_value: 0, order_gst_amount: 0, order_gross_value: 0 });
    return { rows: prepared, totals };
  }

  function replaceSupplyOrderItems(db, orderId, companyId, rows) {
    db.prepare("UPDATE order_items SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE order_id = ? AND COALESCE(is_deleted, 0) = 0").run(orderId);
    const insert = db.prepare(`
      INSERT INTO order_items (
        company_id, order_id, item_id, item_description, brand, model, hsn_sac, quantity, unit,
        quoted_rate, gst_rate, taxable_value, gst_amount, gross_value, required_delivery_date, remarks
      )
      VALUES (
        @company_id, @order_id, @item_id, @item_description, @brand, @model, @hsn_sac, @quantity, @unit,
        @quoted_rate, @gst_rate, @taxable_value, @gst_amount, @gross_value, @required_delivery_date, @remarks
      )
    `);
    rows.forEach((line) => insert.run({ ...line, company_id: companyId, order_id: orderId }));
  }

  function createSupplyOrderRecord(db, payload = {}) {
    const transaction = db.transaction(() => {
      const itemLines = extractSupplyOrderItems(payload);
      const data = cleanPayload("supply_orders", payload);
      if (!data.company_id) throw new Error("Company context is required. Select Current Company before saving this record.");
      data.posting_status = data.posting_status || "Draft";
      const prepared = prepareSupplyOrderItems(db, data.company_id, null, itemLines || [], data.order_status);
      Object.assign(data, prepared.totals);
      const columns = Object.keys(data);
      const placeholders = columns.map((column) => `@${column}`).join(", ");
      const result = db.prepare(`INSERT INTO supply_orders (${columns.join(", ")}) VALUES (${placeholders})`).run(data);
      replaceSupplyOrderItems(db, result.lastInsertRowid, data.company_id, prepared.rows);
      autoReserveOrderStock(db, result.lastInsertRowid);
      const record = getRecord(db, "supply_orders", result.lastInsertRowid);
      auditLog(db, { company_id: data.company_id, action: "create", table_name: "supply_orders", record_id: result.lastInsertRowid, new_value: JSON.stringify({ ...record, order_items: prepared.rows.length }) });
      return record;
    });
    return transaction();
  }

  function updateSupplyOrderRecord(db, id, payload = {}) {
    const transaction = db.transaction(() => {
      const oldRecord = getRecord(db, "supply_orders", id);
      assertRecordEditable("supply_orders", oldRecord);
      assertSupplyOrderNotLinked(db, id);
      const itemLines = extractSupplyOrderItems(payload);
      const data = cleanPayload("supply_orders", payload);
      data.company_id = data.company_id || oldRecord?.company_id || null;
      if (!data.company_id) throw new Error("Company context is required. Select Current Company before updating this record.");
      const prepared = prepareSupplyOrderItems(db, data.company_id, id, itemLines || [], data.order_status);
      Object.assign(data, prepared.totals);
      const assignments = Object.keys(data).map((field) => `${field} = @${field}`).join(", ");
      db.prepare(`UPDATE supply_orders SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run({ ...data, id });
      replaceSupplyOrderItems(db, id, data.company_id, prepared.rows);
      autoReserveOrderStock(db, id);
      const record = getRecord(db, "supply_orders", id);
      auditLog(db, { company_id: data.company_id, action: "update", table_name: "supply_orders", record_id: id, old_value: JSON.stringify(oldRecord), new_value: JSON.stringify({ ...record, order_items: prepared.rows.length }) });
      return record;
    });
    return transaction();
  }

  function masterRecordIsReferenced(db, table, id) {
    const references = {
      companies: [
        ["supply_orders", "company_id"], ["procurements", "company_id"], ["expense_entries", "company_id"], ["invoices", "company_id"], ["payments", "company_id"],
        ["vouchers", "company_id"], ["ledger_entries", "company_id"], ["cash_bank_ledger", "company_id"], ["documents", "company_id"], ["bank_statement_imports", "company_id"]
      ],
      employees: [["supply_orders", "employee_id"]],
      government_departments: [["supply_orders", "department_id"], ["receivables", "department_id"], ["stock_outwards", "department_id"], ["stock_returns", "department_id"]],
      suppliers: [["procurements", "supplier_id"], ["supplier_payments", "supplier_id"], ["stock_inwards", "supplier_id"], ["stock_returns", "supplier_id"], ["batches", "supplier_id"]],
      items: [["order_items", "item_id"], ["procurement_items", "item_id"], ["invoice_items", "item_id"], ["stock_inwards", "item_id"], ["stock_outwards", "item_id"], ["stock_adjustments", "item_id"], ["stock_returns", "item_id"], ["stock_ledger", "item_id"], ["serial_numbers", "item_id"], ["batches", "item_id"], ["inventory_movements", "item_id"], ["stock_reservations", "item_id"], ["goods_receipt_items", "item_id"], ["delivery_challan_items", "item_id"], ["warehouse_transfers", "item_id"]],
      warehouses: [["stock_inwards", "warehouse_id"], ["stock_outwards", "warehouse_id"], ["stock_adjustments", "warehouse_id"], ["stock_returns", "warehouse_id"], ["stock_ledger", "warehouse_id"], ["serial_numbers", "warehouse_id"], ["batches", "warehouse_id"]],
      expense_heads: [["expense_entries", "expense_head_id"]],
      banks: [["payments", "bank_id"], ["supplier_payments", "bank_account_id"], ["expense_entries", "bank_account_id"], ["cash_bank_ledger", "bank_account_id"], ["bank_statement_imports", "bank_id"], ["bank_statement_entries", "bank_id"]]
    };
    return (references[table] || []).some(([refTable, column]) => {
      if (!tableExists(db, refTable) || !columnExists(db, refTable, column)) return false;
      const deletedFilter = columnExists(db, refTable, "is_deleted") ? "AND COALESCE(is_deleted, 0) = 0" : "";
      return Boolean(db.prepare(`SELECT 1 FROM ${refTable} WHERE ${column} = ? ${deletedFilter} LIMIT 1`).get(id));
    });
  }

  function assertRecordEditable(table, record) {
    if (!record) return;
    if (["procurements", "expense_entries", "invoices", "payments", "stock_inwards", "stock_outwards", "stock_adjustments", "stock_returns"].includes(table) && ["Posted", "Reversed"].includes(record.posting_status)) {
      throw new Error("Posted transactions are locked. Use reversal or correction voucher.");
    }
    if (table === "supply_orders" && ["Locked", "Posted", "Reversed"].includes(record.posting_status)) {
      throw new Error("Supply order is locked and cannot be modified.");
    }
    if (table === "vouchers" && ["Posted", "Reversed"].includes(record.status)) {
      throw new Error("Posted vouchers cannot be edited or deleted. Use reversal.");
    }
  }

  function assertSupplyOrderNotLinked(db, id) {
    const linkedTables = [
      ["procurements", "order_id"],
      ["invoices", "order_id"],
      ["payments", "order_id"],
      ["expense_entries", "order_id"],
      ["stock_inwards", "order_id"],
      ["stock_outwards", "order_id"],
      ["stock_returns", "order_id"]
    ];
    for (const [refTable, column] of linkedTables) {
      if (!tableExists(db, refTable) || !columnExists(db, refTable, column)) continue;
      const deletedFilter = columnExists(db, refTable, "is_deleted") ? "AND COALESCE(is_deleted, 0) = 0" : "";
      const found = db.prepare(`SELECT 1 FROM ${refTable} WHERE ${column} = ? ${deletedFilter} LIMIT 1`).get(id);
      if (found) {
        throw new Error("Supply order has linked transactions and cannot be modified or deleted.");
      }
    }
  }

  function createRecord(db, table, payload) {
    assertWriteAllowed(table, "create");
    if (table === "supply_orders") return createSupplyOrderRecord(db, payload);
    const data = cleanPayload(table, payload);
    const requiresCompanyContext = TRANSACTION_TABLES[table] || COMPANY_SPECIFIC_MASTER_TABLES.has(table);
    if (requiresCompanyContext && !data.company_id) {
      throw new Error("Company context is required. Select Current Company before saving this record.");
    }
    if (["procurements", "expense_entries", "invoices", "payments", "stock_inwards", "stock_outwards", "stock_adjustments", "stock_returns"].includes(table)) {
      data.posting_status = data.posting_status || "Draft";
      data.approval_status = data.approval_status || "Draft";
      data.posting_error = data.posting_error || null;
      assertTransactionYearOpen(db, table, data);
      if (["procurements", "expense_entries", "invoices", "payments"].includes(table)) {
        data.financial_year_id = data.financial_year_id || financialYearForDate(db, data.company_id, transactionDateFor(table, data))?.id || null;
      }
    }
    if (table === "payments" && data.utr_number) {
      const existing = db.prepare("SELECT id FROM payments WHERE utr_number = ? AND is_deleted = 0").get(data.utr_number);
      if (existing) throw new Error("UTR number must be unique");
    }
    if (table === "invoices") {
      const existing = db.prepare(`
        SELECT id FROM invoices
        WHERE company_id = ? AND invoice_number = ? AND COALESCE(financial_year_id, 0) = COALESCE(?, 0) AND is_deleted = 0
      `).get(data.company_id, data.invoice_number, data.financial_year_id);
      if (existing) throw new Error("Invoice number must be unique per company and financial year");
    }
    const columns = Object.keys(data);
    const placeholders = columns.map((column) => `@${column}`).join(", ");
    const statement = db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`);
    const result = statement.run(data);
    const record = getRecord(db, table, result.lastInsertRowid);
    if (table === "companies") {
      seedAccounts(db, record.id);
    }
    if (table === "supply_orders") {
      autoReserveOrderStock(db, record.id);
    }
    auditLog(db, { company_id: data.company_id, action: "create", table_name: table, record_id: result.lastInsertRowid, new_value: JSON.stringify(record) });
    return record;
  }

  function updateRecord(db, table, id, payload) {
    assertWriteAllowed(table, "update");
    if (table === "supply_orders") return updateSupplyOrderRecord(db, id, payload);
    const oldRecord = getRecord(db, table, id);
    assertRecordEditable(table, oldRecord);
    const data = cleanPayload(table, payload);
    const requiresCompanyContext = TRANSACTION_TABLES[table] || COMPANY_SPECIFIC_MASTER_TABLES.has(table);
    if (requiresCompanyContext && !data.company_id) {
      data.company_id = oldRecord?.company_id || null;
    }
    if (requiresCompanyContext && !data.company_id) {
      throw new Error("Company context is required. Select Current Company before updating this record.");
    }
    if (["procurements", "expense_entries", "invoices", "payments", "stock_inwards", "stock_outwards", "stock_adjustments", "stock_returns"].includes(table)) {
      data.posting_status = oldRecord?.posting_status || data.posting_status || "Draft";
      data.approval_status = oldRecord?.approval_status || data.approval_status || "Draft";
      data.posting_error = oldRecord?.posting_error || data.posting_error || null;
      assertTransactionYearOpen(db, table, { ...oldRecord, ...data });
      if (["procurements", "expense_entries", "invoices", "payments"].includes(table)) {
        data.financial_year_id = oldRecord?.financial_year_id || financialYearForDate(db, data.company_id, transactionDateFor(table, data))?.id || null;
      }
    }
    const assignments = Object.keys(data).map((field) => `${field} = @${field}`).join(", ");
    db.prepare(`UPDATE ${table} SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run({ ...data, id });
    const record = getRecord(db, table, id);
    auditLog(db, { company_id: data.company_id, action: "update", table_name: table, record_id: id, old_value: JSON.stringify(oldRecord), new_value: JSON.stringify(record) });
    return record;
  }

  function deleteRecord(db, table, id) {
    assertTable(table);
    assertWriteAllowed(table, "delete");
    const record = getRecord(db, table, id);
    assertRecordEditable(table, record);
    if (table === "supply_orders") {
      assertSupplyOrderNotLinked(db, id);
    }
    if (MASTER_TABLES[table] && masterRecordIsReferenced(db, table, id)) {
      const changes = db.prepare(`UPDATE ${table} SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id).changes;
      auditLog(db, { action: "deactivate", table_name: table, record_id: id, old_value: JSON.stringify(record), new_value: "inactive_linked_master" });
      return changes > 0;
    }
    if (columnExists(db, table, "is_deleted")) {
      const changes = db.prepare(`UPDATE ${table} SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id).changes;
      auditLog(db, { action: "delete", table_name: table, record_id: id, old_value: "", new_value: "soft_delete" });
      return changes > 0;
    }
    auditLog(db, { action: "hard_delete", table_name: table, record_id: id, old_value: JSON.stringify(record), new_value: "hard_delete" });
    return db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id).changes > 0;
  }

  function getRecord(db, table, id) {
    assertTable(table);
    return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  }

  function listRecords(db, table, filters = {}) {
    assertTable(table);
    const search = String(filters.search || "").trim().toLowerCase();
    const status = filters.status || "all";
    const companyId = Number(filters.company_id || 0);
    const fields = ALL_TABLES[table].fields;
    const where = [];
    const params = {};

    if (status !== "all" && fields.includes("status")) {
      where.push("status = @status");
      params.status = status;
    }

    if (search) {
      where.push(`(${fields.map((field) => `LOWER(COALESCE(CAST(${field} AS TEXT), '')) LIKE @search`).join(" OR ")})`);
      params.search = `%${search}%`;
    }

    if (companyId && (fields.includes("company_id") || ACCOUNTING_TABLES.has(table))) {
      where.push("company_id = @company_id");
      params.company_id = companyId;
    }

    if (ACCOUNTING_TABLES.has(table) || MASTER_TABLES[table]) {
      where.push("COALESCE(is_deleted, 0) = 0");
    }
    const finalClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    if (table === "supply_orders") {
      return db.prepare(`
        SELECT supply_orders.*,
          CASE WHEN (
            EXISTS (SELECT 1 FROM procurements p WHERE p.order_id = supply_orders.id AND COALESCE(p.is_deleted, 0) = 0)
            OR EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = supply_orders.id AND COALESCE(i.is_deleted, 0) = 0)
            OR EXISTS (SELECT 1 FROM payments pm WHERE pm.order_id = supply_orders.id AND COALESCE(pm.is_deleted, 0) = 0)
            OR EXISTS (SELECT 1 FROM expense_entries ee WHERE ee.order_id = supply_orders.id AND COALESCE(ee.is_deleted, 0) = 0)
            OR EXISTS (SELECT 1 FROM stock_inwards si WHERE si.order_id = supply_orders.id AND COALESCE(si.is_deleted, 0) = 0)
            OR EXISTS (SELECT 1 FROM stock_outwards so2 WHERE so2.order_id = supply_orders.id AND COALESCE(so2.is_deleted, 0) = 0)
            OR EXISTS (SELECT 1 FROM stock_returns sr WHERE sr.order_id = supply_orders.id AND COALESCE(sr.is_deleted, 0) = 0)
          ) THEN 1 ELSE 0 END AS order_locked,
          COALESCE((SELECT SUM(oi.quantity) FROM order_items oi WHERE oi.order_id = supply_orders.id AND COALESCE(oi.is_deleted, 0) = 0), 0) computed_total_quantity,
          COALESCE((SELECT SUM(oi.taxable_value) FROM order_items oi WHERE oi.order_id = supply_orders.id AND COALESCE(oi.is_deleted, 0) = 0), 0) computed_order_taxable_value,
          COALESCE((SELECT SUM(oi.gst_amount) FROM order_items oi WHERE oi.order_id = supply_orders.id AND COALESCE(oi.is_deleted, 0) = 0), 0) computed_order_gst_amount,
          COALESCE((SELECT SUM(oi.gross_value) FROM order_items oi WHERE oi.order_id = supply_orders.id AND COALESCE(oi.is_deleted, 0) = 0), 0) computed_order_gross_value,
          COALESCE((SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = supply_orders.id AND COALESCE(oi.is_deleted, 0) = 0), 0) order_item_count,
          COALESCE((
            SELECT json_group_array(json_object(
              'id', oi.id,
              'item_id', oi.item_id,
              'item_description', oi.item_description,
              'brand', oi.brand,
              'model', oi.model,
              'hsn_sac', oi.hsn_sac,
              'quantity', oi.quantity,
              'unit', oi.unit,
              'quoted_rate', oi.quoted_rate,
              'gst_rate', oi.gst_rate,
              'taxable_value', oi.taxable_value,
              'gst_amount', oi.gst_amount,
              'gross_value', oi.gross_value,
              'required_delivery_date', oi.required_delivery_date,
              'remarks', oi.remarks,
              'item_name', it.item_name
            ))
            FROM order_items oi
            LEFT JOIN items it ON it.id = oi.item_id
            WHERE oi.order_id = supply_orders.id AND COALESCE(oi.is_deleted, 0) = 0
          ), '[]') order_items_json
        FROM supply_orders
        ${finalClause}
        ORDER BY supply_orders.id DESC
      `).all(params);
    }
    return db.prepare(`SELECT * FROM ${table} ${finalClause} ORDER BY id DESC`).all(params);
  }

  return {
    tableExists,
    columnExists,
    activeRowClause,
    assertTable,
    assertWriteAllowed,
    cleanPayload,
    createRecord,
    updateRecord,
    deleteRecord,
    getRecord,
    listRecords
  };
}
