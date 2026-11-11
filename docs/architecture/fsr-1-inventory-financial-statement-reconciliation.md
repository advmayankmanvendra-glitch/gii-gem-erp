# FSR-1 Inventory and Financial-Statement Reconciliation

**Audit date:** 2026-07-20  
**Model found:** Hybrid, not certified periodic or perpetual inventory  
**Overall result:** FAIL

## Current flow

| Event | Stock subledger | General ledger | Result |
|---|---|---|---|
| Purchase voucher | No quantity/value entry by itself | Dr Purchase, Dr Input GST, Cr Payables | Purchase is immediately expensed |
| Stock inward | Dr-equivalent stock value in `stock_ledger` | No Inventory/Purchase/AP journal | Subledger and GL diverge |
| Stock outward | Outward quantity/value at weighted average | Dr COGS, Cr Inventory | Perpetual issue entry without matching inward GL |
| Stock adjustment | Quantity/value change | No GL entry | Unreconciled gain/loss |
| Department return | Stock value increase | No GL entry | Inventory omission |
| Supplier return | Stock value decrease | No GL entry | Purchase/AP/Inventory omission |
| Warehouse transfer | Operational movement | No net GL effect expected | Appropriate only if value remains company-scoped |

## Executable reconciliation evidence

The FSR fixture posted a stock inward of 10 units at landed cost 100.00 each:

| Measure | Before | After | Change |
|---|---:|---:|---:|
| Stock subledger value | 0.00 | 1,000.00 | +1,000.00 |
| Inventory GL balance | 20,300.00 | 20,300.00 | 0.00 |

**Variance:** 1,000.00. The operation completed successfully, so this is not an error-state artifact.

## Valuation method

The implementation labels valuation as **Weighted Average**. `weightedAverageCost` uses current stock value divided by quantity, and stock outward applies that rate. It is effectively a moving weighted-average calculation over persisted stock movements and item opening values.

Controls not present:

- lower of cost and net realisable value;
- item-level NRV evidence;
- inventory write-down and governed reversal;
- obsolete/slow-moving valuation adjustment;
- valuation-date snapshots;
- landed-cost allocation from freight/direct expenses across items;
- batch/serial-specific cost selection;
- a certified Inventory GL-to-stock-subledger reconciliation.

ICAI AS 2 addresses cost determination and write-down to net realisable value; the current engine covers a cost formula but not the NRV control layer: <https://indasaccess.icai.org/Volume-III/AS/asb.html?a=105>.

## Quantity/value control matrix

| Control | Result | Finding |
|---|---|---|
| Inward/outward quantity arithmetic | PASS for existing workflow tests | Stock ledger computes signed quantities |
| Negative stock prevention | PASS on stock outward path | Available quantity checked |
| Opening inventory | Partial | Global item fields, not company-specific ledger entries |
| Purchase return | FAIL financial | Stock/accounting effects are not integrated |
| Sales/department return | FAIL financial | Stock increase lacks reversal of COGS/Inventory |
| Adjustments/damage/rejection | FAIL financial | No gain/loss or inventory journal |
| Free/zero-valued items | Operationally possible | Financial policy absent |
| Landed cost | Partial | Value can be entered; allocation evidence absent |
| Warehouse-wise | PASS operationally | Movement is warehouse scoped |
| Item-wise | PASS operationally | Item summary exists |
| Company scope | FAIL | Items/opening values are global and can appear under multiple companies |
| Closing stock in P&L/BS | FAIL | GL and stock valuation can differ |

## Cross-company opening risk

`items` is global. `inventoryStockSummary` assigns item-level `opening_stock` and `opening_value` to the first eligible warehouse for the requested company. The same item opening can therefore be represented under more than one company. Company-specific stock movement filtering does not cure global opening-value reuse.

## Double-count/omission assessment

The fixture had only one Inventory row and one COGS row, so the narrow duplicate-row check passed. The real workflow nevertheless permits **omission from Balance Sheet Inventory** and **double expense recognition** through Purchase plus COGS. This is the higher-severity finding.

## Required policy decision

FSR-2A must select and enforce one model:

1. **Perpetual:** purchase/GRN debits Inventory; issue credits Inventory/debits COGS; returns/adjustments reverse through governed journals.
2. **Periodic:** purchases remain expense, COGS/closing stock are calculated and posted through governed period-end adjustments; stock outward must not also post perpetual COGS without policy.

Given the existing real-time stock ledger and outward COGS, a controlled perpetual model is the more compatible direction, subject to accounting approval.

**Severity:** CRITICAL  
**Safe for financial-statement certification:** No

