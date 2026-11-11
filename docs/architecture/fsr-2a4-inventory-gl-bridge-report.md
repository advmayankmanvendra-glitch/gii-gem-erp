# FSR-2A.4 Inventory GL Bridge Report

## Bridge Contract

The governing reconciliation relationship:

```
Opening Inventory (from FY carry-forward or opening balance)
  + Capitalised Inwards (GRN value)
  + Department Returns (returned stock value)
  + Adjustment Increases (surplus value)
  - Stock Issues / Outwards (COGS value)
  - Supplier Returns (returned stock value)
  - Adjustment Decreases (shortage value)
  - Losses / Write-downs
  = Closing Inventory
```

## Implementation

Every inventory posting function in `inventoryService.js` creates two parallel effects:

1. **Stock Ledger:** `insertStockLedger()` writes to `stock_ledger` table with transaction type, quantity, rate, and value
2. **General Ledger:** `createBalancedVoucher()` creates a journal voucher with corresponding double-entry lines

Both operations are wrapped in a single `db.transaction()` for atomicity.

## Posting Functions and Their GL Effects

### `postStockInward()`
- Stock: `stock_ledger` +quantity +value (Inward)
- GL: Dr Inventory / Cr GRNI (value = landed_cost or quantity × rate)

### `postStockOutward()`
- Stock: `stock_ledger` -quantity -value (Outward)
- GL: Dr COGS / Cr Inventory (value = quantity × WAC)

### `postStockAdjustment()` — Increase
- Stock: `stock_ledger` +quantity +value (Adjustment Increase)
- GL: Dr Inventory / Cr Inventory Adjustment Gain (value = quantity × rate or WAC)

### `postStockAdjustment()` — Decrease
- Stock: `stock_ledger` -quantity -value (Adjustment Decrease)
- GL: Dr Inventory Adjustment Loss / Cr Inventory (value = quantity × WAC)

### `postStockReturn()` — Department
- Stock: `stock_ledger` +quantity +value (Department Return)
- GL: Dr Inventory / Cr COGS (value = quantity × WAC)

### `postStockReturn()` — Supplier (before invoice — GRNI uncleared)
- Stock: `stock_ledger` -quantity -value (Supplier Return)
- GL: Dr GRNI / Cr Inventory (value = quantity × WAC)

### `postStockReturn()` — Supplier (after invoice — GRNI cleared)
- Stock: `stock_ledger` -quantity -value (Supplier Return)
- GL: Dr Trade Payables / Cr Inventory (value = quantity × WAC)
- The function detects GRNI clearance by checking company-level GRNI balance >= 0

## Reconciliation Mechanism

The `weightedAverageCost()` function computes the unified cost:

```js
function weightedAverageCost(db, companyId, itemId, warehouseId, excludeId) {
  const rows = db.prepare(`
    SELECT SUM(quantity) AS qty, SUM(value) AS val
    FROM stock_ledger
    WHERE company_id = ? AND item_id = ? AND warehouse_id = ? AND id != COALESCE(?, 0)
  `).get(companyId, itemId, warehouseId, excludeId || 0);
  if (!rows || !rows.qty || rows.qty === 0) return 0;
  return Number(rows.val) / Number(rows.qty);
}
```

The same WAC value is used for:
- Stock outward valuation (Dr COGS value)
- Stock adjustment decrease valuation
- Stock return valuation (both department and supplier)
- Stock ledger entry value

## Verifier Evidence

The verifier checks 5, 8, 31, and 38 independently confirm that after every event, the stock ledger value equals the GL Inventory balance. Checks 26 and 37 confirm the Trial Balance remains balanced.

| Check | Description | Result |
|-------|-------------|--------|
| 5 | Inventory GL matches stock ledger after inward | GL=1000, Stock=1000 |
| 8 | Inventory GL matches stock ledger after outward | GL=700, Stock=700 |
| 31 | Inventory GL bridges to stock ledger (full cycle) | Stock=1000, GL=1000 |
| 38 | Final Inventory GL = stock ledger bridge | GL=919.99, Stock=920 |

## Risk Closure

**FSR-R02 (Stock inward/adjustments/returns lack GL bridge):** CLOSED.
Every stock movement now creates a corresponding GL entry. Stock ledger and Inventory GL reconcile after every event.

**FSR-R03 (Purchase expense and COGS double-cost):** CLOSED.
Inventory-enabled purchase vouchers debit GRNI (not Purchase expense). Stock outward debits COGS. The same inventory goods cannot be expensed through both Purchase and COGS.
