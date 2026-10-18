import { parseMoneyToMinor } from "../domain/money.js";
import { localBusinessDate } from "../domain/businessDate.js";

export function createInventoryService(deps) {
  const {
    auditLog, activeRowClause, accountId, createBalancedVoucher,
    autoReserveOrderStock, listRecords, referenceData, reverseVoucher
  } = deps;

  // Items are shared by all companies, so item opening stock sits in ONE warehouse:
  // the item's default warehouse, or the first active warehouse of the database when
  // none is set. Only the company that owns that warehouse counts it.
  function openingWarehouseId(db, companyId, item) {
    const preferred = Number(item.default_warehouse_id || 0);
    if (preferred) return preferred;
    return db.prepare("SELECT id FROM warehouses WHERE status = 'active' ORDER BY id LIMIT 1").get()?.id || null;
  }

  function stockBalance(db, companyId, itemId, warehouseId) {
    const item = db.prepare("SELECT opening_stock, opening_rate, opening_value, default_warehouse_id FROM items WHERE id = ?").get(itemId) || {};
    const holdsOpening = Number(openingWarehouseId(db, companyId, item) || 0) === Number(warehouseId || 0)
      && Boolean(db.prepare("SELECT 1 FROM warehouses WHERE id = ? AND (company_id = ? OR company_id IS NULL OR company_id = 0)").get(warehouseId, companyId));
    const openingQuantity = holdsOpening ? Number(item.opening_stock || 0) : 0;
    const openingValue = holdsOpening ? (Number(item.opening_value || 0) || openingQuantity * Number(item.opening_rate || 0)) : 0;
    const movement = db.prepare(`
      SELECT COALESCE(SUM(inward_quantity - outward_quantity), 0) quantity,
        COALESCE(SUM(CASE WHEN inward_quantity > 0 THEN value ELSE -value END), 0) value
      FROM stock_ledger
      WHERE company_id = ? AND item_id = ? AND warehouse_id = ? AND COALESCE(is_deleted, 0) = 0
    `).get(companyId, itemId, warehouseId);
    const quantity = openingQuantity + Number(movement?.quantity || 0);
    const value = openingValue + Number(movement?.value || 0);
    const movementMinor = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN inward_quantity > 0 THEN value_minor ELSE -value_minor END), 0) value_minor
      FROM stock_ledger
      WHERE company_id = ? AND item_id = ? AND warehouse_id = ? AND COALESCE(is_deleted, 0) = 0
    `).get(companyId, itemId, warehouseId);
    const valueMinor = parseMoneyToMinor(openingValue) + Number(movementMinor?.value_minor || 0);
    return { quantity, value: Math.max(0, value), value_minor: Math.max(0, valueMinor), rate: quantity > 0 ? Math.max(0, value) / quantity : Number(item.opening_rate || 0) };
  }

  function weightedAverageCost(db, companyId, itemId, warehouseId) {
    return stockBalance(db, companyId, itemId, warehouseId).rate;
  }

  function insertStockLedger(db, payload) {
    const balanceBefore = stockBalance(db, payload.company_id, payload.item_id, payload.warehouse_id);
    const inwardQuantity = Number(payload.inward_quantity || 0);
    const outwardQuantity = Number(payload.outward_quantity || 0);
    const nextQuantity = balanceBefore.quantity + inwardQuantity - outwardQuantity;
    if (nextQuantity < -0.0001) throw new Error("Stock cannot go negative");
    const rate = Number(payload.rate || balanceBefore.rate || 0);
    const value = Number(payload.value || (inwardQuantity || outwardQuantity) * rate);
    const nextValue = Math.max(0, Number(balanceBefore.value || 0) + (inwardQuantity ? value : -value));
    const valueMinor = parseMoneyToMinor(value);
    const prevValueMinor = Number(balanceBefore.value_minor || 0);
    const nextValueMinor = Math.max(0, prevValueMinor + (inwardQuantity ? valueMinor : -valueMinor));
    db.prepare(`
      INSERT INTO stock_ledger (
        company_id, item_id, warehouse_id, transaction_date, document_number, transaction_type,
        inward_quantity, outward_quantity, balance_quantity, rate, value, order_id, supplier_id,
        department_id, source_module, source_id, procurement_id, billing_id, quantity_in, quantity_out,
        running_quantity, running_value, valuation_method, remarks, voucher_id,
        value_minor, running_value_minor
      ) VALUES (
        @company_id, @item_id, @warehouse_id, @transaction_date, @document_number, @transaction_type,
        @inward_quantity, @outward_quantity, @balance_quantity, @rate, @value, @order_id, @supplier_id,
        @department_id, @source_module, @source_id, @procurement_id, @billing_id, @quantity_in, @quantity_out,
        @running_quantity, @running_value, @valuation_method, @remarks, @voucher_id,
        @value_minor, @running_value_minor
      )
    `).run({
      ...payload,
      inward_quantity: inwardQuantity,
      outward_quantity: outwardQuantity,
      balance_quantity: nextQuantity,
      quantity_in: inwardQuantity,
      quantity_out: outwardQuantity,
      running_quantity: nextQuantity,
      running_value: nextValue,
      valuation_method: payload.valuation_method || "Weighted Average",
      rate,
      value,
      order_id: payload.order_id || null,
      procurement_id: payload.procurement_id || null,
      billing_id: payload.billing_id || null,
      supplier_id: payload.supplier_id || null,
      department_id: payload.department_id || null,
      remarks: payload.remarks || null,
      voucher_id: payload.voucher_id || null,
      value_minor: valueMinor,
      running_value_minor: nextValueMinor
    });
    const info = db.prepare("SELECT last_insert_rowid() id").get();
    db.prepare(`
      INSERT INTO inventory_movements (company_id, movement_date, movement_type, from_warehouse_id, to_warehouse_id, item_id, quantity, rate, value, source_module, source_id, order_id, remarks, voucher_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.company_id,
      payload.transaction_date,
      payload.transaction_type,
      outwardQuantity ? payload.warehouse_id : null,
      inwardQuantity ? payload.warehouse_id : null,
      payload.item_id,
      inwardQuantity || outwardQuantity,
      rate,
      value,
      payload.source_module,
      payload.source_id,
      payload.order_id || null,
      payload.remarks || null,
      payload.voucher_id || null
    );
    return info.id;
  }

  function ensureStockNotPosted(row) {
    if (!row) throw new Error("Stock record not found");
    if (row.posting_status === "Posted") throw new Error("Stock record is already posted");
    if (row.posting_status === "Reversed") throw new Error("Stock record is already reversed");
  }

  function serialWarrantyExpiry(date, warrantyMonths) {
    if (!date || !warrantyMonths) return null;
    const expiry = new Date(`${date}T00:00:00`);
    expiry.setMonth(expiry.getMonth() + Number(warrantyMonths || 0));
    return expiry.toISOString().slice(0, 10);
  }

  function syncSerialInward(db, row) {
    if (!row.serial_number) return;
    const item = db.prepare("SELECT warranty_period FROM items WHERE id = ?").get(row.item_id) || {};
    const existing = db.prepare("SELECT * FROM serial_numbers WHERE company_id = ? AND item_id = ? AND serial_number = ? AND COALESCE(is_deleted, 0) = 0")
      .get(row.company_id, row.item_id, row.serial_number);
    if (existing && existing.status !== "Draft") throw new Error("Duplicate serial number is not allowed");
    db.prepare(`
      INSERT OR IGNORE INTO serial_numbers (
        company_id, item_id, supplier_id, procurement_id, purchase_invoice_number, serial_number,
        warehouse_id, warranty_expiry, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'In Stock')
    `).run(row.company_id, row.item_id, row.supplier_id || null, row.procurement_id || null, row.purchase_invoice_number || null, row.serial_number, row.warehouse_id, serialWarrantyExpiry(row.inward_date, item.warranty_period));
    db.prepare("UPDATE serial_numbers SET warehouse_id = ?, status = 'In Stock', updated_at = CURRENT_TIMESTAMP WHERE company_id = ? AND item_id = ? AND serial_number = ?")
      .run(row.warehouse_id, row.company_id, row.item_id, row.serial_number);
  }

  function syncBatchInward(db, row) {
    if (!row.batch_number) return;
    const existing = db.prepare("SELECT id, quantity, balance_quantity FROM batches WHERE company_id = ? AND item_id = ? AND warehouse_id = ? AND batch_number = ? AND COALESCE(is_deleted, 0) = 0")
      .get(row.company_id, row.item_id, row.warehouse_id, row.batch_number);
    if (existing) {
      db.prepare("UPDATE batches SET quantity = quantity + ?, balance_quantity = balance_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.quantity, row.quantity, existing.id);
    } else {
      db.prepare(`
        INSERT INTO batches (company_id, item_id, supplier_id, procurement_id, batch_number, quantity, balance_quantity, purchase_date, warehouse_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(row.company_id, row.item_id, row.supplier_id || null, row.procurement_id || null, row.batch_number, row.quantity, row.quantity, row.inward_date, row.warehouse_id);
    }
  }

  function syncSerialOutward(db, row) {
    if (!row.serial_number) return;
    const serial = db.prepare("SELECT * FROM serial_numbers WHERE company_id = ? AND item_id = ? AND serial_number = ? AND COALESCE(is_deleted, 0) = 0")
      .get(row.company_id, row.item_id, row.serial_number);
    if (!serial || serial.status !== "In Stock") throw new Error("Serial number is not available for issue");
    db.prepare("UPDATE serial_numbers SET status = 'Issued', order_id = ?, department_id = ?, delivery_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(row.order_id, row.department_id || null, row.issue_date, serial.id);
  }

  function syncBatchOutward(db, row) {
    if (!row.batch_number) return;
    const batch = db.prepare("SELECT * FROM batches WHERE company_id = ? AND item_id = ? AND warehouse_id = ? AND batch_number = ? AND COALESCE(is_deleted, 0) = 0")
      .get(row.company_id, row.item_id, row.warehouse_id, row.batch_number);
    if (!batch || Number(batch.balance_quantity || 0) < Number(row.quantity_issued || row.quantity || 0)) throw new Error("Batch quantity is not available");
    db.prepare("UPDATE batches SET balance_quantity = balance_quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(Number(row.quantity_issued || row.quantity || 0), batch.id);
  }

  function postStockInward(db, id) {
    const row = db.prepare("SELECT * FROM stock_inwards WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(id);
    ensureStockNotPosted(row);
    if (Number(row.quantity || 0) <= 0) throw new Error("Inward quantity must be positive");
    const value = Number(row.landed_cost || 0) || Number(row.quantity || 0) * Number(row.rate || 0);
    const tx = db.transaction(() => {
      insertStockLedger(db, {
        company_id: row.company_id,
        item_id: row.item_id,
        warehouse_id: row.warehouse_id,
        transaction_date: row.inward_date,
        document_number: row.purchase_invoice_number,
        transaction_type: "Inward",
        inward_quantity: row.quantity,
        outward_quantity: 0,
        rate: Number(row.quantity || 0) ? value / Number(row.quantity || 1) : Number(row.rate || 0),
        value,
        order_id: row.order_id,
        supplier_id: row.supplier_id,
        department_id: null,
        source_module: "stock_inwards",
        source_id: row.id
      });
      syncSerialInward(db, row);
      syncBatchInward(db, row);
      // Goods arriving after their purchase bill was posted: the bill already
      // expensed them to Purchase, so the receipt moves that value into Inventory
      // instead of creating a second liability in GRNI.
      const billedFirst = row.procurement_id
        ? db.prepare("SELECT 1 FROM procurements WHERE id = ? AND posting_status = 'Posted' AND COALESCE(is_deleted, 0) = 0").get(row.procurement_id)
        : null;
      const grnVoucher = value > 0 ? createBalancedVoucher(db, {
        company_id: row.company_id,
        voucher_date: row.inward_date,
        voucher_type: "Journal",
        narration: `GRN receipt ${row.purchase_invoice_number || row.id}`,
        source_module: "stock_inwards",
        source_id: row.id,
        lines: [
          { account_id: accountId(db, row.company_id, "Inventory"), debit: value, credit: 0 },
          { account_id: accountId(db, row.company_id, billedFirst ? "Purchase" : "Goods Received Not Invoiced"), debit: 0, credit: value }
        ]
      }) : null;
      db.prepare("UPDATE stock_inwards SET posting_status = 'Posted', approval_status = 'Approved', posting_error = NULL, posted_at = CURRENT_TIMESTAMP, voucher_id = COALESCE(voucher_id, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(grnVoucher?.id || null, id);
      if (row.order_id) autoReserveOrderStock(db, row.order_id);
      auditLog(db, { company_id: row.company_id, action: "stock_inward_posted", table_name: "stock_inwards", record_id: id, new_value: JSON.stringify({ row, voucher_id: grnVoucher?.id }) });
    });
    tx();
    return db.prepare("SELECT * FROM stock_inwards WHERE id = ?").get(id);
  }

  function postStockOutward(db, id) {
    const row = db.prepare("SELECT * FROM stock_outwards WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(id);
    ensureStockNotPosted(row);
    if (Number(row.quantity_issued || 0) <= 0) throw new Error("Outward quantity must be positive");
    const available = stockBalance(db, row.company_id, row.item_id, row.warehouse_id).quantity;
    if (Number(row.quantity_issued || 0) > available) throw new Error("Outward quantity exceeds available stock");
    const rate = weightedAverageCost(db, row.company_id, row.item_id, row.warehouse_id);
    const tx = db.transaction(() => {
      syncSerialOutward(db, row);
      syncBatchOutward(db, row);
      const issueValue = Number(row.quantity_issued || 0) * rate;
      const voucher = issueValue > 0 ? createBalancedVoucher(db, {
        company_id: row.company_id,
        voucher_date: row.issue_date,
        voucher_type: "Journal",
        narration: `COGS stock issue ${row.delivery_challan_number || row.id}`,
        source_module: "stock_outwards",
        source_id: row.id,
        lines: [
          { account_id: accountId(db, row.company_id, "Cost of Goods Sold"), debit: issueValue, credit: 0 },
          { account_id: accountId(db, row.company_id, "Inventory"), debit: 0, credit: issueValue }
        ]
      }) : null;
      insertStockLedger(db, {
        company_id: row.company_id,
        item_id: row.item_id,
        warehouse_id: row.warehouse_id,
        transaction_date: row.issue_date,
        document_number: row.delivery_challan_number,
        transaction_type: "Outward",
        inward_quantity: 0,
        outward_quantity: row.quantity_issued,
        rate,
        value: Number(row.quantity_issued || 0) * rate,
        order_id: row.order_id,
        supplier_id: null,
        department_id: row.department_id,
        source_module: "stock_outwards",
        source_id: row.id,
        voucher_id: voucher?.id || null,
        remarks: "Issue for supply"
      });
      db.prepare("UPDATE stock_outwards SET posting_status = 'Posted', approval_status = 'Approved', posting_error = NULL, posted_at = CURRENT_TIMESTAMP, voucher_id = COALESCE(voucher_id, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(voucher?.id || null, id);
      consumeReservations(db, row.order_id, row.item_id, row.warehouse_id, Number(row.quantity_issued || 0));
      auditLog(db, { company_id: row.company_id, action: "stock_outward_posted", table_name: "stock_outwards", record_id: id, new_value: JSON.stringify(row) });
    });
    tx();
    return db.prepare("SELECT * FROM stock_outwards WHERE id = ?").get(id);
  }

  function postStockAdjustment(db, id) {
    const row = db.prepare("SELECT * FROM stock_adjustments WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(id);
    ensureStockNotPosted(row);
    if (row.approval_status !== "Approved") throw new Error("Stock adjustment requires approval before posting");
    if (Number(row.quantity || 0) <= 0) throw new Error("Adjustment quantity must be positive");
    const isIncrease = row.adjustment_type === "Increase";
    if (!isIncrease && Number(row.quantity || 0) > stockBalance(db, row.company_id, row.item_id, row.warehouse_id).quantity) throw new Error("Adjustment decrease exceeds available stock");
    const rate = Number(row.rate || 0) || weightedAverageCost(db, row.company_id, row.item_id, row.warehouse_id);
    const tx = db.transaction(() => {
      const adjValue = Number(row.quantity || 0) * rate;
      insertStockLedger(db, {
        company_id: row.company_id,
        item_id: row.item_id,
        warehouse_id: row.warehouse_id,
        transaction_date: row.adjustment_date,
        document_number: `ADJ-${row.id}`,
        transaction_type: isIncrease ? "Adjustment Increase" : "Adjustment Decrease",
        inward_quantity: isIncrease ? row.quantity : 0,
        outward_quantity: isIncrease ? 0 : row.quantity,
        rate,
        value: adjValue,
        source_module: "stock_adjustments",
        source_id: row.id
      });
      const adjVoucher = adjValue > 0 ? createBalancedVoucher(db, {
        company_id: row.company_id,
        voucher_date: row.adjustment_date,
        voucher_type: "Journal",
        narration: `Stock ${isIncrease ? "increase" : "decrease"} adj ${row.reason || row.id}`,
        source_module: "stock_adjustments",
        source_id: row.id,
        lines: isIncrease ? [
          { account_id: accountId(db, row.company_id, "Inventory"), debit: adjValue, credit: 0 },
          { account_id: accountId(db, row.company_id, "Inventory Adjustment Gain"), debit: 0, credit: adjValue }
        ] : [
          { account_id: accountId(db, row.company_id, "Inventory Adjustment Loss"), debit: adjValue, credit: 0 },
          { account_id: accountId(db, row.company_id, "Inventory"), debit: 0, credit: adjValue }
        ]
      }) : null;
      db.prepare("UPDATE stock_adjustments SET posting_status = 'Posted', posting_error = NULL, posted_at = CURRENT_TIMESTAMP, voucher_id = COALESCE(voucher_id, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(adjVoucher?.id || null, id);
      auditLog(db, { company_id: row.company_id, action: "stock_adjustment_posted", table_name: "stock_adjustments", record_id: id, new_value: JSON.stringify({ row, voucher_id: adjVoucher?.id }) });
    });
    tx();
    return db.prepare("SELECT * FROM stock_adjustments WHERE id = ?").get(id);
  }

  function approveStockAdjustment(db, id, userId = null, remarks = "Approved") {
    const row = db.prepare("SELECT * FROM stock_adjustments WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(id);
    if (!row) throw new Error("Stock adjustment not found");
    if (row.posting_status === "Posted") throw new Error("Posted adjustment cannot be re-approved");
    db.prepare("UPDATE stock_adjustments SET approval_status = 'Approved', remarks = COALESCE(NULLIF(remarks, ''), ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(remarks, id);
    auditLog(db, { company_id: row.company_id, user_id: userId, action: "stock_adjustment_approved", table_name: "stock_adjustments", record_id: id, new_value: remarks });
    return db.prepare("SELECT * FROM stock_adjustments WHERE id = ?").get(id);
  }

  function isGrniClearedForCompany(db, companyId) {
    const grniRow = db.prepare("SELECT SUM(le.debit - le.credit) net FROM ledger_entries le JOIN accounts a ON a.id = le.account_id WHERE a.company_id = ? AND a.account_name = 'Goods Received Not Invoiced' AND a.is_deleted = 0").get(companyId);
    return grniRow && Number(grniRow.net || 0) >= 0;
  }

  // A supplier return reduces the supplier payable when the goods were already billed by
  // that supplier on the order (a posted purchase bill), and Goods Received Not Invoiced
  // otherwise. Judged from the returned goods' own order and supplier, not the company total.
  function isReturnBilled(db, row) {
    if (!row.supplier_id) return isGrniClearedForCompany(db, row.company_id);
    const billed = db.prepare(`
      SELECT 1 FROM procurements
      WHERE company_id = ? AND supplier_id = ? AND posting_status = 'Posted' AND COALESCE(is_deleted, 0) = 0
        AND (? IS NULL OR order_id = ?)
      LIMIT 1
    `).get(row.company_id, row.supplier_id, row.order_id || null, row.order_id || null);
    return Boolean(billed);
  }

  function postStockReturn(db, id) {
    const row = db.prepare("SELECT * FROM stock_returns WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(id);
    ensureStockNotPosted(row);
    if (Number(row.quantity || 0) <= 0) throw new Error("Return quantity must be positive");
    const isDepartmentReturn = row.return_type === "Department";
    if (!isDepartmentReturn && Number(row.quantity || 0) > stockBalance(db, row.company_id, row.item_id, row.warehouse_id).quantity) throw new Error("Supplier return exceeds available stock");
    const rate = weightedAverageCost(db, row.company_id, row.item_id, row.warehouse_id);
    const tx = db.transaction(() => {
      const retValue = Number(row.quantity || 0) * rate;
      insertStockLedger(db, {
        company_id: row.company_id,
        item_id: row.item_id,
        warehouse_id: row.warehouse_id,
        transaction_date: row.return_date,
        document_number: `RET-${row.id}`,
        transaction_type: isDepartmentReturn ? "Department Return" : "Supplier Return",
        inward_quantity: isDepartmentReturn ? row.quantity : 0,
        outward_quantity: isDepartmentReturn ? 0 : row.quantity,
        rate,
        value: retValue,
        order_id: row.order_id,
        supplier_id: row.supplier_id,
        department_id: row.department_id,
        source_module: "stock_returns",
        source_id: row.id
      });
      const grniAlreadyCleared = !isDepartmentReturn && isReturnBilled(db, row);
      const retVoucher = retValue > 0 ? createBalancedVoucher(db, {
        company_id: row.company_id,
        voucher_date: row.return_date,
        voucher_type: "Journal",
        narration: `Stock ${isDepartmentReturn ? "department" : "supplier"} return ${row.id}`,
        source_module: "stock_returns",
        source_id: row.id,
        lines: isDepartmentReturn ? [
          { account_id: accountId(db, row.company_id, "Inventory"), debit: retValue, credit: 0 },
          { account_id: accountId(db, row.company_id, "Cost of Goods Sold"), debit: 0, credit: retValue }
        ] : (grniAlreadyCleared ? [
          { account_id: accountId(db, row.company_id, "Trade Payables"), debit: retValue, credit: 0 },
          { account_id: accountId(db, row.company_id, "Inventory"), debit: 0, credit: retValue }
        ] : [
          { account_id: accountId(db, row.company_id, "Goods Received Not Invoiced"), debit: retValue, credit: 0 },
          { account_id: accountId(db, row.company_id, "Inventory"), debit: 0, credit: retValue }
        ])
      }) : null;
      db.prepare("UPDATE stock_returns SET posting_status = 'Posted', approval_status = 'Approved', posting_error = NULL, posted_at = CURRENT_TIMESTAMP, voucher_id = COALESCE(voucher_id, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(retVoucher?.id || null, id);
      auditLog(db, { company_id: row.company_id, action: "stock_return_posted", table_name: "stock_returns", record_id: id, new_value: JSON.stringify({ row, voucher_id: retVoucher?.id }) });
    });
    tx();
    return db.prepare("SELECT * FROM stock_returns WHERE id = ?").get(id);
  }

  const STOCK_DOCUMENTS = {
    stock_inwards: { label: "Stock inward", prefix: "REV-IN", type: "Inward Reversal", action: "stock_inward_reversed" },
    stock_outwards: { label: "Stock outward", prefix: "REV-OUT", type: "Outward Reversal", action: "stock_outward_reversed" },
    stock_adjustments: { label: "Stock adjustment", prefix: "REV-ADJ", type: "Adjustment Reversal", action: "stock_adjustment_reversed" },
    stock_returns: { label: "Stock return", prefix: "REV-RET", type: "Return Reversal", action: "stock_return_reversed" }
  };

  // Writes the opposite of every stock_ledger row a document created, dated today.
  // Called by the accounting reversal so the GL and stock are undone together, once.
  function mirrorStockForSource(db, table, id, voucherId = null, reason = "") {
    const doc = STOCK_DOCUMENTS[table];
    if (!doc) throw new Error(`Stock reversal is not supported for ${table}`);
    const already = db.prepare("SELECT 1 FROM stock_ledger WHERE source_module = ? AND source_id = ? AND document_number = ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1").get(table, id, `${doc.prefix}-${id}`);
    if (already) return 0;
    const rows = db.prepare("SELECT * FROM stock_ledger WHERE source_module = ? AND source_id = ? AND COALESCE(is_deleted, 0) = 0 ORDER BY id").all(table, id);
    if (rows.length) assertTrackingReversible(db, table, id);
    const today = localBusinessDate();
    rows.forEach((sl) => {
      try {
        insertStockLedger(db, {
          company_id: sl.company_id, item_id: sl.item_id, warehouse_id: sl.warehouse_id,
          transaction_date: today,
          document_number: `${doc.prefix}-${id}`,
          transaction_type: doc.type,
          inward_quantity: sl.outward_quantity, outward_quantity: sl.inward_quantity,
          rate: sl.rate, value: sl.value,
          order_id: sl.order_id, supplier_id: sl.supplier_id, department_id: sl.department_id,
          procurement_id: sl.procurement_id, billing_id: sl.billing_id,
          source_module: table, source_id: id, voucher_id: voucherId,
          remarks: `Reversal of ${doc.label.toLowerCase()} ${id}${reason ? ` - ${reason}` : ""}`
        });
      } catch (error) {
        if (/negative/i.test(error.message)) {
          const item = db.prepare("SELECT item_name FROM items WHERE id = ?").get(sl.item_id);
          throw new Error(`${doc.label} ${id} cannot be reversed: ${item?.item_name || `item ${sl.item_id}`} would go below zero in its warehouse because the stock was already issued. Reverse the later issue first, then retry.`);
        }
        throw error;
      }
    });
    if (rows.length) reverseTrackingForSource(db, table, id);
    return rows.length;
  }

  // An issue for an order uses up that order's open reservations for the item, oldest
  // first, and never more than each one holds (an order can list the same item twice).
  function consumeReservations(db, orderId, itemId, warehouseId, quantity) {
    let left = quantity;
    const open = db.prepare("SELECT * FROM stock_reservations WHERE order_id = ? AND item_id = ? AND COALESCE(warehouse_id, 0) = COALESCE(?, 0) AND status NOT IN ('Fully Issued', 'Cancelled') ORDER BY id")
      .all(orderId, itemId, warehouseId);
    open.forEach((reservation, index) => {
      if (left <= 0) return;
      const room = Number(reservation.balance_reserved || 0);
      const take = index === open.length - 1 ? left : Math.min(left, room);
      if (take <= 0) return;
      const balance = Math.max(0, room - take);
      db.prepare("UPDATE stock_reservations SET issued_quantity = issued_quantity + ?, balance_reserved = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(take, balance, balance <= 0 ? "Fully Issued" : "Partially Issued", reservation.id);
      left -= take;
    });
  }

  // Reversing an issue gives the quantity back to the reservations it used, newest first.
  function releaseReservations(db, orderId, itemId, warehouseId, quantity) {
    let left = quantity;
    db.prepare("SELECT * FROM stock_reservations WHERE order_id = ? AND item_id = ? AND COALESCE(warehouse_id, 0) = COALESCE(?, 0) AND issued_quantity > 0 AND status <> 'Cancelled' ORDER BY id DESC")
      .all(orderId, itemId, warehouseId)
      .forEach((reservation) => {
        if (left <= 0) return;
        const give = Math.min(left, Number(reservation.issued_quantity || 0));
        const issued = Number(reservation.issued_quantity || 0) - give;
        db.prepare("UPDATE stock_reservations SET issued_quantity = ?, balance_reserved = balance_reserved + ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(issued, give, issued > 0 ? "Partially Issued" : "Reserved", reservation.id);
        left -= give;
      });
  }

  // An inward can only be undone while its own serial or batch is still unissued in stock.
  function assertTrackingReversible(db, table, id) {
    if (table !== "stock_inwards") return;
    const row = db.prepare("SELECT * FROM stock_inwards WHERE id = ?").get(id);
    if (!row) return;
    if (row.serial_number) {
      const serial = db.prepare("SELECT status FROM serial_numbers WHERE company_id = ? AND item_id = ? AND serial_number = ? AND COALESCE(is_deleted, 0) = 0").get(row.company_id, row.item_id, row.serial_number);
      if (serial && serial.status !== "In Stock") throw new Error(`Stock inward ${id} cannot be reversed: serial number ${row.serial_number} is ${serial.status}. Reverse the issue of that serial first, then retry.`);
    }
    if (row.batch_number) {
      const batch = db.prepare("SELECT balance_quantity FROM batches WHERE company_id = ? AND item_id = ? AND warehouse_id = ? AND batch_number = ? AND COALESCE(is_deleted, 0) = 0").get(row.company_id, row.item_id, row.warehouse_id, row.batch_number);
      if (batch && Number(batch.balance_quantity || 0) < Number(row.quantity || 0)) throw new Error(`Stock inward ${id} cannot be reversed: only ${batch.balance_quantity} of batch ${row.batch_number} is still in stock out of ${row.quantity} received. Reverse the issues from that batch first, then retry.`);
    }
  }

  // Undoes what posting did to serial numbers, batches and reservations.
  function reverseTrackingForSource(db, table, id) {
    if (table === "stock_inwards") {
      const row = db.prepare("SELECT * FROM stock_inwards WHERE id = ?").get(id);
      if (!row) return;
      if (row.serial_number) {
        db.prepare("UPDATE serial_numbers SET status = 'Reversed', updated_at = CURRENT_TIMESTAMP WHERE company_id = ? AND item_id = ? AND serial_number = ? AND status = 'In Stock' AND COALESCE(is_deleted, 0) = 0")
          .run(row.company_id, row.item_id, row.serial_number);
      }
      if (row.batch_number) {
        db.prepare("UPDATE batches SET quantity = MAX(0, quantity - ?), balance_quantity = MAX(0, balance_quantity - ?), updated_at = CURRENT_TIMESTAMP WHERE company_id = ? AND item_id = ? AND warehouse_id = ? AND batch_number = ? AND COALESCE(is_deleted, 0) = 0")
          .run(row.quantity, row.quantity, row.company_id, row.item_id, row.warehouse_id, row.batch_number);
      }
    }
    if (table === "stock_outwards") {
      const row = db.prepare("SELECT * FROM stock_outwards WHERE id = ?").get(id);
      if (!row) return;
      const quantity = Number(row.quantity_issued || row.quantity || 0);
      if (row.serial_number) {
        db.prepare("UPDATE serial_numbers SET status = 'In Stock', order_id = NULL, department_id = NULL, delivery_date = NULL, updated_at = CURRENT_TIMESTAMP WHERE company_id = ? AND item_id = ? AND serial_number = ? AND status = 'Issued' AND COALESCE(is_deleted, 0) = 0")
          .run(row.company_id, row.item_id, row.serial_number);
      }
      if (row.batch_number) {
        db.prepare("UPDATE batches SET balance_quantity = balance_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE company_id = ? AND item_id = ? AND warehouse_id = ? AND batch_number = ? AND COALESCE(is_deleted, 0) = 0")
          .run(quantity, row.company_id, row.item_id, row.warehouse_id, row.batch_number);
      }
      if (row.order_id && quantity > 0) releaseReservations(db, row.order_id, row.item_id, row.warehouse_id, quantity);
    }
  }

  // Reversing a stock document reverses its voucher when it has one (the voucher
  // reversal mirrors the stock); otherwise only the stock is mirrored.
  function reverseStockDocument(db, table, id) {
    const doc = STOCK_DOCUMENTS[table];
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND COALESCE(is_deleted, 0) = 0`).get(id);
    if (!row) throw new Error(`${doc.label} ${id} was not found. Refresh the list; it may have been deleted.`);
    if (row.posting_status === "Reversed") throw new Error(`${doc.label} ${id} is already reversed.`);
    if (row.posting_status !== "Posted") throw new Error(`${doc.label} ${id} is not posted (${row.posting_status || "Draft"}). Only posted documents can be reversed; edit or delete the draft instead.`);
    const tx = db.transaction(() => {
      const voucher = row.voucher_id ? db.prepare("SELECT status FROM vouchers WHERE id = ?").get(row.voucher_id) : null;
      if (voucher?.status === "Posted") {
        reverseVoucher(db, row.voucher_id, `Reversal of ${doc.label.toLowerCase()} ${id}`);
      } else {
        mirrorStockForSource(db, table, id, null, "");
      }
      db.prepare(`UPDATE ${table} SET posting_status = 'Reversed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
      auditLog(db, { company_id: row.company_id, action: doc.action, table_name: table, record_id: id, new_value: JSON.stringify({ reversal: true, original_voucher: row.voucher_id }) });
    });
    tx();
    return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  }

  const reverseStockInward = (db, id) => reverseStockDocument(db, "stock_inwards", id);
  const reverseStockOutward = (db, id) => reverseStockDocument(db, "stock_outwards", id);
  const reverseStockAdjustment = (db, id) => reverseStockDocument(db, "stock_adjustments", id);
  const reverseStockReturn = (db, id) => reverseStockDocument(db, "stock_returns", id);

  function inventoryData(db, filters = {}) {
    const companyId = Number(filters.company_id || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || 0);
    const dateFrom = filters.date_from || "1900-01-01";
    const dateTo = filters.date_to || "2999-12-31";
    const lowStockMode = filters.low_stock_mode || "stocked";
    return {
      company_id: companyId,
      references: referenceData(db, { company_id: companyId }),
      stockSummary: inventoryStockSummary(db, companyId),
      stockLedger: inventoryStockLedger(db, companyId, dateFrom, dateTo),
      stockMovement: inventoryStockMovement(db, companyId, dateFrom, dateTo),
      lowStock: inventoryLowStockReport(db, companyId, lowStockMode),
      serialNumbers: db.prepare(`
        SELECT sn.*, it.item_name, w.warehouse_name, so.order_number, gd.department_name
        FROM serial_numbers sn
        LEFT JOIN items it ON it.id = sn.item_id
        LEFT JOIN warehouses w ON w.id = sn.warehouse_id
        LEFT JOIN supply_orders so ON so.id = sn.order_id
        LEFT JOIN government_departments gd ON gd.id = sn.department_id
        WHERE sn.company_id = ? AND COALESCE(sn.is_deleted, 0) = 0
        ORDER BY sn.updated_at DESC, sn.id DESC
      `).all(companyId),
      batches: db.prepare(`
        SELECT b.*, it.item_name, s.supplier_name, w.warehouse_name
        FROM batches b
        LEFT JOIN items it ON it.id = b.item_id
        LEFT JOIN suppliers s ON s.id = b.supplier_id
        LEFT JOIN warehouses w ON w.id = b.warehouse_id
        WHERE b.company_id = ? AND COALESCE(b.is_deleted, 0) = 0
        ORDER BY b.updated_at DESC, b.id DESC
      `).all(companyId),
      valuation: inventoryValuationReport(db, companyId),
      itemProfitability: inventoryItemProfitabilityReport(db, companyId),
      dashboard: inventoryDashboard(db, companyId),
      reservations: inventoryReservations(db, companyId),
      movements: inventoryMovements(db, companyId, dateFrom, dateTo),
      procurementRequirements: procurementRequirementReport(db, companyId),
      goodsReceipts: grnReport(db, companyId, dateFrom, dateTo),
      deliveryChallans: deliveryChallanReport(db, companyId, dateFrom, dateTo),
      warehouseTransfers: warehouseTransferReport(db, companyId, dateFrom, dateTo),
      cogsReport: cogsReport(db, companyId, dateFrom, dateTo),
      reservationAgeing: reservationAgeingReport(db, companyId),
      adjustments: listRecords(db, "stock_adjustments", { company_id: companyId }),
      returns: listRecords(db, "stock_returns", { company_id: companyId }),
      inwards: listRecords(db, "stock_inwards", { company_id: companyId }),
      outwards: listRecords(db, "stock_outwards", { company_id: companyId }),
      companies: db.prepare("SELECT id, company_name FROM companies WHERE status = 'active'").all()
    };
  }

  function inventoryDashboard(db, companyId) {
    const summary = inventoryStockSummary(db, companyId);
    const totalStockValue = summary.reduce((sum, row) => sum + Number(row.stock_value || 0), 0);
    const totalQuantity = summary.reduce((sum, row) => sum + Number(row.closing_quantity || 0), 0);
    const lowStockItems = inventoryLowStockReport(db, companyId).length;
    const reservations = inventoryReservations(db, companyId);
    const reservedQuantity = reservations.reduce((sum, row) => sum + Number(row.balance_reserved || 0), 0);
    const issuedQuantity = reservations.reduce((sum, row) => sum + Number(row.issued_quantity || 0), 0);
    const reservedStockValue = reservations.reduce((sum, row) => sum + Number(row.balance_reserved || 0) * weightedAverageCost(db, companyId, row.item_id, row.warehouse_id || 0), 0);
    const procurementRequiredValue = reservations.reduce((sum, row) => sum + Number(row.short_quantity || 0) * weightedAverageCost(db, companyId, row.item_id, row.warehouse_id || 0), 0);
    const today = localBusinessDate();
    const pendingGrns = db.prepare("SELECT COUNT(*) count FROM goods_receipts WHERE company_id = ? AND status != 'Posted' AND COALESCE(is_deleted, 0) = 0").get(companyId).count;
    const pendingDeliveries = db.prepare("SELECT COUNT(*) count FROM delivery_challans WHERE company_id = ? AND status != 'Confirmed' AND COALESCE(is_deleted, 0) = 0").get(companyId).count;
    const stockIssuedToday = db.prepare("SELECT COALESCE(SUM(outward_quantity), 0) qty FROM stock_ledger WHERE company_id = ? AND COALESCE(is_deleted, 0) = 0 AND transaction_date = ? AND transaction_type = 'Outward'").get(companyId, today).qty;
    const transfersToday = db.prepare("SELECT COUNT(*) count FROM warehouse_transfers WHERE company_id = ? AND transfer_date = ? AND COALESCE(is_deleted, 0) = 0").get(companyId, today).count;
    return [
      { id: "stock_value", metric: "Total Stock Value", value: totalStockValue, note: "Weighted average", type: "money" },
      { id: "reserved_value", metric: "Reserved Stock Value", value: reservedStockValue, note: "Open reservations", type: "money" },
      { id: "procurement_value", metric: "Procurement Required Value", value: procurementRequiredValue, note: "Short quantity estimate", type: "money" },
      { id: "pending_grns", metric: "Pending GRNs", value: pendingGrns, note: "Not posted" },
      { id: "pending_deliveries", metric: "Pending Deliveries", value: pendingDeliveries, note: "Not confirmed" },
      { id: "issued_today", metric: "Stock Issued Today", value: stockIssuedToday, note: today },
      { id: "transfers_today", metric: "Warehouse Transfers Today", value: transfersToday, note: today },
      { id: "stock_quantity", metric: "Stock Quantity", value: totalQuantity, note: "Closing quantity" },
      { id: "reserved_quantity", metric: "Reserved Quantity", value: reservedQuantity, note: "Open supply commitments" },
      { id: "issued_quantity", metric: "Issued Quantity", value: issuedQuantity, note: "Against reserved orders" },
      { id: "low_stock", metric: "Low Stock Items", value: lowStockItems, note: "At or below reorder level" }
    ];
  }

  function inventoryReservations(db, companyId) {
    return db.prepare(`
      SELECT sr.*, it.item_name, w.warehouse_name, so.order_number
      FROM stock_reservations sr
      LEFT JOIN items it ON it.id = sr.item_id
      LEFT JOIN warehouses w ON w.id = sr.warehouse_id
      LEFT JOIN supply_orders so ON so.id = sr.order_id
      WHERE sr.company_id = ? AND COALESCE(sr.is_deleted, 0) = 0
      ORDER BY sr.updated_at DESC, sr.id DESC
    `).all(companyId);
  }

  function inventoryMovements(db, companyId, dateFrom, dateTo) {
    return db.prepare(`
      SELECT im.*, it.item_name, fw.warehouse_name from_warehouse, tw.warehouse_name to_warehouse, so.order_number,
        v.voucher_number
      FROM inventory_movements im
      LEFT JOIN items it ON it.id = im.item_id
      LEFT JOIN warehouses fw ON fw.id = im.from_warehouse_id
      LEFT JOIN warehouses tw ON tw.id = im.to_warehouse_id
      LEFT JOIN supply_orders so ON so.id = im.order_id
      LEFT JOIN vouchers v ON v.id = im.voucher_id
      WHERE im.company_id = ? AND im.movement_date BETWEEN ? AND ? AND COALESCE(im.is_deleted, 0) = 0
      ORDER BY im.movement_date DESC, im.id DESC
    `).all(companyId, dateFrom, dateTo);
  }

  function procurementRequirementReport(db, companyId) {
    return db.prepare(`
      SELECT sr.*, so.order_number, it.item_name, w.warehouse_name,
        sr.short_quantity procurement_required_quantity
      FROM stock_reservations sr
      LEFT JOIN supply_orders so ON so.id = sr.order_id
      LEFT JOIN items it ON it.id = sr.item_id
      LEFT JOIN warehouses w ON w.id = sr.warehouse_id
      WHERE sr.company_id = ? AND sr.procurement_required = 1 AND sr.status != 'Cancelled' AND COALESCE(sr.is_deleted, 0) = 0
      ORDER BY so.order_date, it.item_name
    `).all(companyId);
  }

  function grnReport(db, companyId, dateFrom, dateTo) {
    return db.prepare(`
      SELECT grn.*, s.supplier_name, w.warehouse_name,
        COUNT(gri.id) line_count,
        COALESCE(SUM(gri.accepted_quantity), 0) accepted_quantity,
        COALESCE(SUM(gri.landed_cost), 0) receipt_value
      FROM goods_receipts grn
      LEFT JOIN suppliers s ON s.id = grn.supplier_id
      LEFT JOIN warehouses w ON w.id = grn.warehouse_id
      LEFT JOIN goods_receipt_items gri ON gri.grn_id = grn.id
      WHERE grn.company_id = ? AND grn.grn_date BETWEEN ? AND ? AND COALESCE(grn.is_deleted, 0) = 0
      GROUP BY grn.id
      ORDER BY grn.grn_date DESC, grn.id DESC
    `).all(companyId, dateFrom, dateTo);
  }

  function deliveryChallanReport(db, companyId, dateFrom, dateTo) {
    return db.prepare(`
      SELECT dc.*, so.order_number, gd.department_name,
        COUNT(dci.id) line_count,
        COALESCE(SUM(dci.quantity), 0) issued_quantity
      FROM delivery_challans dc
      LEFT JOIN supply_orders so ON so.id = dc.order_id
      LEFT JOIN government_departments gd ON gd.id = dc.department_id
      LEFT JOIN delivery_challan_items dci ON dci.delivery_challan_id = dc.id
      WHERE dc.company_id = ? AND dc.dispatch_date BETWEEN ? AND ? AND COALESCE(dc.is_deleted, 0) = 0
      GROUP BY dc.id
      ORDER BY dc.dispatch_date DESC, dc.id DESC
    `).all(companyId, dateFrom, dateTo);
  }

  function warehouseTransferReport(db, companyId, dateFrom, dateTo) {
    return db.prepare(`
      SELECT wt.*, it.item_name, fw.warehouse_name from_warehouse, tw.warehouse_name to_warehouse,
        wt.quantity * wt.rate transfer_value
      FROM warehouse_transfers wt
      LEFT JOIN items it ON it.id = wt.item_id
      LEFT JOIN warehouses fw ON fw.id = wt.from_warehouse_id
      LEFT JOIN warehouses tw ON tw.id = wt.to_warehouse_id
      WHERE wt.company_id = ? AND wt.transfer_date BETWEEN ? AND ? AND COALESCE(wt.is_deleted, 0) = 0
      ORDER BY wt.transfer_date DESC, wt.id DESC
    `).all(companyId, dateFrom, dateTo);
  }

  function cogsReport(db, companyId, dateFrom, dateTo) {
    const ledgerActiveWhere = activeRowClause(db, "ledger_entries", "le");
    return db.prepare(`
      SELECT le.entry_date, v.voucher_number, v.source_module, v.source_id, a.account_name,
        le.debit cogs_value, le.credit, v.narration
      FROM ledger_entries le
      JOIN accounts a ON a.id = le.account_id
      JOIN vouchers v ON v.id = le.voucher_id
      WHERE le.company_id = ? AND le.entry_date BETWEEN ? AND ? AND a.account_name = 'Cost of Goods Sold'${ledgerActiveWhere}
      ORDER BY le.entry_date DESC, le.id DESC
    `).all(companyId, dateFrom, dateTo);
  }

  function reservationAgeingReport(db, companyId) {
    return db.prepare(`
      SELECT sr.*, so.order_number, it.item_name, w.warehouse_name,
        CAST(julianday('now') - julianday(sr.created_at) AS INTEGER) days_reserved
      FROM stock_reservations sr
      LEFT JOIN supply_orders so ON so.id = sr.order_id
      LEFT JOIN items it ON it.id = sr.item_id
      LEFT JOIN warehouses w ON w.id = sr.warehouse_id
      WHERE sr.company_id = ? AND sr.status NOT IN ('Cancelled','Fully Issued') AND COALESCE(sr.is_deleted, 0) = 0
      ORDER BY days_reserved DESC, sr.created_at
    `).all(companyId);
  }

  function inventoryStockSummary(db, companyId) {
    return db.prepare(`
      WITH first_warehouse AS (
        SELECT id
        FROM warehouses
        WHERE status = 'active'
        ORDER BY id
        LIMIT 1
      ),
      movement AS (
        SELECT item_id, warehouse_id,
          SUM(inward_quantity) inward_quantity,
          SUM(outward_quantity) outward_quantity,
          SUM(CASE WHEN inward_quantity > 0 THEN value ELSE 0 END) inward_value,
          SUM(CASE WHEN outward_quantity > 0 THEN ABS(value) ELSE 0 END) outward_value,
          SUM(CASE WHEN inward_quantity > 0 THEN value ELSE -value END) net_value,
          COUNT(*) movement_count
        FROM stock_ledger
        WHERE company_id = @company_id AND COALESCE(is_deleted, 0) = 0
        GROUP BY item_id, warehouse_id
      ),
      item_warehouses AS (
        SELECT item_id, warehouse_id FROM movement
        UNION
        SELECT it.id item_id, COALESCE(NULLIF(it.default_warehouse_id, 0), fw.id) warehouse_id
        FROM items it
        CROSS JOIN first_warehouse fw
        WHERE it.status = 'active'
          AND (
            COALESCE(it.opening_stock, 0) != 0
            OR COALESCE(it.opening_value, 0) != 0
            OR COALESCE(it.default_warehouse_id, 0) != 0
          )
      )
      SELECT it.id, it.id item_id, it.item_name, it.brand, it.model, it.unit, w.id warehouse_id, w.warehouse_name,
        CASE WHEN iw.warehouse_id = COALESCE(NULLIF(it.default_warehouse_id, 0), (SELECT id FROM first_warehouse)) THEN COALESCE(it.opening_stock, 0) ELSE 0 END opening_stock,
        CASE WHEN iw.warehouse_id = COALESCE(NULLIF(it.default_warehouse_id, 0), (SELECT id FROM first_warehouse)) THEN COALESCE(it.opening_stock, 0) ELSE 0 END opening_quantity,
        CASE WHEN iw.warehouse_id = COALESCE(NULLIF(it.default_warehouse_id, 0), (SELECT id FROM first_warehouse)) THEN COALESCE(it.opening_value, 0) ELSE 0 END opening_value,
        COALESCE(m.inward_quantity, 0) inward_quantity,
        COALESCE(m.inward_value, 0) inward_value,
        COALESCE(m.outward_quantity, 0) outward_quantity,
        COALESCE(m.outward_value, 0) outward_value,
        CASE WHEN iw.warehouse_id = COALESCE(NULLIF(it.default_warehouse_id, 0), (SELECT id FROM first_warehouse)) THEN COALESCE(it.opening_stock, 0) ELSE 0 END + COALESCE(m.inward_quantity, 0) - COALESCE(m.outward_quantity, 0) closing_quantity,
        CASE WHEN CASE WHEN iw.warehouse_id = COALESCE(NULLIF(it.default_warehouse_id, 0), (SELECT id FROM first_warehouse)) THEN COALESCE(it.opening_stock, 0) ELSE 0 END + COALESCE(m.inward_quantity, 0) - COALESCE(m.outward_quantity, 0) > 0
          THEN (CASE WHEN iw.warehouse_id = COALESCE(NULLIF(it.default_warehouse_id, 0), (SELECT id FROM first_warehouse)) THEN COALESCE(it.opening_value, 0) ELSE 0 END + COALESCE(m.net_value, 0)) /
            (CASE WHEN iw.warehouse_id = COALESCE(NULLIF(it.default_warehouse_id, 0), (SELECT id FROM first_warehouse)) THEN COALESCE(it.opening_stock, 0) ELSE 0 END + COALESCE(m.inward_quantity, 0) - COALESCE(m.outward_quantity, 0))
          ELSE COALESCE(it.opening_rate, 0)
        END weighted_rate,
        CASE WHEN iw.warehouse_id = COALESCE(NULLIF(it.default_warehouse_id, 0), (SELECT id FROM first_warehouse)) THEN COALESCE(it.opening_value, 0) ELSE 0 END + COALESCE(m.net_value, 0) stock_value,
        it.reorder_level, it.minimum_stock_level, it.maximum_stock_level,
        CASE WHEN COALESCE(m.movement_count, 0) > 0 THEN 1 ELSE 0 END has_stock_history,
        CASE WHEN iw.warehouse_id = COALESCE(NULLIF(it.default_warehouse_id, 0), (SELECT id FROM first_warehouse)) AND (COALESCE(it.opening_stock, 0) != 0 OR COALESCE(it.opening_value, 0) != 0) THEN 1 ELSE 0 END has_confirmed_opening_stock,
        CASE
          WHEN COALESCE(m.movement_count, 0) > 0 THEN 'Stock ledger history'
          WHEN iw.warehouse_id = COALESCE(NULLIF(it.default_warehouse_id, 0), (SELECT id FROM first_warehouse)) AND (COALESCE(it.opening_stock, 0) != 0 OR COALESCE(it.opening_value, 0) != 0) THEN 'Opening stock'
          ELSE 'Assigned warehouse'
        END stock_scope
      FROM items it
      JOIN item_warehouses iw ON iw.item_id = it.id
      JOIN warehouses w ON w.id = iw.warehouse_id
      LEFT JOIN movement m ON m.item_id = it.id AND m.warehouse_id = iw.warehouse_id
      WHERE it.status = 'active' AND w.status = 'active'
        AND (w.company_id = @company_id OR w.company_id IS NULL OR w.company_id = 0)
      ORDER BY it.item_name, w.warehouse_name
    `).all({ company_id: companyId });
  }

  function inventoryStockLedger(db, companyId, dateFrom, dateTo) {
    return db.prepare(`
      SELECT sl.*, it.item_name, w.warehouse_name, so.order_number, s.supplier_name, gd.department_name
      FROM stock_ledger sl
      LEFT JOIN items it ON it.id = sl.item_id
      LEFT JOIN warehouses w ON w.id = sl.warehouse_id
      LEFT JOIN supply_orders so ON so.id = sl.order_id
      LEFT JOIN suppliers s ON s.id = sl.supplier_id
      LEFT JOIN government_departments gd ON gd.id = sl.department_id
      WHERE sl.company_id = ? AND COALESCE(sl.is_deleted, 0) = 0 AND sl.transaction_date BETWEEN ? AND ?
      ORDER BY sl.transaction_date, sl.id
    `).all(companyId, dateFrom, dateTo);
  }

  function inventoryStockMovement(db, companyId, dateFrom, dateTo) {
    return db.prepare(`
      SELECT it.item_name, w.warehouse_name, sl.transaction_type, COUNT(*) documents,
        SUM(sl.inward_quantity) inward_quantity, SUM(sl.outward_quantity) outward_quantity, SUM(sl.value) movement_value
      FROM stock_ledger sl
      JOIN items it ON it.id = sl.item_id
      JOIN warehouses w ON w.id = sl.warehouse_id
      WHERE sl.company_id = ? AND COALESCE(sl.is_deleted, 0) = 0 AND sl.transaction_date BETWEEN ? AND ?
      GROUP BY it.item_name, w.warehouse_name, sl.transaction_type
      ORDER BY it.item_name, sl.transaction_type
    `).all(companyId, dateFrom, dateTo);
  }

  function inventoryLowStockReport(db, companyId = null, mode = "stocked") {
    const scopedCompanyId = companyId || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || 0;
    const stockedRows = inventoryStockSummary(db, scopedCompanyId)
      .filter((row) => Number(row.closing_quantity || 0) <= Number(row.reorder_level || 0))
      .map((row) => ({ ...row, stock_status: row.stock_scope || "Stocked item" }));
    const neverStockedRows = inventoryNeverStockedLowStockRows(db, scopedCompanyId);
    if (mode === "never_stocked") return neverStockedRows;
    if (mode === "all") return [...stockedRows, ...neverStockedRows];
    return stockedRows;
  }

  function inventoryNeverStockedLowStockRows(db, companyId) {
    return db.prepare(`
      SELECT it.id, it.id item_id, it.item_name, it.brand, it.model, it.unit,
        NULL warehouse_id,
        'Unassigned' warehouse_name,
        0 opening_stock,
        0 opening_quantity,
        0 opening_value,
        0 inward_quantity,
        0 inward_value,
        0 outward_quantity,
        0 outward_value,
        0 closing_quantity,
        COALESCE(it.opening_rate, 0) weighted_rate,
        0 stock_value,
        it.reorder_level,
        it.minimum_stock_level,
        it.maximum_stock_level,
        0 has_stock_history,
        0 has_confirmed_opening_stock,
        'Never stocked' stock_scope,
        'Never stocked' stock_status
      FROM items it
      WHERE it.status = 'active'
        AND COALESCE(it.opening_stock, 0) = 0
        AND COALESCE(it.opening_value, 0) = 0
        AND COALESCE(it.default_warehouse_id, 0) = 0
        AND NOT EXISTS (
          SELECT 1
          FROM stock_ledger sl
          WHERE sl.company_id = ? AND sl.item_id = it.id AND COALESCE(sl.is_deleted, 0) = 0
        )
      ORDER BY it.item_name
    `).all(companyId);
  }

  function inventoryValuationReport(db, companyId) {
    return inventoryStockSummary(db, companyId)
      .filter((row) => Number(row.closing_quantity || 0) !== 0 || Number(row.stock_value || 0) !== 0)
      .map((row) => ({ ...row, valuation_method: "Weighted Average" }));
  }

  function inventoryItemProfitabilityReport(db, companyId) {
    return db.prepare(`
      SELECT it.item_name, so.order_number,
        SUM(ii.taxable_value) billing_value,
        COALESCE((SELECT SUM(sl.value) FROM stock_ledger sl WHERE sl.company_id = ii.company_id AND sl.item_id = ii.item_id AND sl.order_id = ii.order_id AND COALESCE(sl.is_deleted, 0) = 0 AND sl.transaction_type = 'Outward'), 0) issued_stock_cost,
        SUM(ii.taxable_value) - COALESCE((SELECT SUM(sl.value) FROM stock_ledger sl WHERE sl.company_id = ii.company_id AND sl.item_id = ii.item_id AND sl.order_id = ii.order_id AND COALESCE(sl.is_deleted, 0) = 0 AND sl.transaction_type = 'Outward'), 0) gross_margin
      FROM invoice_items ii
      JOIN items it ON it.id = ii.item_id
      LEFT JOIN supply_orders so ON so.id = ii.order_id
      WHERE ii.company_id = ? AND COALESCE(ii.is_deleted, 0) = 0
      GROUP BY ii.item_id, ii.order_id
      ORDER BY gross_margin DESC
    `).all(companyId);
  }

  return {
    stockBalance, weightedAverageCost, insertStockLedger,
    inventoryStockSummary, inventoryLowStockReport, inventoryDashboard,
    procurementRequirementReport,
    postStockInward, postStockOutward, postStockAdjustment,
    approveStockAdjustment, postStockReturn, inventoryData,
    reverseStockInward, reverseStockOutward, reverseStockAdjustment, reverseStockReturn,
    mirrorStockForSource
  };
}
