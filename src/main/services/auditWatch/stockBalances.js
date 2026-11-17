// Audit Watch's batched stock balances: the result of inventoryService's stockBalance
// for every item/warehouse pair of a company, from grouped reads instead of one
// stock-ledger scan per pair. Read-only; posting code never uses it.
//
// It restates stockBalance's rules (inventoryService.js) rather than sharing code with
// it, so Audit Watch never changes how stock is valued. Drift is caught by the parity
// tests in scripts/audit/audit-watch.test.mjs, which compare every field of both
// functions over random books (several companies, shared and inactive warehouses,
// deleted ledger rows, opening values and rates).
//
// The rules, as in stockBalance:
//   - An item's opening stock sits in one warehouse: its default warehouse, or the
//     first active warehouse when none is set. A company counts it only if that
//     warehouse belongs to the company or to no company (NULL or 0).
//   - Opening value is opening_value, or opening_stock x opening_rate when that is 0.
//   - Movement is the sum of live stock-ledger rows of this company; value in paise.
//   - value is never below 0; rate is value / quantity when quantity > 0, otherwise the
//     item's opening rate.

import { paise, rupees } from "../../domain/money.js";

// What this file was last checked against: inventoryService.js at STOCK_BALANCE_CHECKED_AT,
// as a SHA-256 of the whole file and of stockBalance + openingWarehouseId alone (spaces
// collapsed, comments left out of the second). The Audit Watch verifier fails when the
// file changes, says whether stockBalance itself changed, and prints the git diff to
// read. All three values must agree (the verifier checks the file at that commit
// when git is available). A change to how posting values stock (AGENTS.md rule 4) must be restated here
// before the new values are set; an unrelated change needs only the new values.
export const STOCK_BALANCE_CHECKED_AT = "2c79106f85862d7d2a4f05dc089abea9ed964dbc";
export const STOCK_BALANCE_SOURCE_SHA256 = "0df5651b53dde2781f7e6719587c7c1e446bc82b2d16be5d8b0ab49339226fc1";
export const STOCK_BALANCE_FUNCTIONS_SHA256 = "68689d50eef3b6ec4d7288b76b2b68482d602094156ab639a16ee53a572e0e77";

// `source` is the run's read-only query helper (q(sql, params) -> rows), so the reads
// are traced like a check's own; a better-sqlite3 handle is also accepted.
export function stockBalances(source, companyId) {
  const q = typeof source === "function" ? source : (sql, params = []) => source.prepare(sql).all(...params);
  const firstActive = q("SELECT id FROM warehouses WHERE status = 'active' ORDER BY id LIMIT 1")[0]?.id || null;
  const warehouses = new Map(q("SELECT id, company_id FROM warehouses").map((row) => [Number(row.id), row]));
  const items = new Map(q("SELECT id, opening_stock, opening_rate, opening_value, default_warehouse_id FROM items").map((row) => [Number(row.id), row]));
  const movement = new Map(q(`
    SELECT item_id, warehouse_id, COALESCE(SUM(inward_quantity - outward_quantity), 0) quantity,
      COALESCE(SUM(CASE WHEN inward_quantity > 0 THEN value_minor ELSE -value_minor END), 0) value_minor
    FROM stock_ledger WHERE company_id = ? AND COALESCE(is_deleted, 0) = 0
    GROUP BY item_id, warehouse_id
  `, [companyId]).map((row) => [`${row.item_id}|${row.warehouse_id}`, row]));

  const openingWarehouse = (item) => Number(item.default_warehouse_id || 0) || firstActive;
  const ofCompany = (warehouseId) => {
    const warehouse = warehouses.get(Number(warehouseId));
    return Boolean(warehouse) && (warehouse.company_id === null || Number(warehouse.company_id) === 0 || Number(warehouse.company_id) === Number(companyId));
  };
  const opening = (item, warehouseId) => {
    const holds = Number(openingWarehouse(item) || 0) === Number(warehouseId || 0) && ofCompany(warehouseId);
    const quantity = holds ? Number(item.opening_stock || 0) : 0;
    const value = holds ? (Number(item.opening_value || 0) || quantity * Number(item.opening_rate || 0)) : 0;
    return { quantity, value };
  };
  const get = (itemId, warehouseId) => {
    const item = items.get(Number(itemId)) || {};
    const open = opening(item, warehouseId);
    const moved = movement.get(`${itemId}|${warehouseId}`);
    const quantity = open.quantity + Number(moved?.quantity || 0);
    const valueMinor = Math.max(0, paise(open.value) + Number(moved?.value_minor || 0));
    const value = rupees(valueMinor);
    return { quantity, value, value_minor: valueMinor, rate: quantity > 0 ? value / quantity : Number(item.opening_rate || 0) };
  };

  // The pairs that hold opening stock or have stock-ledger movement.
  const pairs = new Set(movement.keys());
  for (const item of items.values()) {
    const warehouseId = openingWarehouse(item);
    if (warehouseId && opening(item, warehouseId).quantity) pairs.add(`${item.id}|${warehouseId}`);
  }
  return {
    get,
    // The opening stock a pair holds (inventoryService's opening-warehouse rule), so a
    // caller can rebuild a balance from opening stock and its own sums of ledger rows.
    opening: (itemId, warehouseId) => opening(items.get(Number(itemId)) || {}, warehouseId).quantity,
    entries: () => [...pairs].map((key) => {
      const [itemId, warehouseId] = key.split("|").map(Number);
      return { itemId, warehouseId, moved: movement.has(key), balance: get(itemId, warehouseId) };
    })
  };
}
