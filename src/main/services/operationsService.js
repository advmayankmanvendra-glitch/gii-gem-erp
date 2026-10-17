export function createOperationsService(deps) {
  const {
    auditLog, stockBalance, nextDocumentNumber, createRecord,
    postStockOutward, weightedAverageCost, insertStockLedger,
    getRecord, postSalesVoucher, postPurchaseVoucher,
    postReceiptVoucher, postExpenseAccrualsForOrder, postExpenseEntry
  } = deps;

  function moduleTable(moduleName) {
    const normalized = String(moduleName || "").toLowerCase();
    const aliases = {
      billing: "invoices",
      sales: "invoices",
      invoice: "invoices",
      invoices: "invoices",
      procurement: "procurements",
      purchase: "procurements",
      procurements: "procurements",
      receipt: "payments",
      payment: "payments",
      payments: "payments",
      expense: "expense_entries",
      expenses: "expense_entries",
      expense_entries: "expense_entries"
    };
    const table = aliases[normalized];
    if (!table) throw new Error("Unsupported module");
    return table;
  }

  function autoReserveOrderStock(db, orderId) {
    const order = db.prepare("SELECT * FROM supply_orders WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(orderId);
    if (!order) throw new Error("Supply order not found");
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? AND COALESCE(is_deleted, 0) = 0 AND item_id IS NOT NULL").all(orderId);
    db.prepare("UPDATE stock_reservations SET status = 'Cancelled', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE order_id = ? AND status NOT IN ('Fully Issued','Cancelled')").run(orderId);
    if (!items.length) {
      db.prepare("UPDATE supply_orders SET reservation_status = 'Procurement Required', procurement_required = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(orderId);
      return { order_id: orderId, status: "Procurement Required", reservations: [], message: "No order item lines available for automatic reservation" };
    }
    const reservations = items.map((item) => {
      const warehouseId = item.warehouse_id || db.prepare("SELECT default_warehouse_id FROM items WHERE id = ?").get(item.item_id)?.default_warehouse_id || db.prepare("SELECT id FROM warehouses WHERE status = 'active' ORDER BY id LIMIT 1").get()?.id || null;
      const available = warehouseId ? stockBalance(db, order.company_id, item.item_id, warehouseId).quantity : 0;
      const required = Number(item.quantity || 0);
      const reserved = Math.min(required, Math.max(0, available));
      const short = Math.max(0, required - reserved);
      const status = short <= 0 ? "Fully Available" : reserved > 0 ? "Partially Reserved" : "Procurement Required";
      const info = db.prepare(`
        INSERT INTO stock_reservations (company_id, order_id, order_item_id, item_id, warehouse_id, available_quantity, reserved_quantity, issued_quantity, balance_reserved, short_quantity, procurement_required, procurement_required_quantity, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
      `).run(order.company_id, orderId, item.id, item.item_id, warehouseId, available, reserved, reserved, short, short > 0 ? 1 : 0, short, status);
      return { id: info.lastInsertRowid, item_id: item.item_id, required_quantity: required, available_quantity: available, reserved_quantity: reserved, short_quantity: short, status };
    });
    const hasShort = reservations.some((row) => row.short_quantity > 0);
    const hasReserved = reservations.some((row) => row.reserved_quantity > 0);
    const status = hasShort ? (hasReserved ? "Partially Reserved" : "Procurement Required") : "Reserved";
    db.prepare("UPDATE supply_orders SET reservation_status = ?, procurement_required = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, hasShort ? 1 : 0, orderId);
    auditLog(db, { company_id: order.company_id, action: "stock_reservation", table_name: "supply_orders", record_id: orderId, new_value: JSON.stringify({ status, reservations }) });
    return { order_id: orderId, status, reservations };
  }

  function createDeliveryChallan(db, payload = {}) {
    const companyId = Number(payload.company_id || 0);
    const orderId = Number(payload.order_id || 0);
    if (!companyId || !orderId) throw new Error("Company and order are required");
    const order = db.prepare("SELECT * FROM supply_orders WHERE id = ?").get(orderId);
    if (!order) throw new Error("Supply order not found");
    const lines = Array.isArray(payload.lines) ? payload.lines : [{
      item_id: payload.item_id,
      warehouse_id: payload.warehouse_id,
      quantity: payload.quantity,
      remarks: payload.remarks
    }];
    const validLines = lines.filter((line) => Number(line.item_id || 0) && Number(line.warehouse_id || 0) && Number(line.quantity || 0) > 0);
    if (!validLines.length) throw new Error("At least one delivery item line is required");
    const challanNumber = payload.challan_number || nextDocumentNumber(db, companyId, "delivery_challans", "challan_number", "DC");
    const tx = db.transaction(() => {
      const dc = db.prepare(`
        INSERT INTO delivery_challans (company_id, challan_number, order_id, department_id, dispatch_date, vehicle_details, status, remarks)
        VALUES (?, ?, ?, ?, ?, ?, 'Draft', ?)
      `).run(companyId, challanNumber, orderId, payload.department_id || order.department_id || null, payload.dispatch_date || new Date().toISOString().slice(0, 10), payload.vehicle_details || "", payload.remarks || "");
      validLines.forEach((line) => db.prepare(`
        INSERT INTO delivery_challan_items (company_id, delivery_challan_id, item_id, warehouse_id, quantity, remarks)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(companyId, dc.lastInsertRowid, line.item_id, line.warehouse_id, line.quantity, line.remarks || ""));
      auditLog(db, { company_id: companyId, action: "delivery_challan_created", table_name: "delivery_challans", record_id: dc.lastInsertRowid, new_value: JSON.stringify({ challanNumber, lines: validLines.length }) });
      return db.prepare("SELECT * FROM delivery_challans WHERE id = ?").get(dc.lastInsertRowid);
    });
    return tx();
  }

  function confirmDeliveryChallan(db, deliveryChallanId, userId = null) {
    const challan = db.prepare("SELECT * FROM delivery_challans WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(deliveryChallanId);
    if (!challan) throw new Error("Delivery challan not found");
    if (challan.status === "Confirmed") throw new Error("Delivery challan is already confirmed");
    const lines = db.prepare("SELECT * FROM delivery_challan_items WHERE delivery_challan_id = ?").all(deliveryChallanId);
    const tx = db.transaction(() => {
      lines.forEach((line) => {
        const available = stockBalance(db, challan.company_id, line.item_id, line.warehouse_id).quantity;
        if (Number(line.quantity || 0) > available) throw new Error("Delivery quantity exceeds available stock");
        const outward = createRecord(db, "stock_outwards", {
          company_id: challan.company_id,
          order_id: challan.order_id,
          department_id: challan.department_id,
          item_id: line.item_id,
          warehouse_id: line.warehouse_id,
          issue_date: challan.dispatch_date,
          delivery_challan_number: challan.challan_number,
          quantity_issued: line.quantity,
          remarks: line.remarks || `Delivery challan ${challan.challan_number}`
        });
        const posted = postStockOutward(db, outward.id);
        db.prepare("UPDATE delivery_challan_items SET stock_outward_id = ? WHERE id = ?").run(posted.id, line.id);
      });
      db.prepare("UPDATE delivery_challans SET status = 'Confirmed', confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(deliveryChallanId);
      auditLog(db, { company_id: challan.company_id, user_id: userId, action: "delivery_challan_confirmation", table_name: "delivery_challans", record_id: deliveryChallanId, new_value: JSON.stringify({ challan_number: challan.challan_number }) });
    });
    tx();
    return db.prepare("SELECT * FROM delivery_challans WHERE id = ?").get(deliveryChallanId);
  }

  function createWarehouseTransfer(db, payload = {}) {
    const companyId = Number(payload.company_id || 0);
    const fromWarehouseId = Number(payload.from_warehouse_id || 0);
    const toWarehouseId = Number(payload.to_warehouse_id || 0);
    const itemId = Number(payload.item_id || 0);
    const quantity = Number(payload.quantity || 0);
    if (!companyId || !fromWarehouseId || !toWarehouseId || !itemId || quantity <= 0) throw new Error("Company, warehouses, item and positive quantity are required");
    if (fromWarehouseId === toWarehouseId) throw new Error("From and To warehouse must be different");
    const available = stockBalance(db, companyId, itemId, fromWarehouseId).quantity;
    if (quantity > available) throw new Error("Transfer quantity exceeds available stock");
    const transferNumber = payload.transfer_number || nextDocumentNumber(db, companyId, "warehouse_transfers", "transfer_number", "WT");
    const result = db.prepare(`
      INSERT INTO warehouse_transfers (company_id, transfer_number, from_warehouse_id, to_warehouse_id, item_id, transfer_date, quantity, rate, reason, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft')
    `).run(companyId, transferNumber, fromWarehouseId, toWarehouseId, itemId, payload.transfer_date || new Date().toISOString().slice(0, 10), quantity, Number(payload.rate || 0), payload.reason || "");
    auditLog(db, { company_id: companyId, action: "warehouse_transfer_created", table_name: "warehouse_transfers", record_id: result.lastInsertRowid, new_value: JSON.stringify({ transferNumber }) });
    return db.prepare("SELECT * FROM warehouse_transfers WHERE id = ?").get(result.lastInsertRowid);
  }

  function postWarehouseTransfer(db, transferId, userId = null) {
    const transfer = db.prepare("SELECT * FROM warehouse_transfers WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(transferId);
    if (!transfer) throw new Error("Warehouse transfer not found");
    if (transfer.status === "Posted") throw new Error("Warehouse transfer already posted");
    if (Number(transfer.from_warehouse_id) === Number(transfer.to_warehouse_id)) throw new Error("Transfer refused: the source and destination warehouse are the same. Pick a different destination warehouse.");
    const warehouseCompany = db.prepare("SELECT COUNT(*) c FROM warehouses WHERE id IN (?, ?) AND (company_id = ? OR company_id IS NULL OR company_id = 0)").get(transfer.from_warehouse_id, transfer.to_warehouse_id, transfer.company_id).c;
    if (warehouseCompany < 2) throw new Error("Transfer refused: both warehouses must belong to the current company. Check the From/To warehouse fields.");
    const available = stockBalance(db, transfer.company_id, transfer.item_id, transfer.from_warehouse_id).quantity;
    if (Number(transfer.quantity || 0) > available) throw new Error(`Transfer quantity exceeds available stock (available ${available}). Reduce the quantity or receive stock into the source warehouse first.`);
    // Stock moves at its book value (weighted average of the source warehouse),
    // so the transfer never creates or destroys inventory value.
    const rate = weightedAverageCost(db, transfer.company_id, transfer.item_id, transfer.from_warehouse_id);
    const value = Number(transfer.quantity || 0) * rate;
    const tx = db.transaction(() => {
      insertStockLedger(db, {
        company_id: transfer.company_id,
        item_id: transfer.item_id,
        warehouse_id: transfer.from_warehouse_id,
        transaction_date: transfer.transfer_date,
        document_number: transfer.transfer_number,
        transaction_type: "Transfer Out",
        inward_quantity: 0,
        outward_quantity: transfer.quantity,
        rate,
        value,
        source_module: "warehouse_transfers",
        source_id: transfer.id,
        remarks: transfer.reason || "Warehouse transfer"
      });
      insertStockLedger(db, {
        company_id: transfer.company_id,
        item_id: transfer.item_id,
        warehouse_id: transfer.to_warehouse_id,
        transaction_date: transfer.transfer_date,
        document_number: transfer.transfer_number,
        transaction_type: "Transfer In",
        inward_quantity: transfer.quantity,
        outward_quantity: 0,
        rate,
        value,
        source_module: "warehouse_transfers",
        source_id: transfer.id,
        remarks: transfer.reason || "Warehouse transfer"
      });
      db.prepare("UPDATE warehouse_transfers SET status = 'Posted', posted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(transfer.id);
      auditLog(db, { company_id: transfer.company_id, user_id: userId, action: "warehouse_transfer_posted", table_name: "warehouse_transfers", record_id: transfer.id, new_value: JSON.stringify({ transfer_number: transfer.transfer_number, quantity: transfer.quantity }) });
    });
    tx();
    return db.prepare("SELECT * FROM warehouse_transfers WHERE id = ?").get(transfer.id);
  }

  function submitForApproval(db, moduleName, recordId, makerId = null) {
    const table = moduleTable(moduleName);
    const record = getRecord(db, table, recordId);
    if (!record) throw new Error("Record not found");
    if (["Posted", "Reversed"].includes(record.posting_status)) throw new Error("Posted records do not need approval");
    db.prepare(`UPDATE ${table} SET approval_status = 'Pending Approval', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(recordId);
    db.prepare(`
      INSERT INTO approval_queue (company_id, module_name, record_id, approval_status, maker_id, submitted_at)
      VALUES (?, ?, ?, 'Pending Approval', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(module_name, record_id) DO UPDATE SET
        approval_status = 'Pending Approval',
        maker_id = excluded.maker_id,
        submitted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `).run(record.company_id, table, recordId, makerId);
    auditLog(db, { company_id: record.company_id, user_id: makerId, action: "approval submit", table_name: table, record_id: recordId });
    return getRecord(db, table, recordId);
  }

  function approveTransaction(db, moduleName, recordId, checkerId = null, remarks = "") {
    const table = moduleTable(moduleName);
    const record = getRecord(db, table, recordId);
    if (!record) throw new Error("Record not found");
    db.prepare(`UPDATE ${table} SET approval_status = 'Approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(checkerId, recordId);
    db.prepare(`
      INSERT INTO approval_queue (company_id, module_name, record_id, approval_status, checker_id, approved_at, remarks)
      VALUES (?, ?, ?, 'Approved', ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(module_name, record_id) DO UPDATE SET
        approval_status = 'Approved',
        checker_id = excluded.checker_id,
        approved_at = CURRENT_TIMESTAMP,
        remarks = excluded.remarks,
        updated_at = CURRENT_TIMESTAMP
    `).run(record.company_id, table, recordId, checkerId, remarks);
    auditLog(db, { company_id: record.company_id, user_id: checkerId, action: "approval approved", table_name: table, record_id: recordId, new_value: remarks });
    return getRecord(db, table, recordId);
  }

  function postBusinessTransaction(db, moduleName, recordId) {
    const table = moduleTable(moduleName);
    if (table === "invoices") return postSalesVoucher(db, recordId);
    if (table === "procurements") return postPurchaseVoucher(db, recordId);
    // The receipt allocates itself: to the invoice named on it, else oldest open invoice first.
    if (table === "payments") return postReceiptVoucher(db, recordId);
    if (table === "expense_entries") {
      postExpenseEntry(db, recordId);
      return db.prepare("SELECT * FROM vouchers WHERE id = (SELECT voucher_id FROM expense_entries WHERE id = ?)").get(recordId);
    }
    throw new Error("Posting is not available for this module yet");
  }

  return {
    autoReserveOrderStock, createDeliveryChallan, confirmDeliveryChallan,
    createWarehouseTransfer, postWarehouseTransfer,
    submitForApproval, approveTransaction, postBusinessTransaction
  };
}
