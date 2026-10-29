import { paise, rupees } from "../domain/money.js";

export function createOperationalPlanningService({
  cleanPayload,
  getRecord,
  createRecord,
  auditLog,
  inventoryStockSummary
}) {
  const money = (value) => rupees(paise(value));

  function activeRecord(db, table, id, label) {
    const record = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND COALESCE(is_deleted, 0) = 0`).get(id);
    if (!record) throw new Error(`${label} is unavailable. Select an active ${label.toLowerCase()} and try again.`);
    return record;
  }

  function normalizeProcurementPlan(db, payload, existing = null) {
    const data = cleanPayload("procurement_plans", { ...existing, ...payload });
    const companyId = Number(data.company_id || 0);
    if (!companyId) throw new Error("Company context is required. Select Current Company before saving this plan.");
    if (existing?.company_id && Number(existing.company_id) !== companyId) {
      throw new Error("Procurement Plans cannot be moved between companies.");
    }
    const order = activeRecord(db, "supply_orders", Number(data.order_id), "Supply Order");
    activeRecord(db, "items", Number(data.item_id), "Item");
    const warehouse = activeRecord(db, "warehouses", Number(data.warehouse_id), "Warehouse");
    if (Number(order.company_id || 0) !== companyId) {
      throw new Error("Supply Order belongs to another company. Select an order for the Current Company.");
    }
    if (warehouse.company_id && Number(warehouse.company_id) !== companyId) {
      throw new Error("Warehouse belongs to another company. Select a warehouse for the Current Company.");
    }
    if (data.supplier_id) activeRecord(db, "suppliers", Number(data.supplier_id), "Supplier");

    const requiredQuantity = Number(data.required_quantity || 0);
    const plannedQuantity = Number(data.planned_quantity || 0);
    const expectedRate = Number(data.expected_rate || 0);
    if (!Number.isFinite(requiredQuantity) || requiredQuantity <= 0) {
      throw new Error("Required Quantity must be greater than zero.");
    }
    if (!Number.isFinite(plannedQuantity) || plannedQuantity < 0) {
      throw new Error("Planned Quantity cannot be negative.");
    }
    if (!Number.isFinite(expectedRate) || expectedRate < 0) {
      throw new Error("Expected Rate cannot be negative.");
    }
    if (String(data.status || "draft").toLowerCase() !== "draft" && plannedQuantity <= 0) {
      throw new Error("Planned Quantity must be greater than zero before this plan leaves Draft status.");
    }

    const stock = inventoryStockSummary(db, companyId).find((row) =>
      Number(row.item_id) === Number(data.item_id) && Number(row.warehouse_id) === Number(data.warehouse_id)
    );
    const availableStock = money(Math.max(0, Number(stock?.closing_quantity || 0)));
    data.required_quantity = money(requiredQuantity);
    data.available_stock = availableStock;
    data.short_quantity = money(Math.max(0, requiredQuantity - availableStock));
    data.planned_quantity = money(plannedQuantity);
    data.expected_rate = money(expectedRate);
    data.estimated_value = money(plannedQuantity * expectedRate);
    return data;
  }

  function insertRecord(db, table, data) {
    const columns = Object.keys(data);
    const placeholders = columns.map((column) => `@${column}`).join(", ");
    const result = db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`).run(data);
    return getRecord(db, table, result.lastInsertRowid);
  }

  function createProcurementPlanRecord(db, payload) {
    const data = normalizeProcurementPlan(db, payload);
    const record = insertRecord(db, "procurement_plans", data);
    auditLog(db, {
      company_id: data.company_id,
      action: "create",
      table_name: "procurement_plans",
      record_id: record.id,
      new_value: JSON.stringify(record)
    });
    return record;
  }

  function updateProcurementPlanRecord(db, id, payload) {
    const existing = getRecord(db, "procurement_plans", id);
    if (!existing || Number(existing.is_deleted || 0) === 1) throw new Error("Procurement Plan was not found.");
    if (String(existing.status || "").toLowerCase() === "completed") {
      throw new Error("Completed procurement plans are locked. Create a new plan for further changes.");
    }
    const data = normalizeProcurementPlan(db, payload, existing);
    const assignments = Object.keys(data).map((field) => `${field} = @${field}`).join(", ");
    db.prepare(`UPDATE procurement_plans SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run({ ...data, id });
    const record = getRecord(db, "procurement_plans", id);
    auditLog(db, {
      company_id: data.company_id,
      action: "update",
      table_name: "procurement_plans",
      record_id: id,
      old_value: JSON.stringify(existing),
      new_value: JSON.stringify(record)
    });
    return record;
  }

  function convertPurchaseOrderToWorkOrder(db, purchaseOrderId, payload = {}) {
    const transaction = db.transaction(() => {
      const purchaseOrder = activeRecord(db, "purchase_orders", Number(purchaseOrderId), "Purchase Order");
      if (Number(purchaseOrder.converted_to_work_order || 0) === 1 || purchaseOrder.work_order_id) {
        throw new Error("This Purchase Order has already been converted to a Work Order.");
      }
      const companyId = Number(payload.company_id || purchaseOrder.company_id || 0);
      if (!companyId || companyId !== Number(purchaseOrder.company_id || 0)) {
        throw new Error("Purchase Order belongs to another company. Switch to its company before conversion.");
      }
      if (!purchaseOrder.department_id || !purchaseOrder.employee_id) {
        throw new Error("Department and Responsible Employee are required before converting this Purchase Order.");
      }
      activeRecord(db, "government_departments", Number(purchaseOrder.department_id), "Department");
      activeRecord(db, "employees", Number(purchaseOrder.employee_id), "Responsible Employee");

      const orderNumber = String(payload.order_number || `WO-${companyId}-${purchaseOrder.po_number}`).trim();
      const duplicate = db.prepare("SELECT id FROM supply_orders WHERE order_number = ?").get(orderNumber);
      if (duplicate) throw new Error(`Work Order number ${orderNumber} already exists. Choose another number.`);

      const workOrder = createRecord(db, "supply_orders", {
        company_id: companyId,
        order_number: orderNumber,
        order_date: purchaseOrder.po_date,
        department_id: purchaseOrder.department_id,
        employee_id: purchaseOrder.employee_id,
        institution_name: purchaseOrder.title || "",
        supply_type: purchaseOrder.supply_type || "GeM",
        gem_order_number: purchaseOrder.gem_order_number || "",
        gem_contract_number: purchaseOrder.gem_contract_number || "",
        delivery_period: purchaseOrder.delivery_period || "",
        payment_terms: purchaseOrder.payment_terms || "",
        order_status: "Draft",
        remarks: [purchaseOrder.description, purchaseOrder.remarks, `Converted from Purchase Order ${purchaseOrder.po_number}`].filter(Boolean).join("; ")
      });

      db.prepare(`
        UPDATE purchase_orders
        SET converted_to_work_order = 1,
            work_order_id = ?,
            status = 'converted',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(workOrder.id, purchaseOrder.id);
      const updatedPurchaseOrder = getRecord(db, "purchase_orders", purchaseOrder.id);
      auditLog(db, {
        company_id: companyId,
        action: "convert_to_work_order",
        table_name: "purchase_orders",
        record_id: purchaseOrder.id,
        old_value: JSON.stringify(purchaseOrder),
        new_value: JSON.stringify({ purchase_order: updatedPurchaseOrder, work_order_id: workOrder.id })
      });
      return { purchaseOrder: updatedPurchaseOrder, workOrder };
    });
    return transaction();
  }

  return {
    createProcurementPlanRecord,
    updateProcurementPlanRecord,
    convertPurchaseOrderToWorkOrder
  };
}
