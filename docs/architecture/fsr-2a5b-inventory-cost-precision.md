# Inventory Cost Precision — FSR-2A.5B

## Separate Representations

### 1. Quantity — REAL, 3dp

Warehouse stock tracking. Stored in columns:
- `inward_quantity`
- `outward_quantity`
- `balance_quantity`
- `quantity_in`
- `quantity_out`
- `running_quantity`

Remains as REAL. NOT converted to minor units.

### 2. Unit Rate/Cost — REAL, 4dp

The weighted average cost per unit. Stored in `stock_ledger.rate`.

NOT converted to minor units. Maintained as REAL to preserve WAC precision across many transactions.

### 3. Stock Movement Total Money — INTEGER Minor Units

The total monetary value of each stock ledger line. Stored in new `stock_ledger.value_minor`.

Computed as:
```javascript
const valueMinor = multiplyRateByQuantity(rate, quantity);
```

Where rate is REAL (4dp), quantity is REAL (3dp), and the product is rounded to integer paise.

### 4. Running Value (Minor) — INTEGER Minor Units

Running total of inventory value. Stored in new `stock_ledger.running_value_minor`.

Computed as integer sum of `value_minor` — no floating-point accumulation:
```javascript
const runningValueMinor = previousRunningValueMinor + valueMinor;
```

### 5. COGS — INTEGER Minor Units

Cost of Goods Sold, same as outward `value_minor`. Posted through ledger in minor units.

### 6. Inventory GL — INTEGER Minor Units

The GL voucher for inventory posting uses the same `value_minor` as the stock ledger line. No conversion step.

## Weighted Average Cost Calculation (Minor-Unit World)

```
totalValue   = SUM(value_minor for Inward/Increases)
             - SUM(value_minor for Outward/Decreases)

totalQty     = SUM(inward_quantity) - SUM(outward_quantity)

WAC rate (minor) = totalValue / totalQty      // paise per unit; full JavaScript Number precision
WAC rate (major) = WAC rate (minor) / 100     // rupees per unit; the stock_ledger.rate value
```

Units:
- `totalValue` is in paise, so `totalValue / totalQty` is a **paise-per-unit** rate. It is the
  rate `multiplyRateByQuantity(rateMinor, quantity)` (src/main/domain/money.js) expects, and that
  function returns integer paise.
- `inventoryService` and the `stock_ledger.rate` column hold a **rupee-per-unit** rate. Convert the
  minor-unit rate to major units (divide by 100) before storing or displaying it there. Never pass a
  paise rate where a rupee rate is expected, or the outward valuation is inflated 100×.

Rules:
- `WAC rate` is NOT rounded to 4dp; kept as full JavaScript Number precision.
- Only the OUTWARD posting rounds the product (`quantity × WAC rate (minor)`) to integer paise.

## Certification

### Balance Certification

```
SUM(value_minor for Inward, Adjustment Increase, Department Return)
- SUM(value_minor for Outward, Adjustment Decrease, Supplier Return)
+ SUM(value_minor for opening stock)
= running_value_minor (after last transaction)
```

### Movement Certification

```
SUM(value_minor for all issues)
+ closing running_value_minor
= SUM(value_minor for all inward movements) + opening running_value_minor
```

Both equations must hold exactly in integer minor units. No floating-point tolerance allowed.
