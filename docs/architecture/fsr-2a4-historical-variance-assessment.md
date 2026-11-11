# FSR-2A.4 Historical Variance Assessment

## Purpose

This document is a **read-only** assessment of potential historical data variance between the stock subledger and Inventory GL. No data is modified.

## Prior State (Before FSR-2A.4)

Before this implementation, the inventory model was hybrid:

1. **Stock Inward:** Increased stock ledger but did NOT post to GL (no Dr Inventory / Cr GRNI)
2. **Stock Outward:** Posted Dr COGS / Cr Inventory via GL, BUT used the stock-subledger value for WAC only
3. **Purchase:** Debit Purchase expense account for inventory goods
4. **Adjustments/Returns:** Had no GL effect

This created a systematic gap: stock ledger showed positive inventory while Inventory GL showed zero (or a different value).

## Known Variance Patterns

### Pattern 1: Stock Inward Without GL

```
Stock ledger: +1000
Inventory GL: +0
Variance:     +1000 (stock > GL)
```

Every historical stock inward created a +1000 gap that was never bridged.

### Pattern 2: Double-Cost Exposure

```
Purchase entry:   Dr Purchase 1000
Stock outward:    Dr COGS 300
Total expense:    1300 (for goods worth 1000)
Overstatement:    +300
```

Goods received through Purchase expense and later issued through COGS created a double-count risk.

## Affected Tables

| Table | Records Affected | Nature of Variance |
|-------|-----------------|-------------------|
| stock_inwards | All historical records | No corresponding GL voucher |
| stock_adjustments | All historical records | No corresponding GL voucher |
| stock_returns | All historical records | No corresponding GL voucher |
| stock_outwards | Some records | COGS was posted, but Inventory may not have been credited in GL |

## Remediation Recommendation

A separate backfill phase should:

1. Query all stock_inwards with posting_status = 'Posted' that lack a voucher_id
2. Generate balanced journal vouchers: Dr Inventory / Cr GRNI
3. Do the same for adjustments and returns
4. Provide a before/after reconciliation report
5. Require explicit approval before execution

### Dry-Run Design

```sql
-- Identify unposted stock movements
SELECT si.id, si.company_id, si.item_id, si.quantity, si.rate, si.landed_cost
FROM stock_inwards si
LEFT JOIN vouchers v ON v.id = si.voucher_id
WHERE si.posting_status = 'Posted'
  AND si.voucher_id IS NULL;
```

## Opening Balance Note

Opening inventory balances set through `accounts.opening_balance` bypass double-entry controls. This is assigned to FSR-2A.5 and is NOT addressed here.

## Conclusion

This assessment is **read-only**. No historical data has been modified. The reconciliation contract established in FSR-2A.4 applies to all **future** inventory transactions. Historical remediation requires a separate authorized backfill phase.
