import crypto from "node:crypto";
import { parseMoneyToMinor } from "../domain/money.js";

export function createImportValidationService(deps) {
  const {
    assertBulkDeleteSafe, enforcePermission, auditLog, userForPermission,
    getRecord, createRecord, updateRecord, columnExists, tableExists,
    normalizeDuplicateKey, supplyOrderNeedsItems, hasSupplyOrderItemInput,
    assertWriteAllowed,
    MASTER_TABLES, IMPORT_ROLLBACK_BLOCKED_TABLES
  } = deps;

  function pickRow(row, keys) {
    return Object.fromEntries(keys.map((key) => [key, String(row[key] ?? "").trim()]));
  }

  function normalizeImportObject(row) {
    return Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [normalizeHeader(key), value]));
  }

  function normalizeImportDate(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    if (slash) {
      const [, day, month, year] = slash;
      const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      return Number.isNaN(Date.parse(iso)) ? "" : iso;
    }
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return "";
    // "22 Oct 2026" parses as local midnight; read the local calendar date, not UTC.
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }

  function normalizeHeader(value) {
    return String(value || "").trim().toLowerCase().replaceAll(" ", "_");
  }

  function masterRecordIsReferenced(db, table, id) {
    const references = {
      companies: [
        ["supply_orders", "company_id"], ["procurements", "company_id"], ["expense_entries", "company_id"], ["invoices", "company_id"], ["payments", "company_id"],
        ["vouchers", "company_id"], ["ledger_entries", "company_id"], ["cash_bank_ledger", "company_id"], ["documents", "company_id"], ["bank_statement_imports", "company_id"],
        ["leads", "company_id"], ["requirement_queries", "company_id"], ["quotations", "company_id"], ["negotiations", "company_id"], ["installations", "company_id"], ["purchase_orders", "company_id"], ["procurement_plans", "company_id"]
      ],
      employees: [["supply_orders", "employee_id"], ["requirement_queries", "employee_id"], ["installations", "supervisor_employee_id"], ["purchase_orders", "employee_id"]],
      government_departments: [["supply_orders", "department_id"], ["receivables", "department_id"], ["stock_outwards", "department_id"], ["stock_returns", "department_id"], ["leads", "department_id"], ["requirement_queries", "department_id"], ["installations", "department_id"], ["purchase_orders", "department_id"]],
      suppliers: [["procurements", "supplier_id"], ["supplier_payments", "supplier_id"], ["stock_inwards", "supplier_id"], ["stock_returns", "supplier_id"], ["batches", "supplier_id"], ["quotations", "supplier_id"], ["negotiations", "supplier_id"], ["purchase_orders", "supplier_id"], ["procurement_plans", "supplier_id"]],
      items: [["order_items", "item_id"], ["procurement_items", "item_id"], ["invoice_items", "item_id"], ["stock_inwards", "item_id"], ["stock_outwards", "item_id"], ["stock_adjustments", "item_id"], ["stock_returns", "item_id"], ["stock_ledger", "item_id"], ["serial_numbers", "item_id"], ["batches", "item_id"], ["inventory_movements", "item_id"], ["stock_reservations", "item_id"], ["goods_receipt_items", "item_id"], ["delivery_challan_items", "item_id"], ["warehouse_transfers", "item_id"], ["procurement_plans", "item_id"]],
      warehouses: [["stock_inwards", "warehouse_id"], ["stock_outwards", "warehouse_id"], ["stock_adjustments", "warehouse_id"], ["stock_returns", "warehouse_id"], ["stock_ledger", "warehouse_id"], ["serial_numbers", "warehouse_id"], ["batches", "warehouse_id"], ["procurement_plans", "warehouse_id"]],
      expense_heads: [["expense_entries", "expense_head_id"]],
      banks: [["payments", "bank_id"], ["supplier_payments", "bank_account_id"], ["expense_entries", "bank_account_id"], ["cash_bank_ledger", "bank_account_id"], ["bank_statement_imports", "bank_id"], ["bank_statement_entries", "bank_id"]]
    };
    return (references[table] || []).some(([refTable, column]) => {
      if (!tableExists(db, refTable) || !columnExists(db, refTable, column)) return false;
      const deletedFilter = columnExists(db, refTable, "is_deleted") ? "AND COALESCE(is_deleted, 0) = 0" : "";
      return Boolean(db.prepare(`SELECT 1 FROM ${refTable} WHERE ${column} = ? ${deletedFilter} LIMIT 1`).get(id));
    });
  }

  function findMasterImportDuplicate(db, table, payload, companyId) {
    const notDeleted = columnExists(db, table, "is_deleted") ? "AND COALESCE(is_deleted, 0) = 0" : "";
    const byText = (field, value, labelField = field) => {
      if (!String(value || "").trim()) return null;
      const row = db.prepare(`SELECT id, ${labelField} label FROM ${table} WHERE LOWER(TRIM(COALESCE(${field}, ''))) = ? ${notDeleted} LIMIT 1`).get(normalizeDuplicateKey(value));
      return row || null;
    };
    const byCompanyText = (field, value, labelField = field) => {
      if (!String(value || "").trim()) return null;
      const row = db.prepare(`SELECT id, ${labelField} label FROM ${table} WHERE company_id = ? AND LOWER(TRIM(COALESCE(${field}, ''))) = ? ${notDeleted} LIMIT 1`).get(companyId, normalizeDuplicateKey(value));
      return row || null;
    };
    if (table === "companies") {
      return byText("gstin", payload.gstin, "company_name") || byText("pan", payload.pan, "company_name") || byText("company_name", payload.company_name, "company_name");
    }
    if (table === "employees") {
      return byText("mobile_number", payload.mobile_number, "employee_name") || byText("employee_name", payload.employee_name, "employee_name");
    }
    if (table === "government_departments") {
      return byText("department_name", payload.department_name, "department_name");
    }
    if (table === "suppliers") {
      return byText("gstin", payload.gstin, "supplier_name") ||
        byText("supplier_code", payload.supplier_code, "supplier_name") ||
        byText("supplier_account_number", payload.supplier_account_number, "supplier_name") ||
        byText("supplier_name", payload.supplier_name, "supplier_name");
    }
    if (table === "items" && String(payload.item_name || "").trim()) {
      return db.prepare(`
        SELECT id, item_name label, 'Normalized item name, brand and model match' duplicate_reason
        FROM items
        WHERE LOWER(TRIM(COALESCE(item_name, ''))) = ? AND LOWER(TRIM(COALESCE(brand, ''))) = ? AND LOWER(TRIM(COALESCE(model, ''))) = ? ${notDeleted}
        LIMIT 1
      `).get(normalizeDuplicateKey(payload.item_name), normalizeDuplicateKey(payload.brand), normalizeDuplicateKey(payload.model)) || null;
    }
    if (table === "warehouses") {
      if (!String(payload.warehouse_name || "").trim()) return null;
      return db.prepare(`
        SELECT id, warehouse_name label,
          CASE WHEN company_id = @company_id THEN 'Mapped to existing warehouse in selected company' ELSE 'Mapped to existing warehouse name to avoid duplicate warehouse master' END duplicate_reason
        FROM warehouses
        WHERE LOWER(TRIM(COALESCE(warehouse_name, ''))) = @warehouse_name ${notDeleted}
        ORDER BY CASE WHEN company_id = @company_id THEN 0 ELSE 1 END, id LIMIT 1
      `).get({ company_id: companyId || null, warehouse_name: normalizeDuplicateKey(payload.warehouse_name) }) || null;
    }
    if (table === "expense_heads") {
      return byText("expense_head_name", payload.expense_head_name, "expense_head_name");
    }
    if (table === "banks") {
      return byText("account_number", payload.account_number, "bank_account_name") || byText("bank_account_name", payload.bank_account_name, "bank_account_name");
    }
    return null;
  }

  function validateImportRow(db, table, row, context) {
    const errors = [];
    row = normalizeImportObject(row);
    const requiresCompanyContext = new Set(["warehouses", "banks", "supply_orders", "procurements", "expense_entries", "invoices", "payments"]);
    const companyId = Number(context.company_id || 0);
    if (requiresCompanyContext.has(table) && !companyId) {
      errors.push("Company context is required before importing company-specific data");
    }
    const payload = {};
    const value = (key) => String(row[key] ?? "").trim();
    const requireValue = (key, label = key.replaceAll("_", " ")) => {
      const item = value(key);
      if (!item) errors.push(`${label} is required`);
      return item;
    };
    const numberValue = (key, label, positive = false) => {
      const raw = value(key);
      if (!raw) return "";
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) errors.push(`${label} must be numeric`);
      if (positive && parsed <= 0) errors.push(`${label} must be positive`);
      return Number.isFinite(parsed) ? parsed : raw;
    };
    const moneyValue = (key, label, positive = false) => {
      const raw = value(key);
      if (!raw) return "";
      let minor;
      try {
        minor = parseMoneyToMinor(raw);
      } catch (e) {
        errors.push(`${label}: ${e.message}`);
        return raw;
      }
      if (positive && minor <= 0) errors.push(`${label} must be positive`);
      return minor / 100;
    };
    const dateValue = (key, label) => {
      const raw = value(key);
      if (!raw) return "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(new Date(`${raw}T00:00:00`).getTime())) errors.push(`${label} must be YYYY-MM-DD`);
      return raw;
    };
    const findOne = (lookupTable, field, raw, label) => {
      if (!raw) return "";
      const hasDeleteFlag = db.prepare(`PRAGMA table_info(${lookupTable})`).all().some((column) => column.name === "is_deleted");
      const found = db.prepare(`SELECT id FROM ${lookupTable} WHERE LOWER(${field}) = LOWER(?) ${hasDeleteFlag ? "AND COALESCE(is_deleted, 0) = 0" : ""} LIMIT 1`).get(raw);
      if (!found) errors.push(`${label} does not exist`);
      return found?.id || "";
    };

    if (table === "companies") {
      payload.company_name = requireValue("company_name");
      payload.gstin = value("gstin");
      payload.pan = value("pan");
      payload.address = value("address");
      payload.bank_name = value("bank_name");
      payload.account_number = value("account_number");
      payload.ifsc = value("ifsc");
      payload.status = value("status") || "active";
      if (payload.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(payload.gstin)) errors.push("GSTIN format is invalid");
      if (payload.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(payload.pan)) errors.push("PAN format is invalid");
    } else if (table === "government_departments") {
      Object.assign(payload, pickRow(row, ["department_name", "contact_person", "contact_number", "address", "status"]));
      if (!payload.department_name) errors.push("department_name is required");
      payload.status ||= "active";
    } else if (table === "suppliers") {
      Object.assign(payload, pickRow(row, ["supplier_name", "supplier_type", "supplier_code", "date_of_activation", "supplier_account_name", "supplier_account_number", "supplier_bank_name", "supplier_bank_ifsc_code", "supplier_branch", "supplier_contact", "remarks", "gstin", "contact_details", "bank_details", "status"]));
      if (!payload.supplier_name && value("beneficiary_account_name")) {
        payload.supplier_name = value("beneficiary_account_name");
        payload.supplier_type = value("beneficiary_type") || payload.supplier_type;
        payload.supplier_code = value("beneficiary_code") || payload.supplier_code;
        payload.date_of_activation = value("date_of_activation") || payload.date_of_activation;
        payload.supplier_account_name = value("beneficiary_account_name") || payload.supplier_account_name;
        payload.supplier_account_number = value("beneficiary_account_number") || payload.supplier_account_number;
        payload.supplier_bank_name = value("beneficiary_bank_name") || payload.supplier_bank_name;
        payload.supplier_bank_ifsc_code = value("beneficiary_ifsc_code") || payload.supplier_bank_ifsc_code;
        payload.supplier_branch = value("beneficiary_branch") || payload.supplier_branch;
        payload.supplier_contact = value("beneficiary_contact") || payload.supplier_contact;
        payload.remarks = value("remarks") || payload.remarks;
        payload.contact_details = `Beneficiary Code: ${value("beneficiary_code") || "-"}; Type: ${value("beneficiary_type") || "-"}`;
        payload.bank_details = [
          `Account Name: ${value("beneficiary_account_name")}`,
          `Account Number: ${value("beneficiary_account_number")}`,
          `Bank: ${value("beneficiary_bank_name")}`,
          `IFSC: ${value("beneficiary_ifsc_code")}`,
          `Branch: ${value("beneficiary_branch")}`
        ].join("; ");
        payload.status = String(value("beneficiary_status") || value("status")).toLowerCase().includes("enabled") ? "active" : "inactive";
      }
      if (!payload.supplier_name && payload.supplier_account_name) payload.supplier_name = payload.supplier_account_name;
      if (!payload.contact_details && payload.supplier_contact) payload.contact_details = payload.supplier_contact;
      if (!payload.bank_details && (payload.supplier_account_number || payload.supplier_bank_name || payload.supplier_bank_ifsc_code || payload.supplier_branch)) {
        payload.bank_details = [
          `Account Name: ${payload.supplier_account_name || "-"}`,
          `Account Number: ${payload.supplier_account_number || "-"}`,
          `Bank: ${payload.supplier_bank_name || "-"}`,
          `IFSC: ${payload.supplier_bank_ifsc_code || "-"}`,
          `Branch: ${payload.supplier_branch || "-"}`
        ].join("; ");
      }
      if (!payload.supplier_name) errors.push("supplier_name is required");
      if (payload.date_of_activation) {
        const normalizedDate = normalizeImportDate(payload.date_of_activation);
        if (!normalizedDate) errors.push("date_of_activation format is invalid");
        else payload.date_of_activation = normalizedDate;
      }
      if (payload.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(payload.gstin)) errors.push("GSTIN format is invalid");
      payload.status ||= "active";
    } else if (table === "employees") {
      Object.assign(payload, pickRow(row, ["employee_name", "mobile_number", "designation", "status"]));
      payload.incentive_percentage = numberValue("incentive_percentage", "incentive_percentage") || 15;
      if (!payload.employee_name) errors.push("employee_name is required");
      if (!payload.mobile_number) errors.push("mobile_number is required");
      payload.status ||= "active";
    } else if (table === "items") {
      Object.assign(payload, pickRow(row, ["item_name", "brand", "model", "hsn_code", "unit", "category", "status"]));
      payload.gst_rate = numberValue("gst_rate", "gst_rate");
      if (!payload.item_name) errors.push("item_name is required");
      if (payload.gst_rate === "") errors.push("gst_rate is required");
      if (!payload.unit) errors.push("unit is required");
      payload.status ||= "active";
    } else if (table === "warehouses") {
      Object.assign(payload, pickRow(row, ["warehouse_name", "location", "warehouse_type", "responsible_person", "status"]));
      payload.company_id = companyId;
      if (!payload.warehouse_name) errors.push("warehouse_name is required");
      payload.status ||= "active";
    } else if (table === "banks") {
      Object.assign(payload, pickRow(row, ["bank_account_name", "bank_name", "account_number", "ifsc", "status"]));
      payload.company_id = companyId;
      payload.opening_balance = moneyValue("opening_balance", "opening_balance") || 0;
      if (!payload.bank_account_name) errors.push("bank_account_name is required");
      if (!payload.bank_name) errors.push("bank_name is required");
      payload.status ||= "active";
    } else if (table === "expense_heads") {
      Object.assign(payload, pickRow(row, ["expense_head_name", "default_calculation_method", "category", "status"]));
      payload.default_percentage = numberValue("default_percentage", "default_percentage") || 0;
      if (!payload.expense_head_name) errors.push("expense_head_name is required");
      payload.default_calculation_method ||= "fixed";
      payload.status ||= "active";
    } else if (table === "supply_orders") {
      payload.order_number = requireValue("order_number");
      payload.supply_type = value("supply_type") || "GeM";
      payload.gem_order_number = value("gem_order_number");
      payload.gem_contract_number = value("gem_contract_number");
      payload.order_date = dateValue("order_date", "order_date");
      payload.department_id = findOne("government_departments", "department_name", requireValue("department"), "department");
      payload.employee_id = findOne("employees", "employee_name", requireValue("employee_assigned"), "employee_assigned");
      payload.institution_name = value("institution_name");
      payload.buyer_name = value("buyer_name");
      payload.buyer_designation = value("buyer_designation");
      payload.buyer_mobile = value("buyer_mobile");
      payload.buyer_email = value("buyer_email");
      payload.consignee = value("consignee_name") || value("consignee");
      payload.consignee_address = value("consignee_address");
      payload.delivery_location = value("delivery_location");
      payload.place_of_supply = value("place_of_supply");
      payload.location = value("location");
      payload.delivery_period = value("delivery_period");
      payload.warranty_period = value("warranty_period");
      payload.payment_terms = value("payment_terms");
      payload.emd_amount = moneyValue("emd_amount", "emd_amount") || 0;
      payload.security_deposit_amount = moneyValue("security_deposit_amount", "security_deposit_amount") || 0;
      payload.supply_due_date = dateValue("supply_due_date", "supply_due_date");
      payload.order_status = value("order_status") || "Received";
      payload.remarks = value("remarks");
      payload.company_id = companyId;
      const itemName = value("item_name");
      const item = itemName ? db.prepare("SELECT * FROM items WHERE LOWER(item_name) = LOWER(?) AND COALESCE(is_deleted, 0) = 0 LIMIT 1").get(itemName) : null;
      const itemLine = {
        item_id: item?.id || null,
        item_description: value("item_description") || itemName,
        brand: value("brand") || item?.brand || "",
        model: value("model") || item?.model || "",
        hsn_sac: value("hsn_sac") || value("hsn") || item?.hsn_code || "",
        quantity: numberValue("quantity", "quantity", false),
        unit: value("unit") || item?.unit || "",
        quoted_rate: numberValue("rate", "rate", false) || numberValue("quoted_rate", "quoted_rate", false),
        gst_rate: value("gst_rate") === "" ? (item?.gst_rate ?? "") : numberValue("gst_rate", "gst_rate", false),
        required_delivery_date: dateValue("required_delivery_date", "required_delivery_date"),
        remarks: value("item_remarks")
      };
      const hasItemLine = hasSupplyOrderItemInput(itemLine);
      if (hasItemLine) payload.order_items = [itemLine];
      if (supplyOrderNeedsItems(payload.order_status) && !hasItemLine) errors.push("At least one order item is required before moving this order beyond Received/Draft");
      if (hasItemLine) {
        if (Number(itemLine.quantity || 0) <= 0) errors.push("quantity must be greater than zero");
        if (Number(itemLine.quoted_rate || 0) <= 0) errors.push("rate must be greater than zero");
        if (!String(itemLine.hsn_sac || "").trim()) errors.push("hsn_sac is required for order item");
        if (String(itemLine.gst_rate ?? "").trim() === "") errors.push("gst_rate is required for order item");
      }
      if (payload.order_number && db.prepare("SELECT id FROM supply_orders WHERE order_number = ? AND COALESCE(is_deleted, 0) = 0").get(payload.order_number)) return { status: "duplicate", errors: ["Duplicate order number"], payload };
    } else if (table === "procurements") {
      payload.order_id = findOne("supply_orders", "order_number", requireValue("order_number"), "order_number");
      payload.purchase_date = dateValue("purchase_date", "purchase_date");
      payload.supplier_id = findOne("suppliers", "supplier_name", requireValue("supplier_name"), "supplier_name");
      payload.purchase_invoice_number = requireValue("purchase_invoice_number");
      payload.purchase_value = moneyValue("purchase_value", "purchase_value", true);
      payload.purchase_gst = moneyValue("gst_amount", "gst_amount") || 0;
      payload.freight = moneyValue("freight", "freight") || 0;
      payload.loading_charges = moneyValue("loading_charges", "loading_charges") || 0;
      payload.amount_paid = 0;
      payload.remarks = value("remarks");
      payload.company_id = companyId;
    } else if (table === "expense_entries") {
      payload.order_id = findOne("supply_orders", "order_number", requireValue("order_number"), "order_number");
      payload.expense_head_id = findOne("expense_heads", "expense_head_name", requireValue("expense_head"), "expense_head");
      payload.expense_category = value("expense_category");
      payload.calculation_method = value("calculation_method") || "fixed";
      payload.percentage = numberValue("percentage", "percentage") || 0;
      payload.fixed_amount = moneyValue("fixed_amount", "fixed_amount") || moneyValue("expense_amount", "expense_amount") || 0;
      payload.remarks = value("remarks");
      payload.company_id = companyId;
    } else if (table === "invoices") {
      payload.order_id = findOne("supply_orders", "order_number", requireValue("order_number"), "order_number");
      payload.invoice_number = requireValue("invoice_number");
      payload.invoice_date = dateValue("invoice_date", "invoice_date");
      payload.billing_value = moneyValue("billing_value", "billing_value", true);
      payload.gst_rate = numberValue("gst_rate", "gst_rate");
      payload.invoice_type = value("invoice_type") || "Tax Invoice";
      payload.remarks = value("remarks");
      payload.company_id = companyId;
      if (payload.invoice_number && db.prepare("SELECT id FROM invoices WHERE company_id = ? AND invoice_number = ? AND COALESCE(is_deleted, 0) = 0").get(companyId, payload.invoice_number)) return { status: "duplicate", errors: ["Duplicate invoice number per company"], payload };
    } else if (table === "payments") {
      payload.order_id = findOne("supply_orders", "order_number", requireValue("order_number"), "order_number");
      payload.payment_date = dateValue("payment_date", "payment_date");
      payload.payment_amount = moneyValue("payment_amount", "payment_amount", true);
      payload.payment_mode = value("payment_mode") || "NEFT";
      payload.utr_number = value("utr_number");
      payload.bank_id = findOne("banks", "bank_account_name", value("bank_account"), "bank_account");
      payload.remarks = value("remarks");
      payload.company_id = companyId;
      if (payload.utr_number && db.prepare("SELECT id FROM payments WHERE utr_number = ? AND COALESCE(is_deleted, 0) = 0").get(payload.utr_number)) return { status: "duplicate", errors: ["Duplicate UTR number"], payload };
    }
    if (MASTER_TABLES[table] && !errors.length) {
      const duplicate = findMasterImportDuplicate(db, table, payload, companyId);
      if (duplicate) {
        if (String(context.import_mode || "skip_existing") === "update_existing") {
          payload.__update_id = duplicate.id;
        } else {
          const reason = duplicate.duplicate_reason ? ` (${duplicate.duplicate_reason})` : "";
          return { status: "duplicate", errors: [`Duplicate ${MASTER_TABLES[table].label}: ${duplicate.label}${reason}`], payload };
        }
      }
    }
    return { status: "valid", errors, payload };
  }

  function bulkImportRecords(db, table, rows = [], context = {}) {
    assertWriteAllowed(table, "create");
    enforcePermission(db, "import", { ...context, module: table, table_name: table });
    const result = { totalRows: rows.length, successfulRows: 0, failedRows: 0, skippedDuplicates: 0, updatedRows: 0, errors: [] };
    const validRows = [];
    rows.forEach((row, index) => {
      const validation = validateImportRow(db, table, row, context);
      if (validation.status === "duplicate") {
        result.skippedDuplicates += 1;
        result.errors.push({ row: index + 1, status: "Duplicate", errors: validation.errors });
        return;
      }
      if (validation.errors.length) {
        result.failedRows += 1;
        result.errors.push({ row: index + 1, status: "Failed", errors: validation.errors });
        return;
      }
      validRows.push(validation.payload);
    });

    if (context.dry_run) {
      result.successfulRows = validRows.length;
      result.updatedRows = validRows.filter((payload) => payload.__update_id).length;
      return result;
    }

    const transaction = db.transaction(() => {
      const createRows = validRows.filter((payload) => !payload.__update_id);
      const importBatchId = createRows.length ? `${table.toUpperCase().replaceAll("_", "-")}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}` : null;
      if (importBatchId) {
        db.prepare(`
          INSERT INTO import_batches (id, table_name, module, file_name, total_rows, successful_rows, rows_imported, failed_rows, skipped_duplicates, created_by, imported_by, imported_at, status)
          VALUES (@id, @table_name, @module, @file_name, @total_rows, @successful_rows, @rows_imported, @failed_rows, @skipped_duplicates, @created_by, @imported_by, CURRENT_TIMESTAMP, 'active')
        `).run({
          id: importBatchId, table_name: table, module: context.module || table,
          file_name: context.file_name || "", total_rows: result.totalRows,
          successful_rows: validRows.length, rows_imported: createRows.length,
          failed_rows: result.failedRows, skipped_duplicates: result.skippedDuplicates,
          created_by: context.user_id || null, imported_by: context.user_id || null
        });
      }
      validRows.forEach((payload) => {
        const updateId = payload.__update_id;
        const cleanImportPayload = { ...payload };
        delete cleanImportPayload.__update_id;
        if (updateId) {
          const existing = getRecord(db, table, updateId);
          const incoming = Object.fromEntries(Object.entries(cleanImportPayload).filter(([, value]) => String(value ?? "").trim() !== ""));
          updateRecord(db, table, updateId, { ...existing, ...incoming });
          result.updatedRows += 1;
          return;
        }
        const record = createRecord(db, table, cleanImportPayload);
        if (!importBatchId) return;
        db.prepare("INSERT INTO import_batch_records (batch_id, table_name, record_id) VALUES (?, ?, ?)").run(importBatchId, table, record.id);
        if (columnExists(db, table, "import_batch_id")) {
          db.prepare(`UPDATE ${table} SET import_batch_id = ? WHERE id = ?`).run(importBatchId, record.id);
        }
      });
      auditLog(db, {
        company_id: context.company_id || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || null,
        user_id: context.user_id || null,
        user_role: userForPermission(db, context.user_id || null)?.role || null,
        action: "bulk import", module: table, table_name: table,
        new_value: JSON.stringify({ fileName: context.file_name || "", importBatchId, totalRows: result.totalRows, successfulRows: validRows.length, updatedRows: result.updatedRows, failedRows: result.failedRows, skippedDuplicates: result.skippedDuplicates, importMode: context.import_mode || "skip_existing" })
      });
      result.importBatchId = importBatchId;
    });
    transaction();
    result.successfulRows = validRows.length;
    return result;
  }

  function listImportBatches(db, filters = {}) {
    const params = {};
    const where = ["COALESCE(status, 'active') != 'deleted'"];
    if (filters.table_name || filters.table) {
      where.push("ib.table_name = @table");
      params.table = filters.table_name || filters.table;
    }
    return db.prepare(`
      SELECT ib.*, COUNT(ibr.id) record_count
      FROM import_batches ib
      LEFT JOIN import_batch_records ibr ON ibr.batch_id = ib.id AND ibr.rolled_back_at IS NULL
      WHERE ${where.join(" AND ")}
      GROUP BY ib.id
      ORDER BY COALESCE(ib.imported_at, ib.created_at) DESC
    `).all(params);
  }

  function previewImportRollback(db, batchId) {
    const batch = db.prepare("SELECT * FROM import_batches WHERE id = ? AND COALESCE(status, 'active') = 'active'").get(batchId);
    if (!batch) throw new Error("Import batch not found or already rolled back");
    const rows = db.prepare("SELECT * FROM import_batch_records WHERE batch_id = ? AND rolled_back_at IS NULL ORDER BY id").all(batchId);
    return {
      batch,
      records: rows.map((row) => ({
        ...row,
        record: tableExists(db, row.table_name) ? db.prepare(`SELECT * FROM ${row.table_name} WHERE id = ?`).get(row.record_id) : null
      }))
    };
  }

  function rollbackImportBatch(db, batchId, context = {}) {
    enforcePermission(db, "delete", { ...context, module: "imports", table_name: "import_batches", record_id: batchId });
    const preview = previewImportRollback(db, batchId);
    if (IMPORT_ROLLBACK_BLOCKED_TABLES.has(preview.batch.table_name)) throw new Error("Accounting import batches cannot be rolled back directly");
    const blocked = preview.records.filter((row) => row.table_name === "items" && masterRecordIsReferenced(db, "items", row.record_id));
    if (blocked.length) throw new Error("Cannot rollback import: one or more records are linked to posted or operational data");

    const transaction = db.transaction(() => {
      preview.records.forEach((row) => {
        if (!tableExists(db, row.table_name)) return;
        const hasDeleted = columnExists(db, row.table_name, "is_deleted");
        if (hasDeleted) {
          db.prepare(`UPDATE ${row.table_name} SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?`).run(row.record_id);
        } else if (columnExists(db, row.table_name, "status")) {
          db.prepare(`UPDATE ${row.table_name} SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(row.record_id);
        } else {
          db.prepare(`DELETE FROM ${row.table_name} WHERE id = ?`).run(row.record_id);
        }
        db.prepare("UPDATE import_batch_records SET rolled_back_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);
      });
      db.prepare("UPDATE import_batches SET status = 'rolled_back', deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(batchId);
      auditLog(db, {
        company_id: context.company_id || null, user_id: context.user_id || null,
        user_role: userForPermission(db, context.user_id || null)?.role || null,
        action: "rollback import", module: "imports", table_name: "import_batches",
        record_id: null,
        old_value: JSON.stringify({ batch: preview.batch, records: preview.records.length }),
        new_value: JSON.stringify({ status: "rolled_back" })
      });
    });
    transaction();
    return { batchId, rolledBackRecords: preview.records.length };
  }

  function listItemImportBatches(db) {
    return db.prepare(`
      SELECT ib.*, (SELECT COUNT(*) FROM items i WHERE i.import_batch_id = ib.id) item_count
      FROM import_batches ib
      WHERE ib.table_name = 'items' AND ib.status = 'active'
      ORDER BY ib.created_at DESC
    `).all();
  }

  function deleteItemImportBatch(db, batchId) {
    if (!batchId) throw new Error("Import batch is required");
    const batch = db.prepare("SELECT * FROM import_batches WHERE id = ? AND table_name = 'items' AND status = 'active'").get(batchId);
    if (!batch) throw new Error("Item import batch not found");
    const items = db.prepare("SELECT id, item_name FROM items WHERE import_batch_id = ?").all(batchId);
    if (!items.length) throw new Error("No items found for this import batch");
    const ids = items.map((item) => item.id);
    assertBulkDeleteSafe(db, "items", ids);
    const transaction = db.transaction(() => {
      const deleted = db.prepare("DELETE FROM items WHERE import_batch_id = ?").run(batchId).changes;
      db.prepare("UPDATE import_batches SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(batchId);
      auditLog(db, { action: "bulk delete imported items", table_name: "items", new_value: JSON.stringify({ batchId, deleted }) });
      return { batchId, deleted };
    });
    return transaction();
  }

  function deleteUnusedImportedItems(db) {
    const referencedRows = db.prepare(`
      SELECT item_id FROM order_items WHERE item_id IS NOT NULL
      UNION SELECT item_id FROM procurement_items WHERE item_id IS NOT NULL
      UNION SELECT item_id FROM invoice_items WHERE item_id IS NOT NULL
      UNION SELECT item_id FROM stock_inwards WHERE item_id IS NOT NULL
      UNION SELECT item_id FROM stock_outwards WHERE item_id IS NOT NULL
      UNION SELECT item_id FROM stock_adjustments WHERE item_id IS NOT NULL
      UNION SELECT item_id FROM stock_returns WHERE item_id IS NOT NULL
      UNION SELECT item_id FROM stock_ledger WHERE item_id IS NOT NULL
      UNION SELECT item_id FROM serial_numbers WHERE item_id IS NOT NULL
      UNION SELECT item_id FROM batches WHERE item_id IS NOT NULL
      UNION SELECT item_id FROM inventory_movements WHERE item_id IS NOT NULL
      UNION SELECT item_id FROM stock_reservations WHERE item_id IS NOT NULL
      UNION SELECT item_id FROM goods_receipt_items WHERE item_id IS NOT NULL
      UNION SELECT item_id FROM delivery_challan_items WHERE item_id IS NOT NULL
      UNION SELECT item_id FROM warehouse_transfers WHERE item_id IS NOT NULL
    `).all();
    const protectedIds = new Set(referencedRows.map((row) => Number(row.item_id)));
    const seed = db.prepare("SELECT id FROM items WHERE item_name = 'Office Workstation' ORDER BY id LIMIT 1").get();
    if (seed) protectedIds.add(Number(seed.id));
    const items = db.prepare("SELECT id FROM items").all();
    const deleteIds = items.map((item) => Number(item.id)).filter((id) => !protectedIds.has(id));
    if (!deleteIds.length) return { deleted: 0, protected: protectedIds.size };
    assertBulkDeleteSafe(db, "items", deleteIds);
    const placeholders = deleteIds.map(() => "?").join(",");
    const transaction = db.transaction(() => {
      const deleted = db.prepare(`DELETE FROM items WHERE id IN (${placeholders})`).run(...deleteIds).changes;
      auditLog(db, { action: "bulk delete unused item masters", table_name: "items", new_value: JSON.stringify({ deleted, protected: protectedIds.size }) });
      return { deleted, protected: protectedIds.size };
    });
    return transaction();
  }

  return {
    bulkImportRecords, listImportBatches, previewImportRollback,
    rollbackImportBatch, listItemImportBatches,
    deleteItemImportBatch, deleteUnusedImportedItems,
    findMasterImportDuplicate
  };
}
