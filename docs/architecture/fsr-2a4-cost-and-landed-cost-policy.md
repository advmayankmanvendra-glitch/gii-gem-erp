# FSR-2A.4 Cost and Landed Cost Policy

## Cost Basis: Weighted Average Cost (WAC)

All inventory movements use a single Weighted Average Cost computed from the stock ledger.

### Formula

```
WAC = Total Stock Value / Total Stock Quantity
```

Where:
- **Total Stock Value** = SUM(value) FROM stock_ledger WHERE company_id, item_id, warehouse_id
- **Total Stock Quantity** = SUM(quantity) FROM stock_ledger WHERE company_id, item_id, warehouse_id

### Implementation

Located in `inventoryService.js`:

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

### When WAC is Used

| Event | WAC Used? | Value Source |
|-------|-----------|-------------|
| Stock Inward | No | landed_cost or quantity × rate from stock_inwards |
| Stock Outward | Yes | WAC × quantity_issued |
| Adjustment Increase | No | quantity × rate from stock_adjustments (or WAC if rate=0) |
| Adjustment Decrease | Yes | WAC × quantity |
| Department Return | Yes | WAC × quantity |
| Supplier Return | Yes | WAC × quantity |

### Landed Cost

For stock inward, the value is:

```
value = COALESCE(landed_cost, quantity * rate)
```

Where:
- `landed_cost` is the total landed cost including non-recoverable duties and freight
- If `landed_cost` is NULL or 0, falls back to `quantity * rate`
- Recoverable GST is excluded from landed cost (tracked separately via Input GST account)

### Recoverable GST Treatment

Recoverable Input GST is NOT capitalised into inventory cost. It is posted separately:

- Purchase voucher line: Dr Input GST (recoverable portion)
- Purchase voucher line: Cr Trade Payables (gross value)

### Non-Recoverable Costs

Non-recoverable duties, freight, and landed costs should be included in the `landed_cost` field of the stock_inwards record. The current implementation capitalises the full `landed_cost` into Inventory and GRNI.

## Cost Consistency Check

The WAC function is the single source of cost truth. The stock ledger entry value and the GL voucher value both derive from the same WAC calculation, ensuring the stock ledger and GL remain reconciled.

## Weighted-Average Verification (from verifier)

| Step | Stock Qty | Stock Value | WAC |
|------|-----------|-------------|-----|
| After inward (10 units @ 100) | 10 | 1000 | 100 |
| After outward (3 units) | 7 | 700 | 100 |
| After adj increase (2 units @ 110) | 9 | 920 | 102.22 |
| After adj decrease (1 unit) | 8 | 817.78 | 102.22 |
| After dept return (2 units) | 10 | 1022.22 | 102.22 |
| After supplier return (1 unit) | 9 | 920 | 102.22 |

## Future Mapping to FSR-2B

The current account-resolution mechanism uses `accountId(db, companyId, accountName)` which performs a name-based lookup. This is a temporary contract. Future FSR-2B will introduce a governed account-group registry with stable account codes and formal mapping.
